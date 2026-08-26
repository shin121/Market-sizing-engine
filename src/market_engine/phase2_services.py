from __future__ import annotations

import json
import math
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
from scipy.stats import beta as beta_distribution

from .io import sha256_file
from .paths import PROCESSED_DIR, ROOT
from .phase2 import PHASE2_DB, PHASE2_VERSION
from .phase2_repository import Phase2Repository


JOINT_SAMPLE = PROCESSED_DIR / "phase2/cross_domain_joint_sample.parquet"
FEATURE_MART = PROCESSED_DIR / "nemotron_feature_mart.parquet"


def list_domains(active: bool | None = True, *, coverage_status: str | None = None, entity_unit: str | None = None) -> dict[str, Any]:
    repo = Phase2Repository()
    try:
        return repo.list_domains(active=active,coverage_status=coverage_status,entity_unit=entity_unit)
    finally:
        repo.close()


def get_domain_taxonomy(domain_code: str) -> dict[str, Any]:
    repo = Phase2Repository()
    try:
        value = repo.domain_taxonomy(domain_code)
        if value is None:
            raise KeyError(f"unknown domain: {domain_code}")
        return value
    finally:
        repo.close()


def get_domain_coverage(domain_code: str) -> dict[str, Any]:
    repo = Phase2Repository()
    try:
        value = repo.domain_coverage(domain_code)
        if value is None:
            raise KeyError(f"unknown domain: {domain_code}")
        return value
    finally:
        repo.close()


def get_domain_behaviors(domain_code: str) -> dict[str, Any]:
    repo = Phase2Repository()
    try:
        value = repo.domain_behaviors(domain_code)
        if value is None:
            raise KeyError(f"unknown domain: {domain_code}")
        return value
    finally:
        repo.close()


def _validate_axis_conditions(repo: Phase2Repository, domain_id: str, conditions: list[dict[str, Any]]) -> list[tuple[int, str, Any]]:
    model_row = repo.connection.execute("SELECT feature_pipeline_json,membership_uri FROM segmentation_model WHERE domain_id=? AND status='selected'", [domain_id]).fetchone()
    if model_row is None:
        raise ValueError("domain has no selected segmentation model")
    pipeline = json.loads(model_row[0])
    names = pipeline["domain_axis_features"]
    mapped: list[tuple[int,str,Any]] = []
    for condition in conditions:
        feature_code = condition.get("feature_code")
        value = condition.get("value")
        if not isinstance(feature_code,str) or value is None:
            raise ValueError("each domain condition requires feature_code and value")
        wanted = f"{feature_code}={value}"
        if wanted not in names:
            raise ValueError(f"unsupported domain feature/value: {wanted}")
        mapped.append((names.index(wanted) + 1, feature_code, value))
    return mapped


