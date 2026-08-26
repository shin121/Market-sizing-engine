BEGIN;

-- Runtime validation metadata is part of the immutable condition snapshot.
-- Keeping it on the normalized row prevents reference-period and evidence
-- context from being lost after the JSON request has been accepted.
ALTER TABLE segment_condition ADD COLUMN IF NOT EXISTS reference_year smallint;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'segment_condition'::regclass
           AND conname = 'segment_condition_reference_year_chk'
    ) THEN
        ALTER TABLE segment_condition ADD CONSTRAINT segment_condition_reference_year_chk
            CHECK (reference_year IS NULL OR reference_year BETWEEN 1900 AND 2200);
    END IF;
END $$;

-- Runtime roles may read the shared, approved baseline, but every mutable
-- estimate/scenario created by the workbench must belong to the active
-- workspace.  Separate command policies prevent a permissive shared-baseline
-- SELECT rule from also becoming a write rule.
DROP POLICY IF EXISTS estimate_scope_policy ON estimate;
DROP POLICY IF EXISTS estimate_select_policy ON estimate;
DROP POLICY IF EXISTS estimate_insert_policy ON estimate;
CREATE POLICY estimate_select_policy ON estimate
    FOR SELECT
    USING (workspace_id IS NULL OR workspace_id = market_engine_current_workspace_id());
CREATE POLICY estimate_insert_policy ON estimate
    FOR INSERT
    WITH CHECK (
        workspace_id = market_engine_current_workspace_id()
        AND data_layer IN ('derived_estimate','user_scenario','proposed_revision','approved_version')
    );

DROP POLICY IF EXISTS market_scenario_scope_policy ON market_scenario;
DROP POLICY IF EXISTS market_scenario_select_policy ON market_scenario;
DROP POLICY IF EXISTS market_scenario_insert_policy ON market_scenario;
CREATE POLICY market_scenario_select_policy ON market_scenario
    FOR SELECT
    USING (workspace_id IS NULL OR workspace_id = market_engine_current_workspace_id());
CREATE POLICY market_scenario_insert_policy ON market_scenario
    FOR INSERT
    WITH CHECK (workspace_id = market_engine_current_workspace_id());

-- Estimate child ledgers inherit visibility and write scope from their parent.
-- Global baseline children remain readable but cannot be inserted or changed
-- by either runtime role.
ALTER TABLE estimate_component ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_assumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_dependency ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_sensitivity_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE confidence_assessment ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_gap ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_component_select_policy ON estimate_component;
DROP POLICY IF EXISTS estimate_component_insert_policy ON estimate_component;
CREATE POLICY estimate_component_select_policy ON estimate_component
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM estimate parent
        WHERE parent.estimate_id = estimate_component.estimate_id
          AND (parent.workspace_id IS NULL OR parent.workspace_id = market_engine_current_workspace_id())
    ));
CREATE POLICY estimate_component_insert_policy ON estimate_component
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM estimate parent
        WHERE parent.estimate_id = estimate_component.estimate_id
          AND parent.workspace_id = market_engine_current_workspace_id()
          AND parent.data_layer <> 'baseline'
    ));

DROP POLICY IF EXISTS estimate_assumption_select_policy ON estimate_assumption;
CREATE POLICY estimate_assumption_select_policy ON estimate_assumption
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM estimate parent
        WHERE parent.estimate_id = estimate_assumption.estimate_id
          AND (parent.workspace_id IS NULL OR parent.workspace_id = market_engine_current_workspace_id())
    ));

DROP POLICY IF EXISTS estimate_dependency_select_policy ON estimate_dependency;
DROP POLICY IF EXISTS estimate_dependency_insert_policy ON estimate_dependency;
CREATE POLICY estimate_dependency_select_policy ON estimate_dependency
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM estimate parent
        WHERE parent.estimate_id = estimate_dependency.estimate_id
          AND (parent.workspace_id IS NULL OR parent.workspace_id = market_engine_current_workspace_id())
    ));
CREATE POLICY estimate_dependency_insert_policy ON estimate_dependency
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM estimate parent
        WHERE parent.estimate_id = estimate_dependency.estimate_id
          AND parent.workspace_id = market_engine_current_workspace_id()
          AND parent.data_layer <> 'baseline'
    ));

