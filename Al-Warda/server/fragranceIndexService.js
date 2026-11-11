/**
 * 10ML Fragrance Index integration.
 *
 * The note pyramid shown on product pages must come from a real fragrance database,
 * never from name/category heuristics. This module talks to the free 10ML REST API
 * (https://mcp.10ml.com/api/v1), matches a store product to an index record and stores
 * the verified pyramid in `stocks.info` together with the lookup status.
 */
import {
  fetchAllStocks,
  getServiceKey,
  getSupabaseUrl,
  requirePrivilegedUser,
} from "./productImageQueueAdmin.js";

const INDEX_BASE_URL = "https://mcp.10ml.com/api/v1";
const MIN_MATCH_SCORE = 65;
const MAX_SEARCH_RESULTS = 10;
const MAX_DETAIL_CANDIDATES = 3;
const FOUND_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MISS_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_ADMIN_BATCH = 25;

const NOISE_TOKENS = new Set([
  "edp",
  "edt",
  "edc",
  "pdt",
  "cologne",
  "parfum",
  "extrait",
  "pure",
  "spray",
  "fragrance",
  "perfume",
  "vaporisateur",
  "vaporizer",
  "limited",
  "edition",
]);

const CONCENTRATION_PATTERNS = [
  ["extrait", /\bextrait\b/],
  ["parfum", /\bparfum\b/],
  ["edp", /\beau de parfum\b|\bedp\b/],
  ["edt", /\beau de toilette\b|\bedt\b/],
  ["edc", /\beau de cologne\b|\bedc\b|\bcologne\b/],
  ["elixir", /\belixir\b/],
];

const lookupCache = new Map();

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

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove volume, concentration and marketing phrases that are not part of the perfume name. */
export function stripMarketingNoise(value) {
  let text = normalizeText(value);
  text = text.replace(/\b\d+\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:ml|мл)\b/g, " ");
  text = text.replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|мл|oz|fl\.?\s*oz\.?|ounces?)\b/g, " ");
  text = text.replace(
    /\beau de parfum\b|\beau de toilette\b|\beau de cologne\b|\bextrait de parfum\b|\bpure parfum\b|\bparfum\b|\bedp\b|\bedt\b|\bedc\b|\bpdt\b|\bcologne\b/g,
    " ",
  );
  text = text.replace(/\bfor\s+(?:men|women|him|her|unisex)\b/g, " ");
  text = text.replace(/\b(?:men|women|unisex)\s+fragrance\b/g, " ");
  text = text.replace(/\blimited\s+edition\b/g, " ");
  text = text.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return text;
}

export function tokenizeName(value) {
  return stripMarketingNoise(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !NOISE_TOKENS.has(token));
}

export function detectConcentration(value) {
  const text = normalizeText(value);
  let best = null;
  for (const [key, pattern] of CONCENTRATION_PATTERNS) {
    const match = text.match(pattern);
    if (match && (!best || match.index < best.index)) {
      best = { key, index: match.index };
    }
  }
  return best?.key || "";
}

function concentrationFamily(key) {
  if (!key) return "";
  if (key === "extrait") return "parfum";
  return key;
}

