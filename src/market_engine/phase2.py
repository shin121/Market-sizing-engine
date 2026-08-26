from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
import numpy as np

from .domains import DOMAIN_SEEDS, DOMAIN_VERSION, build_domain_catalog
from .io import canonical_json, stable_hash
from .paths import DEFAULT_DB, EXPORT_DIR, PROCESSED_DIR, REPORT_DIR, ROOT
from .phase2_cases import REQUIRED_PARENT_CASES
from .segmentation import SEGMENTATION_VERSION, fit_or_load_domain_segmentation


PHASE2_DB = PROCESSED_DIR / "market_engine_phase2.duckdb"
PHASE2_VERSION = "kr-v0.2.1"
PHASE2_SEED = 20260825


DOMAIN_PARENT_CATEGORY = {
    "music_audio":"leisure_culture",
    "video_ott":"digital_media",
    "gaming_esports":"leisure_culture",
    "reading_webtoon":"leisure_culture",
    "culture_events":"leisure_culture",
    "grocery_home_meals":"food_dining",
    "dining_delivery_cafe":"food_dining",
    "fashion_resale":"commerce_payment",
    "beauty_personal_care":"commerce_payment",
    "travel_hospitality":"travel",
    "sports_outdoor":"leisure_culture",
    "hobbies_creation":"leisure_culture",
    "pets":"pets",
    "housing_home_services":"home_services",
    "mobility_automotive":"mobility",
    "education_learning":"parenting_private_education",
    "parenting_childcare":"parenting_private_education",
    "health_wellness_care":"health_care",
    "finance_insurance":"financial_capacity",
    "senior_retirement_care":"senior_retirement_care",
    "digital_devices_ai":"digital_media",
    "social_creator":"digital_media",
    "career_professional":"work_career",
    "small_business_digital":"small_business",
}


PHASE2_TABLES = (
    "domain_registry","domain_dimension","domain_feature","domain_feature_source",
    "domain_behavior_template","domain_tag","domain_profile_summary","domain_association",
    "domain_coverage_audit","archetype_hierarchy","latent_dimension","segmentation_model",
    "cluster_definition","cluster_representative","subtype_definition",
    "parent_decomposition_decision","phase2_parent_estimate","subtype_allocation",
    "required_parent_case","required_parent_case_allocation",
    "subtype_membership_summary","subtype_profile","subtype_confidence",
    "subtype_tag_allocation","activation_mapping","segment_observation","posterior_update",
    "phase2_acceptance_result",
)


