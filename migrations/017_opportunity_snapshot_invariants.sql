BEGIN;

-- Opportunity links pin an immutable saved-segment/query-result snapshot.  No
-- existing row is repaired here: a populated database must satisfy every
-- relationship before the guards are installed.
CREATE OR REPLACE FUNCTION workbench_assert_opportunity_snapshot_invariants()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    duplicate_primary_opportunity_count bigint;
    linked_query_workspace_mismatch_count bigint;
    workspace_mismatch_count bigint;
    saved_version_query_mismatch_count bigint;
    saved_version_result_mismatch_count bigint;
    market_estimate_result_mismatch_count bigint;
BEGIN
    SELECT count(*)
      INTO duplicate_primary_opportunity_count
      FROM (
          SELECT opportunity_id
            FROM public.opportunity_segment_link
           WHERE link_role = 'primary_target'
           GROUP BY opportunity_id
          HAVING count(*) > 1
      ) duplicate_primary;

    IF duplicate_primary_opportunity_count > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '23505',
            CONSTRAINT = 'opportunity_segment_link_one_primary_target_uidx',
            MESSAGE = format(
                'migration 017 preflight failed: %s opportunity(s) have more than one primary_target link; no row was changed',
                duplicate_primary_opportunity_count
            );
    END IF;

    -- A saved version with a non-NULL pinned_result_id is an exact pin. Legacy
    -- NULL version pins remain valid when the immutable link result belongs to
    -- that version's query; the link's query_result_id is then authoritative.
    SELECT
        count(*) FILTER (
            WHERE board.workspace_id IS DISTINCT FROM linked_query.workspace_id
        ),
        count(*) FILTER (
            WHERE link.saved_segment_id IS NOT NULL
              AND board.workspace_id IS DISTINCT FROM segment.workspace_id
        ),
        count(*) FILTER (
            WHERE link.saved_segment_id IS NOT NULL
              AND saved_version.query_id IS DISTINCT FROM result.query_id
        ),
        count(*) FILTER (
            WHERE link.saved_segment_id IS NOT NULL
              AND saved_version.pinned_result_id IS NOT NULL
              AND saved_version.pinned_result_id IS DISTINCT FROM link.query_result_id
        ),
        count(*) FILTER (
            WHERE link.market_estimate_id IS NOT NULL
              AND scenario.base_query_result_id IS DISTINCT FROM link.query_result_id
        )
      INTO
        linked_query_workspace_mismatch_count,
        workspace_mismatch_count,
        saved_version_query_mismatch_count,
        saved_version_result_mismatch_count,
        market_estimate_result_mismatch_count
      FROM public.opportunity_segment_link link
      JOIN public.opportunity opportunity
        ON opportunity.opportunity_id = link.opportunity_id
      JOIN public.opportunity_board board
        ON board.opportunity_board_id = opportunity.opportunity_board_id
      JOIN public.segment_query_result result
        ON result.result_id = link.query_result_id
      JOIN public.segment_query linked_query
        ON linked_query.query_id = result.query_id
      LEFT JOIN public.saved_segment segment
        ON segment.saved_segment_id = link.saved_segment_id
      LEFT JOIN public.saved_segment_version saved_version
        ON saved_version.saved_segment_id = link.saved_segment_id
       AND saved_version.version_no = link.saved_segment_version_no
      LEFT JOIN public.market_estimate market_estimate
        ON market_estimate.market_estimate_id = link.market_estimate_id
      LEFT JOIN public.market_scenario scenario
        ON scenario.scenario_id = market_estimate.scenario_id;

    IF linked_query_workspace_mismatch_count > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
            MESSAGE = format(
                'migration 017 preflight failed: %s opportunity link(s) cross opportunity-board and linked-query workspaces; no row was changed',
                linked_query_workspace_mismatch_count
            );
    END IF;
    IF workspace_mismatch_count > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
            MESSAGE = format(
                'migration 017 preflight failed: %s opportunity link(s) cross opportunity-board and saved-segment workspaces; no row was changed',
                workspace_mismatch_count
            );
    END IF;
    IF saved_version_query_mismatch_count > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
            MESSAGE = format(
                'migration 017 preflight failed: %s opportunity link(s) use a query result outside the pinned saved-segment query; no row was changed',
                saved_version_query_mismatch_count
            );
    END IF;
    IF saved_version_result_mismatch_count > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
            MESSAGE = format(
                'migration 017 preflight failed: %s opportunity link(s) differ from a non-NULL saved-segment version pinned result; legacy NULL version pins use the immutable same-query link result as the authoritative pin; no row was changed',
                saved_version_result_mismatch_count
            );
    END IF;
    IF market_estimate_result_mismatch_count > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
            MESSAGE = format(
                'migration 017 preflight failed: %s opportunity link(s) attach a market estimate whose scenario uses another base query result; no row was changed',
                market_estimate_result_mismatch_count
            );
    END IF;
END $$;

SELECT workbench_assert_opportunity_snapshot_invariants();

CREATE UNIQUE INDEX IF NOT EXISTS opportunity_segment_link_one_primary_target_uidx
    ON opportunity_segment_link(opportunity_id)
    WHERE link_role = 'primary_target';

CREATE OR REPLACE FUNCTION workbench_guard_opportunity_segment_link_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    board_workspace_id uuid;
    segment_workspace_id uuid;
    saved_version_query_id uuid;
    saved_version_result_id uuid;
    linked_result_query_id uuid;
    linked_query_workspace_id uuid;
    scenario_base_result_id uuid;
