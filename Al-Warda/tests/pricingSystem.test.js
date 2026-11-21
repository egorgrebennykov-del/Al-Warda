import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_PRICING_SETTINGS,
  applyPsychologicalRounding,
  calculateAllCountriesPricing,
  calculateMedian,
  calculateMinPrice,
  calculateProductCountryPricing,
} from "../server/pricingEngine.js";
import { handlePricingRequest } from "../server/pricingService.js";

test("1. Product with purchase cost and multiple competitor prices computes median, discount, .99 rounding, and green status", () => {
  const res = calculateProductCountryPricing({
    productPricing: { purchaseCostEur: 12, extraCostEur: 1.5 },
    competitors: [
      { country: "BG", priceEur: 28 },
      { country: "BG", priceEur: 30 },
      { country: "BG", priceEur: 32 },
      // Invalid prices must be excluded
      { country: "BG", priceEur: 0 },
      { country: "BG", priceEur: -10 },
    ],
    settings: { ...DEFAULT_PRICING_SETTINGS, paymentFeePct: 2.9 },
    country: "BG",
  });

  // Median of [28, 30, 32] = 30; 30 * (1 - 0.08) = 27.60 -> .99 rounding -> 27.99
  assert.equal(res.competitorMedianEur, 30);
  assert.equal(res.competitorCount, 3);
  assert.equal(res.marketRecommendedEur, 27.6);
  assert.equal(res.calculatedPriceEur, 27.99);
  assert.equal(res.finalPriceEur, 27.99);
  assert.equal(res.status, "green");
  assert.equal(res.isUncompetitive, false);
  assert.ok(res.expectedNetProfitEur > 5);
  assert.ok(res.marginPct > 0);
});

test("2. Product with no competitor prices sets Pmin, yellow status, and warning", () => {
  const res = calculateProductCountryPricing({
    productPricing: { purchaseCostEur: 15, extraCostEur: 2 },
    competitors: [],
    settings: { ...DEFAULT_PRICING_SETTINGS, paymentFeePct: 3 },
    country: "RO",
  });

  // Pmin = (15 + 2 + 5 / 0.9) / 0.97 = (17 + 5.5556) / 0.97 = 23.25
  assert.equal(res.competitorMedianEur, null);
  assert.equal(res.marketRecommendedEur, null);
  assert.equal(res.minPriceEur, 23.25);
  assert.ok(res.finalPriceEur >= res.minPriceEur);
  assert.equal(res.finalPriceEur, 22.99 < 23.25 ? 23.99 : 22.99);
  assert.equal(res.status, "yellow");
  assert.ok(res.warnings.length > 0);
});

test("3. Competitor prices below minimum allowable price mark product red and enforce Pmin floor", () => {
  const res = calculateProductCountryPricing({
    productPricing: { purchaseCostEur: 22, extraCostEur: 3 },
    competitors: [
      { country: "GR", priceEur: 24 },
      { country: "GR", priceEur: 25 },
    ],
    settings: { ...DEFAULT_PRICING_SETTINGS, paymentFeePct: 2.9 },
    country: "GR",
  });

  // Pmin = (22 + 3 + 5/0.9) / 0.971 = 31.47
  // Market = 24.5 * 0.92 = 22.54 < 31.47 -> red, floored at >= 31.47 (.99 -> 31.99)
  assert.equal(res.isUncompetitive, true);
  assert.equal(res.status, "red");
  assert.ok(res.finalPriceEur >= res.minPriceEur);
  assert.equal(res.finalPriceEur, 31.99);
});

test("4. Single competitor price uses that exact price as median", () => {
  const res = calculateProductCountryPricing({
    productPricing: { purchaseCostEur: 10, extraCostEur: 1 },
    competitors: [{ country: "HU", priceEur: 26 }],
    settings: DEFAULT_PRICING_SETTINGS,
    country: "HU",
  });

  assert.equal(res.competitorMedianEur, 26);
  assert.equal(res.competitorCount, 1);
  assert.equal(res.marketRecommendedEur, 23.92);
  assert.equal(res.status, "green");
});

test("5. Outlier competitor prices use median instead of skewed arithmetic mean", () => {
  const median = calculateMedian([20, 22, 24, 25, 190]);
  assert.equal(median, 24);
});

