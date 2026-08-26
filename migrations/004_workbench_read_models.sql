BEGIN;

-- Read models are ordinary PostgreSQL views over the normalized Phase 1-3
-- records. They never embed demo counts or manufacture missing distributions.
-- Workspace-aware views use security_invoker so underlying RLS remains active.

CREATE OR REPLACE VIEW v_domain_dimension_value
WITH (security_invoker = true)
AS
SELECT
    dd.dimension_id,
    dd.domain_id,
    dr.domain_code,
    dd.axis_code,
    dd.applicability,
    dd.applicability_reason,
    value_row.ordinality::integer AS value_order,
    value_row.value_json,
    value_row.value_json #>> '{}' AS value_text,
    dd.data_version,
    dd.updated_at
FROM domain_dimension dd
JOIN domain_registry dr USING (domain_id)
CROSS JOIN LATERAL jsonb_array_elements(
    CASE
        WHEN jsonb_typeof(dd.allowed_values) = 'array' THEN dd.allowed_values
        ELSE '[]'::jsonb
    END
) WITH ORDINALITY AS value_row(value_json, ordinality);

CREATE OR REPLACE VIEW v_condition_catalog
WITH (security_invoker = true)
AS
SELECT
    'core_feature:' || fd.feature_code AS catalog_id,
    'core_feature'::text AS source_kind,
    fd.feature_id::text AS source_record_id,
    NULL::text AS domain_id,
    NULL::text AS dimension_id,
    fd.feature_code AS source_code,
    fd.label_ko,
    fd.definition,
    fd.entity_unit,
    fd.data_type,
    coalesce(fd.allowed_values, '[]'::jsonb) AS allowed_values,
    fd.sensitive_class,
    fd.queryable,
    concat_ws(' ', fd.feature_code, fd.label_ko, fd.definition) AS search_text
FROM feature_definition fd

UNION ALL

SELECT
    'domain_feature:' || df.domain_feature_id,
    'domain_feature',
    df.domain_feature_id,
    df.domain_id,
    df.dimension_id,
    df.feature_code,
    df.label_ko,
    concat(df.label_ko, ' — ', df.observable_status, ', ', df.targetability_class),
    dr.primary_entity_unit,
    df.data_type,
    coalesce(df.allowed_values, '[]'::jsonb),
    df.sensitive_class,
    df.queryable,
    concat_ws(' ', df.feature_code, df.label_ko, dr.name_ko, df.observable_status, df.targetability_class)
FROM domain_feature df
JOIN domain_registry dr USING (domain_id)

UNION ALL

SELECT
    'dimension_value:' || dv.dimension_id || ':' || dv.value_order::text,
    'dimension_value',
    dv.dimension_id || ':' || dv.value_order::text,
    dv.domain_id,
    dv.dimension_id,
    dv.axis_code,
    dv.value_text,
    dv.applicability_reason,
    dr.primary_entity_unit,
    'category',
    jsonb_build_array(dv.value_json),
    'non_sensitive',
    dv.applicability = 'applicable',
    concat_ws(' ', dv.domain_code, dr.name_ko, dv.axis_code, dv.value_text, dv.applicability_reason)
FROM v_domain_dimension_value dv
JOIN domain_registry dr USING (domain_id)

UNION ALL

SELECT
    'behavior:' || dbt.behavior_template_id,
    'behavior',
    dbt.behavior_template_id,
    dbt.domain_id,
    NULL::text,
    dbt.behavior_code,
    dbt.name_ko,
    dbt.definition,
    dr.primary_entity_unit,
    'json',
    jsonb_build_array(dbt.rule_json),
    'non_sensitive',
    true,
    concat_ws(' ', dbt.behavior_code, dbt.name_ko, dbt.definition, dr.name_ko)
FROM domain_behavior_template dbt
JOIN domain_registry dr USING (domain_id)

UNION ALL

SELECT
    'tag:' || dt.tag_id,
    'tag',
    dt.tag_id,
    dt.domain_id,
    NULL::text,
    dt.tag_code,
    dt.name_ko,
    concat(dt.tag_type, ' tag; non-additive=', NOT dt.additive, '; provenance=', dt.provenance),
    dr.primary_entity_unit,
    'category',
    jsonb_build_array(to_jsonb(dt.tag_code)),
    'non_sensitive',
    true,
    concat_ws(' ', dt.tag_code, dt.name_ko, dt.tag_type, dr.name_ko)
FROM domain_tag dt
JOIN domain_registry dr USING (domain_id)

UNION ALL

