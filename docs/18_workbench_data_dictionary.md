# Workbench data dictionary

This dictionary describes the additive PostgreSQL objects introduced for the Phase 3–7 workbench. The 58 canonical Phase 1–2 tables remain defined by `migrations/001_core.sql`, `migrations/002_phase2_domains_subtypes.sql`, and `docs/06_data_model.md`. Migration `003_workbench.sql` extends those records and creates 29 workbench tables; `004_workbench_read_models.sql` creates 12 views; `005_workbench_operations.sql` adds the import manifest and runtime grants; `006_workbench_performance.sql` adds five lineage/page indexes; `007_workbench_governance_hardening.sql` adds normalized condition reference years, parent-owned RLS, snapshot mutation guards, and derived-estimate provenance backfill; `008_requirement_completion_hardening.sql` adds workspace-owned query snapshots, scoped release approval, valid-cache identity, and the complete global-search projection; `009_approved_research_factor.sql` adds two typed approved-factor/source tables; `010_reproducible_workbench_snapshots.sql` adds saved-segment-version lineage to scenarios and immutable scenario revision guards; `011_lineage_integrity_guards.sql` enforces query/result/entity-unit/workspace, saved-version pin, and scenario lineage for every new row; `012_approved_research_factor_snapshot_hardening.sql` seals the factor/source bundle atomically and enforces proposal/factor/publication workspace provenance; `013_entity_only_market_scenarios.sql` permits a wholly null revenue envelope for entity-only TAM/SAM/SOM; `014_interval_lineage_integrity.sql` rejects partial/status-inconsistent estimate intervals and missing source lineage; `015_numeric_domain_invariants.sql` rejects negative market/factor/price/cost values and ratio factors outside 0–1; `016_catalog_privacy_and_finite_numeric.sql` makes the catalog view fail closed for guarded/inactive/non-allowed rows and adds four finite-number checks; `017_opportunity_snapshot_invariants.sql` guards Opportunity target uniqueness, immutable snapshot lineage, and runtime link privileges; and `018_release_safe_read_boundary.sql` adds five canonical release-safe projections while redefining seven downstream views. The source-tree target is therefore 90 public base tables and 17 views. The isolated initial/full-reapply harness reaches that target, and a populated clone preserves its raw fingerprint after `017`–`018`. The original populated local database remains deliberately unchanged at `016` with 90 tables/12 views.

## Universal conventions

| Concept | Contract |
|---|---|
| Entity unit | `person`, `child_person`, `household`, `establishment`, and `enterprise` are distinct; `all` is accepted only in condition-catalog contexts, not as an estimate unit. |
| Interval | Numeric intervals satisfy `low <= base <= high`. Null means unavailable; missing evidence is not encoded as zero. |
| Estimate status | An unsupported joint is `not_estimable` with null counts, an explicit reason/method, E-grade confidence, and a validation gap. |
| Denominator | `denominator_definition` states the population universe and is required wherever a factor, bridge, or estimate can be interpreted numerically. |
| Time | Business reference time uses `time_period`/reference-year fields; audit/processing time uses `timestamptz`. They are not interchangeable. |
| Provenance | Stable external keys, `data_version`, model/run IDs, source releases/evidence, formulas, content hashes, dependencies, and audit events preserve lineage. |
| JSON | `jsonb` contains structured definitions, payloads, gaps, assumptions, or versioned content. It does not relax unit/provenance requirements. |
| Identity | Actor IDs are internal UUIDs. Do not put names, emails, account IDs, contacts, addresses, or minor identities in workbench payloads. |
| Release projection | Trusted application reads of an estimate use the migration-`018` release views. For a human-unit Base below 10, they expose canonical suppression metadata but not count/share intervals, reconstructable factors, free-text value echoes, or result/dependency hashes. These views are not a hard confidentiality boundary while runtime roles retain raw-table `SELECT`. |

PostgreSQL `numeric` is returned by the Node `pg` client as a decimal string unless a caller deliberately parses it. Preserve this behavior at API boundaries where rounding would be misleading.

## Extensions to canonical Phase 1–2 records

These changes are additive; the backfill does not overwrite published values.

