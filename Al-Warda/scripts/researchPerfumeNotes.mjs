#!/usr/bin/env node
/**
 * Al-Warda — autonomous perfume research & verification runner.
 *
 * Implements the "AL WARDA — ADVANCED AUTONOMOUS PERFUME RESEARCH &
 * VERIFICATION SYSTEM" instruction (scripts/perfume_research_agent.md) for
 * products in the `stocks` table.
 *
 * Division of labour (instruction §14):
 *   - This script: picks products, runs the multi-stage web search, fetches and
 *     prepares source pages, classifies sources, deduplicates them, assigns the
 *     deterministic verification statuses and saves the evidence records.
 *   - DeepSeek: only inspects the prepared page text and returns the extracted
 *     notes / accords / phase descriptors. It never invents notes and never
 *     decides the final status.
 *
 * Nothing here touches `stocks.info.notes`, prices, images or the catalog:
 * results are stored under a separate `stocks.info.fragranceResearch` key.
 *
 * Usage:
 *   node scripts/researchPerfumeNotes.mjs --random 5                 # dry run
 *   node scripts/researchPerfumeNotes.mjs --ids 4986,4987 --write
 *   node scripts/researchPerfumeNotes.mjs --limit 10 --write
 *   node scripts/researchPerfumeNotes.mjs --random 5 --no-photo-only
 *
 * Options:
 *   --ids <a,b,c>   research exactly these stock ids
 *   --random <n>    research n random photo-ready products
 *   --limit <n>     research the first n photo-ready products missing research
 *   --no-photo-only allow products whose generated photo is not completed
 *   --write         persist results into stocks.info.fragranceResearch
 *   --concurrency   parallel products (default 3)
 *   --source-limit  max source pages fetched per product (default 6)
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { hasCompletedGeneratedImage } from "../utils/generatedProductImage.js";
import { restFetch } from "./nhost-rest.mjs";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

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
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const INSTRUCTION = fs.readFileSync(
  path.join(rootDir, "scripts", "perfume_research_agent.md"),
  "utf8",
);

const PAGE_SIZE = 1000;
const LOG_DIR = path.resolve(rootDir, "logs");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

// ---------------------------------------------------------------- source taxonomy

const DATABASE_DOMAINS = [
  "parfumo.com",
  "fragrantica.com",
  "basenotes.com",
  "fragsi.com",
  "thescentbase.com",
  "scentspedia.com",
  "thedrydown.io",
  "samebottle.com",
  "scentradar.eu",
  "parfoom.com",
  "5est.com",
  "olfact.me",
  "worldperfumeprotocol.com",
  "mijmara.com",
  "fragranxe.com",
  "thearabscent.com",
  "kodo.boutique",
];
const RETAILER_DOMAINS = [
  "noon.com",
  "notino.",
  "amazon.",
  "ebay.",
  "carrefouruae.com",
  "chemistwarehouse",
  "livish.com",
  "nooreast.co.uk",
  "laurenjayparis",
  "abushakra",
  "chaosfragrances",
  "tripletraders",
  "amparfum",
  "kasy.bg",
  "souq.",
  "namshi",
];
// §15.18 — separate businesses whose host merely contains the brand name; they are
// distributors/retailers, not the manufacturer, and must not get manufacturer authority.
const DISTRIBUTOR_DOMAINS = ["ajmalperfumeusa.com"];
// §15.21 — manufacturer catalogues / brochures / PDFs are primary evidence too.
const CATALOGUE_PATTERN =
  /(?:catalogue|catalog|brochure|lookbook|product-?book|\.pdf(?:$|[?#]))/i;

const REGION_BY_TLD = {
  ae: "UAE",
  sa: "Saudi Arabia",
  kw: "Kuwait",
  qa: "Qatar",
  bh: "Bahrain",
  om: "Oman",
  uk: "UK",
  at: "Austria",
  de: "Germany",
  fr: "France",
  in: "India",
  bg: "Bulgaria",
  ro: "Romania",
  us: "USA",
  eg: "Egypt",
  jo: "Jordan",
  lb: "Lebanon",
};

function registrableDomain(host) {
  const parts = String(host || "")
    .split(".")
    .filter(Boolean);
  return parts.slice(-2).join(".");
}

function regionForHost(host) {
  const labels = String(host || "").split(".");
  const tld = labels[labels.length - 1];
  const cc = labels[labels.length - 2];
  if (tld === "uk" && cc === "co") return "UK";
  if (REGION_BY_TLD[tld]) return REGION_BY_TLD[tld];
  return "Global";
}

function brandSlug(brand) {
  return String(brand || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function hostFlat(host) {
  return String(host || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Classify a source URL according to instruction §5, §15.18, §15.21. */
function classifySource(url, brand) {
  // §15.21 — a manufacturer catalogue / brochure / PDF is primary evidence, not a product page.
  const form = CATALOGUE_PATTERN.test(String(url))
    ? "CATALOGUE"
    : "PRODUCT_PAGE";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return { sourceType: "SECONDARY", region: "Global", host: "", form };
  }
  const slug = brandSlug(brand);
  const flat = hostFlat(host);
  const labels = host.split(".");
  const firstLabel = labels[0].toLowerCase();
  const region = regionForHost(host);

  // §15.18 — a distributor/retailer is never the manufacturer.
  if (DISTRIBUTOR_DOMAINS.some((d) => flat.includes(hostFlat(d)))) {
    return { sourceType: "AUTHORIZED_DISTRIBUTOR", region, host, form };
  }
  // Official manufacturer / regional official site: brand name appears in the host.
  if (
    (slug.length >= 4 && flat.includes(slug)) ||
    (firstLabel.length >= 4 && slug.includes(firstLabel))
  ) {
    return { sourceType: "OFFICIAL_MANUFACTURER", region, host, form };
  }
  if (
    DATABASE_DOMAINS.some((d) => flat.includes(d.replace(/[^a-z0-9]/g, "")))
  ) {
    return { sourceType: "ESTABLISHED_DATABASE", region, host, form };
  }
  if (
    RETAILER_DOMAINS.some((d) => flat.includes(d.replace(/[^a-z0-9]/g, "")))
  ) {
    return { sourceType: "RETAILER", region, host, form };
  }
  return { sourceType: "SECONDARY", region, host, form };
}

// ---------------------------------------------------------------- search & fetch

const NOISE_PATTERNS = [
  /\b\d+\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:ml|мл)\b/gi,
  /\b\d+(?:[.,]\d+)?\s*(?:ml|мл|fl\.?\s*oz\.?|ounces?)\b/gi,
  /\b(?:eau\s+de\s+parfum|eau\s+de\s+toilette|eau\s+de\s+cologne|extrait\s+de\s+parfum|pure\s+parfum|parfum(?:e)?|perfume|edp|edt|edc|vaporisateur|spray)\b/gi,
  /\b(?:for\s+men|for\s+women|for\s+him|for\s+her|pour\s+homme|pour\s+femme|unisex)\b/gi,
  /\b(?:gift\s+set|shower\s+gel|body\s+veil|body\s+milk|deo|deodorant|discovery\s+set|hydrating)\b/gi,
];

function coreName(name, brand) {
  let text = String(name || "");
  const slug = String(brand || "").trim();
  if (slug && text.toLowerCase().startsWith(slug.toLowerCase())) {
    text = text.slice(slug.length).trim();
  }
  for (const pattern of NOISE_PATTERNS) text = text.replace(pattern, " ");
  return text.replace(/\s+/g, " ").trim();
}

async function fetchWithTimeout(url, timeoutMs = 20000, accept = "*/*") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": "en-US,en;q=0.9",
        accept,
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDuckDuckGo(html) {
  return [...html.matchAll(/uddg=([^&"']+)/g)]
    .map((m) => {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return "";
      }
    })
    .filter((u) => /^https?:\/\//i.test(u));
}

/** Public search endpoint; retries because the HTML endpoint throttles bursts. */
async function searchWeb(query, attempts = 3) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, 20000, "text/html");
      if (response.ok) {
        const urls = parseDuckDuckGo(await response.text());
        if (urls.length) return urls;
      }
    } catch {
      /* retry */
    }
    await sleep(1500 * (attempt + 1));
  }
  return [];
}

function extractReadable(html) {
  let text = String(html || "");
  const meta =
    text.match(
      /<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ||
    text.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:og:)?description["']/i,
    )?.[1] ||
    "";
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return [meta, text].filter(Boolean).join(" │ ").slice(0, 7000);
}

