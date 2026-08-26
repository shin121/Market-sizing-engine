BEGIN;

-- Public workbench reads must not expose a rare human-weighted cell merely
-- because the immutable estimate ledger remains available to calculation and
-- governance code.  This migration changes views only: no populated base row
-- is rewritten, deleted, or backfilled.
CREATE OR REPLACE FUNCTION workbench_assert_release_safe_read_boundary()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    missing_relations text;
    incompatible_objects text;
    missing_columns text;
    unsafe_interval_count bigint;
BEGIN
    SELECT string_agg(required.relation_name, ', ' ORDER BY required.relation_name)
      INTO missing_relations
      FROM (
          VALUES
              ('estimate'),
              ('estimate_component'),
              ('estimate_assumption'),
              ('assumption'),
              ('estimate_sensitivity_result'),
              ('segment_query_result'),
              ('comparison_member'),
              ('feature_definition'),
              ('v_condition_catalog'),
              ('v_estimate_lineage'),
              ('v_archetype_search'),
              ('v_saved_segment_latest'),
              ('v_comparison_detail'),
              ('v_opportunity_snapshot'),
              ('v_global_search')
      ) AS required(relation_name)
     WHERE to_regclass('public.' || required.relation_name) IS NULL;

    IF missing_relations IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            CONSTRAINT = 'release_safe_read_boundary_preflight',
            MESSAGE = format(
                'migration 018 preflight failed: required relations are missing (%s); no row was changed',
                missing_relations
            );
    END IF;

    SELECT string_agg(class.relname, ', ' ORDER BY class.relname)
      INTO incompatible_objects
      FROM pg_class class
      JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
     WHERE namespace.nspname = 'public'
       AND class.relname = ANY (ARRAY[
           'v_estimate_release_boundary',
           'v_estimate_component_release_boundary',
           'v_estimate_assumption_release_boundary',
           'v_estimate_sensitivity_release_boundary',
           'v_segment_query_result_release_boundary',
           'v_condition_catalog',
           'v_estimate_lineage',
           'v_archetype_search',
           'v_saved_segment_latest',
           'v_comparison_detail',
           'v_opportunity_snapshot',
           'v_global_search'
       ])
       AND class.relkind <> 'v';

    IF incompatible_objects IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            CONSTRAINT = 'release_safe_read_boundary_preflight',
            MESSAGE = format(
                'migration 018 preflight failed: release-boundary names are occupied by non-view objects (%s); no row was changed',
                incompatible_objects
            );
    END IF;

    WITH required(relation_name, column_name, data_type) AS (
        VALUES
            ('estimate', 'entity_unit', 'text'),
            ('estimate', 'status', 'text'),
            ('estimate', 'count_low', 'numeric'),
            ('estimate', 'count_base', 'numeric'),
            ('estimate', 'count_high', 'numeric'),
            ('estimate', 'share_low', 'numeric'),
            ('estimate', 'share_base', 'numeric'),
            ('estimate', 'share_high', 'numeric'),
            ('estimate', 'denominator_definition', 'text'),
            ('estimate', 'formula', 'text'),
            ('estimate', 'precision_rule', 'text'),
            ('estimate_component', 'value_low', 'numeric'),
            ('estimate_component', 'value_base', 'numeric'),
            ('estimate_component', 'value_high', 'numeric'),
            ('estimate_component', 'conditional_probability', 'numeric'),
            ('estimate_component', 'metadata_json', 'jsonb'),
            ('assumption', 'value_low', 'numeric'),
            ('assumption', 'value_base', 'numeric'),
            ('assumption', 'value_high', 'numeric'),
            ('estimate_sensitivity_result', 'tested_low', 'numeric'),
            ('estimate_sensitivity_result', 'tested_base', 'numeric'),
            ('estimate_sensitivity_result', 'tested_high', 'numeric'),
            ('estimate_sensitivity_result', 'output_low', 'numeric'),
            ('estimate_sensitivity_result', 'output_base', 'numeric'),
            ('estimate_sensitivity_result', 'output_high', 'numeric'),
            ('segment_query_result', 'result_summary', 'jsonb'),
            ('comparison_member', 'normalized_metrics', 'jsonb'),
            ('feature_definition', 'queryable', 'boolean'),
            ('feature_definition', 'sensitive_class', 'text'),
            ('v_condition_catalog', 'queryable', 'boolean'),
            ('v_condition_catalog', 'sensitive_class', 'text')
    )
    SELECT string_agg(
               required.relation_name || '.' || required.column_name,
               ', ' ORDER BY required.relation_name, required.column_name
           )
      INTO missing_columns
      FROM required
      LEFT JOIN information_schema.columns column_definition
        ON column_definition.table_schema = 'public'
       AND column_definition.table_name = required.relation_name
       AND column_definition.column_name = required.column_name
     WHERE column_definition.column_name IS NULL
        OR column_definition.data_type IS DISTINCT FROM required.data_type;

    IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            CONSTRAINT = 'release_safe_read_boundary_preflight',
            MESSAGE = format(
                'migration 018 preflight failed: required release-policy columns are missing or incompatible (%s); no row was changed',
                missing_columns
            );
    END IF;

    IF to_regrole('market_engine_app') IS NULL
       OR to_regrole('market_engine_worker') IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            CONSTRAINT = 'release_safe_read_boundary_preflight',
            MESSAGE = 'migration 018 preflight failed: restricted runtime roles are missing; no row was changed';
    END IF;

    -- PostgreSQL numeric admits NaN and infinities.  A non-finite count cannot
    -- be classified against a minimum release cell safely, so fail closed
    -- before changing any public view definition.
    SELECT count(*)
      INTO unsafe_interval_count
      FROM public.estimate estimate_row
     WHERE estimate_row.entity_unit IN ('person', 'child_person', 'household')
       AND (
           lower(coalesce(estimate_row.count_low::text, '')) IN ('nan', 'infinity', '-infinity')
           OR lower(coalesce(estimate_row.count_base::text, '')) IN ('nan', 'infinity', '-infinity')
           OR lower(coalesce(estimate_row.count_high::text, '')) IN ('nan', 'infinity', '-infinity')
           OR lower(coalesce(estimate_row.share_low::text, '')) IN ('nan', 'infinity', '-infinity')
           OR lower(coalesce(estimate_row.share_base::text, '')) IN ('nan', 'infinity', '-infinity')
           OR lower(coalesce(estimate_row.share_high::text, '')) IN ('nan', 'infinity', '-infinity')
           OR (
               estimate_row.status IN ('estimated', 'superseded')
               AND (
                   estimate_row.count_low IS NULL
                   OR estimate_row.count_base IS NULL
                   OR estimate_row.count_high IS NULL
                   OR estimate_row.count_low < 0
                   OR estimate_row.count_low > estimate_row.count_base
                   OR estimate_row.count_base > estimate_row.count_high
               )
           )
       );

    IF unsafe_interval_count > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'release_safe_read_boundary_preflight',
            MESSAGE = format(
                'migration 018 preflight failed: %s human estimate interval(s) cannot be classified safely; no row was changed',
                unsafe_interval_count
            );
    END IF;
END $$;

SELECT workbench_assert_release_safe_read_boundary();

-- Builder and natural-language parsing read this catalog directly.  The
-- global-search filter below is therefore only defense in depth: protected
-- core features must already be non-queryable in the catalog projection.
-- The immutable feature_definition rows keep their original policy flags.
CREATE OR REPLACE VIEW v_condition_catalog
WITH (security_invoker = true)
AS
SELECT
    'core_feature:' || feature.feature_code AS catalog_id,
    'core_feature'::text AS source_kind,
    feature.feature_id::text AS source_record_id,
    NULL::text AS domain_id,
    NULL::text AS dimension_id,
    feature.feature_code AS source_code,
    feature.label_ko,
    feature.definition,
    feature.entity_unit,
    feature.data_type,
    coalesce(feature.allowed_values, '[]'::jsonb) AS allowed_values,
    feature.sensitive_class,
    feature.queryable
        AND feature.sensitive_class NOT IN ('minor_protected', 'restricted_targeting') AS queryable,
    concat_ws(' ', feature.feature_code, feature.label_ko, feature.definition) AS search_text
FROM feature_definition feature

UNION ALL