DROP POLICY IF EXISTS estimate_sensitivity_result_select_policy ON estimate_sensitivity_result;
DROP POLICY IF EXISTS estimate_sensitivity_result_insert_policy ON estimate_sensitivity_result;
CREATE POLICY estimate_sensitivity_result_select_policy ON estimate_sensitivity_result
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM estimate parent
        WHERE parent.estimate_id = estimate_sensitivity_result.estimate_id
          AND (parent.workspace_id IS NULL OR parent.workspace_id = market_engine_current_workspace_id())
    ));
CREATE POLICY estimate_sensitivity_result_insert_policy ON estimate_sensitivity_result
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM estimate parent
        WHERE parent.estimate_id = estimate_sensitivity_result.estimate_id
          AND parent.workspace_id = market_engine_current_workspace_id()
          AND parent.data_layer <> 'baseline'
    ));

DROP POLICY IF EXISTS confidence_assessment_select_policy ON confidence_assessment;
DROP POLICY IF EXISTS confidence_assessment_insert_policy ON confidence_assessment;
CREATE POLICY confidence_assessment_select_policy ON confidence_assessment
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM estimate parent
        WHERE parent.estimate_id = confidence_assessment.estimate_id
          AND (parent.workspace_id IS NULL OR parent.workspace_id = market_engine_current_workspace_id())
    ));
CREATE POLICY confidence_assessment_insert_policy ON confidence_assessment
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM estimate parent
        WHERE parent.estimate_id = confidence_assessment.estimate_id
          AND parent.workspace_id = market_engine_current_workspace_id()
          AND parent.data_layer <> 'baseline'
    ));

DROP POLICY IF EXISTS validation_gap_select_policy ON validation_gap;
DROP POLICY IF EXISTS validation_gap_insert_policy ON validation_gap;
CREATE POLICY validation_gap_select_policy ON validation_gap
    FOR SELECT
    USING (
        estimate_id IS NULL
        OR EXISTS (
            SELECT 1 FROM estimate parent
            WHERE parent.estimate_id = validation_gap.estimate_id
              AND (parent.workspace_id IS NULL OR parent.workspace_id = market_engine_current_workspace_id())
        )
    );
CREATE POLICY validation_gap_insert_policy ON validation_gap
    FOR INSERT
    WITH CHECK (
        estimate_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM estimate parent
            WHERE parent.estimate_id = validation_gap.estimate_id
              AND parent.workspace_id = market_engine_current_workspace_id()
              AND parent.data_layer <> 'baseline'
        )
    );

-- Market-estimate children use the scenario workspace as their ownership root.
ALTER TABLE market_estimate ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_factor_override ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_estimate_select_policy ON market_estimate;
DROP POLICY IF EXISTS market_estimate_insert_policy ON market_estimate;
CREATE POLICY market_estimate_select_policy ON market_estimate
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM market_scenario parent
        WHERE parent.scenario_id = market_estimate.scenario_id
          AND (parent.workspace_id IS NULL OR parent.workspace_id = market_engine_current_workspace_id())
    ));
CREATE POLICY market_estimate_insert_policy ON market_estimate
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM market_scenario parent
        WHERE parent.scenario_id = market_estimate.scenario_id
          AND parent.workspace_id = market_engine_current_workspace_id()
    ));

DROP POLICY IF EXISTS scenario_factor_override_select_policy ON scenario_factor_override;
DROP POLICY IF EXISTS scenario_factor_override_insert_policy ON scenario_factor_override;
CREATE POLICY scenario_factor_override_select_policy ON scenario_factor_override
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM market_scenario parent
        WHERE parent.scenario_id = scenario_factor_override.scenario_id
          AND (parent.workspace_id IS NULL OR parent.workspace_id = market_engine_current_workspace_id())
    ));
CREATE POLICY scenario_factor_override_insert_policy ON scenario_factor_override
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM market_scenario parent
        WHERE parent.scenario_id = scenario_factor_override.scenario_id
          AND parent.workspace_id = market_engine_current_workspace_id()
    ));

