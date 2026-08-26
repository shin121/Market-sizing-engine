BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE model_version (
    model_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version text NOT NULL UNIQUE,
    methodology_hash text NOT NULL,
    source_manifest_hash text NOT NULL,
    parameter_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    random_seed bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid
);

CREATE TABLE pipeline_run (
    run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_name text NOT NULL,
    git_commit text,
    started_at timestamptz NOT NULL,
    finished_at timestamptz,
    status text NOT NULL CHECK (status IN ('running','success','failed','cancelled')),
    input_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
    row_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
    quality_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_log_uri text,
    model_version_id uuid REFERENCES model_version(model_version_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

ALTER TABLE model_version
    ADD CONSTRAINT model_version_created_by_run_fk
    FOREIGN KEY (created_by_run_id) REFERENCES pipeline_run(run_id);

CREATE TABLE data_source (
    source_id text PRIMARY KEY,
    publisher text NOT NULL,
    dataset_title text NOT NULL,
    official_url text NOT NULL,
    license text,
    source_tier smallint NOT NULL CHECK (source_tier BETWEEN 1 AND 3),
    source_type text NOT NULL,
    population_universe text NOT NULL,
    entity_unit text NOT NULL,
    geographic_coverage text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE TABLE source_release (
    release_id text PRIMARY KEY,
    source_id text NOT NULL REFERENCES data_source(source_id),
    version_label text NOT NULL,
    reference_period_start date,
    reference_period_end date,
    publication_date date,
    retrieved_at timestamptz NOT NULL,
    local_uri text,
    file_format text,
    checksum text,
    citation_text text,
    status text NOT NULL CHECK (status IN ('registered','metadata_downloaded','downloaded','verified','superseded','blocked')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (source_id, version_label)
);

CREATE TABLE geography (
    geography_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL,
    name_ko text NOT NULL,
    level text NOT NULL CHECK (level IN ('country','province','district','town')),
    parent_id bigint REFERENCES geography(geography_id),
    valid_from date NOT NULL,
    valid_to date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (code, valid_from),
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE time_period (
    period_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    period_type text NOT NULL CHECK (period_type IN ('point','month','quarter','year','range')),
    start_date date NOT NULL,
    end_date date NOT NULL,
    label text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (period_type, start_date, end_date),
    CHECK (end_date >= start_date)
);

CREATE TABLE feature_definition (
    feature_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    feature_code text NOT NULL UNIQUE,
    label_ko text NOT NULL,
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise','all')),
    data_type text NOT NULL CHECK (data_type IN ('boolean','integer','number','string','date','category','json')),
    allowed_values jsonb,
    sensitive_class text NOT NULL,
    queryable boolean NOT NULL DEFAULT false,
    definition text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE TABLE source_variable (
    variable_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    release_id text NOT NULL REFERENCES source_release(release_id),
    source_name text NOT NULL,
    canonical_feature_id bigint REFERENCES feature_definition(feature_id),
    label text NOT NULL,
    unit text,
    universe text NOT NULL,
    valid_values jsonb,
    missing_codes jsonb,
    transform_expression text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (release_id, source_name)
);

CREATE TABLE evidence (
    evidence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    release_id text NOT NULL REFERENCES source_release(release_id),
    locator text NOT NULL,
    supported_claim text NOT NULL,
    value numeric,
    unit text,
    denominator text,
    extraction_method text NOT NULL,
    reviewer_status text NOT NULL CHECK (reviewer_status IN ('unreviewed','machine_checked','human_reviewed','rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE TABLE category (
    category_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name_ko text NOT NULL,
    description text NOT NULL,
    entity_units jsonb NOT NULL,
    sort_order integer NOT NULL,
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE TABLE population_cell (
    population_cell_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    geography_id bigint NOT NULL REFERENCES geography(geography_id),
    period_id bigint NOT NULL REFERENCES time_period(period_id),
    age smallint,
    age_band text,
    sex text,
    marital_status text,
    education_level text,
    occupation_code text,
    household_role text,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    person_count_low numeric NOT NULL,
    person_count_base numeric NOT NULL,
    person_count_high numeric NOT NULL,
    calibration_weight numeric NOT NULL DEFAULT 1,
    method_code text NOT NULL,
    source_release_ids text[] NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK (age IS NULL OR age >= 0),
    CHECK (person_count_low <= person_count_base AND person_count_base <= person_count_high)
);

CREATE TABLE minor_population_cell (
    minor_cell_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    geography_id bigint NOT NULL REFERENCES geography(geography_id),
    period_id bigint NOT NULL REFERENCES time_period(period_id),
    exact_age smallint NOT NULL CHECK (exact_age BETWEEN 0 AND 18),
    school_stage text,
    household_type text,
    guardian_structure text,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    child_count_low numeric NOT NULL,
    child_count_base numeric NOT NULL,
    child_count_high numeric NOT NULL,
    method_code text NOT NULL,
    source_release_ids text[] NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK (child_count_low <= child_count_base AND child_count_base <= child_count_high)
);

CREATE TABLE household_cell (
    household_cell_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    geography_id bigint NOT NULL REFERENCES geography(geography_id),
    period_id bigint NOT NULL REFERENCES time_period(period_id),
    household_size smallint,
    household_type text,
    children_age_structure text,
    income_band text,
    housing_tenure text,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    household_count_low numeric NOT NULL,
    household_count_base numeric NOT NULL,
    household_count_high numeric NOT NULL,
    method_code text NOT NULL,
    source_release_ids text[] NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK (household_size IS NULL OR household_size > 0),
    CHECK (household_count_low <= household_count_base AND household_count_base <= household_count_high)
);

CREATE TABLE business_cell (
    business_cell_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    geography_id bigint NOT NULL REFERENCES geography(geography_id),
    period_id bigint NOT NULL REFERENCES time_period(period_id),
    industry_code text NOT NULL,
    legal_form text,
    employee_band text,
    sales_band text,
    establishment_or_enterprise text NOT NULL CHECK (establishment_or_enterprise IN ('establishment','enterprise')),
    owner_age_band text,
    digital_presence_features jsonb NOT NULL DEFAULT '{}'::jsonb,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    entity_count_low numeric NOT NULL,
    entity_count_base numeric NOT NULL,
    entity_count_high numeric NOT NULL,
    method_code text NOT NULL,
    source_release_ids text[] NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK (entity_count_low <= entity_count_base AND entity_count_base <= entity_count_high)
);

CREATE TABLE synthetic_household_link (
    link_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    synthetic_household_key text NOT NULL,
    synthetic_person_key text,
    synthetic_minor_key text,
    member_role text NOT NULL,
    relationship_probability numeric NOT NULL CHECK (relationship_probability BETWEEN 0 AND 1),
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    storage_uri text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK ((synthetic_person_key IS NOT NULL)::int + (synthetic_minor_key IS NOT NULL)::int = 1)
);

CREATE TABLE archetype (
    archetype_id text PRIMARY KEY,
    category_id bigint NOT NULL REFERENCES category(category_id),
    name_ko text NOT NULL,
    name_en text,
    one_line_definition text NOT NULL,
    primary_entity_unit text NOT NULL CHECK (primary_entity_unit IN ('person','child_person','household','establishment','enterprise')),
    age_min smallint,
    age_max smallint,
    status text NOT NULL CHECK (status IN ('estimated','not_estimable','deprecated','draft')),
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK (age_min IS NULL OR age_min >= 0),
    CHECK (age_max IS NULL OR age_max >= age_min)
);

CREATE TABLE archetype_rule (
    archetype_rule_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    archetype_id text NOT NULL REFERENCES archetype(archetype_id),
    rule_json jsonb NOT NULL,
    rule_hash text NOT NULL,
    rule_version text NOT NULL,
    deterministic_or_probabilistic text NOT NULL CHECK (deterministic_or_probabilistic IN ('deterministic','probabilistic','mixed')),
    required_features jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (archetype_id, rule_version),
    UNIQUE (rule_hash, rule_version)
);

CREATE TABLE archetype_profile (
    archetype_id text PRIMARY KEY REFERENCES archetype(archetype_id),
    observable_traits jsonb NOT NULL,
    inferred_needs jsonb NOT NULL,
    triggers jsonb NOT NULL,
    objections jsonb NOT NULL,
    channels jsonb NOT NULL,
    inference_disclosure text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE TABLE archetype_representative (
    representative_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    archetype_id text NOT NULL REFERENCES archetype(archetype_id),
    source_kind text NOT NULL CHECK (source_kind IN ('nemotron','synthetic_minor','synthetic_household','synthetic_business')),
    source_persona_key text NOT NULL,
    rank smallint NOT NULL CHECK (rank > 0),
    distance_or_similarity numeric,
    representative_summary text,
    storage_uri text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (archetype_id, source_kind, rank)
);

CREATE TABLE estimate (
    estimate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type text NOT NULL CHECK (subject_type IN ('archetype','query','control','scenario')),
    subject_id text NOT NULL,
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise')),
    geography_id bigint NOT NULL REFERENCES geography(geography_id),
    period_id bigint NOT NULL REFERENCES time_period(period_id),
    denominator_definition text NOT NULL,
    count_low numeric,
    count_base numeric,
    count_high numeric,
    share_low numeric,
    share_base numeric,
    share_high numeric,
    method_code text NOT NULL,
    formula text NOT NULL,
    precision_rule text NOT NULL,
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    run_id uuid NOT NULL REFERENCES pipeline_run(run_id),
    status text NOT NULL CHECK (status IN ('estimated','not_estimable','suppressed','superseded')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK ((status = 'not_estimable' AND count_low IS NULL AND count_base IS NULL AND count_high IS NULL)
        OR (status <> 'not_estimable' AND count_low <= count_base AND count_base <= count_high)),
    CHECK (share_low IS NULL OR (share_low <= share_base AND share_base <= share_high))
);

CREATE TABLE estimate_component (
    component_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estimate_id uuid NOT NULL REFERENCES estimate(estimate_id) ON DELETE CASCADE,
    component_type text NOT NULL,
    value_low numeric,
    value_base numeric,
    value_high numeric,
    unit text,
    evidence_id bigint REFERENCES evidence(evidence_id),
    operation text NOT NULL,
    sequence integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (estimate_id, sequence),
    CHECK (value_low IS NULL OR value_low <= value_base AND value_base <= value_high)
);

CREATE TABLE assumption (
    assumption_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE,
    statement text NOT NULL,
    value_low numeric,
    value_base numeric,
    value_high numeric,
    unit text,
    justification text NOT NULL,
    source_release_id text REFERENCES source_release(release_id),
    sensitivity_rank integer NOT NULL CHECK (sensitivity_rank > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK (value_low IS NULL OR value_low <= value_base AND value_base <= value_high)
);

CREATE TABLE estimate_assumption (
    estimate_id uuid NOT NULL REFERENCES estimate(estimate_id) ON DELETE CASCADE,
    assumption_id bigint NOT NULL REFERENCES assumption(assumption_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    PRIMARY KEY (estimate_id, assumption_id)
);

CREATE TABLE confidence_assessment (
    confidence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estimate_id uuid NOT NULL UNIQUE REFERENCES estimate(estimate_id) ON DELETE CASCADE,
    source_quality_score smallint NOT NULL CHECK (source_quality_score BETWEEN 0 AND 30),
    recency_score smallint NOT NULL CHECK (recency_score BETWEEN 0 AND 15),
    directness_score smallint NOT NULL CHECK (directness_score BETWEEN 0 AND 20),
    joint_observation_score smallint NOT NULL CHECK (joint_observation_score BETWEEN 0 AND 20),
    model_reliance_score smallint NOT NULL CHECK (model_reliance_score BETWEEN 0 AND 15),
    total_score smallint NOT NULL CHECK (total_score BETWEEN 0 AND 100),
    grade text NOT NULL CHECK (grade IN ('A','B','C','D','E')),
    rationale text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK (total_score = source_quality_score + recency_score + directness_score + joint_observation_score + model_reliance_score)
);

CREATE TABLE validation_gap (
    validation_gap_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estimate_id uuid REFERENCES estimate(estimate_id) ON DELETE CASCADE,
    archetype_id text REFERENCES archetype(archetype_id) ON DELETE CASCADE,
    gap_type text NOT NULL CHECK (gap_type IN ('missing_joint_distribution','outdated_reference_period','weak_proxy','unknown_unit_conversion','geographic_granularity_gap','small_sample','business_web_presence_unobserved','owner_attribute_unobserved','purchase_intent_unobserved','spend_per_entity_unobserved','overlap_unknown','other')),
    description text NOT NULL,
    impact text NOT NULL CHECK (impact IN ('low','medium','high','critical')),
    verification_question text NOT NULL,
    recommended_source text NOT NULL,
    expected_improvement text,
    priority smallint NOT NULL CHECK (priority BETWEEN 1 AND 5),
    status text NOT NULL CHECK (status IN ('open','in_progress','resolved','accepted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK ((estimate_id IS NOT NULL)::int + (archetype_id IS NOT NULL)::int >= 1)
);

CREATE TABLE archetype_overlap (
    archetype_id_a text NOT NULL REFERENCES archetype(archetype_id),
    archetype_id_b text NOT NULL REFERENCES archetype(archetype_id),
    overlap_rate_low numeric CHECK (overlap_rate_low BETWEEN 0 AND 1),
    overlap_rate_base numeric CHECK (overlap_rate_base BETWEEN 0 AND 1),
    overlap_rate_high numeric CHECK (overlap_rate_high BETWEEN 0 AND 1),
    method_code text NOT NULL,
    mutual_exclusion boolean NOT NULL DEFAULT false,
    run_id uuid NOT NULL REFERENCES pipeline_run(run_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    PRIMARY KEY (archetype_id_a, archetype_id_b, run_id),
    CHECK (archetype_id_a < archetype_id_b),
    CHECK (overlap_rate_low IS NULL OR overlap_rate_low <= overlap_rate_base AND overlap_rate_base <= overlap_rate_high)
);

CREATE TABLE segment_query (
    query_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    filter_json jsonb NOT NULL,
    primary_entity_unit text NOT NULL CHECK (primary_entity_unit IN ('person','child_person','household','establishment','enterprise')),
    geography_scope jsonb NOT NULL,
    as_of_date date,
    query_hash text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE TABLE segment_query_result (
    result_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id uuid NOT NULL REFERENCES segment_query(query_id),
    estimate_id uuid NOT NULL REFERENCES estimate(estimate_id),
    model_version_id uuid NOT NULL REFERENCES model_version(model_version_id),
    executed_at timestamptz NOT NULL,
    result_summary jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id)
);

CREATE TABLE market_scenario (
    scenario_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    query_id uuid NOT NULL REFERENCES segment_query(query_id),
    product_definition text NOT NULL,
    market_unit text NOT NULL CHECK (market_unit IN ('person','child_person','household','establishment','enterprise')),
    currency char(3) NOT NULL,
    horizon_months integer NOT NULL CHECK (horizon_months > 0),
    assumptions jsonb NOT NULL,
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    UNIQUE (name, version)
);

CREATE TABLE market_estimate (
    market_estimate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id uuid NOT NULL REFERENCES market_scenario(scenario_id),
    tam_entities_low numeric NOT NULL,
    tam_entities_base numeric NOT NULL,
    tam_entities_high numeric NOT NULL,
    sam_entities_low numeric NOT NULL,
    sam_entities_base numeric NOT NULL,
    sam_entities_high numeric NOT NULL,
    som_entities_low numeric NOT NULL,
    som_entities_base numeric NOT NULL,
    som_entities_high numeric NOT NULL,
    tam_revenue_low numeric NOT NULL,
    tam_revenue_base numeric NOT NULL,
    tam_revenue_high numeric NOT NULL,
    sam_revenue_low numeric NOT NULL,
    sam_revenue_base numeric NOT NULL,
    sam_revenue_high numeric NOT NULL,
    som_revenue_low numeric NOT NULL,
    som_revenue_base numeric NOT NULL,
    som_revenue_high numeric NOT NULL,
    formula text NOT NULL,
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    run_id uuid NOT NULL REFERENCES pipeline_run(run_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data_version text NOT NULL,
    created_by_run_id uuid REFERENCES pipeline_run(run_id),
    CHECK (tam_entities_low <= tam_entities_base AND tam_entities_base <= tam_entities_high),
    CHECK (sam_entities_low <= sam_entities_base AND sam_entities_base <= sam_entities_high),
    CHECK (som_entities_low <= som_entities_base AND som_entities_base <= som_entities_high),
    CHECK (tam_revenue_low <= tam_revenue_base AND tam_revenue_base <= tam_revenue_high),
    CHECK (sam_revenue_low <= sam_revenue_base AND sam_revenue_base <= sam_revenue_high),
    CHECK (som_revenue_low <= som_revenue_base AND som_revenue_base <= som_revenue_high)
);

CREATE INDEX source_release_source_idx ON source_release(source_id, reference_period_end DESC);
CREATE INDEX geography_parent_idx ON geography(parent_id);
CREATE INDEX population_cell_core_idx ON population_cell(model_version_id, geography_id, period_id, age_band);
CREATE INDEX population_cell_attributes_gin ON population_cell USING gin(attributes);
CREATE INDEX minor_cell_core_idx ON minor_population_cell(model_version_id, geography_id, period_id, exact_age);
CREATE INDEX household_cell_core_idx ON household_cell(model_version_id, geography_id, period_id, household_type);
CREATE INDEX household_cell_attributes_gin ON household_cell USING gin(attributes);
CREATE INDEX business_cell_core_idx ON business_cell(model_version_id, geography_id, period_id, establishment_or_enterprise, industry_code);
CREATE INDEX business_cell_digital_gin ON business_cell USING gin(digital_presence_features);
CREATE INDEX archetype_category_idx ON archetype(category_id, primary_entity_unit, status);
CREATE INDEX archetype_rule_gin ON archetype_rule USING gin(rule_json);
CREATE INDEX estimate_subject_idx ON estimate(subject_type, subject_id, entity_unit);
CREATE INDEX validation_gap_open_idx ON validation_gap(status, priority) WHERE status IN ('open','in_progress');
CREATE INDEX segment_query_filter_gin ON segment_query USING gin(filter_json);

COMMIT;
