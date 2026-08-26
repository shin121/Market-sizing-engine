BEGIN;

-- Operational metadata for the deterministic DuckDB/Parquet -> PostgreSQL
-- import. The source artifacts stay immutable; a second import with the same
-- key verifies the recorded fingerprint and performs no inserts.
CREATE TABLE IF NOT EXISTS baseline_import_manifest (
    import_key text PRIMARY KEY,
    source_uri text NOT NULL,
    source_sha256 text NOT NULL,
    model_version text NOT NULL,
    table_counts jsonb NOT NULL,
    verification_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    imported_at timestamptz NOT NULL DEFAULT now(),
    verified_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'market_engine_app') THEN
        CREATE ROLE market_engine_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'market_engine_worker') THEN
        CREATE ROLE market_engine_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO market_engine_app, market_engine_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO market_engine_app, market_engine_worker;
GRANT INSERT, UPDATE ON
    workspace, workspace_member, saved_segment, saved_segment_version,
    segment_condition_group, segment_condition, estimate, estimate_component,
    estimate_dependency, estimate_sensitivity_result, segment_query,
    segment_query_result, market_scenario, market_estimate,
    scenario_factor_override, comparison_workspace, comparison_member,
    opportunity_board, opportunity, opportunity_segment_link,
    opportunity_score_version, opportunity_score_component,
    opportunity_content_version, opportunity_experiment, research_job,
    research_job_step, proposed_revision, proposed_revision_evidence,
    review_item, audit_event
TO market_engine_app;
GRANT INSERT ON
    confidence_assessment, validation_gap, data_release_version
TO market_engine_app;
GRANT DELETE ON comparison_member TO market_engine_app;
GRANT INSERT, UPDATE ON
    research_job, research_job_step, proposed_revision, proposed_revision_evidence,
    review_item, audit_event
TO market_engine_worker;
GRANT INSERT ON research_job_event, research_job_artifact TO market_engine_app, market_engine_worker;
GRANT INSERT ON review_decision TO market_engine_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO market_engine_app, market_engine_worker;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO market_engine_app, market_engine_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO market_engine_app, market_engine_worker;

COMMIT;
