BEGIN;

-- Build a rare weighted human estimate without mutating any existing fixture
-- row.  The committed migration-010 slice supplies only stable workspace,
-- actor, model, run, geography, and period identifiers; everything under test
-- here is inserted independently and rolled back at the end.
INSERT INTO category (
    code, name_ko, description, entity_units, sort_order, version,
    data_version, created_by_run_id
) VALUES (
    'migration-018-release-boundary', '마이그레이션 018 공개 경계',
    'Release-boundary regression fixture', '["person"]'::jsonb, 180,
    'migration-018-v1', 'migration-018-test',
    '00000000-0000-4000-8000-000000001004'
);

INSERT INTO archetype (
    archetype_id, category_id, name_ko, name_en, one_line_definition,
    primary_entity_unit, status, version, data_version, created_by_run_id
)
SELECT
    'migration-018-rare-person', category_id, '희소 가중 사람 셀',
    'Rare weighted human cell', 'Raw weighted base equals five.',
    'person', 'estimated', 'migration-018-v1', 'migration-018-test',
    '00000000-0000-4000-8000-000000001004'
FROM category
WHERE code = 'migration-018-release-boundary';

INSERT INTO feature_definition (
    feature_code, label_ko, entity_unit, data_type, allowed_values,
    sensitive_class, queryable, definition, data_version, created_by_run_id
) VALUES (
    'migration_018_minor_protected', '보호 대상 코어 특성', 'person',
    'boolean', '[true,false]'::jsonb, 'minor_protected', true,
    'A protected core feature must not become targetable.',
    'migration-018-test', '00000000-0000-4000-8000-000000001004'
);

INSERT INTO domain_registry (
    domain_id, domain_code, name_ko, description, primary_entity_unit,
    category_id, active, minor_guardrail, version, data_version,
    created_by_run_id
)
SELECT
    'migration-018-domain', 'migration_018_domain', '마이그레이션 018 도메인',
    'Active non-minor domain for an inconsistent legacy sensitivity flag.',
    'person', category_id, true, false, 'migration-018-v1',
    'migration-018-test', '00000000-0000-4000-8000-000000001004'
FROM category
WHERE code = 'migration-018-release-boundary';

INSERT INTO domain_dimension (
    dimension_id, domain_id, axis_code, applicability,
    applicability_reason, allowed_values, sort_order, data_version,
    created_by_run_id
) VALUES (
    'migration-018-dimension', 'migration-018-domain', 'object', 'applicable',
    'Fixture dimension', '["fixture"]'::jsonb, 1,
    'migration-018-test', '00000000-0000-4000-8000-000000001004'
);

INSERT INTO domain_feature (
    domain_feature_id, domain_id, dimension_id, feature_code, label_ko,
    data_type, allowed_values, observable_status, targetability_class,
    queryable, sensitive_class, data_version, created_by_run_id
) VALUES (
    'migration-018-restricted-feature', 'migration-018-domain',
    'migration-018-dimension', 'migration_018_restricted_feature',
    '제한 대상 도메인 특성', 'boolean', '[true,false]'::jsonb,
    'directly_observed', 'directly_targetable', true,
    'restricted_targeting', 'migration-018-test',
    '00000000-0000-4000-8000-000000001004'
);

INSERT INTO data_source (
    source_id, publisher, dataset_title, official_url, source_tier,
    source_type, population_universe, entity_unit, data_version,
    created_by_run_id
) VALUES (
    'migration-018-source', 'Migration fixture',
    'Migration 018 raw weighted evidence', 'https://example.invalid/migration-018',
    1, 'official_statistics', 'Test-only person universe', 'person',
    'migration-018-test', '00000000-0000-4000-8000-000000001004'
);

INSERT INTO source_release (
    release_id, source_id, version_label, reference_period_start,
    reference_period_end, publication_date, retrieved_at, checksum, status,
    data_version, created_by_run_id
) VALUES (
    'migration-018-release', 'migration-018-source', 'migration-018-v1',
    DATE '2026-01-01', DATE '2026-12-31', DATE '2026-08-25', now(),
    repeat('1', 64), 'verified', 'migration-018-test',
    '00000000-0000-4000-8000-000000001004'
);

INSERT INTO evidence (
    release_id, locator, supported_claim, value, unit, denominator,
    extraction_method, reviewer_status, data_version, created_by_run_id,
    external_evidence_key, source_treatment
) VALUES (
    'migration-018-release', 'table=rare_people,row=raw_count_base_5',
    'The raw weighted base is five people.', 5, 'person',
    'Raw weighted denominator equals five.', 'migration_fixture',
    'human_reviewed', 'migration-018-test',
    '00000000-0000-4000-8000-000000001004',
    'migration-018-raw-five', 'raw'
);

INSERT INTO estimate (
    estimate_id, subject_type, subject_id, entity_unit, geography_id, period_id,
    denominator_definition, count_low, count_base, count_high,
    share_low, share_base, share_high, method_code, formula, precision_rule,
    model_version_id, run_id, status, data_version, created_by_run_id,
    external_estimate_key, workspace_id, data_layer, approval_status,
    calculation_input_hash, dependency_fingerprint, created_by_actor_id
)
SELECT
    '00000000-0000-4000-8000-000000001801', 'archetype',
    'migration-018-rare-person', 'person', geography.geography_id,
    period.period_id, 'Raw denominator=5 weighted people', 4, 5, 6,
    0.04, 0.05, 0.06, 'raw_base_5_weighted_method',
    'weighted raw formula: 4 / 5 / 6 people', 'raw_weighted_decimal',
    '00000000-0000-4000-8000-000000001003',
    '00000000-0000-4000-8000-000000001004', 'estimated',
    'migration-018-test', '00000000-0000-4000-8000-000000001004',
    'migration-018-rare-person',
    '00000000-0000-4000-8000-000000001001', 'approved_version',
    'approved', repeat('2', 64), repeat('3', 64),
    '00000000-0000-4000-8000-000000001002'
