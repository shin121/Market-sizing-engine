# Execution plan and checkpoint ledger

Last updated: 2026-08-26 (Asia/Seoul)

## Mission

Build a reproducible South Korea Synthetic Population & Market Sizing Engine spanning people, minors aged 0–18, households, establishments, and enterprises. Separate calibrated baseline populations from overlapping business archetypes. Every estimate must expose Low/Base/High, unit, denominator, reference period, formula, source lineage, confidence, assumptions, and validation gaps.

## Current checkpoint

- Phase 3R–7R Workbench checkpoint (2026-08-26): migrations through `024` are active on fixture-free `market_engine_phase3r_production`; Production health proves 24 Domain, 90 Primary Subtype, 1,440 Archetype, 1,536 Axis values, 480 Feature, 240 Behavior, Gold Query 10/10, primary `not_estimable` 0, fixture 0, and missing display name 0. The additive weighted-joint read model contains 91,091 aggregate cells across 1,650,000 calibrated unit-frame rows while retaining all original Nemotron shards and checksums; it enables nested AND/OR/NOT intersection sizing, conditional proxy factors, immutable snapshot reuse, and source/confidence lineage without querying raw Parquet at web runtime. The 116-table whole-Production scan proves fixture-like rows 0 after creating one actual saved segment/query/opportunity/research workflow. Python 70 passed/12 skipped, engine validation 46/46, web unit 48 files/280 tests, disposable-test-DB PostgreSQL integration 8 files/51 tests, typecheck, zero-warning lint, and Next.js 16.3.2 Production build all pass. The write-capable Browser suite passes 25 cases with 2 intentional viewport skips in an automatically removed clone; its 16-step workflow, including natural-language confirmation and a 429,539-household numeric result, passes on desktop/tablet/mobile while the Production DoD fingerprint remains unchanged. The read-only Production contract passes 4 cases with 2 intentional profile skips, including a desktop 24/24 Domain sweep and axe/overflow/fixture/internal-status/console gates. The authenticated loopback Production runtime audit passes 10/10 API/SSR p95 limits; Explorer SSR p95 is 15.397 ms and Archetype SSR p95 is 31.311 ms. Checksum-pinned archive `market_engine_phase3r_production_20260826_v2.dump` restores into a fresh PostgreSQL 17 TCP/TLS cluster as a `NOSUPERUSER + CREATEROLE` owner; target-owner runtime ACL is reapplied, and Node `verify-full` plus all 51 DB tests pass. The Research UI uses explicit external-transmission confirmation, a confirmation-header-protected immediate execution route, and a separately authenticated daily recovery schedule; missing confirmation returns 428, a disabled provider returns 409, and the actual Job remains `configuration_required` with attempt 0 and artifact 0. The application runs in local Production secret mode. Full Product DoD remains gated only by explicit authorization to transmit the recorded Research payload to OpenAI and authorization/provisioning for a managed PostgreSQL and cloud deployment target.
- Status: **partial implementation; original Goal completion is not certified**. The national vertical slice and local Market Atlas workbench operate, but independent holdout validation, province/district baseline coverage, exhaustive mutually exclusive Layer-A household/business populations, calibrated minor-household joints, truthful-purpose authorization, and a credentialed Research review/publication run remain open. Derived rare human outputs are value-free in Python persistence/load and the trusted web read/export path; this remains a repository boundary rather than hard database confidentiality. Migration source and the isolated harness extend through `018` at 90 tables/17 views, and a populated clone preserves its raw fingerprint after `017`–`018`. The original populated database remains deliberately at `016`/90/12. The 64/2 Python, 46/46 validation, 198 unit, 43 integration, build, browser 22/5, review 1/1, performance, and auth figures are historical post-`016` evidence while the post-`018` aggregate runs. The baseline remains 17/18 `FAILED` solely on unavailable historical Nemotron-acquisition provenance. External SSO/RBAC, live provider acceptance, and target deployment remain unverified.
- First vertical slice: “대한민국에서 홈페이지가 없는 60대 음식점 사장/사업체는 몇 개인가?”
- Execution defaults: local PostgreSQL 17 for schema verification, DuckDB/Parquet for analytical data, public/free sources only, Python 3.13, fixed random seed `20260824`.
- Important evidence constraint: official 2023 small-business tables observe `60세 이상` and digital-system categories, but not exact age 60–69 jointly with own-website possession. The vertical slice must therefore use a documented age proxy and website-absence scenario, return D-grade uncertainty, and preserve `owner_attribute_unobserved` plus `business_web_presence_unobserved` gaps.

## Phase checklist

### Phase 0 — preflight

- [x] Inspect repository and existing `AGENTS.md` (empty workspace; none existed).
- [x] Inspect runtimes and DB availability (Python 3.13.2, PostgreSQL 17.11 binaries, no running server, no DuckDB CLI).
- [x] Check capacity (56 GiB free; Nemotron repository reported as 1.98 GiB).
- [x] Create durable repository rules and this execution ledger.
- [x] Establish package skeleton, test command, local DB lifecycle, and deterministic build command.
- [x] Inspect Nemotron dataset card, schema, shards, license, and exact download footprint.

### Phase 1 — methodology and source catalog

- [x] Register authoritative sources, releases, variables, evidence locators, licenses, retrieval timestamps, and checksums.
- [ ] Load at least five years where openly downloadable and relevant. MOIS 2020–2024 exact-age 0–18 releases and checksums are preserved, but equivalent executable time-series cells/trend adjustment for adult, household, and business units remain missing.
- [x] Fix official reconciliation totals for population, minors, households, establishments, and enterprises.
- [x] Export source coverage and evidence ledger reports.

### Phase 2 — taxonomy

- [x] Finalize 12–20 categories after evidence-availability review.
- [x] Version canonical feature registry and allowed/forbidden target rules.
- [x] Define archetype construction, duplicate detection, overlap, and unit rules.

### Phase 3 — storage and database

- [x] Implement Bronze/Silver/Gold manifests and Parquet conventions.
- [x] Implement PostgreSQL 15+ migrations with PK/FK/UNIQUE/CHECK and appropriate indexes.
- [x] Apply all migrations to a clean local PostgreSQL database (30 public tables).
- [x] Persist model/source/run hashes and pipeline row-count/quality checkpoints.

### Phase 4 — adult Nemotron

- [x] Acquire immutable Nemotron metadata and data with checksum and CC BY 4.0 attribution.
- [x] Normalize structured features; exclude narrative text from the analytical mart.
- [x] Calibrate against official marginals/cross-tabs and report pre/post error, weight extremes, and effective sample size.
- [ ] Select rule-compatible representative synthetic persona IDs without presenting them as real people. Phase 2 subtype representatives are model-derived; the Phase 1 catalog currently uses disclosed deterministic exemplars that are not proven to satisfy each archetype rule.

### Phase 5 — minors and households

- [x] Build exact-age 0–18 cells and required derived age bands.
- [x] Mark unavailable education/care/household joints as synthetic/non-estimable instead of inventing prevalence.
- [ ] Replace deterministic/modulo household attributes and guardian links with a calibrated probabilistic joint. Current links have no orphans and reconcile top-level totals, but their household attributes are synthetic and cannot support factual joint prevalence.
- [x] Suppress derived `person`, `child_person`, and `household` outputs when raw weighted Base is below 10. Python responses and web calculation snapshots use `status=suppressed`, remove count/share/interval and reconstructable factor values, and retain a `small_sample` gap plus nonnumeric lineage/formula metadata. Python exempts only an exact baseline carrying explicit registered official-direct method provenance; an exact weighted Base of 5 is suppressed. Web calculation wraps an exact below-threshold reuse in a separate suppressed snapshot without rewriting its source. `establishment`/`enterprise` and Base=10 remain unsuppressed by design.
- [ ] Enforce purpose-based minor safety beyond a caller declaration. The DSL still trusts `use_context` and cannot detect a misdeclared real intent; authenticated purpose authorization and audit remain deployment requirements.

### Phase 6 — establishments and enterprises

