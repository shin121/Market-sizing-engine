from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.backfill_phase2r_a import build


DATABASE_URL = os.environ.get("MARKET_ENGINE_PHASE2R_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="set MARKET_ENGINE_PHASE2R_DATABASE_URL to a migrated Phase 2R-A PostgreSQL database",
)


def _scalar(connection: psycopg.Connection[tuple], sql: str) -> int:
    with connection.cursor() as cursor:
        cursor.execute(sql)
        row = cursor.fetchone()
        assert row is not None
        return int(row[0])


def _logical_hash(connection: psycopg.Connection[tuple], table: str, expression: str, order_by: str) -> tuple[int, str]:
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT count(*), md5(string_agg({expression}, ',' ORDER BY {order_by})) FROM {table}"
        )
        row = cursor.fetchone()
        assert row is not None and row[1] is not None
        return int(row[0]), str(row[1])


def test_official_universe_totals_and_partitions_close_exactly() -> None:
    assert DATABASE_URL is not None
    with psycopg.connect(DATABASE_URL) as connection:
        checks = {
            "person provinces": ("observation_id LIKE 'OBS-KR-PERSON-REGION-%'", 51_805_547),
            "person sex": ("observation_id LIKE 'OBS-KR-PERSON-SEX-%'", 51_805_547),
            "person age": (
                "observation_id IN ('OBS-KR-PERSON-AGE-03-2024','OBS-KR-PERSON-AGE-04-2024','OBS-KR-PERSON-AGE-05-2024')",
                51_805_547,
            ),
            "household provinces": ("observation_id LIKE 'OBS-KR-HOUSEHOLD-REGION-%'", 22_997_120),
            "household size": ("observation_id LIKE 'OBS-KR-HOUSEHOLD-HOUSEHOLD_SIZE-%'", 22_294_419),
            "establishment provinces": ("observation_id LIKE 'OBS-KR-ESTABLISHMENT-REGION-%'", 6_353_673),
            "establishment industry": ("observation_id LIKE 'OBS-KR-ESTABLISHMENT-INDUSTRY-%'", 6_353_673),
            "enterprise employee band": ("observation_id LIKE 'OBS-KR-ENTERPRISE-EMPLOYEE_BAND-%'", 7_641_749),
            "enterprise owner sex": ("observation_id LIKE 'OBS-KR-ENTERPRISE-OWNER-SEX-%'", 7_641_749),
            "enterprise owner age": ("observation_id LIKE 'OBS-KR-ENTERPRISE-OWNER_AGE-%'", 7_641_749),
            "enterprise legal form": ("observation_id LIKE 'OBS-KR-ENTERPRISE-LEGAL_FORM-%'", 7_641_749),
            "enterprise sales band": ("observation_id LIKE 'OBS-KR-ENTERPRISE-SALES_BAND-%'", 7_641_749),
            "enterprise business age": ("observation_id LIKE 'OBS-KR-ENTERPRISE-BUSINESS_AGE-%'", 7_641_749),
        }
        for name, (predicate, expected) in checks.items():
            assert _scalar(
                connection,
                f"SELECT coalesce(sum(value_base),0)::bigint FROM production.universe_observation WHERE {predicate}",
            ) == expected, name


def test_all_domains_have_complete_sourced_population_envelopes() -> None:
    assert DATABASE_URL is not None
    with psycopg.connect(DATABASE_URL) as connection:
        assert _scalar(connection, "SELECT count(*) FROM production.v_domain_summary") == 24
        assert _scalar(
            connection,
            """
            SELECT count(*) FROM production.v_domain_summary
            WHERE count_low IS NULL OR count_base IS NULL OR count_high IS NULL
               OR count_low > count_base OR count_base > count_high
               OR primary_entity_unit IS NULL OR reference_year IS NULL
               OR source_release_id IS NULL OR estimate_grade IS NULL
               OR confidence_score IS NULL OR method_code IS NULL OR formula IS NULL
               OR status <> 'active'
            """,
        ) == 0
        assert _scalar(
            connection,
            "SELECT count(*) FROM production.v_domain_summary WHERE lower(status)='not_estimable'",
        ) == 0
        assert _scalar(
            connection,
            """
            SELECT count(*)
            FROM production.domain_universe_mapping mapping
            LEFT JOIN production.source_document document
              ON document.release_id = mapping.source_release_id
            WHERE document.source_document_id IS NULL
            """,
        ) == 0


