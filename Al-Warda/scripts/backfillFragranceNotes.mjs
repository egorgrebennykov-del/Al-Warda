#!/usr/bin/env node
/**
 * Backfill DeepSeek fragrance-note pyramids for stock rows in Supabase.
 *
 * Reads all rows from the `stocks` table, asks DeepSeek for the olfactory
 * pyramid of every perfume whose generated photo is already completed
 * (pipeline: Qogita data -> photo generation -> aroma palette -> Gemini
 * description), and persists the result back into `stocks.info`.
 *
 * Sets (`isPerfumeSet`) are excluded from generation by default: they do not
 * have a single aroma palette and are configured manually in the privileged
 * panel. Pass `--include-sets` to override.
 *
 * This script only PATCHes the `info` column (notes + description + lookup
 * metadata). It never touches prices, images or the catalog itself, and it is
 * completely separate from the Full Database Refresh pipeline.
 *
 * Usage:
 *   node scripts/backfillFragranceNotes.mjs               # photo-ready rows missing notes
 *   node scripts/backfillFragranceNotes.mjs --limit 10    # smoke test
 *   node scripts/backfillFragranceNotes.mjs --force        # regenerate photo-ready rows
 *   node scripts/backfillFragranceNotes.mjs --include-sets # also process sets
 *   node scripts/backfillFragranceNotes.mjs --descriptions-only
 *                                                         # step 4 only: rewrite the
 *                                                         # description (Gemini) from the
 *                                                         # palette of every photo-ready,
 *                                                         # non-set product
 *   node scripts/backfillFragranceNotes.mjs --prune-missing-photo
 *                                                         # drop DeepSeek notes from rows
 *                                                         # whose photo is not completed
 *   node scripts/backfillFragranceNotes.mjs --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildNotesInfo,
  generateFragranceNotes,
} from "../server/deepseekNotesService.js";
import { withGeminiDescriptions } from "../server/geminiDescriptionService.js";
import { hasCompletedGeneratedImage } from "../utils/generatedProductImage.js";
import { restFetch } from "./nhost-rest.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function loadEnv() {
  for (const envPath of [
    path.resolve(rootDir, ".env"),
    path.resolve(rootDir, "..", ".env"),
  ]) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("="))
        continue;
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key && !process.env[key]) process.env[key] = value;
    }
  }
}
loadEnv();

const SUPABASE_URL = (
  process.env.SUPABASE_URL || "https://mfvenfrmlkxqgvdtedet.supabase.co"
).replace(/\/+$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  "";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const PAGE_SIZE = 1000;
const LOG_DIR = path.resolve(rootDir, "logs");
const LOG_PATH = path.join(LOG_DIR, "fragranceNotesBackfill.log");

// Marketing noise that must not reach DeepSeek: volumes, set multipliers,
// concentrations and gender markers. "Lattafa Yara EDP 100ml" and
// "Lattafa Yara (100 ml)" must map to the same pyramid.
const NOISE_PATTERNS = [
  /\b\d+\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:ml|мл)\b/gi,
  /\b\d+(?:[.,]\d+)?\s*(?:ml|мл|fl\.?\s*oz\.?|ounces?)\b/gi,
  /\b\d+\s*[x×*]\s*(?:pcs|pieces|vials|bottles)\b/gi,
  /\b(?:eau\s+de\s+parfum|eau\s+de\s+toilette|eau\s+de\s+cologne|extrait\s+de\s+parfum|pure\s+parfum|parfum(?:e)?|perfume|edp|edt|edc|pdt|cologne|vaporisateur|spray)\b/gi,
  /\b(?:for\s+men|for\s+women|for\s+him|for\s+her|pour\s+homme|pour\s+femme)\b/gi,
  /\b(?:unisex)\b/gi,
];

function canonicalQuery(name, brand) {
  let text = `${brand || ""} ${name || ""}`
    .toLowerCase()
    .replace(/&/g, " and ");
  for (const pattern of NOISE_PATTERNS) text = text.replace(pattern, " ");
  text = text.replace(/[()[\]{}.,;:!?/\\\-–—]+/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function hasVerifiedNotes(info) {
  if (
    !info ||
    info.notesVerified !== true ||
    !info.notes ||
    typeof info.notes !== "object"
  )
    return false;
  return [info.notes.ru, info.notes.en].some(
    (bucket) =>
      bucket &&
      ["top", "heart", "base"].some(
        (layer) => Array.isArray(bucket[layer]) && bucket[layer].length > 0,
      ),
  );
}

function isPhotoReady(row) {
  return hasCompletedGeneratedImage(row, SUPABASE_URL);
}

// Sets have multiple fragrances and no single aroma palette, so they are
// configured manually in the privileged panel instead of being generated.
const SET_PATTERN =
  /\b(set|gift\s*set|fragrance\s*set|perfume\s*set|discovery\s*set|travel\s*set|coffret|pack\s+of\s+\d+|\d+\s*pcs?|\d+\s*pieces?|\d+\s*in\s*1|набор|сет)\b/i;
function isSetRow(row) {
  const info = row.info && typeof row.info === "object" ? row.info : {};
  if (info.isSet || info.category === "sets" || info.categorySlug === "sets")
    return true;
  const text =
    `${row.name || ""} ${row.brand || ""} ${info.volume || ""}`.toLowerCase();
  return (
    SET_PATTERN.test(text) ||
    /\+\s*\d+(\.\d+)?\s*ml\b/i.test(text) ||
    /\b\d+\s*[x×]\s*\d+(\.\d+)?\s*ml\b/i.test(text)
  );
}

/** Drop DeepSeek note state from a row whose photo is not completed yet. */
function clearDeepseekNotes(info) {
  const next = { ...(info && typeof info === "object" ? info : {}) };
  const manualVerified =
    next.notesVerified === true &&
    next.notesSource === "manual" &&
    hasVerifiedNotes(next);
  delete next.notesLookup;
  if (manualVerified) return next;
  delete next.notes;
  delete next.notesSummary;
  delete next.notesSummaryEn;
  if (next.notesSource === "deepseek") delete next.notesSource;
  next.notesVerified = false;
  return next;
}

