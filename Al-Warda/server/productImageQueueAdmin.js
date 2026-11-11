class MissingServiceKeyError extends Error {
  constructor() {
    super("SUPABASE_SERVICE_ROLE_KEY is not configured on the server");
  }
}

export function getServiceKey(env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SECRET_KEY;
  if (!key) throw new MissingServiceKeyError();
  return key;
}

export function getSupabaseUrl(env) {
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

let statusCache = null;
let statusCacheTime = 0;
let inFlightStatusPromise = null;
const STATUS_CACHE_TTL_MS = 25_000;

export function invalidateProductImageQueueCache() {
  statusCache = null;
  statusCacheTime = 0;
  inFlightStatusPromise = null;
}

async function fetchStockPage(env, key, from, to) {
  const url = new URL(`${getSupabaseUrl(env)}/rest/v1/stocks`);
  url.searchParams.set("select", "id,name,brand,image,info");
  url.searchParams.set("order", "id.asc");

  let lastError = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const result = await fetch(url, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: "count=exact",
          "Range-Unit": "items",
          Range: `${from}-${to}`,
        },
      });

      if (result.ok) {
        const rows = await result.json();
        if (!Array.isArray(rows)) {
          throw new Error("Supabase stocks response was not a list");
        }
        const contentRange = result.headers.get("content-range") || "";
        const countMatch = contentRange.match(/\/(\d+)$/);
        const totalCount = countMatch ? parseInt(countMatch[1], 10) : null;
        return { rows, totalCount };
      }

      if ([500, 502, 503, 504, 429].includes(result.status) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }

      const errText = await result.text().catch(() => "");
      let details = "";
      try {
        const parsed = JSON.parse(errText);
        details = parsed.message || parsed.error || "";
      } catch {
        if (errText) details = errText.slice(0, 150);
      }
      throw new Error(`Could not load product image queue (${result.status})${details ? `: ${details}` : ""}`);
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error("Could not load product image queue");
}

