BEGIN;

-- Phase 2 is strictly additive.  Phase 1 tables and identifiers are not
-- altered, renamed, or deleted by this migration.

CREATE TABLE IF NOT EXISTS domain_registry (
    domain_id text PRIMARY KEY,
    domain_code text NOT NULL UNIQUE,
    name_ko text NOT NULL,
    description text NOT NULL,
    primary_entity_unit text NOT NULL CHECK (primary_entity_unit IN ('person','child_person','household','establishment','enterprise')),
    category_id bigint NOT NULL REFERENCES category(category_id),
    coverage_status text NOT NULL DEFAULT 'complete_with_evidence_constraints' CHECK (coverage_status IN ('complete','complete_with_evidence_constraints','incomplete')),
    active boolean NOT NULL DEFAULT true,
    minor_guardrail boolean NOT NULL DEFAULT false,
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

ALTER TABLE IF EXISTS domain_registry ADD COLUMN IF NOT EXISTS coverage_status text NOT NULL DEFAULT 'complete_with_evidence_constraints';

CREATE TABLE IF NOT EXISTS domain_dimension (
    dimension_id text PRIMARY KEY,
    domain_id text NOT NULL REFERENCES domain_registry(domain_id),
    axis_code text NOT NULL CHECK (axis_code IN ('object','format','occasion','location','frequency_intensity','discovery','acquisition_access','consumption_mode','device_channel_platform','payment_monetization','decision_unit','engagement_participation','motivation_job','barrier_risk_trust','loyalty_switching','spending_value')),
    applicability text NOT NULL CHECK (applicability IN ('applicable','not_applicable')),
    applicability_reason text NOT NULL,
    allowed_values jsonb NOT NULL,
    sort_order smallint NOT NULL CHECK (sort_order BETWEEN 1 AND 16),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (domain_id, axis_code),
    UNIQUE (domain_id, sort_order)
);

CREATE TABLE IF NOT EXISTS domain_feature (
    domain_feature_id text PRIMARY KEY,
    domain_id text NOT NULL REFERENCES domain_registry(domain_id),
    dimension_id text REFERENCES domain_dimension(dimension_id),
    feature_code text NOT NULL UNIQUE,
    label_ko text NOT NULL,
    data_type text NOT NULL CHECK (data_type IN ('boolean','integer','number','string','category','json')),
    allowed_values jsonb,
    observable_status text NOT NULL CHECK (observable_status IN ('directly_observed','observable_or_declared','official_prior','derived','inferred_hypothesis')),
    targetability_class text NOT NULL CHECK (targetability_class IN ('directly_targetable','proxy_targetable','contextual_only','first_party_data_required','creative_only','not_allowed')),
    queryable boolean NOT NULL DEFAULT true,
    sensitive_class text NOT NULL DEFAULT 'non_sensitive',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE TABLE IF NOT EXISTS domain_feature_source (
    domain_feature_id text NOT NULL REFERENCES domain_feature(domain_feature_id),
    release_id text NOT NULL REFERENCES source_release(release_id),
    evidence_role text NOT NULL CHECK (evidence_role IN ('official_prior','direct_observation','synthetic_hypothesis_support','derivation_input','validation_only')),
    locator text NOT NULL,
    claim_scope text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    PRIMARY KEY (domain_feature_id, release_id, evidence_role)
);

CREATE TABLE IF NOT EXISTS domain_behavior_template (
    behavior_template_id text PRIMARY KEY,
    domain_id text NOT NULL REFERENCES domain_registry(domain_id),
    behavior_code text NOT NULL UNIQUE,
    name_ko text NOT NULL,
    definition text NOT NULL,
    rule_json jsonb NOT NULL,
    targetability_class text NOT NULL CHECK (targetability_class IN ('directly_targetable','proxy_targetable','contextual_only','first_party_data_required','creative_only','not_allowed')),
    evidence_status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE TABLE IF NOT EXISTS domain_tag (
    tag_id text PRIMARY KEY,
    domain_id text NOT NULL REFERENCES domain_registry(domain_id),
    tag_code text NOT NULL UNIQUE,
    tag_type text NOT NULL CHECK (tag_type IN ('motivation','barrier','engagement','occasion')),
    name_ko text NOT NULL,
    overlap_allowed boolean NOT NULL DEFAULT true CHECK (overlap_allowed),
    additive boolean NOT NULL DEFAULT false CHECK (NOT additive),
    provenance text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE TABLE IF NOT EXISTS domain_profile_summary (
    domain_id text NOT NULL REFERENCES domain_registry(domain_id),
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    profile_json jsonb NOT NULL,
    evidence_boundary text NOT NULL,
    reference_period text NOT NULL,
    run_id uuid NOT NULL REFERENCES pipeline_run(run_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    PRIMARY KEY (domain_id, model_version_id)
);

CREATE TABLE IF NOT EXISTS domain_association (
    association_id text PRIMARY KEY,
    domain_id_a text NOT NULL REFERENCES domain_registry(domain_id),
    domain_id_b text NOT NULL REFERENCES domain_registry(domain_id),
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise','cross_unit')),
    weighted_support numeric,
    effective_sample_size numeric,
    prevalence_a numeric CHECK (prevalence_a BETWEEN 0 AND 1),
    prevalence_b numeric CHECK (prevalence_b BETWEEN 0 AND 1),
    joint_prevalence_low numeric CHECK (joint_prevalence_low BETWEEN 0 AND 1),
    joint_prevalence_base numeric CHECK (joint_prevalence_base BETWEEN 0 AND 1),
    joint_prevalence_high numeric CHECK (joint_prevalence_high BETWEEN 0 AND 1),
    lift numeric,
    method_code text NOT NULL,
    independence_assumed boolean NOT NULL DEFAULT false,
    caveat text NOT NULL,
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    run_id uuid NOT NULL REFERENCES pipeline_run(run_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (domain_id_a, domain_id_b, model_version_id),
    CHECK (domain_id_a < domain_id_b),
    CHECK (joint_prevalence_low IS NULL OR joint_prevalence_low <= joint_prevalence_base AND joint_prevalence_base <= joint_prevalence_high)
);

CREATE TABLE IF NOT EXISTS domain_coverage_audit (
    domain_id text NOT NULL REFERENCES domain_registry(domain_id),
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    dimensions_count integer NOT NULL CHECK (dimensions_count >= 0),
    queryable_features_count integer NOT NULL CHECK (queryable_features_count >= 0),
    behavior_templates_count integer NOT NULL CHECK (behavior_templates_count >= 0),
    tags_count integer NOT NULL CHECK (tags_count >= 0),
    archetypes_count integer NOT NULL CHECK (archetypes_count >= 0),
    allocated_parent_count integer NOT NULL CHECK (allocated_parent_count >= 0),
    acceptance_count integer NOT NULL CHECK (acceptance_count >= 0),
    coverage_score numeric NOT NULL CHECK (coverage_score BETWEEN 0 AND 1),
    confidence_grade text NOT NULL CHECK (confidence_grade IN ('A','B','C','D','E')),
    gaps_json jsonb NOT NULL,
    audited_at timestamptz NOT NULL,
    run_id uuid NOT NULL REFERENCES pipeline_run(run_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    PRIMARY KEY (domain_id, model_version_id)
);

CREATE TABLE IF NOT EXISTS archetype_hierarchy (
    hierarchy_id text PRIMARY KEY,
    domain_id text NOT NULL REFERENCES domain_registry(domain_id),
    hierarchy_level smallint NOT NULL CHECK (hierarchy_level BETWEEN 1 AND 3),
    node_type text NOT NULL CHECK (node_type IN ('market_segment','observable_subsegment','motivational_subtype')),
    parent_hierarchy_id text REFERENCES archetype_hierarchy(hierarchy_id),
    phase1_archetype_id text REFERENCES archetype(archetype_id),
    node_code text NOT NULL,
    name_ko text NOT NULL,
    definition text NOT NULL,
    rule_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (domain_id, node_code)
);

CREATE TABLE IF NOT EXISTS latent_dimension (
    latent_dimension_id text PRIMARY KEY,
    domain_id text NOT NULL REFERENCES domain_registry(domain_id),
    code text NOT NULL,
    name_ko text NOT NULL,
    interpretation text NOT NULL,
    feature_loadings jsonb NOT NULL,
    variance_explained numeric CHECK (variance_explained BETWEEN 0 AND 1),
    model_artifact_uri text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (domain_id, code, data_version)
);

CREATE TABLE IF NOT EXISTS segmentation_model (
    segmentation_model_id text PRIMARY KEY,
    domain_id text NOT NULL REFERENCES domain_registry(domain_id),
    algorithm text NOT NULL CHECK (algorithm IN ('minibatch_kmeans','gaussian_mixture','agglomerative','spectral','other')),
    feature_pipeline jsonb NOT NULL,
    sample_definition jsonb NOT NULL,
    sample_size integer NOT NULL CHECK (sample_size > 0),
    weighted_support numeric NOT NULL CHECK (weighted_support > 0),
    effective_sample_size numeric NOT NULL CHECK (effective_sample_size > 0),
    candidate_k jsonb NOT NULL,
    selected_k smallint NOT NULL CHECK (selected_k BETWEEN 3 AND 8),
    random_seeds jsonb NOT NULL,
    stability_metrics jsonb NOT NULL,
    selection_rationale text NOT NULL,
    artifact_uri text NOT NULL,
    artifact_sha256 text,
    membership_uri text,
    membership_sha256 text,
    status text NOT NULL CHECK (status IN ('candidate','selected','rejected','superseded')),
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    run_id uuid NOT NULL REFERENCES pipeline_run(run_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (domain_id, algorithm, model_version_id, status)
);

ALTER TABLE IF EXISTS segmentation_model ADD COLUMN IF NOT EXISTS artifact_sha256 text;
ALTER TABLE IF EXISTS segmentation_model ADD COLUMN IF NOT EXISTS membership_uri text;
ALTER TABLE IF EXISTS segmentation_model ADD COLUMN IF NOT EXISTS membership_sha256 text;

CREATE TABLE IF NOT EXISTS cluster_definition (
    cluster_id text PRIMARY KEY,
    segmentation_model_id text NOT NULL REFERENCES segmentation_model(segmentation_model_id),
    cluster_number smallint NOT NULL CHECK (cluster_number >= 0),
    post_hoc_label_ko text NOT NULL,
    label_evidence jsonb NOT NULL,
    weighted_prevalence numeric NOT NULL CHECK (weighted_prevalence BETWEEN 0 AND 1),
    effective_sample_size numeric NOT NULL CHECK (effective_sample_size > 0),
    hard_support integer NOT NULL CHECK (hard_support > 0),
    soft_support numeric NOT NULL CHECK (soft_support > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (segmentation_model_id, cluster_number)
);

CREATE TABLE IF NOT EXISTS cluster_representative (
    cluster_representative_id text PRIMARY KEY,
    cluster_id text NOT NULL REFERENCES cluster_definition(cluster_id),
    source_persona_key text NOT NULL,
    rank smallint NOT NULL CHECK (rank > 0),
    distance numeric NOT NULL CHECK (distance >= 0),
    representative_summary text NOT NULL,
    storage_uri text NOT NULL,
    privacy_disclosure text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (cluster_id, rank)
);

CREATE TABLE IF NOT EXISTS subtype_definition (
    subtype_id text PRIMARY KEY,
    domain_id text NOT NULL REFERENCES domain_registry(domain_id),
    cluster_id text NOT NULL REFERENCES cluster_definition(cluster_id),
    hierarchy_id text NOT NULL REFERENCES archetype_hierarchy(hierarchy_id),
    subtype_code text NOT NULL UNIQUE,
    name_ko text NOT NULL,
    definition text NOT NULL,
    is_primary boolean NOT NULL DEFAULT true,
    label_status text NOT NULL CHECK (label_status IN ('post_hoc_interpreted','validated','needs_review')),
    evidence_boundary text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE TABLE IF NOT EXISTS parent_decomposition_decision (
    phase1_archetype_id text PRIMARY KEY REFERENCES archetype(archetype_id),
    domain_id text REFERENCES domain_registry(domain_id),
    decision text NOT NULL CHECK (decision IN ('eligible','reuse_existing','insufficient_evidence','not_applicable')),
    rationale text NOT NULL,
    required_evidence text,
    reviewed_at timestamptz NOT NULL,
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    run_id uuid NOT NULL REFERENCES pipeline_run(run_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE TABLE IF NOT EXISTS phase2_parent_estimate (
    phase1_archetype_id text NOT NULL REFERENCES archetype(archetype_id),
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise')),
    status text NOT NULL CHECK (status IN ('estimated','exploratory_estimate','not_estimable')),
    count_low numeric,
    count_base numeric,
    count_high numeric,
    share_low numeric,
    share_base numeric,
    share_high numeric,
    denominator_definition text NOT NULL,
    formula text NOT NULL,
    method_code text NOT NULL,
    source_release_ids jsonb NOT NULL,
    confidence_grade text NOT NULL CHECK (confidence_grade IN ('A','B','C','D','E')),
    validation_gaps jsonb NOT NULL,
    run_id uuid NOT NULL REFERENCES pipeline_run(run_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    PRIMARY KEY (phase1_archetype_id, model_version_id),
    CHECK ((status = 'not_estimable' AND count_low IS NULL AND count_base IS NULL AND count_high IS NULL)
        OR (status <> 'not_estimable' AND count_low <= count_base AND count_base <= count_high)),
    CHECK (share_low IS NULL OR share_low <= share_base AND share_base <= share_high)
);

CREATE TABLE IF NOT EXISTS subtype_allocation (
    phase1_archetype_id text NOT NULL REFERENCES archetype(archetype_id),
    subtype_id text NOT NULL REFERENCES subtype_definition(subtype_id),
    share_low numeric NOT NULL CHECK (share_low BETWEEN 0 AND 1),
    share_base numeric NOT NULL CHECK (share_base BETWEEN 0 AND 1),
    share_high numeric NOT NULL CHECK (share_high BETWEEN 0 AND 1),
    count_low numeric NOT NULL CHECK (count_low >= 0),
    count_base numeric NOT NULL CHECK (count_base >= 0),
    count_high numeric NOT NULL CHECK (count_high >= 0),
    denominator_count_base numeric NOT NULL CHECK (denominator_count_base > 0),
    allocation_formula text NOT NULL,
    conditional_method text NOT NULL,
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    run_id uuid NOT NULL REFERENCES pipeline_run(run_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    PRIMARY KEY (phase1_archetype_id, subtype_id, model_version_id),
    CHECK (share_low <= share_base AND share_base <= share_high),
    CHECK (count_low <= count_base AND count_base <= count_high)
);

CREATE TABLE IF NOT EXISTS required_parent_case (
    case_id text PRIMARY KEY,
    domain_id text NOT NULL REFERENCES domain_registry(domain_id),
    linked_phase1_archetype_id text REFERENCES archetype(archetype_id),
    name_ko text NOT NULL,
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise')),
    rule_json jsonb NOT NULL,
    count_low numeric NOT NULL CHECK (count_low >= 0),
    count_base numeric NOT NULL CHECK (count_base >= 0),
    count_high numeric NOT NULL CHECK (count_high >= 0),
    share_low numeric NOT NULL CHECK (share_low BETWEEN 0 AND 1),
    share_base numeric NOT NULL CHECK (share_base BETWEEN 0 AND 1),
    share_high numeric NOT NULL CHECK (share_high BETWEEN 0 AND 1),
    denominator_json jsonb NOT NULL,
    method_code text NOT NULL,
    formula text NOT NULL,
    source_release_ids jsonb NOT NULL,
    population_confidence_grade text NOT NULL CHECK (population_confidence_grade IN ('A','B','C','D','E')),
    assumptions_json jsonb NOT NULL,
    validation_gaps_json jsonb NOT NULL,
    conditioning_feature text NOT NULL,
    conditioning_value text NOT NULL,
    conditioning_hard_support integer NOT NULL CHECK (conditioning_hard_support > 0),
    conditioning_effective_sample_size numeric NOT NULL CHECK (conditioning_effective_sample_size > 0),
    required_tags_json jsonb NOT NULL,
    evidence_status text NOT NULL,
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    run_id uuid NOT NULL REFERENCES pipeline_run(run_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK (count_low <= count_base AND count_base <= count_high),
    CHECK (share_low <= share_base AND share_base <= share_high)
);

CREATE TABLE IF NOT EXISTS required_parent_case_allocation (
    case_id text NOT NULL REFERENCES required_parent_case(case_id),
    subtype_id text NOT NULL REFERENCES subtype_definition(subtype_id),
    share_low numeric NOT NULL CHECK (share_low BETWEEN 0 AND 1),
    share_base numeric NOT NULL CHECK (share_base BETWEEN 0 AND 1),
    share_high numeric NOT NULL CHECK (share_high BETWEEN 0 AND 1),
    count_low numeric NOT NULL CHECK (count_low >= 0),
    count_base numeric NOT NULL CHECK (count_base >= 0),
    count_high numeric NOT NULL CHECK (count_high >= 0),
    assignment_method text NOT NULL,
    formula text NOT NULL,
    interpretation_confidence_grade text NOT NULL CHECK (interpretation_confidence_grade IN ('A','B','C','D','E')),
    targetability_confidence_grade text NOT NULL CHECK (targetability_confidence_grade IN ('A','B','C','D','E')),
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    run_id uuid NOT NULL REFERENCES pipeline_run(run_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    PRIMARY KEY (case_id, subtype_id, model_version_id),
    CHECK (share_low <= share_base AND share_base <= share_high),
    CHECK (count_low <= count_base AND count_base <= count_high)
);

CREATE TABLE IF NOT EXISTS subtype_membership_summary (
    subtype_id text NOT NULL REFERENCES subtype_definition(subtype_id),
    segmentation_model_id text NOT NULL REFERENCES segmentation_model(segmentation_model_id),
    weighted_prevalence_low numeric NOT NULL CHECK (weighted_prevalence_low BETWEEN 0 AND 1),
    weighted_prevalence_base numeric NOT NULL CHECK (weighted_prevalence_base BETWEEN 0 AND 1),
    weighted_prevalence_high numeric NOT NULL CHECK (weighted_prevalence_high BETWEEN 0 AND 1),
    effective_sample_size numeric NOT NULL CHECK (effective_sample_size > 0),
    entropy numeric NOT NULL CHECK (entropy >= 0),
    stability_score numeric NOT NULL CHECK (stability_score BETWEEN 0 AND 1),
    hard_support integer NOT NULL CHECK (hard_support > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    PRIMARY KEY (subtype_id, segmentation_model_id),
    CHECK (weighted_prevalence_low <= weighted_prevalence_base AND weighted_prevalence_base <= weighted_prevalence_high)
);

CREATE TABLE IF NOT EXISTS subtype_profile (
    subtype_id text PRIMARY KEY REFERENCES subtype_definition(subtype_id),
    observed_evidence jsonb NOT NULL,
    assumptions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    inferred_profile jsonb NOT NULL,
    jobs_to_be_done jsonb NOT NULL,
    triggers jsonb NOT NULL,
    barriers jsonb NOT NULL,
    engagement_modes jsonb NOT NULL,
    creative_hypotheses jsonb NOT NULL,
    prohibited_inferences jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

ALTER TABLE IF EXISTS subtype_profile ADD COLUMN IF NOT EXISTS assumptions_json jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS subtype_confidence (
    subtype_id text PRIMARY KEY REFERENCES subtype_definition(subtype_id),
    population_confidence_score smallint NOT NULL DEFAULT 0 CHECK (population_confidence_score BETWEEN 0 AND 100),
    population_confidence_grade text NOT NULL DEFAULT 'E' CHECK (population_confidence_grade IN ('A','B','C','D','E')),
    interpretation_confidence_score smallint NOT NULL DEFAULT 0 CHECK (interpretation_confidence_score BETWEEN 0 AND 100),
    interpretation_confidence_grade text NOT NULL DEFAULT 'E' CHECK (interpretation_confidence_grade IN ('A','B','C','D','E')),
    targetability_confidence_score smallint NOT NULL DEFAULT 0 CHECK (targetability_confidence_score BETWEEN 0 AND 100),
    targetability_confidence_grade text NOT NULL DEFAULT 'E' CHECK (targetability_confidence_grade IN ('A','B','C','D','E')),
    source_quality_score smallint NOT NULL CHECK (source_quality_score BETWEEN 0 AND 25),
    sample_support_score smallint NOT NULL CHECK (sample_support_score BETWEEN 0 AND 20),
    stability_score smallint NOT NULL CHECK (stability_score BETWEEN 0 AND 20),
    directness_score smallint NOT NULL CHECK (directness_score BETWEEN 0 AND 20),
    validation_score smallint NOT NULL CHECK (validation_score BETWEEN 0 AND 15),
    total_score smallint NOT NULL CHECK (total_score BETWEEN 0 AND 100),
    grade text NOT NULL CHECK (grade IN ('A','B','C','D','E')),
    interval_method text NOT NULL,
    gaps_json jsonb NOT NULL,
    validation_plan jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK (total_score = source_quality_score + sample_support_score + stability_score + directness_score + validation_score)
);

ALTER TABLE IF EXISTS subtype_confidence ADD COLUMN IF NOT EXISTS population_confidence_score smallint NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS subtype_confidence ADD COLUMN IF NOT EXISTS population_confidence_grade text NOT NULL DEFAULT 'E';
ALTER TABLE IF EXISTS subtype_confidence ADD COLUMN IF NOT EXISTS interpretation_confidence_score smallint NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS subtype_confidence ADD COLUMN IF NOT EXISTS interpretation_confidence_grade text NOT NULL DEFAULT 'E';
ALTER TABLE IF EXISTS subtype_confidence ADD COLUMN IF NOT EXISTS targetability_confidence_score smallint NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS subtype_confidence ADD COLUMN IF NOT EXISTS targetability_confidence_grade text NOT NULL DEFAULT 'E';

CREATE TABLE IF NOT EXISTS subtype_tag_allocation (
    subtype_id text NOT NULL REFERENCES subtype_definition(subtype_id),
    tag_id text NOT NULL REFERENCES domain_tag(tag_id),
    prevalence_low numeric CHECK (prevalence_low BETWEEN 0 AND 1),
    prevalence_base numeric CHECK (prevalence_base BETWEEN 0 AND 1),
    prevalence_high numeric CHECK (prevalence_high BETWEEN 0 AND 1),
    method_code text NOT NULL,
    non_additive_warning text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    PRIMARY KEY (subtype_id, tag_id),
    CHECK (prevalence_low IS NULL OR prevalence_low <= prevalence_base AND prevalence_base <= prevalence_high)
);

CREATE TABLE IF NOT EXISTS activation_mapping (
    activation_mapping_id text PRIMARY KEY,
    subtype_id text NOT NULL REFERENCES subtype_definition(subtype_id),
    targetability_class text NOT NULL CHECK (targetability_class IN ('directly_targetable','proxy_targetable','contextual_only','first_party_data_required','creative_only','not_allowed')),
    platform_claim_status text NOT NULL CHECK (platform_claim_status IN ('verified','unverified_do_not_claim','not_applicable')),
    activation_payload jsonb NOT NULL,
    creative_brief jsonb NOT NULL,
    measurement_plan jsonb NOT NULL,
    exclusions jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (subtype_id, data_version)
);

CREATE TABLE IF NOT EXISTS segment_observation (
    observation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subtype_id text NOT NULL REFERENCES subtype_definition(subtype_id),
    observed_at timestamptz NOT NULL,
    observation_type text NOT NULL CHECK (observation_type IN ('impression','click','conversion','survey_classification','retention','other')),
    aggregate_count integer NOT NULL CHECK (aggregate_count > 0),
    outcome_count numeric NOT NULL CHECK (outcome_count >= 0 AND outcome_count <= aggregate_count),
    soft_membership_sum numeric CHECK (soft_membership_sum >= 0 AND soft_membership_sum <= aggregate_count),
    channel_context jsonb NOT NULL,
    sampling_context jsonb NOT NULL,
    consent_basis text NOT NULL,
    contains_personal_data boolean NOT NULL DEFAULT false CHECK (NOT contains_personal_data),
    bias_flags jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE TABLE IF NOT EXISTS posterior_update (
    posterior_update_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subtype_id text NOT NULL REFERENCES subtype_definition(subtype_id),
    observation_id uuid NOT NULL REFERENCES segment_observation(observation_id),
    prior_parameters jsonb NOT NULL,
    likelihood_specification jsonb NOT NULL,
    posterior_parameters jsonb NOT NULL,
    posterior_mean numeric NOT NULL CHECK (posterior_mean BETWEEN 0 AND 1),
    posterior_low numeric NOT NULL CHECK (posterior_low BETWEEN 0 AND 1),
    posterior_high numeric NOT NULL CHECK (posterior_high BETWEEN 0 AND 1),
    diagnostics jsonb NOT NULL,
    update_status text NOT NULL CHECK (update_status IN ('accepted','held_for_review','rejected')),
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    run_id uuid NOT NULL REFERENCES pipeline_run(run_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK (posterior_low <= posterior_mean AND posterior_mean <= posterior_high)
);

CREATE TABLE IF NOT EXISTS phase2_acceptance_result (
    case_id text PRIMARY KEY,
    case_type text NOT NULL CHECK (case_type IN ('domain','parent','cross_domain','activation','feedback')),
    domain_id text REFERENCES domain_registry(domain_id),
    phase1_archetype_id text REFERENCES archetype(archetype_id),
    description text NOT NULL,
    query_json jsonb NOT NULL,
    result_json jsonb NOT NULL,
    status text NOT NULL CHECK (status IN ('passed','safe_not_estimable','failed')),
    executed_at timestamptz NOT NULL,
    model_version_id uuid REFERENCES model_version(model_version_id),
    run_id uuid REFERENCES pipeline_run(run_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE INDEX IF NOT EXISTS domain_feature_domain_idx ON domain_feature(domain_id, queryable);
CREATE INDEX IF NOT EXISTS domain_feature_allowed_values_gin ON domain_feature USING gin(allowed_values);
CREATE INDEX IF NOT EXISTS domain_behavior_rule_gin ON domain_behavior_template USING gin(rule_json);
CREATE INDEX IF NOT EXISTS domain_tag_domain_idx ON domain_tag(domain_id, tag_type);
CREATE INDEX IF NOT EXISTS domain_association_pair_idx ON domain_association(domain_id_a, domain_id_b, model_version_id);
CREATE INDEX IF NOT EXISTS hierarchy_parent_idx ON archetype_hierarchy(parent_hierarchy_id, hierarchy_level);
CREATE INDEX IF NOT EXISTS segmentation_model_domain_idx ON segmentation_model(domain_id, status, model_version_id);
CREATE INDEX IF NOT EXISTS cluster_model_idx ON cluster_definition(segmentation_model_id, cluster_number);
CREATE INDEX IF NOT EXISTS subtype_domain_idx ON subtype_definition(domain_id, is_primary);
CREATE INDEX IF NOT EXISTS parent_decision_domain_idx ON parent_decomposition_decision(domain_id, decision);
CREATE INDEX IF NOT EXISTS phase2_parent_estimate_status_idx ON phase2_parent_estimate(status, entity_unit, model_version_id);
CREATE INDEX IF NOT EXISTS subtype_allocation_parent_idx ON subtype_allocation(phase1_archetype_id, model_version_id);
CREATE INDEX IF NOT EXISTS required_parent_case_domain_idx ON required_parent_case(domain_id, entity_unit, model_version_id);
CREATE INDEX IF NOT EXISTS required_parent_case_allocation_idx ON required_parent_case_allocation(case_id, model_version_id);
CREATE INDEX IF NOT EXISTS activation_subtype_idx ON activation_mapping(subtype_id, targetability_class);
CREATE INDEX IF NOT EXISTS observation_subtype_time_idx ON segment_observation(subtype_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS posterior_subtype_time_idx ON posterior_update(subtype_id, created_at DESC);
CREATE INDEX IF NOT EXISTS phase2_acceptance_type_idx ON phase2_acceptance_result(case_type, status, domain_id);

COMMIT;
