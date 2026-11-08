import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { getProductImageQueueStatus } from "../server/productImageQueueAdmin.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});
function request(path, cookie = "") {
  return new Request(`https://shop.example${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

function userCookie(id = "admin-1") {
  return `user=${encodeURIComponent(JSON.stringify({ id }))}`;
}

describe("product image queue admin API", () => {
  it("rejects unauthenticated status requests before querying Supabase", async () => {
    let fetched = false;
    globalThis.fetch = async () => {
      fetched = true;
      throw new Error("unexpected request");
    };

    const response = await getProductImageQueueStatus(
      request("/api/admin/product-images/status"),
      {},
    );

    assert.equal(response.status, 401);
    assert.equal(fetched, false);
  });

  it("reports a missing server key without displaying empty queue statistics", async () => {
    let fetched = false;
    globalThis.fetch = async () => {
      fetched = true;
      throw new Error("unexpected request");
    };

    const response = await getProductImageQueueStatus(
      request("/api/admin/product-images/status", userCookie()),
      { SUPABASE_URL: "https://supabase.example" },
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server",
      code: "SUPABASE_SERVICE_KEY_MISSING",
    });
    assert.equal(fetched, false);
  });

  it("checks the database role and reports status counts and daily attempts", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const calls = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      calls.push(url.pathname);
      if (url.pathname.endsWith("/rest/v1/user")) {
        return Response.json([{ id: "admin-1", status: "privileged", role: "admin" }]);
      }
      return Response.json([
        { id: 1, info: { rawImage: "https://img.qogita.com/1.jpg", imageGeneration: { status: "completed" } } },
        { id: 2, info: { rawImage: "https://img.qogita.com/2.jpg", imageGeneration: { status: "failed", attemptedOn: today, estimatedNeurons: 110 } } },
        { id: 3, info: { rawImage: "https://img.qogita.com/3.jpg" } },
      ]);
    };

    const response = await getProductImageQueueStatus(
      request("/api/admin/product-images/status", userCookie()),
      { SUPABASE_URL: "https://supabase.example", SUPABASE_SERVICE_ROLE_KEY: "server-only" },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.total, 3);
    assert.equal(body.completed, 1);
    assert.equal(body.failed, 1);
    assert.equal(body.pending, 1);
    assert.equal(body.attemptedToday, 1);
    assert.deepEqual(calls, ["/rest/v1/user", "/rest/v1/stocks"]);
  });

  it("lists completed image records newest first, with unknown dates last", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/rest/v1/user")) {
        return Response.json([{ id: "admin-1", status: "privileged" }]);
      }
      assert.equal(url.searchParams.get("select"), "id,name,brand,image,info");
      return Response.json([
        { id: 1, name: "Old", info: { imageGeneration: { status: "completed", imageUrl: "https://cdn.example/old.png", completedAt: "2025-01-01T12:00:00Z" } } },
        { id: 2, name: "Unknown", image: "https://cdn.example/unknown.png", info: { imageGeneration: { status: "completed", completedAt: "invalid" } } },
        { id: 3, name: "New", brand: "Brand", info: { imageGeneration: { status: "completed", imageUrl: "/assets/img/generated-products/new.png", completedAt: "2026-01-01T12:00:00Z" } } },
        { id: 4, name: "Publishing", info: { imageGeneration: { status: "publishing", imageUrl: "https://cdn.example/pending.png" } } },
        { id: 5, name: "Unsafe", info: { imageGeneration: { status: "completed", imageUrl: "javascript:alert(1)" } } },
      ]);
    };
    const response = await getProductImageQueueStatus(
      request("/api/admin/product-images/status", userCookie()),
      { SUPABASE_URL: "https://supabase.example", SUPABASE_SERVICE_ROLE_KEY: "server-only" },
    );
    const body = await response.json();
    assert.deepEqual(body.images.map((image) => image.id), [3, 1, 2]);
    assert.equal(body.images[0].name, "New");
    assert.equal(body.images[0].brand, "Brand");
    assert.equal(body.images[2].completedAt, null);
  });
});
