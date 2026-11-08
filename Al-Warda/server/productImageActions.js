import { readQogitaSession } from "./qogitaWorker.js";
import { requirePrivilegedUser } from "./productImageQueueAdmin.js";

const API = "https://api.github.com/repos/egorgrebennykov-del/Al-Warda";
const WORKFLOW = "product-image-generation.yml";

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
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
  const runs = [];
  for (const status of ["queued", "in_progress", "requested", "waiting", "pending"]) {
    for (let page = 1; ; page++) {
      const data = await github(env, `/actions/workflows/${WORKFLOW}/runs?branch=main&status=${status}&per_page=100&page=${page}`);
      if (!Array.isArray(data?.workflow_runs)) throw new Error("Invalid GitHub Actions response");
      runs.push(...data.workflow_runs);
      if (data.workflow_runs.length < 100) break;
    }
  }
  return runs;
}

export async function handleProductImageActions(request, env) {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin) {
    return json({ error: "Invalid request origin" }, 403);
  }
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;
    const owner = env.QOGITA_EXPORT_ACCOUNT_EMAIL?.trim().toLowerCase();
    if (!owner) return json({ error: "QOGITA_EXPORT_ACCOUNT_EMAIL is not configured on the server" }, 503);
    const session = await readQogitaSession(request, env);
    if (!session || session.accountEmail !== owner) {
      return json({ error: "Sign in to the configured Qogita owner account in connection settings", code: "QOGITA_OWNER_SESSION_REQUIRED" }, 401);
    }

    if (request.method === "GET") {
      const runs = await activeRuns(env);
      return json({ runs: runs.map(({ id, status, html_url }) => ({ id, status, url: html_url })) });
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
      if (!["primary", "secondary"].includes(body.account)) return json({ error: "Invalid Cloudflare account" }, 400);
      if (typeof body.regenerateCompleted !== "boolean") return json({ error: "Invalid regeneration option" }, 400);
      if ((await activeRuns(env)).length) return json({ error: "An image generation run is already active" }, 409);
      await github(env, `/actions/workflows/${WORKFLOW}/dispatches`, {
        method: "POST",
        body: JSON.stringify({ ref: "main", inputs: { max_images: String(count), cloudflare_account: body.account, regenerate_completed: String(body.regenerateCompleted) } }),
      });
      return json({ message: "Workflow dispatch accepted" }, 202);
    }
    if (body.action === "stop") {
      const runs = await activeRuns(env);
      if (!runs.length) return json({ error: "No active image generation run" }, 409);
      for (const run of runs) await github(env, `/actions/runs/${run.id}/cancel`, { method: "POST" });
      return json({ message: "Cancellation requested", count: runs.length }, 202);
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error.message || "Could not manage GitHub Actions" }, 502);
  }
}
