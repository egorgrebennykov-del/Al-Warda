import { hasuraGraphQL } from "./hasuraProxy.js";
import { requirePrivilegedUser } from "./productImageQueueAdmin.js";
import {
  DEFAULT_PRICING_SETTINGS,
  SUPPORTED_COUNTRIES,
  calculateAllCountriesPricing,
  normalizePricingSettings,
  round2,
} from "./pricingEngine.js";

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
      ...extraHeaders,
    },
  });
}

function formatSettingsRow(row) {
  if (!row) return { ...DEFAULT_PRICING_SETTINGS };
  return normalizePricingSettings({
    targetDiscountPct: row.target_discount_pct,
    desiredNetProfitEur: row.desired_net_profit_eur,
    corporateTaxPct: row.corporate_tax_pct,
    paymentFeePct: row.payment_fee_pct,
    roundingMode: row.rounding_mode,
    vatMode: row.vat_mode,
    fallbackToGlobalMarket: row.fallback_to_global_market,
    supportedCountries: row.supported_countries,
  });
}

async function fetchGlobalSettings(env) {
  const data = await hasuraGraphQL(
    env,
    `query GetPricingSettings {
      pricing_settings(where: { id: { _eq: 1 } }, limit: 1) {
        id
        target_discount_pct
        desired_net_profit_eur
        corporate_tax_pct
        payment_fee_pct
        rounding_mode
        vat_mode
        fallback_to_global_market
        supported_countries
        updated_at
        updated_by
      }
    }`,
  );
  const row = data?.pricing_settings?.[0] || null;
  return {
    settings: formatSettingsRow(row),
    updatedAt: row?.updated_at || null,
    updatedBy: row?.updated_by || null,
  };
}

function parsePositiveFloat(val, { allowZero = false } = {}) {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  if (!Number.isFinite(num)) return NaN;
  if (allowZero ? num < 0 : num <= 0) return NaN;
  return round2(num);
}

function buildProductPricingPayload(stock, pricingRow, competitors, settings) {
  const info = stock?.info && typeof stock.info === "object" ? stock.info : {};
  const qogitaRecFromMeta = pricingRow?.calculation_meta?._meta?.qogitaRecommendedPriceEur;
  const qogitaRecFromInfo = info.qogitaRecommendedPriceEur ?? info.recommendedRetailPrice;
  const qogitaRecommendedPriceEur =
    qogitaRecFromMeta !== null &&
    qogitaRecFromMeta !== undefined &&
    Number.isFinite(Number(qogitaRecFromMeta)) &&
    Number(qogitaRecFromMeta) > 0
      ? round2(Number(qogitaRecFromMeta))
      : qogitaRecFromInfo !== null &&
          qogitaRecFromInfo !== undefined &&
          Number.isFinite(Number(qogitaRecFromInfo)) &&
          Number(qogitaRecFromInfo) > 0
        ? round2(Number(qogitaRecFromInfo))
        : null;

  const pricingData = pricingRow
    ? {
        purchaseCostEur: Number(pricingRow.purchase_cost_eur || 0),
        extraCostEur: Number(pricingRow.extra_cost_eur || 0),
        desiredNetProfitEur:
          pricingRow.desired_net_profit_eur !== null &&
          pricingRow.desired_net_profit_eur !== undefined
            ? Number(pricingRow.desired_net_profit_eur)
            : null,
        qogitaRecommendedPriceEur,
        manualPrices: pricingRow.manual_prices || {},
        publishedPrices: pricingRow.published_prices || {},
      }
    : {
        purchaseCostEur: round2(Number(stock.price || 0)),
        extraCostEur: 0,
        desiredNetProfitEur: null,
        qogitaRecommendedPriceEur,
        manualPrices: {},
        publishedPrices: {},
      };

  const calculated = calculateAllCountriesPricing({
    productPricing: pricingData,
    competitors,
    settings,
  });

  const volume = info.volume || "";

  return {
    stockId: Number(stock.id),
    name: stock.name || stock.title || "",
    brand: stock.brand || "",
    volume,
    currentCatalogPriceEur: round2(Number(stock.price || 0)),
    inStock: Boolean(stock.in_stock),
    purchaseCostEur: pricingData.purchaseCostEur,
    extraCostEur: pricingData.extraCostEur,
    desiredNetProfitEur: pricingData.desiredNetProfitEur,
    qogitaRecommendedPriceEur: pricingData.qogitaRecommendedPriceEur,
    manualPrices: pricingData.manualPrices,
    publishedPrices: pricingData.publishedPrices,
    competitors: competitors.map((c) => ({
      id: c.id,
      country: String(c.country || "").toUpperCase(),
      competitorName: c.competitor_name || "",
      priceEur: round2(Number(c.price_eur || 0)),
      productUrl: c.product_url || "",
      updatedAt: c.updated_at || null,
    })),
    countries: calculated.countries,
    recommendedPrices: calculated.recommendedPrices,
    overallStatus: calculated.overallStatus,
    updatedAt: pricingRow?.updated_at || null,
    updatedBy: pricingRow?.updated_by || null,
  };
}

