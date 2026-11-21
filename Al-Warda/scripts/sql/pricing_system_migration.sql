-- Al-Warda Automated Pricing System Migration
-- Creates private pricing tables (never exposed to public Hasura/PostgREST endpoints)

BEGIN;

CREATE TABLE IF NOT EXISTS public.pricing_settings (
  id integer PRIMARY KEY DEFAULT 1,
  target_discount_pct numeric(6,2) NOT NULL DEFAULT 8.00,
  desired_net_profit_eur numeric(10,2) NOT NULL DEFAULT 5.00,
  corporate_tax_pct numeric(6,2) NOT NULL DEFAULT 10.00,
  payment_fee_pct numeric(6,2) NOT NULL DEFAULT 2.90,
  rounding_mode text NOT NULL DEFAULT 'psych_99',
  vat_mode text NOT NULL DEFAULT 'standard',
  fallback_to_global_market boolean NOT NULL DEFAULT true,
  supported_countries jsonb NOT NULL DEFAULT '["BG","GR","HU","RO"]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT pricing_settings_singleton CHECK (id = 1)
);

INSERT INTO public.pricing_settings (
  id,
  target_discount_pct,
  desired_net_profit_eur,
  corporate_tax_pct,
  payment_fee_pct,
  rounding_mode,
  vat_mode,
  fallback_to_global_market,
  supported_countries
)
VALUES (
  1,
  8.00,
  5.00,
  10.00,
  2.90,
  'psych_99',
  'standard',
  true,
  '["BG","GR","HU","RO"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.product_pricing (
  stock_id integer PRIMARY KEY REFERENCES public.stocks(id) ON DELETE CASCADE,
  purchase_cost_eur numeric(10,2) NOT NULL DEFAULT 0.00,
  extra_cost_eur numeric(10,2) NOT NULL DEFAULT 0.00,
  desired_net_profit_eur numeric(10,2),
  market_prices jsonb NOT NULL DEFAULT '{}'::jsonb,
  manual_prices jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_prices jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculation_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS public.competitor_prices (
  id serial PRIMARY KEY,
  stock_id integer NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  country text NOT NULL,
  competitor_name text NOT NULL DEFAULT '',
  price_eur numeric(10,2) NOT NULL CHECK (price_eur > 0),
  product_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_prices_stock_country
  ON public.competitor_prices (stock_id, country);

CREATE INDEX IF NOT EXISTS idx_product_pricing_updated_at
  ON public.product_pricing (updated_at DESC);

COMMIT;
