import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getPerfumes } from "../utils/perfumes.js";
import { isReadyProduct } from "../server/worker.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("perfume image readiness", () => {
  it("returns catalog rows using the top-level generated image", async () => {
    const generatedImage =
      "https://mfvenfrmlkxqgvdtedet.supabase.co/storage/v1/object/public/product-images/ready.png";
    globalThis.fetch = async (input) => {
      const url = new URL(input, "https://shop.example");
      if (url.pathname === "/api/qogita/arabian-perfumes") {
        return Response.json([]);
      }
      if (url.searchParams.get("slug") === "eq.site-settings") {
        return Response.json([]);
      }
      assert.equal(url.pathname, "/rest/v1/stocks");
      // Completed-image filtering now happens server-side via the PostgREST
      // filter; the client no longer re-checks info.imageGeneration.status.
      assert.equal(
        url.searchParams.get("info->imageGeneration->>status"),
        "eq.completed",
      );
      return Response.json([
        {
          id: 1,
          name: "AI-ready perfume",
          brand: "Brand",
          category: "Древесные",
          price: 10,
          image: generatedImage,
        },
        {
          id: 3,
          name: "Unmarked content with completed image",
          brand: "Brand",
          category: "Древесные",
          price: 10,
          image: `/assets/img/generated-products/${"b".repeat(64)}.png`,
        },
      ]);
    };

    const perfumes = await getPerfumes({ includeDropship: false });

    assert.equal(perfumes.length, 2);
    assert.equal(perfumes[0].name, "AI-ready perfume");
    assert.equal(perfumes[0].image, generatedImage);
    assert.equal(perfumes[0].fullCardImage, generatedImage);
    assert.equal(perfumes[1].name, "Unmarked content with completed image");
    assert.equal(
      perfumes[1].image,
      `/assets/img/generated-products/${"b".repeat(64)}.png`,
    );
  });

  it("requires a completed generated image regardless of content provider", () => {
    const imageGeneration = {
      status: "completed",
      imageUrl:
        "https://mfvenfrmlkxqgvdtedet.supabase.co/storage/v1/object/public/product-images/ready.png",
    };

    assert.equal(
      isReadyProduct({
        info: {
          contentGeneration: { provider: "claude" },
          imageGeneration,
        },
      }),
      true,
    );
    assert.equal(
      isReadyProduct({
        info: {
          contentGeneration: { provider: "template" },
          imageGeneration,
        },
      }),
      true,
    );
    assert.equal(
      isReadyProduct({
        info: {
          contentGeneration: { provider: "claude" },
          imageGeneration: {
            status: "completed",
            imageUrl: `/assets/img/generated-products/${"a".repeat(64)}.png`,
          },
        },
      }),
      true,
    );
    assert.equal(
      isReadyProduct({
        info: {
          contentGeneration: { provider: "claude" },
          imageGeneration: {
            status: "publishing",
            imageUrl: `/assets/img/generated-products/${"a".repeat(64)}.png`,
          },
        },
      }),
      false,
    );
    assert.equal(
      isReadyProduct({
        info: {
          imageGeneration: {
            status: "completed",
            imageUrl: "/assets/img/products/12345678.jpg",
          },
        },
      }),
      false,
    );
  });
});
