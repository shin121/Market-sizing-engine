# Workbench operations

This runbook covers a local PostgreSQL-backed workbench and the boundaries that must be carried into deployment. The supported canonical importer is `scripts/backfill_postgres.sh`, backed by `src/market_engine/postgres_backfill.py`. Do not chain it with the legacy `scripts/backfill_workbench.py`; that older whole-table importer has a different manifest/counting contract and is not the supported Phase 3 handoff path.

## Prerequisites

- Python 3.11+ with the repository installed in `.venv`.
- PostgreSQL client/server tools on `PATH`: `initdb`, `pg_ctl`, `pg_isready`, `createdb`, `dropdb`, and `psql`.
- Node.js `>=24 <27` and npm for `web/`.
- Built immutable Phase 2 input at `data/processed/market_engine_phase2.duckdb` and its referenced Parquet artifacts.
- Enough local disk for the existing analytical data plus a PostgreSQL cluster under `data/local/postgres`.

No external AI credential is required for catalog, segment, estimate, comparison, opportunity, governance, export, or disabled-research behavior.

The current local credential is stored server-side only and the opt-in remains off. No OpenAI/web-search call has been made. Do not enable or execute the reviewed live payload until the user sends exactly `위 payload 그대로 외부 호출 승인.`; a generic confirmation such as “yes” is not that payload approval. After approval, exactly one job must reach `needs_review`, receive human review, and have typed-factor creation/non-consumption plus immutable-baseline isolation verified before the external-call acceptance item can close. Canonical estimate publication remains a separate governed step.

## Fresh local database

From the repository root:

```bash
./scripts/manage_postgres.sh bootstrap
./scripts/manage_postgres.sh status
./scripts/manage_postgres.sh dsn
```

`bootstrap` initializes the local cluster when absent, starts it on Unix socket `data/local/socket` port `55432`, creates database `market_engine`, and applies migrations in filename order. Migration `001` is applied only when the core schema is absent; later migrations are designed to be re-runnable.

The current migration set is:

| Migration | Purpose |
|---|---|
| `001_core.sql` | 30 Phase 1 canonical tables |
| `002_phase2_domains_subtypes.sql` | 28 additive Phase 2 tables |
| `003_workbench.sql` | Workbench tables, canonical extensions, checks, append-only triggers, search indexes, RLS |
| `004_workbench_read_models.sql` | Twelve security-invoker read views |
| `005_workbench_operations.sql` | Baseline import manifest and restricted runtime privilege roles |
| `006_workbench_performance.sql` | Five validation-gap, estimate-page, and reverse-subtype-lineage indexes |
| `007_workbench_governance_hardening.sql` | Parent-owned child RLS, baseline write denial, immutable query snapshots, and derived-estimate provenance/confidence backfill |
| `008_requirement_completion_hardening.sql` | Workspace-owned query/group/condition RLS, same-workspace guards, valid-cache result identity, scoped approved releases, provisioning revocation, complete global search |
| `009_approved_research_factor.sql` | Reviewer-scoped append-only approved factor and factor-source ledgers; proposal-to-factor link |
| `010_reproducible_workbench_snapshots.sql` | Pinned saved-segment calculation versions, scenario-to-segment-version lineage, and immutable child scenario revisions |
| `011_lineage_integrity_guards.sql` | Query-result unit/workspace, saved-version pin, and scenario query/result/saved-version/workspace/unit/supersession-parent lineage guards |
| `012_approved_research_factor_snapshot_hardening.sql` | Atomic immutable factor/source snapshots plus proposal/factor/publication workspace-provenance guards |
| `013_entity_only_market_scenarios.sql` | Entity-only TAM/SAM/SOM by allowing a wholly null revenue envelope under an all-nine-present or all-nine-null constraint |
| `014_interval_lineage_integrity.sql` | Status-consistent complete estimate/Phase 2 parent intervals and non-empty source lineage for estimable parent and published population/control cells |
| `015_numeric_domain_invariants.sql` | Nonnegative market/factor/price/cost values and 0–1 bounds for serviceability/attainable-share or ratio-unit scenario factors |
| `016_catalog_privacy_and_finite_numeric.sql` | Policy-projected condition-catalog sensitivity/queryability plus finite market/factor/price/cost values |
| `017_opportunity_snapshot_invariants.sql` | One-primary-target uniqueness, Opportunity board/query/result/saved-version/market-scenario lineage, append-only primary links, and app-only insert authority |
| `018_release_safe_read_boundary.sql` | Five canonical trusted-application release projections plus release-safe downstream catalog/estimate/segment/comparison/Opportunity/search views |

