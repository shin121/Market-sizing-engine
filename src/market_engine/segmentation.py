from __future__ import annotations

import json
import math
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import duckdb
import joblib
import numpy as np
from scipy import sparse
from scipy.optimize import linear_sum_assignment
from scipy.special import softmax
from sklearn.cluster import MiniBatchKMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .domains import COMMON_AXES, DOMAIN_VERSION, axis_values
from .io import canonical_json, sha256_file
from .paths import PROCESSED_DIR, ROOT


SEGMENTATION_VERSION = "nemotron-domain-clusters-2026-08-25-v3"
SEGMENTATION_SEEDS = (20260825, 20260826, 20260827)
CANDIDATE_K = (3, 4, 5, 6)
RAW_GLOB = ROOT / "data/raw/nemotron/*.parquet"
FEATURE_MART = PROCESSED_DIR / "nemotron_feature_mart.parquet"
MODEL_DIR = PROCESSED_DIR / "phase2/models"
MEMBERSHIP_DIR = PROCESSED_DIR / "phase2/memberships"
EMBEDDING_DIR = PROCESSED_DIR / "phase2/embeddings"
EMBEDDING_MODEL_ID = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
EMBEDDING_MODEL_REVISION = "e8f8c211226b894fcb81acc59f3b34ba3efd5f42"
EMBEDDING_LICENSE = "Apache-2.0"
HF_CACHE_DIR = ROOT / "data/raw/huggingface_cache"


@dataclass
class DomainSample:
    ids: list[str]
    texts: list[str]
    structured: list[list[str]]
    weights: np.ndarray
    relevant: np.ndarray

    @property
    def size(self) -> int:
        return len(self.ids)


def _ess(weights: np.ndarray) -> float:
    total = float(weights.sum())
    return total * total / float(np.square(weights).sum())


def _keyword_pattern(keywords: list[str]) -> str:
    return "(?:" + "|".join(re.escape(value.lower()) for value in keywords) + ")"


def _domain_text(text: str, keywords: list[str]) -> str:
    """Keep keyword-bearing clauses so clusters represent the requested domain."""
    lowered_keywords = tuple(value.lower() for value in keywords)
    clauses = re.split(r"(?<=[.!?。！？])\s+|[\n\r]+|(?<=[다요죠])\.\s*", text or "")
    selected = [clause.strip() for clause in clauses if any(keyword in clause.lower() for keyword in lowered_keywords)]
    if not selected:
        return "도메인_비언급"
    return " ".join(selected[:8])


def sample_domain(domain: dict[str, Any], sample_size: int = 2400) -> DomainSample:
    if not FEATURE_MART.exists():
        raise FileNotFoundError(f"missing calibrated feature mart: {FEATURE_MART}")
    keyword_pattern = _keyword_pattern(domain["keywords"])
    domain_seed = int.from_bytes(domain["code"].encode("utf-8"), "little") % 1_000_000
    relevant_per_stratum = max(2, math.ceil(sample_size / (17 * 2 * 8)))
    narrative = "concat_ws(' ', r.professional_persona, r.sports_persona, r.arts_persona, r.travel_persona, r.culinary_persona, r.family_persona, r.persona, r.skills_and_expertise, r.hobbies_and_interests, r.career_goals_and_ambitions)"
    query = f"""
        WITH joined AS (
            SELECT r.uuid, {narrative} AS narrative,
                   m.age_band, m.sex, m.province, m.education_level, m.occupation,
                   r.family_type, r.housing_type,
                   m.calibration_weight,
                   regexp_matches(lower({narrative}), ?) AS is_relevant
            FROM read_parquet('{RAW_GLOB.as_posix()}') r
            JOIN read_parquet('{FEATURE_MART.as_posix()}') m
              ON r.uuid = m.synthetic_person_id
            WHERE r.age >= 19
              AND m.calibration_weight IS NOT NULL
              AND m.calibration_weight > 0
        ), ranked AS (
            SELECT *, row_number() OVER (
                PARTITION BY age_band, sex, province, is_relevant
                ORDER BY hash(uuid || ?)
            ) AS stratum_rank
            FROM joined
        )
        SELECT uuid, narrative, age_band, sex, province, education_level, occupation, family_type, housing_type,
               calibration_weight, is_relevant
        FROM ranked
        WHERE is_relevant AND stratum_rank <= ?
        ORDER BY hash(uuid || ?)
        LIMIT ?
    """
    con = duckdb.connect()
    try:
        rows = con.execute(
            query,
            [keyword_pattern, str(domain_seed), relevant_per_stratum, str(domain_seed + 19), sample_size],
        ).fetchall()
    finally:
        con.close()
    if len(rows) < 900:
        raise RuntimeError(f"insufficient deterministic sample for {domain['code']}: {len(rows)}")
    return DomainSample(
        ids=[row[0] for row in rows],
        texts=[_domain_text(row[1] or "", domain["keywords"]) for row in rows],
        structured=[[str(value or "missing") for value in row[2:9]] for row in rows],
        weights=np.asarray([float(row[9]) for row in rows], dtype=np.float64),
        relevant=np.asarray([bool(row[10]) for row in rows], dtype=bool),
    )


