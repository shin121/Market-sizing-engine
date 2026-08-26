from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
from jsonschema import Draft202012Validator

from .io import canonical_json
from .paths import PROCESSED_DIR, REPORT_DIR, ROOT
from .phase2 import PHASE2_DB, PHASE2_VERSION
from .phase2_cases import CROSS_CASES, REQUIRED_PARENT_CASES
from .phase2_services import (
    decompose_required_parent_case, estimate_cross_domain_segment, estimate_domain_segment,
    get_targetability, update_posterior, validate_segmentation_model,
)


def _top_axis_condition(con: duckdb.DuckDBPyConnection, domain_id: str) -> tuple[str, Any]:
    row = con.execute("SELECT feature_pipeline_json,membership_uri FROM segmentation_model WHERE domain_id=?", [domain_id]).fetchone()
    pipeline = json.loads(row[0])
    names = pipeline["domain_axis_features"]
    membership_path = ROOT / row[1]
    query = "SELECT " + ",".join(f"sum(calibration_weight*axis_{idx:03d})" for idx in range(1,len(names)+1)) + f" FROM read_parquet('{membership_path.as_posix()}')"
    sums = duckdb.connect().execute(query).fetchone()
    best = max(range(len(names)),key=lambda idx:float(sums[idx] or 0))
    feature_code,value = names[best].split("=",1)
    return feature_code,value


def _insert_result(con: duckdb.DuckDBPyConnection, *, case_id: str, case_type: str, domain_id: str | None, parent_id: str | None, description: str, query: dict[str, Any], result: dict[str, Any], status: str, executed_at: str) -> None:
    con.execute("INSERT OR REPLACE INTO phase2_acceptance_result VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        case_id,case_type,domain_id,parent_id,description,canonical_json(query),canonical_json(result),status,executed_at,PHASE2_VERSION,"phase2-acceptance",
    ])


