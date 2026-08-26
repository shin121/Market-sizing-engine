BEGIN;

-- Exercise the state that a clean schema-only reapply cannot cover: a market
-- scenario is first created directly from a query result, then a saved segment
-- version later pins that same result. Reapplying migration 010 must attach the
-- now-unambiguous segment lineage even when migration 011's stricter guard was
-- already installed by a previous release run.
INSERT INTO workspace (workspace_id, workspace_key, name)
VALUES (
    '00000000-0000-4000-8000-000000001001',
    'migration-010-stateful-reapply',
    'Migration 010 stateful reapply fixture'
);

INSERT INTO model_version (
    model_version_id, version, methodology_hash, source_manifest_hash,
    random_seed, data_version
) VALUES (
    '00000000-0000-4000-8000-000000001003',
    'migration-010-stateful-reapply-v1', repeat('1', 64), repeat('2', 64),
    10, 'migration-reapply-fixture-v1'
);

INSERT INTO pipeline_run (
    run_id, pipeline_name, started_at, finished_at, status,
    model_version_id, data_version
) VALUES (
    '00000000-0000-4000-8000-000000001004',
    'migration-010-stateful-reapply', now(), now(), 'success',
    '00000000-0000-4000-8000-000000001003',
    'migration-reapply-fixture-v1'
);

INSERT INTO geography (code, name_ko, level, valid_from, data_version)
VALUES (
    'MIG-010-REAPPLY', '마이그레이션 재적용 픽스처', 'country',
    DATE '2026-01-01', 'migration-reapply-fixture-v1'
);

INSERT INTO time_period (period_type, start_date, end_date, label, data_version)
VALUES (
    'year', DATE '2026-01-01', DATE '2026-12-31',
    'Migration 010 stateful reapply', 'migration-reapply-fixture-v1'
);

INSERT INTO estimate (
    estimate_id, subject_type, subject_id, entity_unit, geography_id, period_id,
    denominator_definition, count_low, count_base, count_high,
    method_code, formula, precision_rule, model_version_id, run_id, status,
    data_version, external_estimate_key, workspace_id, data_layer,
    approval_status, created_by_actor_id
)
SELECT
    '00000000-0000-4000-8000-000000001005', 'query',
    'migration-010-stateful-reapply', 'enterprise', geography_id, period_id,
    'Test-only enterprise fixture', 10, 12, 15,
    'migration_fixture', 'fixture_only', 'integer',
    '00000000-0000-4000-8000-000000001003',
    '00000000-0000-4000-8000-000000001004', 'estimated',
    'migration-reapply-fixture-v1', 'migration-010-stateful-reapply',
    '00000000-0000-4000-8000-000000001001', 'user_scenario', 'not_required',
    '00000000-0000-4000-8000-000000001002'
FROM geography
CROSS JOIN time_period
WHERE geography.code = 'MIG-010-REAPPLY'
  AND time_period.label = 'Migration 010 stateful reapply';

INSERT INTO segment_query (
    query_id, workspace_id, created_by_actor_id, name, filter_json,
    primary_entity_unit, geography_scope, as_of_date, query_hash, data_version
) VALUES (
    '00000000-0000-4000-8000-000000001006',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000001002',
    'Migration 010 stateful reapply query', '{}'::jsonb, 'enterprise',
    '{"level":"country","codes":["MIG-010-REAPPLY"]}'::jsonb,
    DATE '2026-08-25', repeat('3', 64), 'migration-reapply-fixture-v1'
);

INSERT INTO segment_query_result (
    result_id, query_id, estimate_id, model_version_id, executed_at,
    result_summary, data_version, result_hash, dependency_fingerprint,
    cache_status
) VALUES (
    '00000000-0000-4000-8000-000000001007',
    '00000000-0000-4000-8000-000000001006',
    '00000000-0000-4000-8000-000000001005',
    '00000000-0000-4000-8000-000000001003', now(),
    '{"fixture":"migration-010-stateful-reapply"}'::jsonb,
    'migration-reapply-fixture-v1', repeat('4', 64), repeat('4', 64), 'valid'
);

INSERT INTO saved_segment (
    saved_segment_id, workspace_id, title, created_by_actor_id
) VALUES (
    '00000000-0000-4000-8000-000000001008',
    '00000000-0000-4000-8000-000000001001',
    'Migration 010 stateful reapply segment',
    '00000000-0000-4000-8000-000000001002'
);

INSERT INTO market_scenario (
    scenario_id, name, query_id, product_definition, market_unit, currency,
    horizon_months, assumptions, version, data_version, workspace_id,
    base_query_result_id, scenario_hash, status, created_by_actor_id
) VALUES (
    '00000000-0000-4000-8000-000000001009',
    'Migration 010 stateful reapply scenario',
    '00000000-0000-4000-8000-000000001006', 'Test-only direct scenario',
    'enterprise', 'KRW', 12, '{}'::jsonb, 'migration-reapply-fixture-v1',
    'migration-reapply-fixture-v1',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000001007', repeat('5', 64), 'active',
    '00000000-0000-4000-8000-000000001002'
);

INSERT INTO saved_segment_version (
    saved_segment_id, version_no, query_id, pinned_result_id,
    definition_hash, change_reason, created_by_actor_id
) VALUES (
    '00000000-0000-4000-8000-000000001008', 1,
    '00000000-0000-4000-8000-000000001006',
    '00000000-0000-4000-8000-000000001007', repeat('6', 64),
    'stateful_reapply_fixture', '00000000-0000-4000-8000-000000001002'
);

COMMIT;
