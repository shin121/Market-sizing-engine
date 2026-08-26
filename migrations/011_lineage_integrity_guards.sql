BEGIN;

-- Existing production rows must already satisfy the relationships enforced
-- below. Historical restricted-role fixtures are reported explicitly rather
-- than rewritten: they are immutable test artifacts, not product records.
DO $$
DECLARE
    production_violation_count bigint;
    legacy_fixture_violation_count bigint;
BEGIN
    WITH violations AS (
        SELECT
            sqr.result_id,
            coalesce((
                sqr.data_version = 'security-fixture-v1'
                AND sq.data_version = 'security-fixture-v1'
                AND e.data_version = 'security-fixture-v1'
                AND sq.name IN ('Restricted-role fixture', 'Hidden restricted-role fixture')
                AND coalesce(e.external_estimate_key, '') LIKE 'security-fixture-%'
            ), false) AS legacy_fixture
        FROM segment_query_result sqr
        JOIN segment_query sq USING (query_id)
        JOIN estimate e USING (estimate_id)
        WHERE e.entity_unit IS DISTINCT FROM sq.primary_entity_unit
           OR (
                e.workspace_id IS NOT NULL
                AND e.workspace_id IS DISTINCT FROM sq.workspace_id
           )
    )
    SELECT
        count(*) FILTER (WHERE NOT legacy_fixture),
        count(*) FILTER (WHERE legacy_fixture)
    INTO production_violation_count, legacy_fixture_violation_count
    FROM violations;

    IF production_violation_count > 0 THEN
        RAISE EXCEPTION
            'segment_query_result existing-data lineage audit failed for % production row(s)',
            production_violation_count;
    END IF;
    IF legacy_fixture_violation_count > 0 THEN
        RAISE WARNING
            'segment_query_result existing-data lineage audit found % immutable legacy security fixture row(s); no row was rewritten and all new inserts are guarded',
            legacy_fixture_violation_count;
    END IF;
END $$;

DO $$
DECLARE
    violation_count bigint;
BEGIN
    SELECT count(*)
    INTO violation_count
    FROM saved_segment_version ssv
    JOIN saved_segment ss USING (saved_segment_id)
    JOIN segment_query sq USING (query_id)
    LEFT JOIN segment_query_result sqr
      ON sqr.result_id = ssv.pinned_result_id
    WHERE ss.workspace_id IS DISTINCT FROM sq.workspace_id
       OR (
            ssv.pinned_result_id IS NOT NULL
            AND sqr.query_id IS DISTINCT FROM ssv.query_id
       );

    IF violation_count > 0 THEN
        RAISE EXCEPTION
            'saved_segment_version existing-data lineage audit failed for % row(s)',
            violation_count;
    END IF;
END $$;

DO $$
DECLARE
    production_violation_count bigint;
    legacy_fixture_violation_count bigint;
