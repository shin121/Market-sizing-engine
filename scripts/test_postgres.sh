#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
cluster="$project_root/data/local/postgres"
socket_dir="$project_root/data/local/socket"
log="$project_root/data/local/postgres.log"
port="55432"
database="market_engine_migration_test"

mkdir -p "$socket_dir"
if [[ ! -f "$cluster/PG_VERSION" ]]; then
  mkdir -p "$cluster"
  initdb -D "$cluster" --no-locale --encoding=UTF8 --auth=trust
fi
started_here=0
if ! pg_isready -h "$socket_dir" -p "$port" >/dev/null 2>&1; then
  pg_ctl -D "$cluster" -l "$log" -o "-p $port -k $socket_dir" start
  started_here=1
fi
cleanup() {
  if [[ "$started_here" == "1" ]]; then
    pg_ctl -D "$cluster" stop -m fast >/dev/null
  fi
}
trap cleanup EXIT
dropdb --if-exists -h "$socket_dir" -p "$port" "$database"
createdb -h "$socket_dir" -p "$port" "$database"
psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" -f "$project_root/migrations/001_core.sql" >/dev/null
phase1_table_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")"
if [[ "$phase1_table_count" != "30" ]]; then
  echo "expected 30 Phase 1 public tables, found $phase1_table_count" >&2
  exit 1
fi
phase1_signature="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT md5(string_agg(table_name, ',' ORDER BY table_name)) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")"
psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" -f "$project_root/migrations/002_phase2_domains_subtypes.sql" >/dev/null
table_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")"
if [[ "$table_count" != "58" ]]; then
  echo "expected 58 additive public tables, found $table_count" >&2
  exit 1
fi
preserved_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('model_version','pipeline_run','data_source','source_release','category','archetype','estimate','segment_query','market_estimate');")"
if [[ "$preserved_count" != "9" ]]; then
  echo "Phase 1 preservation check failed" >&2
  exit 1
fi
# The additive migration is deliberately re-runnable on an existing Phase 1+2 database.
psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" -f "$project_root/migrations/002_phase2_domains_subtypes.sql" >/dev/null
table_count_after_reapply="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")"
if [[ "$table_count_after_reapply" != "$table_count" ]]; then
  echo "Phase 2 migration is not idempotent" >&2
  exit 1
fi

for migration in 003_workbench.sql 004_workbench_read_models.sql 005_workbench_operations.sql 006_workbench_performance.sql 007_workbench_governance_hardening.sql 008_requirement_completion_hardening.sql 009_approved_research_factor.sql 010_reproducible_workbench_snapshots.sql 011_lineage_integrity_guards.sql 012_approved_research_factor_snapshot_hardening.sql 013_entity_only_market_scenarios.sql 014_interval_lineage_integrity.sql 015_numeric_domain_invariants.sql 016_catalog_privacy_and_finite_numeric.sql 017_opportunity_snapshot_invariants.sql 018_release_safe_read_boundary.sql; do
  psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" -f "$project_root/migrations/$migration" >/dev/null
done
for migration in 019_phase2r_a_production_foundation.sql 020_phase2r_a_production_invariants.sql; do
  psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" -f "$project_root/migrations/$migration" >/dev/null
done
phase2r_production_table_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='production' AND table_type='BASE TABLE';")"
phase2r_production_view_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.views WHERE table_schema='production';")"
phase2r_invariant_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_constraint WHERE convalidated AND (conrelid,conname) IN (('production.universe_observation'::regclass,'universe_observation_grade_confidence_chk'),('production.domain_universe_mapping'::regclass,'domain_universe_mapping_grade_confidence_chk'),('production.saved_segment'::regclass,'production_saved_segment_fixture_title_chk')); ")"
if [[ "$phase2r_production_table_count" != "9" || "$phase2r_production_view_count" != "8" || "$phase2r_invariant_count" != "3" ]]; then
  echo "expected Phase 2R-A production schema 9 tables/8 views/3 validated invariants, found $phase2r_production_table_count/$phase2r_production_view_count/$phase2r_invariant_count" >&2
  exit 1
