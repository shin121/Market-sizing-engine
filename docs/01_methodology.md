# Methodology

## Evidence hierarchy

Tier 1 official census/administrative/survey releases set controls. Tier 2 public research may fill documented joints. Tier 3 synthetic data may provide coverage and representatives but cannot establish official prevalence alone. Release periods and universes are preserved rather than silently rebased.

## Baselines and estimates

Direct controls have `Low = Base = High`. Modeled segments multiply a unit-matched baseline by condition probabilities:

`N(segment) = N(denominator) × Π P(condition_i | denominator, prior conditions)`

Interval multiplication is monotone for nonnegative factors. Rounding follows confidence: the vertical slice is rounded to the nearest 10,000. An unavailable joint stops calculation with `not_estimable`; OR sets are not summed without overlap evidence. Cross-unit counts are returned only when an approved conversion exists.

For release, a derived `person`, `child_person`, or `household` estimate whose raw weighted Base is below 10 becomes `suppressed`. Python removes count/share/interval and reconstructable factor values while retaining `small_sample` and nonnumeric source/formula lineage; the same sanitizer runs before persistence and again after load so a legacy stored payload cannot reintroduce values. In Python, only an exact baseline match carrying an explicitly registered official-direct/cross-tab/rounded-thousand method code is exempt; an exact weighted or derived human cell below 10 is still suppressed. The web calculation layer wraps any below-threshold human query reuse in a separate workspace-owned suppressed snapshot without rewriting the registered source estimate. Migration `018` then classifies all human-unit Base-below-10 estimate rows at the canonical trusted-application read boundary and redacts their values, value-bearing prose, locators, and reconstruction hashes through downstream detail/comparison/Opportunity/research/scenario/export views. `establishment`, `enterprise`, and Base=10 remain outside the threshold. These projections are not hard database confidentiality while runtime roles retain raw-table `SELECT`.

## Adult calibration

All 1,000,000 Nemotron rows are normalized to structured fields. Ages 20+ receive direct national age-band × sex cell weights from the 2024 Census. Age 19 has no compatible single-age Census control and retains NULL weight. See `reports/nemotron_calibration.md`.

## Validation

Direct totals must reconcile within 0.5%. The reported age-band diagnostic reconstructs totals from the same fitted age-band × sex controls and reports MAPE, absolute error, and published-rounding tolerance coverage. It is a calibration aggregation consistency check, not an independent or out-of-sample holdout. `reports/quality_metrics.json` therefore records `independent_holdout_status: not_available`; a genuine holdout still requires observations excluded from fitting. Seed `20260824`, source/config hashes, checksums, and deterministic keys make builds repeatable.
