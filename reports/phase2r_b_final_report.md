# Phase 2R-B Final Report

Version: `phase2r-b-2026-08-26-v1`  
Status: **PASSED — 33/33 final audit checks**  
Database: isolated working database `market_engine_phase2r_a`; original `market_engine` unchanged

## 1. 선행조건 검증

- Phase 2R-A DoD: 24/24 passed.
- Phase 2 DoD retained certificate: 30/30 passed.
- Historical 18/18 tests and 46/46 combined validation retained; current validation was rerun at 46/46.
- Person, Household, Establishment, Enterprise Universes and 24/24 Domain mappings retain unit and reference year.
- Nemotron: 1,000,000 rows, nine fixed shards, nine SHA-256 checks passed.
- Production fixture rows: 0.

## 2. Calibration Controls

Person uses age×sex and 17-region controls. Household uses region, household size, and child presence. Establishment uses region, industry, employee size, legal form, and owner age. Enterprise uses employee size, owner age/sex, legal form, sales, and business age. Occupation, income, household-head age, dual income, and business digital attributes were excluded from raking where definition-compatible controls or stable joint cells were unavailable.

## 3. Mapping Coverage

Age band, sex, province, district, marital status, family type, housing type, education, field, and occupation values are preserved with mapping rules and confidence. Structural age/sex/province coverage is 100% and selected for Person calibration. Free-text occupation has 2,120 preserved categories but is not a calibration control. Business categories use separate business frames and are not inferred from Persona rows.

## 4. Weight Distribution

| Unit | Sample | Total weight | ESS | ESS ratio | Min / Mean / Max | Extreme share |
|---|---:|---:|---:|---:|---|---:|
| Person | 1,000,000 | 43,892,348 | 998,463 | 0.9985 | 40.43 / 43.89 / 50.19 | 0.0000 |
| Household | 250,000 | 22,997,120 | 177,396 | 0.7096 | 13.78 / 91.99 / 214.62 | 0.1173 |
| Establishment | 200,000 | 6,353,673 | 200,000 | 1.0000 | 31.75 / 31.77 / 32.07 | 0.0000 |
| Enterprise | 200,000 | 7,641,749 | 200,000 | 1.0000 | 37.75 / 38.21 / 38.85 | 0.0000 |

## 5. Calibration Error

All four unit runs converged. Maximum control-cell relative error was `7.63793e-8`, below the `1e-7` tolerance. Person, Establishment, and Enterprise converged in three iterations; Household converged in 20.

## 6. Archetype Coverage

1,440/1,440 distinct Archetypes have Low/Base/High share and count, unit, reference year, geography, context, calibration version/method, ESS, Confidence, Grade, sources, parent population, and allocation semantics. Reused category contexts are separated into 2,400 rows. Archetypes are `overlapping_membership`; national/macro-region and cross-Domain rows are not additive.

## 7. Subtype Coverage

90/90 Primary Subtypes have readable names, definitions, parent, unit, Low/Base/High share/count, Confidence, sources, related Archetypes/Features/Behaviors, Activation JSON, and model version. All 24 Domain groups reconcile at Base: share sum = 1 and child count sum = Domain parent count. PostgreSQL rejects a non-reconciling commit.

## 8. Axis·Feature·Behavior Coverage

- Axis: 384/384 with unit and distribution status; 1,536 value rows.
- Feature: 480/480 numeric; `not_estimable` 0.
- Behavior: 240/240 numeric with prevalence and monthly frequency; `not_estimable` 0.
- Overlapping Feature/Behavior totals are deliberately not normalized to 100%.

## 9. Gold Query Results

