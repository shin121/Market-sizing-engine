#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
pg_socket="${MARKET_ENGINE_PG_SOCKET:-$project_root/data/local/socket}"
pg_port="${MARKET_ENGINE_PG_PORT:-55432}"
pg_user="${MARKET_ENGINE_PG_USER:-$(id -un)}"
source_database="${MARKET_ENGINE_PRODUCTION_DATABASE:-market_engine_phase3r_production}"
test_database="${MARKET_ENGINE_BROWSER_E2E_DATABASE:-market_engine_phase3r_browser_e2e_test}"
e2e_port="${MARKET_ENGINE_BROWSER_E2E_PORT:-3100}"

for database_name in "$source_database" "$test_database"; do
  if [[ ! "$database_name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "Invalid database name: $database_name" >&2
    exit 2
  fi
done
if [[ "$test_database" != *_test ]]; then
  echo "Refusing to recreate a database whose name does not end in _test: $test_database" >&2
  exit 2
fi
if [[ "$source_database" == "$test_database" ]]; then
  echo "Production and browser E2E database names must differ." >&2
  exit 2
fi
if [[ ! "$e2e_port" =~ ^[0-9]+$ ]] || (( e2e_port < 1024 || e2e_port > 65535 )); then
  echo "Invalid MARKET_ENGINE_BROWSER_E2E_PORT: $e2e_port" >&2
  exit 2
fi

for command_name in psql createdb dropdb pg_dump npm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

psql_args=(-h "$pg_socket" -p "$pg_port" -U "$pg_user")
source_exists="$(psql -At "${psql_args[@]}" -d postgres \
  -c "SELECT 1 FROM pg_database WHERE datname = '$source_database';")"
if [[ "$source_exists" != "1" ]]; then
  echo "Production source database not found: $source_database" >&2
  exit 1
fi

source_dod_before="$(psql -At "${psql_args[@]}" -d "$source_database" \
  -c "SELECT md5(row_to_json(dod)::text) FROM production.v_workbench_product_dod dod;")"

cleanup() {
  dropdb --if-exists --force "${psql_args[@]}" "$test_database" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cleanup
createdb "${psql_args[@]}" "$test_database"
pg_dump --no-owner --no-acl "${psql_args[@]}" -d "$source_database" \
  | psql -v ON_ERROR_STOP=1 "${psql_args[@]}" -d "$test_database" >/dev/null

clone_dod="$(psql -At "${psql_args[@]}" -d "$test_database" \
  -c "SELECT md5(row_to_json(dod)::text) FROM production.v_workbench_product_dod dod;")"
if [[ "$clone_dod" != "$source_dod_before" ]]; then
  echo "Browser E2E clone does not match the Production DoD row." >&2
  exit 1
fi

cd "$project_root/web"
playwright_args=(tests/e2e/workbench.spec.ts)
if [[ -n "${MARKET_ENGINE_BROWSER_E2E_GREP:-}" ]]; then
  playwright_args+=(--grep "$MARKET_ENGINE_BROWSER_E2E_GREP")
fi
env \
  -u MARKET_ENGINE_DATABASE_URL \
  -u DATABASE_URL \
  -u POSTGRES_URL \
  PGHOST="$pg_socket" \
  PGPORT="$pg_port" \
  PGDATABASE="$test_database" \
  PGUSER="$pg_user" \
  WORKBENCH_AUTH_MODE=local \
  OPENAI_RESEARCH_ENABLED=false \
  RUN_MUTATING_REVIEW_E2E=1 \
  PLAYWRIGHT_BASE_URL="http://localhost:$e2e_port" \
  PORT="$e2e_port" \
  NEXT_TELEMETRY_DISABLED=1 \
  npm run test:e2e -- "${playwright_args[@]}"

source_dod_after="$(psql -At "${psql_args[@]}" -d "$source_database" \
  -c "SELECT md5(row_to_json(dod)::text) FROM production.v_workbench_product_dod dod;")"
if [[ "$source_dod_after" != "$source_dod_before" ]]; then
  echo "Production DoD row changed while browser E2E ran." >&2
  exit 1
fi

echo "Phase 3R-7R browser E2E passed against disposable clone: $test_database"
echo "Production source DoD fingerprint remained unchanged."
