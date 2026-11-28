import test from "node:test";
import assert from "node:assert/strict";
import {
  getAromadealProductUrl,
  buildAromadealCartPermalink,
} from "../utils/aromadealProductUrls.js";

test("getAromadealProductUrl resolves explicit aromadealUrl, handle, or search fallback", () => {
  assert.equal(
    getAromadealProductUrl({
      name: "Lattafa Khamrah",
      info: {
        aromadealUrl: "https://aromadeal.de/products/lattafa-khamrah-eau-de-parfum-unisex-100-ml",
      },
    }),
    "https://aromadeal.de/products/lattafa-khamrah-eau-de-parfum-unisex-100-ml",
  );

  assert.equal(
    getAromadealProductUrl({
      name: "Lattafa Asad",
      info: { aromadealHandle: "lattafa-asad-100ml" },
    }),
    "https://aromadeal.de/products/lattafa-asad-100ml",
  );

  assert.equal(
    getAromadealProductUrl({ name: "Armaf Club De Nuit", brand: "Armaf" }),
    "https://aromadeal.de/search?q=Armaf%20Club%20De%20Nuit",
  );
});

test("buildAromadealCartPermalink builds Shopify cart permalink with aggregated quantities", () => {
  assert.equal(
    buildAromadealCartPermalink([
      { id: "1", aromadealVariantId: "4912345678", quantity: 2 },
      { id: "2", info: { aromadealVariantId: "4987654321" }, quantity: 1 },
      { id: "3", aromadealVariantId: "4912345678", quantity: 1 },
    ]),
    "https://aromadeal.de/cart/4912345678:3,4987654321:1",
  );

  assert.equal(buildAromadealCartPermalink([{ id: "99", quantity: 1 }]), "");
});
