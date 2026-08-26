BEGIN;

-- Isolate migration 016's finite checks from migration 015's nonnegative
-- checks so -Infinity is proven to fail specifically at the finite boundary.
CREATE TEMP TABLE migration_016_market_estimate_test
    (LIKE market_estimate INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TEMP TABLE migration_016_scenario_factor_test
    (LIKE scenario_factor_override INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TEMP TABLE migration_016_opportunity_test
    (LIKE opportunity INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TEMP TABLE migration_016_experiment_test
    (LIKE opportunity_experiment INCLUDING DEFAULTS INCLUDING CONSTRAINTS);

ALTER TABLE migration_016_market_estimate_test
    DROP CONSTRAINT market_estimate_nonnegative_values_chk;
ALTER TABLE migration_016_scenario_factor_test
    DROP CONSTRAINT scenario_factor_override_nonnegative_values_chk;
ALTER TABLE migration_016_opportunity_test
    DROP CONSTRAINT opportunity_expected_price_nonnegative_chk;
ALTER TABLE migration_016_experiment_test
    DROP CONSTRAINT opportunity_experiment_cost_nonnegative_chk;

DO $$
DECLARE
    special_value numeric;
    rejected_constraint text;
BEGIN
    FOREACH special_value IN ARRAY ARRAY[
        'NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric
    ] LOOP
        BEGIN
            INSERT INTO migration_016_market_estimate_test (
                scenario_id,
                tam_entities_low, tam_entities_base, tam_entities_high,
                sam_entities_low, sam_entities_base, sam_entities_high,
                som_entities_low, som_entities_base, som_entities_high,
                formula, confidence_score, run_id, data_version
            ) VALUES (
                '00000000-0000-4000-8000-000000001601',
                special_value, special_value, special_value,
                special_value, special_value, special_value,
                special_value, special_value, special_value,
                'migration-016 finite market test', 50,
                '00000000-0000-4000-8000-000000001602', 'migration-016-test'
            );
            RAISE EXCEPTION 'market_estimate accepted non-finite value %', special_value;
        EXCEPTION
            WHEN check_violation THEN
                GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
                IF rejected_constraint IS DISTINCT FROM 'market_estimate_finite_values_chk' THEN
                    RAISE EXCEPTION 'expected market_estimate_finite_values_chk for %, got %',
                        special_value, rejected_constraint;
                END IF;
        END;

        BEGIN
            INSERT INTO migration_016_scenario_factor_test (
                scenario_id, factor_code, value_low, value_base, value_high,
                unit, directness_class, rationale
            ) VALUES (
                '00000000-0000-4000-8000-000000001603',
                'annual_spend_per_entity', special_value, special_value, special_value,
                'KRW/entity/year', 'user_input', 'migration-016 finite factor test'
            );
            RAISE EXCEPTION 'scenario_factor_override accepted non-finite value %', special_value;
        EXCEPTION
            WHEN check_violation THEN
                GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
                IF rejected_constraint IS DISTINCT FROM 'scenario_factor_override_finite_values_chk' THEN
                    RAISE EXCEPTION 'expected scenario_factor_override_finite_values_chk for %, got %',
                        special_value, rejected_constraint;
                END IF;
        END;

        BEGIN
            INSERT INTO migration_016_opportunity_test (
                opportunity_board_id, name, problem_statement, hypothesis_summary,
                solution_idea, expected_price_low, expected_price_base,
                expected_price_high, currency, status, created_by_actor_id
            ) VALUES (
                '00000000-0000-4000-8000-000000001604',
                'migration-016 finite price test', 'test', 'test', 'test',
                special_value, special_value, special_value, 'KRW', 'discovered',
                '00000000-0000-4000-8000-000000001605'
            );
            RAISE EXCEPTION 'opportunity accepted non-finite value %', special_value;
        EXCEPTION
            WHEN check_violation THEN
                GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
                IF rejected_constraint IS DISTINCT FROM 'opportunity_expected_price_finite_chk' THEN
                    RAISE EXCEPTION 'expected opportunity_expected_price_finite_chk for %, got %',
                        special_value, rejected_constraint;
                END IF;
        END;

        BEGIN
            INSERT INTO migration_016_experiment_test (
                opportunity_id, name, hypothesis, method, primary_metric,
                success_criteria, cost_low, cost_base, cost_high, currency,
                status, created_by_actor_id
            ) VALUES (
                '00000000-0000-4000-8000-000000001606',
                'migration-016 finite cost test', 'test', 'test', 'test', 'test',
                special_value, special_value, special_value, 'KRW', 'draft',
                '00000000-0000-4000-8000-000000001607'
            );
            RAISE EXCEPTION 'opportunity_experiment accepted non-finite value %', special_value;
        EXCEPTION
            WHEN check_violation THEN
                GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
                IF rejected_constraint IS DISTINCT FROM 'opportunity_experiment_cost_finite_chk' THEN
                    RAISE EXCEPTION 'expected opportunity_experiment_cost_finite_chk for %, got %',
                        special_value, rejected_constraint;
                END IF;
        END;
    END LOOP;

    -- Optional revenue, price, and cost intervals remain nullable.
    INSERT INTO migration_016_market_estimate_test (
        scenario_id,
        tam_entities_low, tam_entities_base, tam_entities_high,
        sam_entities_low, sam_entities_base, sam_entities_high,
        som_entities_low, som_entities_base, som_entities_high,
        formula, confidence_score, run_id, data_version
    ) VALUES (
        '00000000-0000-4000-8000-000000001608',
        10, 11, 12, 5, 6, 7, 1, 2, 3,
        'migration-016 nullable revenue control', 50,
        '00000000-0000-4000-8000-000000001609', 'migration-016-test'
    );

    INSERT INTO migration_016_scenario_factor_test (
        scenario_id, factor_code, value_low, value_base, value_high,
        unit, directness_class, rationale
    ) VALUES (
        '00000000-0000-4000-8000-000000001610',
        'annual_spend_per_entity', 1, 2, 3,
        'KRW/entity/year', 'user_input', 'migration-016 finite factor control'
    );

    INSERT INTO migration_016_opportunity_test (
        opportunity_board_id, name, problem_statement, hypothesis_summary,
        solution_idea, status, created_by_actor_id
    ) VALUES (
        '00000000-0000-4000-8000-000000001611',
        'migration-016 nullable price control', 'test', 'test', 'test',
        'discovered', '00000000-0000-4000-8000-000000001612'
    );

    INSERT INTO migration_016_experiment_test (
        opportunity_id, name, hypothesis, method, primary_metric,
        success_criteria, status, created_by_actor_id
    ) VALUES (
        '00000000-0000-4000-8000-000000001613',
        'migration-016 nullable cost control', 'test', 'test', 'test', 'test',
        'draft', '00000000-0000-4000-8000-000000001614'
    );
END $$;

-- Seed a deterministic, guarded catalog slice and its minimum real table
-- dependencies.  The transaction is rolled back after policy assertions.
INSERT INTO model_version (
    model_version_id, version, methodology_hash, source_manifest_hash,
    random_seed, data_version
) VALUES (
    '00000000-0000-4000-8000-000000001620',
    'migration-016-catalog-model', 'fixture-method', 'fixture-sources',
    20260825, 'migration-016-test'
);

INSERT INTO pipeline_run (
    run_id, pipeline_name, started_at, finished_at, status,
    model_version_id, data_version
) VALUES (
    '00000000-0000-4000-8000-000000001621',
    'migration-016-catalog-fixture', now(), now(), 'success',
    '00000000-0000-4000-8000-000000001620', 'migration-016-test'
);

INSERT INTO category (
    code, name_ko, description, entity_units, sort_order, version,
    data_version, created_by_run_id
) VALUES (
    'migration_016_catalog', '마이그레이션 016 카탈로그',
    '보호·비활성 카탈로그 정책 검증용',
    '["person","household"]'::jsonb, 1600, 'migration-016-test',
    'migration-016-test', '00000000-0000-4000-8000-000000001621'
);

INSERT INTO domain_registry (
    domain_id, domain_code, name_ko, description, primary_entity_unit,
    category_id, coverage_status, active, minor_guardrail, version,
    data_version, created_by_run_id
) VALUES
    (
        'DOM-MIGRATION-016-MINOR', 'migration_016_minor', '보호 도메인',
        '아동 관련 보호 정책 검증', 'household',
        (SELECT category_id FROM category WHERE code = 'migration_016_catalog'),
        'complete_with_evidence_constraints', true, true, 'migration-016-test',
        'migration-016-test', '00000000-0000-4000-8000-000000001621'
    ),
    (
        'DOM-MIGRATION-016-INACTIVE', 'migration_016_inactive', '비활성 도메인',
        '비활성 부모 정책 검증', 'person',
        (SELECT category_id FROM category WHERE code = 'migration_016_catalog'),
        'complete_with_evidence_constraints', false, false, 'migration-016-test',
        'migration-016-test', '00000000-0000-4000-8000-000000001621'
    ),
    (
        'DOM-MIGRATION-016-ACTIVE', 'migration_016_active', '활성 도메인',
        '비보호 대조군', 'person',
        (SELECT category_id FROM category WHERE code = 'migration_016_catalog'),
        'complete_with_evidence_constraints', true, false, 'migration-016-test',
        'migration-016-test', '00000000-0000-4000-8000-000000001621'
    );

INSERT INTO domain_dimension (
    dimension_id, domain_id, axis_code, applicability, applicability_reason,
    allowed_values, sort_order, data_version, created_by_run_id
) VALUES (
    'DOM-MIGRATION-016-MINOR-DIM-01', 'DOM-MIGRATION-016-MINOR',
    'object', 'applicable', '보호 차원 fixture', '["보호 값"]'::jsonb, 1,
    'migration-016-test', '00000000-0000-4000-8000-000000001621'
);

INSERT INTO domain_feature (
    domain_feature_id, domain_id, dimension_id, feature_code, label_ko,
    data_type, allowed_values, observable_status, targetability_class,
    queryable, sensitive_class, data_version, created_by_run_id
) VALUES
    (
        'DOM-MIGRATION-016-MINOR-FEAT-01', 'DOM-MIGRATION-016-MINOR',
        'DOM-MIGRATION-016-MINOR-DIM-01', 'migration_016.minor_feature', '보호 특성',
        'category', '["보호 값"]'::jsonb, 'observable_or_declared', 'contextual_only',
        true, 'non_sensitive', 'migration-016-test',
        '00000000-0000-4000-8000-000000001621'
    ),
    (
        'DOM-MIGRATION-016-MINOR-FEAT-02', 'DOM-MIGRATION-016-MINOR',
        'DOM-MIGRATION-016-MINOR-DIM-01', 'migration_016.restricted_feature', '제한 특성',
        'category', '["보호 값"]'::jsonb, 'observable_or_declared', 'first_party_data_required',
        true, 'restricted_targeting', 'migration-016-test',
        '00000000-0000-4000-8000-000000001621'
    );

INSERT INTO domain_behavior_template (
    behavior_template_id, domain_id, behavior_code, name_ko, definition,
    rule_json, targetability_class, evidence_status, data_version,
    created_by_run_id
) VALUES
    (
        'DOM-MIGRATION-016-MINOR-BEH-01', 'DOM-MIGRATION-016-MINOR',
        'migration_016.minor_behavior', '보호 행동', '보호 행동 fixture',
        '{"all":[]}'::jsonb, 'proxy_targetable', 'fixture', 'migration-016-test',
        '00000000-0000-4000-8000-000000001621'
    ),
    (
        'DOM-MIGRATION-016-ACTIVE-BEH-01', 'DOM-MIGRATION-016-ACTIVE',
        'migration_016.not_allowed_behavior', '금지 행동', '타게팅 금지 fixture',
        '{"all":[]}'::jsonb, 'not_allowed', 'fixture', 'migration-016-test',
        '00000000-0000-4000-8000-000000001621'
    );

INSERT INTO domain_tag (
    tag_id, domain_id, tag_code, tag_type, name_ko, provenance,
    data_version, created_by_run_id
) VALUES
    (
        'DOM-MIGRATION-016-MINOR-TAG-01', 'DOM-MIGRATION-016-MINOR',
        'migration_016.minor_tag', 'motivation', '보호 태그', 'fixture',
        'migration-016-test', '00000000-0000-4000-8000-000000001621'
    ),
    (
        'DOM-MIGRATION-016-INACTIVE-TAG-01', 'DOM-MIGRATION-016-INACTIVE',
        'migration_016.inactive_tag', 'motivation', '비활성 태그', 'fixture',
        'migration-016-test', '00000000-0000-4000-8000-000000001621'
    ),
    (
        'DOM-MIGRATION-016-ACTIVE-TAG-01', 'DOM-MIGRATION-016-ACTIVE',
        'migration_016.active_tag', 'motivation', '활성 태그', 'fixture',
        'migration-016-test', '00000000-0000-4000-8000-000000001621'
    );

INSERT INTO segmentation_model (
    segmentation_model_id, domain_id, algorithm, feature_pipeline,
    sample_definition, sample_size, weighted_support, effective_sample_size,
    candidate_k, selected_k, random_seeds, stability_metrics,
    selection_rationale, artifact_uri, status, model_version_id, run_id,
    data_version, created_by_run_id
) VALUES (
    'MODEL-MIGRATION-016-MINOR', 'DOM-MIGRATION-016-MINOR', 'minibatch_kmeans',
    '{}'::jsonb, '{}'::jsonb, 100, 100, 100, '[3]'::jsonb, 3,
    '[20260825]'::jsonb, '{}'::jsonb, 'fixture', 'fixture://migration-016',
    'selected', '00000000-0000-4000-8000-000000001620',
    '00000000-0000-4000-8000-000000001621', 'migration-016-test',
    '00000000-0000-4000-8000-000000001621'
);

INSERT INTO cluster_definition (
    cluster_id, segmentation_model_id, cluster_number, post_hoc_label_ko,
    label_evidence, weighted_prevalence, effective_sample_size, hard_support,
    soft_support, data_version, created_by_run_id
) VALUES (
    'CLUSTER-MIGRATION-016-MINOR', 'MODEL-MIGRATION-016-MINOR', 0,
    '보호 군집', '{}'::jsonb, 1, 100, 100, 100,
    'migration-016-test', '00000000-0000-4000-8000-000000001621'
);

INSERT INTO archetype_hierarchy (
    hierarchy_id, domain_id, hierarchy_level, node_type, node_code,
    name_ko, definition, rule_json, data_version, created_by_run_id
) VALUES (
    'HIERARCHY-MIGRATION-016-MINOR', 'DOM-MIGRATION-016-MINOR', 1,
    'market_segment', 'migration_016_minor', '보호 계층', 'fixture',
    '{}'::jsonb, 'migration-016-test',
    '00000000-0000-4000-8000-000000001621'
);

INSERT INTO subtype_definition (
    subtype_id, domain_id, cluster_id, hierarchy_id, subtype_code,
    name_ko, definition, is_primary, label_status, evidence_boundary,
    data_version, created_by_run_id
) VALUES (
    'SUBTYPE-MIGRATION-016-MINOR', 'DOM-MIGRATION-016-MINOR',
    'CLUSTER-MIGRATION-016-MINOR', 'HIERARCHY-MIGRATION-016-MINOR',
    'migration_016.minor_subtype', '보호 서브타입', 'fixture', true,
    'needs_review', 'synthetic fixture only', 'migration-016-test',
    '00000000-0000-4000-8000-000000001621'
);

INSERT INTO archetype (
    archetype_id, category_id, name_ko, one_line_definition,
    primary_entity_unit, status, version, data_version, created_by_run_id
) VALUES
    (
        'ARC-MIGRATION-016-CHILD',
        (SELECT category_id FROM category WHERE code = 'migration_016_catalog'),
        '아동 아키타입', '보호 아키타입 fixture', 'child_person',
        'not_estimable', 'migration-016-test', 'migration-016-test',
        '00000000-0000-4000-8000-000000001621'
    ),
    (
        'ARC-MIGRATION-016-ADULT',
        (SELECT category_id FROM category WHERE code = 'migration_016_catalog'),
        '성인 아키타입', '비보호 대조군 fixture', 'person',
        'draft', 'migration-016-test', 'migration-016-test',
        '00000000-0000-4000-8000-000000001621'
    );

DO $$
DECLARE
    failed_count integer;
BEGIN
    SELECT count(*) INTO failed_count
      FROM v_condition_catalog
     WHERE catalog_id IN (
        'domain_feature:DOM-MIGRATION-016-MINOR-FEAT-01',
        'dimension_value:DOM-MIGRATION-016-MINOR-DIM-01:1',
        'behavior:DOM-MIGRATION-016-MINOR-BEH-01',
        'tag:DOM-MIGRATION-016-MINOR-TAG-01',
        'subtype:SUBTYPE-MIGRATION-016-MINOR'
     )
       AND (sensitive_class <> 'minor_protected' OR queryable);
    IF failed_count <> 0 THEN
        RAISE EXCEPTION 'guarded catalog policy failed for % rows', failed_count;
    END IF;

    SELECT count(*) INTO failed_count
      FROM v_condition_catalog
     WHERE catalog_id = 'domain_feature:DOM-MIGRATION-016-MINOR-FEAT-02'
       AND (sensitive_class <> 'restricted_targeting' OR queryable);
    IF failed_count <> 0 THEN
        RAISE EXCEPTION 'stricter guarded domain-feature policy failed';
    END IF;

    SELECT count(*) INTO failed_count
      FROM v_condition_catalog
     WHERE catalog_id = 'behavior:DOM-MIGRATION-016-ACTIVE-BEH-01'
       AND (sensitive_class <> 'restricted_targeting' OR queryable);
    IF failed_count <> 0 THEN
        RAISE EXCEPTION 'not-allowed behavior policy failed';
    END IF;

    SELECT count(*) INTO failed_count
      FROM v_condition_catalog
     WHERE catalog_id = 'tag:DOM-MIGRATION-016-INACTIVE-TAG-01'
       AND queryable;
    IF failed_count <> 0 THEN
        RAISE EXCEPTION 'inactive-domain tag remained queryable';
    END IF;

    SELECT count(*) INTO failed_count
      FROM v_condition_catalog
     WHERE catalog_id = 'tag:DOM-MIGRATION-016-ACTIVE-TAG-01'
       AND (sensitive_class <> 'non_sensitive' OR NOT queryable);
    IF failed_count <> 0 THEN
        RAISE EXCEPTION 'active non-guarded tag control failed';
    END IF;

    SELECT count(*) INTO failed_count
      FROM v_condition_catalog
     WHERE catalog_id = 'archetype:ARC-MIGRATION-016-CHILD'
       AND (sensitive_class <> 'minor_protected' OR queryable);
    IF failed_count <> 0 THEN
        RAISE EXCEPTION 'child-person archetype policy failed';
    END IF;

    SELECT count(*) INTO failed_count
      FROM v_condition_catalog
     WHERE catalog_id = 'archetype:ARC-MIGRATION-016-ADULT'
       AND (sensitive_class <> 'non_sensitive' OR NOT queryable);
    IF failed_count <> 0 THEN
        RAISE EXCEPTION 'non-child archetype control failed';
    END IF;

    SELECT count(*) INTO failed_count
      FROM v_condition_catalog
     WHERE catalog_id IN (
        'domain_feature:DOM-MIGRATION-016-MINOR-FEAT-01',
        'domain_feature:DOM-MIGRATION-016-MINOR-FEAT-02',
        'dimension_value:DOM-MIGRATION-016-MINOR-DIM-01:1',
        'behavior:DOM-MIGRATION-016-MINOR-BEH-01',
        'behavior:DOM-MIGRATION-016-ACTIVE-BEH-01',
        'tag:DOM-MIGRATION-016-MINOR-TAG-01',
        'tag:DOM-MIGRATION-016-INACTIVE-TAG-01',
        'tag:DOM-MIGRATION-016-ACTIVE-TAG-01',
        'subtype:SUBTYPE-MIGRATION-016-MINOR',
        'archetype:ARC-MIGRATION-016-CHILD',
        'archetype:ARC-MIGRATION-016-ADULT'
     );
    IF failed_count <> 11 THEN
        RAISE EXCEPTION 'expected all 11 catalog fixture rows, found %', failed_count;
    END IF;
END $$;

ROLLBACK;
