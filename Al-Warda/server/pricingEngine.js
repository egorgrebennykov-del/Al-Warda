export const SUPPORTED_COUNTRIES = ["BG", "GR", "HU", "RO"];

export const TARGET_COMPETITOR_SELLERS = Object.freeze([
  "Notino",
  "Douglas",
  "Dubai Perfumery",
  "AromaRay",
  "Arabic Scents",
]);

const TARGET_SELLER_KEYS = TARGET_COMPETITOR_SELLERS.map((s) => s.toLowerCase());

export function isTargetCompetitorSeller(name) {
  const norm = String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return false;
  return TARGET_SELLER_KEYS.some((key) => norm === key || norm.includes(key));
}

export const DEFAULT_PRICING_SETTINGS = Object.freeze({
  targetDiscountPct: 8,
  desiredNetProfitEur: 5,
  corporateTaxPct: 10,
  paymentFeePct: 2.9,
  roundingMode: "psych_99",
  vatMode: "standard",
  fallbackToGlobalMarket: true,
  supportedCountries: ["BG", "GR", "HU", "RO"],
});

export function round2(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function normalizeNumber(value, fallback = 0, { min = 0, max = 1_000_000 } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function calculateArithmeticMean(values) {
  const valid = (Array.isArray(values) ? values : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);

  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, v) => acc + v, 0);
  return round2(sum / valid.length);
}

export function calculateMedian(values) {
  const valid = (Array.isArray(values) ? values : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) return round2(valid[mid]);
  return round2((valid[mid - 1] + valid[mid]) / 2);
}

export function calculateMinPrice({
  purchaseCostEur = 0,
  extraCostEur = 0,
  desiredNetProfitEur = 5,
  corporateTaxPct = 10,
  paymentFeePct = 2.9,
}) {
  const c = normalizeNumber(purchaseCostEur, 0, { min: 0 });
  const e = normalizeNumber(extraCostEur, 0, { min: 0 });
  const n = normalizeNumber(desiredNetProfitEur, 0, { min: 0 });
  const t = normalizeNumber(corporateTaxPct, 10, { min: 0, max: 95 }) / 100;
  const f = normalizeNumber(paymentFeePct, 0, { min: 0, max: 95 }) / 100;

  const pMin = (c + e + n / (1 - t)) / (1 - f);
  return round2(pMin);
}

export function applyPsychologicalRounding(price, minPrice = 0, roundingMode = "psych_99") {
  const p = Number(price);
  const floorMin = Number.isFinite(Number(minPrice)) ? Math.max(0, Number(minPrice)) : 0;
  if (!Number.isFinite(p) || p <= 0) {
    return floorMin > 0 ? applyPsychologicalRounding(floorMin, floorMin, roundingMode) : 0;
  }

  if (roundingMode === "none") {
    return round2(Math.max(p, floorMin));
  }

  if (roundingMode === "ceil_99") {
    const candidate = Math.ceil(Math.max(p, floorMin) - 0.99 - 1e-9) + 0.99;
    return round2(Math.max(0.99, candidate));
  }

  // Default: psych_99 — nearest .99 that never drops below minPrice
  let candidate = Math.round(p - 0.99) + 0.99;
  if (candidate < 0.99) candidate = 0.99;
  if (candidate + 1e-9 < floorMin) {
    candidate = Math.ceil(floorMin - 0.99 - 1e-9) + 0.99;
    if (candidate < 0.99) candidate = 0.99;
  }
  return round2(candidate);
}

