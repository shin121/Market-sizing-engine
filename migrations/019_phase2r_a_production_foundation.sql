BEGIN;

CREATE SCHEMA IF NOT EXISTS production;
REVOKE CREATE ON SCHEMA production FROM PUBLIC;

CREATE TABLE IF NOT EXISTS production.universe (
    universe_id text PRIMARY KEY,
    universe_code text NOT NULL UNIQUE,
    display_name_ko text NOT NULL CHECK (btrim(display_name_ko) <> ''),
    display_name_en text NOT NULL CHECK (btrim(display_name_en) <> ''),
    description_ko text NOT NULL CHECK (btrim(description_ko) <> ''),
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise')),
    geography_id bigint NOT NULL REFERENCES public.geography(geography_id),
    period_id bigint NOT NULL REFERENCES public.time_period(period_id),
    denominator_definition text NOT NULL CHECK (btrim(denominator_definition) <> ''),
    source_release_id text NOT NULL REFERENCES public.source_release(release_id),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','superseded')),
    data_scope text NOT NULL DEFAULT 'production' CHECK (data_scope = 'production'),
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production.universe_dimension (
    universe_dimension_id text PRIMARY KEY,
    universe_id text NOT NULL REFERENCES production.universe(universe_id) ON DELETE CASCADE,
    dimension_code text NOT NULL,
    display_name_ko text NOT NULL CHECK (btrim(display_name_ko) <> ''),
    display_name_en text NOT NULL CHECK (btrim(display_name_en) <> ''),
    description_ko text NOT NULL CHECK (btrim(description_ko) <> ''),
    data_type text NOT NULL CHECK (data_type IN ('category','integer','number','boolean','json')),
    allowed_values jsonb,
    coverage_status text NOT NULL CHECK (coverage_status IN ('observed','partially_observed','schema_ready','proxy_only')),
    calibration_role text NOT NULL CHECK (calibration_role IN ('control_total','marginal','cross_tab','calibration_target','descriptive')),
    source_release_id text REFERENCES public.source_release(release_id),
    sort_order integer NOT NULL CHECK (sort_order > 0),
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (universe_id, dimension_code)
);

CREATE TABLE IF NOT EXISTS production.source_document (
    source_document_id text PRIMARY KEY,
    release_id text NOT NULL REFERENCES public.source_release(release_id),
    publisher text NOT NULL CHECK (btrim(publisher) <> ''),
    title text NOT NULL CHECK (btrim(title) <> ''),
    original_url text NOT NULL CHECK (original_url ~ '^https?://'),
    download_url text CHECK (download_url IS NULL OR download_url ~ '^https?://'),
    publication_date date,
    reference_year integer NOT NULL CHECK (reference_year BETWEEN 1900 AND 2100),
    accessed_at timestamptz NOT NULL,
    population_universe text NOT NULL CHECK (btrim(population_universe) <> ''),
    sample_size numeric CHECK (sample_size IS NULL OR sample_size > 0),
    geography_scope text NOT NULL,
    local_uri text,
    local_checksum text CHECK (local_checksum IS NULL OR local_checksum ~ '^[0-9a-f]{64}$'),
    license_text text,
    material_kind text NOT NULL CHECK (material_kind IN ('raw','processed','proxy','model_inference')),
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (release_id, version)
);

CREATE TABLE IF NOT EXISTS production.citation (
    citation_id text PRIMARY KEY,
    source_document_id text NOT NULL REFERENCES production.source_document(source_document_id) ON DELETE CASCADE,
    locator text NOT NULL CHECK (btrim(locator) <> ''),
    claim text NOT NULL CHECK (btrim(claim) <> ''),
    used_value numeric,
    unit text,
    extraction_method text NOT NULL,
    reviewer_status text NOT NULL CHECK (reviewer_status IN ('machine_checked','human_reviewed','needs_review')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production.universe_observation (
    observation_id text PRIMARY KEY,
    universe_id text NOT NULL REFERENCES production.universe(universe_id) ON DELETE CASCADE,
    universe_dimension_id text REFERENCES production.universe_dimension(universe_dimension_id),
    dimension_values jsonb NOT NULL DEFAULT '{}'::jsonb,
    value_type text NOT NULL CHECK (value_type IN ('count','share','rate','index')),
    denominator_observation_id text REFERENCES production.universe_observation(observation_id),
    value_low numeric NOT NULL,
    value_base numeric NOT NULL,
    value_high numeric NOT NULL,
    unit text NOT NULL CHECK (btrim(unit) <> ''),
    geography_id bigint NOT NULL REFERENCES public.geography(geography_id),
    period_id bigint NOT NULL REFERENCES public.time_period(period_id),
    reference_year integer NOT NULL CHECK (reference_year BETWEEN 1900 AND 2100),
    source_release_id text NOT NULL REFERENCES public.source_release(release_id),
    citation_id text REFERENCES production.citation(citation_id),
    directness text NOT NULL CHECK (directness IN ('direct','derived','survey_applied','proxy','bounded_inference')),
    estimate_grade text NOT NULL CHECK (estimate_grade IN ('A','B','C','D','E')),
    method_code text NOT NULL CHECK (btrim(method_code) <> ''),
    formula text NOT NULL CHECK (btrim(formula) <> ''),
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    assumptions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    validation_variables jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_direct_value boolean NOT NULL,
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (value_low <= value_base AND value_base <= value_high),
    CHECK (value_type <> 'share' OR (value_low >= 0 AND value_high <= 1)),
    CHECK (value_type = 'share' OR value_low >= 0)
);

CREATE TABLE IF NOT EXISTS production.domain_universe_mapping (
    domain_id text PRIMARY KEY REFERENCES public.domain_registry(domain_id),
    primary_universe_id text NOT NULL REFERENCES production.universe(universe_id),
    secondary_universe_id text REFERENCES production.universe(universe_id),
    baseline_observation_id text NOT NULL REFERENCES production.universe_observation(observation_id),
    display_name_ko text NOT NULL CHECK (btrim(display_name_ko) <> ''),
    display_name_en text NOT NULL CHECK (btrim(display_name_en) <> ''),
    description_ko text NOT NULL CHECK (btrim(description_ko) <> ''),
    primary_entity_unit text NOT NULL CHECK (primary_entity_unit IN ('person','child_person','household','establishment','enterprise')),
    inclusion_criteria text NOT NULL CHECK (btrim(inclusion_criteria) <> ''),
    exclusion_criteria text NOT NULL CHECK (btrim(exclusion_criteria) <> ''),
    overlap_note text NOT NULL CHECK (btrim(overlap_note) <> ''),
    geography_scope text NOT NULL,
    reference_year integer NOT NULL CHECK (reference_year BETWEEN 1900 AND 2100),
    count_low numeric NOT NULL CHECK (count_low >= 0),
    count_base numeric NOT NULL CHECK (count_base >= 0),
    count_high numeric NOT NULL CHECK (count_high >= 0),
    estimate_grade text NOT NULL CHECK (estimate_grade IN ('A','B','C','D','E')),
    confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    source_release_id text NOT NULL REFERENCES public.source_release(release_id),
    method_code text NOT NULL,
    formula text NOT NULL,
    additional_validation_variables jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','superseded')),
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (count_low <= count_base AND count_base <= count_high)
);

CREATE TABLE IF NOT EXISTS production.display_label (
    object_type text NOT NULL CHECK (object_type IN ('domain','axis','axis_value','segmentation_model','subtype','archetype','estimate','formula','factor','source','saved_segment','status')),
    object_id text NOT NULL,
    code text NOT NULL,
    display_name_ko text NOT NULL CHECK (btrim(display_name_ko) <> ''),
    display_name_en text NOT NULL CHECK (btrim(display_name_en) <> ''),
    description_ko text NOT NULL CHECK (btrim(description_ko) <> ''),
    status_label_ko text,
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (object_type, object_id)
);

CREATE TABLE IF NOT EXISTS production.saved_segment (
    saved_segment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (btrim(title) <> ''),
    description text NOT NULL CHECK (btrim(description) <> ''),
    entity_unit text NOT NULL CHECK (entity_unit IN ('person','child_person','household','establishment','enterprise')),
    query_json jsonb NOT NULL,
    status text NOT NULL CHECK (status IN ('draft','active','archived')),
    version_no integer NOT NULL DEFAULT 1 CHECK (version_no > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production.data_quality_issue (
    issue_id text PRIMARY KEY,
    object_type text NOT NULL,
    object_id text NOT NULL,
    issue_code text NOT NULL,
    severity text NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
    status text NOT NULL CHECK (status IN ('open','monitoring','resolved','accepted')),
    description text NOT NULL CHECK (btrim(description) <> ''),
    remediation text NOT NULL CHECK (btrim(remediation) <> ''),
    source_release_id text REFERENCES public.source_release(release_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (object_type, object_id, issue_code)
);

CREATE INDEX IF NOT EXISTS production_universe_entity_period_idx
    ON production.universe(entity_unit, period_id, status);
CREATE INDEX IF NOT EXISTS production_universe_dimension_code_idx
    ON production.universe_dimension(dimension_code, coverage_status);
CREATE INDEX IF NOT EXISTS production_universe_observation_lookup_idx
    ON production.universe_observation(universe_id, reference_year, value_type, estimate_grade);
CREATE INDEX IF NOT EXISTS production_universe_observation_dimensions_gin
    ON production.universe_observation USING gin(dimension_values);
CREATE INDEX IF NOT EXISTS production_domain_mapping_universe_idx
    ON production.domain_universe_mapping(primary_universe_id, status);
CREATE INDEX IF NOT EXISTS production_quality_status_idx
    ON production.data_quality_issue(status, severity, object_type);

CREATE OR REPLACE VIEW production.v_domain_summary
WITH (security_invoker = true) AS
SELECT
    domain.domain_id,
    domain.domain_code,
    mapping.display_name_ko,
    mapping.display_name_en,
    mapping.description_ko,
    mapping.primary_entity_unit,
    universe.universe_code,
    universe.display_name_ko AS universe_name_ko,
    mapping.geography_scope,
    mapping.reference_year,
    mapping.count_low,
    mapping.count_base,
    mapping.count_high,
    mapping.estimate_grade,
    mapping.confidence_score,
    mapping.method_code,
    mapping.formula,
    mapping.source_release_id,
    release.version_label AS source_version,
    source.publisher AS source_publisher,
    source.dataset_title AS source_title,
    mapping.inclusion_criteria,
    mapping.exclusion_criteria,
    mapping.overlap_note,
    mapping.additional_validation_variables,
    mapping.status,
    mapping.updated_at
FROM production.domain_universe_mapping mapping
JOIN public.domain_registry domain USING (domain_id)
JOIN production.universe universe ON universe.universe_id = mapping.primary_universe_id
JOIN public.source_release release ON release.release_id = mapping.source_release_id
JOIN public.data_source source ON source.source_id = release.source_id
WHERE mapping.status = 'active';

CREATE OR REPLACE VIEW production.v_axis_summary
WITH (security_invoker = true) AS
SELECT
    dimension.dimension_id,
    domain.domain_id,
    domain.domain_code,
    dimension.axis_code,
    coalesce(label.display_name_ko, dimension.axis_code) AS display_name_ko,
    coalesce(label.display_name_en, dimension.axis_code) AS display_name_en,
    coalesce(label.description_ko, dimension.applicability_reason) AS description_ko,
    dimension.applicability,
    dimension.sort_order,
    dimension.data_version,
    dimension.updated_at
FROM public.domain_dimension dimension
JOIN public.domain_registry domain USING (domain_id)
LEFT JOIN production.display_label label
  ON label.object_type = 'axis' AND label.object_id = dimension.dimension_id;

CREATE OR REPLACE VIEW production.v_subtype_summary
WITH (security_invoker = true) AS
SELECT
    subtype.subtype_id,
    subtype.subtype_code,
    subtype.domain_id,
    domain.domain_code,
    coalesce(label.display_name_ko, subtype.name_ko) AS display_name_ko,
    coalesce(label.display_name_en, subtype.subtype_code) AS display_name_en,
    coalesce(label.description_ko, subtype.definition) AS description_ko,
    subtype.is_primary,
    subtype.label_status,
    subtype.evidence_boundary,
    subtype.updated_at
FROM public.subtype_definition subtype
JOIN public.domain_registry domain USING (domain_id)
LEFT JOIN production.display_label label
  ON label.object_type = 'subtype' AND label.object_id = subtype.subtype_id;

CREATE OR REPLACE VIEW production.v_archetype_summary
WITH (security_invoker = true) AS
SELECT
    archetype.archetype_id,
    archetype.category_id,
    coalesce(label.display_name_ko, archetype.name_ko) AS display_name_ko,
    coalesce(label.display_name_en, archetype.name_en, archetype.archetype_id) AS display_name_en,
    coalesce(label.description_ko, archetype.one_line_definition) AS description_ko,
    archetype.primary_entity_unit,
    archetype.status,
    archetype.version,
    archetype.updated_at
FROM public.archetype archetype
LEFT JOIN production.display_label label
  ON label.object_type = 'archetype' AND label.object_id = archetype.archetype_id;

CREATE OR REPLACE VIEW production.v_estimate_summary
WITH (security_invoker = true) AS
SELECT
    ('domain-universe:' || summary.domain_id) AS estimate_id,
    summary.domain_id AS subject_id,
    'domain_universe'::text AS subject_type,
    summary.display_name_ko,
    summary.display_name_en,
    summary.description_ko,
    summary.primary_entity_unit AS entity_unit,
    summary.count_low,
    summary.count_base,
    summary.count_high,
    summary.reference_year,
    summary.geography_scope,
    summary.estimate_grade,
    summary.confidence_score,
    summary.method_code,
    summary.formula,
    summary.source_release_id,
    summary.source_publisher,
    summary.source_title,
    summary.status,
    summary.updated_at
FROM production.v_domain_summary summary;

CREATE OR REPLACE VIEW production.v_source_summary
WITH (security_invoker = true) AS
SELECT DISTINCT
    source.source_id,
    release.release_id,
    source.publisher,
    source.dataset_title,
    source.official_url,
    source.license,
    source.source_type,
    source.population_universe,
    source.entity_unit,
    source.geographic_coverage,
    release.version_label,
    release.reference_period_start,
    release.reference_period_end,
    release.publication_date,
    release.retrieved_at,
    release.local_uri,
    release.checksum,
    release.status
FROM public.data_source source
JOIN public.source_release release USING (source_id)
WHERE EXISTS (
    SELECT 1 FROM production.universe_observation observation
    WHERE observation.source_release_id = release.release_id
) OR EXISTS (
    SELECT 1 FROM production.domain_universe_mapping mapping
    WHERE mapping.source_release_id = release.release_id
);

CREATE OR REPLACE VIEW production.v_saved_segment
WITH (security_invoker = true) AS
SELECT * FROM production.saved_segment;

CREATE OR REPLACE VIEW production.v_data_quality_status
WITH (security_invoker = true) AS
SELECT
    issue.object_type,
    issue.object_id,
    issue.issue_code,
    issue.severity,
    issue.status,
    issue.description,
    issue.remediation,
    issue.source_release_id,
    issue.updated_at
FROM production.data_quality_issue issue;

GRANT USAGE ON SCHEMA production TO market_engine_app, market_engine_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA production TO market_engine_app, market_engine_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON ALL TABLES IN SCHEMA production FROM market_engine_app, market_engine_worker;

COMMENT ON SCHEMA production IS
    'Phase 2R-A production-scoped universe, source, domain mapping, and read models. Public-schema prototype/test records are excluded by construction.';
COMMENT ON VIEW production.v_saved_segment IS
    'Production-only saved segments. Existing public-schema E2E and integration fixtures cannot enter this view.';
COMMENT ON VIEW production.v_estimate_summary IS
    'Human-readable production estimates backed by canonical domain-universe observations.';

COMMIT;