- [x] Standardize census, enterprise-demography, and small-business sources.
- [x] Keep establishments and enterprises distinct and document multi-site/owner conversion limits.
- [ ] Expand beyond the four sparse national business controls to supported region × industry × size/owner/digital cells and validate closure, multi-site, and owner/operator conversion rules. Unsupported joints remain explicit gaps.

### Phase 7 — archetypes and estimates

- [x] Generate 18 categories and 1,440 materially distinct archetypes (80/category).
- [ ] Attach semantically rule-compatible representatives to every archetype. Rule JSON, traits, disclosed inferred needs, channels, overlap notes, status, and deterministic exemplar keys exist; Phase 1 exemplar semantic matching remains open.
- [x] Produce an estimate or explicit `not_estimable` record for every archetype.
- [x] Save archetype coverage, estimation quality, and validation-gap reports.

### Phase 8 — query and market-sizing engine

- [x] Implement AND/OR/NOT, ranges, sets, existence, probabilistic conditions, and guarded unit conversion.
- [x] Implement `estimate_segment`, `get_archetype`, `list_archetypes`, `compare_segments`, `estimate_market`, `explain_estimate`, `refresh_source`, and `validate_model`.
- [x] Implement CLI and REST API with core logic independent of frameworks.
- [x] Implement separate TAM/SAM/SOM entity and revenue assumptions.

### Phase 9 — QA and evaluation

- [x] Reconcile adult, 0–18, household, establishment, and enterprise national totals within 0.5% where direct official totals exist.
- [ ] Add province and, where supportable, district controls and reconciliation. Unsupported regional queries currently fail closed rather than falling back to national values.
- [ ] Run a genuine out-of-sample holdout with a cross-tab excluded from fitting. The existing age-band aggregation diagnostic re-sums fitted age × sex controls and is not independent holdout evidence.
- [ ] Re-run the complete PK/FK/lineage/denominator/reference-period/confidence/gap/unit/privacy/reproducibility gates after the 2026-08-25 hardening changes. Post-`016` Python/database/type/lint/unit/integration/build/browser/gated-review/auth/performance evidence is historical; the post-`018` populated-clone aggregate is in progress. The unavailable historical acquisition proof, missing independent holdout, and other listed evidence gaps keep this broader Goal-level item open regardless.
- [x] Pass strengthened 20-query acceptance tests that verify reasonable ranges, period, formula/method, concrete lineage, confidence, and warnings—not execution status alone.
- [x] Execute three TAM/SAM/SOM scenarios.

### Phase 10 — documentation and handoff

- [x] Reconcile docs 00–22, data dictionary, ERD, source catalog, ethics/limits, validation, and operations with the current proved/missing boundary; earlier completion and holdout language is explicitly historical/superseded.
- [x] Export category/archetype/estimate data as CSV, JSONL, and/or Parquet.
- [x] Provide one-command reproducible build plus staged commands.
- [x] Verify that outputs contain real data and executable results, not only schemas or placeholders.

## Definition of Done

- [x] 18 final categories and 1,440 materially distinct archetypes.
- [x] Every archetype has an estimate or explicit `not_estimable`; every estimate has unit, interval, denominator, period, method, formula, sources, confidence, and gaps.
- [x] Adult, minor, household, establishment, and enterprise control totals are loaded and validated.
- [x] Nemotron pre/post calibration and minor-household synthesis reports are generated.
- [x] Clean PostgreSQL migration succeeds; Parquet artifacts and manifests are queryable.
- [x] 20 acceptance queries and 3 market scenarios execute successfully.
- [x] Current-tree unit, integration, acceptance, privacy, and reproducibility tests pass after the Phase 3R–7R hardening. The external OpenAI live result and target-cloud verification remain separate, explicitly open release gates.
- [x] README alone enables install, build, query, validate, and refresh.
- [x] Generated reports include source coverage, population reconciliation, archetype coverage, estimation quality, and validation gaps without presenting calibration aggregation as independent holdout performance. `quality_metrics.json` records `independent_holdout_status: not_available`.

## Decisions

- 2026-08-24: Start from an empty workspace; create a Python `src` package and PostgreSQL-first logical schema with a local analytical DuckDB layer.
- 2026-08-24: Do not start PostgreSQL globally. Initialize a workspace-local cluster only for migration integration tests.
- 2026-08-24: Keep large downloaded data out of Git; commit manifests, checksums, compact official extracts, deterministic generators, and derived report tables.
- 2026-08-24: Use 2024 Census population/household totals as the initial household control period and preserve differing source periods rather than silently rebasing.
- 2026-08-24: Interpret exact `60대` as 60–69. Because the small-business survey publishes 60+, estimate the 60–69 share with a separately sourced non-wage-worker age proxy and widen uncertainty.
- 2026-08-24: Use MOIS 2020–2024 December single-age tables for the five-year resident frame and exact 0–18 controls; keep its foreigner-excluding universe separate from Census.
- 2026-08-24: Preserve the enterprise-demography total's thousand-unit publication precision as 7,641,500 / 7,642,000 / 7,642,499, not a false exact point.
- 2026-08-24: For the 1,439 evidence-poor archetypes, prefer explicit NULL `not_estimable` records over speculative prevalence.

## Findings and constraints

- Workspace began empty and was not a Git repository.
- PostgreSQL server/client 17.11 are installed; `pg_isready` reports no server on the default socket.
- DuckDB is not installed initially; pandas/numpy/pytest are available.
- Local volume: 926 GiB total, 56 GiB free (94% used). Full Nemotron download is feasible but must stay partitioned and avoid redundant copies.
- NVIDIA Hugging Face release: nine checksum-verified Parquet shards, CC BY 4.0, 1,000,000 unique rows, 1.982 GB downloaded.
- 2024 Census control totals: population 51.806M; total households 22.997M; general households 22.294M; households with children ≤18: 4.517M.
- 2024 Census of Establishments preliminary total: 6,353,673 establishments; accommodation/food establishments: 858,373.
- 2023 Small Business Survey (enterprise unit): restaurant/bar enterprises 745,196; owner 60+ share 38.0%; no listed digital/system activity 78.5%; online sales channel 6.0%. Own website possession is not measured.
- 2024 enterprise demography (enterprise unit): 7,642 thousand active enterprises (preliminary and rounded to thousands).
- 2024-12 MOIS resident-registration exact ages 0–18 sum to 7,324,873; the total resident-registration population is 51,217,221.
- Adult calibration: pre-share MAPE 2.6641%, post fitted-cell MAPE 0%, weights 42.451–47.144, Kish ESS ratio 99.91%; age 19 remains unweighted.
- Minor/household synthesis: 73,249 minor links, 45,170 child-household samples, weighted total error effectively 0%, orphan links 0.
- Catalog: 18 categories, 1,440 unique rules, 1 estimated and 1,439 explicit not-estimable archetypes.

## Verification log