SELECT
    'subtype:' || sd.subtype_id,
    'subtype',
    sd.subtype_id,
    sd.domain_id,
    NULL::text,
    sd.subtype_code,
    sd.name_ko,
    sd.definition,
    dr.primary_entity_unit,
    'category',
    jsonb_build_array(to_jsonb(sd.subtype_code)),
    'non_sensitive',
    sd.is_primary,
    concat_ws(' ', sd.subtype_code, sd.name_ko, sd.definition, dr.name_ko)
FROM subtype_definition sd
JOIN domain_registry dr USING (domain_id)

UNION ALL

SELECT
    'archetype:' || a.archetype_id,
    'archetype',
    a.archetype_id,
    NULL::text,
    NULL::text,
    a.archetype_id,
    a.name_ko,
    a.one_line_definition,
    a.primary_entity_unit,
    'category',
    jsonb_build_array(to_jsonb(a.archetype_id)),
    'non_sensitive',
    a.status <> 'deprecated',
    concat_ws(' ', a.archetype_id, a.name_ko, a.name_en, a.one_line_definition)
FROM archetype a

UNION ALL

SELECT
    'geography:' || g.geography_id::text,
    'geography',
    g.geography_id::text,
    NULL::text,
    NULL::text,
    g.code,
    g.name_ko,
    concat('administrative geography level=', g.level),
    'all',
    'category',
    jsonb_build_array(to_jsonb(g.code)),
    'non_sensitive',
    g.valid_to IS NULL OR g.valid_to >= current_date,
    concat_ws(' ', g.code, g.name_ko, g.level)
FROM geography g;

CREATE OR REPLACE VIEW v_explorer_domain_summary
WITH (security_invoker = true)
AS
WITH dimension_count AS (
    SELECT domain_id, count(*)::integer AS axis_count
    FROM domain_dimension
    GROUP BY domain_id
), feature_count AS (
    SELECT domain_id,
           count(*)::integer AS feature_count,
           count(*) FILTER (WHERE queryable)::integer AS queryable_feature_count
    FROM domain_feature
    GROUP BY domain_id
), behavior_count AS (
    SELECT domain_id, count(*)::integer AS behavior_count
    FROM domain_behavior_template
    GROUP BY domain_id
), subtype_stats AS (
    SELECT sd.domain_id,
           count(*) FILTER (WHERE sd.is_primary)::integer AS primary_subtype_count,
           round(avg(sc.total_score)::numeric, 2) AS average_confidence_score,
           min(sc.grade) AS lowest_confidence_grade
    FROM subtype_definition sd
    LEFT JOIN subtype_confidence sc USING (subtype_id)
    GROUP BY sd.domain_id
), hierarchy_count AS (
    SELECT domain_id,
           count(*) FILTER (WHERE hierarchy_level = 2)::integer AS reusable_archetype_count
    FROM archetype_hierarchy
    GROUP BY domain_id
), parent_stats AS (
    SELECT pdd.domain_id,
           count(*)::integer AS phase1_parent_decision_count,
           count(*) FILTER (WHERE pdd.decision = 'eligible')::integer AS eligible_parent_count
    FROM parent_decomposition_decision pdd
    WHERE pdd.domain_id IS NOT NULL
    GROUP BY pdd.domain_id
), allocation_count AS (
    SELECT sd.domain_id, count(*)::integer AS parent_allocation_count
    FROM subtype_allocation sa
    JOIN subtype_definition sd USING (subtype_id)
    GROUP BY sd.domain_id
), source_count AS (
    SELECT df.domain_id, count(DISTINCT dfs.release_id)::integer AS source_release_count
    FROM domain_feature df
    JOIN domain_feature_source dfs USING (domain_feature_id)
    GROUP BY df.domain_id
)
SELECT
    dr.domain_id,
    dr.domain_code,
    dr.name_ko,
    dr.description,
    dr.primary_entity_unit,
    c.code AS category_code,
    c.name_ko AS category_name_ko,
    dr.coverage_status,
    dr.active,
    dr.minor_guardrail,
    coalesce(dc.axis_count, 0) AS axis_count,
    coalesce(fc.feature_count, 0) AS feature_count,
    coalesce(fc.queryable_feature_count, 0) AS queryable_feature_count,
    coalesce(bc.behavior_count, 0) AS behavior_count,
    coalesce(ss.primary_subtype_count, 0) AS primary_subtype_count,
    coalesce(hc.reusable_archetype_count, 0) AS reusable_archetype_count,
    coalesce(ps.phase1_parent_decision_count, 0) AS phase1_parent_decision_count,
    coalesce(ps.eligible_parent_count, 0) AS eligible_parent_count,
    coalesce(ac.parent_allocation_count, 0) AS parent_allocation_count,
    coalesce(src.source_release_count, 0) AS source_release_count,
    ss.average_confidence_score,
    ss.lowest_confidence_grade,
    coverage.coverage_score,
    coverage.confidence_grade AS coverage_confidence_grade,
    coverage.gaps_json AS coverage_gaps,
    model.segmentation_model_id,
    model.algorithm AS segmentation_algorithm,
    model.selected_k,
    model.sample_size,
    model.effective_sample_size,
    mv.version AS model_version,
    profile.reference_period,
    profile.profile_json,
    'not_estimable'::text AS domain_population_status,
    NULL::numeric AS count_low,
    NULL::numeric AS count_base,
    NULL::numeric AS count_high,
    'No canonical whole-domain population estimate is stored; parent/subtype context is required.'::text AS count_status_reason,
    greatest(
        dr.updated_at,
        coalesce(coverage.updated_at, dr.updated_at),
        coalesce(profile.updated_at, dr.updated_at),
        coalesce(model.updated_at, dr.updated_at)
    ) AS updated_at