BEGIN
    SELECT board.workspace_id
      INTO board_workspace_id
      FROM public.opportunity opportunity
      JOIN public.opportunity_board board
        ON board.opportunity_board_id = opportunity.opportunity_board_id
     WHERE opportunity.opportunity_id = NEW.opportunity_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
            MESSAGE = 'opportunity snapshot link requires a visible opportunity board';
    END IF;

    SELECT result.query_id, linked_query.workspace_id
      INTO linked_result_query_id, linked_query_workspace_id
      FROM public.segment_query_result result
      JOIN public.segment_query linked_query
        ON linked_query.query_id = result.query_id
     WHERE result.result_id = NEW.query_result_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
            MESSAGE = 'opportunity snapshot link requires a visible query result';
    END IF;
    IF board_workspace_id IS DISTINCT FROM linked_query_workspace_id THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
            MESSAGE = 'opportunity board and linked query result must belong to the same workspace';
    END IF;

    IF NEW.saved_segment_id IS NOT NULL THEN
        SELECT segment.workspace_id, saved_version.query_id, saved_version.pinned_result_id
          INTO segment_workspace_id, saved_version_query_id, saved_version_result_id
          FROM public.saved_segment_version saved_version
          JOIN public.saved_segment segment
            ON segment.saved_segment_id = saved_version.saved_segment_id
         WHERE saved_version.saved_segment_id = NEW.saved_segment_id
           AND saved_version.version_no = NEW.saved_segment_version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
                MESSAGE = 'opportunity snapshot link requires a visible saved-segment version';
        END IF;
        IF board_workspace_id IS DISTINCT FROM segment_workspace_id THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
                MESSAGE = 'opportunity board and saved segment must belong to the same workspace';
        END IF;
        IF saved_version_query_id IS DISTINCT FROM linked_result_query_id THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
                MESSAGE = 'opportunity query result must belong to the saved-segment version query';
        END IF;
        -- Compatibility for legacy saved versions that predate result pinning:
        -- the immutable link.query_result_id is authoritative when the saved
        -- version has no pin, provided the same-query check above succeeded.
        IF saved_version_result_id IS NOT NULL
           AND saved_version_result_id IS DISTINCT FROM NEW.query_result_id THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
                MESSAGE = 'opportunity query result must equal the non-NULL saved-segment version pinned result; a legacy NULL version pin delegates to the immutable same-query link result';
        END IF;
    END IF;

    IF NEW.market_estimate_id IS NOT NULL THEN
        SELECT scenario.base_query_result_id
          INTO scenario_base_result_id
          FROM public.market_estimate market_estimate
          JOIN public.market_scenario scenario
            ON scenario.scenario_id = market_estimate.scenario_id
         WHERE market_estimate.market_estimate_id = NEW.market_estimate_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
                MESSAGE = 'opportunity snapshot link requires a visible market estimate scenario';
        END IF;
        IF scenario_base_result_id IS DISTINCT FROM NEW.query_result_id THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                CONSTRAINT = 'opportunity_segment_link_snapshot_invariant',
                MESSAGE = 'opportunity market estimate scenario must use the linked base query result';
        END IF;
    END IF;

    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION workbench_guard_primary_opportunity_target_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.link_role = 'primary_target' THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                CONSTRAINT = 'opportunity_primary_target_append_only',
                MESSAGE = 'opportunity primary_target snapshot is append-only; DELETE is not permitted';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.link_role = 'primary_target' OR NEW.link_role = 'primary_target' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'opportunity_primary_target_append_only',
            MESSAGE = 'opportunity primary_target snapshot is append-only; UPDATE is not permitted';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS opportunity_segment_link_snapshot_guard_trigger
    ON opportunity_segment_link;
CREATE TRIGGER opportunity_segment_link_snapshot_guard_trigger
    BEFORE INSERT OR UPDATE ON opportunity_segment_link
    FOR EACH ROW EXECUTE FUNCTION workbench_guard_opportunity_segment_link_snapshot();

DROP TRIGGER IF EXISTS opportunity_primary_target_append_only_trigger
    ON opportunity_segment_link;
CREATE TRIGGER opportunity_primary_target_append_only_trigger
    BEFORE UPDATE OR DELETE ON opportunity_segment_link
    FOR EACH ROW EXECUTE FUNCTION workbench_guard_primary_opportunity_target_append_only();

-- Runtime services only append links.  The worker has no link mutation role,
-- and neither runtime role may rewrite or remove a pinned snapshot.
REVOKE UPDATE, DELETE ON TABLE opportunity_segment_link
FROM market_engine_app, market_engine_worker;
REVOKE UPDATE (
    opportunity_segment_link_id, opportunity_id, saved_segment_id,
    saved_segment_version_no, query_result_id, market_estimate_id,
    link_role, pinned_at
) ON opportunity_segment_link
FROM market_engine_app, market_engine_worker;
REVOKE INSERT ON TABLE opportunity_segment_link FROM market_engine_worker;
GRANT INSERT ON TABLE opportunity_segment_link TO market_engine_app;

REVOKE EXECUTE ON FUNCTION workbench_assert_opportunity_snapshot_invariants()
FROM PUBLIC, market_engine_app, market_engine_worker;

COMMIT;