| Date | Check | Result |
|---|---|---|
| 2026-08-24 | Repository and instructions audit | Empty workspace; no prior changes or instructions |
| 2026-08-24 | Runtime audit | Python 3.13.2, Node 26.0.0, PostgreSQL 17.11 |
| 2026-08-24 | Default PostgreSQL readiness | Not running; local cluster pending |
| 2026-08-24 | Storage capacity | 56 GiB available |
| 2026-08-24 | Nemotron acquisition | 9/9 shard checksums pass; 1,000,000 unique records |
| 2026-08-24 | Full deterministic build | 7 sources, 11 releases, 16 controls, 26 features, 1,440 archetypes |
| 2026-08-24 | Reconciliation | 10 national control checks; max relative error below 0.5% |
| 2026-08-24 | Adult calibration aggregation diagnostic | MAPE 0.0459%; rounding coverage 100%; not an independent holdout and superseded as completion evidence |
| 2026-08-24 | Acceptance/scenarios | 20/20 queries; 3/3 TAM/SAM/SOM scenarios |
| 2026-08-24 | Test suite | 14 tests pass; one third-party Starlette/httpx deprecation warning |
| 2026-08-24 | PostgreSQL clean migration | 30 public tables created; migration passes |
| 2026-08-24 | Model validation | 24/24 integrity/privacy/completeness checks pass |
| 2026-08-26 | Phase 3R–7R aggregate | Python 70/12; engine 46/46; web unit 280/280; PostgreSQL integration 51/51; type/lint/build pass |
| 2026-08-26 | Weighted-joint mart | 91,091 cells over 1,650,000 calibrated unit-frame rows; 254 catalog rows; Person/Household/Establishment/Enterprise reconciliation and idempotent fingerprint pass |
| 2026-08-26 | Deployment restore | PostgreSQL custom archive v2 restored over TCP/TLS as non-superuser owner; target-owner ACL, policy roles, Node verify-full, 116-table fixture scan 0, Product DoD and DB integration 51/51 pass |
| 2026-08-26 | Latest Production browser/API | Explorer, Sizing, Research and 390 px mobile render 200; console error 0; Research confirmation 428/provider-disabled 409 without Job mutation |
| 2026-08-26 | Repeatable Production read-only E2E | 4 passed/2 intended profile skips; desktop/tablet/mobile core flow, 24/24 Domain sweep, axe/overflow/fixture/internal-status/console gates |
| 2026-08-26 | Disposable-clone full Browser E2E | 25 passed/2 intended viewport skips; 16-step workflow on desktop/tablet/mobile, review/export/catalog/compare/responsive gates, Production DoD fingerprint unchanged, clone removed |
| 2026-08-26 | Current Production runtime performance | Authenticated GET-only 001-024 audit 10/10 p95 limits; Domain API 6.526 ms, Archetype cursor 11.242 ms, Explorer SSR 15.397 ms, Archetype SSR 31.311 ms |

## Blockers requiring user action

No new external call is authorized yet. Genuine cross-tab holdout, regional household/business coverage, and exact owner-age × website presence require additional compatible official microdata or a reviewed probability sample. The credentialed Research workflow remains gated on approval to transmit its exact question, target segment, target variable, and canonical baseline to OpenAI. A durable remote URL additionally requires authorization to create a new cloud project and managed PostgreSQL resource; no existing Vercel project or remote database has been repurposed.

---

# Phase 2 — domain consumption taxonomy and subtype system

## Current Phase 2 checkpoint

- Status: implementation artifacts remain present, but the **live evidence audit is not fully certified**: 29 passed / 0 failed / 1 unavailable on 2026-08-25. Item 2 cannot be proven from current files because historical evidence that Nemotron was directly acquired without user file provision is absent. The older checked-in aggregate recorded 30/30; that is retained only as historical context, not current proof.
- Preservation boundary: migration `001_core.sql`, all Phase 1 IDs, estimates, raw files, exports, and tests remain unchanged; Phase 2 uses additive migration/config/code/artifacts.
- Required vertical slices: `ARC-06-001` website-less restaurant enterprises and national music/audio consumers.
- Fixed Phase 2 seed set: `[20260825, 20260826, 20260827]`; taxonomy version `phase2-taxonomy-2026-08-25-v1`; segmentation version `nemotron-domain-clusters-2026-08-25-v3`; model version `kr-v0.2.1`.
- Current build: Phase 1 has 8 sources/12 releases; Phase 2 has 24 domains, 384 axis decisions, 480 features, 760 feature-source links, 240 behaviors, 192 tags, 192 reusable Level-2 archetypes, 24 fitted models, 90 primary subtypes, 450 representatives, 120 eligible parents, and 450 reconciled parent-subtype allocations.
- Reconciliation: all 1,440 parents have decisions; maximum primary-share error is `2.22e-16`, maximum parent/child Base relative error is `2.13e-16`; all ten exact semantic parent cases also reconcile within `2.22e-16`. Phase 1's 1,440 archetypes remain present in the additive DuckDB copy.
- Build-era gates (historical): 24/24 domain, 10/10 parent, and 10/10 cross-domain acceptance; 90/90 Draft 2020-12 activation payloads; 18/18 pytest; 46/46 combined validation; PostgreSQL Phase 1=30 and additive total=58 tables with idempotent reapplication. The latest recorded post-`016` Python gates are 64 passed/2 skips/1 deprecation warning and validation 46/46; the post-`018` aggregate is still running and neither result resolves the unavailable acquisition-provenance item.

## Phase 2 execution checklist

### P2-0 — audit and safety

- [x] Read the complete Phase 2 goal and re-run Phase 1 tests/validation.
- [x] Confirm raw/canonical Nemotron availability, checksums, row count, and storage capacity.
- [x] Record additive schema/storage/version design and Phase 2 run manifest.

### P2-1 — additive data model

- [x] Add domain registry/dimensions/features/source maps/behaviors/profiles/associations/coverage audit.
- [x] Add hierarchy, latent dimensions, segmentation models, clusters/representatives, subtype/allocation/membership/profile/confidence/activation.
- [x] Add aggregate segment observation and posterior update tables with constraints and indexes.
- [x] Apply migration safely to clean `001+002`, existing-style `001 then 002`, and idempotent `002` reapplication.

### P2-2 — domain depth registry

- [x] Register 24 domains covering every required area and map them to existing categories.
- [x] Store all 16 common-axis applicability decisions for every domain.
- [x] Register exactly 20 domain-specific queryable features, 10 behavior templates, 8 motive/barrier tags, and 8 reusable domain archetypes per active domain.
- [x] Produce source maps, decision/entity units, provisional coverage grades/critical gaps, and machine-readable Parquet/JSON exports.

### P2-3 — Nemotron and model pipeline

- [x] Build weighted, stratified, reproducible domain samples from pinned Nemotron raw/canonical data.
- [x] Build domain-relevant structured/text-derived features with source/extractor/model boundaries and confidence components.
- [x] Cache reproducible text/model artifacts and compare k=3–6, MiniBatchKMeans/GaussianMixture, three seeds, and two bootstrap refits.
- [x] Store artifact hashes in addition to the existing support, ESS, stability, entropy, model/representative, embedding, and soft-assignment artifacts.

### P2-4 — double vertical slice

- [x] Decompose `ARC-06-001` into 3–8 B2B primary subtypes plus overlapping tags with parent reconciliation.
- [x] Build music/audio universe, taxonomy, behavioral clusters, allocation, representatives, profiles, exports, CLI/API.
- [x] Separate population, interpretation, and targetability confidence and persist/expose evidence, assumptions, and gaps.

### P2-5 — all parents and domains

- [x] Save eligibility decisions for all 1,440 Phase 1 parents.
- [x] Materialize exactly 5 parent allocations per active domain and 3–6 fitted primary subtypes for every eligible parent.
- [x] Preserve primary Base shares at 1.0 ±0.001 and child Base counts within 0.5% of every parent.
- [x] Store overlapping tags separately with non-additivity warnings.

### P2-6 — cross-domain, activation, feedback

- [x] Support same-entity cross-domain filters with joint support, association method, and uncertainty.
- [x] Implement all required Phase 2 service/API/CLI operations.
- [x] Implement activation payload JSON Schema, creative briefs, targetability/prohibited-use checks.
- [x] Run one aggregate observation and conservative posterior update example with bias/data-quality diagnostics.

### P2-7 — QA and handoff

- [x] Pass ≥1 end-to-end acceptance per active domain, ≥10 parent decomposition tests, and ≥10 cross-domain tests.
- [x] Export domain/taxonomy/features/behaviors/models/subtypes/allocations/confidence/profiles/associations as CSV/Parquet/JSON.
- [x] Generate coverage matrix, model cards, association report, summary, safety, and retraining/operations documentation.
- [x] Re-run Phase 1 and Phase 2 unit/integration/acceptance/reconciliation/migration tests.

## Phase 2 Definition of Done audit

