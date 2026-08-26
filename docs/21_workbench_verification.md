# Phase 3–7 workbench verification

## Current outcome and certificate boundary

The source tree and disposable migration harness now cover migrations `001`–`018`, 90 public base tables, and 17 workbench views. A populated disposable clone, `market_engine_goal_verify_018`, reached that same `018`/90/17 boundary. The original populated `market_engine` database remains deliberately untouched at migration `016`, 90 tables, and 12 views; it is not a post-`018` runtime certificate. The immutable Phase 1–2 DuckDB/Parquet baseline was not regenerated or overwritten.

Migration `017` adds Opportunity primary-target uniqueness, exact pinned query/result/saved-version/market-scenario lineage, append-only primary links, and runtime privilege restrictions without adding a table or view. Migration `018` adds five canonical release-safe projections and replaces seven downstream view definitions without changing a base row. The populated clone preserved the original raw comparison fingerprint and all 109 Opportunity links while applying both migrations.

The current DB-enabled rerun records Python 67 passed with one Starlette deprecation warning (without the database environment: 65 passed/2 skipped), engine validation 46/46, TypeScript and zero-warning lint passed, 44 files/261 web unit tests passed, 6 files/44 populated-PostgreSQL integration tests passed, the production build passed, and desktop/tablet/mobile Playwright finished 22 passed/5 intended skips. The SQL harness passed initial application and full reapplication through `018` at 90 tables/17 views, including the release-boundary fixture.

The overall baseline certificate is nevertheless **not complete**. The live Phase 2 Definition-of-Done verifier reports 29 passed / 0 failed / 1 unavailable, so the Phase 3 baseline verifier remains 17/18 and **FAILED solely** on unavailable historical execution provenance showing who directly acquired the Nemotron files. Present files prove shard presence, checksums, row count, and fetch capability; they do not reconstruct that historical execution fact.

The server-only OpenAI credential exists locally, but research opt-in remains disabled and no OpenAI/web-search request has been made. The user has not sent the required exact phrase `위 payload 그대로 외부 호출 승인.` Exactly one credentialed Research Job, human review, materialization, and baseline-isolation verification remain pending. This document does not claim `GAP 0`, a live-provider success, an independent holdout, or a cloud deployment.

## Current and retained evidence matrix

| Check | Result and boundary |
|---|---|
| Live Phase 2 DoD verifier | 29 passed / 0 failed / 1 unavailable |
| Phase 3 baseline verifier | 17/18; **FAILED solely** on the unavailable acquisition-provenance item |
| Python pytest | **Current DB-enabled:** 67 passed, one Starlette deprecation warning; **without DB environment:** 65 passed / 2 skipped |
| Engine validation | **Current:** 46/46 |
| PostgreSQL migration harness | **Current source/harness:** `001`–`018`, initial apply + full reapply, 90 tables / 17 views |
| Populated database boundary | **Verification clone:** `018`/90/17; **original `market_engine`:** untouched at `016`/90/12 |
| Canonical backfill verify-only | Retained baseline evidence: 12/12 checks with exact baseline counts |
| TypeScript | **Current:** passed |
| ESLint | **Current:** passed with zero warnings |
| Web unit tests | **Current:** 44 files / 261 passed |
| Populated-PostgreSQL integration | **Current on `018` clone:** 6 files / 44 passed |
| Production build | **Current:** passed |
| Full three-profile browser regression | **Current:** 22 passed / 5 intended skips across desktop/tablet/mobile |
| Gated mutating review/materialization | **Retained post-`016`:** 1/1 with two-step confirmation; not a live-provider run |
| Production-auth smoke | **Retained post-`016`:** `307/401/200/303/cookie-authenticated 200`; not a target deployment certificate |
| Warm-cache performance | **Current on `018` clone, `remediated_with_remaining_risks`:** generated `2026-08-25T13:50:49.812Z`; 10 queries; 8 below 3 ms; maximum 24.128 ms; 0 above 50 ms; 0 physical reads; 0 temp spills |
| Independent holdout | `not_available`; calibration aggregation is not out-of-sample evidence |
| Credentialed external research | **Not run**; pending exact approval, live job, human review, materialization, and isolation checks |

