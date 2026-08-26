# Phase 3 workbench PostgreSQL performance remediation

Generated: 2026-08-25T13:50:49.812Z  
Result: **REMEDIATED WITH REMAINING RISKS**

The current read-only warm-cache audit ran on the explicitly named disposable populated clone `market_engine_goal_verify_018`, with migrations `001`–`018`, 90 public base tables, and 17 views. The original populated `market_engine` database remains deliberately untouched at migration `016`, 90 tables, and 12 views. Of ten representative current-repository queries, eight completed below 3 ms, none exceeded 50 ms, and the maximum was 24.128 ms. The run recorded zero physical reads and zero temporary spills.

The final migration-006 index bundle remains effective for the two historical `validation_gap` hotspots. Current repository changes separately bound archetype and estimate-lineage enrichment to the selected page and route unsaved comparison resolution through release-safe projections. Those query-shape changes are not attributed to migration 006.

## Evidence boundary

Three stages are retained in the machine-readable report:

1. **Original baseline:** frozen pre-migration-006 measurements using the original repository SQL.
2. **Indexes only:** frozen migration-006 index measurements using the same original SQL.
3. **Current migration-018 clone:** current repository SQL, current release-safe views, and the populated disposable clone.

The first two stages are historical snapshots. In particular, the frozen `WB-PERF-07` stage used the pre-`018` raw-ledger resolver, and the frozen `WB-PERF-09`/`10` stages predate the current candidate-page query. Their cross-stage percentages describe combined historical shape changes and must not be interpreted as pure index attribution.

## Measurement conditions

- PostgreSQL: `17.11 (Homebrew)`; database `market_engine_goal_verify_018`.
- Execution role: `market_engine_app`, with transaction-local workspace and actor context.
- Transaction: `BEGIN READ ONLY` followed by `ROLLBACK`; no mutations.
- Plan: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON, TIMING TRUE, SUMMARY TRUE)`.
- Protocol: one discarded warm-up followed by one recorded warm-cache plan per parameterized query.
- Settings: 8 KiB blocks, `shared_buffers=128MB`, `work_mem=4MB`, `effective_cache_size=4GB`.

Exact SQL, parameters, plans, buffer metrics, frozen measurements, and stage deltas are retained in [`phase3_workbench_performance.json`](./phase3_workbench_performance.json).

## Three-stage results

Times are milliseconds and hits are shared-buffer hits. All current queries recorded zero physical reads and zero temporary reads/writes.

| ID | Current rows | Original ms / hits | Indexes-only ms / hits | Current ms / hits | Current result |
|---|---:|---:|---:|---:|---|
| `WB-PERF-01` | 24 | 1.314 / 387 | 1.210 / 384 | 1.124 / 389 | Low-cost domain summary |
| `WB-PERF-02` | 30 | 1.413 / 137 | 1.381 / 147 | 24.128 / 5,911 | Maximum; global search remains scan-bound |
| `WB-PERF-03` | 6 | 0.372 / 133 | 0.544 / 149 | 0.312 / 131 | Low-cost subtype page |
| `WB-PERF-04` | 5 | **117.163 / 166,651** | **11.009 / 19,483** | **0.334 / 255** | Candidate-page enrichment plus both gap indexes |
| `WB-PERF-05` | 5 | 0.062 / 66 | 0.031 / 22 | 0.020 / 22 | Reverse subtype allocation index used |
| `WB-PERF-06` | 6 | 0.047 / 28 | 0.060 / 28 | 0.058 / 28 | Parent lineage remains low-cost |
| `WB-PERF-07` | 2 | 0.407 / 163 | 0.367 / 175 | 18.540 / 6,687 | Release-safe resolver; polymorphic scan risk remains |
| `WB-PERF-08` | 0 | 0.023 / 2 | 0.023 / 2 | 0.116 / 5 | Frozen nonexistent UUID miss path |
| `WB-PERF-09` | 50 | **122.842 / 202,741** | **1.479 / 762** | **2.362 / 1,849** | Release-safe identifiers paged before lineage enrichment |
| `WB-PERF-10` | 45 | 2.128 / 2,719 | 0.772 / 454 | 2.181 / 1,890 | Status-filtered release-safe estimate page |

The final maximum was 24.128 ms (`WB-PERF-02`); `WB-PERF-07` was 18.540 ms. Both remained below the 50 ms guard.

## Remediation evidence

### `WB-PERF-04`: archetype list by domain

The frozen original query enriched 1,206 candidates and repeatedly scanned `validation_gap`, taking 117.163 ms and 166,651 hits. The migration-006 indexes alone reduced that exact SQL to 11.009 ms and 19,483 hits. The current `MATERIALIZED` candidate-page path bounds enrichment to five selected rows and completed in 0.334 ms with 255 hits. The repository rewrite is reported separately from the index-only effect.

### `WB-PERF-09`: default estimate-lineage page

The frozen original SQL took 122.842 ms and 202,741 hits; the migration-006 index-only stage reduced that unchanged historical SQL to 1.479 ms and 762 hits. After migration `018`, an immediately pre-fix release-safe plan expanded lineage before paging and measured 53.005 ms with 51,819 hits. The current `MATERIALIZED` candidate-page query selects release-safe estimate IDs before expanding `v_estimate_lineage`; the final run measured 2.362 ms and 1,849 hits. The immediate pre-fix measurement is diagnostic evidence, not a replacement for either frozen historical stage.

## Schema and clone integrity

- The clean migration harness passed initial application and full reapplication through `018` at 90 tables / 17 views, including the release-boundary fixture.
- The populated clone contains migrations `017` and `018`; the original populated database remains at `016`/90/12.
- Migration `017` adds Opportunity snapshot invariants without a table or view.
- Migration `018` adds five canonical release-safe views and replaces seven downstream view definitions without changing a base row.

Current measured relation counts were 24 domains, 384 dimensions, 480 features, 90 subtypes, 450 subtype allocations, 1,440 archetypes, 1,831 estimates, 746 query results, 98 comparisons, 196 comparison members, 723 saved segments, and 274 market estimates. These include workflow fixtures and are not canonical baseline-count claims.

## Remaining risks

- `WB-PERF-02` global search still scans the full archetype branch because the view expression does not match an installed text-search index.
- `WB-PERF-07` still uses text-cast polymorphic identifier predicates; the five-input cap bounds loops, not release-view corpus growth.
- `WB-PERF-08` remains a miss-path measurement; a populated comparison-detail hit is outside this frozen ten-query series.
- Advanced-text and non-name archetype sorts bypass candidate paging and need separate scale measurements.
- This is a single-user local warm-cache audit, not a cold-cache, concurrency, network, or production-capacity certificate.
- Workflow fixture cardinalities differ from the frozen stages, limiting attribution outside the two original hotspots.

## Reproduction

The persistent audit rejects the canonical `market_engine` database and requires an explicitly named disposable clone with the 90-table/17-view release boundary:

```bash
PERFORMANCE_REPORT_PATH=/tmp/market_engine_goal_verify_018_performance_final.json \
MARKET_ENGINE_PG_DATABASE=market_engine_goal_verify_018 \
NODE_PATH=web/node_modules \
node scripts/audit_workbench_performance.cjs
```
