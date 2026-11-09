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

export async function requirePrivilegedUser(request, env) {
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
  url.searchParams.set("select", "id,name,brand,image,info");
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

const ACCOUNT_DEFS = [
  { id: "primary", index: 1, labelRu: "1. Основной (primary)", labelEn: "1. Primary (primary)" },
  { id: "secondary", index: 2, labelRu: "2. Второй (secondary)", labelEn: "2. Secondary (secondary)" },
  { id: "third", index: 3, labelRu: "3. Третий (third)", labelEn: "3. Third (third)" },
  { id: "fourth", index: 4, labelRu: "4. Четвёртый (fourth)", labelEn: "4. Fourth (fourth)" },
  { id: "fifth", index: 5, labelRu: "5. Пятый (fifth)", labelEn: "5. Fifth (fifth)" },
];

export const DEFAULT_ACCOUNT_QUOTAS = {
  primary: {
    limitedAt: "2026-11-08T14:38:00.000Z",
    partialAvailableAt: "2026-11-09T10:06:19.000Z",
    availableAt: "2026-11-09T14:38:00.000Z",
    updatedAt: "2026-11-08T14:38:00.000Z",
  },
  secondary: {
    limitedAt: "2026-11-08T14:53:00.000Z",
    availableAt: "2026-11-09T14:53:00.000Z",
    updatedAt: "2026-11-08T14:53:00.000Z",
  },
  third: {
    limitedAt: "2026-11-08T15:25:17.000Z",
    availableAt: "2026-11-09T15:25:17.000Z",
    updatedAt: "2026-11-08T15:25:17.000Z",
  },
  fourth: {
    limitedAt: "2026-11-08T15:46:19.000Z",
    availableAt: "2026-11-09T15:46:19.000Z",
    updatedAt: "2026-11-08T15:46:19.000Z",
  },
  fifth: {
    limitedAt: "2026-11-08T16:07:14.000Z",
    availableAt: "2026-11-09T16:07:14.000Z",
    updatedAt: "2026-11-08T16:07:14.000Z",
  },
};

function validIsoTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function quotaEntryRank(entry) {
  if (!entry || typeof entry !== "object") return -Infinity;
  for (const field of ["updatedAt", "availableAt", "limitedAt", "lastUsedAt"]) {
    const parsed = Date.parse(entry[field] || "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return -Infinity;
}

function buildAccountStatusAndSchedule(mergedQuotas, counts, nowMs = Date.now()) {
  const accounts = ACCOUNT_DEFS.map((def) => {
    const raw = mergedQuotas[def.id] || {};
    const limitedAt = validIsoTimestamp(raw.limitedAt);
    const availableAt = validIsoTimestamp(raw.availableAt);
    const partialAvailableAt = validIsoTimestamp(raw.partialAvailableAt);
    const lastUsedAt = validIsoTimestamp(raw.lastUsedAt);
    const availableAtMs = availableAt ? Date.parse(availableAt) : 0;
    const available = !availableAtMs || nowMs >= availableAtMs;
    const remainingMs = available ? 0 : Math.max(0, availableAtMs - nowMs);
    return {
      id: def.id,
      index: def.index,
      labelRu: def.labelRu,
      labelEn: def.labelEn,
      limitedAt,
      partialAvailableAt: !available && partialAvailableAt && Date.parse(partialAvailableAt) < availableAtMs
        ? partialAvailableAt
        : null,
      availableAt,
      lastUsedAt,
      available,
      remainingMs,
    };
  });

  const unavailable = accounts.filter((account) => !account.available && account.availableAt);
  const sortedByAvailability = [...unavailable].sort(
    (a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt),
  );
  const nextAccountAvailableAt = sortedByAvailability[0]?.availableAt || null;
  const allAccountsAvailableAt = sortedByAvailability.at(-1)?.availableAt || null;
  const allAccountsAvailable = unavailable.length === 0;
  const waitingImages = (counts.pending || 0) + (counts.failed || 0);
  const hasWaitingImages = waitingImages > 0;

  return {
    accounts,
    schedule: {
      waitingImages,
      hasWaitingImages,
      availableAccountsCount: accounts.filter((account) => account.available).length,
      totalAccountsCount: accounts.length,
      allAccountsAvailable,
      nextAccountAvailableAt,
      nextAccountRemainingMs: nextAccountAvailableAt
        ? Math.max(0, Date.parse(nextAccountAvailableAt) - nowMs)
        : 0,
      allAccountsAvailableAt,
      allAccountsRemainingMs: allAccountsAvailableAt
        ? Math.max(0, Date.parse(allAccountsAvailableAt) - nowMs)
        : 0,
      autoStartReady: hasWaitingImages && allAccountsAvailable,
      cronIntervalMinutes: 30,
    },
  };
}

export async function getProductImageQueueStatus(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;

    const rows = await fetchAllStocks(env, getServiceKey(env));
    const nowMs = Date.now();
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
    const images = [];
    const mergedQuotas = structuredClone(DEFAULT_ACCOUNT_QUOTAS);
    let eligible = 0;
    let attemptedToday = 0;
    for (const row of rows) {
      const info = row.info && typeof row.info === "object" ? row.info : {};
      if (info.imageGenerationAccountQuotas && typeof info.imageGenerationAccountQuotas === "object") {
        for (const def of ACCOUNT_DEFS) {
          const candidate = info.imageGenerationAccountQuotas[def.id];
          if (candidate && typeof candidate === "object") {
            if (quotaEntryRank(candidate) >= quotaEntryRank(mergedQuotas[def.id])) {
              mergedQuotas[def.id] = { ...mergedQuotas[def.id], ...candidate };
            }
          }
        }
      }
      const job = info.imageGeneration || {};
      const imageUrl = job.imageUrl || row.image;
      if (job.status === "completed" && typeof imageUrl === "string" &&
          (/^\/assets\/img\/generated-products\//.test(imageUrl) || /^https:\/\//i.test(imageUrl))) {
        const completedAt = typeof job.completedAt === "string" && Number.isFinite(Date.parse(job.completedAt))
          ? job.completedAt : null;
        images.push({ id: row.id, name: row.name, brand: row.brand, imageUrl, completedAt });
      }
      if (!hasRawImage(info)) continue;
      eligible++;
      const status = job.status === "publishing"
        ? "processing"
        : counts[job.status] === undefined ? "pending" : job.status;
      counts[status]++;
      if (job.attemptedOn === today) {
        attemptedToday++;
      }
    }

    images.sort((a, b) => (b.completedAt ? Date.parse(b.completedAt) : -Infinity) -
      (a.completedAt ? Date.parse(a.completedAt) : -Infinity) || String(a.id).localeCompare(String(b.id)));
    const { accounts, schedule } = buildAccountStatusAndSchedule(mergedQuotas, counts, nowMs);
    return json({
      total: eligible,
      ...counts,
      attemptedToday,
      utcDay: today,
      accounts,
      schedule,
      images,
    });
  } catch (error) {
    if (error instanceof MissingServiceKeyError) {
      return json({ error: error.message, code: "SUPABASE_SERVICE_KEY_MISSING" }, 503);
    }
    return json({ error: error.message || "Could not load queue status" }, 500);
  }
}