function hasAnyNotes(notes) {
  return Boolean(
    notes &&
      typeof notes === "object" &&
      ["top", "heart", "base"].some((layer) => Array.isArray(notes[layer]) && notes[layer].length > 0),
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

function nameTokensForScoring(name, brand) {
  let tokens = tokenizeName(name);
  const brandTokens = tokenizeName(brand);
  if (brandTokens.length && brandTokens.every((token) => tokens.includes(token))) {
    const brandSet = new Set(brandTokens);
    tokens = tokens.filter((token) => !brandSet.has(token));
  }
  return tokens;
}

function tokenMatchScore(inputTokens, candidateTokens) {
  if (!inputTokens.length || !candidateTokens.length) return 0;
  const inputSet = new Set(inputTokens);
  const candidateSet = new Set(candidateTokens);
  const inputUnique = [...inputSet];
  const candidateUnique = [...candidateSet];

  const equal =
    inputUnique.length === candidateUnique.length &&
    inputUnique.every((token) => candidateSet.has(token));
  if (equal) return 100;

  if (inputUnique.every((token) => candidateSet.has(token))) return 85;
  if (candidateUnique.every((token) => inputSet.has(token))) return 80;

  const shared = inputUnique.filter((token) => candidateSet.has(token)).length;
  const ratio = shared / Math.max(inputUnique.length, candidateUnique.length);
  if (ratio >= 0.8) return 65;
  return 0;
}

/**
 * Score a 10ML search result against the store product.
 * Returns 0 when the house does not match, otherwise 0-120.
 */
export function scoreCandidate(candidate, input) {
  if (!candidate) return 0;
  const inputTokens = nameTokensForScoring(input?.name, input?.brand);
  const candidateTokens = tokenizeName(candidate.name);
  let score = tokenMatchScore(inputTokens, candidateTokens);
  if (!score) return 0;

  const brandTokens = tokenizeName(input?.brand);
  if (brandTokens.length) {
    const houseTokens = tokenizeName(candidate.house);
    if (!houseTokens.length || !brandTokens.some((token) => houseTokens.includes(token))) {
      return 0;
    }
  }

  const requestedConcentration =
    input?.concentration || detectConcentration(input?.name) || detectConcentration(input?.brand);
  const candidateConcentration =
    detectConcentration(candidate.concentration) || detectConcentration(candidate.name);

  if (requestedConcentration && candidateConcentration) {
    if (
      concentrationFamily(requestedConcentration) ===
      concentrationFamily(candidateConcentration)
    ) {
      score += 20;
    } else {
      score -= 20;
    }
  }

  return score;
}

export function selectBestMatch(input, results = []) {
  return results
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, input) }))
    .filter((entry) => entry.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score)[0] || null;
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
    if (cleaned.length >= 8) break;
  }
  return cleaned;
}

function normalizePyramid(pyramid) {
  const top = cleanNotes(pyramid?.top);
  const heart = cleanNotes(pyramid?.heart);
  const base = cleanNotes(pyramid?.base);
  if (!top.length && !heart.length && !base.length) return null;
  // 10ML stores notes in English. The storefront translates them through
  // getLocalizedNote(), so both language buckets intentionally keep English values.
  return {
    en: { top, heart, base },
    ru: { top: [...top], heart: [...heart], base: [...base] },
  };
}

function notesSummary(notes) {
  if (!notes) return "";
  return [...(notes.top || []).slice(0, 2), ...(notes.heart || []).slice(0, 1), ...(notes.base || []).slice(0, 1)]
    .filter(Boolean)
    .join(" · ");
}

