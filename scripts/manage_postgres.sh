#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
pg_data="${MARKET_ENGINE_PG_DATA:-$project_root/data/local/postgres}"
pg_socket="${MARKET_ENGINE_PG_SOCKET:-$project_root/data/local/socket}"
pg_log="${MARKET_ENGINE_PG_LOG:-$project_root/data/local/postgres.log}"
pg_port="${MARKET_ENGINE_PG_PORT:-55432}"
pg_database="${MARKET_ENGINE_PG_DATABASE:-market_engine}"
pg_user="${MARKET_ENGINE_PG_USER:-$(id -un)}"

if [[ ! "$pg_database" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "invalid MARKET_ENGINE_PG_DATABASE: $pg_database" >&2
  exit 2
fi
if [[ ! "$pg_port" =~ ^[0-9]+$ ]]; then
  echo "invalid MARKET_ENGINE_PG_PORT: $pg_port" >&2
  exit 2
fi

usage() {
  cat <<'USAGE'
Usage: scripts/manage_postgres.sh {init|start|stop|status|create-db|migrate|bootstrap|dsn}

Environment overrides:
  MARKET_ENGINE_PG_DATA      PostgreSQL data directory
  MARKET_ENGINE_PG_SOCKET    Unix socket directory
  MARKET_ENGINE_PG_LOG       server log path
  MARKET_ENGINE_PG_PORT      server port (default 55432)
  MARKET_ENGINE_PG_DATABASE  database name (default market_engine)
  MARKET_ENGINE_PG_USER      database user (default current OS user)
USAGE
}

initialize() {
  mkdir -p "$pg_socket"
  if [[ -f "$pg_data/PG_VERSION" ]]; then
    return
  fi
  mkdir -p "$pg_data"
  initdb -D "$pg_data" --no-locale --encoding=UTF8 --auth=trust
}

is_ready() {
  pg_isready -q -h "$pg_socket" -p "$pg_port" -d postgres
}

start_server() {
  initialize
  if is_ready; then
    return
  fi
  pg_ctl -D "$pg_data" -l "$pg_log" -o "-p $pg_port -k $pg_socket" start
  for _attempt in {1..30}; do
    if is_ready; then
      return
    fi
    sleep 1
  done
  echo "PostgreSQL did not become ready on socket $pg_socket port $pg_port" >&2
  exit 1
}

stop_server() {
  if [[ ! -f "$pg_data/PG_VERSION" ]]; then
    echo "PostgreSQL cluster is not initialized: $pg_data"
    return
  fi
  if pg_ctl -D "$pg_data" status >/dev/null 2>&1; then
    pg_ctl -D "$pg_data" stop -m fast
  else
    echo "PostgreSQL is already stopped"
  fi
}

create_database() {
  start_server
  exists="$(psql -At -h "$pg_socket" -p "$pg_port" -U "$pg_user" -d postgres \
    -c "SELECT 1 FROM pg_database WHERE datname = '$pg_database';")"
  if [[ "$exists" != "1" ]]; then
    createdb -h "$pg_socket" -p "$pg_port" -U "$pg_user" "$pg_database"
  fi
}

apply_migrations() {
  create_database
  has_core="$(psql -At -h "$pg_socket" -p "$pg_port" -U "$pg_user" -d "$pg_database" \
    -c "SELECT to_regclass('public.model_version') IS NOT NULL;")"
  if [[ "$has_core" != "t" ]]; then
    psql -v ON_ERROR_STOP=1 -h "$pg_socket" -p "$pg_port" -U "$pg_user" \
      -d "$pg_database" -f "$project_root/migrations/001_core.sql"
  fi
  for migration in "$project_root"/migrations/*.sql; do
    if [[ "$(basename "$migration")" == "001_core.sql" ]]; then
      continue
    fi
    psql -v ON_ERROR_STOP=1 -h "$pg_socket" -p "$pg_port" -U "$pg_user" \
      -d "$pg_database" -f "$migration"
  done
}

command="${1:-}"
case "$command" in
  init)
    initialize
    ;;
  start)
    start_server
    ;;
  stop)
    stop_server
    ;;
  status)
    if [[ -f "$pg_data/PG_VERSION" ]]; then
      pg_ctl -D "$pg_data" status
      pg_isready -h "$pg_socket" -p "$pg_port" -d postgres
    else
      echo "PostgreSQL cluster is not initialized: $pg_data"
      exit 1
    fi
    ;;
  create-db)
    create_database
    ;;
  migrate)
    apply_migrations
    ;;
  bootstrap)
    initialize
    start_server
    create_database
    apply_migrations
    ;;
  dsn)
    printf 'dbname=%s host=%s port=%s user=%s\n' "$pg_database" "$pg_socket" "$pg_port" "$pg_user"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
