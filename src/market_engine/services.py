from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .build import _configs, _verify_local_sources
from .estimation import RARE_OUTPUT_THRESHOLD, estimate_segment
from .io import canonical_json, stable_hash
from .market_sizing import estimate_market as calculate_market
from .paths import PROCESSED_DIR, ROOT
from .repository import EngineRepository
from .validation import validate_model as run_validation


RESULT_DIR = PROCESSED_DIR / "query_results"


def sanitize_suppressed_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Return a value-free release envelope for persisted suppressed results.

    Older result files may predate the rare-output boundary and still carry a
    denominator count or reconstructable factor values.  Apply the same guard
    before persistence and after every load so explain/compare callers never
    depend on the age of the stored artifact.
    """
    if payload.get("status") != "suppressed":
        return payload

    sanitized = dict(payload)
    for key in (
        "count",
        "count_low",
        "count_base",
        "count_high",
        "share",
        "share_low",
        "share_base",
        "share_high",
    ):
        sanitized[key] = None
    for key in (
        "unrounded_count",
        "count_interval",
        "share_interval",
        "factor_values",
        "probability",
    ):
        sanitized.pop(key, None)

    denominator = payload.get("denominator")
    control_id = denominator.get("control_id") if isinstance(denominator, dict) else None
    safe_denominator: dict[str, Any] = {
        "definition": "Rare weighted human result withheld at the aggregate release boundary.",
        "count": None,
    }
    if isinstance(control_id, str) and control_id:
        safe_denominator["control_id"] = control_id
    sanitized["denominator"] = safe_denominator

    source_release_ids = sorted({
        release_id
        for source in payload.get("sources", [])
        if isinstance(source, dict)
        and isinstance((release_id := source.get("release_id")), str)
        and release_id
    })
    safe_source_keys = (
        "source_id",
        "release_id",
        "publisher",
        "dataset_title",
        "version_label",
        "reference_period_start",
        "reference_period_end",
        "publication_date",
        "retrieved_at",
        "official_url",
        "checksum",
    )
    sanitized["sources"] = [
        {
            key: source[key]
            for key in safe_source_keys
            if key in source
        }
        for source in payload.get("sources", [])
        if isinstance(source, dict)
    ]
    lineage: dict[str, Any] = {}
    if isinstance(control_id, str) and control_id:
        lineage["control_id"] = control_id
    if source_release_ids:
        lineage["source_release_ids"] = source_release_ids
    model_version = payload.get("model_version")
    if isinstance(model_version, str) and model_version:
        lineage["model_version"] = model_version
    sanitized["formula_tree"] = {
        "operation": "suppressed",
        "values_withheld": True,
        "release_policy": {
            "rule": "weighted_base_count_below_threshold",
            "threshold": RARE_OUTPUT_THRESHOLD,
        },
        "lineage": lineage,
    }

    safe_assumptions = []
    for assumption in payload.get("assumptions", []):
        if not isinstance(assumption, dict):
            continue
        safe_assumption = {
            key: value
            for key in ("code", "method_code")
            if isinstance((value := assumption.get(key)), str) and value
        }
        if safe_assumption:
            safe_assumptions.append(safe_assumption)
    sanitized["assumptions"] = safe_assumptions

    related = payload.get("related_unit_counts")
    if isinstance(related, dict):
        sanitized["related_unit_counts"] = {
            str(unit): {
                "status": "suppressed",
                "count": None,
                "reason": "Primary rare-output release is suppressed.",
            }
            for unit in related
        }
    sanitized["human_readable_explanation_ko"] = (
        "가중 Base 추정치가 공개 기준인 10 미만이어서 수량, 비중, "
        "Low/Base/High 구간과 재구성 가능한 중간값을 반환하지 않습니다."
    )
    return sanitized


def _ids(query: dict[str, Any]) -> tuple[str, str]:
    query_hash = stable_hash(query)
    return f"QRY-{query_hash[:16]}", f"EST-{stable_hash({'query':query,'model_version':'kr-v0.1.0'})[:16]}"


def estimate_segment_service(filter_json: dict[str, Any], *, persist: bool = True) -> dict[str, Any]:
    result = sanitize_suppressed_payload(estimate_segment(filter_json).to_dict())
    query_id, estimate_id = _ids(filter_json)
    payload = sanitize_suppressed_payload({"query_id":query_id,"estimate_id":estimate_id,**result})
    if persist:
        RESULT_DIR.mkdir(parents=True, exist_ok=True)
        (RESULT_DIR / f"{estimate_id}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def _load_result(identifier: str) -> dict[str, Any]:
    if identifier.startswith("QRY-"):
        matches = []
        if RESULT_DIR.exists():
            for path in RESULT_DIR.glob("EST-*.json"):
                value = sanitize_suppressed_payload(json.loads(path.read_text(encoding="utf-8")))
                if value["query_id"] == identifier:
                    matches.append(value)
        if not matches:
            raise KeyError(f"unknown query_id: {identifier}")
        return matches[0]
    path = RESULT_DIR / f"{identifier}.json"
    if not path.exists():
        raise KeyError(f"unknown estimate_id: {identifier}")
    return sanitize_suppressed_payload(json.loads(path.read_text(encoding="utf-8")))


def get_archetype(archetype_id: str) -> dict[str, Any] | None:
    repo = EngineRepository()
    try:
        return repo.get_archetype(archetype_id)
    finally:
        repo.close()


def list_archetypes(category: str | None = None, unit: str | None = None, confidence_min: int = 0, status: str | None = None, limit: int = 100, offset: int = 0) -> dict[str, Any]:
    repo = EngineRepository()
    try:
        return repo.list_archetypes(category=category, unit=unit, confidence_min=confidence_min, status=status, limit=limit, offset=offset)
    finally:
        repo.close()


def compare_segments(query_ids: list[str]) -> dict[str, Any]:
    if len(query_ids) < 2:
        raise ValueError("compare_segments requires at least two query IDs")
    results = [_load_result(identifier) for identifier in query_ids]
    same_unit = len({result["primary_unit"] for result in results}) == 1
    all_estimated = all(result["status"] == "estimated" for result in results)
    denominator_counts = {result["denominator"].get("count") for result in results}
    comparable = same_unit and all_estimated and len(denominator_counts) == 1 and None not in denominator_counts
    comparison: dict[str, Any] = {"status":"not_estimable","intersection":None,"union":None}
    if comparable and len(results) == 2:
        a, b = results
        total = float(next(iter(denominator_counts)))
        ac, bc = a["count"], b["count"]
        if a["query_id"] == b["query_id"]:
            intersection = union = ac
            method = "identical segment identity"
        else:
            intersection = {"low":max(0, ac["low"]+bc["low"]-total), "base":None, "high":min(ac["high"],bc["high"])}
            union = {"low":max(ac["low"],bc["low"]), "base":None, "high":min(total,ac["high"]+bc["high"])}
            method = "Frechet bounds; base unavailable without joint overlap"
        comparison = {"status":"bounded","intersection":intersection,"union":union,"method":method}
    return {
        "segments":[{"query_id":r["query_id"],"unit":r["primary_unit"],"status":r["status"],"count":r["count"]} for r in results],
        "comparison":comparison,
        "unit_compatible":same_unit,
        "overlap_warning":"비상호배타 세그먼트는 단순 합산할 수 없습니다. 공동분포가 없으면 교집합·합집합의 Base를 산출하지 않습니다.",
        "validation_gaps":["overlap_unknown"] if comparison["status"] == "not_estimable" or comparison.get("method","").startswith("Frechet") else [],
    }


def estimate_market(query_id: str, market_scenario: dict[str, Any]) -> dict[str, Any]:
    saved = _load_result(query_id)
    audience = estimate_segment(saved["interpreted_query"])
    return {"query_id":saved["query_id"], **calculate_market(audience, market_scenario)}


def explain_estimate(estimate_id: str) -> dict[str, Any]:
    saved = _load_result(estimate_id)
    return {
        "estimate_id":saved["estimate_id"], "status":saved["status"], "primary_unit":saved["primary_unit"],
        "count":saved["count"], "share":saved["share"], "denominator":saved["denominator"],
        "formula_tree":saved["formula_tree"], "sources":saved["sources"], "assumptions":saved["assumptions"],
        "confidence":{"score":saved["confidence_score"],"grade":saved["confidence_grade"]},
        "validation_gaps":saved["validation_gaps"], "explanation_ko":saved["human_readable_explanation_ko"],
    }


def refresh_source(source_id: str = "all") -> dict[str, Any]:
    configs = _configs()
    selected = configs["sources"]
    if source_id != "all":
        sources = [item for item in selected["sources"] if item["source_id"] == source_id]
        if not sources:
            raise KeyError(f"unknown source_id: {source_id}")
        selected = {**selected,"sources":sources}
    verification = _verify_local_sources(selected)
    return {"source_id":source_id,"action":"immutable local verification; remote acquisition requires explicit release adapter","verification":verification}


def validate_model(model_version: str = "latest") -> dict[str, Any]:
    result = run_validation()
    from .phase2 import PHASE2_DB, PHASE2_VERSION
    if not PHASE2_DB.exists():
        return {"requested_model_version":model_version,"resolved_model_version":"kr-v0.1.0",**result,"phase2":{"status":"not_built"}}
    import duckdb
    from .phase2_services import validate_segmentation_model
    con = duckdb.connect(str(PHASE2_DB),read_only=True)
    try:
        phase2_checks = {
            "active_domains_18_to_25":18 <= con.execute("SELECT count(*) FROM domain_registry WHERE active").fetchone()[0] <= 25,
            "all_domains_have_16_axes":con.execute("SELECT min(n)=16 AND max(n)=16 FROM (SELECT domain_id,count(*) n FROM domain_dimension GROUP BY 1)").fetchone()[0],
            "all_domains_meet_feature_floor":con.execute("SELECT min(n)>=20 FROM (SELECT domain_id,count(*) n FROM domain_feature WHERE queryable GROUP BY 1)").fetchone()[0],
            "all_domains_meet_behavior_floor":con.execute("SELECT min(n)>=10 FROM (SELECT domain_id,count(*) n FROM domain_behavior_template GROUP BY 1)").fetchone()[0],
            "all_domains_meet_tag_floor":con.execute("SELECT min(n)>=8 FROM (SELECT domain_id,count(*) n FROM domain_tag GROUP BY 1)").fetchone()[0],
            "all_domains_meet_archetype_floor":con.execute("SELECT min(n)>=8 FROM (SELECT domain_id,count(*) n FROM archetype_hierarchy WHERE hierarchy_level=2 GROUP BY 1)").fetchone()[0],
            "all_parent_decisions_present":con.execute("SELECT count(*)=1440 FROM parent_decomposition_decision").fetchone()[0],
            "five_allocated_parents_per_domain":con.execute("SELECT min(n)>=5 FROM (SELECT domain_id,count(*) n FROM parent_decomposition_decision WHERE decision='eligible' GROUP BY 1)").fetchone()[0],
            "primary_base_shares_reconcile":con.execute("SELECT max(abs(s-1))<=0.001 FROM (SELECT phase1_archetype_id,sum(share_base) s FROM subtype_allocation GROUP BY 1)").fetchone()[0],
            "child_base_counts_reconcile":con.execute("SELECT max(abs(a.s-p.count_base)/p.count_base)<=0.005 FROM (SELECT phase1_archetype_id,sum(count_base) s FROM subtype_allocation GROUP BY 1) a JOIN phase2_parent_estimate p USING(phase1_archetype_id)").fetchone()[0],
            "subtype_intervals_and_units_complete":con.execute("""
                SELECT count(*)=(SELECT count(*) FROM subtype_definition)
                FROM subtype_definition s
                WHERE EXISTS (
                    SELECT 1 FROM subtype_allocation a JOIN phase2_parent_estimate p USING(phase1_archetype_id)
                    WHERE a.subtype_id=s.subtype_id AND a.share_low<=a.share_base AND a.share_base<=a.share_high
                      AND a.count_low<=a.count_base AND a.count_base<=a.count_high
                      AND p.entity_unit IN ('person','child_person','household','establishment','enterprise')
                )
            """).fetchone()[0],
            "subtype_three_confidences_persisted":con.execute("SELECT count(*)=(SELECT count(*) FROM subtype_definition) FROM subtype_confidence WHERE population_confidence_grade IS NOT NULL AND interpretation_confidence_grade IS NOT NULL AND targetability_confidence_grade IS NOT NULL").fetchone()[0],
            "subtype_assumptions_and_gaps_complete":con.execute("SELECT count(*)=(SELECT count(*) FROM subtype_definition) FROM subtype_profile p JOIN subtype_confidence c USING(subtype_id) WHERE json_array_length(p.assumptions_json)>0 AND json_array_length(c.gaps_json)>0").fetchone()[0],
            "all_domains_have_acceptance":con.execute("SELECT min(acceptance_count)>=1 FROM domain_coverage_audit").fetchone()[0],
            "ten_parent_acceptance_cases":con.execute("SELECT count(*)>=10 FROM phase2_acceptance_result WHERE case_type='parent' AND status='passed'").fetchone()[0],
            "required_parent_semantic_cases_materialized":con.execute("SELECT count(*)=10 FROM required_parent_case").fetchone()[0],
            "required_parent_case_allocations_reconcile":con.execute("SELECT max(abs(a.s-p.count_base)/p.count_base)<=0.005 FROM (SELECT case_id,sum(count_base) s FROM required_parent_case_allocation GROUP BY 1) a JOIN required_parent_case p USING(case_id)").fetchone()[0],
            "ten_cross_domain_acceptance_cases":con.execute("SELECT count(*)=10 FROM phase2_acceptance_result WHERE case_type='cross_domain' AND status='passed'").fetchone()[0],
            "all_pair_associations_stored":con.execute("SELECT count(*)=276 FROM domain_association").fetchone()[0],
            "activation_profiles_complete":con.execute("SELECT count(*)=(SELECT count(*) FROM subtype_definition) FROM activation_mapping").fetchone()[0],
            "feedback_example_present":con.execute("SELECT (SELECT count(*) FROM segment_observation)>=1 AND (SELECT count(*) FROM posterior_update)>=1").fetchone()[0],
        }
    finally:
        con.close()
    segmentation = validate_segmentation_model()
    phase2_checks["segmentation_artifacts_validate"] = segmentation["status"] == "passed"
    combined_checks = {**result["checks"],**{f"phase2_{key}":value for key,value in phase2_checks.items()}}
    return {
        "requested_model_version":model_version,"resolved_model_version":PHASE2_VERSION,
        "status":"passed" if all(combined_checks.values()) else "failed","checks":combined_checks,
        "passed":sum(bool(value) for value in combined_checks.values()),"total":len(combined_checks),
        "phase2":{"status":"passed" if all(phase2_checks.values()) else "failed","checks":phase2_checks,"segmentation_models":segmentation["models"]},
    }
