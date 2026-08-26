from __future__ import annotations

from typing import Any

from .build import build_database
from .calibration import calibrate_adults
from .reporting import generate_quality_reports
from .scenarios import run_example_scenarios
from .synthesis import synthesize_minors_households
from .history import build_source_history
from .acceptance import run_acceptance_queries
from .phase2 import build_phase2_database, PHASE2_DB
from .phase2_acceptance import run_phase2_acceptance
from .phase2_services import record_observation, update_posterior
from .phase2_reporting import generate_phase2_reports
from .services import validate_model


def full_build() -> dict[str, Any]:
    adult = calibrate_adults(verify_checksums=True)
    history = build_source_history()
    minors = synthesize_minors_households()
    core = build_database()
    quality = generate_quality_reports()
    scenarios = run_example_scenarios()
    acceptance = run_acceptance_queries()
    phase2 = build_phase2_database(sample_size=1000)
    import duckdb
    check = duckdb.connect(str(PHASE2_DB),read_only=True)
    try:
        feedback_exists = check.execute("SELECT count(*)>0 FROM segment_observation").fetchone()[0]
    finally:
        check.close()
    feedback = None
    if not feedback_exists:
        observation = record_observation({
            "subtype_id":"DOM-01-SUB-01","observation_type":"conversion","aggregate_count":240,"outcome_count":31,
            "soft_membership_sum":83.5,"channel_context":{"channel":"contextual_music_content","campaign":"phase2-example"},
            "sampling_context":{"design":"randomized_holdout","selection":"eligible contextual impressions"},
            "consent_basis":"aggregate_non_personal_measurement","bias_flags":["synthetic_to_campaign_transport"],
        })
        feedback = update_posterior(observation["observation_id"])
    phase2_acceptance = run_phase2_acceptance()
    phase2_reports = generate_phase2_reports()
    validation = validate_model()
    if validation["status"] != "passed" or scenarios["scenario_count"] < 3:
        raise RuntimeError("full build validation failed")
    return {"adult_calibration":adult["metrics"],"source_history_years":history["years"],"minor_household_synthesis":minors["metrics"],"core":core,"quality":quality,"acceptance":acceptance,"scenario_count":scenarios["scenario_count"],"phase2":phase2,"phase2_feedback":feedback,"phase2_acceptance":phase2_acceptance,"phase2_reports":phase2_reports,"validation":validation}
