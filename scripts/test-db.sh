#!/usr/bin/env bash
# Usage: DATABASE_URL=postgres://... scripts/test-db.sh   (base JETABLE uniquement : elle est vidée)
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requis (base de test jetable)}"
cd "$(dirname "$0")/.."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do echo "-> $f"; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null; done
for f in supabase/tests/[0-9][1-9]_*.sql; do echo "-> $f"; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" | grep -E "OK|ERROR" || true; done
