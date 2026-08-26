# Phase 3R–7R Operations Runbook

최종 갱신: 2026-08-26

## 로컬 Production 실행

```bash
cd /Users/woocheolshin/Projects/Market-sizing-engine/web
npm run build
MARKET_ENGINE_DATABASE_ROLE=market_engine_app npm run start -- --hostname 0.0.0.0 --port 3000
```

브라우저: `http://localhost:3000/explore`

같은 네트워크의 다른 기기: 실행 시 표시되는 `Network` 주소의 port 3000. macOS 방화벽과 네트워크 격리가 허용되어야 한다.

## 필수 환경변수

- `WORKBENCH_AUTH_MODE=secret`
- `WORKBENCH_ACCESS_SECRET` — 최소 32자, secret manager에서 주입
- `WORKBENCH_DEFAULT_WORKSPACE_ID`, `WORKBENCH_DEFAULT_ACTOR_ID` — UUID
- `MARKET_ENGINE_DATABASE_URL` 또는 `PGHOST`/`PGPORT`/`PGDATABASE`
- `MARKET_ENGINE_DATABASE_ROLE=market_engine_app` — direct PostgreSQL의 `SET ROLE` 방식
- `MARKET_ENGINE_DATABASE_ROLE=inherited_market_engine_app` — `market_engine_app_login`이 앱 권한을 상속하는 managed pooler 방식
- `OPENAI_API_KEY` — Research provider 사용 시에만 server-side 주입
- `OPENAI_RESEARCH_ENABLED=true` — 외부 호출을 명시적으로 켤 때만 설정
- `OPENAI_RESEARCH_TIMEOUT_MS=240000` — Vercel 300초 한도 아래의 단일 web-search 요청 제한; SDK hidden retry는 사용하지 않음
- `RESEARCH_WORKER_SECRET` 또는 `CRON_SECRET` — Workbench 비밀번호와 다른 32자 이상 scheduler secret
- `RESEARCH_CRON_MAX_JOBS=1` — 호출당 claim 수, 허용 범위 1–5

`.env*`는 Git에서 제외한다. 키 값을 출력하거나 client-side 환경변수로 복사하지 않는다.

## 검증 명령

```bash
cd /Users/woocheolshin/Projects/Market-sizing-engine
.venv/bin/pytest -q
PYTHONPATH=src .venv/bin/python -m market_engine.cli.main validate

cd web
npm run typecheck
npm run lint
npm run test:unit
npm run build

cd ..
# Production dump를 일회성 _test DB에 복제해 쓰기 가능한 전체 workflow 검증
./scripts/test_phase3r_browser_e2e.sh

# 이미 실행 중인 Production 서버를 변경하지 않는 브라우저 계약 검증
cd web
set -a; source .env.production.local; set +a
PLAYWRIGHT_SKIP_WEBSERVER=1 \
PLAYWRIGHT_BASE_URL=http://localhost:3000 \
RUN_PRODUCTION_READONLY_E2E=1 \
npm run test:e2e:production-readonly

cd ..
# 현재 Production Data Mart의 인증된 GET-only API/SSR p50·p95 측정
node --env-file=web/.env.production.local scripts/audit_phase3r_7r_runtime_performance.mjs

./scripts/test_workbench_integration.sh
```

Health:

```bash
curl -H "Authorization: Bearer $WORKBENCH_ACCESS_SECRET" http://localhost:3000/api/health
```

정상 응답은 24 Domain, 90 Subtype, 1,440 Archetype, 1,536 Axis values, 480 Feature, 240 Behavior, Gold Query 10, primary not-estimable 0, fixture 0, missing display name 0을 포함한다.

`test_workbench_integration.sh`는 `market_engine_phase3r_production`을 읽기 전용 dump로 복제한 `market_engine_phase3r_integration_test`에서만 51개 DB 통합 테스트를 실행한다. `_test` suffix가 없는 DB는 재생성하지 않으며 성공·실패·중단 시 trap으로 복제 DB를 제거해 Production workflow 원장을 오염시키지 않는다.

`test_phase3r_browser_e2e.sh`도 이름이 `_test`로 끝나는 `market_engine_phase3r_browser_e2e_test`만 생성한다. 외부 Research provider를 강제로 비활성화하고, desktop/tablet/mobile의 27개 Browser case를 실행한 뒤 Production DoD fingerprint 불변을 확인하고 복제 DB를 제거한다. 2026-08-26 기준 결과는 25 passed / 2 의도적 viewport-scoped skip이다.

`test:e2e:production-readonly`도 실제 workflow를 생성·수정하지 않는다. Explorer, Sizing, Research를 desktop/tablet/mobile에서 확인하고 desktop에서 24개 Domain을 전수 순회한다. 2026-08-26 기준 결과는 4 passed / 2 의도적 project-scoped skip이며 fixture·내부 상태 문구, axe 위반, 수평 overflow, console/page error가 모두 0이다.