SELECT
    'domain_feature:' || feature.domain_feature_id,
    'domain_feature',
    feature.domain_feature_id,
    feature.domain_id,
    feature.dimension_id,
    feature.feature_code,
    feature.label_ko,
    concat(feature.label_ko, ' — ', feature.observable_status, ', ', feature.targetability_class),
    domain.primary_entity_unit,
    feature.data_type,
    coalesce(feature.allowed_values, '[]'::jsonb),
    CASE
        WHEN domain.minor_guardrail
             AND feature.sensitive_class IN ('none', 'non_sensitive', 'minor_protected')
            THEN 'minor_protected'
        ELSE feature.sensitive_class
    END,
    feature.queryable
        AND domain.active
        AND NOT domain.minor_guardrail
        AND feature.targetability_class <> 'not_allowed'
        AND CASE
                WHEN domain.minor_guardrail
                     AND feature.sensitive_class IN ('none', 'non_sensitive', 'minor_protected')
                    THEN 'minor_protected'
                ELSE feature.sensitive_class
            END NOT IN ('minor_protected', 'restricted_targeting'),
    concat_ws(' ', feature.feature_code, feature.label_ko, domain.name_ko,
                    feature.observable_status, feature.targetability_class)
FROM domain_feature feature
JOIN domain_registry domain USING (domain_id)

UNION ALL

SELECT
    'dimension_value:' || value.dimension_id || ':' || value.value_order::text,
    'dimension_value',
    value.dimension_id || ':' || value.value_order::text,
    value.domain_id,
    value.dimension_id,
    value.axis_code,
    value.value_text,
    value.applicability_reason,
    domain.primary_entity_unit,
    'category',
    jsonb_build_array(value.value_json),
    CASE WHEN domain.minor_guardrail THEN 'minor_protected' ELSE 'non_sensitive' END,
    value.applicability = 'applicable'
        AND domain.active
        AND NOT domain.minor_guardrail,
    concat_ws(' ', value.domain_code, domain.name_ko, value.axis_code,
                    value.value_text, value.applicability_reason)
FROM v_domain_dimension_value value
JOIN domain_registry domain USING (domain_id)

UNION ALL

SELECT
    'behavior:' || behavior.behavior_template_id,
    'behavior',
    behavior.behavior_template_id,
    behavior.domain_id,
    NULL::text,
    behavior.behavior_code,
    behavior.name_ko,
    behavior.definition,
    domain.primary_entity_unit,
    'json',
    jsonb_build_array(behavior.rule_json),
    CASE
        WHEN behavior.targetability_class = 'not_allowed' THEN 'restricted_targeting'
        WHEN domain.minor_guardrail THEN 'minor_protected'
        ELSE 'non_sensitive'
    END,
    domain.active
        AND NOT domain.minor_guardrail
        AND behavior.targetability_class <> 'not_allowed',
    concat_ws(' ', behavior.behavior_code, behavior.name_ko, behavior.definition, domain.name_ko)
FROM domain_behavior_template behavior
JOIN domain_registry domain USING (domain_id)

UNION ALL

SELECT
    'tag:' || tag.tag_id,
    'tag',
    tag.tag_id,
    tag.domain_id,
    NULL::text,
    tag.tag_code,
    tag.name_ko,
    concat(tag.tag_type, ' tag; non-additive=', NOT tag.additive, '; provenance=', tag.provenance),
    domain.primary_entity_unit,
    'category',
    jsonb_build_array(to_jsonb(tag.tag_code)),
    CASE WHEN domain.minor_guardrail THEN 'minor_protected' ELSE 'non_sensitive' END,
    domain.active AND NOT domain.minor_guardrail,
    concat_ws(' ', tag.tag_code, tag.name_ko, tag.tag_type, domain.name_ko)
FROM domain_tag tag
JOIN domain_registry domain USING (domain_id)

UNION ALL

SELECT
    'subtype:' || subtype.subtype_id,
    'subtype',
    subtype.subtype_id,
    subtype.domain_id,
    NULL::text,
    subtype.subtype_code,
    subtype.name_ko,
    subtype.definition,
    domain.primary_entity_unit,
    'category',
    jsonb_build_array(to_jsonb(subtype.subtype_code)),
    CASE WHEN domain.minor_guardrail THEN 'minor_protected' ELSE 'non_sensitive' END,
    subtype.is_primary AND domain.active AND NOT domain.minor_guardrail,
    concat_ws(' ', subtype.subtype_code, subtype.name_ko, subtype.definition, domain.name_ko)
FROM subtype_definition subtype
JOIN domain_registry domain USING (domain_id)

UNION ALL

SELECT
    'archetype:' || archetype.archetype_id,
    'archetype',
    archetype.archetype_id,
    NULL::text,
    NULL::text,
    archetype.archetype_id,
    archetype.name_ko,
    archetype.one_line_definition,
    archetype.primary_entity_unit,
    'category',
    jsonb_build_array(to_jsonb(archetype.archetype_id)),
    CASE WHEN archetype.primary_entity_unit = 'child_person'
         THEN 'minor_protected' ELSE 'non_sensitive' END,
    archetype.status <> 'deprecated' AND archetype.primary_entity_unit <> 'child_person',
    concat_ws(' ', archetype.archetype_id, archetype.name_ko,
                    archetype.name_en, archetype.one_line_definition)
FROM archetype

UNION ALL

SELECT
    'geography:' || geography.geography_id::text,
    'geography',
    geography.geography_id::text,
    NULL::text,
    NULL::text,
    geography.code,
    geography.name_ko,
    concat('administrative geography level=', geography.level),
    'all',
    'category',
    jsonb_build_array(to_jsonb(geography.code)),
    'non_sensitive',
    geography.valid_to IS NULL OR geography.valid_to >= current_date,
    concat_ws(' ', geography.code, geography.name_ko, geography.level)
FROM geography;

-- One canonical estimate projection owns the release predicate.  Existing
-- status=suppressed rows are canonicalized too, so legacy free-text fields do
-- not reintroduce a value that their numeric columns correctly withheld.
CREATE OR REPLACE VIEW v_estimate_release_boundary
WITH (security_invoker = true)
AS
WITH classified AS (
    SELECT
        estimate_row.*,
        (
            estimate_row.status = 'suppressed'
            OR (
                estimate_row.entity_unit IN ('person', 'child_person', 'household')
                AND estimate_row.count_base IS NOT NULL
                AND estimate_row.count_base < 10
            )
        ) AS release_suppressed
    FROM estimate estimate_row
)
SELECT
    estimate_row.estimate_id,
    estimate_row.subject_type,
    estimate_row.subject_id,
    estimate_row.entity_unit,
    estimate_row.geography_id,
    estimate_row.period_id,
    CASE WHEN estimate_row.release_suppressed
         THEN 'human aggregate denominator withheld by release policy'
         ELSE estimate_row.denominator_definition END AS denominator_definition,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE estimate_row.count_low END AS count_low,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE estimate_row.count_base END AS count_base,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE estimate_row.count_high END AS count_high,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE estimate_row.share_low END AS share_low,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE estimate_row.share_base END AS share_base,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE estimate_row.share_high END AS share_high,
    CASE WHEN estimate_row.release_suppressed
         THEN 'withheld_by_release_policy'::text ELSE estimate_row.method_code END AS method_code,
    CASE WHEN estimate_row.release_suppressed
         THEN 'weighted human cell withheld by release policy'
         ELSE estimate_row.formula END AS formula,
    CASE WHEN estimate_row.release_suppressed
         THEN 'suppressed_below_minimum_weighted_entities'
         ELSE estimate_row.precision_rule END AS precision_rule,
    estimate_row.model_version_id,
    estimate_row.run_id,
    CASE WHEN estimate_row.release_suppressed THEN 'suppressed' ELSE estimate_row.status END AS status,
    estimate_row.created_at,
    estimate_row.updated_at,
    estimate_row.data_version,
    estimate_row.created_by_run_id,
    CASE WHEN estimate_row.release_suppressed
         THEN NULL::text ELSE estimate_row.external_estimate_key END AS external_estimate_key,
    estimate_row.workspace_id,
    estimate_row.data_layer,
    estimate_row.approval_status,
    estimate_row.supersedes_estimate_id,
    CASE WHEN estimate_row.release_suppressed
         THEN NULL::text ELSE estimate_row.calculation_input_hash END AS calculation_input_hash,
    CASE WHEN estimate_row.release_suppressed
         THEN NULL::text ELSE estimate_row.dependency_fingerprint END AS dependency_fingerprint,
    estimate_row.publication_version_id,
    estimate_row.created_by_actor_id,
    estimate_row.release_suppressed,
    CASE WHEN estimate_row.release_suppressed
         THEN 'rare_output_below_release_threshold'::text
         ELSE NULL::text END AS release_reason,
    10::smallint AS release_threshold,
    'rare-output-v1'::text AS release_policy_version
