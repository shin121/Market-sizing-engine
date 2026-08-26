# Unresolved risks and Phase 8 follow-up

## Phase 3–7 completion boundary

Migration source now extends through `018`. Migration `017` adds Opportunity target uniqueness, exact pinned-snapshot lineage, append-only primary links, and runtime privilege guards without adding a table/view. Migration `018` adds five canonical release-safe projections and rewrites seven downstream views, so the source-tree target is 90 tables/17 views. The disposable harness passes initial application and full reapplication at 90/17, and a populated clone has `017`–`018` applied with its raw fingerprint preserved. The original populated local database remains explicitly unmigrated at `016`/90 tables/12 views. The final clone aggregate passed database-enabled Python 67 (one Starlette deprecation warning; 65 passed/2 skipped without the database environment), engine validation 46/46, TypeScript, zero-warning lint, 44 files/261 unit tests, 6 files/44 actual-PostgreSQL integration tests, production build, browser 22 passed/5 intended skips, and the SQL initial/full-reapply harness. Market Atlas concept and accessibility were verified across desktop/tablet/mobile while leaving the unavailable axis→subtype relationship explicit and mobile comparison horizontally scrollable. The overall baseline is not complete: the live Phase 2 DoD verifier is 29 passed/0 failed/1 unavailable and the Phase 3 baseline verifier is 17/18 **FAILED solely** because historical Nemotron direct-acquisition execution provenance cannot be established. The live-provider run also remains pending; the server-only credential has not been used, the opt-in is off, and the required exact phrase `위 payload 그대로 외부 호출 승인.` has not been received. The items below are explicit evidence, scale, deployment, and next-engine risks; they are not hidden as zero values or implied production certifications.

## Unresolved risks