async function collectSources(product, sourceLimit, seedUrls = []) {
  const brand = String(product.brand || "").trim();
  const core =
    coreName(product.name, brand) || String(product.name || "").trim();

  const found = new Map(); // url -> classification
  if (seedUrls.length) {
    for (const url of seedUrls) {
      const info = classifySource(url, brand);
      if (info.host) found.set(url, info);
    }
  } else {
    const queries = [
      `${brand} ${core} fragrance notes`,
      `${brand} ${core} perfume pyramid top heart base`,
      `${brand} ${core} site:parfumo.com`,
      `${brand} ${core} site:fragrantica.com`,
      `${brand} ${core} official`,
    ];
    for (const query of queries) {
      const results = await searchWeb(query);
      for (const url of results) {
        if (found.has(url)) continue;
        const info = classifySource(url, brand);
        if (!info.host) continue;
        found.set(url, info);
      }
      await sleep(1200);
    }
  }

  // Prefer official manufacturer pages, then databases, then retailers, then the rest.
  const order = {
    OFFICIAL_MANUFACTURER: 0,
    ESTABLISHED_DATABASE: 1,
    AUTHORIZED_DISTRIBUTOR: 2,
    RETAILER: 2,
    SECONDARY: 3,
  };
  const candidates = [...found.entries()]
    .map(([url, info]) => ({ url, ...info }))
    .sort((a, b) => order[a.sourceType] - order[b.sourceType]);

  const seenHosts = new Set();
  const selected = [];
  for (const candidate of candidates) {
    if (seenHosts.has(candidate.host)) continue;
    seenHosts.add(candidate.host);
    selected.push(candidate);
    if (selected.length >= sourceLimit) break;
  }

  const evidence = [];
  for (const candidate of selected) {
    const record = {
      url: candidate.url,
      host: candidate.host,
      sourceType: candidate.sourceType,
      form: candidate.form || "PRODUCT_PAGE",
      region: candidate.region,
      accessStatus: "SOURCE NOT LOCATED",
      text: "",
    };
    try {
      const response = await fetchWithTimeout(
        candidate.url,
        20000,
        "text/html",
      );
      if (response.ok) {
        const html = await response.text();
        record.text = extractReadable(html);
        record.accessStatus =
          record.text.length > 120 ? "PAGE ACCESSIBLE" : "SEARCH SNIPPET ONLY";
        if (!record.text) record.accessStatus = "PAGE ACCESSIBLE";
      } else if ([401, 403, 429].includes(response.status)) {
        record.accessStatus = "PAGE BLOCKED";
      } else if (response.status === 404) {
        record.accessStatus = "PAGE NOT FOUND";
      } else {
        record.accessStatus = `HTTP ${response.status}`;
      }
    } catch {
      record.accessStatus = "PAGE BLOCKED";
    }
    evidence.push(record);
  }
  return evidence;
}

// ---------------------------------------------------------------- DeepSeek extraction

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

const OUTPUT_CONTRACT = `

## OUTPUT CONTRACT (machine-readable)

You are given the product identity and a list of sources that the script already
fetched. Analyse ONLY those sources. Return strict JSON (no markdown, no prose)
in exactly this shape:

{
  "identification": {
    "productMatch": "Exact | Probable | Uncertain",
    "identityVerified": true,
    "identityIssues": "brand / name / concentration mismatch, else empty string",
    "concentration": "Eau de Parfum | Eau de Toilette | Extrait de Parfum | ... | Unspecified",
    "edition": "edition or flanker or empty string",
    "notes": "how the exact product was identified"
  },
  "sources": [
    {
      "index": 0,
      "productMatch": "Exact | Probable | Uncertain",
      "identityMatch": "EXACT | VERIFIED_ALIAS | PROBABLE | PARTIAL_MATCH | NO_MATCH | UNRESOLVED",
      "productName": "the product name exactly as written on this source page",
      "identityCriteria": {
        "brandMatch": true,
        "nameMatch": "EXACT | VERIFIED_ALIAS | PARTIAL | NONE",
        "productCodeMatch": "MATCH | MISMATCH | ABSENT",
        "concentrationMatch": "MATCH | MISMATCH | ABSENT",
        "editionMatch": "MATCH | MISMATCH | ABSENT"
      },
      "concentrationMatch": "Exact | Different | Unspecified",
      "productCode": "SKU / product code published by this source, else empty string",
      "volume": "bottle volume this source describes, e.g. 100 ml, else empty string",
      "regionalMarket": "market this source serves, e.g. UAE / India / Global",
      "sourceForm": "PRODUCT_PAGE | CATALOGUE | BROCHURE | OTHER",
      "topNotes": ["English note names published by this source"],
      "heartNotes": [],
      "baseNotes": [],
      "verifiedNotes": ["notes published without a phase"],
      "fragranceAccords": ["Woody", "Amber", ...],
      "topPhaseDescriptors": ["Woody Notes", ...],
      "heartPhaseDescriptors": [],
      "basePhaseDescriptors": [],
      "classifications": [
        { "term": "candidate exactly as written above", "class": "INDIVIDUAL_NOTE | NOTE_GROUP | ACCORD | PHASE_DESCRIPTOR | MARKETING_DESCRIPTOR | UNCLASSIFIED" }
      ],
      "noteVariants": [
        { "term": "term exactly as this source spells it", "canonicalForm": "the form it may be normalised to", "variantType": "TRUE_SYNONYM | BOTANICAL_SYNONYM | TYPOGRAPHIC_VARIANT | TRANSLITERATION_VARIANT | MATERIAL_DIFFERENCE", "reason": "short justification", "verification": "how the botanical or linguistic identity was checked, else empty string" }
      ],
      "observations": "short remark, empty string if none"
    }
  ],
  "conflictingInformation": "material disagreements between sources, or empty string",
  "researchNotes": "anything notable about access limits or identity, or empty string"
}

## LANGUAGE AND NORMALISATION (instruction §2, §15.7)

- Every note name MUST be in standard English, even when the source page is in
  another language. Translate the note name to its standard English term, e.g.
  Salz -> Salt, Zitrone -> Lemon, Maiglöckchen -> Lily of the Valley,
  Sandelholz -> Sandalwood, Eichenmoos -> Oakmoss, Veilchen -> Violet,
  Geranie -> Geranium (Rose stays Rose).
- Never output a non-English note name, a bilingual name, or a translated duo.
- Normalise true synonyms to one term: Orris -> Iris; Tonka -> Tonka Bean;
  Cedarwood -> Cedar; White Musk -> Musk. Keep Violet and Violet Leaf distinct.
- Set "identityVerified": false when a source describes a different brand or a
  different product variant than the requested product, and explain it in
  "identityIssues".

## CANDIDATE CLASSIFICATION (instruction §15.17, §15.26)

List EVERY note-like term you put in a note field in "classifications" and give it
exactly one class: INDIVIDUAL_NOTE, NOTE_GROUP, ACCORD, PHASE_DESCRIPTOR,
MARKETING_DESCRIPTOR or UNCLASSIFIED.
- A manufacturer may place a broad accord or descriptor INSIDE a structured Top,
  Heart or Base section (e.g. "Ambery", "Woody Accords", "Spicy Accords", "Floral",
  "Spicy Floral", "Powdery", "Gourmand Notes"). Its position in a phase does NOT
  make it an individual note: classify it as ACCORD, PHASE_DESCRIPTOR or
  MARKETING_DESCRIPTOR, never INDIVIDUAL_NOTE.
- Generic expressions ("Woody Notes", "Floral Notes", "Spicy Notes", "Powdery
  Notes", "Sweet Notes", "Gourmand Notes") are NOT individual notes.
- "Green Notes", "Fruity Notes" and similar established note groups are
  contextual: classify as NOTE_GROUP unless the source clearly lists them as a
  concrete ingredient.
- When unsure, use UNCLASSIFIED. Only "INDIVIDUAL_NOTE" may enter the individual
  note fields of the canonical pyramid; the rest are descriptors.

## SYNONYMS AND DUPLICATES WITHIN ONE PYRAMID (instruction §15.27)

- Detect semantic duplicates inside the same phase and report each pair only once:
  Agarwood = Oud; Cedar = Cedarwood; Tonka = Tonka Bean; White Musk = Musk
  (context-dependent). A synonym pair is ONE note, not two.
- Preserve the source's original wording in the note fields; do not delete notes
  that genuinely repeat across different phases.
- Do not merge terms that are related but materially different (e.g. Violet vs
  Violet Leaf, Amber vs Ambery).

## TYPOGRAPHIC VARIANTS VS. FRAGRANCE NOTE SYNONYMS (instruction §15.28)

- A spelling difference is NOT automatically a synonym. Classify every suspected
  variant in "noteVariants" as exactly one of these five types:
  TRUE_SYNONYM (different words, same material, e.g. Agarwood / Oud);
  BOTANICAL_SYNONYM (two accepted botanical names for one plant);
  TYPOGRAPHIC_VARIANT (a spelling slip, e.g. Rosa Centiflora / Rosa Centifolia);
  TRANSLITERATION_VARIANT (the same name across scripts, e.g. Rahaba / Rehaba);
  MATERIAL_DIFFERENCE (genuinely different materials, e.g. Violet / Violet Leaf).
- For every variant: keep the exact wording each source used, state its type and
  record the botanical or linguistic verification in "verification".
- Never silently correct a spelling: the original wording MUST stay in the note
  fields; normalisation is for comparison only and MUST be reported.
- MATERIAL_DIFFERENCE terms are never merged and never treated as one note.

Rules: never invent notes or phases. Keep accords and phase descriptors out of the
note fields. Use empty arrays when a source does not publish the information. One
entry in "sources" per provided source index.

## IDENTITY, REGION, VOLUME (instruction §15.20, §15.21, §15.22, §15.23)

- Set "productMatch": "Exact" ONLY when the source describes the requested product
  itself (same brand, same exact name, same flanker/edition, same concentration).
  Similar names are NOT the same product: Magnificent Pour Femme ≠ Magnificent
  Jardin ≠ Magnificent Pour Homme ≠ Magnificent Collection. A source describing a
  look-alike must be marked "Probable" or "Uncertain" - never "Exact".
- Regional official pages (e.g. brand.com, brand.ae, in.brand.com, us.brand.com)
  are SEPARATE evidence. Report each one's own pyramid; never average them.
- A catalogue / brochure / manufacturer PDF ("sourceForm": "CATALOGUE") is valid
  primary evidence even when the current product page shows no pyramid. Record its
  title, date or version, page and exact product code in "observations" when available.
- Record "volume" per source. Different volumes alone do NOT mean a different
  fragrance and do NOT make two sources independent.

## DETERMINISTIC PRODUCT IDENTITY MATCHING (instruction §15.30)

- "identityMatch" is a controlled classification, separate from "productMatch":
  EXACT | VERIFIED_ALIAS | PROBABLE | PARTIAL_MATCH | NO_MATCH | UNRESOLVED.
- Fill "identityCriteria" explicitly and in this order: brand match, exact or
  independently verified alternative name, product code/SKU match, concentration
  match, gender/edition match. The script re-derives the class from these fields,
  so the final classification is deterministic and reproducible.
- "EXACT" only when the source describes the requested product itself.
  "VERIFIED_ALIAS" only when the alternative name is independently established as
  the same product. "PROBABLE" never supports official confirmation.
  "PARTIAL_MATCH" is never exact product evidence. "UNRESOLVED" triggers review.
- Report "productName" exactly as written on the page and the code/edition match
  states. Never promote a PROBABLE source to EXACT.

## OFFICIAL SOURCE AVAILABILITY (instruction §15.25)

- An inaccessible official page does NOT prove that no official source exists.
  Never conclude "no official information" from a 404, a block or a missing page.
- When the official page is unavailable, keep looking for other manufacturer
  sources: regional domains, country-specific stores, catalogues, manufacturer
  PDFs and brochures, brand-operated marketplaces.
- Treat these as four DISTINCT, non-interchangeable conditions:
  OFFICIAL SOURCE NOT FOUND, OFFICIAL PAGE INACCESSIBLE, OFFICIAL SOURCE FOUND,
  PRODUCT IDENTITY UNVERIFIED. State which one applies in "researchNotes".`;

