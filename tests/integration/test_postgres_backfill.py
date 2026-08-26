from __future__ import annotations

import os
import shutil
from pathlib import Path
from uuid import UUID

import duckdb
import psycopg
import pytest

from market_engine.phase2 import PHASE2_DB
from market_engine.postgres_backfill import (
    BaselineDriftError,
    EXPECTED_COUNTS,
    backfill_postgres,
    verify_postgres,
)


TEST_DATABASE_URL = os.environ.get("MARKET_ENGINE_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="set MARKET_ENGINE_TEST_DATABASE_URL to an already-migrated disposable PostgreSQL database",
)


def _report_paths(tmp_path: Path, stem: str) -> tuple[Path, Path]:
    return tmp_path / f"{stem}.json", tmp_path / f"{stem}.md"


def test_postgres_backfill_is_exact_and_idempotent(tmp_path: Path) -> None:
    assert TEST_DATABASE_URL is not None
    first_json, first_markdown = _report_paths(tmp_path, "first")
    first = backfill_postgres(
        TEST_DATABASE_URL,
        manifest_json=first_json,
        manifest_markdown=first_markdown,
    )
    assert first["status"] == "passed"
    assert first["outcome"] in {"loaded", "already_current"}
    assert first["verification"]["counts"] == EXPECTED_COUNTS
    assert first_json.exists()
    assert first_markdown.exists()

    # A derived workbench estimate can reference a baseline run as its input
    # lineage. It must never become part of the immutable baseline fingerprint.
    with psycopg.connect(TEST_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO estimate (
                  estimate_id, external_estimate_key, subject_type, subject_id,
                  entity_unit, geography_id, period_id, denominator_definition,
                  count_low, count_base, count_high, share_low, share_base, share_high,
                  method_code, formula, precision_rule, model_version_id, run_id,
                  status, data_version, created_by_run_id, data_layer, approval_status
                )
                SELECT
                  '00000000-0000-4000-8000-00000000d1f7'::uuid,
                  'test:derived-baseline-fingerprint-isolation', 'query',
                  'fingerprint-isolation', 'person',
                  (SELECT geography_id FROM geography WHERE code='KR' LIMIT 1),
                  (SELECT period_id FROM time_period ORDER BY end_date DESC LIMIT 1),
                  'Regression-only derived denominator',
                  1, 2, 3, 0.01, 0.02, 0.03,
                  'test_derived', 'baseline input × derived factor',
                  'whole_entity_round_half_up',
                  (SELECT model_version_id FROM model_version WHERE version='kr-v0.2.1'),
                  run_id, 'estimated', 'test-derived-v1', run_id,
                  'derived_estimate', 'not_required'
                FROM pipeline_run
                WHERE external_run_key='RUN-P2-20260824T170416Z'
                ON CONFLICT (estimate_id) DO NOTHING
                """
            )
            cursor.execute(
                """
                INSERT INTO confidence_assessment (
                  estimate_id, source_quality_score, recency_score, directness_score,
                  joint_observation_score, model_reliance_score, total_score, grade,
                  rationale, data_version, created_by_run_id
                )
                SELECT
                  '00000000-0000-4000-8000-00000000d1f7'::uuid,
                  24, 13, 18, 20, 12, 87, 'A',
                  'Regression-only derived confidence', 'test-derived-v1', run_id
                FROM pipeline_run
                WHERE external_run_key='RUN-P2-20260824T170416Z'
                ON CONFLICT (estimate_id) DO NOTHING
                """
            )

    second_json, second_markdown = _report_paths(tmp_path, "second")
    second = backfill_postgres(
        TEST_DATABASE_URL,
        manifest_json=second_json,
        manifest_markdown=second_markdown,
    )
    assert second["outcome"] == "already_current"
    assert second["loader_run_id"] == first["loader_run_id"]
    assert second["target"]["semantic_sha256"] == first["target"]["semantic_sha256"]
    assert UUID(second["loader_run_id"]).version == 5

    verified = verify_postgres(TEST_DATABASE_URL)
    assert verified["status"] == "passed"
    assert verified["counts"] == EXPECTED_COUNTS
    assert max(
        verified["reconciliation"]["parent_base_share_max_error"],
        verified["reconciliation"]["parent_base_count_max_relative_error"],
        verified["reconciliation"]["required_parent_base_share_max_error"],
        verified["reconciliation"]["required_parent_base_count_max_relative_error"],
    ) <= verified["reconciliation"]["tolerance"]

    with psycopg.connect(TEST_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                  (SELECT count(*) FROM pipeline_run WHERE external_run_key='postgres-baseline:kr-v0.2.1'),
                  (SELECT count(*) FROM estimate
                    WHERE subject_type='archetype'
                      AND data_layer='baseline'
                      AND approval_status='approved'),
                  (SELECT count(*) FROM estimate
                    WHERE subject_type='control'
                      AND data_layer='baseline'
                      AND approval_status='approved'),
                  (SELECT count(*) FROM minor_population_cell),
                  (SELECT count(*) FROM evidence WHERE external_evidence_key IS NOT NULL)
                """
            )
            assert cursor.fetchone() == (1, 1_440, 16, 19, 19)


def test_postgres_backfill_rejects_published_source_drift(tmp_path: Path) -> None:
    assert TEST_DATABASE_URL is not None
    baseline_json, baseline_markdown = _report_paths(tmp_path, "baseline")
    current = backfill_postgres(
        TEST_DATABASE_URL,
        manifest_json=baseline_json,
        manifest_markdown=baseline_markdown,
    )

    changed_duckdb = tmp_path / "changed-baseline.duckdb"
    shutil.copy2(PHASE2_DB, changed_duckdb)
    with duckdb.connect(str(changed_duckdb)) as connection:
        connection.execute(
            "UPDATE domain_registry SET name_ko = name_ko || ' (drift)' WHERE domain_id = 'DOM-01'"
        )

    changed_json, changed_markdown = _report_paths(tmp_path, "changed")
    with pytest.raises(BaselineDriftError, match="immutable DuckDB/Parquet baseline content changed"):
        backfill_postgres(
            TEST_DATABASE_URL,
            duckdb_path=changed_duckdb,
            manifest_json=changed_json,
            manifest_markdown=changed_markdown,
        )
    assert not changed_json.exists()
    assert not changed_markdown.exists()

    after_json, after_markdown = _report_paths(tmp_path, "after")
    after = backfill_postgres(
        TEST_DATABASE_URL,
        manifest_json=after_json,
        manifest_markdown=after_markdown,
    )
    assert after["outcome"] == "already_current"
    assert after["target"]["semantic_sha256"] == current["target"]["semantic_sha256"]
