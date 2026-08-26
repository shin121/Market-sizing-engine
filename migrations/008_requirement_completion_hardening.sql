BEGIN;

-- Query definitions contain user-authored text and condition ASTs. They are
-- content-addressed only inside one workspace; identical definitions in two
-- workspaces must not share an RLS identity.
ALTER TABLE segment_query ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(workspace_id);
ALTER TABLE segment_query ADD COLUMN IF NOT EXISTS created_by_actor_id uuid;

-- Migration 007 made query definitions append-only. Temporarily remove that
-- trigger inside this transaction so ownership metadata can be backfilled on
-- pre-existing immutable rows, then restore the guard before commit.
DROP TRIGGER IF EXISTS segment_query_append_only_trigger ON segment_query;

DO $$
BEGIN
    IF EXISTS (
        SELECT ssv.query_id
          FROM saved_segment_version ssv
          JOIN saved_segment ss USING (saved_segment_id)
         GROUP BY ssv.query_id
        HAVING count(DISTINCT ss.workspace_id) > 1
    ) THEN
        RAISE EXCEPTION 'shared segment_query rows must be cloned per workspace before ownership hardening';
    END IF;
END $$;

WITH referenced_owner AS (
    SELECT ssv.query_id, min(ss.workspace_id::text)::uuid AS workspace_id
      FROM saved_segment_version ssv
      JOIN saved_segment ss USING (saved_segment_id)
     GROUP BY ssv.query_id
    HAVING count(DISTINCT ss.workspace_id) = 1
)
UPDATE segment_query sq
   SET workspace_id = owner.workspace_id
  FROM referenced_owner owner
 WHERE owner.query_id = sq.query_id
   AND sq.workspace_id IS NULL;

WITH result_owner AS (
    SELECT sqr.query_id, min(e.workspace_id::text)::uuid AS workspace_id
      FROM segment_query_result sqr
      JOIN estimate e USING (estimate_id)
     WHERE e.workspace_id IS NOT NULL
     GROUP BY sqr.query_id
    HAVING count(DISTINCT e.workspace_id) = 1
)
UPDATE segment_query sq
   SET workspace_id = owner.workspace_id
  FROM result_owner owner
 WHERE owner.query_id = sq.query_id
   AND sq.workspace_id IS NULL;

WITH audit_owner AS (
    SELECT sqr.query_id, min(ae.workspace_id::text)::uuid AS workspace_id
      FROM segment_query_result sqr
      JOIN audit_event ae
        ON ae.aggregate_type = 'segment_query_result'
       AND ae.aggregate_id = sqr.result_id::text
     GROUP BY sqr.query_id
    HAVING count(DISTINCT ae.workspace_id) = 1
)
UPDATE segment_query sq
   SET workspace_id = owner.workspace_id
  FROM audit_owner owner
 WHERE owner.query_id = sq.query_id
   AND sq.workspace_id IS NULL;

CREATE TRIGGER segment_query_append_only_trigger
    BEFORE UPDATE OR DELETE ON segment_query
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

ALTER TABLE segment_query DROP CONSTRAINT IF EXISTS segment_query_query_hash_key;
CREATE UNIQUE INDEX IF NOT EXISTS segment_query_workspace_hash_uidx
    ON segment_query(workspace_id, query_hash) NULLS NOT DISTINCT;

-- Invalidated results are immutable history, not active cache entries. Keep
-- only one valid row for a content identity so invalidation releases the slot
-- for a freshly executed snapshot with the same dependency fingerprint.
DROP INDEX IF EXISTS segment_query_result_hash_uidx;
CREATE UNIQUE INDEX segment_query_result_hash_uidx
    ON segment_query_result(query_id, model_version_id, result_hash)
    WHERE result_hash IS NOT NULL AND cache_status = 'valid';