1. **Identity is a shared service session.** Production secret mode protects the server boundary but is not SSO, per-person authentication, or member-role authorization. Do not expose the current mode as a public multi-tenant service.
2. **Runtime database credentials need target provisioning.** Migrations create `market_engine_app` and `market_engine_worker` as restricted `NOLOGIN` roles. A deployment still needs separate login roles, rotated secrets, RLS smoke tests through those logins, and a managed PostgreSQL endpoint.
3. **Research lease recovery is poll-driven.** `FOR UPDATE SKIP LOCKED` makes claims safe and `recoverExpiredRunningJobs` requeues or fails expired attempts before a later claim, but there is no active heartbeat or independent scheduler. An abandoned `running` job therefore remains stale until another worker poll occurs; production still needs queue-age monitoring and an explicit recovery schedule.
4. **Provider safety ceilings and source quality are not live-calibrated.** The adapter caps output at 12,000 tokens, input at 128 KiB, output at 256 KiB, and repeated schema fields. Its source ledger accepts only completed web-search calls and matches structured URLs to returned `search` sources or visited `open_page`/`find` URLs, but the unexecuted live acceptance run means real completion quality, cost, and semantic citation support are not yet measured.
5. **Approval materializes a typed factor, not a published or consumed estimate.** A cited numeric approval creates an atomic immutable factor/source snapshot and an approved, unpublished release. `calculateEstimate` does not read `approved_research_factor`, no materialized estimate/dependency is created automatically, and the factor invalidates nothing. It deliberately does not reinterpret prevalence as an entity count; without a reviewer-owned unit/denominator/geography/period/method binding plus canonical source-release/evidence lineage, the requested count remains `not_estimable`.
6. **Historical security fixtures remain intentionally unmodified.** Migration `011` recorded 0 production-scope violations and emitted count-bearing `WARNING` messages for exactly 7 query-result and 6 scenario `security-fixture-v1` restricted-role artifacts in the populated local database. It neither repaired nor deleted them, and every new insert is guarded without a fixture exception. Preserve the warnings in operator evidence; do not classify those fixture rows as production records.
7. **Live provider behavior is unverified.** The Responses API adapter, strict schema, retry classification, artifacts, and no-credential branch are tested, but account/model access, cost, web-source quality, and target egress were deliberately not exercised.
8. **Model pinning is advisory.** `MARKET_ENGINE_MODEL_VERSION` is documented but repositories currently choose the latest loaded model. A release guard must enforce an explicit compatible version before multi-release deployment.
9. **Search and polymorphic lookup have growth risks.** Current corpus latency is low and persisted comparison members resolve in one ordered batch query, but global search remains partly scan-bound and the polymorphic identifier lookup still text-casts/OR-scans estimates. Re-evaluate a matching Korean trigram/search projection and typed lookup branches as cardinality grows.
10. **Performance evidence is local and warm-cache.** The final `018` populated-clone run generated at `2026-08-25T13:50:49.812Z` with status `remediated_with_remaining_risks`: 10 queries, 8 below 3 ms, maximum 24.128 ms, 0 above 50 ms, 0 physical reads, and 0 temporary spills. `WB-PERF-09` improved from 53.005 ms/51,819 buffer hits immediately before its candidate-page fix to 2.362 ms/1,849 hits. Frozen baseline/index-only measurements remain explicitly historical. The audit still does not cover concurrent writers, cold storage, network hops, deep offsets, skew, or production connection-pool saturation.
11. **Evidence coverage remains intentionally sparse.** Only one Phase 1 archetype has a directly estimated published count; parent/subtype allocations are conditional Phase 2 estimates and most archetypes remain `not_estimable`. Do not reinterpret availability gaps as zero market size.
12. **Public hosting is not provisioned.** The private server-rendered application depends on PostgreSQL, server secrets, a worker, and protected access. Static or anonymous publication would violate its architecture and was not attempted.
13. **Review impact is descriptive until publication.** The review page now computes value/interval/confidence deltas, source freshness, affected segment IDs, and expected recalculation. Those fields improve human review but do not implement canonical source publication, cache invalidation, or dependency recalculation; treating the displayed expectation as an executed update would be a governance error.
14. **Input/response/export guards are finite boundaries, not full application hardening.** JSON mutations have a 128 KiB streaming ceiling, segment ASTs are structurally bounded, main JSON data routes have a 512 KiB response ceiling, and export JSON/CSV/HTML routes have a separate 5 MiB ceiling. CSV formula-leading text is neutralized while valid negative numeric/scientific-notation cells remain numeric. Production still needs request-rate controls, end-to-end concurrency/memory testing, and downstream spreadsheet handling policies.
15. **Effective condition provenance is necessary but not source truth.** Research context recursively marks a condition under a disabled ancestor as effectively disabled, preventing it from being treated as active. A correctly preserved AST still does not make an unsupported condition estimable or authoritative.
16. **Sizing scenarios are explicitly selectable; comparison members are not.** The form previews draft Low/Base/High before persistence. Revenue correctly scales annual spend and realized ARPU by `horizon_months/12`, negative inputs are rejected, and missing spend produces an entity-only scenario with null revenue. Sizing detail accepts an exact active `scenarioId`/positive safe `scenarioVersion`, fails closed on partial, malformed, inactive, wrong-estimate, or cross-workspace values, and preserves selection ID/version/mode through JSON, CSV, and print exports. With no explicit pair, sizing detail auto-selects only when exactly one active scenario exists. Persisted comparison behavior intentionally remains exact-one-only; zero or multiple active scenarios expose no market values, and there is no comparison-member selector yet.
17. **The current evidence gap is historical, not a data-zero.** Existing Nemotron shards/checksums and a runnable fetch path do not prove the original direct-acquisition execution. Do not rerun an idempotent downloader now and represent that as historical proof; obtain independent contemporaneous provenance or keep the item unavailable.
18. **Calibration aggregation is not holdout validation.** The age-band diagnostic deterministically re-sums controls used in fitting. Its 0.0459% MAPE and 100% rounding-tolerance coverage are consistency metrics only; `independent_holdout_status` remains `not_available` until observations are reserved before fitting.
19. **Sensitive-use and identifier enforcement have explicit bounded scopes.** The web segment service requires every enabled condition to match a queryable catalog entry and rejects `minor_protected`/`restricted_targeting` conditions, but the Python DSL still trusts caller-declared `use_context` and cannot detect a falsely declared purpose. A high-confidence scanner rejects recognized email/phone/resident-registration/labeled-account/detailed-address forms on implemented paths, but cannot detect every name, unlabeled identifier, or indirect re-identification risk. Derived human-unit results with raw weighted Base below 10 are suppressed in Python and persisted web snapshots; Python additionally sanitizes suppressed payloads both before persistence and after load. Migration `018` applies value-free projections to trusted application estimate/detail/comparison/Opportunity/research/scenario/export reads, and the populated clone's two legacy human Base-below-10 rows both project as suppressed. Business units and Base=10 remain outside the threshold. Deployment still needs authenticated purpose authorization, audit, and release tests for every exposed surface.
20. **Opportunity score-bundle completeness remains service-owned.** Migration `015` safely adds five numeric-domain checks, but it deliberately does not add a deferred exactly-nine-metric/weight-sum trigger because current score components are inserted incrementally. The service validates nine metrics, weights, and weighted scores; a future database trigger needs a transaction-safe bundle-completion design and regression proof.
21. **Migration `018` is not hard database confidentiality.** Five release projections and the downstream view/repository/export rewrites protect the reviewed trusted-server path, but `market_engine_app` and `market_engine_worker` still have broad raw-table `SELECT`. An arbitrary-SQL client using either role can bypass those views. Narrow the production grants or confine the credentials to reviewed repository code before making a stronger secrecy claim.
22. **Subtype allocation has a future-row release gap.** The current `subtype_allocation` population has zero human-unit rows with Base below 10, but subtype/archetype detail still reads raw count/share/denominator/formula fields. A future rare human allocation could therefore bypass the estimate views. Add a release-safe allocation projection and regression before loading such rows; a current zero count is monitoring evidence, not enforcement.
23. **Axis-to-subtype evidence is unavailable.** Domain axes and fitted/curated subtypes are modeled and exposed separately, but no direct evidence-backed axis → subtype joint or mapping is stored. The UI must not imply that an axis selection directly measures a subtype, and Phase 8 must either add governed evidence/model lineage or retain `not_estimable`.
24. **Opportunity locking is implemented, but public API error contracts remain narrow.** The current editor submits a required expected lock version and the service compares and conditionally updates it; stale writes return a bounded conflict. Mutation routes still do not expose a versioned, schema-generated public error catalog, and unexpected database/service errors can be more specific than a production API should reveal. Add route-level top-schema validation, a public domain-error allowlist, correlation IDs, and generalized unexpected 500/503 responses before third-party integration.