async function analyzeWithDeepSeek({
  brand,
  name,
  evidence,
  timeoutMs = 120000,
}) {
  const identity =
    `Product ID: ${brand} — ${name}\n` +
    `Brand: ${brand || "unknown"}\nFull product name: ${name}\n\n` +
    "Sources fetched by the script:\n" +
    evidence
      .map(
        (item, index) =>
          `[${index}] type=${item.sourceType} region=${item.region} access=${item.accessStatus} url=${item.url}\n${item.text || "(no text retrieved)"}`,
      )
      .join("\n\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: INSTRUCTION + OUTPUT_CONTRACT },
          { role: "user", content: identity },
        ],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `DeepSeek HTTP ${response.status}: ${String(detail).slice(0, 200)}`,
      );
    }
    const data = await response.json();
    return extractJsonObject(data?.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- status assignment (deterministic)

const LAYERS = ["top", "heart", "base"];
const arrayOf = (v) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];

function hasPyramid(extraction) {
  return LAYERS.some(
    (layer) => arrayOf(extraction[`${layer}Notes`]).length > 0,
  );
}
function hasNotes(extraction) {
  return hasPyramid(extraction) || arrayOf(extraction.verifiedNotes).length > 0;
}

function mergeExtractions(list) {
  const merged = {
    top: [],
    heart: [],
    base: [],
    verifiedNotes: [],
    fragranceAccords: [],
    topPhaseDescriptors: [],
    heartPhaseDescriptors: [],
    basePhaseDescriptors: [],
  };
  const seen = new Set();
  for (const item of list) {
    for (const layer of LAYERS) {
      for (const note of arrayOf(item[`${layer}Notes`])) {
        const key = `${layer}:${note.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged[layer].push(note);
        }
      }
    }
    for (const note of arrayOf(item.verifiedNotes)) {
      const key = `v:${note.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.verifiedNotes.push(note);
      }
    }
    for (const key of [
      "fragranceAccords",
      "topPhaseDescriptors",
      "heartPhaseDescriptors",
      "basePhaseDescriptors",
    ]) {
      for (const value of arrayOf(item[key])) {
        const seenKey = `${key}:${value.toLowerCase()}`;
        if (!seen.has(seenKey)) {
          seen.add(seenKey);
          merged[key].push(value);
        }
      }
    }
  }
  return merged;
}

function pyramidsDiffer(a, b) {
  const norm = (x) =>
    LAYERS.map((l) =>
      arrayOf(x[`${l}Notes`])
        .map((n) => n.toLowerCase())
        .sort()
        .join(","),
    ).join("|");
  return norm(a) !== norm(b);
}

/** Annotated sources keep the model output under `.extracted`. */
const extractionOf = (source) => source?.extracted || {};

/** Assign Notes + Pyramid verification statuses per instruction §9 (script-owned). */
function assignStatuses(official, others) {
  // §15.30 — only EXACT / VERIFIED_ALIAS identities may confirm a product.
  const officialAccessible = official.filter(
    (s) => s.accessStatus === "PAGE ACCESSIBLE" && isExactIdentity(s),
  );
  const officialWithPyramid = officialAccessible.filter((s) =>
    hasPyramid(extractionOf(s)),
  );
  const officialNotesOnly = officialAccessible.filter(
    (s) =>
      !hasPyramid(extractionOf(s)) &&
      arrayOf(extractionOf(s).verifiedNotes).length > 0,
  );

  let conflict = false;
  if (officialWithPyramid.length >= 2) {
    for (let i = 1; i < officialWithPyramid.length; i += 1) {
      if (
        pyramidsDiffer(
          extractionOf(officialWithPyramid[0]),
          extractionOf(officialWithPyramid[i]),
        )
      )
        conflict = true;
    }
  }

  const independentOthers = new Set(
    others
      .filter(
        (s) =>
          s.accessStatus === "PAGE ACCESSIBLE" &&
          isExactIdentity(s) &&
          hasNotes(extractionOf(s)),
      )
      .map((s) => registrableDomain(s.host)),
  );
  const nonOfficialCount = independentOthers.size;

  let notesStatus;
  let pyramidStatus;
  if (conflict) {
    notesStatus = "CONFLICTING SOURCES";
    pyramidStatus = "CONFLICTING SOURCES";
  } else if (officialWithPyramid.length >= 1) {
    notesStatus = "OFFICIALLY CONFIRMED";
    pyramidStatus = "OFFICIALLY CONFIRMED";
  } else if (officialNotesOnly.length >= 1) {
    notesStatus = "OFFICIALLY CONFIRMED";
    pyramidStatus = "VERIFIED NOTES — PYRAMID UNSPECIFIED";
  } else if (nonOfficialCount >= 2) {
    notesStatus = "CROSS-VERIFIED";
    pyramidStatus = "CROSS-VERIFIED";
  } else if (nonOfficialCount === 1) {
    const single = others.find(
      (s) =>
        s.accessStatus === "PAGE ACCESSIBLE" &&
        isExactIdentity(s) &&
        hasNotes(extractionOf(s)),
    );
    notesStatus = "SINGLE SECONDARY SOURCE";
    pyramidStatus =
      single && hasPyramid(extractionOf(single))
        ? "SINGLE SECONDARY SOURCE"
        : "VERIFIED NOTES — PYRAMID UNSPECIFIED";
  } else {
    notesStatus = "NOT PUBLICLY DISCLOSED";
    pyramidStatus = "NOT PUBLICLY DISCLOSED";
  }
  return {
    notesStatus,
    pyramidStatus,
    conflict,
    nonOfficialCount,
    officialAccessible: officialAccessible.length,
  };
}

// ---------------------------------------------------------------- canonical pyramid (instruction §15)

const emptyPyramid = () => ({ top: [], heart: [], base: [] });

// §15.16, §15.27 — synonym normalisation for comparison only; published wording is preserved.
const NOTE_SYNONYMS = [
  [/\borris\b/g, "iris"],
  [/\bcedarwood\b/g, "cedar"],
  [/\btonka\b(?!\s+bean)/g, "tonka bean"],
  [/\bwhite\s+musk\b/g, "musk"],
  [/\bmusk\s+white\b/g, "musk"],
  [/\bagarwood\s*\(oud\)/g, "oud"],
  [/\bagarwood\b/g, "oud"],
  [/\brosa\s+centiflora\b/g, "rosa centifolia"],
];
function normNote(note) {
  let value = String(note).toLowerCase().replace(/\s+/g, " ").trim();
  for (const [re, to] of NOTE_SYNONYMS) value = value.replace(re, to);
  return value.replace(/\bnotes?$/g, "").trim();
}

// §15.28 — the five recognised classes of difference between two spellings/terms.
const VARIANT_TYPES = [
  "TRUE_SYNONYM",
  "BOTANICAL_SYNONYM",
  "TYPOGRAPHIC_VARIANT",
  "TRANSLITERATION_VARIANT",
  "MATERIAL_DIFFERENCE",
];

const lightNorm = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Established normalisation pairs and their type (§15.27, §15.28). Compared on the
// raw spelling, never on the already-normalised form.
const KNOWN_VARIANTS = [
  { from: "agarwood", to: "oud", type: "TRUE_SYNONYM" },
  { from: "cedarwood", to: "cedar", type: "TRUE_SYNONYM" },
  { from: "tonka", to: "tonka bean", type: "TRUE_SYNONYM" },
  { from: "white musk", to: "musk", type: "TRUE_SYNONYM" },
  { from: "orris", to: "iris", type: "TRUE_SYNONYM" },
  {
    from: "rosa centiflora",
    to: "rosa centifolia",
    type: "TYPOGRAPHIC_VARIANT",
  },
  { from: "rehaba", to: "rahaba", type: "TRANSLITERATION_VARIANT" },
];

/** True when the Levenshtein distance between a and b is at most `max`. */
function withinEditDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = row[j];
  }
  return prev[b.length] <= max;
}

