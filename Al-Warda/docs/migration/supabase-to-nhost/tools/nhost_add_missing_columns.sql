-- nhost_add_missing_columns.sql — PREPARED, NOT YET EXECUTED.
--
-- Data import into Nhost is complete. Comparison of Nhost public.stocks
-- against the columns the app queries (utils/perfumes.js light catalog
-- select: id, slug, name, title, brand, category, price, currency, image,
-- in_stock, description) found 5 missing top-level columns. The SQL export
-- (al_warda_import.sql) carried only 8 columns for stocks, so these catalog
-- columns were never created in Nhost.
--
-- These ALTERs are additive/non-destructive (nullable with sensible defaults).
-- Run only after owner confirmation (rule: no schema change without approval).

BEGIN;

ALTER TABLE public.stocks
  ADD COLUMN IF NOT EXISTS slug      text,
  ADD COLUMN IF NOT EXISTS title     text,
  ADD COLUMN IF NOT EXISTS category  text,
  ADD COLUMN IF NOT EXISTS currency  text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS in_stock  boolean NOT NULL DEFAULT true;

COMMIT;