FROM domain_registry dr
JOIN category c USING (category_id)
LEFT JOIN dimension_count dc USING (domain_id)
LEFT JOIN feature_count fc USING (domain_id)
LEFT JOIN behavior_count bc USING (domain_id)
LEFT JOIN subtype_stats ss USING (domain_id)
LEFT JOIN hierarchy_count hc USING (domain_id)
LEFT JOIN parent_stats ps USING (domain_id)
LEFT JOIN allocation_count ac USING (domain_id)
LEFT JOIN source_count src USING (domain_id)
LEFT JOIN LATERAL (
    SELECT dca.*
    FROM domain_coverage_audit dca
    WHERE dca.domain_id = dr.domain_id
    ORDER BY dca.audited_at DESC, dca.created_at DESC
    LIMIT 1
) coverage ON true
LEFT JOIN LATERAL (
    SELECT sm.*
    FROM segmentation_model sm
    WHERE sm.domain_id = dr.domain_id AND sm.status = 'selected'
    ORDER BY sm.created_at DESC
    LIMIT 1
) model ON true
LEFT JOIN model_version mv ON mv.model_version_id = model.model_version_id
LEFT JOIN LATERAL (
    SELECT dps.*
    FROM domain_profile_summary dps
    WHERE dps.domain_id = dr.domain_id
    ORDER BY dps.created_at DESC
    LIMIT 1
) profile ON true;

CREATE OR REPLACE VIEW v_subtype_explorer_detail
WITH (security_invoker = true)
AS
WITH allocation_stats AS (
    SELECT subtype_id,
           count(*)::integer AS parent_allocation_count,
           min(share_base) AS minimum_parent_share_base,
           max(share_base) AS maximum_parent_share_base
    FROM subtype_allocation
    GROUP BY subtype_id
), tag_stats AS (
    SELECT subtype_id, count(*)::integer AS tag_count
    FROM subtype_tag_allocation
    GROUP BY subtype_id
), representative_stats AS (
    SELECT cd.cluster_id, count(cr.cluster_representative_id)::integer AS representative_count
    FROM cluster_definition cd
    LEFT JOIN cluster_representative cr USING (cluster_id)
    GROUP BY cd.cluster_id
)
SELECT
    sd.subtype_id,
    sd.subtype_code,
    sd.name_ko,
    sd.definition,
    sd.label_status,
    sd.evidence_boundary,
    dr.domain_id,
    dr.domain_code,
    dr.name_ko AS domain_name_ko,
    dr.primary_entity_unit,
    sm.segmentation_model_id,
    sm.algorithm,
    sm.selected_k,
    mv.version AS model_version,
    cd.cluster_number,
    cd.raw_cluster_number,
    cd.post_hoc_label_ko,
    cd.hard_support AS cluster_hard_support,
    sms.weighted_prevalence_low AS domain_share_low,
    sms.weighted_prevalence_base AS domain_share_base,
    sms.weighted_prevalence_high AS domain_share_high,
    sms.effective_sample_size,
    sms.entropy,
    sms.stability_score,
    sms.hard_support,
    sc.population_confidence_score,
    sc.population_confidence_grade,
    sc.interpretation_confidence_score,
    sc.interpretation_confidence_grade,
    sc.targetability_confidence_score,
    sc.targetability_confidence_grade,
    sc.total_score AS confidence_score,
    sc.grade AS confidence_grade,
    sc.gaps_json AS confidence_gaps,
    sc.validation_plan,
    sp.observed_evidence,
    sp.assumptions_json,
    sp.inferred_profile,
    sp.jobs_to_be_done,
    sp.triggers,
    sp.barriers,
    sp.engagement_modes,
    sp.creative_hypotheses,
    sp.prohibited_inferences,
    activation.targetability_class,
    activation.platform_claim_status,
    activation.activation_payload,
    coalesce(ast.parent_allocation_count, 0) AS parent_allocation_count,
    ast.minimum_parent_share_base,
    ast.maximum_parent_share_base,
    coalesce(ts.tag_count, 0) AS overlapping_tag_count,
    coalesce(rs.representative_count, 0) AS representative_count,
    'parent_context_required'::text AS population_count_status,
    NULL::numeric AS count_low,
    NULL::numeric AS count_base,
    NULL::numeric AS count_high