| Table | Added workbench fields and constraints |
|---|---|
| `pipeline_run` | `external_run_key` provides a unique stable import key. |
| `evidence` | `external_evidence_key`, `source_treatment` (`raw`, `processed`, `proxy`, `inference`), `usage_context`, 0–100 `confidence_score`, and `review_due_at`. |
| `population_cell`, `minor_population_cell`, `household_cell`, `business_cell` | Unique nullable `source_record_key` and `source_content_hash` identify immutable imported rows without changing their entity universe. Migration `014` requires every published control cell to carry at least one source-release ID. This closes an empty-lineage hole; it does not by itself prove source quality or semantic compatibility. |
| `cluster_definition` | `raw_cluster_number` preserves the fitted cluster number separately from curated labels. |
| `estimate` | Stable external key; nullable workspace; `data_layer`; approval status; supersession link; calculation/dependency hashes; publication version; creator actor. Migration `014` binds `status` to the count envelope: `not_estimable`/`suppressed` require all count values null, while `estimated`/`superseded` require a complete, non-negative, ordered Low/Base/High interval. Share values are either wholly null or complete, non-negative, and ordered. Because historical Phase 1 rows mix fractions and percentages, this legacy table intentionally has no universal share upper bound of one. |
| `estimate_component` | Component code, denominator, conditional probability, reference period, directness, dependency group, model version, adjustment reason, and metadata. |
| `confidence_assessment` | Confidence rule version, component/penalty JSON, and validation-gap review timestamp. |
| `segment_query_result` | Result/dependency hashes, cache status, and invalidation time. On insert, its estimate entity unit must equal the query's primary unit; a workspace estimate must share the query workspace, while a governed global estimate may be reused. |
| `segment_query` | Workspace and creator ownership. Its content identity is unique per workspace, including the null-safe workspace/hash boundary used only for migration compatibility. |
| `segment_condition` | `reference_year` preserves validated business reference time; `evidence_id` links the normalized condition to registered evidence. Both are part of the immutable query snapshot. |
| `market_scenario` | Workspace, pinned base query result, exact saved-segment ID/version pair, scenario hash/status, creator, and supersession link. Query/result, saved-version/pin, workspace, market-unit, and supersession-parent workspace lineage must agree. A direct parent may have only one child revision. |
| `phase2_parent_estimate` | Migration `014` requires `not_estimable` counts to be wholly null and estimated/exploratory counts to be complete, non-negative, and ordered. Its optional share envelope is all-null or complete and ordered within 0–1. An estimable row must carry a non-empty JSON source-release array. |
| `market_estimate` | Migration `003` checks enforce `SOM <= SAM <= TAM` independently for the Low, Base, and High entity and revenue columns. The nine revenue columns are all-or-none: all null for an entity-only scenario without annual-spend evidence, or all present for a complete revenue envelope. Migration `015` additionally enforces nonnegative entity values and nonnegative present revenue values; migration `016` rejects `NaN` and signed infinities without duplicating the existing ordering constraints. Revenue values cover `horizon_months`; annual spend and realized ARPU are scaled by `horizon_months/12`. |

### Estimate governance vocabulary

| Field | Values | Meaning |
|---|---|---|
| `estimate.data_layer` | `baseline`, `derived_estimate`, `user_scenario`, `proposed_revision`, `approved_version` | Separates imported evidence-backed values, calculations, user overlays, unapproved proposals, and governed releases. |
| `estimate.approval_status` | `not_required`, `pending`, `approved`, `rejected` | Publication/review state; it is independent of calculability. |
| `segment_query_result.cache_status` | `valid`, `stale`, `invalidated` | Whether a result is eligible for reuse. |
| `market_scenario.status` | `draft`, `active`, `archived`, `superseded` | Scenario lifecycle. |

## Workspace and release tables

| Table | Primary identity | Important fields and invariants |
|---|---|---|
| `workspace` | `workspace_id` UUID; unique `workspace_key` | Name, `active`/`archived`, timestamps. RLS scope root. |
| `workspace_member` | `(workspace_id, actor_id)` | Role is `owner`, `editor`, `reviewer`, `viewer`, or `worker`. This is authorization metadata; current shared-secret mode does not enforce per-member login. |
| `data_release_version` | `publication_version_id` | Optional workspace, unique label, parent release, baseline model, rationale, approver/timestamps. Status: `draft`, `approved`, `published`, `superseded`; approved-or-later rows require `approved_at`. |
| `entity_unit_bridge` | `bridge_id`; unique `bridge_code` | Explicit from/to unit, bridge type, geography/period, Low/Base/High factor, denominator, formula, evidence/model, status, confidence, gaps, version. Identity bridges must preserve the same unit. |

