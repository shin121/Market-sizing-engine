# Phase 2R-B Calibration Methodology

Version: `phase2r-b-2026-08-26-v1`  
Calibration version: `kr-unit-calibration-2024-v1`  
Seed: `20260826`

## Scope and interpretation

Nemotron 1,000,000 rows are synthetic Persona samples, not one million Korean residents. The pipeline preserves all rows and assigns a calibrated **person weight**. Household, establishment, and enterprise weights are produced from separate synthetic frames; a Persona row is never reused as a household or a business.

## Selected controls

| Unit | Controls | Selection basis |
|---|---|---|
| Person | age × sex, 17-region marginal | Complete Nemotron coverage, deterministic mapping, official 2024 marginals, stable cells |
| Household | 17-region, household-size band, child presence | Household-compatible official marginals and a separate 250,000-row household frame |
| Establishment | 17-region, industry, employee band, legal form, owner age | 2024 Census on Establishments margins; separate 200,000-row frame |
| Enterprise | employee band, owner age, owner sex, legal form, sales band, business age | 2024 Business Demography margins; separate 200,000-row frame |

Person calibration uses the published 20+ age×sex composition plus a bounded age-19 cell so every Nemotron record has a weight. Because that table's rounded frame differs from the registered Phase 2R-A resident 19+ Universe, all age×sex cells are proportionally normalized to the exact 43,892,348 denominator. The regional all-age Census share is transported to the same adult calibration total and therefore carries a definition-match penalty. Total-household region counts refer to all households, while published size margins refer to general households; size bands are proportionally scaled to the total-household denominator and the mismatch is disclosed.

## Excluded controls

- Occupation and economic-activity text were excluded because free-text normalization and official category definitions do not yet match closely enough.
- Income was excluded because the Nemotron source lacks a compatible, sufficiently complete numeric income variable.
- Household-head age and dual income were retained as proxy fields but excluded from raking because direct compatible joint margins were unavailable.
- Online sales and digital tools were excluded from business calibration controls; they are estimated with the direct small-business survey rates and explicit conditional uncertainty.
- No high-dimensional joint was forced when sparse cells or incompatible units would inflate weights.

## Algorithm and diagnostics

Bounded iterative proportional fitting/raking starts at `target total / sample size`, then cycles through each selected marginal. Convergence requires maximum control-cell relative error ≤ `1e-7`, with at most 80 iterations. The floor is `0.02 × mean weight`; the cap is `20 × mean weight`.

For weights \(w_i\), effective sample size is:

\[
ESS = \frac{(\sum_i w_i)^2}{\sum_i w_i^2}
\]

An extreme weight is below `0.25 × mean` or above `4 × mean`. Diagnostics preserve cell targets, weighted results, absolute/relative errors, iterations, ESS, weight CV, extreme-weight share, output checksum, and control coverage in `reports/phase2r_b_calibration_diagnostics.json`.

Current results:

| Unit | Rows | Iterations | ESS | Max relative error | Extreme share |
|---|---:|---:|---:|---:|---:|
| Person | 1,000,000 | 3 | 998,463 | ≤ 0.0000001 | 0.000000 |
| Household | 250,000 | 20 | 177,396 | 0.0000000764 | 0.117272 |
| Establishment | 200,000 | 3 | 200,000 | 0.0000000116 | 0.000000 |
| Enterprise | 200,000 | 3 | 200,000 | 0.0000000041 | 0.000000 |

## Reproducibility

DuckDB runs with one thread to make floating-point aggregation order stable. The seed, algorithm version, convergence criteria, cap/floor, inputs, and SHA-256 of each weight artifact are persisted. Two consecutive full builds produced identical checksums for all 19 Parquet outputs.

## Source boundary

Official population, household, establishment, and enterprise marginal locators are registered by Phase 2R-A. KOCCA music-service rates and the MSS small-business digital-use/owner-age tables are used only where their survey universe and definition are disclosed. Synthetic narrative signals remain hypotheses and receive mapping, dependency, and proxy penalties.
