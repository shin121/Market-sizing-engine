# Phase 2R-A final production-foundation audit

Generated: `2026-08-25T22:56:30.407756+00:00`  
Database: `market_engine_phase2r_a`  
Status: **PASSED**  
Git commit: **unavailable** — this workspace is not a Git repository.

## What the production database contains

- 9 production tables and 8 production read views.
- 7 canonical universes, 77 dimensions, 164 observations, and 155 claim-level citations.
- 24 sourced domain population mappings and 3,564 human-readable labels.
- 17 province geographies; person, household, and establishment province partitions close exactly.
- Production saved segments: 0; prototype fixtures are excluded by schema boundary.

> Scope: these domain baselines are official potential eligible-universe frames. They are not observed product users, purchase intent, or participation prevalence.

## Exact partition reconciliation

| Partition | Expected | Actual | Delta |
|---|---:|---:|---:|
| person_province | 51,805,547 | 51,805,547 | 0 |
| person_sex | 51,805,547 | 51,805,547 | 0 |
| person_age_0_14_15_64_65_plus | 51,805,547 | 51,805,547 | 0 |
| household_province | 22,997,120 | 22,997,120 | 0 |
| general_household_size | 22,294,419 | 22,294,419 | 0 |
| establishment_province | 6,353,673 | 6,353,673 | 0 |
| establishment_industry | 6,353,673 | 6,353,673 | 0 |
| enterprise_employee_band | 7,641,749 | 7,641,749 | 0 |
| enterprise_owner_sex | 7,641,749 | 7,641,749 | 0 |
| enterprise_owner_age | 7,641,749 | 7,641,749 | 0 |
| enterprise_legal_form | 7,641,749 | 7,641,749 | 0 |
| enterprise_sales_band | 7,641,749 | 7,641,749 | 0 |
| enterprise_business_age | 7,641,749 | 7,641,749 | 0 |

## Production domain estimates

| Domain | Unit | Low | Base | High | Grade | Confidence | Source |
|---|---|---:|---:|---:|:---:|---:|---|
| beauty_personal_care · 뷰티·개인관리 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| career_professional · 경력·전문활동 | person | 36,263,029 | 36,263,029 | 36,263,029 | A | 98 | 인구주택총조사 |
| culture_events · 문화예술·행사 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| digital_devices_ai · 디지털기기·AI | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| dining_delivery_cafe · 외식·배달·카페 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| education_learning · 교육·학습 | household | 4,516,500 | 4,517,000 | 4,517,499 | A | 94 | 인구주택총조사 |
| fashion_resale · 패션·리셀 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| finance_insurance · 금융·보험 | household | 22,997,120 | 22,997,120 | 22,997,120 | A | 99 | 인구주택총조사 |
| gaming_esports · 게임·e스포츠 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| grocery_home_meals · 식료품·가정식 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| health_wellness_care · 건강·웰니스·돌봄 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| hobbies_creation · 취미·창작 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| housing_home_services · 주거·홈서비스 | household | 22,997,120 | 22,997,120 | 22,997,120 | A | 99 | 인구주택총조사 |
| mobility_automotive · 모빌리티·자동차 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| music_audio · 음악·오디오 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| parenting_childcare · 양육·보육 | household | 4,516,500 | 4,517,000 | 4,517,499 | A | 94 | 인구주택총조사 |
| pets · 반려동물 | household | 22,997,120 | 22,997,120 | 22,997,120 | A | 99 | 인구주택총조사 |
| reading_webtoon · 독서·웹툰 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| senior_retirement_care · 시니어·은퇴·돌봄 | person | 10,121,720 | 10,121,720 | 10,121,720 | A | 98 | 인구주택총조사 |
| small_business_digital · 소상공인·디지털 운영 | enterprise | 5,960,500 | 5,961,000 | 5,961,499 | A | 93 | 소상공인실태조사 |
| social_creator · 소셜·크리에이터 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| sports_outdoor · 스포츠·아웃도어 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| travel_hospitality · 여행·숙박 | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |
| video_ott · 영상·OTT | person | 51,805,547 | 51,805,547 | 51,805,547 | A | 99 | 인구주택총조사 |

## Hard gates

- `domain_missing_interval_or_lineage`: 0
- `not_estimable_domains`: 0
- `fixture_rows_in_production`: 0
- `blank_display_labels`: 0
- `unlinked_domain_sources`: 0
- `invalid_grade_confidence`: 0
- `domain_universe_mapping_grade_confidence_chk` validated: `True`
- `production_saved_segment_fixture_title_chk` validated: `True`
- `universe_observation_grade_confidence_chk` validated: `True`

## Idempotency fingerprints

- observations: `164|b3a8ef42a6ee4f3260c437a0aa6fb73d`
- domain mappings: `24|23bae217d3a6ad86aa5ba9641269a8a1`

## Prototype preservation

- Original database `market_engine`: 90 public tables / 12 public views.
- Original database production schema present: `False`.
- Original taxonomy preserved: 24 domains / 1,440 archetypes.
- Original saved-segment rows retained: 628.
- Full backup SHA-256: `d8b29afe6ea7a39a408155dbf049b588445e7f45a1066a39cbafe787884c7952`.
- Schema backup SHA-256: `9be424ef250a922773d4d1c737616bfcb582a0e2e679c34d3ce28b9d8bc8ae02`.

## Conclusion

Phase 2R-A production data foundation passes its database gates: all 24 domains have named, sourced Low/Base/High baselines; official partitions reconcile; confidence penalties and fixture exclusion are database-enforced; and the preserved prototype database remains separate.

