BEGIN;

CREATE TEMP TABLE migration_015_market_estimate_test
    (LIKE market_estimate INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TEMP TABLE migration_015_scenario_factor_test
    (LIKE scenario_factor_override INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TEMP TABLE migration_015_opportunity_test
    (LIKE opportunity INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TEMP TABLE migration_015_experiment_test
    (LIKE opportunity_experiment INCLUDING DEFAULTS INCLUDING CONSTRAINTS);

DO $$
DECLARE
    rejected_constraint text;
BEGIN
    BEGIN
        INSERT INTO migration_015_market_estimate_test (
            scenario_id,
            tam_entities_low, tam_entities_base, tam_entities_high,
            sam_entities_low, sam_entities_base, sam_entities_high,
            som_entities_low, som_entities_base, som_entities_high,
            formula, confidence_score, run_id, data_version
        ) VALUES (
            '00000000-0000-4000-8000-000000001501',
            -1, -1, -1, -1, -1, -1, -1, -1, -1,
            'migration-015-negative-entity-test', 50,
            '00000000-0000-4000-8000-000000001502', 'migration-015-test'
        );
        RAISE EXCEPTION 'negative market entity interval was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
            IF rejected_constraint IS DISTINCT FROM 'market_estimate_nonnegative_values_chk' THEN
                RAISE EXCEPTION 'expected market_estimate_nonnegative_values_chk, got %', rejected_constraint;
            END IF;
    END;

    BEGIN
        INSERT INTO migration_015_market_estimate_test (
            scenario_id,
            tam_entities_low, tam_entities_base, tam_entities_high,
            sam_entities_low, sam_entities_base, sam_entities_high,
            som_entities_low, som_entities_base, som_entities_high,
            tam_revenue_low, tam_revenue_base, tam_revenue_high,
            sam_revenue_low, sam_revenue_base, sam_revenue_high,
            som_revenue_low, som_revenue_base, som_revenue_high,
            formula, confidence_score, run_id, data_version
        ) VALUES (
            '00000000-0000-4000-8000-000000001503',
            1, 1, 1, 1, 1, 1, 1, 1, 1,
            -1, -1, -1, -1, -1, -1, -1, -1, -1,
            'migration-015-negative-revenue-test', 50,
            '00000000-0000-4000-8000-000000001504', 'migration-015-test'
        );
        RAISE EXCEPTION 'negative market revenue interval was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
            IF rejected_constraint IS DISTINCT FROM 'market_estimate_nonnegative_values_chk' THEN
                RAISE EXCEPTION 'expected market_estimate_nonnegative_values_chk, got %', rejected_constraint;
            END IF;
    END;

    INSERT INTO migration_015_market_estimate_test (
        scenario_id,
        tam_entities_low, tam_entities_base, tam_entities_high,
        sam_entities_low, sam_entities_base, sam_entities_high,
        som_entities_low, som_entities_base, som_entities_high,
        formula, confidence_score, run_id, data_version
    ) VALUES (
        '00000000-0000-4000-8000-000000001505',
        0, 1, 2, 0, 1, 2, 0, 1, 2,
        'migration-015-valid-entity-only-test', 50,
        '00000000-0000-4000-8000-000000001506', 'migration-015-test'
    );

    BEGIN
        INSERT INTO migration_015_scenario_factor_test (
            scenario_id, factor_code, value_low, value_base, value_high,
            unit, directness_class, rationale
        ) VALUES (
            '00000000-0000-4000-8000-000000001507',
            'annual_spend_per_entity', -0.1, 0.5, 0.8,
            'KRW/entity/year', 'user_input', 'migration-015 factor lower-bound test'
        );
        RAISE EXCEPTION 'negative non-ratio scenario factor was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
            IF rejected_constraint IS DISTINCT FROM 'scenario_factor_override_nonnegative_values_chk' THEN
                RAISE EXCEPTION 'expected scenario_factor_override_nonnegative_values_chk, got %', rejected_constraint;
            END IF;
    END;

    BEGIN
        INSERT INTO migration_015_scenario_factor_test (
            scenario_id, factor_code, value_low, value_base, value_high,
            unit, directness_class, rationale
        ) VALUES (
            '00000000-0000-4000-8000-000000001508',
            'serviceability_rate', 0.2, 0.5, 1.1,
            'custom', 'user_input', 'migration-015 semantic-rate upper-bound test'
        );
        RAISE EXCEPTION 'semantic rate above one was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
            IF rejected_constraint IS DISTINCT FROM 'scenario_factor_override_ratio_bounds_chk' THEN
                RAISE EXCEPTION 'expected scenario_factor_override_ratio_bounds_chk, got %', rejected_constraint;
            END IF;
    END;

    BEGIN
        INSERT INTO migration_015_scenario_factor_test (
            scenario_id, factor_code, value_low, value_base, value_high,
            unit, directness_class, rationale
        ) VALUES (
            '00000000-0000-4000-8000-000000001519',
            'custom_factor', 0.2, 0.5, 1.1,
            ' RATIO ', 'user_input', 'migration-015 ratio-unit upper-bound test'
        );
        RAISE EXCEPTION 'ratio unit above one was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
            IF rejected_constraint IS DISTINCT FROM 'scenario_factor_override_ratio_bounds_chk' THEN
                RAISE EXCEPTION 'expected scenario_factor_override_ratio_bounds_chk, got %', rejected_constraint;
            END IF;
    END;

    INSERT INTO migration_015_scenario_factor_test (
        scenario_id, factor_code, value_low, value_base, value_high,
        unit, directness_class, rationale
    ) VALUES
        (
            '00000000-0000-4000-8000-000000001509',
            'attainable_share', 0, 0.5, 1,
            'ratio', 'user_input', 'migration-015 valid ratio boundary test'
        ),
        (
            '00000000-0000-4000-8000-000000001510',
            'annual_spend_per_entity', 2, 3, 4,
            'KRW/entity/year', 'user_input', 'migration-015 valid non-ratio test'
        );

    BEGIN
        INSERT INTO migration_015_opportunity_test (
            opportunity_board_id, name, problem_statement, hypothesis_summary,
            solution_idea, expected_price_low, expected_price_base,
            expected_price_high, currency, status, created_by_actor_id
        ) VALUES (
            '00000000-0000-4000-8000-000000001511',
            'migration-015 negative price', 'test', 'test', 'test',
            -1, -1, -1, 'KRW', 'discovered',
            '00000000-0000-4000-8000-000000001512'
        );
        RAISE EXCEPTION 'negative opportunity price was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
            IF rejected_constraint IS DISTINCT FROM 'opportunity_expected_price_nonnegative_chk' THEN
                RAISE EXCEPTION 'expected opportunity_expected_price_nonnegative_chk, got %', rejected_constraint;
            END IF;
    END;

    INSERT INTO migration_015_opportunity_test (
        opportunity_board_id, name, problem_statement, hypothesis_summary,
        solution_idea, status, created_by_actor_id
    ) VALUES (
        '00000000-0000-4000-8000-000000001513',
        'migration-015 null price', 'test', 'test', 'test',
        'discovered', '00000000-0000-4000-8000-000000001514'
    );

    BEGIN
        INSERT INTO migration_015_experiment_test (
            opportunity_id, name, hypothesis, method, primary_metric,
            success_criteria, cost_low, cost_base, cost_high, currency,
            status, created_by_actor_id
        ) VALUES (
            '00000000-0000-4000-8000-000000001515',
            'migration-015 negative cost', 'test', 'test', 'test', 'test',
            -1, -1, -1, 'KRW', 'draft',
            '00000000-0000-4000-8000-000000001516'
        );
        RAISE EXCEPTION 'negative opportunity experiment cost was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
            IF rejected_constraint IS DISTINCT FROM 'opportunity_experiment_cost_nonnegative_chk' THEN
                RAISE EXCEPTION 'expected opportunity_experiment_cost_nonnegative_chk, got %', rejected_constraint;
            END IF;
    END;

    INSERT INTO migration_015_experiment_test (
        opportunity_id, name, hypothesis, method, primary_metric,
        success_criteria, status, created_by_actor_id
    ) VALUES (
        '00000000-0000-4000-8000-000000001517',
        'migration-015 null cost', 'test', 'test', 'test', 'test',
        'draft', '00000000-0000-4000-8000-000000001518'
    );
END $$;

ROLLBACK;