FROM geography
CROSS JOIN time_period period
WHERE geography.code = 'MIG-010-REAPPLY'
  AND period.label = 'Migration 010 stateful reapply';

-- A non-human control proves that the policy does not silently interchange
-- person and enterprise units even when the numeric interval is identical.
INSERT INTO estimate (
    estimate_id, subject_type, subject_id, entity_unit, geography_id, period_id,
    denominator_definition, count_low, count_base, count_high,
    method_code, formula, precision_rule, model_version_id, run_id, status,
    data_version, external_estimate_key, workspace_id, data_layer,
    approval_status, created_by_actor_id
)
SELECT
    '00000000-0000-4000-8000-000000001802', 'control',
    'migration-018-enterprise-control', 'enterprise', geography.geography_id,
    period.period_id, 'Five enterprises', 4, 5, 6,
    'weighted_fixture', 'weighted enterprise interval 4 / 5 / 6',
    'raw_weighted_decimal',
    '00000000-0000-4000-8000-000000001003',
    '00000000-0000-4000-8000-000000001004', 'estimated',
    'migration-018-test', 'migration-018-enterprise-control',
    '00000000-0000-4000-8000-000000001001', 'approved_version',
    'approved', '00000000-0000-4000-8000-000000001002'
FROM geography
CROSS JOIN time_period period
WHERE geography.code = 'MIG-010-REAPPLY'
  AND period.label = 'Migration 010 stateful reapply';

INSERT INTO estimate_component (
    estimate_id, component_type, value_low, value_base, value_high, unit,
    evidence_id, operation, sequence, data_version, created_by_run_id,
    component_code, denominator_definition, conditional_probability,
    reference_period_id, directness_class, dependency_group,
    model_version_id, adjustment_reason, metadata_json
)
SELECT
    '00000000-0000-4000-8000-000000001801', 'raw_base_5_component', 4, 5, 6,
    'raw_base_5_person', evidence.evidence_id, 'raw_base_5_operation', 1, 'migration-018-test',
    '00000000-0000-4000-8000-000000001004', 'raw_base_5_component_code',
    'Component denominator=5 people', 0.5, period.period_id,
    'direct_observation', 'raw_base_5_dependency_group',
    '00000000-0000-4000-8000-000000001003',
    'Adjustment echoes raw base 5.', '{"raw_count_base":5}'::jsonb
FROM evidence
CROSS JOIN time_period period
WHERE evidence.external_evidence_key = 'migration-018-raw-five'
  AND period.label = 'Migration 010 stateful reapply';

INSERT INTO assumption (
    code, statement, value_low, value_base, value_high, unit, justification,
    source_release_id, sensitivity_rank, data_version, created_by_run_id
) VALUES (
    'migration-018-raw-base-5-assumption', 'Assume the raw interval is 4 / 5 / 6.',
    4, 5, 6, 'raw_base_5_person', 'Justification echoes raw base 5.',
    'migration-018-release', 1, 'migration-018-test',
    '00000000-0000-4000-8000-000000001004'
);

INSERT INTO estimate_assumption (
    estimate_id, assumption_id, data_version, created_by_run_id
)
SELECT
    '00000000-0000-4000-8000-000000001801', assumption_id,
    'migration-018-test', '00000000-0000-4000-8000-000000001004'
FROM assumption
WHERE code = 'migration-018-raw-base-5-assumption';

INSERT INTO estimate_sensitivity_result (
    estimate_id, component_id, factor_code,
    tested_low, tested_base, tested_high,
    output_low, output_base, output_high,
    output_unit, elasticity, impact_rank, method_code
)
SELECT
    '00000000-0000-4000-8000-000000001801', component_id,
    'raw_base_5_factor', 4, 5, 6, 40, 50, 60,
    'raw_base_5_person', 1.25, 1, 'raw_base_5_method'
FROM estimate_component
WHERE estimate_id = '00000000-0000-4000-8000-000000001801'
  AND component_code = 'raw_base_5_component_code';

INSERT INTO confidence_assessment (
    estimate_id, source_quality_score, recency_score, directness_score,
    joint_observation_score, model_reliance_score, total_score, grade,
    rationale, data_version, created_by_run_id, rule_version,
    components_json, penalties_json
) VALUES (
    '00000000-0000-4000-8000-000000001801',
    20, 10, 15, 10, 5, 60, 'C',
    'Confidence rationale echoes raw base 5.', 'migration-018-test',
    '00000000-0000-4000-8000-000000001004', 'raw_base_5_confidence_rule',
    '{"raw_count_base":5}'::jsonb,
    '[{"reason":"raw count is 5"}]'::jsonb
);

INSERT INTO validation_gap (
    estimate_id, gap_type, description, impact, verification_question,
    recommended_source, expected_improvement, priority, status,
    data_version, created_by_run_id
) VALUES (
    '00000000-0000-4000-8000-000000001801', 'small_sample',
    'Only five raw weighted people are present.', 'high',
    'Can the raw base of 5 be confirmed?', 'A source containing count 5.',
    'May replace raw base 5.', 1, 'open', 'migration-018-test',
    '00000000-0000-4000-8000-000000001004'
);

INSERT INTO estimate_dependency (
    estimate_id, dependency_kind, dependency_record_key,
    dependency_version, dependency_content_hash, dependency_role,
    evidence_id, model_version_id
)
SELECT
    '00000000-0000-4000-8000-000000001801', 'evidence',
    'raw-count-base:5', 'raw_base_5_dependency_version', repeat('4', 64), 'factor',
    evidence_id, '00000000-0000-4000-8000-000000001003'