/**
 * §15.28 — a spelling difference is NOT automatically a synonym. Classify the
 * difference deterministically from a known registry, then from edit distance.
 * Never used to silently overwrite the published wording.
 */
function classifyVariantType(from, to) {
  const a = lightNorm(from);
  const b = lightNorm(to);
  if (!a || !b) return "MATERIAL_DIFFERENCE";
  if (a === b) return "TRUE_SYNONYM";
  const known = KNOWN_VARIANTS.find(
    (v) => (v.from === a && v.to === b) || (v.from === b && v.to === a),
  );
  if (known) return known.type;
  if (a.length > 3 && b.length > 3 && withinEditDistance(a, b, 2))
    return "TYPOGRAPHIC_VARIANT";
  return "MATERIAL_DIFFERENCE";
}

// §15.26 — broad accords/descriptors are NOT individual notes even when the
// manufacturer places them inside a structured Top/Heart/Base section. These terms
// are never individual ingredients, so this check is authoritative.
const ACCORD_DESCRIPTORS = [
  /^(?:ambery|woody|floral|spicy|spicy\s+floral|powdery|gourmand|musky|aromatic|balsamic|resinous|animalic|sweet|smoky|warm(?:\s+spicy)?|oriental|fruity|green|aquatic|citrus|fresh|leathery)(?:\s+(?:notes?|accords?|accord|facets?|tones?))?$/i,
];
// §15.17 — fallback for generic expressions the model leaves unclassified.
const GENERIC_DESCRIPTORS = [
  /^(woody|floral|spicy|powdery|sweet|gourmand|musky|ambery|aromatic|balsamic|resinous|animalic)\s+notes?$/i,
  /^(woody|floral|spicy|powdery|aromatic)\s+accords?$/i,
];
// Both the §15.17 spelling (FRAGRANCE_ACCORD / MARKETING_DESCRIPTION) and the
// §15.26 spelling (ACCORD / MARKETING_DESCRIPTOR) are accepted.
const EXCLUDED_CLASSES = new Set([
  "NOTE_GROUP",
  "FRAGRANCE_ACCORD",
  "ACCORD",
  "PHASE_DESCRIPTOR",
  "MARKETING_DESCRIPTION",
  "MARKETING_DESCRIPTOR",
  "UNCLASSIFIED",
]);

/** Class of a candidate term (§15.17, §15.26). */
function classOf(ext, term) {
  const raw = String(term).trim();
  // §15.26 — an unambiguous broad descriptor never becomes an individual note.
  if (ACCORD_DESCRIPTORS.some((re) => re.test(raw))) return "ACCORD";
  const map = ext?.classMap;
  if (map && map.size) {
    const hit = map.get(raw.toLowerCase()) || map.get(normNote(raw));
    if (hit) return hit;
  }
  if (GENERIC_DESCRIPTORS.some((re) => re.test(raw))) return "PHASE_DESCRIPTOR";
  return "INDIVIDUAL_NOTE";
}

/** §15.27 — drop semantic duplicates inside one phase, keeping the source wording. */
function dedupePhase(notes) {
  const seen = new Set();
  const out = [];
  for (const note of notes) {
    const key = normNote(note);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(note);
  }
  return out;
}

/** Split one source extraction into the individual-note pyramid and excluded descriptors. */
function classifyExtraction(ext) {
  const individual = emptyPyramid();
  const excluded = [];
  for (const layer of LAYERS) {
    for (const note of arrayOf(ext[`${layer}Notes`])) {
      const cls = classOf(ext, note);
      if (EXCLUDED_CLASSES.has(cls))
        excluded.push({ term: note, phase: layer, classification: cls });
      else individual[layer].push(note);
    }
    // §15.27 — synonyms inside one phase (e.g. Agarwood + Oud) count once.
    individual[layer] = dedupePhase(individual[layer]);
  }
  return { individual, excluded };
}

const hasIndividualNotes = (pyr) =>
  LAYERS.some((layer) => arrayOf(pyr[layer]).length > 0);
const keyOfNotes = (pyr) =>
  LAYERS.map((layer) =>
    arrayOf(pyr[layer]).map(normNote).sort().join(","),
  ).join("|");

/**
 * §15.29 — completeness of the canonical pyramid, kept SEPARATE from the
 * publication status. An empty phase is never read as "the fragrance has no such
 * notes".
 */
function classifyCompleteness(canonical, verifiedNotes, phaseDescriptors) {
  const phasesWithNotes = LAYERS.filter(
    (layer) => arrayOf(canonical?.[layer]).length > 0,
  );
  const anyIndividual =
    phasesWithNotes.length > 0 || arrayOf(verifiedNotes).length > 0;
  if (!anyIndividual) {
    const hasDescriptors = LAYERS.some(
      (layer) => arrayOf((phaseDescriptors || {})[layer]).length > 0,
    );
    return hasDescriptors ? "DESCRIPTORS_ONLY" : "UNAVAILABLE";
  }
  if (phasesWithNotes.length === LAYERS.length) return "COMPLETE";
  // Individual notes confirmed, but their phase assignments are not.
  if (phasesWithNotes.length === 0) return "PHASES_UNSPECIFIED";
  return "PARTIAL";
}

/**
 * §15.30 — deterministic identity classification derived from the model's explicit
 * matching criteria. The model may never promote a weaker class to EXACT.
 */
const IDENTITY_MATCHES = [
  "EXACT",
  "VERIFIED_ALIAS",
  "PROBABLE",
  "PARTIAL_MATCH",
  "NO_MATCH",
  "UNRESOLVED",
];

