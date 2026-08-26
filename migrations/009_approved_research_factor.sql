BEGIN;

-- A reviewed research interval is not automatically a market-size count.
-- Materialize it as a typed, workspace-scoped factor so approval produces a
-- durable production artifact without confusing a prevalence or probability
-- with person/household/business counts.
CREATE TABLE IF NOT EXISTS approved_research_factor (
    approved_factor_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspace(workspace_id),
    publication_version_id uuid NOT NULL REFERENCES data_release_version(publication_version_id),
    proposed_revision_id uuid NOT NULL UNIQUE REFERENCES proposed_revision(proposed_revision_id),
    supersedes_factor_id uuid REFERENCES approved_research_factor(approved_factor_id),
    target_segment text NOT NULL,
    target_variable text NOT NULL,
    entity_unit text CHECK (entity_unit IS NULL OR entity_unit IN (
        'person','child_person','household','establishment','enterprise'
    )),
    denominator text NOT NULL,
    geography text NOT NULL,
    reference_year integer CHECK (reference_year IS NULL OR reference_year BETWEEN 1900 AND 2200),
    value_low numeric NOT NULL,
    value_base numeric NOT NULL,
    value_high numeric NOT NULL,
    inference_method text NOT NULL,
    observation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    confidence_grade text NOT NULL CHECK (confidence_grade IN ('A','B','C','D','E')),
    confidence_components jsonb NOT NULL,
    confidence_penalties jsonb NOT NULL DEFAULT '[]'::jsonb,
    confidence_rule_version text NOT NULL,
    source_bundle_hash text NOT NULL,
    created_by_actor_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (value_low <= value_base AND value_base <= value_high),
    CHECK (supersedes_factor_id IS NULL OR supersedes_factor_id <> approved_factor_id)
);

CREATE INDEX IF NOT EXISTS approved_research_factor_lookup_idx
    ON approved_research_factor(workspace_id, target_variable, created_at DESC);
CREATE INDEX IF NOT EXISTS approved_research_factor_release_idx
    ON approved_research_factor(publication_version_id);

CREATE TABLE IF NOT EXISTS approved_research_factor_source (
    approved_factor_id uuid NOT NULL REFERENCES approved_research_factor(approved_factor_id),
    source_index integer NOT NULL CHECK (source_index >= 0),
    institution text NOT NULL,
    title text NOT NULL,
    url text NOT NULL,
    publication_date date,
    reference_year integer CHECK (reference_year IS NULL OR reference_year BETWEEN 1900 AND 2200),
    accessed_at timestamptz NOT NULL,
    locator text NOT NULL,
    used_value jsonb,
    source_tier smallint NOT NULL CHECK (source_tier BETWEEN 1 AND 8),
    claims jsonb NOT NULL DEFAULT '[]'::jsonb,
    source_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (approved_factor_id, source_index),
    UNIQUE (approved_factor_id, source_hash)
);

ALTER TABLE proposed_revision ADD COLUMN IF NOT EXISTS materialized_factor_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'proposed_revision'::regclass
           AND conname = 'proposed_revision_materialized_factor_fk'
    ) THEN
        ALTER TABLE proposed_revision
            ADD CONSTRAINT proposed_revision_materialized_factor_fk
            FOREIGN KEY (materialized_factor_id)
            REFERENCES approved_research_factor(approved_factor_id);
    END IF;
END $$;

ALTER TABLE approved_research_factor ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_research_factor_source ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approved_research_factor_select_policy ON approved_research_factor;
DROP POLICY IF EXISTS approved_research_factor_insert_policy ON approved_research_factor;
CREATE POLICY approved_research_factor_select_policy ON approved_research_factor
    FOR SELECT
    USING (workspace_id = market_engine_current_workspace_id());
CREATE POLICY approved_research_factor_insert_policy ON approved_research_factor
    FOR INSERT
    WITH CHECK (
        workspace_id = market_engine_current_workspace_id()
        AND created_by_actor_id = market_engine_current_actor_id()
        AND EXISTS (
            SELECT 1 FROM workspace_member member
             WHERE member.workspace_id = market_engine_current_workspace_id()
               AND member.actor_id = market_engine_current_actor_id()
               AND member.role IN ('owner','reviewer')
        )
    );

DROP POLICY IF EXISTS approved_research_factor_source_select_policy ON approved_research_factor_source;
DROP POLICY IF EXISTS approved_research_factor_source_insert_policy ON approved_research_factor_source;
CREATE POLICY approved_research_factor_source_select_policy ON approved_research_factor_source
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM approved_research_factor factor
         WHERE factor.approved_factor_id = approved_research_factor_source.approved_factor_id
           AND factor.workspace_id = market_engine_current_workspace_id()
    ));
CREATE POLICY approved_research_factor_source_insert_policy ON approved_research_factor_source
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM approved_research_factor factor
         WHERE factor.approved_factor_id = approved_research_factor_source.approved_factor_id
           AND factor.workspace_id = market_engine_current_workspace_id()
    ));

DROP TRIGGER IF EXISTS approved_research_factor_append_only_trigger ON approved_research_factor;
CREATE TRIGGER approved_research_factor_append_only_trigger
    BEFORE UPDATE OR DELETE ON approved_research_factor
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

DROP TRIGGER IF EXISTS approved_research_factor_source_append_only_trigger ON approved_research_factor_source;
CREATE TRIGGER approved_research_factor_source_append_only_trigger
    BEFORE UPDATE OR DELETE ON approved_research_factor_source
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

GRANT SELECT, INSERT ON approved_research_factor, approved_research_factor_source
TO market_engine_app;
GRANT SELECT ON approved_research_factor, approved_research_factor_source
TO market_engine_worker;
REVOKE UPDATE, DELETE ON approved_research_factor, approved_research_factor_source
FROM market_engine_app, market_engine_worker;

COMMIT;