FROM subtype_definition sd
JOIN domain_registry dr USING (domain_id)
JOIN cluster_definition cd USING (cluster_id)
JOIN segmentation_model sm USING (segmentation_model_id)
LEFT JOIN model_version mv ON mv.model_version_id = sm.model_version_id
LEFT JOIN subtype_membership_summary sms
    ON sms.subtype_id = sd.subtype_id
   AND sms.segmentation_model_id = sm.segmentation_model_id
LEFT JOIN subtype_confidence sc ON sc.subtype_id = sd.subtype_id
LEFT JOIN subtype_profile sp ON sp.subtype_id = sd.subtype_id
LEFT JOIN LATERAL (
    SELECT am.*
    FROM activation_mapping am
    WHERE am.subtype_id = sd.subtype_id
    ORDER BY am.updated_at DESC, am.created_at DESC
    LIMIT 1
) activation ON true
LEFT JOIN allocation_stats ast ON ast.subtype_id = sd.subtype_id
LEFT JOIN tag_stats ts ON ts.subtype_id = sd.subtype_id
LEFT JOIN representative_stats rs ON rs.cluster_id = cd.cluster_id;

CREATE OR REPLACE VIEW v_archetype_search
WITH (security_invoker = true)
AS
SELECT
    a.archetype_id,
    a.name_ko,
    a.name_en,
    a.one_line_definition,
    a.primary_entity_unit,
    a.age_min,
    a.age_max,
    a.status AS archetype_status,
    a.version AS archetype_version,
    c.code AS category_code,
    c.name_ko AS category_name_ko,
    rule.rule_json,
    rule.rule_hash,
    rule.deterministic_or_probabilistic,
    ap.observable_traits,
    ap.inferred_needs,
    ap.triggers,
    ap.objections,
    ap.channels,
    ap.inference_disclosure,
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
    concat_ws(' ', a.archetype_id, a.name_ko, a.name_en, a.one_line_definition, c.name_ko) AS search_text,
    greatest(a.updated_at, coalesce(estimate_row.updated_at, a.updated_at)) AS updated_at
FROM archetype a
JOIN category c USING (category_id)
LEFT JOIN LATERAL (
    SELECT ar.*
    FROM archetype_rule ar
    WHERE ar.archetype_id = a.archetype_id
    ORDER BY ar.updated_at DESC, ar.rule_version DESC
    LIMIT 1
) rule ON true
LEFT JOIN archetype_profile ap ON ap.archetype_id = a.archetype_id
LEFT JOIN LATERAL (
    SELECT ar.source_kind, ar.source_persona_key, ar.representative_summary
    FROM archetype_representative ar
    WHERE ar.archetype_id = a.archetype_id
    ORDER BY ar.rank
    LIMIT 1
) representative ON true
LEFT JOIN LATERAL (
    SELECT e.*
    FROM estimate e
    WHERE e.subject_type = 'archetype'
      AND e.subject_id = a.archetype_id
      AND e.approval_status IN ('approved','not_required')
    ORDER BY
        CASE e.data_layer WHEN 'approved_version' THEN 0 WHEN 'baseline' THEN 1 ELSE 2 END,
        e.created_at DESC
    LIMIT 1
) estimate_row ON true
LEFT JOIN confidence_assessment confidence ON confidence.estimate_id = estimate_row.estimate_id
LEFT JOIN LATERAL (
    SELECT count(*)::integer AS validation_gap_count
    FROM validation_gap vg
    WHERE vg.archetype_id = a.archetype_id
       OR vg.estimate_id = estimate_row.estimate_id
) gaps ON true;

