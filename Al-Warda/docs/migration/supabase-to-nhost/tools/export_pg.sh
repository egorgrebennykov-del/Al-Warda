#!/usr/bin/env bash
# Export the full Supabase database (schema + data + sequences + functions).
# PREPARED ONLY — not executed. Requires pg_dump and the Supabase DB URL.
#
# Usage:
#   SUPABASE_DB_URL='postgres://...' bash tools/export_pg.sh [output.dump]
#
# SECURITY: the DB URL is a secret. Pass it via env, never commit it or log it.

set -euo pipefail

OUT="${1:-supabase-full.dump}"
SCHEMA_OUT="supabase-schema.sql"

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL (secret) to the Supabase database connection string}"

echo "[export] dumping full database (no owner/acl)…"
pg_dump "$SUPABASE_DB_URL" \
  --no-owner --no-acl \
  --format=custom \
  --file="$OUT"

echo "[export] dumping schema-only for review…"
pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner --file="$SCHEMA_OUT"

echo "[export] checksums…"
sha256sum "$OUT" "$SCHEMA_OUT" > "$OUT.sha256"

echo "[export] done: $OUT ($(stat -c%s "$OUT") bytes)"
