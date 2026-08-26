# Workbench HTTP and action interface

The routes in `web/src/app/api/` are an internal, same-origin interface for the Market Intelligence Workbench. They are separate from the Python engine's versioned `/v1` and `/v2` REST API and are not currently advertised as a stable public API. There is no `/api/v1` compatibility promise, CORS contract, generated OpenAPI document, or external identity-token contract.

## Base URL and authentication

Local development defaults to `http://localhost:3000` with `WORKBENCH_AUTH_MODE=local`. This bypass is rejected in production.

In production secret mode, API calls require the configured secret:

```bash
export WORKBENCH_BASE_URL=https://workbench.example.com
export WORKBENCH_ACCESS_SECRET='replace-with-the-deployed-32-plus-character-secret'
curl --fail-with-body \
  -H "Authorization: Bearer ${WORKBENCH_ACCESS_SECRET}" \
  "${WORKBENCH_BASE_URL}/api/health"
```

Browser users submit `secret` and an optional same-origin `next` path to `POST /api/auth/access`. A valid request creates the HTTP-only access cookie and redirects with `303`. `POST /api/auth/logout` clears it. These two routes are session helpers, not user-management APIs.

Auth failures use:

| Status | Body/behavior | Meaning |
|---:|---|---|
| `401` | `{"error":"authentication_required"}` | Missing or invalid cookie/Bearer secret |
| `503` | `{"error":"secure_workbench_auth_configuration_required"}` | Production mode is not securely configured |
| `303` | Redirect from access/logout form routes | Browser session transition |

Workspace-aware database work executes as the server-configured workspace and actor; global health/catalog reads do not impersonate a client-supplied context. No route accepts a workspace or actor identifier from the client.

## Conventions

- Requests and ordinary responses use JSON unless an export format says otherwise.
- PostgreSQL `numeric` values are commonly serialized by `pg` as decimal strings. Clients must not coerce them through binary floating point when precision matters. The scenario editor preserves factor and eligible-entity values as decimal strings and uses `Decimal` arithmetic for preview and persistence, including values above `Number.MAX_SAFE_INTEGER`.
- Missing evidence is represented by `status: "not_estimable"` and null Low/Base/High values, never zeros.
- Entity units are exactly `person`, `child_person`, `household`, `establishment`, or `enterprise`.
- IDs are UUIDs unless the underlying canonical catalog uses a stable text ID, such as an archetype or subtype ID.
- Mutation validation failures return a machine-readable `error` string. The current routes do not expose a common problem-details schema.
- JSON POST bodies for `/api/segments`, `/api/estimate`, `/api/opportunities`, and `/api/research` are limited to 128 KiB by both declared `Content-Length` and streamed bytes. Oversized bodies return `413 { "error": "request_body_too_large" }`; malformed JSON returns `400 { "error": "request_body_invalid_json" }`.
- Main JSON data routes serialize through a 512 KiB UTF-8 response ceiling. Export JSON/CSV/HTML routes use a separate 5 MiB UTF-8 ceiling. Either overflow returns `500 { "error": "response_body_too_large" }` without a download disposition and with `Cache-Control: no-store`.

## Route summary

| Method | Path | Purpose | Success |
|---|---|---|---|
| `GET` | `/api/health` | Check Next-to-PostgreSQL connectivity and catalog/view counts | `200` |
| `GET` | `/api/search?q=…&limit=…` | Search the global catalog | `200` |
| `GET` | `/api/segments` | List up to 100 saved segments with their current pinned state | `200` |
| `POST` | `/api/segments` | Save a segment and, unless `calculate:false`, calculate its estimate | `201` |
| `GET` | `/api/estimate?status=…` | List up to the repository default of 50 lineage-rich estimates | `200` |
| `POST` | `/api/estimate` | Calculate/reuse a query estimate | `201` |
| `GET` | `/api/opportunities?boardId=…&status=…` | List up to 50 opportunity snapshots | `200` |
| `POST` | `/api/opportunities` | Create an opportunity | `201` |
| `GET` | `/api/research?status=…` | List up to 50 research/review queue rows | `200` |
| `POST` | `/api/research` | Create an idempotent research job | `201` |
| `GET` | `/api/research/{jobId}` | Read a job with steps, events, artifacts, and latest proposal | `200`/`404` |
| `GET` | `/api/research/jobs/{jobId}/events?after=N` | Poll ordered events after a sequence number | `200`/`404` |
| `GET` | `/api/exports/{snapshotId}?kind=…&format=…` | Download an immutable query-time snapshot | `200`/`404` |