FROM classified estimate_row;

-- Safe ledgers mirror the base-ledger identifiers and provenance while
-- removing numeric and value-bearing narrative payloads for suppressed rows.
-- Repository wiring can switch table names without changing calculation code.
CREATE OR REPLACE VIEW v_estimate_component_release_boundary
WITH (security_invoker = true)
AS
SELECT
    component.component_id,
    component.estimate_id,
    CASE WHEN estimate_row.release_suppressed
         THEN 'withheld_by_release_policy'::text ELSE component.component_type END AS component_type,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE component.value_low END AS value_low,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE component.value_base END AS value_base,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE component.value_high END AS value_high,
    CASE WHEN estimate_row.release_suppressed THEN NULL::text ELSE component.unit END AS unit,
    component.evidence_id,
    CASE WHEN estimate_row.release_suppressed
         THEN 'withheld_by_release_policy'::text ELSE component.operation END AS operation,
    component.sequence,
    component.created_at,
    component.updated_at,
    component.data_version,
    component.created_by_run_id,
    CASE WHEN estimate_row.release_suppressed THEN NULL::text ELSE component.component_code END AS component_code,
    CASE WHEN estimate_row.release_suppressed
         THEN 'component denominator withheld by release policy'
         ELSE component.denominator_definition END AS denominator_definition,
    CASE WHEN estimate_row.release_suppressed
         THEN NULL::numeric ELSE component.conditional_probability END AS conditional_probability,
    component.reference_period_id,
    component.directness_class,
    CASE WHEN estimate_row.release_suppressed THEN NULL::text ELSE component.dependency_group END AS dependency_group,
    component.model_version_id,
    CASE WHEN estimate_row.release_suppressed
         THEN 'Component values withheld by release policy.'
         ELSE component.adjustment_reason END AS adjustment_reason,
    CASE WHEN estimate_row.release_suppressed
         THEN jsonb_build_object(
             'release_policy', estimate_row.release_policy_version,
             'reason', estimate_row.release_reason,
             'threshold', estimate_row.release_threshold,
             'values_withheld', true
         )
         ELSE component.metadata_json END AS metadata_json
FROM estimate_component component
JOIN v_estimate_release_boundary estimate_row USING (estimate_id);

CREATE OR REPLACE VIEW v_estimate_assumption_release_boundary
WITH (security_invoker = true)
AS
SELECT
    association.estimate_id,
    assumption.assumption_id,
    CASE WHEN estimate_row.release_suppressed THEN NULL::text ELSE assumption.code END AS code,
    CASE WHEN estimate_row.release_suppressed
         THEN 'Assumption values withheld by release policy.'
         ELSE assumption.statement END AS statement,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE assumption.value_low END AS value_low,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE assumption.value_base END AS value_base,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE assumption.value_high END AS value_high,
    CASE WHEN estimate_row.release_suppressed THEN NULL::text ELSE assumption.unit END AS unit,
    CASE WHEN estimate_row.release_suppressed
         THEN 'Value-bearing justification withheld by release policy.'
         ELSE assumption.justification END AS justification,
    assumption.source_release_id,
    assumption.sensitivity_rank,
    assumption.created_at,
    assumption.updated_at,
    assumption.data_version,
    assumption.created_by_run_id
FROM estimate_assumption association
JOIN assumption USING (assumption_id)
JOIN v_estimate_release_boundary estimate_row
  ON estimate_row.estimate_id = association.estimate_id;

CREATE OR REPLACE VIEW v_estimate_sensitivity_release_boundary
WITH (security_invoker = true)
AS
SELECT
    sensitivity.sensitivity_result_id,
    sensitivity.estimate_id,
    sensitivity.component_id,
    CASE WHEN estimate_row.release_suppressed THEN NULL::text ELSE sensitivity.factor_code END AS factor_code,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE sensitivity.tested_low END AS tested_low,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE sensitivity.tested_base END AS tested_base,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE sensitivity.tested_high END AS tested_high,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE sensitivity.output_low END AS output_low,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE sensitivity.output_base END AS output_base,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE sensitivity.output_high END AS output_high,
    CASE WHEN estimate_row.release_suppressed THEN NULL::text ELSE sensitivity.output_unit END AS output_unit,
    CASE WHEN estimate_row.release_suppressed THEN NULL::numeric ELSE sensitivity.elasticity END AS elasticity,
    sensitivity.impact_rank,
    CASE WHEN estimate_row.release_suppressed
         THEN 'withheld_by_release_policy'::text ELSE sensitivity.method_code END AS method_code,
    sensitivity.created_at
FROM estimate_sensitivity_result sensitivity
JOIN v_estimate_release_boundary estimate_row USING (estimate_id);

CREATE OR REPLACE VIEW v_segment_query_result_release_boundary
WITH (security_invoker = true)
AS
SELECT
    result.result_id,
    result.query_id,
    result.estimate_id,
    result.model_version_id,
    result.executed_at,
    CASE WHEN estimate_row.release_suppressed
         THEN jsonb_build_object(
             'status', 'suppressed',
             'reason', estimate_row.release_reason,
             'threshold', estimate_row.release_threshold,
             'values_withheld', true
         )
         ELSE result.result_summary END AS result_summary,
    result.created_at,
    result.updated_at,
    result.data_version,
    result.created_by_run_id,
    CASE WHEN estimate_row.release_suppressed
         THEN NULL::text ELSE result.result_hash END AS result_hash,
    CASE WHEN estimate_row.release_suppressed
         THEN NULL::text ELSE result.dependency_fingerprint END AS dependency_fingerprint,
    result.cache_status,
    result.invalidated_at
FROM segment_query_result result
JOIN v_estimate_release_boundary estimate_row USING (estimate_id);

CREATE OR REPLACE VIEW v_estimate_lineage
WITH (security_invoker = true)
AS
SELECT
    estimate_row.estimate_id,
    estimate_row.external_estimate_key,
    estimate_row.workspace_id,
    estimate_row.subject_type,
    estimate_row.subject_id,
    estimate_row.entity_unit,
    estimate_row.status,
    estimate_row.data_layer,
    estimate_row.approval_status,
    estimate_row.supersedes_estimate_id,
    estimate_row.publication_version_id,
    estimate_row.count_low,
    estimate_row.count_base,
    estimate_row.count_high,
    estimate_row.share_low,
    estimate_row.share_base,
    estimate_row.share_high,
    estimate_row.denominator_definition,
    estimate_row.method_code,
    estimate_row.formula,
    estimate_row.precision_rule,
    geography.code AS geography_code,
    geography.name_ko AS geography_name_ko,
    period.label AS reference_period,
    model.version AS model_version,
    run.pipeline_name,
    estimate_row.calculation_input_hash,
    estimate_row.dependency_fingerprint,
    confidence.confidence_json,
    components.components_json,
    assumptions.assumptions_json,
    gaps.validation_gaps_json,
    dependencies.dependencies_json,
    sources.sources_json,
    estimate_row.created_at,
    estimate_row.updated_at,
    estimate_row.data_version