function classifyIdentityMatch(found) {
  const criteria =
    found.identityCriteria && typeof found.identityCriteria === "object"
      ? found.identityCriteria
      : {};
  const brandMatch = criteria.brandMatch;
  const nameMatch = String(criteria.nameMatch || "").toUpperCase();
  const codeMatch = String(criteria.productCodeMatch || "").toUpperCase();
  const concentration = String(criteria.concentrationMatch || "").toUpperCase();
  const edition = String(criteria.editionMatch || "").toUpperCase();

  const declared = String(found.identityMatch || "").toUpperCase();
  const legacy = String(found.productMatch || "").toLowerCase();

  // Hard negatives first: reproducible regardless of the model's own label.
  if (brandMatch === false || nameMatch === "NONE") {
    return {
      match: "NO_MATCH",
      reason: "brand or product name does not describe the requested product",
    };
  }

  let match = IDENTITY_MATCHES.includes(declared)
    ? declared
    : legacy === "exact"
      ? "EXACT"
      : legacy === "probable"
        ? "PROBABLE"
        : "UNRESOLVED";

  const reasons = [];
  // A code/edition mismatch can never be an exact match (§15.30).
  if (
    match === "EXACT" &&
    (codeMatch === "MISMATCH" || edition === "MISMATCH")
  ) {
    match = "PARTIAL_MATCH";
    reasons.push(
      codeMatch === "MISMATCH" ? "product code mismatch" : "edition mismatch",
    );
  }
  if (match === "EXACT" && concentration === "MISMATCH") {
    match = "PARTIAL_MATCH";
    reasons.push("concentration mismatch");
  }
  if (
    match === "EXACT" &&
    (brandMatch === false || (nameMatch && nameMatch !== "EXACT"))
  ) {
    match = "PARTIAL_MATCH";
    reasons.push("brand or product name not exact");
  }
  if (match === "VERIFIED_ALIAS" && nameMatch !== "VERIFIED_ALIAS") {
    match = "UNRESOLVED";
    reasons.push("alternative name is not independently verified");
  }
  return { match, reason: reasons.join("; ") };
}

/** §15.30 — only EXACT and VERIFIED_ALIAS may support official confirmation. */
const isExactIdentity = (source) =>
  source?.identityMatch === "EXACT" ||
  source?.identityMatch === "VERIFIED_ALIAS";

/**
 * §15.28 — preserve the exact wording of every suspected spelling variant together
 * with its type, reason and verification, so normalisation never silently overwrites
 * the source evidence.
 */
