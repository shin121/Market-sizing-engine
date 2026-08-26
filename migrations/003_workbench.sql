BEGIN;

-- Phase 3 is additive. The 58 Phase 1-2 baseline tables remain the canonical
-- source for taxonomy, evidence, population controls, models, and estimates.
-- Workbench state is stored separately and approved changes create new
-- versions instead of updating baseline records in place.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS workspace (
    workspace_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_key text NOT NULL UNIQUE,
    name text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_member (
    workspace_id uuid NOT NULL REFERENCES workspace(workspace_id),
    actor_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('owner','editor','reviewer','viewer','worker')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, actor_id)
);

CREATE TABLE IF NOT EXISTS data_release_version (
    publication_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid REFERENCES workspace(workspace_id),
    version_label text NOT NULL UNIQUE,
    parent_version_id uuid REFERENCES data_release_version(publication_version_id),
    baseline_model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    status text NOT NULL CHECK (status IN ('draft','approved','published','superseded')),
    rationale text NOT NULL,
    approved_by_actor_id uuid,
    approved_at timestamptz,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((status IN ('approved','published','superseded')) = (approved_at IS NOT NULL)),
    CHECK (published_at IS NULL OR approved_at IS NOT NULL)
);

-- Stable import keys make a DuckDB/Parquet backfill a no-op when its content
-- has already been loaded and allow drift to be detected before a write.
ALTER TABLE pipeline_run ADD COLUMN IF NOT EXISTS external_run_key text;
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_run_external_run_key_uidx
    ON pipeline_run(external_run_key) WHERE external_run_key IS NOT NULL;

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS external_evidence_key text;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS source_treatment text;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS usage_context text;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS confidence_score smallint;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS review_due_at date;
CREATE UNIQUE INDEX IF NOT EXISTS evidence_external_evidence_key_uidx
    ON evidence(external_evidence_key) WHERE external_evidence_key IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'evidence'::regclass AND conname = 'evidence_source_treatment_chk'
    ) THEN
        ALTER TABLE evidence ADD CONSTRAINT evidence_source_treatment_chk
            CHECK (source_treatment IS NULL OR source_treatment IN ('raw','processed','proxy','inference'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'evidence'::regclass AND conname = 'evidence_confidence_score_chk'
    ) THEN
        ALTER TABLE evidence ADD CONSTRAINT evidence_confidence_score_chk
            CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100);
    END IF;
END $$;

ALTER TABLE population_cell ADD COLUMN IF NOT EXISTS source_record_key text;
ALTER TABLE population_cell ADD COLUMN IF NOT EXISTS source_content_hash text;
ALTER TABLE minor_population_cell ADD COLUMN IF NOT EXISTS source_record_key text;
ALTER TABLE minor_population_cell ADD COLUMN IF NOT EXISTS source_content_hash text;
ALTER TABLE household_cell ADD COLUMN IF NOT EXISTS source_record_key text;
ALTER TABLE household_cell ADD COLUMN IF NOT EXISTS source_content_hash text;
ALTER TABLE business_cell ADD COLUMN IF NOT EXISTS source_record_key text;
ALTER TABLE business_cell ADD COLUMN IF NOT EXISTS source_content_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS population_cell_source_record_key_uidx
    ON population_cell(source_record_key) WHERE source_record_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS minor_population_cell_source_record_key_uidx
    ON minor_population_cell(source_record_key) WHERE source_record_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS household_cell_source_record_key_uidx
    ON household_cell(source_record_key) WHERE source_record_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS business_cell_source_record_key_uidx
    ON business_cell(source_record_key) WHERE source_record_key IS NOT NULL;

ALTER TABLE cluster_definition ADD COLUMN IF NOT EXISTS raw_cluster_number smallint;

-- Existing estimate tables remain the calculation ledger. These columns add
-- governance and cache identity without changing any Phase 1-2 value.
ALTER TABLE estimate ADD COLUMN IF NOT EXISTS external_estimate_key text;
ALTER TABLE estimate ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(workspace_id);
ALTER TABLE estimate ADD COLUMN IF NOT EXISTS data_layer text;
ALTER TABLE estimate ADD COLUMN IF NOT EXISTS approval_status text;
ALTER TABLE estimate ADD COLUMN IF NOT EXISTS supersedes_estimate_id uuid REFERENCES estimate(estimate_id);
ALTER TABLE estimate ADD COLUMN IF NOT EXISTS calculation_input_hash text;
ALTER TABLE estimate ADD COLUMN IF NOT EXISTS dependency_fingerprint text;
ALTER TABLE estimate ADD COLUMN IF NOT EXISTS publication_version_id uuid REFERENCES data_release_version(publication_version_id);
ALTER TABLE estimate ADD COLUMN IF NOT EXISTS created_by_actor_id uuid;