ALTER TABLE segment_query ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment_condition_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment_condition ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS segment_query_select_policy ON segment_query;
DROP POLICY IF EXISTS segment_query_insert_policy ON segment_query;
CREATE POLICY segment_query_select_policy ON segment_query
    FOR SELECT
    USING (workspace_id = market_engine_current_workspace_id());
CREATE POLICY segment_query_insert_policy ON segment_query
    FOR INSERT
    WITH CHECK (
        workspace_id = market_engine_current_workspace_id()
        AND created_by_actor_id = market_engine_current_actor_id()
    );

DROP POLICY IF EXISTS segment_condition_group_select_policy ON segment_condition_group;
DROP POLICY IF EXISTS segment_condition_group_insert_policy ON segment_condition_group;
CREATE POLICY segment_condition_group_select_policy ON segment_condition_group
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM segment_query parent
         WHERE parent.query_id = segment_condition_group.query_id
           AND parent.workspace_id = market_engine_current_workspace_id()
    ));
CREATE POLICY segment_condition_group_insert_policy ON segment_condition_group
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM segment_query parent
         WHERE parent.query_id = segment_condition_group.query_id
           AND parent.workspace_id = market_engine_current_workspace_id()
    ));

DROP POLICY IF EXISTS segment_condition_select_policy ON segment_condition;
DROP POLICY IF EXISTS segment_condition_insert_policy ON segment_condition;
CREATE POLICY segment_condition_select_policy ON segment_condition
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM segment_query parent
         WHERE parent.query_id = segment_condition.query_id
           AND parent.workspace_id = market_engine_current_workspace_id()
    ));
CREATE POLICY segment_condition_insert_policy ON segment_condition
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM segment_query parent
         WHERE parent.query_id = segment_condition.query_id
           AND parent.workspace_id = market_engine_current_workspace_id()
    ));

CREATE OR REPLACE FUNCTION workbench_guard_segment_version_workspace()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    segment_workspace uuid;
    query_workspace uuid;
BEGIN
    SELECT workspace_id INTO segment_workspace
      FROM saved_segment WHERE saved_segment_id = NEW.saved_segment_id;
    SELECT workspace_id INTO query_workspace
      FROM segment_query WHERE query_id = NEW.query_id;
    IF segment_workspace IS NULL OR query_workspace IS NULL OR segment_workspace <> query_workspace THEN
        RAISE EXCEPTION 'saved segment and query must belong to the same workspace';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS saved_segment_version_workspace_guard_trigger ON saved_segment_version;
CREATE TRIGGER saved_segment_version_workspace_guard_trigger
    BEFORE INSERT ON saved_segment_version
    FOR EACH ROW EXECUTE FUNCTION workbench_guard_segment_version_workspace();

-- A globally readable baseline estimate never makes the user-authored query
-- that selected it global. Query-result access requires both query ownership
-- and an allowed estimate parent.
DROP POLICY IF EXISTS segment_query_result_select_policy ON segment_query_result;
DROP POLICY IF EXISTS segment_query_result_insert_policy ON segment_query_result;
DROP POLICY IF EXISTS segment_query_result_update_policy ON segment_query_result;
CREATE POLICY segment_query_result_select_policy ON segment_query_result
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM segment_query query_parent
             WHERE query_parent.query_id = segment_query_result.query_id
               AND query_parent.workspace_id = market_engine_current_workspace_id()
        )
        AND EXISTS (
            SELECT 1 FROM estimate estimate_parent
             WHERE estimate_parent.estimate_id = segment_query_result.estimate_id
               AND (estimate_parent.workspace_id IS NULL OR estimate_parent.workspace_id = market_engine_current_workspace_id())
        )
    );
CREATE POLICY segment_query_result_insert_policy ON segment_query_result
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM segment_query query_parent
             WHERE query_parent.query_id = segment_query_result.query_id
               AND query_parent.workspace_id = market_engine_current_workspace_id()
        )
        AND EXISTS (
            SELECT 1 FROM estimate estimate_parent
             WHERE estimate_parent.estimate_id = segment_query_result.estimate_id
               AND (estimate_parent.workspace_id IS NULL OR estimate_parent.workspace_id = market_engine_current_workspace_id())
        )
    );