-- Query-result snapshots follow the estimate they expose.  Results backed by
-- an approved global baseline may be shared; derived results stay inside the
-- active workspace.  Only a workspace-owned derived result may be invalidated.
ALTER TABLE segment_query_result ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS segment_query_result_select_policy ON segment_query_result;
DROP POLICY IF EXISTS segment_query_result_insert_policy ON segment_query_result;
DROP POLICY IF EXISTS segment_query_result_update_policy ON segment_query_result;
CREATE POLICY segment_query_result_select_policy ON segment_query_result
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM estimate parent
        WHERE parent.estimate_id = segment_query_result.estimate_id
          AND (parent.workspace_id IS NULL OR parent.workspace_id = market_engine_current_workspace_id())
    ));
CREATE POLICY segment_query_result_insert_policy ON segment_query_result
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM estimate parent
        WHERE parent.estimate_id = segment_query_result.estimate_id
          AND (parent.workspace_id IS NULL OR parent.workspace_id = market_engine_current_workspace_id())
    ));
CREATE POLICY segment_query_result_update_policy ON segment_query_result
    FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM estimate parent
        WHERE parent.estimate_id = segment_query_result.estimate_id
          AND parent.workspace_id = market_engine_current_workspace_id()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM estimate parent
        WHERE parent.estimate_id = segment_query_result.estimate_id
          AND parent.workspace_id = market_engine_current_workspace_id()
    ));

-- Normalized query definitions and their condition ASTs are content-addressed
-- snapshots.  A new definition creates a new query hash; it never edits the
-- existing definition in place.
DROP TRIGGER IF EXISTS segment_query_append_only_trigger ON segment_query;
CREATE TRIGGER segment_query_append_only_trigger
    BEFORE UPDATE OR DELETE ON segment_query
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

DROP TRIGGER IF EXISTS segment_condition_group_append_only_trigger ON segment_condition_group;
CREATE TRIGGER segment_condition_group_append_only_trigger
    BEFORE UPDATE OR DELETE ON segment_condition_group
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

DROP TRIGGER IF EXISTS segment_condition_append_only_trigger ON segment_condition;
CREATE TRIGGER segment_condition_append_only_trigger
    BEFORE UPDATE OR DELETE ON segment_condition
    FOR EACH ROW EXECUTE FUNCTION workbench_forbid_mutation();

CREATE OR REPLACE FUNCTION workbench_guard_query_result_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION '% is append-only; DELETE is not permitted', TG_TABLE_NAME;
    END IF;
    IF (to_jsonb(NEW) - ARRAY['cache_status','invalidated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['cache_status','invalidated_at']) THEN
        RAISE EXCEPTION '% snapshot payload is immutable', TG_TABLE_NAME;
    END IF;
    IF OLD.cache_status = 'invalidated' AND NEW.cache_status <> 'invalidated' THEN
        RAISE EXCEPTION 'an invalidated query result cannot be reactivated';
    END IF;
    IF NEW.cache_status = 'invalidated' AND NEW.invalidated_at IS NULL THEN
        RAISE EXCEPTION 'invalidated_at is required for an invalidated query result';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS segment_query_result_guard_trigger ON segment_query_result;
CREATE TRIGGER segment_query_result_guard_trigger
    BEFORE UPDATE OR DELETE ON segment_query_result
    FOR EACH ROW EXECUTE FUNCTION workbench_guard_query_result_mutation();

-- Remove broad mutation grants.  Query-result invalidation is the one narrow
-- update retained by the web role; payload columns remain immutable.
REVOKE UPDATE, DELETE ON
    estimate, estimate_component, estimate_assumption, estimate_dependency, estimate_sensitivity_result,
    confidence_assessment, validation_gap,
    market_scenario, market_estimate, scenario_factor_override,
    segment_query, segment_condition_group, segment_condition, saved_segment_version
FROM market_engine_app, market_engine_worker;

REVOKE UPDATE, DELETE ON segment_query_result FROM market_engine_app, market_engine_worker;
GRANT UPDATE (cache_status, invalidated_at) ON segment_query_result TO market_engine_app;

-- Backfill provenance for derived parent/subtype estimates created before this
-- hardening migration.  Every component points to real Phase 2 evidence; no
-- missing source is replaced with a fabricated value.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM estimate e
          JOIN estimate_dependency ed
            ON ed.estimate_id = e.estimate_id
           AND ed.dependency_kind = 'subtype_allocation'
          JOIN phase2_parent_estimate ppe
            ON ppe.phase1_archetype_id = split_part(ed.dependency_record_key, ':', 1)
           AND ppe.model_version_id = e.model_version_id
          CROSS JOIN LATERAL jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(ppe.source_release_ids) = 'array'
                   THEN ppe.source_release_ids ELSE '[]'::jsonb END
          ) source_id(release_id)
         WHERE e.data_layer = 'derived_estimate'
           AND e.status = 'estimated'
           AND NOT EXISTS (
               SELECT 1 FROM evidence ev
                WHERE ev.release_id = source_id.release_id
                  AND ev.reviewer_status <> 'rejected'
           )
    ) THEN
        RAISE EXCEPTION 'derived estimate provenance backfill requires non-rejected evidence for every source release';
    END IF;
