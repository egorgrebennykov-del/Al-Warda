import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { handleQogitaWorker } from "../server/qogitaWorker.js";
import { handleProductImageActions } from "../server/productImageActions.js";

const originalFetch = globalThis.fetch;
const origin = "https://shop.example";
const env = {
  SUPABASE_URL: "https://db.example",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  QOGITA_SESSION_SECRET: "test-session-secret",
  QOGITA_EXPORT_ACCOUNT_EMAIL: "owner@example.test",
  GITHUB_TOKEN: "test-github-token",
};
afterEach(() => { globalThis.fetch = originalFetch; });

test("start and stop require authenticated owner and send scoped GitHub requests", async () => {
  const calls = [];
  let running = false;
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url.endsWith("/auth/login/")) return Response.json({ accessToken: "qogita-token", accessExp: Date.now() + 3600000 });
    if (url.startsWith("https://db.example/rest/v1/user")) return Response.json([{ id: "1", status: "privileged" }]);
    calls.push({ url, options });
    if (url.includes("/runs?")) return Response.json({ workflow_runs: running && new URL(url).searchParams.get("status") === "in_progress" ? [{ id: 123, status: "in_progress", html_url: "https://github.com/run" }] : [] });
    if (url.endsWith("/dispatches")) return new Response(null, { status: 204 });
    if (url.endsWith("/123/cancel")) return new Response(null, { status: 202 });
    throw new Error(`Unexpected request: ${url}`);
  };
  const login = await handleQogitaWorker(new Request(`${origin}/api/qogita/configure`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@example.test", password: "example" }),
  }), env);
  const cookie = `${login.headers.get("set-cookie").split(";")[0]}; user=${encodeURIComponent(JSON.stringify({ id: "1" }))}`;
  const action = (body, extra = {}) => new Request(`${origin}/api/admin/product-images/actions`, {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json", ...extra },
    body: JSON.stringify(body),
  });
  assert.equal((await handleProductImageActions(action({ action: "start", count: 4, account: "secondary" }, { origin: "https://other.example" }), env)).status, 403);
  assert.equal((await handleProductImageActions(action({ action: "start", count: 0, account: "primary" }), env)).status, 400);
  assert.equal((await handleProductImageActions(action({ action: "start", count: 4, account: "secondary", regenerateCompleted: true }), env)).status, 202);
  const dispatch = calls.find((call) => call.url.endsWith("/dispatches"));
  assert.equal(dispatch.options.headers["User-Agent"], "Al-Warda-product-image-controls");
  assert.deepEqual(JSON.parse(dispatch.options.body), { ref: "main", inputs: { max_images: "4", cloudflare_account: "secondary", regenerate_completed: "true" } });
  const selected = [{ id: "7", imageUrl: `/assets/img/generated-products/${"a".repeat(64)}.png` }];
  assert.equal((await handleProductImageActions(action({ action: "delete", images: selected }), env)).status, 202);
  const deletion = calls.find((call) => call.url.includes("/product-image-delete.yml/dispatches"));
  assert.deepEqual(JSON.parse(JSON.parse(deletion.options.body).inputs.images), selected);
  assert.equal((await handleProductImageActions(action({ action: "delete", images: [{ id: "7", imageUrl: "/bad" }] }), env)).status, 400);
  running = true;
  assert.equal((await handleProductImageActions(action({ action: "start", count: 2, account: "primary", regenerateCompleted: false }), env)).status, 409);
  assert.equal((await handleProductImageActions(action({ action: "delete", images: selected }), env)).status, 409);
  assert.equal((await handleProductImageActions(action({ action: "stop" }), env)).status, 202);
  assert.ok(calls.some((call) => call.url.endsWith("/123/cancel")));
});

test("forged user cookie alone cannot control actions", async () => {
  globalThis.fetch = async () => Response.json([{ id: "1", status: "privileged" }]);
  const request = new Request(`${origin}/api/admin/product-images/actions`, {
    headers: { cookie: `user=${encodeURIComponent(JSON.stringify({ id: "1" }))}` },
  });
  const response = await handleProductImageActions(request, env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "QOGITA_OWNER_SESSION_REQUIRED");
});

test("wrong Qogita owner and missing server token are rejected", async () => {
  let githubCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/login/")) return Response.json({ accessToken: "qogita-token", accessExp: Date.now() + 3600000 });
    if (url.startsWith("https://db.example/rest/v1/user")) return Response.json([{ id: "1", status: "privileged" }]);
    githubCalls++;
    throw new Error("GitHub must not be called");
  };
  const login = await handleQogitaWorker(new Request(`${origin}/api/qogita/configure`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: "other@example.test", password: "example" }),
  }), env);
  const cookie = `${login.headers.get("set-cookie").split(";")[0]}; user=${encodeURIComponent(JSON.stringify({ id: "1" }))}`;
  const request = () => new Request(`${origin}/api/admin/product-images/actions`, { headers: { cookie } });
  assert.equal((await handleProductImageActions(request(), env)).status, 401);
  const noToken = { ...env, QOGITA_EXPORT_ACCOUNT_EMAIL: "other@example.test", GITHUB_TOKEN: "" };
  const response = await handleProductImageActions(request(), noToken);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /GITHUB_TOKEN/);
  assert.equal(githubCalls, 0);
});