FROM evidence
WHERE external_evidence_key = 'migration-018-raw-five';

INSERT INTO segment_query (
    query_id, workspace_id, created_by_actor_id, name, filter_json,
    primary_entity_unit, geography_scope, as_of_date, query_hash,
    data_version, created_by_run_id
) VALUES (
    '00000000-0000-4000-8000-000000001803',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000001002',
    'Migration 018 rare weighted query',
    '{"fixture":"raw base 5"}'::jsonb, 'person',
    '{"level":"country","codes":["MIG-010-REAPPLY"]}'::jsonb,
    DATE '2026-08-25', repeat('5', 64), 'migration-018-test',
    '00000000-0000-4000-8000-000000001004'
);

INSERT INTO segment_query_result (
    result_id, query_id, estimate_id, model_version_id, executed_at,
    result_summary, data_version, created_by_run_id, result_hash,
    dependency_fingerprint, cache_status
) VALUES (
    '00000000-0000-4000-8000-000000001804',
    '00000000-0000-4000-8000-000000001803',
    '00000000-0000-4000-8000-000000001801',
    '00000000-0000-4000-8000-000000001003', now(),
    '{"count_low":4,"count_base":5,"count_high":6,"formula":"raw 4/5/6"}'::jsonb,
    'migration-018-test', '00000000-0000-4000-8000-000000001004',
    repeat('6', 64), repeat('7', 64), 'valid'
);

INSERT INTO saved_segment (
    saved_segment_id, workspace_id, title, description, created_by_actor_id
) VALUES (
    '00000000-0000-4000-8000-000000001805',
    '00000000-0000-4000-8000-000000001001',
    'Migration 018 rare segment', 'Raw result used to contain base 5.',
    '00000000-0000-4000-8000-000000001002'
);

INSERT INTO saved_segment_version (
    saved_segment_id, version_no, query_id, pinned_result_id,
    natural_language_text, parser_version, definition_hash, change_reason,
    created_by_actor_id
) VALUES (
    '00000000-0000-4000-8000-000000001805', 1,
    '00000000-0000-4000-8000-000000001803',
    '00000000-0000-4000-8000-000000001804',
    'Find the migration 018 fixture.', 'migration-018-parser',
    repeat('8', 64), 'release_boundary_fixture',
    '00000000-0000-4000-8000-000000001002'
);

INSERT INTO market_scenario (
    scenario_id, name, query_id, product_definition, market_unit, currency,
    horizon_months, assumptions, version, data_version, created_by_run_id,
    workspace_id, base_query_result_id, scenario_hash, status,
    created_by_actor_id, saved_segment_id, saved_segment_version_no
) VALUES (
    '00000000-0000-4000-8000-000000001806',
    'Migration 018 rare market scenario',
    '00000000-0000-4000-8000-000000001803',
    'Market derived from raw person base 5.', 'person', 'KRW', 12,
    '{"raw_count_base":5}'::jsonb, 'migration-018-v1',
    'migration-018-test', '00000000-0000-4000-8000-000000001004',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000001804', repeat('9', 64), 'active',
    '00000000-0000-4000-8000-000000001002',
    '00000000-0000-4000-8000-000000001805', 1
);

INSERT INTO market_estimate (
    market_estimate_id, scenario_id,
    tam_entities_low, tam_entities_base, tam_entities_high,
    sam_entities_low, sam_entities_base, sam_entities_high,
    som_entities_low, som_entities_base, som_entities_high,
    tam_revenue_low, tam_revenue_base, tam_revenue_high,
    sam_revenue_low, sam_revenue_base, sam_revenue_high,
    som_revenue_low, som_revenue_base, som_revenue_high,
    formula, confidence_score, run_id, data_version, created_by_run_id
) VALUES (
    '00000000-0000-4000-8000-000000001807',
    '00000000-0000-4000-8000-000000001806',
    40, 50, 60, 20, 30, 40, 4, 5, 6,
    4000, 5000, 6000, 2000, 3000, 4000, 400, 500, 600,
    'Market formula derived from raw base 5.', 60,
    '00000000-0000-4000-8000-000000001004', 'migration-018-test',
    '00000000-0000-4000-8000-000000001004'
);

INSERT INTO scenario_factor_override (
    scenario_id, factor_code, value_low, value_base, value_high, unit,
    directness_class, rationale
) VALUES (
    '00000000-0000-4000-8000-000000001806',
    'annual_spend_per_entity', 400, 500, 600, 'KRW/person/year',
    'inference', 'Derived from the rare raw base 5.'
);

INSERT INTO comparison_workspace (
    comparison_id, workspace_id, name, status, created_by_actor_id
) VALUES
    (
        '00000000-0000-4000-8000-000000001808',
        '00000000-0000-4000-8000-000000001001',
        'Migration 018 release comparison', 'saved',
        '00000000-0000-4000-8000-000000001002'
    ),
    (
        '00000000-0000-4000-8000-000000001818',
        '00000000-0000-4000-8000-000000001001',
        'Migration 018 zero-scenario comparison', 'saved',
        '00000000-0000-4000-8000-000000001002'
    ),
    (
        '00000000-0000-4000-8000-000000001819',
        '00000000-0000-4000-8000-000000001001',
        'Migration 018 multiple-scenario comparison', 'saved',
        '00000000-0000-4000-8000-000000001002'
    );