async function fetchJson(url, timeoutMs = 9000) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller && typeof setTimeout === "function"
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Al-Warda-Fragrance-Index/1.0",
      },
      signal: controller?.signal,
    });
    if (response.status === 404) {
      return { data: null, notFound: true, error: null };
    }
    if (!response.ok) {
      return { data: null, notFound: false, error: `10ML responded with HTTP ${response.status}` };
    }
    return { data: await response.json(), notFound: false, error: null };
  } catch (error) {
    return { data: null, notFound: false, error: error?.message || "10ML request failed" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function detailUrl(queryOrId) {
  return `${INDEX_BASE_URL}/perfumes/${encodeURIComponent(queryOrId)}?format=detailed`;
}

function foundResult(record, score, method, checkedAt) {
  const notes = normalizePyramid(record?.pyramid);
  if (!notes) return null;
  return {
    status: "found",
    notes,
    matched: {
      id: record.id || null,
      name: record.name || null,
      house: record.house || null,
      concentration: record.concentration || null,
      score,
      method,
    },
    source: "10ml",
    checkedAt,
  };
}

function missResult(checkedAt, query, reason = "not_found") {
  return {
    status: "not_found",
    notes: null,
    matched: null,
    source: "10ml",
    reason,
    query,
    checkedAt,
  };
}

/**
 * Look up a note pyramid in the 10ML Fragrance Index.
 * Returns {status:"found"|"not_found"|"error", notes, matched, ...}.
 */
export async function lookupFragranceIndex({ name, brand } = {}) {
  const cleanName = String(name || "").trim();
  const cleanBrand = String(brand || "").trim();
  if (!cleanName) {
    return {
      status: "error",
      notes: null,
      matched: null,
      source: "10ml",
      error: "Perfume name is required",
      checkedAt: new Date().toISOString(),
    };
  }

  const cacheKey = `${normalizeText(cleanBrand)}|${normalizeText(cleanName)}`;
  const cached = lookupCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const checkedAt = new Date().toISOString();
  const query = [cleanBrand, cleanName].filter(Boolean).join(" ");
  const input = {
    name: cleanName,
    brand: cleanBrand,
    concentration: detectConcentration(`${cleanName} ${cleanBrand}`),
  };

  let record = null;
  let score = 0;
  let method = "";

  // Fast path: the detail endpoint resolves simple names in a single request.
  const exact = await fetchJson(detailUrl(query));
  if (exact.data?.found && exact.data.exact === true && exact.data.perfume) {
    const candidate = {
      name: exact.data.perfume.name,
      house: exact.data.perfume.house,
      concentration: exact.data.perfume.concentration,
    };
    const candidateScore = scoreCandidate(candidate, input);
    const requested = concentrationFamily(input.concentration);
    const found = concentrationFamily(detectConcentration(candidate.concentration));
    const concentrationCompatible = !requested || !found || requested === found;
    if (candidateScore >= MIN_MATCH_SCORE && concentrationCompatible) {
      record = exact.data.perfume;
      score = candidateScore;
      method = "exact";
    }
  }

  if (!record) {
    const search = await fetchJson(
      `${INDEX_BASE_URL}/perfumes?q=${encodeURIComponent(query)}&limit=${MAX_SEARCH_RESULTS}`,
    );
    if (search.error) {
      return {
        status: "error",
        notes: null,
        matched: null,
        source: "10ml",
        error: search.error,
        query,
        checkedAt,
      };
    }

    const ranked = (search.data?.results || [])
      .map((candidate) => ({ candidate, score: scoreCandidate(candidate, input) }))
      .filter((entry) => entry.score >= MIN_MATCH_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_DETAIL_CANDIDATES);

    for (const entry of ranked) {
      const detail = await fetchJson(detailUrl(entry.candidate.id || entry.candidate.name));
      if (detail.error) {
        return {
          status: "error",
          notes: null,
          matched: null,
          source: "10ml",
          error: detail.error,
          query,
          checkedAt,
        };
      }
      if (detail.data?.found && detail.data.perfume && hasAnyNotes(detail.data.perfume.pyramid)) {
        record = detail.data.perfume;
        score = entry.score;
        method = "search";
        break;
      }
    }
  }

  const value = record
    ? foundResult(record, score, method, checkedAt) || missResult(checkedAt, query, "empty_pyramid")
    : missResult(checkedAt, query);

  if (value.status !== "error") {
    lookupCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + (value.status === "found" ? FOUND_CACHE_TTL_MS : MISS_CACHE_TTL_MS),
    });
  }
  return value;
}

/** Merge a lookup result into a stock row's `info` JSON without destroying manual notes. */
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
    info.notesSource = "10ml";
    info.notesLookup = {
      status: "found",
      source: "10ml",
      checkedAt: lookup.checkedAt || new Date().toISOString(),
      query: lookup.query || null,
      matched: lookup.matched || null,
      score: lookup.matched?.score ?? null,
    };
    info.notesSummary = notesSummary(info.notes.ru);
    info.notesSummaryEn = notesSummary(info.notes.en);
    return info;
  }

  info.notesLookup = {
    status: "not_found",
    source: "10ml",
    checkedAt: lookup?.checkedAt || new Date().toISOString(),
    query: lookup?.query || null,
    reason: lookup?.reason || "not_found",
    matched: null,
  };

  if (!manualVerified) {
    info.notesVerified = false;
    delete info.notes;
    if (info.notesSource === "10ml" || !info.notesSource) {
      delete info.notesSummary;
      delete info.notesSummaryEn;
    }
    info.notesSource = info.notesSource || "10ml";
  }
  return info;
}

async function readStockRow(env, id) {
  const key = getServiceKey(env);
  const url = new URL(`${getSupabaseUrl(env)}/rest/v1/stocks`);
  url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("select", "id,name,brand,info");
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
    throw new Error(`Could not save fragrance notes (${response.status})${text ? `: ${text.slice(0, 160)}` : ""}`);
  }
}

function isDatabaseId(id) {
  return /^\d+$/.test(String(id || ""));
}

/**
 * Look up notes and persist them into `stocks.info` when a database id is supplied.
 * Existing verified manual notes are never overwritten by a miss.
 */