FROM v_estimate_release_boundary estimate_row
JOIN geography USING (geography_id)
JOIN time_period period USING (period_id)
JOIN model_version model USING (model_version_id)
JOIN pipeline_run run ON run.run_id = estimate_row.run_id
LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
        'source_quality_score', assessment.source_quality_score,
        'recency_score', assessment.recency_score,
        'directness_score', assessment.directness_score,
        'joint_observation_score', assessment.joint_observation_score,
        'model_reliance_score', assessment.model_reliance_score,
        'total_score', assessment.total_score,
        'grade', assessment.grade,
        'rationale', CASE WHEN estimate_row.release_suppressed
                          THEN 'Confidence narrative withheld by release policy.'
                          ELSE assessment.rationale END,
        'rule_version', CASE WHEN estimate_row.release_suppressed
                             THEN NULL::text ELSE assessment.rule_version END,
        'components', CASE WHEN estimate_row.release_suppressed
                           THEN '{}'::jsonb ELSE assessment.components_json END,
        'penalties', CASE WHEN estimate_row.release_suppressed
                          THEN '[]'::jsonb ELSE assessment.penalties_json END
    ) AS confidence_json
    FROM confidence_assessment assessment
    WHERE assessment.estimate_id = estimate_row.estimate_id
) confidence ON true
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'component_id', component.component_id,
            'component_code', component.component_code,
            'component_type', component.component_type,
            'sequence', component.sequence,
            'operation', component.operation,
            'value_low', component.value_low,
            'value_base', component.value_base,
            'value_high', component.value_high,
            'unit', component.unit,
            'denominator', component.denominator_definition,
            'conditional_probability', component.conditional_probability,
            'directness_class', component.directness_class,
            'dependency_group', component.dependency_group,
            'adjustment_reason', component.adjustment_reason,
            'metadata', component.metadata_json,
            'evidence_id', evidence.evidence_id,
            'release_id', release.release_id,
            'source_id', release.source_id,
            'locator', CASE WHEN estimate_row.release_suppressed
                            THEN NULL::text ELSE evidence.locator END
        ) ORDER BY component.sequence
    ), '[]'::jsonb) AS components_json
    FROM v_estimate_component_release_boundary component
    LEFT JOIN evidence USING (evidence_id)
    LEFT JOIN source_release release USING (release_id)
    WHERE component.estimate_id = estimate_row.estimate_id
) components ON true
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'assumption_id', assumption.assumption_id,
            'code', assumption.code,
            'statement', assumption.statement,
            'value_low', assumption.value_low,
            'value_base', assumption.value_base,
            'value_high', assumption.value_high,
            'unit', assumption.unit,
            'justification', assumption.justification,
            'source_release_id', assumption.source_release_id,
            'sensitivity_rank', assumption.sensitivity_rank
        ) ORDER BY assumption.sensitivity_rank, assumption.code
    ), '[]'::jsonb) AS assumptions_json
    FROM v_estimate_assumption_release_boundary assumption
    WHERE assumption.estimate_id = estimate_row.estimate_id
) assumptions ON true
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'validation_gap_id', gap.validation_gap_id,
            'gap_type', gap.gap_type,
            'description', CASE WHEN estimate_row.release_suppressed
                                THEN 'Validation-gap narrative withheld by release policy.'
                                ELSE gap.description END,
            'impact', gap.impact,
            'verification_question', CASE WHEN estimate_row.release_suppressed
                                          THEN NULL::text ELSE gap.verification_question END,
            'recommended_source', CASE WHEN estimate_row.release_suppressed
                                       THEN NULL::text ELSE gap.recommended_source END,
            'expected_improvement', CASE WHEN estimate_row.release_suppressed
                                         THEN NULL::text ELSE gap.expected_improvement END,
            'priority', gap.priority,
            'status', gap.status
        ) ORDER BY gap.priority, gap.validation_gap_id
    ), '[]'::jsonb) AS validation_gaps_json
    FROM validation_gap gap
    WHERE gap.estimate_id = estimate_row.estimate_id
) gaps ON true
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'dependency_kind', dependency.dependency_kind,
            'record_key', CASE WHEN estimate_row.release_suppressed
                               THEN NULL::text ELSE dependency.dependency_record_key END,
            'version', CASE WHEN estimate_row.release_suppressed
                            THEN NULL::text ELSE dependency.dependency_version END,
            'content_hash', CASE WHEN estimate_row.release_suppressed
                                 THEN NULL::text ELSE dependency.dependency_content_hash END,
            'role', dependency.dependency_role,
            'evidence_id', dependency.evidence_id,
            'model_version_id', dependency.model_version_id
        ) ORDER BY dependency.dependency_role, dependency.estimate_dependency_id
    ), '[]'::jsonb) AS dependencies_json
    FROM estimate_dependency dependency
    WHERE dependency.estimate_id = estimate_row.estimate_id
) dependencies ON true
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(source_row.source_json ORDER BY source_row.release_id), '[]'::jsonb) AS sources_json
    FROM (
        SELECT DISTINCT
            release.release_id,
            jsonb_build_object(
                'source_id', source.source_id,
                'publisher', source.publisher,
                'dataset_title', source.dataset_title,
                'release_id', release.release_id,
                'version_label', release.version_label,
                'reference_period_start', release.reference_period_start,
                'reference_period_end', release.reference_period_end,
                'publication_date', release.publication_date,
                'retrieved_at', release.retrieved_at,
                'official_url', source.official_url,
                'checksum', release.checksum
            ) AS source_json
        FROM v_estimate_component_release_boundary component
        JOIN evidence USING (evidence_id)
        JOIN source_release release USING (release_id)
        JOIN data_source source USING (source_id)
        WHERE component.estimate_id = estimate_row.estimate_id
    ) source_row
) sources ON true;

CREATE OR REPLACE VIEW v_archetype_search
WITH (security_invoker = true)
AS
SELECT
    archetype.archetype_id,
    archetype.name_ko,
    archetype.name_en,
    archetype.one_line_definition,
    archetype.primary_entity_unit,
    archetype.age_min,
    archetype.age_max,
    archetype.status AS archetype_status,
    archetype.version AS archetype_version,
    category.code AS category_code,
    category.name_ko AS category_name_ko,
    rule.rule_json,
    rule.rule_hash,
    rule.deterministic_or_probabilistic,
    profile.observable_traits,
    profile.inferred_needs,
    profile.triggers,
    profile.objections,
    profile.channels,
    profile.inference_disclosure,
    representative.source_kind AS representative_source_kind,
    representative.source_persona_key,
    representative.representative_summary,
    estimate_row.estimate_id,
    estimate_row.entity_unit AS estimate_entity_unit,
    estimate_row.status AS estimate_status,
    estimate_row.count_low,
    estimate_row.count_base,
    estimate_row.count_high,
    estimate_row.share_low,
    estimate_row.share_base,
    estimate_row.share_high,
    estimate_row.denominator_definition,
    estimate_row.method_code,
    estimate_row.formula,
    estimate_row.data_layer,
    estimate_row.approval_status,
    confidence.total_score AS confidence_score,
    confidence.grade AS confidence_grade,
    coalesce(gaps.validation_gap_count, 0) AS validation_gap_count,
    concat_ws(' ', archetype.archetype_id, archetype.name_ko, archetype.name_en,
                    archetype.one_line_definition, category.name_ko) AS search_text,
    greatest(archetype.updated_at, coalesce(estimate_row.updated_at, archetype.updated_at)) AS updated_at
FROM archetype
JOIN category USING (category_id)
LEFT JOIN LATERAL (
    SELECT candidate.*
    FROM archetype_rule candidate
    WHERE candidate.archetype_id = archetype.archetype_id
    ORDER BY candidate.updated_at DESC, candidate.rule_version DESC
    LIMIT 1
) rule ON true
LEFT JOIN archetype_profile profile ON profile.archetype_id = archetype.archetype_id
LEFT JOIN LATERAL (
    SELECT candidate.source_kind, candidate.source_persona_key, candidate.representative_summary
    FROM archetype_representative candidate
    WHERE candidate.archetype_id = archetype.archetype_id
    ORDER BY candidate.rank
    LIMIT 1
) representative ON true
LEFT JOIN LATERAL (
    SELECT candidate.*
    FROM v_estimate_release_boundary candidate
    WHERE candidate.subject_type = 'archetype'
      AND candidate.subject_id = archetype.archetype_id
      AND candidate.approval_status IN ('approved', 'not_required')
    ORDER BY
        CASE candidate.data_layer WHEN 'approved_version' THEN 0 WHEN 'baseline' THEN 1 ELSE 2 END,
        candidate.created_at DESC
    LIMIT 1
) estimate_row ON true
LEFT JOIN confidence_assessment confidence ON confidence.estimate_id = estimate_row.estimate_id
LEFT JOIN LATERAL (
    SELECT count(*)::integer AS validation_gap_count
    FROM validation_gap gap
    WHERE gap.archetype_id = archetype.archetype_id
       OR gap.estimate_id = estimate_row.estimate_id
) gaps ON true;

CREATE OR REPLACE VIEW v_saved_segment_latest
WITH (security_invoker = true)
AS
SELECT
    saved.saved_segment_id,
    saved.workspace_id,
    saved.title,
    saved.description,
    saved.status,
    saved.current_version_no,
    saved.optimistic_lock_version,
    version_row.version_no AS resolved_version_no,
    version_row.query_id,
    version_row.natural_language_text,
    version_row.parser_version,
    version_row.definition_hash,
    version_row.change_reason,
    query.filter_json,
    query.primary_entity_unit,
    query.geography_scope,
    query.as_of_date,
    result_row.result_id,
    result_row.executed_at,
    result_row.cache_status,
    result_row.result_summary,
    estimate_row.estimate_id,
    estimate_row.status AS estimate_status,
    estimate_row.count_low,
    estimate_row.count_base,
    estimate_row.count_high,
    estimate_row.share_low,
    estimate_row.share_base,
    estimate_row.share_high,
    estimate_row.data_layer,
    estimate_row.approval_status,
    saved.created_at,
    saved.updated_at,
    version_row.pinned_result_id
