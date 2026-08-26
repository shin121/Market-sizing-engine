BEGIN;

-- Phase 3R-7R reads only calibrated Production Data Mart records.  These
-- views intentionally do not union workspace fixtures or operational E2E rows.
CREATE OR REPLACE VIEW production.v_workbench_archetype_primary_context
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    summary.*,
    count(*) OVER (PARTITION BY summary.archetype_id)::integer AS domain_context_count,
    row_number() OVER (
      PARTITION BY summary.archetype_id
      ORDER BY
        summary.confidence_score DESC,
        summary.estimated_count_base DESC,
        summary.domain_context_id
    ) AS context_rank
  FROM production.v_archetype_market_summary summary
)
SELECT *
FROM ranked
WHERE context_rank = 1;

CREATE OR REPLACE VIEW production.v_workbench_market_sizing_directory
WITH (security_invoker = true) AS
SELECT
  'domain-market:' || domain.domain_id AS estimate_id,
  'domain'::text AS subject_type,
  domain.domain_id AS subject_id,
  domain.display_name_ko,
  '대한민국 ' || domain.display_name_ko || ' 참여 시장의 보정 모집단' AS description_ko,
  domain.entity_unit,
  domain.count_low,
  domain.count_base,
  domain.count_high,
  domain.participation_share_low AS share_low,
  domain.participation_share_base AS share_base,
  domain.participation_share_high AS share_high,
  domain.geography_scope,
  domain.reference_year,
  domain.estimate_grade,
  domain.confidence_score,
  domain.method_code,
  domain.formula,
  domain.source_release_ids,
  domain.calibration_version AS model_version,
  domain.uncertainty_method,
  domain.status,
  domain.updated_at
FROM production.v_domain_market_summary domain

UNION ALL

SELECT
  'gold-query:' || gold.query_id AS estimate_id,
  'gold_query'::text AS subject_type,
  gold.query_id AS subject_id,
  gold.display_name_ko,
  '대표 복합조건 시장질의 · Weighted Synthetic Population 기반 교집합 추정' AS description_ko,
  gold.entity_unit,
  gold.count_low,
  gold.count_base,
  gold.count_high,
  gold.share_low,
  gold.share_base,
  gold.share_high,
  gold.geography_scope,
  gold.reference_year,
  gold.estimate_grade,
  gold.confidence_score,
  gold.dependency_method AS method_code,
  gold.formula,
  gold.source_release_ids,
  gold.snapshot_hash AS model_version,
  gold.uncertainty_method,
  gold.status,
  gold.updated_at
FROM production.v_gold_query_result gold;