## Verified environment and baseline

- PostgreSQL 17.11 on the local Unix socket at port `55432`.
- Original database: `market_engine`, deliberately retained at `016`/90 tables/12 views.
- Disposable populated verification clone: `market_engine_goal_verify_018`, verified at `018`/90 tables/17 views.
- Node.js 26 with Next.js 16.3.2 and React 19.
- Required catalog counts remain 24 domains / 384 axis decisions / 480 features / 240 behaviors / 24 models / 90 subtypes / 450 representatives / 1,440 archetypes / 90 activation records.
- The Nemotron manifest records 1,000,000 rows across 9 checksum-pinned shards. That integrity evidence does not resolve the historical acquisition-execution gap.
- Research opt-in was forced off. The local key stayed server-side; no key value was printed or committed.
- The Market Atlas reference remains `/Users/woocheolshin/Downloads/Market_Atlas_Final.html`, SHA-256 `1e0614ae23c7413ab7d6c4dcf9a5771a1826fcb864f23b65ba6bf75aba0470a5`. It is a visual/navigation concept only; its hardcoded values, random bars, mixed units, and in-memory calculations were not imported.

## Database and application coverage

The initial/full migration harness covers the stateful `010` fixture, saved-result/scenario lineage, atomic approved-factor/source snapshots, entity-only scenarios, the nine migration-`014` interval/source-lineage checks, five migration-`015` numeric-domain checks, four migration-`016` finite-number checks and guarded catalog projection, migration-`017` Opportunity snapshot invariants, and migration-`018` release-safe read boundary. The source-tree target is 90 tables/17 views; only the disposable clone was advanced from `016` to `018`.

Migration `018` defines these canonical release projections:

- `v_estimate_release_boundary`;
- `v_estimate_component_release_boundary`;
- `v_estimate_assumption_release_boundary`;
- `v_estimate_sensitivity_release_boundary`;
- `v_segment_query_result_release_boundary`.

The downstream estimate, archetype, saved-segment, comparison, Opportunity, catalog, and global-search views consume the release boundary. Derived `person`, `child_person`, and `household` outputs with weighted Base below 10 fail closed: counts, shares, components, assumptions, sensitivity values, locators, hashes, formulas, and narratives are withheld while suppression reason and safe lineage remain. The populated clone contains two legacy human Base<10 estimates, and both project as suppressed. Protected/minor queryable conditions remain zero. Enterprise outputs and Base=10 are not suppressed by that rule.

This is a canonical trusted-application projection, not a hard database confidentiality boundary: runtime roles still retain raw-table `SELECT` required by existing application paths. Current subtype allocations contain no Base<10 human rows, but future raw subtype rows remain a disclosed residual because there is no subtype release projection.

The current unit and integration runs cover, among other contracts:

- bounded nested Boolean segments, catalog/operator/value checks, ancestor-aware enablement, and explicit `not_estimable` gaps;
- personal-data scanning and protected/minor condition rejection without claiming universal PII detection;
- Python and web persisted-payload suppression, including legacy suppressed rows;
- unit-safe Low/Base/High TAM/SAM/SOM, entity-only scenarios, and horizon-scaled revenue;
- explicit estimate scenario selection by exact active `scenarioId` and positive safe `scenarioVersion`, with workspace/query-result lineage and fail-closed malformed, inactive, wrong-estimate, and cross-workspace cases;
- preservation of scenario ID/version/selection mode through JSON, CSV, and print exports;
- unchanged comparison behavior: market values remain available only when exactly one active scenario exists; zero or multiple active scenarios stay unavailable rather than silently selecting a row;
- optimistic Opportunity locking using an expected positive version, row locking, conditional update, and a visible conflict state;
- exact enabled feature/behavior provenance for Opportunity research ideas and migration-`017` pinned-snapshot invariants;
- release-safe list/detail/search/comparison/Opportunity reads and semantic bounded exports;
- durable research queue, review confirmation, typed factor/source materialization, and the disabled-provider `configuration_required` path.

