import test from "node:test";
import assert from "node:assert/strict";
import worker from "../server/worker.js";

test("worker serves generated images with immutable Cache-Control and handles 304 If-None-Match", async () => {
  const hash = "c59139023de967621234a8560021765bac52508e10fb93c6bbf843103701c7b8";
  const path = `/assets/img/generated-products/${hash}.png`;

  // 1. Test fast 304 response on matching If-None-Match
  const req304 = new Request(`https://al-warda.local${path}`, {
    headers: {
      "if-none-match": `W/"${hash}"`,
    },
  });

  const res304 = await worker.fetch(req304, {}, {});
  assert.equal(res304.status, 304, "Must return 304 Not Modified");
  assert.equal(res304.headers.get("etag"), `W/"${hash}"`);
  assert.match(
    res304.headers.get("cache-control"),
    /public.*max-age=31536000.*immutable/,
    "Cache-Control must be immutable for 1 year",
  );
  assert.equal(await res304.text(), "", "304 body must be empty for minimum egress");
});
