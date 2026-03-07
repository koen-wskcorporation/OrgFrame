#!/usr/bin/env bash
set -euo pipefail

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required but not installed."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but not installed."
  exit 1
fi

if [ "${1:-}" = "" ] || [ "${2:-}" = "" ]; then
  cat <<'USAGE'
Usage:
  ./scripts/clone-prod-db-to-dev.sh "<PROD_DB_URL>" "<DEV_DB_URL>"

Behavior:
  - Dumps schema + data from PROD database
  - Restores into DEV database (destructive for existing objects in DEV)

Safety:
  - Set CONFIRM_DEV_DB_CLONE=YES to run
USAGE
  exit 1
fi

if [ "${CONFIRM_DEV_DB_CLONE:-}" != "YES" ]; then
  echo "Refusing to run without CONFIRM_DEV_DB_CLONE=YES"
  exit 1
fi

PROD_DB_URL="$1"
DEV_DB_URL="$2"

TMP_DUMP="$(mktemp /tmp/prod-db-clone-XXXXXX.sql)"
trap 'rm -f "$TMP_DUMP"' EXIT

echo "Dumping production database..."
pg_dump \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --quote-all-identifiers \
  --file="$TMP_DUMP" \
  "$PROD_DB_URL"

echo "Restoring into development database..."
psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -f "$TMP_DUMP"

echo "Clone complete."