INSERT INTO comparison_member (
    comparison_member_id, comparison_id, position, query_result_id,
    market_estimate_id, display_label, normalized_metrics
) VALUES
    (
        '00000000-0000-4000-8000-000000001809',
        '00000000-0000-4000-8000-000000001808', 1,
        '00000000-0000-4000-8000-000000001804',
        '00000000-0000-4000-8000-000000001807', 'Raw base five',
        '{
            "raw_count_low":4,"raw_count_base":5,"raw_count_high":6,
            "raw_entity_unit":"person","normalized_count_score":100,
            "normalization_scope":"within_person_members_only","count_status":"available",
            "confidence_score":60,"confidence_grade":"C","validation_gap_count":1,
            "direct_observation_share":1,"tam_entities_base":50,
            "sam_entities_base":30,"som_entities_base":5,
            "tam_revenue_base":5000,"sam_revenue_base":3000,"som_revenue_base":500,
            "annual_spend_per_entity":500,"growth_rate":0.5,
            "target_accessibility":0.5,"digital_reachability":0.5,
            "competition_intensity":0.5,"purchase_frequency":5,
            "willingness_to_pay":500
        }'::jsonb
    ),
    (
        '00000000-0000-4000-8000-000000001817',
        '00000000-0000-4000-8000-000000001808', 2,
        '00000000-0000-4000-8000-000000001007',
        '00000000-0000-4000-8000-000000001807',
        'Enterprise result with mismatched person market estimate',
        '{
            "raw_count_low":10,"raw_count_base":12,"raw_count_high":15,
            "raw_entity_unit":"enterprise","normalized_count_score":80,
            "count_status":"available","tam_entities_base":50,
            "sam_entities_base":30,"som_entities_base":5,
            "tam_revenue_base":5000,"annual_spend_per_entity":500
        }'::jsonb
    ),
    (
        '00000000-0000-4000-8000-000000001820',
        '00000000-0000-4000-8000-000000001818', 1,
        '00000000-0000-4000-8000-000000001007',
        NULL,
        'Enterprise result with no active market scenario',
        '{
            "raw_count_low":999,"raw_count_base":999,"raw_count_high":999,
            "raw_entity_unit":"person","normalized_count_score":75,
            "count_status":"available","confidence_score":"88.5",
            "active_market_scenario_count":0,
            "market_scenario_id":"untrusted-scenario",
            "tam_entities_base":999,"tam_revenue_base":999,
            "annual_spend_per_entity":999
        }'::jsonb
    ),
    (
        '00000000-0000-4000-8000-000000001821',
        '00000000-0000-4000-8000-000000001819', 1,
        '00000000-0000-4000-8000-000000001007',
        NULL,
        'Enterprise result with multiple active market scenarios',
        '{
            "raw_count_low":888,"raw_count_base":888,"raw_count_high":888,
            "raw_entity_unit":"person","normalized_count_score":65,
            "count_status":"available","active_market_scenario_count":2,
            "market_scenario_id":"untrusted-scenario",
            "market_scenario_name":"Untrusted scenario",
            "tam_entities_base":888,"sam_entities_base":888,
            "som_entities_base":888,"tam_revenue_base":888,
            "annual_spend_per_entity":888
        }'::jsonb
    );

INSERT INTO opportunity_board (
    opportunity_board_id, workspace_id, name, created_by_actor_id
) VALUES (
    '00000000-0000-4000-8000-000000001810',
    '00000000-0000-4000-8000-000000001001',
    'Migration 018 opportunity board',
    '00000000-0000-4000-8000-000000001002'
);

INSERT INTO opportunity (
    opportunity_id, opportunity_board_id, name, problem_statement,
    hypothesis_summary, solution_idea, status, created_by_actor_id
) VALUES (
    '00000000-0000-4000-8000-000000001811',
    '00000000-0000-4000-8000-000000001810',
    'Migration 018 release opportunity', 'Test release-safe opportunity reads.',
    'This is a hypothesis, not a fact about a person.',
    'Use only aggregate, release-safe evidence.', 'discovered',
    '00000000-0000-4000-8000-000000001002'
);

INSERT INTO opportunity_segment_link (
    opportunity_segment_link_id, opportunity_id, saved_segment_id,
    saved_segment_version_no, query_result_id, market_estimate_id, link_role
) VALUES (
    '00000000-0000-4000-8000-000000001812',
    '00000000-0000-4000-8000-000000001811',
    '00000000-0000-4000-8000-000000001805', 1,
    '00000000-0000-4000-8000-000000001804',
    '00000000-0000-4000-8000-000000001807', 'primary_target'
);

INSERT INTO opportunity_content_version (
    opportunity_content_version_id, opportunity_id, content_key, content_type,
    version_no, content, source_kind, source_query_result_id,
    source_market_estimate_id, provider_model, created_by_actor_id
) VALUES
    (
        '00000000-0000-4000-8000-000000001813',
        '00000000-0000-4000-8000-000000001811',
        'rare-derived-brief', 'idea_brief', 1,
        '{"raw_count_base":5,"tam_entities_base":50,"text":"Five people."}'::jsonb,
        'ai_hypothesis', '00000000-0000-4000-8000-000000001804',
        '00000000-0000-4000-8000-000000001807', 'migration-fixture-model',
        '00000000-0000-4000-8000-000000001002'
    ),
    (
        '00000000-0000-4000-8000-000000001814',
        '00000000-0000-4000-8000-000000001811',
        'safe-user-note', 'note', 1,
        '{"text":"Keep this user-authored safe hypothesis."}'::jsonb,
        'user', NULL, NULL, NULL,
        '00000000-0000-4000-8000-000000001002'
    ),
    (
        '00000000-0000-4000-8000-000000001815',
        '00000000-0000-4000-8000-000000001811',
        'unlinked-derived-brief', 'hypothesis', 1,
        '{"raw_count_base":5,"text":"Derived while opportunity has a protected link."}'::jsonb,
        'derived', NULL, NULL, 'migration-fixture-model',
        '00000000-0000-4000-8000-000000001002'
    );