def _value_tokens(value: str) -> tuple[str, ...]:
    tokens = [token for token in re.split(r"[·/,&+\s()·–—-]+", value.lower()) if len(token) >= 2]
    return tuple(tokens or [value.lower()])


def _derive_axis_features(sample: DomainSample, domain: dict[str, Any]) -> tuple[np.ndarray, list[str]]:
    definitions: list[tuple[str, tuple[str, ...]]] = []
    names: list[str] = []
    for axis in COMMON_AXES:
        for value in axis_values(domain, axis):
            names.append(f"{domain['code']}.{axis}={value}")
            definitions.append((axis, _value_tokens(value)))
    matrix = np.zeros((sample.size, len(definitions)), dtype=np.float64)
    for row_index, (text, structured) in enumerate(zip(sample.texts, sample.structured, strict=True)):
        haystack = f"{text} {' '.join(structured)}".lower()
        for column_index, (_, tokens) in enumerate(definitions):
            matches = sum(token in haystack for token in tokens)
            matrix[row_index, column_index] = matches / len(tokens)
    return matrix, names


@lru_cache(maxsize=1)
def _embedding_model() -> Any:
    """Load one revision-pinned multilingual model for the complete build."""
    os.environ.setdefault("HF_HOME", str(HF_CACHE_DIR))
    os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
    from sentence_transformers import SentenceTransformer

    snapshot = HF_CACHE_DIR / "hub" / f"models--{EMBEDDING_MODEL_ID.replace('/', '--')}" / "snapshots" / EMBEDDING_MODEL_REVISION
    model_path = str(snapshot if snapshot.exists() else EMBEDDING_MODEL_ID)
    kwargs: dict[str, Any] = {"cache_folder":str(HF_CACHE_DIR)}
    if model_path == EMBEDDING_MODEL_ID:
        kwargs["revision"] = EMBEDDING_MODEL_REVISION
    return SentenceTransformer(model_path, **kwargs)


def _semantic_embeddings(sample: DomainSample, domain: dict[str, Any]) -> tuple[np.ndarray, dict[str, Any]]:
    """Encode domain clauses and reuse an immutable content-addressed cache."""
    import hashlib

    digest = hashlib.sha256()
    digest.update(EMBEDDING_MODEL_ID.encode())
    digest.update(EMBEDDING_MODEL_REVISION.encode())
    for person_id, text in zip(sample.ids, sample.texts, strict=True):
        digest.update(person_id.encode())
        digest.update(b"\0")
        digest.update(text.encode())
        digest.update(b"\0")
    content_hash = digest.hexdigest()
    EMBEDDING_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = EMBEDDING_DIR / f"{domain['code']}-{content_hash[:16]}.npz"
    if cache_path.exists():
        with np.load(cache_path) as cached:
            matrix = np.asarray(cached["embeddings"], dtype=np.float32)
    else:
        matrix = np.asarray(
            _embedding_model().encode(
                sample.texts,
                batch_size=64,
                show_progress_bar=False,
                normalize_embeddings=True,
                convert_to_numpy=True,
            ),
            dtype=np.float32,
        )
        np.savez_compressed(cache_path, embeddings=matrix)
    if matrix.shape[0] != sample.size or matrix.ndim != 2:
        raise RuntimeError(f"invalid semantic embedding cache for {domain['code']}: {matrix.shape}")
    return matrix, {
        "model_id":EMBEDDING_MODEL_ID,
        "revision":EMBEDDING_MODEL_REVISION,
        "license":EMBEDDING_LICENSE,
        "dimension":int(matrix.shape[1]),
        "pooling":"mean pooling from pinned SentenceTransformer configuration",
        "normalized":True,
        "content_hash":content_hash,
        "cache_uri":str(cache_path.relative_to(ROOT)),
        "cache_sha256":sha256_file(cache_path),
    }


