# Korea Market Sizing Engine

This repository builds a reproducible, unit-safe synthetic-population and market-sizing engine for South Korea. It distinguishes calibrated baseline populations from overlapping business archetypes and never presents synthetic narrative data as facts about real people.

Phase 2 adds a 24-domain consumption/use taxonomy, revision-pinned multilingual semantic embeddings, actual weighted Nemotron clustering, 90 primary motivational subtypes, 120 Phase 1 parent decompositions, ten exact semantic query-parent cases, guarded cross-domain joints, creative activation profiles, and an aggregate feedback loop. The original restaurant/bar evidence slice remains intentionally wide and D-grade because exact owner age 60–69 and own-website status are not jointly observed.

## Reproducible first build

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
./scripts/fetch_sources.sh
.venv/bin/market-engine full-build
.venv/bin/pytest -q
./scripts/test_postgres.sh
```

The raw download is about 2.6 GiB, primarily nine checksum-pinned Nemotron Parquet shards plus the revision-pinned multilingual MiniLM cache. `full-build` verifies sources, calibrates all one million adult synthetic records, synthesizes the official-control minor/household sample, creates the Phase 1 and additive Phase 2 DuckDB/Parquet outputs, fits or reuses 24 versioned domain models, executes acceptance suites and scenarios, writes reports, and validates both phases.

If immutable raw inputs are already present, the staged commands are:

```bash
.venv/bin/market-engine calibrate-adults
.venv/bin/market-engine synthesize-minors
.venv/bin/market-engine build
.venv/bin/market-engine reports
.venv/bin/market-engine run-scenarios
.venv/bin/market-engine build-phase2 --sample-size 1000
.venv/bin/market-engine phase2-reports
.venv/bin/market-engine validate
```

## Query, inspect, and compare

```bash
.venv/bin/market-engine estimate --query examples/queries/website_less_restaurant_owner_60s.json
.venv/bin/market-engine archetypes --category small_business --confidence-min 40
.venv/bin/market-engine get-archetype ARC-06-001
.venv/bin/market-engine explain ESTIMATE_ID
.venv/bin/market-engine compare QUERY_ID QUERY_ID
.venv/bin/market-engine market-size --query examples/queries/website_less_restaurant_owner_60s.json --scenario examples/scenarios/website_service.json
.venv/bin/market-engine refresh-source all
```

Phase 2 domain and subtype examples:

```bash
.venv/bin/market-engine domains
.venv/bin/market-engine domain-taxonomy music_audio
.venv/bin/market-engine domain-behaviors music_audio
.venv/bin/market-engine decompose ARC-06-001
.venv/bin/market-engine decompose-required-case PARENT-02
.venv/bin/market-engine subtypes --domain music_audio
.venv/bin/market-engine estimate-subtype DOM-01-SUB-01 --parent ARC-14-001
.venv/bin/market-engine creative-brief DOM-01-SUB-01
.venv/bin/market-engine targetability DOM-01-SUB-01
.venv/bin/market-engine validate-segmentation --domain music_audio
```

`estimate-domain` accepts a JSON list such as `[{"feature_code":"music_audio.location","value":"직장·학교"}]`. `cross-domain --query FILE.json` accepts same-unit joints directly. Mixed-unit requests require an explicit `output_unit`, documented decision-maker bridge, and `scenario_overlay` Low/Base/High; otherwise they return `not_estimable`. No path multiplies independent marginals or equates one person with one household/enterprise.

The representative first result is approximately **130,000 / 170,000 / 210,000 enterprises (Low/Base/High), confidence 48/D**. The denominator is 745,196 I56 small-business enterprises. Exact owner age 60–69 and own-website status are not jointly observed, so the interval is a decision scenario—not an official point count. Related person and establishment counts remain unavailable because no safe conversion is registered.

Start the REST API after building:

```bash
.venv/bin/uvicorn market_engine.api.app:app --reload
```

Interactive OpenAPI documentation is at `/docs`. Phase 1 remains under `/v1`. Phase 2 uses `/v2/domains`, `/v2/domains/{code}/taxonomy`, `/v2/domains/{code}/estimate`, `/v2/parents/{id}/decomposition`, `/v2/required-parent-cases/{case_id}/decomposition`, `/v2/subtypes`, `/v2/subtypes/{id}`, `/v2/cross-domain/estimate`, `/v2/observations`, and `/v2/segmentation/validate`.

## PostgreSQL workbench

The separate Next.js workbench under `web/` reads the real migrated PostgreSQL baseline and adds segment, estimate, comparison, opportunity, governance, export, and opt-in research/review workflows. It has no demo-count fallback and does not mutate the DuckDB/Parquet baseline.

### Phase 3R–7R current checkpoint (2026-08-26)

The Production runtime reads migrations `001`–`024` from a fixture-free managed Neon database and is deployed at [market-sizing-engine.vercel.app](https://market-sizing-engine.vercel.app). Authenticated health proves 24 domains, 90 Primary Subtypes, 1,440 Archetypes, 1,536 Axis values, 480 Features, 240 Behaviors, Gold Query 10/10, primary `not_estimable` 0, Production fixture 0, and missing display name 0. Migration `024` adds 91,091 identifier-free weighted joint cells across person/household/establishment/enterprise, 253 queryable calibrated dimension conditions, and direct nested AND/OR/NOT evaluation without reading raw Persona rows at runtime. The current web gates are 289 unit tests, the Production baseline integration contract, typecheck, zero-warning lint, a Next.js 16.3.2 Production build, desktop/tablet/mobile read-only browser coverage, and a complete 24/24 Domain sweep. The managed runtime uses a dedicated login inheriting the least-privilege app role and Neon's WebSocket/HTTP serverless transport.

Use the current [architecture](docs/phase3r_7r_workbench_architecture.md), [API contract](docs/phase3r_7r_api.md), [data dictionary](docs/phase3r_7r_data_dictionary.md), [operations runbook](docs/phase3r_7r_operations_runbook.md), [Research workflow](docs/phase3r_7r_research_workflow.md), [user guide](docs/phase3r_7r_user_guide.md), [coverage report](reports/phase3r_7r_data_coverage.json), [deployment artifact manifest](reports/phase3r_7r_deployment_artifact.json), and [Product DoD audit](reports/phase3r_7r_product_dod_audit.json). Live Research attempts are retained as governed audit artifacts; no failed provider response is promoted to an approved baseline.

Phase 2R-A adds a separate `production` schema in the preserved clone database `market_engine_phase2r_a`. Its production-facing domain and estimate read models contain 24 named, sourced official-universe baselines, while production saved segments exclude all prototype integration/E2E fixtures. These baselines are potential eligible universes, not claims of product participation. See [`docs/23_phase2r_a_production_foundation.md`](docs/23_phase2r_a_production_foundation.md) and [`reports/phase2r_a_final_audit.md`](reports/phase2r_a_final_audit.md).

```bash
./scripts/manage_postgres.sh bootstrap
./scripts/backfill_postgres.sh
./scripts/backfill_postgres.sh --verify-only
# Provision the local workspace/member as documented in docs/20_workbench_operations.md.
cd web
npm ci
cp .env.example .env.local
npm run dev
```

Run workbench checks with `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and—against a live prepared database—`npm run test:e2e`. The verified local results are in `docs/21_workbench_verification.md`; they do not certify a different deployment environment or a live AI run.

