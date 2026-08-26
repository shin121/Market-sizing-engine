from market_engine.paths import REPORT_DIR
from market_engine.reporting import generate_quality_reports
from market_engine.scenarios import run_example_scenarios
from market_engine.synthesis import synthesize_minors_households


def test_minor_household_synthesis_reconciles_and_has_no_orphans() -> None:
    result = synthesize_minors_households()
    assert result["metrics"]["minor_relative_error"] < 0.005
    assert result["metrics"]["household_relative_error"] < 0.005
    assert result["metrics"]["orphan_links"] == 0
    suppression = result["metrics"]["runtime_rare_output_suppression_scope"]
    assert suppression["weighted_base_threshold"] == 10
    assert suppression["python_derived_units"] == ["person", "child_person", "household"]
    assert suppression["web_query_snapshot_units"] == ["person", "child_person", "household"]
    assert suppression["official_direct_control_ingestion_exempt"] is True
    assert suppression["shared_baseline_read_model_redaction"] is False
    report = (REPORT_DIR / "minor_household_synthesis.md").read_text(encoding="utf-8")
    assert "workspace-owned web query snapshots" in report
    assert "not a claim of universal disclosure control" in report


def test_three_market_scenarios_and_quality_reports() -> None:
    scenarios = run_example_scenarios()
    assert scenarios["scenario_count"] >= 3
    for result in scenarios["results"]:
        assert result["tam_entities"]["base"] >= result["sam_entities"]["base"] >= result["som_entities"]["base"]
    quality = generate_quality_reports()
    assert quality["metrics"]["reconciliation_max_relative_error"] < 0.005
    assert quality["metrics"]["calibration_aggregation_mape"] < 0.02
    assert quality["metrics"]["calibration_aggregation_tolerance_coverage"] == 1.0
    assert quality["metrics"]["independent_holdout_status"] == "not_available"
    assert quality["metrics"]["independent_holdout_reason"] == (
        "Age-band totals are deterministic sums of the same age-band × sex calibration controls; "
        "no observations were separated for out-of-sample evaluation."
    )
    assert "holdout_mape" not in quality["metrics"]
    assert "holdout_interval_coverage" not in quality["metrics"]
    report = (REPORT_DIR / "estimation_quality.md").read_text(encoding="utf-8")
    assert "## Calibration aggregation check" in report
    assert "## Holdout cross-tab" not in report
    assert "Independent holdout status: `not_available`" in report
