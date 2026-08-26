# Phase 3–7 Workbench verification

Generated: 2026-08-25T13:50:49.812Z  
Status: **implementation gates passed through migration `018` on a disposable populated clone; the baseline verifier remains 17/18 `FAILED`, and live OpenAI research remains unexecuted**

## Outcome

The source tree and clean/full-reapply harness cover migrations `001`–`018` at 90 public base tables and 17 views. The populated verification clone `market_engine_goal_verify_018` reaches the same boundary. The original populated `market_engine` database remains deliberately untouched at migration `016`, 90 tables, and 12 views; no report treats it as a post-`018` runtime certificate.

The reference `Market_Atlas_Final.html` concept is implemented as a PostgreSQL-backed Next.js workbench rather than a static prototype. Its four-level exploration, dark emerald navigation, radial domain hub, dense white analysis surfaces, restrained purple state, Builder layout, mobile Explorer control, and explicit search action are retained without copying hardcoded market values, random bars, mixed-unit arithmetic, or in-memory fake calculations. Reference SHA-256: `1e0614ae23c7413ab7d6c4dcf9a5771a1826fcb864f23b65ba6bf75aba0470a5`.

## Current verification matrix

| Check | Current result |
|---|---|
| Python pytest | 67 passed with database integration enabled |
| Engine validation | 46/46 passed |
| Live Phase 2 DoD | 29 passed / 0 failed / 1 unavailable |
| Phase 3 baseline verifier | 17/18 `FAILED` solely on unavailable historical acquisition provenance |
| PostgreSQL harness | `001`–`018` initial application + full reapplication passed at 90 tables/17 views |
| Original populated DB | `market_engine`, untouched at `016`/90/12 |
| Populated verification clone | `market_engine_goal_verify_018`, verified at `018`/90/17 |
| TypeScript | Passed |
| ESLint | Passed with zero warnings |
| Web unit | 44 files / 261 tests passed |
| PostgreSQL integration | 6 files / 44 tests passed on populated `018` clone |
| Production build | Passed |
| Full three-profile Playwright | 22 passed / 5 intended skips |
| Warm-cache performance | 10 queries; 8 under 3 ms; max 24.128 ms; 0 over 50 ms/read/spill |

Retained post-`016` evidence remains labeled historical: the separately gated Review/materialization browser case passed 1/1 without an external provider call, and the local shared-secret auth smoke produced `307/401/200/303/cookie-authenticated 200`. Neither is promoted as a post-`018` target-deployment certificate.

## Data and migration verification

| Target | Verified result |
|---|---:|
| Domain | 24 |
| Axis | 384 |
| Feature | 480 |
| Behavior | 240 |
| Segmentation model | 24 |
| Primary subtype | 90 |
| Parent allocation | 450 |
| Archetype | 1,440 |
| Nemotron row | 1,000,000 |
| Fixed shard | 9 |
| Activation JSON | 90 |

Migration `017` adds no table/view. It enforces at most one Opportunity primary target, exact pinned query/result/saved-version/market-scenario lineage, append-only primary links, and restricted runtime privileges. The populated clone retained all 109 Opportunity links.

Migration `018` adds five canonical release projections and replaces seven downstream view definitions without changing a base row:

- `v_estimate_release_boundary`;
- `v_estimate_component_release_boundary`;
- `v_estimate_assumption_release_boundary`;
- `v_estimate_sensitivity_release_boundary`;
- `v_segment_query_result_release_boundary`.

The clone preserved the pre-migration raw comparison fingerprint. Both legacy human estimates with weighted Base below 10 project as suppressed, and protected/minor queryable conditions remain zero. Suppressed releases withhold counts, shares, components, assumptions, sensitivity values, locators, hashes, formulas, and narratives while retaining safe reason and provenance. Enterprise releases and Base=10 are outside that suppression rule.

This is a trusted-application projection, not a hard database confidentiality boundary: runtime raw-table `SELECT` remains available for existing application paths. Current subtype allocations contain no human Base below 10, but future raw subtype rows remain outside a subtype-specific release projection.