## Health

`GET /api/health` always queries the live database; it has no static/demo success fallback.

```json
{
  "ok": true,
  "database": {
    "database_time": "2026-08-25T00:00:00.000Z",
    "domain_count": 24,
    "archetype_count": 1440,
    "workbench_view_count": 17
  }
}
```

A connection/query failure returns `503` with `{ "ok": false, "error": "…" }`. Counts indicate connectivity and the presence of current data; they do not replace the backfill manifest or full validation suite. The example reflects the current `018` source/verification-clone target; the deliberately unmigrated original populated `market_engine` database remains at `016` and reports 12 views.

## Search

`GET /api/search?q={text}&limit={1..100}` searches `v_global_search` through the catalog repository. `q` must contain at least two trimmed characters. The default limit is 30.

```json
{
  "query": "음악",
  "results": [
    {
      "objectType": "domain",
      "objectId": "DOM-01",
      "workspaceId": null,
      "title": "…",
      "summary": "…",
      "entityUnit": "person",
      "domainId": "DOM-01",
      "relevance": 0.9,
      "updatedAt": "…"
    }
  ]
}
```

A short query returns `400` with `{ "results": [], "error": "query_too_short" }`. Result fields are read-model fields and may grow additively.

## Segments and estimates

`POST /api/segments` accepts `name`, `entityUnit`, and a conditions array, plus optional `naturalLanguage` and `calculate`. It returns `{ "segmentId": "uuid", "estimateId": "uuid-or-null" }`. Runtime condition validation findings are persisted in the immutable query snapshot at `filter_json.validation_issues` and are also rendered as user-facing warnings/errors in the Builder. An enabled group with no enabled condition or child group is an error and blocks calculation; warnings remain attached to the query rather than disappearing after save.

Before persistence, every enabled condition is looked up in the condition catalog in the same workspace transaction. The service rejects an unknown or non-queryable entry, `minor_protected`/`restricted_targeting` sensitivity, namespace or entity-unit mismatch, an operator unsupported by the catalog data type, a value of the wrong type, or a value outside the registered allowed set. Unregistered `custom` conditions therefore fail closed. Migration `016` preserves all 4,005 catalog rows for audit/browse while marking 185 guarded rows non-queryable: 105 DOM-17 rows and 80 `child_person` archetypes. The ordinary queryable library therefore exposes 3,820 rows. Segment free text and the persisted segment payload also pass the shared high-confidence personal-data scanner. That scanner recognizes obvious email, phone, resident-registration, labeled account/financial-account, and detailed street-address patterns; it does not claim universal PII or real-name detection.

### List

`GET /api/estimate` returns `{ "estimates": [...] }`. Optional `status` applies an exact status filter. Each row comes from the migration-`018` release-safe `v_estimate_lineage` and includes unit, Low/Base/High, denominator, period, geography, method/formula, model/data versions, confidence, components, assumptions, validation gaps, dependencies, and source lineage. For a release-suppressed human estimate, values, value-bearing rationale/gap/locator text, and reconstruction hashes are null or canonicalized rather than copied from the raw ledger.

### Calculate

`POST /api/estimate` accepts:

| Field | Required | Contract |
|---|---|---|
| `name` | yes | Non-empty display/query name |
| `entityUnit` | yes | One of the five explicit entity units |
| `segmentId` | no | Existing saved-segment UUID; when present, its current pinned query is used |
| `conditions` | when `segmentId` is absent | Array of conditions, or grouped `{logic, conditions}` arrays |

A condition accepts canonical keys such as `sourceKind`, `sourceCode`, `operator`, `value`, `entityUnit`, `matchStatus`, `enabled`, and `dependencyGroup`. Operators are `eq`, `neq`, `in`, `not_in`, `between`, `lt`, `lte`, `gt`, `gte`, `contains`, or `exists`. Resolutions are `exact`, `similar`, `proxy`, `ambiguous`, `missing`, or `research_required`.

```json
{
  "name": "Selected archetype",
  "entityUnit": "enterprise",
  "conditions": [
    {
      "sourceKind": "archetype",
      "sourceCode": "archetype:ARC-XX-YYY",
      "operator": "eq",
      "value": "ARC-XX-YYY",
      "entityUnit": "enterprise",
      "matchStatus": "exact"
    }
  ]
}
```