CREATE POLICY segment_query_result_update_policy ON segment_query_result
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM segment_query query_parent
             WHERE query_parent.query_id = segment_query_result.query_id
               AND query_parent.workspace_id = market_engine_current_workspace_id()
        )
        AND EXISTS (
            SELECT 1 FROM estimate estimate_parent
             WHERE estimate_parent.estimate_id = segment_query_result.estimate_id
               AND (estimate_parent.workspace_id IS NULL OR estimate_parent.workspace_id = market_engine_current_workspace_id())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM segment_query query_parent
             WHERE query_parent.query_id = segment_query_result.query_id
               AND query_parent.workspace_id = market_engine_current_workspace_id()
        )
        AND EXISTS (
            SELECT 1 FROM estimate estimate_parent
             WHERE estimate_parent.estimate_id = segment_query_result.estimate_id
               AND (estimate_parent.workspace_id IS NULL OR estimate_parent.workspace_id = market_engine_current_workspace_id())
        )
    );

-- Runtime reviewers may create only workspace-scoped draft/approved releases.
-- Global publication remains a separate governance operation unavailable to
-- the application and worker roles.
DROP POLICY IF EXISTS data_release_version_scope_policy ON data_release_version;
DROP POLICY IF EXISTS data_release_version_select_policy ON data_release_version;
DROP POLICY IF EXISTS data_release_version_insert_policy ON data_release_version;
CREATE POLICY data_release_version_select_policy ON data_release_version
    FOR SELECT
    USING (workspace_id IS NULL OR workspace_id = market_engine_current_workspace_id());
CREATE POLICY data_release_version_insert_policy ON data_release_version
    FOR INSERT
    WITH CHECK (
        workspace_id = market_engine_current_workspace_id()
        AND status IN ('draft','approved')
        AND (
            (
                status = 'draft'
                AND approved_by_actor_id IS NULL
                AND approved_at IS NULL
                AND published_at IS NULL
            )
            OR (
                status = 'approved'
                AND approved_by_actor_id = market_engine_current_actor_id()
                AND approved_at IS NOT NULL
                AND published_at IS NULL
                AND EXISTS (
                    SELECT 1 FROM workspace_member member
                     WHERE member.workspace_id = market_engine_current_workspace_id()
                       AND member.actor_id = market_engine_current_actor_id()
                       AND member.role IN ('owner','reviewer')
                )
            )
        )
    );

-- Workspace membership is provisioning state, not ordinary workbench state.
-- Runtime roles must never self-promote into a reviewer/owner role.
REVOKE INSERT, UPDATE, DELETE ON workspace, workspace_member
FROM market_engine_app, market_engine_worker;

-- The repository and UI consume one explicit route contract. The view covers
-- the object kinds named by Global Search without fabricating missing facts.
DROP VIEW IF EXISTS v_global_search;
CREATE VIEW v_global_search
WITH (security_invoker = true)
AS
SELECT
    'domain'::text AS object_type,
    d.domain_id AS object_id,
    NULL::uuid AS workspace_id,
    d.name_ko AS title,
    d.description AS summary,
    d.primary_entity_unit AS entity_unit,
    d.domain_id,
    concat_ws(' ', d.domain_code, d.name_ko, d.description) AS search_text,
    d.updated_at,
    '/explore/' || d.domain_code AS route_path
FROM domain_registry d

UNION ALL

SELECT
    'axis', dd.dimension_id, NULL::uuid, dd.axis_code,
    concat(dr.name_ko, ' · ', dd.applicability_reason),
    dr.primary_entity_unit, dd.domain_id,
    concat_ws(' ', dr.domain_code, dr.name_ko, dd.axis_code, dd.applicability_reason),
    dd.updated_at,
    '/explore/' || dr.domain_code || '/axes/' || dd.axis_code
