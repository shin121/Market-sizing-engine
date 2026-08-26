BEGIN;

-- This fixture builds on the committed migration-010 stateful reapply slice.
-- Every row created here is rolled back after positive, negative, permission,
-- append-only, and populated-preflight assertions complete.
INSERT INTO segment_query (
    query_id, workspace_id, created_by_actor_id, name, filter_json,
    primary_entity_unit, geography_scope, as_of_date, query_hash, data_version
) VALUES (
    '00000000-0000-4000-8000-000000001701',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000001002',
    'Migration 017 alternate query', '{}'::jsonb, 'enterprise',
    '{"level":"country","codes":["MIG-010-REAPPLY"]}'::jsonb,
    DATE '2026-08-25', repeat('7', 64), 'migration-017-test'
);

INSERT INTO segment_query_result (
    result_id, query_id, estimate_id, model_version_id, executed_at,
    result_summary, data_version, result_hash, dependency_fingerprint,
    cache_status
) VALUES
    (
        '00000000-0000-4000-8000-000000001702',
        '00000000-0000-4000-8000-000000001006',
        '00000000-0000-4000-8000-000000001005',
        '00000000-0000-4000-8000-000000001003', now(),
        '{"fixture":"migration-017-same-query-alternate-result"}'::jsonb,
        'migration-017-test', repeat('8', 64), repeat('8', 64), 'valid'
    ),
    (
        '00000000-0000-4000-8000-000000001703',
        '00000000-0000-4000-8000-000000001701',
        '00000000-0000-4000-8000-000000001005',
        '00000000-0000-4000-8000-000000001003', now(),
        '{"fixture":"migration-017-alternate-query-result"}'::jsonb,
        'migration-017-test', repeat('9', 64), repeat('9', 64), 'valid'
    );

INSERT INTO saved_segment (
    saved_segment_id, workspace_id, title, created_by_actor_id
) VALUES
    (
        '00000000-0000-4000-8000-000000001704',
        '00000000-0000-4000-8000-000000001001',
        'Migration 017 alternate segment',
        '00000000-0000-4000-8000-000000001002'
    ),
    (
        '00000000-0000-4000-8000-000000001708',
        '00000000-0000-4000-8000-000000001001',
        'Migration 017 legacy NULL-pin segment',
        '00000000-0000-4000-8000-000000001002'
    );

INSERT INTO saved_segment_version (
    saved_segment_id, version_no, query_id, pinned_result_id,
    definition_hash, change_reason, created_by_actor_id
) VALUES
    (
        '00000000-0000-4000-8000-000000001704', 1,
        '00000000-0000-4000-8000-000000001701',
        '00000000-0000-4000-8000-000000001703', repeat('a', 64),
        'migration_017_fixture', '00000000-0000-4000-8000-000000001002'
    ),
    (
        '00000000-0000-4000-8000-000000001708', 1,
        '00000000-0000-4000-8000-000000001701',
        NULL, repeat('d', 64),
        'legacy_null_pin_compatibility_fixture',
        '00000000-0000-4000-8000-000000001002'
    );

INSERT INTO workspace (workspace_id, workspace_key, name)
VALUES (
    '00000000-0000-4000-8000-000000001705',
    'migration-017-other-workspace',
    'Migration 017 other workspace'
);

INSERT INTO opportunity_board (
    opportunity_board_id, workspace_id, name, created_by_actor_id
) VALUES
    (
        '00000000-0000-4000-8000-000000001706',
        '00000000-0000-4000-8000-000000001001',
        'Migration 017 primary board',
        '00000000-0000-4000-8000-000000001002'
    ),
    (
        '00000000-0000-4000-8000-000000001707',
        '00000000-0000-4000-8000-000000001705',
        'Migration 017 other-workspace board',
        '00000000-0000-4000-8000-000000001002'
    );