CREATE OR REPLACE VIEW v_estimate_lineage
WITH (security_invoker = true)
AS
SELECT
    e.estimate_id,
    e.external_estimate_key,
    e.workspace_id,
    e.subject_type,
    e.subject_id,
    e.entity_unit,
    e.status,
    e.data_layer,
    e.approval_status,
    e.supersedes_estimate_id,
    e.publication_version_id,
    e.count_low,
    e.count_base,
    e.count_high,
    e.share_low,
    e.share_base,
    e.share_high,
    e.denominator_definition,
    e.method_code,
    e.formula,
    e.precision_rule,
    g.code AS geography_code,
    g.name_ko AS geography_name_ko,
    tp.label AS reference_period,
    mv.version AS model_version,
    pr.pipeline_name,
    e.calculation_input_hash,
    e.dependency_fingerprint,
    confidence.confidence_json,
    components.components_json,
    assumptions.assumptions_json,
    gaps.validation_gaps_json,
    dependencies.dependencies_json,
    sources.sources_json,
    e.created_at,
    e.updated_at,
    e.data_version
FROM estimate e
JOIN geography g USING (geography_id)
JOIN time_period tp USING (period_id)
JOIN model_version mv USING (model_version_id)
JOIN pipeline_run pr ON pr.run_id = e.run_id
LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
        'source_quality_score', ca.source_quality_score,
        'recency_score', ca.recency_score,
        'directness_score', ca.directness_score,
        'joint_observation_score', ca.joint_observation_score,
        'model_reliance_score', ca.model_reliance_score,
        'total_score', ca.total_score,
        'grade', ca.grade,
        'rationale', ca.rationale,
        'rule_version', ca.rule_version,
        'components', ca.components_json,
        'penalties', ca.penalties_json
    ) AS confidence_json
    FROM confidence_assessment ca
    WHERE ca.estimate_id = e.estimate_id
) confidence ON true
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'component_id', ec.component_id,
            'component_code', ec.component_code,
            'component_type', ec.component_type,
            'sequence', ec.sequence,
            'operation', ec.operation,
            'value_low', ec.value_low,
            'value_base', ec.value_base,
            'value_high', ec.value_high,
            'unit', ec.unit,
            'denominator', ec.denominator_definition,
            'conditional_probability', ec.conditional_probability,
            'directness_class', ec.directness_class,
            'dependency_group', ec.dependency_group,
            'adjustment_reason', ec.adjustment_reason,
            'metadata', ec.metadata_json,
            'evidence_id', ev.evidence_id,
            'release_id', sr.release_id,
            'source_id', sr.source_id,
            'locator', ev.locator
        ) ORDER BY ec.sequence
    ), '[]'::jsonb) AS components_json
    FROM estimate_component ec
    LEFT JOIN evidence ev USING (evidence_id)
    LEFT JOIN source_release sr USING (release_id)
    WHERE ec.estimate_id = e.estimate_id
) components ON true
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'assumption_id', a.assumption_id,
            'code', a.code,
            'statement', a.statement,
            'value_low', a.value_low,
            'value_base', a.value_base,
            'value_high', a.value_high,
            'unit', a.unit,
            'justification', a.justification,
            'source_release_id', a.source_release_id,
            'sensitivity_rank', a.sensitivity_rank
        ) ORDER BY a.sensitivity_rank, a.code
    ), '[]'::jsonb) AS assumptions_json
    FROM estimate_assumption ea
    JOIN assumption a USING (assumption_id)
    WHERE ea.estimate_id = e.estimate_id
) assumptions ON true
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'validation_gap_id', vg.validation_gap_id,
            'gap_type', vg.gap_type,
            'description', vg.description,
            'impact', vg.impact,
            'verification_question', vg.verification_question,
            'recommended_source', vg.recommended_source,
            'expected_improvement', vg.expected_improvement,
            'priority', vg.priority,
            'status', vg.status
        ) ORDER BY vg.priority, vg.validation_gap_id
    ), '[]'::jsonb) AS validation_gaps_json
    FROM validation_gap vg
    WHERE vg.estimate_id = e.estimate_id
) gaps ON true
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'dependency_kind', ed.dependency_kind,
            'record_key', ed.dependency_record_key,
            'version', ed.dependency_version,
            'content_hash', ed.dependency_content_hash,
            'role', ed.dependency_role,
            'evidence_id', ed.evidence_id,
            'model_version_id', ed.model_version_id
        ) ORDER BY ed.dependency_role, ed.estimate_dependency_id
    ), '[]'::jsonb) AS dependencies_json
    FROM estimate_dependency ed
    WHERE ed.estimate_id = e.estimate_id
) dependencies ON true
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(source_row.source_json ORDER BY source_row.release_id), '[]'::jsonb) AS sources_json
    FROM (
        SELECT DISTINCT
            sr.release_id,
            jsonb_build_object(
                'source_id', ds.source_id,
                'publisher', ds.publisher,
                'dataset_title', ds.dataset_title,
                'release_id', sr.release_id,
                'version_label', sr.version_label,
                'reference_period_start', sr.reference_period_start,
                'reference_period_end', sr.reference_period_end,
                'publication_date', sr.publication_date,
                'retrieved_at', sr.retrieved_at,
                'official_url', ds.official_url,
                'checksum', sr.checksum
            ) AS source_json
        FROM estimate_component ec
        JOIN evidence ev USING (evidence_id)
        JOIN source_release sr USING (release_id)
        JOIN data_source ds USING (source_id)
        WHERE ec.estimate_id = e.estimate_id
    ) source_row
) sources ON true;

