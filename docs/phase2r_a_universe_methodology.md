# Phase 2R-A universe methodology

## Purpose

The production universes provide the denominator and calibration marginals needed by Phase 2R-B. They are not category participation estimates. A domain mapped to the national person universe means “potentially eligible residents,” not “observed users of the category.”

## Person

The 2024 Population and Housing Census supplies the exact national total, sex, three complete age partitions, selected marital-state totals, and 17 province totals. The resident-registration frame supplies exact ages 0–18 and the derived 19+ frame. Census and resident-registration universes remain separate because their coverage definitions differ.

Schema-ready dimensions without a directly loaded marginal remain marked `schema_ready`, `partially_observed`, or `proxy_only`; no missing joint is silently synthesized.

## Household

The Census supplies total households, general households, household-size marginals, single-person households, households with children age 18 or below, and 17 province totals. Published thousand-unit figures retain a ±500 publication-precision interval.

## Business

The 2024 Census on Establishments supplies the establishment total, province, industry, employee band, legal form, and representative-age partitions. The 2024 Business Demography release supplies the exact active-enterprise total and employee, owner sex/age, legal form, sales, and business-age partitions. The 2023 Small Business Survey supplies the rounded 11-industry small-business enterprise denominator.

`establishment` and `enterprise` remain distinct. No one-to-one owner, establishment, or enterprise conversion is implied.

## Reconciliation and uncertainty

- Thirteen complete partitions close to their national controls with delta 0.
- Direct exact values are Grade A.
- Rounded official values use an interval matching their publication unit.
- Future Grade B–E observations must preserve method, formula, proxy basis, confidence penalty, and validation variables.
- Unsupported participation or joint prevalence remains a Phase 2R-B calibration task; unrelated marginals are not multiplied.

Exact values, locators, and partition tests are in `config/phase2r_a_official_observations.json`, `tests/integration/test_phase2r_a_production.py`, and `reports/phase2r_a_baseline_coverage.json`.