The source-tree structural target after `001`–`018` is 90 public base tables and 17 `v_*` workbench views. Migration `017` adds no table/view; `018` adds five views and replaces seven existing view definitions without changing a base row. The disposable initial/full-reapply harness passes at 90/17. A populated clone has `017`–`018` applied and retains the pre-migration raw fingerprint. The original populated local database remains deliberately at `016`/90/12 and must not be migrated without explicit authorization. Migration `013` does not backfill missing spend with zero; `014` rejects partial/status-inconsistent intervals and empty required source arrays; `015` adds five numeric-domain checks; and `016` preserves 4,005 catalog rows/14 columns while leaving 3,820 queryable and adds four finite checks. Migration `017` preflights every existing Opportunity link before installing lineage/immutability guards. Migration `018` fails closed on incompatible view objects or unclassifiable non-finite/invalid human intervals before replacing the trusted-application projections. Retain actual command output with each release rather than inferring success from files alone.

### Canonical baseline backfill

Load and verify the immutable DuckDB/Parquet baseline:

```bash
./scripts/backfill_postgres.sh
./scripts/backfill_postgres.sh --verify-only
```

The wrapper runs `manage_postgres.sh bootstrap`, obtains the real socket DSN, and executes:

```bash
.venv/bin/python -m market_engine.cli.main postgres-backfill \
  --database-url "dbname=market_engine host=/Users/woocheolshin/Projects/Market-sizing-engine/data/local/socket port=55432 user=woocheolshin"
```

The importer takes a transaction-scoped advisory lock, computes a semantic source fingerprint, uses deterministic UUIDv5 identifiers or adopts established natural keys, and commits all tables atomically. A repeat import verifies both recorded source and target fingerprints and returns `already_current` without inserting. Source drift or partial target drift is an error; there is no force-overwrite mode.

The default evidence files are:

- `reports/phase3_postgres_backfill_manifest.json`
- `reports/phase3_postgres_backfill_manifest.md`

The checked-in manifest records status `passed`, a real `loaded` outcome, the expected 24/384/480/240/24/90/450/1,440/90 counts, and parent reconciliation errors below tolerance. Treat a newly generated manifest as a release artifact: review its source release, model version, counts, hashes, and reconciliation before accepting it.

### Provision the local workbench identity

The canonical baseline importer does not create workspace/user state. On a fresh database, provision the deterministic local development workspace and owner separately:

```bash
WORKBENCH_DSN="$(./scripts/manage_postgres.sh dsn)"
psql -v ON_ERROR_STOP=1 "$WORKBENCH_DSN" <<'SQL'
INSERT INTO workspace (workspace_id, workspace_key, name, status)
VALUES (
  '9f693300-49ad-5bd5-ad98-af4e225661ea',
  'default',
  'Market Intelligence Workbench',
  'active'
)
ON CONFLICT DO NOTHING;

INSERT INTO workspace_member (workspace_id, actor_id, role)
VALUES (
  '9f693300-49ad-5bd5-ad98-af4e225661ea',
  '314126eb-26a2-55fa-a613-28180096cbac',
  'owner'
)
ON CONFLICT DO NOTHING;
SQL
```

Verify the exact rows before starting the UI:

```bash
psql "$WORKBENCH_DSN" -c "SELECT w.workspace_id,w.workspace_key,m.actor_id,m.role FROM workspace w JOIN workspace_member m USING (workspace_id) WHERE w.workspace_key='default';"
```

These UUIDs match `web/src/lib/constants.ts`. They are controlled local service identities, not real-person identifiers. Production must provision its own workspace/member and set the corresponding UUIDs through the secret-session configuration.

## Local web configuration and run

Install the locked Node dependencies:

```bash
cd web
npm ci
cp .env.example .env.local
```

For this checkout's local socket, use either the URI form:

```text
DATABASE_URL=postgresql://woocheolshin@localhost:55432/market_engine?host=%2FUsers%2Fwoocheolshin%2FProjects%2FMarket-sizing-engine%2Fdata%2Flocal%2Fsocket
```

or omit all database URL variables and set standard PostgreSQL variables:

```text
PGHOST=/Users/woocheolshin/Projects/Market-sizing-engine/data/local/socket
PGPORT=55432
PGDATABASE=market_engine
PGUSER=woocheolshin
```

Complete `.env.local` with:

```text
WORKBENCH_AUTH_MODE=local
WORKBENCH_ACCESS_SECRET=
WORKBENCH_DEFAULT_WORKSPACE_ID=9f693300-49ad-5bd5-ad98-af4e225661ea
WORKBENCH_DEFAULT_ACTOR_ID=314126eb-26a2-55fa-a613-28180096cbac
OPENAI_RESEARCH_ENABLED=false
OPENAI_API_KEY=
OPENAI_RESEARCH_MODEL=gpt-5.6
RESEARCH_POLL_INTERVAL_MS=1500
RESEARCH_RUNNING_LEASE_MS=300000
```

