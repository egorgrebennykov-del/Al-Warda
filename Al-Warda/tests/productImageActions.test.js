import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
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

test("start and stop require a privileged user (no Qogita session) and send scoped GitHub requests", async () => {
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
  const cookie = `user=${encodeURIComponent(JSON.stringify({ id: "1" }))}`;
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
  for (const account of ["auto", "third", "fourth", "fifth"]) {
    assert.equal((await handleProductImageActions(action({ action: "start", count: 1, account, regenerateCompleted: false }), env)).status, 202);
    assert.equal(JSON.parse(calls.filter((call) => call.url.includes("/product-image-generation.yml/dispatches")).at(-1).options.body).inputs.cloudflare_account, account);
  }
  assert.equal((await handleProductImageActions(action({ action: "start", count: 1, account: "unknown", regenerateCompleted: false }), env)).status, 400);
  const selected = [{ id: "7", imageUrl: `/assets/img/generated-products/${"a".repeat(64)}.png` }];
  assert.equal((await handleProductImageActions(action({ action: "delete", images: selected }), env)).status, 202);
  const deletion = calls.find((call) => call.url.includes("/product-image-delete.yml/dispatches"));
  assert.deepEqual(JSON.parse(JSON.parse(deletion.options.body).inputs.images), selected);
  assert.equal((await handleProductImageActions(action({ action: "delete", images: [{ id: "7", imageUrl: "/bad" }] }), env)).status, 400);
  const many = Array.from({ length: 141 }, (_, index) => ({ id: String(index + 1), imageUrl: selected[0].imageUrl }));
  assert.equal((await handleProductImageActions(action({ action: "delete", images: many }), env)).status, 202);
  const tooMany = Array.from({ length: 401 }, (_, index) => ({ id: String(index + 1), imageUrl: selected[0].imageUrl }));
  assert.equal((await handleProductImageActions(action({ action: "delete", images: tooMany }), env)).status, 400);
  running = true;
  assert.equal((await handleProductImageActions(action({ action: "start", count: 2, account: "primary", regenerateCompleted: false }), env)).status, 409);
  assert.equal((await handleProductImageActions(action({ action: "delete", images: selected }), env)).status, 409);
  assert.equal((await handleProductImageActions(action({ action: "stop" }), env)).status, 202);
  assert.ok(calls.some((call) => call.url.endsWith("/123/cancel")));
  assert.equal((await handleProductImageActions(action({ action: "sync" }), env)).status, 200);
});

test("requests without a user cookie are rejected and do not need a Qogita session", async () => {
  globalThis.fetch = async () => { throw new Error("must not be called"); };
  const response = await handleProductImageActions(new Request(`${origin}/api/admin/product-images/actions`), env);
  assert.equal(response.status, 401);
});

test("missing server GitHub token is reported without calling GitHub", async () => {
  let githubCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://db.example/rest/v1/user")) return Response.json([{ id: "1", status: "privileged" }]);
    githubCalls++;
    throw new Error("GitHub must not be called");
  };
  const cookie = `user=${encodeURIComponent(JSON.stringify({ id: "1" }))}`;
  const response = await handleProductImageActions(new Request(`${origin}/api/admin/product-images/actions`, { headers: { cookie } }), { ...env, GITHUB_TOKEN: "" });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /GITHUB_TOKEN/);
  assert.equal(githubCalls, 0);
});