Historical pre-Phase-2R evidence for migrations `001`–`018`, older test totals, performance, suppression, and security hardening remains in `docs/16_workbench_architecture.md` through `docs/22_workbench_risks_phase8.md`. It is chronology, not the current Phase 3R–7R certificate.

The OpenAI credential is server-only and is never printed or committed. The live Research Job exhausted its first three governed attempts while surfacing and fixing provider-schema, partial-provenance, and timeout integration issues; it remains failed with no fabricated or approved result. Any further external transmission requires a new explicit approval. Local workers and the separately authenticated serverless run-once route share the same durable queue and retry contract.

Start with [`web/README.md`](web/README.md), then use the current Phase 3R–7R documents linked above.

## Outputs and evidence rules

- `data/processed/market_engine.duckdb`: runnable analytical database.
- `data/processed/market_engine_phase2.duckdb`: additive Phase 1+2 analytical database; Phase 1 is copied, not replaced.
- `data/processed/phase2/models/`, `embeddings/`, and `memberships/`: checksum-pinned model artifacts, content-addressed semantic embeddings, and soft assignments with explicit 16-axis scores.
- `data/processed/phase2/tables/`: Parquet exports for all Phase 2 registry, model, subtype, allocation, activation, feedback, and acceptance tables.
- `data/processed/*.parquet`: feature marts, controls, catalog, estimates, and privacy-safe synthesis.
- `data/exports/archetypes.csv`: 18 categories × 80 archetypes; every row has an estimate or explicit `not_estimable` status.
- `reports/`: source coverage, adult calibration, minor-household synthesis, total reconciliation, estimation quality, validation gaps, archetype coverage, and market scenarios.
- `migrations/001_core.sql`: unchanged PostgreSQL Phase 1 schema (30 tables).
- `migrations/002_phase2_domains_subtypes.sql`: additive Phase 2 schema; clean application and idempotent reapplication yield 58 total tables.
- `migrations/003_workbench.sql` through `016_catalog_privacy_and_finite_numeric.sql`: additive workbench state/read models, runtime roles/import manifest, lineage and snapshot guards, atomic approved-factor/source bundles, entity-only TAM/SAM/SOM support, interval/source-lineage integrity, numeric-domain checks, and a fail-closed catalog policy projection. Migration `013` keeps all nine revenue outputs null when annual-spend evidence is unavailable; migration `014` rejects partial or invalid estimate/Phase 2 parent intervals and requires source lineage for estimable parent and published population/control cells; migration `015` rejects negative market/factor/price/cost values and ratio factors outside 0–1; migration `016` makes guarded/inactive/non-allowed catalog rows non-queryable and rejects `NaN`/signed infinities in the four governed numeric targets. None substitutes zero for missing evidence or rewrites baseline source rows.
- `migrations/019_phase2r_a_production_foundation.sql` and `020_phase2r_a_production_invariants.sql`: isolated production universes, observations, citations, domain mappings, display labels, fixture-free read models, and database-enforced confidence/fixture gates. The original `market_engine` database remains unchanged.
- `migrations/021_phase2r_b_calibrated_market_mart.sql` through `024_phase3r_weighted_joint_read_model.sql`: calibrated Domain/Subtype/Archetype/Axis/Feature/Behavior/Gold Query marts, Production-safe Workbench projections, and checksum-verified identifier-free weighted joint cells. Runtime joint estimates retain unit, Low/Base/High, Grade, Confidence, factor/source lineage, and explicit Proxy/dependency limitations.

Never add overlapping archetypes, treat synthetic rows as real people, replace unavailable evidence with zero, or implicitly convert among person, household, establishment, and enterprise. Census and resident-registration universes are deliberately kept separate.

The PostgreSQL schema is under `migrations/`; compact analytical outputs are generated in `data/processed/` as DuckDB and Parquet. Original source PDFs and the full Nemotron dataset are immutable local inputs under `data/raw/` and are excluded from Git; their manifests and checksums are retained.

See `docs/00_mission_and_scope.md` through `docs/15_phase2_dod_audit.md` for methodology, operations, safety, and the historical itemized Phase 2 audit. That audit is explicitly superseded as a current completion certificate by the live 29/0/1 evidence result. `PLANS.md` is the phase/checkpoint and Definition-of-Done ledger.
