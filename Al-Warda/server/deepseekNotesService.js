/**
 * DeepSeek-powered fragrance note generation.
 *
 * Every product page must show an olfactory pyramid. This module asks the
 * DeepSeek chat API for the notes of a fragrance and caches the result in
 * Supabase (`stocks.info`) so each perfume is generated only once.
 *
 * The API key is read from `DEEPSEEK_API_KEY` (worker binding or process env).
 * It must never be shipped to the browser.
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

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const FOUND_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ADMIN_BATCH = 25;
const MAX_NOTES_PER_LAYER = 8;

const notesCache = new Map();
const pendingLookups = new Map();

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

export function getDeepSeekApiKey(env) {
  return (
    env?.DEEPSEEK_API_KEY ||
    globalThis.process?.env?.DEEPSEEK_API_KEY ||
    ""
  );
}

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function formatNoteName(note) {
  const text = String(note || "").trim();
  if (!text) return "";
  const smallWords = new Set(["of", "and", "the", "de"]);
  return text
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function cleanNotes(values) {
  const seen = new Set();
  const cleaned = [];
  for (const value of Array.isArray(values) ? values : []) {
    const note = formatNoteName(value);
    const key = note.toLowerCase();
    if (!note || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(note);
    if (cleaned.length >= MAX_NOTES_PER_LAYER) break;
  }
  return cleaned;
}

/**
 * Accept both the DeepSeek response shape
 * `{ top, heart, base, topRu, heartRu, baseRu }` and the stored
 * `{ en: { top, heart, base }, ru: { ... } }` shape.
 */
export function normalizePyramid(raw) {
  if (!raw || typeof raw !== "object") return null;

  const enSource = raw.en && typeof raw.en === "object" ? raw.en : raw;
  const ruSource = raw.ru && typeof raw.ru === "object" ? raw.ru : raw;

  const top = cleanNotes(enSource.top || enSource.topNotes);
  const heart = cleanNotes(enSource.heart || enSource.heartNotes);
  const base = cleanNotes(enSource.base || enSource.baseNotes);

  const topRu = cleanNotes(ruSource.topRu || ruSource.top || enSource.top || enSource.topNotes);
  const heartRu = cleanNotes(
    ruSource.heartRu || ruSource.heart || enSource.heart || enSource.heartNotes,
  );
  const baseRu = cleanNotes(ruSource.baseRu || ruSource.base || enSource.base || enSource.baseNotes);

  if (!top.length && !heart.length && !base.length) return null;

  return {
    en: { top, heart, base },
    ru: {
      top: topRu.length ? topRu : [...top],
      heart: heartRu.length ? heartRu : [...heart],
      base: baseRu.length ? baseRu : [...base],
    },
  };
}

function notesSummary(notes) {
  if (!notes) return "";
  return [
    ...(notes.top || []).slice(0, 2),
    ...(notes.heart || []).slice(0, 1),
    ...(notes.base || []).slice(0, 1),
  ]
    .filter(Boolean)
    .join(" · ");
}

function hasAnyNotes(notes) {
  return Boolean(
    notes &&
      typeof notes === "object" &&
      ["top", "heart", "base"].some(
        (layer) => Array.isArray(notes[layer]) && notes[layer].length > 0,
      ),
  );
}

function hasNotesObject(notes) {
  if (!notes || typeof notes !== "object") return false;
  const buckets = [notes, notes.ru, notes.en].filter(
    (bucket) => bucket && typeof bucket === "object",
  );
  return buckets.some((bucket) =>
    ["top", "heart", "base"].some(
      (layer) => Array.isArray(bucket[layer]) && bucket[layer].length > 0,
    ),
  );
}

