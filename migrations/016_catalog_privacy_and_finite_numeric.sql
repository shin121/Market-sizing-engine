BEGIN;

-- The condition catalog is a policy projection over immutable source rows.
-- Source sensitivity/queryability fields remain unchanged; guarded and
-- inactive-domain restrictions are applied only at the read boundary.
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
    CASE
        WHEN dr.minor_guardrail
             AND df.sensitive_class IN ('none', 'non_sensitive', 'minor_protected')
            THEN 'minor_protected'
        ELSE df.sensitive_class
    END,
    df.queryable
        AND dr.active
        AND NOT dr.minor_guardrail
        AND df.targetability_class <> 'not_allowed',
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
    CASE WHEN dr.minor_guardrail THEN 'minor_protected' ELSE 'non_sensitive' END,
    dv.applicability = 'applicable'
        AND dr.active
        AND NOT dr.minor_guardrail,
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
    CASE
        WHEN dbt.targetability_class = 'not_allowed' THEN 'restricted_targeting'
        WHEN dr.minor_guardrail THEN 'minor_protected'
        ELSE 'non_sensitive'
    END,
    dr.active
        AND NOT dr.minor_guardrail
        AND dbt.targetability_class <> 'not_allowed',
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
    CASE WHEN dr.minor_guardrail THEN 'minor_protected' ELSE 'non_sensitive' END,
    dr.active AND NOT dr.minor_guardrail,
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
    CASE WHEN dr.minor_guardrail THEN 'minor_protected' ELSE 'non_sensitive' END,
    sd.is_primary AND dr.active AND NOT dr.minor_guardrail,
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
    CASE WHEN a.primary_entity_unit = 'child_person' THEN 'minor_protected' ELSE 'non_sensitive' END,
    a.status <> 'deprecated' AND a.primary_entity_unit <> 'child_person',
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

-- PostgreSQL numeric accepts NaN and signed infinities.  Migration 015's
-- nonnegative checks do not reject every such value, so enforce finiteness
-- explicitly without changing the existing interval/order constraints.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'market_estimate'::regclass
           AND conname = 'market_estimate_finite_values_chk'
    ) THEN
        ALTER TABLE market_estimate
            ADD CONSTRAINT market_estimate_finite_values_chk CHECK (
                tam_entities_low::text NOT IN ('NaN', 'Infinity', '-Infinity') AND
                tam_entities_base::text NOT IN ('NaN', 'Infinity', '-Infinity') AND
                tam_entities_high::text NOT IN ('NaN', 'Infinity', '-Infinity') AND
                sam_entities_low::text NOT IN ('NaN', 'Infinity', '-Infinity') AND
                sam_entities_base::text NOT IN ('NaN', 'Infinity', '-Infinity') AND
                sam_entities_high::text NOT IN ('NaN', 'Infinity', '-Infinity') AND
                som_entities_low::text NOT IN ('NaN', 'Infinity', '-Infinity') AND
                som_entities_base::text NOT IN ('NaN', 'Infinity', '-Infinity') AND
                som_entities_high::text NOT IN ('NaN', 'Infinity', '-Infinity') AND
                (tam_revenue_low IS NULL OR tam_revenue_low::text NOT IN ('NaN', 'Infinity', '-Infinity')) AND
                (tam_revenue_base IS NULL OR tam_revenue_base::text NOT IN ('NaN', 'Infinity', '-Infinity')) AND
                (tam_revenue_high IS NULL OR tam_revenue_high::text NOT IN ('NaN', 'Infinity', '-Infinity')) AND
                (sam_revenue_low IS NULL OR sam_revenue_low::text NOT IN ('NaN', 'Infinity', '-Infinity')) AND
                (sam_revenue_base IS NULL OR sam_revenue_base::text NOT IN ('NaN', 'Infinity', '-Infinity')) AND
                (sam_revenue_high IS NULL OR sam_revenue_high::text NOT IN ('NaN', 'Infinity', '-Infinity')) AND
                (som_revenue_low IS NULL OR som_revenue_low::text NOT IN ('NaN', 'Infinity', '-Infinity')) AND
                (som_revenue_base IS NULL OR som_revenue_base::text NOT IN ('NaN', 'Infinity', '-Infinity')) AND
                (som_revenue_high IS NULL OR som_revenue_high::text NOT IN ('NaN', 'Infinity', '-Infinity'))
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'scenario_factor_override'::regclass
           AND conname = 'scenario_factor_override_finite_values_chk'
    ) THEN
        ALTER TABLE scenario_factor_override
            ADD CONSTRAINT scenario_factor_override_finite_values_chk CHECK (
                value_low::text NOT IN ('NaN', 'Infinity', '-Infinity') AND
                value_base::text NOT IN ('NaN', 'Infinity', '-Infinity') AND
                value_high::text NOT IN ('NaN', 'Infinity', '-Infinity')
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'opportunity'::regclass
           AND conname = 'opportunity_expected_price_finite_chk'
    ) THEN
        ALTER TABLE opportunity
            ADD CONSTRAINT opportunity_expected_price_finite_chk CHECK (
                (expected_price_low IS NULL OR expected_price_low::text NOT IN ('NaN', 'Infinity', '-Infinity')) AND
                (expected_price_base IS NULL OR expected_price_base::text NOT IN ('NaN', 'Infinity', '-Infinity')) AND
                (expected_price_high IS NULL OR expected_price_high::text NOT IN ('NaN', 'Infinity', '-Infinity'))
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'opportunity_experiment'::regclass
           AND conname = 'opportunity_experiment_cost_finite_chk'
    ) THEN
        ALTER TABLE opportunity_experiment
            ADD CONSTRAINT opportunity_experiment_cost_finite_chk CHECK (
                (cost_low IS NULL OR cost_low::text NOT IN ('NaN', 'Infinity', '-Infinity')) AND
                (cost_base IS NULL OR cost_base::text NOT IN ('NaN', 'Infinity', '-Infinity')) AND
                (cost_high IS NULL OR cost_high::text NOT IN ('NaN', 'Infinity', '-Infinity'))
            ) NOT VALID;
    END IF;
END $$;

ALTER TABLE market_estimate
    VALIDATE CONSTRAINT market_estimate_finite_values_chk;
ALTER TABLE scenario_factor_override
    VALIDATE CONSTRAINT scenario_factor_override_finite_values_chk;
ALTER TABLE opportunity
    VALIDATE CONSTRAINT opportunity_expected_price_finite_chk;
ALTER TABLE opportunity_experiment
    VALIDATE CONSTRAINT opportunity_experiment_cost_finite_chk;

COMMIT;