export function normalizePricingSettings(raw = {}) {
  const countriesRaw = Array.isArray(raw.supportedCountries)
    ? raw.supportedCountries
    : Array.isArray(raw.supported_countries)
      ? raw.supported_countries
      : DEFAULT_PRICING_SETTINGS.supportedCountries;

  const supportedCountries = countriesRaw
    .map((c) => String(c || "").trim().toUpperCase())
    .filter((c) => SUPPORTED_COUNTRIES.includes(c));

  return {
    targetDiscountPct: normalizeNumber(
      raw.targetDiscountPct ?? raw.target_discount_pct,
      DEFAULT_PRICING_SETTINGS.targetDiscountPct,
      { min: 0, max: 80 },
    ),
    desiredNetProfitEur: normalizeNumber(
      raw.desiredNetProfitEur ?? raw.desired_net_profit_eur,
      DEFAULT_PRICING_SETTINGS.desiredNetProfitEur,
      { min: 0, max: 10_000 },
    ),
    corporateTaxPct: normalizeNumber(
      raw.corporateTaxPct ?? raw.corporate_tax_pct,
      DEFAULT_PRICING_SETTINGS.corporateTaxPct,
      { min: 0, max: 80 },
    ),
    paymentFeePct: normalizeNumber(
      raw.paymentFeePct ?? raw.payment_fee_pct,
      DEFAULT_PRICING_SETTINGS.paymentFeePct,
      { min: 0, max: 50 },
    ),
    roundingMode: ["psych_99", "ceil_99", "none"].includes(
      String(raw.roundingMode ?? raw.rounding_mode ?? ""),
    )
      ? String(raw.roundingMode ?? raw.rounding_mode)
      : DEFAULT_PRICING_SETTINGS.roundingMode,
    vatMode: ["standard", "reverse_charge", "oss"].includes(
      String(raw.vatMode ?? raw.vat_mode ?? ""),
    )
      ? String(raw.vatMode ?? raw.vat_mode)
      : DEFAULT_PRICING_SETTINGS.vatMode,
    fallbackToGlobalMarket:
      typeof raw.fallbackToGlobalMarket === "boolean"
        ? raw.fallbackToGlobalMarket
        : typeof raw.fallback_to_global_market === "boolean"
          ? raw.fallback_to_global_market
          : DEFAULT_PRICING_SETTINGS.fallbackToGlobalMarket,
    supportedCountries:
      supportedCountries.length > 0
        ? Array.from(new Set(supportedCountries))
        : [...DEFAULT_PRICING_SETTINGS.supportedCountries],
  };
}

export function calculateExpectedProfitMetrics({
  sellingPriceEur,
  purchaseCostEur,
  extraCostEur,
  corporateTaxPct,
  paymentFeePct,
}) {
  const p = Number(sellingPriceEur);
  if (!Number.isFinite(p) || p <= 0) {
    return { expectedNetProfitEur: 0, marginPct: 0 };
  }
  const c = normalizeNumber(purchaseCostEur, 0, { min: 0 });
  const e = normalizeNumber(extraCostEur, 0, { min: 0 });
  const t = normalizeNumber(corporateTaxPct, 10, { min: 0, max: 95 }) / 100;
  const f = normalizeNumber(paymentFeePct, 0, { min: 0, max: 95 }) / 100;

  const preTaxProfit = p * (1 - f) - c - e;
  const netProfit = preTaxProfit > 0 ? preTaxProfit * (1 - t) : preTaxProfit;
  const marginPct = p > 0 ? (netProfit / p) * 100 : 0;

  return {
    expectedNetProfitEur: round2(netProfit),
    marginPct: round2(marginPct),
  };
}

