#!/usr/bin/env python3
"""Deterministically import the immutable DuckDB baseline into PostgreSQL.

The import is additive and idempotent. It never updates Phase 1-2 values: a
matching manifest is verified and skipped, while a partial/drifting target is
rejected for operator review.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import uuid
from collections.abc import Iterable, Sequence
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb


ROOT = Path(__file__).resolve().parents[1]
DUCKDB_PATH = ROOT / "data/processed/market_engine_phase2.duckdb"
DEFAULT_DSN = (
    "dbname=market_engine port=55432 "
    f"host={ROOT / 'data/local/socket'}"
)
IMPORT_KEY = "phase2-baseline-kr-v0.2.1"
NAMESPACE = uuid.UUID("b589f0e5-d7df-4f06-8f36-b19928c1e55b")
STAMP = datetime(2026, 8, 25, tzinfo=timezone.utc)


def stable_uuid(kind: str, value: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, f"{kind}:{value}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_json(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return default
    return value


def jsonb(value: Any, default: Any | None = None) -> Jsonb:
    return Jsonb(parse_json(value, default if default is not None else {}))


def text_array(value: Any) -> list[str]:
    parsed = parse_json(value, [])
    return [str(item) for item in parsed] if isinstance(parsed, list) else []


def duck_rows(con: duckdb.DuckDBPyConnection, table: str) -> list[dict[str, Any]]:
    cursor = con.execute(f'SELECT * FROM "{table}"')
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, row, strict=True)) for row in cursor.fetchall()]


def insert_rows(
    cur: psycopg.Cursor[Any],
    table: str,
    columns: Sequence[str],
    rows: Sequence[Sequence[Any]],
) -> str:
    current = cur.execute(
        sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table))
    ).fetchone()[0]
    if current:
        if current != len(rows):
            raise RuntimeError(
                f"{table} contains {current} rows; source has {len(rows)}. "
                "Refusing a partial or drifting baseline import."
            )
        return "verified_existing"
    if not rows:
        return "empty_source"
    query = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
        sql.Identifier(table),
        sql.SQL(", ").join(map(sql.Identifier, columns)),
        sql.SQL(", ").join(sql.Placeholder() for _ in columns),
    )
    cur.executemany(query, rows)
    return "inserted"


def confidence_parts(total: int) -> tuple[int, int, int, int, int]:
    remaining = max(0, min(100, int(total)))
    capacities = [30, 15, 20, 20, 15]
    parts: list[int] = []
    for index, capacity in enumerate(capacities):
        slots = len(capacities) - index
        part = min(capacity, round(remaining / slots))
        parts.append(part)
        remaining -= part
    for index, capacity in enumerate(capacities):
        if remaining <= 0:
            break
        room = capacity - parts[index]
        add = min(room, remaining)
        parts[index] += add
        remaining -= add
    return tuple(parts)  # type: ignore[return-value]


def source_run_ids(duck: duckdb.DuckDBPyConnection) -> dict[str, str]:
    result: dict[str, str] = {}
    for table in (
        "pipeline_run",
        "segmentation_model",
        "domain_association",
        "domain_coverage_audit",
        "domain_profile_summary",
        "parent_decomposition_decision",
        "phase2_parent_estimate",
        "posterior_update",
        "required_parent_case",
        "required_parent_case_allocation",
        "subtype_allocation",
        "phase2_acceptance_result",
    ):
        columns = {row[0] for row in duck.execute(f'DESCRIBE "{table}"').fetchall()}
        if "run_id" not in columns:
            continue
        version_expr = "model_version" if "model_version" in columns else "'kr-v0.2.1'"
        for run_id, version in duck.execute(
            f'SELECT DISTINCT run_id, {version_expr} FROM "{table}" WHERE run_id IS NOT NULL'
        ).fetchall():
            result[str(run_id)] = str(version or "kr-v0.2.1")
    return result


def mapped_run(run_id: Any) -> uuid.UUID | None:
    return stable_uuid("run", str(run_id)) if run_id else None


def mapped_model(version: Any) -> uuid.UUID:
    return stable_uuid("model", str(version or "kr-v0.2.1"))


def common(row: dict[str, Any], data_version: str) -> tuple[Any, ...]:
    return (STAMP, STAMP, data_version, mapped_run(row.get("run_id")))


def imported_row_count(
    cur: psycopg.Cursor[Any], table: str, baseline_run_ids: Sequence[uuid.UUID]
) -> int:
    """Count only rows owned by this immutable baseline import.

    Workbench estimates, confidence rows, gaps, and future workspace state are
    additive. A verify-only run must not confuse those records with baseline
    drift merely because they share a canonical table.
    """

    if table == "estimate":
        query = "SELECT count(*) FROM estimate WHERE external_estimate_key LIKE 'phase1:%'"
        return cur.execute(query).fetchone()[0]
    if table == "confidence_assessment":
        query = """
            SELECT count(*)
            FROM confidence_assessment ca
            JOIN estimate e USING (estimate_id)
            WHERE e.external_estimate_key LIKE 'phase1:%'
        """
        return cur.execute(query).fetchone()[0]
    if table == "validation_gap":
        query = """
            SELECT count(*)
            FROM validation_gap vg
            JOIN estimate e USING (estimate_id)
            WHERE e.external_estimate_key LIKE 'phase1:%'
        """
        return cur.execute(query).fetchone()[0]
    if table == "time_period":
        return cur.execute(
            "SELECT count(*) FROM time_period WHERE label IN ('2020','2021','2022','2023','2024')"
        ).fetchone()[0]
    if table == "pipeline_run":
        return cur.execute(
            "SELECT count(*) FROM pipeline_run WHERE run_id = ANY(%s)",
            (list(baseline_run_ids),),
        ).fetchone()[0]
    if table == "workspace":
        return cur.execute("SELECT count(*) FROM workspace WHERE workspace_key='default'").fetchone()[0]
    if table == "workspace_member":
        return cur.execute(
            """
            SELECT count(*)
            FROM workspace_member wm
            JOIN workspace w USING (workspace_id)
            WHERE w.workspace_key='default'
              AND wm.actor_id=%s
            """,
            (stable_uuid("actor", "trusted-local"),),
        ).fetchone()[0]
    return cur.execute(
        sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table))
    ).fetchone()[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", default=DEFAULT_DSN)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()

    source_hash = sha256_file(DUCKDB_PATH)
    duck = duckdb.connect(str(DUCKDB_PATH), read_only=True)
    pg = psycopg.connect(args.dsn)
    baseline_run_ids = [mapped_run(run_id) for run_id in source_run_ids(duck)]
    counts: dict[str, int] = {}
    actions: dict[str, str] = {}
    try:
        with pg.transaction():
            cur = pg.cursor()
            cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (IMPORT_KEY,))
            manifest = cur.execute(
                "SELECT source_sha256, table_counts FROM baseline_import_manifest WHERE import_key=%s",
                (IMPORT_KEY,),
            ).fetchone()
            if manifest:
                if manifest[0] != source_hash:
                    raise RuntimeError("Baseline artifact checksum differs from the recorded import manifest.")
                recorded = manifest[1]
                for table, expected in recorded.items():
                    actual = imported_row_count(cur, table, baseline_run_ids)
                    if actual != expected:
                        raise RuntimeError(f"{table}: expected {expected} imported rows, found {actual}")
                cur.execute(
                    "UPDATE baseline_import_manifest SET verified_at=now(), verification_json=%s WHERE import_key=%s",
                    (Jsonb({"status": "passed", "verified_tables": len(recorded)}), IMPORT_KEY),
                )
                print(json.dumps({"status": "verified_existing", "tables": recorded}, ensure_ascii=False, indent=2))
                return
            if args.verify_only:
                raise RuntimeError("No baseline import manifest exists yet.")

            runs = source_run_ids(duck)
            versions = {"kr-v0.1.0", "kr-v0.2.1", *runs.values()}
            seed_by_version = {
                str(row["model_version"]): int(row.get("random_seed") or 20260825)
                for row in duck_rows(duck, "pipeline_run")
            }
            model_rows = [
                (
                    mapped_model(version),
                    version,
                    hashlib.sha256(f"{version}:methodology".encode()).hexdigest(),
                    hashlib.sha256((ROOT / "config/sources.yml").read_bytes()).hexdigest(),
                    Jsonb({"import_key": IMPORT_KEY, "immutable_source": str(DUCKDB_PATH.relative_to(ROOT))}),
                    seed_by_version.get(version, 20260825),
                    STAMP,
                    STAMP,
                    version,
                )
                for version in sorted(versions)
            ]
            actions["model_version"] = insert_rows(
                cur,
                "model_version",
                ("model_version_id", "version", "methodology_hash", "source_manifest_hash", "parameter_json", "random_seed", "created_at", "updated_at", "data_version"),
                model_rows,
            )
            counts["model_version"] = len(model_rows)

            pipeline_source = {str(row["run_id"]): row for row in duck_rows(duck, "pipeline_run")}
            pipeline_rows = []
            for run_id, version in sorted(runs.items()):
                source = pipeline_source.get(run_id, {})
                status = str(source.get("status") or "success")
                if status not in {"running", "success", "failed", "cancelled"}:
                    status = "success" if status in {"passed", "complete", "completed"} else "failed"
                pipeline_rows.append(
                    (
                        mapped_run(run_id),
                        str(source.get("pipeline_name") or "phase2_baseline_import"),
                        None,
                        source.get("started_at") or STAMP,
                        source.get("finished_at") or STAMP,
                        status,
                        jsonb(source.get("input_manifest"), {}),
                        jsonb(source.get("output_manifest"), {}),
                        jsonb(source.get("row_counts"), {}),
                        jsonb(source.get("quality_metrics"), {}),
                        None,
                        mapped_model(version),
                        STAMP,
                        STAMP,
                        version,
                        run_id,
                    )
                )
            actions["pipeline_run"] = insert_rows(
                cur,
                "pipeline_run",
                ("run_id", "pipeline_name", "git_commit", "started_at", "finished_at", "status", "input_manifest", "output_manifest", "row_counts", "quality_metrics", "error_log_uri", "model_version_id", "created_at", "updated_at", "data_version", "external_run_key"),
                pipeline_rows,
            )
            counts["pipeline_run"] = len(pipeline_rows)

            sources = duck_rows(duck, "data_source")
            source_rows = [
                tuple(row.get(column) for column in ("source_id", "publisher", "dataset_title", "official_url", "license", "source_tier", "source_type", "population_universe", "entity_unit", "geographic_coverage", "notes"))
                + (STAMP, STAMP, "kr-v0.2.1")
                for row in sources
            ]
            actions["data_source"] = insert_rows(
                cur,
                "data_source",
                ("source_id", "publisher", "dataset_title", "official_url", "license", "source_tier", "source_type", "population_universe", "entity_unit", "geographic_coverage", "notes", "created_at", "updated_at", "data_version"),
                source_rows,
            )
            counts["data_source"] = len(source_rows)
            source_titles = {row["source_id"]: row["dataset_title"] for row in sources}
            releases = duck_rows(duck, "source_release")
            release_rows = [
                (
                    row["release_id"], row["source_id"], row["version_label"], row.get("reference_period_start"),
                    row.get("reference_period_end"), row.get("publication_date"), row["retrieved_at"], row.get("local_uri"),
                    row.get("file_format"), row.get("checksum"),
                    f"{source_titles.get(row['source_id'], row['source_id'])} ({row['version_label']})",
                    row["status"], STAMP, STAMP, "kr-v0.2.1",
                )
                for row in releases
            ]
            actions["source_release"] = insert_rows(
                cur,
                "source_release",
                ("release_id", "source_id", "version_label", "reference_period_start", "reference_period_end", "publication_date", "retrieved_at", "local_uri", "file_format", "checksum", "citation_text", "status", "created_at", "updated_at", "data_version"),
                release_rows,
            )
            counts["source_release"] = len(release_rows)

            geography_rows = [("KR", "대한민국", "country", date(1948, 8, 15), STAMP, STAMP, "kr-v0.2.1")]
            actions["geography"] = insert_rows(
                cur, "geography", ("code", "name_ko", "level", "valid_from", "created_at", "updated_at", "data_version"), geography_rows
            )
            counts["geography"] = len(geography_rows)
            geography_id = cur.execute("SELECT geography_id FROM geography WHERE code='KR' ORDER BY valid_from DESC LIMIT 1").fetchone()[0]
            period_rows = [
                ("year", date(year, 1, 1), date(year, 12, 31), str(year), STAMP, STAMP, "kr-v0.2.1")
                for year in range(2020, 2025)
            ]
            actions["time_period"] = insert_rows(
                cur, "time_period", ("period_type", "start_date", "end_date", "label", "created_at", "updated_at", "data_version"), period_rows
            )
            counts["time_period"] = len(period_rows)
            period_ids = {row[0]: row[1] for row in cur.execute("SELECT label,period_id FROM time_period").fetchall()}

            features = duck_rows(duck, "feature_definition")
            feature_rows = [
                (
                    row["feature_code"], row["label_ko"], row["entity_unit"], row["data_type"], None,
                    row["sensitive_class"], row["queryable"], row["label_ko"], STAMP, STAMP, "kr-v0.1.0",
                )
                for row in features
            ]
            actions["feature_definition"] = insert_rows(
                cur,
                "feature_definition",
                ("feature_code", "label_ko", "entity_unit", "data_type", "allowed_values", "sensitive_class", "queryable", "definition", "created_at", "updated_at", "data_version"),
                feature_rows,
            )
            counts["feature_definition"] = len(feature_rows)

            categories = duck_rows(duck, "category")
            category_rows = [
                (
                    row["code"], row["name_ko"], f"Phase 1 verified category: {row['code']}", jsonb(row["entity_units_json"], []),
                    index, row["version"], STAMP, STAMP, row["version"],
                )
                for index, row in enumerate(categories, 1)
            ]
            actions["category"] = insert_rows(
                cur, "category", ("code", "name_ko", "description", "entity_units", "sort_order", "version", "created_at", "updated_at", "data_version"), category_rows
            )
            counts["category"] = len(category_rows)
            category_ids = {row[0]: row[1] for row in cur.execute("SELECT code,category_id FROM category").fetchall()}

            archetype_estimates = {row["archetype_id"]: row for row in duck_rows(duck, "archetype_estimate")}
            archetypes = duck_rows(duck, "archetype")
            archetype_rows = [
                (
                    row["archetype_id"], category_ids[row["category_code"]], row["name_ko"], None, row["one_line_definition"],
                    row["primary_entity_unit"], None, None, archetype_estimates[row["archetype_id"]]["status"], row["version"],
                    STAMP, STAMP, row["version"],
                )
                for row in archetypes
            ]
            actions["archetype"] = insert_rows(
                cur, "archetype", ("archetype_id", "category_id", "name_ko", "name_en", "one_line_definition", "primary_entity_unit", "age_min", "age_max", "status", "version", "created_at", "updated_at", "data_version"), archetype_rows
            )
            counts["archetype"] = len(archetype_rows)
            rule_rows = [
                (
                    row["archetype_id"], jsonb(row["rule_json"], {}), row["rule_hash"], row["version"],
                    "probabilistic" if "probab" in str(row["rule_json"]).lower() else "deterministic",
                    Jsonb([]), STAMP, STAMP, row["version"],
                )
                for row in archetypes
            ]
            actions["archetype_rule"] = insert_rows(
                cur, "archetype_rule", ("archetype_id", "rule_json", "rule_hash", "rule_version", "deterministic_or_probabilistic", "required_features", "created_at", "updated_at", "data_version"), rule_rows
            )
            counts["archetype_rule"] = len(rule_rows)
            profile_rows = [
                (
                    row["archetype_id"], jsonb(row["observable_traits_json"], []), jsonb(row["inferred_needs_json"], []),
                    Jsonb([]), Jsonb([]), jsonb(row["channels_json"], []),
                    "Synthetic narrative attributes are hypotheses; only observable baseline fields may support estimates.",
                    STAMP, STAMP, row["version"],
                )
                for row in archetypes
            ]
            actions["archetype_profile"] = insert_rows(
                cur, "archetype_profile", ("archetype_id", "observable_traits", "inferred_needs", "triggers", "objections", "channels", "inference_disclosure", "created_at", "updated_at", "data_version"), profile_rows
            )
            counts["archetype_profile"] = len(profile_rows)
            rep_kind = {
                "nemotron": "nemotron", "synthetic_child_person": "synthetic_minor",
                "synthetic_household": "synthetic_household", "synthetic_enterprise": "synthetic_business",
            }
            representative_source = duck_rows(duck, "archetype_representative")
            representative_rows = [
                (
                    row["archetype_id"], rep_kind[row["source_kind"]], row["source_persona_key"], 1, None, None,
                    row["provenance"], STAMP, STAMP, "kr-v0.1.0",
                )
                for row in representative_source
            ]
            actions["archetype_representative"] = insert_rows(
                cur, "archetype_representative", ("archetype_id", "source_kind", "source_persona_key", "rank", "distance_or_similarity", "representative_summary", "storage_uri", "created_at", "updated_at", "data_version"), representative_rows
            )
            counts["archetype_representative"] = len(representative_rows)

            phase1_run = next((mapped_run(run_id) for run_id, version in runs.items() if version == "kr-v0.1.0"), mapped_run(sorted(runs)[0]))
            estimate_rows = []
            confidence_rows = []
            gap_rows = []
            allowed_gaps = {
                "missing_joint_distribution", "outdated_reference_period", "weak_proxy", "unknown_unit_conversion",
                "geographic_granularity_gap", "small_sample", "business_web_presence_unobserved",
                "owner_attribute_unobserved", "purchase_intent_unobserved", "spend_per_entity_unobserved",
                "overlap_unknown", "other",
            }
            for row in archetype_estimates.values():
                estimate_id = stable_uuid("estimate", row["archetype_id"])
                period_label = str(row.get("reference_period") or "2024")[:4]
                if period_label not in period_ids:
                    period_label = "2024"
                estimate_rows.append(
                    (
                        estimate_id, "archetype", row["archetype_id"], next(a["primary_entity_unit"] for a in archetypes if a["archetype_id"] == row["archetype_id"]),
                        geography_id, period_ids[period_label], row["denominator"], row.get("count_low"), row.get("count_base"), row.get("count_high"),
                        row.get("share_low"), row.get("share_base"), row.get("share_high"), row["method_code"], row["formula"], "source_precision",
                        mapped_model("kr-v0.1.0"), phase1_run, row["status"], STAMP, STAMP, "kr-v0.1.0",
                        f"phase1:{row['archetype_id']}", None, "baseline", "approved",
                    )
                )
                total = int(row["confidence_score"])
                parts = confidence_parts(total)
                confidence_rows.append(
                    (estimate_id, *parts, total, row["confidence_grade"], "Imported Phase 1 rule-based confidence score.", STAMP, STAMP, "kr-v0.1.0", "confidence-v1", Jsonb({"imported_total": total}), Jsonb([]), STAMP)
                )
                for priority, gap in enumerate(text_array(row.get("validation_gaps_json")), 1):
                    gap_type = gap if gap in allowed_gaps else "other"
                    gap_rows.append(
                        (estimate_id, row["archetype_id"], gap_type, gap, "high", f"What evidence resolves {gap}?", "Authoritative public source or probability sample", None, min(priority, 5), "open", STAMP, STAMP, "kr-v0.1.0")
                    )
            estimate_columns = (
                "estimate_id", "subject_type", "subject_id", "entity_unit", "geography_id", "period_id", "denominator_definition",
                "count_low", "count_base", "count_high", "share_low", "share_base", "share_high", "method_code", "formula", "precision_rule",
                "model_version_id", "run_id", "status", "created_at", "updated_at", "data_version", "external_estimate_key", "workspace_id", "data_layer", "approval_status",
            )
            actions["estimate"] = insert_rows(cur, "estimate", estimate_columns, estimate_rows)
            counts["estimate"] = len(estimate_rows)
            actions["confidence_assessment"] = insert_rows(
                cur, "confidence_assessment", ("estimate_id", "source_quality_score", "recency_score", "directness_score", "joint_observation_score", "model_reliance_score", "total_score", "grade", "rationale", "created_at", "updated_at", "data_version", "rule_version", "components_json", "penalties_json", "validation_gap_reviewed_at"), confidence_rows
            )
            counts["confidence_assessment"] = len(confidence_rows)
            actions["validation_gap"] = insert_rows(
                cur, "validation_gap", ("estimate_id", "archetype_id", "gap_type", "description", "impact", "verification_question", "recommended_source", "expected_improvement", "priority", "status", "created_at", "updated_at", "data_version"), gap_rows
            )
            counts["validation_gap"] = len(gap_rows)

            category_code_to_id = category_ids
            domain_registry = duck_rows(duck, "domain_registry")
            domain_rows = [
                (
                    row["domain_id"], row["domain_code"], row["name_ko"], row["description"], row["primary_entity_unit"],
                    category_code_to_id[row["category_code"]], row["coverage_status"], row["active"], row["minor_guardrail"], row["version"],
                    STAMP, STAMP, row["version"],
                )
                for row in domain_registry
            ]
            actions["domain_registry"] = insert_rows(
                cur, "domain_registry", ("domain_id", "domain_code", "name_ko", "description", "primary_entity_unit", "category_id", "coverage_status", "active", "minor_guardrail", "version", "created_at", "updated_at", "data_version"), domain_rows
            )
            counts["domain_registry"] = len(domain_rows)

            simple_specs: list[tuple[str, tuple[str, ...], Any]] = [
                ("domain_dimension", ("dimension_id", "domain_id", "axis_code", "applicability", "applicability_reason", "allowed_values", "sort_order", "created_at", "updated_at", "data_version"), lambda r: (r["dimension_id"], r["domain_id"], r["axis_code"], r["applicability"], r["applicability_reason"], jsonb(r["allowed_values_json"], []), r["sort_order"], STAMP, STAMP, "kr-v0.2.1")),
                ("domain_feature", ("domain_feature_id", "domain_id", "dimension_id", "feature_code", "label_ko", "data_type", "allowed_values", "observable_status", "targetability_class", "queryable", "sensitive_class", "created_at", "updated_at", "data_version"), lambda r: (r["domain_feature_id"], r["domain_id"], r.get("dimension_id"), r["feature_code"], r["label_ko"], r["data_type"], jsonb(r["allowed_values_json"], []), r["observable_status"], r["targetability_class"], r["queryable"], "non_sensitive", STAMP, STAMP, "kr-v0.2.1")),
                ("domain_feature_source", ("domain_feature_id", "release_id", "evidence_role", "locator", "claim_scope", "created_at", "updated_at", "data_version"), lambda r: (r["domain_feature_id"], r["release_id"], r["evidence_role"], r["locator"], r["claim_scope"], STAMP, STAMP, "kr-v0.2.1")),
                ("domain_behavior_template", ("behavior_template_id", "domain_id", "behavior_code", "name_ko", "definition", "rule_json", "targetability_class", "evidence_status", "created_at", "updated_at", "data_version"), lambda r: (r["behavior_template_id"], r["domain_id"], r["behavior_code"], r["name_ko"], r["definition"], jsonb(r["rule_json"], {}), r["targetability_class"], r["evidence_status"], STAMP, STAMP, "kr-v0.2.1")),
                ("domain_tag", ("tag_id", "domain_id", "tag_code", "tag_type", "name_ko", "overlap_allowed", "additive", "provenance", "created_at", "updated_at", "data_version"), lambda r: (r["tag_id"], r["domain_id"], r["tag_code"], r["tag_type"], r["name_ko"], r["overlap_allowed"], r["additive"], r["provenance"], STAMP, STAMP, "kr-v0.2.1")),
            ]
            for table, columns, mapper in simple_specs:
                mapped = [mapper(row) for row in duck_rows(duck, table)]
                actions[table] = insert_rows(cur, table, columns, mapped)
                counts[table] = len(mapped)

            hierarchy_source = sorted(duck_rows(duck, "archetype_hierarchy"), key=lambda row: row["hierarchy_level"])
            hierarchy_rows = [
                (row["hierarchy_id"], row["domain_id"], row["hierarchy_level"], row["node_type"], row.get("parent_hierarchy_id"), row.get("phase1_archetype_id"), row["node_code"], row["name_ko"], row["definition"], jsonb(row["rule_json"], {}), STAMP, STAMP, "kr-v0.2.1")
                for row in hierarchy_source
            ]
            actions["archetype_hierarchy"] = insert_rows(cur, "archetype_hierarchy", ("hierarchy_id", "domain_id", "hierarchy_level", "node_type", "parent_hierarchy_id", "phase1_archetype_id", "node_code", "name_ko", "definition", "rule_json", "created_at", "updated_at", "data_version"), hierarchy_rows)
            counts["archetype_hierarchy"] = len(hierarchy_rows)

            latent_rows = [
                (row["latent_dimension_id"], row["domain_id"], row["code"], row["name_ko"], row["interpretation"], jsonb(row["feature_loadings_json"], {}), row["variance_explained"], row["model_artifact_uri"], STAMP, STAMP, row["model_version"])
                for row in duck_rows(duck, "latent_dimension")
            ]
            actions["latent_dimension"] = insert_rows(cur, "latent_dimension", ("latent_dimension_id", "domain_id", "code", "name_ko", "interpretation", "feature_loadings", "variance_explained", "model_artifact_uri", "created_at", "updated_at", "data_version"), latent_rows)
            counts["latent_dimension"] = len(latent_rows)

            phase2_specs: list[tuple[str, tuple[str, ...], Any]] = [
                ("segmentation_model", ("segmentation_model_id", "domain_id", "algorithm", "feature_pipeline", "sample_definition", "sample_size", "weighted_support", "effective_sample_size", "candidate_k", "selected_k", "random_seeds", "stability_metrics", "selection_rationale", "artifact_uri", "artifact_sha256", "membership_uri", "membership_sha256", "status", "model_version_id", "run_id", "created_at", "updated_at", "data_version"), lambda r: (r["segmentation_model_id"], r["domain_id"], r["algorithm"], jsonb(r["feature_pipeline_json"], {}), jsonb(r["sample_definition_json"], {}), r["sample_size"], r["weighted_support"], r["effective_sample_size"], jsonb(r["candidate_k_json"], []), r["selected_k"], jsonb(r["random_seeds_json"], []), jsonb(r["stability_metrics_json"], {}), r["selection_rationale"], r["artifact_uri"], r.get("artifact_sha256"), r.get("membership_uri"), r.get("membership_sha256"), r["status"], mapped_model(r["model_version"]), mapped_run(r["run_id"]), STAMP, STAMP, r["model_version"])),
                ("cluster_definition", ("cluster_id", "segmentation_model_id", "cluster_number", "post_hoc_label_ko", "label_evidence", "weighted_prevalence", "effective_sample_size", "hard_support", "soft_support", "created_at", "updated_at", "data_version", "raw_cluster_number"), lambda r: (r["cluster_id"], r["segmentation_model_id"], r["cluster_number"], r["post_hoc_label_ko"], jsonb(r["label_evidence_json"], {}), r["weighted_prevalence"], r["effective_sample_size"], r["hard_support"], r["soft_support"], STAMP, STAMP, "kr-v0.2.1", r.get("raw_cluster_number"))),
                ("cluster_representative", ("cluster_representative_id", "cluster_id", "source_persona_key", "rank", "distance", "representative_summary", "storage_uri", "privacy_disclosure", "created_at", "updated_at", "data_version"), lambda r: (r["cluster_representative_id"], r["cluster_id"], r["source_persona_key"], r["rank"], r["distance"], r["representative_summary"], r["storage_uri"], r["privacy_disclosure"], STAMP, STAMP, "kr-v0.2.1")),
                ("subtype_definition", ("subtype_id", "domain_id", "cluster_id", "hierarchy_id", "subtype_code", "name_ko", "definition", "is_primary", "label_status", "evidence_boundary", "created_at", "updated_at", "data_version"), lambda r: (r["subtype_id"], r["domain_id"], r["cluster_id"], r["hierarchy_id"], r["subtype_code"], r["name_ko"], r["definition"], r["is_primary"], r["label_status"], r["evidence_boundary"], STAMP, STAMP, "kr-v0.2.1")),
                ("subtype_membership_summary", ("subtype_id", "segmentation_model_id", "weighted_prevalence_low", "weighted_prevalence_base", "weighted_prevalence_high", "effective_sample_size", "entropy", "stability_score", "hard_support", "created_at", "updated_at", "data_version"), lambda r: (r["subtype_id"], r["segmentation_model_id"], r["weighted_prevalence_low"], r["weighted_prevalence_base"], r["weighted_prevalence_high"], r["effective_sample_size"], r["entropy"], r["stability_score"], r["hard_support"], STAMP, STAMP, "kr-v0.2.1")),
                ("subtype_profile", ("subtype_id", "observed_evidence", "assumptions_json", "inferred_profile", "jobs_to_be_done", "triggers", "barriers", "engagement_modes", "creative_hypotheses", "prohibited_inferences", "updated_at", "data_version"), lambda r: (r["subtype_id"], jsonb(r["observed_evidence_json"], {}), jsonb(r["assumptions_json"], []), jsonb(r["inferred_profile_json"], {}), jsonb(r["jobs_to_be_done_json"], []), jsonb(r["triggers_json"], []), jsonb(r["barriers_json"], []), jsonb(r["engagement_modes_json"], []), jsonb(r["creative_hypotheses_json"], []), jsonb(r["prohibited_inferences_json"], []), STAMP, "kr-v0.2.1")),
                ("subtype_confidence", ("subtype_id", "population_confidence_score", "population_confidence_grade", "interpretation_confidence_score", "interpretation_confidence_grade", "targetability_confidence_score", "targetability_confidence_grade", "source_quality_score", "sample_support_score", "stability_score", "directness_score", "validation_score", "total_score", "grade", "interval_method", "gaps_json", "validation_plan", "created_at", "updated_at", "data_version"), lambda r: (r["subtype_id"], r["population_confidence_score"], r["population_confidence_grade"], r["interpretation_confidence_score"], r["interpretation_confidence_grade"], r["targetability_confidence_score"], r["targetability_confidence_grade"], r["source_quality_score"], r["sample_support_score"], r["stability_component_score"], r["directness_score"], r["validation_score"], r["total_score"], r["grade"], r["interval_method"], jsonb(r["gaps_json"], []), jsonb(r["validation_plan_json"], []), STAMP, STAMP, "kr-v0.2.1")),
                ("subtype_tag_allocation", ("subtype_id", "tag_id", "prevalence_low", "prevalence_base", "prevalence_high", "method_code", "non_additive_warning", "created_at", "updated_at", "data_version"), lambda r: (r["subtype_id"], r["tag_id"], r["prevalence_low"], r["prevalence_base"], r["prevalence_high"], r["method_code"], r["non_additive_warning"], STAMP, STAMP, "kr-v0.2.1")),
                ("activation_mapping", ("activation_mapping_id", "subtype_id", "targetability_class", "platform_claim_status", "activation_payload", "creative_brief", "measurement_plan", "exclusions", "created_at", "updated_at", "data_version"), lambda r: (r["activation_mapping_id"], r["subtype_id"], r["targetability_class"], r["platform_claim_status"], jsonb(r["activation_payload_json"], {}), jsonb(r["creative_brief_json"], {}), jsonb(r["measurement_plan_json"], {}), jsonb(r["exclusions_json"], []), STAMP, STAMP, "kr-v0.2.1")),
            ]
            for table, columns, mapper in phase2_specs:
                mapped = [mapper(row) for row in duck_rows(duck, table)]
                actions[table] = insert_rows(cur, table, columns, mapped)
                counts[table] = len(mapped)

            governed_specs: list[tuple[str, tuple[str, ...], Any]] = [
                ("parent_decomposition_decision", ("phase1_archetype_id", "domain_id", "decision", "rationale", "required_evidence", "reviewed_at", "model_version_id", "run_id", "created_at", "updated_at", "data_version"), lambda r: (r["phase1_archetype_id"], r.get("domain_id"), r["decision"], r["rationale"], r["required_evidence"], r["reviewed_at"], mapped_model(r["model_version"]), mapped_run(r["run_id"]), STAMP, STAMP, r["model_version"])),
                ("phase2_parent_estimate", ("phase1_archetype_id", "model_version_id", "entity_unit", "status", "count_low", "count_base", "count_high", "share_low", "share_base", "share_high", "denominator_definition", "formula", "method_code", "source_release_ids", "confidence_grade", "validation_gaps", "run_id", "created_at", "updated_at", "data_version"), lambda r: (r["phase1_archetype_id"], mapped_model(r["model_version"]), r["entity_unit"], r["status"], r.get("count_low"), r.get("count_base"), r.get("count_high"), r.get("share_low"), r.get("share_base"), r.get("share_high"), r["denominator_definition"], r["formula"], r["method_code"], jsonb(r["source_release_ids_json"], []), r["confidence_grade"], jsonb(r["validation_gaps_json"], []), mapped_run(r["run_id"]), STAMP, STAMP, r["model_version"])),
                ("subtype_allocation", ("phase1_archetype_id", "subtype_id", "share_low", "share_base", "share_high", "count_low", "count_base", "count_high", "denominator_count_base", "allocation_formula", "conditional_method", "model_version_id", "run_id", "created_at", "updated_at", "data_version"), lambda r: (r["phase1_archetype_id"], r["subtype_id"], r["share_low"], r["share_base"], r["share_high"], r["count_low"], r["count_base"], r["count_high"], r["denominator_count_base"], r["allocation_formula"], r["conditional_method"], mapped_model(r["model_version"]), mapped_run(r["run_id"]), STAMP, STAMP, r["model_version"])),
                ("required_parent_case", ("case_id", "domain_id", "linked_phase1_archetype_id", "name_ko", "entity_unit", "rule_json", "count_low", "count_base", "count_high", "share_low", "share_base", "share_high", "denominator_json", "method_code", "formula", "source_release_ids", "population_confidence_grade", "assumptions_json", "validation_gaps_json", "conditioning_feature", "conditioning_value", "conditioning_hard_support", "conditioning_effective_sample_size", "required_tags_json", "evidence_status", "model_version_id", "run_id", "created_at", "updated_at", "data_version"), lambda r: (r["case_id"], r["domain_id"], r.get("linked_phase1_archetype_id"), r["name_ko"], r["entity_unit"], jsonb(r["rule_json"], {}), r["count_low"], r["count_base"], r["count_high"], r["share_low"], r["share_base"], r["share_high"], jsonb(r["denominator_json"], {}), r["method_code"], r["formula"], jsonb(r["source_release_ids_json"], []), r["population_confidence_grade"], jsonb(r["assumptions_json"], []), jsonb(r["validation_gaps_json"], []), r.get("conditioning_feature"), r.get("conditioning_value"), r.get("conditioning_hard_support"), r.get("conditioning_effective_sample_size"), jsonb(r["required_tags_json"], []), r["evidence_status"], mapped_model(r["model_version"]), mapped_run(r["run_id"]), STAMP, STAMP, r["model_version"])),
                ("required_parent_case_allocation", ("case_id", "subtype_id", "share_low", "share_base", "share_high", "count_low", "count_base", "count_high", "assignment_method", "formula", "interpretation_confidence_grade", "targetability_confidence_grade", "model_version_id", "run_id", "created_at", "updated_at", "data_version"), lambda r: (r["case_id"], r["subtype_id"], r["share_low"], r["share_base"], r["share_high"], r["count_low"], r["count_base"], r["count_high"], r["assignment_method"], r["formula"], r["interpretation_confidence_grade"], r["targetability_confidence_grade"], mapped_model(r["model_version"]), mapped_run(r["run_id"]), STAMP, STAMP, r["model_version"])),
            ]
            for table, columns, mapper in governed_specs:
                mapped = [mapper(row) for row in duck_rows(duck, table)]
                actions[table] = insert_rows(cur, table, columns, mapped)
                counts[table] = len(mapped)

            final_specs: list[tuple[str, tuple[str, ...], Any]] = [
                ("domain_association", ("association_id", "domain_id_a", "domain_id_b", "entity_unit", "weighted_support", "effective_sample_size", "prevalence_a", "prevalence_b", "joint_prevalence_low", "joint_prevalence_base", "joint_prevalence_high", "lift", "method_code", "independence_assumed", "caveat", "model_version_id", "run_id", "created_at", "updated_at", "data_version"), lambda r: (r["association_id"], r["domain_id_a"], r["domain_id_b"], r["entity_unit"], r["weighted_support"], r["effective_sample_size"], r["prevalence_a"], r["prevalence_b"], r["joint_prevalence_low"], r["joint_prevalence_base"], r["joint_prevalence_high"], r["lift"], r["method_code"], r["independence_assumed"], r["caveat"], mapped_model(r["model_version"]), mapped_run(r["run_id"]), STAMP, STAMP, r["model_version"])),
                ("domain_profile_summary", ("domain_id", "model_version_id", "profile_json", "evidence_boundary", "reference_period", "run_id", "created_at", "updated_at", "data_version"), lambda r: (r["domain_id"], mapped_model(r["model_version"]), jsonb(r["profile_json"], {}), r["evidence_boundary"], r["reference_period"], mapped_run(r["run_id"]), STAMP, STAMP, r["model_version"])),
                ("domain_coverage_audit", ("domain_id", "model_version_id", "dimensions_count", "queryable_features_count", "behavior_templates_count", "tags_count", "archetypes_count", "allocated_parent_count", "acceptance_count", "coverage_score", "confidence_grade", "gaps_json", "audited_at", "run_id", "created_at", "updated_at", "data_version"), lambda r: (r["domain_id"], mapped_model(r["model_version"]), r["dimensions_count"], r["queryable_features_count"], r["behavior_templates_count"], r["tags_count"], r["archetypes_count"], r["allocated_parent_count"], r["acceptance_count"], r["coverage_score"], r["confidence_grade"], jsonb(r["gaps_json"], []), r["audited_at"], mapped_run(r["run_id"]), STAMP, STAMP, r["model_version"])),
                ("segment_observation", ("observation_id", "subtype_id", "observed_at", "observation_type", "aggregate_count", "outcome_count", "soft_membership_sum", "channel_context", "sampling_context", "consent_basis", "contains_personal_data", "bias_flags", "created_at", "updated_at", "data_version"), lambda r: (r["observation_id"], r["subtype_id"], r["observed_at"], r["observation_type"], r["aggregate_count"], r["outcome_count"], r["soft_membership_sum"], jsonb(r["channel_context_json"], {}), jsonb(r["sampling_context_json"], {}), r["consent_basis"], r["contains_personal_data"], jsonb(r["bias_flags_json"], []), STAMP, STAMP, "kr-v0.2.1")),
                ("posterior_update", ("posterior_update_id", "subtype_id", "observation_id", "prior_parameters", "likelihood_specification", "posterior_parameters", "posterior_mean", "posterior_low", "posterior_high", "diagnostics", "update_status", "model_version_id", "run_id", "created_at", "updated_at", "data_version"), lambda r: (r["posterior_update_id"], r["subtype_id"], r["observation_id"], jsonb(r["prior_parameters_json"], {}), jsonb(r["likelihood_specification_json"], {}), jsonb(r["posterior_parameters_json"], {}), r["posterior_mean"], r["posterior_low"], r["posterior_high"], jsonb(r["diagnostics_json"], {}), r["update_status"], mapped_model(r["model_version"]), mapped_run(r["run_id"]), STAMP, STAMP, r["model_version"])),
                ("phase2_acceptance_result", ("case_id", "case_type", "domain_id", "phase1_archetype_id", "description", "query_json", "result_json", "status", "executed_at", "model_version_id", "run_id", "created_at", "updated_at", "data_version"), lambda r: (r["case_id"], r["case_type"], r.get("domain_id"), r.get("phase1_archetype_id"), r["description"], jsonb(r["query_json"], {}), jsonb(r["result_json"], {}), r["status"], r["executed_at"], mapped_model(r["model_version"]), mapped_run(r["run_id"]), STAMP, STAMP, r["model_version"])),
            ]
            for table, columns, mapper in final_specs:
                mapped = [mapper(row) for row in duck_rows(duck, table)]
                actions[table] = insert_rows(cur, table, columns, mapped)
                counts[table] = len(mapped)

            workspace_id = stable_uuid("workspace", "default")
            workspace_rows = [(workspace_id, "default", "Market Intelligence Workbench", "active", STAMP, STAMP)]
            actions["workspace"] = insert_rows(cur, "workspace", ("workspace_id", "workspace_key", "name", "status", "created_at", "updated_at"), workspace_rows)
            counts["workspace"] = len(workspace_rows)
            actor_id = stable_uuid("actor", "trusted-local")
            member_rows = [(workspace_id, actor_id, "owner", STAMP, STAMP)]
            actions["workspace_member"] = insert_rows(cur, "workspace_member", ("workspace_id", "actor_id", "role", "created_at", "updated_at"), member_rows)
            counts["workspace_member"] = len(member_rows)

            verification = {
                "domains": cur.execute("SELECT count(*) FROM domain_registry WHERE active").fetchone()[0],
                "axes": cur.execute("SELECT count(*) FROM domain_dimension").fetchone()[0],
                "features": cur.execute("SELECT count(*) FROM domain_feature").fetchone()[0],
                "behaviors": cur.execute("SELECT count(*) FROM domain_behavior_template").fetchone()[0],
                "models": cur.execute("SELECT count(*) FROM segmentation_model").fetchone()[0],
                "subtypes": cur.execute("SELECT count(*) FROM subtype_definition WHERE is_primary").fetchone()[0],
                "allocations": cur.execute("SELECT count(*) FROM subtype_allocation").fetchone()[0],
                "archetypes": cur.execute("SELECT count(*) FROM archetype").fetchone()[0],
                "activation": cur.execute("SELECT count(*) FROM activation_mapping").fetchone()[0],
            }
            expected = {"domains": 24, "axes": 384, "features": 480, "behaviors": 240, "models": 24, "subtypes": 90, "allocations": 450, "archetypes": 1440, "activation": 90}
            if verification != expected:
                raise RuntimeError(f"PostgreSQL baseline verification failed: {verification}")
            cur.execute(
                "INSERT INTO baseline_import_manifest(import_key,source_uri,source_sha256,model_version,table_counts,verification_json) VALUES (%s,%s,%s,%s,%s,%s)",
                (IMPORT_KEY, str(DUCKDB_PATH.relative_to(ROOT)), source_hash, "kr-v0.2.1", Jsonb(counts), Jsonb({"status": "passed", **verification})),
            )
        print(json.dumps({"status": "imported", "verification": verification, "actions": actions, "table_counts": counts}, ensure_ascii=False, indent=2))
    finally:
        duck.close()
        pg.close()


if __name__ == "__main__":
    main()
