# Phase 3R–7R 최종 구현 보고

최종 갱신: 2026-08-26

## 결과

Phase 1–2R 데이터를 재사용하는 Production Market Intelligence Workbench를 구현하고 Vercel Production과 managed Neon의 실제 PostgreSQL 수치로 검증했다. Root Explorer는 24개 Domain, Domain 화면은 16개 Axis와 Primary Subtype, Archetype Explorer는 전체 Registry 1,440개, Sizing은 Low/Base/High와 versioned TAM/SAM/SOM을 제공한다.

## 재사용한 기존 기능

- Market Atlas의 4-level 탐색 콘셉트와 emerald/white 분석 시각체계
- 기존 Layout, App Router, chart, Builder, sizing engine
- durable Research Queue, review/approval, comparison, Opportunity workflow
- Phase 1–2 taxonomy, Phase 2R-A Universe, Phase 2R-B Calibration/Data Mart

정적 HTML의 하드코딩 수치·random bar·mixed-unit 계산은 가져오지 않았다.

## Fixture와 상태 정리

별도 `market_engine_phase3r_production`을 migrations `001`–`024`와 Phase 1–2R/weighted-joint backfill로 재구성했다. 실제 workflow 생성 후 public+production 116개 base table 전수 검사에서 fixture-like 행은 0건이었다. 내부 상태·method·evidence-boundary 코드는 사용자 표시 문구로 변환되고 `이름 없음`은 0건이다. 통합 테스트는 전용 `market_engine_phase3r_integration_test`에서만 실행하고 종료 시 복제 DB를 제거한다.

## Phase 3R

- Production Data Mart 전용 Repository와 release-safe read model
- Pretendard Variable, 고정 navigation, global search, context panel
- 공통 KPI/range/confidence/source/formula/factor/lineage/empty/loading/error 상태
- private Production secret auth와 request-scoped workspace/actor

## Phase 4R

- 24/24 Domain 전체 브라우저 sweep
- Domain 시장규모·지역분포·16 Axis·confidence·실제 최근 갱신일. 같은 분모의 지출 근거가 없으면 `근거 미등록`으로 표시
- 90개 Primary Subtype의 Domain 별 직접 탐색. 추세·지출·미니 분포가 미등록이면 빈 차트를 만들지 않고 근거 공백을 명시
- 1,440 Archetype bounded 검색, 전체 요구 filter(등록 rule 기반 연령 포함), cursor/offset pagination, browser-native render virtualization, domain context별 규모
- 직접 Axis↔Subtype provenance가 없으면 관계를 만들지 않음

## Phase 5R

- nested AND/OR/NOT Builder와 4,086개 queryable Production condition library
- 자연어→구조화 조건 확인→실제 숫자 snapshot. `수도권 초등학생 자녀 맞벌이 가구`는 E2E에서 Base 429,539가구로 계산
- Gold Query exact result reuse, unit guard, 91,091개 identifier-free joint cell의 weighted AND/OR/NOT, conditional proxy/dependency 경계
- selected Calibration control만 사용하면 Grade D, synthetic/conditional Proxy가 있으면 Grade E; person/household Base 10 미만 release suppression
- 표본·Grade·Calibration·Mapping·Dependency·Stability를 합성한 Low/Base/High. 고정 ±10%를 사용하지 않음
- immutable snapshot, formula/factor/source lineage
- Sizing Directory에서 34개 calibrated mart 기준치와 release-safe workspace snapshot을 함께 조회하고 exact global baseline UUID도 직접 해석
- Gold Query 10/10의 실제 관련 지출 Low/Base/High를 Data Mart에서 연결하고 월간·연간 및 entity당 값임을 표시; URL-encoded prefixed estimate 링크도 안전하게 해석
- versioned User Scenario의 TAM/SAM/SOM entity·revenue
- CSV/JSON/print export

## Phase 6R

- 실제 OpenAI adapter, durable queue, retry, schema validation
- 별도 secret의 serverless cron endpoint와 bounded `SKIP LOCKED` claim
- 사용자 확인 직후 단일 Job을 처리하는 즉시 실행 API와 외부전송 확인 헤더
- Vercel Hobby 제약에 맞춘 일 1회 Queue 복구 schedule
- provider 설정 후 명시적 외부전송 확인을 거치는 configuration-required 재등록
- `configuration_required` 실제 Job 검증, 가상 Production 결과 0건
- Review diff, optimistic lock, 승인/반려, typed factor/source materialization 계약
- live request는 payload 외부전송 승인 대기

## Phase 7R

- 2–5 Segment 비교, raw unit과 same-unit normalization 분리
- 실제 Opportunity snapshot, 현재 estimate 비교, 가설·가격·채널·실험 버전 관리
- AI 가설과 데이터 사실 시각 분리
- Opportunity/Comparison/Estimate export

## 실제 사용자 흐름

`/explore` → `music_audio` → Axis → Domain Primary Subtype `DOM-01-SUB-01` → Archetype `ARC-12-011` → Estimate `684658b0-...` → Scenario `bc9aa64a-...` → 비교 → Opportunity `4468beac-...` → Research Job `a2c6e72d-...`까지 clean Production DB로 확인했다.

## Coverage와 수치

- 24 Domain, 90 Primary Subtype, 1,440 Archetype
- 384 Axis / 1,536 values, 480 Feature, 240 Behavior
- Gold Query 10/10 numeric
- Weighted joint cell 91,091개, queryable Calibration dimension 253개, runtime raw Persona 조회 0
- Primary Explorer not-estimable 0
- Production fixture 0, display-name missing 0

