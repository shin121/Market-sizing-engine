# Estimation quality

Generated: 2026-08-24

## Calibration aggregation check

Age-band totals are reconstructed by summing the sex cells used in the same calibration input. This is an internal aggregation consistency check, not an independent out-of-sample evaluation. Published values are rounded to thousands, so the calibration tolerance is ±1,000 persons.

| Age band | Published total | Sex-cell aggregation | Absolute error | APE | Within calibration tolerance |
|---|---:|---:|---:|---:|---:|
| 20-29 | 6,302,000 | 6,302,000 | 0 | 0.0000% | True |
| 30-39 | 6,948,000 | 6,948,000 | 0 | 0.0000% | True |
| 40-49 | 7,809,000 | 7,809,000 | 0 | 0.0000% | True |
| 50-59 | 8,713,000 | 8,713,000 | 0 | 0.0000% | True |
| 60-69 | 7,791,000 | 7,790,000 | 1,000 | 0.0128% | True |
| 70-79 | 4,133,000 | 4,133,000 | 0 | 0.0000% | True |
| 80-89 | 2,084,000 | 2,083,000 | 1,000 | 0.0480% | True |
| 90+ | 326,000 | 327,000 | 1,000 | 0.3067% | True |

- Calibration aggregation MAPE: 0.0459%
- Calibration tolerance coverage: 100.0%
- Independent holdout status: `not_available`
- Independent holdout reason: Age-band totals are deterministic sums of the same age-band × sex calibration controls; no observations were separated for out-of-sample evaluation.
- Vertical-slice confidence: 48/D because own website and exact owner-age joint data are absent.
- Archetype estimates: 1 estimated; 1,439 explicitly not estimable. This low coverage is an evidence limitation, not zero market size.
