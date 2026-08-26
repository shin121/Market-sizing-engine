"""Read-only, itemized verification of the Phase 2 Definition of Done.

The historical ``reports/phase2_dod_audit.json`` file is deliberately not an
input.  Every item below is evaluated from the current DuckDB/Parquet/export
artifacts and from command results explicitly supplied by the caller.  A
missing command result is ``unavailable`` rather than an assumed pass.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any, Literal

import duckdb
from jsonschema import Draft202012Validator


ProofStatus = Literal["passed", "failed", "unavailable"]
CommandResult = Mapping[str, Any]


AXIS_CODES = {
    "object",
    "format",
    "occasion",
    "location",
    "frequency_intensity",
    "discovery",
    "acquisition_access",
    "consumption_mode",
    "device_channel_platform",
    "payment_monetization",
    "decision_unit",
    "engagement_participation",
    "motivation_job",
    "barrier_risk_trust",
    "loyalty_switching",
    "spending_value",
}

MANDATORY_DOMAIN_CODES = {
    "music_audio",
    "video_ott",
    "gaming_esports",
    "reading_webtoon",
    "culture_events",
    "grocery_home_meals",
    "dining_delivery_cafe",
    "fashion_resale",
    "beauty_personal_care",
    "travel_hospitality",
    "sports_outdoor",
    "hobbies_creation",
    "pets",
    "housing_home_services",
    "mobility_automotive",
    "education_learning",
    "parenting_childcare",
    "health_wellness_care",
    "finance_insurance",
    "senior_retirement_care",
    "digital_devices_ai",
    "social_creator",
    "career_professional",
    "small_business_digital",
}

EXPECTED_PHASE2_TABLES = (
    "domain_registry",
    "domain_dimension",
    "domain_feature",
    "domain_feature_source",
    "domain_behavior_template",
    "domain_tag",
    "domain_profile_summary",
    "domain_association",
    "domain_coverage_audit",
    "archetype_hierarchy",
    "latent_dimension",
    "segmentation_model",
    "cluster_definition",
    "cluster_representative",
    "subtype_definition",
    "parent_decomposition_decision",
    "phase2_parent_estimate",
    "subtype_allocation",
    "required_parent_case",
    "required_parent_case_allocation",
    "subtype_membership_summary",
    "subtype_profile",
    "subtype_confidence",
    "subtype_tag_allocation",
    "activation_mapping",
    "segment_observation",
    "posterior_update",
    "phase2_acceptance_result",
)

EXPECTED_EXPORTS = {
    "phase2_domains.csv",
    "phase2_dimensions.csv",
    "phase2_features.csv",
    "phase2_behaviors.csv",
    "phase2_model_registry.csv",
    "phase2_subtypes.csv",
    "phase2_parent_allocations.csv",
    "phase2_required_parent_cases.csv",
    "phase2_required_parent_case_allocations.csv",
    "phase2_subtype_confidence.csv",
    "phase2_domain_associations.csv",
    "phase2_acceptance_results.csv",
    "phase2_subtype_profiles.jsonl",
    "phase2_activation_profiles.jsonl",
    "phase2_models.jsonl",
}

ITEM_TITLES = {
    1: "Phase 1 engine and tests preserved",
    2: "Nemotron accessed without user file provision",
    3: "Raw/canonical revision and checksums stored",
    4: "18–25 domains and required-area mapping",
    5: "All domains have 16 common-axis decisions",
    6: "All domains have taxonomy, features, behaviors, and source maps",
    7: "Every domain meets minimum depth or an explicit evidence constraint",
    8: "No demographic-only domain is marked complete",
    9: "Latent dimensions and segmentation model registry exist",
    10: "Music/audio and small-business vertical slices work",
    11: "Additive migration passes clean/existing/idempotent paths",
    12: "Eligibility is stored for every Phase 1 parent",
    13: "Eligible parents have 3–8 primary subtypes or an exception",
    14: "Primary Base allocations reconcile to parents",
    15: "Overlapping tags are separate and non-additive",
    16: "Every subtype has Low/Base/High and an explicit unit",
    17: "Every subtype has three confidence assessments",
    18: "Every subtype has evidence, assumptions, gaps, and disclosure",
    19: "Every active subtype has an activation profile",
    20: "At least one end-to-end acceptance case passes per domain",
    21: "At least ten parent decomposition acceptance cases pass",
    22: "At least ten cross-domain acceptance cases pass safely",
    23: "Cross-domain joint support and dependence assumptions are stored",
    24: "Activation contract and creative brief work",
    25: "Aggregate observation and posterior example executed safely",
    26: "Required machine-readable Phase 2 exports exist",
    27: "Coverage and association reports match current rows",
    28: "Required test and validation classes pass",
    29: "Operator documentation covers required workflows",
    30: "No placeholder-only Phase 2 feature or data remains",
}


def _json_value(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _proof(
    name: str,
    passed: bool | None,
    *,
    expected: Any = None,
    actual: Any = None,
    reason: str | None = None,
) -> dict[str, Any]:
    status: ProofStatus = "unavailable" if passed is None else "passed" if passed else "failed"
    value: dict[str, Any] = {"name": name, "status": status}
    if expected is not None:
        value["expected"] = expected
    if actual is not None:
        value["actual"] = actual
    if reason:
        value["reason"] = reason
    return value


def _item(item_id: int, proofs: Sequence[dict[str, Any]], evidence: Sequence[str]) -> dict[str, Any]:
    statuses = {proof["status"] for proof in proofs}
    if "failed" in statuses:
        status: ProofStatus = "failed"
    elif "unavailable" in statuses:
        status = "unavailable"
    else:
        status = "passed"
    return {
        "id": item_id,
        "title": ITEM_TITLES[item_id],
        "status": status,
        "passed": status == "passed",
        "evidence": list(evidence),
        "proofs": list(proofs),
    }


class Phase2DodVerifier:
    """Evaluate the 30 Phase 2 DoD items without mutating source artifacts."""

    def __init__(
        self,
        *,
        root: Path,
        db_path: Path,
        command_results: Mapping[str, CommandResult] | None = None,
    ) -> None:
        self.root = root.resolve()
        self.db_path = db_path.resolve()
        self.phase1_db_path = self.root / "data/processed/market_engine.duckdb"
        self.command_results = dict(command_results or {})
        self.con: duckdb.DuckDBPyConnection | None = None

    def verify(self) -> dict[str, Any]:
        if not self.db_path.is_file():
            items = [
                _item(
                    item_id,
                    [_proof("phase2_database", None, reason=f"missing current DuckDB: {self.db_path}")],
                    [str(self.db_path)],
                )
                for item_id in range(1, 31)
            ]
            return self._report(items)

        self.con = duckdb.connect(str(self.db_path), read_only=True)
        self.con.execute("SET enable_progress_bar=false")
        try:
            evaluators: list[Callable[[], tuple[list[dict[str, Any]], list[str]]]] = [
                getattr(self, f"_item_{item_id:02d}") for item_id in range(1, 31)
            ]
            items: list[dict[str, Any]] = []
            for item_id, evaluator in enumerate(evaluators, start=1):
                try:
                    proofs, evidence = evaluator()
                except Exception as exc:  # one unreadable artifact must not hide the remaining 29 results
                    proofs = [
                        _proof(
                            "item_evaluation",
                            None,
                            reason=f"{type(exc).__name__}: {exc}",
                        )
                    ]
                    evidence = []
                items.append(_item(item_id, proofs, evidence))
            return self._report(items)
        finally:
            self.con.close()
            self.con = None

    @staticmethod
    def _report(items: Sequence[dict[str, Any]]) -> dict[str, Any]:
        passed = sum(item["status"] == "passed" for item in items)
        failed = sum(item["status"] == "failed" for item in items)
        unavailable = sum(item["status"] == "unavailable" for item in items)
        versions = sorted(
            {
                str(proof["actual"])
                for item in items
                for proof in item["proofs"]
                if proof["name"] == "single_model_version" and proof["status"] == "passed"
            }
        )
        return {
            "status": "passed" if passed == len(items) == 30 else "failed",
            "passed": passed,
            "failed": failed,
            "unavailable": unavailable,
            "total": len(items),
            "model_version": versions[0] if len(versions) == 1 else None,
            "items": list(items),
        }

    def _one(self, query: str, parameters: Sequence[Any] | None = None) -> Any:
        assert self.con is not None
        row = self.con.execute(query, list(parameters or [])).fetchone()
        return row[0] if row else None

    def _rows(self, query: str, parameters: Sequence[Any] | None = None) -> list[tuple[Any, ...]]:
        assert self.con is not None
        return self.con.execute(query, list(parameters or [])).fetchall()

    def _read_json(self, relative_path: str) -> Any | None:
        path = self.root / relative_path
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

    def _command_proof(self, key: str, name: str | None = None) -> dict[str, Any]:
        result = self.command_results.get(key)
        if result is None or result.get("passed") is None:
            return _proof(
                name or key,
                None,
                expected="caller-supplied successful command result",
                reason=f"no executable result supplied for {key}",
            )
        actual = {
            "command": result.get("command"),
            "exit_code": result.get("exit_code"),
            "passed": result.get("passed"),
        }
        return _proof(name or key, result.get("passed") is True, expected="exit_code=0", actual=actual)

    def _command_json(self, key: str) -> dict[str, Any] | None:
        result = self.command_results.get(key)
        if not result or result.get("passed") is not True:
            return None
        stdout = result.get("stdout")
        if not isinstance(stdout, str):
            return None
        try:
            value = json.loads(stdout)
        except json.JSONDecodeError:
            return None
        return value if isinstance(value, dict) else None

    def _acceptance(self) -> dict[str, Any] | None:
        value = self._read_json("reports/phase2_acceptance_results.json")
        return value if isinstance(value, dict) else None

    def _acceptance_db_consistency(self) -> tuple[int, list[str]]:
        report = self._acceptance()
        if report is None:
            return 0, ["report_missing_or_invalid"]
        report_cases = [
            *report.get("domain_cases", []),
            *report.get("parent_cases", []),
            *report.get("cross_domain_cases", []),
        ]
        db_rows = {
            row[0]: row[1]
            for row in self._rows(
                "SELECT case_id,status FROM phase2_acceptance_result "
                "WHERE case_type IN ('domain','parent','cross_domain')"
            )
        }
        mismatches = sorted(
            str(case.get("case_id"))
            for case in report_cases
            if db_rows.get(case.get("case_id")) != case.get("status")
        )
        extra = sorted(set(db_rows) - {str(case.get("case_id")) for case in report_cases})
        return len(report_cases), [*mismatches, *[f"extra:{value}" for value in extra]]

    def _activation_validation(self) -> tuple[int, list[dict[str, Any]]]:
        schema_path = self.root / "contracts/phase2_activation_payload.schema.json"
        if not schema_path.is_file():
            return 0, [{"schema": "missing"}]
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        validator = Draft202012Validator(schema)
        failures: list[dict[str, Any]] = []
        rows = self._rows(
            "SELECT subtype_id,activation_payload_json FROM activation_mapping ORDER BY subtype_id"
        )
        for subtype_id, payload in rows:
            value = _json_value(payload, {})
            errors = sorted(validator.iter_errors(value), key=lambda error: list(error.path))
            if errors:
                failures.append(
                    {"subtype_id": subtype_id, "errors": [error.message for error in errors]}
                )
        return len(rows), failures

    def _item_01(self) -> tuple[list[dict[str, Any]], list[str]]:
        if not self.phase1_db_path.is_file():
            return [
                _proof("phase1_database", None, reason=f"missing {self.phase1_db_path}")
            ], ["data/processed/market_engine.duckdb"]

        assert self.con is not None
        escaped = str(self.phase1_db_path).replace("'", "''")
        self.con.execute(f"ATTACH '{escaped}' AS phase1_live (READ_ONLY)")
        try:
            phase1_tables = [
                row[0]
                for row in self._rows(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_catalog='phase1_live' AND table_schema='main' "
                    "AND table_type='BASE TABLE' ORDER BY table_name"
                )
            ]
            missing_tables = [
                table
                for table in phase1_tables
                if not self._one(
                    "SELECT count(*) > 0 FROM information_schema.tables "
                    "WHERE table_catalog=current_database() AND table_schema='main' AND table_name=?",
                    [table],
                )
            ]
            canonical_tables = [table for table in phase1_tables if table != "pipeline_run"]
            changed_rows: dict[str, int] = {}
            for table in canonical_tables:
                missing = self._one(
                    f"SELECT count(*) FROM (SELECT * FROM phase1_live.main.{table} "
                    f"EXCEPT ALL SELECT * FROM main.{table})"
                )
                changed_rows[table] = int(missing)

            phase1_run = self._rows(
                "SELECT pipeline_name,status,input_manifest,output_manifest,row_counts,quality_metrics,"
                "model_version,random_seed FROM phase1_live.main.pipeline_run ORDER BY finished_at DESC LIMIT 1"
            )
            phase2_run = self._rows(
                "SELECT pipeline_name,status,input_manifest,output_manifest,row_counts,quality_metrics,"
                "model_version,random_seed FROM main.pipeline_run ORDER BY finished_at DESC LIMIT 1"
            )
            run_semantics_match = phase1_run == phase2_run
        finally:
            self.con.execute("DETACH phase1_live")

        acceptance = self._read_json("reports/acceptance_queries.json")
        scenarios = self._read_json("reports/market_scenarios.json")
        acceptance_passed = (
            isinstance(acceptance, dict)
            and acceptance.get("passed") == acceptance.get("total")
            and int(acceptance.get("total", 0)) >= 20
        )
        proofs = [
            _proof("phase1_tables_present", not missing_tables, expected=phase1_tables, actual=missing_tables),
            _proof(
                "phase1_canonical_rows_preserved",
                all(value == 0 for value in changed_rows.values()),
                expected="zero source rows missing or changed",
                actual=changed_rows,
            ),
            _proof(
                "phase1_pipeline_semantics_preserved",
                run_semantics_match,
                expected="same manifests, quality metrics, model version, and seed",
                actual=run_semantics_match,
                reason="run IDs/timestamps are intentionally excluded from the live semantic comparison",
            ),
            _proof("phase1_archetypes", self._one("SELECT count(*) FROM archetype") == 1440, expected=1440, actual=self._one("SELECT count(*) FROM archetype")),
            _proof("phase1_acceptance_payload", acceptance_passed, expected=">=20 all passed", actual={"passed": acceptance.get("passed"), "total": acceptance.get("total")} if isinstance(acceptance, dict) else None),
            _proof("phase1_market_scenarios", isinstance(scenarios, list) and len(scenarios) >= 3, expected=">=3", actual=len(scenarios) if isinstance(scenarios, list) else None),
            self._command_proof("pytest", "current_python_test_suite"),
        ]
        return proofs, [
            "data/processed/market_engine.duckdb",
            "data/processed/market_engine_phase2.duckdb",
            "reports/acceptance_queries.json",
            "reports/market_scenarios.json",
        ]

    def _item_02(self) -> tuple[list[dict[str, Any]], list[str]]:
        manifest = self._read_json("config/nemotron_manifest.yml")
        source_config = self._read_json("config/sources.yml")
        fetch_path = self.root / "scripts/fetch_sources.sh"
        fetch_text = fetch_path.read_text(encoding="utf-8") if fetch_path.is_file() else ""
        source_rows = source_config.get("sources", []) if isinstance(source_config, dict) else []
        registered = next(
            (row for row in source_rows if row.get("source_id") == "SRC-NVIDIA-NPK"), None
        )
        direct_script = (
            "huggingface.co/datasets/nvidia/Nemotron-Personas-Korea/resolve/main/data/" in fetch_text
            and "for shard in 0 1 2 3 4 5 6 7 8" in fetch_text
        )
        acquisition = self.command_results.get("nemotron_acquisition")
        acquisition_command = str(acquisition.get("command", "")) if acquisition else ""
        acquisition_is_direct_fetch = acquisition_command.endswith("scripts/fetch_sources.sh")
        historical_proof = (
            _proof(
                "direct_acquisition_execution",
                None,
                expected="caller-supplied successful direct acquisition command/result",
                reason=(
                    "current files, manifests, and a no-input fetch script cannot establish who supplied "
                    "the historical files; no acquisition execution result was supplied"
                ),
            )
            if acquisition is None or acquisition.get("passed") is None
            else _proof(
                "direct_acquisition_execution",
                acquisition.get("passed") is True and acquisition_is_direct_fetch,
                expected="successful scripts/fetch_sources.sh execution",
                actual={
                    "command": acquisition.get("command"),
                    "exit_code": acquisition.get("exit_code"),
                    "direct_fetch_command": acquisition_is_direct_fetch,
                },
            )
        )
        return [
            _proof("pinned_public_dataset", isinstance(manifest, dict) and manifest.get("dataset") == "nvidia/Nemotron-Personas-Korea", expected="nvidia/Nemotron-Personas-Korea", actual=manifest.get("dataset") if isinstance(manifest, dict) else None),
            _proof("registered_remote_source", isinstance(registered, dict) and str(registered.get("official_url", "")).startswith("https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea"), expected="registered Hugging Face dataset URL", actual=registered.get("official_url") if isinstance(registered, dict) else None),
            _proof("no_user_file_fetch_path", direct_script, expected="nine direct remote shard downloads", actual=direct_script),
            historical_proof,
        ], ["config/nemotron_manifest.yml", "config/sources.yml", "scripts/fetch_sources.sh"]

    def _item_03(self) -> tuple[list[dict[str, Any]], list[str]]:
        manifest = self._read_json("config/nemotron_manifest.yml")
        source_config = self._read_json("config/sources.yml")
        checksum_payload = self._command_json("nemotron_checksums")
        shards = manifest.get("shards", []) if isinstance(manifest, dict) else []
        raw_paths = [self.root / "data/raw/nemotron" / str(row.get("file")) for row in shards]
        source_rows = source_config.get("sources", []) if isinstance(source_config, dict) else []
        registered = next((row for row in source_rows if row.get("source_id") == "SRC-NVIDIA-NPK"), {})
        release = registered.get("release", {}) if isinstance(registered, dict) else {}
        release_path = (
            self.root / str(release.get("local_uri")) if isinstance(release, dict) else None
        )
        release_checksum = (
            _sha256(release_path) if release_path is not None and release_path.is_file() else None
        )
        checksum_files = checksum_payload.get("files", []) if checksum_payload else []
        checksum_names = {row.get("file") for row in checksum_files if row.get("ok") is True}
        raw_inventory = (
            self._rows(
                "SELECT count(*),count(DISTINCT uuid) FROM read_parquet(?)",
                [str(self.root / "data/raw/nemotron/*.parquet")],
            )[0]
            if len(raw_paths) == 9 and all(path.is_file() for path in raw_paths)
            else (None, None)
        )
        raw_rows, raw_unique = raw_inventory
        feature_mart = self.root / "data/processed/nemotron_feature_mart.parquet"
        feature_rows = self._one("SELECT count(*) FROM read_parquet(?)", [str(feature_mart)]) if feature_mart.is_file() else None
        return [
            _proof("manifest_revision", isinstance(manifest, dict) and all(manifest.get(key) for key in ("dataset", "version", "license")), expected="dataset/version/license", actual={key: manifest.get(key) for key in ("dataset", "version", "license")} if isinstance(manifest, dict) else None),
            _proof("nine_raw_shards_present", len(raw_paths) == 9 and all(path.is_file() and path.stat().st_size > 0 for path in raw_paths), expected=9, actual=sum(path.is_file() and path.stat().st_size > 0 for path in raw_paths)),
            self._command_proof("nemotron_checksums", "current_shard_checksum_command"),
            _proof("nine_shard_checksums_match", checksum_payload is not None and checksum_payload.get("all_checksums_ok") is True and checksum_names == {row.get("file") for row in shards}, expected=sorted(str(row.get("file")) for row in shards), actual=sorted(str(value) for value in checksum_names)),
            _proof("raw_rows_unique", raw_rows == raw_unique == 1_000_000, expected={"rows": 1_000_000, "unique_ids": 1_000_000}, actual={"rows": raw_rows, "unique_ids": raw_unique}),
            _proof("canonical_mart", feature_rows == 1_000_000, expected=1_000_000, actual=feature_rows),
            _proof("registered_release_checksum", isinstance(release, dict) and release_checksum == release.get("checksum") and release.get("local_uri") == "data/raw/nemotron_README.md", expected="registered release checksum matches canonical local artifact", actual={"expected_checksum": release.get("checksum"), "actual_checksum": release_checksum, "local_uri": release.get("local_uri")} if isinstance(release, dict) else None),
        ], ["config/nemotron_manifest.yml", "config/sources.yml", "data/raw/nemotron/", "data/processed/nemotron_feature_mart.parquet"]

    def _item_04(self) -> tuple[list[dict[str, Any]], list[str]]:
        rows = self._rows("SELECT domain_code,category_code FROM domain_registry WHERE active ORDER BY domain_code")
        codes = {row[0] for row in rows}
        missing = sorted(MANDATORY_DOMAIN_CODES - codes)
        unmapped = sorted(row[0] for row in rows if not row[1])
        return [
            _proof("active_domain_count", 18 <= len(rows) <= 25, expected="18..25", actual=len(rows)),
            _proof("mandatory_domain_mapping", not missing, expected=sorted(MANDATORY_DOMAIN_CODES), actual={"missing": missing}),
            _proof("phase1_category_mapping", not unmapped, expected="every active domain mapped", actual=unmapped),
        ], ["data/processed/market_engine_phase2.duckdb:domain_registry"]

    def _item_05(self) -> tuple[list[dict[str, Any]], list[str]]:
        rows = self._rows(
            "SELECT d.domain_code,count(x.dimension_id),count(DISTINCT x.axis_code),"
            "list(x.axis_code ORDER BY x.sort_order) FROM domain_registry d "
            "LEFT JOIN domain_dimension x USING(domain_id) WHERE d.active GROUP BY d.domain_code ORDER BY d.domain_code"
        )
        invalid = [
            {"domain": row[0], "rows": row[1], "distinct": row[2], "axes": row[3]}
            for row in rows
            if row[1] != 16 or row[2] != 16 or set(row[3]) != AXIS_CODES
        ]
        return [_proof("sixteen_axis_decisions_per_domain", not invalid, expected="exact 16-code axis set", actual=invalid)], ["data/processed/market_engine_phase2.duckdb:domain_dimension"]

    def _domain_depth_rows(self) -> list[tuple[Any, ...]]:
        return self._rows(
            """
            SELECT d.domain_code,d.coverage_status,d.primary_entity_unit,
                   count(DISTINCT x.dimension_id) axes,
                   count(DISTINCT f.domain_feature_id) FILTER(WHERE f.queryable) features,
                   count(DISTINCT b.behavior_template_id) behaviors,
                   count(DISTINCT t.tag_id) tags,
                   count(DISTINCT h.hierarchy_id) FILTER(WHERE h.hierarchy_level=2) archetypes,
                   count(DISTINCT fs.domain_feature_id || ':' || fs.release_id || ':' || fs.evidence_role) source_links,
                   max(p.evidence_boundary) evidence_boundary
            FROM domain_registry d
            LEFT JOIN domain_dimension x USING(domain_id)
            LEFT JOIN domain_feature f USING(domain_id)
            LEFT JOIN domain_feature_source fs USING(domain_feature_id)
            LEFT JOIN domain_behavior_template b USING(domain_id)
            LEFT JOIN domain_tag t USING(domain_id)
            LEFT JOIN archetype_hierarchy h USING(domain_id)
            LEFT JOIN domain_profile_summary p USING(domain_id)
            WHERE d.active
            GROUP BY d.domain_code,d.coverage_status,d.primary_entity_unit
            ORDER BY d.domain_code
            """
        )

    def _item_06(self) -> tuple[list[dict[str, Any]], list[str]]:
        rows = self._domain_depth_rows()
        invalid = [
            {"domain": r[0], "unit": r[2], "features": r[4], "behaviors": r[5], "source_links": r[8]}
            for r in rows
            if not r[2] or r[4] != 20 or r[5] != 10 or not 20 <= r[8] <= 40
        ]
        return [_proof("domain_taxonomy_depth", not invalid, expected="20 features, 10 behaviors, 20..40 source links, explicit unit", actual=invalid)], ["data/processed/market_engine_phase2.duckdb:domain_feature", "data/processed/market_engine_phase2.duckdb:domain_behavior_template", "data/processed/market_engine_phase2.duckdb:domain_feature_source"]

    def _item_07(self) -> tuple[list[dict[str, Any]], list[str]]:
        rows = self._domain_depth_rows()
        invalid = [
            {"domain": r[0], "coverage": r[1], "axes": r[3], "features": r[4], "behaviors": r[5], "tags": r[6], "archetypes": r[7], "evidence_boundary": r[9]}
            for r in rows
            if r[1] != "complete_with_evidence_constraints"
            or (r[3], r[4], r[5], r[6], r[7]) != (16, 20, 10, 8, 8)
            or not r[9]
        ]
        return [_proof("minimum_depth_and_evidence_boundary", not invalid, expected="16/20/10/8/8 plus complete_with_evidence_constraints", actual=invalid)], ["data/processed/market_engine_phase2.duckdb:domain_coverage_audit", "data/processed/market_engine_phase2.duckdb:domain_profile_summary"]

    def _item_08(self) -> tuple[list[dict[str, Any]], list[str]]:
        plain_complete = self._one("SELECT count(*) FROM domain_registry WHERE active AND coverage_status='complete'")
        cases = self._rows(
            "SELECT a.case_id,d.domain_code,a.query_json FROM phase2_acceptance_result a "
            "JOIN domain_registry d USING(domain_id) WHERE a.case_type='domain' ORDER BY a.case_id"
        )
        invalid_cases: list[str] = []
        for case_id, domain_code, query_json in cases:
            query = _json_value(query_json, {})
            conditions = query.get("conditions", []) if isinstance(query, dict) else []
            if not conditions or any(
                not str(condition.get("feature_code", "")).startswith(f"{domain_code}.")
                for condition in conditions
            ):
                invalid_cases.append(case_id)
        return [
            _proof("no_plain_complete_domain", plain_complete == 0, expected=0, actual=plain_complete),
            _proof("domain_axis_acceptance_queries", len(cases) == 24 and not invalid_cases, expected="24 domain-prefixed condition queries", actual={"cases": len(cases), "invalid": invalid_cases}),
        ], ["data/processed/market_engine_phase2.duckdb:domain_registry", "data/processed/market_engine_phase2.duckdb:phase2_acceptance_result"]

    def _item_09(self) -> tuple[list[dict[str, Any]], list[str]]:
        models = self._rows(
            "SELECT d.domain_code,m.selected_k,m.candidate_k_json,m.random_seeds_json,m.artifact_uri,"
            "m.artifact_sha256,m.membership_uri,m.membership_sha256,m.feature_pipeline_json,m.model_version "
            "FROM segmentation_model m JOIN domain_registry d USING(domain_id) WHERE d.active AND m.status='selected' ORDER BY d.domain_code"
        )
        artifact_failures: list[dict[str, Any]] = []
        configuration_failures: list[str] = []
        versions: set[str] = set()
        for domain, selected_k, candidate_json, seeds_json, artifact_uri, artifact_hash, membership_uri, membership_hash, pipeline_json, version in models:
            versions.add(str(version))
            candidates = _json_value(candidate_json, [])
            seeds = _json_value(seeds_json, [])
            if not (3 <= selected_k <= 8 and candidates == [3, 4, 5, 6] and seeds == [20260825, 20260826, 20260827]):
                configuration_failures.append(domain)
            pipeline = _json_value(pipeline_json, {})
            embedding = pipeline.get("semantic_embedding", {}) if isinstance(pipeline, dict) else {}
            paths = [
                ("model", self.root / str(artifact_uri), artifact_hash),
                ("membership", self.root / str(membership_uri), membership_hash),
                ("embedding", self.root / str(embedding.get("cache_uri", "")), embedding.get("cache_sha256")),
            ]
            for kind, path, expected_hash in paths:
                actual_hash = _sha256(path) if path.is_file() else None
                if actual_hash != expected_hash:
                    artifact_failures.append({"domain": domain, "kind": kind, "path": str(path.relative_to(self.root)) if path.is_relative_to(self.root) else str(path), "expected": expected_hash, "actual": actual_hash})
        latent_domains = self._one("SELECT count(DISTINCT domain_id) FROM latent_dimension")
        cluster_count = self._one("SELECT count(*) FROM cluster_definition")
        subtype_count = self._one("SELECT count(*) FROM subtype_definition WHERE is_primary")
        representative_failures = self._one("SELECT count(*) FROM (SELECT cluster_id,count(*) n FROM cluster_representative GROUP BY cluster_id HAVING n<>5)")
        return [
            _proof("one_selected_model_per_domain", len(models) == 24, expected=24, actual=len(models)),
            _proof("single_model_version", len(versions) == 1, expected="one model version", actual=next(iter(versions)) if len(versions) == 1 else sorted(versions)),
            _proof("latent_dimension_per_domain", latent_domains == 24, expected=24, actual=latent_domains),
            _proof("model_search_and_fixed_seeds", not configuration_failures, expected="candidate k 3..6 and seeds 20260825..20260827", actual=configuration_failures),
            _proof("model_artifact_checksums", not artifact_failures, expected="model/membership/embedding hashes match", actual=artifact_failures),
            _proof("clusters_and_subtypes", cluster_count == subtype_count == 90, expected={"clusters": 90, "primary_subtypes": 90}, actual={"clusters": cluster_count, "primary_subtypes": subtype_count}),
            _proof("five_representatives_per_cluster", representative_failures == 0, expected=0, actual=representative_failures),
        ], ["data/processed/market_engine_phase2.duckdb:segmentation_model", "data/processed/phase2/models/", "data/processed/phase2/memberships/", "data/processed/phase2/embeddings/"]

    def _item_10(self) -> tuple[list[dict[str, Any]], list[str]]:
        codes = {row[0] for row in self._rows("SELECT domain_code FROM domain_registry WHERE active")}
        export_path = self.root / "data/exports/phase2_domains.csv"
        export_codes: set[str] = set()
        if export_path.is_file():
            with export_path.open(encoding="utf-8", newline="") as handle:
                export_codes = {row["domain_code"] for row in csv.DictReader(handle)}
        api_text = (self.root / "src/market_engine/api/app.py").read_text(encoding="utf-8")
        cli_text = (self.root / "src/market_engine/cli/main.py").read_text(encoding="utf-8")
        integration_text = (self.root / "tests/integration/test_phase2.py").read_text(encoding="utf-8")
        verticals = {"music_audio", "small_business_digital"}
        small_business_parent = self._one("SELECT count(*) FROM parent_decomposition_decision WHERE phase1_archetype_id='ARC-06-001' AND decision='eligible'")
        return [
            _proof("vertical_slice_rows", verticals <= codes and verticals <= export_codes and small_business_parent == 1, expected=sorted(verticals), actual={"db": sorted(verticals & codes), "export": sorted(verticals & export_codes), "ARC-06-001": small_business_parent}),
            _proof("rest_and_cli_paths", all(token in api_text for token in ('/v2/domains', '/v2/subtypes/{subtype_id}/creative-brief')) and all(token in cli_text for token in ('"domains"', '"creative-brief"')), expected="v2 REST and CLI domain/creative paths", actual=True),
            _proof("vertical_slice_integration_coverage", "test_phase2_rest_vertical_slices_and_model_validation" in integration_text and "music_audio" in integration_text and "ARC-06-001" in integration_text, expected="vertical-slice integration test", actual=True),
            self._command_proof("pytest", "executed_vertical_slice_test_suite"),
        ], ["data/exports/phase2_domains.csv", "src/market_engine/api/app.py", "src/market_engine/cli/main.py", "tests/integration/test_phase2.py"]

    def _item_11(self) -> tuple[list[dict[str, Any]], list[str]]:
        result = self.command_results.get("postgres_migrations")
        proof = self._command_proof("postgres_migrations", "postgres_migration_test")
        stdout = str(result.get("stdout", "")) if result else ""
        match = re.search(r"Phase 1=(\d+) tables .* additive total=(\d+) tables", stdout)
        script_path = self.root / "scripts/test_postgres.sh"
        script_text = script_path.read_text(encoding="utf-8") if script_path.is_file() else ""
        script_checks_idempotence = (
            "table_count_after_reapply" in script_text
            and "Phase 2 migration is not idempotent" in script_text
        )
        details_proof = (
            _proof("postgres_clean_additive_idempotent", None, expected="Phase 1=30, additive total=58, idempotent reapply", reason="migration command output unavailable")
            if result is None or result.get("passed") is None
            else _proof("postgres_clean_additive_idempotent", result.get("passed") is True and match is not None and match.groups() == ("30", "58") and script_checks_idempotence, expected={"phase1_tables": 30, "additive_total": 58, "idempotent": True}, actual={"counts": match.groups() if match else None, "script_checks_idempotence": script_checks_idempotence})
        )
        return [proof, details_proof], ["migrations/001_core.sql", "migrations/002_phase2_domains_subtypes.sql", "scripts/test_postgres.sh"]

    def _item_12(self) -> tuple[list[dict[str, Any]], list[str]]:
        phase1_count = self._one("SELECT count(*) FROM archetype")
        decision_count = self._one("SELECT count(*) FROM parent_decomposition_decision")
        missing = self._one("SELECT count(*) FROM archetype a LEFT JOIN parent_decomposition_decision d ON d.phase1_archetype_id=a.archetype_id WHERE d.phase1_archetype_id IS NULL")
        orphan = self._one("SELECT count(*) FROM parent_decomposition_decision d LEFT JOIN archetype a ON a.archetype_id=d.phase1_archetype_id WHERE a.archetype_id IS NULL")
        incomplete = self._one("SELECT count(*) FROM parent_decomposition_decision WHERE rationale IS NULL OR trim(rationale)='' OR model_version IS NULL OR run_id IS NULL")
        return [
            _proof("decision_set_matches_phase1_parents", phase1_count == decision_count == 1440 and missing == orphan == 0, expected={"parents": 1440, "missing": 0, "orphan": 0}, actual={"parents": phase1_count, "decisions": decision_count, "missing": missing, "orphan": orphan}),
            _proof("decision_lineage_complete", incomplete == 0, expected=0, actual=incomplete),
        ], ["data/processed/market_engine_phase2.duckdb:parent_decomposition_decision"]

    def _item_13(self) -> tuple[list[dict[str, Any]], list[str]]:
        counts = self._rows(
            "SELECT d.phase1_archetype_id,count(a.subtype_id) n FROM parent_decomposition_decision d "
            "LEFT JOIN subtype_allocation a USING(phase1_archetype_id) WHERE d.decision='eligible' "
            "GROUP BY d.phase1_archetype_id ORDER BY d.phase1_archetype_id"
        )
        invalid = [{"parent": row[0], "allocations": row[1]} for row in counts if not 3 <= row[1] <= 8]
        non_primary = self._one("SELECT count(*) FROM subtype_allocation a JOIN subtype_definition s USING(subtype_id) WHERE NOT s.is_primary")
        return [
            _proof("eligible_parent_count", len(counts) == 120, expected=120, actual=len(counts)),
            _proof("three_to_eight_primary_allocations", not invalid and non_primary == 0, expected="3..8 primary subtypes", actual={"invalid": invalid, "non_primary": non_primary}),
        ], ["data/processed/market_engine_phase2.duckdb:subtype_allocation"]

    def _item_14(self) -> tuple[list[dict[str, Any]], list[str]]:
        share_error = self._one("SELECT max(abs(total_share-1)) FROM (SELECT phase1_archetype_id,sum(share_base) total_share FROM subtype_allocation GROUP BY phase1_archetype_id)")
        count_error = self._one("SELECT max(abs(a.children-p.count_base)/p.count_base) FROM (SELECT phase1_archetype_id,sum(count_base) children FROM subtype_allocation GROUP BY phase1_archetype_id) a JOIN phase2_parent_estimate p USING(phase1_archetype_id)")
        interval_errors = self._one("SELECT count(*) FROM subtype_allocation WHERE NOT (share_low<=share_base AND share_base<=share_high AND count_low<=count_base AND count_base<=count_high)")
        return [
            _proof("base_share_reconciliation", share_error is not None and share_error <= 0.001, expected="<=0.001", actual=share_error),
            _proof("base_count_reconciliation", count_error is not None and count_error <= 0.005, expected="<=0.005", actual=count_error),
            _proof("allocation_intervals_ordered", interval_errors == 0, expected=0, actual=interval_errors),
        ], ["data/processed/market_engine_phase2.duckdb:subtype_allocation", "data/processed/market_engine_phase2.duckdb:phase2_parent_estimate"]

    def _item_15(self) -> tuple[list[dict[str, Any]], list[str]]:
        tag_count = self._one("SELECT count(*) FROM domain_tag")
        invalid_tags = self._one("SELECT count(*) FROM domain_tag WHERE NOT overlap_allowed OR additive")
        allocation_count = self._one("SELECT count(*) FROM subtype_tag_allocation")
        invalid_warning = self._one("SELECT count(*) FROM subtype_tag_allocation WHERE non_additive_warning IS NULL OR trim(non_additive_warning)='' OR (non_additive_warning NOT LIKE '%합산%' AND lower(non_additive_warning) NOT LIKE '%non-additive%')")
        per_subtype = self._one("SELECT count(*) FROM (SELECT subtype_id,count(*) n FROM subtype_tag_allocation GROUP BY subtype_id HAVING n<>8)")
        return [
            _proof("non_additive_tag_registry", tag_count == 192 and invalid_tags == 0, expected={"tags": 192, "invalid": 0}, actual={"tags": tag_count, "invalid": invalid_tags}),
            _proof("separate_tag_allocations", allocation_count == 720 and per_subtype == 0 and invalid_warning == 0, expected={"allocations": 720, "per_subtype": 8, "warning_errors": 0}, actual={"allocations": allocation_count, "per_subtype_errors": per_subtype, "warning_errors": invalid_warning}),
        ], ["data/processed/market_engine_phase2.duckdb:domain_tag", "data/processed/market_engine_phase2.duckdb:subtype_tag_allocation"]

    def _item_16(self) -> tuple[list[dict[str, Any]], list[str]]:
        total = self._one("SELECT count(*) FROM subtype_definition WHERE is_primary")
        invalid = self._one("SELECT count(*) FROM subtype_definition s JOIN subtype_membership_summary m USING(subtype_id) JOIN domain_registry d USING(domain_id) WHERE s.is_primary AND (m.weighted_prevalence_low IS NULL OR NOT (m.weighted_prevalence_low<=m.weighted_prevalence_base AND m.weighted_prevalence_base<=m.weighted_prevalence_high) OR m.weighted_prevalence_low<0 OR m.weighted_prevalence_high>1 OR d.primary_entity_unit NOT IN ('person','child_person','household','establishment','enterprise'))")
        missing = self._one("SELECT count(*) FROM subtype_definition s LEFT JOIN subtype_membership_summary m USING(subtype_id) WHERE s.is_primary AND m.subtype_id IS NULL")
        return [_proof("subtype_interval_and_unit", total == 90 and invalid == missing == 0, expected={"subtypes": 90, "invalid": 0, "missing": 0}, actual={"subtypes": total, "invalid": invalid, "missing": missing})], ["data/processed/market_engine_phase2.duckdb:subtype_membership_summary", "data/processed/market_engine_phase2.duckdb:domain_registry"]

    def _item_17(self) -> tuple[list[dict[str, Any]], list[str]]:
        total = self._one("SELECT count(*) FROM subtype_confidence")
        invalid = self._one("SELECT count(*) FROM subtype_confidence WHERE population_confidence_score NOT BETWEEN 0 AND 100 OR interpretation_confidence_score NOT BETWEEN 0 AND 100 OR targetability_confidence_score NOT BETWEEN 0 AND 100 OR population_confidence_grade NOT IN ('A','B','C','D','E') OR interpretation_confidence_grade NOT IN ('A','B','C','D','E') OR targetability_confidence_grade NOT IN ('A','B','C','D','E')")
        missing = self._one("SELECT count(*) FROM subtype_definition s LEFT JOIN subtype_confidence c USING(subtype_id) WHERE s.is_primary AND c.subtype_id IS NULL")
        return [_proof("three_confidence_dimensions", total == 90 and invalid == missing == 0, expected={"rows": 90, "invalid": 0, "missing": 0}, actual={"rows": total, "invalid": invalid, "missing": missing})], ["data/processed/market_engine_phase2.duckdb:subtype_confidence"]

    def _item_18(self) -> tuple[list[dict[str, Any]], list[str]]:
        rows = self._rows("SELECT s.subtype_id,s.evidence_boundary,p.observed_evidence_json,p.assumptions_json,p.inferred_profile_json,p.prohibited_inferences_json,c.gaps_json,c.validation_plan_json FROM subtype_definition s LEFT JOIN subtype_profile p USING(subtype_id) LEFT JOIN subtype_confidence c USING(subtype_id) WHERE s.is_primary ORDER BY s.subtype_id")
        invalid: list[str] = []
        for subtype_id, boundary, observed, assumptions, inferred, prohibited, gaps, plan in rows:
            values = [_json_value(value, None) for value in (observed, assumptions, inferred, prohibited, gaps, plan)]
            inferred_value = values[2] if isinstance(values[2], dict) else {}
            if (
                not boundary
                or not isinstance(values[0], dict)
                or not all(isinstance(value, list) and len(value) > 0 for value in (values[1], values[3], values[4], values[5]))
                or inferred_value.get("must_not_be_treated_as_observed") is not True
            ):
                invalid.append(subtype_id)
        return [_proof("profile_evidence_disclosure", len(rows) == 90 and not invalid, expected="90 complete disclosed profiles", actual={"rows": len(rows), "invalid": invalid})], ["data/processed/market_engine_phase2.duckdb:subtype_profile", "data/processed/market_engine_phase2.duckdb:subtype_confidence"]

    def _item_19(self) -> tuple[list[dict[str, Any]], list[str]]:
        total, failures = self._activation_validation()
        missing = self._one("SELECT count(*) FROM subtype_definition s LEFT JOIN activation_mapping a USING(subtype_id) WHERE s.is_primary AND a.subtype_id IS NULL")
        guard_failures = self._one("SELECT count(*) FROM activation_mapping WHERE platform_claim_status<>'unverified_do_not_claim' OR creative_brief_json IS NULL OR measurement_plan_json IS NULL OR exclusions_json IS NULL")
        return [
            _proof("activation_profile_per_subtype", total == 90 and missing == 0, expected={"profiles": 90, "missing": 0}, actual={"profiles": total, "missing": missing}),
            _proof("activation_payload_schema", not failures, expected="all schema valid", actual=failures),
            _proof("activation_guard_fields", guard_failures == 0, expected=0, actual=guard_failures),
        ], ["data/processed/market_engine_phase2.duckdb:activation_mapping", "contracts/phase2_activation_payload.schema.json"]

    def _item_20(self) -> tuple[list[dict[str, Any]], list[str]]:
        active = self._one("SELECT count(*) FROM domain_registry WHERE active")
        rows = self._rows("SELECT domain_id,count(*) FILTER(WHERE status='passed') passed,count(*) total FROM phase2_acceptance_result WHERE case_type='domain' GROUP BY domain_id ORDER BY domain_id")
        invalid = [{"domain_id": row[0], "passed": row[1], "total": row[2]} for row in rows if row[1] < 1 or row[1] != row[2]]
        report_count, mismatches = self._acceptance_db_consistency()
        return [
            _proof("domain_acceptance_per_active_domain", len(rows) == active == 24 and not invalid, expected="24 domains, >=1 all-passed case each", actual={"domains": len(rows), "invalid": invalid}),
            _proof("acceptance_report_matches_db", report_count == 44 and not mismatches, expected={"listed_cases": 44, "mismatches": []}, actual={"listed_cases": report_count, "mismatches": mismatches}),
        ], ["data/processed/market_engine_phase2.duckdb:phase2_acceptance_result", "reports/phase2_acceptance_results.json"]

    def _item_21(self) -> tuple[list[dict[str, Any]], list[str]]:
        cases = self._rows("SELECT case_id,count_low,count_base,count_high,population_confidence_grade,evidence_status FROM required_parent_case ORDER BY case_id")
        allocations = self._rows("SELECT r.case_id,count(a.subtype_id),sum(a.share_base),sum(a.count_base),r.count_base FROM required_parent_case r LEFT JOIN required_parent_case_allocation a USING(case_id) GROUP BY r.case_id,r.count_base ORDER BY r.case_id")
        invalid_cases = [row[0] for row in cases if not (row[1] <= row[2] <= row[3])]
        undisclosed = [row[0] for row in cases if row[0] != "PARENT-01" and (row[4] != "E" or "exploratory" not in str(row[5]))]
        invalid_allocations = [row[0] for row in allocations if not 3 <= row[1] <= 8 or abs(row[2] - 1) > 0.001 or abs(row[3] - row[4]) / row[4] > 0.005]
        acceptance_rows = self._rows("SELECT case_id,status FROM phase2_acceptance_result WHERE case_type='parent' ORDER BY case_id")
        return [
            _proof("required_parent_case_count", len(cases) >= 10, expected=">=10", actual=len(cases)),
            _proof("parent_case_intervals_and_disclosure", not invalid_cases and not undisclosed, expected="ordered intervals; cases 2..10 explicit E-grade exploratory", actual={"invalid_intervals": invalid_cases, "undisclosed": undisclosed}),
            _proof("parent_case_reconciliation", not invalid_allocations, expected="3..8; share <=0.001; count <=0.005", actual=invalid_allocations),
            _proof("parent_acceptance_rows", len(acceptance_rows) >= 10 and all(row[1] == "passed" for row in acceptance_rows), expected=">=10 passed", actual={"count": len(acceptance_rows), "not_passed": [row[0] for row in acceptance_rows if row[1] != "passed"]}),
        ], ["data/processed/market_engine_phase2.duckdb:required_parent_case", "data/processed/market_engine_phase2.duckdb:required_parent_case_allocation", "reports/phase2_acceptance_results.json"]

    def _item_22(self) -> tuple[list[dict[str, Any]], list[str]]:
        rows = self._rows("SELECT case_id,status,result_json FROM phase2_acceptance_result WHERE case_type='cross_domain' ORDER BY case_id")
        invalid: list[str] = []
        for case_id, status, payload in rows:
            result = _json_value(payload, {})
            if status == "safe_not_estimable":
                safe = result.get("count") is None and result.get("independence_assumed") is False
            else:
                count = result.get("count", {})
                support = result.get("joint_support", {})
                interval = (
                    [count.get("low"), count.get("base"), count.get("high")]
                    if isinstance(count, dict)
                    else [None, None, None]
                )
                safe = (
                    status == "passed"
                    and all(isinstance(value, (int, float)) for value in interval)
                    and interval[0] <= interval[1] <= interval[2]
                    and isinstance(support, dict)
                    and support.get("hard", 0) > 0
                    and result.get("independence_assumed") is False
                )
            if not safe:
                invalid.append(case_id)
        return [_proof("cross_domain_acceptance", len(rows) >= 10 and not invalid, expected=">=10 passed or safely not_estimable without independence", actual={"count": len(rows), "invalid": invalid})], ["data/processed/market_engine_phase2.duckdb:phase2_acceptance_result", "reports/phase2_acceptance_results.json"]

    def _item_23(self) -> tuple[list[dict[str, Any]], list[str]]:
        domain_count = self._one("SELECT count(*) FROM domain_registry WHERE active")
        expected_pairs = domain_count * (domain_count - 1) // 2
        pair_count = self._one("SELECT count(*) FROM domain_association")
        invalid = self._one("SELECT count(*) FROM domain_association WHERE independence_assumed OR method_code IS NULL OR trim(method_code)='' OR caveat IS NULL OR trim(caveat)='' OR (entity_unit<>'cross_unit' AND (weighted_support IS NULL OR weighted_support<=0 OR effective_sample_size IS NULL OR effective_sample_size<=0 OR joint_prevalence_low IS NULL OR NOT (joint_prevalence_low<=joint_prevalence_base AND joint_prevalence_base<=joint_prevalence_high))) OR (entity_unit='cross_unit' AND (joint_prevalence_low IS NOT NULL OR joint_prevalence_base IS NOT NULL OR joint_prevalence_high IS NOT NULL))")
        duplicate = self._one("SELECT count(*) FROM (SELECT domain_id_a,domain_id_b,count(*) n FROM domain_association GROUP BY domain_id_a,domain_id_b HAVING n<>1)")
        return [_proof("complete_guarded_pair_registry", pair_count == expected_pairs and invalid == duplicate == 0, expected={"pairs": expected_pairs, "invalid": 0, "duplicates": 0}, actual={"pairs": pair_count, "invalid": invalid, "duplicates": duplicate})], ["data/processed/market_engine_phase2.duckdb:domain_association", "data/processed/phase2/cross_domain_joint_sample.parquet"]

    def _item_24(self) -> tuple[list[dict[str, Any]], list[str]]:
        schema = self._read_json("contracts/phase2_activation_payload.schema.json")
        schema_ok = False
        if isinstance(schema, dict):
            try:
                Draft202012Validator.check_schema(schema)
                schema_ok = schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema"
            except Exception:
                schema_ok = False
        total, failures = self._activation_validation()
        creative_invalid = self._one("SELECT count(*) FROM activation_mapping WHERE json_array_length(json_extract(creative_brief_json,'$.message_angles'))<3 OR json_array_length(json_extract(creative_brief_json,'$.test_cells'))<3 OR json_extract_string(creative_brief_json,'$.evidence_required') IS NULL")
        api_text = (self.root / "src/market_engine/api/app.py").read_text(encoding="utf-8")
        cli_text = (self.root / "src/market_engine/cli/main.py").read_text(encoding="utf-8")
        return [
            _proof("draft_2020_12_schema", schema_ok, expected="Draft 2020-12", actual=schema.get("$schema") if isinstance(schema, dict) else None),
            _proof("all_activation_payloads_validate", total == 90 and not failures, expected={"valid": 90, "failures": []}, actual={"total": total, "failures": failures}),
            _proof("creative_brief_payloads", creative_invalid == 0, expected=0, actual=creative_invalid),
            _proof("creative_brief_api_cli", "/v2/subtypes/{subtype_id}/creative-brief" in api_text and '"creative-brief"' in cli_text, expected="REST and CLI creative-brief paths", actual=True),
            self._command_proof("pytest", "executed_creative_brief_test_suite"),
        ], ["contracts/phase2_activation_payload.schema.json", "data/processed/market_engine_phase2.duckdb:activation_mapping", "tests/integration/test_phase2.py"]

    def _item_25(self) -> tuple[list[dict[str, Any]], list[str]]:
        rows = self._rows("SELECT o.observation_id,o.aggregate_count,o.outcome_count,o.contains_personal_data,o.bias_flags_json,p.posterior_update_id,p.update_status,p.posterior_low,p.posterior_mean,p.posterior_high,p.diagnostics_json FROM segment_observation o JOIN posterior_update p USING(observation_id) ORDER BY o.observed_at")
        invalid: list[str] = []
        for observation_id, aggregate, outcomes, personal, bias, update_id, status, low, mean, high, diagnostics in rows:
            diag = _json_value(diagnostics, {})
            bias_flags = _json_value(bias, [])
            if (
                aggregate <= 0
                or not 0 <= outcomes <= aggregate
                or personal is not False
                or not bias_flags
                or status != "held_for_review"
                or not low <= mean <= high
                or diag.get("published_model_unchanged") is not True
                or diag.get("requires_human_review") is not True
                or not update_id
            ):
                invalid.append(observation_id)
        report = self._acceptance()
        feedback = report.get("summary", {}).get("feedback", {}) if isinstance(report, dict) else {}
        feedback_match = bool(rows) and feedback.get("observation_id") == rows[-1][0] and feedback.get("posterior_update_id") == rows[-1][5]
        return [
            _proof("aggregate_posterior_rows", len(rows) >= 1 and not invalid, expected=">=1 safe held-for-review update", actual={"count": len(rows), "invalid": invalid}),
            _proof("acceptance_feedback_matches_db", feedback_match, expected="latest IDs match", actual={"report_observation": feedback.get("observation_id"), "report_update": feedback.get("posterior_update_id"), "db_observation": rows[-1][0] if rows else None, "db_update": rows[-1][5] if rows else None}),
        ], ["data/processed/market_engine_phase2.duckdb:segment_observation", "data/processed/market_engine_phase2.duckdb:posterior_update", "reports/phase2_acceptance_results.json"]

    def _item_26(self) -> tuple[list[dict[str, Any]], list[str]]:
        manifest = self._read_json("reports/phase2_output_manifest.json")
        checkpoint = self._read_json("reports/phase2_build_checkpoint.json")
        outputs = manifest.get("outputs", {}) if isinstance(manifest, dict) else {}
        missing_export_keys = sorted(EXPECTED_EXPORTS - set(outputs))
        bad_exports = sorted(
            key
            for key in EXPECTED_EXPORTS & set(outputs)
            if not (self.root / str(outputs[key])).is_file()
            or (self.root / str(outputs[key])).stat().st_size == 0
        )
        export_parse_errors: list[str] = []
        for filename in sorted(EXPECTED_EXPORTS):
            path = self.root / str(outputs.get(filename, "missing"))
            if not path.is_file():
                continue
            try:
                if path.suffix == ".csv":
                    with path.open(encoding="utf-8", newline="") as handle:
                        reader = csv.reader(handle)
                        header = next(reader)
                        first = next(reader)
                        if not header or not first:
                            raise ValueError("empty CSV")
                else:
                    values = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
                    if not values:
                        raise ValueError("empty JSONL")
            except (OSError, ValueError, json.JSONDecodeError, StopIteration):
                export_parse_errors.append(filename)

        checkpoint_outputs = checkpoint.get("outputs", {}) if isinstance(checkpoint, dict) else {}
        parquet_failures: list[dict[str, Any]] = []
        for table in EXPECTED_PHASE2_TABLES:
            relative_path = checkpoint_outputs.get(table)
            path = self.root / str(relative_path) if relative_path else None
            if path is None or not path.is_file():
                parquet_failures.append({"table": table, "reason": "missing"})
                continue
            escaped = str(path).replace("'", "''")
            missing_from_artifact = self._one(
                f"SELECT count(*) FROM (SELECT * FROM main.{table} EXCEPT ALL "
                f"SELECT * FROM read_parquet('{escaped}'))"
            )
            extra_in_artifact = self._one(
                f"SELECT count(*) FROM (SELECT * FROM read_parquet('{escaped}') EXCEPT ALL "
                f"SELECT * FROM main.{table})"
            )
            if missing_from_artifact or extra_in_artifact:
                parquet_failures.append(
                    {"table": table, "missing": missing_from_artifact, "extra": extra_in_artifact}
                )

        registry = self._read_json("data/exports/phase2_domain_registry.json")
        domain_codes = {row[0] for row in self._rows("SELECT domain_code FROM domain_registry WHERE active")}
        registry_codes = {row.get("domain_code") for row in registry} if isinstance(registry, list) else set()
        return [
            _proof("declared_exports_present", not missing_export_keys and not bad_exports, expected=sorted(EXPECTED_EXPORTS), actual={"missing_keys": missing_export_keys, "bad_files": bad_exports}),
            _proof("exports_machine_readable", not export_parse_errors, expected="all CSV/JSONL parse", actual=export_parse_errors),
            _proof("parquet_snapshots_match_current_tables", not parquet_failures, expected=f"{len(EXPECTED_PHASE2_TABLES)} exact table snapshots", actual=parquet_failures),
            _proof("domain_registry_json_matches_db", registry_codes == domain_codes, expected=sorted(domain_codes), actual=sorted(value for value in registry_codes if value)),
        ], ["reports/phase2_output_manifest.json", "reports/phase2_build_checkpoint.json", "data/exports/", "data/processed/phase2/tables/"]

    def _item_27(self) -> tuple[list[dict[str, Any]], list[str]]:
        coverage_path = self.root / "reports/domain_coverage_matrix.md"
        association_path = self.root / "reports/cross_domain_association_report.md"
        coverage_text = coverage_path.read_text(encoding="utf-8") if coverage_path.is_file() else ""
        association_text = association_path.read_text(encoding="utf-8") if association_path.is_file() else ""
        coverage_rows = self._rows("SELECT d.domain_code,d.primary_entity_unit,c.dimensions_count,c.queryable_features_count,c.behavior_templates_count,c.tags_count,c.archetypes_count,c.allocated_parent_count,c.acceptance_count,c.coverage_score,m.algorithm,m.selected_k,m.effective_sample_size FROM domain_registry d JOIN domain_coverage_audit c USING(domain_id) JOIN segmentation_model m USING(domain_id) WHERE d.active ORDER BY d.domain_id")
        missing_coverage_lines = []
        for row in coverage_rows:
            prefix = f"| {row[0]} | {row[1]} | {row[2]} | {row[3]} | {row[4]} | {row[5]} | {row[6]} | {row[7]} | {row[8]} | {row[9]:.3f} | {row[10]} ({row[11]}) | {row[12]:.1f} |"
            if prefix not in coverage_text:
                missing_coverage_lines.append(row[0])
        pair_count = self._one("SELECT count(*) FROM domain_association")
        same_unit = self._one("SELECT count(*) FROM domain_association WHERE joint_prevalence_base IS NOT NULL")
        guarded = self._one("SELECT count(*) FROM domain_association WHERE joint_prevalence_base IS NULL")
        association_counts_match = all(
            line in association_text
            for line in (
                f"- Pair records: {pair_count}",
                f"- Same-unit exploratory joints: {same_unit}",
                f"- Cross-unit guarded pairs: {guarded}",
            )
        )
        top_rows = self._rows(
            """
            SELECT da.domain_code,db.domain_code,a.entity_unit,a.joint_prevalence_base,
                   a.lift,a.effective_sample_size,a.method_code
            FROM domain_association a
            JOIN domain_registry da ON a.domain_id_a=da.domain_id
            JOIN domain_registry db ON a.domain_id_b=db.domain_id
            WHERE a.joint_prevalence_base IS NOT NULL
            ORDER BY a.lift DESC NULLS LAST
            LIMIT 30
            """
        )
        missing_association_lines: list[str] = []
        for row in top_rows:
            line = (
                f"| {row[0]} | {row[1]} | {row[2]} | {row[3]:.4f} | "
                f"{row[4]:.3f} | {row[5]:.1f} | {row[6]} |"
            )
            if line not in association_text:
                missing_association_lines.append(f"{row[0]}:{row[1]}")
        return [
            _proof("coverage_report_matches_current_rows", len(coverage_rows) == 24 and not missing_coverage_lines, expected="24 exact current coverage lines", actual={"rows": len(coverage_rows), "missing": missing_coverage_lines}),
            _proof("association_report_matches_current_rows", association_counts_match and len(top_rows) == 30 and not missing_association_lines, expected={"pairs": pair_count, "same_unit": same_unit, "guarded": guarded, "top_rows": 30}, actual={"counts_match": association_counts_match, "top_rows": len(top_rows), "missing": missing_association_lines}),
        ], ["reports/domain_coverage_matrix.md", "reports/cross_domain_association_report.md"]

    def _item_28(self) -> tuple[list[dict[str, Any]], list[str]]:
        validation_payload = self._command_json("combined_validation")
        validation_proof = (
            _proof("combined_validation_payload", None, expected="all live validations pass", reason="combined validation JSON unavailable")
            if validation_payload is None
            else _proof("combined_validation_payload", validation_payload.get("status") == "passed" and validation_payload.get("passed") == validation_payload.get("total") and int(validation_payload.get("total", 0)) >= 46, expected=">=46 all passed", actual={"status": validation_payload.get("status"), "passed": validation_payload.get("passed"), "total": validation_payload.get("total")})
        )
        return [
            self._command_proof("pytest", "full_python_test_suite"),
            self._command_proof("combined_validation", "combined_model_validation_command"),
            validation_proof,
            self._command_proof("nemotron_checksums", "artifact_checksum_command"),
            self._command_proof("postgres_migrations", "postgres_migration_test"),
        ], ["tests/", "scripts/test_postgres.sh", "src/market_engine/validation.py", "src/market_engine/phase2_services.py"]

    def _item_29(self) -> tuple[list[dict[str, Any]], list[str]]:
        paths = [
            self.root / "README.md",
            self.root / "docs/12_phase2_api_cli.md",
            self.root / "docs/13_phase2_operations_retraining.md",
        ]
        missing = [str(path.relative_to(self.root)) for path in paths if not path.is_file()]
        text = "\n".join(path.read_text(encoding="utf-8").lower() for path in paths if path.is_file())
        workflow_tokens = {
            "build": ("build-phase2", "full-build"),
            "domain": ("domain-taxonomy", "domains"),
            "recluster": ("force-models",),
            "cross_query": ("cross-domain",),
            "feedback": ("record-observation", "update-posterior"),
            "validate": ("validate-segmentation", "validate"),
            "promotion": ("promotion", "promot"),
            "rollback": ("rollback",),
        }
        missing_workflows = sorted(
            name for name, tokens in workflow_tokens.items() if not any(token in text for token in tokens)
        )
        return [
            _proof("operator_documents_present", not missing, expected=[str(path.relative_to(self.root)) for path in paths], actual=missing),
            _proof("required_workflows_documented", not missing_workflows, expected=sorted(workflow_tokens), actual=missing_workflows),
        ], ["README.md", "docs/12_phase2_api_cli.md", "docs/13_phase2_operations_retraining.md"]

    def _item_30(self) -> tuple[list[dict[str, Any]], list[str]]:
        implementation_paths = [
            self.root / "src/market_engine/phase2.py",
            self.root / "src/market_engine/phase2_services.py",
            self.root / "src/market_engine/phase2_acceptance.py",
            self.root / "src/market_engine/phase2_reporting.py",
            self.root / "src/market_engine/phase2_repository.py",
        ]
        marker = re.compile(r"\b(?:TODO|FIXME|NotImplementedError)\b|^\s*pass\s*(?:#.*)?$", re.MULTILINE)
        markers: list[str] = []
        for path in implementation_paths:
            if not path.is_file():
                markers.append(f"missing:{path.name}")
                continue
            for match in marker.finditer(path.read_text(encoding="utf-8")):
                line = path.read_text(encoding="utf-8")[: match.start()].count("\n") + 1
                markers.append(f"{path.relative_to(self.root)}:{line}:{match.group(0).strip()}")
        empty_tables = [
            table for table in EXPECTED_PHASE2_TABLES if self._one(f"SELECT count(*) FROM {table}") == 0
        ]
        null_as_zero = self._one("SELECT count(*) FROM phase2_parent_estimate WHERE status='not_estimable' AND (count_low IS NOT NULL OR count_base IS NOT NULL OR count_high IS NOT NULL)")
        evidence_poor_invalid = self._one("SELECT count(*) FROM phase2_parent_estimate WHERE status='exploratory_estimate' AND (confidence_grade<>'E' OR json_array_length(validation_gaps_json)=0)")
        service_test_text = (self.root / "tests/integration/test_phase2.py").read_text(encoding="utf-8")
        return [
            _proof("no_stub_markers", not markers, expected=[], actual=markers),
            _proof("all_phase2_tables_materialized", not empty_tables, expected=[], actual=empty_tables),
            _proof("missing_evidence_not_zero", null_as_zero == 0, expected=0, actual=null_as_zero),
            _proof("exploratory_values_disclosed", evidence_poor_invalid == 0, expected=0, actual=evidence_poor_invalid),
            _proof("service_paths_exercised", all(token in service_test_text for token in ("/v2/domains", "/v2/parents/ARC-06-001/decomposition", "estimate_cross_domain_segment")), expected="DB/API/service integration coverage", actual=True),
            self._command_proof("pytest", "executed_phase2_implementation_tests"),
        ], ["src/market_engine/phase2.py", "src/market_engine/phase2_services.py", "tests/integration/test_phase2.py", "data/processed/market_engine_phase2.duckdb"]


def verify_phase2_dod(
    *,
    root: Path,
    db_path: Path,
    command_results: Mapping[str, CommandResult] | None = None,
) -> dict[str, Any]:
    """Return the live 30-item audit; this function performs no writes."""

    return Phase2DodVerifier(
        root=root,
        db_path=db_path,
        command_results=command_results,
    ).verify()