UPDATE estimate SET data_layer = 'baseline' WHERE data_layer IS NULL;
UPDATE estimate SET approval_status = 'approved' WHERE approval_status IS NULL;
ALTER TABLE estimate ALTER COLUMN data_layer SET DEFAULT 'derived_estimate';
ALTER TABLE estimate ALTER COLUMN data_layer SET NOT NULL;
ALTER TABLE estimate ALTER COLUMN approval_status SET DEFAULT 'not_required';
ALTER TABLE estimate ALTER COLUMN approval_status SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS estimate_external_estimate_key_uidx
    ON estimate(external_estimate_key) WHERE external_estimate_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS estimate_workspace_created_idx
    ON estimate(workspace_id, created_at DESC) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS estimate_dependency_fingerprint_idx
    ON estimate(dependency_fingerprint) WHERE dependency_fingerprint IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'estimate'::regclass AND conname = 'estimate_data_layer_chk'
    ) THEN
        ALTER TABLE estimate ADD CONSTRAINT estimate_data_layer_chk
            CHECK (data_layer IN ('baseline','derived_estimate','user_scenario','proposed_revision','approved_version'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'estimate'::regclass AND conname = 'estimate_approval_status_chk'
    ) THEN
        ALTER TABLE estimate ADD CONSTRAINT estimate_approval_status_chk
            CHECK (approval_status IN ('not_required','pending','approved','rejected'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'estimate'::regclass AND conname = 'estimate_not_self_superseding_chk'
    ) THEN
        ALTER TABLE estimate ADD CONSTRAINT estimate_not_self_superseding_chk
            CHECK (supersedes_estimate_id IS NULL OR supersedes_estimate_id <> estimate_id);
    END IF;
END $$;

ALTER TABLE estimate_component ADD COLUMN IF NOT EXISTS component_code text;
ALTER TABLE estimate_component ADD COLUMN IF NOT EXISTS denominator_definition text;
ALTER TABLE estimate_component ADD COLUMN IF NOT EXISTS conditional_probability numeric;
ALTER TABLE estimate_component ADD COLUMN IF NOT EXISTS reference_period_id bigint REFERENCES time_period(period_id);
ALTER TABLE estimate_component ADD COLUMN IF NOT EXISTS directness_class text;
ALTER TABLE estimate_component ADD COLUMN IF NOT EXISTS dependency_group text;
ALTER TABLE estimate_component ADD COLUMN IF NOT EXISTS model_version_id uuid REFERENCES model_version(model_version_id);
ALTER TABLE estimate_component ADD COLUMN IF NOT EXISTS adjustment_reason text;
ALTER TABLE estimate_component ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS estimate_component_code_uidx
    ON estimate_component(estimate_id, component_code) WHERE component_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS estimate_component_dependency_group_idx
    ON estimate_component(dependency_group) WHERE dependency_group IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'estimate_component'::regclass AND conname = 'estimate_component_probability_chk'
    ) THEN
        ALTER TABLE estimate_component ADD CONSTRAINT estimate_component_probability_chk
            CHECK (conditional_probability IS NULL OR conditional_probability BETWEEN 0 AND 1);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'estimate_component'::regclass AND conname = 'estimate_component_directness_chk'
    ) THEN
        ALTER TABLE estimate_component ADD CONSTRAINT estimate_component_directness_chk
            CHECK (directness_class IS NULL OR directness_class IN ('direct_observation','proxy','inference','user_input'));
    END IF;
END $$;

ALTER TABLE confidence_assessment ADD COLUMN IF NOT EXISTS rule_version text NOT NULL DEFAULT 'confidence-v1';
ALTER TABLE confidence_assessment ADD COLUMN IF NOT EXISTS components_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE confidence_assessment ADD COLUMN IF NOT EXISTS penalties_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE confidence_assessment ADD COLUMN IF NOT EXISTS validation_gap_reviewed_at timestamptz;

ALTER TABLE segment_query_result ADD COLUMN IF NOT EXISTS result_hash text;
ALTER TABLE segment_query_result ADD COLUMN IF NOT EXISTS dependency_fingerprint text;
ALTER TABLE segment_query_result ADD COLUMN IF NOT EXISTS cache_status text NOT NULL DEFAULT 'valid';
ALTER TABLE segment_query_result ADD COLUMN IF NOT EXISTS invalidated_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS segment_query_result_hash_uidx
    ON segment_query_result(query_id, model_version_id, result_hash) WHERE result_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS segment_query_result_latest_idx
    ON segment_query_result(query_id, model_version_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS segment_query_result_dependency_idx
    ON segment_query_result(dependency_fingerprint) WHERE dependency_fingerprint IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'segment_query_result'::regclass AND conname = 'segment_query_result_cache_status_chk'
    ) THEN
        ALTER TABLE segment_query_result ADD CONSTRAINT segment_query_result_cache_status_chk
            CHECK (cache_status IN ('valid','stale','invalidated'));
    END IF;
END $$;