export async function handleGetPricingSettings(request, env) {
  const auth = await requirePrivilegedUser(request, env);
  if (auth.response) return auth.response;

  try {
    const result = await fetchGlobalSettings(env);
    return json(result);
  } catch (error) {
    return json({ error: error.message || "Failed to load pricing settings" }, 500);
  }
}

export async function handleSavePricingSettings(request, env) {
  const auth = await requirePrivilegedUser(request, env);
  if (auth.response) return auth.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const numericChecks = [
    ["targetDiscountPct", body.targetDiscountPct, 0, 80],
    ["desiredNetProfitEur", body.desiredNetProfitEur, 0, 10000],
    ["corporateTaxPct", body.corporateTaxPct, 0, 80],
    ["paymentFeePct", body.paymentFeePct, 0, 50],
  ];
  for (const [field, raw, min, max] of numericChecks) {
    if (raw !== undefined) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < min || n > max) {
        return json({ error: `${field} must be a number between ${min} and ${max}` }, 400);
      }
    }
  }

  const normalized = normalizePricingSettings(body);
  const updatedBy = String(auth.user?.id || "admin");

  try {
    await hasuraGraphQL(
      env,
      `mutation UpsertPricingSettings(
        $targetDiscountPct: numeric!,
        $desiredNetProfitEur: numeric!,
        $corporateTaxPct: numeric!,
        $paymentFeePct: numeric!,
        $roundingMode: String!,
        $vatMode: String!,
        $fallbackToGlobalMarket: Boolean!,
        $supportedCountries: jsonb!,
        $updatedBy: String
      ) {
        insert_pricing_settings_one(
          object: {
            id: 1,
            target_discount_pct: $targetDiscountPct,
            desired_net_profit_eur: $desiredNetProfitEur,
            corporate_tax_pct: $corporateTaxPct,
            payment_fee_pct: $paymentFeePct,
            rounding_mode: $roundingMode,
            vat_mode: $vatMode,
            fallback_to_global_market: $fallbackToGlobalMarket,
            supported_countries: $supportedCountries,
            updated_at: "now()",
            updated_by: $updatedBy
          },
          on_conflict: {
            constraint: pricing_settings_pkey,
            update_columns: [
              target_discount_pct,
              desired_net_profit_eur,
              corporate_tax_pct,
              payment_fee_pct,
              rounding_mode,
              vat_mode,
              fallback_to_global_market,
              supported_countries,
              updated_at,
              updated_by
            ]
          }
        ) {
          id
        }
      }`,
      {
        targetDiscountPct: normalized.targetDiscountPct,
        desiredNetProfitEur: normalized.desiredNetProfitEur,
        corporateTaxPct: normalized.corporateTaxPct,
        paymentFeePct: normalized.paymentFeePct,
        roundingMode: normalized.roundingMode,
        vatMode: normalized.vatMode,
        fallbackToGlobalMarket: normalized.fallbackToGlobalMarket,
        supportedCountries: normalized.supportedCountries,
        updatedBy,
      },
    );

    const saved = await fetchGlobalSettings(env);
    return json(saved);
  } catch (error) {
    return json({ error: error.message || "Failed to save pricing settings" }, 500);
  }
}

