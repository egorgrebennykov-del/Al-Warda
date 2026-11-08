import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { controlProductImageWorkflow } from "../server/productImageWorkflow.js";
import worker from "../server/worker.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function request(action, token = "github-token", origin = "https://shop.example") {
  return new Request("https://shop.example/api/admin/product-images/workflow", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ action, token }),
  });
}

describe("product image workflow control", () => {
  it("rejects cross-origin calls without contacting GitHub", async () => {
    globalThis.fetch = async () => { throw new Error("unexpected request"); };
    const result = await controlProductImageWorkflow(request("start", "token", "https://evil.example"));
    assert.equal(result.status, 403);
  });

  it("serves workflow status through the Worker route", async () => {
    globalThis.fetch = async () => Response.json({
      workflow_runs: [{ id: 21, status: "in_progress" }],
    });
    const result = await worker.fetch(request("status"), {}, {});
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { active: true, count: 1, statuses: ["in_progress"] });
  });

  it("dispatches the main workflow only if no run is active", async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? Response.json({ workflow_runs: [] })
        : new Response(null, { status: 204 });
    };
    const result = await controlProductImageWorkflow(request("start"));
    assert.equal(result.status, 202);
    assert.match(calls[1].url, /product-image-generation\.yml\/dispatches$/);
    assert.deepEqual(JSON.parse(calls[1].options.body), { ref: "main" });
    assert.equal(calls[1].options.headers.Authorization, "Bearer github-token");
  });

  it("rejects a duplicate start", async () => {
    globalThis.fetch = async () => Response.json({ workflow_runs: [{ id: 21, status: "queued" }] });
    const result = await controlProductImageWorkflow(request("start"));
    assert.equal(result.status, 409);
  });

  it("cancels every active run, not completed runs", async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      return calls.length === 1
        ? Response.json({ workflow_runs: [
          { id: 21, status: "in_progress" }, { id: 22, status: "queued" }, { id: 23, status: "completed" },
        ] })
        : new Response(null, { status: 202 });
    };
    const result = await controlProductImageWorkflow(request("stop"));
    assert.equal(result.status, 202);
    assert.equal((await result.json()).count, 2);
    assert.match(calls[1], /\/runs\/21\/cancel$/);
    assert.match(calls[2], /\/runs\/22\/cancel$/);
  });

  it("reports invalid tokens without leaking them", async () => {
    globalThis.fetch = async () => new Response(null, { status: 401 });
    const result = await controlProductImageWorkflow(request("status", "private-token"));
    assert.equal(result.status, 502);
    assert.doesNotMatch(JSON.stringify(await result.json()), /private-token/);
  });
});
