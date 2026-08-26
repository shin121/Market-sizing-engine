# Phase 3 baseline verification

Generated: 2026-08-25T10:45:04.769315+00:00
Result: **FAILED**

This report re-verifies the immutable Phase 1–2 production baseline before Phase 3–7 web-app changes.
The Phase 2 DoD result is calculated live; `reports/phase2_dod_audit.json` is not an input.

| Check | Expected | Actual | Status |
|---|---:|---:|:---:|
| Phase 2 DoD | 30 | 29 passed, 0 failed, 1 unavailable | FAIL |
| Existing pytest | >=18 | 58 | PASS |
| Combined validation | 46 | 46 | PASS |
| PostgreSQL tables | 58 | 58 | PASS |
| Nemotron rows | 1,000,000 | 1,000,000 | PASS |
| Fixed shards | 9 | 9 | PASS |
| Domain | 24 | 24 | PASS |
| Axis | 384 | 384 | PASS |
| Feature | 480 | 480 | PASS |
| Behavior | 240 | 240 | PASS |
| Segmentation model | 24 | 24 | PASS |
| Primary subtype | 90 | 90 | PASS |
| Parent allocation | 450 | 450 | PASS |
| Phase 1 archetype | 1,440 | 1,440 | PASS |
| Activation JSON | 90 | 90 | PASS |

## Reconciliation

- Maximum parent Base-share error: `2.2204460492503131e-16` (limit `0.001`).
- Maximum parent/child Base-count relative error: `2.1284771478206205e-16` (limit `0.005`).
- Existing rows and model versions were read only; this verifier performs no baseline mutation.

## Live Phase 2 Definition of Done

| # | Requirement | Status | Deterministic proof details |
|---:|---|:---:|---|
| 1 | Phase 1 engine and tests preserved | PASSED | phase1_tables_present=PASSED; phase1_canonical_rows_preserved=PASSED; phase1_pipeline_semantics_preserved=PASSED (run IDs/timestamps are intentionally excluded from the live semantic comparison); phase1_archetypes=PASSED; phase1_acceptance_payload=PASSED; phase1_market_scenarios=PASSED; current_python_test_suite=PASSED |
| 2 | Nemotron accessed without user file provision | UNAVAILABLE | pinned_public_dataset=PASSED; registered_remote_source=PASSED; no_user_file_fetch_path=PASSED; direct_acquisition_execution=UNAVAILABLE (current files, manifests, and a no-input fetch script cannot establish who supplied the historical files; no acquisition execution result was supplied) |
| 3 | Raw/canonical revision and checksums stored | PASSED | manifest_revision=PASSED; nine_raw_shards_present=PASSED; current_shard_checksum_command=PASSED; nine_shard_checksums_match=PASSED; raw_rows_unique=PASSED; canonical_mart=PASSED; registered_release_checksum=PASSED |
| 4 | 18–25 domains and required-area mapping | PASSED | active_domain_count=PASSED; mandatory_domain_mapping=PASSED; phase1_category_mapping=PASSED |
| 5 | All domains have 16 common-axis decisions | PASSED | sixteen_axis_decisions_per_domain=PASSED |
| 6 | All domains have taxonomy, features, behaviors, and source maps | PASSED | domain_taxonomy_depth=PASSED |
| 7 | Every domain meets minimum depth or an explicit evidence constraint | PASSED | minimum_depth_and_evidence_boundary=PASSED |
| 8 | No demographic-only domain is marked complete | PASSED | no_plain_complete_domain=PASSED; domain_axis_acceptance_queries=PASSED |
| 9 | Latent dimensions and segmentation model registry exist | PASSED | one_selected_model_per_domain=PASSED; single_model_version=PASSED; latent_dimension_per_domain=PASSED; model_search_and_fixed_seeds=PASSED; model_artifact_checksums=PASSED; clusters_and_subtypes=PASSED; five_representatives_per_cluster=PASSED |
| 10 | Music/audio and small-business vertical slices work | PASSED | vertical_slice_rows=PASSED; rest_and_cli_paths=PASSED; vertical_slice_integration_coverage=PASSED; executed_vertical_slice_test_suite=PASSED |
| 11 | Additive migration passes clean/existing/idempotent paths | PASSED | postgres_migration_test=PASSED; postgres_clean_additive_idempotent=PASSED |
| 12 | Eligibility is stored for every Phase 1 parent | PASSED | decision_set_matches_phase1_parents=PASSED; decision_lineage_complete=PASSED |
| 13 | Eligible parents have 3–8 primary subtypes or an exception | PASSED | eligible_parent_count=PASSED; three_to_eight_primary_allocations=PASSED |
| 14 | Primary Base allocations reconcile to parents | PASSED | base_share_reconciliation=PASSED; base_count_reconciliation=PASSED; allocation_intervals_ordered=PASSED |
| 15 | Overlapping tags are separate and non-additive | PASSED | non_additive_tag_registry=PASSED; separate_tag_allocations=PASSED |
| 16 | Every subtype has Low/Base/High and an explicit unit | PASSED | subtype_interval_and_unit=PASSED |
| 17 | Every subtype has three confidence assessments | PASSED | three_confidence_dimensions=PASSED |
| 18 | Every subtype has evidence, assumptions, gaps, and disclosure | PASSED | profile_evidence_disclosure=PASSED |
| 19 | Every active subtype has an activation profile | PASSED | activation_profile_per_subtype=PASSED; activation_payload_schema=PASSED; activation_guard_fields=PASSED |
| 20 | At least one end-to-end acceptance case passes per domain | PASSED | domain_acceptance_per_active_domain=PASSED; acceptance_report_matches_db=PASSED |
| 21 | At least ten parent decomposition acceptance cases pass | PASSED | required_parent_case_count=PASSED; parent_case_intervals_and_disclosure=PASSED; parent_case_reconciliation=PASSED; parent_acceptance_rows=PASSED |
| 22 | At least ten cross-domain acceptance cases pass safely | PASSED | cross_domain_acceptance=PASSED |
| 23 | Cross-domain joint support and dependence assumptions are stored | PASSED | complete_guarded_pair_registry=PASSED |
| 24 | Activation contract and creative brief work | PASSED | draft_2020_12_schema=PASSED; all_activation_payloads_validate=PASSED; creative_brief_payloads=PASSED; creative_brief_api_cli=PASSED; executed_creative_brief_test_suite=PASSED |
| 25 | Aggregate observation and posterior example executed safely | PASSED | aggregate_posterior_rows=PASSED; acceptance_feedback_matches_db=PASSED |
| 26 | Required machine-readable Phase 2 exports exist | PASSED | declared_exports_present=PASSED; exports_machine_readable=PASSED; parquet_snapshots_match_current_tables=PASSED; domain_registry_json_matches_db=PASSED |
| 27 | Coverage and association reports match current rows | PASSED | coverage_report_matches_current_rows=PASSED; association_report_matches_current_rows=PASSED |
| 28 | Required test and validation classes pass | PASSED | full_python_test_suite=PASSED; combined_model_validation_command=PASSED; combined_validation_payload=PASSED; artifact_checksum_command=PASSED; postgres_migration_test=PASSED |
| 29 | Operator documentation covers required workflows | PASSED | operator_documents_present=PASSED; required_workflows_documented=PASSED |
| 30 | No placeholder-only Phase 2 feature or data remains | PASSED | no_stub_markers=PASSED; all_phase2_tables_materialized=PASSED; missing_evidence_not_zero=PASSED; exploratory_values_disclosed=PASSED; service_paths_exercised=PASSED; executed_phase2_implementation_tests=PASSED |
