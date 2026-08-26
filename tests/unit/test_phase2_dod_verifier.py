from __future__ import annotations

import json
from pathlib import Path

import pytest

from market_engine.phase2_dod_verifier import Phase2DodVerifier, verify_phase2_dod


ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data/processed/market_engine_phase2.duckdb"


def _successful_command_results() -> dict[str, dict[str, object]]:
    manifest = json.loads((ROOT / "config/nemotron_manifest.yml").read_text(encoding="utf-8"))
    checksum_payload = {
        "dataset": manifest["dataset"],
        "version": manifest["version"],
        "license": manifest["license"],
        "files": [
            {**row, "actual": row["sha256"], "ok": True, "bytes": 1}
            for row in manifest["shards"]
        ],
        "all_checksums_ok": True,
    }
    return {
        "pytest": {
            "command": str(ROOT / ".venv/bin/pytest"),
            "exit_code": 0,
            "stdout": "20 passed, 2 skipped",
            "stderr": "",
            "passed": True,
        },
        "combined_validation": {
            "command": f"{ROOT / '.venv/bin/market-engine'} validate",
            "exit_code": 0,
            "stdout": json.dumps({"status": "passed", "passed": 46, "total": 46}),
            "stderr": "",
            "passed": True,
        },
        "nemotron_checksums": {
            "command": f"{ROOT / '.venv/bin/market-engine'} verify-nemotron",
            "exit_code": 0,
            "stdout": json.dumps(checksum_payload),
            "stderr": "",
            "passed": True,
        },
        "postgres_migrations": {
            "command": str(ROOT / "scripts/test_postgres.sh"),
            "exit_code": 0,
            "stdout": (
                "PostgreSQL migrations passed: Phase 1=30 tables (signature), "
                "additive total=58 tables, workbench total=90 tables/12 views"
            ),
            "stderr": "",
            "passed": True,
        },
    }


@pytest.fixture(scope="module")
def live_phase2_audit() -> dict[str, object]:
    return verify_phase2_dod(
        root=ROOT,
        db_path=DB_PATH,
        command_results=_successful_command_results(),
    )


def test_live_phase2_dod_recomputes_all_thirty_items(live_phase2_audit: dict[str, object]) -> None:
    items = live_phase2_audit["items"]
    assert isinstance(items, list)
    assert [item["id"] for item in items] == list(range(1, 31))
    assert live_phase2_audit["passed"] == 29
    assert live_phase2_audit["failed"] == 0
    assert live_phase2_audit["unavailable"] == 1

    item_by_id = {item["id"]: item for item in items}
    assert item_by_id[1]["status"] == "passed"
    assert item_by_id[26]["status"] == "passed"
    assert item_by_id[2]["status"] == "unavailable"
    unavailable = [proof for proof in item_by_id[2]["proofs"] if proof["status"] == "unavailable"]
    assert unavailable[0]["name"] == "direct_acquisition_execution"
    assert "cannot establish who supplied" in unavailable[0]["reason"]


def test_acquisition_evidence_is_explicitly_caller_supplied() -> None:
    commands = _successful_command_results()
    commands["nemotron_acquisition"] = {
        "command": str(ROOT / "scripts/fetch_sources.sh"),
        "exit_code": 0,
        "passed": True,
    }
    verifier = Phase2DodVerifier(root=ROOT, db_path=DB_PATH, command_results=commands)
    proofs, _ = verifier._item_02()
    assert all(proof["status"] == "passed" for proof in proofs)


def test_missing_executable_results_are_unavailable_not_assumed_passed() -> None:
    verifier = Phase2DodVerifier(root=ROOT, db_path=DB_PATH, command_results={})
    proofs, _ = verifier._item_28()
    assert {proof["name"] for proof in proofs if proof["status"] == "unavailable"} == {
        "full_python_test_suite",
        "combined_model_validation_command",
        "combined_validation_payload",
        "artifact_checksum_command",
        "postgres_migration_test",
    }