The `market_engine_app` value in `.env.example` is a deployment credential placeholder; migration creates that privilege role as `NOLOGIN`, so it is not a ready-to-use local username. The local socket procedure intentionally connects as the current OS user. Do not use that owner/superuser-style connection in production.

Start the app:

```bash
npm run dev
```

Then check real database connectivity:

```bash
curl --fail-with-body http://localhost:3000/api/health
```

The response should report live database time and the loaded catalog/view counts. The UI has no demo-data fallback: a missing database, missing migration, or missing baseline must surface as an error rather than substituted sample counts.

## Environment-variable reference

### Database

| Variable | Purpose |
|---|---|
| `MARKET_ENGINE_DATABASE_URL` | Highest-precedence Node/PostgreSQL connection URI. |
| `DATABASE_URL` | Second-precedence connection URI; also accepted by the Python backfill CLI. |
| `POSTGRES_URL` | Third-precedence Node connection URI. |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | Standard structured `pg` connection settings when no URI is supplied. |
| `DATABASE_POOL_MAX` | Node pool size, positive integer, default 5 for serverless-safe managed PostgreSQL usage. |
| `DATABASE_CONNECT_TIMEOUT_MS` | Connection timeout, positive integer, default 5,000. |
| `DATABASE_IDLE_TIMEOUT_MS` | Idle pool timeout, positive integer, default 30,000. |
| `DATABASE_STATEMENT_TIMEOUT_MS` | Per-statement timeout, positive integer, default 15,000. |

Workbench server code uses the single canonical `web/src/server/db/*` repository boundary and the variables above.

### Auth and context

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Production disables local auth/context fallback. |
| `WORKBENCH_AUTH_MODE` | `local` only outside production; `secret` is required in production. |
| `WORKBENCH_ACCESS_SECRET` | Shared production access secret, at least 32 characters. Store in a secret manager. |
| `WORKBENCH_DEFAULT_WORKSPACE_ID` | Explicit UUID for the authenticated secret session. Required in production. |
| `WORKBENCH_DEFAULT_ACTOR_ID` | Explicit UUID for the authenticated secret session. Required in production. |

Non-production context also recognizes `MARKET_ENGINE_DEFAULT_WORKSPACE_ID`/`DEFAULT_WORKSPACE_ID` and `MARKET_ENGINE_DEFAULT_ACTOR_ID`/`DEFAULT_ACTOR_ID`, but deployment should use the `WORKBENCH_*` names. Never accept these values from a form, query string, or unverified request header.

### Research worker

| Variable | Purpose |
|---|---|
| `OPENAI_RESEARCH_ENABLED` | Exact string `true` opts into external research. Any other value keeps it off. |
| `OPENAI_API_KEY` | Server-only provider key. Required by both the job-creating Next process and executing worker when enabled. |
| `OPENAI_RESEARCH_MODEL` | Optional model override; current default is `gpt-5.6`. |
| `RESEARCH_POLL_INTERVAL_MS` | Worker empty-queue poll interval, clamped to 250–60,000 ms. |
| `RESEARCH_RUNNING_LEASE_MS` | Claim-time stale-running recovery window, default 300,000 ms and clamped to 60,000–3,600,000 ms. |
| `RESEARCH_JOB_ID` | Required UUID for `npm run worker:once`; the continuous worker ignores it. |

`MARKET_ENGINE_MODEL_VERSION` appears in `.env.example` for release alignment, but the current workbench repositories select the latest database model row; it is not an enforced runtime pin. Do not rely on it as a deployment guard until code/tests enforce that behavior.

### Local PostgreSQL scripts

| Variable | Default |
|---|---|
| `MARKET_ENGINE_PG_DATA` | `data/local/postgres` |
| `MARKET_ENGINE_PG_SOCKET` | `data/local/socket` |
| `MARKET_ENGINE_PG_LOG` | `data/local/postgres.log` |
| `MARKET_ENGINE_PG_PORT` | `55432` |
| `MARKET_ENGINE_PG_DATABASE` | `market_engine` |
| `MARKET_ENGINE_PG_USER` | Current OS user |
| `MARKET_ENGINE_PYTHON` | `.venv/bin/python` for `backfill_postgres.sh` |

### Test-only controls