function extractJsonObject(content) {
  const text = String(content || "").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function buildMessages(name, brand) {
  return [
    {
      role: "system",
      content:
        "You are a professional perfumer and fragrance database. " +
        "You return official olfactory pyramids as strict JSON. " +
        "Never include explanations or markdown outside the JSON object.",
    },
    {
      role: "user",
      content:
        `Perfume name: ${name}\n` +
        `Brand/house: ${brand || "unknown"}\n\n` +
        "Return the olfactory pyramid for this exact fragrance. " +
        "Respond with JSON only in this shape:\n" +
        '{"top":["..."],"heart":["..."],"base":["..."],' +
        '"topRu":["..."],"heartRu":["..."],"baseRu":["..."]}\n' +
        "Rules:\n" +
        "- 3 to 8 notes per layer.\n" +
        "- Every array element must be ONE single note. Never combine two notes into one element using \"and\", \"и\", \"&\", \"/\" or a comma.\n" +
        '  Split each combined entry into separate elements: ["Grapefruit","Lemon"], NOT ["Grapefruit and Lemon"]; ["Ginger","Nutmeg"], NOT ["Ginger and Nutmeg"].\n' +
        "- top/heart/base must contain English note names.\n" +
        "- topRu/heartRu/baseRu must contain the same notes translated to Russian, also one note per element: [\"Грейпфрут\",\"Лимон\"], NOT [\"Грейпфрут и лимон\"].\n" +
        "- Use the real notes of this fragrance when known; otherwise give the most plausible notes for its fragrance family.\n" +
        "- Return every key even if a layer is short.",
    },
  ];
}

async function requestDeepSeek({ name, brand, env, timeoutMs = 25000 }) {
  const apiKey = getDeepSeekApiKey(env);
  if (!apiKey) {
    return {
      status: "error",
      notes: null,
      source: "deepseek",
      error: "DEEPSEEK_API_KEY is not configured",
      checkedAt: new Date().toISOString(),
    };
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer =
    controller && typeof setTimeout === "function"
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: buildMessages(name, brand),
        temperature: 0.3,
        max_tokens: 900,
        response_format: { type: "json_object" },
      }),
      signal: controller?.signal,
    });

    if (!response.ok) {
      let detail = "";
      try {
        const payload = await response.json();
        detail = payload?.error?.message || payload?.message || "";
      } catch {
        detail = await response.text().catch(() => "");
      }
      const hint =
        response.status === 401
          ? "DeepSeek rejected the API key"
          : response.status === 402
            ? "DeepSeek account has insufficient balance"
            : response.status === 429
              ? "DeepSeek rate limit reached"
              : `DeepSeek responded with HTTP ${response.status}`;
      return {
        status: "error",
        notes: null,
        source: "deepseek",
        error: detail ? `${hint}: ${String(detail).slice(0, 200)}` : hint,
        checkedAt: new Date().toISOString(),
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = extractJsonObject(content);
    const notes = normalizePyramid(parsed);
    const checkedAt = new Date().toISOString();

    if (!notes) {
      return {
        status: "not_found",
        notes: null,
        source: "deepseek",
        reason: "empty_pyramid",
        checkedAt,
      };
    }

    return {
      status: "found",
      notes,
      source: "deepseek",
      matched: null,
      model: DEEPSEEK_MODEL,
      checkedAt,
    };
  } catch (error) {
    return {
      status: "error",
      notes: null,
      source: "deepseek",
      error: error?.name === "AbortError" ? "DeepSeek request timed out" : error?.message || "DeepSeek request failed",
      checkedAt: new Date().toISOString(),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Generate a note pyramid for a perfume. Results are cached in memory to avoid
 * repeated DeepSeek calls during a burst of page views.
 */
export async function generateFragranceNotes({ name, brand, env, force = false, timeoutMs = 25000 } = {}) {
  const cleanName = String(name || "").trim();
  const cleanBrand = String(brand || "").trim();
  if (!cleanName) {
    return {
      status: "error",
      notes: null,
      source: "deepseek",
      error: "Perfume name is required",
      checkedAt: new Date().toISOString(),
    };
  }

  const cacheKey = `${normalizeText(cleanBrand)}|${normalizeText(cleanName)}`;
  const cached = notesCache.get(cacheKey);
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  if (!force && pendingLookups.has(cacheKey)) {
    return pendingLookups.get(cacheKey);
  }

  const promise = requestDeepSeek({ name: cleanName, brand: cleanBrand, env, timeoutMs });
  pendingLookups.set(cacheKey, promise);
  try {
    const value = await promise;
    if (value.status !== "error") {
      notesCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + (value.status === "found" ? FOUND_CACHE_TTL_MS : ERROR_CACHE_TTL_MS),
      });
    } else {
      notesCache.set(cacheKey, { value, expiresAt: Date.now() + ERROR_CACHE_TTL_MS });
    }
    return value;
  } finally {
    pendingLookups.delete(cacheKey);
  }
}

/** Merge a generated pyramid into a stock row's `info` JSON. */
export function buildNotesInfo(existingInfo, lookup) {
  const info = { ...(existingInfo && typeof existingInfo === "object" ? existingInfo : {}) };
  const manualVerified =
    info.notesVerified === true && info.notesSource === "manual" && hasNotesObject(info.notes);

  if (lookup?.status === "found" && hasAnyNotes(lookup.notes?.en || lookup.notes?.ru)) {
    const notes = lookup.notes?.en ? lookup.notes : { en: lookup.notes, ru: lookup.notes };
    info.notes = {
      ru: notes.ru || notes.en,
      en: notes.en || notes.ru,
    };
    info.notesVerified = true;
    info.notesSource = "deepseek";
    info.notesLookup = {
      status: "found",
      source: "deepseek",
      checkedAt: lookup.checkedAt || new Date().toISOString(),
      model: lookup.model || DEEPSEEK_MODEL,
      generated: true,
    };
    info.notesSummary = notesSummary(info.notes.ru);
    info.notesSummaryEn = notesSummary(info.notes.en);
    return info;
  }

  if (lookup?.status === "error") {
    // A transient DeepSeek failure must not destroy notes that are already shown.
    info.notesLookup = {
      status: "error",
      source: "deepseek",
      checkedAt: lookup.checkedAt || new Date().toISOString(),
      error: lookup.error || "DeepSeek request failed",
    };
    return info;
  }

  info.notesLookup = {
    status: "not_found",
    source: "deepseek",
    checkedAt: lookup?.checkedAt || new Date().toISOString(),
    reason: lookup?.reason || "empty_pyramid",
  };

  if (!manualVerified) {
    info.notesVerified = false;
    delete info.notes;
    if (info.notesSource === "deepseek" || !info.notesSource) {
      delete info.notesSummary;
      delete info.notesSummaryEn;
    }
    info.notesSource = info.notesSource || "deepseek";
  }
  return info;
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
      `Could not save fragrance notes (${response.status})${text ? `: ${text.slice(0, 160)}` : ""}`,
    );
  }
}

