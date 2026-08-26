# Phase 3–7 requirements evidence audit

Generated: 2026-08-25T13:50:49.812Z  
Scope: migrations `001`–`018`, the PostgreSQL/Next.js workbench, and retained Phase 1–2 evidence.  
Overall status: **implementation gates pass through the disposable populated `018` clone, but the evidence matrix is not wholly green**.

The source tree, clean/full-reapply harness, and populated verification clone reach 90 public base tables and 17 views through migration `018`. The original populated `market_engine` database remains deliberately untouched at migration `016`, 90 tables, and 12 views. The live Phase 2 DoD verifier remains 29 passed / 0 failed / 1 unavailable, so the Phase 3 baseline verifier remains 17/18 `FAILED`. Separately, no credentialed OpenAI/web-search call has been authorized or executed.

## Status vocabulary

| Status | Meaning |
|---|---|
| `PROVED` | Implementation evidence exists and the current verification matrix passed. |
| `PROVED_NOT_ESTIMABLE` | Missing or withheld evidence remains null/unavailable with a reason rather than becoming zero or fabricated data. |
| `PENDING_EXTERNAL` | Completion requires an explicitly authorized provider/network action. |
| `GAP` | A required evidence item remains incomplete or unavailable. |

## Requirement matrix

| ID | Requirement | Status | Current evidence and boundary |
|---|---|---|---|
| BASE-01 | Preserve Phase 1–2 baseline and provenance | `GAP` | Baseline rows/checksums/counts remain intact and the original populated DB stays at `016`; historical Nemotron acquisition-execution provenance remains unavailable. |
| DATA-01 | Expose the complete PostgreSQL registry | `PROVED` | 24/384/480/240/24/90/450/1,440/90 catalog objects remain database-backed. |
| DATA-02 | Never fabricate missing evidence | `PROVED_NOT_ESTIMABLE` | Missing distributions, direct axis→subtype relationships, unsupported metrics, and withheld releases remain unavailable with reasons. |
| UI-01 | Use Market Atlas as concept, not data | `PROVED` | Reference SHA-256 `1e0614ae23c7413ab7d6c4dcf9a5771a1826fcb864f23b65ba6bf75aba0470a5`; hardcoded values, random bars, mixed units, and fake calculations excluded. |
| UI-02 | Responsive and accessible workbench | `PROVED` | Typecheck/lint, 44 files/261 unit tests, production build, and Playwright 22 passed/5 intended skips passed. |
| DB-01 | Additive re-runnable migrations | `PROVED` | Initial apply and full reapply through `018` passed at 90 tables/17 views, including `010`, `017`, and `018` fixtures. |
| DB-02 | Preserve populated source while verifying latest schema | `PROVED` | Disposable clone reached `018`/90/17 with 109 Opportunity links and raw fingerprint preserved; original `market_engine` remains untouched at `016`/90/12. |
| SEC-01 | Workspace/privacy/release read boundaries | `PROVED` | Guarded conditions, Opportunity privileges, and canonical release projections are enforced; raw-table runtime `SELECT` remains a disclosed trusted-app residual. |
| SEC-02 | Atomic approved factor/source snapshot | `PROVED` | Reviewer-scoped immutable bundle remains approved but unpublished without a governed publication transaction. |
| BLD-01 | Durable nested Segment Builder | `PROVED` | Effective enablement, strict Boolean/operator/value checks, supported exact reuse, and structured failure states are covered. |
| SIZ-01 | Unit-safe sizing and explicit scenario selection | `PROVED` | Exact active scenario ID/version is validated and preserved through estimate JSON/CSV/print; horizon-aware and entity-only math remain covered. |
| SIZ-02 | Fail closed on unsupported sizing | `PROVED_NOT_ESTIMABLE` | Unsupported joints and malformed, inactive, wrong-estimate, or cross-workspace scenarios do not fall back. |
| CACHE-01 | Valid-only cache reuse | `PROVED` | Immutable invalidated history can coexist with one fresh valid result for the same hash. |
| CACHE-02 | Dependency-bound invalidation | `PROVED` | Standalone unpublished factors do not create replacement estimates or invalidate unrelated calculations. |
| RES-01 | Durable Research Queue | `PROVED` | Closed provider gate yields durable `configuration_required` without fabricated output. |
| RES-02 | Source-bound structured research | `PROVED` | Accepted URLs derive only from completed web-search calls and remain bound inside the hashed artifact. |
| RES-03 | Bounded provider input/output | `PROVED` | 12,000 output tokens, 128 KiB input, 256 KiB structured output, and bounded arrays/strings. |
| REV-01 | Human approval without baseline overwrite | `PROVED` | Approval creates an approved, unpublished workspace release. |
| REV-02 | Typed factor rather than count | `PROVED` | Reviewed numeric research materializes as an atomic factor/source bundle, never an estimate count. |
| REV-03 | PostgreSQL review/materialization verification | `PROVED` | Current clone integration passed 6 files/44 tests; retained gated post-`016` browser case passed 1/1 without provider use. |
| REV-04 | No implied publication/recalculation | `PROVED_NOT_ESTIMABLE` | No replacement estimate or invalidation exists without a governed publication/dependency target. |
| LIVE-01 | One credentialed live Research Job | `PENDING_EXTERNAL` | No call made; exact approval phrase still absent. |
| CMP-01 | Unit-safe 2–5 segment comparison | `PROVED` | Release-safe comparison retains exact-one-active-scenario behavior; explicit estimate scenario selection does not silently alter comparisons. |
| CMP-02 | Disclose unavailable comparison metrics | `PROVED_NOT_ESTIMABLE` | Unsupported or withheld values remain null with metric-specific reasons. |
| OPP-01 | Snapshot-bound Opportunity Board | `PROVED` | Migration `017`, optimistic expected-version locking, one primary target, exact lineage, and enabled feature/behavior AI provenance are enforced. |
| EXPORT-01 | Provenance-aware bounded exports | `PROVED` | JSON/CSV/print use release-safe reads, preserve scenario ID/version/mode, and neutralize spreadsheet formulas. |
| PERF-01 | Measure current SQL and bound growth risks | `PROVED` | Current `018` clone: 10 queries, 8 under 3 ms, max 24.128 ms, none over 50 ms, no physical reads/temp spills. |
| REPRO-01 | Immutable result/scenario/Opportunity lineage | `PROVED` | Saved-result pins, exact scenario revisions/selections, and append-only primary Opportunity links are covered. |
| VERIFY-01 | Latest combined verification matrix | `GAP` | Python 67; CLI 46/46; SQL 90/17 initial+reapply; unit 44/261; integration 6/44; typecheck/lint/build pass; E2E 22/5; performance max 24.128 ms. Baseline remains 17/18 failed solely on unavailable historical provenance. |
| DOC-01 | Synchronized truthful handoff | `PROVED` | Current source/clone `018`/90/17, untouched original `016`/90/12, and every provider/privacy/holdout/deployment boundary are explicit. |