Success returns `201 { "estimateId": "uuid" }`. The service reuses a valid cached result for the same query/model. Exact positive archetype reuse is restricted to `eq`/`in` conditions whose entire enabled path is conjunctive `AND`; `neq`, `not_in`, `OR`, and unsupported nested negation cannot resolve to that positive estimate. A registered nested `NOT` subtype path may use its explicit complement formula. Other unsupported joints and Boolean expressions do not cause an HTTP failure: they create lineage-rich `not_estimable` records with null counts and a validation gap. Empty enabled groups and other invalid condition shapes are reported as validation issues instead of being treated as match-all. The AST is bounded to depth 12, 1,024 nodes, 256 array items, 64 object keys, 16,000 characters per string, and 64,000 total string characters. Invalid units/conditions return `422 { "error": "…" }`; missing name/unit returns `400`.

When a derived `person`, `child_person`, or `household` calculation has raw weighted Base below 10, the returned/persisted query estimate is `suppressed`: count/share/component numeric values and raw intervals are absent, `result_summary` contains no reconstructable interval, and a `small_sample` gap plus safe nonnumeric lineage remain. An exact below-threshold web reuse is also wrapped in a separate workspace-owned suppressed snapshot; the registered source estimate is not rewritten. Migration `018` additionally classifies any human Base-below-10 estimate at the trusted-application read boundary and carries value-free behavior through estimate, saved-segment, comparison, Opportunity, research-baseline, scenario-save, search, and export repositories. `establishment`, `enterprise`, and Base=10 remain outside the threshold. This API boundary does not imply hard database confidentiality for runtime roles that can query raw tables.

## Opportunities

### List

`GET /api/opportunities` returns `{ "opportunities": [...] }` from `v_opportunity_snapshot`. `boardId` and `status` are optional exact filters. Rows include the board, problem/hypothesis/idea, linked immutable segment snapshots, current versioned content, score, status, and update time.

### Create

`POST /api/opportunities` accepts:

```json
{
  "name": "Opportunity name",
  "problem": "Observed problem",
  "hypothesis": "A hypothesis, not a claim about real people",
  "idea": "Candidate solution",
  "boardId": null,
  "segmentId": null,
  "revenueModel": null,
  "price": null,
  "channels": [],
  "assumptions": [],
  "nextExperiment": null,
  "status": "discovered",
  "notes": null
}
```

`name`, `problem`, `hypothesis`, and `idea` are required. If no board is supplied, the mutation service uses or creates the workspace's active default board (`기본 아이디어 보드`). `status` must match the database vocabulary documented in `docs/18_workbench_data_dictionary.md`. The complete Opportunity mutation passes the bounded high-confidence personal-data guard before persistence. Success returns `201 { "opportunityId": "uuid" }`; required-field errors return `400`; service/schema errors return `422`. The UI edit action additionally requires `expected_lock_version`; a missing value fails closed and a stale value returns the bounded `opportunity_edit_conflict` result. Migration `017` independently restricts Opportunity links to one immutable primary target with exact workspace/query/result/saved-version/market-scenario lineage.

## Research

### Create

`POST /api/research` accepts:

```json
{
  "segmentId": "optional-saved-segment-uuid",
  "researchQuestion": "What authoritative evidence measures this variable?",
  "targetSegment": "Explicit target population",
  "targetVariable": "variable_name",
  "baseline": {}
}
```

Success returns:

```json
{
  "id": "research-job-uuid",
  "configurationRequired": true
}
```

`researchQuestion`, `targetSegment`, and `targetVariable` are required; `segmentId` and `baseline` are optional. An explicit `baseline` must be a JSON object and takes precedence as the baseline for the requested target variable. When both it and a segment are supplied, provenance is composite: `snapshotProvenance.targetVariableBaseline` preserves the explicit variable baseline while `snapshotProvenance.segmentContext` preserves the saved segment's version, pinned result, query/result IDs, filter definition, and normalized feature/behavior/subtype/archetype conditions. Condition enablement is effective, not merely local: a condition beneath any disabled ancestor is retained as disabled provenance and is not emitted as an active research constraint. The normalized `baseline` remains the explicit target-variable baseline; segment calculability is context and is not silently treated as evidence for another variable. An absent/empty baseline is canonicalized as unavailable with null values rather than zero. The request fields are scanned for recognized high-confidence identifiers, and the complete enriched canonical payload is scanned again after saved-segment context is loaded and immediately before persistence/provider eligibility; the detector remains intentionally incomplete.