FROM saved_segment saved
LEFT JOIN LATERAL (
    SELECT candidate.*
    FROM saved_segment_version candidate
    WHERE candidate.saved_segment_id = saved.saved_segment_id
    ORDER BY (candidate.version_no = saved.current_version_no) DESC, candidate.version_no DESC
    LIMIT 1
) version_row ON true
LEFT JOIN segment_query query ON query.query_id = version_row.query_id
LEFT JOIN LATERAL (
    SELECT candidate.*
    FROM v_segment_query_result_release_boundary candidate
    WHERE candidate.query_id = version_row.query_id
      AND (
          (version_row.pinned_result_id IS NOT NULL AND candidate.result_id = version_row.pinned_result_id)
          OR (version_row.pinned_result_id IS NULL AND candidate.cache_status <> 'invalidated')
      )
    ORDER BY (candidate.result_id = version_row.pinned_result_id) DESC,
             candidate.executed_at DESC
    LIMIT 1
) result_row ON true
LEFT JOIN v_estimate_release_boundary estimate_row
  ON estimate_row.estimate_id = result_row.estimate_id;

CREATE OR REPLACE VIEW v_comparison_detail
WITH (security_invoker = true)
AS
SELECT
    comparison.comparison_id,
    comparison.workspace_id,
    comparison.name AS comparison_name,
    comparison.status AS comparison_status,
    comparison.version_no,
    member.comparison_member_id,
    member.position,
    CASE WHEN estimate_row.release_suppressed
         THEN 'Suppressed segment'::text ELSE member.display_label END AS display_label,
    result.result_id AS query_result_id,
    query.query_id,
    query.name AS segment_name,
    query.primary_entity_unit,
    query.geography_scope,
    query.as_of_date,
    estimate_row.estimate_id,
    estimate_row.status AS estimate_status,
    estimate_row.count_low,
    estimate_row.count_base,
    estimate_row.count_high,
    estimate_row.share_low,
    estimate_row.share_base,
    estimate_row.share_high,
    estimate_row.data_layer,
    estimate_row.approval_status,
    member.market_estimate_id,
    CASE WHEN comparison_state.market_lineage_valid
         THEN market.tam_entities_base ELSE NULL::numeric END AS tam_entities_base,
    CASE WHEN comparison_state.market_lineage_valid
         THEN market.sam_entities_base ELSE NULL::numeric END AS sam_entities_base,
    CASE WHEN comparison_state.market_lineage_valid
         THEN market.som_entities_base ELSE NULL::numeric END AS som_entities_base,
    CASE WHEN comparison_state.market_lineage_valid
         THEN market.tam_revenue_base ELSE NULL::numeric END AS tam_revenue_base,
    CASE WHEN comparison_state.market_lineage_valid
         THEN market.sam_revenue_base ELSE NULL::numeric END AS sam_revenue_base,
    CASE WHEN comparison_state.market_lineage_valid
         THEN market.som_revenue_base ELSE NULL::numeric END AS som_revenue_base,
    CASE WHEN estimate_row.release_suppressed THEN
        jsonb_build_object(
            'raw_count_low', NULL,
            'raw_count_base', NULL,
            'raw_count_high', NULL,
            'raw_entity_unit', estimate_row.entity_unit,
            'normalized_count_score', NULL,
            'normalization_scope', 'withheld_by_release_policy',
            'count_status', 'suppressed',
            'confidence_score', NULL,
            'confidence_grade', NULL,
            'validation_gap_count', NULL,
            'direct_observation_share', NULL,
            'estimate_updated_at', NULL,
            'tam_entities_base', NULL,
            'sam_entities_base', NULL,
            'som_entities_base', NULL,
            'tam_revenue_base', NULL,
            'sam_revenue_base', NULL,
            'som_revenue_base', NULL,
            'annual_spend_per_entity', NULL,
            'growth_rate', NULL,
            'target_accessibility', NULL,
            'digital_reachability', NULL,
            'competition_intensity', NULL,
            'purchase_frequency', NULL,
            'willingness_to_pay', NULL,
            'unavailable_reason', estimate_row.release_reason,
            'release_policy', estimate_row.release_policy_version,
            'threshold', estimate_row.release_threshold,
            'values_withheld', true,
            'metric_unavailable_reasons', jsonb_build_object(
                'raw_count', estimate_row.release_reason,
                'normalized_count_score', estimate_row.release_reason,
                'tam_entities_base', estimate_row.release_reason,
                'sam_entities_base', estimate_row.release_reason,
                'som_entities_base', estimate_row.release_reason,
                'tam_revenue_base', estimate_row.release_reason,
                'sam_revenue_base', estimate_row.release_reason,
                'som_revenue_base', estimate_row.release_reason,
                'annual_spend_per_entity', estimate_row.release_reason
            )
        )
        ELSE
        jsonb_build_object(
            -- The immutable member JSON is a server snapshot, not a release
            -- authority.  Rebuild known fields and always take raw counts from
            -- the estimate release projection.
            'raw_count_low', estimate_row.count_low::text,
            'raw_count_base', estimate_row.count_base::text,
            'raw_count_high', estimate_row.count_high::text,
            'raw_entity_unit', estimate_row.entity_unit,
            'normalized_count_score', CASE
                WHEN jsonb_typeof(member.normalized_metrics -> 'normalized_count_score') = 'number'
                THEN member.normalized_metrics -> 'normalized_count_score'
                ELSE NULL::jsonb END,
            'normalization_scope', 'within_' || estimate_row.entity_unit || '_members_only',
            'count_status', CASE WHEN estimate_row.count_base IS NULL
                                 THEN 'unavailable' ELSE 'available' END,
            'confidence_score', CASE
                WHEN jsonb_typeof(member.normalized_metrics -> 'confidence_score') = 'number'
                  OR (
                      jsonb_typeof(member.normalized_metrics -> 'confidence_score') = 'string'
                      AND member.normalized_metrics ->> 'confidence_score'
                          ~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
                  )
                THEN member.normalized_metrics -> 'confidence_score'
                ELSE NULL::jsonb END,
            'confidence_grade', CASE
                WHEN jsonb_typeof(member.normalized_metrics -> 'confidence_grade') = 'string'
                THEN member.normalized_metrics -> 'confidence_grade'
                ELSE NULL::jsonb END,
            'validation_gap_count', CASE
                WHEN jsonb_typeof(member.normalized_metrics -> 'validation_gap_count') = 'number'
                  OR (
                      jsonb_typeof(member.normalized_metrics -> 'validation_gap_count') = 'string'
                      AND member.normalized_metrics ->> 'validation_gap_count'
                          ~ '^(0|[1-9][0-9]*)$'
                  )
                THEN member.normalized_metrics -> 'validation_gap_count'
                ELSE NULL::jsonb END,
            'direct_observation_share', CASE
                WHEN jsonb_typeof(member.normalized_metrics -> 'direct_observation_share') = 'number'
                  OR (
                      jsonb_typeof(member.normalized_metrics -> 'direct_observation_share') = 'string'
                      AND member.normalized_metrics ->> 'direct_observation_share'
                          ~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
                  )
                THEN member.normalized_metrics -> 'direct_observation_share'
                ELSE NULL::jsonb END,
            'estimate_updated_at', CASE
                WHEN jsonb_typeof(member.normalized_metrics -> 'estimate_updated_at') = 'string'
                THEN member.normalized_metrics -> 'estimate_updated_at'
                ELSE to_jsonb(estimate_row.updated_at::text) END,
            'active_market_scenario_count', snapshot_state.active_market_scenario_count,
            'market_scenario_id', CASE
                WHEN comparison_state.market_lineage_valid THEN market.scenario_id
                WHEN comparison_state.scenario_lineage_valid THEN snapshot_scenario.scenario_id
                ELSE NULL::uuid END,
            'market_scenario_name', CASE
                WHEN comparison_state.market_lineage_valid THEN market.scenario_name
                WHEN comparison_state.scenario_lineage_valid THEN snapshot_scenario.scenario_name
                ELSE NULL::text END,
            'market_scenario_version', CASE
                WHEN comparison_state.market_lineage_valid THEN market.scenario_version
                WHEN comparison_state.scenario_lineage_valid THEN snapshot_scenario.scenario_version
                ELSE NULL::text END,
            'market_horizon_months', CASE
                WHEN comparison_state.market_lineage_valid THEN market.horizon_months
                WHEN comparison_state.scenario_lineage_valid THEN snapshot_scenario.horizon_months
                ELSE NULL::integer END,
            'tam_entities_base', CASE WHEN comparison_state.market_lineage_valid
                                      THEN market.tam_entities_base::text ELSE NULL::text END,
            'sam_entities_base', CASE WHEN comparison_state.market_lineage_valid
                                      THEN market.sam_entities_base::text ELSE NULL::text END,
            'som_entities_base', CASE WHEN comparison_state.market_lineage_valid
                                      THEN market.som_entities_base::text ELSE NULL::text END,
            'tam_revenue_base', CASE WHEN comparison_state.market_lineage_valid
                                     THEN market.tam_revenue_base::text ELSE NULL::text END,
            'sam_revenue_base', CASE WHEN comparison_state.market_lineage_valid
                                     THEN market.sam_revenue_base::text ELSE NULL::text END,
            'som_revenue_base', CASE WHEN comparison_state.market_lineage_valid
                                     THEN market.som_revenue_base::text ELSE NULL::text END,
            'currency', CASE
                WHEN comparison_state.market_lineage_valid THEN market.currency
                WHEN comparison_state.scenario_lineage_valid THEN snapshot_scenario.currency
                ELSE NULL::text END,
            'annual_spend_per_entity', CASE WHEN comparison_state.market_lineage_valid
                                            THEN market.annual_spend_per_entity::text ELSE NULL::text END,
            'annual_spend_per_entity_unit', CASE WHEN comparison_state.market_lineage_valid
                                                 THEN market.annual_spend_per_entity_unit ELSE NULL::text END,
            'growth_rate', CASE
                WHEN jsonb_typeof(member.normalized_metrics -> 'growth_rate') = 'number'
                THEN member.normalized_metrics -> 'growth_rate' ELSE NULL::jsonb END,
            'target_accessibility', CASE
                WHEN jsonb_typeof(member.normalized_metrics -> 'target_accessibility') = 'number'
                THEN member.normalized_metrics -> 'target_accessibility' ELSE NULL::jsonb END,
            'digital_reachability', CASE
                WHEN jsonb_typeof(member.normalized_metrics -> 'digital_reachability') = 'number'
                THEN member.normalized_metrics -> 'digital_reachability' ELSE NULL::jsonb END,
            'competition_intensity', CASE
                WHEN jsonb_typeof(member.normalized_metrics -> 'competition_intensity') = 'number'
                THEN member.normalized_metrics -> 'competition_intensity' ELSE NULL::jsonb END,
            'purchase_frequency', CASE
                WHEN jsonb_typeof(member.normalized_metrics -> 'purchase_frequency') = 'number'
                THEN member.normalized_metrics -> 'purchase_frequency' ELSE NULL::jsonb END,
            'willingness_to_pay', CASE
                WHEN jsonb_typeof(member.normalized_metrics -> 'willingness_to_pay') = 'number'
                THEN member.normalized_metrics -> 'willingness_to_pay' ELSE NULL::jsonb END,
            'unavailable_reason', CASE
                WHEN estimate_row.count_base IS NULL
                    THEN 'registered_estimate_not_available'
                WHEN member.market_estimate_id IS NOT NULL
                 AND market.market_estimate_id IS NULL
                    THEN 'market_estimate_query_result_mismatch'
                ELSE NULL::text END,
            'values_withheld', false,
            'metric_unavailable_reasons', jsonb_build_object(
                'raw_count', CASE WHEN estimate_row.count_base IS NULL
                                  THEN 'registered_estimate_not_available' ELSE NULL::text END,
                'normalized_count_score', CASE
                    WHEN estimate_row.count_base IS NULL THEN 'registered_estimate_not_available'
                    WHEN jsonb_typeof(member.normalized_metrics -> 'normalized_count_score') <> 'number'
                      OR member.normalized_metrics -> 'normalized_count_score' IS NULL
                    THEN 'same_unit_comparator_required' ELSE NULL::text END,
                'confidence_score', CASE
                    WHEN jsonb_typeof(member.normalized_metrics -> 'confidence_score') = 'number'
                      OR (
                          jsonb_typeof(member.normalized_metrics -> 'confidence_score') = 'string'
                          AND member.normalized_metrics ->> 'confidence_score'
                              ~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
                      )
                    THEN NULL::text ELSE 'confidence_assessment_not_available' END,
                'validation_gap_count', CASE
                    WHEN jsonb_typeof(member.normalized_metrics -> 'validation_gap_count') = 'number'
                      OR (
                          jsonb_typeof(member.normalized_metrics -> 'validation_gap_count') = 'string'
                          AND member.normalized_metrics ->> 'validation_gap_count'
                              ~ '^(0|[1-9][0-9]*)$'
                      )
                    THEN NULL::text ELSE 'validation_gap_review_not_available' END,
                'direct_observation_share', CASE
                    WHEN jsonb_typeof(member.normalized_metrics -> 'direct_observation_share') = 'number'
                      OR (
                          jsonb_typeof(member.normalized_metrics -> 'direct_observation_share') = 'string'
                          AND member.normalized_metrics ->> 'direct_observation_share'
                              ~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
                      )
                    THEN NULL::text ELSE 'estimate_component_evidence_not_available' END,
                'estimate_updated_at', NULL,
                'market_scenario_id', comparison_state.scenario_unavailable_reason,
                'tam_entities_base', comparison_state.market_unavailable_reason,
                'sam_entities_base', comparison_state.market_unavailable_reason,
                'som_entities_base', comparison_state.market_unavailable_reason,
                'tam_revenue_base', coalesce(
                    comparison_state.market_unavailable_reason,
                    CASE WHEN market.tam_revenue_base IS NULL
                         THEN 'annual_spend_evidence_not_available' END
                ),
                'sam_revenue_base', coalesce(
                    comparison_state.market_unavailable_reason,
                    CASE WHEN market.sam_revenue_base IS NULL
                         THEN 'annual_spend_evidence_not_available' END
                ),
                'som_revenue_base', coalesce(
                    comparison_state.market_unavailable_reason,
                    CASE WHEN market.som_revenue_base IS NULL
                         THEN 'annual_spend_evidence_not_available' END
                ),
                'annual_spend_per_entity', coalesce(
                    comparison_state.market_unavailable_reason,
                    CASE WHEN market.annual_spend_per_entity IS NULL
                         THEN 'annual_spend_evidence_not_available' END
                ),
                'growth_rate', 'time_series_evidence_not_available',
                'target_accessibility', 'target_accessibility_evidence_not_available',
                'digital_reachability', 'digital_reachability_evidence_not_available',
                'competition_intensity', 'competition_evidence_not_available',
                'purchase_frequency', 'purchase_frequency_evidence_not_available',
                'willingness_to_pay', 'willingness_to_pay_evidence_not_available'
            )
        ) END AS normalized_metrics,
    member.added_at
