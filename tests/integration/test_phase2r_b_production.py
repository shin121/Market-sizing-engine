from __future__ import annotations

import os

import psycopg
import pytest

from scripts.backfill_phase2r_b import backfill


DATABASE_URL = os.environ.get("MARKET_ENGINE_PHASE2R_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="MARKET_ENGINE_PHASE2R_DATABASE_URL is not configured")


def test_phase2r_b_read_models_are_complete() -> None:
    assert DATABASE_URL
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            expected = {
                "v_domain_market_summary": 24,
                "v_subtype_market_summary": 90,
                "v_archetype_market_summary": 2400,
                "v_axis_distribution": 1536,
                "v_feature_prevalence": 480,
                "v_behavior_prevalence": 240,
                "v_gold_query_result": 10,
                "v_geography_distribution": 408,
                "v_trend_spend_summary": 34,
            }
            for view, count in expected.items():
                cursor.execute(f"SELECT count(*) FROM production.{view}")
                assert cursor.fetchone()[0] == count
            cursor.execute("SELECT count(*) FROM production.v_primary_explorer WHERE status='not_estimable'")
            assert cursor.fetchone()[0] == 0


def test_subtype_parent_reconciliation_and_allocation_contracts() -> None:
    assert DATABASE_URL
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT count(*) FROM (
                  SELECT subtype.domain_id,
                         abs(sum(subtype.share_base)-1) share_error,
                         abs(sum(subtype.count_base)-max(domain.count_base)) count_error
                  FROM production.subtype_market_summary subtype
                  JOIN production.domain_market_summary domain USING(domain_id)
                  GROUP BY subtype.domain_id
                ) reconciliation
                WHERE share_error > 0.000000001 OR count_error > 0.0001
                """
            )
            assert cursor.fetchone()[0] == 0
            cursor.execute("SELECT count(*) FROM production.allocation_model WHERE allocation_semantics IS NULL OR NOT production_eligible")
            assert cursor.fetchone()[0] == 0


def test_low_base_high_database_constraint() -> None:
    assert DATABASE_URL
    with psycopg.connect(DATABASE_URL) as connection:
        with pytest.raises(psycopg.errors.CheckViolation):
            connection.execute(
                "UPDATE production.gold_query_result SET count_low=count_base+1 WHERE query_id='GOLD-01'"
            )
        connection.rollback()


def test_backfill_is_logically_idempotent() -> None:
    assert DATABASE_URL
    first = backfill(DATABASE_URL)
    second = backfill(DATABASE_URL)
    assert first["loaded_rows"] == second["loaded_rows"]
    assert second["production_read_model_fixture_count"] == 0
    with psycopg.connect(DATABASE_URL) as connection:
        assert connection.execute("SELECT count(*) FROM production.calibration_run").fetchone()[0] == 4
        assert connection.execute("SELECT count(*) FROM production.gold_query_result").fetchone()[0] == 10
