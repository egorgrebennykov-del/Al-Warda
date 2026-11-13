/**
 * Gemini-powered perfume description queue (admin panel).
 *
 * Step 4 of the Al-Warda product pipeline:
 *   Qogita data -> photo generation -> aroma palette -> DESCRIPTION (Gemini).
 *
 * The description is written strictly from the confirmed aroma palette (the
 * top/heart/base notes) in Russian and English and stored in `stocks.info` as
 * `descriptionRu` / `descriptionEn` with `descriptionSource = "gemini"`.
 *
 * Unlike the automatic pipeline (deepseekNotesService#lookupAndPersist), this
 * module is a manual admin tool: it shows every product that already has a
 * completed generated photo and no real description yet, and lets the admin
 * generate descriptions for the selected items on demand.
 */

import {
  fetchAllStocks,
  getServiceKey,
  getSupabaseUrl,
  requirePrivilegedUser,
} from "./productImageQueueAdmin.js";
import { hasCompletedGeneratedImage } from "../utils/generatedProductImage.js";
import { isPerfumeSet } from "../utils/perfumes.js";
import { withGeminiDescriptions } from "./geminiDescriptionService.js";

const MAX_ADMIN_BATCH = 25;

// In-memory cache of the expensive full-stocks scan. Cloudflare Workers keep an
// isolate warm across requests, so this avoids re-fetching every stock on every
// admin page refresh (a common cause of transient 503s under CPU limits).
let descriptionItemsCache = null;
let descriptionItemsCacheTime = 0;
const DESCRIPTION_ITEMS_CACHE_TTL_MS = 20_000;

function invalidateDescriptionItemsCache() {
  descriptionItemsCache = null;
  descriptionItemsCacheTime = 0;
}

async function getDescriptionItems(env) {
  const now = Date.now();
  if (
    descriptionItemsCache &&
    now - descriptionItemsCacheTime < DESCRIPTION_ITEMS_CACHE_TTL_MS
  ) {
    return descriptionItemsCache;
  }
  const key = getServiceKey(env);
  const rows = await fetchAllStocks(env, key);
  descriptionItemsCache = rows
    .map((row) => queueItem(row, getSupabaseUrl(env)))
    .filter(Boolean);
  descriptionItemsCacheTime = now;
  return descriptionItemsCache;
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
      ...extraHeaders,
    },
  });
}

function isSetRow(row, info) {
  return isPerfumeSet({
    name: row.name,
    title: row.name,
    volume: info.volume,
    category: info.category,
    categorySlug: info.categorySlug,
    isSet: info.isSet,
  });
}

function slimInfo(info) {
  const { imageGeneration, fragranceResearch, notesLookup, ...rest } =
    info && typeof info === "object" ? info : {};
  return rest;
}

function hasRealDescription(info) {
  const text = String(info?.descriptionRu || info?.description || "").trim();
  if (text.length < 160) return false;
  const boilerplate = [
    "!5@B8D8F8@>20==0O >@838=0;L=0O",
    ">@838=0;L=K9 ?@5<80;L=K9 ?0@DN<",
    "?@5<80;L=K9 >@838=0;L=K9 0@01A:89",
    " >A:>H=K9 2>AB>G=K9 0@><0B Al-Warda",
    ">AB02;O5BAO =0?@O<CN A> A:;04>2",
    "Delivered directly from certified distribution hubs",
    "exquisite authentic luxury Arabian fragrance",
  ];
  return !boilerplate.some((marker) => text.includes(marker));
}

// Whether this row already carries a description written specifically by the
// Gemini pipeline below (as opposed to a supplier/manual/boilerplate one).
function isGeminiGenerated(info) {
  return (
    info?.descriptionSource === "gemini" &&
    Boolean(String(info?.descriptionRu || "").trim())
  );
}

function queueItem(row, supabaseUrl) {
  const info = row.info && typeof row.info === "object" ? row.info : {};
  if (isSetRow(row, info)) return null;
  if (!hasCompletedGeneratedImage(row, supabaseUrl)) return null;

  const hasDescription = isGeminiGenerated(info);
  // Historical typo: the writer below sets `descriptionsLookup` (plural); keep
  // reading the singular form too in case older rows used it.
  const lookup =
    info.descriptionsLookup && typeof info.descriptionsLookup === "object"
      ? info.descriptionsLookup
      : info.descriptionLookup && typeof info.descriptionLookup === "object"
        ? info.descriptionLookup
        : {};
  const status = hasDescription
    ? "generated"
    : lookup.status === "error"
      ? "error"
      : lookup.status === "not_found"
        ? "not_found"
        : "unchecked";

  return {
    id: row.id,
    name: row.name || "",
    brand: row.brand || "",
    image: row.image || info.rawImage || null,
    rawImage: info.rawImage || null,
    info: slimInfo(info),
    status,
    hasDescription,
    descriptionRu: hasDescription ? info.descriptionRu || null : null,
    descriptionEn: hasDescription ? info.descriptionEn || null : null,
    photoReady: true,
    checkedAt: lookup.checkedAt || null,
    error: lookup.error || null,
  };
}

async function patchStockInfo(env, id, info) {
  const key = getServiceKey(env);
  const url = new URL(`${getSupabaseUrl(env)}/rest/v1/stocks`);
  url.searchParams.set("id", `eq.${id}`);
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json; charset=utf-8",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ info }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Could not save description (${response.status})${text ? `: ${text.slice(0, 160)}` : ""}`,
    );
  }
}

