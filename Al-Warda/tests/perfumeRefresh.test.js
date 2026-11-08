import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { getPerfumes } from "../utils/perfumes.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("refresh replaces a cached product image with the current published image", async () => {
  const oldImage = `/assets/img/generated-products/${"a".repeat(64)}.png`;
  const newImage = `/assets/img/generated-products/${"b".repeat(64)}.png`;
  let currentImage = oldImage;
  globalThis.fetch = async (input) => {
    if (String(input).includes("/rest/v1/stocks")) {
      return Response.json([{
        id: 1, name: "Test perfume", image: currentImage,
        info: { imageGeneration: { status: "completed", imageUrl: currentImage } },
      }]);
    }
    return Response.json([]);
  };
  assert.equal((await getPerfumes({ refresh: true }))[0].image, oldImage);
  currentImage = newImage;
  const updated = await getPerfumes({ refresh: true });
  assert.equal(updated[0].image, newImage);
  assert.equal(updated[0].fullCardImage, newImage);
  assert.equal(updated.length, 1);
});

test("a failed refresh reports the error and keeps the previous catalog", async () => {
  globalThis.fetch = async (input) => String(input).includes("/rest/v1/stocks")
    ? new Response("Unavailable", { status: 503 })
    : Response.json([]);
  await assert.rejects(getPerfumes({ refresh: true }), /HTTP 503/);
  assert.equal((await getPerfumes())[0].name, "Test perfume");
});
