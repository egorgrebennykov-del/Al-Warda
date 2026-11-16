import test from "node:test";
import assert from "node:assert/strict";
import { handleRestProxy } from "../server/hasuraProxy.js";

test("hasuraProxy sets ETag and public Cache-Control on GET and returns 304 on match", async () => {
  const fakeEnv = {
    NHOST_ADMIN_SECRET: "test-secret",
    NHOST_GRAPHQL_URL: "https://mock.hasura.local/v1",
  };

  const mockRows = [{ id: 1, name: "Test Perfume", brand: "Afnan" }];

  // Mock global fetch to return mock GraphQL response
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        stocks: mockRows,
      },
    }),
  });

  try {
    const req1 = new Request("http://localhost/api/rest/v1/stocks?select=id,name,brand", {
      method: "GET",
    });
    const res1 = await handleRestProxy(req1, fakeEnv);
    assert.equal(res1.status, 200);
    const etag = res1.headers.get("etag");
    assert.ok(etag, "ETag must be present");
    assert.match(res1.headers.get("cache-control"), /public.*max-age=60/);

    const body1 = await res1.json();
    assert.deepEqual(body1, mockRows);

    // Second request with If-None-Match
    const req2 = new Request("http://localhost/api/rest/v1/stocks?select=id,name,brand", {
      method: "GET",
      headers: {
        "if-none-match": etag,
      },
    });
    const res2 = await handleRestProxy(req2, fakeEnv);
    assert.equal(res2.status, 304, "Must return HTTP 304 Not Modified");
    assert.equal(await res2.text(), "", "HTTP 304 must have empty body to save egress");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