def estimate_domain_segment(domain_code: str, conditions: list[dict[str, Any]], *, parent_archetype_id: str | None = None) -> dict[str, Any]:
    if not conditions:
        raise ValueError("at least one domain-specific feature condition is required")
    repo = Phase2Repository()
    try:
        domain = repo.domain(domain_code)
        if domain is None:
            raise KeyError(f"unknown domain: {domain_code}")
        mapped = _validate_axis_conditions(repo, domain["domain_id"], conditions)
        model_row = repo.connection.execute("SELECT segmentation_model_id,membership_uri,feature_pipeline_json,sample_size,effective_sample_size FROM segmentation_model WHERE domain_id=? AND status='selected'", [domain["domain_id"]]).fetchone()
        membership_path = ROOT / model_row[1]
        score_expression = " * ".join(f"axis_{index:03d}" for index,_,_ in mapped)
        con = duckdb.connect()
        try:
            weighted_score, total_weight, positive_support = con.execute(f"""
                SELECT sum(calibration_weight * ({score_expression})), sum(calibration_weight),
                       count(*) FILTER (WHERE ({score_expression}) > 0)
                FROM read_parquet('{membership_path.as_posix()}')
            """).fetchone()
        finally:
            con.close()
        if weighted_score is None or weighted_score <= 0:
            return {
                "status":"not_estimable","domain":domain,"conditions":conditions,"count":None,"share":None,
                "reason":"선택한 lexical axis 교집합의 양의 support가 없음",
                "validation_gap":"domain-specific survey or first-party classifications required",
            }
        share_base = float(weighted_score / total_weight)
        ess = float(model_row[4])
        margin = min(0.25, 1.96 * math.sqrt(max(share_base * (1-share_base),1e-9)/max(ess,1.0)) + 0.06)
        share = {"low":max(0.0,share_base-margin),"base":share_base,"high":min(1.0,share_base+margin)}
        result: dict[str, Any] = {
            "status":"conditional_share_only","domain":domain,"conditions":conditions,"share":share,"count":None,
            "denominator":{"definition":f"{domain_code} keyword-relevant calibrated synthetic adult decision-maker sample","sample_size":model_row[3],"effective_sample_size":ess},
            "positive_hard_support":positive_support,
            "formula":f"Σ calibration_weight × ({score_expression}) / Σ calibration_weight",
            "feature_lineage":{"model_id":model_row[0],"extractor":"normalized lexical axis token match","membership_uri":model_row[1],"used_axis_columns":[f"axis_{index:03d}" for index,_,_ in mapped]},
            "confidence":{"population":{"grade":"E","reason":"official domain universe unavailable"},"interpretation":{"grade":"D","reason":"lexical axis scores are exploratory"},"targetability":{"grade":"E","reason":"platform availability unverified"}},
            "warnings":["합성 내러티브 기반 조건부 비율이며 실재 개인 관측이 아님","공식 universe 없이는 인구 count를 산출하지 않음"],
        }
        if parent_archetype_id:
            parent = repo.connection.execute("SELECT count_low,count_base,count_high,status,entity_unit FROM phase2_parent_estimate WHERE phase1_archetype_id=?", [parent_archetype_id]).fetchone()
            decision = repo.connection.execute("SELECT domain_id,decision FROM parent_decomposition_decision WHERE phase1_archetype_id=?", [parent_archetype_id]).fetchone()
            if parent is None or decision is None or decision[0] != domain["domain_id"] or decision[1] != "eligible":
                raise ValueError("parent is not eligible for this domain")
            result["status"] = "exploratory_parent_conditional_estimate"
            result["count"] = {"low":parent[0]*share["low"],"base":parent[1]*share["base"],"high":parent[2]*share["high"]}
            result["parent_archetype_id"] = parent_archetype_id
            result["primary_unit"] = parent[4]
            result["confidence"]["population"] = {"grade":"D" if parent[3] == "estimated" else "E","reason":parent[3]}
        return result
    finally:
        repo.close()


def decompose_segment(parent_archetype_id: str, *, product_context: str | None = None, mode: str = "primary") -> dict[str, Any]:
    if mode not in {"primary","with_tags"}:
        raise ValueError("mode must be primary or with_tags")
    repo = Phase2Repository()
    try:
        value = repo.decomposition(parent_archetype_id)
        if value is None:
            raise KeyError(f"unknown parent archetype: {parent_archetype_id}")
        value["product_context"] = product_context
        value["mode"] = mode
        if mode == "with_tags" and value.get("decision",{}).get("domain_id"):
            rows = repo.connection.execute("SELECT tag_id,tag_code,tag_type,name_ko,overlap_allowed,additive,provenance FROM domain_tag WHERE domain_id=? ORDER BY tag_id", [value["decision"]["domain_id"]]).fetchall()
            value["overlapping_tags"] = [dict(zip(["tag_id","tag_code","tag_type","name_ko","overlap_allowed","additive","provenance"],row,strict=True)) for row in rows]
        return value
    finally:
        repo.close()


