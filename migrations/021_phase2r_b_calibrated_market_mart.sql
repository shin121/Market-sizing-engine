BEGIN;

CREATE TABLE IF NOT EXISTS production.calibration_run (
    calibration_run_id text PRIMARY KEY,
    calibration_version text NOT NULL,
    target_unit text NOT NULL CHECK (target_unit IN ('person','household','establishment','enterprise')),
    universe_id text NOT NULL REFERENCES production.universe(universe_id),
    method_code text NOT NULL,
    random_seed bigint NOT NULL,
    convergence_tolerance numeric NOT NULL CHECK (convergence_tolerance > 0),
    max_iterations integer NOT NULL CHECK (max_iterations > 0),
    weight_floor numeric NOT NULL CHECK (weight_floor > 0),
    weight_cap numeric NOT NULL CHECK (weight_cap >= weight_floor),
    iterations integer NOT NULL CHECK (iterations >= 0),
    converged boolean NOT NULL,
    sample_size bigint NOT NULL CHECK (sample_size > 0),
    total_weight numeric NOT NULL CHECK (total_weight > 0),
    effective_sample_size numeric NOT NULL CHECK (effective_sample_size > 0),
    effective_sample_size_ratio numeric NOT NULL CHECK (effective_sample_size_ratio > 0 AND effective_sample_size_ratio <= 1),
    weight_min numeric NOT NULL CHECK (weight_min > 0),
    weight_mean numeric NOT NULL CHECK (weight_mean > 0),
    weight_max numeric NOT NULL CHECK (weight_max >= weight_min),
    weight_cv numeric NOT NULL CHECK (weight_cv >= 0),
    extreme_weight_share numeric NOT NULL CHECK (extreme_weight_share BETWEEN 0 AND 1),
    max_control_relative_error numeric NOT NULL CHECK (max_control_relative_error >= 0),
    artifact_uri text NOT NULL,
    artifact_checksum text NOT NULL CHECK (artifact_checksum ~ '^[0-9a-f]{64}$'),
    control_spec_json jsonb NOT NULL,
    diagnostics_json jsonb NOT NULL,
    status text NOT NULL CHECK (status IN ('passed','failed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production.calibration_field_mapping (
    mapping_id text PRIMARY KEY,
    calibration_version text NOT NULL,
    nemotron_field text NOT NULL,
    universe_dimension text NOT NULL,
    original_category text NOT NULL,
    standard_category text,
    mapping_rule text NOT NULL,
    mapping_confidence numeric NOT NULL CHECK (mapping_confidence BETWEEN 0 AND 1),
    coverage_rate numeric NOT NULL CHECK (coverage_rate BETWEEN 0 AND 1),
    unmapped_reason text,
    target_unit text NOT NULL CHECK (target_unit IN ('person','household','establishment','enterprise')),
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production.calibration_control_result (
    calibration_run_id text NOT NULL REFERENCES production.calibration_run(calibration_run_id) ON DELETE CASCADE,
    control_dimension text NOT NULL,
    category_json jsonb NOT NULL,
    target_count numeric NOT NULL CHECK (target_count >= 0),
    weighted_count numeric NOT NULL CHECK (weighted_count >= 0),
    absolute_error numeric NOT NULL CHECK (absolute_error >= 0),
    relative_error numeric NOT NULL CHECK (relative_error >= 0),
    sample_cell_count bigint NOT NULL CHECK (sample_cell_count >= 0),
    cell_coverage numeric NOT NULL CHECK (cell_coverage BETWEEN 0 AND 1),
    passed boolean NOT NULL,
    PRIMARY KEY (calibration_run_id, control_dimension, category_json)
);

CREATE TABLE IF NOT EXISTS production.allocation_model (
    allocation_model_id text PRIMARY KEY,
    subject_type text NOT NULL CHECK (subject_type IN ('domain','archetype','subtype','axis','feature','behavior','gold_query')),
    subject_id text NOT NULL,
    parent_subject_id text,
    allocation_semantics text NOT NULL CHECK (allocation_semantics IN (
        'exclusive_partition','overlapping_membership','hierarchical_conditional','continuous_score_band'
    )),
    production_eligible boolean GENERATED ALWAYS AS (allocation_semantics IS NOT NULL) STORED,
    method_code text NOT NULL,
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subject_type, subject_id)
);

CREATE TABLE IF NOT EXISTS production.domain_market_summary (
    domain_id text PRIMARY KEY REFERENCES public.domain_registry(domain_id),
    display_name_ko text NOT NULL CHECK (btrim(display_name_ko) <> ''),
    display_status_ko text NOT NULL CHECK (btrim(display_status_ko) <> ''),
    parent_universe_id text NOT NULL REFERENCES production.universe(universe_id),
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise')),
    participation_share_low numeric NOT NULL CHECK (participation_share_low BETWEEN 0 AND 1),
    participation_share_base numeric NOT NULL CHECK (participation_share_base BETWEEN 0 AND 1),
    participation_share_high numeric NOT NULL CHECK (participation_share_high BETWEEN 0 AND 1),
    count_low numeric NOT NULL CHECK (count_low >= 0),
    count_base numeric NOT NULL CHECK (count_base >= 0),
    count_high numeric NOT NULL CHECK (count_high >= 0),
    geography_scope text NOT NULL,
    reference_year integer NOT NULL CHECK (reference_year BETWEEN 1900 AND 2100),
    allocation_semantics text NOT NULL CHECK (allocation_semantics IN ('overlapping_membership','hierarchical_conditional')),
    estimate_grade text NOT NULL CHECK (estimate_grade IN ('A','B','C','D','E')),
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    source_release_ids jsonb NOT NULL,
    calibration_version text NOT NULL,
    method_code text NOT NULL,
    formula text NOT NULL,
    uncertainty_method text NOT NULL,
    random_seed bigint NOT NULL,
    status text NOT NULL CHECK (status IN ('estimated','bounded_estimate')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (participation_share_low <= participation_share_base AND participation_share_base <= participation_share_high),
    CHECK (count_low <= count_base AND count_base <= count_high)
);

CREATE TABLE IF NOT EXISTS production.archetype_market_summary (
    archetype_id text NOT NULL REFERENCES public.archetype(archetype_id),
    domain_context_id text NOT NULL,
    display_name_ko text NOT NULL CHECK (btrim(display_name_ko) <> ''),
    definition_ko text NOT NULL CHECK (btrim(definition_ko) <> ''),
    context_domains jsonb NOT NULL,
    estimated_share_low numeric NOT NULL CHECK (estimated_share_low BETWEEN 0 AND 1),
    estimated_share_base numeric NOT NULL CHECK (estimated_share_base BETWEEN 0 AND 1),
    estimated_share_high numeric NOT NULL CHECK (estimated_share_high BETWEEN 0 AND 1),
    estimated_count_low numeric NOT NULL CHECK (estimated_count_low >= 0),
    estimated_count_base numeric NOT NULL CHECK (estimated_count_base >= 0),
    estimated_count_high numeric NOT NULL CHECK (estimated_count_high >= 0),
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise')),
    reference_year integer NOT NULL CHECK (reference_year BETWEEN 1900 AND 2100),
    geography_scope text NOT NULL,
    calibration_version text NOT NULL,
    calibration_method text NOT NULL,
    effective_sample_size numeric NOT NULL CHECK (effective_sample_size > 0),
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    estimate_grade text NOT NULL CHECK (estimate_grade IN ('A','B','C','D','E')),
    supporting_sources jsonb NOT NULL,
    parent_population numeric NOT NULL CHECK (parent_population > 0),
    allocation_semantics text NOT NULL CHECK (allocation_semantics = 'overlapping_membership'),
    uncertainty_method text NOT NULL,
    random_seed bigint NOT NULL,
    status text NOT NULL CHECK (status = 'estimated'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (archetype_id, domain_context_id),
    CHECK (estimated_share_low <= estimated_share_base AND estimated_share_base <= estimated_share_high),
    CHECK (estimated_count_low <= estimated_count_base AND estimated_count_base <= estimated_count_high)
);

CREATE TABLE IF NOT EXISTS production.subtype_market_summary (
    subtype_id text PRIMARY KEY REFERENCES public.subtype_definition(subtype_id),
    domain_id text NOT NULL REFERENCES public.domain_registry(domain_id),
    display_name_ko text NOT NULL CHECK (btrim(display_name_ko) <> ''),
    definition_ko text NOT NULL CHECK (btrim(definition_ko) <> ''),
    parent_subject_id text NOT NULL,
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise')),
    share_low numeric NOT NULL CHECK (share_low BETWEEN 0 AND 1),
    share_base numeric NOT NULL CHECK (share_base BETWEEN 0 AND 1),
    share_high numeric NOT NULL CHECK (share_high BETWEEN 0 AND 1),
    count_low numeric NOT NULL CHECK (count_low >= 0),
    count_base numeric NOT NULL CHECK (count_base >= 0),
    count_high numeric NOT NULL CHECK (count_high >= 0),
    geography_scope text NOT NULL,
    reference_year integer NOT NULL CHECK (reference_year BETWEEN 1900 AND 2100),
    allocation_semantics text NOT NULL CHECK (allocation_semantics = 'exclusive_partition'),
    estimate_grade text NOT NULL CHECK (estimate_grade IN ('A','B','C','D','E')),
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    source_release_ids jsonb NOT NULL,
    related_archetypes jsonb NOT NULL,
    related_features jsonb NOT NULL,
    related_behaviors jsonb NOT NULL,
    activation_json jsonb NOT NULL,
    model_version text NOT NULL,
    uncertainty_method text NOT NULL,
    random_seed bigint NOT NULL,
    status text NOT NULL CHECK (status = 'estimated'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (share_low <= share_base AND share_base <= share_high),
    CHECK (count_low <= count_base AND count_base <= count_high)
);

CREATE TABLE IF NOT EXISTS production.axis_distribution (
    dimension_id text NOT NULL REFERENCES public.domain_dimension(dimension_id),
    value_code text NOT NULL,
    domain_id text NOT NULL REFERENCES public.domain_registry(domain_id),
    display_name_ko text NOT NULL CHECK (btrim(display_name_ko) <> ''),
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise')),
    parent_population numeric NOT NULL CHECK (parent_population > 0),
    share_low numeric NOT NULL CHECK (share_low BETWEEN 0 AND 1),
    share_base numeric NOT NULL CHECK (share_base BETWEEN 0 AND 1),
    share_high numeric NOT NULL CHECK (share_high BETWEEN 0 AND 1),
    count_low numeric NOT NULL CHECK (count_low >= 0),
    count_base numeric NOT NULL CHECK (count_base >= 0),
    count_high numeric NOT NULL CHECK (count_high >= 0),
    raw_score_mean numeric,
    allocation_semantics text NOT NULL CHECK (allocation_semantics IN ('exclusive_partition','overlapping_membership','continuous_score_band')),
    source_release_ids jsonb NOT NULL,
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    estimate_grade text NOT NULL CHECK (estimate_grade IN ('A','B','C','D','E')),
    reference_year integer NOT NULL CHECK (reference_year BETWEEN 1900 AND 2100),
    distribution_status text NOT NULL CHECK (distribution_status IN ('calibrated','proxy_calibrated')),
    calibration_version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (dimension_id, value_code),
    CHECK (share_low <= share_base AND share_base <= share_high),
    CHECK (count_low <= count_base AND count_base <= count_high)
);

CREATE TABLE IF NOT EXISTS production.feature_prevalence (
    domain_feature_id text PRIMARY KEY REFERENCES public.domain_feature(domain_feature_id),
    domain_id text NOT NULL REFERENCES public.domain_registry(domain_id),
    display_name_ko text NOT NULL CHECK (btrim(display_name_ko) <> ''),
    selected_value text NOT NULL,
    prevalence_low numeric NOT NULL CHECK (prevalence_low BETWEEN 0 AND 1),
    prevalence_base numeric NOT NULL CHECK (prevalence_base BETWEEN 0 AND 1),
    prevalence_high numeric NOT NULL CHECK (prevalence_high BETWEEN 0 AND 1),
    count_low numeric NOT NULL CHECK (count_low >= 0),
    count_base numeric NOT NULL CHECK (count_base >= 0),
    count_high numeric NOT NULL CHECK (count_high >= 0),
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise')),
    conditional_population numeric NOT NULL CHECK (conditional_population > 0),
    value_distribution jsonb NOT NULL,
    source_release_ids jsonb NOT NULL,
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    estimate_grade text NOT NULL CHECK (estimate_grade IN ('A','B','C','D','E')),
    domain_context text NOT NULL,
    coverage_status text NOT NULL CHECK (coverage_status IN ('calibrated_numeric','proxy_numeric')),
    allocation_semantics text NOT NULL CHECK (allocation_semantics = 'overlapping_membership'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (prevalence_low <= prevalence_base AND prevalence_base <= prevalence_high),
    CHECK (count_low <= count_base AND count_base <= count_high)
);

CREATE TABLE IF NOT EXISTS production.behavior_prevalence (
    behavior_template_id text PRIMARY KEY REFERENCES public.domain_behavior_template(behavior_template_id),
    domain_id text NOT NULL REFERENCES public.domain_registry(domain_id),
    display_name_ko text NOT NULL CHECK (btrim(display_name_ko) <> ''),
    prevalence_low numeric NOT NULL CHECK (prevalence_low BETWEEN 0 AND 1),
    prevalence_base numeric NOT NULL CHECK (prevalence_base BETWEEN 0 AND 1),
    prevalence_high numeric NOT NULL CHECK (prevalence_high BETWEEN 0 AND 1),
    frequency_per_month_low numeric NOT NULL CHECK (frequency_per_month_low >= 0),
    frequency_per_month_base numeric NOT NULL CHECK (frequency_per_month_base >= 0),
    frequency_per_month_high numeric NOT NULL CHECK (frequency_per_month_high >= 0),
    count_low numeric NOT NULL CHECK (count_low >= 0),
    count_base numeric NOT NULL CHECK (count_base >= 0),
    count_high numeric NOT NULL CHECK (count_high >= 0),
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise')),
    source_release_ids jsonb NOT NULL,
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    estimate_grade text NOT NULL CHECK (estimate_grade IN ('A','B','C','D','E')),
    domain_context text NOT NULL,
    coverage_status text NOT NULL CHECK (coverage_status IN ('calibrated_numeric','proxy_numeric')),
    allocation_semantics text NOT NULL CHECK (allocation_semantics = 'overlapping_membership'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (prevalence_low <= prevalence_base AND prevalence_base <= prevalence_high),
    CHECK (frequency_per_month_low <= frequency_per_month_base AND frequency_per_month_base <= frequency_per_month_high),
    CHECK (count_low <= count_base AND count_base <= count_high)
);

CREATE TABLE IF NOT EXISTS production.gold_query_result (
    query_id text PRIMARY KEY,
    display_name_ko text NOT NULL CHECK (btrim(display_name_ko) <> ''),
    structured_conditions jsonb NOT NULL,
    parent_universe_id text NOT NULL REFERENCES production.universe(universe_id),
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise')),
    share_low numeric NOT NULL CHECK (share_low BETWEEN 0 AND 1),
    share_base numeric NOT NULL CHECK (share_base BETWEEN 0 AND 1),
    share_high numeric NOT NULL CHECK (share_high BETWEEN 0 AND 1),
    count_low numeric NOT NULL CHECK (count_low >= 0),
    count_base numeric NOT NULL CHECK (count_base >= 0),
    count_high numeric NOT NULL CHECK (count_high >= 0),
    geography_scope text NOT NULL,
    reference_year integer NOT NULL CHECK (reference_year BETWEEN 1900 AND 2100),
    spend_json jsonb NOT NULL,
    tam_sam_som_basis jsonb NOT NULL,
    formula text NOT NULL,
    factors_json jsonb NOT NULL,
    source_release_ids jsonb NOT NULL,
    estimate_grade text NOT NULL CHECK (estimate_grade IN ('A','B','C','D','E')),
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    confidence_components jsonb NOT NULL,
    most_uncertain_variable text NOT NULL,
    validation_items jsonb NOT NULL,
    allocation_semantics text NOT NULL CHECK (allocation_semantics = 'hierarchical_conditional'),
    dependency_method text NOT NULL,
    uncertainty_method text NOT NULL,
    random_seed bigint NOT NULL,
    snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
    status text NOT NULL CHECK (status = 'estimated'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (share_low <= share_base AND share_base <= share_high),
    CHECK (count_low <= count_base AND count_base <= count_high)
);

CREATE TABLE IF NOT EXISTS production.estimate_factor_lineage (
    factor_id text PRIMARY KEY,
    subject_type text NOT NULL CHECK (subject_type IN ('domain','archetype','subtype','axis','feature','behavior','gold_query')),
    subject_id text NOT NULL,
    factor_order integer NOT NULL CHECK (factor_order > 0),
    parent_factor_id text REFERENCES production.estimate_factor_lineage(factor_id),
    factor_label text NOT NULL,
    value_low numeric NOT NULL,
    value_base numeric NOT NULL,
    value_high numeric NOT NULL,
    factor_unit text NOT NULL,
    formula text NOT NULL,
    source_release_id text REFERENCES public.source_release(release_id),
    citation_locator text,
    directness text NOT NULL CHECK (directness IN ('direct','derived','survey_applied','calibrated','proxy','bounded_inference')),
    dependency_assumption text,
    confidence_penalty numeric NOT NULL DEFAULT 0 CHECK (confidence_penalty BETWEEN 0 AND 100),
    validation_status text NOT NULL CHECK (validation_status IN ('validated','calibrated','proxy_pending','scenario_pending')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (value_low <= value_base AND value_base <= value_high),
    UNIQUE (subject_type, subject_id, factor_order)
);

CREATE TABLE IF NOT EXISTS production.confidence_breakdown (
    subject_type text NOT NULL CHECK (subject_type IN ('domain','archetype','subtype','axis','feature','behavior','gold_query')),
    subject_id text NOT NULL,
    source_quality numeric NOT NULL CHECK (source_quality BETWEEN 0 AND 100),
    recency numeric NOT NULL CHECK (recency BETWEEN 0 AND 100),
    definition_match numeric NOT NULL CHECK (definition_match BETWEEN 0 AND 100),
    geography_match numeric NOT NULL CHECK (geography_match BETWEEN 0 AND 100),
    direct_observation numeric NOT NULL CHECK (direct_observation BETWEEN 0 AND 100),
    calibration_fit numeric NOT NULL CHECK (calibration_fit BETWEEN 0 AND 100),
    mapping_coverage numeric NOT NULL CHECK (mapping_coverage BETWEEN 0 AND 100),
    effective_sample_size_score numeric NOT NULL CHECK (effective_sample_size_score BETWEEN 0 AND 100),
    dependency_risk_score numeric NOT NULL CHECK (dependency_risk_score BETWEEN 0 AND 100),
    proxy_retention_score numeric NOT NULL CHECK (proxy_retention_score BETWEEN 0 AND 100),
    model_stability numeric NOT NULL CHECK (model_stability BETWEEN 0 AND 100),
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    estimate_grade text NOT NULL CHECK (estimate_grade IN ('A','B','C','D','E')),
    formula_version text NOT NULL,
    PRIMARY KEY (subject_type, subject_id)
);

CREATE TABLE IF NOT EXISTS production.geography_distribution (
    subject_type text NOT NULL CHECK (subject_type IN ('domain','archetype','subtype','gold_query')),
    subject_id text NOT NULL,
    geography_code text NOT NULL,
    display_name_ko text NOT NULL,
    share_low numeric NOT NULL CHECK (share_low BETWEEN 0 AND 1),
    share_base numeric NOT NULL CHECK (share_base BETWEEN 0 AND 1),
    share_high numeric NOT NULL CHECK (share_high BETWEEN 0 AND 1),
    count_low numeric NOT NULL CHECK (count_low >= 0),
    count_base numeric NOT NULL CHECK (count_base >= 0),
    count_high numeric NOT NULL CHECK (count_high >= 0),
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise')),
    reference_year integer NOT NULL CHECK (reference_year BETWEEN 1900 AND 2100),
    source_release_ids jsonb NOT NULL,
    PRIMARY KEY (subject_type, subject_id, geography_code),
    CHECK (share_low <= share_base AND share_base <= share_high),
    CHECK (count_low <= count_base AND count_base <= count_high)
);

CREATE TABLE IF NOT EXISTS production.trend_spend_summary (
    subject_type text NOT NULL CHECK (subject_type IN ('domain','gold_query')),
    subject_id text NOT NULL,
    metric_code text NOT NULL,
    display_name_ko text NOT NULL,
    reference_year integer NOT NULL CHECK (reference_year BETWEEN 1900 AND 2100),
    value_low numeric NOT NULL,
    value_base numeric NOT NULL,
    value_high numeric NOT NULL,
    metric_unit text NOT NULL,
    method_code text NOT NULL,
    source_release_ids jsonb NOT NULL,
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    PRIMARY KEY (subject_type, subject_id, metric_code, reference_year),
    CHECK (value_low <= value_base AND value_base <= value_high)
);

CREATE INDEX IF NOT EXISTS phase2r_b_archetype_context_idx
    ON production.archetype_market_summary(domain_context_id, entity_unit, estimated_count_base DESC);
CREATE INDEX IF NOT EXISTS phase2r_b_subtype_domain_idx
    ON production.subtype_market_summary(domain_id, count_base DESC);
CREATE INDEX IF NOT EXISTS phase2r_b_axis_domain_idx
    ON production.axis_distribution(domain_id, dimension_id);
CREATE INDEX IF NOT EXISTS phase2r_b_factor_subject_idx
    ON production.estimate_factor_lineage(subject_type, subject_id, factor_order);

CREATE OR REPLACE VIEW production.v_domain_market_summary WITH (security_invoker=true) AS
SELECT market.*, domain.domain_code
FROM production.domain_market_summary market
JOIN public.domain_registry domain USING (domain_id);

CREATE OR REPLACE VIEW production.v_axis_distribution WITH (security_invoker=true) AS
SELECT axis.*, domain.domain_code, dimension.axis_code
FROM production.axis_distribution axis
JOIN public.domain_registry domain USING (domain_id)
JOIN public.domain_dimension dimension USING (dimension_id);

CREATE OR REPLACE VIEW production.v_subtype_market_summary WITH (security_invoker=true) AS
SELECT subtype.*, domain.domain_code
FROM production.subtype_market_summary subtype
JOIN public.domain_registry domain USING (domain_id);

CREATE OR REPLACE VIEW production.v_archetype_market_summary WITH (security_invoker=true) AS
SELECT * FROM production.archetype_market_summary;

CREATE OR REPLACE VIEW production.v_feature_prevalence WITH (security_invoker=true) AS
SELECT feature.*, domain.domain_code
FROM production.feature_prevalence feature
JOIN public.domain_registry domain USING (domain_id);

CREATE OR REPLACE VIEW production.v_behavior_prevalence WITH (security_invoker=true) AS
SELECT behavior.*, domain.domain_code
FROM production.behavior_prevalence behavior
JOIN public.domain_registry domain USING (domain_id);

CREATE OR REPLACE VIEW production.v_gold_query_result WITH (security_invoker=true) AS
SELECT * FROM production.gold_query_result;

CREATE OR REPLACE VIEW production.v_estimate_factor_lineage WITH (security_invoker=true) AS
SELECT * FROM production.estimate_factor_lineage;

CREATE OR REPLACE VIEW production.v_source_coverage WITH (security_invoker=true) AS
SELECT
    lineage.source_release_id,
    source.publisher,
    source.dataset_title,
    count(*) AS factor_count,
    count(DISTINCT lineage.subject_type || ':' || lineage.subject_id) AS subject_count,
    count(*) FILTER (WHERE lineage.directness IN ('direct','survey_applied')) AS direct_factor_count,
    count(*) FILTER (WHERE lineage.directness IN ('proxy','bounded_inference')) AS proxy_factor_count
FROM production.estimate_factor_lineage lineage
LEFT JOIN public.source_release release ON release.release_id=lineage.source_release_id
LEFT JOIN public.data_source source USING (source_id)
GROUP BY lineage.source_release_id, source.publisher, source.dataset_title;

CREATE OR REPLACE VIEW production.v_confidence_breakdown WITH (security_invoker=true) AS
SELECT * FROM production.confidence_breakdown;

CREATE OR REPLACE VIEW production.v_geography_distribution WITH (security_invoker=true) AS
SELECT * FROM production.geography_distribution;

CREATE OR REPLACE VIEW production.v_trend_spend_summary WITH (security_invoker=true) AS
SELECT * FROM production.trend_spend_summary;

CREATE OR REPLACE VIEW production.v_primary_explorer WITH (security_invoker=true) AS
SELECT 'domain'::text AS subject_type, domain_id AS subject_id, display_name_ko,
       entity_unit, count_low, count_base, count_high, estimate_grade,
       confidence_score, status, display_status_ko
FROM production.domain_market_summary
UNION ALL
SELECT 'subtype', subtype_id, display_name_ko, entity_unit, count_low, count_base,
       count_high, estimate_grade, confidence_score, status, '시장규모 추정 완료'
FROM production.subtype_market_summary;

GRANT SELECT ON ALL TABLES IN SCHEMA production TO market_engine_app, market_engine_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON ALL TABLES IN SCHEMA production FROM market_engine_app, market_engine_worker;

COMMENT ON TABLE production.calibration_run IS
    'Phase 2R-B unit-specific calibration diagnostics. One person row never represents a household or business unit.';
COMMENT ON TABLE production.archetype_market_summary IS
    'Context-separated, overlapping archetype estimates. Counts cannot be summed across archetypes or domain contexts.';
COMMENT ON VIEW production.v_primary_explorer IS
    'Production primary market explorer contract; Phase 2R-B permits only numeric estimated rows.';

COMMIT;
