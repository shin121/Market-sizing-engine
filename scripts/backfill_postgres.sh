#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
python_bin="${MARKET_ENGINE_PYTHON:-$project_root/.venv/bin/python}"

if [[ ! -x "$python_bin" ]]; then
  echo "Python environment not found: $python_bin" >&2
  echo "Set MARKET_ENGINE_PYTHON to the project Python executable." >&2
  exit 1
fi

"$project_root/scripts/manage_postgres.sh" bootstrap
database_url="$("$project_root/scripts/manage_postgres.sh" dsn)"

exec "$python_bin" -m market_engine.cli.main postgres-backfill \
  --database-url "$database_url" \
  "$@"