function buildNormalizationLog(annotated) {
  const byKey = new Map();
  for (const source of annotated) {
    const ext = extractionOf(source);
    for (const variant of Array.isArray(ext.noteVariants)
      ? ext.noteVariants
      : []) {
      const original = String(variant?.term || "").trim();
      const normalized = String(variant?.canonicalForm || "").trim();
      if (
        !original ||
        !normalized ||
        lightNorm(original) === lightNorm(normalized)
      )
        continue;
      const declared = String(variant?.variantType || "").toUpperCase();
      const type = VARIANT_TYPES.includes(declared)
        ? declared
        : classifyVariantType(original, normalized);
      const key = `${lightNorm(original)}->${lightNorm(normalized)}:${type}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          original,
          normalized,
          variantType: type,
          reason: String(variant?.reason || ""),
          verification: String(variant?.verification || ""),
          sources: [],
        });
      }
      const entry = byKey.get(key);
      if (!entry.sources.includes(source.url)) entry.sources.push(source.url);
    }
  }
  return [...byKey.values()];
}

/** §15.23 — the bottle volume a source describes, when the URL states it. */
function volumeOf(source) {
  const match = String(source?.url || "").match(/(\d{2,4})\s*(?:ml|мл)\b/i);
  return match ? `${match[1]} ml` : "";
}

/**
 * §15.25 — an inaccessible official page does NOT prove the official source does
 * not exist. The four availability states are kept distinct and are never
 * interchangeable.
 */
function officialAvailability(officialSources, identityVerified) {
  if (identityVerified === false) return "PRODUCT IDENTITY UNVERIFIED";
  if (officialSources.some((s) => s.accessStatus === "PAGE ACCESSIBLE"))
    return "OFFICIAL SOURCE FOUND";
  if (officialSources.some((s) => s.accessStatus !== "SOURCE NOT LOCATED"))
    return "OFFICIAL PAGE INACCESSIBLE";
  return "OFFICIAL SOURCE NOT FOUND";
}

/**
 * §15.20 — classify the difference between two official pyramids:
 *   MATERIAL         each side owns notes the other lacks -> a real contradiction
 *   PHASE_ASSIGNMENT same notes, different phases
 *   COMPATIBLE       one side is a subset of the other (a reduced regional listing)
 *   IDENTICAL        equal after normalisation (cosmetic wording differences only)
 */
function pyramidDelta(a, b) {
  const setA = new Set(
    LAYERS.flatMap((layer) => arrayOf(a[layer]).map(normNote)),
  );
  const setB = new Set(
    LAYERS.flatMap((layer) => arrayOf(b[layer]).map(normNote)),
  );
  const aOnly = [...setA].filter((n) => !setB.has(n));
  const bOnly = [...setB].filter((n) => !setA.has(n));
  if (aOnly.length && bOnly.length) return "MATERIAL";
  if (!aOnly.length && !bOnly.length)
    return keyOfNotes(a) === keyOfNotes(b) ? "IDENTICAL" : "PHASE_ASSIGNMENT";
  return "COMPATIBLE";
}

/** Union of official pyramids with phase voting; notes with conflicting phases are withheld. */
function unionOfficials(pyramids) {
  const canonical = emptyPyramid();
  const buckets = new Map();
  for (const pyr of pyramids) {
    for (const layer of LAYERS) {
      for (const note of arrayOf(pyr[layer])) {
        const key = normNote(note);
        if (!buckets.has(key))
          buckets.set(key, { display: note, phases: new Map() });
        const bucket = buckets.get(key);
        bucket.phases.set(layer, (bucket.phases.get(layer) || 0) + 1);
      }
    }
  }
  const withheld = [];
  for (const bucket of buckets.values()) {
    const phases = [...bucket.phases.entries()].sort((a, b) => b[1] - a[1]);
    if (phases.length === 1) canonical[phases[0][0]].push(bucket.display);
    else
      withheld.push({
        note: bucket.display,
        phases: phases.map(([p]) => p),
        reason: "PHASE UNVERIFIED",
      });
  }
  return { canonical, withheld };
}

/** §15.19 — traceable evidence for every published canonical note. */
function evidenceFor(canonical, sources, classified) {
  const notes = [];
  for (const layer of LAYERS) {
    for (const note of arrayOf(canonical[layer])) {
      const urls = sources
        .filter((s) => {
          const ind = classified.get(s)?.individual;
          return (
            ind &&
            arrayOf(ind[layer]).some((n) => normNote(n) === normNote(note))
          );
        })
        .map((s) => s.url);
      notes.push({ note, phase: layer, sources: urls });
    }
  }
  return notes;
}

/**
 * Deterministically pick exactly ONE canonical pyramid for the website (§15).
 * Official documentation wins; its disagreement with secondary sources is NOT a
 * conflict by itself (§15.6). Statuses are owned by the script, not the model.
 */
function selectCanonical(annotated, identification) {
  // §15.22, §15.30 — only sources whose EXACT / VERIFIED_ALIAS identity is
  // established may confirm the product; PROBABLE and weaker never do.
  const accessible = annotated.filter(
    (s) => s.accessStatus === "PAGE ACCESSIBLE",
  );
  const exact = accessible.filter(isExactIdentity);
  const similar = accessible.filter((s) => !isExactIdentity(s));
  const classified = new Map(
    exact.map((s) => [s, classifyExtraction(extractionOf(s))]),
  );
  const identityVerified =
    exact.length > 0 && identification?.identityVerified !== false;

  // §15.19 — datasets kept strictly separate.
  const excludedDescriptors = [];
  for (const s of exact) {
    for (const item of classified.get(s).excluded)
      excludedDescriptors.push({ ...item, source: s.url });
  }
  const sourcePyramids = exact
    .filter((s) => hasIndividualNotes(classified.get(s).individual))
    .map((s) => ({
      url: s.url,
      host: s.host,
      sourceType: s.sourceType,
      form: s.form || "PRODUCT_PAGE",
      region: s.region,
      regionalMarket: s.regionalMarket || "",
      volume: s.volume || volumeOf(s),
      productCode: s.productCode || "",
      productMatch: s.productMatch,
      identityMatch: s.identityMatch,
      concentrationMatch: s.concentrationMatch,
      role:
        s.sourceType === "OFFICIAL_MANUFACTURER"
          ? "OFFICIAL_EVIDENCE"
          : "SUPPORTING",
      pyramid: { ...classified.get(s).individual },
    }));

  // §15.22 — look-alike products are preserved as evidence but never combined.
  const research = {
    excludedDescriptors,
    rejectedIdentitySources: similar.map((s) => ({
      url: s.url,
      host: s.host,
      sourceType: s.sourceType,
      productMatch: s.productMatch,
      identityMatch: s.identityMatch,
      identityReason: s.identityReason || "",
    })),
  };
  const sourceConflicts = [];
  const base = (extra) => ({
    research,
    sourcePyramids,
    excludedDescriptors,
    sourceConflicts,
    disputedNotes: [],
    verifiedNotes: [],
    ...extra,
  });

  // §15.22 — if the exact identity cannot be established: IDENTITY UNVERIFIED + PUBLICATION HOLD.
  if (!identityVerified) {
    return {
      canonical: emptyPyramid(),
      publicationStatus: "IDENTITY UNVERIFIED",
      identityVerified: false,
      publicationHold: true,
      phaseVerification: "Identity not established (no exact-match source)",
      ...base({}),
    };
  }

  const official = exact.filter(
    (s) =>
      s.sourceType === "OFFICIAL_MANUFACTURER" &&
      hasIndividualNotes(classified.get(s).individual),
  );

  // 1) Official manufacturer documentation wins (§15.6, §15.16, §15.20, §15.21).
  if (official.length >= 1) {
    const pyramids = official.map((s) => classified.get(s).individual);
    const comparisons = [];
    let material = false;
    for (let i = 0; i < official.length; i += 1) {
      for (let j = i + 1; j < official.length; j += 1) {
        const delta = pyramidDelta(pyramids[i], pyramids[j]);
        comparisons.push({
          a: official[i].url,
          b: official[j].url,
          regionA: official[i].region,
          regionB: official[j].region,
          volumeA: official[i].volume || volumeOf(official[i]),
          volumeB: official[j].volume || volumeOf(official[j]),
          delta,
        });
        if (delta === "MATERIAL") material = true;
      }
    }
    research.officialComparison = comparisons;

    // §15.20 — official regional pages may not override one another; a material
    // disagreement between them stays unresolved.
    if (material) {
      const conflict = {
        type: "OFFICIAL_OFFICIAL",
        reason:
          "Official regional pages publish materially different pyramids (§15.20)",
        sources: official.map((s) => ({
          url: s.url,
          region: s.region,
          volume: s.volume || volumeOf(s),
          productCode: s.productCode || "",
          pyramid: classified.get(s).individual,
        })),
      };
      sourceConflicts.push(conflict);
      research.officialConflict = conflict.sources;
      return {
        canonical: emptyPyramid(),
        publicationStatus: "CONFLICTING SOURCES",
        identityVerified: true,
        publicationHold: true,
        phaseVerification:
          "Unresolved material conflict between official regional sources",
        ...base({}),
      };
    }

    // All official pyramids agree (identical, phase-only or subset differences).
    if (
      official.length === 1 ||
      pyramids.every((p) => keyOfNotes(p) === keyOfNotes(pyramids[0]))
    ) {
      const canonical = { ...pyramids[0] };
      return {
        canonical,
        publicationStatus: "OFFICIALLY CONFIRMED",
        identityVerified: true,
        publicationHold: false,
        phaseVerification:
          official.length > 1
            ? "Verified (official regional sources agree)"
            : "Verified (official manufacturer source)",
        ...base({
          verifiedNotes: evidenceFor(canonical, official, classified),
        }),
      };
    }

    const { canonical, withheld } = unionOfficials(pyramids);
    return {
      canonical,
      publicationStatus: "OFFICIALLY CONFIRMED",
      identityVerified: true,
      publicationHold: false,
      phaseVerification: withheld.length
        ? "Official regional sources merged without contradiction (some phases unresolved)"
        : "Verified (official regional sources merged without contradiction)",
      ...base({
        disputedNotes: withheld,
        verifiedNotes: evidenceFor(canonical, official, classified),
      }),
    };
  }

  // 2) Independent secondary sources, deduplicated by registrable domain (§15.4, §15.23).
  const secondary = exact.filter(
    (s) =>
      s.sourceType !== "OFFICIAL_MANUFACTURER" &&
      hasIndividualNotes(classified.get(s).individual),
  );
  const byDomain = new Map();
  for (const source of secondary) {
    const domain = registrableDomain(source.host);
    if (!byDomain.has(domain)) byDomain.set(domain, source);
  }
  const independent = [...byDomain.values()];

  if (independent.length === 0) {
    const anyNotes = exact.some((s) => hasNotes(extractionOf(s)));
    return {
      canonical: emptyPyramid(),
      publicationStatus: anyNotes ? "UNVERIFIED" : "PUBLICATION HOLD",
      identityVerified: true,
      publicationHold: !anyNotes,
      phaseVerification: "Not available",
      ...base({}),
    };
  }
  if (independent.length === 1) {
    const canonical = { ...classified.get(independent[0]).individual };
    return {
      canonical,
      publicationStatus: "SINGLE SECONDARY SOURCE",
      identityVerified: true,
      publicationHold: false,
      phaseVerification: "Single independent source",
      ...base({
        verifiedNotes: evidenceFor(canonical, independent, classified),
      }),
    };
  }
  if (
    independent.every(
      (s) =>
        keyOfNotes(classified.get(s).individual) ===
        keyOfNotes(classified.get(independent[0]).individual),
    )
  ) {
    const canonical = { ...classified.get(independent[0]).individual };
    return {
      canonical,
      publicationStatus: "CROSS-VERIFIED",
      identityVerified: true,
      publicationHold: false,
      phaseVerification: "Verified (independent sources agree)",
      ...base({
        verifiedNotes: evidenceFor(canonical, independent, classified),
      }),
    };
  }

  // Sources disagree: keep only notes confirmed by >=2 independent sources in ONE phase (§15.9).
  const votes = new Map();
  for (const source of independent) {
    const ext = classified.get(source).individual;
    for (const layer of LAYERS) {
      for (const note of arrayOf(ext[layer])) {
        const key = normNote(note);
        if (!votes.has(key))
          votes.set(key, { display: note, phases: new Map() });
        const bucket = votes.get(key);
        bucket.phases.set(layer, (bucket.phases.get(layer) || 0) + 1);
      }
    }
  }
  const canonical = emptyPyramid();
  const disputedNotes = [];
  for (const bucket of votes.values()) {
    const total = [...bucket.phases.values()].reduce((a, b) => a + b, 0);
    const phases = [...bucket.phases.entries()].sort((a, b) => b[1] - a[1]);
    if (total >= 2 && phases.length === 1)
      canonical[phases[0][0]].push(bucket.display);
    else if (total >= 2)
      disputedNotes.push({
        note: bucket.display,
        phases: phases.map(([p]) => p),
        reason: "PHASE UNVERIFIED",
      });
    else
      disputedNotes.push({
        note: bucket.display,
        phases: phases.map(([p]) => p),
        reason: "SINGLE SOURCE NOTE",
      });
  }
  sourceConflicts.push({
    type: "SECONDARY_SECONDARY",
    reason:
      "Independent secondary sources disagree; only notes confirmed in one phase by >=2 sources are published",
    sources: independent.map((s) => ({
      url: s.url,
      host: s.host,
      sourceType: s.sourceType,
      pyramid: classified.get(s).individual,
    })),
  });
  research.disputedNotes = disputedNotes;
  const hasAny = LAYERS.some((layer) => canonical[layer].length);
  return {
    canonical,
    publicationStatus: hasAny ? "PARTIALLY CONFIRMED" : "CONFLICTING SOURCES",
    identityVerified: true,
    publicationHold: !hasAny,
    phaseVerification: hasAny
      ? "Partially verified (some notes withheld)"
      : "Independent sources disagree",
    ...base({
      disputedNotes,
      verifiedNotes: evidenceFor(canonical, independent, classified),
    }),
  };
}

// ---------------------------------------------------------------- supabase helpers

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
    if (!response.ok)
      throw new Error(
        `Could not read stocks (${response.status}): ${(await response.text()).slice(0, 300)}`,
      );
    const page = await response.json();
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

async function patchStockResearch(rowId, info, research) {
  const response = await restFetch(
    `${SUPABASE_URL}/rest/v1/stocks?id=eq.${rowId}`,
    {
      method: "PATCH",
      headers: { ...authHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({ info: { ...info, fragranceResearch: research } }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Could not save research for ${rowId} (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  }
}

// ---------------------------------------------------------------- main

function parseArgs() {
  const args = {
    ids: [],
    random: 0,
    limit: 0,
    write: false,
    concurrency: 3,
    sourceLimit: 6,
    photoOnly: true,
    urlsFile: null,
  };
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === "--ids")
      args.ids = String(process.argv[++i] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (arg === "--random") args.random = Number(process.argv[++i]) || 0;
    else if (arg === "--limit") args.limit = Number(process.argv[++i]) || 0;
    else if (arg === "--write") args.write = true;
    else if (arg === "--no-photo-only") args.photoOnly = false;
    else if (arg === "--concurrency")
      args.concurrency = Math.max(1, Number(process.argv[++i]) || 3);
    else if (arg === "--source-limit")
      args.sourceLimit = Math.max(1, Number(process.argv[++i]) || 6);
    else if (arg === "--urls-file")
      args.urlsFile = String(process.argv[++i] || "");
  }
  return args;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function researchProduct(row, args) {
  const brand = String(row.brand || "").trim();
  const name = String(row.name || "").trim();
  const checkedAt = new Date().toISOString();

  const evidence = await collectSources(
    row,
    args.sourceLimit,
    args.urlsByProduct?.[String(row.id)] || [],
  );
  const accessible = evidence.filter(
    (s) => s.accessStatus === "PAGE ACCESSIBLE" && s.text,
  );

  let extraction = null;
  let error = null;
  if (accessible.length) {
    try {
      extraction = await analyzeWithDeepSeek({ brand, name, evidence });
    } catch (e) {
      error = e?.message || String(e);
    }
  }

  const perSource = Array.isArray(extraction?.sources)
    ? extraction.sources
    : [];
  const annotated = evidence.map((item, index) => {
    const found = perSource.find((s) => Number(s.index) === index) || {};
    // §15.30 — re-derive the identity class deterministically from the model's criteria.
    const identity = classifyIdentityMatch(found);
    return {
      ...item,
      text: undefined,
      productMatch: found.productMatch || "Uncertain",
      identityMatch: identity.match,
      identityReason: identity.reason,
      productName:
        typeof found.productName === "string" ? found.productName.trim() : "",
      concentrationMatch: found.concentrationMatch || "Unspecified",
      productCode:
        typeof found.productCode === "string" ? found.productCode.trim() : "",
      regionalMarket:
        typeof found.regionalMarket === "string"
          ? found.regionalMarket.trim()
          : "",
      // §15.23 — the model's volume, else the volume stated in the URL.
      volume:
        (typeof found.volume === "string" && found.volume.trim()) ||
        volumeOf({ url: item.url }),
      // §15.21 — a catalogue/brochure/PDF counts as one however it was found.
      form:
        item.form === "CATALOGUE" ||
        String(found.sourceForm || "").toUpperCase() === "CATALOGUE"
          ? "CATALOGUE"
          : String(
              found.sourceForm || item.form || "PRODUCT_PAGE",
            ).toUpperCase(),
      extracted: {
        topNotes: arrayOf(found.topNotes),
        heartNotes: arrayOf(found.heartNotes),
        baseNotes: arrayOf(found.baseNotes),
        verifiedNotes: arrayOf(found.verifiedNotes),
        fragranceAccords: arrayOf(found.fragranceAccords),
        topPhaseDescriptors: arrayOf(found.topPhaseDescriptors),
        heartPhaseDescriptors: arrayOf(found.heartPhaseDescriptors),
        basePhaseDescriptors: arrayOf(found.basePhaseDescriptors),
        // §15.17 — the model's own term classification, used by classOf().
        classMap: new Map(
          (Array.isArray(found.classifications) ? found.classifications : [])
            .filter(
              (c) =>
                c && typeof c.term === "string" && typeof c.class === "string",
            )
            .map((c) => [
              c.term.trim().toLowerCase(),
              c.class.trim().toUpperCase(),
            ]),
        ),
        // §15.28 — spelling variants reported by the model, with their type.
        noteVariants: Array.isArray(found.noteVariants)
          ? found.noteVariants
          : [],
        observations:
          typeof found.observations === "string" ? found.observations : "",
      },
    };
  });

  const official = annotated.filter(
    (s) => s.sourceType === "OFFICIAL_MANUFACTURER",
  );
  const others = annotated.filter(
    (s) => s.sourceType !== "OFFICIAL_MANUFACTURER",
  );
  const officialExtractions = official
    .filter(
      (s) => s.accessStatus === "PAGE ACCESSIBLE" && hasNotes(extractionOf(s)),
    )
    .map((s) => s.extracted);
  const status = assignStatuses(official, others);
  const canonical = selectCanonical(annotated, extraction?.identification);

  const nonOfficialExtractions = others
    .filter(
      (s) => s.accessStatus === "PAGE ACCESSIBLE" && hasNotes(extractionOf(s)),
    )
    .map((s) => s.extracted);
  const primaryNotes = officialExtractions.length
    ? officialExtractions
    : nonOfficialExtractions;
  const merged = mergeExtractions(primaryNotes);
  const phaseDescriptors = {
    top: merged.topPhaseDescriptors,
    heart: merged.heartPhaseDescriptors,
    base: merged.basePhaseDescriptors,
  };
  // §15.29 — completeness is stored and reported separately from the status.
  const pyramidCompleteness = classifyCompleteness(
    canonical.canonical,
    merged.verifiedNotes,
    phaseDescriptors,
  );
  // §15.28 — every suspected spelling variant with its type, reason and evidence.
  const normalizationLog = buildNormalizationLog(annotated);

  return {
    id: row.id,
    brand,
    name,
    checkedAt,
    accessDate: checkedAt.slice(0, 10),
    identification: extraction?.identification || {
      productMatch: "Uncertain",
      concentration: "Unspecified",
      edition: "",
      notes: "",
    },
    topNotes: merged.top,
    heartNotes: merged.heart,
    baseNotes: merged.base,
    verifiedNotes: merged.verifiedNotes,
    fragranceAccords: merged.fragranceAccords,
    phaseDescriptors,
    notesVerificationStatus: status.notesStatus,
    pyramidVerificationStatus: status.pyramidStatus,
    // §15.24 — the single final canonical status used by the table, the tally and the database.
    finalStatus: canonical.publicationStatus,
    publicationHold: !!canonical.publicationHold,
    // §15.29 — the completeness classification is never conflated with the status.
    pyramidCompleteness,
    // §15.25 — official availability is a distinct dimension, never conflated with identity.
    officialSourceStatus: officialAvailability(
      official,
      canonical.identityVerified,
    ),
    // §15.28 — normalisation evidence; the published wording is never overwritten.
    normalizationLog,
    publication: {
      product_id: String(row.id),
      canonical_pyramid: canonical.canonical,
      source_pyramids: canonical.sourcePyramids,
      verified_notes: canonical.verifiedNotes,
      disputed_notes: canonical.disputedNotes,
      excluded_descriptors: canonical.excludedDescriptors,
      source_conflicts: canonical.sourceConflicts,
      publication_status: canonical.publicationStatus,
      // §15.29 — completeness travels with the stored record, kept separate from the status.
      pyramid_completeness: pyramidCompleteness,
      identity_verified: canonical.identityVerified,
      phase_verification: canonical.phaseVerification,
      // §15.28 — normalisation evidence is stored alongside the pyramid.
      normalization_log: normalizationLog,
      last_verified: checkedAt.slice(0, 10),
    },
    canonicalResearch: canonical.research,
    conflictingInformation:
      extraction?.conflictingInformation ||
      (status.conflict ? "Official sources disagree." : ""),
    researchNotes: extraction?.researchNotes || "",
    sourcesChecked: annotated.length,
    officialSourcesAccessible: status.officialAccessible,
    independentNonOfficialSources: status.nonOfficialCount,
    sources: annotated,
    error,
  };
}

function printReport(result) {
  const line = "─".repeat(78);
  console.log(`\n${line}\n#${result.id}  ${result.brand} — ${result.name}`);
  // §15.24 — the table shows the ONE final canonical status that is also stored.
  console.log(
    `FINAL STATUS       : ${result.finalStatus}${result.publicationHold ? "  [PUBLICATION HOLD]" : ""}`,
  );
  // §15.29 — completeness is reported separately from the final status.
  if (result.pyramidCompleteness)
    console.log(`Pyramid completeness: ${result.pyramidCompleteness}`);
  // §15.25 — official availability is reported separately from the final status.
  if (result.officialSourceStatus)
    console.log(`Official source    : ${result.officialSourceStatus}`);
  console.log(`Source-level notes : ${result.notesVerificationStatus}`);
  console.log(`Source-level pyramid: ${result.pyramidVerificationStatus}`);
  console.log(`Top     : ${result.topNotes.join(", ") || "Not specified"}`);
  console.log(`Heart   : ${result.heartNotes.join(", ") || "Not specified"}`);
  console.log(`Base    : ${result.baseNotes.join(", ") || "Not specified"}`);
  if (result.verifiedNotes.length)
    console.log(`Verified (no phase): ${result.verifiedNotes.join(", ")}`);
  if (result.fragranceAccords.length)
    console.log(`Accords : ${result.fragranceAccords.join(", ")}`);
  const pd = result.phaseDescriptors;
  if (pd.top.length || pd.heart.length || pd.base.length) {
    console.log(
      `Phase descriptors: top=[${pd.top.join(", ")}] heart=[${pd.heart.join(", ")}] base=[${pd.base.join(", ")}]`,
    );
  }
  if (result.conflictingInformation)
    console.log(`Conflict: ${result.conflictingInformation}`);
  const pub = result.publication;
  if (pub) {
    const cp = pub.canonical_pyramid;
    console.log(
      `CANONICAL (website): Top=[${cp.top.join(", ")}] Heart=[${cp.heart.join(", ")}] Base=[${cp.base.join(", ")}]`,
    );
    console.log(`  phase verification : ${pub.phase_verification}`);
    // §15.19 / §15.20 — alternative source data is printed separately, never merged.
    for (const sp of pub.source_pyramids || []) {
      const p = sp.pyramid;
      const meta = [
        sp.sourceType,
        sp.region,
        sp.volume,
        sp.form,
        sp.productCode,
      ]
        .filter(Boolean)
        .join(" · ");
      console.log(
        `  source pyramid [${meta}] ${sp.host}: Top=[${p.top.join(", ")}] Heart=[${p.heart.join(", ")}] Base=[${p.base.join(", ")}]`,
      );
    }
    for (const conflict of pub.source_conflicts || []) {
      console.log(`  CONFLICT ${conflict.type}: ${conflict.reason}`);
    }
    for (const comparison of result.canonicalResearch?.officialComparison ||
      []) {
      console.log(
        `  official delta ${comparison.delta}: ${comparison.regionA}↔${comparison.regionB} (${comparison.a} | ${comparison.b})`,
      );
    }
    for (const rejected of result.canonicalResearch?.rejectedIdentitySources ||
      []) {
      console.log(
        `  identity rejected (${rejected.productMatch}): ${rejected.url}`,
      );
    }
  }
  const withheld = result.canonicalResearch?.disputedNotes || [];
  if (withheld.length)
    console.log(
      `Withheld notes: ${withheld.map((d) => `${d.note} (${d.reason})`).join(", ")}`,
    );
  const excluded = result.canonicalResearch?.excludedDescriptors || [];
  if (excluded.length) {
    console.log(
      `Excluded descriptors: ${[...new Set(excluded.map((e) => e.term))].join(", ")}`,
    );
  }
  // §15.28 — the original wording is preserved; normalisation is reported, never silent.
  for (const variant of result.normalizationLog || []) {
    console.log(
      `  variant ${variant.variantType}: "${variant.original}" -> "${variant.normalized}"${variant.reason ? ` (${variant.reason})` : ""}`,
    );
  }
  if (result.error) console.log(`ERROR   : ${result.error}`);
  console.log("Sources :");
  for (const s of result.sources) {
    const meta = [s.form, s.volume].filter(Boolean).join(" · ");
    // §15.30 — the deterministic identity class is printed per source.
    console.log(
      `  - [${s.sourceType}] ${s.region} · ${s.accessStatus} · ${meta} · identity=${s.identityMatch || "UNRESOLVED"} · ${s.url}`,
    );
  }
}

/**
 * §15.24 — aggregation integrity: totals come from the ONE final status of each
 * product, every product is counted exactly once, and the table status must be the
 * status that gets stored.
 */
function validateReport(results) {
  const issues = [];
  const seen = new Set();
  const tally = {};
  for (const result of results) {
    const key = String(result.id);
    if (seen.has(key)) issues.push(`#${key}: product counted more than once`);
    seen.add(key);

    const status = result.finalStatus;
    if (!status) issues.push(`#${key}: no final canonical status`);
    else if (status !== result.publication?.publication_status) {
      issues.push(
        `#${key}: table status "${status}" != stored status "${result.publication?.publication_status}"`,
      );
    }
    // §15.29 — an OFFICIALLY CONFIRMED product MUST disclose its completeness.
    if (status === "OFFICIALLY CONFIRMED" && !result.pyramidCompleteness) {
      issues.push(
        `#${key}: OFFICIALLY CONFIRMED without a pyramid completeness classification`,
      );
    }
    if (
      result.pyramidCompleteness !== result.publication?.pyramid_completeness
    ) {
      issues.push(
        `#${key}: completeness "${result.pyramidCompleteness}" != stored "${result.publication?.pyramid_completeness}"`,
      );
    }
    // §15.30 — every accessible source must carry a deterministic identity class.
    for (const source of result.sources || []) {
      if (
        source.accessStatus === "PAGE ACCESSIBLE" &&
        !IDENTITY_MATCHES.includes(source.identityMatch)
      ) {
        issues.push(
          `#${key}: accessible source without a deterministic identity classification (${source.url})`,
        );
      }
    }
    if (status) tally[status] = (tally[status] || 0) + 1;
  }
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  if (total !== results.length) {
    issues.push(
      `status totals (${total}) != processed products (${results.length})`,
    );
  }
  return { ok: issues.length === 0, issues, tally };
}

async function main() {
  const args = parseArgs();
  if (!process.env.NHOST_ADMIN_SECRET)
    throw new Error(
      "NHOST_ADMIN_SECRET is required (Nhost Hasura admin secret)",
    );
  if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is required");

  args.urlsByProduct =
    args.urlsFile && fs.existsSync(args.urlsFile)
      ? JSON.parse(fs.readFileSync(args.urlsFile, "utf8"))
      : {};

  const rows = await fetchAllStocks();
  const photoReady = (row) => hasCompletedGeneratedImage(row, SUPABASE_URL);
  let pool = args.photoOnly ? rows.filter(photoReady) : rows;
  console.log(
    `Loaded ${rows.length} stock rows; ${args.photoOnly ? pool.length : rows.length} eligible`,
  );

  let targets;
  if (args.ids.length) {
    const wanted = new Set(args.ids.map(String));
    targets = rows.filter((row) => wanted.has(String(row.id)));
  } else if (args.random > 0) {
    targets = shuffle(pool).slice(0, args.random);
  } else {
    const limit = args.limit > 0 ? args.limit : 5;
    targets = pool
      .filter((row) => !row.info?.fragranceResearch)
      .slice(0, limit);
    if (!targets.length) targets = pool.slice(0, limit);
  }

  console.log(
    `Researching ${targets.length} product(s) [write=${args.write}]\n`,
  );

  const results = [];
  let index = 0;
  async function worker() {
    while (index < targets.length) {
      const row = targets[index++];
      try {
        const result = await researchProduct(row, args);
        results.push(result);
        printReport(result);
      } catch (error) {
        console.error(`#${row?.id} failed: ${error?.message || error}`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(args.concurrency, targets.length) }, worker),
  );

  results.sort((a, b) => Number(a.id) - Number(b.id));

  // §15.24 — validate BEFORE any database write.
  const validation = validateReport(results);

  if (args.write) {
    if (!validation.ok) {
      console.error("REPORT VALIDATION FAILED — database writes were skipped.");
      for (const issue of validation.issues) console.error(`  - ${issue}`);
    } else {
      for (const result of results) {
        const row = targets.find((r) => String(r.id) === String(result.id));
        const info = row?.info && typeof row.info === "object" ? row.info : {};
        try {
          await patchStockResearch(result.id, info, result);
          console.log(`saved #${result.id}`);
        } catch (error) {
          console.error(`could not save #${result.id}: ${error.message}`);
        }
      }
    }
  }

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = {
    generatedAt: new Date().toISOString(),
    write: args.write,
    total: results.length,
    validation: {
      ok: validation.ok,
      issues: validation.issues,
      tally: validation.tally,
    },
    results,
  };
  const outPath = path.join(LOG_DIR, `perfumeResearch_${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(
    path.join(LOG_DIR, "perfumeResearch_latest.json"),
    JSON.stringify(payload, null, 2),
    "utf8",
  );
  console.log(`\nReport written to ${outPath}`);

  console.log(`Final status tally: ${JSON.stringify(validation.tally)}`);
  if (!validation.ok) {
    console.log("REPORT VALIDATION FAILED");
    for (const issue of validation.issues) console.log(`  - ${issue}`);
  }
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