def _build_features(sample: DomainSample, domain: dict[str, Any], seed: int) -> tuple[np.ndarray, dict[str, Any]]:
    vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(2, 5),
        min_df=4,
        max_df=0.94,
        max_features=1400,
        sublinear_tf=True,
        norm="l2",
    )
    text_matrix = vectorizer.fit_transform(sample.texts)
    semantic_matrix, embedding_spec = _semantic_embeddings(sample, domain)
    encoder = OneHotEncoder(handle_unknown="ignore", min_frequency=4, sparse_output=True)
    structured_matrix = encoder.fit_transform(sample.structured)
    relevance_matrix = sparse.csr_matrix(sample.relevant.astype(float).reshape(-1, 1))
    axis_matrix, axis_feature_names = _derive_axis_features(sample, domain)
    combined = sparse.hstack([
        sparse.csr_matrix(semantic_matrix),
        text_matrix * 0.25,
        structured_matrix * 0.45,
        sparse.csr_matrix(axis_matrix) * 0.9,
        relevance_matrix * 0.8,
    ], format="csr")
    components = min(48, combined.shape[0] - 1, combined.shape[1] - 1)
    svd = TruncatedSVD(n_components=components, random_state=seed)
    reduced = svd.fit_transform(combined)
    scaler = StandardScaler()
    reduced = scaler.fit_transform(reduced)
    pipeline = {
        "vectorizer":vectorizer,
        "encoder":encoder,
        "svd":svd,
        "scaler":scaler,
        "text_matrix":text_matrix,
        "axis_matrix":axis_matrix,
        "axis_feature_names":axis_feature_names,
        "embedding_spec":embedding_spec,
        "explained_variance":float(svd.explained_variance_ratio_.sum()),
        "structured_fields":["age_band","sex","province","education_level","occupation","family_type","housing_type"],
    }
    return reduced, pipeline


def _fit_labels(algorithm: str, x: np.ndarray, weights: np.ndarray, k: int, seed: int) -> tuple[Any, np.ndarray]:
    if algorithm == "minibatch_kmeans":
        model = MiniBatchKMeans(
            n_clusters=k,
            random_state=seed,
            batch_size=min(512, len(x)),
            n_init=5,
            max_iter=250,
            reassignment_ratio=0.01,
        )
        labels = model.fit_predict(x, sample_weight=weights)
    elif algorithm == "gaussian_mixture":
        model = GaussianMixture(
            n_components=k,
            covariance_type="diag",
            reg_covar=1e-5,
            max_iter=200,
            n_init=2,
            random_state=seed,
        )
        labels = model.fit_predict(x)
    else:
        raise ValueError(algorithm)
    return model, labels


def _soft_membership(model: Any, algorithm: str, x: np.ndarray) -> np.ndarray:
    if algorithm == "gaussian_mixture":
        return model.predict_proba(x)
    distances = model.transform(x)
    nearest = np.min(distances, axis=1)
    temperature = max(float(np.median(nearest)), 1e-6)
    return softmax(-distances / temperature, axis=1)


def _candidate_metrics(x: np.ndarray, weights: np.ndarray) -> tuple[list[dict[str, Any]], str, int]:
    candidates: list[dict[str, Any]] = []
    for algorithm in ("minibatch_kmeans", "gaussian_mixture"):
        for k in CANDIDATE_K:
            label_runs: list[np.ndarray] = []
            silhouettes: list[float] = []
            min_supports: list[float] = []
            for seed in SEGMENTATION_SEEDS:
                _, labels = _fit_labels(algorithm, x, weights, k, seed)
                label_runs.append(labels)
                sample_idx = np.random.default_rng(seed).choice(len(x), size=min(600, len(x)), replace=False)
                silhouettes.append(float(silhouette_score(x[sample_idx], labels[sample_idx])))
                shares = np.bincount(labels, weights=weights, minlength=k) / weights.sum()
                min_supports.append(float(shares.min()))
            aris = [adjusted_rand_score(label_runs[i], label_runs[j]) for i in range(len(label_runs)) for j in range(i + 1, len(label_runs))]
            stability = float(np.mean(aris))
            silhouette = float(np.mean(silhouettes))
            min_support = float(np.min(min_supports))
            admissible = min_support >= 0.025 and stability >= 0.20
            score = 0.55 * stability + 0.35 * ((silhouette + 1.0) / 2.0) + 0.10 * min(1.0, min_support * k * 3.0)
            candidates.append({
                "algorithm":algorithm,
                "k":k,
                "silhouette":silhouette,
                "stability_ari":stability,
                "seed_pair_ari":aris,
                "minimum_weighted_share":min_support,
                "admissible":admissible,
                "selection_score":float(score),
            })
    admissible = [row for row in candidates if row["admissible"]]
    selected = max(admissible or candidates, key=lambda row: row["selection_score"])
    return candidates, str(selected["algorithm"]), int(selected["k"])


