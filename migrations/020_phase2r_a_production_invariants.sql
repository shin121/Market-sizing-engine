BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'production.universe_observation'::regclass
      AND conname = 'universe_observation_grade_confidence_chk'
  ) THEN
    ALTER TABLE production.universe_observation
      ADD CONSTRAINT universe_observation_grade_confidence_chk CHECK (
        (estimate_grade = 'A' AND confidence_score <= 100) OR
        (estimate_grade = 'B' AND confidence_score <= 90) OR
        (estimate_grade = 'C' AND confidence_score <= 80) OR
        (estimate_grade = 'D' AND confidence_score <= 65) OR
        (estimate_grade = 'E' AND confidence_score <= 50)
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE production.universe_observation
  VALIDATE CONSTRAINT universe_observation_grade_confidence_chk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'production.domain_universe_mapping'::regclass
      AND conname = 'domain_universe_mapping_grade_confidence_chk'
  ) THEN
    ALTER TABLE production.domain_universe_mapping
      ADD CONSTRAINT domain_universe_mapping_grade_confidence_chk CHECK (
        (estimate_grade = 'A' AND confidence_score <= 100) OR
        (estimate_grade = 'B' AND confidence_score <= 90) OR
        (estimate_grade = 'C' AND confidence_score <= 80) OR
        (estimate_grade = 'D' AND confidence_score <= 65) OR
        (estimate_grade = 'E' AND confidence_score <= 50)
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE production.domain_universe_mapping
  VALIDATE CONSTRAINT domain_universe_mapping_grade_confidence_chk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'production.saved_segment'::regclass
      AND conname = 'production_saved_segment_fixture_title_chk'
  ) THEN
    ALTER TABLE production.saved_segment
      ADD CONSTRAINT production_saved_segment_fixture_title_chk CHECK (
        strpos(lower(title), '[integration]') = 0 AND
        strpos(lower(title), 'e2e 16-step exact snapshot') = 0 AND
        strpos(lower(title), 'fixture') = 0
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE production.saved_segment
  VALIDATE CONSTRAINT production_saved_segment_fixture_title_chk;

COMMENT ON CONSTRAINT universe_observation_grade_confidence_chk
  ON production.universe_observation IS
  'Lower-evidence Grade D/E observations must carry an explicit confidence penalty.';
COMMENT ON CONSTRAINT production_saved_segment_fixture_title_chk
  ON production.saved_segment IS
  'Prevents known integration, E2E snapshot, and fixture titles from entering Production.';

COMMIT;