DO $$
DECLARE
    base_estimate estimate%ROWTYPE;
    release_estimate v_estimate_release_boundary%ROWTYPE;
    enterprise_estimate v_estimate_release_boundary%ROWTYPE;
    saved_row v_saved_segment_latest%ROWTYPE;
    comparison_row v_comparison_detail%ROWTYPE;
    opportunity_row v_opportunity_snapshot%ROWTYPE;
    lineage_row v_estimate_lineage%ROWTYPE;
    archetype_row v_archetype_search%ROWTYPE;
    content_item jsonb;
BEGIN
    SELECT * INTO STRICT base_estimate
    FROM estimate
    WHERE estimate_id = '00000000-0000-4000-8000-000000001801';
    IF base_estimate.status <> 'estimated'
       OR base_estimate.count_low <> 4
       OR base_estimate.count_base <> 5
       OR base_estimate.count_high <> 6
       OR base_estimate.share_base <> 0.05
       OR base_estimate.denominator_definition <> 'Raw denominator=5 weighted people'
       OR base_estimate.formula <> 'weighted raw formula: 4 / 5 / 6 people'
       OR base_estimate.external_estimate_key <> 'migration-018-rare-person'
       OR base_estimate.calculation_input_hash <> repeat('2', 64)
       OR base_estimate.dependency_fingerprint <> repeat('3', 64) THEN
        RAISE EXCEPTION 'migration 018 changed or failed to retain the raw estimate ledger';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM estimate_component
        WHERE estimate_id = base_estimate.estimate_id AND value_base = 5
          AND metadata_json ->> 'raw_count_base' = '5'
    ) OR NOT EXISTS (
        SELECT 1 FROM estimate_sensitivity_result
        WHERE estimate_id = base_estimate.estimate_id AND tested_base = 5
          AND output_base = 50
    ) OR NOT EXISTS (
        SELECT 1 FROM estimate_assumption association
        JOIN assumption USING (assumption_id)
        WHERE association.estimate_id = base_estimate.estimate_id
          AND assumption.value_base = 5
    ) OR NOT EXISTS (
        SELECT 1 FROM segment_query_result
        WHERE result_id = '00000000-0000-4000-8000-000000001804'
          AND result_summary ->> 'count_base' = '5'
    ) THEN
        RAISE EXCEPTION 'migration 018 changed a raw component, assumption, sensitivity, or query-result ledger';
    END IF;

    SELECT * INTO STRICT release_estimate
    FROM v_estimate_release_boundary
    WHERE estimate_id = base_estimate.estimate_id;
    IF release_estimate.status <> 'suppressed'
       OR NOT release_estimate.release_suppressed
       OR release_estimate.release_threshold <> 10
       OR release_estimate.release_reason <> 'rare_output_below_release_threshold'
       OR release_estimate.count_low IS NOT NULL
       OR release_estimate.count_base IS NOT NULL
       OR release_estimate.count_high IS NOT NULL
       OR release_estimate.share_low IS NOT NULL
       OR release_estimate.share_base IS NOT NULL
       OR release_estimate.share_high IS NOT NULL
       OR release_estimate.external_estimate_key IS NOT NULL
       OR release_estimate.calculation_input_hash IS NOT NULL
       OR release_estimate.dependency_fingerprint IS NOT NULL
       OR release_estimate.method_code <> 'withheld_by_release_policy'
       OR release_estimate.denominator_definition <> 'human aggregate denominator withheld by release policy'
       OR release_estimate.formula <> 'weighted human cell withheld by release policy'
       OR release_estimate.precision_rule <> 'suppressed_below_minimum_weighted_entities' THEN
        RAISE EXCEPTION 'rare human estimate was not canonicalized at the release boundary';
    END IF;

    SELECT * INTO STRICT enterprise_estimate
    FROM v_estimate_release_boundary
    WHERE estimate_id = '00000000-0000-4000-8000-000000001802';
    IF enterprise_estimate.release_suppressed
       OR enterprise_estimate.status <> 'estimated'
       OR enterprise_estimate.count_base <> 5
       OR enterprise_estimate.entity_unit <> 'enterprise' THEN
        RAISE EXCEPTION 'release policy incorrectly interchanged enterprise and human units';
    END IF;

    IF EXISTS (
        SELECT 1 FROM v_estimate_component_release_boundary
        WHERE estimate_id = base_estimate.estimate_id
          AND (value_low IS NOT NULL OR value_base IS NOT NULL OR value_high IS NOT NULL
               OR conditional_probability IS NOT NULL
               OR metadata_json ? 'raw_count_base'
               OR component_type <> 'withheld_by_release_policy'
               OR operation <> 'withheld_by_release_policy'
               OR component_code IS NOT NULL OR unit IS NOT NULL
               OR dependency_group IS NOT NULL)
    ) OR EXISTS (
        SELECT 1 FROM v_estimate_assumption_release_boundary
        WHERE estimate_id = base_estimate.estimate_id
          AND (value_low IS NOT NULL OR value_base IS NOT NULL OR value_high IS NOT NULL
               OR statement LIKE '%4 / 5 / 6%'
               OR code IS NOT NULL OR unit IS NOT NULL)
    ) OR EXISTS (
        SELECT 1 FROM v_estimate_sensitivity_release_boundary
        WHERE estimate_id = base_estimate.estimate_id
          AND (tested_low IS NOT NULL OR tested_base IS NOT NULL OR tested_high IS NOT NULL
               OR output_low IS NOT NULL OR output_base IS NOT NULL OR output_high IS NOT NULL
               OR elasticity IS NOT NULL OR factor_code IS NOT NULL
               OR output_unit IS NOT NULL OR method_code <> 'withheld_by_release_policy')
    ) THEN
        RAISE EXCEPTION 'a protected component, assumption, or sensitivity value crossed the release boundary';
    END IF;

    SELECT * INTO STRICT lineage_row
    FROM v_estimate_lineage
    WHERE estimate_id = base_estimate.estimate_id;
    IF lineage_row.status <> 'suppressed'
       OR lineage_row.count_base IS NOT NULL
       OR lineage_row.components_json #>> '{0,value_base}' IS NOT NULL
       OR lineage_row.components_json #>> '{0,locator}' IS NOT NULL
       OR lineage_row.components_json #>> '{0,metadata,raw_count_base}' IS NOT NULL
       OR lineage_row.confidence_json ->> 'rationale'
            <> 'Confidence narrative withheld by release policy.'
       OR lineage_row.confidence_json -> 'components' <> '{}'::jsonb
       OR lineage_row.confidence_json -> 'penalties' <> '[]'::jsonb
       OR lineage_row.confidence_json ->> 'rule_version' IS NOT NULL
       OR lineage_row.validation_gaps_json #>> '{0,description}'
            <> 'Validation-gap narrative withheld by release policy.'
       OR lineage_row.validation_gaps_json #>> '{0,verification_question}' IS NOT NULL
       OR lineage_row.validation_gaps_json #>> '{0,recommended_source}' IS NOT NULL
       OR lineage_row.validation_gaps_json #>> '{0,expected_improvement}' IS NOT NULL
       OR lineage_row.dependencies_json #>> '{0,record_key}' IS NOT NULL
       OR lineage_row.dependencies_json #>> '{0,version}' IS NOT NULL
       OR lineage_row.dependencies_json #>> '{0,content_hash}' IS NOT NULL THEN
        RAISE EXCEPTION 'estimate lineage retained a reconstructable protected payload';
    END IF;

    SELECT * INTO STRICT archetype_row
    FROM v_archetype_search
    WHERE archetype_id = 'migration-018-rare-person';
    IF archetype_row.estimate_status <> 'suppressed'
       OR archetype_row.count_base IS NOT NULL
       OR archetype_row.share_base IS NOT NULL
       OR archetype_row.formula <> 'weighted human cell withheld by release policy' THEN
        RAISE EXCEPTION 'archetype search retained a rare estimate payload';
    END IF;

    SELECT * INTO STRICT saved_row
    FROM v_saved_segment_latest
    WHERE saved_segment_id = '00000000-0000-4000-8000-000000001805';
    IF saved_row.estimate_status <> 'suppressed'
       OR saved_row.count_base IS NOT NULL
       OR saved_row.share_base IS NOT NULL
       OR saved_row.result_summary ->> 'status' <> 'suppressed'
       OR saved_row.result_summary ->> 'reason' <> 'rare_output_below_release_threshold'
       OR saved_row.result_summary ? 'count_base'
       OR saved_row.result_summary ? 'formula'
       OR EXISTS (
           SELECT 1 FROM v_segment_query_result_release_boundary result
           WHERE result.result_id = saved_row.result_id
             AND (result.result_hash IS NOT NULL OR result.dependency_fingerprint IS NOT NULL)
       ) THEN
        RAISE EXCEPTION 'saved-segment latest view retained a rare query-result payload';
    END IF;

    SELECT * INTO STRICT comparison_row
    FROM v_comparison_detail
    WHERE comparison_member_id = '00000000-0000-4000-8000-000000001809';
    IF comparison_row.estimate_status <> 'suppressed'
       OR comparison_row.display_label <> 'Suppressed segment'
       OR comparison_row.count_base IS NOT NULL
       OR comparison_row.tam_entities_base IS NOT NULL
       OR comparison_row.sam_entities_base IS NOT NULL
       OR comparison_row.som_entities_base IS NOT NULL
       OR comparison_row.tam_revenue_base IS NOT NULL
       OR comparison_row.sam_revenue_base IS NOT NULL
       OR comparison_row.som_revenue_base IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{raw_count_base}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{normalized_count_score}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{annual_spend_per_entity}' IS NOT NULL
       OR comparison_row.normalized_metrics ->> 'count_status' <> 'suppressed'
       OR comparison_row.normalized_metrics ->> 'release_policy' <> 'rare-output-v1' THEN
        RAISE EXCEPTION 'comparison detail retained a reconstructable rare or market-derived value';
    END IF;

    SELECT * INTO STRICT comparison_row
    FROM v_comparison_detail
    WHERE comparison_member_id = '00000000-0000-4000-8000-000000001817';
    IF comparison_row.estimate_status <> 'estimated'
       OR comparison_row.count_base <> 12
       OR comparison_row.tam_entities_base IS NOT NULL
       OR comparison_row.sam_entities_base IS NOT NULL
       OR comparison_row.som_entities_base IS NOT NULL
       OR comparison_row.tam_revenue_base IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{raw_count_base}' <> '12'
       OR comparison_row.normalized_metrics #>> '{tam_entities_base}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{annual_spend_per_entity}' IS NOT NULL
       OR comparison_row.normalized_metrics ->> 'unavailable_reason'
            IS DISTINCT FROM 'market_estimate_query_result_mismatch' THEN
        RAISE EXCEPTION 'comparison detail accepted a market estimate from a different query result';
    END IF;

    SELECT * INTO STRICT comparison_row
    FROM v_comparison_detail
    WHERE comparison_member_id = '00000000-0000-4000-8000-000000001820';
    IF comparison_row.estimate_status <> 'estimated'
       OR comparison_row.count_base <> 12
       OR comparison_row.normalized_metrics #>> '{raw_count_low}' <> '10'
       OR comparison_row.normalized_metrics #>> '{raw_count_base}' <> '12'
       OR comparison_row.normalized_metrics #>> '{raw_count_high}' <> '15'
       OR comparison_row.normalized_metrics #>> '{raw_entity_unit}' <> 'enterprise'
       OR comparison_row.normalized_metrics #>> '{normalized_count_score}' <> '75'
       OR comparison_row.normalized_metrics #>> '{confidence_score}' <> '88.5'
       OR comparison_row.normalized_metrics #>> '{active_market_scenario_count}' <> '0'
       OR comparison_row.normalized_metrics #>> '{market_scenario_id}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{tam_entities_base}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{tam_revenue_base}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{annual_spend_per_entity}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{values_withheld}' IS DISTINCT FROM 'false'
       OR comparison_row.normalized_metrics #>> '{metric_unavailable_reasons,market_scenario_id}'
            IS DISTINCT FROM 'active_market_scenario_not_available'
       OR comparison_row.normalized_metrics #>> '{metric_unavailable_reasons,tam_entities_base}'
            IS DISTINCT FROM 'active_market_scenario_not_available'
       OR comparison_row.normalized_metrics #>> '{metric_unavailable_reasons,annual_spend_per_entity}'
            IS DISTINCT FROM 'active_market_scenario_not_available' THEN
        RAISE EXCEPTION 'comparison detail lost or trusted unsafe zero-scenario snapshot state';
    END IF;

    SELECT * INTO STRICT comparison_row
    FROM v_comparison_detail
    WHERE comparison_member_id = '00000000-0000-4000-8000-000000001821';
    IF comparison_row.estimate_status <> 'estimated'
       OR comparison_row.count_base <> 12
       OR comparison_row.normalized_metrics #>> '{raw_count_base}' <> '12'
       OR comparison_row.normalized_metrics #>> '{raw_entity_unit}' <> 'enterprise'
       OR comparison_row.normalized_metrics #>> '{normalized_count_score}' <> '65'
       OR comparison_row.normalized_metrics #>> '{active_market_scenario_count}' <> '2'
       OR comparison_row.normalized_metrics #>> '{market_scenario_id}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{market_scenario_name}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{tam_entities_base}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{sam_entities_base}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{som_entities_base}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{tam_revenue_base}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{annual_spend_per_entity}' IS NOT NULL
       OR comparison_row.normalized_metrics #>> '{values_withheld}' IS DISTINCT FROM 'false'
       OR comparison_row.normalized_metrics #>> '{metric_unavailable_reasons,market_scenario_id}'
            IS DISTINCT FROM 'multiple_active_market_scenarios_require_explicit_selection'
       OR comparison_row.normalized_metrics #>> '{metric_unavailable_reasons,tam_entities_base}'
            IS DISTINCT FROM 'multiple_active_market_scenarios_require_explicit_selection'
       OR comparison_row.normalized_metrics #>> '{metric_unavailable_reasons,annual_spend_per_entity}'
            IS DISTINCT FROM 'multiple_active_market_scenarios_require_explicit_selection' THEN
        RAISE EXCEPTION 'comparison detail lost or trusted unsafe multiple-scenario snapshot state';
    END IF;

    SELECT * INTO STRICT opportunity_row
    FROM v_opportunity_snapshot
    WHERE opportunity_id = '00000000-0000-4000-8000-000000001811';
    IF opportunity_row.segment_snapshots #>> '{0,estimate_status}' <> 'suppressed'
       OR opportunity_row.segment_snapshots #>> '{0,count_low}' IS NOT NULL
       OR opportunity_row.segment_snapshots #>> '{0,count_base}' IS NOT NULL
       OR opportunity_row.segment_snapshots #>> '{0,count_high}' IS NOT NULL THEN
        RAISE EXCEPTION 'opportunity snapshot retained a rare segment count';
    END IF;

    SELECT item INTO STRICT content_item
    FROM jsonb_array_elements(opportunity_row.current_content) item
    WHERE item ->> 'content_key' = 'rare-derived-brief';
    IF content_item #>> '{content,status}' <> 'suppressed'
       OR content_item #>> '{content,values_withheld}' <> 'true'
       OR content_item #> '{content}' ? 'raw_count_base'
       OR content_item #> '{content}' ? 'tam_entities_base' THEN
        RAISE EXCEPTION 'directly sourced opportunity content retained a protected value';
    END IF;

    SELECT item INTO STRICT content_item
    FROM jsonb_array_elements(opportunity_row.current_content) item
    WHERE item ->> 'content_key' = 'unlinked-derived-brief';
    IF content_item #>> '{content,status}' <> 'suppressed'
       OR content_item #> '{content}' ? 'raw_count_base' THEN
        RAISE EXCEPTION 'derived opportunity content bypassed a protected opportunity link';
    END IF;

    SELECT item INTO STRICT content_item
    FROM jsonb_array_elements(opportunity_row.current_content) item
    WHERE item ->> 'content_key' = 'safe-user-note';
    IF content_item #>> '{content,text}' <> 'Keep this user-authored safe hypothesis.' THEN
        RAISE EXCEPTION 'release boundary removed unrelated user-authored hypothesis text';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM v_global_search
        WHERE object_type = 'estimate'
          AND object_id = base_estimate.estimate_id::text
          AND summary = 'weighted human cell withheld by release policy'
          AND search_text NOT LIKE '%raw formula%'
    ) THEN
        RAISE EXCEPTION 'global search did not use the estimate release boundary';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM feature_definition
        WHERE feature_code = 'migration_018_minor_protected'
          AND queryable
    ) OR NOT EXISTS (
        SELECT 1 FROM v_condition_catalog
        WHERE catalog_id = 'core_feature:migration_018_minor_protected'
          AND sensitive_class = 'minor_protected'
          AND NOT queryable
    ) OR NOT EXISTS (
        SELECT 1 FROM domain_feature
        WHERE domain_feature_id = 'migration-018-restricted-feature'
          AND queryable
          AND sensitive_class = 'restricted_targeting'
    ) OR NOT EXISTS (
        SELECT 1 FROM v_condition_catalog
        WHERE catalog_id = 'domain_feature:migration-018-restricted-feature'
          AND sensitive_class = 'restricted_targeting'
          AND NOT queryable
    ) THEN
        RAISE EXCEPTION 'condition catalog changed source policy or exposed a protected core feature';
    END IF;

    IF EXISTS (
        SELECT 1 FROM v_condition_catalog
        WHERE queryable
          AND sensitive_class IN ('minor_protected', 'restricted_targeting')
    ) THEN
        RAISE EXCEPTION 'condition catalog has a queryable protected sensitivity class';
    END IF;
