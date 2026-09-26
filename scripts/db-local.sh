#!/usr/bin/env bash
# Recria o banco local (stub do Supabase) e aplica migrations + seed. Uso: scripts/db-local.sh
set -euo pipefail
export PGHOST=${PGHOST:-/home/claude/pglocal} PGPORT=${PGPORT:-5433} PGUSER=${PGUSER:-postgres}
dropdb --if-exists z3us; createdb z3us
psql -d z3us -v ON_ERROR_STOP=1 -q -f supabase/local_stub.sql
for f in supabase/migrations/*.sql; do psql -d z3us -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -v "does not exist, skipping" || true; done
psql -d z3us -v ON_ERROR_STOP=1 -q -c "select app.ib_seed_demo('pg');"
