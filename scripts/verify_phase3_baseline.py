#!/usr/bin/env python3
"""Re-run and record the immutable Phase 1–2 baseline before web-app work."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
from jsonschema import Draft202012Validator
from market_engine.phase2_dod_verifier import verify_phase2_dod


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data/processed/market_engine_phase2.duckdb"
REPORT_JSON = ROOT / "reports/phase3_baseline_verification.json"
REPORT_MD = ROOT / "reports/phase3_baseline_verification.md"


def run(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    return {
        "command": " ".join(command),
        "exit_code": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "passed": result.returncode == 0,
    }


def scalar(con: duckdb.DuckDBPyConnection, query: str) -> Any:
    return con.execute(query).fetchone()[0]


def live_metrics() -> dict[str, Any]:
    con = duckdb.connect(str(DB_PATH), read_only=True)
    try:
        return {
            "phase1_archetypes": scalar(con, "SELECT count(*) FROM archetype"),
            "domains": scalar(con, "SELECT count(*) FROM domain_registry WHERE active"),
            "axes": scalar(con, "SELECT count(*) FROM domain_dimension"),
            "features": scalar(con, "SELECT count(*) FROM domain_feature"),
            "behaviors": scalar(con, "SELECT count(*) FROM domain_behavior_template"),
            "segmentation_models": scalar(con, "SELECT count(*) FROM segmentation_model"),
            "primary_subtypes": scalar(con, "SELECT count(*) FROM subtype_definition"),
            "parent_allocations": scalar(con, "SELECT count(*) FROM subtype_allocation"),
            "activation_payloads": scalar(con, "SELECT count(*) FROM activation_mapping"),
            "max_parent_share_error": scalar(
                con,
                "SELECT max(abs(total_share - 1)) FROM "
                "(SELECT phase1_archetype_id, sum(share_base) total_share "
                "FROM subtype_allocation GROUP BY 1)",
            ),
            "max_parent_count_relative_error": scalar(
                con,
                "SELECT max(abs(a.child_count-p.count_base)/p.count_base) "
                "FROM (SELECT phase1_archetype_id,sum(count_base) child_count "
                "FROM subtype_allocation GROUP BY 1) a "
                "JOIN phase2_parent_estimate p USING(phase1_archetype_id)",
            ),
        }
    finally:
        con.close()


def raw_row_count() -> dict[str, int]:
    con = duckdb.connect()
    try:
        rows, unique_ids = con.execute(
            "SELECT count(*), count(DISTINCT uuid) "
            "FROM read_parquet('data/raw/nemotron/*.parquet')"
        ).fetchone()
        return {"rows": rows, "unique_ids": unique_ids}
    finally:
        con.close()


def validate_activation_payloads() -> dict[str, Any]:
    schema = json.loads((ROOT / "contracts/phase2_activation_payload.schema.json").read_text())
    validator = Draft202012Validator(schema)
    con = duckdb.connect(str(DB_PATH), read_only=True)
    failures: list[dict[str, Any]] = []
    try:
        rows = con.execute(
            "SELECT subtype_id,activation_payload_json FROM activation_mapping ORDER BY subtype_id"
        ).fetchall()
        for subtype_id, payload in rows:
            value = json.loads(payload) if isinstance(payload, str) else payload
            errors = sorted(validator.iter_errors(value), key=lambda item: list(item.path))
            if errors:
                failures.append({"subtype_id": subtype_id, "errors": [e.message for e in errors]})
    finally:
        con.close()
    return {"total": len(rows), "valid": len(rows) - len(failures), "failures": failures}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-postgres", action="store_true")
    args = parser.parse_args()

    pytest_result = run([str(ROOT / ".venv/bin/pytest")])
    validation_result = run([str(ROOT / ".venv/bin/market-engine"), "validate"])
    checksum_result = run([str(ROOT / ".venv/bin/market-engine"), "verify-nemotron"])
    postgres_result = (
        {"command": "./scripts/test_postgres.sh", "passed": None, "skipped": True}
        if args.skip_postgres
        else run([str(ROOT / "scripts/test_postgres.sh")])
    )

    validation_payload = json.loads(validation_result["stdout"]) if validation_result["passed"] else {}
    checksum_payload = json.loads(checksum_result["stdout"]) if checksum_result["passed"] else {}
    command_results = {
        "pytest": pytest_result,
        "combined_validation": validation_result,
        "nemotron_checksums": checksum_result,
        "postgres_migrations": postgres_result,
    }
    phase2_audit = verify_phase2_dod(
        root=ROOT,
        db_path=DB_PATH,
        command_results=command_results,
    )
    metrics = live_metrics()
    nemotron = raw_row_count()
    activation = validate_activation_payloads()
    pytest_match = re.search(r"(\d+) passed", pytest_result["stdout"])
    postgres_match = re.search(r"Phase 1=(\d+) tables .* additive total=(\d+) tables", postgres_result.get("stdout", ""))

    expected = {
        "phase1_archetypes": 1440,
        "domains": 24,
        "axes": 384,
        "features": 480,
        "behaviors": 240,
        "segmentation_models": 24,
        "primary_subtypes": 90,
        "parent_allocations": 450,
        "activation_payloads": 90,
    }
    metric_checks = {key: metrics[key] == value for key, value in expected.items()}
    checks = {
        "phase2_dod_30_of_30": phase2_audit.get("status") == "passed"
        and phase2_audit.get("passed") == phase2_audit.get("total") == 30,
        "existing_tests_minimum_18_passed": pytest_result["passed"]
        and pytest_match is not None
        and int(pytest_match.group(1)) >= 18,
        "combined_validation_46_of_46": validation_result["passed"] and validation_payload.get("passed") == validation_payload.get("total") == 46,
        "postgres_phase1_30_additive_58_idempotent": not args.skip_postgres and (
            postgres_result["passed"] and postgres_match is not None and postgres_match.groups() == ("30", "58")
        ),
        "fixed_shard_checksums_9_of_9": checksum_result["passed"]
        and checksum_payload.get("all_checksums_ok") is True
        and len(checksum_payload.get("files", [])) == 9,
        "nemotron_rows_1m": nemotron == {"rows": 1_000_000, "unique_ids": 1_000_000},
        "activation_schema_90_of_90": activation["total"] == activation["valid"] == 90,
        "parent_base_share_within_phase2_tolerance": metrics["max_parent_share_error"] <= 0.001,
        "parent_count_within_phase2_tolerance": metrics["max_parent_count_relative_error"] <= 0.005,
        **{f"metric_{key}": passed for key, passed in metric_checks.items()},
    }
    status = "passed" if all(checks.values()) else "failed"
    generated_at = datetime.now(timezone.utc).isoformat()
    report = {
        "generated_at": generated_at,
        "status": status,
        "phase2_model_version": phase2_audit.get("model_version"),
        "checks": checks,
        "phase2_dod": phase2_audit,
        "metrics": {**metrics, "nemotron_rows": nemotron["rows"], "nemotron_unique_ids": nemotron["unique_ids"]},
        "activation_schema": activation,
        "commands": {
            "pytest": pytest_result,
            "combined_validation": validation_result,
            "nemotron_checksums": checksum_result,
            "postgres_migrations": postgres_result,
        },
    }
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

    lines = [
        "# Phase 3 baseline verification",
        "",
        f"Generated: {generated_at}",
        f"Result: **{status.upper()}**",
        "",
        "This report re-verifies the immutable Phase 1–2 production baseline before Phase 3–7 web-app changes.",
        "The Phase 2 DoD result is calculated live; `reports/phase2_dod_audit.json` is not an input.",
        "",
        "| Check | Expected | Actual | Status |",
        "|---|---:|---:|:---:|",
        f"| Phase 2 DoD | 30 | {phase2_audit.get('passed')} passed, {phase2_audit.get('failed')} failed, {phase2_audit.get('unavailable')} unavailable | {'PASS' if checks['phase2_dod_30_of_30'] else 'FAIL'} |",
        f"| Existing pytest | >=18 | {pytest_match.group(1) if pytest_match else 'unknown'} | {'PASS' if checks['existing_tests_minimum_18_passed'] else 'FAIL'} |",
        f"| Combined validation | 46 | {validation_payload.get('passed', 'unknown')} | {'PASS' if checks['combined_validation_46_of_46'] else 'FAIL'} |",
        f"| PostgreSQL tables | 58 | {postgres_match.group(2) if postgres_match else 'skipped/unknown'} | {'PASS' if checks['postgres_phase1_30_additive_58_idempotent'] else 'FAIL'} |",
        f"| Nemotron rows | 1,000,000 | {nemotron['rows']:,} | {'PASS' if checks['nemotron_rows_1m'] else 'FAIL'} |",
        f"| Fixed shards | 9 | {len(checksum_payload.get('files', []))} | {'PASS' if checks['fixed_shard_checksums_9_of_9'] else 'FAIL'} |",
        f"| Domain | 24 | {metrics['domains']} | {'PASS' if metric_checks['domains'] else 'FAIL'} |",
        f"| Axis | 384 | {metrics['axes']} | {'PASS' if metric_checks['axes'] else 'FAIL'} |",
        f"| Feature | 480 | {metrics['features']} | {'PASS' if metric_checks['features'] else 'FAIL'} |",
        f"| Behavior | 240 | {metrics['behaviors']} | {'PASS' if metric_checks['behaviors'] else 'FAIL'} |",
        f"| Segmentation model | 24 | {metrics['segmentation_models']} | {'PASS' if metric_checks['segmentation_models'] else 'FAIL'} |",
        f"| Primary subtype | 90 | {metrics['primary_subtypes']} | {'PASS' if metric_checks['primary_subtypes'] else 'FAIL'} |",
        f"| Parent allocation | 450 | {metrics['parent_allocations']} | {'PASS' if metric_checks['parent_allocations'] else 'FAIL'} |",
        f"| Phase 1 archetype | 1,440 | {metrics['phase1_archetypes']:,} | {'PASS' if metric_checks['phase1_archetypes'] else 'FAIL'} |",
        f"| Activation JSON | 90 | {activation['valid']} | {'PASS' if checks['activation_schema_90_of_90'] else 'FAIL'} |",
        "",
        "## Reconciliation",
        "",
        f"- Maximum parent Base-share error: `{metrics['max_parent_share_error']:.17g}` (limit `0.001`).",
        f"- Maximum parent/child Base-count relative error: `{metrics['max_parent_count_relative_error']:.17g}` (limit `0.005`).",
        "- Existing rows and model versions were read only; this verifier performs no baseline mutation.",
        "",
        "## Live Phase 2 Definition of Done",
        "",
        "| # | Requirement | Status | Deterministic proof details |",
        "|---:|---|:---:|---|",
    ]
    for item in phase2_audit["items"]:
        proof_details = "; ".join(
            f"{proof['name']}={proof['status'].upper()}"
            + (f" ({proof['reason']})" if proof.get("reason") else "")
            for proof in item["proofs"]
        ).replace("|", "\\|")
        lines.append(
            f"| {item['id']} | {item['title']} | {item['status'].upper()} | {proof_details} |"
        )
    lines.append("")
    REPORT_MD.write_text("\n".join(lines))
    print(json.dumps({"status": status, "report_json": str(REPORT_JSON.relative_to(ROOT)), "report_markdown": str(REPORT_MD.relative_to(ROOT)), "checks_passed": sum(checks.values()), "checks_total": len(checks)}, ensure_ascii=False, indent=2))
    if status != "passed":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
