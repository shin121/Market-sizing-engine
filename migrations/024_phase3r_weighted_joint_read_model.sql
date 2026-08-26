BEGIN;

-- Runtime sizing must never scan the immutable million-row Persona artifact.
-- This additive mart stores only calibrated aggregate cells without synthetic
-- record identifiers and
-- a small condition registry that maps Builder choices to those cells.
CREATE TABLE IF NOT EXISTS production.calibration_dimension_catalog (
    catalog_id text PRIMARY KEY,
    target_unit text NOT NULL CHECK (target_unit IN ('person','household','establishment','enterprise')),
    dimension_code text NOT NULL,
    dimension_value text NOT NULL,
    display_value_ko text NOT NULL CHECK (btrim(display_value_ko) <> ''),
    definition_ko text NOT NULL CHECK (btrim(definition_ko) <> ''),
    selected_as_control boolean NOT NULL,
    directness_class text NOT NULL CHECK (directness_class IN (
        'calibrated_control','calibrated_derived','synthetic_proxy'
    )),
    mapping_confidence numeric NOT NULL CHECK (mapping_confidence BETWEEN 0 AND 1),
    reference_year integer NOT NULL CHECK (reference_year BETWEEN 1900 AND 2100),
    calibration_version text NOT NULL,
    source_release_id text REFERENCES public.source_release(release_id),
    queryable boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (target_unit, dimension_code, dimension_value, calibration_version)
);

CREATE TABLE IF NOT EXISTS production.weighted_joint_cell (
    target_unit text NOT NULL CHECK (target_unit IN ('person','household','establishment','enterprise')),
    calibration_version text NOT NULL,
    cell_hash text NOT NULL CHECK (cell_hash ~ '^[0-9a-f]{64}$'),
    dimension_values jsonb NOT NULL CHECK (jsonb_typeof(dimension_values) = 'object'),
    sample_rows bigint NOT NULL CHECK (sample_rows > 0),
    weighted_count numeric NOT NULL CHECK (weighted_count > 0),
    weight_square_sum numeric NOT NULL CHECK (weight_square_sum > 0),
    artifact_checksum text NOT NULL CHECK (artifact_checksum ~ '^[0-9a-f]{64}$'),
    reference_year integer NOT NULL CHECK (reference_year BETWEEN 1900 AND 2100),
    geography_scope text NOT NULL DEFAULT 'KR',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (target_unit, calibration_version, cell_hash),
    UNIQUE (target_unit, calibration_version, dimension_values)
);

CREATE INDEX IF NOT EXISTS weighted_joint_cell_lookup_idx
    ON production.weighted_joint_cell(target_unit, calibration_version);
CREATE INDEX IF NOT EXISTS weighted_joint_cell_dimensions_gin_idx
    ON production.weighted_joint_cell USING gin(dimension_values jsonb_path_ops);
CREATE INDEX IF NOT EXISTS calibration_dimension_catalog_lookup_idx
    ON production.calibration_dimension_catalog(target_unit, dimension_code, dimension_value)
    WHERE queryable;

CREATE OR REPLACE VIEW production.v_weighted_joint_cell
WITH (security_invoker = true) AS
SELECT cell.*,
       CASE WHEN cell.weight_square_sum = 0 THEN NULL
            ELSE cell.weighted_count * cell.weighted_count / cell.weight_square_sum END
         AS effective_sample_size
FROM production.weighted_joint_cell cell;

-- Keep the Phase 1/2 canonical catalog intact.  The web application reads
-- this Production extension, which adds calibrated demographic/business
-- dimensions and the ten registered Phase 2R-B Gold Query snapshots.
CREATE OR REPLACE VIEW production.v_workbench_condition_catalog
WITH (security_invoker = true) AS
SELECT
    catalog_id, source_kind, source_record_id, domain_id, dimension_id,
    source_code, label_ko, definition, entity_unit, data_type,
    allowed_values, sensitive_class, queryable, search_text
FROM public.v_condition_catalog

UNION ALL

SELECT
    dimension.catalog_id,
    'calibration_dimension'::text AS source_kind,
    dimension.target_unit || ':' || dimension.dimension_code || ':' || dimension.dimension_value AS source_record_id,
    NULL::text AS domain_id,
    dimension.dimension_code AS dimension_id,
    dimension.dimension_code AS source_code,
    dimension.display_value_ko AS label_ko,
    dimension.definition_ko AS definition,
    dimension.target_unit AS entity_unit,
    'category'::text AS data_type,
    jsonb_build_array(to_jsonb(dimension.dimension_value)) AS allowed_values,
    'non_sensitive'::text AS sensitive_class,
    dimension.queryable,
    concat_ws(' ', dimension.display_value_ko, dimension.definition_ko,
                    dimension.dimension_code, dimension.dimension_value,
                    dimension.target_unit) AS search_text
FROM production.calibration_dimension_catalog dimension

UNION ALL

SELECT
    'gold_query:' || gold.query_id AS catalog_id,
    'gold_query'::text AS source_kind,
    gold.query_id AS source_record_id,
    NULL::text AS domain_id,
    NULL::text AS dimension_id,
    gold.query_id AS source_code,
    gold.display_name_ko AS label_ko,
    'Phase 2R-B에서 검증된 대표 복합조건 시장질의 snapshot'::text AS definition,
    gold.entity_unit,
    'category'::text AS data_type,
    jsonb_build_array(to_jsonb(gold.query_id)) AS allowed_values,
    'non_sensitive'::text AS sensitive_class,
    gold.status = 'estimated' AS queryable,
    concat_ws(' ', gold.query_id, gold.display_name_ko,
                    gold.structured_conditions::text,
                    gold.most_uncertain_variable) AS search_text
FROM production.v_gold_query_result gold;

COMMENT ON TABLE production.weighted_joint_cell IS
  'Identifier-free aggregate cells derived from calibrated synthetic frames; the web runtime never reads raw Persona rows and applies release suppression to rare outputs.';
COMMENT ON VIEW production.v_workbench_condition_catalog IS
  'Production-only Builder catalog: canonical Phase 1/2 conditions plus calibrated dimensions and registered Gold Queries.';

GRANT SELECT ON production.calibration_dimension_catalog,
                production.weighted_joint_cell,
                production.v_weighted_joint_cell,
                production.v_workbench_condition_catalog
TO market_engine_app, market_engine_worker;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON production.calibration_dimension_catalog, production.weighted_joint_cell
FROM market_engine_app, market_engine_worker;

COMMIT;