export async function fetchAllStocks(env, key) {
  const pageSize = 500;
  const first = await fetchStockPage(env, key, 0, pageSize - 1);
  const rows = [...first.rows];
  const totalCount = first.totalCount;

  // Single page or unit test mock where total is within first page
  if (first.rows.length < pageSize || (totalCount !== null && rows.length >= totalCount)) {
    return rows;
  }

  // Fast concurrent fetching if total count is known from PostgREST Content-Range
  if (typeof totalCount === "number" && totalCount > rows.length) {
    const pageRanges = [];
    for (let from = pageSize; from < totalCount; from += pageSize) {
      pageRanges.push({ from, to: Math.min(from + pageSize - 1, totalCount - 1) });
    }

    const concurrency = 4;
    const pageResults = new Array(pageRanges.length);
    let nextIdx = 0;

    const worker = async () => {
      while (nextIdx < pageRanges.length) {
        const i = nextIdx++;
        const { from, to } = pageRanges[i];
        try {
          const res = await fetchStockPage(env, key, from, to);
          pageResults[i] = res.rows;
        } catch (err) {
          const mid = from + Math.floor((to - from) / 2);
          const h1 = await fetchStockPage(env, key, from, mid);
          const h2 = await fetchStockPage(env, key, mid + 1, to);
          pageResults[i] = [...h1.rows, ...h2.rows];
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, pageRanges.length) }, worker));
    for (const chunk of pageResults) {
      if (chunk) rows.push(...chunk);
    }
    return rows;
  }

  // Fallback sequential
  for (let from = pageSize; ; from += pageSize) {
    const next = await fetchStockPage(env, key, from, from + pageSize - 1);
    rows.push(...next.rows);
    if (next.rows.length < pageSize) return rows;
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

    const isTestEnv = Boolean(
      (typeof process !== "undefined" && process?.env?.NODE_TEST_CONTEXT) ||
      env?.SUPABASE_URL?.includes("example")
    );

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("refresh") === "1";
    const now = Date.now();

    if (!isTestEnv && !force && statusCache && now - statusCacheTime < STATUS_CACHE_TTL_MS) {
      return json(statusCache);
    }

    if (!isTestEnv && !force && inFlightStatusPromise) {
      return json(await inFlightStatusPromise);
    }

    const computeStatus = async () => {
      const rows = await fetchAllStocks(env, getServiceKey(env));
      const nowMs = Date.now();
      const today = new Date(nowMs).toISOString().slice(0, 10);
      const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
      const images = [];
      const failedItems = [];
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
        const replacementJob = info.imageGenerationReplacement || {};
        const imageUrl = job.imageUrl || row.image;
        if (job.status === "completed" && typeof imageUrl === "string" &&
            (/^\/assets\/img\/generated-products\//.test(imageUrl) || /^https:\/\//i.test(imageUrl))) {
          const completedAt = typeof job.completedAt === "string" && Number.isFinite(Date.parse(job.completedAt))
            ? job.completedAt : null;
          images.push({
            id: row.id,
            name: row.name,
            brand: row.brand,
            price: Number(row.price) || (info.price ? Number(info.price) : 29.99),
            currency: row.currency || info.currency || "EUR",
            image: row.image || null,
            imageUrl,
            rawImage: typeof info.rawImage === "string" ? info.rawImage : (typeof row.image === "string" ? row.image : null),
            info,
            completedAt,
          });
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
        if (status === "failed" || replacementJob.status === "failed") {
          const activeFail = status === "failed" ? job : replacementJob;
          failedItems.push({
            id: row.id,
            name: row.name || "",
            brand: row.brand || "",
            price: Number(row.price) || (info.price ? Number(info.price) : 29.99),
            currency: row.currency || info.currency || "EUR",
            image: row.image || null,
            rawImage: typeof info.rawImage === "string" ? info.rawImage : null,
            info,
            error: typeof activeFail.error === "string" && activeFail.error.trim()
              ? activeFail.error.trim()
              : "Unknown generation error",
            failedAt: validIsoTimestamp(activeFail.failedAt),
            attemptedOn: typeof activeFail.attemptedOn === "string" ? activeFail.attemptedOn : null,
          });
        }
      }

      images.sort((a, b) => (b.completedAt ? Date.parse(b.completedAt) : -Infinity) -
        (a.completedAt ? Date.parse(a.completedAt) : -Infinity) || String(a.id).localeCompare(String(b.id)));
      failedItems.sort((a, b) => (b.failedAt ? Date.parse(b.failedAt) : -Infinity) -
        (a.failedAt ? Date.parse(a.failedAt) : -Infinity) || String(a.id).localeCompare(String(b.id)));
      const { accounts, schedule } = buildAccountStatusAndSchedule(mergedQuotas, counts, nowMs);
      const payload = {
        total: eligible,
        ...counts,
        attemptedToday,
        utcDay: today,
        accounts,
        schedule,
        failedItems,
        images,
      };

      if (!isTestEnv) {
        statusCache = payload;
        statusCacheTime = Date.now();
      }
      return payload;
    };

    if (isTestEnv || force) {
      const result = await computeStatus();
      return json(result);
    }

    inFlightStatusPromise = computeStatus();
    try {
      const result = await inFlightStatusPromise;
      return json(result);
    } finally {
      inFlightStatusPromise = null;
    }
  } catch (error) {
    if (error instanceof MissingServiceKeyError) {
      return json({ error: error.message, code: "SUPABASE_SERVICE_KEY_MISSING" }, 503);
    }
    return json({ error: error.message || "Could not load queue status" }, 500);
  }
}

function parseIds(body) {
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) return null;
  const ids = [];
  const seen = new Set();
  for (const rawId of body.ids) {
    const id = String(rawId ?? "").trim();
    if (!/^\d{1,20}$/.test(id)) return { error: `Invalid product ID: ${id}` };
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return { ids };
}