`entity_unit_bridge.bridge_type` is `identity`, `observed_ratio`, `decision_maker_proxy`, or `owner_operator_proxy`. Its status is `approved`, `scenario_only`, `rejected`, or `superseded`. A bridge is never implied merely because two records have similar labels.

## Segment and estimate-workbench tables

| Table | Primary identity | Important fields and invariants |
|---|---|---|
| `saved_segment` | `saved_segment_id` | Workspace, title/description, `active`/`archived`, current version, optimistic lock, creator. |
| `saved_segment_version` | `(saved_segment_id, version_no)` | Query, optional result pin before first calculation, natural language, parser version, definition hash, change reason, creator. The saved segment and query share a workspace, and a non-null pin must be a result of that same query. Calculation appends a version that pins the result; recalculation appends another version. Existing rows remain append-only. |
| `segment_condition_group` | `group_id` | Query-local tree, parent group, `AND`/`OR`/`NOT`, ordinal, enabled. Exactly one root is enforced; a foreign key keeps parent and child in one query. |
| `segment_condition` | `condition_id` | Namespace/source/operator/value, entity unit, resolution, optional canonical FK/evidence, source text, dependency group, ordinal, enabled. At most one canonical target FK may be set. |
| `estimate_dependency` | identity bigint | Estimate dependency kind/key/version/hash and role, plus optional evidence/model. Unique per estimate and versioned dependency. |
| `estimate_sensitivity_result` | identity bigint | Tested factor and resulting Low/Base/High interval, output unit, elasticity, impact rank, method. |
| `scenario_factor_override` | `(scenario_id, factor_code)` | Low/Base/High override, unit, directness, evidence/assumption, dependency group, rationale. Migration `015` makes every value nonnegative and bounds `serviceability_rate`, `attainable_share`, and any `ratio`-unit factor to 0–1; migration `016` rejects `NaN` and signed infinities. Scenario form/service boundaries preserve decimal strings rather than coercing them through binary floating point. |

Condition namespaces are `core_feature`, `domain_feature`, `dimension`, `subtype`, `archetype`, `geography`, or `custom`. Operators are `eq`, `neq`, `in`, `not_in`, `between`, `lt`, `lte`, `gt`, `gte`, `contains`, or `exists`. Resolution is `exact`, `similar`, `proxy`, `ambiguous`, `missing`, or `research_required`. Unresolved conditions cannot be silently treated as observed facts.

The database preserves the normalized Boolean tree; the calculation service gives that tree conservative meaning. Positive archetype estimate reuse requires an exact `eq`/`in` condition under an entirely conjunctive enabled path. Negative set operators and unsupported `OR`/`NOT` contexts do not invert or reuse a positive estimate. Empty enabled groups are validation errors, and unsupported expressions persist a `not_estimable` result and validation gap instead of zero.

Dependency kinds include source/evidence/cell records, archetypes/subtypes/allocations, assumptions, models, query results, unit bridges, and `other`. Dependency roles are `denominator`, `factor`, `adjustment`, `model`, `validation`, or `output`.

## Research and review tables