CREATE OR REPLACE VIEW v_saved_segment_latest
WITH (security_invoker = true)
AS
SELECT
    ss.saved_segment_id,
    ss.workspace_id,
    ss.title,
    ss.description,
    ss.status,
    ss.current_version_no,
    ss.optimistic_lock_version,
    version_row.version_no AS resolved_version_no,
    version_row.query_id,
    version_row.natural_language_text,
    version_row.parser_version,
    version_row.definition_hash,
    version_row.change_reason,
    sq.filter_json,
    sq.primary_entity_unit,
    sq.geography_scope,
    sq.as_of_date,
    result_row.result_id,
    result_row.executed_at,
    result_row.cache_status,
    result_row.result_summary,
    e.estimate_id,
    e.status AS estimate_status,
    e.count_low,
    e.count_base,
    e.count_high,
    e.share_low,
    e.share_base,
    e.share_high,
    e.data_layer,
    e.approval_status,
    ss.created_at,
    ss.updated_at,
    version_row.pinned_result_id
FROM saved_segment ss
LEFT JOIN LATERAL (
    SELECT ssv.*
    FROM saved_segment_version ssv
    WHERE ssv.saved_segment_id = ss.saved_segment_id
    ORDER BY (ssv.version_no = ss.current_version_no) DESC, ssv.version_no DESC
    LIMIT 1
) version_row ON true
LEFT JOIN segment_query sq ON sq.query_id = version_row.query_id
LEFT JOIN LATERAL (
    SELECT sqr.*
    FROM segment_query_result sqr
    WHERE sqr.query_id = version_row.query_id
      AND (
        (version_row.pinned_result_id IS NOT NULL AND sqr.result_id = version_row.pinned_result_id)
        OR (version_row.pinned_result_id IS NULL AND sqr.cache_status <> 'invalidated')
      )
    ORDER BY
        (sqr.result_id = version_row.pinned_result_id) DESC,
        sqr.executed_at DESC
    LIMIT 1
) result_row ON true
LEFT JOIN estimate e ON e.estimate_id = result_row.estimate_id;

CREATE OR REPLACE VIEW v_research_review_queue
WITH (security_invoker = true)
AS
SELECT
    rj.research_job_id,
    rj.workspace_id,
    rj.saved_segment_id,
    rj.query_id,
    rj.condition_id,
    rj.validation_gap_id,
    rj.research_question,
    rj.target_segment,
    rj.target_variable,
    rj.provider,
    rj.provider_model,
    rj.output_schema_version,
    rj.status AS research_status,
    rj.priority AS research_priority,
    rj.attempt_count,
    rj.max_attempts,
    rj.next_attempt_at,
    rj.error_code,
    rj.error_message,
    artifact.research_job_artifact_id AS latest_artifact_id,
    artifact.artifact_kind AS latest_artifact_kind,
    artifact.validation_status AS artifact_validation_status,
    artifact.schema_version AS artifact_schema_version,
    revision.proposed_revision_id,
    revision.target_kind AS revision_target_kind,
    revision.target_record_key AS revision_target_record_key,
    revision.status AS revision_status,
    review.review_item_id,
    review.status AS review_status,
    review.priority AS review_priority,
    review.assigned_actor_id,
    rj.created_at,
    rj.updated_at
FROM research_job rj
LEFT JOIN LATERAL (
    SELECT rja.*
    FROM research_job_artifact rja
    WHERE rja.research_job_id = rj.research_job_id
    ORDER BY rja.created_at DESC
    LIMIT 1
) artifact ON true
LEFT JOIN LATERAL (
    SELECT pr.*
    FROM proposed_revision pr
    WHERE pr.research_job_id = rj.research_job_id
    ORDER BY pr.created_at DESC
    LIMIT 1
) revision ON true
LEFT JOIN review_item review ON review.proposed_revision_id = revision.proposed_revision_id;