- [x] 1. Phase 1 engine and tests preserved.
- [ ] 2. Nemotron accessed without user file provision — **UNAVAILABLE** in the live verifier because the historical direct-acquisition execution cannot be established from current artifacts. Existing shards, checksums, manifests, and fetch code prove present-day integrity, not who supplied or executed the original acquisition.
- [x] 3. Raw/canonical revision and checksums stored.
- [x] 4. 18–25 final domains and complete required-area mapping.
- [x] 5. All domains have 16 common-axis decisions.
- [x] 6. All domains have domain taxonomy/features/behaviors/source maps.
- [x] 7. Every domain meets minimum depth or explicit evidence constraint.
- [x] 8. No demographic-only domain marked complete.
- [x] 9. Domain latent dimensions and segmentation model registry exist.
- [x] 10. Music/audio and small-business slices exist in DB/API/CLI/export.
- [x] 11. Additive migration passes clean and existing databases.
- [x] 12. Eligibility stored for all 1,440 parents.
- [x] 13. Eligible parents have 3–8 primary subtypes or explicit exception.
- [x] 14. Primary Base allocations reconcile to parents.
- [x] 15. Overlapping tags stored separately with warnings.
- [x] 16. Every subtype has Low/Base/High and correct unit.
- [x] 17. Every subtype has three confidence assessments.
- [x] 18. Every subtype has evidence/assumptions/gaps/disclosure.
- [x] 19. Every active subtype has activation profile.
- [x] 20. ≥1 end-to-end acceptance per active domain.
- [x] 21. ≥10 parent decomposition acceptance tests.
- [x] 22. ≥10 cross-domain acceptance tests.
- [x] 23. Cross-domain joint support/dependence assumptions stored.
- [x] 24. Activation contract and creative brief work.
- [x] 25. Observation/posterior example executed.
- [x] 26. Required Phase 2 machine-readable exports exist.
- [x] 27. Coverage matrix and cross-domain association report exist.
- [x] 28. All required test classes pass.
- [x] 29. README/operations enable domain/model/query/update workflows.
- [x] 30. No placeholder-only Phase 2 feature/data remains.

## Phase 2 decisions and audit findings

- 2026-08-25: Phase 2 will use new stable identifiers (`DOM-*`, `DMF-*`, `DBT-*`, `STM-*`, `SUB-*`) and never overload Phase 1 archetype IDs.
- 2026-08-25: The existing canonical adult mart excludes narrative text by design. Phase 2 text feature extraction will project only domain-relevant raw narrative columns and keep raw text out of PostgreSQL.
- 2026-08-25: Phase 1 has only one estimated archetype. Phase 2 allocations for exploratory parents must distinguish an evidence-backed/Phase-1 parent count from an explicit scenario parent count; NULL parents cannot be silently converted to population estimates.
- 2026-08-25: Minor motivational models remain guardian/household-centered; no adult Nemotron text will be used to invent child motives.
- 2026-08-25: Required parent cases 2–10 are exact semantic query definitions but remain E-grade scenario prevalence; they are not presented as official joint estimates.
- 2026-08-25: Versioned mixed-unit cross-domain cases require an explicit output unit, official unit control, a documented adult decision-maker/owner-operator bridge, and a wide semantic scenario overlay. Generic mixed-unit requests remain `not_estimable`.

## Phase 2 final verification log

| Date | Check | Result |
|---|---|---|
| 2026-08-25 | Cached deterministic Phase 2 rebuild | 24 models, 90 subtypes, 450 allocations; all artifact/embedding/membership checksums valid |
| 2026-08-25 | Phase 2 acceptance | Domain 24/24; parent 10/10; cross-domain 10/10; activation 90/90; feedback and segmentation passed |
| 2026-08-25 | Combined model validation | 46/46 checks passed for `kr-v0.2.1` |
| 2026-08-25 | Historical Phase 2 Python suite | 18/18 passed; one third-party Starlette/httpx deprecation warning |
| 2026-08-25 | PostgreSQL integration | Phase 1 30 tables preserved; additive total 58; Phase 2 reapplication idempotent |
| 2026-08-25 | Historical Phase 2 Definition of Done artifact | Recorded 30/30 in the older static audit; retained as historical context only |
| 2026-08-25 | Current live Phase 2 Definition of Done verifier | 29 passed / 0 failed / 1 unavailable; historical Nemotron direct-acquisition execution provenance cannot be established |

---

# Phase 3–7 — private Market Intelligence Workbench

## Current checkpoint

- Status: migration source and the disposable clean/reapply harness now extend through `018`. The isolated harness passes initial application plus full reapplication at 90 public base tables/17 views. A populated clone has `017`–`018` applied and preserves the pre-migration raw-data fingerprint. The original populated local database remains deliberately unchanged at `016` (90 tables/12 views); `017`–`018` have **not** been applied to it. The final aggregate web, populated-clone integration, browser, auth, and performance rerun is still in progress, so the previously recorded Python 64 passed/2 skips/1 warning, validation 46/46, web 198/43, build, browser 22/5, review 1/1, auth, and performance figures below are explicitly historical post-`016` evidence rather than a post-`018` certificate. The Phase 3 baseline verifier remains 17/18 and **FAILED solely because the live Phase 2 DoD verifier has one unavailable historical Nemotron-acquisition evidence item**. One credentialed OpenAI Research Job plus human review/publication verification also remains pending; the opt-in is off and no external request has been made.
- Product boundary: a private, PostgreSQL-backed Next.js workbench. The existing Python/DuckDB engine and all Phase 1–2 artifacts remain the canonical baseline and are not regenerated or overwritten; no production deployment is certified.
- Reference boundary: use `/Users/woocheolshin/Downloads/Market_Atlas_Final.html` (SHA-256 `1e0614ae23c7413ab7d6c4dcf9a5771a1826fcb864f23b65ba6bf75aba0470a5`) as the visual/concept reference: preserve the four-level Market Atlas navigation, dense analytical layout, dark emerald navigation, white work surface, and restrained purple selection state. Do not reuse its hardcoded markets, random bars, unit mixing, or in-memory calculations, and never add fake data to imitate the prototype.
- Runtime default: workspace-local PostgreSQL 17 on port `55432`, Next.js App Router under `web/`, server-only database access, PostgreSQL-backed durable research jobs, and a provider adapter that returns `configuration_required` when credentials are absent.
- Version boundary: baseline `kr-v0.2.1`; derived estimates, user scenarios, proposed revisions, and approved versions are separate immutable/versioned records.

## Phase 3–7 execution checklist

### P3-0 — diagnosis and immutable baseline

- [x] Read Phase 1–2 audits, summaries, manifests, `AGENTS.md`, `PLANS.md`, both goal specifications, and the complete reference HTML.
- [x] Inspect runtimes, storage, PostgreSQL lifecycle, migrations, current API/CLI, data artifacts, environment variables, tests, and Git status.
- [x] Re-run pytest, 46 combined validation checks, DoD audit evidence, PostgreSQL clean/reapply migration, shard checksums, live counts, activation schema, and parent reconciliation.
- [x] Save `reports/phase3_baseline_verification.json` and `.md` before baseline-affecting work.
- [x] Save the architecture diagnosis, ADRs, route/API contracts, data dictionary, and risk register.

### P3-1 — additive PostgreSQL foundation

- [x] Add idempotent workbench migration(s) without changing the 58 existing tables or their semantics.
- [x] Add normalized segments/conditions/versions/snapshots, estimates/factors/dependencies/scenarios/sensitivity, research/review/approval, comparisons/opportunities, user state, audit, and export records.
- [x] Add version-aware explorer/search/lineage read models and indexes.
- [x] Add a transactional, advisory-lock-protected DuckDB → PostgreSQL baseline backfill with deterministic identifier mapping and a verification manifest.
- [x] Populate an actual local PostgreSQL database and prove the Phase 2 counts through PostgreSQL, not DuckDB alone.
- [x] Add restricted application/admin roles and server-side authorization boundaries; keep secrets out of browser bundles.

### P3-2 — web application shell and explorer

- [x] Create `web/` Next.js App Router application with TypeScript, Zod, PostgreSQL repository, Pretendard Variable, responsive workbench shell, loading/error/empty/unauthorized states, and keyboard/reduced-motion support.
- [x] Implement database-driven global search, flyout navigation, breadcrumbs, recent/saved context, and research status.
- [x] Implement all 24 domains, 384 axes, 480 features, 240 behaviors, 24 models, 90 subtypes, 450 allocations, 1,440 archetypes, and 90 activation records through paginated/searchable read models.
- [x] Implement domain, axis, subtype, archetype, source, confidence, and reverse-lineage detail routes without fabricated metrics or charts.

