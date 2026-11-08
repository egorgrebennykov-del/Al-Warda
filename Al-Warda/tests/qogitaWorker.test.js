import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { handleQogitaWorker } from "../server/qogitaWorker.js";
import worker from "../server/worker.js";

const originalFetch = globalThis.fetch;
const env = { QOGITA_SESSION_SECRET: "test-secret" };
const origin = "https://example.test";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("Qogita session requires login and rejects cross-origin changes", async () => {
  const status = await worker.fetch(new Request(`${origin}/api/qogita/status`), env);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).isConfigured, false);
  const unauth = await handleQogitaWorker(new Request(`${origin}/api/qogita/cart`), env);
  assert.equal(unauth.status, 401);
  const forged = await handleQogitaWorker(new Request(`${origin}/api/qogita/cart`, {
    headers: { cookie: "__Host-qogita_session=forged.invalid" },
  }), env);
  assert.equal(forged.status, 401);
  const crossOrigin = await handleQogitaWorker(new Request(`${origin}/api/qogita/configure`, {
    method: "POST",
    headers: { origin: "https://attacker.test" },
  }), env);
  assert.equal(crossOrigin.status, 403);
});

test("Qogita login encrypts session and forwards authorized cart requests", async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async (url, options) => {
    upstreamCalls++;
    if (url.endsWith("/auth/login/")) {
      assert.deepEqual(JSON.parse(options.body), { email: "buyer@example.test", password: "example-password" });
      return Response.json({ accessToken: "upstream-token", accessExp: Date.now() + 3600000 });
    }
    assert.equal(options.headers.Authorization, "Bearer upstream-token");
    if (url.endsWith("/buyers/carts/active/")) return Response.json({ itemsCount: 0 });
    if (url.endsWith("/buyers/carts/active/allocations/")) return Response.json({ results: [] });
    throw new Error(`Unexpected upstream URL: ${url}`);
  };
  const login = await handleQogitaWorker(new Request(`${origin}/api/qogita/configure`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: "buyer@example.test", password: "example-password" }),
  }), env);
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.ok(!cookie.includes("upstream-token"));
  const cart = await handleQogitaWorker(new Request(`${origin}/api/qogita/cart`, { headers: { cookie } }), env);
  assert.equal(cart.status, 200);
  assert.deepEqual(await cart.json(), { cart: { itemsCount: 0 }, allocations: [], totalAllocations: 0 });
  assert.equal(upstreamCalls, 3);
});

test("catalog export is restricted to the configured Qogita account", async () => {
  const exportEnv = {
    ...env,
    QOGITA_EXPORT_ACCOUNT_EMAIL: "owner@example.test",
    QOGITA_CLIENT_ID: "client",
    QOGITA_CLIENT_SECRET: "secret",
    QOGITA_TOKEN_SCOPE: "catalog",
  };
  const id = "0f1c2d3e-4b5a-6978-8a9b-0c1d2e3f4a5b";
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/auth/login/")) return Response.json({ accessToken: "account-token" });
    if (url === "https://auth.qogita.com/oauth/v2/token") return Response.json({ access_token: "oauth-token" });
    if (url === "https://api.qogita.com/v1/buyers/product-exports/") {
      assert.equal(options.method, "POST");
      return Response.json({ id, status: "pending" }, { status: 202 });
    }
    throw new Error(`Unexpected upstream URL: ${url}`);
  };
  async function login(email) {
    const response = await handleQogitaWorker(new Request(`${origin}/api/qogita/configure`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email, password: "example" }),
    }), exportEnv);
    return response.headers.get("set-cookie");
  }
  async function start(cookie) {
    return handleQogitaWorker(new Request(`${origin}/api/qogita/catalog/download`, {
      method: "POST",
      headers: { origin, cookie, "content-type": "application/json" },
      body: "{}",
    }), exportEnv);
  }
  assert.equal((await start(await login("other@example.test"))).status, 403);
  const response = await start(await login("owner@example.test"));
  assert.equal(response.status, 202);
  assert.equal((await response.json()).result.id, id);
});