| Table | Primary identity | Important fields and invariants |
|---|---|---|
| `research_job` | `research_job_id` | Workspace and optional segment/query/condition/gap, question/target, provider/model/schema, immutable input payload/hash, idempotency key, status, priority, attempts, retry/error/timestamps, creator. |
| `research_job_step` | `research_job_step_id`; unique `(job, step_no)` | Step name, status, input/output hashes, errors, lifecycle timestamps. |
| `research_job_event` | identity bigint; unique `(job, sequence_no)` | Ordered event type/payload/time. Append-only. |
| `research_job_artifact` | `research_job_artifact_id` | Job/step, artifact kind, URI/hash/media type and/or structured payload, schema, validation state/errors. Append-only. |
| `proposed_revision` | `proposed_revision_id` | Target kind/key, baseline version/hash/payload, proposed hash/payload, structured delta, affected segments, expected recalculation, recommendation, status, optional materialized estimate, typed factor, and publication version, creator. The delta records denominator comparability, numeric value/interval changes, confidence change, source freshness, and computation time. Expected recalculation records affected IDs and the action that a later governed materialization would require; it is not proof that recalculation already ran. |
| `proposed_revision_evidence` | `(revision, evidence, role)` | Evidence role is `primary`, `corroborating`, `contradicting`, or `limitation`. |
| `review_item` | `review_item_id` | Exactly one proposal or posterior update, status, priority, assignee/due time, creator. |
| `review_decision` | `review_decision_id`; unique `(review, sequence_no)` | Append-only action, optional modified payload, rationale, deciding actor/time. Modified payload is required only for `modify_and_approve`. |
| `approved_research_factor` | `approved_factor_id`; unique proposal | Workspace/release/proposal/supersession links, target segment/variable, optional entity unit, denominator, geography/year, ordered numeric interval, inference/limitations, deterministic confidence score/grade/components/penalties/rule, source-bundle hash, declared `source_count` (1–32), creation `materialization_txid`, reviewer actor. Append-only. Proposal and factor must share a workspace; a workspace-scoped release must share it too, while a governed global release remains allowed. The current calculator does not consume this ledger: the release remains approved but unpublished, the corresponding `proposed_revision.materialized_estimate_id` remains null, and no count becomes estimable until a separate reviewed publication binds canonical source/release/evidence, unit, denominator, method, and estimate dependency. |
| `approved_research_factor_source` | `(approved_factor_id, source_index)` | Institution, title, original URL, publication/reference dates, access time, locator, used value, tier, cited claims, and source hash. Indexes must be exactly contiguous from 0 through `source_count - 1`. Rows may be inserted only by the factor's approving owner/reviewer in the factor-creation transaction; the bundle is sealed after that transaction and remains append-only/current-workspace visible. |

Research job statuses are `draft`, `queued`, `running`, `needs_review`, `approved`, `rejected`, `failed`, `cancelled`, and `configuration_required`. Step statuses are `queued`, `running`, `succeeded`, `failed`, `skipped`, and `retrying`. Review item statuses are `pending`, `in_review`, `approved`, `rejected`, `changes_requested`, and `closed`.

Database review actions are `approve`, `modify_and_approve`, `reject`, `request_more_research`, and `keep_existing`. The UI names the two translated actions `approve_modified` and `keep_baseline` before mapping them to the database vocabulary.

`proposed_revision.status` is `draft`, `pending_review`, `approved`, `rejected`, or `superseded`. Approved/superseded proposals require an `approved_publication_version_id`; this is the version boundary that prevents an AI result from masquerading as an already-published baseline row. A numeric reviewed proposal may also point to an `approved_research_factor` in the same workspace. The reverse proposal-to-factor pointer is protected by the same workspace composite key. The typed factor and its exact source set commit as one snapshot; it is not an estimate count and not a published baseline replacement.

## Comparison tables

| Table | Primary identity | Important fields and invariants |
|---|---|---|
| `comparison_workspace` | `comparison_id` | Workspace, name, `draft`/`saved`/`archived`, version, creator. |
| `comparison_member` | `comparison_member_id` | Position 1–5, pinned query result, optional uniquely selected market estimate, label and normalized metrics. A comparison has at most five unique results. The normalized disclosure preserves active-scenario count and, when unique, scenario ID/name/version/horizon plus annual spend; multiple active scenarios leave market metrics unavailable with an explicit-selection reason rather than selecting the latest row. |

Comparison members retain their own `primary_entity_unit`. The UI/repository groups unlike units; it must not normalize or add them without an approved bridge.

## Opportunity tables