-- Operational workspace records are writable, unlike the calibrated mart, but
-- their production read boundary must never surface integration/E2E fixtures.
-- The predicate is deliberately centralized so every workbench read model uses
-- the same definition and newly-created real workspace records appear at once.
CREATE OR REPLACE FUNCTION production.is_fixture_text(value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT coalesce(value, '') ~* (
    '(\[integration([^]]*)?\]|(^|[^[:alnum:]_])'
    || '(e2e|fixture|16[- ]?step|test[ _-](user|segment|estimate|opportunity|saved))'
    || '($|[^[:alnum:]_])|테스트[ _-]?(사용자|세그먼트|추정|기회))'
  );
$$;

CREATE OR REPLACE VIEW production.v_workbench_saved_segment
WITH (security_invoker = true) AS
SELECT latest.*
FROM public.v_saved_segment_latest latest
WHERE NOT production.is_fixture_text(latest.title)
  AND NOT production.is_fixture_text(latest.natural_language_text);

CREATE OR REPLACE VIEW production.v_workbench_opportunity_snapshot
WITH (security_invoker = true) AS
SELECT snapshot.*
FROM public.v_opportunity_snapshot snapshot
WHERE NOT production.is_fixture_text(snapshot.board_name)
  AND NOT production.is_fixture_text(snapshot.name)
  AND NOT EXISTS (
    SELECT 1
    FROM public.opportunity_segment_link link
    LEFT JOIN public.saved_segment saved
      ON saved.saved_segment_id = link.saved_segment_id
    LEFT JOIN public.segment_query query
      ON query.query_id = (
        SELECT version.query_id
        FROM public.saved_segment_version version
        WHERE version.saved_segment_id = link.saved_segment_id
        ORDER BY version.version_no DESC
        LIMIT 1
      )
    WHERE link.opportunity_id = snapshot.opportunity_id
      AND (
        production.is_fixture_text(saved.title)
        OR production.is_fixture_text(query.name)
      )
  );

CREATE OR REPLACE VIEW production.v_workbench_opportunity_board
WITH (security_invoker = true) AS
SELECT board.*,
  count(snapshot.opportunity_id)::integer AS opportunity_count
FROM public.opportunity_board board
LEFT JOIN production.v_workbench_opportunity_snapshot snapshot
  ON snapshot.opportunity_board_id = board.opportunity_board_id
WHERE NOT production.is_fixture_text(board.name)
GROUP BY board.opportunity_board_id;

CREATE OR REPLACE VIEW production.v_workbench_research_review_queue
WITH (security_invoker = true) AS
SELECT queue.*
FROM public.v_research_review_queue queue
WHERE NOT production.is_fixture_text(queue.research_question)
  AND NOT production.is_fixture_text(queue.target_segment)
  AND NOT production.is_fixture_text(queue.target_variable);

CREATE OR REPLACE VIEW production.v_workbench_comparison_detail
WITH (security_invoker = true) AS
SELECT comparison.*
FROM public.v_comparison_detail comparison
WHERE NOT production.is_fixture_text(comparison.comparison_name)
  AND NOT production.is_fixture_text(comparison.segment_name)
  AND NOT production.is_fixture_text(comparison.display_label);

CREATE OR REPLACE VIEW production.v_workbench_product_dod
WITH (security_invoker = true) AS
SELECT
  (SELECT count(*) FROM production.v_domain_market_summary) AS domain_count,
  (SELECT count(*) FROM production.v_subtype_market_summary) AS subtype_count,
  (SELECT count(DISTINCT archetype_id) FROM production.v_archetype_market_summary) AS archetype_count,
  (SELECT count(*) FROM production.v_axis_distribution) AS axis_value_count,
  (SELECT count(*) FROM production.v_feature_prevalence) AS feature_count,
  (SELECT count(*) FROM production.v_behavior_prevalence) AS behavior_count,
  (SELECT count(*) FROM production.v_gold_query_result) AS gold_query_count,
  (SELECT count(*) FROM production.v_primary_explorer WHERE status = 'not_estimable') AS primary_not_estimable_count,
  (
    (SELECT count(*) FROM production.v_workbench_saved_segment
      WHERE production.is_fixture_text(title))
    + (SELECT count(*) FROM production.v_workbench_opportunity_snapshot
      WHERE production.is_fixture_text(name) OR production.is_fixture_text(board_name))
    + (SELECT count(*) FROM production.v_workbench_research_review_queue
      WHERE production.is_fixture_text(research_question) OR production.is_fixture_text(target_segment))
    + (SELECT count(*) FROM production.v_workbench_comparison_detail
      WHERE production.is_fixture_text(comparison_name) OR production.is_fixture_text(segment_name))
  ) AS fixture_count,
  (SELECT count(*) FROM production.v_primary_explorer
    WHERE display_name_ko IS NULL OR btrim(display_name_ko) = '') AS missing_display_name_count;

-- Bridge the calibrated Phase 2R-B mart into the immutable estimate boundary
-- used by the Builder. One deterministic primary Domain context is retained
-- per Archetype; every additional context remains available in the production
-- Archetype read model and is never summed into this reusable snapshot.
WITH bridge_context AS (
  SELECT
    (SELECT geography_id FROM geography WHERE code = 'KR' ORDER BY valid_from DESC LIMIT 1) AS geography_id,
    (SELECT period_id FROM time_period WHERE label = '2024' ORDER BY start_date DESC LIMIT 1) AS period_id,
    model.model_version_id,
    run.run_id
  FROM model_version model
  JOIN LATERAL (
    SELECT pipeline.run_id
    FROM pipeline_run pipeline
    WHERE pipeline.model_version_id = model.model_version_id
      AND pipeline.status = 'success'
    ORDER BY pipeline.started_at DESC
    LIMIT 1
  ) run ON true
  WHERE model.version = 'kr-v0.2.1'
), upserted_archetype_estimate AS (
  INSERT INTO estimate (
    external_estimate_key, workspace_id, subject_type, subject_id, entity_unit,
    geography_id, period_id, denominator_definition,
    count_low, count_base, count_high, share_low, share_base, share_high,
    method_code, formula, precision_rule, model_version_id, run_id,
    status, data_version, created_by_run_id, data_layer, approval_status,
    calculation_input_hash, dependency_fingerprint
  )
  SELECT
    'phase2r-b:archetype-primary:' || market.archetype_id,
    NULL,
    'archetype',
    market.archetype_id,
    market.entity_unit,
    bridge.geography_id,
    bridge.period_id,
    'Phase 2R-B calibrated parent population for ' || market.domain_context_id
      || '; overlapping Domain contexts must not be summed',
    market.estimated_count_low,
    market.estimated_count_base,
    market.estimated_count_high,
    market.estimated_share_low,
    market.estimated_share_base,
    market.estimated_share_high,
    market.calibration_method,
    'parent_population × calibrated_synthetic_membership_share',
    market.uncertainty_method,
    bridge.model_version_id,
    bridge.run_id,
    'estimated',
    market.calibration_version,
    bridge.run_id,
    'baseline',
    'approved',
    md5(concat_ws('|', market.archetype_id, market.domain_context_id,
      market.estimated_count_low, market.estimated_count_base, market.estimated_count_high,
      market.calibration_version)),
    md5(concat_ws('|', market.archetype_id, market.domain_context_id,
      market.supporting_sources::text, market.calibration_version))
  FROM production.v_workbench_archetype_primary_context market
  CROSS JOIN bridge_context bridge
  ON CONFLICT (external_estimate_key) WHERE external_estimate_key IS NOT NULL
  DO UPDATE SET
    entity_unit = excluded.entity_unit,
    geography_id = excluded.geography_id,
    period_id = excluded.period_id,
    denominator_definition = excluded.denominator_definition,
    count_low = excluded.count_low,
    count_base = excluded.count_base,
    count_high = excluded.count_high,
    share_low = excluded.share_low,
    share_base = excluded.share_base,
    share_high = excluded.share_high,
    method_code = excluded.method_code,
    formula = excluded.formula,
    precision_rule = excluded.precision_rule,
    model_version_id = excluded.model_version_id,
    run_id = excluded.run_id,
    status = excluded.status,
    data_version = excluded.data_version,
    created_by_run_id = excluded.created_by_run_id,
    data_layer = excluded.data_layer,
    approval_status = excluded.approval_status,
    calculation_input_hash = excluded.calculation_input_hash,
    dependency_fingerprint = excluded.dependency_fingerprint,
    updated_at = now()
  RETURNING estimate_id
)
SELECT count(*) FROM upserted_archetype_estimate;

WITH market AS (
  SELECT primary_context.*,
         confidence.source_quality,
         confidence.recency,
         confidence.definition_match,
         confidence.geography_match,
         confidence.direct_observation,
         confidence.calibration_fit,
         confidence.mapping_coverage,
         confidence.effective_sample_size_score,
         confidence.dependency_risk_score,
         confidence.proxy_retention_score,
         confidence.model_stability,
         confidence.formula_version
  FROM production.v_workbench_archetype_primary_context primary_context
  JOIN production.v_confidence_breakdown confidence
    ON confidence.subject_type = 'archetype'
   AND confidence.subject_id = primary_context.archetype_id || ':' || primary_context.domain_context_id
), estimate_context AS (
  SELECT estimate.estimate_id, estimate.created_by_run_id, market.*
  FROM estimate
  JOIN market ON estimate.external_estimate_key = 'phase2r-b:archetype-primary:' || market.archetype_id
)
INSERT INTO confidence_assessment (
  estimate_id, source_quality_score, recency_score, directness_score,
  joint_observation_score, model_reliance_score, total_score, grade,
  rationale, data_version, created_by_run_id, rule_version,
  components_json, penalties_json, validation_gap_reviewed_at
)
SELECT
  estimate_id,
  round(confidence_score * 0.30)::smallint,
  round(confidence_score * 0.15)::smallint,
  round(confidence_score * 0.20)::smallint,
  round(confidence_score * 0.20)::smallint,
  (confidence_score
    - round(confidence_score * 0.30)
    - round(confidence_score * 0.15)
    - round(confidence_score * 0.20)
    - round(confidence_score * 0.20))::smallint,
  confidence_score::smallint,
  estimate_grade,
  'Authoritative Phase 2R-B rule-based confidence; legacy five-bucket fields are compatibility allocations and components_json is authoritative.',
  calibration_version,
  created_by_run_id,
  formula_version,
  jsonb_build_object(
    'sourceQuality', source_quality,
    'recency', recency,
    'definitionMatch', definition_match,
    'geographyMatch', geography_match,
    'directObservation', direct_observation,
    'calibrationFit', calibration_fit,
    'mappingCoverage', mapping_coverage,
    'effectiveSampleSizeScore', effective_sample_size_score,
    'dependencyRiskScore', dependency_risk_score,
    'proxyRetentionScore', proxy_retention_score,
    'modelStability', model_stability
  ),
  '[]'::jsonb,
  now()
FROM estimate_context
ON CONFLICT (estimate_id) DO UPDATE SET
  source_quality_score = excluded.source_quality_score,
  recency_score = excluded.recency_score,
  directness_score = excluded.directness_score,
  joint_observation_score = excluded.joint_observation_score,
  model_reliance_score = excluded.model_reliance_score,
  total_score = excluded.total_score,
  grade = excluded.grade,
  rationale = excluded.rationale,
  data_version = excluded.data_version,
  created_by_run_id = excluded.created_by_run_id,
  rule_version = excluded.rule_version,
  components_json = excluded.components_json,
  penalties_json = excluded.penalties_json,
  validation_gap_reviewed_at = excluded.validation_gap_reviewed_at,
  updated_at = now();

WITH bridge_context AS (
  SELECT
    (SELECT period_id FROM time_period WHERE label = '2024' ORDER BY start_date DESC LIMIT 1) AS period_id,
    model.model_version_id,
    run.run_id
  FROM model_version model
  JOIN LATERAL (
    SELECT pipeline.run_id
    FROM pipeline_run pipeline
    WHERE pipeline.model_version_id = model.model_version_id
      AND pipeline.status = 'success'
    ORDER BY pipeline.started_at DESC
    LIMIT 1
  ) run ON true
  WHERE model.version = 'kr-v0.2.1'
), components AS (
  SELECT
    estimate.estimate_id,
    market.*,
    bridge.period_id,
    bridge.model_version_id,
    bridge.run_id
  FROM production.v_workbench_archetype_primary_context market
  JOIN estimate
    ON estimate.external_estimate_key = 'phase2r-b:archetype-primary:' || market.archetype_id
  CROSS JOIN bridge_context bridge
)
INSERT INTO estimate_component (
  estimate_id, component_type, value_low, value_base, value_high, unit,
  operation, sequence, data_version, created_by_run_id, component_code,
  denominator_definition, conditional_probability, reference_period_id,
  directness_class, dependency_group, model_version_id, adjustment_reason,
  metadata_json
)
SELECT
  estimate_id,
  component_type,
  value_low,
  value_base,
  value_high,
  unit,
  operation,
  sequence,
  calibration_version,
  run_id,
  component_code,
  denominator_definition,
  conditional_probability,
  period_id,
  directness_class,
  'phase2r-b-archetype-calibration',
  model_version_id,
  adjustment_reason,
  metadata_json
FROM components
CROSS JOIN LATERAL (
  VALUES
    ('parent_population'::text,
      components.parent_population, components.parent_population, components.parent_population,
      components.entity_unit, 'input'::text, 1, 'parent_population'::text,
      'Official unit parent population for ' || components.domain_context_id,
      NULL::numeric, 'direct_observation'::text,
      'Official parent Universe used by the calibrated Archetype context.',
      jsonb_build_object('domainContextId', components.domain_context_id,
                         'supportingSources', components.supporting_sources)),
    ('calibrated_membership_share'::text,
      components.estimated_share_low, components.estimated_share_base, components.estimated_share_high,
      'share'::text, 'multiply'::text, 2, 'calibrated_membership_share'::text,
      'Conditional calibrated membership within ' || components.domain_context_id,
      components.estimated_share_base, 'inference'::text,
      components.calibration_method,
      jsonb_build_object('effectiveSampleSize', components.effective_sample_size,
                         'allocationSemantics', components.allocation_semantics,
                         'uncertaintyMethod', components.uncertainty_method,
                         'supportingSources', components.supporting_sources))
) factor(component_type, value_low, value_base, value_high, unit, operation,
         sequence, component_code, denominator_definition, conditional_probability,
         directness_class, adjustment_reason, metadata_json)
ON CONFLICT (estimate_id, component_code) WHERE component_code IS NOT NULL
DO UPDATE SET
  component_type = excluded.component_type,
  value_low = excluded.value_low,
  value_base = excluded.value_base,
  value_high = excluded.value_high,
  unit = excluded.unit,
  operation = excluded.operation,
  sequence = excluded.sequence,
  data_version = excluded.data_version,
  created_by_run_id = excluded.created_by_run_id,
  denominator_definition = excluded.denominator_definition,
  conditional_probability = excluded.conditional_probability,
  reference_period_id = excluded.reference_period_id,
  directness_class = excluded.directness_class,
  dependency_group = excluded.dependency_group,
  model_version_id = excluded.model_version_id,
  adjustment_reason = excluded.adjustment_reason,
  metadata_json = excluded.metadata_json,
  updated_at = now();

GRANT SELECT ON
  production.v_workbench_archetype_primary_context,
  production.v_workbench_market_sizing_directory,
  production.v_workbench_saved_segment,
  production.v_workbench_opportunity_snapshot,
  production.v_workbench_opportunity_board,
  production.v_workbench_research_review_queue,
  production.v_workbench_comparison_detail,
  production.v_workbench_product_dod
TO market_engine_app, market_engine_worker;

GRANT EXECUTE ON FUNCTION production.is_fixture_text(text)
TO market_engine_app, market_engine_worker;

COMMIT;
