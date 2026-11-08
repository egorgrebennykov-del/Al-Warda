import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import qogitaClient from "../server/qogitaClient.js";

test("Qogita credentials can be loaded after the client module", async () => {
  const originalEmail = process.env.QOGITA_EMAIL;
  const originalPassword = process.env.QOGITA_PASSWORD;
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.QOGITA_EMAIL;
    delete process.env.QOGITA_PASSWORD;
    assert.equal(qogitaClient.isConfigured(), false);
    await assert.rejects(qogitaClient.login(), /credentials not configured/);

    process.env.QOGITA_EMAIL = "buyer@example.test";
    process.env.QOGITA_PASSWORD = "test-password";
    assert.equal(qogitaClient.isConfigured(), true);
    assert.equal(qogitaClient.getStatus().email, "buy***@example.test");

    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.qogita.com/auth/login/");
      assert.deepEqual(JSON.parse(options.body), {
        email: "buyer@example.test",
        password: "test-password",
      });
      return Response.json({ accessToken: "test-token" });
    };
    assert.equal(await qogitaClient.login(), "test-token");
    assert.equal(qogitaClient.getStatus().isAuthenticated, true);
  } finally {
    if (originalEmail === undefined) delete process.env.QOGITA_EMAIL;
    else process.env.QOGITA_EMAIL = originalEmail;
    if (originalPassword === undefined) delete process.env.QOGITA_PASSWORD;
    else process.env.QOGITA_PASSWORD = originalPassword;
    globalThis.fetch = originalFetch;
    qogitaClient.accessToken = null;
    qogitaClient.tokenExpiresAt = 0;
  }
});