## Phase 8 priorities

### 1. Dependency-aware query and recalculation engine

- Promote approved typed factors into canonical source/release/evidence and replacement-estimate records only through a reviewed publication transaction.
- Recalculate only query results whose explicit dependency keys/versions changed.
- Include approved publication/model version in calculation and cache hashes.
- Add an operator-facing stale → recomputing → valid lifecycle and failure recovery.
- Expand registered joint-distribution and overlap methods without multiplying unsupported marginals.
- Keep axis → subtype unavailable until a versioned, evidence-backed relationship or explicitly labeled model dependency is published.

### 2. Unit bridges and market formulas

- Govern observed or scenario-only `entity_unit_bridge` records with evidence, reference period, Low/Base/High, and confidence.
- Add bridge-aware validation for person ↔ household and establishment ↔ enterprise only where a reviewed bridge exists.
- Extend sensitivity and scenario comparison across approved bridge versions while retaining raw unit values.
- Add an explicit comparison-member scenario selector while retaining scenario ID/version/horizon and the annual factor in every pinned disclosure.

### 3. Identity and authorization

- Add verified SSO/OIDC identity, member provisioning, and role checks for owner/editor/reviewer/viewer/worker.
- Separate web and worker database logins and test every mutation through non-owner, non-`BYPASSRLS` roles.
- Add CSRF/session rotation, revocation, rate limiting, and security event monitoring.

### 4. Durable research operations

- Add leases, heartbeats, abandoned-job recovery, provider output/token budgets, and idempotent retry dashboards. Completion/failure already require the same locked running attempt, so a committed cancellation is not overwritten.
- Run a separately authorized live acceptance test with a capped budget, sanitized artifacts, source-quality review, and provider/model availability evidence.
- Publish approved factors into canonical evidence/replacement-estimate records only when a reviewed dependency target and unit-safe formula exist.

### 5. Search, pagination, and scale

- Replace large offset scans with stable cursor/keyset pagination where deep paging matters.
- Evaluate a matching Korean trigram/tsvector search projection with workspace-aware incremental refresh.
- Add populated persisted-comparison plans, skew cases, concurrent load, response-size budgets, and cold-cache tests.
- Add a release-safe subtype-allocation projection before any human Base-below-10 allocation can enter catalog detail.

### 6. Deployment and observability

- Provision managed PostgreSQL, backups/restore rehearsal, login roles, secret storage, private ingress, worker runtime, and target monitoring.
- Add structured request/job correlation, pool metrics, slow-query sampling, queue-age alerts, audit-write alerts, and release dashboards.
- Run the full baseline, migration, integration, browser, auth, and performance gates in the target environment before promotion.
- Provision view-only/read-minimized runtime credentials, or otherwise prove that arbitrary SQL cannot bypass the migration-`018` trusted-application projections.

### 7. Data refresh and validation

- Add governed source refresh schedules and model/release compatibility checks.
- Prioritize official joint distributions for high-impact open gaps.
- Preserve the rule that missing evidence is unavailable—not zero—and keep synthetic narratives labeled as hypotheses.