def decompose_required_parent_case(case_id: str) -> dict[str, Any]:
    repo = Phase2Repository()
    try:
        row = repo.connection.execute("""
            SELECT p.case_id,p.name_ko,d.domain_code,p.linked_phase1_archetype_id,p.entity_unit,p.rule_json,
                   p.count_low,p.count_base,p.count_high,p.share_low,p.share_base,p.share_high,
                   p.denominator_json,p.method_code,p.formula,p.source_release_ids_json,
                   p.population_confidence_grade,p.assumptions_json,p.validation_gaps_json,
                   p.conditioning_feature,p.conditioning_value,p.conditioning_hard_support,
                   p.conditioning_effective_sample_size,p.required_tags_json,p.evidence_status,p.model_version
            FROM required_parent_case p JOIN domain_registry d USING(domain_id)
            WHERE p.case_id=?
        """, [case_id]).fetchone()
        if row is None:
            raise KeyError(f"unknown required parent case: {case_id}")
        columns = [
            "case_id","name_ko","domain_code","linked_phase1_archetype_id","entity_unit","rule",
            "count_low","count_base","count_high","share_low","share_base","share_high","denominator",
            "method_code","formula","source_release_ids","population_confidence_grade","assumptions",
            "validation_gaps","conditioning_feature","conditioning_value","conditioning_hard_support",
            "conditioning_effective_sample_size","required_overlapping_tags","evidence_status","model_version",
        ]
        value = dict(zip(columns,row,strict=True))
        for field in ("rule","denominator","source_release_ids","assumptions","validation_gaps","required_overlapping_tags"):
            value[field] = json.loads(value[field])
        allocations = repo.connection.execute("""
            SELECT a.subtype_id,s.name_ko,a.share_low,a.share_base,a.share_high,
                   a.count_low,a.count_base,a.count_high,a.assignment_method,a.formula,
                   a.interpretation_confidence_grade,a.targetability_confidence_grade,
                   r.source_persona_key,r.representative_summary
            FROM required_parent_case_allocation a
            JOIN subtype_definition s USING(subtype_id)
            JOIN cluster_definition c USING(cluster_id)
            LEFT JOIN cluster_representative r ON r.cluster_id=c.cluster_id AND r.rank=1
            WHERE a.case_id=? ORDER BY c.cluster_number
        """, [case_id]).fetchall()
        allocation_columns = [
            "subtype_id","name_ko","share_low","share_base","share_high","count_low","count_base","count_high",
            "assignment_method","formula","interpretation_confidence_grade","targetability_confidence_grade",
            "representative_persona_key","representative_summary",
        ]
        value["subtypes"] = [dict(zip(allocation_columns,item,strict=True)) for item in allocations]
        share_sum = sum(float(item["share_base"]) for item in value["subtypes"])
        count_sum = sum(float(item["count_base"]) for item in value["subtypes"])
        value["reconciliation"] = {
            "share_base_sum":share_sum,
            "count_base_sum":count_sum,
            "parent_count_base":float(value["count_base"]),
            "relative_error":abs(count_sum-float(value["count_base"]))/max(float(value["count_base"]),1e-9),
        }
        value["confidence_assessments"] = {
            "population":{"grade":value["population_confidence_grade"],"reason":value["evidence_status"]},
            "interpretation":{"grade":allocations[0][10] if allocations else "E","reason":"conditioned semantic/axis cluster allocation"},
            "targetability":{"grade":allocations[0][11] if allocations else "E","reason":"platform availability unverified"},
        }
        value["warning"] = "Cases 2–10 are exploratory query-defined parent universes; do not present them as official joint prevalence."
        return value
    finally:
        repo.close()


def list_subtypes(domain_code: str | None = None, parent_archetype_id: str | None = None) -> dict[str, Any]:
    repo = Phase2Repository()
    try:
        return repo.list_subtypes(domain_code=domain_code,parent_archetype_id=parent_archetype_id)
    finally:
        repo.close()


def estimate_subtype(subtype_id: str, *, parent_archetype_id: str | None = None, geography: str = "KR", as_of: str = "latest") -> dict[str, Any]:
    if geography not in {"KR","national"}:
        raise ValueError("Phase 2 subtype allocations currently support national geography only")
    repo = Phase2Repository()
    try:
        value = repo.subtype(subtype_id,parent_archetype_id=parent_archetype_id)
        if value is None:
            raise KeyError(f"unknown subtype or allocation: {subtype_id}")
        population = {"grade":value["population_confidence_grade"],"score":value["population_confidence_score"],"reason":"domain-level synthetic prevalence transport"}
        if parent_archetype_id:
            grade = repo.connection.execute("SELECT confidence_grade,status FROM phase2_parent_estimate WHERE phase1_archetype_id=?", [parent_archetype_id]).fetchone()
            population = {"grade":grade[0],"score":48 if grade[0] == "D" else 25,"reason":grade[1]}
        value["confidence_assessments"] = {
            "population":population,
            "interpretation":{"grade":value["interpretation_confidence_grade"],"score":value["interpretation_confidence_score"],"stability":value["stability_score"],"reason":"cluster support and stability"},
            "targetability":{"grade":value["targetability_confidence_grade"],"score":value["targetability_confidence_score"],"class":value["targetability_class"],"reason":"platform segment existence is unverified"},
        }
        value["requested_scope"] = {"geography":geography,"as_of":as_of}
        value["scope_status"] = "national_current_model_period"
        return value
    finally:
        repo.close()