`audit_phase3r_7r_runtime_performance.mjs`는 loopback URL만 허용하며 인증된 `GET` 요청만 보낸다. Health가 24/90/1,440 및 fixture/display-name 0 계약과 다르면 중단하고 credential 값은 보고서에 저장하지 않는다. 결과는 `reports/phase3r_7r_runtime_performance.json`에 기록된다.

## 마이그레이션과 Backfill

- `001`–`018`: 기존 engine/workbench
- `019`–`020`: Phase 2R-A Universe와 invariant
- `021`–`022`: Phase 2R-B Calibration/Data Mart와 invariant
- `023`: Phase 3R–7R safe read model과 Archetype bridge
- `024`: identifier-free weighted joint cell과 Production Builder condition catalog

원본 `market_engine`과 Phase 2R 작업 DB `market_engine_phase2r_a`를 덮어쓰지 않는다. 현재 runtime DB는 fixture-free `market_engine_phase3r_production`이다. 적용 전 backup 또는 clone을 만들고, `023`과 `024`는 동일 DB에 두 번 적용해 idempotency를 확인한다.

`024` 적용 뒤 checksum 검증형 Backfill을 실행한다.

```bash
cd /Users/woocheolshin/Projects/Market-sizing-engine
.venv/bin/python scripts/backfill_phase3r_weighted_joint.py \
  --database-url 'postgresql:///market_engine_phase3r_production?host=/Users/woocheolshin/Projects/Market-sizing-engine/data/local/socket&port=55432'
```

정상 결과는 person 69,449, household 19,188, establishment 1,342, enterprise 1,112, 합계 91,091 joint cell이다. `sample_rows`는 1,650,000이며 person frame만 원본 Nemotron 1,000,000행이다. 다른 세 단위는 Phase 2R-B에서 별도 Calibration한 unit frame이다. Backfill은 raw Persona ID를 저장하지 않으며 같은 입력으로 두 번 실행한 내용 fingerprint가 일치해야 한다.

## 검증된 배포용 DB 아카이브

클린 Production DB는 `data/backups/phase3r/market_engine_phase3r_production_20260826_v2.dump`로 보존한다. PostgreSQL custom archive이며 SHA-256은 `b2388405d476415a9ee2515c43e183ef4cdb8e2857e60dd8d9aaf28ee4b8a3c3`다. 세부 메타데이터는 `reports/phase3r_7r_deployment_artifact.json`에 있다. 이 파일에는 애플리케이션 secret이나 OpenAI credential이 포함되지 않는다.

Archive에는 RLS policy와 grant가 참조하는 `market_engine_app`, `market_engine_worker` cluster role 자체가 포함되지 않는다. 또한 source cluster 소유자 이름이 박힌 ACL/default-ACL은 관리형 DB의 비슈퍼유저가 적용할 수 없으므로 복원에서 제외한다. `scripts/grant_phase3r_runtime_privileges.sql`이 target deployment owner 기준으로 최종 app/worker 권한과 default privilege를 재적용한다. 빈 PostgreSQL 17+ managed DB의 direct connection URL을 환경변수로 전달하면 실제 TCP/TLS 확인, NOLOGIN role bootstrap, checksum 검증, `--no-owner --no-acl` restore, runtime ACL 재적용, 116-table 감사를 한 번에 수행한다. 비암호화 TCP는 preflight에서 거부한다. Neon처럼 TLS를 프록시에서 종단해 `pg_stat_ssl`이 false를 반환하는 환경은 libpq `\conninfo`가 실제 SSL protocol/cipher를 보고할 때만 통과한다.

```bash
export MARKET_ENGINE_TARGET_DATABASE_URL='postgresql://...direct...?sslmode=require'
./scripts/deploy_phase3r_database.sh preflight
./scripts/deploy_phase3r_database.sh restore
```

완전히 새 임시 PostgreSQL 17 cluster로 동일 경계를 재검증할 수 있다.

```bash
MARKET_ENGINE_RUN_DEPLOYMENT_INTEGRATION=1 \
  ./scripts/test_phase3r_deployment_restore.sh
```

새 cluster 검증은 localhost SAN 자체 CA가 있는 PostgreSQL 17 TCP/TLS 서버와 `NOSUPERUSER + CREATEROLE` deployment owner를 사용한다. Node runtime은 해당 CA로 `verify-full` 연결한다. 이 경계에서 두 NOLOGIN/NOINHERIT policy role, app-role SET 권한, target-owner ACL 재적용, 116개 base table fixture-like 행 0, 91,091 weighted joint cell, 24 Domain, 90 Subtype, 1,440 Archetype, 1,536 Axis values, 480 Feature, 240 Behavior, Gold Query 10/10, display-name 누락 0, DB integration 51/51을 재확인했다.

