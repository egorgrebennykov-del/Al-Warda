const API_BASE = "https://api.github.com/repos/egorgrebennykov-del/Al-Warda/actions";
const WORKFLOW = "product-image-generation.yml";
const ACTIVE_STATUSES = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function githubRequest(token, path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub Actions request failed (HTTP ${response.status}). Check the token and its Actions permissions.`);
  }
  return response;
}

async function activeRuns(token) {
  const runs = [];
  for (let page = 1; page <= 10; page++) {
    const response = await githubRequest(token, `/workflows/${WORKFLOW}/runs?branch=main&per_page=100&page=${page}`);
    const data = await response.json();
    if (!Array.isArray(data.workflow_runs)) throw new Error("Invalid GitHub Actions response");
    runs.push(...data.workflow_runs.filter((run) => ACTIVE_STATUSES.has(run.status)));
    if (data.workflow_runs.length < 100) return runs;
  }
  throw new Error("Too many workflow runs to safely determine the current state");
}

export async function controlProductImageWorkflow(request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin ||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Same-origin JSON request required" }, 403);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const token = body?.token;
  if (typeof token !== "string" || !token.trim() || token.length > 512 || /[\r\n]/.test(token)) {
    return json({ error: "GitHub token required" }, 400);
  }
  if (!["status", "start", "stop"].includes(body.action)) {
    return json({ error: "Unknown action" }, 400);
  }

  try {
    const runs = await activeRuns(token.trim());
    if (body.action === "status") {
      return json({ active: runs.length > 0, count: runs.length, statuses: runs.map((run) => run.status) });
    }
    if (body.action === "start") {
      if (runs.length) return json({ error: "A generation workflow is already active" }, 409);
      await githubRequest(token.trim(), `/workflows/${WORKFLOW}/dispatches`, {
        method: "POST",
        body: JSON.stringify({ ref: "main" }),
      });
      return json({ message: "Generation requested" }, 202);
    }
    if (!runs.length) return json({ error: "No active generation workflow found" }, 409);
    for (const run of runs) {
      if (!Number.isSafeInteger(run.id) || run.id <= 0) throw new Error("Invalid workflow run ID");
      await githubRequest(token.trim(), `/runs/${run.id}/cancel`, { method: "POST" });
    }
    return json({ message: "Cancellation requested", count: runs.length }, 202);
  } catch (error) {
    console.error("Product image workflow control failed:", error.message);
    return json({ error: error.message }, 502);
  }
}
