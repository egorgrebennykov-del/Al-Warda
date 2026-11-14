#!/usr/bin/env bash
# Import the Supabase dump into Nhost and reconcile serial sequences.
# PREPARED ONLY — not executed. Requires psql/pg_restore and the Nhost DB URL.
#
# Usage:
#   NHOST_DB_URL='postgres://...' bash tools/import_nhost.sh [supabase-full.dump]
#
# SECURITY: the Nhost DB URL is a secret — pass via env, never log it.

set -euo pipefail

DUMP="${1:-supabase-full.dump}"
LOG="migration.log"

: "${NHOST_DB_URL:?Set NHOST_DB_URL (secret) to the Nhost database connection string}"

echo "[import] restoring $DUMP into Nhost (exit on error)…" | tee -a "$LOG"
pg_restore --dbname="$NHOST_DB_URL" --no-owner --no-acl --exit-on-error "$DUMP" 2>&1 | tee -a "$LOG"

echo "[import] reconciling serial sequences…" | tee -a "$LOG"
psql "$NHOST_DB_URL" -v ON_ERROR_STOP=1 <<'SQL' 2>&1 | tee -a "$LOG"
-- For every serial id in the seeded tables (extend with any other serial columns
-- discovered in the live schema dump):
SELECT setval(pg_get_serial_sequence('public.perfumes','id'),
              COALESCE((SELECT MAX(id) FROM public.perfumes), 1));
SELECT setval(pg_get_serial_sequence('public.cart','id'),
              COALESCE((SELECT MAX(id) FROM public.cart), 1));
SELECT setval(pg_get_serial_sequence('public.orders','id'),
              COALESCE((SELECT MAX(id) FROM public.orders), 1));
SELECT setval(pg_get_serial_sequence('public.reviews','id'),
              COALESCE((SELECT MAX(id) FROM public.reviews), 1));
SELECT setval(pg_get_serial_sequence('public.inquiries','id'),
              COALESCE((SELECT MAX(id) FROM public.inquiries), 1));
SQL

echo "[import] done." | tee -a "$LOG"
