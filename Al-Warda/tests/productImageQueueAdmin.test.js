import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getProductImageQueueStatus,
  deleteFailedProductItems,
  requeueFailedProductItems,
  saveManualProductItem,
} from "../server/productImageQueueAdmin.js";
import { hasCompletedGeneratedImage } from "../utils/perfumes.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});
function request(path, cookie = "", options = {}) {
  return new Request(`https://shop.example${path}`, {
    ...options,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(options.headers || {}),
    },
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

  it("checks the database role and reports status counts, daily attempts, and failed items", async () => {
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
        {
          id: 2,
          name: "Rose EDP",
          brand: "Al Haramain",
          info: {
            rawImage: "https://img.qogita.com/2.jpg",
            imageGeneration: {
              status: "failed",
              attemptedOn: today,
              error: "Workers AI request failed (400): code 3030",
              failedAt: "2026-11-08T15:30:00Z",
              estimatedNeurons: 110,
            },
          },
        },
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
    assert.equal(body.accounts.length, 5);
    assert.equal(body.schedule.waitingImages, 2);
    assert.equal(body.schedule.hasWaitingImages, true);
    assert.equal(body.failedItems.length, 1);
    assert.equal(body.failedItems[0].id, 2);
    assert.equal(body.failedItems[0].name, "Rose EDP");
    assert.match(body.failedItems[0].error, /3030/);
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

  it("merges stored account quota timestamps and reports countdowns", async () => {
    const futureIso = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/rest/v1/user")) {
        return Response.json([{ id: "admin-1", status: "privileged" }]);
      }
      return Response.json([
        {
          id: 1,
          info: {
            rawImage: "https://img.qogita.com/1.jpg",
            imageGenerationAccountQuotas: {
              fifth: {
                limitedAt: "2026-11-09T10:00:00.000Z",
                availableAt: futureIso,
                updatedAt: futureIso,
              },
            },
          },
        },
      ]);
    };
    const response = await getProductImageQueueStatus(
      request("/api/admin/product-images/status", userCookie()),
      { SUPABASE_URL: "https://supabase.example", SUPABASE_SERVICE_ROLE_KEY: "server-only" },
    );
    const body = await response.json();
    const fifth = body.accounts.find((acc) => acc.id === "fifth");
    assert.equal(fifth.available, false);
    assert.equal(fifth.availableAt, futureIso);
    assert.ok(fifth.remainingMs > 3600 * 1000);
    assert.equal(body.schedule.allAccountsAvailable, false);
    assert.equal(body.schedule.autoStartReady, false);
  });

  it("allows privileged users to delete single or multiple failed items from stocks DB", async () => {
    const deletedQueries = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/rest/v1/user")) {
        return Response.json([{ id: "admin-1", status: "privileged" }]);
      }
      if (url.pathname.endsWith("/rest/v1/stocks") && init.method === "DELETE") {
        deletedQueries.push(url.searchParams.get("id"));
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const res = await deleteFailedProductItems(
      request("/api/admin/product-images/failed", userCookie(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ["5292", "5293", "5292", 4986] }),
      }),
      { SUPABASE_URL: "https://supabase.example", SUPABASE_SERVICE_ROLE_KEY: "server-only" },
    );
    const payload = await res.json();
    assert.equal(res.status, 200);
    assert.equal(payload.deletedCount, 3);
    assert.deepEqual(payload.ids, ["5292", "5293", "4986"]);
    assert.deepEqual(deletedQueries, ["in.(5292,5293,4986)"]);
  });

  it("returns failed items to pending", async () => {
    const patched = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/rest/v1/user")) return Response.json([{ id: "admin-1", status: "privileged" }]);
      if (init.method === "PATCH") {
        patched.push(JSON.parse(init.body).info.imageGeneration);
        return new Response(null, { status: 204 });
      }
      return Response.json([{ id: 7, info: { rawImage: "x", imageGeneration: { status: "failed", error: "e" } } }]);
    };
    const res = await requeueFailedProductItems(
      request("/api/admin/product-images/requeue", userCookie(), { method: "POST", body: JSON.stringify({ ids: ["7"] }) }),
      { SUPABASE_URL: "https://supabase.example", SUPABASE_SERVICE_ROLE_KEY: "k" },
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).requeuedCount, 1);
    assert.deepEqual(patched, [{ status: "pending" }]);
  });

  it("allows privileged users to manually configure a failed product, save it to DB, and mark completed", async () => {
    let patchedBody = null;
    let uploadedFile = null;

    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/rest/v1/user")) {
        return Response.json([{ id: "admin-1", status: "privileged" }]);
      }
      if (url.pathname.includes("/storage/v1/object/product-images/")) {
        uploadedFile = { url: url.toString(), headers: init.headers };
        return new Response(null, { status: 200 });
      }
      if (url.pathname.endsWith("/rest/v1/stocks") && init.method === "PATCH") {
        patchedBody = JSON.parse(init.body);
        return Response.json([{ id: 42, ...patchedBody }]);
      }
      if (url.pathname.endsWith("/rest/v1/stocks") && (!init.method || init.method === "GET")) {
        return Response.json([
          {
            id: 42,
            name: "Yara Lattafa 100ml",
            brand: "Lattafa",
            price: 28.5,
            currency: "EUR",
            image: "https://img.qogita.com/yara-raw.jpg",
            info: {
              rawImage: "https://img.qogita.com/yara-raw.jpg",
              imageGeneration: { status: "failed", error: "Flagged by AI safety filter" },
            },
          },
        ]);
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const res = await saveManualProductItem(
      request("/api/admin/product-images/manual-save", userCookie(), {
        method: "POST",
        body: JSON.stringify({
          id: 42,
          name: "Yara Lattafa",
          brand: "Lattafa",
          price: 32.0,
          currency: "EUR",
          category: "Восточные",
          categorySlug: "oriental",
          categoryEn: "Oriental",
          volume: "100 мл / 3.4 FL.OZ.",
          concentration: "Eau De Parfum",
          gender: "Женский",
          topNotes: ["Гелиотроп", "Орхидея", "Мандарин"],
          heartNotes: ["Гурманский аккорд", "Тропические фрукты"],
          baseNotes: ["Ваниль", "Сандал", "Мускус"],
          descriptionRu: "Роскошный восточный аромат Yara от Lattafa.",
          descriptionEn: "Exquisite oriental fragrance Yara by Lattafa.",
          imageData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        }),
      }),
      { SUPABASE_URL: "https://supabase.example", SUPABASE_SERVICE_ROLE_KEY: "server-only" },
    );

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.id, 42);
    assert.ok(uploadedFile);
    assert.ok(uploadedFile.url.includes("/storage/v1/object/product-images/manual-42-"));
    assert.equal(patchedBody.name, "Yara Lattafa");
    assert.equal(patchedBody.brand, "Lattafa");
    assert.equal(patchedBody.price, 32.0);
    assert.equal(patchedBody.info.imageGeneration.status, "completed");
    assert.equal(patchedBody.info.imageGeneration.manual, true);
    assert.equal(patchedBody.info.imageGeneration.failed, false);
    assert.ok(patchedBody.info.imageGeneration.imageUrl.includes("/storage/v1/object/public/product-images/manual-42-"));

    // Verify hasCompletedGeneratedImage recognizes the manually configured product
    assert.equal(
      hasCompletedGeneratedImage({
        image: patchedBody.image,
        info: patchedBody.info,
      }),
      true,
    );
  });
});