export async function requeueFailedProductItems(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON request" }, 400);
    }
    const parsed = parseIds(body);
    if (!parsed) return json({ error: "Select at least one failed product ID" }, 400);
    if (parsed.error) return json({ error: parsed.error }, 400);

    const key = getServiceKey(env);
    const baseUrl = getSupabaseUrl(env);
    const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    let requeued = 0;
    for (let i = 0; i < parsed.ids.length; i += 200) {
      const chunk = parsed.ids.slice(i, i + 200);
      const url = new URL(`${baseUrl}/rest/v1/stocks`);
      url.searchParams.set("select", "id,info");
      url.searchParams.set("id", `in.(${chunk.join(",")})`);
      const result = await fetch(url, { headers });
      if (!result.ok) throw new Error(`Could not load failed items (${result.status})`);
      const rows = await result.json();
      for (const row of rows) {
        const info = row.info && typeof row.info === "object" ? { ...row.info } : {};
        info.imageGeneration = { status: "pending" };
        delete info.imageGenerationReplacement;
        const patchUrl = new URL(`${baseUrl}/rest/v1/stocks`);
        patchUrl.searchParams.set("id", `eq.${row.id}`);
        const patch = await fetch(patchUrl, {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify({ info }),
        });
        if (!patch.ok) {
          const details = (await patch.text()).slice(0, 300);
          throw new Error(`Could not requeue item ${row.id} (${patch.status}): ${details}`);
        }
        requeued++;
      }
    }
    invalidateProductImageQueueCache();
    return json({ requeuedCount: requeued, ids: parsed.ids });
  } catch (error) {
    if (error instanceof MissingServiceKeyError) {
      return json({ error: error.message, code: "SUPABASE_SERVICE_KEY_MISSING" }, 503);
    }
    return json({ error: error.message || "Could not requeue failed items" }, 500);
  }
}

const SETTINGS_SLUG = "site-settings";

async function loadSettingsRow(env, key) {
  const url = new URL(`${getSupabaseUrl(env)}/rest/v1/stocks`);
  url.searchParams.set("select", "id,info");
  url.searchParams.set("slug", `eq.${SETTINGS_SLUG}`);
  url.searchParams.set("limit", "1");
  const result = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!result.ok) throw new Error(`Could not load settings (${result.status})`);
  const rows = await result.json();
  return rows[0] || null;
}

export async function getSiteSettings(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;
    const row = await loadSettingsRow(env, getServiceKey(env));
    return json({ minOrderFrom: Number(row?.info?.minOrderFrom) || 0, minOrderTo: Number(row?.info?.minOrderTo ?? row?.info?.maxAllowedMinOrder) || 0 });
  } catch (error) {
    if (error instanceof MissingServiceKeyError) {
      return json({ error: error.message, code: "SUPABASE_SERVICE_KEY_MISSING" }, 503);
    }
    return json({ error: error.message || "Could not load settings" }, 500);
  }
}

export async function saveSiteSettings(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON request" }, 400);
    }
    const from = Number(body?.minOrderFrom ?? 0);
    const to = Number(body?.minOrderTo ?? 0);
    if (![from, to].every((v) => Number.isInteger(v) && v >= 0 && v <= 100000)) {
      return json({ error: "minOrderFrom and minOrderTo must be integers from 0 to 100000" }, 400);
    }
    if (to > 0 && from > to) {
      return json({ error: "minOrderFrom must not exceed minOrderTo" }, 400);
    }
    const key = getServiceKey(env);
    const baseUrl = getSupabaseUrl(env);
    const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" };
    const row = await loadSettingsRow(env, key);
    let response;
    if (row) {
      const url = new URL(`${baseUrl}/rest/v1/stocks`);
      url.searchParams.set("id", `eq.${row.id}`);
      response = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ info: { ...(row.info || {}), minOrderFrom: from, minOrderTo: to, maxAllowedMinOrder: to } }),
      });
    } else {
      response = await fetch(`${baseUrl}/rest/v1/stocks`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          slug: SETTINGS_SLUG,
          name: "Site settings",
          title: "Site settings",
          brand: "system",
          price: 0,
          in_stock: false,
          info: { minOrderFrom: from, minOrderTo: to, maxAllowedMinOrder: to },
        }),
      });
    }
    if (!response.ok) {
      const details = (await response.text()).slice(0, 300);
      throw new Error(`Could not save settings (${response.status}): ${details}`);
    }
    return json({ minOrderFrom: from, minOrderTo: to });
  } catch (error) {
    if (error instanceof MissingServiceKeyError) {
      return json({ error: error.message, code: "SUPABASE_SERVICE_KEY_MISSING" }, 503);
    }
    return json({ error: error.message || "Could not save settings" }, 500);
  }
}