export async function handleListPricingProducts(request, env, urlObj) {
  const auth = await requirePrivilegedUser(request, env);
  if (auth.response) return auth.response;

  const limitRaw = Number(urlObj.searchParams.get("limit") || 40);
  const offsetRaw = Number(urlObj.searchParams.get("offset") || 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.trunc(limitRaw))) : 40;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.trunc(offsetRaw)) : 0;
  const q = (urlObj.searchParams.get("q") || "").trim();
  const statusFilter = (urlObj.searchParams.get("status") || "all").trim().toLowerCase();

  try {
    const whereClause = q
      ? {
          _and: [
            { slug: { _neq: "site-settings" } },
            { in_stock: { _eq: true } },
            {
              _or: [
                { name: { _ilike: `%${q}%` } },
                { brand: { _ilike: `%${q}%` } },
              ],
            },
          ],
        }
      : {
          _and: [
            { slug: { _neq: "site-settings" } },
            { in_stock: { _eq: true } },
          ],
        };

    const [{ settings }, stocksRes] = await Promise.all([
      fetchGlobalSettings(env),
      hasuraGraphQL(
        env,
        `query ListStocksForPricing($where: stocks_bool_exp!, $limit: Int!, $offset: Int!) {
          stocks(where: $where, order_by: { id: asc }, limit: $limit, offset: $offset) {
            id
            name
            title
            brand
            price
            in_stock
            info
          }
          stocks_aggregate(where: $where) {
            aggregate {
              count
            }
          }
        }`,
        { where: whereClause, limit, offset },
      ),
    ]);

    const stocks = stocksRes?.stocks || [];
    const total = Number(stocksRes?.stocks_aggregate?.aggregate?.count || 0);
    const stockIds = stocks.map((s) => Number(s.id)).filter((id) => Number.isFinite(id));

    let pricingRows = [];
    let competitorRows = [];

    if (stockIds.length > 0) {
      const batchRes = await hasuraGraphQL(
        env,
        `query BatchPricingData($ids: [Int!]!) {
          product_pricing(where: { stock_id: { _in: $ids } }) {
            stock_id
            purchase_cost_eur
            extra_cost_eur
            desired_net_profit_eur
            market_prices
            manual_prices
            published_prices
            calculation_meta
            updated_at
            updated_by
          }
          competitor_prices(where: { stock_id: { _in: $ids } }, order_by: { updated_at: desc }) {
            id
            stock_id
            country
            competitor_name
            price_eur
            product_url
            updated_at
          }
        }`,
        { ids: stockIds },
      );
      pricingRows = batchRes?.product_pricing || [];
      competitorRows = batchRes?.competitor_prices || [];
    }

    const pricingMap = new Map(pricingRows.map((r) => [Number(r.stock_id), r]));
    const compMap = new Map();
    for (const c of competitorRows) {
      const sid = Number(c.stock_id);
      if (!compMap.has(sid)) compMap.set(sid, []);
      compMap.get(sid).push(c);
    }

    let items = stocks.map((s) =>
      buildProductPricingPayload(
        s,
        pricingMap.get(Number(s.id)) || null,
        compMap.get(Number(s.id)) || [],
        settings,
      ),
    );

    if (["green", "yellow", "red"].includes(statusFilter)) {
      items = items.filter((item) => item.overallStatus === statusFilter);
    }

    return json({ items, total, limit, offset, settings });
  } catch (error) {
    return json({ error: error.message || "Failed to load pricing products" }, 500);
  }
}