END $$;

DO $$
DECLARE
    relation_name text;
BEGIN
    FOREACH relation_name IN ARRAY ARRAY[
        'v_condition_catalog',
        'v_estimate_release_boundary',
        'v_estimate_component_release_boundary',
        'v_estimate_assumption_release_boundary',
        'v_estimate_sensitivity_release_boundary',
        'v_segment_query_result_release_boundary',
        'v_estimate_lineage',
        'v_archetype_search',
        'v_saved_segment_latest',
        'v_comparison_detail',
        'v_opportunity_snapshot',
        'v_global_search'
    ] LOOP
        IF NOT has_table_privilege('market_engine_app', 'public.' || relation_name, 'SELECT')
           OR NOT has_table_privilege('market_engine_worker', 'public.' || relation_name, 'SELECT') THEN
            RAISE EXCEPTION 'runtime role lost SELECT on %', relation_name;
        END IF;
    END LOOP;
    IF (
        SELECT count(*)
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = ANY (ARRAY[
              'v_condition_catalog',
              'v_estimate_release_boundary',
              'v_estimate_component_release_boundary',
              'v_estimate_assumption_release_boundary',
              'v_estimate_sensitivity_release_boundary',
              'v_segment_query_result_release_boundary',
              'v_estimate_lineage',
              'v_archetype_search',
              'v_saved_segment_latest',
              'v_comparison_detail',
              'v_opportunity_snapshot',
              'v_global_search'
          ])
          AND relation.relkind = 'v'
          AND coalesce(relation.reloptions, ARRAY[]::text[])
              @> ARRAY['security_invoker=true']
    ) <> 12 THEN
        RAISE EXCEPTION 'migration 018 release views are not all security_invoker views';
    END IF;
