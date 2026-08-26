BEGIN;

-- Approved research factors and their cited sources form one immutable
-- snapshot. The parent declares the exact source cardinality; children may be
-- inserted only by the approving owner/reviewer and only in the transaction
-- that created the parent. A deferred check rejects partial snapshots at
-- commit time without forcing the application to collapse the two tables.
DROP TRIGGER IF EXISTS approved_research_factor_append_only_trigger ON approved_research_factor;

ALTER TABLE approved_research_factor
    ADD COLUMN IF NOT EXISTS source_count smallint;
ALTER TABLE approved_research_factor
    ADD COLUMN IF NOT EXISTS materialization_txid bigint;

WITH source_counts AS (
    SELECT factor.approved_factor_id, count(source.source_index)::smallint AS source_count
      FROM approved_research_factor factor
      LEFT JOIN approved_research_factor_source source
        ON source.approved_factor_id = factor.approved_factor_id
     GROUP BY factor.approved_factor_id
)
UPDATE approved_research_factor factor
   SET source_count = source_counts.source_count
  FROM source_counts
 WHERE factor.approved_factor_id = source_counts.approved_factor_id
   AND factor.source_count IS NULL;

UPDATE approved_research_factor
   SET materialization_txid = txid_current()
 WHERE materialization_txid IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM approved_research_factor factor
          LEFT JOIN LATERAL (
              SELECT count(*)::integer AS actual_count,
                     min(source_index) AS minimum_index,
                     max(source_index) AS maximum_index
                FROM approved_research_factor_source source
               WHERE source.approved_factor_id = factor.approved_factor_id
          ) snapshot ON true
         WHERE factor.source_count IS NULL
            OR factor.source_count NOT BETWEEN 1 AND 32
            OR snapshot.actual_count <> factor.source_count
            OR snapshot.minimum_index <> 0
            OR snapshot.maximum_index <> factor.source_count - 1
    ) THEN
        RAISE EXCEPTION
            'existing approved research factor source snapshots must be complete, contiguous, and contain 1-32 sources'
            USING ERRCODE = '23514';
    END IF;
END $$;

ALTER TABLE approved_research_factor
    ALTER COLUMN source_count SET NOT NULL,
    ALTER COLUMN materialization_txid SET DEFAULT txid_current(),
    ALTER COLUMN materialization_txid SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'approved_research_factor'::regclass
           AND conname = 'approved_research_factor_source_count_check'
    ) THEN
        ALTER TABLE approved_research_factor
            ADD CONSTRAINT approved_research_factor_source_count_check
            CHECK (source_count BETWEEN 1 AND 32);
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'approved_research_factor_source'::regclass
           AND conname = 'approved_research_factor_source_index_bounds_check'
    ) THEN
        ALTER TABLE approved_research_factor_source
            ADD CONSTRAINT approved_research_factor_source_index_bounds_check
            CHECK (source_index BETWEEN 0 AND 31);
    END IF;
END $$;

-- The factor, its reviewed proposal, and any workspace-scoped publication
-- must belong to the same workspace. A global publication (workspace_id is
-- null) remains a valid shared provenance anchor. The reverse materialized
-- pointer on proposed_revision must also stay in the proposal workspace.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM approved_research_factor factor
          JOIN proposed_revision proposal USING (proposed_revision_id)
          JOIN data_release_version publication USING (publication_version_id)
         WHERE proposal.workspace_id IS DISTINCT FROM factor.workspace_id
            OR (
                publication.workspace_id IS NOT NULL
                AND publication.workspace_id IS DISTINCT FROM factor.workspace_id
            )
    ) OR EXISTS (
        SELECT 1
          FROM proposed_revision proposal
          JOIN approved_research_factor factor
            ON factor.approved_factor_id = proposal.materialized_factor_id
         WHERE proposal.workspace_id IS DISTINCT FROM factor.workspace_id
    ) THEN
        RAISE EXCEPTION
            'existing approved research factor provenance crosses workspace boundaries'
            USING ERRCODE = '23514';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS proposed_revision_workspace_id_uidx
    ON proposed_revision(workspace_id, proposed_revision_id);