export async function handleGetProductPricing(request, env, stockIdRaw) {
  const auth = await requirePrivilegedUser(request, env);
  if (auth.response) return auth.response;

  const stockId = Number(stockIdRaw);
  if (!Number.isInteger(stockId) || stockId <= 0) {
    return json({ error: "Invalid stock id" }, 400);
  }

  try {
    const [{ settings }, res] = await Promise.all([
      fetchGlobalSettings(env),
      hasuraGraphQL(
        env,
        `query GetSingleProductPricing($stockId: Int!) {
          stocks(where: { id: { _eq: $stockId } }, limit: 1) {
            id
            name
            title
            brand
            price
            in_stock
            info
          }
          product_pricing(where: { stock_id: { _eq: $stockId } }, limit: 1) {
            stock_id
            purchase_cost_eur
            extra_cost_eur
            desired_net_profit_eur
            market_prices
            manual_prices
            published_prices
            calculation_meta
            updated_at
            updated_by
          }
          competitor_prices(where: { stock_id: { _eq: $stockId } }, order_by: { updated_at: desc }) {
            id
            stock_id
            country
            competitor_name
            price_eur
            product_url
            updated_at
          }
        }`,
        { stockId },
      ),
    ]);

    const stock = res?.stocks?.[0];
    if (!stock) return json({ error: "Product not found" }, 404);

    const item = buildProductPricingPayload(
      stock,
      res?.product_pricing?.[0] || null,
      res?.competitor_prices || [],
      settings,
    );
    return json({ item, settings });
  } catch (error) {
    return json({ error: error.message || "Failed to load product pricing" }, 500);
  }
}