def compare_subtypes(subtype_ids: list[str], *, parent_archetype_id: str | None = None) -> dict[str, Any]:
    if len(subtype_ids) < 2:
        raise ValueError("at least two subtype IDs are required")
    items = [estimate_subtype(value,parent_archetype_id=parent_archetype_id) for value in subtype_ids]
    units = {item.get("parent_allocation",{}).get("parent_count_base") is not None for item in items}
    return {
        "items":items,
        "same_domain":len({item["domain_code"] for item in items}) == 1,
        "same_parent":parent_archetype_id is not None,
        "comparison_warning":"Primary subtypes may be compared within the same parent; overlapping tags remain non-additive and are excluded from count comparisons.",
    }


def get_subtype_profile(subtype_id: str) -> dict[str, Any]:
    value = estimate_subtype(subtype_id)
    return {key:value[key] for key in ("subtype_id","domain_code","name_ko","observed_evidence","assumptions","inferred_profile","jobs_to_be_done","triggers","barriers","engagement_modes","creative_hypotheses","prohibited_inferences","evidence_boundary","confidence_assessments")}


def generate_creative_brief(subtype_id: str, product_context: str | None = None) -> dict[str, Any]:
    value = estimate_subtype(subtype_id)
    product_context = product_context or "unspecified_product_context"
    hypotheses = value["creative_hypotheses"]
    message_angles = [item.get("hypothesis",str(item)) if isinstance(item,dict) else str(item) for item in hypotheses]
    while len(message_angles) < 3:
        message_angles.append(f"{value['name_ko']}의 핵심 job을 {product_context} 효익과 연결")
    return {
        "subtype_id":subtype_id,"name_ko":value["name_ko"],"product_context":product_context,
        "target_definition":value["definition"],
        "market_size":{"unit":"conditional_domain_share","low":value["domain_share_low"],"base":value["domain_share_base"],"high":value["domain_share_high"],"count":None,"warning":"parent context is required for entity counts"},
        "confidence":value["confidence_assessments"],
        "problem_and_triggers":{"jobs":value["jobs_to_be_done"],"triggers":value["triggers"],"objections":value["barriers"]},
        "core_promise":f"{product_context}가 {value['jobs_to_be_done'][0]} 달성을 돕는다는 검증 가능한 약속",
        "proof_points_needed":["product-specific substantiation","incremental outcome evidence","clear pricing and limitations"],
        "message_angles":message_angles[:5],
        "offer_hypotheses":["low-commitment trial","transparent value bundle","assisted onboarding"],
        "landing_page_emphasis":["problem recognition","proof before claim","friction and objection handling","clear next step"],
        "recommended_channels":{"hypothesis":"contextual or first-party activation only","targetability_class":value["targetability_class"],"platform_claim_status":value["platform_claim_status"]},
        "phrases_to_avoid":value["prohibited_inferences"],
        "recommended_experiments":value["measurement_plan"],
        "creative_brief":value["creative_brief"],"measurement_plan":value["measurement_plan"],"exclusions":value["exclusions"],
        "targetability":{"class":value["targetability_class"],"platform_claim_status":value["platform_claim_status"]},
        "disclosure":"Creative hypotheses require product-specific substantiation and randomized validation; they are not observed personal facts.",
    }