| Variable | Purpose |
|---|---|
| `MARKET_ENGINE_TEST_DATABASE_URL` | Already migrated **disposable** PostgreSQL database used by the Python backfill integration tests. |
| `RUN_DATABASE_INTEGRATION=1` | Enables conditional Node repository/workflow integration suites when relying on the local fallback rather than an explicit URL. |
| `PORT` | Playwright-managed development-server port, default 3100. |
| `PLAYWRIGHT_BASE_URL` | Targets an already reachable workbench URL. |
| `PLAYWRIGHT_SKIP_WEBSERVER` | Prevents Playwright from starting its own Next server when set. |
| `CI` | Forbids focused tests, enables one retry, and prevents reuse of an existing dev server. |

### Request, response, and export safety ceilings

The JSON mutation routes for segments, estimates, Opportunities, and Research stream request bodies under a fixed 128 KiB ceiling. Both `Content-Length` and bytes actually read are checked; `413 request_body_too_large` and `400 request_body_invalid_json` are deliberate client errors. Segment condition ASTs add depth/node/array/object/string ceilings documented in `docs/17_workbench_api.md`. Main JSON data routes serialize through a 512 KiB response ceiling; export JSON/CSV/HTML routes use a separate 5 MiB ceiling. Both measure UTF-8 bytes and return a small `response_body_too_large` JSON error instead of the oversized content. Do not raise a ceiling merely to accept an unreviewed generated payload; split or simplify the request and preserve its intended Boolean logic.

CSV exports are semantic long-form rows rather than one nested JSON cell. Text values beginning with spreadsheet formula sigils are neutralized before CSV quoting, while valid negative numeric literals—including decimals and scientific notation with surrounding whitespace—remain numeric instead of being prefixed as text. Printable exports render escaped section tables. Preserve both properties in any downstream export rewrite, and still open exported files only in an appropriately sandboxed office environment when their data source is untrusted.

### Scenario and comparison honesty

Market revenue is a horizon value, not an unlabelled annual value: annual spend and realized ARPU are multiplied by `horizon_months/12`. Entity, annual-spend, capacity, and realized-ARPU intervals must be nonnegative. When annual-spend evidence is absent, migration `013` permits an entity-only Low/Base/High scenario with all nine revenue outputs null; never replace them with zero or persist a partial revenue envelope.

The scenario form renders a live draft preview from the same pure sizing function before save. Sizing detail accepts an explicit exact active revision at `/sizing/{estimateId}?scenarioId={uuid}&scenarioVersion={positive-safe-version}`. Both parameters must appear exactly once; partial, blank, repeated, malformed, inactive, wrong-estimate, wrong-query-result, or cross-workspace values fail closed without automatic fallback. With both absent, detail auto-selects only when exactly one active scenario exists. Detail and JSON/CSV/print exports preserve the selected scenario ID, version, and selection mode.

Persisted comparison behavior is deliberately unchanged: a comparison may expose market metrics only when the member's pinned query result has exactly one active market scenario. Zero active scenarios yield `active_market_scenario_not_available`; more than one yields `multiple_active_market_scenarios_require_explicit_selection`. A unique scenario carries its scenario ID/name/version, horizon, currency, and annual-spend factor into the pinned comparison disclosure. There is no comparison-member scenario selector, so a comparison never borrows the sizing-detail query parameters or assumes the newest row is authoritative.

Migration `018` adds a second fail-closed check at read time: comparison market values must come from a scenario whose `base_query_result_id` equals the member's pinned result, and a rare human estimate exposes no count or market metrics. Estimate, saved-segment, comparison, Opportunity, research-baseline, scenario-save, and export repositories use the canonical release-safe projections. Do not replace them with raw ledger reads for display/export convenience.

## Research worker operation

Research is off by default. To enable it in an authorized, cost-aware environment, set the opt-in, server-side key, and optional model in the environment of **both** the Next server and worker. Restart both processes, then run:

```bash
cd web
npm run worker
```

The adapter has fixed server safety ceilings: 12,000 provider output tokens, 128 KiB serialized provider input, and 256 KiB serialized structured output, plus bounded research strings/arrays in the Zod contract. A size violation is a schema-classified failure and must not be bypassed by truncating evidence silently. The provider-source ledger accepts URLs only from **completed** web-search calls and collects their `search` sources plus visited `open_page`/`find` URLs; incomplete calls are ignored. Each structured source URL must match that ledger, and obvious search-results pages are rejected. This is not a substitute for a reviewer opening the original source and checking its locator and claim support. Review these constants and provider pricing before deployment; they are not environment knobs.

Ordinary Research Queue submissions with an explicit target-variable baseline already marked `estimated` are rejected. A calculated saved segment may still be attached as context for an unresolved target variable; when an explicit baseline is also supplied, inspect `snapshotProvenance.targetVariableBaseline` separately from `snapshotProvenance.segmentContext`. Do not work around the eligibility guard by stripping an available target-variable baseline.

