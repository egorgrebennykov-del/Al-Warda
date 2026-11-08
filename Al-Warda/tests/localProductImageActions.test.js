import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Buffer } from "node:buffer";
import { afterEach, test } from "node:test";
import { localRequestUrl, localWebRequest } from "../server/localRequest.js";
import { createQogitaSessionCookie } from "../server/qogitaWorker.js";
import { handleProductImageActions } from "../server/productImageActions.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("local HTTP adapter forwards sessions and origin to Actions controls", async () => {
  const env = {
    SUPABASE_URL: "https://db.example",
    SUPABASE_SECRET_KEY: "test-secret",
    QOGITA_EXPORT_ACCOUNT_EMAIL: "owner@example.test",
    GITHUB_TOKEN: "test-token",
  };
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url.startsWith("https://db.example/rest/v1/user")) return Response.json([{ id: "1", status: "privileged" }]);
    calls.push({ url, options });
    if (url.includes("/runs?")) return Response.json({ workflow_runs: [] });
    if (url.endsWith("/dispatches")) return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${url}`);
  };
  const server = createServer(async (req, res) => {
    try {
      const request = await localWebRequest(req, async (incoming) => {
        const chunks = [];
        for await (const chunk of incoming) chunks.push(chunk);
        return Buffer.concat(chunks);
      });
      const response = await handleProductImageActions(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch (error) {
      res.writeHead(400);
      res.end(error.message);
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const session = await createQogitaSessionCookie(env, {
      token: "qogita-token", expires: Date.now() + 60000, email: "OWNER@example.test",
    });
    const cookie = `${session.split(";")[0]}; user=${encodeURIComponent(JSON.stringify({ id: "1" }))}`;
    const body = JSON.stringify({ action: "start", count: 3, account: "secondary", regenerateCompleted: true });
    const response = await originalFetch(`${base}/api/admin/product-images/actions`, {
      method: "POST", headers: { origin: base, cookie, "content-type": "application/json" }, body,
    });
    assert.equal(response.status, 202);
    assert.equal(JSON.parse(calls.find((call) => call.url.endsWith("/dispatches")).options.body).inputs.max_images, "3");
    const crossOrigin = await originalFetch(`${base}/api/admin/product-images/actions`, {
      method: "POST", headers: { origin: "http://attacker.example", cookie, "content-type": "application/json" }, body,
    });
    assert.equal(crossOrigin.status, 403);
    assert.throws(() => localRequestUrl({ headers: { host: "attacker.example" }, url: "/" }), /Only local hosts/);
  } finally {
    server.close();
    await once(server, "close");
  }
});