END $$;

WITH derived_parent AS (
    SELECT DISTINCT ON (e.estimate_id)
           e.estimate_id,
           e.period_id,
           e.model_version_id,
           e.data_version,
           e.entity_unit,
           ppe.phase1_archetype_id,
           ppe.count_low,
           ppe.count_base,
           ppe.count_high,
           ppe.denominator_definition,
           ppe.source_release_ids,
           ppe.validation_gaps,
           evidence_row.evidence_id
      FROM estimate e
      JOIN estimate_dependency ed
        ON ed.estimate_id = e.estimate_id
       AND ed.dependency_kind = 'subtype_allocation'
      JOIN phase2_parent_estimate ppe
        ON ppe.phase1_archetype_id = split_part(ed.dependency_record_key, ':', 1)
       AND ppe.model_version_id = e.model_version_id
      JOIN LATERAL (
          SELECT ev.evidence_id
            FROM jsonb_array_elements_text(
                     CASE WHEN jsonb_typeof(ppe.source_release_ids) = 'array'
                          THEN ppe.source_release_ids ELSE '[]'::jsonb END
                 ) WITH ORDINALITY source_id(release_id, source_order)
            JOIN LATERAL (
                SELECT evidence_id
                  FROM evidence
                 WHERE evidence.release_id = source_id.release_id
                   AND evidence.reviewer_status <> 'rejected'
                 ORDER BY CASE reviewer_status
                              WHEN 'human_reviewed' THEN 0
                              WHEN 'machine_checked' THEN 1
                              WHEN 'unreviewed' THEN 2
                              ELSE 3
                          END, evidence_id
                 LIMIT 1
            ) ev ON true
           ORDER BY source_id.source_order
           LIMIT 1
      ) evidence_row ON true
     WHERE e.data_layer = 'derived_estimate'
       AND e.status = 'estimated'
     ORDER BY e.estimate_id
)
INSERT INTO estimate_component (
    estimate_id, component_code, component_type,
    value_low, value_base, value_high, unit, evidence_id,
    operation, sequence, data_version, denominator_definition,
    reference_period_id, directness_class, model_version_id,
    adjustment_reason, metadata_json
)
SELECT estimate_id,
       'parent_population',
       'parent_population',
       count_low, count_base, count_high, entity_unit, evidence_id,
       'input', 1, data_version, denominator_definition,
       period_id, 'proxy', model_version_id,
       'Registered Phase 2 parent estimate; entity unit and denominator are preserved.',
       jsonb_build_object(
           'phase1_archetype_id', phase1_archetype_id,
           'source_release_ids', source_release_ids,
           'validation_gaps', validation_gaps
       )
  FROM derived_parent
ON CONFLICT DO NOTHING;

