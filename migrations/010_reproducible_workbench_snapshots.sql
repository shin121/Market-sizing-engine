BEGIN;

-- A scenario already pins its query result. Record the saved-segment definition
-- version that selected that result as well, so scenario lineage is explicit
-- without resolving through whichever segment version happens to be current.
ALTER TABLE market_scenario
    ADD COLUMN IF NOT EXISTS saved_segment_id uuid;
ALTER TABLE market_scenario
    ADD COLUMN IF NOT EXISTS saved_segment_version_no integer;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid='market_scenario'::regclass
           AND conname='market_scenario_saved_segment_version_fk'
    ) THEN
        ALTER TABLE market_scenario
            ADD CONSTRAINT market_scenario_saved_segment_version_fk
            FOREIGN KEY (saved_segment_id, saved_segment_version_no)
            REFERENCES saved_segment_version(saved_segment_id, version_no);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid='market_scenario'::regclass
           AND conname='market_scenario_saved_segment_pair_chk'
    ) THEN
        ALTER TABLE market_scenario
            ADD CONSTRAINT market_scenario_saved_segment_pair_chk
            CHECK ((saved_segment_id IS NULL) = (saved_segment_version_no IS NULL));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS market_scenario_saved_segment_version_idx
    ON market_scenario(saved_segment_id, saved_segment_version_no)
    WHERE saved_segment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS market_scenario_one_direct_revision_uidx
    ON market_scenario(supersedes_scenario_id)
    WHERE supersedes_scenario_id IS NOT NULL;

-- saved_segment_version remains append-only. For pre-existing current versions
-- that have a valid result but no pin, append a new version containing the pin
-- and advance only the mutable saved_segment head pointer.
WITH candidates AS (
    SELECT ss.saved_segment_id,
           coalesce(max_version.version_no, ss.current_version_no) + 1 AS next_version_no,
           current_version.query_id,
           result.result_id,
           current_version.natural_language_text,
           current_version.parser_version,
           current_version.definition_hash,
           current_version.created_by_actor_id
      FROM saved_segment ss
      JOIN saved_segment_version current_version
        ON current_version.saved_segment_id=ss.saved_segment_id
       AND current_version.version_no=ss.current_version_no
      JOIN LATERAL (
        SELECT max(all_versions.version_no) AS version_no
          FROM saved_segment_version all_versions
         WHERE all_versions.saved_segment_id=ss.saved_segment_id
      ) max_version ON true
      JOIN LATERAL (
        SELECT sqr.result_id
          FROM segment_query_result sqr
         WHERE sqr.query_id=current_version.query_id
           AND sqr.cache_status='valid'
         ORDER BY sqr.executed_at DESC, sqr.result_id
         LIMIT 1
      ) result ON true
     WHERE current_version.pinned_result_id IS NULL
), inserted AS (
    INSERT INTO saved_segment_version (
        saved_segment_id,version_no,query_id,pinned_result_id,
        natural_language_text,parser_version,definition_hash,
        change_reason,created_by_actor_id
    )
    SELECT saved_segment_id,next_version_no,query_id,result_id,
           natural_language_text,parser_version,definition_hash,
           'migration_snapshot_pin',created_by_actor_id
      FROM candidates
    ON CONFLICT (saved_segment_id,version_no) DO NOTHING
    RETURNING saved_segment_id,version_no
)
UPDATE saved_segment ss
   SET current_version_no=inserted.version_no,
       optimistic_lock_version=ss.optimistic_lock_version+1,
       updated_at=now()
  FROM inserted
 WHERE ss.saved_segment_id=inserted.saved_segment_id;

-- Best-effort lineage backfill for scenarios created before explicit segment
-- version columns existed. Multiple versions of one saved segment resolve to
-- its current/latest pin; multiple distinct saved segments remain deliberately
-- unassigned because choosing one would fabricate lineage.
--
-- This migration is deliberately re-runnable. A later migration replaces the
-- scenario guard with a stricter lineage/immutability check, so remove whichever
-- version of the guard is currently installed before performing this narrowly
-- scoped migration backfill. The guard is recreated below in this transaction
-- and the later migration reinstalls its stricter definition in filename order.
DROP TRIGGER IF EXISTS market_scenario_revision_guard_trigger ON market_scenario;

