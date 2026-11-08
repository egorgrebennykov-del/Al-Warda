import assert from "node:assert/strict";
import { test } from "node:test";
import { getPerfumes } from "../utils/perfumes.js";

test("a failed initial catalog request is not immediately repeated", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    if (String(input).includes("/rest/v1/stocks")) {
      return new Response("Unavailable", { status: 503 });
    }
    return Response.json([]);
  };
  try {
    assert.deepEqual(await getPerfumes(), []);
    assert.equal(calls.filter((url) => url.includes("/rest/v1/stocks")).length, 1);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