| ID | Query | Low | Base | High | Unit | Grade |
|---|---|---:|---:|---:|---|---|
| 01 | 홈페이지가 없는 60대 음식점 사업체 | 145,810 | 169,010 | 186,935 | enterprise | D |
| 02 | 수도권 초등학생 자녀 맞벌이 가구 | 319,938 | 429,539 | 519,620 | household | E |
| 03 | 유료 음악서비스 전환 가능성이 높은 무료 이용자 | 977,429 | 1,459,371 | 1,981,579 | person | D |
| 04 | 온라인 판매채널이 없는 지방의 직원 5명 미만 식품 소매업체 | 507,692 | 547,821 | 585,744 | enterprise | D |
| 05 | 부모 돌봄 부담이 있는 50대 직장인 | 639,585 | 893,013 | 1,245,832 | person | E |
| 06 | 반려동물을 키우며 국내여행 빈도가 높은 30~40대 가구 | 206,423 | 314,716 | 499,395 | household | E |
| 07 | 사교육 이용·서비스 불만 중학생 보호자 가구 | 138,543 | 200,338 | 282,707 | household | E |
| 08 | 네이버 플레이스 보유·디지털 관리 곤란 고령 음식점 | 86,105 | 116,429 | 150,291 | enterprise | D |
| 09 | 은퇴 전·건강 고지출 50대 | 927,695 | 1,317,406 | 1,821,801 | person | E |
| 10 | 무료 콘텐츠 고이용·소액 구독 의향 20~30대 음악 소비자 | 1,366,962 | 1,849,100 | 2,405,979 | person | D |

All ten store structured conditions, parent Universe, shares/counts, geography, spend basis, TAM/SAM/SOM basis, formula, ordered factors, sources, Grade, Confidence components, most uncertain variable, validation items, dependency method, seed, and snapshot hash.

## 10. Source and Grade Distribution

Numeric mart rows: Grade C 205, Grade D 2,066, Grade E 2,509. Grade D/E is intentionally prevalent because a direct high-dimensional joint distribution does not exist for most Archetype and cross-Domain intersections. Factor lineage includes KOCCA music, MSS small-business, KOSTAT Census/Business Demography/Employment, MOIS exact-age, and Nemotron synthetic evidence. Grade caps are enforced in PostgreSQL.

## 11. New Database Structure

15 additive tables were added: four calibration/governance tables, six market-summary tables, Gold Query and factor lineage, confidence, geography, and trend/spend. Thirteen Production views provide the read contract. Migration 021 creates the mart; Migration 022 adds Grade/source/reconciliation invariants.

## 12. Test Results

- Python: 82 collected, 80 passed, 2 environment-gated skipped, 0 failed; Phase 2R-B new tests 9/9.
- Engine validation: 46/46.
- Nemotron checksum: 9/9, 1,000,000 rows.
- Web unit: 261/261; available integration: 3/3 (43 environment-gated skipped).
- Web lint, TypeScript check, and Production build: passed.
- Consecutive complete builds: 19/19 artifact checksums identical.
- Migration 021/022 reapplication and Backfill reapplication: passed.

## 13. Phase 2R-B DoD

Final audit: **33/33 passed**. Production Primary Explorer contains 114 numeric Domain/Subtype rows and zero `not_estimable` rows. Production fixture count is zero. Phase 3R may consume the aggregate read models; it must not query raw Persona rows.

## 14. Phase 3R–7R Read Model/API Contract

Downstream consumers use `v_domain_market_summary`, `v_axis_distribution`, `v_subtype_market_summary`, `v_archetype_market_summary`, `v_feature_prevalence`, `v_behavior_prevalence`, `v_gold_query_result`, `v_estimate_factor_lineage`, `v_source_coverage`, `v_confidence_breakdown`, `v_geography_distribution`, `v_trend_spend_summary`, and `v_primary_explorer`. Unit, context, allocation semantics, version, and snapshot hash are mandatory cache/API dimensions.

## 15. Unresolved Variables

- Definition-compatible occupation, economic-activity, and income joint controls.
- Household-head age × child age × dual-income direct joint distribution.
- Platform-level free use × paid conversion panel.
- Official Naver Place population coverage.
- Direct pet×travel, parent-care×employment, and private-education×dissatisfaction joints.
- Product-specific reach, conversion, capacity, and acquisition constraints required for SOM.

These gaps are not silent: they appear as D/E Grade widths, Confidence penalties, factor directness, and validation items.
