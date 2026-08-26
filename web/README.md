# Market Intelligence Workbench

`web/` is the separate Next.js 16/React 19 interface over the Korea Market Sizing Engine's migrated PostgreSQL baseline. It provides live catalog exploration, segment building, lineage-rich estimates, comparisons, opportunity records, governance views, exports, and an opt-in asynchronous research/review queue.

It does not contain demo market counts and does not replace the deterministic Python/DuckDB/Parquet build. If PostgreSQL is absent, unbackfilled, or incompatible, the workbench must show an error rather than manufacture data.

## Quick start

The repository root must already have the Phase 2 DuckDB artifact and Python environment. Bootstrap and backfill PostgreSQL from the root:

```bash
./scripts/manage_postgres.sh bootstrap
./scripts/backfill_postgres.sh
./scripts/backfill_postgres.sh --verify-only
```

Provision the deterministic local workspace/member with the exact SQL in [`docs/20_workbench_operations.md`](../docs/20_workbench_operations.md#provision-the-local-workbench-identity). The supported importer is `scripts/backfill_postgres.sh`; do not run the legacy `scripts/backfill_workbench.py` after it.

Then install and start the web package:

```bash
cd web
npm ci
cp .env.example .env.local
npm run dev
```

For this checkout, remove the placeholder `DATABASE_URL`, then replace the placeholder IDs/database settings in `.env.local` with:

```text
PGHOST=/Users/woocheolshin/Projects/Market-sizing-engine/data/local/socket
PGPORT=55432
PGDATABASE=market_engine_phase3r_production
PGUSER=woocheolshin
WORKBENCH_AUTH_MODE=local
WORKBENCH_DEFAULT_WORKSPACE_ID=9f693300-49ad-5bd5-ad98-af4e225661ea
WORKBENCH_DEFAULT_ACTOR_ID=314126eb-26a2-55fa-a613-28180096cbac
OPENAI_RESEARCH_ENABLED=false
OPENAI_API_KEY=
```

Open [http://localhost:3000](http://localhost:3000) and verify the live database boundary:

```bash
curl --fail-with-body http://localhost:3000/api/health
```

The local PostgreSQL fallback in `src/server/db/pool.ts` points to the same real Unix socket when no URL/PG variables are set. It is a connection convenience, not a data fallback.

For a verified local Production run, build first and use a separate ignored `.env.production.local` with `WORKBENCH_AUTH_MODE=secret`, a 32+ character access secret, the same workspace/actor UUIDs, and the Phase 2R database settings:

```bash
npm run build
npm run start
```

Open `http://localhost:3000/explore`, authenticate at `/access`, and check `/api/health` with the same secret as a Bearer token. The current health contract is 24 Domain, 90 Primary Subtype, 1,440 Archetype, 1,536 Axis values, 480 Feature, 240 Behavior, Gold Query 10, primary `not_estimable` 0, fixture 0, missing display name 0.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next development server |
| `npm run build` | Produce a production build |
| `npm run start` | Start the built application |
| `npm run typecheck` | Run TypeScript without emission |
| `npm run lint` | Run ESLint with zero warnings allowed |
| `npm run test:unit` | Domain/contract unit tests |
| `npm run test:integration` | Live PostgreSQL repository/integration tests |
| `npm test` | Unit then integration tests |
| `npm run test:e2e` | Playwright browser suite against a live PostgreSQL app |
| `npm run verify:deployment-env` | Fail-closed cloud environment audit without printing secret values |
| `npm run worker` | Poll and process research jobs |
| `RESEARCH_JOB_ID=<uuid> npm run worker:once` | Process only that reviewed queued/configuration-required job |

Node `>=24 <27` is required. Integration and E2E tests require migrations through `023`, the canonical Phase 2R backfill, and the local workspace/member. The current certification is recorded in [`reports/phase3r_7r_product_dod_audit.json`](../reports/phase3r_7r_product_dod_audit.json); every target environment must still run the same suite against its own database and auth boundary.

Run DB integration through `../scripts/test_workbench_integration.sh`. It recreates only the dedicated `_test` database from a read-only Production dump before invoking `npm run test:integration`; do not point the raw npm command at Production.

## Authentication and secrets

- `WORKBENCH_AUTH_MODE=local` is development/test only and is rejected when `NODE_ENV=production`.
- Production uses `WORKBENCH_AUTH_MODE=secret`, a `WORKBENCH_ACCESS_SECRET` of at least 32 characters, and explicit workspace/actor UUIDs.
- The current secret-session mode is one fixed service identity. It is not SSO or per-member RBAC.
- PostgreSQL credentials, the access secret, and `OPENAI_API_KEY` are server-only. Never prefix them with `NEXT_PUBLIC_`.
- Web runtime sets `MARKET_ENGINE_DATABASE_ROLE=market_engine_app`; a separate worker process may use `market_engine_worker`.
- `RESEARCH_WORKER_SECRET` or Vercel `CRON_SECRET` is at least 32 characters and differs from `WORKBENCH_ACCESS_SECRET`.
- Migrations create `market_engine_app` and `market_engine_worker` as `NOLOGIN` privilege roles. Production credential roles must be separately provisioned, non-owner, non-superuser, and non-`BYPASSRLS`.

See [`docs/16_workbench_architecture.md`](../docs/16_workbench_architecture.md) for the full trust-boundary ADR.

## Research remains opt-in

Ordinary workbench use does not require OpenAI. A job is queued for external research only when `OPENAI_RESEARCH_ENABLED=true` and `OPENAI_API_KEY` are present in the execution environment. Otherwise it is durably recorded as `configuration_required` and no provider call is made. After the user confirms external transmission, serverless deployments execute the selected job immediately through `/api/research/{jobId}/run`; `vercel.json` also defines a separately authenticated daily recovery run for the durable queue. Local deployments may instead run `npm run worker`.

Research output is validated against `research-result-v2`, stored as an append-only artifact, and converted into a proposal/review item. It never edits the baseline directly. Approval records a governed release decision but does not automatically materialize canonical evidence or replacement estimates. The narrower Opportunity idea flow is an explicit exception only for workbench content: approving `opportunity_idea_brief:<opportunity-uuid>` appends a pinned `idea_brief` content version classified as `ai_hypothesis`; it is not a published baseline fact.

No live credentialed OpenAI/web-search success is claimed by this README. API-key reuse is separate from authorization to transmit a research prompt, target, and baseline externally. Read [`docs/phase3r_7r_research_workflow.md`](../docs/phase3r_7r_research_workflow.md) before enabling the worker.

## Data rules

- Preserve `person`, `child_person`, `household`, `establishment`, and `enterprise` without implicit conversion.
- Keep Low/Base/High, denominator, reference period, method, source release/evidence, confidence, and validation gaps together.
- Store missing evidence as `not_estimable` with null values, never zero.
- Treat AI/synthetic narratives as hypotheses; do not store real names, contacts, addresses, account identifiers, or minor identities.
- Do not mutate the immutable DuckDB/Parquet baseline or published canonical rows to satisfy a UI flow.

## Handoff documentation

- [Current Phase 3R–7R architecture](../docs/phase3r_7r_workbench_architecture.md)
- [Current API contract](../docs/phase3r_7r_api.md)
- [Current data dictionary](../docs/phase3r_7r_data_dictionary.md)
- [Current operations runbook](../docs/phase3r_7r_operations_runbook.md)
- [Current Research workflow](../docs/phase3r_7r_research_workflow.md)
- [User guide](../docs/phase3r_7r_user_guide.md)
- [Product DoD audit](../reports/phase3r_7r_product_dod_audit.json)

Historical Phase 3 workbench documents:

- [Architecture and ADRs](../docs/16_workbench_architecture.md)
- [HTTP and Server Action interface](../docs/17_workbench_api.md)
- [PostgreSQL data dictionary](../docs/18_workbench_data_dictionary.md)
- [Governed research workflow](../docs/19_research_workflow.md)
- [Operations, deployment, and verification](../docs/20_workbench_operations.md)
- [Phase 3–7 verification evidence](../docs/21_workbench_verification.md)
- [Unresolved risks and Phase 8 follow-up](../docs/22_workbench_risks_phase8.md)

The Python engine API/CLI remains documented in [`docs/12_phase2_api_cli.md`](../docs/12_phase2_api_cli.md).