실제 Sizing 예시는 Base 4,289,457명, Low 1,738,042명, High 7,394,115명이며 사용자 Scenario는 TAM 4,289,457 / SAM 1,286,837 / SOM 64,342다.

## 테스트와 빌드

- Python 70 passed / 12 skipped
- Engine validation 46/46
- Web unit 49 files / 289/289
- PostgreSQL integration 8 files / 51/51
- TypeScript pass, ESLint zero warning
- Next.js 16.3.2 Production build pass
- migrations `001`–`024`의 실제 Production Data Mart를 대상으로 인증된 GET-only runtime performance audit 10/10 pass
- p95: Domain API 6.526ms, Archetype cursor API 11.242ms, Global Search 14.411ms, Explorer SSR 15.397ms, Archetype SSR 31.311ms
- migration `001`–`024` fresh DB 재적용 pass; weighted-joint Backfill 2회 실행 후 fingerprint `fd2536e810777599387ea7372b2ccd90` 동일
- 중첩 `여성 AND (20대 OR 30대) AND NOT 서울` 결과가 weighted cell 직접 합계와 일치
- Production health pass
- 검증된 PostgreSQL custom archive 생성 및 완전히 새 PostgreSQL 17 TCP/TLS cluster 복원 pass
- `NOSUPERUSER + CREATEROLE` deployment owner, source-owner ACL 제외, target-owner runtime ACL 재적용 검증
- policy-role bootstrap, `market_engine_app` SET ROLE, Node `verify-full`, 복원 DB 116-table fixture-like row 0, 91,091 weighted cell, Product DoD 수치 재확인
- least-privilege `market_engine_app` 로컬 Production Health/Explorer/Research 200, 금지 문자열 0
- 분리된 cron 인증: 미인증 401, Workbench secret 401, worker secret 200·빈 Queue 0
- Research 재실행 UI 표시 및 외부전송 확인 경계 검증; 실제 Job은 `configuration_required`, attempt 0 유지
- Research 즉시 실행 HTTP 경계: 확인 헤더 없음 428, Provider 비활성 409, 실제 Job 무변경
- UUID 내부 숫자열의 전화번호 오탐 제거; UUID가 계정 ID로 명시된 경우 차단 유지
- 24 Domain browser sweep, Subtype/Archetype/Builder/Sizing/Compare/Opportunity/Research/Governance/export/mobile pass
- 쓰기 가능한 전체 Browser E2E는 일회성 `market_engine_phase3r_browser_e2e_test`에서 25 passed / 2 의도적 viewport skip; 16단계 workflow는 desktop/tablet/mobile 모두 통과
- 전체 Browser E2E 동안 `OPENAI_RESEARCH_ENABLED=false`, 원본 Production DoD fingerprint 불변, 종료 후 복제 DB 자동 제거
- 반복 가능한 Production 읽기 전용 Playwright E2E 4 passed / 2 의도적 profile skip: Explorer·Sizing·Research를 desktop/tablet/mobile에서 검증하고, desktop에서 24/24 Domain 전수 순회
- 위 E2E는 GET/navigation만 사용하며 fixture·내부 상태 노출, axe 위반, 수평 overflow, console/page error를 함께 차단
- 최종 새 Production 탭 console error 0

## 실행

자세한 절차는 `docs/phase3r_7r_operations_runbook.md`에 있다. Production URL은 `https://market-sizing-engine.vercel.app`이며 private secret auth 뒤 실제 managed Data Mart를 조회한다.

Managed PostgreSQL 이전용 archive는 `data/backups/phase3r/market_engine_phase3r_production_20260826_v2.dump`이며, checksum·복원 명령·복원 검증 결과는 `reports/phase3r_7r_deployment_artifact.json`에 기록했다.

`scripts/deploy_phase3r_database.sh`는 direct TLS URL preflight, checksum, cluster role bootstrap, source-owner ACL 제외 restore, target-owner runtime ACL 재적용, fixture/DoD 검증을 자동화한다. `web/vercel.json`은 durable Research Queue의 일 1회 복구 schedule을 정의하고, 사용자 확인 직후에는 전용 즉시 실행 API가 해당 Job을 처리한다. `npm run verify:deployment-env`는 secret 값을 출력하지 않고 cloud runtime 계약을 검사한다.

## 외부 Credential과 미해결 Gate

OpenAI key와 Workbench/cron/database credential은 Vercel server-only 환경에 저장되며 출력·커밋되지 않았다. 실제 Research Job `a2c6e72d-0bd7-4aff-bc2e-47995b26ad02`는 명시적 승인 뒤 3회 실행되었고, provider schema와 partial provenance 문제를 발견·수정한 뒤 최종 시도가 timeout되어 `failed`, attempt 3, artifact 3으로 종료됐다. 어떤 provider 결과도 Baseline이나 승인 버전을 변경하지 않았다. 추가 requeue는 최대 3회의 새 외부 전송과 비용이 발생할 수 있어 새로운 명시 승인이 필요하다.

Cloud Gate는 닫혔다. Vercel project `woochul-shins-projects/market-sizing-engine`과 Singapore region의 managed Neon `market-sizing-engine-db`를 연결했고, 전용 `market_engine_app_login`이 최소권한 `market_engine_app`을 상속한다. Neon serverless HTTP/WebSocket transport로 authenticated Health와 Production read-only browser E2E가 통과했다. 남은 Product DoD Gate는 성공한 live Research 결과와 Human Review뿐이다.
