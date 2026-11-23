#!/bin/bash
# Applies every migration to a throwaway local Postgres database and runs the
# SQL tests in supabase/tests. Needs a local Postgres server; set PSQL to the
# command that runs psql as a user allowed to create databases.
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL="${PSQL:-psql}"
DB="painel_test_$$"
sql() { $PSQL -q -v ON_ERROR_STOP=1 "$@"; }
sql -c "create database $DB" >/dev/null
trap 'sql -c "drop database if exists $DB" >/dev/null' EXIT
run() { sql -d "$DB" < "$1" >/dev/null; }
run supabase/tests/auth_stub.sql
for f in supabase/migrations/*.sql; do run "$f"; done
for f in supabase/tests/*_test.sql; do
  run "$f"
  echo "ok $(basename "$f")"
done
echo "database tests passed"