export async function getDescriptionQueue(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;

    const items = await getDescriptionItems(env);

    const url = new URL(request.url);
    const query = (url.searchParams.get("q") || "").trim().toLowerCase();

    const filtered = items.filter((item) => {
      if (!query) return true;
      return `${item.name} ${item.brand}`.toLowerCase().includes(query);
    });

    const missing = filtered.filter((item) => !item.hasDescription);
    const generated = filtered.filter((item) => item.hasDescription);

    const counts = {
      total: filtered.length,
      generated: generated.length,
      missing: missing.length,
      unchecked: missing.filter((item) => item.status === "unchecked").length,
      error: missing.filter((item) => item.status === "error").length,
      notFound: missing.filter((item) => item.status === "not_found").length,
      readyToGenerate: missing.length,
    };

    return json({ counts, total: filtered.length, items: filtered });
  } catch (error) {
    return json(
      { error: error?.message || "Could not load description queue" },
      500,
    );
  }
}

export async function refreshDescriptions(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const limit = Math.min(
      Math.max(Number(body.limit) || 25, 1),
      MAX_ADMIN_BATCH,
    );
    const key = getServiceKey(env);
    const supabaseUrl = getSupabaseUrl(env);
    const rows = await fetchAllStocks(env, key);
    const allItems = rows
      .map((row) => queueItem(row, supabaseUrl))
      .filter(Boolean);
    const missingRows = allItems.filter((row) => !row.hasDescription);

    let targets = [];
    if (Array.isArray(body.ids) && body.ids.length) {
      // Explicit ids may include already-generated rows (manual regeneration).
      const requested = new Set(body.ids.map((id) => String(id)));
      targets = allItems.filter((row) => requested.has(String(row.id)));
    } else if (body.id !== undefined && body.id !== null && body.id !== "") {
      targets = allItems.filter((row) => String(row.id) === String(body.id));
    } else {
      targets = missingRows;
    }
    targets = targets.slice(0, limit);

    const results = [];
    for (const row of targets) {
      try {
        const dbRow = await readStockRow(env, row.id);
        const info =
          dbRow?.info && typeof dbRow.info === "object" ? dbRow.info : {};
        const updatedInfo = await withGeminiDescriptions(info, {
          name: dbRow?.name || row.name,
          brand: dbRow?.brand || row.brand,
          notes: info.notes,
          category: info.category || info.categorySlug,
          env,
          overwrite: true,
        });
        if (updatedInfo.descriptionSource === "gemini") {
          await patchStockInfo(env, row.id, updatedInfo);
        }
        results.push({
          id: row.id,
          name: dbRow?.name || row.name,
          brand: dbRow?.brand || row.brand,
          status:
            updatedInfo.descriptionSource === "gemini" ? "found" : "not_found",
          descriptionRu: updatedInfo.descriptionRu || null,
          descriptionEn: updatedInfo.descriptionEn || null,
        });
      } catch (error) {
        results.push({
          id: row.id,
          name: row.name,
          brand: row.brand,
          status: "error",
          error: error?.message || "Generation failed",
        });
      }
    }

    invalidateDescriptionItemsCache();
    return json({
      checked: targets.length,
      found: results.filter((item) => item.status === "found").length,
      notFound: results.filter((item) => item.status === "not_found").length,
      errors: results.filter((item) => item.status === "error").length,
      remaining: Math.max(0, missingRows.length - targets.length),
      results,
    });
  } catch (error) {
    return json(
      { error: error?.message || "Could not generate descriptions" },
      500,
    );
  }
}

async function readStockRow(env, id) {
  const key = getServiceKey(env);
  const url = new URL(`${getSupabaseUrl(env)}/rest/v1/stocks`);
  url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("select", "id,name,brand,image,info");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

// Wipes every description-related field (keeps photos, notes/aromas, everything
// else) so the admin can regenerate the whole catalog from a clean slate.
const DESCRIPTION_FIELDS = [
  "description",
  "descriptionRu",
  "descriptionEn",
  "descriptionSource",
  "descriptionsLookup",
  "descriptionLookup",
  "descriptionAiGenerated",
  "descriptionModel",
  "descriptionGeneratedAt",
];

function hasDescriptionFields(info) {
  if (!info || typeof info !== "object") return false;
  return DESCRIPTION_FIELDS.some((field) => field in info);
}

function stripDescriptionFields(info) {
  if (!info || typeof info !== "object") return info;
  const next = { ...info };
  for (const field of DESCRIPTION_FIELDS) delete next[field];
  return next;
}

export async function clearDescriptions(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 200);
    const key = getServiceKey(env);
    const rows = await fetchAllStocks(env, key);
    const candidates = rows.filter((row) => hasDescriptionFields(row.info));

    let targets = candidates;
    if (Array.isArray(body.ids) && body.ids.length) {
      const requested = new Set(body.ids.map((id) => String(id)));
      targets = candidates.filter((row) => requested.has(String(row.id)));
    }
    targets = targets.slice(0, limit);

    let cleared = 0;
    const errors = [];
    for (const row of targets) {
      try {
        await patchStockInfo(env, row.id, stripDescriptionFields(row.info));
        cleared += 1;
      } catch (error) {
        errors.push({ id: row.id, error: error?.message || "Clear failed" });
      }
    }

    invalidateDescriptionItemsCache();
    return json({
      cleared,
      errors: errors.length,
      remaining: Math.max(0, candidates.length - cleared),
      total: candidates.length,
      details: errors,
    });
  } catch (error) {
    return json(
      { error: error?.message || "Could not clear descriptions" },
      500,
    );
  }
}