export async function deleteFailedProductItems(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON request" }, 400);
    }
    if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
      return json({ error: "Select at least one failed product ID to delete" }, 400);
    }

    const uniqueIds = [];
    const seen = new Set();
    for (const rawId of body.ids) {
      const id = String(rawId ?? "").trim();
      if (!/^\d{1,20}$/.test(id)) {
        return json({ error: `Invalid product ID: ${id}` }, 400);
      }
      if (!seen.has(id)) {
        seen.add(id);
        uniqueIds.push(id);
      }
    }

    const key = getServiceKey(env);
    const baseUrl = getSupabaseUrl(env);
    const chunkSize = 200;
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const url = new URL(`${baseUrl}/rest/v1/stocks`);
      url.searchParams.set("id", `in.(${chunk.join(",")})`);
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: "return=minimal",
        },
      });
      if (!response.ok) {
        const details = (await response.text()).slice(0, 300);
        throw new Error(`Could not delete records from stocks (${response.status}): ${details}`);
      }
    }

    invalidateProductImageQueueCache();
    return json({
      deletedCount: uniqueIds.length,
      ids: uniqueIds,
    });
  } catch (error) {
    if (error instanceof MissingServiceKeyError) {
      return json({ error: error.message, code: "SUPABASE_SERVICE_KEY_MISSING" }, 503);
    }
    return json({ error: error.message || "Could not delete failed items" }, 500);
  }
}

export async function syncCommittedPublishedStocks(env) {
  try {
    const key = getServiceKey(env);
    const baseUrl = getSupabaseUrl(env);
    const rows = await fetchAllStocks(env, key);
    const publishingRows = rows.filter((r) => {
      const job = r.info?.imageGeneration;
      const rep = r.info?.imageGenerationReplacement;
      return (job?.status === "publishing" && job?.imageUrl) || (rep?.status === "publishing" && rep?.imageUrl);
    });
    if (!publishingRows.length) return 0;

    let synced = 0;
    for (const row of publishingRows) {
      const info = row.info || {};
      const jobKey = info.imageGeneration?.status === "publishing" ? "imageGeneration" : "imageGenerationReplacement";
      const job = info[jobKey] || {};
      const imageUrl = job.imageUrl;
      if (!imageUrl) continue;

      try {
        const checkRes = await fetch(`https://al-warda.egor-grebennykov.workers.dev${imageUrl}`, {
          method: "HEAD",
        });
        const isOk = checkRes.ok && (checkRes.headers.get("content-type") || "").includes("image");
        if (isOk) {
          const updatedInfo = structuredClone(info);
          const updatedJob = structuredClone(job);
          updatedJob.status = "completed";
          updatedJob.completedAt = updatedJob.completedAt || new Date().toISOString();
          delete updatedJob.error;
          delete updatedJob.failedAt;

          updatedInfo.imageGeneration = updatedJob;
          if (jobKey === "imageGenerationReplacement") {
            delete updatedInfo[jobKey];
          }

          const patchUrl = new URL(`${baseUrl}/rest/v1/stocks`);
          patchUrl.searchParams.set("id", `eq.${row.id}`);
          const patchRes = await fetch(patchUrl, {
            method: "PATCH",
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json; charset=utf-8",
              Prefer: "return=minimal",
            },
            body: JSON.stringify({
              info: updatedInfo,
              image: imageUrl,
            }),
          });
          if (patchRes.ok) synced++;
        }
      } catch {
        // Continue if network check fails
      }
    }
    return synced;
  } catch {
    return 0;
  }
}