fi
for migration in 021_phase2r_b_calibrated_market_mart.sql 022_phase2r_b_production_invariants.sql 023_phase3r_7r_workbench_read_models.sql 024_phase3r_weighted_joint_read_model.sql; do
  psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" -f "$project_root/migrations/$migration" >/dev/null
done
phase3r_production_table_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='production' AND table_type='BASE TABLE';")"
phase3r_production_view_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.views WHERE table_schema='production';")"
weighted_read_model_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='production' AND relation.relname IN ('calibration_dimension_catalog','weighted_joint_cell','v_weighted_joint_cell','v_workbench_condition_catalog');")"
weighted_security_invoker_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='production' AND relation.relname IN ('v_weighted_joint_cell','v_workbench_condition_catalog') AND relation.relkind='v' AND coalesce(relation.reloptions,ARRAY[]::text[]) @> ARRAY['security_invoker=true'];")"
weighted_runtime_select_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee IN ('market_engine_app','market_engine_worker') AND table_schema='production' AND table_name IN ('calibration_dimension_catalog','weighted_joint_cell','v_weighted_joint_cell','v_workbench_condition_catalog') AND privilege_type='SELECT';")"
weighted_runtime_mutation_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee IN ('market_engine_app','market_engine_worker') AND table_schema='production' AND table_name IN ('calibration_dimension_catalog','weighted_joint_cell') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');")"
if [[ "$phase3r_production_table_count" != "26" || "$phase3r_production_view_count" != "31" || "$weighted_read_model_count" != "4" || "$weighted_security_invoker_count" != "2" || "$weighted_runtime_select_count" != "8" || "$weighted_runtime_mutation_count" != "0" ]]; then
  echo "expected Phase 3R production schema 26 tables/31 views and a read-only weighted mart boundary, found $phase3r_production_table_count/$phase3r_production_view_count relations=$weighted_read_model_count invoker=$weighted_security_invoker_count select=$weighted_runtime_select_count mutation=$weighted_runtime_mutation_count" >&2
  exit 1
fi
workbench_table_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")"
workbench_view_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.views WHERE table_schema='public' AND table_name LIKE 'v_%';")"
if [[ "$workbench_table_count" != "90" || "$workbench_view_count" != "17" ]]; then
  echo "expected 90 workbench tables and 17 read views, found $workbench_table_count and $workbench_view_count" >&2
  exit 1
fi
role_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_roles WHERE rolname IN ('market_engine_app','market_engine_worker');")"
if [[ "$role_count" != "2" ]]; then
  echo "expected both restricted workbench roles" >&2
  exit 1
fi
release_boundary_view_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='public' AND relation.relname IN ('v_condition_catalog','v_estimate_release_boundary','v_estimate_component_release_boundary','v_estimate_assumption_release_boundary','v_estimate_sensitivity_release_boundary','v_segment_query_result_release_boundary','v_estimate_lineage','v_archetype_search','v_saved_segment_latest','v_comparison_detail','v_opportunity_snapshot','v_global_search') AND relation.relkind='v' AND coalesce(relation.reloptions,ARRAY[]::text[]) @> ARRAY['security_invoker=true'];")"
release_boundary_select_grant_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee IN ('market_engine_app','market_engine_worker') AND table_schema='public' AND table_name IN ('v_condition_catalog','v_estimate_release_boundary','v_estimate_component_release_boundary','v_estimate_assumption_release_boundary','v_estimate_sensitivity_release_boundary','v_segment_query_result_release_boundary','v_estimate_lineage','v_archetype_search','v_saved_segment_latest','v_comparison_detail','v_opportunity_snapshot','v_global_search') AND privilege_type='SELECT';")"
release_boundary_preflight_runtime_execute_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT has_function_privilege('market_engine_app','workbench_assert_release_safe_read_boundary()','EXECUTE')::integer + has_function_privilege('market_engine_worker','workbench_assert_release_safe_read_boundary()','EXECUTE')::integer;")"
if [[ "$release_boundary_view_count" != "12" || "$release_boundary_select_grant_count" != "24" || "$release_boundary_preflight_runtime_execute_count" != "0" ]]; then
  echo "migration 018 release boundary view, grant, or preflight-execution contract is incomplete" >&2
  exit 1