WITH per_segment AS (
    SELECT DISTINCT ON (ms.scenario_id,ssv.saved_segment_id)
           ms.scenario_id,ssv.saved_segment_id,ssv.version_no
      FROM market_scenario ms
      JOIN saved_segment_version ssv ON ssv.pinned_result_id=ms.base_query_result_id
      JOIN saved_segment ss ON ss.saved_segment_id=ssv.saved_segment_id
     WHERE ms.workspace_id=ss.workspace_id
       AND ms.saved_segment_id IS NULL
     ORDER BY ms.scenario_id,ssv.saved_segment_id,
              (ss.current_version_no=ssv.version_no) DESC,ssv.version_no DESC
), uniquely_resolved AS (
    SELECT per_segment.*,
           count(*) OVER (PARTITION BY scenario_id) AS segment_count
      FROM per_segment
)
UPDATE market_scenario ms
   SET saved_segment_id=uniquely_resolved.saved_segment_id,
       saved_segment_version_no=uniquely_resolved.version_no
  FROM uniquely_resolved
 WHERE uniquely_resolved.scenario_id=ms.scenario_id
   AND uniquely_resolved.segment_count=1;

-- Scenario revisions are immutable rows. The only permitted in-place change is
-- the one-way lifecycle transition that marks a parent as superseded after its
-- child revision has been inserted.
CREATE OR REPLACE FUNCTION workbench_guard_market_scenario_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    expected_result_id uuid;
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'market_scenario is revisioned; DELETE is not permitted';
    END IF;
    IF NEW.saved_segment_id IS NOT NULL THEN
        SELECT pinned_result_id INTO expected_result_id
          FROM saved_segment_version
         WHERE saved_segment_id=NEW.saved_segment_id
           AND version_no=NEW.saved_segment_version_no;
        IF expected_result_id IS NULL OR expected_result_id IS DISTINCT FROM NEW.base_query_result_id THEN
            RAISE EXCEPTION 'market_scenario saved segment version must pin its base query result';
        END IF;
    END IF;
    IF TG_OP='UPDATE' THEN
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

DROP POLICY IF EXISTS market_scenario_update_policy ON market_scenario;
CREATE POLICY market_scenario_update_policy ON market_scenario
    FOR UPDATE
    USING (workspace_id=market_engine_current_workspace_id())
    WITH CHECK (workspace_id=market_engine_current_workspace_id());

REVOKE UPDATE,DELETE ON market_scenario FROM market_engine_app,market_engine_worker;
GRANT UPDATE (status,updated_at) ON market_scenario TO market_engine_app;

CREATE OR REPLACE VIEW v_saved_segment_latest
WITH (security_invoker = true)
AS
SELECT
    ss.saved_segment_id,
    ss.workspace_id,
    ss.title,
    ss.description,
    ss.status,
    ss.current_version_no,
    ss.optimistic_lock_version,
    version_row.version_no AS resolved_version_no,
    version_row.query_id,
    version_row.natural_language_text,
    version_row.parser_version,
    version_row.definition_hash,
    version_row.change_reason,
    sq.filter_json,
    sq.primary_entity_unit,
    sq.geography_scope,
    sq.as_of_date,
    result_row.result_id,
    result_row.executed_at,
    result_row.cache_status,
    result_row.result_summary,
    e.estimate_id,
    e.status AS estimate_status,
    e.count_low,
    e.count_base,
    e.count_high,
    e.share_low,
    e.share_base,
    e.share_high,
    e.data_layer,
    e.approval_status,
    ss.created_at,
    ss.updated_at,
    version_row.pinned_result_id
FROM saved_segment ss
LEFT JOIN LATERAL (
    SELECT ssv.*
    FROM saved_segment_version ssv
    WHERE ssv.saved_segment_id=ss.saved_segment_id
    ORDER BY (ssv.version_no=ss.current_version_no) DESC,ssv.version_no DESC
    LIMIT 1
) version_row ON true
LEFT JOIN segment_query sq ON sq.query_id=version_row.query_id
LEFT JOIN LATERAL (
    SELECT sqr.*
    FROM segment_query_result sqr
    WHERE sqr.query_id=version_row.query_id
      AND (
        (version_row.pinned_result_id IS NOT NULL AND sqr.result_id=version_row.pinned_result_id)
        OR (version_row.pinned_result_id IS NULL AND sqr.cache_status <> 'invalidated')
      )
    ORDER BY (sqr.result_id=version_row.pinned_result_id) DESC,
             sqr.executed_at DESC
    LIMIT 1
) result_row ON true
LEFT JOIN estimate e ON e.estimate_id=result_row.estimate_id;

COMMIT;