export function calculateProductCountryPricing({
  productPricing = {},
  competitors = [],
  settings = DEFAULT_PRICING_SETTINGS,
  country = "BG",
}) {
  const normSettings = normalizePricingSettings(settings);
  const countryCode = String(country || "BG").trim().toUpperCase();

  const purchaseCostEur = normalizeNumber(
    productPricing.purchaseCostEur ?? productPricing.purchase_cost_eur,
    0,
    { min: 0 },
  );
  const extraCostEur = normalizeNumber(
    productPricing.extraCostEur ?? productPricing.extra_cost_eur,
    0,
    { min: 0 },
  );
  const customProfitRaw =
    productPricing.desiredNetProfitEur ?? productPricing.desired_net_profit_eur;
  const desiredNetProfitEur =
    customProfitRaw !== null && customProfitRaw !== undefined && customProfitRaw !== ""
      ? normalizeNumber(customProfitRaw, normSettings.desiredNetProfitEur, { min: 0 })
      : normSettings.desiredNetProfitEur;

  const minPriceEur = calculateMinPrice({
    purchaseCostEur,
    extraCostEur,
    desiredNetProfitEur,
    corporateTaxPct: normSettings.corporateTaxPct,
    paymentFeePct: normSettings.paymentFeePct,
  });

  const validCompetitors = (Array.isArray(competitors) ? competitors : []).filter((c) => {
    const price = Number(c?.priceEur ?? c?.price_eur);
    if (!Number.isFinite(price) || price <= 0) return false;
    const sellerName = String(c?.competitorName ?? c?.competitor_name ?? "").trim();
    // If seller name is provided, only include the 5 target sellers
    if (sellerName) return isTargetCompetitorSeller(sellerName);
    return true;
  });

  const localPrices = validCompetitors
    .filter((c) => String(c?.country || "").trim().toUpperCase() === countryCode)
    .map((c) => Number(c.priceEur ?? c.price_eur));

  const allMarketPrices = validCompetitors.map((c) => Number(c.priceEur ?? c.price_eur));

  let usedFallbackMarketData = false;
  let usedPrices = localPrices;
  if (localPrices.length === 0 && normSettings.fallbackToGlobalMarket && allMarketPrices.length > 0) {
    usedPrices = allMarketPrices;
    usedFallbackMarketData = true;
  }

  const competitorCount = usedPrices.length;
  const localCompetitorCount = localPrices.length;
  const competitorMeanEur = calculateArithmeticMean(usedPrices);
  const competitorMedianEur = competitorMeanEur;

  const qogitaRecRaw =
    productPricing.qogitaRecommendedPriceEur ??
    productPricing.qogita_recommended_price_eur ??
    productPricing.calculationMeta?._meta?.qogitaRecommendedPriceEur;
  const qogitaRecommendedPriceEur =
    qogitaRecRaw !== null &&
    qogitaRecRaw !== undefined &&
    qogitaRecRaw !== "" &&
    Number.isFinite(Number(qogitaRecRaw)) &&
    Number(qogitaRecRaw) > 0
      ? round2(Number(qogitaRecRaw))
      : null;

  const usedQogitaRecommended = competitorMeanEur === null && qogitaRecommendedPriceEur !== null;

  const marketRecommendedEur =
    competitorMeanEur !== null
      ? round2(competitorMeanEur * (1 - normSettings.targetDiscountPct / 100))
      : usedQogitaRecommended
        ? qogitaRecommendedPriceEur
        : null;

  const rawFinalEur =
    marketRecommendedEur !== null
      ? Math.max(marketRecommendedEur, minPriceEur)
      : minPriceEur;

  const calculatedPriceEur = applyPsychologicalRounding(
    rawFinalEur,
    minPriceEur,
    normSettings.roundingMode,
  );

  const manualPricesMap = productPricing.manualPrices || productPricing.manual_prices || {};
  const manualRaw = manualPricesMap?.[countryCode];
  const hasManualOverride =
    manualRaw !== null && manualRaw !== undefined && manualRaw !== "" && Number.isFinite(Number(manualRaw)) && Number(manualRaw) > 0;
  const manualPriceEur = hasManualOverride ? round2(Number(manualRaw)) : null;
  const finalPriceEur = manualPriceEur ?? calculatedPriceEur;

  const isUncompetitive =
    marketRecommendedEur !== null && marketRecommendedEur + 1e-9 < minPriceEur;
  const isManualBelowMin =
    manualPriceEur !== null && manualPriceEur + 1e-9 < minPriceEur;

  let status = "green";
  const warnings = [];

  if (localCompetitorCount === 0) {
    if (usedFallbackMarketData) {
      warnings.push("Использовано среднее по целевым продавцам");
    } else if (usedQogitaRecommended) {
      warnings.push("Использована рекомендуемая цена Qogita");
    } else if (purchaseCostEur > 0) {
      warnings.push("Расчёт по себестоимости Qogita (Pmin)");
    } else {
      status = "yellow";
      warnings.push("Недостаточно данных для расчёта цены");
    }
  }

  if (isUncompetitive) {
    status = "red";
    warnings.push(
      "Рыночная цена ниже минимально допустимой — товар неконкурентоспособен по себестоимости",
    );
  }

  if (isManualBelowMin) {
    status = "red";
    warnings.push("Указанная вручную цена ниже минимально допустимой");
  }

  const { expectedNetProfitEur, marginPct } = calculateExpectedProfitMetrics({
    sellingPriceEur: finalPriceEur,
    purchaseCostEur,
    extraCostEur,
    corporateTaxPct: normSettings.corporateTaxPct,
    paymentFeePct: normSettings.paymentFeePct,
  });

  return {
    country: countryCode,
    purchaseCostEur,
    extraCostEur,
    desiredNetProfitEur,
    qogitaRecommendedPriceEur,
    usedQogitaRecommended,
    competitorMeanEur,
    competitorMedianEur,
    competitorCount,
    localCompetitorCount,
    usedFallbackMarketData,
    marketRecommendedEur,
    minPriceEur,
    calculatedPriceEur,
    manualPriceEur,
    finalPriceEur,
    expectedNetProfitEur,
    marginPct,
    isUncompetitive,
    status,
    warnings,
  };
}

export function calculateAllCountriesPricing({
  productPricing = {},
  competitors = [],
  settings = DEFAULT_PRICING_SETTINGS,
}) {
  const normSettings = normalizePricingSettings(settings);
  const countries = {};
  const recommendedPrices = {};

  let hasRed = false;
  let hasYellow = false;

  for (const country of normSettings.supportedCountries) {
    const calc = calculateProductCountryPricing({
      productPricing,
      competitors,
      settings: normSettings,
      country,
    });
    countries[country] = calc;
    recommendedPrices[country] = calc.finalPriceEur;
    if (calc.status === "red") hasRed = true;
    else if (calc.status === "yellow") hasYellow = true;
  }

  const overallStatus = hasRed ? "red" : hasYellow ? "yellow" : "green";
  return {
    countries,
    recommendedPrices,
    overallStatus,
  };
}
