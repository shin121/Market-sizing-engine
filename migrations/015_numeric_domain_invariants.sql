BEGIN;

-- Add the constraints without rewriting existing rows.  Validation is kept
-- explicit below so any legacy violation aborts the migration instead of being
-- normalized into a different market estimate or opportunity assumption.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'market_estimate'::regclass
           AND conname = 'market_estimate_nonnegative_values_chk'
    ) THEN
        ALTER TABLE market_estimate
            ADD CONSTRAINT market_estimate_nonnegative_values_chk CHECK (
                0 <= tam_entities_low AND
                0 <= tam_entities_base AND
                0 <= tam_entities_high AND
                0 <= sam_entities_low AND
                0 <= sam_entities_base AND
                0 <= sam_entities_high AND
                0 <= som_entities_low AND
                0 <= som_entities_base AND
                0 <= som_entities_high AND
                (tam_revenue_low IS NULL OR 0 <= tam_revenue_low) AND
                (tam_revenue_base IS NULL OR 0 <= tam_revenue_base) AND
                (tam_revenue_high IS NULL OR 0 <= tam_revenue_high) AND
                (sam_revenue_low IS NULL OR 0 <= sam_revenue_low) AND
                (sam_revenue_base IS NULL OR 0 <= sam_revenue_base) AND
                (sam_revenue_high IS NULL OR 0 <= sam_revenue_high) AND
                (som_revenue_low IS NULL OR 0 <= som_revenue_low) AND
                (som_revenue_base IS NULL OR 0 <= som_revenue_base) AND
                (som_revenue_high IS NULL OR 0 <= som_revenue_high)
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'scenario_factor_override'::regclass
           AND conname = 'scenario_factor_override_nonnegative_values_chk'
    ) THEN
        ALTER TABLE scenario_factor_override
            ADD CONSTRAINT scenario_factor_override_nonnegative_values_chk CHECK (
                0 <= value_low AND
                0 <= value_base AND
                0 <= value_high
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'scenario_factor_override'::regclass
           AND conname = 'scenario_factor_override_ratio_bounds_chk'
    ) THEN
        ALTER TABLE scenario_factor_override
            ADD CONSTRAINT scenario_factor_override_ratio_bounds_chk CHECK (
                NOT (
                    factor_code IN ('serviceability_rate', 'attainable_share') OR
                    lower(btrim(unit)) = 'ratio'
                ) OR (
                    value_low BETWEEN 0 AND 1 AND
                    value_base BETWEEN 0 AND 1 AND
                    value_high BETWEEN 0 AND 1
                )
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'opportunity'::regclass
           AND conname = 'opportunity_expected_price_nonnegative_chk'
    ) THEN
        ALTER TABLE opportunity
            ADD CONSTRAINT opportunity_expected_price_nonnegative_chk CHECK (
                (expected_price_low IS NULL OR 0 <= expected_price_low) AND
                (expected_price_base IS NULL OR 0 <= expected_price_base) AND
                (expected_price_high IS NULL OR 0 <= expected_price_high)
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'opportunity_experiment'::regclass
           AND conname = 'opportunity_experiment_cost_nonnegative_chk'
    ) THEN
        ALTER TABLE opportunity_experiment
            ADD CONSTRAINT opportunity_experiment_cost_nonnegative_chk CHECK (
                (cost_low IS NULL OR 0 <= cost_low) AND
                (cost_base IS NULL OR 0 <= cost_base) AND
                (cost_high IS NULL OR 0 <= cost_high)
            ) NOT VALID;
    END IF;
END $$;

ALTER TABLE market_estimate
    VALIDATE CONSTRAINT market_estimate_nonnegative_values_chk;
ALTER TABLE scenario_factor_override
    VALIDATE CONSTRAINT scenario_factor_override_nonnegative_values_chk;
ALTER TABLE scenario_factor_override
    VALIDATE CONSTRAINT scenario_factor_override_ratio_bounds_chk;
ALTER TABLE opportunity
    VALIDATE CONSTRAINT opportunity_expected_price_nonnegative_chk;
ALTER TABLE opportunity_experiment
    VALIDATE CONSTRAINT opportunity_experiment_cost_nonnegative_chk;

COMMIT;