fi
protected_rls_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relrowsecurity AND relname IN ('estimate_component','estimate_assumption','estimate_dependency','estimate_sensitivity_result','confidence_assessment','validation_gap','segment_query','segment_condition_group','segment_condition','segment_query_result','market_estimate','scenario_factor_override');")"
if [[ "$protected_rls_count" != "12" ]]; then
  echo "expected parent-owned RLS on all 12 protected query and estimate ledgers, found $protected_rls_count" >&2
  exit 1
fi
forbidden_runtime_grants="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee IN ('market_engine_app','market_engine_worker') AND table_schema='public' AND privilege_type IN ('UPDATE','DELETE') AND table_name IN ('estimate','estimate_component','estimate_assumption','estimate_dependency','estimate_sensitivity_result','confidence_assessment','validation_gap','market_scenario','market_estimate','scenario_factor_override','segment_query','segment_condition_group','segment_condition','saved_segment_version','segment_query_result','opportunity_segment_link');")"
if [[ "$forbidden_runtime_grants" != "0" ]]; then
  echo "runtime roles retain forbidden table-level mutation grants" >&2
  exit 1
fi
forbidden_provisioning_grants="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee IN ('market_engine_app','market_engine_worker') AND table_schema='public' AND privilege_type IN ('INSERT','UPDATE','DELETE') AND table_name IN ('workspace','workspace_member');")"
if [[ "$forbidden_provisioning_grants" != "0" ]]; then
  echo "runtime roles retain forbidden workspace provisioning grants" >&2
  exit 1
fi
query_result_update_columns="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.column_privileges WHERE grantee='market_engine_app' AND table_schema='public' AND table_name='segment_query_result' AND privilege_type='UPDATE' AND column_name IN ('cache_status','invalidated_at');")"
query_result_payload_update="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT has_column_privilege('market_engine_app','public.segment_query_result','result_summary','UPDATE')::int;")"
if [[ "$query_result_update_columns" != "2" || "$query_result_payload_update" != "0" ]]; then
  echo "query-result invalidation privileges are not column-scoped" >&2
  exit 1
fi
scenario_update_columns="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.column_privileges WHERE grantee='market_engine_app' AND table_schema='public' AND table_name='market_scenario' AND privilege_type='UPDATE' AND column_name IN ('status','updated_at');")"
scenario_payload_update="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT has_column_privilege('market_engine_app','public.market_scenario','assumptions','UPDATE')::int;")"
if [[ "$scenario_update_columns" != "2" || "$scenario_payload_update" != "0" ]]; then
  echo "scenario revision lifecycle privileges are not column-scoped" >&2
  exit 1
fi
snapshot_trigger_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('segment_query'::regclass,'segment_condition_group'::regclass,'segment_condition'::regclass,'segment_query_result'::regclass) AND tgname IN ('segment_query_append_only_trigger','segment_condition_group_append_only_trigger','segment_condition_append_only_trigger','segment_query_result_guard_trigger');")"
if [[ "$snapshot_trigger_count" != "4" ]]; then
  echo "expected all four segment snapshot mutation guards" >&2
  exit 1
fi
scenario_revision_guard_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid='market_scenario'::regclass AND tgname='market_scenario_revision_guard_trigger';")"
scenario_revision_index_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='market_scenario' AND indexname='market_scenario_one_direct_revision_uidx';")"
lineage_guard_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND (tgrelid,tgname) IN (('segment_query_result'::regclass,'segment_query_result_lineage_guard_trigger'),('saved_segment_version'::regclass,'saved_segment_version_workspace_guard_trigger')); ")"
if [[ "$scenario_revision_guard_count" != "1" || "$scenario_revision_index_count" != "1" || "$lineage_guard_count" != "2" ]]; then
  echo "scenario revision chain guard or unique child index is missing" >&2
  exit 1