| Table | Primary identity | Important fields and invariants |
|---|---|---|
| `opportunity_board` | `opportunity_board_id` | Workspace, name/description, `active`/`archived`, creator. |
| `opportunity` | `opportunity_id` | Board, problem/hypothesis/idea, optional revenue/price interval/currency, channels/alternatives/assumptions, next experiment, status, optimistic-lock counter, creator. A partial price interval is rejected; migration `015` rejects negative present price values and `016` rejects non-finite present price values. The edit form submits the expected counter; the service locks, compares, and performs a conditional incrementing update, so a missing or stale version fails closed. |
| `opportunity_segment_link` | `opportunity_segment_link_id` | Pinned query result and optional saved-segment version/market estimate; role is `primary_target`, `secondary_target`, `comparison`, or `evidence`. Migration `017` allows at most one primary target, requires board/query/saved-segment/result/scenario workspace and lineage agreement, and makes primary-target links append-only. A legacy saved version with `pinned_result_id IS NULL` is accepted only when the immutable link result belongs to the same saved query; a non-null pin must match exactly. The app may insert links, while app update/delete and all worker mutations are revoked. |
| `opportunity_score_version` | `(opportunity_id, version_no)` | Append-only overall 0–100 score, formula version, weights, creator. |
| `opportunity_score_component` | `(opportunity_id, score_version_no, metric_code)` | Append-only raw value/unit, normalized score, weight, exact weighted score, source kind/key, formula. |
| `opportunity_content_version` | UUID; unique `(opportunity, content_key, version_no)` | Append-only content JSON, content/source type, pinned query/estimate/subtype/archetype sources, provider model, creator. |
| `opportunity_experiment` | `opportunity_experiment_id` | Hypothesis/method/metric/success criteria, optional cost interval/currency, status/result and lifecycle times. Migration `015` rejects negative present cost values and `016` rejects non-finite present cost values. |

Opportunity status is `discovered`, `researching`, `validating`, `planned`, `paused`, `rejected`, or `archived`. Experiment status is `draft`, `planned`, `running`, `completed`, or `cancelled`. Content type is `note`, `hypothesis`, `idea_brief`, `value_proposition`, `message`, `interview_guide`, or `risk`; source kind is `user`, `ai_hypothesis`, or `derived`. AI content therefore remains explicitly labeled as a hypothesis.

Score component source kind is `data`, `user_input`, `ai_hypothesis`, or `derived`. The database checks `weighted_score = normalized_score * weight` within `0.0001`.

The service requires the exact nine registered metrics and a weight sum of one before inserting a score version. Migration `015` deliberately does not add a deferred bundle-completeness trigger because score components are inserted incrementally; database-level exactly-nine/weight-sum enforcement remains a future transaction-design task.

## Audit and import tables

| Table | Primary identity | Important fields and invariants |
|---|---|---|
| `audit_event` | identity bigint | Optional workspace/actor, aggregate type/key/action, before/after/diff JSON, request/correlation/transaction IDs, occurrence time. Append-only. |
| `baseline_import_manifest` | `import_key` | Source URI and semantic SHA-256, model version, table counts, verification JSON, import/verification times. Used to reject source drift and make identical imports a verified no-op. |

Migration `006` adds `validation_gap_estimate_lineage_idx` and `validation_gap_archetype_lineage_idx` for gap enrichment, `estimate_updated_page_idx` and `estimate_status_updated_page_idx` for bounded estimate pages, and `subtype_allocation_subtype_count_idx` for reverse subtype lineage. They change access paths, not data semantics.

The database forbids update/delete on `audit_event`, `research_job_event`, `review_decision`, `saved_segment_version`, `opportunity_score_version`, `opportunity_score_component`, `opportunity_content_version`, and `research_job_artifact`. Corrections must be appended as a new event/version/decision.

## Read models

All 17 source-tree views use `security_invoker = true`. They are ordinary views over normalized records; they contain no hard-coded demo counts. Migration `018` adds five canonical release projections and rewrites the downstream estimate-bearing views to consume them. The isolated migration harness proves 90 tables/17 views; the original populated database is still at the pre-`018` 90/12 shape.