def _bootstrap_stability(algorithm: str, k: int, x: np.ndarray, weights: np.ndarray, reference_labels: np.ndarray) -> list[float]:
    scores: list[float] = []
    for seed in SEGMENTATION_SEEDS[1:]:
        rng = np.random.default_rng(seed + 97)
        indices = rng.choice(len(x), size=max(900, int(len(x) * 0.80)), replace=True)
        model, _ = _fit_labels(algorithm, x[indices], weights[indices], k, seed)
        predicted = model.predict(x)
        scores.append(float(adjusted_rand_score(reference_labels, predicted)))
    return scores


def _cluster_top_terms(text_matrix: sparse.csr_matrix, labels: np.ndarray, feature_names: np.ndarray, k: int) -> list[list[str]]:
    overall = np.asarray(text_matrix.mean(axis=0)).ravel()
    output: list[list[str]] = []
    for cluster_number in range(k):
        mask = labels == cluster_number
        mean = np.asarray(text_matrix[mask].mean(axis=0)).ravel()
        contrast = mean - overall
        order = np.argsort(contrast)[::-1]
        terms: list[str] = []
        for idx in order:
            term = str(feature_names[idx]).strip()
            if len(term) < 2 or term in terms:
                continue
            terms.append(term)
            if len(terms) == 8:
                break
        output.append(terms)
    return output


def _align_cluster_order(soft: np.ndarray, relevant: np.ndarray) -> list[int]:
    # Stable post-fit ordering makes IDs reproducible without using demographic labels.
    scores = []
    for cluster_number in range(soft.shape[1]):
        mass = soft[:, cluster_number]
        relevance = float(np.dot(mass, relevant.astype(float)) / max(mass.sum(), 1e-9))
        scores.append((cluster_number, relevance, float(mass.sum())))
    return [row[0] for row in sorted(scores, key=lambda row: (-row[1], -row[2], row[0]))]