The saved-segment research context computes effective enablement recursively. A condition whose own flag is true but whose ancestor group is disabled is persisted in provenance as disabled and must not be interpreted as an active research constraint.

For an Opportunity idea brief, `sourceFeatureIds` and `sourceBehaviorIds` are mandatory arrays. Approval accepts only exact source codes from effectively enabled, queryable feature/behavior/tag conditions in the pinned query result; invented, disabled, wrong-kind, wrong-workspace, or mismatched IDs fail closed. The stored content keeps the verified operator, value, unit, reference year, evidence, dependency group, and catalog provenance rather than treating an LLM-authored ID as authority.

For a one-job diagnostic or reviewed recovery of a configuration-required job:

```bash
cd web
RESEARCH_JOB_ID=123e4567-e89b-42d3-a456-426614174000 npm run worker:once
```

One-shot processing rejects a missing/non-UUID ID and only claims that exact workspace-visible row when it is `queued` or `configuration_required`. This guard prevents accidental execution of an unknown oldest queued payload. The continuous worker only polls ordinary `queued` jobs.

The worker is safe to scale horizontally at the claim boundary because it uses `FOR UPDATE SKIP LOCKED`. Before each claim, `recoverExpiredRunningJobs` checks the bounded `RESEARCH_RUNNING_LEASE_MS` window (default 300 seconds), requeues an expired attempt when budget remains, otherwise marks it failed, and appends an event. There is no active heartbeat or independent scheduler, so recovery happens only when another worker polls/claims; inspect job events, artifacts, provider logs, and attempt counts before any manual intervention. Never bulk-change all `running` rows.

When `NODE_ENV=production`, the worker also resolves the fixed trusted context through `WORKBENCH_AUTH_MODE=secret`, `WORKBENCH_ACCESS_SECRET`, `WORKBENCH_DEFAULT_WORKSPACE_ID`, and `WORKBENCH_DEFAULT_ACTOR_ID`. The worker does not expose an HTTP auth surface, but the current context implementation still requires those values; use the worker database login and workspace member described below.

Completion and failure re-lock the job and require the same `running` attempt before committing. If cancellation commits while a provider call is in flight, the later completion/failure path returns without overwriting `cancelled`. Prefer cancellation while queued to avoid paying for work whose result will be discarded, and inspect provider usage when cancelling an in-flight job.

See `docs/19_research_workflow.md` for retry, failure, schema, and review behavior. Before deciding, reviewers should inspect the rendered denominator/value/interval delta, confidence change, source freshness, affected IDs, and expected recalculation action. That impact envelope is advisory until a governed publication transaction actually invalidates and recalculates dependencies. No live OpenAI success is asserted by this runbook.

## Production database roles

Migrations create two privilege roles:

- `market_engine_app`: append-only workspace-derived estimate/scenario/query snapshots, mutable segment/comparison/opportunity roots, research-job creation, review decisions, approved release inserts, and reviewer-scoped approved factor/source inserts. It cannot update/delete baseline, estimate/scenario snapshots, or approved factor/source rows.
- `market_engine_worker`: job/step/proposal/review-item mutations and event/artifact appends, without review-decision authority.

Both are `NOLOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, and `NOINHERIT`. Provision separate credentialed login roles outside migrations, make them inheriting members of only the needed privilege role, and store credentials in the deployment secret manager. For example, run equivalent reviewed DDL as the database administrator (password/identity provisioning intentionally omitted):

```sql
CREATE ROLE workbench_web_login LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT market_engine_app TO workbench_web_login;