| View | Consumer contract |
|---|---|
| `v_domain_dimension_value` | Expands each domain dimension's allowed JSON values into ordered rows. |
| `v_condition_catalog` | Unified features, domain features, dimension values, behaviors, tags, subtypes, archetypes, and geographies with 14 columns and `security_invoker=true`. Migration `016` preserves 4,005 total rows for browse/audit but projects 105 guarded DOM-17 rows and 80 `child_person` archetypes as `minor_protected` and non-queryable, leaving 3,820 queryable rows. Migration `018` additionally makes protected core features non-queryable even if a raw queryable flag is true and evaluates domain-feature queryability against the effective guarded sensitivity class. Inactive-domain rows, `not_allowed` behaviors, deprecated archetypes, and expired geographies also fail closed. Source rows are not rewritten. |
| `v_estimate_release_boundary` | Canonical estimate envelope for trusted application reads. Existing suppressed rows and human-unit rows with raw Base below 10 are normalized to `status=suppressed`, null count/share intervals and hashes/keys, canonical denominator/formula/method/precision, and explicit threshold/reason/policy metadata. Business units and Base=10 are unchanged. |
| `v_estimate_component_release_boundary` | Estimate components with numeric values, conditional probability, value-bearing codes/text, and metadata redacted or canonicalized when the parent estimate is release-suppressed. Safe evidence/model identifiers remain for nonnumeric lineage. |
| `v_estimate_assumption_release_boundary` | Estimate-linked assumptions with values, units, codes, and value-bearing prose withheld or canonicalized for a release-suppressed parent. |
| `v_estimate_sensitivity_release_boundary` | Tested/output intervals, elasticity, factor identifiers, and value-bearing sensitivity prose withheld or canonicalized for a release-suppressed parent. |
| `v_segment_query_result_release_boundary` | Query results with a value-free canonical `result_summary` and null result/dependency hashes when their estimate is release-suppressed. |
| `v_explorer_domain_summary` | Domain/category, unit, feature/model/source/confidence coverage. Whole-domain counts are deliberately `not_estimable` without parent context. |
| `v_subtype_explorer_detail` | Subtype/model/cluster/profile/activation/confidence/allocation detail. Absolute subtype count remains null until parent context is supplied. |
| `v_archetype_search` | Archetype definitions, rules/profile/representative, latest approved baseline estimate, release-safe interval/confidence, and gap count. |
| `v_estimate_lineage` | Release-safe estimate envelope: interval, unit, denominator, period/geography, method, model/run, components, assumptions, confidence, gaps, dependencies, sources. For a suppressed estimate, value-bearing confidence rationale/components, gap narrative, dependency keys/hashes, and evidence locator are also null or canonicalized. |
| `v_saved_segment_latest` | Current saved-segment definition plus its release-safe pinned result and estimate. A legacy unpinned version falls back only to the latest non-invalidated result; migration `010` backfills current calculable heads by appending a pinned version. |
| `v_research_review_queue` | Job, latest artifact, proposal, and review status in one queue row. |
| `v_comparison_detail` | Pinned release-safe segment/estimate/market values for ordered comparison members. A market estimate is exposed only when its scenario uses the member's pinned query result; suppressed or mismatched lineage fails closed with an unavailable reason. |
| `v_opportunity_snapshot` | Opportunity with release-safe immutable segment snapshots, latest score/content, and experiment counts. AI/derived content tied to a suppressed estimate is redacted; an unresolved source classification fails closed instead of being treated as safe. |
| `v_source_evidence_lineage` | Source/release metadata, evidence items, and estimate-use count. |
| `v_global_search` | Route-ready domains, axes, core/domain features, behaviors, subtypes, archetypes, release-safe visible estimates, workspace segments, and opportunities. |

These projections are the canonical **trusted-application** interface used by repositories and exports. They are defense in depth, not row secrecy from arbitrary SQL: `market_engine_app` and `market_engine_worker` still have broad `SELECT` on canonical/workbench tables. Production must either keep SQL access restricted to reviewed repository code or introduce a narrower database role/view-only grant boundary before claiming hard confidentiality.

Subtype/allocation detail is a separate residual. The current `subtype_allocation` population contains zero `person`, `child_person`, or `household` rows with Base below 10, but catalog detail still reads the raw allocation table. A future rare human allocation must gain a release-safe projection and repository switch before exposure. Also, no direct evidence-backed axis-to-subtype relationship is stored; axes and subtypes are separate model/provenance layers and must not be rendered as a measured direct mapping.

## Row-level security and runtime roles