def test_required_universe_dimensions_and_display_names_are_complete() -> None:
    assert DATABASE_URL is not None
    with psycopg.connect(DATABASE_URL) as connection:
        required = {
            "UNIV-KR-PERSON-2024": {
                "total_population", "age", "sex", "region", "economic_activity",
                "occupation", "income", "education", "marital_status", "household_role",
            },
            "UNIV-KR-HOUSEHOLD-2024": {
                "total_households", "region", "household_size", "head_age", "children_presence",
                "children_age", "dual_income", "household_income", "housing_tenure",
                "single_person", "elderly_household",
            },
            "UNIV-KR-ENTERPRISE-2024": {
                "total_entities", "industry", "region", "employee_band", "legal_form", "owner_age",
                "sales_band", "business_age", "online_sales", "digital_tools", "store_format",
            },
        }
        with connection.cursor() as cursor:
            for universe_id, expected in required.items():
                cursor.execute(
                    "SELECT dimension_code FROM production.universe_dimension WHERE universe_id=%s",
                    (universe_id,),
                )
                assert expected <= {str(row[0]) for row in cursor.fetchall()}

        expected_label_counts = {
            "domain": 24,
            "axis": 384,
            "axis_value": 1_536,
            "segmentation_model": 24,
            "subtype": 90,
            "archetype": 1_440,
            "estimate": 24,
            "formula": 24,
            # All currently retained approved_research_factor rows are test or
            # E2E fixtures, so none may cross the production read boundary.
            "factor": 0,
            "source": 8,
        }
        for object_type, expected in expected_label_counts.items():
            assert _scalar(
                connection,
                f"SELECT count(*) FROM production.display_label WHERE object_type='{object_type}'",
            ) == expected
        assert _scalar(
            connection,
            """
            SELECT count(*) FROM production.display_label
            WHERE btrim(display_name_ko)='' OR btrim(display_name_en)='' OR btrim(description_ko)=''
            """,
        ) == 0


def test_production_read_models_exclude_fixtures_and_reject_fixture_titles() -> None:
    assert DATABASE_URL is not None
    with psycopg.connect(DATABASE_URL) as connection:
        assert _scalar(connection, "SELECT count(*) FROM production.v_saved_segment") == 0
        assert _scalar(
            connection,
            """
            SELECT count(*) FROM production.v_saved_segment
            WHERE lower(title) LIKE '%[integration]%'
               OR lower(title) LIKE '%e2e 16-step exact snapshot%'
               OR lower(title) LIKE '%fixture%'
            """,
        ) == 0
        with pytest.raises(psycopg.errors.CheckViolation):
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO production.saved_segment
                          (title,description,entity_unit,query_json,status)
                        VALUES ('[integration] forbidden','fixture probe','person','{}','active')
                        """
                    )


def test_grade_d_e_confidence_penalties_are_database_enforced() -> None:
    assert DATABASE_URL is not None
    with psycopg.connect(DATABASE_URL) as connection:
        assert _scalar(
            connection,
            """
            SELECT count(*) FROM production.universe_observation
            WHERE (estimate_grade='D' AND confidence_score > 65)
               OR (estimate_grade='E' AND confidence_score > 50)
            """,
        ) == 0
        with pytest.raises(psycopg.errors.CheckViolation):
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO production.universe_observation (
                          observation_id,universe_id,universe_dimension_id,dimension_values,
                          value_type,value_low,value_base,value_high,unit,geography_id,period_id,
                          reference_year,source_release_id,citation_id,directness,estimate_grade,
                          method_code,formula,confidence_score,is_direct_value,version
                        )
                        SELECT 'OBS-TEST-GRADE-D-PENALTY',universe_id,universe_dimension_id,
                               dimension_values,value_type,value_low,value_base,value_high,unit,
                               geography_id,period_id,reference_year,source_release_id,citation_id,
                               'proxy','D',method_code,formula,66,false,'test'
                        FROM production.universe_observation
                        WHERE observation_id='OBS-KR-PERSON-TOTAL-2024'
                        """
                    )


def test_backfill_is_logically_idempotent() -> None:
    assert DATABASE_URL is not None
    expression = "observation_id||':'||value_low||':'||value_base||':'||value_high||':'||unit||':'||reference_year||':'||source_release_id"
    mapping_expression = "domain_id||':'||count_low||':'||count_base||':'||count_high||':'||estimate_grade||':'||confidence_score||':'||source_release_id"
    with psycopg.connect(DATABASE_URL) as connection:
        before_observations = _logical_hash(connection, "production.universe_observation", expression, "observation_id")
        before_mappings = _logical_hash(connection, "production.domain_universe_mapping", mapping_expression, "domain_id")
        build(connection)
        after_observations = _logical_hash(connection, "production.universe_observation", expression, "observation_id")
        after_mappings = _logical_hash(connection, "production.domain_universe_mapping", mapping_expression, "domain_id")
        assert after_observations == before_observations
        assert after_mappings == before_mappings
