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

function queueItem(row, supabaseUrl) {
  const info = row.info && typeof row.info === "object" ? row.info : {};
  if (hasRealDescription(info)) return null;
  if (isSetRow(row, info)) return null;
  if (!hasCompletedGeneratedImage(row, supabaseUrl)) return null;

  const lookup = info.descriptionLookup && typeof info.descriptionLookup === "object" ? info.descriptionLookup : {};
  const status =
    lookup.status === "error"
      ? "error"
      : lookup.status === "not_found"
        ? "not_found"
        : lookup.status === "found"
          ? "unverified"
          : "unchecked";

  return {
    id: row.id,
    name: row.name || "",
    brand: row.brand || "",
    image: row.image || info.rawImage || null,
    rawImage: info.rawImage || null,
    info: slimInfo(info),
    status,
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

    const key = getServiceKey(env);
    const rows = await fetchAllStocks(env, key);
    const items = rows.map((row) => queueItem(row, getSupabaseUrl(env))).filter(Boolean);

    const url = new URL(request.url);
    const query = (url.searchParams.get("q") || "").trim().toLowerCase();
    const statusFilter = (url.searchParams.get("status") || "all").trim().toLowerCase();

    const counts = {
      total: items.length,
      unchecked: items.filter((item) => item.status === "unchecked").length,
      error: items.filter((item) => item.status === "error").length,
      notFound: items.filter((item) => item.status === "not_found").length,
      unverified: items.filter((item) => item.status === "unverified").length,
      readyToGenerate: items.filter((item) => item.status === "unchecked").length,
    };

    const filtered = items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (query && !`${item.name} ${item.brand}`.toLowerCase().includes(query)) return false;
      return true;
    });

    return json({ counts, total: filtered.length, items: filtered });
  } catch (error) {
    return json({ error: error?.message || "Could not load description queue" }, 500);
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

    const limit = Math.min(Math.max(Number(body.limit) || 25, 1), MAX_ADMIN_BATCH);
    const key = getServiceKey(env);
    const supabaseUrl = getSupabaseUrl(env);
    const rows = await fetchAllStocks(env, key);
    const missingRows = rows.map((row) => queueItem(row, supabaseUrl)).filter(Boolean);

    let targets = [];
    if (Array.isArray(body.ids) && body.ids.length) {
      const requested = new Set(body.ids.map((id) => String(id)));
      targets = missingRows.filter((row) => requested.has(String(row.id)));
    } else if (body.id !== undefined && body.id !== null && body.id !== "") {
      targets = missingRows.filter((row) => String(row.id) === String(body.id));
    } else {
      targets = missingRows;
    }
    targets = targets.slice(0, limit);

    const results = [];
    for (const row of targets) {
      try {
        const dbRow = await readStockRow(env, row.id);
        const info = dbRow?.info && typeof dbRow.info === "object" ? dbRow.info : {};
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
          status: updatedInfo.descriptionSource === "gemini" ? "found" : "not_found",
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

    return json({
      checked: targets.length,
      found: results.filter((item) => item.status === "found").length,
      notFound: results.filter((item) => item.status === "not_found").length,
      errors: results.filter((item) => item.status === "error").length,
      remaining: Math.max(0, missingRows.length - targets.length),
      results,
    });
  } catch (error) {
    return json({ error: error?.message || "Could not generate descriptions" }, 500);
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