CREATE UNIQUE INDEX IF NOT EXISTS approved_research_factor_workspace_id_uidx
    ON approved_research_factor(workspace_id, approved_factor_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'approved_research_factor'::regclass
           AND conname = 'approved_research_factor_proposed_revision_workspace_fk'
    ) THEN
        ALTER TABLE approved_research_factor
            ADD CONSTRAINT approved_research_factor_proposed_revision_workspace_fk
            FOREIGN KEY (workspace_id, proposed_revision_id)
            REFERENCES proposed_revision(workspace_id, proposed_revision_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'proposed_revision'::regclass
           AND conname = 'proposed_revision_materialized_factor_workspace_fk'
    ) THEN
        ALTER TABLE proposed_revision
            ADD CONSTRAINT proposed_revision_materialized_factor_workspace_fk
            FOREIGN KEY (workspace_id, materialized_factor_id)
            REFERENCES approved_research_factor(workspace_id, approved_factor_id);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION approved_research_factor_guard_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    proposal_workspace_id uuid;
    publication_workspace_id uuid;
BEGIN
    SELECT proposal.workspace_id
      INTO proposal_workspace_id
      FROM proposed_revision proposal
     WHERE proposal.proposed_revision_id = NEW.proposed_revision_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'approved research factor proposal is not visible'
            USING ERRCODE = '23503';
    END IF;
    IF proposal_workspace_id IS DISTINCT FROM NEW.workspace_id THEN
        RAISE EXCEPTION 'approved research factor proposal workspace mismatch'
            USING ERRCODE = '23514';
    END IF;

    SELECT publication.workspace_id
      INTO publication_workspace_id
      FROM data_release_version publication
     WHERE publication.publication_version_id = NEW.publication_version_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'approved research factor publication is not visible'
            USING ERRCODE = '23503';
    END IF;
    IF publication_workspace_id IS NOT NULL
       AND publication_workspace_id IS DISTINCT FROM NEW.workspace_id THEN
        RAISE EXCEPTION 'approved research factor publication workspace mismatch'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION data_release_version_guard_factor_workspace()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.workspace_id IS NOT NULL
       AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       AND EXISTS (
           SELECT 1
             FROM approved_research_factor factor
            WHERE factor.publication_version_id = NEW.publication_version_id
              AND factor.workspace_id IS DISTINCT FROM NEW.workspace_id
       ) THEN
        RAISE EXCEPTION 'data release workspace conflicts with an approved research factor'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approved_research_factor_provenance_guard_trigger
    ON approved_research_factor;
CREATE TRIGGER approved_research_factor_provenance_guard_trigger
    BEFORE INSERT ON approved_research_factor
    FOR EACH ROW EXECUTE FUNCTION approved_research_factor_guard_provenance();

DROP TRIGGER IF EXISTS data_release_version_factor_workspace_guard_trigger
    ON data_release_version;
CREATE TRIGGER data_release_version_factor_workspace_guard_trigger
    BEFORE UPDATE OF workspace_id ON data_release_version
    FOR EACH ROW EXECUTE FUNCTION data_release_version_guard_factor_workspace();

CREATE OR REPLACE FUNCTION approved_research_factor_guard_source_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    factor_workspace_id uuid;
    factor_actor_id uuid;
    factor_source_count smallint;
    factor_materialization_txid bigint;
