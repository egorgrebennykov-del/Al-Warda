import assert from "node:assert/strict";
import { test } from "node:test";
import { getPerfumes, getPerfumeById } from "../utils/perfumes.js";

test("concurrent initial loads share requests and cached product navigation avoids refetch", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const image = `/assets/img/generated-products/${"a".repeat(64)}.png`;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (String(input).includes("/rest/v1/stocks")) {
      return Response.json([{ id: 7, name: "Test", image, info: { imageGeneration: { status: "completed", imageUrl: image } } }]);
    }
    return Response.json([]);
  };
  try {
    const [catalog, product] = await Promise.all([getPerfumes(), getPerfumeById("test-7")]);
    assert.equal(catalog.length, 1);
    assert.equal(product.id, "7");
    assert.equal(calls.length, 3);
    assert.equal((await getPerfumeById("test-7")).id, "7");
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
