\set ON_ERROR_STOP on

-- ACL entries in a pg_dump archive retain the source cluster role named in
-- ALTER DEFAULT PRIVILEGES, even with --no-owner. Managed PostgreSQL owners
-- are intentionally not superusers, so restore the data/schema with --no-acl
-- and apply the final runtime contract as the target deployment owner.

GRANT USAGE ON SCHEMA public, production
TO market_engine_app, market_engine_worker;
REVOKE CREATE ON SCHEMA public, production
FROM PUBLIC, market_engine_app, market_engine_worker;

GRANT SELECT ON ALL TABLES IN SCHEMA public, production
TO market_engine_app, market_engine_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
TO market_engine_app, market_engine_worker;

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
GRANT INSERT ON confidence_assessment, validation_gap, data_release_version
TO market_engine_app;
GRANT DELETE ON comparison_member TO market_engine_app;

GRANT INSERT, UPDATE ON
    research_job, research_job_step, proposed_revision,
    proposed_revision_evidence, review_item, audit_event
TO market_engine_worker;
GRANT INSERT ON research_job_event, research_job_artifact
TO market_engine_app, market_engine_worker;
GRANT INSERT ON review_decision TO market_engine_app;

REVOKE INSERT, UPDATE, DELETE ON workspace, workspace_member
FROM market_engine_app, market_engine_worker;
REVOKE UPDATE, DELETE ON
    estimate, estimate_component, estimate_assumption, estimate_dependency,
    estimate_sensitivity_result, confidence_assessment, validation_gap,
    market_scenario, market_estimate, scenario_factor_override,
    segment_query, segment_condition_group, segment_condition,
    saved_segment_version
FROM market_engine_app, market_engine_worker;
REVOKE UPDATE, DELETE ON segment_query_result
FROM market_engine_app, market_engine_worker;
GRANT UPDATE (cache_status, invalidated_at) ON segment_query_result
TO market_engine_app;

REVOKE UPDATE, DELETE ON market_scenario
FROM market_engine_app, market_engine_worker;
GRANT UPDATE (status, updated_at) ON market_scenario TO market_engine_app;

GRANT SELECT, INSERT ON approved_research_factor, approved_research_factor_source
TO market_engine_app;
GRANT SELECT ON approved_research_factor, approved_research_factor_source
TO market_engine_worker;
REVOKE UPDATE, DELETE ON approved_research_factor, approved_research_factor_source
FROM market_engine_app;
REVOKE INSERT, UPDATE, DELETE ON approved_research_factor, approved_research_factor_source
FROM market_engine_worker;

REVOKE UPDATE, DELETE ON opportunity_segment_link
FROM market_engine_app, market_engine_worker;
REVOKE INSERT ON opportunity_segment_link FROM market_engine_worker;
GRANT INSERT ON opportunity_segment_link TO market_engine_app;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON ALL TABLES IN SCHEMA production
FROM market_engine_app, market_engine_worker;

GRANT EXECUTE ON FUNCTION production.phase2r_b_dod_snapshot()
TO market_engine_app, market_engine_worker;
GRANT EXECUTE ON FUNCTION production.is_fixture_text(text)
TO market_engine_app, market_engine_worker;
REVOKE EXECUTE ON FUNCTION workbench_assert_opportunity_snapshot_invariants()
FROM PUBLIC, market_engine_app, market_engine_worker;
REVOKE EXECUTE ON FUNCTION workbench_assert_release_safe_read_boundary()
FROM PUBLIC, market_engine_app, market_engine_worker;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT ON TABLES TO market_engine_app, market_engine_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO market_engine_app, market_engine_worker;

-- Fail closed if the target owner did not retain SET OPTION membership in the
-- two NOLOGIN policy roles created before restore.
DO $privilege_contract$
BEGIN
    IF (
        SELECT count(*)
        FROM pg_catalog.pg_auth_members membership
        JOIN pg_catalog.pg_roles role ON role.oid=membership.roleid
        JOIN pg_catalog.pg_roles member ON member.oid=membership.member
        WHERE role.rolname IN ('market_engine_app', 'market_engine_worker')
          AND member.rolname=current_user
          AND membership.set_option
    ) <> 2 THEN
        RAISE EXCEPTION 'deployment owner lacks SET OPTION on both runtime policy roles';
    END IF;
END
$privilege_contract$;
