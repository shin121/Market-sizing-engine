# Phase 3R–7R API Contract

최종 갱신: 2026-08-26

## 인증

Production 요청은 `WORKBENCH_AUTH_MODE=secret`에서 다음 중 하나를 요구한다.

- `/access`에서 인증 후 발급되는 `market_atlas_access` HttpOnly/SameSite=Strict cookie
- `Authorization: Bearer <WORKBENCH_ACCESS_SECRET>`

인증되지 않은 Page는 `/access`로 redirect하고, API는 `401 authentication_required`를 반환한다. 인증 설정이 불완전하면 fail-closed `503`이다.

`/api/internal/research/run-once`는 사용자 API가 아니다. `RESEARCH_WORKER_SECRET` 또는 Vercel `CRON_SECRET`의 별도 Bearer credential만 허용하며 `WORKBENCH_ACCESS_SECRET`으로는 접근할 수 없다.

`POST /api/research/{jobId}/run`은 사용자가 외부 전송 확인창을 승인한 직후에만 호출한다. 요청에는 `X-Research-External-Transmission-Confirmed: true`가 반드시 있어야 하며, 없으면 `428`로 거부한다. Provider가 비활성화된 환경은 `409 research_provider_configuration_required`로 실패하고 Job을 변경하지 않는다.

## 공통 규칙

- JSON의 count는 DB numeric 정밀도를 보존한다. UI만 entity count를 정수로 표시한다.
- 모든 estimate는 `entityUnit`, `referenceYear`, `geography`, Low/Base/High, formula/method, confidence, lineage를 함께 반환한다.
- 단위가 다른 조건의 계산은 명시적 conversion이 없으면 실패한다.
- 내부 status code는 API 계약에 보존할 수 있지만 UI는 한국어 display label만 표시한다.
- 목록은 bounded limit를 적용하며 Archetype은 cursor 또는 page/offset을 지원한다.

## Read API

| Method | Path | 계약 |
|---|---|---|
| GET | `/api/health` | DB 시간, 24/90/1,440/1,536/480/240/10 및 fixture/name/not-estimable gate |
| GET | `/api/markets/domains` | 24 Domain summary, unit, Low/Base/High, axis/subtype/archetype 수, confidence |
| GET | `/api/markets/domains/{domainCode}` | Domain, 384축 중 해당 16축, 지역분포, confidence, Primary Subtype |
| GET | `/api/markets/subtypes` | Primary Subtype 목록; domain/query/page filter |
| GET | `/api/markets/subtypes/{subtypeId}` | 규모, 배분, feature/behavior, 지역, formula, source, confidence |
| GET | `/api/markets/archetypes` | 1,440 registry의 cursor/page 검색. `domain`, `subtype`, `unit`, `q`, `feature`, `behavior`, `age`, `region`, `household`, `occupation`, `income`, `business`, `estimateGrade`, `minConfidence`, `sort` filter 지원 |
| GET | `/api/markets/archetypes/{archetypeId}` | domain context별 규모, subtype link, 대표·가설·gap |
| GET | `/api/markets/gold-queries` | Gold Query 10건의 숫자·formula·source·confidence |
| GET | `/api/catalog/conditions` | Production Builder 조건 후보와 operator/value schema. Canonical Phase 1/2, queryable Calibration dimension 253개, Gold Query 10개를 합친 4,086개 queryable catalog를 bounded browse/search |
| GET | `/api/search?q=` | Domain/Subtype/Archetype/저장 결과 통합 검색 |
| GET | `/api/estimate` | Calibrated baseline과 workspace snapshot 목록; `estimateId` exact 조회 시 Gold Query의 `related_spend_json` Low/Base/High·주기·기준연도·출처·confidence 포함 |
| GET | `/api/exports/{snapshotId}` | `format=csv|json`, optional explicit scenario pin |

## Mutation API

| Method | Path | 계약 |
|---|---|---|
| POST | `/api/estimate` | structured condition 계산, registered Gold/exact canonical reuse → subtype allocation → weighted joint → conditional proxy/dependency → immutable snapshot |
| POST | `/api/segments` | saved segment 정의와 immutable result/version 연결 |
| POST | `/api/opportunities` | Opportunity와 생성 당시 estimate snapshot 저장 |
| POST | `/api/research` | durable Research Job 생성; provider 미설정 시 `configuration_required` |
| GET | `/api/research/{jobId}` | Job, attempt, validated result, review status |
| GET | `/api/research/jobs/{jobId}/events` | 상태 변화 event stream/read model |
| GET/POST | `/api/internal/research/run-once` | 별도 scheduler secret으로 durable queue에서 최대 1–5건 claim; Vercel Cron/외부 scheduler 전용 |
| POST | `/api/research/{jobId}/run` | 사용자 확인 후 단일 Research Job 즉시 실행; 외부 전송 확인 헤더 필수 |

UI의 Server Action은 동일 service/repository 계약을 사용하며 별도 in-memory 구현을 갖지 않는다. `configuration_required` 또는 `failed` Job은 provider가 실제 설정된 경우에만 재등록할 수 있으며, UI가 prompt·target·baseline 외부전송 확인을 먼저 요구한다.

## Estimate request 순서

1. 기존 query hash/result와 entity unit을 확인한다.
2. 등록 Gold Query 한 건과 정확히 일치하면 Phase 2R-B 숫자·Formula·Source·Confidence를 새 immutable query snapshot으로 재사용한다.
3. 정확한 canonical Archetype 또는 Subtype 조합이면 등록 estimate/allocation과 parent 관계를 사용한다.
4. Calibration dimension/geography 조건은 identifier-free weighted joint cell에서 중첩 AND/OR/NOT을 직접 평가한다. 단순 주변비율 곱셈은 사용하지 않는다.
5. 같은 Unit의 등록 Axis·Feature·Behavior prevalence가 있으면 명시적 conditional Proxy와 bounded dependency correction으로 적용한다.
6. 표본·Grade·Calibration·Mapping·Dependency·Stability 오차로 Low/Base/High를 산출하고 Confidence를 재계산한다.
7. estimate, factor/component, source dependency, confidence breakdown, validation gap을 immutable lineage로 저장한다.
8. 동일 query/model/dependency fingerprint는 같은 snapshot을 재사용한다.
9. 사용자가 선택한 market scenario는 Baseline과 분리 저장한다.

선택된 Calibration control만의 joint는 Grade D, 합성 Proxy 또는 conditional Proxy가 포함되면 Grade E로 제한한다. person/household Base가 10 미만이면 count/share를 반환하지 않고 `suppressed` snapshot과 검증 gap만 남긴다.

`domain-market:*`, `domain-universe:*`, `gold-query:*` 같은 prefixed baseline ID는 URL path에서 한 번 디코딩한다. 그 외 상세 ID는 UUID 형식을 먼저 확인하므로 잘못된 문자열을 PostgreSQL UUID parameter로 전달하지 않는다.

## 오류 경계

대표 오류 코드는 `authentication_required`, `entity_unit_mismatch`, `condition_not_queryable`, `estimate_not_found`, `scenario_selection_required`, `configuration_required`, `optimistic_lock_conflict`다. UI는 코드 자체 대신 조치 가능한 한국어 문구를 표시한다.

## Export

CSV/JSON/print report는 선택한 estimate와 정확한 `scenarioId`, `scenarioVersion`, `scenarioSelectionMode`를 보존한다. Opportunity export는 저장 당시 snapshot과 현재 estimate를 분리한다. 비교 export는 unit별 raw 값과 same-unit normalized score를 별도 필드로 제공한다.