export async function handleSaveProductPricing(request, env, stockIdRaw) {
  const auth = await requirePrivilegedUser(request, env);
  if (auth.response) return auth.response;

  const stockId = Number(stockIdRaw);
  if (!Number.isInteger(stockId) || stockId <= 0) {
    return json({ error: "Invalid stock id" }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const purchaseCostEur = parsePositiveFloat(body.purchaseCostEur ?? 0, { allowZero: true });
  const extraCostEur = parsePositiveFloat(body.extraCostEur ?? 0, { allowZero: true });
  const desiredNetProfitEur =
    body.desiredNetProfitEur === null ||
    body.desiredNetProfitEur === undefined ||
    body.desiredNetProfitEur === ""
      ? null
      : parsePositiveFloat(body.desiredNetProfitEur, { allowZero: true });
  const qogitaRecommendedPriceEur =
    body.qogitaRecommendedPriceEur === null ||
    body.qogitaRecommendedPriceEur === undefined ||
    body.qogitaRecommendedPriceEur === ""
      ? null
      : parsePositiveFloat(body.qogitaRecommendedPriceEur, { allowZero: false });

  if (
    Number.isNaN(purchaseCostEur) ||
    purchaseCostEur === null ||
    Number.isNaN(extraCostEur) ||
    extraCostEur === null ||
    Number.isNaN(desiredNetProfitEur) ||
    Number.isNaN(qogitaRecommendedPriceEur)
  ) {
    return json({ error: "Costs, profit and Qogita recommended price must be valid numbers" }, 400);
  }

  const manualPrices = {};
  if (body.manualPrices && typeof body.manualPrices === "object") {
    for (const country of SUPPORTED_COUNTRIES) {
      const raw = body.manualPrices[country];
      if (raw !== null && raw !== undefined && raw !== "") {
        const parsed = parsePositiveFloat(raw, { allowZero: false });
        if (Number.isNaN(parsed)) {
          return json({ error: `Invalid manual price for ${country}` }, 400);
        }
        manualPrices[country] = parsed;
      }
    }
  }

  const rawCompetitors = Array.isArray(body.competitors) ? body.competitors : [];
  const cleanCompetitors = [];
  for (const c of rawCompetitors) {
    const country = String(c?.country || "").trim().toUpperCase();
    if (![...SUPPORTED_COUNTRIES, "GLOBAL"].includes(country)) {
      return json({ error: `Unsupported competitor country: ${country}` }, 400);
    }
    const priceEur = parsePositiveFloat(c?.priceEur ?? c?.price_eur, { allowZero: false });
    if (priceEur === null || Number.isNaN(priceEur)) {
      return json({ error: "Competitor price must be a positive number" }, 400);
    }
    cleanCompetitors.push({
      stock_id: stockId,
      country,
      competitor_name: String(c?.competitorName ?? c?.competitor_name ?? "").trim().slice(0, 120),
      price_eur: priceEur,
      product_url: String(c?.productUrl ?? c?.product_url ?? "").trim().slice(0, 500),
    });
  }

  try {
    const [{ settings }, existingRes] = await Promise.all([
      fetchGlobalSettings(env),
      hasuraGraphQL(
        env,
        `query VerifyStockExists($stockId: Int!) {
          stocks(where: { id: { _eq: $stockId } }, limit: 1) {
            id name title brand price in_stock info
          }
          product_pricing(where: { stock_id: { _eq: $stockId } }, limit: 1) {
            published_prices
          }
        }`,
        { stockId },
      ),
    ]);

    const stock = existingRes?.stocks?.[0];
    if (!stock) return json({ error: "Product not found" }, 404);
    const existingPublished = existingRes?.product_pricing?.[0]?.published_prices || {};

    // Server-side recalculation (never trust client-computed values)
    const calculated = calculateAllCountriesPricing({
      productPricing: {
        purchaseCostEur,
        extraCostEur,
        desiredNetProfitEur,
        qogitaRecommendedPriceEur,
        manualPrices,
      },
      competitors: cleanCompetitors,
      settings,
    });

    const updatedBy = String(auth.user?.id || "admin");

    await hasuraGraphQL(
      env,
      `mutation SaveProductPricingAndCompetitors(
        $stockId: Int!,
        $purchaseCostEur: numeric!,
        $extraCostEur: numeric!,
        $desiredNetProfitEur: numeric,
        $marketPrices: jsonb!,
        $manualPrices: jsonb!,
        $publishedPrices: jsonb!,
        $calculationMeta: jsonb!,
        $updatedBy: String,
        $competitors: [competitor_prices_insert_input!]!
      ) {
        insert_product_pricing_one(
          object: {
            stock_id: $stockId,
            purchase_cost_eur: $purchaseCostEur,
            extra_cost_eur: $extraCostEur,
            desired_net_profit_eur: $desiredNetProfitEur,
            market_prices: $marketPrices,
            manual_prices: $manualPrices,
            published_prices: $publishedPrices,
            calculation_meta: $calculationMeta,
            updated_at: "now()",
            updated_by: $updatedBy
          },
          on_conflict: {
            constraint: product_pricing_pkey,
            update_columns: [
              purchase_cost_eur,
              extra_cost_eur,
              desired_net_profit_eur,
              market_prices,
              manual_prices,
              calculation_meta,
              updated_at,
              updated_by
            ]
          }
        ) {
          stock_id
        }
        delete_competitor_prices(where: { stock_id: { _eq: $stockId } }) {
          affected_rows
        }
        insert_competitor_prices(objects: $competitors) {
          affected_rows
        }
      }`,
      {
        stockId,
        purchaseCostEur,
        extraCostEur,
        desiredNetProfitEur,
        marketPrices: calculated.recommendedPrices,
        manualPrices,
        publishedPrices: existingPublished,
        calculationMeta: {
          ...calculated.countries,
          _meta: { qogitaRecommendedPriceEur },
        },
        updatedBy,
        competitors: cleanCompetitors,
      },
    );

    return handleGetProductPricing(request, env, stockId);
  } catch (error) {
    return json({ error: error.message || "Failed to save product pricing" }, 500);
  }
}

export async function handlePublishProductPrices(request, env, stockIdRaw) {
  const auth = await requirePrivilegedUser(request, env);
  if (auth.response) return auth.response;

  const stockId = Number(stockIdRaw);
  if (!Number.isInteger(stockId) || stockId <= 0) {
    return json({ error: "Invalid stock id" }, 400);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const [{ settings }, res] = await Promise.all([
      fetchGlobalSettings(env),
      hasuraGraphQL(
        env,
        `query LoadForPublish($stockId: Int!) {
          stocks(where: { id: { _eq: $stockId } }, limit: 1) {
            id price
          }
          product_pricing(where: { stock_id: { _eq: $stockId } }, limit: 1) {
            stock_id
            purchase_cost_eur
            extra_cost_eur
            desired_net_profit_eur
            manual_prices
            calculation_meta
          }
          competitor_prices(where: { stock_id: { _eq: $stockId } }) {
            country
            price_eur
          }
        }`,
        { stockId },
      ),
    ]);

    const stock = res?.stocks?.[0];
    if (!stock) return json({ error: "Product not found" }, 404);
    const pricingRow = res?.product_pricing?.[0];
    if (!pricingRow) {
      return json({ error: "Save product pricing before publishing to catalog" }, 400);
    }

    const calculated = calculateAllCountriesPricing({
      productPricing: {
        ...pricingRow,
        calculationMeta: pricingRow.calculation_meta,
      },
      competitors: res?.competitor_prices || [],
      settings,
    });

    const publishedPrices = {};
    for (const c of settings.supportedCountries) {
      const val = calculated.recommendedPrices[c];
      if (Number.isFinite(val) && val > 0) {
        publishedPrices[c] = val;
      }
    }

    const updatedBy = String(auth.user?.id || "admin");
    await hasuraGraphQL(
      env,
      `mutation PublishPrices($stockId: Int!, $publishedPrices: jsonb!, $updatedBy: String) {
        update_product_pricing(
          where: { stock_id: { _eq: $stockId } },
          _set: { published_prices: $publishedPrices, updated_at: "now()", updated_by: $updatedBy }
        ) {
          affected_rows
        }
      }`,
      { stockId, publishedPrices, updatedBy },
    );

    if (body?.updateBasePrice === true) {
      const baseVals = Object.values(publishedPrices).filter((v) => Number.isFinite(v) && v > 0);
      if (baseVals.length > 0) {
        const basePrice = round2(baseVals[0]);
        await hasuraGraphQL(
          env,
          `mutation UpdateStockBasePrice($stockId: Int!, $price: numeric!) {
            update_stocks(where: { id: { _eq: $stockId } }, _set: { price: $price }) {
              affected_rows
            }
          }`,
          { stockId, price: basePrice },
        );
      }
    }

    return json({ ok: true, stockId, publishedPrices });
  } catch (error) {
    return json({ error: error.message || "Failed to publish prices" }, 500);
  }
}

export async function handlePublicMarketPrices(env) {
  try {
    const res = await hasuraGraphQL(
      env,
      `query PublicPublishedMarketPrices {
        pricing_settings(where: { id: { _eq: 1 } }, limit: 1) {
          target_discount_pct
          desired_net_profit_eur
          corporate_tax_pct
          payment_fee_pct
          rounding_mode
          vat_mode
          fallback_to_global_market
          supported_countries
        }
        product_pricing {
          stock_id
          purchase_cost_eur
          extra_cost_eur
          desired_net_profit_eur
          manual_prices
          published_prices
          calculation_meta
        }
        competitor_prices {
          stock_id
          country
          price_eur
        }
        stocks(
          where: {
            in_stock: { _eq: true }
            info: { _contains: { imageGeneration: { status: "completed" } } }
          }
        ) {
          id
          price
        }
      }`,
    );

    const settings = formatSettingsRow(res?.pricing_settings?.[0]);
    const pricingByStock = new Map();
    for (const row of res?.product_pricing || []) {
      pricingByStock.set(String(row.stock_id), row);
    }

    const compByStock = new Map();
    for (const c of res?.competitor_prices || []) {
      const sid = String(c.stock_id);
      if (!compByStock.has(sid)) compByStock.set(sid, []);
      compByStock.get(sid).push(c);
    }

    const prices = {};
    for (const stock of res?.stocks || []) {
      const sid = String(stock.id);
      const pp = pricingByStock.get(sid) || {};
      const publishedRaw = pp.published_prices || {};
      const clean = {};

      for (const c of SUPPORTED_COUNTRIES) {
        const v = Number(publishedRaw[c]);
        if (Number.isFinite(v) && v > 0) clean[c] = round2(v);
      }

      if (Object.keys(clean).length < settings.supportedCountries.length) {
        const baseCost = Number(pp.purchase_cost_eur ?? stock.price);
        if (Number.isFinite(baseCost) && baseCost > 0) {
          const calc = calculateAllCountriesPricing({
            productPricing: {
              ...pp,
              purchaseCostEur: baseCost,
              calculationMeta: pp.calculation_meta,
            },
            competitors: compByStock.get(sid) || [],
            settings,
          });
          for (const c of settings.supportedCountries) {
            if (!clean[c] && Number(calc.recommendedPrices?.[c]) > 0) {
              clean[c] = round2(calc.recommendedPrices[c]);
            }
          }
        }
      }

      if (Object.keys(clean).length > 0) {
        prices[sid] = clean;
      }
    }

    return json(
      { prices },
      200,
      { "Cache-Control": "public, max-age=300, s-maxage=300" },
    );
  } catch {
    return json({ prices: {} }, 200);
  }
}

export async function autoCalculateAllProductPrices(
  env,
  { updatedBy = "auto", publish = true } = {},
) {
  const [{ settings }, dataRes] = await Promise.all([
    fetchGlobalSettings(env),
    hasuraGraphQL(
      env,
      `query AutoCalcLoadAll {
        stocks(
          where: {
            slug: { _neq: "site-settings" }
            in_stock: { _eq: true }
          }
          order_by: { id: asc }
        ) {
          id
          price
          info
        }
        product_pricing {
          stock_id
          purchase_cost_eur
          extra_cost_eur
          desired_net_profit_eur
          manual_prices
          published_prices
          calculation_meta
        }
        competitor_prices {
          stock_id
          country
          competitor_name
          price_eur
        }
      }`,
    ),
  ]);

  const stocks = dataRes?.stocks || [];
  const pricingMap = new Map(
    (dataRes?.product_pricing || []).map((r) => [Number(r.stock_id), r]),
  );
  const compMap = new Map();
  for (const c of dataRes?.competitor_prices || []) {
    const sid = Number(c.stock_id);
    if (!compMap.has(sid)) compMap.set(sid, []);
    compMap.get(sid).push(c);
  }

  const objects = [];
  for (const stock of stocks) {
    const stockId = Number(stock.id);
    if (!Number.isFinite(stockId)) continue;
    const existing = pricingMap.get(stockId) || null;
    const info = stock?.info && typeof stock.info === "object" ? stock.info : {};

    const purchaseCostEur =
      Number(stock.price) > 0
        ? round2(Number(stock.price))
        : existing && Number(existing.purchase_cost_eur) > 0
          ? round2(Number(existing.purchase_cost_eur))
          : 0;
    const extraCostEur = existing ? round2(Number(existing.extra_cost_eur || 0)) : 0;
    const desiredNetProfitEur =
      existing?.desired_net_profit_eur !== null &&
      existing?.desired_net_profit_eur !== undefined
        ? Number(existing.desired_net_profit_eur)
        : null;
    const manualPrices = existing?.manual_prices || {};
    const qogitaRecRaw =
      existing?.calculation_meta?._meta?.qogitaRecommendedPriceEur ??
      info.qogitaRecommendedPriceEur ??
      info.recommendedRetailPrice ??
      null;
    const qogitaRecommendedPriceEur =
      qogitaRecRaw !== null &&
      qogitaRecRaw !== undefined &&
      Number.isFinite(Number(qogitaRecRaw)) &&
      Number(qogitaRecRaw) > 0
        ? round2(Number(qogitaRecRaw))
        : null;

    const calculated = calculateAllCountriesPricing({
      productPricing: {
        purchaseCostEur,
        extraCostEur,
        desiredNetProfitEur,
        qogitaRecommendedPriceEur,
        manualPrices,
      },
      competitors: compMap.get(stockId) || [],
      settings,
    });

    const publishedPrices = publish
      ? { ...calculated.recommendedPrices }
      : existing?.published_prices || {};

    objects.push({
      stock_id: stockId,
      purchase_cost_eur: purchaseCostEur,
      extra_cost_eur: extraCostEur,
      desired_net_profit_eur: desiredNetProfitEur,
      market_prices: calculated.recommendedPrices,
      manual_prices: manualPrices,
      published_prices: publishedPrices,
      calculation_meta: {
        ...calculated.countries,
        _meta: { qogitaRecommendedPriceEur },
      },
      updated_at: "now()",
      updated_by: String(updatedBy || "auto"),
    });
  }

  let affectedRows = 0;
  const BATCH_SIZE = 100;
  for (let i = 0; i < objects.length; i += BATCH_SIZE) {
    const batch = objects.slice(i, i + BATCH_SIZE);
    const res = await hasuraGraphQL(
      env,
      `mutation UpsertAutoCalculatedPricing($objects: [product_pricing_insert_input!]!) {
        insert_product_pricing(
          objects: $objects,
          on_conflict: {
            constraint: product_pricing_pkey,
            update_columns: [
              purchase_cost_eur,
              extra_cost_eur,
              desired_net_profit_eur,
              market_prices,
              manual_prices,
              published_prices,
              calculation_meta,
              updated_at,
              updated_by
            ]
          }
        ) {
          affected_rows
        }
      }`,
      { objects: batch },
    );
    affectedRows += Number(res?.insert_product_pricing?.affected_rows || 0);
  }

  return {
    ok: true,
    total: stocks.length,
    updated: affectedRows || objects.length,
  };
}

export async function handleAutoCalculateAllPrices(request, env) {
  const auth = await requirePrivilegedUser(request, env);
  if (auth.response) return auth.response;

  try {
    const result = await autoCalculateAllProductPrices(env, {
      updatedBy: String(auth.user?.id || "admin"),
      publish: true,
    });
    return json(result);
  } catch (error) {
    return json({ error: error.message || "Failed to auto-calculate prices" }, 500);
  }
}

export async function handlePricingRequest(request, env, urlObj) {
  const pathname = urlObj?.pathname || new URL(request.url).pathname;
  const method = request.method.toUpperCase();

  if (method === "GET" && pathname === "/api/pricing/public-market-prices") {
    return handlePublicMarketPrices(env);
  }

  if (method === "POST" && pathname === "/api/admin/pricing/auto-calculate") {
    return handleAutoCalculateAllPrices(request, env);
  }

  if (method === "GET" && pathname === "/api/admin/pricing/settings") {
    return handleGetPricingSettings(request, env);
  }

  if (method === "PUT" && pathname === "/api/admin/pricing/settings") {
    return handleSavePricingSettings(request, env);
  }

  if (method === "GET" && pathname === "/api/admin/pricing/products") {
    return handleListPricingProducts(request, env, urlObj || new URL(request.url));
  }

  const singleMatch = /^\/api\/admin\/pricing\/products\/(\d+)$/.exec(pathname);
  if (singleMatch) {
    if (method === "GET") {
      return handleGetProductPricing(request, env, singleMatch[1]);
    }
    if (method === "PUT") {
      return handleSaveProductPricing(request, env, singleMatch[1]);
    }
  }

  const publishMatch = /^\/api\/admin\/pricing\/products\/(\d+)\/publish$/.exec(pathname);
  if (publishMatch && method === "POST") {
    return handlePublishProductPrices(request, env, publishMatch[1]);
  }

  return null;
}
