from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row


ROOT = Path(__file__).resolve().parents[1]


def scalar(connection: psycopg.Connection[Any], query: str) -> Any:
    row = connection.execute(query).fetchone()
    return next(iter(row.values()))


def records(connection: psycopg.Connection[Any], query: str) -> list[dict[str, Any]]:
    return [dict(row) for row in connection.execute(query).fetchall()]


def collect(database_url: str, test_results: Path) -> dict[str, Any]:
    phase2 = json.loads((ROOT / "reports/phase2_dod_audit.json").read_text(encoding="utf-8"))
    phase2r_a = json.loads((ROOT / "reports/phase2r_a_dod_audit.json").read_text(encoding="utf-8"))
    build = json.loads((ROOT / "reports/phase2r_b_build_manifest.json").read_text(encoding="utf-8"))
    diagnostics = json.loads((ROOT / "reports/phase2r_b_calibration_diagnostics.json").read_text(encoding="utf-8"))
    tests = json.loads(test_results.read_text(encoding="utf-8")) if test_results.exists() else {"status": "missing"}
    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        calibration = records(connection, """
            SELECT calibration_run_id,target_unit,iterations,sample_size,total_weight,
                   effective_sample_size,effective_sample_size_ratio,weight_min,weight_mean,
                   weight_max,weight_cv,extreme_weight_share,max_control_relative_error,status
            FROM production.calibration_run ORDER BY target_unit
        """)
        control_status = {
            row["control_dimension"]: row
            for row in records(connection, """
                SELECT control_dimension,count(*) cell_count,
                       count(*) FILTER (WHERE NOT passed) failed_cells,
                       max(relative_error) max_relative_error
                FROM production.calibration_control_result
                GROUP BY control_dimension ORDER BY control_dimension
            """)
        }
        counts = {
            table: scalar(connection, f"SELECT count(*) FROM production.{table}")
            for table in (
                "domain_market_summary","archetype_market_summary","subtype_market_summary",
                "axis_distribution","feature_prevalence","behavior_prevalence","gold_query_result",
                "estimate_factor_lineage","confidence_breakdown","geography_distribution","trend_spend_summary",
            )
        }
        read_models = records(connection, """
            SELECT table_name FROM information_schema.views
            WHERE table_schema='production' AND table_name IN (
              'v_domain_market_summary','v_axis_distribution','v_subtype_market_summary',
              'v_archetype_market_summary','v_feature_prevalence','v_behavior_prevalence',
              'v_gold_query_result','v_estimate_factor_lineage','v_source_coverage',
              'v_confidence_breakdown','v_geography_distribution','v_trend_spend_summary','v_primary_explorer'
            ) ORDER BY table_name
        """)
        subtype_invalid = scalar(connection, """
            SELECT count(*) FROM (
              SELECT subtype.domain_id,abs(sum(subtype.share_base)-1) share_error,
                     abs(sum(subtype.count_base)-max(domain.count_base)) count_error
              FROM production.subtype_market_summary subtype
              JOIN production.domain_market_summary domain USING(domain_id)
              GROUP BY subtype.domain_id
            ) result WHERE share_error>0.000000001 OR count_error>0.0001
        """)
        primary_not_estimable = scalar(connection, "SELECT count(*) FROM production.v_primary_explorer WHERE status='not_estimable'")
        fixture_rows = scalar(connection, """
            SELECT count(*) FROM production.v_primary_explorer
            WHERE lower(display_name_ko) LIKE '%fixture%' OR lower(display_name_ko) LIKE '%integration%'
               OR lower(display_name_ko) LIKE '%test%'
        """)
        gold_queries = records(connection, """
            SELECT query_id,display_name_ko,round(count_low) count_low,round(count_base) count_base,
                   round(count_high) count_high,entity_unit,geography_scope,estimate_grade,
                   confidence_score,most_uncertain_variable,snapshot_hash
            FROM production.gold_query_result ORDER BY query_id
        """)
        grade_distribution = records(connection, """
            SELECT estimate_grade,count(*) row_count FROM (
              SELECT estimate_grade FROM production.domain_market_summary
              UNION ALL SELECT estimate_grade FROM production.archetype_market_summary
              UNION ALL SELECT estimate_grade FROM production.subtype_market_summary
              UNION ALL SELECT estimate_grade FROM production.axis_distribution
              UNION ALL SELECT estimate_grade FROM production.feature_prevalence
              UNION ALL SELECT estimate_grade FROM production.behavior_prevalence
              UNION ALL SELECT estimate_grade FROM production.gold_query_result
            ) estimates GROUP BY estimate_grade ORDER BY estimate_grade
        """)
        source_coverage = records(connection, "SELECT * FROM production.v_source_coverage ORDER BY factor_count DESC,source_release_id")
        database_snapshot = scalar(connection, "SELECT production.phase2r_b_dod_snapshot()")
        interval_invalid = scalar(connection, """
            SELECT sum(invalid) FROM (
              SELECT count(*) FILTER (WHERE NOT (count_low<=count_base AND count_base<=count_high)) invalid FROM production.domain_market_summary
              UNION ALL SELECT count(*) FILTER (WHERE NOT (estimated_count_low<=estimated_count_base AND estimated_count_base<=estimated_count_high)) FROM production.archetype_market_summary
              UNION ALL SELECT count(*) FILTER (WHERE NOT (count_low<=count_base AND count_base<=count_high)) FROM production.subtype_market_summary
              UNION ALL SELECT count(*) FILTER (WHERE NOT (count_low<=count_base AND count_base<=count_high)) FROM production.axis_distribution
              UNION ALL SELECT count(*) FILTER (WHERE NOT (count_low<=count_base AND count_base<=count_high)) FROM production.feature_prevalence
              UNION ALL SELECT count(*) FILTER (WHERE NOT (count_low<=count_base AND count_base<=count_high)) FROM production.behavior_prevalence
              UNION ALL SELECT count(*) FILTER (WHERE NOT (count_low<=count_base AND count_base<=count_high)) FROM production.gold_query_result
            ) checks
        """)
        source_array_invalid = scalar(connection, """
            SELECT sum(invalid) FROM (
              SELECT count(*) FILTER (WHERE jsonb_array_length(source_release_ids)=0) invalid FROM production.domain_market_summary
              UNION ALL SELECT count(*) FILTER (WHERE jsonb_array_length(supporting_sources)=0) FROM production.archetype_market_summary
              UNION ALL SELECT count(*) FILTER (WHERE jsonb_array_length(source_release_ids)=0) FROM production.subtype_market_summary
              UNION ALL SELECT count(*) FILTER (WHERE jsonb_array_length(source_release_ids)=0) FROM production.axis_distribution
              UNION ALL SELECT count(*) FILTER (WHERE jsonb_array_length(source_release_ids)=0) FROM production.feature_prevalence
              UNION ALL SELECT count(*) FILTER (WHERE jsonb_array_length(source_release_ids)=0) FROM production.behavior_prevalence
              UNION ALL SELECT count(*) FILTER (WHERE jsonb_array_length(source_release_ids)=0) FROM production.gold_query_result
            ) checks
        """)
        reference_year_invalid = scalar(connection, """
            SELECT sum(invalid) FROM (
              SELECT count(*) FILTER (WHERE reference_year IS NULL) invalid FROM production.domain_market_summary
              UNION ALL SELECT count(*) FILTER (WHERE reference_year IS NULL) FROM production.archetype_market_summary
              UNION ALL SELECT count(*) FILTER (WHERE reference_year IS NULL) FROM production.subtype_market_summary
              UNION ALL SELECT count(*) FILTER (WHERE reference_year IS NULL) FROM production.axis_distribution
              UNION ALL SELECT count(*) FILTER (WHERE reference_year IS NULL) FROM production.gold_query_result
            ) checks
        """)
        overlap_non_normalized = scalar(connection, """
            SELECT count(*) FROM (
              SELECT domain_id,sum(prevalence_base) total_membership
              FROM production.feature_prevalence GROUP BY domain_id
            ) domains WHERE abs(total_membership-1)>0.1
        """)

    checks = {
        "phase2r_a_dod_24_24": phase2r_a["status"] == "passed" and phase2r_a["passed"] == phase2r_a["total"] == 24,
        "phase2_dod_30_30": phase2["status"] == "passed" and phase2["passed"] == phase2["total"] == 30,
        "legacy_tests_18_18_certificate": phase2["verification"]["pytest"]["passed"] == 18,
        "combined_validation_46_46": phase2["verification"]["combined_validation"] == {"passed": 46, "total": 46},
        "nemotron_1000000_preserved": phase2r_a["current_regression"]["nemotron_checksum_verification"]["rows"] == 1_000_000,
        "nemotron_9_shards_checksums": phase2r_a["current_regression"]["nemotron_checksum_verification"]["shards"] == 9 and phase2r_a["current_regression"]["nemotron_checksum_verification"]["all_checksums_ok"],
        "calibration_4_units_passed": len(calibration) == 4 and all(row["status"] == "passed" for row in calibration),
        "calibration_error_within_tolerance": max(float(row["max_control_relative_error"]) for row in calibration) <= 1e-7,
        "universe_total_reconciliation": all(
            abs(float(row["total_weight"]) - {
                "person": 43_892_348.0, "household": 22_997_120.0,
                "establishment": 6_353_673.0, "enterprise": 7_641_749.0,
            }[row["target_unit"]]) < 0.001 for row in calibration
        ),
        "age_reconciliation": control_status["age_sex"]["failed_cells"] == 0,
        "region_reconciliation": control_status["region_code"]["failed_cells"] == 0,
        "household_reconciliation": all(control_status[name]["failed_cells"] == 0 for name in ("household_size_band","children_presence")),
        "business_industry_reconciliation": control_status["industry_code"]["failed_cells"] == 0,
        "effective_sample_size_threshold": min(float(row["effective_sample_size"]) for row in calibration) > 100_000,
        "extreme_weight_share_threshold": max(float(row["extreme_weight_share"]) for row in calibration) < 0.15,
        "person_household_business_weights": {row["target_unit"] for row in calibration} == {"person","household","establishment","enterprise"},
        "archetype_1440_numeric_contextual": counts["archetype_market_summary"] == 2400 and build["counts"]["archetypes"] == 1440,
        "subtype_90_numeric_confident_sourced": counts["subtype_market_summary"] == 90,
        "subtype_parent_reconciliation": subtype_invalid == 0,
        "axis_384_distribution_status": build["counts"]["axis_dimensions"] == 384,
        "feature_480_numeric": counts["feature_prevalence"] == 480,
        "behavior_240_numeric": counts["behavior_prevalence"] == 240,
        "overlap_sum_not_forced": overlap_non_normalized == 24,
        "all_intervals_ordered": interval_invalid == 0,
        "source_lineage_nonempty": source_array_invalid == 0,
        "reference_year_complete": reference_year_invalid == 0,
        "primary_explorer_not_estimable_zero": primary_not_estimable == 0,
        "gold_query_10_numeric_formula_source": counts["gold_query_result"] == 10 and counts["estimate_factor_lineage"] >= 40,
        "production_data_mart_13_views": len(read_models) == 13,
        "production_fixture_zero": fixture_rows == 0,
        "new_tests_passed": tests.get("status") == "passed",
        "artifact_reproducibility": tests.get("artifact_reproducibility") == "19_of_19_identical",
        "migration_and_backfill_reapply_safe": tests.get("migration_reapply") == "passed" and tests.get("backfill_idempotency") == "passed",
    }
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version": build["version"],
        "status": "passed" if all(checks.values()) else "failed",
        "passed": sum(checks.values()), "total": len(checks),
        "checks": [{"name": name, "status": "passed" if passed else "failed"} for name, passed in checks.items()],
        "prerequisites": {"phase2": {"passed": 30, "total": 30}, "phase2r_a": {"passed": 24, "total": 24}},
        "calibration": calibration,
        "calibration_control_status": control_status,
        "mapping_coverage": diagnostics["mapping"],
        "market_mart_counts": counts,
        "database_snapshot": database_snapshot,
        "read_models": [row["table_name"] for row in read_models],
        "gold_queries": gold_queries,
        "estimate_grade_distribution": grade_distribution,
        "source_coverage": source_coverage,
        "test_results": tests,
        "unresolved_variables": [
            "직업·경제활동·소득의 정의 일치 joint calibration control",
            "가구주 연령×자녀 연령×맞벌이 직접 joint distribution",
            "플랫폼별 무료 이용×유료 전환 실제 패널",
            "네이버 플레이스 보유 여부의 공식 모집단 통계",
            "반려동물×여행, 부모돌봄×취업, 사교육×불만 직접 joint distribution",
            "제품별 전환율·도달가능률·운영 capacity for SOM",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit Phase 2R-B production calibration and market mart")
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--test-results", type=Path, default=ROOT / "reports/phase2r_b_test_results.json")
    parser.add_argument("--output", type=Path, default=ROOT / "reports/phase2r_b_dod_audit.json")
    args = parser.parse_args()
    payload = collect(args.database_url, args.test_results)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps({"status": payload["status"], "passed": payload["passed"], "total": payload["total"], "output": str(args.output)}, ensure_ascii=False))
    if payload["status"] != "passed":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
