BEGIN;

-- Entity-only TAM/SAM/SOM is valid when no defensible spend evidence exists.
-- Revenue stays explicitly unavailable instead of being represented as zero.
ALTER TABLE market_estimate
    ALTER COLUMN tam_revenue_low DROP NOT NULL,
    ALTER COLUMN tam_revenue_base DROP NOT NULL,
    ALTER COLUMN tam_revenue_high DROP NOT NULL,
    ALTER COLUMN sam_revenue_low DROP NOT NULL,
    ALTER COLUMN sam_revenue_base DROP NOT NULL,
    ALTER COLUMN sam_revenue_high DROP NOT NULL,
    ALTER COLUMN som_revenue_low DROP NOT NULL,
    ALTER COLUMN som_revenue_base DROP NOT NULL,
    ALTER COLUMN som_revenue_high DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'market_estimate'::regclass
           AND conname = 'market_estimate_revenue_all_or_none_chk'
    ) THEN
        ALTER TABLE market_estimate
            ADD CONSTRAINT market_estimate_revenue_all_or_none_chk CHECK (
                (
                    tam_revenue_low IS NULL AND tam_revenue_base IS NULL AND tam_revenue_high IS NULL AND
                    sam_revenue_low IS NULL AND sam_revenue_base IS NULL AND sam_revenue_high IS NULL AND
                    som_revenue_low IS NULL AND som_revenue_base IS NULL AND som_revenue_high IS NULL
                ) OR (
                    tam_revenue_low IS NOT NULL AND tam_revenue_base IS NOT NULL AND tam_revenue_high IS NOT NULL AND
                    sam_revenue_low IS NOT NULL AND sam_revenue_base IS NOT NULL AND sam_revenue_high IS NOT NULL AND
                    som_revenue_low IS NOT NULL AND som_revenue_base IS NOT NULL AND som_revenue_high IS NOT NULL
                )
            );
    END IF;
END $$;

COMMIT;