## Browser and Market Atlas evidence

The final three-profile Playwright checkpoint covers 27 cases: 22 passed and 5 intended profile/gate skips across desktop, tablet, and mobile. It covers database health, responsive navigation, console/page errors, axe accessibility, reduced motion, exact deep links, condition pagination, missing-evidence states, comparisons, estimate persistence, disabled-provider research, and exports. The transient stage-in opacity that caused a tablet contrast failure was removed; the final animation is transform-only.

The UI follows the reference’s dark emerald exploration field, dense white analysis surfaces, restrained purple state, four-level navigation, radial domain hub, Builder layout, compact mobile Explorer control, and explicit search submit action without copying fake data. The source data does not expose a direct axis-to-subtype relationship, so Level 3→4 is not fabricated. Mobile comparison remains a horizontally scrollable table rather than a card transformation.

The retained gated `RUN_MUTATING_REVIEW_E2E=1` case passed 1/1 against the original populated database at the post-`016` checkpoint. It is evidence for the alertdialog confirmation and append-only Review → Approved Version/materialization contract, not for a live provider response, source quality, account/model access, or migration `018`.

## Performance evidence

The final local warm-cache audit ran read-only on the `018` populated clone. Eight of ten queries completed below 3 ms, the maximum was 24.128 ms (`WB-PERF-02`), `WB-PERF-07` completed in 18.540 ms, and no query exceeded 50 ms or incurred physical/temp I/O. The estimate-list candidate-page fix reduced the immediately pre-fix `WB-PERF-09` plan from 53.005 ms / 51,819 hits to 2.362 ms / 1,849 hits. Frozen baseline and index-only stages remain explicitly historical in the performance report. This is not a concurrency, cold-cache, network, or production-capacity certificate.

## Historical checkpoints

Earlier local certificates remain useful chronology but are not the current aggregate:

- migrations `001`–`007`: 88 tables / 12 views;
- migrations through `012`: 90 tables / 12 views;
- migration `013`: retained 106-unit/39-integration evidence;
- migration `014`: retained 161-unit/41-integration evidence;
- migration `015`: retained 193-unit evidence;
- migration `016`: retained Python 64/2, 198-unit, 43-integration, browser 22/5, gated-review/auth, and 90-table/12-view evidence;
- an older static Phase 2 audit: 30/30, before the live verifier distinguished unavailable historical execution provenance from present artifact integrity.

These records are historical only. They cannot override the current `001`–`018` source/clone verification, the original database’s deliberate `016` boundary, the live 29/0/1 Phase 2 result, or the 17/18 failed Phase 3 baseline result.

## Explicitly not certified

- No live OpenAI Responses API or web-search request has been made. The exact approval phrase has not been received.
- No live Research Job has reached `needs_review`; no human has reviewed such a live result; and no live factor/source materialization or post-materialization isolation check has occurred.
- The historical Nemotron direct-acquisition execution provenance remains unavailable.
- A genuine independent holdout remains unavailable. The 0.0459% age-band figure is a same-input calibration diagnostic, not out-of-sample performance.
- The approved research factor/source ledger is unpublished. No governed publication/dependency transaction exists, so it does not create a replacement estimate or invalidate calculation snapshots.
- The release-safe views are a trusted-app read boundary, not denial of all raw-table access.
- The feature registry checks the caller-declared `use_context`; intent misdeclaration remains outside that gate.
- Main JSON and export responses are bounded at 512 KiB and 5 MiB respectively; those ceilings do not certify load behavior.
- No public/cloud deployment was made. External SSO/RBAC, managed secrets, network policy, backups, and target-environment reruns remain unverified.