BEGIN
    SELECT factor.workspace_id,
           factor.created_by_actor_id,
           factor.source_count,
           factor.materialization_txid
      INTO factor_workspace_id,
           factor_actor_id,
           factor_source_count,
           factor_materialization_txid
      FROM approved_research_factor factor
     WHERE factor.approved_factor_id = NEW.approved_factor_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'approved research factor % does not exist', NEW.approved_factor_id
            USING ERRCODE = '23503';
    END IF;

    IF factor_workspace_id IS DISTINCT FROM market_engine_current_workspace_id()
       OR factor_actor_id IS DISTINCT FROM market_engine_current_actor_id()
       OR NOT EXISTS (
           SELECT 1
             FROM workspace_member member
            WHERE member.workspace_id = factor_workspace_id
              AND member.actor_id = market_engine_current_actor_id()
              AND member.role IN ('owner','reviewer')
       ) THEN
        RAISE EXCEPTION 'approved research factor source insertion requires the approving owner or reviewer'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.source_index < 0 OR NEW.source_index >= factor_source_count THEN
        RAISE EXCEPTION 'approved research factor source_index % is outside the declared range 0..%',
            NEW.source_index, factor_source_count - 1
            USING ERRCODE = '23514';
    END IF;

    IF factor_materialization_txid <> txid_current() THEN
        RAISE EXCEPTION 'approved research factor source snapshot is sealed after its materialization transaction'
            USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION approved_research_factor_validate_source_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    actual_count integer;
    minimum_index integer;
    maximum_index integer;
BEGIN
    SELECT count(*)::integer, min(source_index), max(source_index)
      INTO actual_count, minimum_index, maximum_index
      FROM approved_research_factor_source source
     WHERE source.approved_factor_id = NEW.approved_factor_id;

    IF actual_count <> NEW.source_count
       OR minimum_index <> 0
       OR maximum_index <> NEW.source_count - 1 THEN
        RAISE EXCEPTION
            'approved research factor source snapshot is incomplete: expected % contiguous sources, found %',
            NEW.source_count, actual_count
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approved_research_factor_source_insert_guard_trigger
    ON approved_research_factor_source;
CREATE TRIGGER approved_research_factor_source_insert_guard_trigger
    BEFORE INSERT ON approved_research_factor_source
    FOR EACH ROW EXECUTE FUNCTION approved_research_factor_guard_source_insert();

DROP TRIGGER IF EXISTS approved_research_factor_source_snapshot_trigger
    ON approved_research_factor;
CREATE CONSTRAINT TRIGGER approved_research_factor_source_snapshot_trigger
    AFTER INSERT ON approved_research_factor
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION approved_research_factor_validate_source_snapshot();

DROP POLICY IF EXISTS approved_research_factor_insert_policy ON approved_research_factor;
CREATE POLICY approved_research_factor_insert_policy ON approved_research_factor
    FOR INSERT
    TO market_engine_app
    WITH CHECK (
        workspace_id = market_engine_current_workspace_id()
        AND created_by_actor_id = market_engine_current_actor_id()
        AND materialization_txid = txid_current()
        AND source_count BETWEEN 1 AND 32
        AND EXISTS (
            SELECT 1 FROM workspace_member member
             WHERE member.workspace_id = market_engine_current_workspace_id()
               AND member.actor_id = market_engine_current_actor_id()
               AND member.role IN ('owner','reviewer')
        )
    );

DROP POLICY IF EXISTS approved_research_factor_source_insert_policy ON approved_research_factor_source;
CREATE POLICY approved_research_factor_source_insert_policy ON approved_research_factor_source
    FOR INSERT
    TO market_engine_app
    WITH CHECK (EXISTS (
        SELECT 1
          FROM approved_research_factor factor
          JOIN workspace_member member
            ON member.workspace_id = factor.workspace_id
           AND member.actor_id = market_engine_current_actor_id()
           AND member.role IN ('owner','reviewer')
         WHERE factor.approved_factor_id = approved_research_factor_source.approved_factor_id
           AND factor.workspace_id = market_engine_current_workspace_id()
           AND factor.created_by_actor_id = market_engine_current_actor_id()
           AND factor.materialization_txid = txid_current()
           AND approved_research_factor_source.source_index >= 0
           AND approved_research_factor_source.source_index < factor.source_count
    ));

CREATE TRIGGER approved_research_factor_append_only_trigger
    BEFORE UPDATE OR DELETE ON approved_research_factor
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

GRANT SELECT, INSERT ON approved_research_factor, approved_research_factor_source
TO market_engine_app;
REVOKE INSERT, UPDATE, DELETE ON approved_research_factor, approved_research_factor_source
FROM market_engine_worker;
REVOKE UPDATE, DELETE ON approved_research_factor, approved_research_factor_source
FROM market_engine_app;

COMMIT;
