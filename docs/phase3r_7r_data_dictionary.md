# Phase 3R–7R Workbench Data Dictionary

최종 갱신: 2026-08-26

## 공통 Estimate 필드

| 필드 | 의미 |
|---|---|
| `count_low/base/high` | 대상 entity 수의 불확실성 구간 |
| `share_low/base/high` | 명시된 parent population 대비 비중 |
| `entity_unit` | person, child_person, household, establishment, enterprise |
| `denominator_definition` | 분모 정의와 적용 범위 |
| `geography_scope` | KR 또는 세부 지역 범위 |
| `reference_year` | 기준연도 |
| `method_code`, `formula` | 계산 방법과 재현 가능한 산식 |
| `estimate_grade` | A–E evidence grade |
| `confidence_score` | 규칙 기반 0–100 종합 신뢰도 |
| `confidence_components` | source quality, recency, match, calibration, ESS, risk 등 |
| `source_release_ids` | 근거 source release lineage |
| `calibration_version` | 적용된 보정 version |
| `allocation_semantics` | exclusive_partition, overlapping_membership, hierarchical_conditional, continuous_score_band |

## Production Read Model

| Read Model | 행 단위 | 용도 |
|---|---|---|
| `production.v_domain_market_summary` | Domain | Root Explorer 24개 시장 |
| `production.v_axis_distribution` | Axis value | 384 Axis의 1,536개 분포값 |
| `production.v_subtype_market_summary` | Primary Subtype | 90개 Low/Base/High |
| `production.v_archetype_market_summary` | Archetype × domain context | 1,440 Archetype 현실 가중치 |
| `production.v_feature_prevalence` | Feature × domain | 480개 prevalence/count |
| `production.v_behavior_prevalence` | Behavior × domain | 240개 prevalence/frequency/count |
| `production.v_gold_query_result` | Gold Query | 10개 대표 복합 질의 |
| `production.v_confidence_breakdown` | subject | Confidence 구성요소 |
| `production.v_geography_distribution` | subject × region | 지역 분포 |
| `production.v_workbench_market_sizing_directory` | Estimate | 시장규모 디렉터리 |
| `production.v_workbench_archetype_primary_context` | Archetype | 검색용 대표 domain context |
| `production.v_weighted_joint_cell` | Unit × Calibration joint cell | 4개 단위의 identifier-free weighted intersection 91,091개 셀 |
| `production.v_workbench_condition_catalog` | Builder condition | Canonical + Calibration dimension + Gold Query의 Production 조건 catalog |
| `production.v_workbench_product_dod` | singleton | UI/API release gate 집계 |

## Weighted Joint Mart

| 필드 | 의미 |
|---|---|
| `target_unit` | person, household, establishment, enterprise 중 하나 |
| `calibration_version` | 해당 Unit의 Phase 2R-B Calibration version |
| `cell_hash` | 정렬된 dimension JSON의 SHA-256; 합성 레코드 ID가 아님 |
| `dimension_values` | 해당 aggregate cell의 연령·성별·지역·가구·사업체 차원 값 |
| `sample_rows` | cell에 기여한 synthetic sample 행 수 |
| `weighted_count` | Calibration weight 합계 |
| `weight_square_sum` | Kish ESS 계산용 weight 제곱합 |
| `artifact_checksum` | 입력 weight Parquet의 검증된 SHA-256 |

`production.calibration_dimension_catalog`은 각 조건의 control 여부, `calibrated_control`/`calibrated_derived`/`synthetic_proxy`, mapping confidence, 기준연도, source release를 보존한다. Queryable 행은 253개다. Runtime API는 원천 Persona 행이나 synthetic identifier를 조회하지 않는다.

## Workflow 원장

| 개체 | 핵심 필드 |
|---|---|
| Saved Segment | definition JSON, entity unit, current version, pinned query/result |
| Query Result | immutable Low/Base/High, status, factor/source snapshot, lineage hash |
| Market Scenario | TAM/SAM/SOM entity·revenue, annual spend override, horizon, version |
| Comparison | 2–5 saved results, raw unit values, same-unit normalized metrics |
| Opportunity | linked segment, saved estimate snapshot, hypothesis, price/channel/experiment, optimistic version |
| Research Job | question, target segment/variable, baseline, status, attempt, schema-validated result |
| Research Review | baseline→proposal diff, decision, reviewer, confirmation, materialization lineage |
| Audit Log | workspace, actor, action, target, safe metadata, timestamp |

## 사용자 표시 상태

| 내부 상태 | 사용자 문구 |
|---|---|
| `estimated` | 추정 완료 |
| `bounded_estimate` | 범위 추정 완료 |
| `complete_with_evidence_constraints` | 추정 완료 · 근거 보완 필요 |
| `proxy_based` | 대체지표 기반 추정 |
| `needs_review` | 검토 필요 |
| `approved` | 승인됨 |
| `configuration_required` | 외부 AI 설정 대기 |
| `not_estimable` | 현재 자료로 산출 어려움 |

Product UI에는 내부 코드가 직접 나타나지 않는다.

## Fixture 판별과 공개 경계

`production.is_fixture_text(text)`가 `[integration]`, E2E snapshot, fixture/test 명명 규칙을 중앙 판별한다. Product 목록과 Context Panel은 `production.v_workbench_saved_segment`, `v_workbench_opportunity_snapshot`, `v_workbench_research_review_queue`, `v_workbench_comparison_detail` 같은 Production projection만 사용한다. `production.v_workbench_product_dod.fixture_count`는 현재 0이다.

Runtime은 `market_engine_phase3r_production`을 사용한다. 2026-08-26 실제 workflow와 migration `024` Backfill 후 public+production base table 116개를 전수 검사했고 fixture-like 행은 0건이었다. 통합 테스트는 Production의 읽기 전용 dump로 생성한 `market_engine_phase3r_integration_test`에서만 실행한다. 이전 `market_engine_phase2r_a`는 보존된 prototype/history DB이며 Production runtime이 아니다.
