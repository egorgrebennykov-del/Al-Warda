import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { qogitaProductExport } from "../server/qogitaExports.js";

const originalFetch = globalThis.fetch;
const env = {
  QOGITA_CLIENT_ID: "client",
  QOGITA_CLIENT_SECRET: "secret",
  QOGITA_TOKEN_SCOPE: "catalog",
};
const id = "0f1c2d3e-4b5a-6978-8a9b-0c1d2e3f4a5b";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("creates and reads product exports via OAuth and API v1", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === "https://auth.qogita.com/oauth/v2/token") {
      assert.equal(options.headers.Authorization, `Basic ${btoa("client:secret")}`);
      assert.equal(options.body.get("grant_type"), "client_credentials");
      assert.equal(options.body.get("scope"), "catalog");
      return Response.json({ access_token: "oauth-token", expires_in: 3600 });
    }
    assert.equal(options.headers.Authorization, "Bearer oauth-token");
    return Response.json({ id, status: options.method === "POST" ? "pending" : "succeeded" });
  };
  assert.equal((await qogitaProductExport(env, { filters: {} })).status, "pending");
  assert.equal((await qogitaProductExport(env, { id })).status, "succeeded");
  assert.equal(calls[1].url, "https://api.qogita.com/v1/buyers/product-exports/");
  assert.equal(calls[1].options.body, "{}");
  assert.equal(calls[3].url, `https://api.qogita.com/v1/buyers/product-exports/${id}/`);
});

test("rejects missing credentials and malformed IDs before calling upstream", async () => {
  globalThis.fetch = () => { throw new Error("Unexpected upstream call"); };
  await assert.rejects(qogitaProductExport({}, {}), /credentials are not configured/);
  await assert.rejects(qogitaProductExport(env, { id: "../invalid" }), /Invalid Qogita export ID/);
});