FROM comparison_workspace comparison
JOIN comparison_member member USING (comparison_id)
JOIN v_segment_query_result_release_boundary result
  ON result.result_id = member.query_result_id
JOIN segment_query query USING (query_id)
JOIN v_estimate_release_boundary estimate_row USING (estimate_id)
LEFT JOIN LATERAL (
    SELECT CASE
        WHEN jsonb_typeof(member.normalized_metrics -> 'active_market_scenario_count') = 'number'
         AND member.normalized_metrics ->> 'active_market_scenario_count' ~ '^(0|[1-9][0-9]*)$'
         AND (member.normalized_metrics ->> 'active_market_scenario_count')::numeric <= 2147483647
        THEN (member.normalized_metrics ->> 'active_market_scenario_count')::integer
        ELSE NULL::integer
    END AS active_market_scenario_count
) snapshot_state ON true
LEFT JOIN LATERAL (
    SELECT
        candidate.market_estimate_id,
        candidate.tam_entities_base,
        candidate.sam_entities_base,
        candidate.som_entities_base,
        candidate.tam_revenue_base,
        candidate.sam_revenue_base,
        candidate.som_revenue_base,
        scenario.scenario_id,
        scenario.name AS scenario_name,
        scenario.version AS scenario_version,
        scenario.horizon_months,
        scenario.currency::text AS currency,
        spend.value_base AS annual_spend_per_entity,
        spend.unit AS annual_spend_per_entity_unit
    FROM market_estimate candidate
    JOIN market_scenario scenario USING (scenario_id)
    LEFT JOIN scenario_factor_override spend
      ON spend.scenario_id = scenario.scenario_id
     AND spend.factor_code = 'annual_spend_per_entity'
    WHERE candidate.market_estimate_id = member.market_estimate_id
      AND scenario.base_query_result_id = member.query_result_id
    LIMIT 1
) market ON true
LEFT JOIN LATERAL (
    SELECT
        scenario.scenario_id,
        scenario.name AS scenario_name,
        scenario.version AS scenario_version,
        scenario.horizon_months,
        scenario.currency::text AS currency
    FROM market_scenario scenario
    WHERE member.market_estimate_id IS NULL
      AND snapshot_state.active_market_scenario_count = 1
      AND jsonb_typeof(member.normalized_metrics -> 'market_scenario_id') = 'string'
      AND scenario.scenario_id::text = member.normalized_metrics ->> 'market_scenario_id'
      AND scenario.base_query_result_id = member.query_result_id
    LIMIT 1
) snapshot_scenario ON true
LEFT JOIN LATERAL (
    SELECT
        (
            NOT estimate_row.release_suppressed
            AND snapshot_state.active_market_scenario_count = 1
            AND market.market_estimate_id IS NOT NULL
        ) AS market_lineage_valid,
        (
            NOT estimate_row.release_suppressed
            AND snapshot_state.active_market_scenario_count = 1
            AND member.market_estimate_id IS NULL
            AND snapshot_scenario.scenario_id IS NOT NULL
        ) AS scenario_lineage_valid,
        CASE
            WHEN member.market_estimate_id IS NOT NULL
             AND market.market_estimate_id IS NULL
                THEN 'market_estimate_query_result_mismatch'::text
            WHEN snapshot_state.active_market_scenario_count IS NULL
                THEN 'active_market_scenario_state_unavailable'::text
            WHEN snapshot_state.active_market_scenario_count = 0
                THEN 'active_market_scenario_not_available'::text
            WHEN snapshot_state.active_market_scenario_count > 1
                THEN 'multiple_active_market_scenarios_require_explicit_selection'::text
            WHEN market.market_estimate_id IS NOT NULL
                THEN NULL::text
            WHEN snapshot_scenario.scenario_id IS NOT NULL
                THEN NULL::text
            ELSE 'active_market_scenario_state_unavailable'::text
        END AS scenario_unavailable_reason,
        CASE
            WHEN member.market_estimate_id IS NOT NULL
             AND market.market_estimate_id IS NULL
                THEN 'market_estimate_query_result_mismatch'::text
            WHEN snapshot_state.active_market_scenario_count IS NULL
                THEN 'active_market_scenario_state_unavailable'::text
            WHEN snapshot_state.active_market_scenario_count = 0
                THEN 'active_market_scenario_not_available'::text
            WHEN snapshot_state.active_market_scenario_count > 1
                THEN 'multiple_active_market_scenarios_require_explicit_selection'::text
            WHEN market.market_estimate_id IS NOT NULL
                THEN NULL::text
            WHEN snapshot_scenario.scenario_id IS NOT NULL
                THEN 'active_market_estimate_not_available'::text
            ELSE 'active_market_scenario_state_unavailable'::text
        END AS market_unavailable_reason
) comparison_state ON true;