def run_phase2_acceptance() -> dict[str, Any]:
    executed_at = datetime.now(timezone.utc).isoformat()
    con = duckdb.connect(str(PHASE2_DB))
    domain_results: list[dict[str, Any]] = []
    parent_results: list[dict[str, Any]] = []
    cross_results: list[dict[str, Any]] = []
    try:
        domains = con.execute("SELECT domain_id,domain_code FROM domain_registry WHERE active ORDER BY domain_id").fetchall()
        for domain_id,domain_code in domains:
            parent_id = con.execute("SELECT phase1_archetype_id FROM parent_decomposition_decision WHERE domain_id=? AND decision='eligible' ORDER BY phase1_archetype_id LIMIT 1", [domain_id]).fetchone()[0]
            feature_code,value = _top_axis_condition(con,domain_id)
            query = {"domain_code":domain_code,"conditions":[{"feature_code":feature_code,"value":value}],"parent_archetype_id":parent_id}
            try:
                result = estimate_domain_segment(domain_code,query["conditions"],parent_archetype_id=parent_id)
                passed = result["status"] == "exploratory_parent_conditional_estimate" and result["count"]["low"] <= result["count"]["base"] <= result["count"]["high"] and result["positive_hard_support"] > 0
                status = "passed" if passed else "failed"
            except Exception as exc:  # stored so one case does not hide the rest of the audit
                result = {"error":str(exc)}
                status = "failed"
            case_id = f"DOMAIN-{domain_id}"
            _insert_result(con,case_id=case_id,case_type="domain",domain_id=domain_id,parent_id=parent_id,description=f"{domain_code} domain-specific axis acceptance",query=query,result=result,status=status,executed_at=executed_at)
            domain_results.append({"case_id":case_id,"domain_code":domain_code,"status":status,"query":query,"result":result})

        for case in REQUIRED_PARENT_CASES:
            case_id, description, domain_code = case["case_id"], case["description"], case["domain_code"]
            domain_id = con.execute("SELECT domain_id FROM domain_registry WHERE domain_code=?", [domain_code]).fetchone()[0]
            result = decompose_required_parent_case(case_id)
            parent_id = result.get("linked_phase1_archetype_id")
            subtype_count = len(result.get("subtypes",[]))
            passed = (
                3 <= subtype_count <= 8
                and result["reconciliation"]["relative_error"] <= 0.005
                and abs(result["reconciliation"]["share_base_sum"]-1) <= 0.001
                and result["conditioning_hard_support"] > 0
                and result["count_low"] <= result["count_base"] <= result["count_high"]
            )
            status = "passed" if passed else "failed"
            query = {
                "required_case":description,
                "query_parent_case_id":case_id,
                "semantic_mapping":"exact_query_definition",
                "population_evidence_status":result["evidence_status"],
                "linked_phase1_parent":parent_id,
            }
            _insert_result(con,case_id=case_id,case_type="parent",domain_id=domain_id,parent_id=parent_id,description=description,query=query,result=result,status=status,executed_at=executed_at)
            parent_results.append({"case_id":case_id,"description":description,"status":status,"query":query,"result":result})

        for case in CROSS_CASES:
            case_id, description, domain_codes, constraints = case["case_id"], case["description"], case["domains"], case["constraints"]
            query = {
                "domains":domain_codes,
                "constraints":constraints,
                "output_unit":case["output_unit"],
                "semantic_conditions":case["semantic_conditions"],
                "scenario_overlay":case["scenario_overlay"],
            }
            result = estimate_cross_domain_segment(query)
            if result["status"] == "not_estimable":
                passed = result.get("independence_assumed") is False and result.get("count") is None and "unit" in result.get("method","")
                status = "safe_not_estimable" if passed else "failed"
            else:
                passed = (
                    result["count"]["low"] <= result["count"]["base"] <= result["count"]["high"]
                    and result["joint_support"]["hard"] > 0
                    and result["independence_assumed"] is False
                    and result["semantic_scenario"]["conditions"] == case["semantic_conditions"]
                    and result["dependence_assumptions"]["unobserved_semantic_conjunction"].startswith("explicit sensitivity")
                )
                status = "passed" if passed else "failed"
            first_domain_id = con.execute("SELECT domain_id FROM domain_registry WHERE domain_code=?", [domain_codes[0]]).fetchone()[0]
            _insert_result(con,case_id=case_id,case_type="cross_domain",domain_id=first_domain_id,parent_id=None,description=description,query=query,result=result,status=status,executed_at=executed_at)
            cross_results.append({"case_id":case_id,"description":description,"status":status,"query":query,"result":result})

        activation_rows = con.execute("SELECT subtype_id,activation_payload_json FROM activation_mapping ORDER BY subtype_id").fetchall()
        activation_failures = []
        schema_path = ROOT / "contracts/phase2_activation_payload.schema.json"
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        validator = Draft202012Validator(schema)
        required = {"schema_version","subtype_id","domain_code","entity_unit","targetability_class","platform_claim_status","audience_definition","creative","measurement","warnings"}
        allowed_targetability = {"directly_targetable","proxy_targetable","contextual_only","first_party_data_required","creative_only","not_allowed"}
        for subtype_id,payload_json in activation_rows:
            payload = json.loads(payload_json)
            schema_errors = list(validator.iter_errors(payload))
            if schema_errors or not required <= set(payload) or payload.get("targetability_class") not in allowed_targetability or payload.get("platform_claim_status") != "unverified_do_not_claim" or payload.get("audience_definition",{}).get("exclude_sensitive_inference") is not True:
                activation_failures.append(subtype_id)
        activation_result = {"payloads":len(activation_rows),"failures":activation_failures,"schema":"contracts/phase2_activation_payload.schema.json","schema_draft":"2020-12","schema_valid":True}
        _insert_result(con,case_id="ACTIVATION-01",case_type="activation",domain_id=None,parent_id=None,description="all subtype activation payload contract validation",query={"schema":activation_result["schema"]},result=activation_result,status="passed" if not activation_failures else "failed",executed_at=executed_at)

        feedback_row = con.execute("SELECT observation_id FROM segment_observation ORDER BY observed_at DESC LIMIT 1").fetchone()
        posterior_row = con.execute("SELECT posterior_update_id,update_status,diagnostics_json FROM posterior_update ORDER BY rowid DESC LIMIT 1").fetchone()
        feedback_result = {"observation_id":feedback_row[0] if feedback_row else None,"posterior_update_id":posterior_row[0] if posterior_row else None,"update_status":posterior_row[1] if posterior_row else None,"diagnostics":json.loads(posterior_row[2]) if posterior_row else None}
        feedback_passed = feedback_row is not None and posterior_row is not None and feedback_result["diagnostics"].get("published_model_unchanged") is True
        _insert_result(con,case_id="FEEDBACK-01",case_type="feedback",domain_id="DOM-01",parent_id=None,description="aggregate observation and conservative posterior update",query={"aggregate_only":True},result=feedback_result,status="passed" if feedback_passed else "failed",executed_at=executed_at)

        for domain_id,_ in domains:
            count = con.execute("SELECT count(*) FROM phase2_acceptance_result WHERE domain_id=? AND case_type='domain' AND status='passed'", [domain_id]).fetchone()[0]
            con.execute("UPDATE domain_coverage_audit SET acceptance_count=?,coverage_score=CASE WHEN ?>0 THEN 1.0 ELSE coverage_score END,gaps_json=CASE WHEN ?>0 THEN '[]' ELSE gaps_json END WHERE domain_id=?", [count,count,count,domain_id])
        con.execute("CHECKPOINT")
        table_dir = PROCESSED_DIR / "phase2/tables"
        con.execute(f"COPY phase2_acceptance_result TO '{(table_dir/'phase2_acceptance_result.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
        con.execute(f"COPY domain_coverage_audit TO '{(table_dir/'domain_coverage_audit.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    finally:
        con.close()

    model_validation = validate_segmentation_model()
    summary = {
        "executed_at":executed_at,"model_version":PHASE2_VERSION,
        "domain":{"total":len(domain_results),"passed":sum(r["status"]=="passed" for r in domain_results),"failed":sum(r["status"]=="failed" for r in domain_results)},
        "parent":{"total":len(parent_results),"passed":sum(r["status"]=="passed" for r in parent_results),"failed":sum(r["status"]=="failed" for r in parent_results),"semantic_query_definitions":sum(r["query"]["semantic_mapping"]=="exact_query_definition" for r in parent_results),"exploratory_population_cases":sum(r["result"]["population_confidence_grade"]=="E" for r in parent_results)},
        "cross_domain":{"total":len(cross_results),"estimated_passed":sum(r["status"]=="passed" for r in cross_results),"safely_not_estimable":sum(r["status"]=="safe_not_estimable" for r in cross_results),"failed":sum(r["status"]=="failed" for r in cross_results)},
        "activation":activation_result,"feedback":feedback_result,"segmentation_validation":model_validation["status"],
        "status":"passed" if all(r["status"]=="passed" for r in domain_results+parent_results) and all(r["status"] in {"passed","safe_not_estimable"} for r in cross_results) and not activation_failures and feedback_passed and model_validation["status"]=="passed" else "failed",
        "limitations":["parent cases 2–10 are exact semantic query definitions but use disclosed E-grade scenario parent prevalence until official joint evidence exists","cross-domain semantics not jointly observed in Nemotron use explicit Low/Base/High scenario overlays and documented household/enterprise decision-maker bridges"],
    }
    REPORT_DIR.mkdir(parents=True,exist_ok=True)
    report_json = REPORT_DIR / "phase2_acceptance_results.json"
    report_json.write_text(json.dumps({"summary":summary,"domain_cases":domain_results,"parent_cases":parent_results,"cross_domain_cases":cross_results},ensure_ascii=False,indent=2),encoding="utf-8")
    report_md = REPORT_DIR / "phase2_acceptance_summary.md"
    report_md.write_text("\n".join([
        "# Phase 2 acceptance summary","",f"Executed: {executed_at}","",
        f"- Overall: **{summary['status']}**",f"- Domain cases: {summary['domain']}",f"- Parent cases: {summary['parent']}",
        f"- Cross-domain cases: {summary['cross_domain']}",f"- Activation payloads: {activation_result['payloads']} ({len(activation_failures)} failures)",
        f"- Segmentation validation: {model_validation['status']}","","## Honest limitations","",
        "- Required parent cases 2–10 are semantically exact query definitions with explicit E-grade scenario prevalence; they are not official joint estimates.",
        "- Cross-domain unobserved semantics use explicit E-grade sensitivity overlays; household/enterprise results use documented decision-maker proxies rather than one-to-one unit conversion.","",
    ]),encoding="utf-8")
    return {"summary":summary,"report_json":str(report_json.relative_to(ROOT)),"report_markdown":str(report_md.relative_to(ROOT))}