## Current application hardening

- Explicit estimate scenario selection requires an exact active `scenarioId` and positive safe `scenarioVersion` in the current workspace/query-result lineage. Wrong, inactive, malformed, cross-estimate, and cross-workspace selections fail closed without fallback.
- JSON, CSV, and print preserve scenario ID, version, and selection mode.
- Comparison behavior remains unchanged: market values require exactly one active scenario; zero or multiple active scenarios remain unavailable.
- Opportunity updates use an expected positive version, row lock, conditional update, and visible conflict state.
- Opportunity research ideas require exact enabled feature and behavior IDs from the pinned result and queryable catalog.
- Python persistence/load and web release views sanitize suppressed payloads, including legacy records.
- Personal-data scanning and protected/minor catalog rejection remain bounded, fail-closed gates without claiming universal PII detection.
- Main JSON responses remain capped at 512 KiB and export JSON/CSV/print at 5 MiB.
- The approved factor/source snapshot remains approved but unpublished; no governed publication/dependency transaction means no replacement estimate or invalidation.

## Browser and concept verification

The final Playwright run covers desktop, tablet, and mobile, database health, responsive navigation, console/page errors, axe accessibility, reduced motion, deep links, condition registry pagination, missing-evidence states, comparisons, estimate persistence, disabled-provider research, and exports. The final result is 22 passed/5 intended skips. The transient stage opacity that caused a tablet contrast failure was removed; stage animation is transform-only.

The source data does not define a direct axis-to-subtype relationship, so that Market Atlas transition is not fabricated. Mobile comparison remains a horizontal table rather than an invented card representation.

## Performance evidence

The final read-only warm-cache audit ran on `market_engine_goal_verify_018` and generated at `2026-08-25T13:50:49.812Z`:

- 10 current queries;
- 8 under 3 ms;
- maximum 24.128 ms (`WB-PERF-02`);
- `WB-PERF-07` 18.540 ms;
- 0 above 50 ms;
- 0 physical reads or temporary spills.

The estimate-list candidate-page correction moved the immediately pre-fix `WB-PERF-09` plan from 53.005 ms / 51,819 hits to 2.362 ms / 1,849 hits. The performance report preserves frozen original and index-only stages as historical evidence and does not attribute current repository rewrites solely to migration 006. This remains a single-user warm-cache check, not a production-capacity benchmark.

## OpenAI boundary

The API key is stored only in ignored `web/.env.local` with mode `0600`; it was never printed or committed. Research opt-in remains disabled, and no OpenAI Responses API or web-search request has been made.

The proposed payload remains:

```json
{
  "researchQuestion": "대한민국 소상공인 중 온라인 판매채널 보유율의 최신 공공 근거와 Low/Base/High 범위를 조사해줘",
  "targetSegment": "대한민국 소상공인",
  "targetVariable": "online_sales_channel_prevalence",
  "baseline": {}
}
```

The required approval phrase is exactly `위 payload 그대로 외부 호출 승인.` It has not been received. After approval, exactly one job must reach `needs_review`, be human-reviewed/materialized, and verify baseline isolation. A provider response alone would not complete acceptance.

## Explicitly unresolved

- Historical Nemotron direct-acquisition execution provenance is unavailable.
- A genuine independent holdout is unavailable.
- The live credentialed provider/review/materialization path has not run.
- The approved factor/source release is unpublished.
- Migration `018` is not a hard raw-table confidentiality boundary, and subtype future-row suppression remains a residual.
- External SSO/RBAC, managed deployment secrets, target network policy, backups, and cloud reruns are unverified.

## Evidence

- [Requirement audit](./phase3_requirements_audit.md)
- [Baseline verification](./phase3_baseline_verification.md)
- [Performance evidence](./phase3_workbench_performance.md)
- [Architecture](../docs/16_workbench_architecture.md)
- [Data dictionary](../docs/18_workbench_data_dictionary.md)
- [Operations runbook](../docs/20_workbench_operations.md)
