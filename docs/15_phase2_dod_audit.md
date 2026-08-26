# Phase 2 Definition of Done audit

Audit time: 2026-08-25 02:08 KST  
Model version: `kr-v0.2.1`  
Historical result recorded at that time: **30/30 passed**  
Current evidence status (2026-08-25): **29 passed / 0 failed / 1 unavailable; this historical certificate is superseded**

This document preserves the original Phase 2 implementation checkpoint rather than rewriting its historical result. It is not the current completion certificate. The live verifier can still establish the implementation/data inventory but cannot establish item 2's historical direct-acquisition execution provenance from present artifacts; it therefore reports that item `unavailable` and the aggregate 29/0/1. Existing shards, checksums, counts, and a runnable fetch path do not prove who originally supplied or executed the acquisition. Nemotron personas and their narratives remain synthetic hypotheses. Required parent cases 2–10 and semantic cross-domain overlays are E-grade scenarios until an external probability sample measures those exact joints.

## Reproducible gate results

| Gate | Result |
|---|---|
| `.venv/bin/pytest` | 18 passed; one third-party Starlette/httpx deprecation warning |
| `.venv/bin/market-engine validate` | 46/46 integrity checks passed; 24 segmentation artifacts validated |
| Phase 1 acceptance/scenarios | 20/20 acceptance queries and 3/3 TAM/SAM/SOM scenarios |
| Phase 2 acceptance | 24/24 domain, 10/10 parent, 10/10 cross-domain; 90/90 activation payloads validate against Draft 2020-12 |
| PostgreSQL integration | Phase 1 30 tables; additive total 58; `002` reapplication idempotent |
| Parent reconciliation | maximum Base share error `2.22e-16`; maximum child/parent Base count relative error `2.13e-16` |
| Required semantic-parent reconciliation | ten cases, 47 allocations; maximum Base share error `2.22e-16` |

## Itemized audit

