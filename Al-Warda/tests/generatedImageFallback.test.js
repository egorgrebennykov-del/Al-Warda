import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createServer } from "vite";
import { generatedImageFallback } from "../vite.config.js";

test("Vite serves local generated images and redirects missing ones to production", async () => {
  const root = await mkdtemp(join(tmpdir(), "al-warda-images-"));
  const publicDir = join(root, "public");
  const imageDir = join(publicDir, "assets", "img", "generated-products");
  await mkdir(imageDir, { recursive: true });
  const localName = `${"a".repeat(64)}.png`;
  const missingName = `${"b".repeat(64)}.png`;
  await writeFile(join(imageDir, localName), "local image");
  const vite = await createServer({
    configFile: false,
    root,
    publicDir,
    plugins: [generatedImageFallback()],
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
  });
  try {
    await vite.listen();
    const base = `http://127.0.0.1:${vite.httpServer.address().port}/assets/img/generated-products/`;
    const local = await fetch(base + localName, { redirect: "manual" });
    assert.equal(local.status, 200);
    assert.equal(await local.text(), "local image");
    const missing = await fetch(base + missingName, { redirect: "manual" });
    assert.equal(missing.status, 307);
    assert.equal(missing.headers.get("location"),
      `https://al-warda.egor-grebennykov.workers.dev/assets/img/generated-products/${missingName}`);
    assert.equal(missing.headers.get("cache-control"), "no-store");
    const unrelated = await fetch(base + "other.png", { redirect: "manual" });
    assert.notEqual(unrelated.status, 307);
  } finally {
    await vite.close();
    await rm(root, { recursive: true, force: true });
  }
});