function isDatabaseId(id) {
  return /^\d+$/.test(String(id || ""));
}

/**
 * Generate notes and persist them into `stocks.info` when a database id is supplied.
 * Existing verified notes are returned from cache and never overwritten on a miss.
 */
export async function lookupAndPersist({
  env,
  id,
  name,
  brand,
  force = false,
  persistErrors = false,
  generateDescription = true,
} = {}) {
  const databaseId = isDatabaseId(id) ? String(id) : "";
  let row = null;
  if (databaseId) {
    try {
      row = await readStockRow(env, databaseId);
    } catch (error) {
      console.warn("Could not read stock row for fragrance notes:", error?.message || error);
    }
  }

  if (row) {
    name = row.name || name;
    brand = row.brand || brand;
  }

  const info = row?.info && typeof row.info === "object" ? row.info : {};
  if (!force && info.notesVerified === true && hasNotesObject(info.notes)) {
    return {
      status: "found",
      notes: info.notes,
      source: info.notesSource || "deepseek",
      checkedAt: info.notesLookup?.checkedAt || null,
      cached: true,
    };
  }

  // Pipeline rule: the aroma palette is generated only for products whose
  // photo has already been generated (Qogita data -> photo -> palette -> Gemini
  // description). Cached notes above can still be read for any product.
  if (row && !hasCompletedGeneratedImage(row, getSupabaseUrl(env))) {
    return {
      status: "pending_photo",
      notes: null,
      source: "deepseek",
      reason: "photo_not_ready",
      checkedAt: new Date().toISOString(),
    };
  }

  const lookup = await generateFragranceNotes({ name, brand, env, force });
  const shouldPersist =
    row &&
    (lookup.status === "found" ||
      lookup.status === "not_found" ||
      (persistErrors && lookup.status === "error"));
  if (shouldPersist) {
    let updatedInfo = buildNotesInfo(info, lookup);
    // Pipeline step 4: once the aroma palette is confirmed, Gemini writes the
    // description from that palette (Qogita -> photo -> palette -> description).
    if (lookup.status === "found" && generateDescription) {
      try {
        updatedInfo = await withGeminiDescriptions(updatedInfo, {
          name,
          brand,
          notes: updatedInfo.notes,
          env,
          overwrite: force,
        });
        if (updatedInfo.descriptionSource === "gemini") {
          lookup.descriptions = {
            ru: updatedInfo.descriptionRu,
            en: updatedInfo.descriptionEn,
            source: "gemini",
          };
        }
      } catch (error) {
        console.warn("Could not generate Gemini description:", error?.message || error);
      }
    }
    try {
      await patchStockInfo(env, databaseId, updatedInfo);
    } catch (error) {
      console.warn("Could not persist fragrance notes:", error?.message || error);
    }
  }
  return lookup;
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

/** Trim heavy internal keys; the manual-setup modal only needs product data. */
function slimInfo(info) {
  const { imageGeneration, fragranceResearch, notesLookup, ...rest } =
    info && typeof info === "object" ? info : {};
  return rest;
}

function queueItem(row, supabaseUrl) {
  const info = row.info && typeof row.info === "object" ? row.info : {};
  const verified = info.notesVerified === true && hasNotesObject(info.notes);
  if (verified) return null;
  const lookup = info.notesLookup && typeof info.notesLookup === "object" ? info.notesLookup : {};
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
    isSet: isSetRow(row, info),
    status,
    photoReady: hasCompletedGeneratedImage(row, supabaseUrl),
    checkedAt: lookup.checkedAt || null,
    query: lookup.query || null,
    error: lookup.error || null,
  };
}