function log(message) {
  const stamp = new Date().toISOString();
  const line = `[${stamp}] ${message}`;
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line + "\n", "utf8");
  } catch {
    /* logging must never break the backfill */
  }
}

function authHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function fetchAllStocks() {
  const rows = [];
  let offset = 0;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/stocks?select=id,name,brand,image,info&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`;
    const response = await restFetch(url, { headers: authHeaders() });
    if (!response.ok) {
      throw new Error(
        `Could not read stocks (${response.status}): ${(await response.text()).slice(0, 300)}`,
      );
    }
    const page = await response.json();
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

async function patchStock(rowId, info) {
  const response = await restFetch(
    `${SUPABASE_URL}/rest/v1/stocks?id=eq.${rowId}`,
    {
      method: "PATCH",
      headers: { ...authHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({ info }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Could not save notes for ${rowId} (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateWithRetries(name, brand, attempts = 4) {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await generateFragranceNotes({
      name,
      brand,
      env: { DEEPSEEK_API_KEY },
      force: attempt > 1,
      timeoutMs: 90000,
    });
    if (last.status === "found") return last;
    if (last.status === "not_found") {
      // The model sometimes answers with an empty pyramid; give it one extra try.
      if (attempt < attempts) continue;
      return last;
    }
    // error -> backoff and retry (rate limits, timeouts, hiccups)
    await sleep(Math.min(30000, 3000 * attempt));
  }
  return last;
}

function parseArgs() {
  const args = {
    limit: 0,
    concurrency: 8,
    force: false,
    brand: "",
    dryRun: false,
    pruneMissingPhoto: false,
    includeSets: false,
    descriptionsOnly: false,
  };
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === "--limit") args.limit = Number(process.argv[++i]) || 0;
    else if (arg === "--concurrency")
      args.concurrency = Math.max(1, Number(process.argv[++i]) || 8);
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--prune-missing-photo") args.pruneMissingPhoto = true;
    else if (arg === "--include-sets") args.includeSets = true;
    else if (arg === "--descriptions-only") args.descriptionsOnly = true;
    else if (arg === "--brand") args.brand = String(process.argv[++i] || "");
  }
  return args;
}

async function main() {
  const args = parseArgs();
  if (!process.env.NHOST_ADMIN_SECRET)
    throw new Error(
      "NHOST_ADMIN_SECRET is required (Nhost Hasura admin secret)",
    );
  if (!DEEPSEEK_API_KEY && !args.pruneMissingPhoto)
    throw new Error("DEEPSEEK_API_KEY is required");

  log("=".repeat(60));
  log("DeepSeek fragrance notes backfill started");
  const rows = await fetchAllStocks();
  log(`Loaded ${rows.length} stock rows from Supabase`);

  if (args.pruneMissingPhoto) {
    const pruneTargets = rows.filter((row) => {
      if (isPhotoReady(row)) return false;
      const info = row.info && typeof row.info === "object" ? row.info : {};
      return (
        info.notesSource === "deepseek" ||
        info.notesLookup?.source === "deepseek"
      );
    });
    log(
      `Pruning DeepSeek notes from ${pruneTargets.length} rows without a completed photo`,
    );

    if (args.dryRun) {
      for (const row of pruneTargets.slice(0, 20)) {
        log(`  would prune: [${row.id}] ${row.brand} — ${row.name}`);
      }
      log(`Dry run finished. ${pruneTargets.length} rows would be pruned.`);
      return;
    }

    let pruned = 0;
    for (const row of pruneTargets) {
      const info = row.info && typeof row.info === "object" ? row.info : {};
      await patchStock(row.id, clearDeepseekNotes(info));
      pruned += 1;
      if (pruned % 100 === 0 || pruned === pruneTargets.length) {
        log(`Prune progress: ${pruned}/${pruneTargets.length}`);
      }
    }
    log(`Prune finished: ${pruned} rows restored to a no-notes state`);
    return;
  }

  const photoReadyRows = rows.filter((row) => isPhotoReady(row));
  const setRows = photoReadyRows.filter((row) => isSetRow(row));

  // Pipeline step 4 for the whole catalog: rewrite the description with Gemini
  // from the already-confirmed aroma palette. Boilerplate/template descriptions
  // are replaced; rows already described by Gemini are left untouched.
  if (args.descriptionsOnly) {
    if (!GEMINI_API_KEY)
      throw new Error("GEMINI_API_KEY is required for --descriptions-only");

    const descRows = photoReadyRows.filter((row) => {
      if (isSetRow(row)) return false;
      const info = row.info && typeof row.info === "object" ? row.info : {};
      if (!hasVerifiedNotes(info)) return false;
      if (info.descriptionSource === "gemini" && !args.force) return false;
      if (
        args.brand &&
        !String(row.brand || "")
          .toLowerCase()
          .includes(args.brand.toLowerCase())
      )
        return false;
      return true;
    });

    log(
      `Descriptions-only: ${descRows.length} photo-ready rows with a palette need a Gemini description`,
    );
    if (args.limit > 0) descRows.length = Math.min(descRows.length, args.limit);

    if (args.dryRun) {
      for (const row of descRows.slice(0, 20))
        log(`  would describe: [${row.id}] ${row.brand} — ${row.name}`);
      log(`Dry run finished. ${descRows.length} rows would be described.`);
      return;
    }

    const descCounters = { ok: 0, failed: 0 };
    let descDone = 0;
    let descIndex = 0;
    const descStartedAt = Date.now();

    async function descWorker() {
      while (descIndex < descRows.length) {
        const row = descRows[descIndex++];
        try {
          const info = row.info && typeof row.info === "object" ? row.info : {};
          const updatedInfo = await withGeminiDescriptions(info, {
            name: String(row.name || "").trim(),
            brand: String(row.brand || "").trim(),
            notes: info.notes,
            env: { GEMINI_API_KEY },
            overwrite: true,
          });
          if (updatedInfo.descriptionSource === "gemini") {
            await patchStock(row.id, updatedInfo);
            descCounters.ok += 1;
          } else {
            descCounters.failed += 1;
            log(`  ✗ [${row.id}] ${row.name}: Gemini returned no description`);
          }
        } catch (error) {
          descCounters.failed += 1;
          log(
            `  ✗ [${row?.id}] ${row?.name}: ${String(error?.message || error).slice(0, 160)}`,
          );
        }
        descDone += 1;
        if (descDone % 25 === 0 || descDone === descRows.length) {
          const elapsed = Math.max(1, (Date.now() - descStartedAt) / 1000);
          const rate = descDone / elapsed;
          const eta = Math.round(
            (descRows.length - descDone) / Math.max(rate, 0.001),
          );
          log(
            `Progress: ${descDone}/${descRows.length} (ok=${descCounters.ok} failed=${descCounters.failed}) ` +
              `| ${rate.toFixed(2)} rows/s | ETA ~${Math.floor(eta / 60)}m ${eta % 60}s`,
          );
        }
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(args.concurrency, Math.max(1, descRows.length)) },
        descWorker,
      ),
    );
    const descSeconds = Math.round((Date.now() - descStartedAt) / 1000);
    log(
      `Finished descriptions: ok=${descCounters.ok} failed=${descCounters.failed} total=${descRows.length} ` +
        `in ${Math.floor(descSeconds / 60)}m ${descSeconds % 60}s`,
    );
    return;
  }

  const targets = photoReadyRows.filter((row) => {
    if (!args.includeSets && isSetRow(row)) return false;
    const info = row.info && typeof row.info === "object" ? row.info : {};
    if (!args.force && hasVerifiedNotes(info)) return false;
    if (
      args.brand &&
      !String(row.brand || "")
        .toLowerCase()
        .includes(args.brand.toLowerCase())
    )
      return false;
    return true;
  });

  const uniqueFragrances = new Set(
    targets.map((row) => canonicalQuery(row.name, row.brand)),
  ).size;
  log(
    `Photo-ready rows: ${photoReadyRows.length} (sets excluded: ${args.includeSets ? 0 : setRows.length}); ` +
      `rows still missing verified DeepSeek notes: ${targets.length} (${uniqueFragrances} unique fragrances)`,
  );
  log(
    GEMINI_API_KEY
      ? "Gemini descriptions: enabled (pipeline step 4)"
      : "Gemini descriptions: disabled (GEMINI_API_KEY missing)",
  );

  if (args.limit > 0) {
    targets.length = Math.min(targets.length, args.limit);
    log(`--limit ${args.limit}: processing first ${targets.length} rows`);
  }

  if (args.dryRun) {
    for (const row of targets.slice(0, 20)) {
      log(`  would generate: [${row.id}] ${row.brand} — ${row.name}`);
    }
    log(`Dry run finished. ${targets.length} rows would be processed.`);
    return;
  }

  const cache = new Map(); // canonicalQuery -> lookup result (found) | null (failed)
  const counters = { ok: 0, failed: 0, skipped: 0 };
  let done = 0;
  let nextIndex = 0;
  const startedAt = Date.now();

  async function worker() {
    while (nextIndex < targets.length) {
      const row = targets[nextIndex++];
      try {
        const name = String(row.name || "").trim();
        const brand = String(row.brand || "").trim();
        if (!name) {
          counters.skipped += 1;
          done += 1;
          continue;
        }

        const key = canonicalQuery(name, brand);
        let lookup = cache.get(key);
        let detail = "from cache";
        if (lookup === undefined) {
          lookup = await generateWithRetries(name, brand);
          cache.set(key, lookup.status === "found" ? lookup : null);
          detail = "generated";
        }

        if (!lookup || lookup.status !== "found") {
          counters.failed += 1;
          log(
            `  ✗ [${row.id}] ${name}: ${String(lookup?.error || lookup?.reason || "not found").slice(0, 160)}`,
          );
        } else {
          const info = row.info && typeof row.info === "object" ? row.info : {};
          let updatedInfo = buildNotesInfo(info, lookup);
          // Pipeline step 4: Gemini writes the description from the aroma palette.
          updatedInfo = await withGeminiDescriptions(updatedInfo, {
            name,
            brand,
            notes: updatedInfo.notes,
            env: { GEMINI_API_KEY },
            overwrite: args.force,
          });
          await patchStock(row.id, updatedInfo);
          counters.ok += 1;
        }

        done += 1;
        if (done % 25 === 0 || done === targets.length) {
          const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
          const rate = done / elapsed;
          const eta = Math.round(
            (targets.length - done) / Math.max(rate, 0.001),
          );
          log(
            `Progress: ${done}/${targets.length} (ok=${counters.ok} failed=${counters.failed} skipped=${counters.skipped}) ` +
              `| ${rate.toFixed(2)} rows/s | ETA ~${Math.floor(eta / 60)}m ${eta % 60}s`,
          );
        }
      } catch (error) {
        counters.failed += 1;
        done += 1;
        log(
          `  ✗ [${row?.id}] ${row?.name}: ${String(error?.message || error).slice(0, 160)}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(args.concurrency, Math.max(1, targets.length)) },
      worker,
    ),
  );

  const totalSeconds = Math.round((Date.now() - startedAt) / 1000);
  log(
    `Finished: ok=${counters.ok} failed=${counters.failed} skipped=${counters.skipped} total=${targets.length} ` +
      `in ${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`,
  );
  log(`Unique DeepSeek calls: ${[...cache.values()].filter(Boolean).length}`);
}

main().catch((error) => {
  console.error("FATAL backfill error:", error);
  process.exit(1);
});