## Vercel Production

- URL: `https://market-sizing-engine.vercel.app`
- Project: `woochul-shins-projects/market-sizing-engine`
- Database: Vercel Marketplace의 Neon `market-sizing-engine-db`, Singapore region
- Runtime identity: `market_engine_app_login`이 NOLOGIN group role `market_engine_app` 권한을 상속
- Transport: `@neondatabase/serverless`의 HTTP/WebSocket 경로. 로컬 또는 비-Neon PostgreSQL은 `pg` TCP 경로 유지

Neon pooler는 PostgreSQL startup `options=-c role=...`를 거부하므로 Production에서는 `MARKET_ENGINE_DATABASE_ROLE=inherited_market_engine_app`을 사용한다. 배포 환경 audit는 URL username이 정확히 `market_engine_app_login`인 경우에만 이 모드를 허용한다. 원격 Health는 24/90/1,440, Gold 10, fixture 0, 이름 누락 0과 deployment environment 전체 gate를 함께 검증한다.

```bash
curl -H "Authorization: Bearer $WORKBENCH_ACCESS_SECRET" \
  https://market-sizing-engine.vercel.app/api/health
```

## Research worker

```bash
cd web
npm run worker
```

단발성 진단은 `npm run worker:once`를 사용한다. Provider가 꺼져 있거나 key가 없으면 Job은 `configuration_required`에 머물며 가상 결과를 생성하지 않는다. 실제 외부 payload 전송 전에 사용자·조직 정책 승인을 확보한다.

서버리스 환경에서는 사용자가 외부 전송 확인창을 승인하면 `/api/research/{jobId}/run`이 해당 Job을 즉시 처리한다. 별도로 `web/vercel.json`은 Hobby 배포에서도 유효한 일 1회 `/api/internal/research/run-once` 복구 schedule을 정의한다. Vercel은 `CRON_SECRET`을 Bearer로 전송하며, route와 Proxy가 모두 별도 credential을 검증한다. 호출당 기본 1건만 처리하고 claim은 DB transaction과 `SKIP LOCKED`로 중복 실행을 방지한다. Provider 설정 후 기존 `configuration_required` Job은 상세 화면의 “외부 조사 재실행”에서 payload 전송을 확인한 뒤 queued로 전환한다.

## Cloud 환경 사전검증

배포 환경변수를 주입한 상태에서 다음을 실행한다.

```bash
cd web
npm run verify:deployment-env
```

이 명령은 값 자체를 출력하지 않고 Production mode, secret auth, remote TLS PostgreSQL, workspace UUID, `market_engine_app` 역할, scheduler secret 분리, Research key 조건, `NEXT_PUBLIC_` secret 누출을 검사한다.

## 장애 대응

| 증상 | 점검 |
|---|---|
| 503 auth configuration | auth mode, 32자 secret, workspace/actor UUID |
| DB connection required | Production connection string 또는 structured PG config |
| Restore default privileges denied | 최신 deploy script의 `--no-acl` + `grant_phase3r_runtime_privileges.sql` 사용; source-owner ACL 직접 복원 금지 |
| Restore rejects non-TLS TCP | direct URL의 TLS 설정과 `sslmode=require` 이상 확인 |
| 빈 목록 | safe view fixture filter, workspace RLS context, calibrated mart backfill, release-safe workspace snapshot 및 exact global baseline UUID 분기 |
| 이름 없음/내부 코드 | display-name projection과 status mapper 회귀 |
| 수치 불일치 | exact snapshot/scenario version, entity unit, denominator |
| Research configuration_required | opt-in, key, network, model access, 사용자 외부전송 승인 |
| Research cron 401/503 | 별도 worker/cron secret 길이·분리, scheduler Authorization header |
| Opportunity conflict | 최신 optimistic lock version으로 다시 조회 후 재적용 |

## Cloud 배포 전 Gate

1. PostgreSQL 17+ direct TLS URL에 검증된 custom archive를 role bootstrap과 target-owner runtime ACL 재적용과 함께 복원한다.
2. migration `001`–`024`와 Phase 2R/weighted-joint backfill을 clean clone에서 재실행한다.
3. secret manager, TLS, SSO/RBAC, IP/WAF 정책을 설정한다.
4. Production Data Mart fixture=0과 display-name=0을 확인한다.
5. DB 통합, build, browser E2E를 대상 환경에서 다시 실행한다.
6. `verify:deployment-env`, backup/restore, queue retry/cron, audit retention, monitoring을 검증한다.

현재 Production은 managed Neon과 Vercel에 배포되어 있다. 새 환경을 만들 때도 정적 파일만 배포하지 말고 동일한 archive restore, 최소권한 login, secret audit, 원격 Health와 read-only browser E2E를 모두 반복한다.
