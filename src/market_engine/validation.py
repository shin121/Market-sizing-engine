from __future__ import annotations

from typing import Any
import json

from .paths import PROCESSED_DIR, REPORT_DIR

from .repository import EngineRepository


def validate_model(repository: EngineRepository | None = None) -> dict[str, Any]:
    owns_repository = repository is None
    repo = repository or EngineRepository()
    con = repo.connection
    try:
        minor_links = PROCESSED_DIR / "synthetic_minor_household_links.parquet"
        minor_cells = PROCESSED_DIR / "minor_population_cells.parquet"
        quality_path = REPORT_DIR / "quality_metrics.json"
        acceptance_path = REPORT_DIR / "acceptance_queries.json"
        scenarios_path = REPORT_DIR / "market_scenarios.json"
        quality = json.loads(quality_path.read_text(encoding="utf-8")) if quality_path.exists() else {}
        acceptance = json.loads(acceptance_path.read_text(encoding="utf-8")) if acceptance_path.exists() else {}
        scenarios = json.loads(scenarios_path.read_text(encoding="utf-8")) if scenarios_path.exists() else []
        minor_columns = []
        orphan_links = -1
        if minor_links.exists():
            minor_columns = [row[0].lower() for row in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{minor_links.as_posix()}')").fetchall()]
            orphan_links = con.execute(f"SELECT count(*) FROM read_parquet('{minor_links.as_posix()}') WHERE synthetic_household_key IS NULL OR synthetic_guardian_key IS NULL").fetchone()[0]
        checks = {
            "sources_registered": con.execute("SELECT count(*) >= 4 FROM data_source").fetchone()[0],
            "source_release_history_registered": con.execute("SELECT count(*) >= 10 FROM source_release").fetchone()[0],
            "all_baselines_have_lineage": con.execute("SELECT count(*) = 0 FROM baseline_cell b LEFT JOIN source_release r USING(release_id) WHERE r.release_id IS NULL").fetchone()[0],
            "all_baselines_have_period": con.execute("SELECT count(*) = 0 FROM baseline_cell WHERE period IS NULL OR period = ''").fetchone()[0],
            "probability_intervals_ordered": con.execute("SELECT count(*) = 0 FROM probability_model WHERE probability_low > probability_base OR probability_base > probability_high").fetchone()[0],
            "probabilities_in_unit_interval": con.execute("SELECT count(*) = 0 FROM probability_model WHERE probability_low < 0 OR probability_high > 1").fetchone()[0],
            "required_units_present": set(r[0] for r in con.execute("SELECT DISTINCT entity_unit FROM baseline_cell").fetchall()) >= {"person","child_person","household","establishment","enterprise"},
            "categories_in_range": 12 <= con.execute("SELECT count(*) FROM category").fetchone()[0] <= 20,
            "archetype_minimum_met": con.execute("SELECT count(*) >= 1200 FROM archetype").fetchone()[0],
            "archetype_rules_unique": con.execute("SELECT count(*) = count(DISTINCT rule_hash) FROM archetype").fetchone()[0],
            "archetype_category_floor": con.execute("SELECT min(n) >= 80 FROM (SELECT category_code, count(*) n FROM archetype GROUP BY category_code)").fetchone()[0],
            "every_archetype_has_estimate_status": con.execute("SELECT count(*) = 0 FROM archetype a LEFT JOIN archetype_estimate e USING(archetype_id) WHERE e.archetype_id IS NULL").fetchone()[0],
            "inferred_needs_disclosed": con.execute("SELECT count(*) = 0 FROM archetype WHERE CAST(inferred_needs_json AS VARCHAR) NOT LIKE '%inferred_need_not_observed%'").fetchone()[0],
            "estimated_archetypes_complete": con.execute("SELECT count(*) = 0 FROM archetype_estimate WHERE status='estimated' AND (count_low IS NULL OR denominator='' OR reference_period='' OR formula='' OR confidence_score IS NULL OR json_array_length(source_release_ids_json)=0 OR json_array_length(validation_gaps_json)=0)").fetchone()[0],
            "not_estimable_is_null_not_zero": con.execute("SELECT count(*) = 0 FROM archetype_estimate WHERE status='not_estimable' AND (count_low IS NOT NULL OR count_base IS NOT NULL OR count_high IS NOT NULL)").fetchone()[0],
            "overlap_non_additivity_disclosed": con.execute("SELECT count(*) = 0 FROM archetype WHERE overlap_note NOT LIKE '%합산 금지%'").fetchone()[0],
            "representatives_complete": con.execute("SELECT count(*) = (SELECT count(*) FROM archetype) FROM archetype_representative").fetchone()[0],
            "minor_exact_age_cells_present": minor_cells.exists() and con.execute(f"SELECT count(*) = 19 FROM read_parquet('{minor_cells.as_posix()}')").fetchone()[0],
            "minor_links_have_no_orphans": orphan_links == 0,
            "minor_artifact_has_no_direct_pii_columns": bool(minor_columns) and not any(any(token in column for token in ("name","address","phone","email","contact","device","account")) for column in minor_columns),
            "reconciliation_threshold_met": quality.get("reconciliation_max_relative_error", 1) < 0.005,
            "calibration_aggregation_check_present": (
                isinstance(quality.get("calibration_aggregation_mape"), (int, float))
                and 0 <= quality["calibration_aggregation_mape"] < 0.02
                and isinstance(quality.get("calibration_aggregation_tolerance_coverage"), (int, float))
                and 0 <= quality["calibration_aggregation_tolerance_coverage"] <= 1
                and quality.get("calibration_aggregation_tolerance_persons") == 1000
                and quality.get("calibration_aggregation_rows") == 8
                and quality.get("independent_holdout_status") == "not_available"
                and bool(quality.get("independent_holdout_reason"))
            ),
            "acceptance_twenty_passed": acceptance.get("total", 0) >= 20 and acceptance.get("passed") == acceptance.get("total"),
            "three_market_scenarios_present": len(scenarios) >= 3,
        }
        return {"status":"passed" if all(checks.values()) else "failed","checks":checks,"passed":sum(bool(v) for v in checks.values()),"total":len(checks)}
    finally:
        if owns_repository:
            repo.close()
