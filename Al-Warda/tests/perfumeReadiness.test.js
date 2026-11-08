import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getPerfumes } from "../utils/perfumes.js";
import { isReadyProduct } from "../server/worker.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("perfume image readiness", () => {
  it("only returns completed AI images and uses the generated image URL", async () => {
    const generatedImage =
      "https://mfvenfrmlkxqgvdtedet.supabase.co/storage/v1/object/public/product-images/ready.png";
    globalThis.fetch = async (input) => {
      const url = new URL(input, "https://shop.example");
      if (url.pathname === "/api/qogita/arabian-perfumes") {
        return Response.json([]);
      }
      assert.equal(url.pathname, "/rest/v1/stocks");
      return Response.json([
        {
          id: 1,
          name: "AI-ready perfume",
          image: "https://img.qogita.com/original.jpg",
          info: {
            contentGeneration: { provider: "claude" },
            imageGeneration: { status: "completed", imageUrl: generatedImage },
          },
        },
        {
          id: 2,
          name: "Original-only perfume",
          image: "https://img.qogita.com/original-only.jpg",
          info: {},
        },
        {
          id: 3,
          name: "Unmarked content with completed image",
          image: "https://img.qogita.com/original-invalid.jpg",
          info: {
            imageGeneration: {
              status: "completed",
              imageUrl: `/assets/img/generated-products/${"b".repeat(64)}.png`,
            },
          },
        },
        {
          id: 4,
          name: "Old template image",
          info: {
            imageGeneration: {
              status: "completed",
              imageUrl: "/assets/img/products/12345678.jpg",
            },
          },
        },
        {
          id: 5,
          name: "Unpublished image",
          info: {
            imageGeneration: {
              status: "publishing",
              imageUrl: `/assets/img/generated-products/${"c".repeat(64)}.png`,
            },
          },
        },
      ]);
    };

    const perfumes = await getPerfumes({ includeDropship: false });

    assert.equal(perfumes.length, 2);
    assert.equal(perfumes[0].name, "AI-ready perfume");
    assert.equal(perfumes[0].image, generatedImage);
    assert.equal(perfumes[0].fullCardImage, generatedImage);
    assert.equal(perfumes[1].name, "Unmarked content with completed image");
    assert.equal(perfumes[1].image, `/assets/img/generated-products/${"b".repeat(64)}.png`);
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
    assert.equal(isReadyProduct({
      info: {
        contentGeneration: { provider: "claude" },
        imageGeneration: {
          status: "completed",
          imageUrl: `/assets/img/generated-products/${"a".repeat(64)}.png`,
        },
      },
    }), true);
    assert.equal(isReadyProduct({
      info: {
        contentGeneration: { provider: "claude" },
        imageGeneration: {
          status: "publishing",
          imageUrl: `/assets/img/generated-products/${"a".repeat(64)}.png`,
        },
      },
    }), false);
    assert.equal(isReadyProduct({
      info: {
        imageGeneration: { status: "completed", imageUrl: "/assets/img/products/12345678.jpg" },
      },
    }), false);
  });
});