CREATE ROLE workbench_research_login LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT market_engine_worker TO workbench_research_login;
```

Do not make runtime logins table owners. PostgreSQL table owners and superusers can bypass ordinary RLS. The application sets `market_engine.workspace_id` and `market_engine.actor_id` with transaction-local `set_config`; a production smoke test must execute reads and writes through the actual login roles, not only the migration owner.

The current shared-secret mode is one fixed actor/workspace, not per-user RBAC. Do not expose it publicly as a multi-tenant identity system without implementing and testing verified member identity and role authorization.

## Required verification before a checkpoint

Repository rules require the Python suite and engine validation:

```bash
.venv/bin/python -m pytest
.venv/bin/python -m market_engine.cli.main validate
./scripts/backfill_postgres.sh --verify-only
```

Exercise clean/idempotent migrations in the disposable local database script:

```bash
./scripts/test_postgres.sh
```

That script drops and recreates the explicitly named local test database `market_engine_migration_test`, applies `001` once, verifies/reapplies `002`, then initially applies and fully reapplies `003`–`018`. It expects 90 base tables plus 17 workbench views. In addition to the earlier RLS, lineage, scenario, factor, interval, numeric, and catalog fixtures, it asserts migration-`017` one-primary-target/lineage/append-only/runtime-grant behavior and migration-`018` rare-human suppression, control-unit preservation, hash/text/locator redaction, downstream comparison/Opportunity/search behavior, `security_invoker` options, grants, and preflight denial. The current isolated harness passes initial application and full reapplication. Never point this destructive test script, or an adapted copy, at a populated development or production database.

Run the workbench checks from `web/`:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

`npm test` is the unit + integration shorthand. Integration tests require the migrated, backfilled PostgreSQL baseline and accept the same URL/PG variables as the server. They verify baseline counts, repositories, transaction-local context, restricted-role write denials/child isolation, derived lineage, pinned saved-segment/scenario revisions, entity-only scenarios, exact decimal scenario math, unambiguous comparison scenarios, cache regeneration, atomic typed-factor/source approval, governance status, and disabled research gate. The final post-`018` populated-clone aggregate records database-enabled Python 67 passed with one Starlette deprecation warning (65 passed/2 skipped without the database environment), engine validation 46/46, passing typecheck, zero-warning lint, 44 files/261 unit tests, 6 files/44 actual-PostgreSQL integration tests, production build, browser 22 passed/5 intended skips, and a passing SQL initial/full-reapply harness. Bounded export-response tests cover JSON/CSV/print success headers, UTF-8 byte accounting, and 5 MiB overflow. The gated mutating review 1/1 and production-auth smoke remain explicitly historical post-`016` evidence rather than post-`018` claims.

The historical post-`016` baseline rerun records Python 64 passed/2 skips, engine validation 46/46, PostgreSQL 90 tables/12 views with nine `014`, five `015`, and four `016` validated constraints, and baseline verification 17/18. The live Phase 2 DoD verifier is 29 passed/0 failed/1 unavailable because historical evidence of the original Nemotron direct-acquisition execution cannot be established. The source, disposable harness, and populated verification clone now extend through `018`, while the original populated database remains deliberately at `016`. Passing application or migration checks does not turn the unavailable acquisition evidence into a pass or provide an independent holdout.

The browser suite is separate:

```bash
npm run test:e2e
```

Playwright starts a development server on port 3100 unless `PLAYWRIGHT_SKIP_WEBSERVER` is set; `PLAYWRIGHT_BASE_URL` targets an existing server. It requires installed browser binaries and a live migrated/backfilled database. The final post-`018` desktop/tablet/mobile run against the populated clone completed 22 passed/5 intended skips, including console/page-error, axe accessibility, responsive navigation, and Market Atlas concept checks. The concept is verified without importing the reference's hardcoded numbers, random bars, or in-memory calculations; the unavailable direct axis→subtype relationship is not fabricated, and mobile comparison remains an honest horizontally scrollable table. The retained gated-review 1/1 case is historical post-`016` evidence, not a live-provider run. No external provider was called. See `docs/21_workbench_verification.md` for the regenerated `018` verification boundary.

Do not enable live research merely to make routine tests pass. A credentialed provider test is a separate authorized acceptance step with cost/network/source review and sanitized artifacts.

## Day-two commands

```bash
./scripts/manage_postgres.sh start
./scripts/manage_postgres.sh status
./scripts/manage_postgres.sh dsn
./scripts/manage_postgres.sh migrate
./scripts/manage_postgres.sh stop
```

`migrate` starts the local server, creates the database if needed, applies `001` only when the core is absent, then reapplies every additive migration after `001` in filename order. Back up and rehearse every migration in a disposable copy before production; the local script is not a production migration orchestrator.

Inspect the import manifest without modifying it:

```bash
WORKBENCH_DSN="$(./scripts/manage_postgres.sh dsn)"
psql "$WORKBENCH_DSN" -c "SELECT import_key,source_sha256,model_version,table_counts,imported_at,verified_at FROM baseline_import_manifest ORDER BY imported_at;"
```

Inspect queue health:

```bash
psql "$WORKBENCH_DSN" -c "SELECT status,count(*),min(created_at),max(updated_at) FROM research_job GROUP BY status ORDER BY status;"
```

Inspect approved, unpublished typed factors without treating them as published estimate counts:

```bash
psql "$WORKBENCH_DSN" -c "SELECT target_variable,entity_unit,denominator,reference_year,value_low,value_base,value_high,confidence_score,confidence_grade,created_at FROM approved_research_factor ORDER BY created_at DESC LIMIT 25;"
```

Each factor must link to its approved workspace release and proposal. Its source rows are reviewed source metadata, not a substitute for canonical `data_source`/`source_release`/`evidence` registration when publishing a replacement estimate.

When using a non-owner RLS role, run diagnostic queries inside a transaction that sets the reviewed workspace and actor; an empty result without context is expected isolation, not evidence that rows vanished.

## Backup, restore, and rollout

Before a production migration/backfill or governed release:

1. Stop or drain mutation traffic and research workers.
2. Capture a database-native backup and record its storage/checksum/retention location.
3. Verify the immutable DuckDB/Parquet input checksum and free disk space.
4. Apply migrations in order with a migration owner; do not run the app as that owner.
5. Run canonical backfill verification. Never delete/reinsert baseline rows to “fix” a hash mismatch.
6. Provision runtime login roles, workspace/member, and server secrets.
7. Smoke-test `/api/health`, representative catalog/lineage reads, a `not_estimable` unsupported joint, and a reversible workbench write through the app role.
8. Start the worker only if the external-research gate is intentionally enabled.
9. Run the required test/validation commands and retain their actual outputs.

Example PostgreSQL backup commands (choose operator-controlled paths and credentials):

```bash
pg_dump --format=custom --file=/operator/controlled/market_engine.dump "$DATABASE_URL"
pg_restore --list /operator/controlled/market_engine.dump
```

Restore into a new database first and validate it; do not overwrite the only production copy during rehearsal.

## Monitoring and known operational gaps

Monitor at minimum:

- `/api/health` availability and database latency;
- pool saturation/connect timeout counts;
- research jobs by status, age, attempts, and error code;
- append-only event sequence gaps/duplicate conflicts;
- review backlog by priority/age;
- `not_estimable` and open validation-gap counts;
- import-manifest fingerprint drift;
- audit-event write failures;
- slow read-model queries and index usage.

`reports/phase3_workbench_performance.json` is a schema-v3, three-stage, read-only, local warm-cache audit with status `remediated_with_remaining_risks`. Its final current-stage run generated at `2026-08-25T13:50:49.812Z` on the post-`018` populated clone and measured 10 queries: 8 below 3 ms, maximum 24.128 ms, zero above 50 ms, zero physical reads, and zero temporary spills. The `WB-PERF-09` estimate-list candidate-page optimization reduced the immediately pre-fix plan from 53.005 ms/51,819 buffer hits to 2.362 ms/1,849 hits. Frozen baseline and index-only stages remain labeled as historical measurements rather than post-`018` results. Migration `006` contains five indexes for the measured validation-gap, estimate-page, and reverse-subtype-lineage paths; the current archetype repository also bounds enrichment to its candidate page. The audit remains single-user and warm-cache, not a throughput or production-capacity certificate.

Those timings are not a throughput/concurrency benchmark. Global search remains scan-bound on the archetype branch, polymorphic comparison resolution still text-casts/OR-scans estimates as the corpus grows, and advanced text/non-name archetype sorts were not benchmarked in the ten-query set. Re-run representative `EXPLAIN (ANALYZE, BUFFERS)` measurements after deployment and as cardinality grows.

The checked-in audit harness uses read-only PostgreSQL transactions but rewrites its JSON report file:

```bash
NODE_PATH=web/node_modules node scripts/audit_workbench_performance.cjs
```

Current limitations requiring explicit operator awareness:

- Shared-secret auth is a single identity, not SSO or per-member RBAC.
- The worker has claim-time lease recovery but no active heartbeat or independent recovery scheduler; an idle queue will not recover an abandoned `running` job until another poll/claim occurs.
- Research approval materializes a cited numeric result as an append-only typed factor/source bundle, but does not publish canonical source/evidence records or a replacement estimate. The current calculator does not consume `approved_research_factor`; it remains approved-unpublished and cannot make a count estimable without a reviewed unit-safe publication binding.
- Migration `011` does not mutate exact historical `security-fixture-v1` lineage artifacts: the final populated-database run emitted count-bearing `WARNING` messages for 7 query-result fixtures and 6 scenario fixtures, found 0 production-scope violations, and guards every new row without a fixture bypass. Preserve those warnings in migration logs and keep production violation counts at zero.
- Migration `012` requires each factor and its complete contiguous source set to commit atomically in the approving owner/reviewer transaction; a later source append or cross-workspace proposal/factor/publication link must fail.
- Migration `014` requires complete/status-consistent estimate intervals and non-empty required source arrays. It validates structural lineage presence, not the semantic quality or compatibility of the referenced release.
- Migration `015` rejects negative market/factor/price/cost values and out-of-range ratio factors. It does not enforce the exactly-nine Opportunity score bundle at deferred commit; that completeness check remains service-owned because components are inserted incrementally.
- Migration `016` rejects `NaN` and signed infinities in market estimates, scenario factors, opportunity prices, and experiment costs and fail-closes guarded catalog rows. It does not rewrite source rows, make the scanner universal, or add another cross-tier ordering check.
- Migration `017` enforces one immutable primary target and exact Opportunity board/query/result/saved-version/market-scenario lineage. The form/service also requires and compares `expected_lock_version`, so a stale mutable-root edit returns `opportunity_edit_conflict`; this does not create a generalized public error contract.
- Migration `018` adds five canonical release-safe views and rewrites downstream reads/exports to use them. It redacts rare-human values, value-bearing prose/metadata, locators, and reconstruction hashes while preserving safe provenance and business-unit controls. Both runtime roles still retain broad raw-table `SELECT`; treat `018` as a trusted-server repository boundary, not hard database confidentiality or permission for arbitrary SQL clients.
- A standalone factor with no reviewed materialized estimate/dependency target intentionally does not invalidate unrelated cached estimates.
- The web segment service validates every enabled condition against the catalog and rejects unknown/non-queryable entries, blocked sensitivity classes, and namespace/unit/operator/type/value mismatches before persistence. Maintain the catalog and its allowed-value/type semantics as a release-controlled policy surface.
- The personal-data guard recognizes high-confidence email, phone, resident-registration, labeled account/financial-account, and detailed street-address forms on implemented segment/scenario/comparison/Opportunity/review/research/provider paths; the fully enriched canonical research payload is re-scanned immediately before persistence. It is not universal PII or real-name detection; operators must still prohibit identifiers and review suspicious prose.
- Terminal review decisions require a non-blank user-authored note and an accessible confirmation step. These controls reduce accidental decisions but do not replace reviewer authorization.
- Opportunity optimistic locking is enforced for the implemented editor: a required expected version is compared under lock and included in the conditional update. Third-party mutation compatibility/error versioning remains separate work.
- Mutation routes do not yet provide a versioned public error catalog or generalized unexpected-error envelope. Keep the current routes private and add top-level schemas, correlation IDs, and a public error allowlist before third-party use.
- The Python DSL blocked-use check trusts the caller-declared `use_context`; a misdeclared purpose is not detected. Separately, derived `person`/`child_person`/`household` results with raw weighted Base below 10 are suppressed in Python and persisted web calculation snapshots. A persist-and-load sanitizer canonicalizes even legacy suppressed payloads, while migration `018` carries the boundary through trusted application estimate/detail/comparison/Opportunity/research/scenario/export reads; both legacy human Base-below-10 rows in the populated verification clone project as suppressed. Business units and Base=10 remain outside the threshold. This still is not universal confidentiality because runtime roles can select raw tables directly.
- Current subtype allocations contain zero human-unit Base-below-10 rows, but subtype/archetype detail still reads raw `subtype_allocation`. Before any future rare human allocation is loaded, add a release-safe projection and repository switch; monitoring the current zero is not a durable enforcement mechanism.
- Axis and subtype pages do not have a direct observed axis-to-subtype relationship. Keep them as separate provenance/model layers and show the relationship as unavailable rather than inferring or fabricating a joint.
- Main JSON data responses are capped at 512 KiB and export JSON/CSV/HTML responses at 5 MiB, both using UTF-8 byte counts. These ceilings bound a single response; they do not replace rate, concurrency, or memory-pressure testing.
- The web model-version env value is not an enforced database pin.
- Live AI success is not certified because the external-research gate remained disabled; the server-only key was not used. The exact approval phrase `위 payload 그대로 외부 호출 승인.` has not been received, and the live Research Job, human review, materialization, and baseline-isolation verification remain pending.
- The local application matrix does not close the Phase 2 evidence gap: current live DoD is 29/0/1 and the Phase 3 baseline verifier is 17/18 FAILED solely on the unavailable historical Nemotron direct-acquisition execution provenance.
- Local E2E/build/auth evidence does not certify an unprovisioned cloud target; repeat it with target PostgreSQL roles, secrets, and network boundaries.

## Non-negotiable constraints

- Never run the canonical and legacy baseline importers consecutively as a normal bootstrap sequence.
- Never edit immutable DuckDB/Parquet source artifacts or published baseline rows to resolve an import mismatch.
- Never replace missing evidence with zero; preserve `not_estimable` and its validation plan.
- Never combine unlike entity units without a reviewed `entity_unit_bridge`.
- Never expose database/provider/auth secrets to the browser or commit `.env.local`.
- Never publish an estimate lacking source release, reference period, denominator, method, confidence assessment, and validation-gap review.
- Never store real names, contacts, addresses, account identifiers, or minor identities in workbench records.