Status counts: `PROVED` 23, `PROVED_NOT_ESTIMABLE` 4, `PENDING_EXTERNAL` 1, `GAP` 2.

## Current verification evidence

- Python DB-enabled suite: 67 passed; engine validation: 46/46.
- PostgreSQL harness: `001`–`018` initial application and full reapplication, 90 tables/17 views.
- Original populated DB: `market_engine`, untouched at `016`/90/12.
- Populated verification clone: `market_engine_goal_verify_018`, `018`/90/17.
- Web: typecheck and zero-warning lint passed; 44 files/261 unit tests; 6 files/44 integration tests; production build passed.
- Browser: 22 passed/5 intended skips across desktop/tablet/mobile.
- Performance: generated `2026-08-25T13:50:49.812Z`; 10 queries, 8 under 3 ms, maximum 24.128 ms, zero over 50 ms/read/spill. `WB-PERF-09` moved from an immediate pre-fix 53.005 ms/51,819 hits to 2.362 ms/1,849 hits.

The populated clone projects both legacy human Base<10 estimates as suppressed and exposes zero protected/minor queryable conditions. Migration `018` is a canonical trusted-application read boundary; it does not revoke every runtime raw-table `SELECT`, and future subtype Base<10 rows remain a disclosed residual.

## Exact external-call gate

No external OpenAI/web-search call is authorized by this audit. The proposed payload remains:

```json
{
  "researchQuestion": "대한민국 소상공인 중 온라인 판매채널 보유율의 최신 공공 근거와 Low/Base/High 범위를 조사해줘",
  "targetSegment": "대한민국 소상공인",
  "targetVariable": "online_sales_channel_prevalence",
  "baseline": {}
}
```

The call may proceed only after the user sends exactly `위 payload 그대로 외부 호출 승인.` That phrase has not been received. A successful provider response must still reach `needs_review`, pass schema validation, receive human review/materialization, and prove baseline isolation. No live-provider or independent-holdout success is claimed.

## Evidence links

- [Machine-readable requirement audit](./phase3_requirements_audit.json)
- [Workbench verification](./phase3_workbench_verification.md)
- [Performance evidence](./phase3_workbench_performance.md)
- [Baseline verification](./phase3_baseline_verification.md)