test("6. Separate competitor prices per country (BG, GR, HU, RO) and global fallback warning", () => {
  const calc = calculateAllCountriesPricing({
    productPricing: { purchaseCostEur: 12, extraCostEur: 1 },
    competitors: [
      { country: "BG", priceEur: 30 },
      { country: "RO", priceEur: 35 },
      { country: "GR", priceEur: 40 },
      // HU intentionally missing -> falls back to overall median [30, 35, 40] = 35 with yellow warning
    ],
    settings: DEFAULT_PRICING_SETTINGS,
  });

  assert.equal(calc.countries.BG.competitorMedianEur, 30);
  assert.equal(calc.countries.BG.status, "green");
  assert.equal(calc.countries.RO.competitorMedianEur, 35);
  assert.equal(calc.countries.GR.competitorMedianEur, 40);
  assert.equal(calc.countries.HU.usedFallbackMarketData, true);
  assert.equal(calc.countries.HU.competitorMedianEur, 35);
  assert.equal(calc.countries.HU.status, "yellow");
});

test("7. Manual price override updates effective price, profit, margin, and warns if below Pmin", () => {
  const res = calculateProductCountryPricing({
    productPricing: {
      purchaseCostEur: 15,
      extraCostEur: 2,
      manualPrices: { BG: 19.99 },
    },
    competitors: [{ country: "BG", priceEur: 30 }],
    settings: DEFAULT_PRICING_SETTINGS,
    country: "BG",
  });

  assert.equal(res.manualPriceEur, 19.99);
  assert.equal(res.finalPriceEur, 19.99);
  assert.equal(res.status, "red");
  assert.ok(res.warnings.some((w) => w.includes("ниже минимально допустимой")));
});

test("8. Changing global settings (discount, profit, tax, fee, rounding) recalculates prices", () => {
  const customSettings = {
    targetDiscountPct: 12,
    desiredNetProfitEur: 8,
    corporateTaxPct: 15,
    paymentFeePct: 4,
    roundingMode: "none",
    vatMode: "oss",
    fallbackToGlobalMarket: false,
    supportedCountries: ["BG", "GR", "HU", "RO"],
  };

  const pMin = calculateMinPrice({
    purchaseCostEur: 10,
    extraCostEur: 2,
    desiredNetProfitEur: customSettings.desiredNetProfitEur,
    corporateTaxPct: customSettings.corporateTaxPct,
    paymentFeePct: customSettings.paymentFeePct,
  });
  // (10 + 2 + 8 / 0.85) / 0.96 = (12 + 9.4118) / 0.96 = 22.30
  assert.equal(pMin, 22.3);

  const res = calculateProductCountryPricing({
    productPricing: { purchaseCostEur: 10, extraCostEur: 2 },
    competitors: [{ country: "BG", priceEur: 30 }],
    settings: customSettings,
    country: "BG",
  });
  // 30 * (1 - 0.12) = 26.40 > 22.30, roundingMode = none -> 26.40
  assert.equal(res.finalPriceEur, 26.4);
  assert.equal(res.minPriceEur, 22.3);
});

test("9. Non-privileged / unauthenticated access to admin pricing endpoints is rejected (401/403)", async () => {
  const unauthReq = new Request("https://al-warda.local/api/admin/pricing/settings", {
    method: "GET",
  });
  const unauthRes = await handlePricingRequest(
    unauthReq,
    { NHOST_ADMIN_SECRET: "test-secret" },
    new URL(unauthReq.url),
  );
  assert.equal(unauthRes.status, 401);

  // Regular user cookie (role=user)
  const regularCookie = `user=${encodeURIComponent(JSON.stringify({ id: 999, role: "user", status: "active" }))}`;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ data: { app_user: [{ id: 999, role: "user", status: "active" }] } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  try {
    const regReq = new Request("https://al-warda.local/api/admin/pricing/products", {
      method: "GET",
      headers: { cookie: regularCookie },
    });
    const regRes = await handlePricingRequest(
      regReq,
      {
        NHOST_ADMIN_SECRET: "test-secret",
        NHOST_GRAPHQL_URL: "https://hasura.test/v1/graphql",
      },
      new URL(regReq.url),
    );
    assert.equal(regRes.status, 403);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("10. Psychological .99 rounding never produces a price below Pmin", () => {
  assert.equal(applyPsychologicalRounding(24.1, 18.0, "psych_99"), 23.99);
  assert.equal(applyPsychologicalRounding(24.1, 24.05, "psych_99"), 24.99);
  assert.equal(applyPsychologicalRounding(20.995, 20.995, "psych_99"), 21.99);
  assert.equal(applyPsychologicalRounding(15.2, 15.2, "psych_99"), 15.99);
});