INSERT INTO opportunity (
    opportunity_id, opportunity_board_id, name, problem_statement,
    hypothesis_summary, solution_idea, status, created_by_actor_id
) VALUES
    ('00000000-0000-4000-8000-000000001710', '00000000-0000-4000-8000-000000001706', 'Migration 017 positive', 'fixture', 'fixture', 'fixture', 'discovered', '00000000-0000-4000-8000-000000001002'),
    ('00000000-0000-4000-8000-000000001711', '00000000-0000-4000-8000-000000001707', 'Migration 017 workspace mismatch', 'fixture', 'fixture', 'fixture', 'discovered', '00000000-0000-4000-8000-000000001002'),
    ('00000000-0000-4000-8000-000000001712', '00000000-0000-4000-8000-000000001706', 'Migration 017 query mismatch', 'fixture', 'fixture', 'fixture', 'discovered', '00000000-0000-4000-8000-000000001002'),
    ('00000000-0000-4000-8000-000000001713', '00000000-0000-4000-8000-000000001706', 'Migration 017 pinned result mismatch', 'fixture', 'fixture', 'fixture', 'discovered', '00000000-0000-4000-8000-000000001002'),
    ('00000000-0000-4000-8000-000000001714', '00000000-0000-4000-8000-000000001706', 'Migration 017 market estimate mismatch', 'fixture', 'fixture', 'fixture', 'discovered', '00000000-0000-4000-8000-000000001002'),
    ('00000000-0000-4000-8000-000000001715', '00000000-0000-4000-8000-000000001706', 'Migration 017 legacy NULL pin', 'fixture', 'fixture', 'fixture', 'discovered', '00000000-0000-4000-8000-000000001002');

INSERT INTO market_estimate (
    market_estimate_id, scenario_id,
    tam_entities_low, tam_entities_base, tam_entities_high,
    sam_entities_low, sam_entities_base, sam_entities_high,
    som_entities_low, som_entities_base, som_entities_high,
    formula, confidence_score, run_id, data_version
) VALUES (
    '00000000-0000-4000-8000-000000001720',
    '00000000-0000-4000-8000-000000001009',
    10, 12, 15, 5, 6, 7, 1, 2, 3,
    'migration-017 snapshot fixture', 50,
    '00000000-0000-4000-8000-000000001004', 'migration-017-test'
);

DO $$
BEGIN
    IF NOT has_table_privilege(
        'market_engine_app', 'public.opportunity_segment_link', 'INSERT'
    ) THEN
        RAISE EXCEPTION 'market_engine_app lost required opportunity link INSERT privilege';
    END IF;
    IF has_table_privilege(
        'market_engine_app', 'public.opportunity_segment_link', 'UPDATE'
    ) OR has_any_column_privilege(
        'market_engine_app', 'public.opportunity_segment_link', 'UPDATE'
    ) OR has_table_privilege(
        'market_engine_app', 'public.opportunity_segment_link', 'DELETE'
    ) THEN
        RAISE EXCEPTION 'market_engine_app retains forbidden opportunity link rewrite privileges';
    END IF;
    IF has_table_privilege(
        'market_engine_worker', 'public.opportunity_segment_link', 'INSERT'
    ) OR has_table_privilege(
        'market_engine_worker', 'public.opportunity_segment_link', 'UPDATE'
    ) OR has_table_privilege(
        'market_engine_worker', 'public.opportunity_segment_link', 'DELETE'
    ) THEN
        RAISE EXCEPTION 'market_engine_worker retains forbidden opportunity link mutation privileges';
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
INSERT INTO opportunity_segment_link (
    opportunity_segment_link_id, opportunity_id, saved_segment_id,
    saved_segment_version_no, query_result_id, market_estimate_id, link_role
) VALUES (
    '00000000-0000-4000-8000-000000001721',
    '00000000-0000-4000-8000-000000001710',
    '00000000-0000-4000-8000-000000001008', 1,
    '00000000-0000-4000-8000-000000001007',
    '00000000-0000-4000-8000-000000001720',
    'primary_target'
);
-- A legacy saved-segment version may have no pinned_result_id. The immutable
-- link result is the authoritative pin when it belongs to the version query.
INSERT INTO opportunity_segment_link (
    opportunity_segment_link_id, opportunity_id, saved_segment_id,
    saved_segment_version_no, query_result_id, link_role
) VALUES (
    '00000000-0000-4000-8000-000000001730',
    '00000000-0000-4000-8000-000000001715',
    '00000000-0000-4000-8000-000000001708', 1,
    '00000000-0000-4000-8000-000000001703',
    'primary_target'
);
RESET ROLE;

