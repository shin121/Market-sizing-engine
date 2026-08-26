\set ON_ERROR_STOP on

CREATE TEMP TABLE phase3r_fixture_scan (
    schema_name text NOT NULL,
    table_name text NOT NULL,
    fixture_like_rows bigint NOT NULL
);

DO $audit$
DECLARE
    target record;
    fixture_count bigint;
BEGIN
    FOR target IN
        SELECT schemaname, tablename
        FROM pg_catalog.pg_tables
        WHERE schemaname IN ('public', 'production')
        ORDER BY schemaname, tablename
    LOOP
        EXECUTE format(
            $query$
            SELECT count(*)
            FROM %I.%I AS source_row
            WHERE row_to_json(source_row)::text ~* %L
            $query$,
            target.schemaname,
            target.tablename,
            '(\[integration\]|E2E 16-step exact snapshot|test user|test saved segment|fixture estimate|fixture saved segment|이름 없음)'
        ) INTO fixture_count;

        INSERT INTO phase3r_fixture_scan(schema_name, table_name, fixture_like_rows)
        VALUES (target.schemaname, target.tablename, fixture_count);
    END LOOP;
END
$audit$;

SELECT jsonb_pretty(
    jsonb_build_object(
        'database', current_database(),
        'base_table_count', (SELECT count(*) FROM phase3r_fixture_scan),
        'fixture_like_rows', (SELECT coalesce(sum(fixture_like_rows), 0) FROM phase3r_fixture_scan),
        'nonzero_tables', (
            SELECT coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'schema', schema_name,
                        'table', table_name,
                        'rows', fixture_like_rows
                    ) ORDER BY schema_name, table_name
                ),
                '[]'::jsonb
            )
            FROM phase3r_fixture_scan
            WHERE fixture_like_rows > 0
        ),
        'product_dod', (
            SELECT to_jsonb(dod)
            FROM production.v_workbench_product_dod AS dod
        ),
        'weighted_joint_mart', jsonb_build_object(
            'cell_count', (SELECT count(*) FROM production.v_weighted_joint_cell),
            'sample_rows', (SELECT sum(sample_rows) FROM production.v_weighted_joint_cell),
            'weighted_total', (SELECT sum(weighted_count) FROM production.v_weighted_joint_cell),
            'units', (
                SELECT jsonb_object_agg(target_unit, unit_summary ORDER BY target_unit)
                FROM (
                    SELECT target_unit, jsonb_build_object(
                        'cell_count', count(*),
                        'sample_rows', sum(sample_rows),
                        'weighted_total', sum(weighted_count),
                        'artifact_checksums', count(DISTINCT artifact_checksum)
                    ) AS unit_summary
                    FROM production.v_weighted_joint_cell
                    GROUP BY target_unit
                ) AS summaries
            ),
            'condition_catalog_rows', (
                SELECT count(*) FROM production.v_workbench_condition_catalog WHERE queryable
            ),
            'calibrated_dimension_rows', (
                SELECT count(*) FROM production.calibration_dimension_catalog WHERE queryable
            )
        ),
        'workflow_rows', jsonb_build_object(
            'saved_segments', (SELECT count(*) FROM public.saved_segment),
            'queries', (SELECT count(*) FROM public.segment_query),
            'opportunities', (SELECT count(*) FROM public.opportunity),
            'research_jobs', (SELECT count(*) FROM public.research_job)
        )
    )
) AS restore_verification;
