BEGIN;

CREATE OR REPLACE FUNCTION production.phase2r_b_grade_cap(grade text)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE grade WHEN 'A' THEN 100 WHEN 'B' THEN 90 WHEN 'C' THEN 80 WHEN 'D' THEN 65 WHEN 'E' THEN 50 END::smallint
$$;

CREATE OR REPLACE FUNCTION production.phase2r_b_nonempty_jsonb_array(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(value)='array' AND jsonb_array_length(value)>0
$$;

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'domain_market_summary','archetype_market_summary','subtype_market_summary',
    'axis_distribution','feature_prevalence','behavior_prevalence','gold_query_result'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='phase2r_b_grade_cap_ck' AND conrelid=format('production.%I',target_table)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE production.%I ADD CONSTRAINT phase2r_b_grade_cap_ck CHECK (confidence_score <= production.phase2r_b_grade_cap(estimate_grade))',
        target_table
      );
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='phase2r_b_grade_cap_ck' AND conrelid='production.confidence_breakdown'::regclass
  ) THEN
    ALTER TABLE production.confidence_breakdown
      ADD CONSTRAINT phase2r_b_grade_cap_ck
      CHECK (confidence_score <= production.phase2r_b_grade_cap(estimate_grade));
  END IF;
END $$;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('domain_market_summary','source_release_ids'),
      ('archetype_market_summary','supporting_sources'),
      ('subtype_market_summary','source_release_ids'),
      ('axis_distribution','source_release_ids'),
      ('feature_prevalence','source_release_ids'),
      ('behavior_prevalence','source_release_ids'),
      ('gold_query_result','source_release_ids'),
      ('geography_distribution','source_release_ids'),
      ('trend_spend_summary','source_release_ids')
    ) AS values_table(table_name,column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='phase2r_b_nonempty_sources_ck'
        AND conrelid=format('production.%I',item.table_name)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE production.%I ADD CONSTRAINT phase2r_b_nonempty_sources_ck CHECK (production.phase2r_b_nonempty_jsonb_array(%I))',
        item.table_name,item.column_name
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION production.phase2r_b_assert_subtype_reconciliation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM production.domain_market_summary domain
    LEFT JOIN production.subtype_market_summary subtype USING(domain_id)
    GROUP BY domain.domain_id,domain.count_base
    HAVING count(subtype.subtype_id) <> (
             SELECT count(*) FROM public.subtype_definition definition
             WHERE definition.domain_id=domain.domain_id AND definition.is_primary
           )
       OR abs(coalesce(sum(subtype.share_base),0)-1) > 0.000000001
       OR abs(coalesce(sum(subtype.count_base),0)-domain.count_base) > 0.0001
  ) THEN
    RAISE EXCEPTION 'Phase 2R-B exclusive subtype shares or counts do not reconcile to their domain parent';
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS phase2r_b_subtype_reconciliation_trigger
  ON production.subtype_market_summary;
CREATE CONSTRAINT TRIGGER phase2r_b_subtype_reconciliation_trigger
AFTER INSERT OR UPDATE OR DELETE ON production.subtype_market_summary
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION production.phase2r_b_assert_subtype_reconciliation();

CREATE OR REPLACE FUNCTION production.phase2r_b_dod_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'calibration_runs',(SELECT count(*) FROM production.calibration_run WHERE converged AND status='passed'),
    'max_calibration_error',(SELECT max(max_control_relative_error) FROM production.calibration_run),
    'archetypes',(SELECT count(DISTINCT archetype_id) FROM production.archetype_market_summary),
    'archetype_context_rows',(SELECT count(*) FROM production.archetype_market_summary),
    'subtypes',(SELECT count(*) FROM production.subtype_market_summary),
    'axes',(SELECT count(DISTINCT dimension_id) FROM production.axis_distribution),
    'features',(SELECT count(*) FROM production.feature_prevalence),
    'behaviors',(SELECT count(*) FROM production.behavior_prevalence),
    'gold_queries',(SELECT count(*) FROM production.gold_query_result),
    'primary_not_estimable',(SELECT count(*) FROM production.v_primary_explorer WHERE status='not_estimable'),
    'fixture_rows',(SELECT count(*) FROM production.v_primary_explorer
      WHERE lower(display_name_ko) LIKE '%fixture%' OR lower(display_name_ko) LIKE '%integration%')
  )
$$;

GRANT EXECUTE ON FUNCTION production.phase2r_b_dod_snapshot() TO market_engine_app, market_engine_worker;

COMMIT;
