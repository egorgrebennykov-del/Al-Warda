import test from "node:test";
import assert from "node:assert/strict";
import { getAromadealProductUrl } from "../utils/aromadealProductUrls.js";

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