export async function saveManualProductItem(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON request" }, 400);
    }

    const rawId = body.id;
    const isNew = !rawId || rawId === "new" || rawId === 0 || rawId === "0";
    const id = isNew ? "new" : rawId;

    const key = getServiceKey(env);
    const baseUrl = getSupabaseUrl(env);
    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    let existingRow = {};
    let existingInfo = {};

    if (!isNew) {
      // 1. Fetch current row
      const fetchUrl = new URL(`${baseUrl}/rest/v1/stocks`);
      fetchUrl.searchParams.set("id", `eq.${id}`);
      fetchUrl.searchParams.set("select", "id,name,brand,price,currency,image,info");
      const getRes = await fetch(fetchUrl, { headers });
      if (!getRes.ok) {
        throw new Error(`Failed to load product ${id} from database (${getRes.status})`);
      }
      const rows = await getRes.json();
      existingRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
      existingInfo = existingRow.info && typeof existingRow.info === "object" ? { ...existingRow.info } : {};
    }

    // 2. Resolve image
    let finalImageUrl = (typeof body.image === "string" ? body.image.trim() : "") ||
      existingRow.image ||
      (typeof existingInfo.rawImage === "string" ? existingInfo.rawImage : "");

    // If base64 imageData provided, attempt to upload to Supabase Storage
    const base64Data = (typeof body.imageData === "string" && body.imageData.startsWith("data:image/"))
      ? body.imageData
      : (typeof finalImageUrl === "string" && finalImageUrl.startsWith("data:image/") ? finalImageUrl : null);

    if (base64Data) {
      try {
        const matches = base64Data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          const rawExt = matches[1].toLowerCase();
          const ext = rawExt === "jpeg" ? "jpg" : (rawExt === "svg+xml" ? "svg" : rawExt);
          const binaryStr = atob(matches[2]);
          const buffer = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            buffer[i] = binaryStr.charCodeAt(i);
          }
          const filename = `manual-${id}-${Date.now()}.${ext}`;
          const storageUrl = `${baseUrl}/storage/v1/object/product-images/${filename}`;
          const storageRes = await fetch(storageUrl, {
            method: "POST",
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              "Content-Type": `image/${matches[1]}`,
              "x-upsert": "true",
            },
            body: buffer,
          });
          if (storageRes.ok) {
            finalImageUrl = `${baseUrl}/storage/v1/object/public/product-images/${filename}`;
          } else {
            finalImageUrl = base64Data;
          }
        }
      } catch (uploadErr) {
        console.warn("Storage upload failed, keeping inline data URL:", uploadErr);
        finalImageUrl = base64Data;
      }
    }

    if (!finalImageUrl) {
      return json({ error: "Product image is required" }, 400);
    }

    const cleanName = (body.name || existingRow.name || "").trim();
    if (!cleanName) {
      return json({ error: "Product name is required" }, 400);
    }
    const brand = (body.brand || existingRow.brand || "Al-Warda").trim();
    const price = Number(body.price) > 0 ? Number(body.price) : (Number(existingRow.price) || 29.99);
    const currency = body.currency || existingRow.currency || "EUR";

    const topNotesRu = Array.isArray(body.topNotes)
      ? body.topNotes
      : String(body.topNotes || "").split(",").map((s) => s.trim()).filter(Boolean);
    const heartNotesRu = Array.isArray(body.heartNotes)
      ? body.heartNotes
      : String(body.heartNotes || "").split(",").map((s) => s.trim()).filter(Boolean);
    const baseNotesRu = Array.isArray(body.baseNotes)
      ? body.baseNotes
      : String(body.baseNotes || "").split(",").map((s) => s.trim()).filter(Boolean);

    const topNotesEn = Array.isArray(body.topNotesEn)
      ? body.topNotesEn
      : (body.topNotesEn ? String(body.topNotesEn).split(",").map((s) => s.trim()).filter(Boolean) : topNotesRu);
    const heartNotesEn = Array.isArray(body.heartNotesEn)
      ? body.heartNotesEn
      : (body.heartNotesEn ? String(body.heartNotesEn).split(",").map((s) => s.trim()).filter(Boolean) : heartNotesRu);
    const baseNotesEn = Array.isArray(body.baseNotesEn)
      ? body.baseNotesEn
      : (body.baseNotesEn ? String(body.baseNotesEn).split(",").map((s) => s.trim()).filter(Boolean) : baseNotesRu);

    const hasNotes = [topNotesRu, heartNotesRu, baseNotesRu, topNotesEn, heartNotesEn, baseNotesEn]
      .some((notes) => notes.length > 0);
    const notesSource = hasNotes
      ? (body.notesSource === "10ml" ? "10ml" : "manual")
      : (existingInfo.notesSource || "manual");

    const updatedInfo = {
      ...existingInfo,
      category: body.categoryRu || body.category || existingInfo.category || "Восточные",
      categorySlug: body.categorySlug || body.category || existingInfo.categorySlug || "oud",
      categoryEn: body.categoryEn || existingInfo.categoryEn || "Oriental",
      volume: body.volume || existingInfo.volume || "100 мл / 3.4 FL.OZ.",
      concentration: body.concentration || existingInfo.concentration || "Eau De Parfum",
      gender: body.gender || body.genderRu || existingInfo.gender || "Унисекс",
      genderEn: body.genderEn || (body.gender === "Женский" ? "Women" : (body.gender === "Мужской" ? "Men" : "Unisex")),
      longevity: body.longevity || existingInfo.longevity || "8–12 часов",
      longevityEn: body.longevityEn || existingInfo.longevityEn || "8–12 hours",
      sillage: body.sillage || existingInfo.sillage || "Выразительный, шлейфовый",
      sillageEn: body.sillageEn || existingInfo.sillageEn || "Noticeable, alluring sillage",
      notesSummary: body.notesSummary || body.notesSummaryRu || existingInfo.notesSummary || (topNotesRu.slice(0, 2).concat(heartNotesRu.slice(0, 1), baseNotesRu.slice(0, 2)).join(" · ")),
      notesSummaryEn: body.notesSummaryEn || existingInfo.notesSummaryEn || body.notesSummary || (topNotesEn.slice(0, 2).concat(heartNotesEn.slice(0, 1), baseNotesEn.slice(0, 2)).join(" · ")),
      notes: hasNotes
        ? {
          ru: { top: topNotesRu, heart: heartNotesRu, base: baseNotesRu },
          en: { top: topNotesEn, heart: heartNotesEn, base: baseNotesEn },
        }
        : existingInfo.notes,
      notesVerified: hasNotes ? true : Boolean(existingInfo.notesVerified && existingInfo.notesSource === "manual"),
      notesSource,
      notesLookup: hasNotes
        ? {
          status: "found",
          source: notesSource,
          checkedAt: new Date().toISOString(),
          matched: notesSource === "10ml" ? (existingInfo.notesLookup?.matched || null) : null,
        }
        : (existingInfo.notesLookup || null),
      descriptionRu: body.descriptionRu || body.description || existingInfo.descriptionRu || existingRow.description || "",
      descriptionEn: body.descriptionEn || existingInfo.descriptionEn || "",
      description: body.descriptionRu || body.description || existingInfo.descriptionRu || existingRow.description || "",
      minOrderQuantity: 1,
      inStock: body.inStock !== false,
      manual: true,
      imageGeneration: {
        status: "completed",
        imageUrl: finalImageUrl,
        completedAt: new Date().toISOString(),
        manual: true,
        failed: false,
        published: true,
      },
    };

    delete updatedInfo.imageGenerationReplacement;

    const keepsExistingManualNotes =
      !hasNotes && existingInfo.notesVerified === true && existingInfo.notesSource === "manual";
    if (!hasNotes && !keepsExistingManualNotes) {
      delete updatedInfo.notes;
      delete updatedInfo.notesSummary;
      delete updatedInfo.notesSummaryEn;
      updatedInfo.notesVerified = false;
    }

    invalidateProductImageQueueCache();

    const patchPayload = {
      name: cleanName,
      brand,
      price,
      currency,
      image: finalImageUrl,
      info: updatedInfo,
    };

    if (isNew) {
      const insertUrl = new URL(`${baseUrl}/rest/v1/stocks`);
      const insertRes = await fetch(insertUrl, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(patchPayload),
      });

      if (!insertRes.ok) {
        const errText = (await insertRes.text()).slice(0, 300);
        throw new Error(`Failed to insert product into database (${insertRes.status}): ${errText}`);
      }

      const insertedRows = await insertRes.json().catch(() => []);
      const created = insertedRows[0] || patchPayload;
      return json({
        ok: true,
        id: created.id,
        product: created,
        isNew: true,
      });
    }

    const patchUrl = new URL(`${baseUrl}/rest/v1/stocks`);
    patchUrl.searchParams.set("id", `eq.${id}`);
    const patchRes = await fetch(patchUrl, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(patchPayload),
    });

    if (!patchRes.ok) {
      const errText = (await patchRes.text()).slice(0, 300);
      throw new Error(`Failed to update product in database (${patchRes.status}): ${errText}`);
    }

    const updatedRows = await patchRes.json().catch(() => []);
    return json({
      ok: true,
      id,
      product: updatedRows[0] || { id, ...patchPayload },
    });
  } catch (error) {
    if (error instanceof MissingServiceKeyError) {
      return json({ error: error.message, code: "SUPABASE_SERVICE_KEY_MISSING" }, 503);
    }
    return json({ error: error.message || "Could not save product" }, 500);
  }
}