fi
opportunity_snapshot_index_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_index invariant_index JOIN pg_class index_class ON index_class.oid=invariant_index.indexrelid WHERE invariant_index.indrelid='opportunity_segment_link'::regclass AND index_class.relname='opportunity_segment_link_one_primary_target_uidx' AND invariant_index.indisunique AND pg_get_indexdef(invariant_index.indexrelid) LIKE '%(opportunity_id)%' AND pg_get_expr(invariant_index.indpred,invariant_index.indrelid) LIKE '%primary_target%';")"
opportunity_snapshot_trigger_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid='opportunity_segment_link'::regclass AND tgname IN ('opportunity_segment_link_snapshot_guard_trigger','opportunity_primary_target_append_only_trigger');")"
opportunity_snapshot_function_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_proc WHERE proname IN ('workbench_assert_opportunity_snapshot_invariants','workbench_guard_opportunity_segment_link_snapshot','workbench_guard_primary_opportunity_target_append_only') AND proconfig @> ARRAY['search_path=pg_catalog, public'];")"
opportunity_app_insert_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT has_table_privilege('market_engine_app','public.opportunity_segment_link','INSERT')::integer;")"
opportunity_forbidden_mutation_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT has_table_privilege('market_engine_app','public.opportunity_segment_link','UPDATE')::integer + has_any_column_privilege('market_engine_app','public.opportunity_segment_link','UPDATE')::integer + has_table_privilege('market_engine_app','public.opportunity_segment_link','DELETE')::integer + has_table_privilege('market_engine_worker','public.opportunity_segment_link','INSERT')::integer + has_table_privilege('market_engine_worker','public.opportunity_segment_link','UPDATE')::integer + has_any_column_privilege('market_engine_worker','public.opportunity_segment_link','UPDATE')::integer + has_table_privilege('market_engine_worker','public.opportunity_segment_link','DELETE')::integer;")"
opportunity_preflight_runtime_execute_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT has_function_privilege('market_engine_app','workbench_assert_opportunity_snapshot_invariants()','EXECUTE')::integer + has_function_privilege('market_engine_worker','workbench_assert_opportunity_snapshot_invariants()','EXECUTE')::integer;")"
if [[ "$opportunity_snapshot_index_count" != "1" || "$opportunity_snapshot_trigger_count" != "2" || "$opportunity_snapshot_function_count" != "3" || "$opportunity_app_insert_count" != "1" || "$opportunity_forbidden_mutation_count" != "0" || "$opportunity_preflight_runtime_execute_count" != "0" ]]; then
  echo "opportunity snapshot uniqueness, lineage, append-only, or runtime privilege guards are incomplete" >&2
  exit 1
