import test from "node:test";
import assert from "node:assert/strict";
import {
  BLAZO_STORE_ID,
  BLAZO_TRACK_URL,
  normalizeDeliveryCountryCode,
  calculateBlazoShippingQuote,
} from "../utils/blazoDelivery.js";

test("normalizeDeliveryCountryCode maps localized country names to ISO codes", () => {
  assert.equal(normalizeDeliveryCountryCode("Болгария"), "BG");
  assert.equal(normalizeDeliveryCountryCode("България"), "BG");
  assert.equal(normalizeDeliveryCountryCode("Romania"), "RO");
  assert.equal(normalizeDeliveryCountryCode("Греция"), "GR");
  assert.equal(normalizeDeliveryCountryCode("Венгрия"), "HU");
});

test("calculateBlazoShippingQuote computes regional Blazo carrier rates", () => {
  const bgOffice = calculateBlazoShippingQuote({
    country: "Болгария",
    city: "София",
    street: "ул. Витоша 10",
    methodId: "econt_office",
  });
  assert.equal(bgOffice.countryCode, "BG");
  assert.equal(bgOffice.shippingCostEur, 3.9);
  assert.equal(bgOffice.carrier, "Econt");
  assert.equal(bgOffice.storeId, BLAZO_STORE_ID);
  assert.equal(bgOffice.trackUrl, BLAZO_TRACK_URL);

  const bgDoor = calculateBlazoShippingQuote({
    country: "Bulgaria",
    city: "Varna",
    methodId: "bg_door",
  });
  assert.equal(bgDoor.shippingCostEur, 4.9);

  const roLocker = calculateBlazoShippingQuote({
    country: "Румыния",
    city: "Bucharest",
  });
  assert.equal(roLocker.countryCode, "RO");
  assert.equal(roLocker.shippingCostEur, 4.9);

  const huCourier = calculateBlazoShippingQuote({
    country: "Hungary",
    city: "Budapest",
  });
  assert.equal(huCourier.countryCode, "HU");
  assert.equal(huCourier.shippingCostEur, 5.0);
});

test("calculateBlazoShippingQuote applies Blazo API free-shipping threshold when configured", () => {
  const quote = calculateBlazoShippingQuote({
    country: "BG",
    city: "Sofia",
    subtotalEur: 120,
    blazoConfig: { fromApi: true, freeShippingAboveEur: 100 },
  });
  assert.equal(quote.source, "blazo_api");
  assert.equal(quote.shippingCostEur, 0);
});
