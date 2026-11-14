-- =============================================================================
-- PROPOSAL — add lightweight top-level columns to public.stocks
-- (NOT EXECUTED. Requires owner review and a real migration before running.)
--
-- Purpose: after splitting the catalog from the full `info` JSONB, a few
-- fields are still needed on the LIST view / search but currently live only
-- inside `info`. Adding small top-level columns lets the light catalog query
-- select them without pulling the whole JSONB, keeping egress low.
--
-- IMPORTANT:
--   * Run the backfill (UPDATE) in small batches, not as one huge statement.
--   * Keep `info` untouched — do NOT drop or rewrite it.
--   * These columns must be kept in sync by the existing sync / notes /
--     description pipelines whenever they write `info`.
-- =============================================================================

BEGIN;

-- 1) Minimum order quantity (currently info.minOrderQuantity / info.unit).
--    Needed by getPerfumeMinOrder() + applyMinOrderFilter() on the catalog.
ALTER TABLE public.stocks
  ADD COLUMN IF NOT EXISTS min_order_quantity integer NOT NULL DEFAULT 1;

-- 2) GTIN (currently info.gtin). Needed for GTIN matching / dropshipId links.
ALTER TABLE public.stocks
  ADD COLUMN IF NOT EXISTS gtin text;

-- 3) Searchable notes summary, RU + EN (currently info.notesSummary /
--    info.notesSummaryEn). Only a short string, but enough to restore
--    note-based search without loading the full `info`.
ALTER TABLE public.stocks
  ADD COLUMN IF NOT EXISTS notes_summary_ru text,
  ADD COLUMN IF NOT EXISTS notes_summary_en text;

-- =============================================================================
-- Backfill from the existing `info` JSONB (run once, in batches, after the
-- columns above are created). Values are only filled where present; the rest
-- keep defaults (min_order_quantity=1) or NULL (gtin / notes summaries).
-- =============================================================================

-- Example batched backfill (do NOT run as one giant UPDATE):
--
--   UPDATE public.stocks
--   SET min_order_quantity = COALESCE((info->>'minOrderQuantity')::int,
--                                     (info->>'unit')::int, 1)
--   WHERE id > :last_id
--   ORDER BY id
--   LIMIT 1000;
--
--   UPDATE public.stocks
--   SET gtin = NULLIF(info->>'gtin', '')
--   WHERE id > :last_id
--   ORDER BY id
--   LIMIT 1000;
--
--   UPDATE public.stocks
--   SET notes_summary_ru = info->>'notesSummary',
--       notes_summary_en = info->>'notesSummaryEn'
--   WHERE id > :last_id
--   ORDER BY id
--   LIMIT 1000;

COMMIT;
