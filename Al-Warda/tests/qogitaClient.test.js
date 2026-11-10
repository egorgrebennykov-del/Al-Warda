import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import qogitaClient from "../server/qogitaClient.js";

test("Qogita credentials can be loaded after the client module", async () => {
  const originalEmail = process.env.QOGITA_EMAIL;
  const originalPassword = process.env.QOGITA_PASSWORD;
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.QOGITA_EMAIL;
    delete process.env.QOGITA_PASSWORD;
    assert.equal(qogitaClient.isConfigured(), false);
    await assert.rejects(qogitaClient.login(), /credentials not configured/);

    process.env.QOGITA_EMAIL = "buyer@example.test";
    process.env.QOGITA_PASSWORD = "test-password";
    assert.equal(qogitaClient.isConfigured(), true);
    assert.equal(qogitaClient.getStatus().email, "buy***@example.test");

    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.qogita.com/auth/login/");
      assert.deepEqual(JSON.parse(options.body), {
        email: "buyer@example.test",
        password: "test-password",
      });
      return Response.json({ accessToken: "test-token" });
    };
    assert.equal(await qogitaClient.login(), "test-token");
    assert.equal(qogitaClient.getStatus().isAuthenticated, true);
  } finally {
    if (originalEmail === undefined) delete process.env.QOGITA_EMAIL;
    else process.env.QOGITA_EMAIL = originalEmail;
    if (originalPassword === undefined) delete process.env.QOGITA_PASSWORD;
    else process.env.QOGITA_PASSWORD = originalPassword;
    globalThis.fetch = originalFetch;
    qogitaClient.accessToken = null;
    qogitaClient.tokenExpiresAt = 0;
  }
});


test("extractQogitaPriceForMov correctly selects lowest price from MOV <= 500 EUR tier", async () => {
  const { extractQogitaPriceForMov } = await import("../server/qogitaService.js");
  const { extractBestPriceForMov } = await import("../scripts/sync_qogita_mov_prices.js");

  // Replicating real Qogita variant offers for Washwashah (GTIN 6432452224637)
  const offersData = {
    offers: [
      {
        seller: "K9H4KWQ",
        tieredPrices: [
          { tierPrice: { amount: "8.17", currency: "EUR" }, tierMov: { amount: "15000.00" } },
          { tierPrice: { amount: "8.22", currency: "EUR" }, tierMov: { amount: "5000.00" } },
        ],
      },
      {
        seller: "66H4OX",
        tieredPrices: [
          { tierPrice: { amount: "8.42", currency: "EUR" }, tierMov: { amount: "15000.00" } },
          { tierPrice: { amount: "8.51", currency: "EUR" }, tierMov: { amount: "10000.00" } },
          { tierPrice: { amount: "8.59", currency: "EUR" }, tierMov: { amount: "1500.00" } },
          { tierPrice: { amount: "8.61", currency: "EUR" }, tierMov: { amount: "500.00" } },
        ],
      },
      {
        seller: "J0H59ZY",
        tieredPrices: [
          { tierPrice: { amount: "8.89", currency: "EUR" }, tierMov: { amount: "15000.00" } },
          { tierPrice: { amount: "8.90", currency: "EUR" }, tierMov: { amount: "500.00" } },
        ],
      },
    ],
  };

  const bestFromOffers = extractBestPriceForMov(offersData, 500);
  assert.equal(bestFromOffers.price, 8.61, "Best price for MOV <= 500 must be 8.61");
  assert.equal(bestFromOffers.seller, "66H4OX");
  assert.equal(bestFromOffers.mov, 500);

  const bestFromService = extractQogitaPriceForMov({ offers: offersData.offers }, 500);
  assert.equal(bestFromService.amount, 8.61, "Service price for MOV <= 500 must resolve to 8.61");
  assert.equal(bestFromService.hasEligibleTier, true);
});