CREATE OR REPLACE VIEW v_comparison_detail
WITH (security_invoker = true)
AS
SELECT
    cw.comparison_id,
    cw.workspace_id,
    cw.name AS comparison_name,
    cw.status AS comparison_status,
    cw.version_no,
    cm.comparison_member_id,
    cm.position,
    cm.display_label,
    sqr.result_id AS query_result_id,
    sq.query_id,
    sq.name AS segment_name,
    sq.primary_entity_unit,
    sq.geography_scope,
    sq.as_of_date,
    e.estimate_id,
    e.status AS estimate_status,
    e.count_low,
    e.count_base,
    e.count_high,
    e.share_low,
    e.share_base,
    e.share_high,
    e.data_layer,
    e.approval_status,
    cm.market_estimate_id,
    me.tam_entities_base,
    me.sam_entities_base,
    me.som_entities_base,
    me.tam_revenue_base,
    me.sam_revenue_base,
    me.som_revenue_base,
    cm.normalized_metrics,
    cm.added_at
FROM comparison_workspace cw
JOIN comparison_member cm USING (comparison_id)
JOIN segment_query_result sqr ON sqr.result_id = cm.query_result_id
JOIN segment_query sq USING (query_id)
JOIN estimate e USING (estimate_id)
LEFT JOIN market_estimate me ON me.market_estimate_id = cm.market_estimate_id;

CREATE OR REPLACE VIEW v_opportunity_snapshot
WITH (security_invoker = true)
AS
SELECT
    o.opportunity_id,
    ob.opportunity_board_id,
    ob.workspace_id,
    ob.name AS board_name,
    o.name,
    o.problem_statement,
    o.hypothesis_summary,
    o.solution_idea,
    o.revenue_model,
    o.expected_price_low,
    o.expected_price_base,
    o.expected_price_high,
    o.currency,
    o.access_channels,
    o.competing_alternatives,
    o.assumptions_to_validate,
    o.next_experiment_summary,
    o.status,
    o.optimistic_lock_version,
    segments.segment_snapshots,
    score.version_no AS score_version_no,
    score.overall_score,
    score.formula_version AS score_formula_version,
    score.weight_config,
    content.current_content,
    experiments.experiment_count,
    experiments.active_experiment_count,
    o.created_at,
    o.updated_at
FROM opportunity o
JOIN opportunity_board ob USING (opportunity_board_id)
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'link_id', osl.opportunity_segment_link_id,
            'link_role', osl.link_role,
            'saved_segment_id', osl.saved_segment_id,
            'saved_segment_version_no', osl.saved_segment_version_no,
            'query_result_id', osl.query_result_id,
            'market_estimate_id', osl.market_estimate_id,
            'estimate_id', sqr.estimate_id,
            'estimate_status', e.status,
            'entity_unit', e.entity_unit,
            'count_low', e.count_low,
            'count_base', e.count_base,
            'count_high', e.count_high,
            'data_version', e.data_version,
            'pinned_at', osl.pinned_at
        ) ORDER BY osl.pinned_at, osl.opportunity_segment_link_id
    ), '[]'::jsonb) AS segment_snapshots
    FROM opportunity_segment_link osl
    JOIN segment_query_result sqr ON sqr.result_id = osl.query_result_id
    JOIN estimate e USING (estimate_id)
    WHERE osl.opportunity_id = o.opportunity_id
) segments ON true
LEFT JOIN LATERAL (
    SELECT osv.*
    FROM opportunity_score_version osv
    WHERE osv.opportunity_id = o.opportunity_id
    ORDER BY osv.version_no DESC
    LIMIT 1
) score ON true
LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(latest.content_row ORDER BY latest.content_type, latest.content_key), '[]'::jsonb) AS current_content
    FROM (
        SELECT DISTINCT ON (ocv.content_type, ocv.content_key)
            ocv.content_type,
            ocv.content_key,
            jsonb_build_object(
                'content_type', ocv.content_type,
                'content_key', ocv.content_key,
                'version_no', ocv.version_no,
                'content', ocv.content,
                'source_kind', ocv.source_kind,
                'source_query_result_id', ocv.source_query_result_id,
                'source_market_estimate_id', ocv.source_market_estimate_id,
                'source_subtype_ids', ocv.source_subtype_ids,
                'source_archetype_ids', ocv.source_archetype_ids,
                'provider_model', ocv.provider_model,
                'created_at', ocv.created_at
            ) AS content_row
        FROM opportunity_content_version ocv
        WHERE ocv.opportunity_id = o.opportunity_id
        ORDER BY ocv.content_type, ocv.content_key, ocv.version_no DESC
    ) latest
) content ON true
LEFT JOIN LATERAL (
    SELECT
        count(*)::integer AS experiment_count,
        count(*) FILTER (WHERE oe.status IN ('planned','running'))::integer AS active_experiment_count
    FROM opportunity_experiment oe
    WHERE oe.opportunity_id = o.opportunity_id
) experiments ON true;