FROM domain_dimension dd
JOIN domain_registry dr USING (domain_id)

UNION ALL

SELECT
    'feature', 'core_feature:' || fd.feature_code, NULL::uuid,
    fd.label_ko, fd.definition, fd.entity_unit, NULL::text,
    concat_ws(' ', fd.feature_code, fd.label_ko, fd.definition),
    fd.updated_at,
    '/builder?condition=core_feature:' || fd.feature_code
FROM feature_definition fd
WHERE fd.queryable

UNION ALL

SELECT
    'feature', 'domain_feature:' || df.domain_feature_id, NULL::uuid,
    df.label_ko,
    concat(df.observable_status, ' · ', df.targetability_class),
    dr.primary_entity_unit, df.domain_id,
    concat_ws(' ', df.feature_code, df.label_ko, dr.name_ko, df.observable_status, df.targetability_class),
    df.updated_at,
    '/builder?condition=domain_feature:' || df.domain_feature_id
FROM domain_feature df
JOIN domain_registry dr USING (domain_id)
WHERE df.queryable

UNION ALL

SELECT
    'behavior', 'behavior:' || dbt.behavior_template_id, NULL::uuid,
    dbt.name_ko, dbt.definition, dr.primary_entity_unit, dbt.domain_id,
    concat_ws(' ', dbt.behavior_code, dbt.name_ko, dbt.definition, dr.name_ko),
    dbt.updated_at,
    '/builder?condition=behavior:' || dbt.behavior_template_id
FROM domain_behavior_template dbt
JOIN domain_registry dr USING (domain_id)

UNION ALL

SELECT
    'subtype', s.subtype_id, NULL::uuid, s.name_ko, s.definition,
    d.primary_entity_unit, s.domain_id,
    concat_ws(' ', s.subtype_code, s.name_ko, s.definition, d.name_ko),
    s.updated_at,
    '/segments/subtypes/' || s.subtype_id
FROM subtype_definition s
JOIN domain_registry d USING (domain_id)

UNION ALL

SELECT
    'archetype', a.archetype_id, NULL::uuid, a.name_ko, a.one_line_definition,
    a.primary_entity_unit, NULL::text,
    concat_ws(' ', a.archetype_id, a.name_ko, a.name_en, a.one_line_definition),
    a.updated_at,
    '/archetypes/' || a.archetype_id
FROM archetype a

UNION ALL

SELECT
    'estimate', e.estimate_id::text, e.workspace_id,
    concat(e.subject_type, ' · ', e.subject_id), e.formula,
    e.entity_unit, NULL::text,
    concat_ws(' ', e.estimate_id::text, e.subject_type, e.subject_id, e.method_code, e.formula, e.data_version),
    e.updated_at,
    '/sizing/' || e.estimate_id::text
FROM estimate e

UNION ALL

SELECT
    'saved_segment', ss.saved_segment_id::text, ss.workspace_id, ss.title,
    coalesce(ss.description, ''), latest.primary_entity_unit, NULL::text,
    concat_ws(' ', ss.title, ss.description, latest.natural_language_text),
    ss.updated_at,
    '/builder/' || ss.saved_segment_id::text
FROM saved_segment ss
LEFT JOIN v_saved_segment_latest latest USING (saved_segment_id)

UNION ALL

SELECT
    'opportunity', o.opportunity_id::text, ob.workspace_id, o.name,
    o.problem_statement, NULL::text, NULL::text,
    concat_ws(' ', o.name, o.problem_statement, o.hypothesis_summary, o.solution_idea),
    o.updated_at,
    '/opportunities/' || o.opportunity_id::text
FROM opportunity o
JOIN opportunity_board ob USING (opportunity_board_id);

GRANT SELECT ON v_global_search TO market_engine_app, market_engine_worker;

COMMIT;