fi
research_snapshot_column_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='approved_research_factor' AND column_name IN ('source_count','materialization_txid') AND is_nullable='NO';")"
research_snapshot_constraint_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_constraint WHERE convalidated AND (conrelid,conname) IN (('approved_research_factor'::regclass,'approved_research_factor_source_count_check'),('approved_research_factor_source'::regclass,'approved_research_factor_source_index_bounds_check')); ")"
research_snapshot_trigger_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND (tgrelid,tgname) IN (('approved_research_factor_source'::regclass,'approved_research_factor_source_insert_guard_trigger'),('approved_research_factor'::regclass,'approved_research_factor_source_snapshot_trigger')); ")"
research_snapshot_deferred_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid='approved_research_factor'::regclass AND tgname='approved_research_factor_source_snapshot_trigger' AND tgdeferrable AND tginitdeferred;")"
research_snapshot_policy_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (tablename,policyname) IN (('approved_research_factor','approved_research_factor_insert_policy'),('approved_research_factor_source','approved_research_factor_source_insert_policy')) AND roles=ARRAY['market_engine_app']::name[];")"
research_snapshot_function_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_proc WHERE proname IN ('approved_research_factor_guard_source_insert','approved_research_factor_validate_source_snapshot') AND proconfig @> ARRAY['search_path=pg_catalog, public'];")"
research_provenance_index_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND (tablename,indexname) IN (('proposed_revision','proposed_revision_workspace_id_uidx'),('approved_research_factor','approved_research_factor_workspace_id_uidx')); ")"
research_provenance_constraint_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_constraint WHERE convalidated AND contype='f' AND (conrelid,conname) IN (('approved_research_factor'::regclass,'approved_research_factor_proposed_revision_workspace_fk'),('proposed_revision'::regclass,'proposed_revision_materialized_factor_workspace_fk')); ")"
research_provenance_trigger_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND (tgrelid,tgname) IN (('approved_research_factor'::regclass,'approved_research_factor_provenance_guard_trigger'),('data_release_version'::regclass,'data_release_version_factor_workspace_guard_trigger')); ")"
research_provenance_function_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_proc WHERE proname IN ('approved_research_factor_guard_provenance','data_release_version_guard_factor_workspace') AND proconfig @> ARRAY['search_path=pg_catalog, public'];")"
research_app_insert_grant_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT has_table_privilege('market_engine_app','approved_research_factor','INSERT')::integer + has_table_privilege('market_engine_app','approved_research_factor_source','INSERT')::integer;")"
research_worker_insert_grant_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT has_table_privilege('market_engine_worker','approved_research_factor','INSERT')::integer + has_table_privilege('market_engine_worker','approved_research_factor_source','INSERT')::integer;")"
interval_lineage_constraint_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_constraint WHERE convalidated AND (conrelid,conname) IN (('estimate'::regclass,'estimate_status_count_envelope_chk'),('estimate'::regclass,'estimate_share_envelope_chk'),('phase2_parent_estimate'::regclass,'phase2_parent_status_count_envelope_chk'),('phase2_parent_estimate'::regclass,'phase2_parent_share_envelope_chk'),('phase2_parent_estimate'::regclass,'phase2_parent_source_lineage_chk'),('population_cell'::regclass,'population_cell_source_lineage_chk'),('minor_population_cell'::regclass,'minor_population_cell_source_lineage_chk'),('household_cell'::regclass,'household_cell_source_lineage_chk'),('business_cell'::regclass,'business_cell_source_lineage_chk')); ")"
if [[ "$research_snapshot_column_count" != "2" || "$research_snapshot_constraint_count" != "2" || "$research_snapshot_trigger_count" != "2" || "$research_snapshot_deferred_count" != "1" || "$research_snapshot_policy_count" != "2" || "$research_snapshot_function_count" != "2" || "$research_provenance_index_count" != "2" || "$research_provenance_constraint_count" != "2" || "$research_provenance_trigger_count" != "2" || "$research_provenance_function_count" != "2" || "$research_app_insert_grant_count" != "2" || "$research_worker_insert_grant_count" != "0" || "$interval_lineage_constraint_count" != "9" ]]; then
  echo "approved research factor atomic source snapshot boundary is incomplete" >&2
  exit 1
fi
numeric_domain_constraint_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_constraint WHERE convalidated AND (conrelid,conname) IN (('market_estimate'::regclass,'market_estimate_nonnegative_values_chk'),('scenario_factor_override'::regclass,'scenario_factor_override_nonnegative_values_chk'),('scenario_factor_override'::regclass,'scenario_factor_override_ratio_bounds_chk'),('opportunity'::regclass,'opportunity_expected_price_nonnegative_chk'),('opportunity_experiment'::regclass,'opportunity_experiment_cost_nonnegative_chk')); ")"
if [[ "$numeric_domain_constraint_count" != "5" ]]; then
  echo "expected all five validated migration-015 numeric domain constraints, found $numeric_domain_constraint_count" >&2
  exit 1