WITH source_rows AS (
    SELECT DISTINCT e.estimate_id,
           e.period_id,
           e.model_version_id,
           e.data_version,
           source_id.release_id,
           source_id.source_order,
           ev.evidence_id
      FROM estimate e
      JOIN estimate_dependency ed
        ON ed.estimate_id = e.estimate_id
       AND ed.dependency_kind = 'subtype_allocation'
      JOIN phase2_parent_estimate ppe
        ON ppe.phase1_archetype_id = split_part(ed.dependency_record_key, ':', 1)
       AND ppe.model_version_id = e.model_version_id
      CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(ppe.source_release_ids) = 'array'
               THEN ppe.source_release_ids ELSE '[]'::jsonb END
      ) WITH ORDINALITY source_id(release_id, source_order)
      JOIN LATERAL (
          SELECT evidence_id
            FROM evidence
           WHERE evidence.release_id = source_id.release_id
             AND evidence.reviewer_status <> 'rejected'
           ORDER BY CASE reviewer_status
                        WHEN 'human_reviewed' THEN 0
                        WHEN 'machine_checked' THEN 1
                        WHEN 'unreviewed' THEN 2
                        ELSE 3
                    END, evidence_id
           LIMIT 1
      ) ev ON true
     WHERE e.data_layer = 'derived_estimate'
       AND e.status = 'estimated'
)
INSERT INTO estimate_component (
    estimate_id, component_code, component_type,
    value_low, value_base, value_high, unit, evidence_id,
    operation, sequence, data_version, reference_period_id,
    directness_class, model_version_id, adjustment_reason, metadata_json
)
SELECT estimate_id,
       'source:' || release_id,
       'source_evidence',
       NULL, NULL, NULL, NULL, evidence_id,
       'evidence', 10 + source_order::integer, data_version, period_id,
       'proxy', model_version_id,
       'Source release used by the registered Phase 2 parent estimate; this does not imply direct joint observation.',
       jsonb_build_object('release_id', release_id)
  FROM source_rows
ON CONFLICT DO NOTHING;

WITH source_dependency_rows AS (
    SELECT DISTINCT e.estimate_id,
           e.model_version_id,
           sr.release_id,
           sr.version_label,
           sr.checksum,
           ev.evidence_id,
           ev.evidence_data_version
      FROM estimate e
      JOIN estimate_dependency ed
        ON ed.estimate_id = e.estimate_id
       AND ed.dependency_kind = 'subtype_allocation'
      JOIN phase2_parent_estimate ppe
        ON ppe.phase1_archetype_id = split_part(ed.dependency_record_key, ':', 1)
       AND ppe.model_version_id = e.model_version_id
      CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(ppe.source_release_ids) = 'array'
               THEN ppe.source_release_ids ELSE '[]'::jsonb END
      ) source_id(release_id)
      JOIN source_release sr ON sr.release_id = source_id.release_id
      JOIN LATERAL (
          SELECT evidence_id, data_version AS evidence_data_version
            FROM evidence
           WHERE evidence.release_id = source_id.release_id
             AND evidence.reviewer_status <> 'rejected'
           ORDER BY CASE reviewer_status
                        WHEN 'human_reviewed' THEN 0
                        WHEN 'machine_checked' THEN 1
                        WHEN 'unreviewed' THEN 2
                        ELSE 3
                    END, evidence_id
           LIMIT 1
      ) ev ON true
     WHERE e.data_layer = 'derived_estimate'
       AND e.status = 'estimated'
), dependency_rows AS (
    SELECT estimate_id,
           'source_release'::text AS dependency_kind,
           release_id AS dependency_record_key,
           version_label AS dependency_version,
           encode(digest(concat_ws('|', release_id, version_label, coalesce(checksum,''), evidence_id::text), 'sha256'), 'hex') AS dependency_content_hash,
           'denominator'::text AS dependency_role,
           evidence_id,
           model_version_id
      FROM source_dependency_rows
    UNION ALL
    SELECT estimate_id,
           'evidence',
           evidence_id::text,
           evidence_data_version,
           encode(digest(concat_ws('|', evidence_id::text, release_id, evidence_data_version), 'sha256'), 'hex'),
           'validation',
           evidence_id,
           model_version_id
      FROM source_dependency_rows
)
INSERT INTO estimate_dependency (
    estimate_id, dependency_kind, dependency_record_key, dependency_version,
    dependency_content_hash, dependency_role, evidence_id, model_version_id
)
SELECT estimate_id, dependency_kind, dependency_record_key, dependency_version,
       dependency_content_hash, dependency_role, evidence_id, model_version_id
  FROM dependency_rows
ON CONFLICT DO NOTHING;

