# Phase 3R–7R Production Workbench Architecture

최종 갱신: 2026-08-26

## 목적과 경계

Market Atlas는 Phase 1–2의 분류체계, Phase 2R-A의 현실 모집단, Phase 2R-B의 보정 가중치와 시장규모를 재사용하는 비공개 Market Intelligence Workbench다. 브라우저는 100만 행 Nemotron 원천을 직접 읽지 않으며 PostgreSQL `production` Data Mart와 release-safe Workbench Read Model만 조회한다.

정적 HTML은 참고용 탐색 콘셉트로만 사용했다. 하드코딩 숫자, 무작위 차트, in-memory fixture는 제품 경계에 포함하지 않았다.

## 실행 계층

1. **Immutable analytical inputs**: 9개 checksum 고정 Nemotron shard, Phase 1–2 Parquet/manifest, 고정 seed와 model version.
2. **PostgreSQL source of truth**: public 분류·계산·workflow 원장과 Phase 2R `production` mart.
3. **Release-safe read boundary**: 공개 가능한 estimate, subtype, archetype, saved segment, comparison, opportunity, research, governance projection.
4. **Repository and service layer**: 모든 SQL parameterization, entity-unit guard, workspace RLS context, cursor/page 제한, typed serialization.
5. **Next.js 16 App Router**: Server Component 우선, Server Action mutation, API 계약, 지연 로딩, loading/error/empty state.
6. **Private access boundary**: Production `secret` mode, SHA-256 cookie 또는 Bearer 검증, request-scoped workspace/actor context.
7. **Durable Research execution**: 로컬 장기 실행 worker 또는 별도-secret cron endpoint가 `SKIP LOCKED`로 한정된 Job을 claim한다. 서버리스 배포는 `web/vercel.json`의 run-once schedule을 사용한다.

## 현재 데이터 경계

| 항목 | 현재값 |
|---|---:|
| Public base table | 90 |
| Production base table | 26 |
| Production view | 31 |
| Domain | 24 |
| Primary Subtype | 90 |
| Archetype | 1,440 |
| Axis | 384 |
| Axis value distribution | 1,536 |
| Feature | 480 |
| Behavior | 240 |
| Gold Query | 10 |

마이그레이션 `019`–`022`가 Phase 2R-A/B Universe·Calibration·Data Mart를 만들고, `023_phase3r_7r_workbench_read_models.sql`이 release-safe Workbench 계약을 추가한다. `024_phase3r_weighted_joint_read_model.sql`은 100만 행 원천을 Web runtime에서 직접 읽지 않도록 식별자가 없는 Calibration 집계 셀과 동적 조건 catalog를 추가한다.

- `production.v_workbench_archetype_primary_context`
- `production.v_workbench_market_sizing_directory`
- `production.v_workbench_product_dod`
- `production.v_workbench_saved_segment`
- `production.v_workbench_opportunity_snapshot`
- `production.v_workbench_research_review_queue`
- `production.v_workbench_comparison_detail`
- 중앙 fixture 판별 함수 `production.is_fixture_text(text)`

`023`과 `024`는 additive이며 재적용해도 같은 결과를 내도록 작성했다. `023`은 1,440 Archetype의 primary-context bridge, confidence, factor lineage를 deterministic하게 backfill한다. `024`의 checksum 검증 Backfill은 4개 단위 91,091개 joint cell과 queryable Calibration 조건 253개를 생성한다. 같은 Backfill을 두 번 실행한 내용 fingerprint는 `fd2536e810777599387ea7372b2ccd90`으로 동일했다.

## 복합조건 계산 경계

1. 정확히 등록된 Gold Query는 Phase 2R-B 숫자·Formula·Source·Confidence를 새 immutable query snapshot에 복제한다.
2. Calibration dimension만 있는 조건은 91,091개 joint cell에서 AND/OR/NOT을 그대로 평가한다. 주변비율을 독립 곱셈하지 않는다.
3. 선택된 Calibration control만 사용한 joint는 Grade D, 합성 Proxy field가 포함되면 Grade E로 제한한다.
4. 등록된 Axis·Feature·Behavior prevalence가 추가되면 같은 Unit인지 확인한 뒤 조건부 Proxy factor로 적용하고 의존성 보정 범위와 penalty를 lineage에 남긴다.
5. person/household의 weighted Base가 10 미만인 결과는 UI/API release boundary에서 수치를 억제한다.