END $$;

SELECT set_config(
    'market_engine.workspace_id',
    '00000000-0000-4000-8000-000000001001',
    true
);
SELECT set_config(
    'market_engine.actor_id',
    '00000000-0000-4000-8000-000000001002',
    true
);
SET LOCAL ROLE market_engine_app;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM v_saved_segment_latest
        WHERE saved_segment_id = '00000000-0000-4000-8000-000000001805'
          AND estimate_status = 'suppressed'
          AND count_base IS NULL
    ) OR NOT EXISTS (
        SELECT 1 FROM v_comparison_detail
        WHERE comparison_member_id = '00000000-0000-4000-8000-000000001809'
          AND count_base IS NULL
          AND tam_entities_base IS NULL
    ) OR NOT EXISTS (
        SELECT 1 FROM v_opportunity_snapshot
        WHERE opportunity_id = '00000000-0000-4000-8000-000000001811'
          AND segment_snapshots #>> '{0,count_base}' IS NULL
    ) THEN
        RAISE EXCEPTION 'market_engine_app did not receive release-safe public reads';
    END IF;
END $$;
RESET ROLE;

-- The populated-data preflight must fail before replacing a view when an
-- interval cannot be classified.  The unsafe row and the surrounding proof
-- are transaction-local and disappear with the final ROLLBACK.
INSERT INTO estimate (
    estimate_id, subject_type, subject_id, entity_unit, geography_id, period_id,
    denominator_definition, count_low, count_base, count_high,
    method_code, formula, precision_rule, model_version_id, run_id, status,
    data_version, external_estimate_key, workspace_id, data_layer,
    approval_status, created_by_actor_id
)
SELECT
    '00000000-0000-4000-8000-000000001816', 'control',
    'migration-018-unsafe-preflight', 'person', geography.geography_id,
    period.period_id, 'Unsafe non-finite test interval',
    'NaN'::numeric, 'NaN'::numeric, 'NaN'::numeric,
    'weighted_fixture', 'unsafe fixture', 'unsafe_fixture',
    '00000000-0000-4000-8000-000000001003',
    '00000000-0000-4000-8000-000000001004', 'estimated',
    'migration-018-test', 'migration-018-unsafe-preflight',
    '00000000-0000-4000-8000-000000001001', 'user_scenario',
    'not_required', '00000000-0000-4000-8000-000000001002'