| # | Status | Requirement and current evidence |
|---:|:---:|---|
| 1 | PASS | Phase 1 remains in `data/processed/market_engine.duckdb`; the additive copy still contains all 1,440 Phase 1 archetypes. The combined 18-test suite and the original 20-query/3-scenario suites pass. |
| 2 | HISTORICAL PASS / CURRENTLY UNAVAILABLE | The original audit recorded direct acquisition without a user-provided file. Current artifacts establish dataset/version/license and nine local shards totaling 1,000,000 unique rows, but they do not independently establish who performed or supplied the historical acquisition. The live verifier therefore treats this evidence item as unavailable. |
| 3 | PASS | Raw shards are under `data/raw/nemotron/`; the calibrated canonical mart is `data/processed/nemotron_feature_mart.parquet`. Nine shard SHA-256 values and the release checksum are stored in `config/nemotron_manifest.yml` and `config/sources.yml`. |
| 4 | PASS | `domain_registry` has 24 active domains, inside the required 18–25 range, mapped to Phase 1 categories and all mandatory areas. Export: `data/exports/phase2_domains.csv`. |
| 5 | PASS | `domain_dimension` has 384 rows: exactly 16 applicability decisions for each of 24 domains. |
| 6 | PASS | Every domain has 20 queryable features, 10 behavior templates, 20–40 feature-source links, entity/decision unit metadata, tags, and taxonomy. |
| 7 | PASS | Music/audio, dining, travel, education, housing, finance, content, pets, and small business are among all 24 domains meeting the depth floor: 20 features, 10 behaviors, eight tags, and eight reusable Level-2 archetypes each. Numeric evidence limits remain explicit. |
| 8 | PASS | No domain uses plain `complete`; all 24 use `complete_with_evidence_constraints`. Domain acceptance queries require domain axes, not demographic-only predicates. |
| 9 | PASS | `latent_dimension`, `segmentation_model`, `cluster_definition`, and `cluster_representative` are materialized. There are 24 revisioned models, 90 clusters/subtypes, and five representatives per cluster. |
| 10 | PASS | `music_audio` and `small_business_digital` exist in DuckDB/Parquet/CSV, v2 REST endpoints, CLI commands, profiles, creative briefs, and integration tests. `ARC-06-001` is reconciled end to end. |
| 11 | PASS | `scripts/test_postgres.sh` created Phase 1's 30 tables, applied additive migration `002` to reach 58, checked Phase 1 table preservation, and reapplied `002` without changing the count. |
| 12 | PASS | `parent_decomposition_decision` contains one decision for every one of 1,440 Phase 1 parents. |
| 13 | PASS | All 120 eligible parents are materialized; each has 3–6 primary allocations. Non-eligible parents retain explicit decisions instead of invented counts. |
| 14 | PASS | Across all 120 eligible parents and 450 allocations, Base shares sum to one with maximum error `2.22e-16`; child Base counts reconcile to parent Base within `2.13e-16` relative error. |
| 15 | PASS | Eight overlapping motive/behavior tags per domain and 720 subtype-tag allocations are stored separately. Service responses mark them non-additive and prohibit summing tag shares as population. |
| 16 | PASS | All 90 subtypes persist ordered Low/Base/High prevalence, denominator context, effective sample size, and entity unit; combined validation found zero missing or invalid intervals. |
| 17 | PASS | All 90 `subtype_confidence` rows persist separate population, interpretation, and targetability scores and grades. |
| 18 | PASS | All 90 profiles persist observed evidence, assumptions, inferred profile, prohibited inferences, confidence gaps, and a validation plan. Exports preserve these distinctions. |
| 19 | PASS | All 90 active subtypes have an `activation_mapping`; every payload includes target definition, inferred attributes, modes, messages, offers, channels, evidence, prohibited uses, and experiments. |
| 20 | PASS | One domain-specific end-to-end acceptance case passed for every active domain: 24/24. |
| 21 | PASS | Ten exact semantic parent definitions (`PARENT-01`–`PARENT-10`) passed and reconcile over 47 subtype allocations. Cases 2–10 disclose E-grade scenario parent prevalence. |
| 22 | PASS | Ten required cross-domain cases (`CROSS-01`–`CROSS-10`) passed. All ten return an explicit exploratory estimate with unit, interval, joint support, bridge, assumptions, and low confidence. |
| 23 | PASS | `domain_association` contains all 276 domain pairs: 163 measured/proxied same-output-unit joints and 113 guarded cross-unit pairs. Stored methods, joint support, ESS, lift, uncertainty, and caveats show that no result uses an unobserved independent-marginal product. |
| 24 | PASS | `contracts/phase2_activation_payload.schema.json` is a Draft 2020-12 contract; all 90 stored payloads pass `jsonschema` validation. Creative-brief CLI/API paths return a guarded, experiment-ready brief. |
| 25 | PASS | One aggregate observation and one conservative beta-binomial posterior update executed. The update is `held_for_review`, records transport bias, and leaves the published model unchanged. |
| 26 | PASS | Registry, taxonomy, features, behaviors, models, subtypes, allocations, confidence/gaps, profiles, activation, associations, and acceptance results export to 12 CSV, three JSONL, one registry JSON, and 28 table Parquet artifacts. |
| 27 | PASS | `reports/domain_coverage_matrix.md` and `reports/cross_domain_association_report.md` are generated from current DB rows. Model cards and the Phase 2 summary are also present. |
| 28 | PASS | Unit, integration, acceptance, reconciliation, privacy, artifact-checksum, domain-coverage, feedback, API/CLI, and PostgreSQL migration checks pass: pytest 18/18 and combined validation 46/46. |
| 29 | PASS | `README.md`, `docs/12_phase2_api_cli.md`, and `docs/13_phase2_operations_retraining.md` document installation/build, domain addition, forced reclustering, same-/mixed-unit cross queries, activation, feedback update, validation, promotion, and rollback. |
| 30 | PASS | Phase 2 tables contain executable rows rather than schema-only placeholders; all v2 endpoints/CLI operations invoke services and are exercised by acceptance/integration tests. A repository scan found no Phase 2 TODO/FIXME/stub; the only bare `pass` is the intentionally empty `QueryValidationError` exception class. Evidence-poor quantities are explicit E-grade scenarios or `not_estimable`, never placeholder zeroes. |