### P3-1H — PostgreSQL governance hardening checkpoint

- [x] Split global-baseline read policy from workspace-only estimate/scenario inserts and remove runtime update/delete grants from immutable estimate/scenario ledgers.
- [x] Apply parent-owned RLS to estimate/scenario/query-result children; keep `estimate_assumption` runtime read-only until a reviewed writer exists and keep archetype-only global validation gaps insert-protected.
- [x] Make normalized query/condition snapshots append-only and limit query-result updates to cache invalidation columns.
- [x] Backfill derived parent/subtype estimates with evidence-linked components, source/evidence dependencies, validation gaps, reviewed timestamps, and conservative D/E synthetic-allocation confidence.
- [x] Reject unresolved-condition calculation, cap subtype unions by the parent Low/Base/High interval, and preserve condition reference year/evidence IDs.
- [x] Pass clean/reapply migration checks, TypeScript typecheck, and actual `SET LOCAL ROLE market_engine_app` negative tests for baseline writes, child isolation, and snapshot payload tampering.

### P3-1I — requirement-completion and reproducibility hardening

- [x] Make query/group/condition snapshots workspace-owned; prevent cross-workspace saved-segment/query links; revoke runtime workspace/member provisioning.
- [x] Release invalidated cache identities so an identical recalculation can create a fresh valid immutable result; keep only calculation-bound approval invalidation.
- [x] Materialize reviewed numeric research as an append-only typed factor/source bundle with server-derived confidence instead of writing prevalence into count fields.
- [x] Bound structured research strings/arrays, provider input/output bytes, and provider output tokens; batch comparison-member resolution.
- [x] Certify migration `010_reproducible_workbench_snapshots.sql`: pin saved-segment calculation results, pin scenario segment versions, and append scenario revisions without mutating history.
- [x] Implement migration `011_lineage_integrity_guards.sql`: enforce query/result entity-unit and workspace coherence, same-query saved-version pins, and complete scenario query/result/saved-version/workspace/unit/supersession-parent lineage for every new row. Audit exact historical `security-fixture-v1` artifacts with `WARNING` and no mutation; abort on production violations.
- [x] Implement migration `012_approved_research_factor_snapshot_hardening.sql`: commit the factor and its exact contiguous source set atomically, seal it after the approving owner/reviewer transaction, and reject cross-workspace proposal/factor/workspace-release provenance.
- [x] Implement migration `013_entity_only_market_scenarios.sql`: permit an all-null nine-value revenue envelope only when annual-spend evidence is unavailable, while rejecting partial revenue envelopes and preserving entity Low/Base/High.
- [x] Implement migration `014_interval_lineage_integrity.sql`: reject status-inconsistent or partial estimate/Phase 2 parent intervals, bound Phase 2 shares, and require non-empty source-release lineage for estimable parent and published population/control cells without adding a table or view.
- [x] Implement migration `015_numeric_domain_invariants.sql`: require nonnegative market/factor/price/cost values and 0–1 rate/ratio factors through five validated, idempotent checks without adding a table or view.
- [x] Implement migration `016_catalog_privacy_and_finite_numeric.sql`: preserve the 4,005-row/14-column `security_invoker` catalog while projecting 185 guarded DOM-17/`child_person` rows as non-queryable, and reject `NaN`/signed infinities through four validated checks. Clean `001`–`016`, fixture, reapply, populated preflight/application, and post-`016` integration pass without a baseline update or duplicate ordering constraint.
- [x] Implement migration `017_opportunity_snapshot_invariants.sql`: enforce at most one `primary_target`, same-workspace/query/result/saved-version/market-scenario lineage, immutable primary-target links, and app-only link insertion. Legacy saved versions with a null result pin remain valid only when the immutable link result belongs to the same query. The disposable harness and populated clone pass; the original populated database remains at `016`.
- [x] Implement migration `018_release_safe_read_boundary.sql`: add five canonical `security_invoker` release projections and redefine downstream workbench views so rare human estimates are value-free across trusted application reads/exports. The disposable harness passes at 90 tables/17 views and the populated clone preserves the raw fingerprint. This is a trusted-application projection, not a hard database-confidentiality boundary while runtime roles retain broad raw-table `SELECT`.

### P4 — Market Explorer and governance

- [x] Separate person, child-person, household, establishment, and enterprise universes in all summaries and comparisons.
- [x] Render only evidence-backed distributions/trends/spend; otherwise show explicit missing/not-estimable/research-required states.
- [x] Implement model/source/version/coverage/gap/audit governance pages and direct deep links.
- [x] Verify server-side aggregation, cursor pagination, response-size limits, and no N+1 queries on real data. Main JSON data routes have a 512 KiB UTF-8 ceiling, export JSON/CSV/HTML has a 5 MiB UTF-8 ceiling, and comparison resolution remains batched. The checked-in performance measurement is historical post-`016`; its post-`018` replacement is pending.

### P5 — Segment Builder and market sizing

- [x] Implement database-derived condition library, natural-language interpretation, exact/similar/proxy/ambiguous/missing match states, and persisted original plus confirmed AST.
- [x] Enforce the condition catalog server-side before persistence: reject unregistered/non-queryable/custom conditions, blocked sensitive classes, and namespace/entity-unit/operator/type/allowed-value mismatches even on direct POST.
- [x] Support AND/OR/NOT, nesting, ranges, multi-select, group clone/enable/disable, unit/denominator/year/exclusivity validation, and actionable errors.
- [x] Reuse verified parent/subtype allocations and associations; never silently multiply unsupported marginals. Return `not_estimable` with structured gaps when evidence is insufficient.
- [x] Persist/reuse normalized snapshots and lineage; invalidate only affected dependencies after an approved version change.
- [x] Implement Low/Base/High, rule-based confidence components, formula trace, factor editing as separate user scenarios, sensitivity, and unit-safe TAM/SAM/SOM plus revenue assumptions. Revenue scales annual spend and realized ARPU by `horizon_months/12`; negative entity/spend/capacity/ARPU inputs are rejected, and missing annual spend yields an entity-only scenario rather than zero revenue.
- [x] Suppress derived human-unit outputs below raw weighted Base 10 in Python and web query snapshots while retaining value-free lineage. Python's exemption requires explicit official-direct method provenance; an exact weighted human cell remains suppressible. A persist-and-load sanitizer also canonicalizes legacy suppressed payloads before storage and again whenever a result is loaded. Web exact reuse receives a separate suppressed snapshot, and migration `018` supplies canonical release-safe estimate/component/assumption/sensitivity/query-result projections for downstream trusted application reads. Business units and Base=10 remain outside the threshold rule.
- [x] Preserve scenario decimals as strings, calculate/preview with `Decimal`, verify exact submission above `2^53`, and project market metrics only when exactly one active scenario exists; retain the explicit arbitrary-scenario selector as Phase 8 work.

### P6 — AI Research and review workflow

- [x] Implement durable PostgreSQL job/step/event/artifact state transitions, worker claiming, retry/cancel, logs, polling, and browser-independent processing.
- [x] Implement provider-neutral adapter plus real provider configuration, server-only environment schema, structured output validation, and `configuration_required` without fabricated findings.
- [x] Implement Proposed Revision → human review → approve/edit/reject/request-more-research → immutable Approved Version and affected-snapshot invalidation.
- [x] Prove proposed revisions never mutate the Phase 1–2 baseline and all privileged mutations create audit records.
- [x] Preserve effective condition provenance recursively: a condition beneath a disabled ancestor is recorded as effectively disabled in research context. Admit source URLs to the provider-source ledger only from completed web-search calls (`search`, `open_page`, or `find`).
- [x] For approved Opportunity idea briefs, require explicit feature and behavior source-ID arrays and verify every ID against the exact effectively enabled, queryable pinned-query snapshot before storing provenance; invented, disabled, or mismatched IDs fail closed.
- [x] Reject recognized high-confidence identifiers on implemented segment/scenario/comparison/Opportunity/review/research/provider paths without echoing the input; re-scan the fully enriched canonical research payload immediately before persistence and disclose that the scanner is not universal PII or real-name detection.
- [x] Require a non-blank user-authored review note and an accessible confirmation step before terminal review submission.

