from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import duckdb
import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from market_engine.paths import ROOT
from market_engine.phase2r_b import OUTPUT_DIR, VERSION, build_phase2r_b


TABLE_KEYS: dict[str, tuple[str, ...]] = {
    "calibration_run": ("calibration_run_id",),
    "calibration_field_mapping": ("mapping_id",),
    "calibration_control_result": ("calibration_run_id", "control_dimension", "category_json"),
    "allocation_model": ("allocation_model_id",),
    "domain_market_summary": ("domain_id",),
    "archetype_market_summary": ("archetype_id", "domain_context_id"),
    "subtype_market_summary": ("subtype_id",),
    "axis_distribution": ("dimension_id", "value_code"),
    "feature_prevalence": ("domain_feature_id",),
    "behavior_prevalence": ("behavior_template_id",),
    "gold_query_result": ("query_id",),
    "estimate_factor_lineage": ("factor_id",),
    "confidence_breakdown": ("subject_type", "subject_id"),
    "geography_distribution": ("subject_type", "subject_id", "geography_code"),
    "trend_spend_summary": ("subject_type", "subject_id", "metric_code", "reference_year"),
}


JSON_COLUMNS = {
    "control_spec_json", "diagnostics_json", "category_json", "source_release_ids",
    "context_domains", "supporting_sources", "related_archetypes", "related_features",
    "related_behaviors", "activation_json", "value_distribution", "structured_conditions",
    "spend_json", "tam_sam_som_basis", "factors_json", "confidence_components",
    "validation_items",
}


def _artifact_rows(table: str) -> tuple[list[str], list[tuple[Any, ...]]]:
    path = OUTPUT_DIR / f"{table}.parquet"
    if not path.exists():
        raise RuntimeError(f"required Phase 2R-B artifact missing: {path}")
    con = duckdb.connect()
    rows = con.execute(f"SELECT * FROM read_parquet('{path.as_posix()}')").fetchall()
    columns = [item[0] for item in con.description]
    con.close()
    converted: list[tuple[Any, ...]] = []
    for row in rows:
        converted.append(tuple(
            Jsonb(json.loads(value)) if column in JSON_COLUMNS and value is not None else value
            for column, value in zip(columns, row, strict=True)
        ))
    return columns, converted


def _upsert_table(cursor: psycopg.Cursor[Any], table: str) -> int:
    columns, rows = _artifact_rows(table)
    keys = TABLE_KEYS[table]
    mutable = [column for column in columns if column not in keys]
    statement = sql.SQL("INSERT INTO production.{table} ({columns}) VALUES ({values}) ON CONFLICT ({keys}) DO UPDATE SET {updates}").format(
        table=sql.Identifier(table),
        columns=sql.SQL(",").join(map(sql.Identifier, columns)),
        values=sql.SQL(",").join(sql.Placeholder() for _ in columns),
        keys=sql.SQL(",").join(map(sql.Identifier, keys)),
        updates=sql.SQL(",").join(
            sql.SQL("{column}=excluded.{column}").format(column=sql.Identifier(column))
            for column in mutable
        ),
    )
    cursor.executemany(statement, rows)
    return len(rows)


def backfill(database_url: str, *, rebuild: bool = False) -> dict[str, Any]:
    if rebuild or not (OUTPUT_DIR / "calibration_run.parquet").exists():
        build_phase2r_b()
    counts: dict[str, int] = {}
    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (VERSION,))
            cursor.execute("SELECT to_regclass('production.calibration_run') AS relation")
            if cursor.fetchone()["relation"] is None:
                raise RuntimeError("migration 021_phase2r_b_calibrated_market_mart.sql must be applied first")
            for table in TABLE_KEYS:
                counts[table] = _upsert_table(cursor, table)
            # Confidence subjects may be context-expanded between model versions.
            # Remove only stale Phase 2R-B confidence keys; all rows in this new
            # table are owned by this backfill.
            confidence_columns, confidence_artifact_rows = _artifact_rows("confidence_breakdown")
            subject_type_index = confidence_columns.index("subject_type")
            subject_id_index = confidence_columns.index("subject_id")
            desired_confidence = {
                (row[subject_type_index], row[subject_id_index]) for row in confidence_artifact_rows
            }
            current_confidence = {
                (row["subject_type"], row["subject_id"])
                for row in cursor.execute(
                    "SELECT subject_type,subject_id FROM production.confidence_breakdown"
                ).fetchall()
            }
            cursor.executemany(
                "DELETE FROM production.confidence_breakdown WHERE subject_type=%s AND subject_id=%s",
                list(current_confidence - desired_confidence),
            )
            database_counts = {
                table: cursor.execute(
                    sql.SQL("SELECT count(*) AS count FROM production.{}").format(sql.Identifier(table))
                ).fetchone()["count"]
                for table in TABLE_KEYS
            }
            fixture_count = cursor.execute(
                """
                SELECT count(*) AS count FROM production.v_primary_explorer
                WHERE lower(display_name_ko) LIKE '%fixture%' OR lower(display_name_ko) LIKE '%test%'
                   OR lower(display_name_ko) LIKE '%integration%'
                """
            ).fetchone()["count"]
    return {
        "version": VERSION,
        "loaded_rows": counts,
        "database_counts": database_counts,
        "production_read_model_fixture_count": fixture_count,
        "status": "passed" if fixture_count == 0 else "failed",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Idempotently backfill the Phase 2R-B production market-sizing mart")
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--rebuild", action="store_true")
    args = parser.parse_args()
    print(json.dumps(backfill(args.database_url, rebuild=args.rebuild), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