## Current materialized inventory

- 24 domains; 384 common-axis decisions; 480 queryable features; 760 feature-source links.
- 240 behavior templates; 192 non-additive tags; 192 reusable Level-2 archetypes.
- 24 models; 90 primary subtypes; 450 representative personas; 24 embedding caches, model artifacts, and membership artifacts with checksums.
- 1,440 all-parent decisions; 120 eligible/materialized parents; 450 parent allocations.
- 10 exact semantic parent cases with 47 allocations; 276 cross-domain association rows.
- 90 subtype profiles, confidence rows, and activation mappings; 720 tag allocations.

## Five representative parent results

The row shown for each parent is its largest Base-share subtype, not the complete decomposition. Counts are Low/Base/High in the parent's entity unit.

| Parent | Top subtype | Share L/B/H | Count L/B/H | Confidence P/I/T |
|---|---|---:|---:|---|
| PARENT-01, website-less restaurant owner/business in their 60s | `DOM-24-SUB-04` succession-oriented small-business operations | 42.3% / 56.0% / 69.8% | 54,973 / 95,237 / 146,490 enterprises | D / D / E |
| PARENT-02, Seoul-capital dual-income household with primary-school child | `DOM-16-SUB-03` self-efficacy-oriented education | 31.6% / 44.1% / 56.6% | 85,725 / 239,036 / 562,141 households | E / D / E |
| PARENT-03, pet household with frequent domestic travel, age 30–49 | `DOM-13-SUB-01` companion-relationship pet care | 37.6% / 56.8% / 76.0% | 25,955 / 130,673 / 437,075 households | E / D / E |
| PARENT-04, local food retailer under five staff without online sales | `DOM-24-SUB-04` succession-oriented small-business operations | 42.3% / 56.0% / 69.8% | 3,231 / 17,125 / 63,974 enterprises | E / D / E |
| PARENT-05, dissatisfied private-education household with middle-school child | `DOM-16-SUB-03` self-efficacy-oriented education | 64.8% / 79.7% / 94.7% | 43,918 / 216,112 / 598,622 households | E / D / E |

## Limits that remain after the historical implementation checkpoint

- Nemotron is a synthetic persona corpus. Cluster prevalence and behavioral interpretations are hypotheses for testing, not a probability sample of Korean consumers.
- Minimum combined cluster stability is `0.169`; low-stability models remain exploratory with reduced interpretation confidence and validation experiments rather than being promoted as high-confidence segments.
- Required parent cases 2–10 have exact semantic definitions but use wide E-grade scenario prevalence because official sources do not publish those exact joints.
- Mixed-unit cross-domain estimates use an explicit adult decision-maker or owner/operator proxy plus an official output-unit denominator. They do not assert that one person equals one household or enterprise.
- The website-less restaurant slice uses published owner-60+ and digital-system evidence, an age 60–69 proxy, and a website-absence scenario because the exact owner-age × own-website joint is not observed.

These are disclosed validation gaps, not zero values. Derived human-unit outputs below the release threshold are now suppressed in the Python estimator and web calculation snapshots; that control does not rewrite official direct controls or apply to business units. The current full-goal boundary remains open for a genuine independent holdout, broader regional and joint-distribution evidence, truthful-purpose authorization, the unavailable historical acquisition-provenance item, and the separately authorized live Research review/materialization path. External probability surveys, randomized experiments, and aggregate outcome data are the recommended next evidence cycle.