CREATE OR REPLACE VIEW v_opportunity_snapshot
WITH (security_invoker = true)
AS
SELECT
    opportunity.opportunity_id,
    board.opportunity_board_id,
    board.workspace_id,
    board.name AS board_name,
    opportunity.name,
    opportunity.problem_statement,
    opportunity.hypothesis_summary,
    opportunity.solution_idea,
    opportunity.revenue_model,
    opportunity.expected_price_low,
    opportunity.expected_price_base,
    opportunity.expected_price_high,
    opportunity.currency,
    opportunity.access_channels,
    opportunity.competing_alternatives,
    opportunity.assumptions_to_validate,
    opportunity.next_experiment_summary,
    opportunity.status,
    opportunity.optimistic_lock_version,
    segments.segment_snapshots,
    score.version_no AS score_version_no,
    score.overall_score,
    score.formula_version AS score_formula_version,
    score.weight_config,
    content.current_content,
    experiments.experiment_count,
    experiments.active_experiment_count,
    opportunity.created_at,
    opportunity.updated_at
FROM opportunity
JOIN opportunity_board board USING (opportunity_board_id)
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'link_id', link.opportunity_segment_link_id,
            'link_role', link.link_role,
            'saved_segment_id', link.saved_segment_id,
            'saved_segment_version_no', link.saved_segment_version_no,
            'query_result_id', link.query_result_id,
            'market_estimate_id', link.market_estimate_id,
            'estimate_id', result.estimate_id,
            'estimate_status', estimate_row.status,
            'entity_unit', estimate_row.entity_unit,
            'count_low', estimate_row.count_low,
            'count_base', estimate_row.count_base,
            'count_high', estimate_row.count_high,
            'data_version', estimate_row.data_version,
            'pinned_at', link.pinned_at
        ) ORDER BY link.pinned_at, link.opportunity_segment_link_id
    ), '[]'::jsonb) AS segment_snapshots
    FROM opportunity_segment_link link
    JOIN v_segment_query_result_release_boundary result
      ON result.result_id = link.query_result_id
    JOIN v_estimate_release_boundary estimate_row USING (estimate_id)
    WHERE link.opportunity_id = opportunity.opportunity_id
) segments ON true
LEFT JOIN LATERAL (
    SELECT candidate.*
    FROM opportunity_score_version candidate
    WHERE candidate.opportunity_id = opportunity.opportunity_id
    ORDER BY candidate.version_no DESC
    LIMIT 1
) score ON true
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(latest.content_row ORDER BY latest.content_type, latest.content_key), '[]'::jsonb) AS current_content
    FROM (
        SELECT DISTINCT ON (version.content_type, version.content_key)
            version.content_type,
            version.content_key,
            jsonb_build_object(
                'content_type', version.content_type,
                'content_key', version.content_key,
                'version_no', version.version_no,
                'content', CASE
                    WHEN (
                          version.source_query_result_id IS NOT NULL
                          AND direct_estimate.estimate_id IS NULL
                      )
                      OR (
                          version.source_market_estimate_id IS NOT NULL
                          AND market_base_estimate.estimate_id IS NULL
                      )
                      OR direct_estimate.release_suppressed
                      OR market_base_estimate.release_suppressed
                      OR (
                          version.source_kind IN ('ai_hypothesis', 'derived')
                          AND EXISTS (
                              SELECT 1
                              FROM opportunity_segment_link protected_link
                              JOIN v_segment_query_result_release_boundary protected_result
                                ON protected_result.result_id = protected_link.query_result_id
                              JOIN v_estimate_release_boundary protected_estimate
                                ON protected_estimate.estimate_id = protected_result.estimate_id
                              WHERE protected_link.opportunity_id = opportunity.opportunity_id
                                AND protected_estimate.release_suppressed
                          )
                      )
                    THEN jsonb_build_object(
                        'status', 'suppressed',
                        'reason', CASE
                            WHEN (
                                  version.source_query_result_id IS NOT NULL
                                  AND direct_estimate.estimate_id IS NULL
                              )
                              OR (
                                  version.source_market_estimate_id IS NOT NULL
                                  AND market_base_estimate.estimate_id IS NULL
                              )
                            THEN 'source_release_classification_unavailable'
                            ELSE 'linked_rare_output_below_release_threshold'
                        END,
                        'values_withheld', true,
                        'safe_hypothesis_text_preserved', false
                    )
                    ELSE version.content
                END,
                'source_kind', version.source_kind,
                'source_query_result_id', version.source_query_result_id,
                'source_market_estimate_id', version.source_market_estimate_id,
                'source_subtype_ids', version.source_subtype_ids,
                'source_archetype_ids', version.source_archetype_ids,
                'provider_model', version.provider_model,
                'created_at', version.created_at
            ) AS content_row
        FROM opportunity_content_version version
        LEFT JOIN v_segment_query_result_release_boundary direct_result
          ON direct_result.result_id = version.source_query_result_id
        LEFT JOIN v_estimate_release_boundary direct_estimate
          ON direct_estimate.estimate_id = direct_result.estimate_id
        LEFT JOIN market_estimate content_market
          ON content_market.market_estimate_id = version.source_market_estimate_id
        LEFT JOIN market_scenario content_scenario
          ON content_scenario.scenario_id = content_market.scenario_id
        LEFT JOIN v_segment_query_result_release_boundary market_base_result
          ON market_base_result.result_id = content_scenario.base_query_result_id
        LEFT JOIN v_estimate_release_boundary market_base_estimate
          ON market_base_estimate.estimate_id = market_base_result.estimate_id
        WHERE version.opportunity_id = opportunity.opportunity_id
        ORDER BY version.content_type, version.content_key, version.version_no DESC
    ) latest
) content ON true
LEFT JOIN LATERAL (
    SELECT
        count(*)::integer AS experiment_count,
        count(*) FILTER (WHERE experiment.status IN ('planned', 'running'))::integer AS active_experiment_count
    FROM opportunity_experiment experiment
    WHERE experiment.opportunity_id = opportunity.opportunity_id
) experiments ON true;

