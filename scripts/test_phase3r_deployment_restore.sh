#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
test_port="${MARKET_ENGINE_DEPLOYMENT_TEST_PORT:-55439}"
test_database="market_engine_phase3r_fresh_restore_test"
test_user="$(id -un)"
test_parent="${MARKET_ENGINE_DEPLOYMENT_TEST_PARENT:-/private/tmp}"
test_root="$(mktemp -d "$test_parent/market-engine-deploy-test.XXXXXX")"
test_data="$test_root/postgres"
test_socket="$test_root/socket"
test_log="$test_root/postgres.log"
test_certificate="$test_root/server.crt"
test_private_key="$test_root/server.key"
deployment_user="market_engine_deployer"
server_started="false"

cleanup() {
  if [[ "$server_started" == "true" ]]; then
    pg_ctl -D "$test_data" stop -m fast >/dev/null 2>&1 || true
  fi
  case "$test_root" in
    "$test_parent"/market-engine-deploy-test.*)
      rm -rf -- "$test_root"
      ;;
    *)
      echo "Refusing to remove unexpected temporary path: $test_root" >&2
      ;;
  esac
}
trap cleanup EXIT

if [[ ! "$test_port" =~ ^[0-9]+$ ]]; then
  echo "MARKET_ENGINE_DEPLOYMENT_TEST_PORT must be numeric." >&2
  exit 2
fi

for command_name in initdb pg_ctl pg_isready createdb createuser psql pg_restore shasum openssl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

if pg_isready -q -h 127.0.0.1 -p "$test_port"; then
  echo "Deployment test port is already in use: $test_port" >&2
  exit 1
fi

mkdir -p "$test_socket"
initdb -D "$test_data" --no-locale --encoding=UTF8 --auth=trust >/dev/null
openssl req -new -x509 -days 1 -nodes \
  -out "$test_certificate" \
  -keyout "$test_private_key" \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1
chmod 600 "$test_private_key"
pg_ctl -D "$test_data" -l "$test_log" \
  -o "-p $test_port -k $test_socket -h 127.0.0.1 -c ssl=on -c ssl_cert_file=$test_certificate -c ssl_key_file=$test_private_key" \
  start >/dev/null
server_started="true"

for _attempt in {1..30}; do
  if pg_isready -q -h "$test_socket" -p "$test_port" -d postgres; then
    break
  fi
  sleep 0.2
done
if ! pg_isready -q -h "$test_socket" -p "$test_port" -d postgres; then
  echo "Fresh PostgreSQL test cluster did not become ready." >&2
  sed -n '1,120p' "$test_log" >&2 || true
  exit 1
fi

createuser -h "$test_socket" -p "$test_port" -U "$test_user" \
  --login --createrole --no-createdb --no-superuser "$deployment_user"
createdb -h "$test_socket" -p "$test_port" -U "$test_user" \
  --owner="$deployment_user" "$test_database"
target_url="postgresql://$deployment_user@localhost:$test_port/$test_database?sslmode=require"
node_target_url="${target_url/sslmode=require/sslmode=verify-full}"
insecure_target_url="${target_url/sslmode=require/sslmode=disable}"

set +e
insecure_preflight_output="$(MARKET_ENGINE_TARGET_DATABASE_URL="$insecure_target_url" \
  "$project_root/scripts/deploy_phase3r_database.sh" preflight 2>&1)"
insecure_preflight_status=$?
set -e
if [[ "$insecure_preflight_status" == "0" ]] \
   || [[ "$insecure_preflight_output" != *"Refusing a non-TLS TCP database connection"* ]]; then
  echo "Deployment preflight did not fail closed for a non-TLS TCP URL." >&2
  exit 1
fi

MARKET_ENGINE_TARGET_DATABASE_URL="$target_url" \
  "$project_root/scripts/deploy_phase3r_database.sh" restore

deployer_state="$(psql -X -At --dbname="$target_url" \
  -c "SELECT current_user || ':' || rolsuper || ':' || rolcreaterole FROM pg_roles WHERE rolname=current_user;")"
if [[ "$deployer_state" != "$deployment_user:false:true" ]]; then
  echo "Restore did not run through the expected non-superuser CREATEROLE owner: $deployer_state" >&2
  exit 1
fi

tls_state="$(psql -X -At --dbname="$target_url" \
  -c "SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid();")"
if [[ "$tls_state" != "t" ]]; then
  echo "Fresh-cluster deployment connection did not negotiate TLS." >&2
  exit 1
fi

role_count="$(psql -X -At --dbname="$target_url" \
  -c "SELECT count(*) FROM pg_roles WHERE rolname IN ('market_engine_app','market_engine_worker') AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole;")"
if [[ "$role_count" != "2" ]]; then
  echo "Fresh-cluster runtime role bootstrap did not produce two safe NOLOGIN roles." >&2
  exit 1
fi

app_role_dod="$(PGOPTIONS='-c role=market_engine_app' psql -X -At --dbname="$target_url" \
  -c "SELECT current_user || ':' || domain_count || ':' || fixture_count FROM production.v_workbench_product_dod;")"
if [[ "$app_role_dod" != "market_engine_app:24:0" ]]; then
  echo "Least-privilege app role cannot read the restored Product DoD: $app_role_dod" >&2
  exit 1
fi

if [[ "${MARKET_ENGINE_RUN_DEPLOYMENT_INTEGRATION:-0}" == "1" ]]; then
  cd "$project_root/web"
  RUN_DATABASE_INTEGRATION=1 \
  NODE_EXTRA_CA_CERTS="$test_certificate" \
  DATABASE_URL="$node_target_url" \
  npm run test:integration
fi

echo "Fresh-cluster deployment restore passed over TCP/TLS as a non-superuser owner on PostgreSQL $test_port with isolated policy roles."