### P7 — comparison, opportunities, ideas, exports

- [x] Compare 2–5 saved segments with raw values separated by entity unit and explicitly labeled normalized scores. When a pinned result has multiple active market scenarios, market metrics remain unavailable with an explicit-selection reason instead of silently choosing the latest scenario; a unique scenario exposes its ID/version/horizon and annual spend.
- [x] Implement persistent Opportunity Board, snapshot-bound opportunity briefs, current-versus-saved deltas, hypotheses, experiments, notes, status history, and adjustable transparent score weights.
- [x] Enforce Opportunity edit optimistic locking end to end: the form submits the expected lock version, the service compares and conditionally updates it, and stale edits return a bounded conflict instead of overwriting the mutable root. Migration `017` independently protects the immutable primary-target snapshot lineage.
- [x] Implement AI idea drafting with facts and hypotheses visually/provenance-separated; use `configuration_required` without credentials.
- [x] Export provenance-complete CSV, JSON, printable segment report, market formula, sources, comparison report, and opportunity brief. CSV formula-signature text is neutralized while valid negative numeric cells, including scientific notation, remain numeric.

### P3–7 final verification

- [ ] Fully certify the live Phase 2 DoD. Current result is 29 passed/0 failed/1 unavailable; the historical Nemotron direct-acquisition execution provenance cannot be established. Checksums/counts, activation contracts, parent reconciliation, Python 64/2, and validation 46/46 remain verified.
- [x] Retain the post-`016` workbench integration/action/route/calculation/workflow/snapshot/cache/authorization certificate: TypeScript, zero-warning lint, 35 files/198 unit tests, and 6 files/43 populated-PostgreSQL integration tests passed on that schema.
- [x] Retain the post-`016` real-data E2E and explicitly gated append-only review certificate: desktop/tablet/mobile Playwright 22 passed/5 intended skips; gated mutating review 1/1 with the two-step alertdialog confirmation.
- [ ] Complete the post-`018` aggregate against the migrated populated clone: TypeScript/lint/unit/integration/build, full browser/accessibility, local auth where applicable, release-projection regressions, and performance. The original populated database must remain at `016` unless the user explicitly authorizes persistent DDL.
- [x] Record `EXPLAIN (ANALYZE, BUFFERS)` and real-data latency/response-size results for explorer, search, lineage, comparison, and estimate paths.
- [x] Complete README and Phase 3–7 architecture, API, data dictionary, research workflow, operations, verification, unresolved-risk, and Phase 8 follow-up documentation.

The checked items above include historical implementation milestones. Current verification status:

- [x] Historical post-`016` combined Python pytest 64 passed / 2 skips / 1 deprecation warning; CLI validation 46/46. The post-`018` aggregate is still running.
- [ ] Phase 3 baseline verifier: 17/18, overall **FAILED solely** because Phase 2 DoD item 2 is unavailable (29/0/1).
- [x] Historical: clean/reapply `001`–`010` at 90 tables/12 views; populated actual database migrated through `010`; backfill verify-only 12/12; full actual-DB integration 25/25.
- [x] Historical through `010`: reference-concept UI typecheck, zero-warning lint, 38/38 unit, targeted real-DB Chromium 6/6, full three-profile E2E 19 passed/5 intended skips, gated mutating review/materialization E2E 1/1, and production build.
- [x] Clean/reapply and actual-database verification for migration `010`.
- [x] Historical through `010`: combined integration, full multi-profile E2E, and production build after that change set settled.
- [x] Clean/full reapply and populated-database migration through `013` passed at 90 tables/12 views, including the stateful `010` reapply fixture, lineage warnings, and the entity-only revenue all-or-none constraint.
- [x] Clean/full reapply and populated-database migration through `014` passed at 90 tables/12 views; nine interval/source-lineage constraints are validated.
- [x] Migration `015` is applied to the populated database with five validated numeric-domain constraints; clean isolated `001`–`015`, behavior fixture, and reapply pass at 90 tables/12 views.
- [x] Migration `016` is applied to the populated database with a policy-projected catalog and four validated finite-number constraints; clean isolated `001`–`016`, behavior fixture, and reapply pass at 90 tables/12 views. Catalog rows are 4,005 total / 3,820 queryable, with 185 guarded rows retained but non-queryable.
- [x] Source migrations `017`–`018`, disposable clean/reapply harness, and populated clone verification pass. The harness is 90 tables/17 views; the clone preserves the raw fingerprint. The original populated database remains unapplied at `016`/90/12.
- [x] Historical post-`016` local application matrix: TypeScript, zero-warning lint, 198 unit tests, 43/43 populated-DB integration, production build, 22/5 browser, gated review 1/1, performance, and production-auth pass. The auth smoke is local shared-secret evidence only.
- [ ] Final post-`018` application/browser/performance aggregate against the populated clone.
- [ ] Exactly one credentialed Research Job E2E after the user sends the exact phrase `위 payload 그대로 외부 호출 승인.`; then complete human review, typed-factor/non-consumption, and baseline-isolation verification. The credential exists server-only, the opt-in remains off, and no external OpenAI/web-search request has been made. Canonical estimate publication remains a separate governed step.

## Phase 3–7 decisions

- 2026-08-25: Keep the Python package and immutable DuckDB/Parquet baseline. Add a separate `web/` Next.js application rather than rewriting the verified engine or extending the single-file reference prototype.
- 2026-08-25: Use the installed workspace-local PostgreSQL 17 cluster for an actually populated development database. Raw SQL remains the single migration system.
- 2026-08-25: Server Components query PostgreSQL repositories directly; Server Actions own authenticated mutations; Route Handlers are reserved for health, search suggestions, research status/events, and exports.
- 2026-08-25: Domain/subtype totals that cannot be safely formed from overlapping parent allocations remain `not_estimable`; the UI will expose parent-context allocations instead of summing them.
- 2026-08-25: Use a durable PostgreSQL queue and separate worker process. Missing AI credentials result in a persisted `configuration_required` job, never a synthetic research result.
- 2026-08-25: Local mode uses explicit trusted-local authorization for private development; non-local/production mode requires a server-side access secret and restricted database role. This boundary is documented in an ADR and covered by tests.
- 2026-08-25: Baseline and derived calculation ledgers are immutable to runtime roles. Shared baseline rows are readable only; child visibility follows the parent workspace, and query snapshots are content-addressed/append-only with narrowly scoped cache invalidation.
- 2026-08-25: Approved research prevalence/probability is a typed factor interval with denominator/source/confidence lineage, never an entity count. Approval alone remains unpublished; replacement estimates require a reviewed materialized dependency and canonical publication transaction.
- 2026-08-25: Saved-segment and scenario reproducibility uses appended versions/revisions. A recalculation pins a new saved-segment version; a scenario edit creates a child row and marks only the prior lifecycle status superseded.
- 2026-08-25: Direct segment writes fail closed against the policy-projected condition catalog; obvious high-confidence identifiers are rejected on implemented segment/scenario/comparison/Opportunity/review/research/provider paths. This does not turn regex coverage into universal PII detection or a declared purpose into authenticated intent.
- 2026-08-25: Human-derived Base<10 release suppression creates value-free query snapshots without rewriting shared sources. Python exempts only explicit official-method exact baselines and sanitizes suppressed payloads before persistence and after load; web exact reuse is wrapped separately. Migration `018` additionally suppresses any rare human estimate at trusted application read time. Business units and Base=10 remain outside the threshold.
- 2026-08-25: Migration `018` makes five release-safe projections plus their downstream view rewrites the canonical trusted-application read path. Runtime roles still retain raw-table `SELECT`, so this is defense in depth for repository/export code, not proof that arbitrary SQL through those roles cannot read raw ledgers.
- 2026-08-25: A reviewed `approved_research_factor` remains approved but unpublished and is not consumed by `calculateEstimate`; without an explicit unit-safe publication binding to canonical source/release/evidence and a versioned estimate dependency, it remains `not_estimable` for count publication and invalidates nothing.

## Phase 3–7 findings and risks