DO $$
DECLARE
    rejected_constraint text;
    rejected_message text;
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM opportunity_segment_link
         WHERE opportunity_segment_link_id = '00000000-0000-4000-8000-000000001721'
           AND link_role = 'primary_target'
    ) THEN
        RAISE EXCEPTION 'market_engine_app positive opportunity link insert was not persisted';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM opportunity_segment_link link
          JOIN saved_segment_version saved_version
            ON saved_version.saved_segment_id = link.saved_segment_id
           AND saved_version.version_no = link.saved_segment_version_no
         WHERE link.opportunity_segment_link_id = '00000000-0000-4000-8000-000000001730'
           AND saved_version.pinned_result_id IS NULL
           AND saved_version.query_id = '00000000-0000-4000-8000-000000001701'
           AND link.query_result_id = '00000000-0000-4000-8000-000000001703'
    ) THEN
        RAISE EXCEPTION 'legacy NULL saved-version pin did not preserve the same-query link result as authoritative';
    END IF;

    BEGIN
        INSERT INTO opportunity_segment_link (
            opportunity_segment_link_id, opportunity_id, query_result_id, link_role
        ) VALUES (
            '00000000-0000-4000-8000-000000001722',
            '00000000-0000-4000-8000-000000001710',
            '00000000-0000-4000-8000-000000001702', 'primary_target'
        );
        RAISE EXCEPTION 'duplicate primary_target link was accepted';
    EXCEPTION
        WHEN unique_violation THEN
            GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
            IF rejected_constraint IS DISTINCT FROM 'opportunity_segment_link_one_primary_target_uidx' THEN
                RAISE EXCEPTION 'unexpected duplicate-primary constraint: %', rejected_constraint;
            END IF;
    END;

    BEGIN
        INSERT INTO opportunity_segment_link (
            opportunity_segment_link_id, opportunity_id, query_result_id,
            link_role
        ) VALUES (
            '00000000-0000-4000-8000-000000001729',
            '00000000-0000-4000-8000-000000001711',
            '00000000-0000-4000-8000-000000001007', 'evidence'
        );
        RAISE EXCEPTION 'cross-workspace query result without a saved segment was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                rejected_constraint = CONSTRAINT_NAME,
                rejected_message = MESSAGE_TEXT;
            IF rejected_constraint IS DISTINCT FROM 'opportunity_segment_link_snapshot_invariant'
               OR rejected_message NOT LIKE '%linked query result%same workspace%' THEN
                RAISE EXCEPTION 'unexpected linked-query workspace guard failure: % / %', rejected_constraint, rejected_message;
            END IF;
    END;

    BEGIN
        INSERT INTO opportunity_segment_link (
            opportunity_segment_link_id, opportunity_id, saved_segment_id,
            saved_segment_version_no, query_result_id, link_role
        ) VALUES (
            '00000000-0000-4000-8000-000000001723',
            '00000000-0000-4000-8000-000000001711',
            '00000000-0000-4000-8000-000000001008', 1,
            '00000000-0000-4000-8000-000000001007', 'primary_target'
        );
        RAISE EXCEPTION 'cross-workspace opportunity link was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                rejected_constraint = CONSTRAINT_NAME,
                rejected_message = MESSAGE_TEXT;
            IF rejected_constraint IS DISTINCT FROM 'opportunity_segment_link_snapshot_invariant'
               OR rejected_message NOT LIKE '%same workspace%' THEN
                RAISE EXCEPTION 'unexpected workspace guard failure: % / %', rejected_constraint, rejected_message;
            END IF;
    END;

    BEGIN
        INSERT INTO opportunity_segment_link (
            opportunity_segment_link_id, opportunity_id, saved_segment_id,
            saved_segment_version_no, query_result_id, link_role
        ) VALUES (
            '00000000-0000-4000-8000-000000001724',
            '00000000-0000-4000-8000-000000001712',
            '00000000-0000-4000-8000-000000001704', 1,
            '00000000-0000-4000-8000-000000001007', 'primary_target'
        );
        RAISE EXCEPTION 'saved-version query mismatch was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS rejected_message = MESSAGE_TEXT;
            IF rejected_message NOT LIKE '%saved-segment version query%' THEN
                RAISE EXCEPTION 'unexpected saved-version query guard failure: %', rejected_message;
            END IF;
    END;

    BEGIN
        INSERT INTO opportunity_segment_link (
            opportunity_segment_link_id, opportunity_id, saved_segment_id,
            saved_segment_version_no, query_result_id, link_role
        ) VALUES (
            '00000000-0000-4000-8000-000000001725',
            '00000000-0000-4000-8000-000000001713',
            '00000000-0000-4000-8000-000000001008', 1,
            '00000000-0000-4000-8000-000000001702', 'primary_target'
        );
        RAISE EXCEPTION 'non-NULL saved-version pinned-result mismatch was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS rejected_message = MESSAGE_TEXT;
            IF rejected_message NOT LIKE '%non-NULL saved-segment version pinned result%legacy NULL version pin%' THEN
                RAISE EXCEPTION 'unexpected non-NULL pinned-result guard failure: %', rejected_message;
            END IF;
    END;

    BEGIN
        INSERT INTO opportunity_segment_link (
            opportunity_segment_link_id, opportunity_id, query_result_id,
            market_estimate_id, link_role
        ) VALUES (
            '00000000-0000-4000-8000-000000001726',
            '00000000-0000-4000-8000-000000001714',
            '00000000-0000-4000-8000-000000001702',
            '00000000-0000-4000-8000-000000001720', 'secondary_target'
        );
        RAISE EXCEPTION 'market-estimate base-result mismatch was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS rejected_message = MESSAGE_TEXT;
            IF rejected_message NOT LIKE '%market estimate scenario%' THEN
                RAISE EXCEPTION 'unexpected market-estimate guard failure: %', rejected_message;
            END IF;
    END;

    INSERT INTO opportunity_segment_link (
        opportunity_segment_link_id, opportunity_id, query_result_id,
        market_estimate_id, link_role
    ) VALUES (
        '00000000-0000-4000-8000-000000001727',
        '00000000-0000-4000-8000-000000001714',
        '00000000-0000-4000-8000-000000001007',
        '00000000-0000-4000-8000-000000001720', 'secondary_target'
    );

    BEGIN
        UPDATE opportunity_segment_link
           SET query_result_id = '00000000-0000-4000-8000-000000001702'
         WHERE opportunity_segment_link_id = '00000000-0000-4000-8000-000000001727';
        RAISE EXCEPTION 'invalid secondary-target UPDATE was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS rejected_message = MESSAGE_TEXT;
            IF rejected_message NOT LIKE '%market estimate scenario%' THEN
                RAISE EXCEPTION 'unexpected UPDATE snapshot guard failure: %', rejected_message;
            END IF;
    END;

    BEGIN
        UPDATE opportunity_segment_link
           SET pinned_at = pinned_at + interval '1 second'
         WHERE opportunity_segment_link_id = '00000000-0000-4000-8000-000000001721';
        RAISE EXCEPTION 'primary_target UPDATE was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
            IF rejected_constraint IS DISTINCT FROM 'opportunity_primary_target_append_only' THEN
                RAISE EXCEPTION 'unexpected primary UPDATE guard: %', rejected_constraint;
            END IF;
    END;

    BEGIN
        DELETE FROM opportunity_segment_link
         WHERE opportunity_segment_link_id = '00000000-0000-4000-8000-000000001721';
        RAISE EXCEPTION 'primary_target DELETE was accepted';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
            IF rejected_constraint IS DISTINCT FROM 'opportunity_primary_target_append_only' THEN
                RAISE EXCEPTION 'unexpected primary DELETE guard: %', rejected_constraint;
            END IF;
    END;