The queue is for unresolved variables, not duplicate calculation. For ordinary factor research, an explicit baseline whose normalized status is `estimated` returns `422 { "error": "research_variable_already_calculable_from_existing_data" }`. An attached saved-segment estimate alone does not trigger that rejection because it describes the target population rather than necessarily measuring `targetVariable`. Opportunity idea targets (`opportunity_idea_brief:<opportunity-uuid>`) remain eligible because they request a hypothesis brief, not a replacement numeric factor.

`configurationRequired: true` means no external request was made: the job was recorded with status `configuration_required` because the job-creating Next server lacks the explicit AI opt-in and/or key. The executing worker checks the same gate again. At creation, the complete canonical payload hash is also its workspace-scoped idempotency key, so submitting the same task identity, normalized baseline, and provenance resolves to the same job. Reviewer follow-up later rehashes the worker input without replacing that creation key. Required-field errors return `400`; a missing segment or another service error returns `422`.

### List and detail

`GET /api/research?status={status}` returns `{ "jobs": [...] }`. Each row joins job, proposal, and review status. `GET /api/research/{jobId}` adds ordered `steps`, `events`, `artifacts`, and the latest `revision` object. Unknown jobs return `404 { "error": "research_job_not_found" }`.

Provider output is validated as `research-result-v2`. The job's canonical question, target segment/variable, and baseline remain authoritative; differing provider echoes are exposed as artifact validation warnings rather than substituted into the proposal. Each structured evidence URL must normalize to a URL from a **completed** provider web-search call—returned `search` sources or visited `open_page`/`find` URLs; incomplete calls do not contribute to the source ledger, and obvious search-results pages are rejected. Evidence indexes must be in range and point to a source/citation bundle, including Opportunity idea evidence. This is a provenance check, not independent proof that a page supports a claim. The v2 contract adds nullable `opportunityIdeaBrief`, which is required only for a `targetVariable` of `opportunity_idea_brief:<opportunity-uuid>` and forbidden for ordinary factor research.

### Event polling

`GET /api/research/jobs/{jobId}/events?after={sequenceNo}` returns the current job status/error fields plus at most 200 events with a sequence number greater than `after`, ordered ascending. It sets `Cache-Control: no-store`.

```json
{
  "status": "needs_review",
  "updated_at": "…",
  "error_code": null,
  "error_message": null,
  "events": [
    {
      "research_job_event_id": 42,
      "sequence_no": 3,
      "event_type": "needs_review",
      "payload": {},
      "occurred_at": "…"
    }
  ]
}
```

This endpoint is JSON polling, not Server-Sent Events. Clients should retain the highest received `sequence_no` and pass it as the next `after` value.

Review decisions are currently exposed through `reviewRevisionAction`, not a public HTTP review route. The action requires a non-blank user-authored `note`; it does not synthesize a fallback rationale. The note and optional modification payload pass the bounded high-confidence personal-data guard. The UI presents an accessible confirmation step before submitting a terminal decision. Job detail exposes a structured `delta_summary` with denominator comparability, value and interval changes, confidence score/grade change, per-source freshness, and computation time. It also exposes `affected_segment_ids` and an `expected_recalculation` envelope describing whether invalidation/recalculation would be required after governed materialization. These fields make impact review explicit; they do not themselves publish, invalidate, or recalculate anything. Approval always creates an approved, unpublished release decision without rewriting canonical baseline rows. The calculation service has no `approved_research_factor` consumer, so approval alone creates neither a replacement estimate nor cache invalidation. For an Opportunity idea target, approval also appends a pinned `opportunity_content_version` (`content_key=idea_brief`, `source_kind=ai_hypothesis`) with research and source provenance; it does not replace the Opportunity's user-authored solution field or create canonical evidence/estimate rows.

## Exports

`GET /api/exports/{snapshotId}` resolves the requested record at request time through workspace-scoped, migration-`018` release-safe repositories. Export formatting never re-queries the raw estimate/component/result ledgers, so a rare human estimate remains value-free in JSON, CSV, and print output.

| Parameter | Values | Default |
|---|---|---|
| `kind` | `estimate`, `segment`, `comparison`, `opportunity` | `estimate` |
| `format` | `json`, `csv`, `print` | `json` |

JSON uses the `workbench-export-v1` envelope:

```json
{
  "schemaVersion": "workbench-export-v1",
  "kind": "estimate",
  "snapshotId": "uuid",
  "generatedAt": "…",
  "immutableSnapshot": {}
}
```