RLS is enabled on the workspace/member/release tables; workspace-aware estimates and scenarios; query/group/condition snapshots; their component/dependency/sensitivity/confidence/gap/query-result/market children; saved segment versions; all research/review and approved-factor/source records; comparisons; opportunity records; and audit events. Direct child policies verify workspace ownership through their parent. Global baseline rows with nullable workspace may be read deliberately, but runtime roles cannot update/delete them or add child lineage to them. Runtime roles cannot insert/update/delete workspace or workspace-member provisioning rows.

`estimate_assumption` is intentionally read-only for runtime roles because no runtime-derived assumption-link writer exists; a future writer requires a reviewed parent-owned INSERT policy and regression test. `validation_gap` rows with `estimate_id IS NULL` are shared only as archetype-level known-gap taxonomy. Runtime INSERT requires a non-null current-workspace derived estimate, so the app cannot create global gaps. Segment query/condition rows are workspace-owned and append-only; query-result payloads are immutable, with app updates restricted to `cache_status` and `invalidated_at` for a current-workspace result. The valid-cache partial unique index permits immutable invalidated history and exactly one current valid result for the same query/model/result hash. Migration `011` also validates the query/result estimate unit and workspace root, the saved-version result pin, and every scenario lineage root at insert. Scenario payload rows are revisioned: update/delete is denied except for the one-way prior-row status transition from `draft`/`active` to `superseded` after a child revision is inserted. Migration `012` withholds factor/source mutation from the worker, lets only the approving owner/reviewer assemble the declared source set in the creation transaction, validates the complete contiguous set at deferred commit, and rejects later child appends. Migration `013` leaves scenario immutability/RLS unchanged while enforcing the revenue all-or-none check. Migration `014` adds check constraints to close SQL `UNKNOWN` cases caused by partial NULL intervals and to reject missing lineage arrays. Migration `015` adds five validated numeric-domain checks. Migration `016` replaces only the catalog projection and adds four validated finite-number checks. Migration `017` adds Opportunity preflight/insert guards, primary-target uniqueness/append-only triggers, and tighter runtime link privileges without a table or view. Migration `018` adds five views and replaces seven existing projections after a fail-closed interval/catalog preflight; it changes no base row. Neither migration has been applied to the original populated local database.

The `011` existing-data audit is deliberately non-mutating. Any non-fixture lineage violation aborts migration. On the populated local database it found 0 production-scope violations and emitted count-bearing PostgreSQL `WARNING` messages for exactly 7 legacy query-result fixtures and 6 legacy scenario fixtures marked `security-fixture-v1`. They were not repaired, deleted, or exempted by the triggers that guard every new insert. Migration `012` similarly aborts if an existing factor has an incomplete/non-contiguous source set or cross-workspace proposal/publication lineage; it does not silently repair those records.

`market_engine_app` and `market_engine_worker` are `NOLOGIN`, non-superuser, non-owner privilege roles:

| Capability | App | Worker |
|---|:---:|:---:|
| Select canonical/workbench tables | yes | yes |
| Append workspace-derived estimate/scenario snapshots; manage segments, comparisons, opportunities | yes | no |
| Create/update jobs, proposals, and review items | yes | yes |
| Append job events/artifacts | yes | yes |
| Append review decisions and approved release rows | yes | no |
| Own schema, bypass RLS, create DB/roles | no | no |

Production credential roles must be provisioned separately, must not own the tables, and must set a valid workspace transaction context. See `docs/20_workbench_operations.md`.

The broad table-selection capability in this matrix is an explicit residual: migration `018` does not revoke it. Its release views protect the reviewed server repository/export path, not an arbitrary-SQL client using either runtime role.

## Verified baseline snapshot

The checked-in `reports/phase3_postgres_backfill_manifest.md` records a successful real PostgreSQL import with these required counts:

| Metric | Count |
|---|---:|
| Domains | 24 |
| Domain axes | 384 |
| Domain features | 480 |
| Behavior templates | 240 |
| Selected segmentation models | 24 |
| Primary subtypes | 90 |
| Parent allocations | 450 |
| Archetypes | 1,440 |
| Activation JSON payloads | 90 |

These are verification expectations for the current `kr-v0.2.1` baseline, not magic UI defaults. A future version must publish a new manifest and reconcile its own expected counts.