END $$;

-- The populated-data preflight must also accept the compatible legacy NULL
-- version pin before an unrelated invalid row is introduced below.
SELECT workbench_assert_opportunity_snapshot_invariants();

-- Prove the populated-data assertion fails explicitly without repairing the
-- violating row. The trigger disable and invalid fixture row are transactional.
ALTER TABLE opportunity_segment_link
    DISABLE TRIGGER opportunity_segment_link_snapshot_guard_trigger;
INSERT INTO opportunity_segment_link (
    opportunity_segment_link_id, opportunity_id, query_result_id, link_role
) VALUES (
    '00000000-0000-4000-8000-000000001728',
    '00000000-0000-4000-8000-000000001711',
    '00000000-0000-4000-8000-000000001007', 'evidence'
);
ALTER TABLE opportunity_segment_link
    ENABLE TRIGGER opportunity_segment_link_snapshot_guard_trigger;

DO $$
DECLARE
    rejected_constraint text;
    rejected_message text;
BEGIN
    BEGIN
        PERFORM workbench_assert_opportunity_snapshot_invariants();
        RAISE EXCEPTION 'migration-017 populated preflight accepted an invalid row';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                rejected_constraint = CONSTRAINT_NAME,
                rejected_message = MESSAGE_TEXT;
            IF rejected_constraint IS DISTINCT FROM 'opportunity_segment_link_snapshot_invariant'
               OR rejected_message NOT LIKE 'migration 017 preflight failed:%no row was changed' THEN
                RAISE EXCEPTION 'unexpected populated-preflight failure: % / %', rejected_constraint, rejected_message;
            END IF;
    END;
END $$;

ROLLBACK;