export async function lookupAndPersist({ env, id, name, brand, force = false } = {}) {
  const databaseId = isDatabaseId(id) ? String(id) : "";
  let row = null;
  if (databaseId) {
    try {
      row = await readStockRow(env, databaseId);
    } catch (error) {
      console.warn("Could not read stock row for fragrance lookup:", error?.message || error);
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
      matched: info.notesLookup?.matched || null,
      source: info.notesSource || "10ml",
      checkedAt: info.notesLookup?.checkedAt || null,
      cached: true,
    };
  }

  const lookup = await lookupFragranceIndex({ name, brand });
  if (row && (lookup.status === "found" || lookup.status === "not_found")) {
    const updatedInfo = buildNotesInfo(info, lookup);
    try {
      await patchStockInfo(env, databaseId, updatedInfo);
    } catch (error) {
      console.warn("Could not persist fragrance notes:", error?.message || error);
    }
  }
  return lookup;
}

function queueItem(row) {
  const info = row.info && typeof row.info === "object" ? row.info : {};
  const verified = info.notesVerified === true && hasNotesObject(info.notes);
  if (verified) return null;
  const lookup = info.notesLookup && typeof info.notesLookup === "object" ? info.notesLookup : {};
  const status =
    lookup.status === "not_found"
      ? "not_found"
      : lookup.status === "found"
        ? "unverified"
        : "unchecked";
  return {
    id: row.id,
    name: row.name || "",
    brand: row.brand || "",
    image: row.image || info.rawImage || null,
    status,
    checkedAt: lookup.checkedAt || null,
    query: lookup.query || null,
    matchedName: lookup.matched?.name || null,
    matchedHouse: lookup.matched?.house || null,
    score: lookup.score ?? lookup.matched?.score ?? null,
  };
}

export async function getFragranceNotesQueue(request, env) {
  try {
    const auth = await requirePrivilegedUser(request, env);
    if (auth.response) return auth.response;

    const key = getServiceKey(env);
    const rows = await fetchAllStocks(env, key);
    const items = rows.map(queueItem).filter(Boolean);

    const url = new URL(request.url);
    const query = (url.searchParams.get("q") || "").trim().toLowerCase();
    const statusFilter = (url.searchParams.get("status") || "all").trim().toLowerCase();

    const counts = {
      total: items.length,
      unchecked: items.filter((item) => item.status === "unchecked").length,
      notFound: items.filter((item) => item.status === "not_found").length,
      unverified: items.filter((item) => item.status === "unverified").length,
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

    const limit = Math.min(
      Math.max(Number(body.limit) || 10, 1),
      MAX_ADMIN_BATCH,
    );
    const key = getServiceKey(env);
    const rows = await fetchAllStocks(env, key);
    const missingRows = rows.filter((row) => queueItem(row));

    let targets = [];
    if (Array.isArray(body.ids) && body.ids.length) {
      const requested = new Set(body.ids.map((id) => String(id)));
      targets = missingRows.filter((row) => requested.has(String(row.id))).slice(0, limit);
    } else if (body.id !== undefined && body.id !== null && body.id !== "") {
      targets = missingRows.filter((row) => String(row.id) === String(body.id)).slice(0, 1);
    } else {
      targets = missingRows.slice(0, limit);
    }

    const results = [];
    for (const row of targets) {
      try {
        const lookup = await lookupAndPersist({
          env,
          id: row.id,
          name: row.name,
          brand: row.brand,
          force: true,
        });
        results.push({
          id: row.id,
          name: row.name,
          brand: row.brand,
          status: lookup.status,
          notes: lookup.notes || null,
          matched: lookup.matched || null,
          error: lookup.error || null,
        });
      } catch (error) {
        results.push({
          id: row.id,
          name: row.name,
          brand: row.brand,
          status: "error",
          notes: null,
          matched: null,
          error: error?.message || "Lookup failed",
        });
      }
    }

    return json({
      checked: results.length,
      found: results.filter((item) => item.status === "found").length,
      notFound: results.filter((item) => item.status === "not_found").length,
      errors: results.filter((item) => item.status === "error").length,
      remaining: Math.max(0, missingRows.length - results.length),
      results,
    });
  } catch (error) {
    return json({ error: error?.message || "Could not refresh fragrance notes" }, 500);
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
    return json({ status: "error", error: error?.message || "Fragrance index lookup failed" }, 500);
  }
}