export async function getFragranceNotesQueue(request, env) {
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
      photoPending: items.filter((item) => !item.photoReady).length,
      sets: items.filter((item) => item.isSet).length,
      readyToGenerate: items.filter(
        (item) => item.photoReady && !item.isSet && item.status === "unchecked",
      ).length,
      problem: items.filter(
        (item) =>
          item.photoReady &&
          !item.isSet &&
          (item.status === "error" || item.status === "not_found" || item.status === "unverified"),
      ).length,
    };

    const filtered = items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (query && !`${item.name} ${item.brand}`.toLowerCase().includes(query)) return false;
      return true;
    });

    return json({ counts, total: filtered.length, items: filtered });
  } catch (error) {
    return json({ error: error?.message || "Could not load fragrance notes queue" }, 500);
  }
}

export async function refreshFragranceNotes(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const limit = Math.min(Math.max(Number(body.limit) || 10, 1), MAX_ADMIN_BATCH);
    const key = getServiceKey(env);
    const supabaseUrl = getSupabaseUrl(env);
    const rows = await fetchAllStocks(env, key);
    const missingRows = rows
      .map((row) => queueItem(row, supabaseUrl))
      .filter(Boolean);

    // Pipeline rule: the aroma palette is generated only for products whose
    // photo has already been generated, and never for sets. The queue still
    // shows every product without notes, but pending-photo and set rows are
    // reported, not generated.
    const eligibleRows = missingRows.filter((row) => row.photoReady && !row.isSet);
    const pendingPhotoRows = missingRows.filter((row) => !row.photoReady);

    let targets = [];
    let skipped = [];
    let setSkipped = [];
    if (Array.isArray(body.ids) && body.ids.length) {
      const requested = new Set(body.ids.map((id) => String(id)));
      for (const row of missingRows) {
        if (!requested.has(String(row.id))) continue;
        if (row.isSet) setSkipped.push(row);
        else if (row.photoReady) targets.push(row);
        else skipped.push(row);
      }
      targets = targets.slice(0, limit);
      skipped = skipped.slice(0, limit);
    } else if (body.id !== undefined && body.id !== null && body.id !== "") {
      for (const row of missingRows) {
        if (String(row.id) !== String(body.id)) continue;
        if (row.isSet) setSkipped.push(row);
        else if (row.photoReady) targets.push(row);
        else skipped.push(row);
      }
    } else {
      targets = eligibleRows.slice(0, limit);
    }

    const results = [];
    for (const row of setSkipped) {
      results.push({
        id: row.id,
        name: row.name,
        brand: row.brand,
        status: "skipped_set",
        notes: null,
        error: "Sets are excluded from aroma palette generation",
      });
    }
    for (const row of skipped) {
      results.push({
        id: row.id,
        name: row.name,
        brand: row.brand,
        status: "pending_photo",
        notes: null,
        error: "Photo generation is not completed yet",
      });
    }
    for (const row of targets) {
      try {
        const lookup = await lookupAndPersist({
          env,
          id: row.id,
          name: row.name,
          brand: row.brand,
          force: true,
          persistErrors: true,
        });
        results.push({
          id: row.id,
          name: row.name,
          brand: row.brand,
          status: lookup.status,
          notes: lookup.notes || null,
          error: lookup.error || null,
        });
      } catch (error) {
        results.push({
          id: row.id,
          name: row.name,
          brand: row.brand,
          status: "error",
          notes: null,
          error: error?.message || "Generation failed",
        });
      }
    }

    return json({
      checked: targets.length,
      found: results.filter((item) => item.status === "found").length,
      notFound: results.filter((item) => item.status === "not_found").length,
      errors: results.filter((item) => item.status === "error").length,
      photoPending: pendingPhotoRows.length,
      setsSkipped: setSkipped.length,
      remaining: Math.max(0, eligibleRows.length - targets.length),
      results,
    });
  } catch (error) {
    return json({ error: error?.message || "Could not generate fragrance notes" }, 500);
  }
}

export async function getFragranceNotes(request, env) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    const name = url.searchParams.get("name") || "";
    const brand = url.searchParams.get("brand") || "";

    if (!name && !isDatabaseId(id)) {
      return json({ status: "error", error: "name or id is required" }, 400);
    }

    const lookup = await lookupAndPersist({
      env,
      id: isDatabaseId(id) ? id : "",
      name,
      brand,
    });

    if (lookup.status === "error") {
      return json(lookup, 502, { "Cache-Control": "no-store" });
    }

    const maxAge = lookup.status === "found" ? 3600 : 300;
    return json(lookup, 200, { "Cache-Control": `public, max-age=${maxAge}` });
  } catch (error) {
    return json({ status: "error", error: error?.message || "Fragrance notes generation failed" }, 500);
  }
}