WITH factor_rows AS (
    SELECT e.estimate_id,
           e.period_id,
           e.model_version_id,
           e.data_version,
           e.method_code,
           ppe.phase1_archetype_id,
           ppe.source_release_ids,
           sa.subtype_id,
           sa.share_low,
           sa.share_base,
           sa.share_high,
           sa.allocation_formula,
           row_number() OVER (PARTITION BY e.estimate_id ORDER BY sa.subtype_id) AS factor_order,
           evidence_row.evidence_id
      FROM estimate e
      JOIN estimate_dependency ed
        ON ed.estimate_id = e.estimate_id
       AND ed.dependency_kind = 'subtype_allocation'
      JOIN subtype_allocation sa
        ON ed.dependency_record_key = sa.phase1_archetype_id || ':' || sa.subtype_id
       AND sa.model_version_id = e.model_version_id
      JOIN phase2_parent_estimate ppe
        ON ppe.phase1_archetype_id = sa.phase1_archetype_id
       AND ppe.model_version_id = sa.model_version_id
      JOIN LATERAL (
          SELECT ev.evidence_id
            FROM jsonb_array_elements_text(
                     CASE WHEN jsonb_typeof(ppe.source_release_ids) = 'array'
                          THEN ppe.source_release_ids ELSE '[]'::jsonb END
                 ) WITH ORDINALITY source_id(release_id, source_order)
            JOIN LATERAL (
                SELECT evidence_id
                  FROM evidence
                 WHERE evidence.release_id = source_id.release_id
                   AND evidence.reviewer_status <> 'rejected'
                 ORDER BY CASE reviewer_status
                              WHEN 'human_reviewed' THEN 0
                              WHEN 'machine_checked' THEN 1
                              WHEN 'unreviewed' THEN 2
                              ELSE 3
                          END, evidence_id
                 LIMIT 1
            ) ev ON true
           ORDER BY source_id.source_order
           LIMIT 1
      ) evidence_row ON true
     WHERE e.data_layer = 'derived_estimate'
       AND e.status = 'estimated'
)
INSERT INTO estimate_component (
    estimate_id, component_code, component_type,
    value_low, value_base, value_high, unit, evidence_id,
    operation, sequence, data_version, denominator_definition,
    conditional_probability, reference_period_id, directness_class,
    dependency_group, model_version_id, adjustment_reason, metadata_json
)
SELECT estimate_id,
       'subtype_allocation:' || subtype_id,
       'conditional_probability',
       CASE WHEN method_code = 'phase2_parent_subtype_complement' THEN 1 - share_high ELSE share_low END,
       CASE WHEN method_code = 'phase2_parent_subtype_complement' THEN 1 - share_base ELSE share_base END,
       CASE WHEN method_code = 'phase2_parent_subtype_complement' THEN 1 - share_low ELSE share_high END,
       'ratio', evidence_id,
       CASE WHEN method_code = 'phase2_parent_subtype_complement' THEN 'complement'
            WHEN method_code = 'phase2_exclusive_subtype_union' THEN 'sum'
            ELSE 'multiply' END,
       100 + factor_order::integer,
       data_version,
       'Share of the registered Phase 2 parent population.',
       CASE WHEN method_code = 'phase2_parent_subtype_complement' THEN 1 - share_base ELSE share_base END,
       period_id,
       'inference',
       'phase2_parent_subtype',
       model_version_id,
       'Registered conditional allocation; unsupported independent marginals are not multiplied.',
       jsonb_build_object(
           'phase1_archetype_id', phase1_archetype_id,
           'subtype_id', subtype_id,
           'allocation_formula', allocation_formula,
           'source_release_ids', source_release_ids
       )
  FROM factor_rows
ON CONFLICT DO NOTHING;