CREATE OR REPLACE VIEW v_source_evidence_lineage
WITH (security_invoker = true)
AS
SELECT
    ds.source_id,
    ds.publisher,
    ds.dataset_title,
    ds.official_url,
    ds.license,
    ds.source_tier,
    ds.source_type,
    ds.population_universe,
    ds.entity_unit,
    sr.release_id,
    sr.version_label,
    sr.reference_period_start,
    sr.reference_period_end,
    sr.publication_date,
    sr.retrieved_at,
    sr.local_uri,
    sr.checksum,
    sr.citation_text,
    sr.status AS release_status,
    count(DISTINCT ev.evidence_id)::integer AS evidence_count,
    count(DISTINCT ec.estimate_id)::integer AS used_by_estimate_count,
    coalesce(jsonb_agg(DISTINCT jsonb_build_object(
        'evidence_id', ev.evidence_id,
        'external_evidence_key', ev.external_evidence_key,
        'locator', ev.locator,
        'supported_claim', ev.supported_claim,
        'value', ev.value,
        'unit', ev.unit,
        'denominator', ev.denominator,
        'extraction_method', ev.extraction_method,
        'reviewer_status', ev.reviewer_status,
        'source_treatment', ev.source_treatment,
        'usage_context', ev.usage_context,
        'confidence_score', ev.confidence_score,
        'review_due_at', ev.review_due_at
    )) FILTER (WHERE ev.evidence_id IS NOT NULL), '[]'::jsonb) AS evidence_items,
    greatest(ds.updated_at, sr.updated_at) AS updated_at
FROM data_source ds
JOIN source_release sr USING (source_id)
LEFT JOIN evidence ev USING (release_id)
LEFT JOIN estimate_component ec USING (evidence_id)
GROUP BY
    ds.source_id, ds.publisher, ds.dataset_title, ds.official_url, ds.license,
    ds.source_tier, ds.source_type, ds.population_universe, ds.entity_unit,
    sr.release_id, sr.version_label, sr.reference_period_start, sr.reference_period_end,
    sr.publication_date, sr.retrieved_at, sr.local_uri, sr.checksum, sr.citation_text,
    sr.status, ds.updated_at, sr.updated_at;

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
    d.updated_at
FROM domain_registry d

UNION ALL

SELECT
    'subtype',
    s.subtype_id,
    NULL::uuid,
    s.name_ko,
    s.definition,
    d.primary_entity_unit,
    s.domain_id,
    concat_ws(' ', s.subtype_code, s.name_ko, s.definition, d.name_ko),
    s.updated_at
FROM subtype_definition s
JOIN domain_registry d USING (domain_id)

UNION ALL

SELECT
    'archetype',
    a.archetype_id,
    NULL::uuid,
    a.name_ko,
    a.one_line_definition,
    a.primary_entity_unit,
    NULL::text,
    concat_ws(' ', a.archetype_id, a.name_ko, a.name_en, a.one_line_definition),
    a.updated_at
FROM archetype a

UNION ALL

SELECT
    'saved_segment',
    ss.saved_segment_id::text,
    ss.workspace_id,
    ss.title,
    coalesce(ss.description, ''),
    latest.primary_entity_unit,
    NULL::text,
    concat_ws(' ', ss.title, ss.description, latest.natural_language_text),
    ss.updated_at
FROM saved_segment ss
LEFT JOIN v_saved_segment_latest latest USING (saved_segment_id)

UNION ALL

SELECT
    'opportunity',
    o.opportunity_id::text,
    ob.workspace_id,
    o.name,
    o.problem_statement,
    NULL::text,
    NULL::text,
    concat_ws(' ', o.name, o.problem_statement, o.hypothesis_summary, o.solution_idea),
    o.updated_at
FROM opportunity o
JOIN opportunity_board ob USING (opportunity_board_id);

COMMIT;