def _save_memberships(domain_code: str, sample: DomainSample, soft: np.ndarray, order: list[int], axis_matrix: np.ndarray, axis_feature_names: list[str]) -> str:
    MEMBERSHIP_DIR.mkdir(parents=True, exist_ok=True)
    path = MEMBERSHIP_DIR / f"{domain_code}.parquet"
    membership_columns = [f"membership_{idx + 1}" for idx in range(len(order))]
    axis_columns = [f"axis_{idx + 1:03d}" for idx in range(len(axis_feature_names))]
    columns = ", ".join([*(f"{name} DOUBLE" for name in membership_columns), *(f"{name} DOUBLE" for name in axis_columns)])
    con = duckdb.connect()
    try:
        con.execute(f"CREATE TABLE membership(synthetic_person_id VARCHAR, calibration_weight DOUBLE, domain_relevant BOOLEAN, {columns})")
        rows = []
        for row_idx, person_id in enumerate(sample.ids):
            rows.append((person_id, float(sample.weights[row_idx]), bool(sample.relevant[row_idx]), *(float(soft[row_idx, raw_idx]) for raw_idx in order), *(float(value) for value in axis_matrix[row_idx])))
        placeholders = ",".join("?" for _ in range(3 + len(order) + len(axis_feature_names)))
        con.executemany(f"INSERT INTO membership VALUES ({placeholders})", rows)
        con.execute(f"COPY membership TO '{path.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    finally:
        con.close()
    return str(path.relative_to(ROOT))


def fit_domain_segmentation(domain: dict[str, Any], domain_id: str, sample_size: int = 2400) -> dict[str, Any]:
    sample = sample_domain(domain, sample_size=sample_size)
    x, pipeline = _build_features(sample, domain, SEGMENTATION_SEEDS[0])
    candidates, algorithm, k = _candidate_metrics(x, sample.weights)
    model, labels = _fit_labels(algorithm, x, sample.weights, k, SEGMENTATION_SEEDS[0])
    soft = _soft_membership(model, algorithm, x)
    bootstrap_ari = _bootstrap_stability(algorithm, k, x, sample.weights, labels)
    selected_metrics = next(row for row in candidates if row["algorithm"] == algorithm and row["k"] == k)
    stability = float(np.mean([selected_metrics["stability_ari"], *bootstrap_ari]))
    order = _align_cluster_order(soft, sample.relevant)
    top_terms = _cluster_top_terms(pipeline["text_matrix"], labels, pipeline["vectorizer"].get_feature_names_out(), k)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    artifact_path = MODEL_DIR / f"{domain['code']}.joblib"
    serializable_pipeline = {key:value for key,value in pipeline.items() if key not in {"text_matrix","axis_matrix"}}
    joblib.dump({
        "version":SEGMENTATION_VERSION,
        "domain_code":domain["code"],
        "feature_pipeline":serializable_pipeline,
        "cluster_model":model,
        "algorithm":algorithm,
        "cluster_order":order,
        "random_seeds":SEGMENTATION_SEEDS,
    }, artifact_path, compress=3)
    membership_uri = _save_memberships(domain["code"], sample, soft, order, pipeline["axis_matrix"], pipeline["axis_feature_names"])
    total_weight = float(sample.weights.sum())
    ess = _ess(sample.weights)
    clusters: list[dict[str, Any]] = []
    representatives: list[dict[str, Any]] = []
    memberships: list[dict[str, Any]] = []
    for stable_number, raw_number in enumerate(order, start=1):
        mass = soft[:, raw_number] * sample.weights
        prevalence = float(mass.sum() / total_weight)
        cluster_ess = float((mass.sum() ** 2) / max(float(np.square(mass).sum()), 1e-9))
        sampling_margin = 1.96 * math.sqrt(max(prevalence * (1 - prevalence), 1e-9) / max(ess, 1.0))
        stability_margin = max(0.0, 1.0 - stability) * 0.08
        margin = min(0.24, sampling_margin + stability_margin)
        hard_mask = labels == raw_number
        hard_support = int(hard_mask.sum())
        entropy = float(-np.mean(np.sum(soft * np.log(np.clip(soft, 1e-12, 1.0)), axis=1)))
        motivation = domain["motivations"][(stable_number - 1) % len(domain["motivations"])]
        terms = top_terms[raw_number]
        label = f"{motivation} 중심 {domain['name_ko']}"
        cluster_id = f"{domain_id}-CLU-{stable_number:02d}"
        clusters.append({
            "cluster_id":cluster_id,
            "cluster_number":stable_number,
            "raw_cluster_number":raw_number,
            "post_hoc_label_ko":label,
            "label_evidence":{"top_contrast_terms":terms,"assigned_motivation_axis":motivation,"label_created_after_fit":True},
            "weighted_prevalence_low":max(0.0, prevalence - margin),
            "weighted_prevalence_base":prevalence,
            "weighted_prevalence_high":min(1.0, prevalence + margin),
            "effective_sample_size":cluster_ess,
            "hard_support":hard_support,
            "soft_support":float(soft[:, raw_number].sum()),
            "entropy":entropy,
            "stability_score":stability,
        })
        if algorithm == "minibatch_kmeans":
            distances = model.transform(x)[:, raw_number]
        else:
            distances = -model.score_samples(x)
        candidate_indices = np.argsort(distances + (~hard_mask) * 1e6)[:5]
        for rank, sample_index in enumerate(candidate_indices, start=1):
            structured = sample.structured[int(sample_index)]
            representatives.append({
                "representative_id":f"{cluster_id}-REP-{rank:02d}",
                "cluster_id":cluster_id,
                "source_persona_key":sample.ids[int(sample_index)],
                "rank":rank,
                "distance":float(distances[int(sample_index)]),
                "representative_summary":f"합성 성인; age_band={structured[0]}, sex={structured[1]}, province={structured[2]}; cluster_terms={', '.join(terms[:4])}",
                "storage_uri":membership_uri,
                "privacy_disclosure":"Nemotron 합성 레코드 대표점이며 실제 개인이 아님. 원문 내러티브는 저장·노출하지 않음.",
            })
        memberships.append({"cluster_id":cluster_id,"raw_cluster_number":raw_number})
    model_record = {
        "segmentation_model_id":f"{domain_id}-MODEL-01",
        "domain_id":domain_id,
        "algorithm":algorithm,
        "feature_pipeline":{
            "semantic_embedding":pipeline["embedding_spec"],
            "lexical_label_support":"Korean character n-gram TF-IDF (2–5); cluster-input weight 0.25 and contrast-term explanation",
            "structured_fields":pipeline["structured_fields"],
            "domain_axis_features":pipeline["axis_feature_names"],
            "axis_extractor":"normalized lexical token match against all 16 domain axes; exploratory",
            "axis_weight":0.9,
            "structured_weight":0.45,
            "domain_relevance_weight":0.8,
            "reducer":"TruncatedSVD",
            "components":int(x.shape[1]),
            "explained_variance":pipeline["explained_variance"],
            "semantic_boundary":"revision-pinned multilingual sentence embedding with Korean support; synthetic narrative remains hypothesis evidence",
        },
        "sample_definition":{
            "source":"REL-NVIDIA-NPK-1.0 joined to calibrated adult feature mart",
            "eligibility":"age >= 19",
            "strata":["age_band","sex","province","domain_keyword_relevance"],
            "deterministic":True,
            "domain_keywords":domain["keywords"],
            "relevant_share":float(sample.relevant.mean()),
        },
        "sample_size":sample.size,
        "weighted_support":total_weight,
        "effective_sample_size":ess,
        "candidate_k":list(CANDIDATE_K),
        "selected_k":k,
        "random_seeds":list(SEGMENTATION_SEEDS),
        "stability_metrics":{"selected":selected_metrics,"bootstrap_ari":bootstrap_ari,"combined_stability":stability,"all_candidates":candidates},
        "selection_rationale":"최소 weighted share 2.5%, 다중 seed ARI, bootstrap ARI, silhouette, 균형도를 결합한 사전 정의 점수 최대화",
        "artifact_uri":str(artifact_path.relative_to(ROOT)),
        "artifact_sha256":sha256_file(artifact_path),
        "membership_uri":membership_uri,
        "membership_sha256":sha256_file(ROOT / membership_uri),
        "status":"selected",
        "version":SEGMENTATION_VERSION,
        "taxonomy_version":DOMAIN_VERSION,
    }
    # Defensive normalization proof for downstream parent allocation.
    prevalence_sum = sum(row["weighted_prevalence_base"] for row in clusters)
    if abs(prevalence_sum - 1.0) > 1e-9:
        raise RuntimeError(f"soft prevalence does not reconcile for {domain['code']}: {prevalence_sum}")
    result = {"model":model_record,"clusters":clusters,"representatives":representatives,"memberships":memberships}
    result_path = MODEL_DIR / f"{domain['code']}.json"
    result_path.write_text(compact_model_json(result), encoding="utf-8")
    return result


def load_domain_segmentation(domain: dict[str, Any], domain_id: str) -> dict[str, Any] | None:
    result_path = MODEL_DIR / f"{domain['code']}.json"
    if not result_path.exists():
        return None
    value = json.loads(result_path.read_text(encoding="utf-8"))
    model = value.get("model", {})
    if (model.get("version") != SEGMENTATION_VERSION or model.get("taxonomy_version") != DOMAIN_VERSION
            or model.get("domain_id") != domain_id or not model.get("artifact_sha256") or not model.get("membership_sha256")):
        return None
    value["memberships"] = [{"cluster_id":row["cluster_id"],"raw_cluster_number":row["raw_cluster_number"]} for row in value["clusters"]]
    return value


def fit_or_load_domain_segmentation(domain: dict[str, Any], domain_id: str, sample_size: int = 2400, force: bool = False) -> dict[str, Any]:
    if not force:
        cached = load_domain_segmentation(domain, domain_id)
        if cached is not None:
            return cached
    return fit_domain_segmentation(domain, domain_id, sample_size=sample_size)


def compact_model_json(result: dict[str, Any]) -> str:
    return canonical_json({"model":result["model"],"clusters":result["clusters"],"representatives":result["representatives"]})
