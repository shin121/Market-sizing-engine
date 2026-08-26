#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
deployment_archive="${MARKET_ENGINE_DEPLOYMENT_ARCHIVE:-$project_root/data/backups/phase3r/market_engine_phase3r_production_20260826_v2.dump}"
expected_sha256="${MARKET_ENGINE_DEPLOYMENT_ARCHIVE_SHA256:-b2388405d476415a9ee2515c43e183ef4cdb8e2857e60dd8d9aaf28ee4b8a3c3}"
target_database_url="${MARKET_ENGINE_TARGET_DATABASE_URL:-}"
mode="${1:-preflight}"

if [[ -z "$target_database_url" ]]; then
  echo "MARKET_ENGINE_TARGET_DATABASE_URL is required. Use a direct, non-pooled managed PostgreSQL URL." >&2
  exit 2
fi

for command_name in psql pg_restore shasum; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

if [[ ! -f "$deployment_archive" ]]; then
  echo "Deployment archive not found: $deployment_archive" >&2
  exit 1
fi

actual_sha256="$(shasum -a 256 "$deployment_archive" | awk '{print $1}')"
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
  echo "Deployment archive checksum mismatch." >&2
  echo "Expected: $expected_sha256" >&2
  echo "Actual:   $actual_sha256" >&2
  exit 1
fi

psql_target() {
  psql -X -v ON_ERROR_STOP=1 --dbname="$target_database_url" "$@"
}

preflight() {
  local server_version_num
  local target_database
  local target_user
  local local_socket
  local transport_tls_server
  local transport_tls_client
  local connection_info
  local application_objects
  local can_create_database_objects
  local can_create_roles
  local pg_trgm_available

  server_version_num="$(psql_target -Atc "SHOW server_version_num;")"
  target_database="$(psql_target -Atc "SELECT current_database();")"
  target_user="$(psql_target -Atc "SELECT current_user;")"
  local_socket="$(psql_target -Atc "SELECT inet_server_addr() IS NULL;")"
  transport_tls_server="$(psql_target -Atc "SELECT COALESCE((SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid=pg_backend_pid()), false);")"
  # Some managed PostgreSQL proxies (including Neon) terminate TLS before the
  # backend, so pg_stat_ssl reports false even though libpq negotiated TLS 1.3.
  # Require either server-side proof or the client's own connection report.
  connection_info="$(psql_target -c '\conninfo')"
  transport_tls_client="f"
  if [[ "$connection_info" == *"SSL connection"* ]]; then
    transport_tls_client="t"
  fi
  application_objects="$(psql_target -Atc "SELECT count(*) FROM pg_catalog.pg_class WHERE oid IN (to_regclass('public.model_version'), to_regclass('production.domain_market_summary'), to_regclass('public.workspace'));")"
  can_create_database_objects="$(psql_target -Atc "SELECT has_database_privilege(current_user, current_database(), 'CREATE');")"
  can_create_roles="$(psql_target -Atc "SELECT rolsuper OR rolcreaterole FROM pg_catalog.pg_roles WHERE rolname = current_user;")"
  pg_trgm_available="$(psql_target -Atc "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pg_trgm');")"

  if [[ ! "$server_version_num" =~ ^[0-9]+$ ]] || (( server_version_num < 170000 )); then
    echo "PostgreSQL 17 or newer is required for this pg_dump 17 archive; target reports $server_version_num." >&2
    exit 1
  fi
  if [[ "$local_socket" == "t" && "$target_database" == "market_engine_phase3r_production" ]]; then
    echo "Refusing to restore over the verified local Production database." >&2
    exit 1
  fi
  if [[ "$local_socket" != "t" && "$transport_tls_server" != "t" && "$transport_tls_client" != "t" ]]; then
    echo "Refusing a non-TLS TCP database connection. Use sslmode=require, verify-ca, or verify-full." >&2
    exit 1
  fi
  if [[ "$target_user" == "market_engine_app" || "$target_user" == "market_engine_worker" ]]; then
    echo "Runtime policy roles cannot own or restore application objects: $target_user." >&2
    exit 1
  fi
  if [[ "$application_objects" != "0" ]]; then
    echo "Target is not empty: application sentinel objects already exist in $target_database." >&2
    exit 1
  fi
  if [[ "$can_create_database_objects" != "t" ]]; then
    echo "Target user cannot create database objects: $target_user." >&2
    exit 1
  fi
  if [[ "$can_create_roles" != "t" ]]; then
    echo "Target user cannot create the required NOLOGIN policy roles." >&2
    echo "Ask the managed PostgreSQL administrator to run scripts/bootstrap_phase3r_runtime_roles.sql first." >&2
    exit 1
  fi
  if [[ "$pg_trgm_available" != "t" ]]; then
    echo "Required trusted extension pg_trgm is unavailable on the target." >&2
    exit 1
  fi

  echo "Preflight passed for database $target_database as $target_user (PostgreSQL $server_version_num)."
  echo "Transport verified: $([[ "$local_socket" == "t" ]] && echo local-socket || echo tcp-tls)"
  echo "Archive checksum verified: $actual_sha256"
}

verify() {
  psql_target --file="$project_root/scripts/verify_phase3r_production_restore.sql"
}

restore() {
  preflight
  psql_target --file="$project_root/scripts/bootstrap_phase3r_runtime_roles.sql"
  pg_restore \
    --exit-on-error \
    --no-owner \
    --no-acl \
    --dbname="$target_database_url" \
    "$deployment_archive"
  psql_target --file="$project_root/scripts/grant_phase3r_runtime_privileges.sql"
  verify
}

case "$mode" in
  preflight)
    preflight
    ;;
  restore)
    restore
    ;;
  verify)
    verify
    ;;
  *)
    echo "Usage: MARKET_ENGINE_TARGET_DATABASE_URL=... scripts/deploy_phase3r_database.sh {preflight|restore|verify}" >&2
    exit 2
    ;;
esac