fi
finite_numeric_constraint_count="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM pg_constraint WHERE convalidated AND (conrelid,conname) IN (('market_estimate'::regclass,'market_estimate_finite_values_chk'),('scenario_factor_override'::regclass,'scenario_factor_override_finite_values_chk'),('opportunity'::regclass,'opportunity_expected_price_finite_chk'),('opportunity_experiment'::regclass,'opportunity_experiment_cost_finite_chk')); ")"
if [[ "$finite_numeric_constraint_count" != "4" ]]; then
  echo "expected all four validated migration-016 finite-numeric constraints, found $finite_numeric_constraint_count" >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" \
  -f "$project_root/tests/fixtures/postgres_015_numeric_domain_invariants.sql" >/dev/null
psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" \
  -f "$project_root/tests/fixtures/postgres_016_catalog_and_finite_numeric.sql" >/dev/null

# A schema-only reapply does not exercise migration 010's late-arriving saved
# segment lineage. Seed a direct scenario, then a version that pins its result,
# while migration 011's strict trigger is already installed. The full reapply
# below must attach that now-unambiguous lineage and reinstall the strict guard.
psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" \
  -f "$project_root/tests/fixtures/postgres_010_stateful_reapply.sql" >/dev/null
stateful_scenario_before="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT (saved_segment_id IS NULL AND saved_segment_version_no IS NULL)::integer FROM market_scenario WHERE scenario_id='00000000-0000-4000-8000-000000001009';")"
if [[ "$stateful_scenario_before" != "1" ]]; then
  echo "stateful migration-010 fixture did not begin as a direct scenario" >&2
  exit 1
fi

# All additive workbench migrations are deliberately re-runnable.
for migration in 003_workbench.sql 004_workbench_read_models.sql 005_workbench_operations.sql 006_workbench_performance.sql 007_workbench_governance_hardening.sql 008_requirement_completion_hardening.sql 009_approved_research_factor.sql 010_reproducible_workbench_snapshots.sql 011_lineage_integrity_guards.sql 012_approved_research_factor_snapshot_hardening.sql 013_entity_only_market_scenarios.sql 014_interval_lineage_integrity.sql 015_numeric_domain_invariants.sql 016_catalog_privacy_and_finite_numeric.sql 017_opportunity_snapshot_invariants.sql 018_release_safe_read_boundary.sql; do
  psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" -f "$project_root/migrations/$migration" >/dev/null
done
for migration in 019_phase2r_a_production_foundation.sql 020_phase2r_a_production_invariants.sql; do
  psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" -f "$project_root/migrations/$migration" >/dev/null
done
for migration in 021_phase2r_b_calibrated_market_mart.sql 022_phase2r_b_production_invariants.sql 023_phase3r_7r_workbench_read_models.sql 024_phase3r_weighted_joint_read_model.sql; do
  psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" -f "$project_root/migrations/$migration" >/dev/null
done
stateful_scenario_after="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT saved_segment_id::text || ':' || saved_segment_version_no::text FROM market_scenario WHERE scenario_id='00000000-0000-4000-8000-000000001009';")"
if [[ "$stateful_scenario_after" != "00000000-0000-4000-8000-000000001008:1" ]]; then
  echo "migration 010 did not attach late-arriving saved-segment lineage during full reapply" >&2
  exit 1
fi
workbench_table_count_after_reapply="$(psql -At -h "$socket_dir" -p "$port" -d "$database" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")"
if [[ "$workbench_table_count_after_reapply" != "$workbench_table_count" ]]; then
  echo "workbench migrations are not idempotent" >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" \
  -f "$project_root/tests/fixtures/postgres_017_opportunity_snapshot_invariants.sql" >/dev/null
psql -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d "$database" \
  -f "$project_root/tests/fixtures/postgres_018_release_safe_read_boundary.sql" >/dev/null
echo "PostgreSQL migrations passed: Phase 1=$phase1_table_count tables ($phase1_signature), additive total=$table_count tables, workbench total=$workbench_table_count tables/$workbench_view_count views, Phase 2R-A production=$phase2r_production_table_count tables/$phase2r_production_view_count views, Phase 3R production=$phase3r_production_table_count tables/$phase3r_production_view_count views"