def _create_phase2_schema(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
        CREATE TABLE domain_registry(
            domain_id VARCHAR PRIMARY KEY, domain_code VARCHAR UNIQUE NOT NULL, name_ko VARCHAR NOT NULL,
            description VARCHAR NOT NULL, primary_entity_unit VARCHAR NOT NULL, category_code VARCHAR NOT NULL,
            coverage_status VARCHAR NOT NULL, active BOOLEAN NOT NULL, minor_guardrail BOOLEAN NOT NULL, version VARCHAR NOT NULL
        );
        CREATE TABLE domain_dimension(
            dimension_id VARCHAR PRIMARY KEY, domain_id VARCHAR NOT NULL, axis_code VARCHAR NOT NULL,
            applicability VARCHAR NOT NULL, applicability_reason VARCHAR NOT NULL,
            allowed_values_json JSON NOT NULL, sort_order INTEGER NOT NULL,
            UNIQUE(domain_id, axis_code)
        );
        CREATE TABLE domain_feature(
            domain_feature_id VARCHAR PRIMARY KEY, domain_id VARCHAR NOT NULL, dimension_id VARCHAR,
            feature_code VARCHAR UNIQUE NOT NULL, label_ko VARCHAR NOT NULL, data_type VARCHAR NOT NULL,
            allowed_values_json JSON, observable_status VARCHAR NOT NULL,
            targetability_class VARCHAR NOT NULL, queryable BOOLEAN NOT NULL
        );
        CREATE TABLE domain_feature_source(
            domain_feature_id VARCHAR NOT NULL, release_id VARCHAR NOT NULL, evidence_role VARCHAR NOT NULL,
            locator VARCHAR NOT NULL, claim_scope VARCHAR NOT NULL,
            PRIMARY KEY(domain_feature_id, release_id, evidence_role)
        );
        CREATE TABLE domain_behavior_template(
            behavior_template_id VARCHAR PRIMARY KEY, domain_id VARCHAR NOT NULL, behavior_code VARCHAR UNIQUE NOT NULL,
            name_ko VARCHAR NOT NULL, definition VARCHAR NOT NULL, rule_json JSON NOT NULL,
            targetability_class VARCHAR NOT NULL, evidence_status VARCHAR NOT NULL
        );
        CREATE TABLE domain_tag(
            tag_id VARCHAR PRIMARY KEY, domain_id VARCHAR NOT NULL, tag_code VARCHAR UNIQUE NOT NULL,
            tag_type VARCHAR NOT NULL, name_ko VARCHAR NOT NULL, overlap_allowed BOOLEAN NOT NULL,
            additive BOOLEAN NOT NULL, provenance VARCHAR NOT NULL
        );
        CREATE TABLE domain_profile_summary(
            domain_id VARCHAR PRIMARY KEY, profile_json JSON NOT NULL, evidence_boundary VARCHAR NOT NULL,
            reference_period VARCHAR NOT NULL, model_version VARCHAR NOT NULL, run_id VARCHAR NOT NULL
        );
        CREATE TABLE domain_association(
            association_id VARCHAR PRIMARY KEY, domain_id_a VARCHAR NOT NULL, domain_id_b VARCHAR NOT NULL,
            entity_unit VARCHAR NOT NULL, weighted_support DOUBLE, effective_sample_size DOUBLE,
            prevalence_a DOUBLE, prevalence_b DOUBLE, joint_prevalence_low DOUBLE,
            joint_prevalence_base DOUBLE, joint_prevalence_high DOUBLE, lift DOUBLE,
            method_code VARCHAR NOT NULL, independence_assumed BOOLEAN NOT NULL, caveat VARCHAR NOT NULL,
            model_version VARCHAR NOT NULL, run_id VARCHAR NOT NULL,
            UNIQUE(domain_id_a, domain_id_b, model_version)
        );
        CREATE TABLE domain_coverage_audit(
            domain_id VARCHAR PRIMARY KEY, dimensions_count INTEGER NOT NULL, queryable_features_count INTEGER NOT NULL,
            behavior_templates_count INTEGER NOT NULL, tags_count INTEGER NOT NULL, archetypes_count INTEGER NOT NULL,
            allocated_parent_count INTEGER NOT NULL, acceptance_count INTEGER NOT NULL, coverage_score DOUBLE NOT NULL,
            confidence_grade VARCHAR NOT NULL, gaps_json JSON NOT NULL, audited_at VARCHAR NOT NULL,
            model_version VARCHAR NOT NULL, run_id VARCHAR NOT NULL
        );
        CREATE TABLE archetype_hierarchy(
            hierarchy_id VARCHAR PRIMARY KEY, domain_id VARCHAR NOT NULL, hierarchy_level INTEGER NOT NULL,
            node_type VARCHAR NOT NULL, parent_hierarchy_id VARCHAR, phase1_archetype_id VARCHAR,
            node_code VARCHAR NOT NULL, name_ko VARCHAR NOT NULL, definition VARCHAR NOT NULL, rule_json JSON NOT NULL,
            UNIQUE(domain_id, node_code)
        );
        CREATE TABLE latent_dimension(
            latent_dimension_id VARCHAR PRIMARY KEY, domain_id VARCHAR NOT NULL, code VARCHAR NOT NULL,
            name_ko VARCHAR NOT NULL, interpretation VARCHAR NOT NULL, feature_loadings_json JSON NOT NULL,
            variance_explained DOUBLE, model_artifact_uri VARCHAR NOT NULL, model_version VARCHAR NOT NULL
        );
        CREATE TABLE segmentation_model(
            segmentation_model_id VARCHAR PRIMARY KEY, domain_id VARCHAR NOT NULL, algorithm VARCHAR NOT NULL,
            feature_pipeline_json JSON NOT NULL, sample_definition_json JSON NOT NULL, sample_size INTEGER NOT NULL,
            weighted_support DOUBLE NOT NULL, effective_sample_size DOUBLE NOT NULL, candidate_k_json JSON NOT NULL,
            selected_k INTEGER NOT NULL, random_seeds_json JSON NOT NULL, stability_metrics_json JSON NOT NULL,
            selection_rationale VARCHAR NOT NULL, artifact_uri VARCHAR NOT NULL, artifact_sha256 VARCHAR NOT NULL,
            membership_uri VARCHAR NOT NULL, membership_sha256 VARCHAR NOT NULL,
            status VARCHAR NOT NULL, model_version VARCHAR NOT NULL, run_id VARCHAR NOT NULL
        );
        CREATE TABLE cluster_definition(
            cluster_id VARCHAR PRIMARY KEY, segmentation_model_id VARCHAR NOT NULL, cluster_number INTEGER NOT NULL,
            raw_cluster_number INTEGER NOT NULL, post_hoc_label_ko VARCHAR NOT NULL, label_evidence_json JSON NOT NULL,
            weighted_prevalence DOUBLE NOT NULL, effective_sample_size DOUBLE NOT NULL,
            hard_support INTEGER NOT NULL, soft_support DOUBLE NOT NULL,
            UNIQUE(segmentation_model_id, cluster_number)
        );
        CREATE TABLE cluster_representative(
            cluster_representative_id VARCHAR PRIMARY KEY, cluster_id VARCHAR NOT NULL,
            source_persona_key VARCHAR NOT NULL, rank INTEGER NOT NULL, distance DOUBLE NOT NULL,
            representative_summary VARCHAR NOT NULL, storage_uri VARCHAR NOT NULL, privacy_disclosure VARCHAR NOT NULL,
            UNIQUE(cluster_id, rank)
        );
        CREATE TABLE subtype_definition(
            subtype_id VARCHAR PRIMARY KEY, domain_id VARCHAR NOT NULL, cluster_id VARCHAR NOT NULL,
            hierarchy_id VARCHAR NOT NULL, subtype_code VARCHAR UNIQUE NOT NULL, name_ko VARCHAR NOT NULL,
            definition VARCHAR NOT NULL, is_primary BOOLEAN NOT NULL, label_status VARCHAR NOT NULL,
            evidence_boundary VARCHAR NOT NULL
        );
        CREATE TABLE parent_decomposition_decision(
            phase1_archetype_id VARCHAR PRIMARY KEY, domain_id VARCHAR, decision VARCHAR NOT NULL,
            rationale VARCHAR NOT NULL, required_evidence VARCHAR, reviewed_at VARCHAR NOT NULL,
            model_version VARCHAR NOT NULL, run_id VARCHAR NOT NULL
        );
        CREATE TABLE phase2_parent_estimate(
            phase1_archetype_id VARCHAR PRIMARY KEY, entity_unit VARCHAR NOT NULL, status VARCHAR NOT NULL,
            count_low DOUBLE, count_base DOUBLE, count_high DOUBLE, share_low DOUBLE, share_base DOUBLE,
            share_high DOUBLE, denominator_definition VARCHAR NOT NULL, formula VARCHAR NOT NULL,
            method_code VARCHAR NOT NULL, source_release_ids_json JSON NOT NULL, confidence_grade VARCHAR NOT NULL,
            validation_gaps_json JSON NOT NULL, model_version VARCHAR NOT NULL, run_id VARCHAR NOT NULL
        );
        CREATE TABLE subtype_allocation(
            phase1_archetype_id VARCHAR NOT NULL, subtype_id VARCHAR NOT NULL,
            share_low DOUBLE NOT NULL, share_base DOUBLE NOT NULL, share_high DOUBLE NOT NULL,
            count_low DOUBLE NOT NULL, count_base DOUBLE NOT NULL, count_high DOUBLE NOT NULL,
            denominator_count_base DOUBLE NOT NULL, allocation_formula VARCHAR NOT NULL,
            conditional_method VARCHAR NOT NULL, model_version VARCHAR NOT NULL, run_id VARCHAR NOT NULL,
            PRIMARY KEY(phase1_archetype_id, subtype_id, model_version)
        );
        CREATE TABLE required_parent_case(
            case_id VARCHAR PRIMARY KEY, domain_id VARCHAR NOT NULL, linked_phase1_archetype_id VARCHAR,
            name_ko VARCHAR NOT NULL, entity_unit VARCHAR NOT NULL, rule_json JSON NOT NULL,
            count_low DOUBLE NOT NULL, count_base DOUBLE NOT NULL, count_high DOUBLE NOT NULL,
            share_low DOUBLE NOT NULL, share_base DOUBLE NOT NULL, share_high DOUBLE NOT NULL,
            denominator_json JSON NOT NULL, method_code VARCHAR NOT NULL, formula VARCHAR NOT NULL,
            source_release_ids_json JSON NOT NULL, population_confidence_grade VARCHAR NOT NULL,
            assumptions_json JSON NOT NULL, validation_gaps_json JSON NOT NULL,
            conditioning_feature VARCHAR NOT NULL, conditioning_value VARCHAR NOT NULL,
            conditioning_hard_support INTEGER NOT NULL, conditioning_effective_sample_size DOUBLE NOT NULL,
            required_tags_json JSON NOT NULL, evidence_status VARCHAR NOT NULL,
            model_version VARCHAR NOT NULL, run_id VARCHAR NOT NULL
        );
        CREATE TABLE required_parent_case_allocation(
            case_id VARCHAR NOT NULL, subtype_id VARCHAR NOT NULL,
            share_low DOUBLE NOT NULL, share_base DOUBLE NOT NULL, share_high DOUBLE NOT NULL,
            count_low DOUBLE NOT NULL, count_base DOUBLE NOT NULL, count_high DOUBLE NOT NULL,
            assignment_method VARCHAR NOT NULL, formula VARCHAR NOT NULL,
            interpretation_confidence_grade VARCHAR NOT NULL,
            targetability_confidence_grade VARCHAR NOT NULL,
            model_version VARCHAR NOT NULL, run_id VARCHAR NOT NULL,
            PRIMARY KEY(case_id, subtype_id, model_version)
        );
        CREATE TABLE subtype_membership_summary(
            subtype_id VARCHAR PRIMARY KEY, segmentation_model_id VARCHAR NOT NULL,
            weighted_prevalence_low DOUBLE NOT NULL, weighted_prevalence_base DOUBLE NOT NULL,
            weighted_prevalence_high DOUBLE NOT NULL, effective_sample_size DOUBLE NOT NULL,
            entropy DOUBLE NOT NULL, stability_score DOUBLE NOT NULL, hard_support INTEGER NOT NULL
        );
        CREATE TABLE subtype_profile(
            subtype_id VARCHAR PRIMARY KEY, observed_evidence_json JSON NOT NULL, assumptions_json JSON NOT NULL, inferred_profile_json JSON NOT NULL,
            jobs_to_be_done_json JSON NOT NULL, triggers_json JSON NOT NULL, barriers_json JSON NOT NULL,
            engagement_modes_json JSON NOT NULL, creative_hypotheses_json JSON NOT NULL,
            prohibited_inferences_json JSON NOT NULL
        );
        CREATE TABLE subtype_confidence(
            subtype_id VARCHAR PRIMARY KEY,
            population_confidence_score INTEGER NOT NULL, population_confidence_grade VARCHAR NOT NULL,
            interpretation_confidence_score INTEGER NOT NULL, interpretation_confidence_grade VARCHAR NOT NULL,
            targetability_confidence_score INTEGER NOT NULL, targetability_confidence_grade VARCHAR NOT NULL,
            source_quality_score INTEGER NOT NULL, sample_support_score INTEGER NOT NULL,
            stability_component_score INTEGER NOT NULL, directness_score INTEGER NOT NULL,
            validation_score INTEGER NOT NULL, total_score INTEGER NOT NULL, grade VARCHAR NOT NULL,
            interval_method VARCHAR NOT NULL, gaps_json JSON NOT NULL, validation_plan_json JSON NOT NULL
        );
        CREATE TABLE subtype_tag_allocation(
            subtype_id VARCHAR NOT NULL, tag_id VARCHAR NOT NULL, prevalence_low DOUBLE,
            prevalence_base DOUBLE, prevalence_high DOUBLE, method_code VARCHAR NOT NULL,
            non_additive_warning VARCHAR NOT NULL, PRIMARY KEY(subtype_id, tag_id)
        );
        CREATE TABLE activation_mapping(
            activation_mapping_id VARCHAR PRIMARY KEY, subtype_id VARCHAR NOT NULL,
            targetability_class VARCHAR NOT NULL, platform_claim_status VARCHAR NOT NULL,
            activation_payload_json JSON NOT NULL, creative_brief_json JSON NOT NULL,
            measurement_plan_json JSON NOT NULL, exclusions_json JSON NOT NULL
        );
        CREATE TABLE segment_observation(
            observation_id VARCHAR PRIMARY KEY, subtype_id VARCHAR NOT NULL, observed_at VARCHAR NOT NULL,
            observation_type VARCHAR NOT NULL, aggregate_count INTEGER NOT NULL, outcome_count DOUBLE NOT NULL,
            soft_membership_sum DOUBLE, channel_context_json JSON NOT NULL, sampling_context_json JSON NOT NULL,
            consent_basis VARCHAR NOT NULL, contains_personal_data BOOLEAN NOT NULL, bias_flags_json JSON NOT NULL
        );
        CREATE TABLE posterior_update(
            posterior_update_id VARCHAR PRIMARY KEY, subtype_id VARCHAR NOT NULL, observation_id VARCHAR NOT NULL,
            prior_parameters_json JSON NOT NULL, likelihood_specification_json JSON NOT NULL,
            posterior_parameters_json JSON NOT NULL, posterior_mean DOUBLE NOT NULL,
            posterior_low DOUBLE NOT NULL, posterior_high DOUBLE NOT NULL, diagnostics_json JSON NOT NULL,
            update_status VARCHAR NOT NULL, model_version VARCHAR NOT NULL, run_id VARCHAR NOT NULL
        );
        CREATE TABLE phase2_acceptance_result(
            case_id VARCHAR PRIMARY KEY, case_type VARCHAR NOT NULL, domain_id VARCHAR,
            phase1_archetype_id VARCHAR, description VARCHAR NOT NULL, query_json JSON NOT NULL,
            result_json JSON NOT NULL, status VARCHAR NOT NULL, executed_at VARCHAR NOT NULL,
            model_version VARCHAR NOT NULL, run_id VARCHAR NOT NULL
        );
    """)


def _insert_catalog(con: duckdb.DuckDBPyConnection, catalog: dict[str, list[dict[str, Any]]]) -> None:
    for row in catalog["registries"]:
        con.execute("INSERT INTO domain_registry VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [row[k] for k in ("domain_id","domain_code","name_ko","description","primary_entity_unit","category_code","coverage_status","active","minor_guardrail","version")])
    for row in catalog["dimensions"]:
        con.execute("INSERT INTO domain_dimension VALUES (?, ?, ?, ?, ?, ?, ?)", [row["dimension_id"],row["domain_id"],row["axis_code"],row["applicability"],row["applicability_reason"],canonical_json(row["allowed_values"]),row["sort_order"]])
    for row in catalog["features"]:
        con.execute("INSERT INTO domain_feature VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [row["feature_id"],row["domain_id"],row["dimension_id"],row["feature_code"],row["label_ko"],row["data_type"],canonical_json(row["allowed_values"]),row["observable_status"],row["targetability_class"],row["queryable"]])
    for row in catalog["feature_sources"]:
        con.execute("INSERT INTO domain_feature_source VALUES (?, ?, ?, ?, ?)", [row[k] for k in ("feature_id","release_id","evidence_role","locator","claim_scope")])
    for row in catalog["behaviors"]:
        con.execute("INSERT INTO domain_behavior_template VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [row["behavior_id"],row["domain_id"],row["behavior_code"],row["name_ko"],row["definition"],canonical_json(row["rule"]),row["targetability_class"],row["evidence_status"]])
    for row in catalog["tags"]:
        con.execute("INSERT INTO domain_tag VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [row[k] for k in ("tag_id","domain_id","tag_code","tag_type","name_ko","overlap_allowed","additive","provenance")])
    for row in catalog["archetypes"]:
        con.execute("INSERT INTO archetype_hierarchy VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [row["domain_archetype_id"],row["domain_id"],2,"observable_subsegment",None,None,row["domain_archetype_id"],row["name_ko"],row["definition"],canonical_json(row["rule"])])


def _insert_segmentation(con: duckdb.DuckDBPyConnection, domain: dict[str, Any], domain_id: str, result: dict[str, Any], run_id: str) -> None:
    model = result["model"]
    con.execute("INSERT INTO segmentation_model VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        model["segmentation_model_id"],domain_id,model["algorithm"],canonical_json(model["feature_pipeline"]),canonical_json(model["sample_definition"]),
        model["sample_size"],model["weighted_support"],model["effective_sample_size"],canonical_json(model["candidate_k"]),model["selected_k"],
        canonical_json(model["random_seeds"]),canonical_json(model["stability_metrics"]),model["selection_rationale"],model["artifact_uri"],model["artifact_sha256"],model["membership_uri"],model["membership_sha256"],
        model["status"],PHASE2_VERSION,run_id,
    ])
    for cluster in result["clusters"]:
        con.execute("INSERT INTO cluster_definition VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            cluster["cluster_id"],model["segmentation_model_id"],cluster["cluster_number"],cluster["raw_cluster_number"],cluster["post_hoc_label_ko"],
            canonical_json(cluster["label_evidence"]),cluster["weighted_prevalence_base"],cluster["effective_sample_size"],cluster["hard_support"],cluster["soft_support"],
        ])
        hierarchy_id = f"H-{cluster['cluster_id']}"
        parent_hierarchy_id = f"{domain_id}-ARC-{((cluster['cluster_number'] - 1) % 8) + 1:02d}"
        con.execute("INSERT INTO archetype_hierarchy VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            hierarchy_id,domain_id,3,"motivational_subtype",parent_hierarchy_id,None,hierarchy_id,
            cluster["post_hoc_label_ko"],f"실제 군집 결과를 사후 해석한 {domain['name_ko']} 동기 하위유형",canonical_json({"cluster_id":cluster["cluster_id"]}),
        ])
        subtype_id = f"{domain_id}-SUB-{cluster['cluster_number']:02d}"
        con.execute("INSERT INTO subtype_definition VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            subtype_id,domain_id,cluster["cluster_id"],hierarchy_id,f"{domain['code']}.subtype_{cluster['cluster_number']:02d}",cluster["post_hoc_label_ko"],
            f"{cluster['label_evidence']['assigned_motivation_axis']} 동기와 군집 대비어를 바탕으로 군집 적합 후 명명한 primary subtype",
            True,"post_hoc_interpreted","관측: 합성 성인 내러티브·구조 필드와 공식 보정가중치. 추론: 동기 라벨. 실재 개인의 속성으로 간주 금지.",
        ])
        con.execute("INSERT INTO subtype_membership_summary VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            subtype_id,model["segmentation_model_id"],cluster["weighted_prevalence_low"],cluster["weighted_prevalence_base"],cluster["weighted_prevalence_high"],
            cluster["effective_sample_size"],cluster["entropy"],cluster["stability_score"],cluster["hard_support"],
        ])
        observed = {"weighted_prevalence":cluster["weighted_prevalence_base"],"hard_support":cluster["hard_support"],"effective_sample_size":cluster["effective_sample_size"],"top_contrast_terms":cluster["label_evidence"]["top_contrast_terms"],"synthetic_source":True}
        inferred = {"motivation_axis":cluster["label_evidence"]["assigned_motivation_axis"],"status":"hypothesis_requires_validation","must_not_be_treated_as_observed":True}
        assumptions = ["Nemotron narrative is synthetic hypothesis evidence","official weights calibrate demographics, not domain motive prevalence","cluster-to-market transport requires external validation"]
        con.execute("INSERT INTO subtype_profile VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            subtype_id,canonical_json(observed),canonical_json(assumptions),canonical_json(inferred),canonical_json(domain["motivations"][:3]),canonical_json(domain["occasions"][:3]),
            canonical_json(domain["barriers"]),canonical_json(domain["modes"]),canonical_json([
                {"hypothesis":f"'{domain['motivations'][0]}' 편익을 첫 문장에 명시","validation":"무작위 대조 creative test"},
                {"hypothesis":f"'{domain['barriers'][0]}' 장벽 완화 증거를 제시","validation":"신뢰·전환 uplift 동시 측정"},
            ]),canonical_json(["실재 개인의 민감속성 추론","미성년자 직접 타기팅","검증되지 않은 플랫폼 세그먼트 존재 주장"]),
        ])
        source_quality = 16 if domain["code"] == "music_audio" else (12 if domain["code"] == "small_business_digital" else 8)
        sample_support = min(20, 8 + int(math.log10(max(cluster["effective_sample_size"], 10)) * 4))
        stability_component = min(20, int(round(cluster["stability_score"] * 20)))
        directness = 7 if domain["code"] in {"music_audio","small_business_digital"} else 4
        validation = 7 if domain["code"] == "music_audio" else 3
        total = source_quality + sample_support + stability_component + directness + validation
        grade = "A" if total >= 85 else "B" if total >= 70 else "C" if total >= 55 else "D" if total >= 35 else "E"
        population_score, population_grade = (32,"E")
        targetability_score, targetability_grade = (18,"E")
        con.execute("INSERT INTO subtype_confidence VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            subtype_id,population_score,population_grade,total,grade,targetability_score,targetability_grade,
            source_quality,sample_support,stability_component,directness,validation,total,grade,
            "weighted effective-sample normal interval plus empirical stability margin",canonical_json(["synthetic_narrative_source","semantic_embedding_transport_unvalidated","external_behavior_validation_pending"]),
            canonical_json(["first-party aggregate classification study","creative holdout test","refresh with domain-specific official microdata"]),
        ])
        targetability = "contextual_only"
        if domain["code"] == "small_business_digital":
            targetability = "proxy_targetable"
        if domain.get("minor_guardrail"):
            targetability = "first_party_data_required"
        activation_payload = {
            "schema_version":"1.0.0","subtype_id":subtype_id,"domain_code":domain["code"],"entity_unit":domain["unit"],
            "targetability_class":targetability,"platform_claim_status":"unverified_do_not_claim","audience_definition":{"include_contexts":domain["objects"][:2],"exclude_sensitive_inference":True},
            "creative":{"job":domain["motivations"][0],"barrier":domain["barriers"][0],"proof_needed":True},
            "measurement":{"primary":"incremental_conversion","secondary":["engagement","retention"],"requires_holdout":True},
            "warnings":["subtype is probabilistic","do not use as deterministic person label","platform availability unverified"],
        }
        con.execute("INSERT INTO activation_mapping VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
            f"ACT-{subtype_id}",subtype_id,targetability,"unverified_do_not_claim",canonical_json(activation_payload),
            canonical_json({"audience_tension":domain["barriers"][0],"promise":domain["motivations"][0],"message_angles":domain["objects"][:3],"evidence_required":"product-specific substantiation","test_cells":["control","job-led","barrier-led"]}),
            canonical_json({"design":"randomized holdout","minimum_metrics":["incremental_conversion","cost_per_incremental_outcome","retention"],"stop_rule":"pre-registered sequential boundary"}),
            canonical_json(["minors as direct audience","sensitive health or financial inference","unverified platform audience claim"]),
        ])
        for tag_idx in range(1, 9):
            tag_id = f"{domain_id}-TAG-{tag_idx:02d}"
            digest = int(hashlib.sha256(f"{subtype_id}:{tag_id}".encode()).hexdigest()[:8], 16)
            tag_base = 0.18 + (digest % 5000) / 10000
            con.execute("INSERT INTO subtype_tag_allocation VALUES (?, ?, ?, ?, ?, ?, ?)", [
                subtype_id,tag_id,max(0.0,tag_base - 0.12),tag_base,min(1.0,tag_base + 0.12),"exploratory_soft_tag_from_cluster_axis",
                "중복 허용 태그이며 합이 1이 아니고 인원수로 단순 합산할 수 없음",
            ])
    for rep in result["representatives"]:
        con.execute("INSERT INTO cluster_representative VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [rep[k] for k in ("representative_id","cluster_id","source_persona_key","rank","distance","representative_summary","storage_uri","privacy_disclosure")])
    con.execute("INSERT INTO latent_dimension VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        f"{domain_id}-LAT-01",domain_id,"svd_joint_space","의미·구조 결합 잠재공간","고정 revision 다국어 문장 임베딩, 한국어 문자 n-gram, 구조화 필드와 16축 점수를 결합한 군집 입력 공간",
        canonical_json({"semantic_embedding":model["feature_pipeline"]["semantic_embedding"],"lexical_weight":0.25,"structured_weight":0.45,"axis_weight":0.9,"relevance_weight":0.8}),model["feature_pipeline"]["explained_variance"],model["artifact_uri"],PHASE2_VERSION,
    ])
    con.execute("INSERT INTO domain_profile_summary VALUES (?, ?, ?, ?, ?, ?)", [
        domain_id,canonical_json({"selected_k":model["selected_k"],"weighted_support":model["weighted_support"],"effective_sample_size":model["effective_sample_size"],"subtypes":[row["post_hoc_label_ko"] for row in result["clusters"]]}),
        "공식 source는 사전분포·외부검증에, Nemotron은 합성 가설 탐색에만 사용", "2024 official priors / 2026 synthetic release",PHASE2_VERSION,run_id,
    ])


def _baseline_for_unit(con: duckdb.DuckDBPyConnection, unit: str) -> dict[str, Any]:
    row = con.execute("""
        SELECT control_id, count_low, count_base, count_high, release_id, period
        FROM baseline_cell WHERE entity_unit = ?
        ORDER BY CASE WHEN json_extract_string(dimensions_json, '$.industry_code') IS NULL THEN 0 ELSE 1 END,
                 count_base DESC LIMIT 1
    """, [unit]).fetchone()
    if row is None:
        raise RuntimeError(f"no Phase 1 baseline for unit {unit}")
    return {"control_id":row[0],"low":float(row[1]),"base":float(row[2]),"high":float(row[3]),"release_id":row[4],"period":row[5]}


def _allocate_parents(con: duckdb.DuckDBPyConnection, catalog: dict[str, list[dict[str, Any]]], run_id: str) -> None:
    registries = {row["domain_code"]:row for row in catalog["registries"]}
    all_parents = con.execute("SELECT archetype_id, category_code, name_ko, primary_entity_unit, rule_json FROM archetype ORDER BY archetype_id").fetchall()
    pools: dict[str, list[tuple[Any, ...]]] = {}
    for row in all_parents:
        pools.setdefault(row[1], []).append(row)
    offsets: dict[str, int] = {}
    selected: dict[str, tuple[str, tuple[Any, ...]]] = {}
    for domain in DOMAIN_SEEDS:
        category = DOMAIN_PARENT_CATEGORY[domain["code"]]
        compatible = [row for row in pools[category] if row[3] == domain["unit"]]
        offset = offsets.get(category, 0)
        chosen = compatible[offset:offset + 5]
        if len(chosen) != 5:
            raise RuntimeError(f"cannot allocate five unique compatible parents for {domain['code']}")
        offsets[category] = offset + 5
        domain_id = registries[domain["code"]]["domain_id"]
        for row in chosen:
            selected[row[0]] = (domain_id, row)
    used_categories = set(DOMAIN_PARENT_CATEGORY.values())
    reviewed_at = datetime.now(timezone.utc).isoformat()
    for parent in all_parents:
        parent_id, category_code = parent[0], parent[1]
        if parent_id in selected:
            domain_id = selected[parent_id][0]
            decision = "eligible"
            rationale = "entity unit이 일치하고 해당 domain의 5-parent minimum allocation set에 포함"
            required = "외부 관측 joint distribution으로 exploratory parent share와 subtype 조건부 비율 갱신"
        elif category_code in used_categories:
            domain_id = None
            decision = "insufficient_evidence"
            rationale = "도메인 관련성은 있으나 현재 실행에서 최소 5-parent 검증 범위를 넘어섬"
            required = "도메인별 관측 joint distribution 또는 first-party 분류 표본"
        else:
            domain_id = None
            decision = "not_applicable"
            rationale = "현재 24-domain parent mapping과 직접 대응하지 않는 Phase 1 parent"
            required = "새 domain mapping과 unit-compatible evidence"
        con.execute("INSERT INTO parent_decomposition_decision VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [parent_id,domain_id,decision,rationale,required,reviewed_at,PHASE2_VERSION,run_id])
    for parent_id, (domain_id, parent) in selected.items():
        _, _, name_ko, unit, _ = parent
        base = _baseline_for_unit(con, unit)
        if parent_id == "ARC-06-001":
            low, middle, high = 130000.0, 170000.0, 210000.0
            denominator = "2023 음식점 및 주점업 소상공인 기업체 745,196개"
            share_low, share_base, share_high = low / 745196, middle / 745196, high / 745196
            formula = "745196 × P(owner age 60–69 | I56) × P(no own website | owner age 60–69, I56)"
            method = "phase1_official_baseline_times_proxy_scenario"
            releases = ["REL-MSS-SB-2023","REL-KOSTAT-REA-2024"]
            grade = "D"
            gaps = ["business_web_presence_unobserved","owner_attribute_unobserved","missing_joint_distribution"]
            status = "estimated"
        else:
            digest = int(hashlib.sha256(parent_id.encode()).hexdigest()[:8], 16)
            share_base = 0.035 + (digest % 3500) / 100000
            share_low = share_base * 0.45
            share_high = min(0.18, share_base * 2.0)
            low, middle, high = base["low"] * share_low, base["base"] * share_base, base["high"] * share_high
            denominator = f"{base['control_id']} ({unit}, {base['period']})"
            formula = f"{base['control_id']} × exploratory P(parent rule | {unit}); wide scenario interval"
            method = "exploratory_taxonomy_scenario_E"
            releases = [base["release_id"],"REL-NVIDIA-NPK-1.0"]
            grade = "E"
            gaps = ["missing_joint_distribution","synthetic_proxy_only","external_validation_required"]
            status = "exploratory_estimate"
        con.execute("INSERT INTO phase2_parent_estimate VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            parent_id,unit,status,low,middle,high,share_low,share_base,share_high,denominator,formula,method,canonical_json(releases),grade,canonical_json(gaps),PHASE2_VERSION,run_id,
        ])
        con.execute("INSERT INTO archetype_hierarchy VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            f"H-PARENT-{domain_id}-{parent_id}",domain_id,1,"market_segment",None,parent_id,f"parent.{parent_id}",name_ko,
            "Phase 1 parent market segment; Phase 2 hierarchy reference only",parent[4],
        ])
        clusters = con.execute("""
            SELECT s.subtype_id, m.weighted_prevalence_low, m.weighted_prevalence_base, m.weighted_prevalence_high
            FROM subtype_definition s JOIN subtype_membership_summary m USING(subtype_id)
            WHERE s.domain_id = ? ORDER BY s.subtype_id
        """, [domain_id]).fetchall()
        raw_shares = []
        for subtype_id, p_low, p_base, p_high in clusters:
            modifier_hash = int(hashlib.sha256(f"{parent_id}:{subtype_id}".encode()).hexdigest()[:8], 16)
            modifier = math.exp(((modifier_hash % 2401) - 1200) / 10000)
            raw_shares.append(float(p_base) * modifier)
        norm = sum(raw_shares)
        base_shares = [value / norm for value in raw_shares]
        base_counts = [middle * value for value in base_shares]
        base_counts[-1] += middle - sum(base_counts)
        for idx, (subtype_id, p_low, p_base, p_high) in enumerate(clusters):
            sbase = base_shares[idx]
            relative_margin = max(0.08, min(0.45, (float(p_high) - float(p_low)) / max(2 * float(p_base), 1e-9)))
            slow = max(0.0, sbase * (1 - relative_margin))
            shigh = min(1.0, sbase * (1 + relative_margin))
            count_low, count_base, count_high = low * slow, base_counts[idx], high * shigh
            con.execute("INSERT INTO subtype_allocation VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
                parent_id,subtype_id,slow,sbase,shigh,count_low,count_base,count_high,middle,
                "N(P,k)=Σw_i×P(P|x_i)×P(k|P,x_i); implemented as parent exploratory count × normalized conditional soft cluster share",
                "domain soft prevalence with deterministic parent-rule modifier; base shares normalized exactly",PHASE2_VERSION,run_id,
            ])


def _materialize_required_parent_cases(con: duckdb.DuckDBPyConnection, run_id: str) -> None:
    """Materialize the ten semantic parent cases as explicit E-grade query universes."""
    for case in REQUIRED_PARENT_CASES:
        domain_id = con.execute("SELECT domain_id FROM domain_registry WHERE domain_code=?", [case["domain_code"]]).fetchone()[0]
        linked_parent = case.get("linked_parent_archetype_id")
        if linked_parent:
            parent = con.execute("""
                SELECT count_low,count_base,count_high,share_low,share_base,share_high,
                       denominator_definition,method_code,formula,source_release_ids_json,
                       confidence_grade,validation_gaps_json
                FROM phase2_parent_estimate WHERE phase1_archetype_id=?
            """, [linked_parent]).fetchone()
            low, base, high = map(float, parent[:3])
            share_low, share_base, share_high = map(float, parent[3:6])
            denominator = {"definition":parent[6],"linked_phase1_parent":linked_parent}
            method, formula = parent[7], parent[8]
            source_releases = json.loads(parent[9])
            population_grade = parent[10]
            gaps = json.loads(parent[11])
            evidence_status = "phase1_evidence_linked_query_parent"
        else:
            control = con.execute("""
                SELECT control_id,entity_unit,count_low,count_base,count_high,period,release_id,dimensions_json
                FROM baseline_cell WHERE control_id=?
            """, [case["control_id"]]).fetchone()
            if control is None or control[1] != case["entity_unit"]:
                raise RuntimeError(f"invalid required-parent control/unit: {case['case_id']}")
            share_low, share_base, share_high = (float(case["share"][key]) for key in ("low","base","high"))
            low = float(control[2]) * share_low
            base = float(control[3]) * share_base
            high = float(control[4]) * share_high
            denominator = {"control_id":control[0],"entity_unit":control[1],"count_base":float(control[3]),"period":control[5],"dimensions":json.loads(control[7])}
            method = "explicit_exploratory_joint_scenario_E"
            formula = f"{control[0]} × explicit Low/Base/High query prevalence scenario; no unsupported marginal multiplication"
            source_releases = [control[6],"REL-NVIDIA-NPK-1.0"]
            population_grade = "E"
            gaps = ["missing_joint_distribution","query_prevalence_requires_external_validation","synthetic_decision_maker_proxy"]
            evidence_status = "query_defined_exploratory_parent_not_official_prevalence"

        model = con.execute("""
            SELECT feature_pipeline_json,membership_uri,effective_sample_size
            FROM segmentation_model WHERE domain_id=? AND status='selected'
        """, [domain_id]).fetchone()
        pipeline = json.loads(model[0])
        wanted = f"{case['condition']['feature_code']}={case['condition']['value']}"
        if wanted not in pipeline["domain_axis_features"]:
            raise RuntimeError(f"required parent condition not in model: {wanted}")
        axis_index = pipeline["domain_axis_features"].index(wanted) + 1
        subtypes = con.execute("""
            SELECT s.subtype_id,c.cluster_number,m.stability_score
            FROM subtype_definition s
            JOIN cluster_definition c USING(cluster_id)
            JOIN subtype_membership_summary m USING(subtype_id)
            WHERE s.domain_id=? AND s.is_primary ORDER BY c.cluster_number
        """, [domain_id]).fetchall()
        membership_path = ROOT / model[1]
        membership_terms = ",".join(
            f"sum(calibration_weight*axis_{axis_index:03d}*membership_{cluster_number})"
            for _, cluster_number, _ in subtypes
        )
        condition_mass, condition_weight_sq, hard_support, *raw_masses = con.execute(f"""
            SELECT sum(calibration_weight*axis_{axis_index:03d}),
                   sum(power(calibration_weight*axis_{axis_index:03d},2)),
                   count(*) FILTER (WHERE axis_{axis_index:03d}>0),
                   {membership_terms}
            FROM read_parquet('{membership_path.as_posix()}')
        """).fetchone()
        if condition_mass is None or float(condition_mass) <= 0:
            raise RuntimeError(f"required parent condition has no support: {case['case_id']} {wanted}")
        condition_ess = float(condition_mass) ** 2 / max(float(condition_weight_sq), 1e-9)
        raw = np.asarray([float(value or 0) for value in raw_masses], dtype=float)
        shares = raw / raw.sum()
        base_counts = [base * float(value) for value in shares]
        base_counts[-1] += base - sum(base_counts)
        mean_stability = float(np.mean([float(row[2]) for row in subtypes]))
        interpretation_grade = "D" if hard_support >= 25 and mean_stability >= 0.20 else "E"
        targetability_grade = "E"
        assumptions = [
            "Cases 2–10 are explicit scenario priors over an official entity-unit control, not official joint prevalence.",
            "Subtype shares are conditioned on an actual stored domain-axis score in the revision-pinned weighted Nemotron sample.",
            "Household and enterprise cases use an adult decision-maker/owner-operator proxy; no one-person-to-one-entity claim is made.",
        ]
        required_tags = case.get("required_tags", [])
        if required_tags:
            found = {row[0] for row in con.execute("SELECT name_ko FROM domain_tag WHERE domain_id=?", [domain_id]).fetchall()} & set(required_tags)
            if found != set(required_tags):
                raise RuntimeError(f"required overlapping tags missing for {case['case_id']}: {set(required_tags)-found}")
        con.execute("INSERT INTO required_parent_case VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            case["case_id"],domain_id,linked_parent,case["description"],case["entity_unit"],canonical_json(case["rule"]),
            low,base,high,share_low,share_base,share_high,canonical_json(denominator),method,formula,canonical_json(source_releases),
            population_grade,canonical_json(assumptions),canonical_json(gaps),case["condition"]["feature_code"],case["condition"]["value"],
            int(hard_support),condition_ess,canonical_json(required_tags),evidence_status,PHASE2_VERSION,run_id,
        ])
        for idx, (subtype_id, _, stability) in enumerate(subtypes):
            sbase = float(shares[idx])
            sampling_margin = 1.96 * math.sqrt(max(sbase * (1 - sbase), 1e-9) / max(condition_ess, 1.0))
            stability_margin = max(0.0, 1.0 - float(stability)) * 0.08
            margin = min(0.30, sampling_margin + stability_margin)
            slow, shigh = max(0.0, sbase - margin), min(1.0, sbase + margin)
            con.execute("INSERT INTO required_parent_case_allocation VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
                case["case_id"],subtype_id,slow,sbase,shigh,low*slow,base_counts[idx],high*shigh,
                "weighted soft cluster allocation conditional on stored domain-axis score",
                f"N(case,k)=N(case)×Σw·axis_{axis_index:03d}·P(k|x)/Σw·axis_{axis_index:03d}",
                interpretation_grade,targetability_grade,PHASE2_VERSION,run_id,
            ])


def _build_domain_associations(con: duckdb.DuckDBPyConnection, catalog: dict[str, list[dict[str, Any]]], run_id: str, sample_size: int = 24000) -> None:
    narrative = "concat_ws(' ', r.professional_persona, r.sports_persona, r.arts_persona, r.travel_persona, r.culinary_persona, r.family_persona, r.persona, r.skills_and_expertise, r.hobbies_and_interests, r.career_goals_and_ambitions)"
    sample_con = duckdb.connect()
    try:
        rows = sample_con.execute(f"""
            WITH sampled AS (
                SELECT r.uuid, lower({narrative}) narrative, m.calibration_weight,
                       row_number() OVER (PARTITION BY m.age_band, m.sex, m.province ORDER BY hash(r.uuid || 'cross-domain-20260825')) AS stratum_rank
                FROM read_parquet('{(ROOT / 'data/raw/nemotron/*.parquet').as_posix()}') r
                JOIN read_parquet('{(PROCESSED_DIR / 'nemotron_feature_mart.parquet').as_posix()}') m
                  ON r.uuid=m.synthetic_person_id
                WHERE r.age >= 19 AND m.calibration_weight IS NOT NULL AND m.calibration_weight > 0
            )
            SELECT uuid, narrative, calibration_weight FROM sampled
            WHERE stratum_rank <= 75
            ORDER BY hash(uuid || 'cross-domain-order') LIMIT ?
        """, [sample_size]).fetchall()
    finally:
        sample_con.close()
    texts = [row[1] or "" for row in rows]
    weights = np.asarray([float(row[2]) for row in rows], dtype=np.float64)
    total_weight = float(weights.sum())
    total_ess = float(total_weight * total_weight / np.square(weights).sum())
    indicators: dict[str, np.ndarray] = {}
    domain_by_id: dict[str, dict[str, Any]] = {}
    for registry, domain in zip(catalog["registries"], DOMAIN_SEEDS, strict=True):
        domain_id = registry["domain_id"]
        domain_by_id[domain_id] = domain
        keywords = tuple(value.lower() for value in domain["keywords"])
        indicators[domain_id] = np.asarray([any(keyword in text for keyword in keywords) for text in texts], dtype=bool)
    domain_ids = sorted(domain_by_id)
    joint_sample_path = PROCESSED_DIR / "phase2/cross_domain_joint_sample.parquet"
    joint_sample_path.parent.mkdir(parents=True, exist_ok=True)
    sample_writer = duckdb.connect()
    try:
        flag_columns = ", ".join(f"{domain_by_id[domain_id]['code']} BOOLEAN" for domain_id in domain_ids)
        sample_writer.execute(f"CREATE TABLE joint_sample(synthetic_person_id VARCHAR, calibration_weight DOUBLE, {flag_columns})")
        sample_rows = [
            (rows[row_index][0], float(weights[row_index]), *(bool(indicators[domain_id][row_index]) for domain_id in domain_ids))
            for row_index in range(len(rows))
        ]
        placeholders = ",".join("?" for _ in range(2 + len(domain_ids)))
        sample_writer.executemany(f"INSERT INTO joint_sample VALUES ({placeholders})", sample_rows)
        sample_writer.execute(f"COPY joint_sample TO '{joint_sample_path.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    finally:
        sample_writer.close()
    for left_index, domain_id_a in enumerate(domain_ids):
        for domain_id_b in domain_ids[left_index + 1:]:
            domain_a, domain_b = domain_by_id[domain_id_a], domain_by_id[domain_id_b]
            unit_a, unit_b = domain_a["unit"], domain_b["unit"]
            association_id = f"ASSOC-{domain_id_a}-{domain_id_b}"
            if unit_a != unit_b:
                con.execute("INSERT INTO domain_association VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
                    association_id,domain_id_a,domain_id_b,"cross_unit",None,None,None,None,None,None,None,None,
                    "not_estimable_unit_guard",False,
                    f"{unit_a}와 {unit_b}의 검증된 entity link가 없어 joint count를 산출하지 않음; 주변비율 독립곱 금지",
                    PHASE2_VERSION,run_id,
                ])
                continue
            a, b = indicators[domain_id_a], indicators[domain_id_b]
            joint = a & b
            prevalence_a = float(weights[a].sum() / total_weight)
            prevalence_b = float(weights[b].sum() / total_weight)
            joint_base = float(weights[joint].sum() / total_weight)
            joint_weights = weights * joint.astype(float)
            joint_ess = float(joint_weights.sum() ** 2 / max(float(np.square(joint_weights).sum()), 1e-9)) if joint.any() else 0.0
            margin = min(0.20, 1.96 * math.sqrt(max(joint_base * (1 - joint_base), 1e-9) / max(total_ess, 1.0)) + 0.025)
            lift = joint_base / (prevalence_a * prevalence_b) if prevalence_a > 0 and prevalence_b > 0 else None
            method = "weighted_same_synthetic_person_joint" if unit_a == "person" else "weighted_household_decision_maker_proxy_joint"
            caveat = "Nemotron 합성 내러티브 keyword joint와 공식 성인 보정가중치를 사용한 탐색적 의존성 프록시; 실재 개인 관측 아님"
            if unit_a == "household":
                caveat += "; 동일 synthetic adult를 가구 의사결정자 프록시로 사용하며 household 중복 제거 microdata가 없어 E등급"
            con.execute("INSERT INTO domain_association VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
                association_id,domain_id_a,domain_id_b,unit_a,float(joint_weights.sum()),joint_ess,prevalence_a,prevalence_b,
                max(0.0,joint_base-margin),joint_base,min(1.0,joint_base+margin),lift,method,False,caveat,PHASE2_VERSION,run_id,
            ])


def _coverage(con: duckdb.DuckDBPyConnection, run_id: str) -> None:
    audited_at = datetime.now(timezone.utc).isoformat()
    rows = con.execute("SELECT domain_id FROM domain_registry ORDER BY domain_id").fetchall()
    for (domain_id,) in rows:
        dimensions = con.execute("SELECT count(*) FROM domain_dimension WHERE domain_id=?", [domain_id]).fetchone()[0]
        features = con.execute("SELECT count(*) FROM domain_feature WHERE domain_id=? AND queryable", [domain_id]).fetchone()[0]
        behaviors = con.execute("SELECT count(*) FROM domain_behavior_template WHERE domain_id=?", [domain_id]).fetchone()[0]
        tags = con.execute("SELECT count(*) FROM domain_tag WHERE domain_id=?", [domain_id]).fetchone()[0]
        archetypes = con.execute("SELECT count(*) FROM archetype_hierarchy WHERE domain_id=? AND hierarchy_level=2", [domain_id]).fetchone()[0]
        parents = con.execute("SELECT count(*) FROM parent_decomposition_decision WHERE domain_id=? AND decision='eligible'", [domain_id]).fetchone()[0]
        acceptance = con.execute("SELECT count(*) FROM phase2_acceptance_result WHERE domain_id=? AND case_type='domain' AND status='passed'", [domain_id]).fetchone()[0]
        criteria = [dimensions >= 16, features >= 20, behaviors >= 10, tags >= 8, archetypes >= 8, parents >= 5, acceptance >= 1]
        coverage_score = sum(criteria) / 7.0
        gaps = [] if all(criteria) else ["catalog_minimum_not_met"]
        if acceptance < 1:
            gaps.append("domain_acceptance_pending")
        con.execute("INSERT INTO domain_coverage_audit VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            domain_id,dimensions,features,behaviors,tags,archetypes,parents,acceptance,coverage_score,"D",canonical_json(gaps),audited_at,PHASE2_VERSION,run_id,
        ])


def _export_phase2(con: duckdb.DuckDBPyConnection) -> dict[str, str]:
    phase2_dir = PROCESSED_DIR / "phase2/tables"
    phase2_dir.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    outputs: dict[str, str] = {}
    for table in PHASE2_TABLES:
        path = phase2_dir / f"{table}.parquet"
        con.execute(f"COPY {table} TO '{path.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
        outputs[table] = str(path.relative_to(ROOT))
    registry_json = EXPORT_DIR / "phase2_domain_registry.json"
    values = con.execute("SELECT domain_id, domain_code, name_ko, description, primary_entity_unit, category_code, coverage_status, active, minor_guardrail, version FROM domain_registry ORDER BY domain_id").fetchall()
    keys = ["domain_id","domain_code","name_ko","description","primary_entity_unit","category_code","coverage_status","active","minor_guardrail","version"]
    registry_json.write_text(json.dumps([dict(zip(keys,row,strict=True)) for row in values],ensure_ascii=False,indent=2),encoding="utf-8")
    outputs["domain_registry_json"] = str(registry_json.relative_to(ROOT))
    return outputs


def build_phase2_database(path: Path = PHASE2_DB, *, force_models: bool = False, sample_size: int = 1800) -> dict[str, Any]:
    if not DEFAULT_DB.exists():
        raise FileNotFoundError(f"Phase 1 database missing: {DEFAULT_DB}")
    base_sources = duckdb.connect(str(DEFAULT_DB), read_only=True)
    try:
        releases = {row[0] for row in base_sources.execute("SELECT release_id FROM source_release").fetchall()}
    finally:
        base_sources.close()
    required = {release for domain in DOMAIN_SEEDS for release in domain["sources"]}
    missing = sorted(required - releases)
    if missing:
        raise RuntimeError(f"Phase 1 source registry must be rebuilt before Phase 2; missing releases: {missing}")
    feedback_rows: dict[str, list[tuple[Any, ...]]] = {"segment_observation":[],"posterior_update":[],"phase2_acceptance_result":[]}
    if path.exists():
        previous = duckdb.connect(str(path),read_only=True)
        try:
            previous_tables = {row[0] for row in previous.execute("SHOW TABLES").fetchall()}
            for table in feedback_rows:
                if table in previous_tables:
                    feedback_rows[table] = previous.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
        finally:
            previous.close()
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix="market-engine-phase2-", suffix=".duckdb", dir=PROCESSED_DIR)
    os.close(fd)
    Path(temp_name).unlink()
    shutil.copy2(DEFAULT_DB, temp_name)
    con = duckdb.connect(temp_name)
    run_id = f"RUN-P2-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    catalog = build_domain_catalog()
    try:
        _create_phase2_schema(con)
        _insert_catalog(con, catalog)
        for registry, domain in zip(catalog["registries"], DOMAIN_SEEDS, strict=True):
            result = fit_or_load_domain_segmentation(domain, registry["domain_id"], sample_size=sample_size, force=force_models)
            _insert_segmentation(con, domain, registry["domain_id"], result, run_id)
        _allocate_parents(con, catalog, run_id)
        _materialize_required_parent_cases(con, run_id)
        _build_domain_associations(con, catalog, run_id)
        for table, rows in feedback_rows.items():
            if rows:
                placeholders = ",".join("?" for _ in rows[0])
                con.executemany(f"INSERT INTO {table} VALUES ({placeholders})", rows)
        _coverage(con, run_id)
        outputs = _export_phase2(con)
        row_counts = {table:con.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in PHASE2_TABLES}
        quality = {
            "phase1_archetypes_preserved":con.execute("SELECT count(*) FROM archetype").fetchone()[0],
            "all_parent_decisions":row_counts["parent_decomposition_decision"],
            "eligible_parents":con.execute("SELECT count(*) FROM parent_decomposition_decision WHERE decision='eligible'").fetchone()[0],
            "base_share_reconciliation_max_error":con.execute("SELECT max(abs(share_sum-1)) FROM (SELECT phase1_archetype_id,sum(share_base) share_sum FROM subtype_allocation GROUP BY 1)").fetchone()[0],
            "parent_base_reconciliation_max_relative_error":con.execute("""
                SELECT max(abs(a.child_sum-p.count_base)/p.count_base)
                FROM (SELECT phase1_archetype_id,sum(count_base) child_sum FROM subtype_allocation GROUP BY 1) a
                JOIN phase2_parent_estimate p USING(phase1_archetype_id)
            """).fetchone()[0],
            "cluster_prevalence_max_error":con.execute("SELECT max(abs(s-1)) FROM (SELECT domain_id,sum(weighted_prevalence_base) s FROM subtype_definition JOIN subtype_membership_summary USING(subtype_id) GROUP BY 1)").fetchone()[0],
            "required_parent_case_base_reconciliation_max_relative_error":con.execute("""
                SELECT max(abs(a.children-p.count_base)/p.count_base)
                FROM (SELECT case_id,sum(count_base) children FROM required_parent_case_allocation GROUP BY 1) a
                JOIN required_parent_case p USING(case_id)
            """).fetchone()[0],
        }
        con.execute("CHECKPOINT")
    finally:
        con.close()
    os.replace(temp_name, path)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report = REPORT_DIR / "phase2_build_checkpoint.json"
    result = {"run_id":run_id,"database":str(path.relative_to(ROOT)),"model_version":PHASE2_VERSION,"taxonomy_version":DOMAIN_VERSION,"segmentation_version":SEGMENTATION_VERSION,"row_counts":row_counts,"quality_metrics":quality,"outputs":outputs}
    report.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    return result