ALTER TABLE market_scenario ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(workspace_id);
ALTER TABLE market_scenario ADD COLUMN IF NOT EXISTS base_query_result_id uuid REFERENCES segment_query_result(result_id);
ALTER TABLE market_scenario ADD COLUMN IF NOT EXISTS scenario_hash text;
ALTER TABLE market_scenario ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE market_scenario ADD COLUMN IF NOT EXISTS created_by_actor_id uuid;
ALTER TABLE market_scenario ADD COLUMN IF NOT EXISTS supersedes_scenario_id uuid REFERENCES market_scenario(scenario_id);
CREATE UNIQUE INDEX IF NOT EXISTS market_scenario_workspace_hash_uidx
    ON market_scenario(workspace_id, scenario_hash) WHERE scenario_hash IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'market_scenario'::regclass AND conname = 'market_scenario_status_chk'
    ) THEN
        ALTER TABLE market_scenario ADD CONSTRAINT market_scenario_status_chk
            CHECK (status IN ('draft','active','archived','superseded'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'market_scenario'::regclass AND conname = 'market_scenario_not_self_superseding_chk'
    ) THEN
        ALTER TABLE market_scenario ADD CONSTRAINT market_scenario_not_self_superseding_chk
            CHECK (supersedes_scenario_id IS NULL OR supersedes_scenario_id <> scenario_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'market_estimate'::regclass AND conname = 'market_estimate_entity_order_chk'
    ) THEN
        ALTER TABLE market_estimate ADD CONSTRAINT market_estimate_entity_order_chk CHECK (
            som_entities_low <= sam_entities_low AND sam_entities_low <= tam_entities_low AND
            som_entities_base <= sam_entities_base AND sam_entities_base <= tam_entities_base AND
            som_entities_high <= sam_entities_high AND sam_entities_high <= tam_entities_high
        );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'market_estimate'::regclass AND conname = 'market_estimate_revenue_order_chk'
    ) THEN
        ALTER TABLE market_estimate ADD CONSTRAINT market_estimate_revenue_order_chk CHECK (
            som_revenue_low <= sam_revenue_low AND sam_revenue_low <= tam_revenue_low AND
            som_revenue_base <= sam_revenue_base AND sam_revenue_base <= tam_revenue_base AND
            som_revenue_high <= sam_revenue_high AND sam_revenue_high <= tam_revenue_high
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS entity_unit_bridge (
    bridge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bridge_code text NOT NULL UNIQUE,
    from_unit text NOT NULL CHECK (from_unit IN ('person','child_person','household','establishment','enterprise')),
    to_unit text NOT NULL CHECK (to_unit IN ('person','child_person','household','establishment','enterprise')),
    bridge_type text NOT NULL CHECK (bridge_type IN ('identity','observed_ratio','decision_maker_proxy','owner_operator_proxy')),
    geography_id bigint REFERENCES geography(geography_id),
    period_id bigint REFERENCES time_period(period_id),
    factor_low numeric NOT NULL CHECK (factor_low >= 0),
    factor_base numeric NOT NULL CHECK (factor_base >= 0),
    factor_high numeric NOT NULL CHECK (factor_high >= 0),
    denominator_definition text NOT NULL,
    formula text NOT NULL,
    evidence_id bigint REFERENCES evidence(evidence_id),
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    status text NOT NULL CHECK (status IN ('approved','scenario_only','rejected','superseded')),
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    validation_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK (factor_low <= factor_base AND factor_base <= factor_high),
    CHECK ((bridge_type = 'identity' AND from_unit = to_unit) OR bridge_type <> 'identity')
);

CREATE INDEX IF NOT EXISTS entity_unit_bridge_lookup_idx
    ON entity_unit_bridge(from_unit, to_unit, status, period_id);

CREATE TABLE IF NOT EXISTS saved_segment (
    saved_segment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspace(workspace_id),
    title text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    current_version_no integer NOT NULL DEFAULT 1 CHECK (current_version_no > 0),
    optimistic_lock_version bigint NOT NULL DEFAULT 1 CHECK (optimistic_lock_version > 0),
    created_by_actor_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_segment_version (
    saved_segment_id uuid NOT NULL REFERENCES saved_segment(saved_segment_id),
    version_no integer NOT NULL CHECK (version_no > 0),
    query_id uuid NOT NULL REFERENCES segment_query(query_id),
    pinned_result_id uuid REFERENCES segment_query_result(result_id),
    natural_language_text text,
    parser_version text,
    definition_hash text NOT NULL,
    change_reason text NOT NULL,
    created_by_actor_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (saved_segment_id, version_no)
);

CREATE TABLE IF NOT EXISTS segment_condition_group (
    group_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id uuid NOT NULL REFERENCES segment_query(query_id),
    parent_group_id uuid,
    logical_operator text NOT NULL CHECK (logical_operator IN ('AND','OR','NOT')),
    ordinal integer NOT NULL CHECK (ordinal >= 0),
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (query_id, group_id),
    UNIQUE (query_id, parent_group_id, ordinal),
    FOREIGN KEY (query_id, parent_group_id)
        REFERENCES segment_condition_group(query_id, group_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS segment_condition_group_one_root_uidx
    ON segment_condition_group(query_id) WHERE parent_group_id IS NULL;
CREATE INDEX IF NOT EXISTS segment_condition_group_parent_idx
    ON segment_condition_group(query_id, parent_group_id, ordinal);

CREATE TABLE IF NOT EXISTS segment_condition (
    condition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id uuid NOT NULL REFERENCES segment_query(query_id),
    group_id uuid NOT NULL,
    condition_namespace text NOT NULL CHECK (condition_namespace IN ('core_feature','domain_feature','dimension','subtype','archetype','geography','custom')),
    source_code text NOT NULL,
    operator text NOT NULL CHECK (operator IN ('eq','neq','in','not_in','between','lt','lte','gt','gte','contains','exists')),
    value_json jsonb,
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise','all')),
    resolution_status text NOT NULL CHECK (resolution_status IN ('exact','similar','proxy','ambiguous','missing','research_required')),
    feature_id bigint REFERENCES feature_definition(feature_id),
    domain_feature_id text REFERENCES domain_feature(domain_feature_id),
    dimension_id text REFERENCES domain_dimension(dimension_id),
    subtype_id text REFERENCES subtype_definition(subtype_id),
    archetype_id text REFERENCES archetype(archetype_id),
    geography_id bigint REFERENCES geography(geography_id),
    evidence_id bigint REFERENCES evidence(evidence_id),
    source_text text,
    dependency_group text,
    ordinal integer NOT NULL CHECK (ordinal >= 0),
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (query_id, condition_id),
    UNIQUE (query_id, group_id, ordinal),
    FOREIGN KEY (query_id, group_id)
        REFERENCES segment_condition_group(query_id, group_id),
    CHECK (num_nonnulls(feature_id, domain_feature_id, dimension_id, subtype_id, archetype_id, geography_id) <= 1)
);

CREATE INDEX IF NOT EXISTS segment_condition_source_idx
    ON segment_condition(condition_namespace, source_code, operator);
CREATE INDEX IF NOT EXISTS segment_condition_group_idx
    ON segment_condition(query_id, group_id, ordinal);
CREATE INDEX IF NOT EXISTS segment_condition_value_gin
    ON segment_condition USING gin(value_json);

CREATE TABLE IF NOT EXISTS estimate_dependency (
    estimate_dependency_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estimate_id uuid NOT NULL REFERENCES estimate(estimate_id),
    dependency_kind text NOT NULL CHECK (dependency_kind IN (
        'source_release','evidence','population_cell','minor_population_cell','household_cell','business_cell',
        'archetype','subtype','parent_estimate','subtype_allocation','domain_association','assumption',
        'model_version','query_result','unit_bridge','other'
    )),
    dependency_record_key text NOT NULL,
    dependency_version text,
    dependency_content_hash text NOT NULL,
    dependency_role text NOT NULL CHECK (dependency_role IN ('denominator','factor','adjustment','model','validation','output')),
    evidence_id bigint REFERENCES evidence(evidence_id),
    model_version_id uuid REFERENCES model_version(model_version_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (estimate_id, dependency_kind, dependency_record_key, dependency_version)
);

CREATE INDEX IF NOT EXISTS estimate_dependency_reverse_idx
    ON estimate_dependency(dependency_kind, dependency_record_key, dependency_version);

CREATE TABLE IF NOT EXISTS estimate_sensitivity_result (
    sensitivity_result_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estimate_id uuid NOT NULL REFERENCES estimate(estimate_id),
    component_id bigint REFERENCES estimate_component(component_id),
    factor_code text NOT NULL,
    tested_low numeric NOT NULL,
    tested_base numeric NOT NULL,
    tested_high numeric NOT NULL,
    output_low numeric NOT NULL,
    output_base numeric NOT NULL,
    output_high numeric NOT NULL,
    output_unit text NOT NULL,
    elasticity numeric,
    impact_rank integer NOT NULL CHECK (impact_rank > 0),
    method_code text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (estimate_id, factor_code, impact_rank),
    CHECK (tested_low <= tested_base AND tested_base <= tested_high),
    CHECK (output_low <= output_base AND output_base <= output_high)
);

CREATE TABLE IF NOT EXISTS scenario_factor_override (
    scenario_id uuid NOT NULL REFERENCES market_scenario(scenario_id),
    factor_code text NOT NULL,
    original_component_id bigint REFERENCES estimate_component(component_id),
    value_low numeric NOT NULL,
    value_base numeric NOT NULL,
    value_high numeric NOT NULL,
    unit text NOT NULL,
    directness_class text NOT NULL CHECK (directness_class IN ('direct_observation','proxy','inference','user_input')),
    evidence_id bigint REFERENCES evidence(evidence_id),
    assumption_id bigint REFERENCES assumption(assumption_id),
    dependency_group text,
    rationale text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scenario_id, factor_code),
    CHECK (value_low <= value_base AND value_base <= value_high)
);

CREATE TABLE IF NOT EXISTS research_job (
    research_job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspace(workspace_id),
    saved_segment_id uuid REFERENCES saved_segment(saved_segment_id),
    query_id uuid REFERENCES segment_query(query_id),
    condition_id uuid REFERENCES segment_condition(condition_id),
    validation_gap_id bigint REFERENCES validation_gap(validation_gap_id),
    research_question text NOT NULL,
    target_segment text NOT NULL,
    target_variable text NOT NULL,
    provider text,
    provider_model text,
    output_schema_version text NOT NULL,
    input_payload jsonb NOT NULL,
    input_hash text NOT NULL,
    idempotency_key text,
    status text NOT NULL CHECK (status IN ('draft','queued','running','needs_review','approved','rejected','failed','cancelled','configuration_required')),
    priority smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    next_attempt_at timestamptz,
    error_code text,
    error_message text,
    created_by_actor_id uuid NOT NULL,
    queued_at timestamptz,
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (attempt_count <= max_attempts)
);

CREATE UNIQUE INDEX IF NOT EXISTS research_job_idempotency_uidx
    ON research_job(workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS research_job_queue_idx
    ON research_job(status, priority, next_attempt_at, created_at)
    WHERE status IN ('queued','running','configuration_required');
CREATE INDEX IF NOT EXISTS research_job_workspace_idx
    ON research_job(workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS research_job_step (
    research_job_step_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    research_job_id uuid NOT NULL REFERENCES research_job(research_job_id),
    step_no integer NOT NULL CHECK (step_no > 0),
    step_name text NOT NULL,
    status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','skipped','retrying')),
    input_hash text,
    output_hash text,
    error_code text,
    error_message text,
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (research_job_id, step_no)
);

CREATE TABLE IF NOT EXISTS research_job_event (
    research_job_event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    research_job_id uuid NOT NULL REFERENCES research_job(research_job_id),
    sequence_no integer NOT NULL CHECK (sequence_no > 0),
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (research_job_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS research_job_event_job_time_idx
    ON research_job_event(research_job_id, sequence_no DESC);

CREATE TABLE IF NOT EXISTS research_job_artifact (
    research_job_artifact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    research_job_id uuid NOT NULL REFERENCES research_job(research_job_id),
    research_job_step_id uuid REFERENCES research_job_step(research_job_step_id),
    artifact_kind text NOT NULL CHECK (artifact_kind IN ('request','response','structured_result','citation_bundle','error','export')),
    artifact_uri text,
    sha256 text,
    media_type text,
    structured_payload jsonb,
    schema_version text,
    validation_status text NOT NULL CHECK (validation_status IN ('not_applicable','pending','valid','invalid')),
    validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (artifact_uri IS NOT NULL OR structured_payload IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS research_job_artifact_job_idx
    ON research_job_artifact(research_job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS proposed_revision (
    proposed_revision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspace(workspace_id),
    research_job_id uuid REFERENCES research_job(research_job_id),
    target_kind text NOT NULL CHECK (target_kind IN ('estimate','estimate_component','assumption','evidence','domain_feature','subtype','subtype_allocation','unit_bridge','source_release','other')),
    target_record_key text NOT NULL,
    baseline_data_version text NOT NULL,
    baseline_content_hash text NOT NULL,
    baseline_payload jsonb NOT NULL,
    proposed_content_hash text NOT NULL,
    proposed_payload jsonb NOT NULL,
    delta_summary jsonb NOT NULL,
    affected_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
    expected_recalculation jsonb NOT NULL DEFAULT '{}'::jsonb,
    recommended_action text NOT NULL,
    status text NOT NULL CHECK (status IN ('draft','pending_review','approved','rejected','superseded')),
    materialized_estimate_id uuid REFERENCES estimate(estimate_id),
    approved_publication_version_id uuid REFERENCES data_release_version(publication_version_id),
    created_by_actor_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((status IN ('approved','superseded')) = (approved_publication_version_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS proposed_revision_job_target_hash_uidx
    ON proposed_revision(research_job_id, target_kind, target_record_key, proposed_content_hash)
    WHERE research_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS proposed_revision_workspace_status_idx
    ON proposed_revision(workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS proposed_revision_evidence (
    proposed_revision_id uuid NOT NULL REFERENCES proposed_revision(proposed_revision_id),
    evidence_id bigint NOT NULL REFERENCES evidence(evidence_id),
    evidence_role text NOT NULL CHECK (evidence_role IN ('primary','corroborating','contradicting','limitation')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (proposed_revision_id, evidence_id, evidence_role)
);

CREATE TABLE IF NOT EXISTS review_item (
    review_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspace(workspace_id),
    proposed_revision_id uuid REFERENCES proposed_revision(proposed_revision_id),
    posterior_update_id uuid REFERENCES posterior_update(posterior_update_id),
    status text NOT NULL CHECK (status IN ('pending','in_review','approved','rejected','changes_requested','closed')),
    priority smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    assigned_actor_id uuid,
    due_at timestamptz,
    created_by_actor_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(proposed_revision_id, posterior_update_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS review_item_revision_uidx
    ON review_item(proposed_revision_id) WHERE proposed_revision_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS review_item_posterior_uidx
    ON review_item(posterior_update_id) WHERE posterior_update_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS review_item_queue_idx
    ON review_item(workspace_id, status, priority, created_at)
    WHERE status IN ('pending','in_review','changes_requested');

CREATE TABLE IF NOT EXISTS review_decision (
    review_decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_item_id uuid NOT NULL REFERENCES review_item(review_item_id),
    sequence_no integer NOT NULL CHECK (sequence_no > 0),
    action text NOT NULL CHECK (action IN ('approve','modify_and_approve','reject','request_more_research','keep_existing')),
    modified_payload jsonb,
    rationale text NOT NULL,
    decided_by_actor_id uuid NOT NULL,
    decided_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (review_item_id, sequence_no),
    CHECK ((action = 'modify_and_approve') = (modified_payload IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS comparison_workspace (
    comparison_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspace(workspace_id),
    name text NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','saved','archived')),
    version_no integer NOT NULL DEFAULT 1 CHECK (version_no > 0),
    created_by_actor_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comparison_member (
    comparison_member_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    comparison_id uuid NOT NULL REFERENCES comparison_workspace(comparison_id),
    position smallint NOT NULL CHECK (position BETWEEN 1 AND 5),
    query_result_id uuid NOT NULL REFERENCES segment_query_result(result_id),
    market_estimate_id uuid REFERENCES market_estimate(market_estimate_id),
    display_label text,
    normalized_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    added_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (comparison_id, position),
    UNIQUE (comparison_id, query_result_id)
);

CREATE OR REPLACE FUNCTION enforce_comparison_member_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    member_count integer;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT count(*) INTO member_count
        FROM comparison_member
        WHERE comparison_id = NEW.comparison_id;
    ELSE
        SELECT count(*) INTO member_count
        FROM comparison_member
        WHERE comparison_id = NEW.comparison_id
          AND comparison_member_id <> OLD.comparison_member_id;
    END IF;
    IF member_count >= 5 THEN
        RAISE EXCEPTION 'a comparison may contain at most five members';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS comparison_member_limit_trigger ON comparison_member;
CREATE TRIGGER comparison_member_limit_trigger
    BEFORE INSERT OR UPDATE OF comparison_id ON comparison_member
    FOR EACH ROW EXECUTE FUNCTION enforce_comparison_member_limit();

CREATE INDEX IF NOT EXISTS comparison_workspace_recent_idx
    ON comparison_workspace(workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS opportunity_board (
    opportunity_board_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspace(workspace_id),
    name text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    created_by_actor_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS opportunity (
    opportunity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_board_id uuid NOT NULL REFERENCES opportunity_board(opportunity_board_id),
    name text NOT NULL,
    problem_statement text NOT NULL,
    hypothesis_summary text NOT NULL,
    solution_idea text NOT NULL,
    revenue_model text,
    expected_price_low numeric,
    expected_price_base numeric,
    expected_price_high numeric,
    currency char(3),
    access_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
    competing_alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
    assumptions_to_validate jsonb NOT NULL DEFAULT '[]'::jsonb,
    next_experiment_summary text,
    status text NOT NULL CHECK (status IN ('discovered','researching','validating','planned','paused','rejected','archived')),
    optimistic_lock_version bigint NOT NULL DEFAULT 1 CHECK (optimistic_lock_version > 0),
    created_by_actor_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (expected_price_low IS NULL OR expected_price_low <= expected_price_base AND expected_price_base <= expected_price_high),
    CHECK ((expected_price_low IS NULL AND expected_price_base IS NULL AND expected_price_high IS NULL)
        OR (expected_price_low IS NOT NULL AND expected_price_base IS NOT NULL AND expected_price_high IS NOT NULL AND currency IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS opportunity_board_recent_idx
    ON opportunity_board(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS opportunity_status_idx
    ON opportunity(opportunity_board_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS opportunity_segment_link (
    opportunity_segment_link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id uuid NOT NULL REFERENCES opportunity(opportunity_id),
    saved_segment_id uuid,
    saved_segment_version_no integer,
    query_result_id uuid NOT NULL REFERENCES segment_query_result(result_id),
    market_estimate_id uuid REFERENCES market_estimate(market_estimate_id),
    link_role text NOT NULL CHECK (link_role IN ('primary_target','secondary_target','comparison','evidence')),
    pinned_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (saved_segment_id, saved_segment_version_no)
        REFERENCES saved_segment_version(saved_segment_id, version_no),
    UNIQUE (opportunity_id, query_result_id, link_role),
    CHECK ((saved_segment_id IS NULL) = (saved_segment_version_no IS NULL))
);

CREATE INDEX IF NOT EXISTS opportunity_segment_link_result_idx
    ON opportunity_segment_link(query_result_id, opportunity_id);

CREATE TABLE IF NOT EXISTS opportunity_score_version (
    opportunity_id uuid NOT NULL REFERENCES opportunity(opportunity_id),
    version_no integer NOT NULL CHECK (version_no > 0),
    overall_score numeric NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
    formula_version text NOT NULL,
    weight_config jsonb NOT NULL,
    created_by_actor_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (opportunity_id, version_no)
);

CREATE TABLE IF NOT EXISTS opportunity_score_component (
    opportunity_id uuid NOT NULL,
    score_version_no integer NOT NULL,
    metric_code text NOT NULL,
    raw_value numeric,
    raw_unit text,
    normalized_score numeric NOT NULL CHECK (normalized_score BETWEEN 0 AND 100),
    weight numeric NOT NULL CHECK (weight BETWEEN 0 AND 1),
    weighted_score numeric NOT NULL,
    source_kind text NOT NULL CHECK (source_kind IN ('data','user_input','ai_hypothesis','derived')),
    source_record_key text,
    formula text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (opportunity_id, score_version_no, metric_code),
    FOREIGN KEY (opportunity_id, score_version_no)
        REFERENCES opportunity_score_version(opportunity_id, version_no),
    CHECK (abs(weighted_score - normalized_score * weight) <= 0.0001)
);

CREATE TABLE IF NOT EXISTS opportunity_content_version (
    opportunity_content_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id uuid NOT NULL REFERENCES opportunity(opportunity_id),
    content_key text NOT NULL,
    content_type text NOT NULL CHECK (content_type IN ('note','hypothesis','idea_brief','value_proposition','message','interview_guide','risk')),
    version_no integer NOT NULL CHECK (version_no > 0),
    content jsonb NOT NULL,
    source_kind text NOT NULL CHECK (source_kind IN ('user','ai_hypothesis','derived')),
    source_query_result_id uuid REFERENCES segment_query_result(result_id),
    source_market_estimate_id uuid REFERENCES market_estimate(market_estimate_id),
    source_subtype_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    source_archetype_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    provider_model text,
    created_by_actor_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (opportunity_id, content_key, version_no)
);

CREATE TABLE IF NOT EXISTS opportunity_experiment (
    opportunity_experiment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id uuid NOT NULL REFERENCES opportunity(opportunity_id),
    name text NOT NULL,
    hypothesis text NOT NULL,
    method text NOT NULL,
    primary_metric text NOT NULL,
    success_criteria text NOT NULL,
    cost_low numeric,
    cost_base numeric,
    cost_high numeric,
    currency char(3),
    status text NOT NULL CHECK (status IN ('draft','planned','running','completed','cancelled')),
    result jsonb,
    created_by_actor_id uuid NOT NULL,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (cost_low IS NULL OR cost_low <= cost_base AND cost_base <= cost_high),
    CHECK ((cost_low IS NULL AND cost_base IS NULL AND cost_high IS NULL)
        OR (cost_low IS NOT NULL AND cost_base IS NOT NULL AND cost_high IS NOT NULL AND currency IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS audit_event (
    audit_event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id uuid REFERENCES workspace(workspace_id),
    actor_id uuid,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    action text NOT NULL,
    before_json jsonb,
    after_json jsonb,
    diff_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    request_id text,
    correlation_id text,
    transaction_id bigint NOT NULL DEFAULT txid_current(),
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_event_aggregate_idx
    ON audit_event(aggregate_type, aggregate_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_workspace_actor_idx
    ON audit_event(workspace_id, actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_occurred_brin
    ON audit_event USING brin(occurred_at);

CREATE OR REPLACE FUNCTION workbench_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
END $$;

DROP TRIGGER IF EXISTS audit_event_append_only_trigger ON audit_event;
CREATE TRIGGER audit_event_append_only_trigger
    BEFORE UPDATE OR DELETE ON audit_event
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

DROP TRIGGER IF EXISTS research_job_event_append_only_trigger ON research_job_event;
CREATE TRIGGER research_job_event_append_only_trigger
    BEFORE UPDATE OR DELETE ON research_job_event
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

DROP TRIGGER IF EXISTS review_decision_append_only_trigger ON review_decision;
CREATE TRIGGER review_decision_append_only_trigger
    BEFORE UPDATE OR DELETE ON review_decision
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

DROP TRIGGER IF EXISTS saved_segment_version_append_only_trigger ON saved_segment_version;
CREATE TRIGGER saved_segment_version_append_only_trigger
    BEFORE UPDATE OR DELETE ON saved_segment_version
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

DROP TRIGGER IF EXISTS opportunity_score_version_append_only_trigger ON opportunity_score_version;
CREATE TRIGGER opportunity_score_version_append_only_trigger
    BEFORE UPDATE OR DELETE ON opportunity_score_version
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

DROP TRIGGER IF EXISTS opportunity_score_component_append_only_trigger ON opportunity_score_component;
CREATE TRIGGER opportunity_score_component_append_only_trigger
    BEFORE UPDATE OR DELETE ON opportunity_score_component
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

DROP TRIGGER IF EXISTS opportunity_content_version_append_only_trigger ON opportunity_content_version;
CREATE TRIGGER opportunity_content_version_append_only_trigger
    BEFORE UPDATE OR DELETE ON opportunity_content_version
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

DROP TRIGGER IF EXISTS research_job_artifact_append_only_trigger ON research_job_artifact;
CREATE TRIGGER research_job_artifact_append_only_trigger
    BEFORE UPDATE OR DELETE ON research_job_artifact
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

-- Korean text search uses pg_trgm because the stock PostgreSQL full-text
-- dictionaries do not provide Korean tokenization.
CREATE INDEX IF NOT EXISTS domain_registry_search_trgm_idx
    ON domain_registry USING gin ((coalesce(name_ko,'') || ' ' || coalesce(description,'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS subtype_definition_search_trgm_idx
    ON subtype_definition USING gin ((coalesce(name_ko,'') || ' ' || coalesce(definition,'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS archetype_search_trgm_idx
    ON archetype USING gin ((coalesce(name_ko,'') || ' ' || coalesce(one_line_definition,'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS saved_segment_search_trgm_idx
    ON saved_segment USING gin ((coalesce(title,'') || ' ' || coalesce(description,'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS opportunity_search_trgm_idx
    ON opportunity USING gin ((coalesce(name,'') || ' ' || coalesce(problem_statement,'') || ' ' || coalesce(solution_idea,'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS saved_segment_recent_idx
    ON saved_segment(workspace_id, updated_at DESC) WHERE status = 'active';

-- RLS is scoped by transaction-local settings set by the server. Migration
-- owners can still seed/backfill data; application roles see only the active
-- workspace. No authentication PII is stored in these tables.
CREATE OR REPLACE FUNCTION market_engine_current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT nullif(current_setting('market_engine.workspace_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION market_engine_current_actor_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT nullif(current_setting('market_engine.actor_id', true), '')::uuid
$$;

ALTER TABLE workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_release_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_scenario ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_segment_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_job_step ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_job_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_job_artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposed_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposed_revision_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_board ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_segment_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_score_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_score_component ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_content_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_experiment ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'workspace' AND policyname = 'workspace_scope_policy') THEN
        CREATE POLICY workspace_scope_policy ON workspace
            USING (workspace_id = market_engine_current_workspace_id())
            WITH CHECK (workspace_id = market_engine_current_workspace_id());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'workspace_member' AND policyname = 'workspace_member_scope_policy') THEN
        CREATE POLICY workspace_member_scope_policy ON workspace_member
            USING (workspace_id = market_engine_current_workspace_id())
            WITH CHECK (workspace_id = market_engine_current_workspace_id());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'data_release_version' AND policyname = 'data_release_version_scope_policy') THEN
        CREATE POLICY data_release_version_scope_policy ON data_release_version
            USING (workspace_id IS NULL OR workspace_id = market_engine_current_workspace_id())
            WITH CHECK (workspace_id IS NULL OR workspace_id = market_engine_current_workspace_id());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'estimate' AND policyname = 'estimate_scope_policy') THEN
        CREATE POLICY estimate_scope_policy ON estimate
            USING (workspace_id IS NULL OR workspace_id = market_engine_current_workspace_id())
            WITH CHECK (workspace_id IS NULL OR workspace_id = market_engine_current_workspace_id());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'market_scenario' AND policyname = 'market_scenario_scope_policy') THEN
        CREATE POLICY market_scenario_scope_policy ON market_scenario
            USING (workspace_id IS NULL OR workspace_id = market_engine_current_workspace_id())
            WITH CHECK (workspace_id IS NULL OR workspace_id = market_engine_current_workspace_id());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'saved_segment' AND policyname = 'saved_segment_scope_policy') THEN
        CREATE POLICY saved_segment_scope_policy ON saved_segment
            USING (workspace_id = market_engine_current_workspace_id())
            WITH CHECK (workspace_id = market_engine_current_workspace_id());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'saved_segment_version' AND policyname = 'saved_segment_version_scope_policy') THEN
        CREATE POLICY saved_segment_version_scope_policy ON saved_segment_version
            USING (EXISTS (
                SELECT 1 FROM saved_segment ss
                WHERE ss.saved_segment_id = saved_segment_version.saved_segment_id
                  AND ss.workspace_id = market_engine_current_workspace_id()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM saved_segment ss
                WHERE ss.saved_segment_id = saved_segment_version.saved_segment_id
                  AND ss.workspace_id = market_engine_current_workspace_id()
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'research_job' AND policyname = 'research_job_scope_policy') THEN
        CREATE POLICY research_job_scope_policy ON research_job
            USING (workspace_id = market_engine_current_workspace_id())
            WITH CHECK (workspace_id = market_engine_current_workspace_id());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'research_job_step' AND policyname = 'research_job_step_scope_policy') THEN
        CREATE POLICY research_job_step_scope_policy ON research_job_step
            USING (EXISTS (
                SELECT 1 FROM research_job rj
                WHERE rj.research_job_id = research_job_step.research_job_id
                  AND rj.workspace_id = market_engine_current_workspace_id()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM research_job rj
                WHERE rj.research_job_id = research_job_step.research_job_id
                  AND rj.workspace_id = market_engine_current_workspace_id()
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'research_job_event' AND policyname = 'research_job_event_scope_policy') THEN
        CREATE POLICY research_job_event_scope_policy ON research_job_event
            USING (EXISTS (
                SELECT 1 FROM research_job rj
                WHERE rj.research_job_id = research_job_event.research_job_id
                  AND rj.workspace_id = market_engine_current_workspace_id()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM research_job rj
                WHERE rj.research_job_id = research_job_event.research_job_id
                  AND rj.workspace_id = market_engine_current_workspace_id()
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'research_job_artifact' AND policyname = 'research_job_artifact_scope_policy') THEN
        CREATE POLICY research_job_artifact_scope_policy ON research_job_artifact
            USING (EXISTS (
                SELECT 1 FROM research_job rj
                WHERE rj.research_job_id = research_job_artifact.research_job_id
                  AND rj.workspace_id = market_engine_current_workspace_id()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM research_job rj
                WHERE rj.research_job_id = research_job_artifact.research_job_id
                  AND rj.workspace_id = market_engine_current_workspace_id()
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'proposed_revision' AND policyname = 'proposed_revision_scope_policy') THEN
        CREATE POLICY proposed_revision_scope_policy ON proposed_revision
            USING (workspace_id = market_engine_current_workspace_id())
            WITH CHECK (workspace_id = market_engine_current_workspace_id());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'proposed_revision_evidence' AND policyname = 'proposed_revision_evidence_scope_policy') THEN
        CREATE POLICY proposed_revision_evidence_scope_policy ON proposed_revision_evidence
            USING (EXISTS (
                SELECT 1 FROM proposed_revision pr
                WHERE pr.proposed_revision_id = proposed_revision_evidence.proposed_revision_id
                  AND pr.workspace_id = market_engine_current_workspace_id()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM proposed_revision pr
                WHERE pr.proposed_revision_id = proposed_revision_evidence.proposed_revision_id
                  AND pr.workspace_id = market_engine_current_workspace_id()
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'review_item' AND policyname = 'review_item_scope_policy') THEN
        CREATE POLICY review_item_scope_policy ON review_item
            USING (workspace_id = market_engine_current_workspace_id())
            WITH CHECK (workspace_id = market_engine_current_workspace_id());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'review_decision' AND policyname = 'review_decision_scope_policy') THEN
        CREATE POLICY review_decision_scope_policy ON review_decision
            USING (EXISTS (
                SELECT 1 FROM review_item ri
                WHERE ri.review_item_id = review_decision.review_item_id
                  AND ri.workspace_id = market_engine_current_workspace_id()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM review_item ri
                WHERE ri.review_item_id = review_decision.review_item_id
                  AND ri.workspace_id = market_engine_current_workspace_id()
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'comparison_workspace' AND policyname = 'comparison_workspace_scope_policy') THEN
        CREATE POLICY comparison_workspace_scope_policy ON comparison_workspace
            USING (workspace_id = market_engine_current_workspace_id())
            WITH CHECK (workspace_id = market_engine_current_workspace_id());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'comparison_member' AND policyname = 'comparison_member_scope_policy') THEN
        CREATE POLICY comparison_member_scope_policy ON comparison_member
            USING (EXISTS (
                SELECT 1 FROM comparison_workspace cw
                WHERE cw.comparison_id = comparison_member.comparison_id
                  AND cw.workspace_id = market_engine_current_workspace_id()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM comparison_workspace cw
                WHERE cw.comparison_id = comparison_member.comparison_id
                  AND cw.workspace_id = market_engine_current_workspace_id()
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'opportunity_board' AND policyname = 'opportunity_board_scope_policy') THEN
        CREATE POLICY opportunity_board_scope_policy ON opportunity_board
            USING (workspace_id = market_engine_current_workspace_id())
            WITH CHECK (workspace_id = market_engine_current_workspace_id());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'opportunity' AND policyname = 'opportunity_scope_policy') THEN
        CREATE POLICY opportunity_scope_policy ON opportunity
            USING (EXISTS (
                SELECT 1 FROM opportunity_board ob
                WHERE ob.opportunity_board_id = opportunity.opportunity_board_id
                  AND ob.workspace_id = market_engine_current_workspace_id()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM opportunity_board ob
                WHERE ob.opportunity_board_id = opportunity.opportunity_board_id
                  AND ob.workspace_id = market_engine_current_workspace_id()
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'opportunity_segment_link' AND policyname = 'opportunity_segment_link_scope_policy') THEN
        CREATE POLICY opportunity_segment_link_scope_policy ON opportunity_segment_link
            USING (EXISTS (
                SELECT 1 FROM opportunity o JOIN opportunity_board ob USING (opportunity_board_id)
                WHERE o.opportunity_id = opportunity_segment_link.opportunity_id
                  AND ob.workspace_id = market_engine_current_workspace_id()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM opportunity o JOIN opportunity_board ob USING (opportunity_board_id)
                WHERE o.opportunity_id = opportunity_segment_link.opportunity_id
                  AND ob.workspace_id = market_engine_current_workspace_id()
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'opportunity_score_version' AND policyname = 'opportunity_score_version_scope_policy') THEN
        CREATE POLICY opportunity_score_version_scope_policy ON opportunity_score_version
            USING (EXISTS (
                SELECT 1 FROM opportunity o JOIN opportunity_board ob USING (opportunity_board_id)
                WHERE o.opportunity_id = opportunity_score_version.opportunity_id
                  AND ob.workspace_id = market_engine_current_workspace_id()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM opportunity o JOIN opportunity_board ob USING (opportunity_board_id)
                WHERE o.opportunity_id = opportunity_score_version.opportunity_id
                  AND ob.workspace_id = market_engine_current_workspace_id()
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'opportunity_score_component' AND policyname = 'opportunity_score_component_scope_policy') THEN
        CREATE POLICY opportunity_score_component_scope_policy ON opportunity_score_component
            USING (EXISTS (
                SELECT 1 FROM opportunity o JOIN opportunity_board ob USING (opportunity_board_id)
                WHERE o.opportunity_id = opportunity_score_component.opportunity_id
                  AND ob.workspace_id = market_engine_current_workspace_id()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM opportunity o JOIN opportunity_board ob USING (opportunity_board_id)
                WHERE o.opportunity_id = opportunity_score_component.opportunity_id
                  AND ob.workspace_id = market_engine_current_workspace_id()
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'opportunity_content_version' AND policyname = 'opportunity_content_version_scope_policy') THEN
        CREATE POLICY opportunity_content_version_scope_policy ON opportunity_content_version
            USING (EXISTS (
                SELECT 1 FROM opportunity o JOIN opportunity_board ob USING (opportunity_board_id)
                WHERE o.opportunity_id = opportunity_content_version.opportunity_id
                  AND ob.workspace_id = market_engine_current_workspace_id()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM opportunity o JOIN opportunity_board ob USING (opportunity_board_id)
                WHERE o.opportunity_id = opportunity_content_version.opportunity_id
                  AND ob.workspace_id = market_engine_current_workspace_id()
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'opportunity_experiment' AND policyname = 'opportunity_experiment_scope_policy') THEN
        CREATE POLICY opportunity_experiment_scope_policy ON opportunity_experiment
            USING (EXISTS (
                SELECT 1 FROM opportunity o JOIN opportunity_board ob USING (opportunity_board_id)
                WHERE o.opportunity_id = opportunity_experiment.opportunity_id
                  AND ob.workspace_id = market_engine_current_workspace_id()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM opportunity o JOIN opportunity_board ob USING (opportunity_board_id)
                WHERE o.opportunity_id = opportunity_experiment.opportunity_id
                  AND ob.workspace_id = market_engine_current_workspace_id()
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'audit_event' AND policyname = 'audit_event_scope_policy') THEN
        CREATE POLICY audit_event_scope_policy ON audit_event
            USING (workspace_id IS NULL OR workspace_id = market_engine_current_workspace_id())
            WITH CHECK (workspace_id IS NULL OR workspace_id = market_engine_current_workspace_id());
    END IF;
END $$;

COMMIT;
