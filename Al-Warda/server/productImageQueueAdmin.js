const MAX_DAILY_IMAGES = 160;
const DAILY_NEURON_BUDGET = 9_000;
const ESTIMATED_NEURONS_PER_IMAGE = 38.4;

class MissingServiceKeyError extends Error {
  constructor() {
    super("SUPABASE_SERVICE_ROLE_KEY is not configured on the server");
  }
}

function getServiceKey(env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SECRET_KEY;
  if (!key) throw new MissingServiceKeyError();
  return key;
}

function getSupabaseUrl(env) {
  const url = env?.SUPABASE_URL || env?.VITE_SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is not configured on the server");
  return url.replace(/\/+$/, "");
}

function parseCookieUser(cookieHeader = "") {
  const rawUser = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("user="))
    ?.slice(5);
  if (!rawUser) return null;
  try {
    const user = JSON.parse(decodeURIComponent(rawUser));
    return user && (typeof user.id === "string" || typeof user.id === "number")
      ? { ...user, id: String(user.id) }
      : null;
  } catch {
    return null;
  }
}

function isPrivilegedDatabaseRow(user) {
  if (!user) return false;
  const status = String(user.status || "").toLowerCase();
  if (["privileged", "priveleged", "привилегированный"].includes(status)) {
    return true;
  }
  const roles = [user.role, user.roles]
    .flat()
    .flatMap((value) => {
      if (typeof value !== "string") return [];
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value];
      } catch {
        return [value];
      }
    })
    .map((role) => role.toLowerCase().trim());
  return roles.some((role) =>
    ["admin", "developer", "vip", "privileged"].includes(role),
  );
}

async function requirePrivilegedUser(request, env) {
  const cookieHeader =
    request.headers?.get?.("cookie") || request.headers?.cookie || "";
  const cookieUser = parseCookieUser(cookieHeader);
  if (!cookieUser) {
    return { response: json({ error: "Authentication required" }, 401) };
  }
  const key = getServiceKey(env);
  const url = new URL(`${getSupabaseUrl(env)}/rest/v1/user`);
  url.searchParams.set("select", "id,status,role");
  url.searchParams.set("id", `eq.${cookieUser.id}`);
  url.searchParams.set("limit", "1");
  const result = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!result.ok) {
    throw new Error(`Could not verify admin access (${result.status})`);
  }
  const users = await result.json();
  if (!isPrivilegedDatabaseRow(users[0])) {
    return { response: json({ error: "Admin access required" }, 403) };
  }
  return { user: users[0] };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function fetchStockPage(env, key, from, to) {
  const url = new URL(`${getSupabaseUrl(env)}/rest/v1/stocks`);
  url.searchParams.set("select", "id,image,info");
  url.searchParams.set("order", "id.asc");
  const result = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Range-Unit": "items",
      Range: `${from}-${to}`,
    },
  });
  if (!result.ok) {
    throw new Error(`Could not load product image queue (${result.status})`);
  }
  const rows = await result.json();
  if (!Array.isArray(rows)) {
    throw new Error("Supabase stocks response was not a list");
  }
  return rows;
}

async function fetchAllStocks(env, key) {
  const pageSize = 500;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchStockPage(env, key, from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function hasRawImage(info) {
  const source = info?.rawImage;
  if (typeof source !== "string" || !/^https:\/\/.+/i.test(source)) return false;
  try {
    const url = new URL(source);
    return (
      url.hostname.endsWith(".qogita.com") &&
      !/no[-_]?image|not[_-]?found|missing|46e86f1d826c199f04588f35f1fd8afe|c1b79cffa1a5fa8aab226414b9e4a063/i.test(source)
    );
  } catch {
    return false;
  }
}

export async function getProductImageQueueStatus(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;

    const rows = await fetchAllStocks(env, getServiceKey(env));
    const today = new Date().toISOString().slice(0, 10);
    const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
    let eligible = 0;
    let attemptedToday = 0;
    for (const row of rows) {
      const info = row.info && typeof row.info === "object" ? row.info : {};
      if (!hasRawImage(info)) continue;
      eligible++;
      const job = info.imageGeneration || {};
      const status = job.status === "publishing"
        ? "processing"
        : counts[job.status] === undefined ? "pending" : job.status;
      counts[status]++;
      if (job.attemptedOn === today) attemptedToday++;
    }

    return json({
      total: eligible,
      ...counts,
      attemptedToday,
      dailyLimit: MAX_DAILY_IMAGES,
      estimatedNeuronsToday: Math.round(
        attemptedToday * ESTIMATED_NEURONS_PER_IMAGE * 10,
      ) / 10,
      neuronSafetyBudget: DAILY_NEURON_BUDGET,
      utcDay: today,
    });
  } catch (error) {
    if (error instanceof MissingServiceKeyError) {
      return json({ error: error.message, code: "SUPABASE_SERVICE_KEY_MISSING" }, 503);
    }
    return json({ error: error.message || "Could not load queue status" }, 500);
  }
}