BEGIN
    WITH scenario_lineage AS (
        SELECT
            ms.scenario_id,
            sq.workspace_id AS query_workspace_id,
            sq.primary_entity_unit,
            sq.data_version AS query_data_version,
            sq.name AS query_name,
            sqr.query_id AS result_query_id,
            sqr.data_version AS result_data_version,
            e.entity_unit AS result_entity_unit,
            e.workspace_id AS result_estimate_workspace_id,
            e.data_version AS result_estimate_data_version,
            e.external_estimate_key,
            ssv.query_id AS saved_version_query_id,
            ssv.pinned_result_id,
            ss.workspace_id AS saved_segment_workspace_id,
            parent.workspace_id AS parent_scenario_workspace_id,
            coalesce((
                ms.data_version = 'security-fixture-v1'
                AND (
                    (
                        ms.scenario_id = '00000000-0000-4000-8000-0000000000f7'::uuid
                        AND ms.name = 'Restricted-role hidden scenario'
                    )
                    OR ms.name LIKE 'Restricted-role hidden scenario %'
                )
                AND sq.data_version = 'security-fixture-v1'
                AND sq.name = 'Restricted-role fixture'
                AND sqr.data_version = 'security-fixture-v1'
                AND e.data_version = 'security-fixture-v1'
                AND (
                    e.external_estimate_key = 'security-fixture-hidden'
                    OR e.external_estimate_key LIKE 'security-fixture-hidden-%'
                )
            ), false) AS legacy_fixture,
            ms.workspace_id,
            ms.query_id,
            ms.base_query_result_id,
            ms.market_unit,
            ms.saved_segment_id,
            ms.supersedes_scenario_id
        FROM market_scenario ms
        JOIN segment_query sq ON sq.query_id = ms.query_id
        LEFT JOIN segment_query_result sqr
          ON sqr.result_id = ms.base_query_result_id
        LEFT JOIN estimate e ON e.estimate_id = sqr.estimate_id
        LEFT JOIN saved_segment_version ssv
          ON ssv.saved_segment_id = ms.saved_segment_id
         AND ssv.version_no = ms.saved_segment_version_no
        LEFT JOIN saved_segment ss
          ON ss.saved_segment_id = ms.saved_segment_id
        LEFT JOIN market_scenario parent
          ON parent.scenario_id = ms.supersedes_scenario_id
    ), violations AS (
        SELECT scenario_id, legacy_fixture
        FROM scenario_lineage
        WHERE workspace_id IS DISTINCT FROM query_workspace_id
           OR market_unit IS DISTINCT FROM primary_entity_unit
           OR (workspace_id IS NOT NULL AND base_query_result_id IS NULL)
           OR (
                base_query_result_id IS NOT NULL
                AND (
                    result_query_id IS DISTINCT FROM query_id
                    OR result_entity_unit IS DISTINCT FROM primary_entity_unit
                    OR (
                        result_estimate_workspace_id IS NOT NULL
                        AND result_estimate_workspace_id IS DISTINCT FROM workspace_id
                    )
                )
           )
           OR (
                saved_segment_id IS NOT NULL
                AND (
                    saved_version_query_id IS DISTINCT FROM query_id
                    OR pinned_result_id IS NULL
                    OR pinned_result_id IS DISTINCT FROM base_query_result_id
                    OR saved_segment_workspace_id IS DISTINCT FROM workspace_id
                )
           )
           OR (
                supersedes_scenario_id IS NOT NULL
                AND parent_scenario_workspace_id IS DISTINCT FROM workspace_id
           )
    )
    SELECT
        count(*) FILTER (WHERE NOT legacy_fixture),
        count(*) FILTER (WHERE legacy_fixture)
    INTO production_violation_count, legacy_fixture_violation_count
    FROM violations;

    IF production_violation_count > 0 THEN
        RAISE EXCEPTION
            'market_scenario existing-data lineage audit failed for % production row(s)',
            production_violation_count;
    END IF;
    IF legacy_fixture_violation_count > 0 THEN
        RAISE WARNING
            'market_scenario existing-data lineage audit found % immutable legacy security fixture row(s); no row was rewritten and all new inserts are guarded',
            legacy_fixture_violation_count;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION workbench_guard_query_result_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    query_entity_unit text;
    query_workspace_id uuid;
    estimate_entity_unit text;
    estimate_workspace_id uuid;
BEGIN
    SELECT primary_entity_unit, workspace_id
    INTO query_entity_unit, query_workspace_id
    FROM segment_query
    WHERE query_id = NEW.query_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'segment_query_result lineage query is not visible';
    END IF;

    SELECT entity_unit, workspace_id
    INTO estimate_entity_unit, estimate_workspace_id
    FROM estimate
    WHERE estimate_id = NEW.estimate_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'segment_query_result lineage estimate is not visible';
    END IF;

    IF estimate_entity_unit IS DISTINCT FROM query_entity_unit THEN
        RAISE EXCEPTION
            'segment_query_result lineage entity unit mismatch: query %, estimate %',
            query_entity_unit, estimate_entity_unit;
    END IF;
    -- A NULL estimate workspace is a governed global baseline. This permits
    -- an exact archetype result to be reused by a workspace-owned query when
    -- the entity unit matches; non-global estimates must share the query root.
    IF estimate_workspace_id IS NOT NULL
       AND estimate_workspace_id IS DISTINCT FROM query_workspace_id THEN
        RAISE EXCEPTION
            'segment_query_result lineage workspace mismatch';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS segment_query_result_lineage_guard_trigger ON segment_query_result;
CREATE TRIGGER segment_query_result_lineage_guard_trigger
    BEFORE INSERT ON segment_query_result
    FOR EACH ROW EXECUTE FUNCTION workbench_guard_query_result_lineage();

CREATE OR REPLACE FUNCTION workbench_guard_segment_version_workspace()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    segment_workspace uuid;
    query_workspace uuid;
    pinned_result_query_id uuid;
BEGIN
    SELECT workspace_id INTO segment_workspace
    FROM saved_segment
    WHERE saved_segment_id = NEW.saved_segment_id;

    SELECT workspace_id INTO query_workspace
    FROM segment_query
    WHERE query_id = NEW.query_id;

    IF segment_workspace IS NULL
       OR query_workspace IS NULL
       OR segment_workspace IS DISTINCT FROM query_workspace THEN
        RAISE EXCEPTION
            'saved_segment_version lineage workspace mismatch';
    END IF;

    IF NEW.pinned_result_id IS NOT NULL THEN
        SELECT query_id INTO pinned_result_query_id
        FROM segment_query_result
        WHERE result_id = NEW.pinned_result_id;

        IF pinned_result_query_id IS NULL
           OR pinned_result_query_id IS DISTINCT FROM NEW.query_id THEN
            RAISE EXCEPTION
                'saved_segment_version lineage pinned result must belong to its query';
        END IF;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS saved_segment_version_workspace_guard_trigger ON saved_segment_version;