def explain_subtype(subtype_id: str, *, parent_archetype_id: str | None = None) -> dict[str, Any]:
    value = estimate_subtype(subtype_id,parent_archetype_id=parent_archetype_id)
    return {
        "subtype_id":subtype_id,"definition":value["definition"],"label_status":value["label_status"],
        "evidence_boundary":value["evidence_boundary"],"observed_evidence":value["observed_evidence"],
        "inferred_profile":value["inferred_profile"],"interval_method":value["interval_method"],
        "confidence_assessments":value["confidence_assessments"],"gaps":value["gaps"],
        "validation_plan":value["validation_plan"],"parent_allocation":value.get("parent_allocation"),
    }


def get_targetability(subtype_id: str, channel: str | None = None) -> dict[str, Any]:
    value = estimate_subtype(subtype_id)
    return {
        "subtype_id":subtype_id,"requested_channel":channel,"targetability_class":value["targetability_class"],
        "platform_claim_status":value["platform_claim_status"],"activation_payload":value["activation_payload"],
        "exclusions":value["exclusions"],"warning":"검증된 플랫폼 audience가 존재한다고 주장하지 않으며, contextual/first-party/creative 용도로만 해석합니다.",
    }


def explain_cross_domain_association(domain_code_a: str, domain_code_b: str | None = None) -> dict[str, Any]:
    repo = Phase2Repository()
    try:
        if domain_code_b is None:
            row = repo.connection.execute("SELECT description,query_json,result_json,status,executed_at,model_version FROM phase2_acceptance_result WHERE case_id=? AND case_type='cross_domain'", [domain_code_a]).fetchone()
            if row is None:
                raise KeyError(f"unknown cross-domain query id: {domain_code_a}")
            return {"query_id":domain_code_a,"description":row[0],"query":json.loads(row[1]),"result":json.loads(row[2]),"status":row[3],"executed_at":row[4],"model_version":row[5]}
        value = repo.association(domain_code_a,domain_code_b)
        if value is None:
            raise KeyError(f"unknown domain pair: {domain_code_a}, {domain_code_b}")
        value["domains"] = [domain_code_a,domain_code_b]
        value["independence_statement"] = "joint support is measured on the same synthetic entity when units match; independence is never assumed."
        return value
    finally:
        repo.close()