- No frontend, JavaScript lockfile, authentication provider, queue, AI credential, populated PostgreSQL application database, or PostgreSQL backfill existed at kickoff.
- The workspace is not a Git repository, so commit lineage cannot be recorded; source/model/checksum lineage remains available.
- The exact reference file is `/Users/woocheolshin/Downloads/Market_Atlas_Final.html` (SHA-256 `1e0614ae23c7413ab7d6c4dcf9a5771a1826fcb864f23b65ba6bf75aba0470a5`).
- Node 26 is installed locally; production metadata will pin Node 24 LTS while verifying compatibility on the available runtime.
- Phase 1 has only one directly estimated archetype; other visible counts must come from the 120 explicit Phase 2 parent estimates and 450 reconciled parent allocations, or remain unavailable.
- Opportunity stale-edit rejection now compares a required client expected version and conditions the update on it. The mutation error surface is still not a versioned/generalized production API contract.
- A server-only OpenAI key is stored in ignored `web/.env.local` with mode `0600`. The gate remains disabled and no external request has been made; one exact public-market payload is awaiting explicit user approval before the credentialed acceptance run.
- The checked-in machine-readable Phase 3 workbench verification/requirements reports may preserve pre-`016` schema or application counts; they are historical until regenerated. They cannot override the current live Phase 2 29/0/1 result, Phase 3 baseline 17/18 `FAILED`, missing independent holdout, local-only auth scope, or unexecuted provider/human-review/publication acceptance. The performance JSON/Markdown is also historical post-`016` until the clone rerun finishes.
- The current `subtype_allocation` population contains zero human-unit rows with Base below 10, but subtype/archetype catalog detail still reads raw allocation values. A future rare human allocation would therefore require a new release-safe projection/repository switch before exposure; current absence is not a durable control.
- No direct evidence-backed axis → subtype relationship is available. The UI may show axes and subtype allocations as separate provenance layers, but must not imply a measured direct mapping or fabricate one.

## Phase 3–7 final local verification log

| Date | Check | Result |
|---|---|---|
| 2026-08-25 | Earlier PostgreSQL certificate | `001`–`007`: 88 base tables / 12 views; superseded for current schema counting by the 90/12 row below |
| 2026-08-25 | Historical post-`016` Python suite | 64 passed / 2 skips / 1 deprecation warning |
| 2026-08-25 | Earlier web aggregate | 21/21 unit; 22/22 on both actual and fresh PostgreSQL databases; current delta counts are recorded below |
| 2026-08-25 | Earlier browser acceptance | Historical 18/18 default desktop/tablet/mobile checks and gated Review→Version 1/1; superseded by the current browser row below |
| 2026-08-25 | Earlier static/build certificate | Historical TypeScript, zero-warning ESLint, and production-build pass; superseded by the current application row below |
| 2026-08-25 | Historical post-`016` performance | Rerun generated `2026-08-25T11:51:14.901Z`; schema v3; 10 queries; 9 under 3 ms; maximum 3.953 ms; zero over 50 ms, physical reads, or temp spills; post-`018` clone rerun pending |
| 2026-08-25 | External research | Credential present server-only; opt-in off; no provider request; pending exact phrase `위 payload 그대로 외부 호출 승인.` plus live job, human review, typed-factor/non-consumption, and baseline-isolation checks; canonical publication remains separate |
| 2026-08-25 | Governance hardening | `007` clean/reapply passed; TypeScript passed; actual `SET ROLE market_engine_app` negative tests 6/6 and full PostgreSQL integration 22/22 passed |
| 2026-08-25 | Retained requirement-completion migrations | Historical `001`–`010` clean/reapply passed at 90 base tables/12 views; populated actual database migrated through `010`; backfill verify-only 12/12 |
| 2026-08-25 | Baseline gates | Historical post-`016` Python 64 passed/2 skips/1 warning and CLI validation 46/46; live Phase 2 DoD 29/0/1; Phase 3 baseline 17/18 FAILED solely on unavailable acquisition provenance |
| 2026-08-25 | Historical post-`016` DB/static gates | Migrations `001`–`016` at 90/12 with nine `014`, five `015`, and four `016` constraints; catalog 4,005 total/3,820 queryable; UI typecheck/zero-warning lint, unit 198, populated-DB integration 43/43, and production build passed |
| 2026-08-25 | Historical post-`016` browser gates | Full three-profile E2E 22 passed/5 intended skips using fallback system Chrome, with console/page-error and axe checks; gated two-step mutating review/materialization 1/1 |
| 2026-08-25 | Historical post-`016` local production-auth | Documented local socket URI explicit; unauthenticated root `307`→`/access`; unauthenticated health `401`; bearer health `200`; access form `303`→`/explore`; authenticated root `307`→`/explore`; authenticated explorer `200`; temporary cookie removed, server stopped, port closed. External SSO/RBAC and target deployment are not certified |
| 2026-08-25 | Migration `010` | Clean/reapply and populated actual-database verification passed; reproducible saved-segment/scenario lineage certified locally |
| 2026-08-25 | Migrations `011`–`013` | Clean/full reapply and populated migration passed at 90/12; stateful `010` reapply and entity-only revenue constraint passed; historical lineage warnings remain disclosed |
| 2026-08-25 | Migration `014` | Clean/full reapply and populated migration passed at 90/12; nine estimate/Phase 2 parent interval and source-lineage constraints validated |
| 2026-08-25 | Migration `015` | Applied to populated DB; five numeric-domain constraints validated; clean isolated apply/fixture/reapply passed at 90/12 |
| 2026-08-25 | Migration `016` | Applied to populated DB after zero non-finite preflight; policy-projected catalog plus four finite-number constraints validated; clean isolated apply/fixture/reapply passed at 90/12 with no baseline update |
| 2026-08-25 | Source migrations `017`–`018` | Disposable initial/full-reapply harness passes at 90 tables/17 views; populated clone applies both and preserves the raw fingerprint; original populated database remains explicitly unmigrated at `016`/90/12 |

---

# Phase 2R-A — real-world universe and production data foundation

## Checkpoint

- Status: **database and application read-model gates passed** on the isolated clone `market_engine_phase2r_a`; the original `market_engine` database remains unchanged at 90 public tables / 12 public views and has no `production` schema.
- Production scope: official potential eligible-universe baselines, not product participation, intent, or adoption prevalence.
- Final certificate: `reports/phase2r_a_final_audit.json` and `.md` report `PASSED`.

## Implementation checklist

- [x] Preserve full and schema-only backups of the original prototype database with SHA-256 checksums.
- [x] Create an isolated working database instead of applying persistent DDL to the original database.
- [x] Load exact official national/province person, household, establishment, and enterprise controls with PDF locators and claim-level citations.
- [x] Add 7 canonical universes, 77 dimensions, 164 observations, 155 citations, and 17 province geographies.
- [x] Reconcile 13 complete official partitions exactly to their national controls.
- [x] Map all 24 domains to named, sourced Low/Base/High potential-universe baselines; `not_estimable` domain baselines are 0.
- [x] Add 3,564 nonblank Korean/English display labels; exclude all 93 retained test/E2E approved-factor rows.
- [x] Add 9 production tables and 8 production read views without rewriting the public prototype schema.
- [x] Enforce grade/confidence caps and fixture-title exclusion with three validated database constraints.
- [x] Prove idempotent backfill hashes for 164 observations and 24 mappings.
- [x] Switch production-facing domain, estimate, and saved-segment reads to the `production` views.
- [x] Localize raw status codes and remove unnamed estimate cards.
- [x] Point the local web default at the production clone.
- [x] Add database and web integration regressions for 24/24 population envelopes, named estimates, exact closure, constraints, and 0 production fixtures.
- [x] Document interpretation limits, refresh procedure, read boundary, and reproducible verification commands.
- [x] Generate all required Phase 2R-A architecture/methodology/source-policy/data-dictionary docs and baseline/domain/source/DoD JSON reports.

## Verification log