CREATE TRIGGER saved_segment_version_workspace_guard_trigger
    BEFORE INSERT ON saved_segment_version
    FOR EACH ROW EXECUTE FUNCTION workbench_guard_segment_version_workspace();

CREATE OR REPLACE FUNCTION workbench_guard_market_scenario_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    query_workspace_id uuid;
    query_entity_unit text;
    result_query_id uuid;
    result_estimate_workspace_id uuid;
    result_estimate_entity_unit text;
    saved_version_query_id uuid;
    saved_version_result_id uuid;
    saved_segment_workspace_id uuid;
    parent_scenario_workspace_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'market_scenario is revisioned; DELETE is not permitted';
    END IF;

    SELECT workspace_id, primary_entity_unit
    INTO query_workspace_id, query_entity_unit
    FROM segment_query
    WHERE query_id = NEW.query_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'market_scenario lineage query is not visible';
    END IF;

    IF NEW.workspace_id IS DISTINCT FROM query_workspace_id THEN
        RAISE EXCEPTION 'market_scenario lineage workspace must match its query';
    END IF;
    IF NEW.market_unit IS DISTINCT FROM query_entity_unit THEN
        RAISE EXCEPTION 'market_scenario lineage market unit must match its query';
    END IF;
    IF NEW.workspace_id IS NOT NULL AND NEW.base_query_result_id IS NULL THEN
        RAISE EXCEPTION 'market_scenario lineage requires a base query result';
    END IF;

    IF NEW.base_query_result_id IS NOT NULL THEN
        SELECT sqr.query_id, e.workspace_id, e.entity_unit
        INTO result_query_id, result_estimate_workspace_id, result_estimate_entity_unit
        FROM segment_query_result sqr
        JOIN estimate e USING (estimate_id)
        WHERE sqr.result_id = NEW.base_query_result_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'market_scenario lineage base query result is not visible';
        END IF;

        IF result_query_id IS DISTINCT FROM NEW.query_id THEN
            RAISE EXCEPTION 'market_scenario lineage base result must belong to its query';
        END IF;
        IF result_estimate_entity_unit IS DISTINCT FROM NEW.market_unit THEN
            RAISE EXCEPTION 'market_scenario lineage base result entity unit mismatch';
        END IF;
        -- A governed global baseline result may back a workspace scenario;
        -- every non-global estimate must share the scenario/query workspace.
        IF result_estimate_workspace_id IS NOT NULL
           AND result_estimate_workspace_id IS DISTINCT FROM NEW.workspace_id THEN
            RAISE EXCEPTION 'market_scenario lineage base result workspace mismatch';
        END IF;
    END IF;

    IF NEW.saved_segment_id IS NOT NULL THEN
        SELECT ssv.query_id, ssv.pinned_result_id, ss.workspace_id
        INTO saved_version_query_id, saved_version_result_id, saved_segment_workspace_id
        FROM saved_segment_version ssv
        JOIN saved_segment ss USING (saved_segment_id)
        WHERE ssv.saved_segment_id = NEW.saved_segment_id
          AND ssv.version_no = NEW.saved_segment_version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'market_scenario lineage saved segment version is not visible';
        END IF;

        IF saved_version_query_id IS DISTINCT FROM NEW.query_id THEN
            RAISE EXCEPTION 'market_scenario lineage saved segment version must use its query';
        END IF;
        IF saved_version_result_id IS NULL
           OR saved_version_result_id IS DISTINCT FROM NEW.base_query_result_id THEN
            RAISE EXCEPTION 'market_scenario lineage saved segment version must pin its base query result';
        END IF;
        IF saved_segment_workspace_id IS DISTINCT FROM NEW.workspace_id THEN
            RAISE EXCEPTION 'market_scenario lineage saved segment workspace mismatch';
        END IF;
    END IF;

    IF NEW.supersedes_scenario_id IS NOT NULL THEN
        SELECT workspace_id
        INTO parent_scenario_workspace_id
        FROM market_scenario
        WHERE scenario_id = NEW.supersedes_scenario_id;
        IF NOT FOUND
           OR parent_scenario_workspace_id IS DISTINCT FROM NEW.workspace_id THEN
            RAISE EXCEPTION 'market_scenario revision parent must belong to its workspace';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF (to_jsonb(NEW) - ARRAY['status','updated_at'])
           IS DISTINCT FROM
           (to_jsonb(OLD) - ARRAY['status','updated_at']) THEN
            RAISE EXCEPTION 'market_scenario revision payload is immutable';
        END IF;
        IF OLD.status NOT IN ('draft','active') OR NEW.status <> 'superseded' THEN
            RAISE EXCEPTION 'market_scenario only permits draft/active to superseded transition';
        END IF;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS market_scenario_revision_guard_trigger ON market_scenario;
CREATE TRIGGER market_scenario_revision_guard_trigger
    BEFORE INSERT OR UPDATE OR DELETE ON market_scenario
    FOR EACH ROW EXECUTE FUNCTION workbench_guard_market_scenario_mutation();

COMMIT;