FROM geography
CROSS JOIN time_period period
WHERE geography.code = 'MIG-010-REAPPLY'
  AND period.label = 'Migration 010 stateful reapply';

DO $$
DECLARE
    before_definition text;
    after_definition text;
    rejected_constraint text;
    rejected_message text;
BEGIN
    before_definition := pg_get_viewdef('v_estimate_release_boundary'::regclass, true);
    BEGIN
        PERFORM workbench_assert_release_safe_read_boundary();
        RAISE EXCEPTION 'migration 018 populated preflight accepted an unsafe interval';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                rejected_constraint = CONSTRAINT_NAME,
                rejected_message = MESSAGE_TEXT;
            IF rejected_constraint IS DISTINCT FROM 'release_safe_read_boundary_preflight'
               OR rejected_message NOT LIKE 'migration 018 preflight failed:%no row was changed' THEN
                RAISE EXCEPTION 'unexpected release-boundary preflight failure: % / %',
                    rejected_constraint, rejected_message;
            END IF;
    END;
    after_definition := pg_get_viewdef('v_estimate_release_boundary'::regclass, true);
    IF after_definition IS DISTINCT FROM before_definition THEN
        RAISE EXCEPTION 'failed migration 018 preflight changed the release view';
    END IF;
END $$;

ROLLBACK;
