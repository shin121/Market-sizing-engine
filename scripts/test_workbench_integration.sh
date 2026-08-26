#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
pg_socket="${MARKET_ENGINE_PG_SOCKET:-$project_root/data/local/socket}"
pg_port="${MARKET_ENGINE_PG_PORT:-55432}"
pg_user="${MARKET_ENGINE_PG_USER:-$(id -un)}"
source_database="${MARKET_ENGINE_PRODUCTION_DATABASE:-market_engine_phase3r_production}"
test_database="${MARKET_ENGINE_TEST_DATABASE:-market_engine_phase3r_integration_test}"

if [[ "$test_database" != *_test ]]; then
  echo "Refusing to recreate a database whose name does not end in _test: $test_database" >&2
  exit 2
fi
if [[ "$test_database" == "$source_database" ]]; then
  echo "Production and test database names must differ." >&2
  exit 2
fi

for command_name in psql createdb dropdb pg_dump; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required PostgreSQL command not found: $command_name" >&2
    exit 1
  fi
done

source_exists="$(psql -At -h "$pg_socket" -p "$pg_port" -U "$pg_user" -d postgres \
  -c "SELECT 1 FROM pg_database WHERE datname = '$source_database';")"
if [[ "$source_exists" != "1" ]]; then
  echo "Production source database not found: $source_database" >&2
  exit 1
fi

cleanup() {
  dropdb --if-exists -h "$pg_socket" -p "$pg_port" -U "$pg_user" "$test_database" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

dropdb --if-exists -h "$pg_socket" -p "$pg_port" -U "$pg_user" "$test_database"
createdb -h "$pg_socket" -p "$pg_port" -U "$pg_user" "$test_database"

pg_dump --no-owner -h "$pg_socket" -p "$pg_port" -U "$pg_user" \
  -d "$source_database" \
  | psql -v ON_ERROR_STOP=1 -h "$pg_socket" -p "$pg_port" -U "$pg_user" \
      -d "$test_database" >/dev/null

cd "$project_root/web"
RUN_DATABASE_INTEGRATION=1 \
PGHOST="$pg_socket" \
PGPORT="$pg_port" \
PGDATABASE="$test_database" \
PGUSER="$pg_user" \
npm run test:integration