def estimate_cross_domain_segment(payload: dict[str, Any]) -> dict[str, Any]:
    domain_codes = payload.get("domains")
    if not isinstance(domain_codes,list) or not (2 <= len(domain_codes) <= 8) or len(set(domain_codes)) != len(domain_codes):
        raise ValueError("domains must contain 2–8 distinct domain codes")
    repo = Phase2Repository()
    try:
        domains = []
        for code in domain_codes:
            domain = repo.domain(code)
            if domain is None:
                raise KeyError(f"unknown domain: {code}")
            domains.append(domain)
        units = {domain["primary_entity_unit"] for domain in domains}
        requested_unit = payload.get("output_unit")
        if requested_unit is None:
            if len(units) != 1:
                return {
                    "status":"not_estimable","domains":domains,"primary_unit":None,"count":None,"share":None,
                    "method":"unit_guard_no_independence_product","joint_support":None,
                    "reason":f"혼합 단위 {sorted(units)}에는 output_unit과 명시적 decision-maker bridge가 필요함",
                    "required_evidence":"documented person-to-household or owner-operator-to-enterprise bridge and sensitivity range",
                    "independence_assumed":False,
                }
            requested_unit = next(iter(units))
        if requested_unit not in {"person","household","enterprise"}:
            raise ValueError("output_unit must be person, household, or enterprise")
        unit = str(requested_unit)
        semantic_conditions = payload.get("semantic_conditions",[])
        scenario_overlay = payload.get("scenario_overlay",{"low":1.0,"base":1.0,"high":1.0})
        if not isinstance(semantic_conditions,list) or not all(isinstance(value,str) and value for value in semantic_conditions):
            raise ValueError("semantic_conditions must be a list of non-empty strings")
        if set(scenario_overlay) != {"low","base","high"}:
            raise ValueError("scenario_overlay requires low/base/high")
        overlay = {key:float(scenario_overlay[key]) for key in ("low","base","high")}
        if not 0 <= overlay["low"] <= overlay["base"] <= overlay["high"] <= 1:
            raise ValueError("scenario_overlay must satisfy 0 <= low <= base <= high <= 1")
        constraints = payload.get("constraints",{})
        predicates = [f"j.{code}" for code in domain_codes]
        params: list[Any] = []
        if constraints.get("age_min") is not None:
            predicates.append("m.age >= ?"); params.append(int(constraints["age_min"]))
        if constraints.get("age_max") is not None:
            predicates.append("m.age <= ?"); params.append(int(constraints["age_max"]))
        if constraints.get("province"):
            predicates.append("m.province = ?"); params.append(str(constraints["province"]))
        if constraints.get("sex"):
            predicates.append("m.sex = ?"); params.append(str(constraints["sex"]))
        if constraints.get("family_type_contains"):
            predicates.append("m.family_type LIKE ?"); params.append(f"%{constraints['family_type_contains']}%")
        allowed_constraints = {"age_min","age_max","province","sex","family_type_contains"}
        unknown = set(constraints) - allowed_constraints
        if unknown:
            raise ValueError(f"unsupported constraints: {sorted(unknown)}")
        predicate = " AND ".join(predicates)
        con = duckdb.connect()
        try:
            row = con.execute(f"""
                WITH scored AS (
                    SELECT j.calibration_weight, ({predicate}) AS matches
                    FROM read_parquet('{JOINT_SAMPLE.as_posix()}') j
                    JOIN read_parquet('{FEATURE_MART.as_posix()}') m ON j.synthetic_person_id=m.synthetic_person_id
                )
                SELECT sum(CASE WHEN matches THEN calibration_weight ELSE 0 END),
                       sum(calibration_weight),
                       sum(CASE WHEN matches THEN 1 ELSE 0 END),
                       power(sum(calibration_weight),2)/sum(power(calibration_weight,2))
                FROM scored
            """,params).fetchone()
        finally:
            con.close()
        joint_weight,total_weight,hard_support,ess = map(float,row)
        share_base = joint_weight / total_weight
        margin = min(0.25,1.96*math.sqrt(max(share_base*(1-share_base),1e-9)/max(ess,1.0))+0.05)
        observed_joint_share = {"low":max(0.0,share_base-margin),"base":share_base,"high":min(1.0,share_base+margin)}
        share = {
            "low":observed_joint_share["low"]*overlay["low"],
            "base":observed_joint_share["base"]*overlay["base"],
            "high":observed_joint_share["high"]*overlay["high"],
        }
        control_id = {"person":"CTL-ADULT-19P-RESIDENT-2024-12","household":"CTL-HH-TOTAL-2024","enterprise":"CTL-ENT-ALL-2024"}[unit]
        baseline = repo.connection.execute("SELECT control_id,count_low,count_base,count_high,period,release_id FROM baseline_cell WHERE control_id=?", [control_id]).fetchone()
        count = {"low":float(baseline[1])*share["low"],"base":float(baseline[2])*share["base"],"high":float(baseline[3])*share["high"]}
        status = {"person":"exploratory_joint_estimate","household":"exploratory_household_decision_maker_proxy","enterprise":"exploratory_enterprise_owner_operator_proxy"}[unit]
        bridge = {
            "person":"same synthetic adult entity; no unit bridge",
            "household":"same synthetic adult is a household decision-maker proxy; official household control supplies the denominator and no one-person-to-one-household count conversion is asserted",
            "enterprise":"same synthetic adult is an owner/operator decision-maker proxy; official enterprise control supplies the denominator and no one-owner-to-one-enterprise count conversion is asserted",
        }[unit]
        return {
            "status":status,"domains":domains,"constraints":constraints,"primary_unit":unit,
            "count":count,"share":share,"joint_support":{"hard":int(hard_support),"weighted":joint_weight,"effective_sample_size":ess},
            "observed_domain_joint_share":observed_joint_share,
            "semantic_scenario":{"conditions":semantic_conditions,"overlay":overlay,"direct_joint_observation":False if semantic_conditions else True},
            "denominator":{"control_id":baseline[0],"count_base":baseline[2],"period":baseline[4],"release_id":baseline[5]},
            "method":"same-synthetic-adult weighted domain joint × explicit semantic scenario overlay; official output-unit control",
            "formula":f"{baseline[0]} × Σw·I({' AND '.join(domain_codes)} and constraints)/Σw × semantic_scenario_[low/base/high]",
            "unit_bridge":bridge,
            "independence_assumed":False,
            "dependence_assumptions":{"domain_presence":"measured jointly on the same synthetic adult","unobserved_semantic_conjunction":"explicit sensitivity scenario, not an estimated independent marginal product","unit_bridge":bridge},
            "confidence":{"population":{"grade":"E","reason":"synthetic domain-presence proxy"},"interpretation":{"grade":"D","reason":"joint observed on same synthetic entity"},"targetability":{"grade":"E","reason":"platform availability unverified"}},
            "warnings":["synthetic narratives are hypotheses, not real-person observations","minors are excluded from the calibrated joint sample",bridge,"semantic overlay is an E-grade sensitivity assumption requiring a probability sample or first-party validation"],
        }
    finally:
        repo.close()