-- Global Search now uses the release projection for estimates and treats the
-- policy catalog as the source of truth for targetable condition objects.
-- Read-only explorer metadata may remain elsewhere; protected catalog rows do
-- not receive a Global Search path into Builder or comparison workflows.
CREATE OR REPLACE VIEW v_global_search
WITH (security_invoker = true)
AS
SELECT
    'domain'::text AS object_type,
    domain.domain_id AS object_id,
    NULL::uuid AS workspace_id,
    domain.name_ko AS title,
    domain.description AS summary,
    domain.primary_entity_unit AS entity_unit,
    domain.domain_id,
    concat_ws(' ', domain.domain_code, domain.name_ko, domain.description) AS search_text,
    domain.updated_at,
    '/explore/' || domain.domain_code AS route_path
FROM domain_registry domain
WHERE domain.active AND NOT domain.minor_guardrail

UNION ALL

SELECT
    'axis', dimension.dimension_id, NULL::uuid, dimension.axis_code,
    concat(domain.name_ko, ' · ', dimension.applicability_reason),
    domain.primary_entity_unit, dimension.domain_id,
    concat_ws(' ', domain.domain_code, domain.name_ko, dimension.axis_code, dimension.applicability_reason),
    dimension.updated_at,
    '/explore/' || domain.domain_code || '/axes/' || dimension.axis_code
FROM domain_dimension dimension
JOIN domain_registry domain USING (domain_id)
WHERE EXISTS (
    SELECT 1
    FROM v_condition_catalog catalog
    WHERE catalog.source_kind = 'dimension_value'
      AND catalog.dimension_id = dimension.dimension_id
      AND catalog.queryable
      AND catalog.sensitive_class NOT IN ('minor_protected', 'restricted_targeting')
)

UNION ALL

SELECT
    'feature', catalog.catalog_id, NULL::uuid,
    catalog.label_ko, catalog.definition, catalog.entity_unit, NULL::text,
    catalog.search_text,
    feature.updated_at,
    '/builder?condition=' || catalog.catalog_id
FROM v_condition_catalog catalog
JOIN feature_definition feature ON feature.feature_id::text = catalog.source_record_id
WHERE catalog.source_kind = 'core_feature'
  AND catalog.queryable
  AND catalog.sensitive_class NOT IN ('minor_protected', 'restricted_targeting')

UNION ALL

SELECT
    'feature', catalog.catalog_id, NULL::uuid,
    catalog.label_ko, catalog.definition, catalog.entity_unit, catalog.domain_id,
    catalog.search_text,
    feature.updated_at,
    '/builder?condition=' || catalog.catalog_id
FROM v_condition_catalog catalog
JOIN domain_feature feature ON feature.domain_feature_id = catalog.source_record_id
WHERE catalog.source_kind = 'domain_feature'
  AND catalog.queryable
  AND catalog.sensitive_class NOT IN ('minor_protected', 'restricted_targeting')

UNION ALL

SELECT
    'behavior', catalog.catalog_id, NULL::uuid,
    catalog.label_ko, catalog.definition, catalog.entity_unit, catalog.domain_id,
    catalog.search_text,
    behavior.updated_at,
    '/builder?condition=' || catalog.catalog_id
FROM v_condition_catalog catalog
JOIN domain_behavior_template behavior
  ON behavior.behavior_template_id = catalog.source_record_id
WHERE catalog.source_kind = 'behavior'
  AND catalog.queryable
  AND catalog.sensitive_class NOT IN ('minor_protected', 'restricted_targeting')

UNION ALL

SELECT
    'subtype', subtype.subtype_id, NULL::uuid, subtype.name_ko, subtype.definition,
    domain.primary_entity_unit, subtype.domain_id,
    concat_ws(' ', subtype.subtype_code, subtype.name_ko, subtype.definition, domain.name_ko),
    subtype.updated_at,
    '/segments/subtypes/' || subtype.subtype_id
FROM subtype_definition subtype
JOIN domain_registry domain USING (domain_id)
JOIN v_condition_catalog catalog
  ON catalog.catalog_id = 'subtype:' || subtype.subtype_id
WHERE catalog.queryable
  AND catalog.sensitive_class NOT IN ('minor_protected', 'restricted_targeting')

UNION ALL

SELECT
    'archetype', archetype.archetype_id, NULL::uuid, archetype.name_ko, archetype.one_line_definition,
    archetype.primary_entity_unit, NULL::text,
    concat_ws(' ', archetype.archetype_id, archetype.name_ko, archetype.name_en, archetype.one_line_definition),
    archetype.updated_at,
    '/archetypes/' || archetype.archetype_id
FROM archetype
JOIN v_condition_catalog catalog
  ON catalog.catalog_id = 'archetype:' || archetype.archetype_id
WHERE catalog.queryable
  AND catalog.sensitive_class NOT IN ('minor_protected', 'restricted_targeting')

UNION ALL

SELECT
    'estimate', estimate_row.estimate_id::text, estimate_row.workspace_id,
    concat(estimate_row.subject_type, ' · ', estimate_row.subject_id), estimate_row.formula,
    estimate_row.entity_unit, NULL::text,
    concat_ws(' ', estimate_row.estimate_id::text, estimate_row.subject_type,
                    estimate_row.subject_id, estimate_row.method_code,
                    estimate_row.formula, estimate_row.data_version),
    estimate_row.updated_at,
    '/sizing/' || estimate_row.estimate_id::text
FROM v_estimate_release_boundary estimate_row

UNION ALL

SELECT
    'saved_segment', saved.saved_segment_id::text, saved.workspace_id, saved.title,
    coalesce(saved.description, ''), latest.primary_entity_unit, NULL::text,
    concat_ws(' ', saved.title, saved.description, latest.natural_language_text),
    saved.updated_at,
    '/builder/' || saved.saved_segment_id::text
FROM saved_segment saved
LEFT JOIN v_saved_segment_latest latest USING (saved_segment_id)

UNION ALL

SELECT
    'opportunity', opportunity.opportunity_id::text, board.workspace_id, opportunity.name,
    opportunity.problem_statement, NULL::text, NULL::text,
    concat_ws(' ', opportunity.name, opportunity.problem_statement,
                    opportunity.hypothesis_summary, opportunity.solution_idea),
    opportunity.updated_at,
    '/opportunities/' || opportunity.opportunity_id::text
FROM opportunity
JOIN opportunity_board board USING (opportunity_board_id);

GRANT SELECT ON
    v_condition_catalog,
    v_estimate_release_boundary,
    v_estimate_component_release_boundary,
    v_estimate_assumption_release_boundary,
    v_estimate_sensitivity_release_boundary,
    v_segment_query_result_release_boundary,
    v_estimate_lineage,
    v_archetype_search,
    v_saved_segment_latest,
    v_comparison_detail,
    v_opportunity_snapshot,
    v_global_search
TO market_engine_app, market_engine_worker;

REVOKE EXECUTE ON FUNCTION workbench_assert_release_safe_read_boundary()
FROM PUBLIC, market_engine_app, market_engine_worker;

COMMENT ON VIEW v_estimate_release_boundary IS
    'Release-safe estimate projection. Immutable raw ledgers remain available only to explicit calculation/governance reads.';
COMMENT ON VIEW v_estimate_component_release_boundary IS
    'Release-safe estimate component projection with rare human values withheld.';
COMMENT ON VIEW v_estimate_assumption_release_boundary IS
    'Release-safe estimate assumption projection with rare human values withheld.';
COMMENT ON VIEW v_estimate_sensitivity_release_boundary IS
    'Release-safe estimate sensitivity projection with rare human values withheld.';
COMMENT ON VIEW v_segment_query_result_release_boundary IS
    'Release-safe query-result projection with canonical value-free summaries for suppressed estimates.';

COMMIT;