CSV is semantic long form with the columns `schemaVersion`, `kind`, `snapshotId`, `generatedAt`, `section`, `path`, and `value`; nested factors, sources, confidence, conditions, comparisons, experiments, and scenarios are recursively expanded into rows instead of being hidden in one JSON cell. Text cells that begin with spreadsheet formula sigils (`=`, `+`, `-`, or `@`, including leading whitespace/control variants) are prefixed with a literal apostrophe before CSV escaping. A syntactically valid negative numeric literal—including decimal/scientific notation and surrounding whitespace—is deliberately left numeric. `print` returns escaped, sectioned HTML tables rather than a raw JSON block. Unsupported kind/format returns `400`; an inaccessible or absent snapshot returns `404`. “Immutable snapshot” means the response contains a self-contained point-in-time payload; the export route does not persist an export artifact by itself. JSON, CSV, and print bodies are all checked against the 5 MiB UTF-8 route ceiling and include `Content-Length` on success.

## Server Actions used by the UI

The workbench UI also uses compiled Next.js Server Actions. They are not direct HTTP contracts for third-party clients, but their mutation surface matters for maintenance:

| Action | Main form keys | Result |
|---|---|---|
| `interpretSegmentAction` | `natural_language` | Catalog interpretation and unmatched tokens |
| `saveSegmentAction` | `segment_id?`, `name`, `entity_unit`, `natural_language?`, `conditions_json` | New segment/version ID |
| `calculateEstimateAction` | `segment_id?`, `name`, `entity_unit`, `conditions_json` | Estimate ID |
| `saveScenarioAction` | `estimate_id`, optional prior `scenario_id`, `name`, `factors_json` | Scenario ID/revision. Decimal factor values remain strings through parsing/preview/persistence; serviceability and attainable-share intervals are required; annual spend is optional. Without spend evidence, entity TAM/SAM/SOM is retained and all revenue intervals are null. |
| `saveComparisonAction` | `comparison_id?`, `name`, `segment_ids_json` | Comparison ID, maximum five members; complete payload is scanned for recognized high-confidence identifiers |
| `createOpportunityAction` / `updateOpportunityAction` | opportunity fields; update also requires `expected_lock_version` | Opportunity ID or bounded stale-edit conflict |
| `createResearchJobAction` / `cancelResearchJobAction` | research fields / `job_id` | Job ID/status transition |
| `reviewRevisionAction` | `review_id`, decision, `modification_json?`, non-blank user-authored `note` | Proposal/version decision |
| `exportSnapshotAction` | `snapshot_id`, `snapshot_kind`, `format` | Download URL |

Every action returns `{ok, id?, error?, configurationRequired?, interpretation?}` and revalidates affected pages. Do not call the generated Server Action transport from external integrations; add a documented route and tests instead.

The scenario form uses text inputs with decimal input hints, preserves exact decimal strings, and calculates a client-side live draft with the same `Decimal`-based pure sizing function used before persistence. A regression preserves exact submission above `2^53`; database migration `016` separately rejects `NaN` and signed infinities. Scenario name/factors and comparison payloads also pass the bounded high-confidence personal-data guard.

Sizing detail supports an explicit scenario through `/sizing/{estimateId}?scenarioId={uuid}&scenarioVersion={positive-safe-version}`. Both parameters must be present exactly once and must identify that estimate's exact active scenario revision in the current workspace and pinned query-result lineage; malformed, partial, repeated, inactive, wrong-estimate, or cross-workspace selection fails closed without falling back. With both parameters absent, detail retains automatic selection only when exactly one active scenario exists. The exact scenario ID, version, and selection mode are preserved through detail, JSON, CSV, and print exports. Persisted comparison behavior is intentionally unchanged: market metrics appear only when the pinned member has exactly one active scenario, while zero or multiple active scenarios remain explicitly unavailable rather than silently selecting a row. There is no comparison-member scenario selector yet.

## Error and compatibility policy

- `400` means request shape or supported enum/kind failure detected by the route.
- `404` means the workspace-scoped record is absent or inaccessible.
- `422` means a mutation service rejected the request; its error string is stable enough for operator diagnosis but is not yet a versioned public error catalog.
- `413` means a guarded JSON mutation body exceeded the 128 KiB request ceiling.
- `500` may result from an unhandled repository failure or the guarded `response_body_too_large` condition; `/api/health` converts database failures to `503`.
- Add fields compatibly. Any rename/removal or semantic change requires a versioned route or export schema, migration/read-model update, integration tests, and this document to be updated.