Low/Base/High는 고정 ±10%가 아니다. 표본오차, Grade floor, Calibration 오차, Mapping 오차, Dependency risk, Weight stability를 합성하며 세부 구성요소를 `confidence_assessment.components_json`과 `estimate_component.metadata_json`에 보존한다.

## 핵심 불변식

- `person`, `child_person`, `household`, `establishment`, `enterprise`를 암묵 변환하지 않는다.
- Low ≤ Base ≤ High를 DB와 애플리케이션 양쪽에서 검증한다.
- Exclusive partition과 overlapping membership을 구분한다.
- Baseline, user scenario, AI proposed revision은 별도 version으로 보존한다.
- AI 결과는 승인 전 Baseline을 덮어쓰지 않는다.
- 같은 Archetype의 여러 domain context는 중복 가능하므로 합산하지 않는다.
- Axis↔Subtype 직접 edge가 없으면 관계를 만들지 않는다. Domain 소속 Primary Subtype은 별도 목록으로 탐색한다.
- Product UI/API는 fixture·내부 status code·누락 display name을 release-safe projection에서 제거한다.
- 직접 근거가 부족한 지표는 빈 차트를 그리지 않고 evidence gap을 표시한다.
- Gold Query 10건의 관련 지출은 `production.v_trend_spend_summary`에서 exact subject key로 연결한다. 주기와 entity당 값이라는 경계를 보존하고 Domain/Subtype에 전이하지 않는다.

## 성능 구조

- Root Explorer는 집계 read model 한 번으로 24 Domain을 읽는다.
- Archetype은 50건 페이지, 최대 500건 API 제한, cursor/offset pagination을 지원한다.
- 후보 ID를 먼저 페이지한 뒤 상세 projection을 조인해 1,440행 전체 enrichment를 피한다.
- Archetype 결과 행은 `content-visibility: auto`와 intrinsic row size를 사용해 semantic table·키보드 순서를 보존하면서 화면 밖 layout/paint를 건너뛰는 browser-native render virtualization을 적용한다.
- Builder condition library는 canonical catalog, Calibration dimension 253개, Gold Query 10개를 합친 Production view에서 bounded pagination을 사용한다. 전체 queryable 조건은 4,086개다.
- 동일 query/result/scenario는 immutable snapshot ID로 재사용한다.
- 대형 차트와 상세 패널은 route/section 단위로 지연 로딩한다.

## 보안과 운영 한계

로컬 Production은 shared-secret private deployment 경계다. 외부 공개 배포에는 managed PostgreSQL, secret manager, TLS, SSO/RBAC, backup, network policy가 추가로 필요하다. 현재 로컬 socket DB는 원격 serverless runtime에서 접근할 수 없으므로, cloud URL을 만들기 전에 DB 이전이 필요하다.

Archive 복원 계정은 `CREATEROLE` 권한을 가진 DDL 소유자지만 슈퍼유저일 필요가 없다. Source-owner ACL은 `pg_restore --no-acl`로 제외하고 target owner가 `grant_phase3r_runtime_privileges.sql`을 적용한다. 실제 Web runtime은 `MARKET_ENGINE_DATABASE_ROLE=market_engine_app`을 설정해 연결 시작 시 고정 NOLOGIN 역할로 전환한다. 이 역할은 소유자 권한과 RLS 우회를 상속하지 않는다. 별도 worker 프로세스는 `market_engine_worker`를 사용할 수 있다. 비암호화 TCP restore는 거부되며, fresh-cluster harness는 자체 CA 기반 `verify-full`까지 검증한다. Scheduler Bearer는 Workbench access secret과 반드시 분리한다.

OpenAI key는 server-only 환경에 보존되며 브라우저 bundle, API 응답, 문서에 기록하지 않는다. 실제 Research 요청의 prompt·target·baseline을 외부로 전송하는 행위는 별도 사용자 승인 대상이다.

## 관련 문서

- [API 계약](phase3r_7r_api.md)
- [데이터 사전](phase3r_7r_data_dictionary.md)
- [운영 Runbook](phase3r_7r_operations_runbook.md)
- [Research Workflow](phase3r_7r_research_workflow.md)
- [사용자 가이드](phase3r_7r_user_guide.md)
- [Phase 2R-B Read Model 계약](phase2r_b_read_model_api_contract.md)
