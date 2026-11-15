import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getPerfumes,
  getPerfumeDetailsById,
  invalidateCatalogCache,
} from "../utils/perfumes.js";

const originalFetch = globalThis.fetch;
const GEN_IMG = `/assets/img/generated-products/${"a".repeat(64)}.png`;

afterEach(() => {
  globalThis.fetch = originalFetch;
  invalidateCatalogCache();
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("catalog / details split", () => {
  it("catalog query excludes `info` from select and filters completed server-side", async () => {
    let catalogUrl;
    globalThis.fetch = async (input) => {
      const url = new URL(input, "https://shop.example");
      if (url.pathname === "/api/qogita/arabian-perfumes")
        return jsonResponse([]);
      if (url.searchParams.get("slug") === "eq.site-settings")
        return jsonResponse([]);
      catalogUrl = url;
      return jsonResponse([]);
    };

    await getPerfumes({ includeDropship: false });

    const select = catalogUrl.searchParams.get("select");
    assert.ok(select, "catalog select must be set");
    assert.ok(
      !select.includes("info"),
      "catalog select must not include `info`",
    );
    assert.equal(
      catalogUrl.searchParams.get("info->imageGeneration->>status"),
      "eq.completed",
    );
  });

  it("details request filters by id and uses limit=1", async () => {
    let detailsUrl;
    globalThis.fetch = async (input) => {
      const url = new URL(input, "https://shop.example");
      if (url.searchParams.get("id")) {
        detailsUrl = url;
        return jsonResponse([
          { id: 1, name: "X", brand: "B", image: GEN_IMG, info: {} },
        ]);
      }
      return jsonResponse([]);
    };

    const obj = await getPerfumeDetailsById("1");

    assert.ok(obj);
    assert.equal(detailsUrl.searchParams.get("id"), "eq.1");
    assert.equal(detailsUrl.searchParams.get("limit"), "1");
    assert.ok(detailsUrl.searchParams.get("select").includes("info"));
  });

  it("two parallel detail calls for the same id perform one HTTP request", async () => {
    let detailsCalls = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(input, "https://shop.example");
      if (url.searchParams.get("id")) {
        detailsCalls++;
        return jsonResponse([
          { id: 1, name: "X", brand: "B", image: GEN_IMG, info: {} },
        ]);
      }
      return jsonResponse([]);
    };

    const [a, b] = await Promise.all([
      getPerfumeDetailsById("1"),
      getPerfumeDetailsById("1"),
    ]);

    assert.ok(a && b);
    assert.equal(detailsCalls, 1);
  });

  it("repeat call within TTL does not refetch", async () => {
    let detailsCalls = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(input, "https://shop.example");
      if (url.searchParams.get("id")) {
        detailsCalls++;
        return jsonResponse([
          { id: 1, name: "X", brand: "B", image: GEN_IMG, info: {} },
        ]);
      }
      return jsonResponse([]);
    };

    await getPerfumeDetailsById("1");
    await getPerfumeDetailsById("1");

    assert.equal(detailsCalls, 1);
  });

  it("refetches after the details TTL expires", async (t) => {
    t.mock.timers.enable({ apis: ["Date"] });
    try {
      let detailsCalls = 0;
      globalThis.fetch = async (input) => {
        const url = new URL(input, "https://shop.example");
        if (url.searchParams.get("id")) {
          detailsCalls++;
          return jsonResponse([
            { id: 1, name: "X", brand: "B", image: GEN_IMG, info: {} },
          ]);
        }
        return jsonResponse([]);
      };

      await getPerfumeDetailsById("1");
      assert.equal(detailsCalls, 1);

      t.mock.timers.tick(16 * 60 * 1000); // 16 minutes > 15 min TTL

      await getPerfumeDetailsById("1");
      assert.equal(detailsCalls, 2);
    } finally {
      t.mock.timers.reset();
    }
  });

  it("does not cache failed details requests", async () => {
    let detailsCalls = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(input, "https://shop.example");
      if (url.searchParams.get("id")) {
        detailsCalls++;
        if (detailsCalls === 1) return new Response("boom", { status: 500 });
        return jsonResponse([
          { id: 1, name: "X", brand: "B", image: GEN_IMG, info: {} },
        ]);
      }
      return jsonResponse([]);
    };

    await assert.rejects(() => getPerfumeDetailsById("1"));
    const obj = await getPerfumeDetailsById("1");

    assert.ok(obj);
    assert.equal(detailsCalls, 2);
  });

  it("does not throw when info.imageGeneration is missing", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input, "https://shop.example");
      if (url.searchParams.get("id")) {
        return jsonResponse([
          { id: 1, name: "X", brand: "B", image: GEN_IMG, info: {} },
        ]);
      }
      return jsonResponse([]);
    };

    const obj = await getPerfumeDetailsById("1");

    assert.ok(obj);
    assert.equal(obj.image, GEN_IMG);
    assert.equal(obj.fullCardImage, GEN_IMG);
  });

  it("catalog refresh invalidates stale per-product details", async () => {
    let price = 10;
    let detailsCalls = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(input, "https://shop.example");
      if (url.pathname === "/api/qogita/arabian-perfumes")
        return jsonResponse([]);
      if (url.searchParams.get("slug") === "eq.site-settings")
        return jsonResponse([]);
      if (url.searchParams.get("id")) {
        detailsCalls++;
        return jsonResponse([
          { id: 1, name: "X", brand: "B", price, image: GEN_IMG, info: {} },
        ]);
      }
      // catalog
      return jsonResponse([
        { id: 1, name: "X", brand: "B", price, image: GEN_IMG },
      ]);
    };

    const first = await getPerfumeDetailsById("1");
    assert.equal(first.price, 10);
    assert.equal(detailsCalls, 1);

    price = 20;
    await getPerfumes({ refresh: true, includeDropship: false });

    const second = await getPerfumeDetailsById("1");
    assert.equal(second.price, 20);
    assert.equal(detailsCalls, 2);
  });

  it("details request selects price and preserves the real database/MOV tier price instead of defaulting to 29.99", async () => {
    let requestedSelect = "";
    globalThis.fetch = async (input) => {
      const url = new URL(input, "https://shop.example");
      if (url.searchParams.get("id")) {
        requestedSelect = url.searchParams.get("select") || "";
        return jsonResponse([
          {
            id: 7340,
            name: "Just Jack Frontier Eau De Parfum",
            brand: "Just Jack",
            price: 11.73,
            image: GEN_IMG,
            info: { gtin: "6294015192315", price: 11.73 },
          },
        ]);
      }
      return jsonResponse([]);
    };

    const obj = await getPerfumeDetailsById("7340");
    assert.ok(obj);
    assert.ok(
      requestedSelect.includes("price"),
      "details query select must include `price` column",
    );
    assert.equal(
      obj.price,
      11.73,
      "price must match Qogita MOV <= 500 tier price (11.73)",
    );
    assert.notEqual(
      obj.price,
      29.99,
      "price must never fall back to 29.99 when a real price exists",
    );
  });
});