WITH gap_rows AS (
    SELECT DISTINCT e.estimate_id,
           e.data_version,
           gap.value AS source_gap_code,
           CASE
               WHEN gap.value IN (
                   'missing_joint_distribution','outdated_reference_period','weak_proxy',
                   'unknown_unit_conversion','geographic_granularity_gap','small_sample',
                   'business_web_presence_unobserved','owner_attribute_unobserved',
                   'purchase_intent_unobserved','spend_per_entity_unobserved',
                   'overlap_unknown','other'
               ) THEN gap.value
               ELSE 'other'
           END AS gap_type
      FROM estimate e
      JOIN estimate_dependency ed
        ON ed.estimate_id = e.estimate_id
       AND ed.dependency_kind = 'subtype_allocation'
      JOIN phase2_parent_estimate ppe
        ON ppe.phase1_archetype_id = split_part(ed.dependency_record_key, ':', 1)
       AND ppe.model_version_id = e.model_version_id
      CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(ppe.validation_gaps) = 'array'
               THEN ppe.validation_gaps ELSE '[]'::jsonb END
      ) gap(value)
     WHERE e.data_layer = 'derived_estimate'
       AND e.status = 'estimated'
)
INSERT INTO validation_gap (
    estimate_id, gap_type, description, impact, verification_question,
    recommended_source, expected_improvement, priority, status, data_version
)
SELECT estimate_id,
       gap_type,
       'Inherited and reviewed Phase 2 validation gap: ' || source_gap_code,
       'high',
       'What same-denominator authoritative evidence resolves ' || source_gap_code || '?',
       'Authoritative joint distribution or probability sample matching the estimate denominator.',
       'Replaces the reviewed proxy/allocation limitation with direct evidence.',
       1,
       'open',
       data_version
  FROM gap_rows candidate
 WHERE NOT EXISTS (
     SELECT 1 FROM validation_gap existing
      WHERE existing.estimate_id = candidate.estimate_id
        AND existing.gap_type = candidate.gap_type
 )
ON CONFLICT DO NOTHING;

WITH derived_parent_confidence AS (
    SELECT DISTINCT ON (e.estimate_id)
           e.estimate_id,
           e.data_version,
           ppe.confidence_grade AS parent_grade
      FROM estimate e
      JOIN estimate_dependency ed
        ON ed.estimate_id = e.estimate_id
       AND ed.dependency_kind = 'subtype_allocation'
      JOIN phase2_parent_estimate ppe
        ON ppe.phase1_archetype_id = split_part(ed.dependency_record_key, ':', 1)
       AND ppe.model_version_id = e.model_version_id
     WHERE e.data_layer = 'derived_estimate'
       AND e.status = 'estimated'
     ORDER BY e.estimate_id
), scored AS (
    SELECT estimate_id,
           data_version,
           parent_grade,
           CASE WHEN parent_grade = 'E' THEN 9 ELSE 18 END::smallint AS source_quality_score,
           CASE WHEN parent_grade = 'E' THEN 6 ELSE 10 END::smallint AS recency_score,
           CASE WHEN parent_grade = 'E' THEN 3 ELSE 7 END::smallint AS directness_score,
           CASE WHEN parent_grade = 'E' THEN 1 ELSE 3 END::smallint AS joint_observation_score,
           CASE WHEN parent_grade = 'E' THEN 6 ELSE 10 END::smallint AS model_reliance_score,
           CASE WHEN parent_grade = 'E' THEN 25 ELSE 48 END::smallint AS total_score,
           CASE WHEN parent_grade = 'E' THEN 'E' ELSE 'D' END AS grade
      FROM derived_parent_confidence
)
INSERT INTO confidence_assessment AS current_confidence (
    estimate_id, source_quality_score, recency_score, directness_score,
    joint_observation_score, model_reliance_score, total_score, grade,
    rationale, data_version, rule_version, components_json, penalties_json,
    validation_gap_reviewed_at
)
SELECT estimate_id, source_quality_score, recency_score, directness_score,
       joint_observation_score, model_reliance_score, total_score, grade,
       'Synthetic Phase 2 conditional allocation; capped at ' || grade ||
           ' from parent confidence ' || parent_grade ||
           ' and not treated as a directly observed joint distribution.',
       data_version,
       'phase2-derived-confidence-v1',
       jsonb_build_object(
           'sourceQuality', source_quality_score,
           'recency', recency_score,
           'directness', directness_score,
           'jointObservation', joint_observation_score,
           'modelReliance', model_reliance_score,
           'parentGrade', parent_grade,
           'assessmentKind', 'synthetic_conditional_allocation'
       ),
       jsonb_build_array(jsonb_build_object(
           'code', 'synthetic_joint_distribution_not_observed',
           'points', 100 - total_score
       )),
       now()
  FROM scored
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
    rule_version = excluded.rule_version,
    components_json = excluded.components_json,
    penalties_json = excluded.penalties_json,
    validation_gap_reviewed_at = coalesce(
        current_confidence.validation_gap_reviewed_at,
        excluded.validation_gap_reviewed_at
    );

COMMIT;