def validate_segmentation_model(domain_code: str | None = None) -> dict[str, Any]:
    repo = Phase2Repository()
    try:
        where = "WHERE d.domain_code=? OR m.segmentation_model_id=?" if domain_code else ""
        rows = repo.connection.execute(f"""
            SELECT d.domain_code,m.segmentation_model_id,m.selected_k,m.sample_size,m.effective_sample_size,
                   m.stability_metrics_json,m.artifact_uri,m.artifact_sha256,m.membership_uri,m.membership_sha256,
                   m.feature_pipeline_json,
                   count(c.cluster_id),min(c.hard_support),sum(c.weighted_prevalence)
            FROM segmentation_model m JOIN domain_registry d USING(domain_id)
            JOIN cluster_definition c USING(segmentation_model_id) {where}
            GROUP BY ALL ORDER BY d.domain_code
        """,[domain_code,domain_code] if domain_code else []).fetchall()
        if domain_code and not rows:
            raise KeyError(f"unknown domain: {domain_code}")
        items = []
        for row in rows:
            artifact_ok = sha256_file(ROOT / row[6]) == row[7]
            membership_ok = sha256_file(ROOT / row[8]) == row[9]
            pipeline = json.loads(row[10])
            embedding = pipeline.get("semantic_embedding",{})
            embedding_path = ROOT / embedding.get("cache_uri","")
            embedding_ok = bool(embedding.get("revision") and embedding_path.is_file() and sha256_file(embedding_path) == embedding.get("cache_sha256"))
            checks = {"k_between_3_and_8":3<=row[2]<=8,"sample_support":row[3]>=900,"ess_positive":row[4]>0,"representative_cluster_support":row[12]>=25,"prevalence_reconciles":abs(row[13]-1)<1e-9,"artifact_checksum":artifact_ok,"membership_checksum":membership_ok,"semantic_embedding_checksum":embedding_ok}
            items.append({"domain_code":row[0],"model_id":row[1],"selected_k":row[2],"sample_size":row[3],"effective_sample_size":row[4],"stability_metrics":json.loads(row[5]),"semantic_embedding":embedding,"cluster_count":row[11],"checks":checks,"status":"passed" if all(checks.values()) else "failed"})
        return {"status":"passed" if all(item["status"]=="passed" for item in items) else "failed","models":len(items),"items":items}
    finally:
        repo.close()


def record_observation(payload: dict[str, Any]) -> dict[str, Any]:
    forbidden = {"name","email","phone","address","account_id","device_id","child_id"}
    if forbidden & set(payload):
        raise ValueError("personal identifiers are not accepted")
    subtype_id = payload.get("subtype_id")
    aggregate_count = int(payload.get("aggregate_count",0))
    outcome_count = float(payload.get("outcome_count",-1))
    if not subtype_id or aggregate_count <= 0 or not 0 <= outcome_count <= aggregate_count:
        raise ValueError("valid subtype_id, aggregate_count, and outcome_count are required")
    observation_type = payload.get("observation_type","other")
    allowed_types = {"impression","click","conversion","survey_classification","retention","other"}
    if observation_type not in allowed_types:
        raise ValueError("invalid observation_type")
    repo = Phase2Repository(read_only=False)
    try:
        if repo.subtype(str(subtype_id)) is None:
            raise KeyError(f"unknown subtype: {subtype_id}")
        observation_id = str(uuid.uuid4())
        bias_flags = payload.get("bias_flags",[])
        if aggregate_count < 30:
            bias_flags = [*bias_flags,"small_sample"]
        repo.connection.execute("INSERT INTO segment_observation VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            observation_id,subtype_id,datetime.now(timezone.utc).isoformat(),observation_type,aggregate_count,outcome_count,
            payload.get("soft_membership_sum"),json.dumps(payload.get("channel_context",{}),ensure_ascii=False),json.dumps(payload.get("sampling_context",{}),ensure_ascii=False),
            payload.get("consent_basis","aggregate_non_personal_measurement"),False,json.dumps(bias_flags,ensure_ascii=False),
        ])
        return {"observation_id":observation_id,"subtype_id":subtype_id,"status":"recorded","aggregate_only":True,"bias_flags":bias_flags}
    finally:
        repo.close()