| Date | Check | Result |
|---|---|---|
| 2026-08-26 | Backfill re-run | Stable hashes: observations `164|b3a8ef42a6ee4f3260c437a0aa6fb73d`; mappings `24|23bae217d3a6ad86aa5ba9641269a8a1` |
| 2026-08-26 | Production DB integration | 6/6 passed |
| 2026-08-26 | Web static/unit | TypeScript passed; 44 files / 261 tests passed |
| 2026-08-26 | Python aggregate | 73 collected: 65 passed / 8 intentional skips; one third-party deprecation warning |
| 2026-08-26 | Model/source preservation | Combined validation 46/46; Nemotron 9/9 shard checksums valid; 1,000,000 rows preserved |
| 2026-08-26 | Web production-read integration | Full 7 files / 46 tests passed against `market_engine_phase2r_a` |
| 2026-08-26 | Web visual verification | Music/audio Base visible; 24 named estimate cards; 0 `not_estimable`; 0 unnamed; 0 console warnings/errors |
| 2026-08-26 | Clean migration/reapply | Phase 2R-A 9 tables / 8 views / 3 validated invariants passed |
| 2026-08-26 | Final audit | `PASSED` 24/24; 24 mappings, 0 missing envelopes, 0 not-estimable domain baselines, 0 production fixtures, 0 partition deltas |

## Remaining interpretation and coverage limits

- City/county/district controls are not comprehensive.
- Category participation and purchase-intent prevalence are not inferred from the broad official eligible universe.
- Rounded published totals retain intervals reflecting their publication precision.
- A Git commit cannot be recorded because this workspace is not a Git repository.


## 2026-09-06 — Nemotron Atlas v0.3 GitHub / Vercel checkpoint

- Imported the verified current Market Atlas (source commit 7ba33223b278b97f7aa0f90e63ce6d5d8adc340d) into the independent `atlas/` application. Existing Python engine and `web/` files are unchanged.
- Replaced the Sites/Vinext Worker build adapter with Next.js 16.3.4 and Node 24.x for Vercel. Monetary models and UI semantics are unchanged.
- Atlas: lint/typecheck, 31 domain tests, production build and 25-step browser journey passed. Production-server API, search, invalid-input and raw-data-boundary smoke checks passed.
- Monetary scope remains music streaming/download, ages 20–69; missing anchors remain explicit.
- Repository-required legacy commands were also attempted against this clean checkout: Python pytest returned 45 passed, 12 skipped, 15 failed and 10 errors; model validate requires the absent ignored `data/processed/market_engine.duckdb`. Tests also require absent original source files under `data/raw/`. These are existing-engine input requirements, not Atlas runtime dependencies. No unchanged engine files or model rules were altered to suppress them.
- Vercel uses `atlas` as the project root with GitHub main integration. See `atlas/docs/DEPLOYMENT_VERCEL.md`.


## 2026-09-06 — Atlas v0.4 external spend / population revision checkpoint

- Read-only source review added NDO 2025 annual online-shopping categories and NIA/KCA 2024 population proxies. Registry records exact annual units, source locators/hashes, overlap exclusions and denominator assumptions.
- 21 online leaf components + existing digital music support partial spend in 14/20 market lenses. Remaining six are explicitly missing after source/scope review. Adult-profile allocations are not observed buyer or household spend.
- Preserve original lexical indexes/support; calibrated digital, ecommerce/commerce, purchase-review and beauty populations live in separately versioned artifacts with 1,396 materialized cubes. KCA screening bias, imputed joints, incomplete 70+ calibration and uncalibrated fields remain explicit.
- Dense demographic, regional, consumption breakdown, national comparison, range, subgroup and evidence modules continue across nested dashboards. Primary signal rows use people/shares and preserve current conditions on drill-through.
- Atlas final checks: lint/typecheck passed; 39/39 tests passed; Next production build passed; actual 29-step browser journey passed with zero browser errors and 390px overflow check. Reports: `atlas/data/revision-sanity.json` and `atlas/data/revision-browser-qa.json`.
- All 52 archetypes and 20 markets audited; 29 age × archetype cells change rank between population and spend. Example: 40s × digital delivery population rank 18 → spend rank 8. These are model checks, not universal external validity certification.
- Required root checks rerun with `PYTHONPATH=src`: pytest 45 passed / 12 skipped / 15 failed / 10 errors; CLI validate blocked by missing `data/processed/market_engine.duckdb`. Original source files under `data/raw` are also absent. No original Python or `web/` implementation changed.
- Release through the existing `shin121/Market-sizing-engine` main branch and Vercel `nemotron-market-atlas` project (root `atlas`, Node 24).

- Vercel production `48ce58d` / `dpl_H51toDKePTXi8x5MxGynvXbbqmNH`: READY, live 29-step browser journey passed, error/fatal logs empty. Follow-up range patch keeps national published totals fixed and caps segment High per component; 39 tests, lint/typecheck/build and equal-range browser rendering passed again.

## 2026-09-06 — Research demand replacement, local work in progress

- Independent external estimator and reference-style interactive market → experience/need → lower behavior flow added at `/atlas/research/[market]`. Official population frames and conditional external rates replace synthetic narrative prevalence in this new route.
- 20 scoped markets / 56 branches / 139 external factors; four unused rare activity rates remain unavailable. KREI food/household frequency, purpose, channel, demographic margins and spend tables, Census family groups, NIA age×sex banking rates, and MCST leisure activity rates are recorded with source/period/denominator/hash.
- Beauty care experience is about 16.60m adults; online cosmetics shoppers about 12.99m. Neither is total cosmetics use. Old 1.90m lexical population is not reused. Household and personal spending are separated; delivery anchors cannot price mixed HMR unions, and per-animal pet costs remain unconverted.
- Atlas 62 tests passed, lint/typecheck passed, production Webpack build passed. Default Turbopack CSS worker fails internal port bind (EPERM) in this environment, including escalation retry. Actual browser opened all 20 market journeys across two phases; saved idea roundtrip, unsupported age and 390px overflow checks passed, no error logs returned.
- Required root commands attempted: system Python pytest 14 collection errors due missing duckdb/fastapi/psycopg; bundled Python lacks pytest/duckdb; CLI validate cannot import duckdb. Original ignored database inputs remain absent. No Python code was changed.
- This is NOT completion of the active goal. The old primary Atlas, Matrix/Opportunity/search/comparison/ideas and deployed production still use prior calculations. Primary migration, all-interest completeness, further category money/profile anchors and final GitHub/Vercel release remain outstanding. See `atlas/docs/RESEARCH_DEMAND_EVIDENCE.md` and `atlas/docs/RESEARCH_DEMAND_OS_PLAN.md`.


### 2026-09-06 — External demand primary workspace (goal remains in progress)

Local Atlas map, Matrix, Opportunity, comparison, source and search/profile/analysis
API routes now share the external model (226 profiles, 20 roots / 56 branches /
150 lower scenarios). Fixed root/branch ID collision, household age rejection and
cross-view URL context. 29/51 legacy interest scopes resolve; unmapped conditions
remain explicit. Old idea notes are preserved. 68 Atlas tests, lint/typecheck and
Webpack build passed; primary UI/API, money rank inversion and mobile width checked.
Root Python checks retain the previously documented missing-dependency failures.
No production push/deployment or full goal completion at this working checkpoint.

### 2026-09-06 — Industry consumer-problem evidence (goal remains in progress)

- Audited KCA 2025 consumer-life survey, including original questionnaire,
  unweighted respondent scope, and all-problem vs all-respondent denominators.
- Added reproducible numeric extraction, ten observed product-problem cohorts and
  thirty specific children across beauty/clothing, home, fitness, travel, learning,
  finance and health devices. No synthetic case-count prevalence or spend borrowing.
- Model now has 179 factors / 20 market roots / 66 branches / 180 lower profiles.
  Regional imputations and unmeasured paid demand are explicit. Generic lower
  behavior elsewhere, missing monetary anchors and legacy mapping remain active work.
- Added denominator/age/containment/region/navigation tests; Atlas 71 tests pass.
  Root `PYTHONPATH=src python3 -m pytest` rerun: 14 collection errors from missing
  duckdb/fastapi/psycopg; CLI validate cannot import duckdb. Original Python code and
  ignored database inputs are unchanged. Final Atlas verification is logged under
  `atlas/docs/RESEARCH_DEMAND_EVIDENCE.md`.