export async function getAllAdminProducts(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;

    const key = getServiceKey(env);
    const rows = await fetchAllStocks(env, key);
    const products = rows
      .filter((row) => row && row.id && !String(row.slug || "").includes("site-settings"))
      .map((row) => {
        const info = row.info && typeof row.info === "object" ? row.info : {};
        const gen = info.imageGeneration || {};
        return {
          id: row.id,
          name: row.name || "",
          brand: row.brand || "Al-Warda",
          price: Number(row.price) || (info.price ? Number(info.price) : 29.99),
          currency: row.currency || "EUR",
          image: row.image || gen.imageUrl || info.rawImage || null,
          rawImage: typeof info.rawImage === "string" ? info.rawImage : null,
          category: info.category || "Восточные",
          categorySlug: info.categorySlug || "oud",
          categoryEn: info.categoryEn || "Oriental",
          gender: info.gender || "Унисекс",
          volume: info.volume || "100 мл",
          concentration: info.concentration || "Eau De Parfum",
          inStock: info.inStock !== false,
          notesSummary: info.notesSummary || "",
          notesSummaryEn: info.notesSummaryEn || "",
          status: gen.status || "pending",
          completedAt: gen.completedAt || null,
          info,
        };
      });

    return json({ count: products.length, products });
  } catch (error) {
    if (error instanceof MissingServiceKeyError) {
      return json({ error: error.message, code: "SUPABASE_SERVICE_KEY_MISSING" }, 503);
    }
    return json({ error: error.message || "Could not load products" }, 500);
  }
}

export async function deleteAdminProducts(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON request" }, 400);
    }

    const ids = Array.isArray(body.ids)
      ? body.ids.map(String).filter(Boolean)
      : (body.id !== undefined && body.id !== null ? [String(body.id)] : []);

    if (!ids.length) {
      return json({ error: "No product IDs specified to delete" }, 400);
    }

    const key = getServiceKey(env);
    const baseUrl = getSupabaseUrl(env);
    const headers = { apikey: key, Authorization: `Bearer ${key}` };

    let deletedCount = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const url = new URL(`${baseUrl}/rest/v1/stocks`);
      url.searchParams.set("id", `in.(${chunk.join(",")})`);
      const response = await fetch(url, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        throw new Error(`Failed to delete products from database (${response.status})`);
      }
      deletedCount += chunk.length;
    }

    invalidateProductImageQueueCache();
    return json({ ok: true, deletedCount, ids });
  } catch (error) {
    if (error instanceof MissingServiceKeyError) {
      return json({ error: error.message, code: "SUPABASE_SERVICE_KEY_MISSING" }, 503);
    }
    return json({ error: error.message || "Could not delete products" }, 500);
  }
}
