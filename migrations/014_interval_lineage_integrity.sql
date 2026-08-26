BEGIN;

-- Close SQL three-valued-logic holes in the original interval checks.  A
-- numeric estimate is either a complete ordered envelope or deliberately
-- unavailable; a partial envelope must never pass because NULL made an older
-- comparison evaluate to UNKNOWN.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'estimate'::regclass
           AND conname = 'estimate_status_count_envelope_chk'
    ) THEN
        ALTER TABLE estimate
            ADD CONSTRAINT estimate_status_count_envelope_chk CHECK (
                (
                    status IN ('not_estimable', 'suppressed') AND
                    count_low IS NULL AND count_base IS NULL AND count_high IS NULL
                ) OR (
                    status IN ('estimated', 'superseded') AND
                    count_low IS NOT NULL AND count_base IS NOT NULL AND count_high IS NOT NULL AND
                    0 <= count_low AND count_low <= count_base AND count_base <= count_high
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'estimate'::regclass
           AND conname = 'estimate_share_envelope_chk'
    ) THEN
        ALTER TABLE estimate
            ADD CONSTRAINT estimate_share_envelope_chk CHECK (
                (share_low IS NULL AND share_base IS NULL AND share_high IS NULL) OR
                (
                    share_low IS NOT NULL AND share_base IS NOT NULL AND share_high IS NOT NULL AND
                    0 <= share_low AND share_low <= share_base AND share_base <= share_high
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'phase2_parent_estimate'::regclass
           AND conname = 'phase2_parent_status_count_envelope_chk'
    ) THEN
        ALTER TABLE phase2_parent_estimate
            ADD CONSTRAINT phase2_parent_status_count_envelope_chk CHECK (
                (
                    status = 'not_estimable' AND
                    count_low IS NULL AND count_base IS NULL AND count_high IS NULL
                ) OR (
                    status IN ('estimated', 'exploratory_estimate') AND
                    count_low IS NOT NULL AND count_base IS NOT NULL AND count_high IS NOT NULL AND
                    0 <= count_low AND count_low <= count_base AND count_base <= count_high
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'phase2_parent_estimate'::regclass
           AND conname = 'phase2_parent_share_envelope_chk'
    ) THEN
        ALTER TABLE phase2_parent_estimate
            ADD CONSTRAINT phase2_parent_share_envelope_chk CHECK (
                (share_low IS NULL AND share_base IS NULL AND share_high IS NULL) OR
                (
                    share_low IS NOT NULL AND share_base IS NOT NULL AND share_high IS NOT NULL AND
                    0 <= share_low AND share_low <= share_base AND share_base <= share_high AND share_high <= 1
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'phase2_parent_estimate'::regclass
           AND conname = 'phase2_parent_source_lineage_chk'
    ) THEN
        ALTER TABLE phase2_parent_estimate
            ADD CONSTRAINT phase2_parent_source_lineage_chk CHECK (
                jsonb_typeof(source_release_ids) = 'array' AND
                (
                    status = 'not_estimable' OR
                    jsonb_array_length(source_release_ids) > 0
                )
            );
    END IF;
END $$;

DO $$
DECLARE
    table_name text;
    constraint_name text;
BEGIN
    FOR table_name, constraint_name IN
        VALUES
            ('population_cell', 'population_cell_source_lineage_chk'),
            ('minor_population_cell', 'minor_population_cell_source_lineage_chk'),
            ('household_cell', 'household_cell_source_lineage_chk'),
            ('business_cell', 'business_cell_source_lineage_chk')
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conrelid = table_name::regclass
               AND conname = constraint_name
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I CHECK (cardinality(source_release_ids) > 0)',
                table_name,
                constraint_name
            );
        END IF;
    END LOOP;
END $$;

COMMIT;