def update_posterior(observation_id: str) -> dict[str, Any]:
    repo = Phase2Repository(read_only=False)
    try:
        row = repo.connection.execute("""
            SELECT o.subtype_id,o.aggregate_count,o.outcome_count,o.bias_flags_json,
                   m.weighted_prevalence_base,m.effective_sample_size
            FROM segment_observation o JOIN subtype_membership_summary m USING(subtype_id)
            WHERE o.observation_id=?
        """,[observation_id]).fetchone()
        if row is None:
            raise KeyError(f"unknown observation: {observation_id}")
        subtype_id,n,outcomes,bias_json,prior_mean,prior_ess = row
        strength = min(100.0,max(20.0,math.sqrt(float(prior_ess))))
        alpha = 1.0 + float(prior_mean)*strength
        beta = 1.0 + (1.0-float(prior_mean))*strength
        posterior_alpha = alpha + float(outcomes)
        posterior_beta = beta + float(n)-float(outcomes)
        posterior_mean = posterior_alpha/(posterior_alpha+posterior_beta)
        low,high = beta_distribution.ppf([0.025,0.975],posterior_alpha,posterior_beta)
        bias_flags = json.loads(bias_json)
        status = "held_for_review" if bias_flags or n < 30 else "accepted"
        update_id = str(uuid.uuid4())
        diagnostics = {"prior_strength_capped":strength,"aggregate_count":n,"bias_flags":bias_flags,"published_model_unchanged":True,"requires_human_review":status!="accepted"}
        repo.connection.execute("INSERT INTO posterior_update VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            update_id,subtype_id,observation_id,json.dumps({"alpha":alpha,"beta":beta},ensure_ascii=False),
            json.dumps({"family":"beta_binomial","successes":outcomes,"trials":n},ensure_ascii=False),
            json.dumps({"alpha":posterior_alpha,"beta":posterior_beta},ensure_ascii=False),posterior_mean,float(low),float(high),
            json.dumps(diagnostics,ensure_ascii=False),status,PHASE2_VERSION,"feedback-service",
        ])
        return {"posterior_update_id":update_id,"subtype_id":subtype_id,"status":status,"prior":{"mean":prior_mean,"alpha":alpha,"beta":beta},"posterior":{"mean":posterior_mean,"low":float(low),"high":float(high),"alpha":posterior_alpha,"beta":posterior_beta},"diagnostics":diagnostics}
    finally:
        repo.close()


def update_subtype_posterior(*, subtype_id: str | None = None, parent_archetype_id: str | None = None) -> dict[str, Any]:
    if (subtype_id is None) == (parent_archetype_id is None):
        raise ValueError("provide exactly one subtype_id or parent_archetype_id")
    repo = Phase2Repository()
    try:
        if subtype_id:
            row = repo.connection.execute("SELECT observation_id FROM segment_observation WHERE subtype_id=? ORDER BY observed_at DESC LIMIT 1", [subtype_id]).fetchone()
        else:
            row = repo.connection.execute("""
                SELECT o.observation_id FROM segment_observation o
                JOIN subtype_allocation a USING(subtype_id)
                WHERE a.phase1_archetype_id=? ORDER BY o.observed_at DESC LIMIT 1
            """, [parent_archetype_id]).fetchone()
        if row is None:
            raise KeyError("no aggregate observation available for the requested subtype or parent")
        observation_id = row[0]
    finally:
        repo.close()
    return update_posterior(observation_id)
