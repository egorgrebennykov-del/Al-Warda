import {
  requirePrivilegedUser,
  syncCommittedPublishedStocks,
  getGlobalGenerationHalted,
  setGlobalGenerationHalted,
  savePendingDeletedImages,
} from "./productImageQueueAdmin.js";
import { isSameOrigin } from "./sameOrigin.js";

const API = "https://api.github.com/repos/egorgrebennykov-del/Al-Warda";
const WORKFLOW = "product-image-generation.yml";
const DELETE_WORKFLOW = "product-image-delete.yml";
const ACTIVE_STATUSES = new Set(["queued", "in_progress", "requested", "waiting", "pending"]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function github(env, path, options = {}) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured on the server");
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Al-Warda-product-image-controls",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub Actions request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function activeRuns(env) {
  const statuses = ["in_progress", "queued", "waiting", "pending"];
  const results = await Promise.all(
    statuses.map((status) =>
      github(env, `/actions/workflows/${WORKFLOW}/runs?branch=main&status=${status}&per_page=10`)
        .then((data) => (Array.isArray(data?.workflow_runs) ? data.workflow_runs : []))
        .catch(() => [])
    )
  );
  return results.flat();
}

async function deletionRuns(env) {
  try {
    const data = await github(env, `/actions/workflows/${DELETE_WORKFLOW}/runs?branch=main&per_page=10`);
    if (!Array.isArray(data?.workflow_runs)) return [];
    return data.workflow_runs;
  } catch {
    return [];
  }
}

export async function handleProductImageActions(request, env) {
  if (request.method !== "GET" && !isSameOrigin(request)) {
    return json({ error: "Invalid request origin" }, 403);
  }
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;
    const token = env.GITHUB_TOKEN || env.GH_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN is not configured on the server");
    if (request.method === "GET") {
      try {
        const [runs, deletions, globalHalted] = await Promise.all([
          activeRuns(env).catch(() => []),
          deletionRuns(env).catch(() => []),
          getGlobalGenerationHalted(env).catch(() => false),
        ]);
        return json({
          runs: runs.map(({ id, status, html_url }) => ({ id, status, url: html_url })),
          deletions: deletions.map(({ id, status, conclusion, html_url, created_at }) =>
            ({ id, status, conclusion, url: html_url, createdAt: created_at })),
          globalHalted,
        });
      } catch {
        return json({ runs: [], deletions: [], globalHalted: false }, 200);
      }
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    let body;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON request" }, 400);
      throw error;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request body" }, 400);
    if (body.action === "start") {
      const count = Number(body.count);
      if (!Number.isSafeInteger(count) || count < 1 || count > 100000) {
        return json({ error: "Image count must be an integer from 1 to 100000" }, 400);
      }
      const allowedAccounts = ["local", "auto", "primary", "secondary", "third", "fourth", "fifth"];
      const account = body.account || "local";
      if (!allowedAccounts.includes(account)) return json({ error: "Invalid Cloudflare account" }, 400);
      if (typeof body.regenerateCompleted !== "boolean") return json({ error: "Invalid regeneration option" }, 400);
      if ((await activeRuns(env)).length) return json({ error: "An image generation run is already active" }, 409);
      if ((await deletionRuns(env)).some((run) => ACTIVE_STATUSES.has(run.status))) {
        return json({ error: "Image deletion is already running; wait for it to finish" }, 409);
      }
      try {
        await setGlobalGenerationHalted(env, false);
      } catch (err) {
        console.warn("Could not unhalt global generation in DB:", err.message);
      }
      await github(env, `/actions/workflows/${WORKFLOW}/dispatches`, {
        method: "POST",
        body: JSON.stringify({ ref: "main", inputs: { max_images: String(count), cloudflare_account: account, regenerate_completed: String(body.regenerateCompleted) } }),
      });
      return json({ message: "Workflow dispatch accepted", globalHalted: false }, 202);
    }
    if (body.action === "stop" || body.action === "stop-global") {
      const runs = await activeRuns(env);
      for (const run of runs) await github(env, `/actions/runs/${run.id}/cancel`, { method: "POST" });
      try {
        await setGlobalGenerationHalted(env, true);
      } catch (err) {
        console.warn("Could not set global generation halted in DB:", err.message);
      }
      return json({
        message: runs.length
          ? "Cancellation requested and global generation halted"
          : "Global generation process halted",
        count: runs.length,
        globalHalted: true,
      }, 202);
    }
    if (body.action === "resume" || body.action === "resume-global") {
      try {
        await setGlobalGenerationHalted(env, false);
      } catch (err) {
        console.warn("Could not resume global generation in DB:", err.message);
      }
      return json({ message: "Global generation resumed", globalHalted: false }, 200);
    }
    if (body.action === "sync") {
      const count = await syncCommittedPublishedStocks(env);
      return json({ message: "Sync completed", synced: count }, 200);
    }
    if (body.action === "delete" || body.action === "delete-all") {
      if (body.action === "delete-all" || body.all === true || body.images === "all") {
        if ((await activeRuns(env)).length || (await deletionRuns(env)).some((run) => ACTIVE_STATUSES.has(run.status))) {
          return json({ error: "Image generation or deletion is already running; wait for it to finish" }, 409);
        }
        await github(env, `/actions/workflows/${DELETE_WORKFLOW}/dispatches`, {
          method: "POST",
          body: JSON.stringify({ ref: "main", inputs: { images: "all" } }),
        });
        return json({ message: "Image deletion queued for all products" }, 202);
      }

      if (!Array.isArray(body.images) || body.images.length < 1 ||
          body.images.some((item) => !item || !/^\d{1,20}$/.test(String(item.id)) ||
            typeof item.imageUrl !== "string" ||
            !/^\/assets\/img\/generated-products\/[a-f0-9]{64}\.png$/.test(item.imageUrl))) {
        return json({ error: "Select repository-generated images" }, 400);
      }
      if (new Set(body.images.map((item) => String(item.id))).size !== body.images.length) {
        return json({ error: "Duplicate product IDs are not allowed" }, 400);
      }
      if ((await activeRuns(env)).length || (await deletionRuns(env)).some((run) => ACTIVE_STATUSES.has(run.status))) {
        return json({ error: "Image generation or deletion is already running; wait for it to finish" }, 409);
      }

      const payloadString = JSON.stringify(body.images);
      let workflowInputs;
      if (payloadString.length < 60000) {
        workflowInputs = { images: payloadString };
      } else {
        await savePendingDeletedImages(env, body.images);
        workflowInputs = { images: "from_settings" };
      }

      await github(env, `/actions/workflows/${DELETE_WORKFLOW}/dispatches`, {
        method: "POST",
        body: JSON.stringify({ ref: "main", inputs: workflowInputs }),
      });
      return json({ message: "Image deletion queued" }, 202);
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error.message || "Could not manage GitHub Actions" }, 502);
  }
}
