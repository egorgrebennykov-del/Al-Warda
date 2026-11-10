import {
  fetchPerfumesFromSupabase,
  getPerfumes,
  getCachedPerfumes,
  getPerfumeUrl,
  ensurePerfumeEnrichment,
  isPerfumeSet,
} from "../utils/perfumes.js";

const DEFAULT_API_KEY = "";

export function getGeminiApiKey() {
  return (
    globalThis.process?.env?.GEMINI_API_KEY ||
    globalThis.process?.env?.VITE_GEMINI_API_KEY ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_API_KEY) ||
    DEFAULT_API_KEY
  );
}

const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-flash-latest",
];
const GEMINI_FAST_MODEL = "gemini-3.5-flash-lite";
const GEMINI_TIMEOUT_MS = 6000;

export async function fetchGtxTranslation(text, targetLang = "en", sourceLang = "auto") {
  const clean = String(text || "").trim();
  if (!clean) {
    return { text: "", detectedLang: sourceLang };
  }

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(clean)}`;

  const fetchWithNodeHttps = async () => {
    const mod = "node:https";
    const https = await import(/* @vite-ignore */ mod);
    return new Promise((resolve, reject) => {
      const req = https.get(url, { rejectUnauthorized: false }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            const translated = Array.isArray(parsed?.[0])
              ? parsed[0].map((s) => s?.[0] || "").join("")
              : clean;
            const detected = parsed?.[2] || sourceLang;
            resolve({ text: translated || clean, detectedLang: detected });
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on("error", reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error("GTX timeout"));
      });
    });
  };

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const translated = Array.isArray(d?.[0]) ? d[0].map((s) => s?.[0] || "").join("") : clean;
    const detected = d?.[2] || sourceLang;
    return { text: translated || clean, detectedLang: detected };
  } catch (err) {
    if (typeof process !== "undefined" && process?.versions?.node) {
      return await fetchWithNodeHttps();
    }
    throw err;
  }
}

export function resolveRequestLanguage(detectedLang, uiLanguage, text = "") {
  const normDetected = (detectedLang || "").toLowerCase().trim();
  const normUi = (uiLanguage || "ru").toLowerCase().trim();

  // If detected is a distinct non-English language (ru, ro, hu, bg, el, de, fr, es, it, etc.)
  if (normDetected && !["en", "auto", "und"].includes(normDetected)) {
    return normDetected;
  }

  // If text contains Cyrillic characters
  if (/[а-яА-ЯёЁ]/.test(text)) {
    return normDetected === "bg" ? "bg" : "ru";
  }

  // If text contains Greek characters
  if (/[\u0370-\u03FF]/.test(text)) {
    return "el";
  }

  // If text contains Romanian specific characters (ă, â, î, ș, ț)
  if (/[ăâîșțĂÂÎȘȚ]/.test(text)) {
    return "ro";
  }

  // If text contains Hungarian specific characters (ő, ű, á, é, í, ó, ö, ú, ü)
  if (/[őűŐŰáéíóöúüÁÉÍÓÖÚÜ]/.test(text)) {
    return "hu";
  }

  // If detected as English and UI is English
  if (normDetected === "en" && normUi === "en") {
    return "en";
  }

  // If user typed an actual English conversational sentence
  if (/\b(i want|recommend|suggest|show me|looking for|help me|can you|what is|how much|gift|fragrance|perfume|thank you|good morning|hello)\b/i.test(text)) {
    return "en";
  }

  // Fall back to the UI interface language
  return normUi || "ru";
}

export async function translateText(text, targetLang = "en", sourceLang = "auto") {
  const clean = String(text || "").trim();
  if (!clean) {
    return { text: "", detectedLang: sourceLang };
  }

  const normTarget = String(targetLang || "en").toLowerCase().trim();
  const normSource = String(sourceLang || "auto").toLowerCase().trim();

  // If source and target are identical and not auto, no translation needed
  if (normSource !== "auto" && normSource === normTarget) {
    return { text: clean, detectedLang: normSource };
  }

  if (normTarget === "en" && normSource === "en") {
    return { text: clean, detectedLang: "en" };
  }

  // 1. Google Translate GTX endpoint (instant ~150ms, zero token cost)
  try {
    const gtxResult = await fetchGtxTranslation(clean, normTarget, normSource);
    if (gtxResult && gtxResult.text) {
      return gtxResult;
    }
  } catch {
    // Fall back to Gemini below
  }

  // 2. Gemini fallback translation if API key is present
  const apiKey = getGeminiApiKey();
  if (apiKey) {
    try {
      const parsed = await callGeminiJson({
        apiKey,
        systemInstruction:
          "You are an expert luxury translator for the perfume boutique Al-Warda. Translate the given text accurately and naturally into the target language. Preserve all brand names, perfume names, bottle volumes, prices with € symbols, and emojis. Output valid JSON: {\"text\": \"...\", \"detectedLang\": \"...\"}",
        prompt: `Translate this text into target language '${normTarget}' (source language hint: ${normSource}):\n${clean}`,
        timeoutMs: 4000,
        temperature: 0.1,
      });
      if (parsed && typeof parsed.text === "string" && parsed.text.trim()) {
        return {
          text: parsed.text.trim(),
          detectedLang: parsed.detectedLang || normSource,
        };
      }
    } catch {
      // Fall through
    }
  }

  return { text: clean, detectedLang: normSource };
}


// ============================================================================
// 1. LIVE CATALOG LOADER (STRICTLY REAL ITEMS FROM SITE CATALOG)
// ============================================================================
let ALL_PERFUMES = [];
let PERFUME_BY_ID = new Map();
let lastCatalogFetchAt = 0;
let catalogRefreshPromise = null;
const CATALOG_TTL_MS = 15 * 60 * 1000;

function normalizeCatalogItem(raw) {
  if (!raw || !(raw.name || raw.title)) return null;
  const item =
    Array.isArray(raw.topNotesRu) && raw.topNotesRu.length > 0 && raw.descriptionRu
      ? raw
      : ensurePerfumeEnrichment(raw);
  const id = String(item.id || item.slug || "").trim();
  if (!id) return null;

  const brand = item.brand || "Al-Warda";
  const topNotes = Array.isArray(item.topNotesRu) && item.topNotesRu.length > 0
    ? item.topNotesRu
    : Array.isArray(item.topNotes) ? item.topNotes : [];
  const heartNotes = Array.isArray(item.heartNotesRu) && item.heartNotesRu.length > 0
    ? item.heartNotesRu
    : Array.isArray(item.heartNotes) ? item.heartNotes : [];
  const baseNotes = Array.isArray(item.baseNotesRu) && item.baseNotesRu.length > 0
    ? item.baseNotesRu
    : Array.isArray(item.baseNotes) ? item.baseNotes : [];

  const category = item.categoryRu || item.categoryName || item.category || "Восточные";
  const notesSummary =
    item.notesSummaryRu ||
    item.notesSummary ||
    (heartNotes.length > 0 ? heartNotes.join(" · ") : category);

  const nameStr = item.name || item.title;
  const genderStr = item.genderRu || item.gender || "Унисекс";
  const nameLower = nameStr.toLowerCase();
  const brandLower = brand.toLowerCase();
  const notesSummaryLower = notesSummary.toLowerCase();
  const categoryLower = category.toLowerCase();
  const genderLower = genderStr.toLowerCase();
  const topStr = topNotes.join(" ").toLowerCase();
  const heartStr = heartNotes.join(" ").toLowerCase();
  const baseStr = baseNotes.join(" ").toLowerCase();
  const isWomen = genderLower.includes("жен") || genderLower.includes("women") || genderLower.includes("femme");
  const isMen = (genderLower.includes("муж") || genderLower.includes("men") || genderLower.includes("homme")) && !isWomen;
  const isUnisex = genderLower.includes("уни") || genderLower.includes("uni") || (!isWomen && !isMen);

  const p = {
    id,
    key: id,
    slug: item.slug || `stock-${id}`,
    gtin: item.gtin || item.info?.gtin || "",
    title: nameStr,
    name: nameStr,
    brand,
    author: `${brand} • ${notesSummary || category}`,
    price: Number(item.price) || 29.99,
    currency: item.currency || "EUR",
    image: item.image || item.fullCardImage || "",
    url: item.url || getPerfumeUrl({ id, name: nameStr }),
    category,
    categorySlug: item.category || item.info?.categorySlug || "oud",
    gender: genderStr,
    notesSummary,
    topNotes,
    heartNotes,
    baseNotes,
    longevity: item.longevityRu || item.longevity || "8–12 часов",
    sillage: item.sillageRu || item.sillage || "Выразительный, шлейфовый",
    volume: item.volume || "100ml / 3.4 FL.OZ.",
    concentration: item.concentration || "Eau De Parfum",
    description: item.descriptionRu || item.description || "",
    descriptionEn: item.descriptionEn || "",
    store: "Al-Warda Boutique",
    _nameLower: nameLower,
    _brandLower: brandLower,
    _notesSummaryLower: notesSummaryLower,
    _topStr: topStr,
    _heartStr: heartStr,
    _baseStr: baseStr,
    _allText: `${nameLower} ${brandLower} ${categoryLower} ${genderLower} ${notesSummaryLower} ${topStr} ${heartStr} ${baseStr}`,
    _genderFlags: { isWomen, isMen, isUnisex },
  };

  return p;
}

function indexCatalogItems(rawItems) {
  const nextList = [];
  const nextMap = new Map();
  const seenIds = new Set();

  for (const raw of rawItems) {
    const p = normalizeCatalogItem(raw);
    if (!p || !p.image) continue;
    const idKey = p.id.toLowerCase();
    if (seenIds.has(idKey)) continue;
    seenIds.add(idKey);

    nextList.push(p);
    nextMap.set(idKey, p);
    if (p.slug) nextMap.set(p.slug.toLowerCase(), p);
    if (p.gtin) nextMap.set(String(p.gtin).toLowerCase(), p);
    if (p.name) nextMap.set(p.name.toLowerCase(), p);
    if (p.url) nextMap.set(p.url.toLowerCase(), p);
  }

  if (nextList.length > 0) {
    ALL_PERFUMES = nextList;
    PERFUME_BY_ID = nextMap;
    lastCatalogFetchAt = Date.now();
  }
}

async function refreshCatalogInBackground() {
  if (catalogRefreshPromise) return catalogRefreshPromise;
  catalogRefreshPromise = (async () => {
    try {
      const cached = getCachedPerfumes();
      if (Array.isArray(cached) && cached.length > 0) {
        indexCatalogItems(cached);
        return ALL_PERFUMES;
      }
      const supaItems = await fetchPerfumesFromSupabase();
      if (Array.isArray(supaItems) && supaItems.length > 0) {
        indexCatalogItems(supaItems);
        return ALL_PERFUMES;
      }
    } catch {
      // ignore and try fallback
    }
    try {
      const items = await getPerfumes();
      if (Array.isArray(items) && items.length > 0) {
        indexCatalogItems(items);
      }
    } catch {
      // ignore
    }
    return ALL_PERFUMES;
  })().finally(() => {
    catalogRefreshPromise = null;
  });
  return catalogRefreshPromise;
}

export async function ensureCatalogLoaded(contextCatalog = null) {
  if (Array.isArray(contextCatalog) && contextCatalog.length > 0) {
    indexCatalogItems(contextCatalog);
    return ALL_PERFUMES;
  }

  // Instant 0ms return if catalog is already in memory
  if (ALL_PERFUMES.length > 0) {
    if (Date.now() - lastCatalogFetchAt >= CATALOG_TTL_MS) {
      refreshCatalogInBackground().catch(() => {});
    }
    return ALL_PERFUMES;
  }

  // Check if utils/perfumes.js already warmed its in-memory cache
  const alreadyCached = getCachedPerfumes();
  if (Array.isArray(alreadyCached) && alreadyCached.length > 0) {
    indexCatalogItems(alreadyCached);
    return ALL_PERFUMES;
  }

  return refreshCatalogInBackground();
}

// ============================================================================
// 2. NOTE KEYWORDS & SYNONYMS
// ============================================================================
const NOTE_SYNONYMS = {
  ягоды: ["ягод", "клубник", "малин", "земляник", "смородин", "ежевик", "черник", "брусник", "клюкв", "вишн", "черешн", "барбарис", "гранат", "смородина", "черная смородина", "berry", "berries", "strawberry", "raspberry", "blackberry", "blueberry", "currant", "blackcurrant", "cherry", "cranberry", "pomegranate"],
  ваниль: ["ваниль", "карамел", "сливк", "пралине", "маршмеллоу", "бобы тонка", "гурман", "сладк", "vanilla", "caramel", "gourmand", "sweet", "tonka"],
  уд: ["уд", "агар", "смол", "смолист", "ладан", "oud", "agarwood", "smoke", "incense", "frankincense"],
  роза: ["роз", "таиф", "лепестк", "дамасск", "rose", "taif", "damask"],
  амбра: ["амбр", "янтарь", "amber", "ambroxan"],
  мускус: ["мускус", "musk", "белый мускус"],
  цитрус: ["цитрус", "бергамот", "лимон", "грейпфрут", "мандарин", "лайм", "апельсин", "нероли", "citrus", "bergamot", "lemon", "grapefruit", "mandarin", "lime"],
  кофе: ["кофе", "шоколад", "какао", "кофейн", "coffee", "chocolate", "qahwa"],
  пряност: ["прян", "шафран", "кориц", "кардамон", "перец", "гвоздик", "мускат", "имбир", "табак", "spic", "saffron", "cinnamon", "cardamom", "pepper", "tobacco"],
  свежесть: ["свеж", "морск", "водн", "зелен", "акватич", "океан", "мят", "лаванд", "фужер", "fresh", "aquatic", "ozonic", "mint", "lavender", "fougere"],
  кожа: ["кож", "замш", "leather", "suede"],
  дерево: ["дерев", "сандал", "кедр", "пачули", "древесн", "ветивер", "мох", "wood", "sandalwood", "cedar", "patchouli", "vetiver"],
  цветы: ["цвет", "жасмин", "ирис", "тубероз", "пион", "ландыш", "фиалк", "иланг", "флердоранж", "floral", "jasmine", "iris", "violet", "ylang"],
  фрукты: ["фрукт", "персик", "яблок", "вишн", "малин", "гранат", "слив", "груш", "ананас", "ягод", "клубник", "fruity", "cherry", "peach", "apple", "pear"],
};

const STOP_WORDS = new Set([
  "найди", "посоветуй", "порекомендуй", "подбери", "выбери", "покажи", "какие", "какой",
  "какая", "какое", "есть", "ли", "у", "вас", "хочу", "хочется", "ищу", "ищем", "купить",
  "духи", "духов", "парфюм", "парфюма", "парфюмы", "парфюмерия", "аромат", "ароматы", "ароматов",
  "ноты", "нотами", "нотах", "запах", "флакон", "пожалуйста", "мне", "что", "чтото", "что-то",
  "чтонибудь", "что-нибудь", "какой-то", "какойто", "какой-нибудь", "какойнибудь", "чем", "для",
  "про", "каталоге", "каталог", "сайте", "в", "на", "с", "со", "из", "без", "и", "или",
  "нужен", "нужно", "нужна", "нужны", "вариант", "варианты", "расскажи", "опиши", "предложи",
  "find", "show", "search", "recommend", "suggest", "perfume", "perfumes", "fragrance",
  "fragrances", "scent", "notes", "parfum", "catalog", "what", "have", "you", "the", "with", "for"
]);

// ============================================================================
// 3. INTELLIGENT PERFUME DATABASE SEARCH (STRICTLY CATALOG ITEMS & GENDER-AWARE)
// ============================================================================
export function isSamplePerfume(p) {
  if (!p) return false;
  if (p.isSample) return true;
  const idStr = String(p.id || "");
  if (idStr.startsWith("sample-") || idStr.includes("-sample-")) return true;
  const text = `${p.name || ""} ${p.title || ""} ${p.volume || ""}`.toLowerCase();
  // Vials of 1-10 ml that are not multi-item gift/discovery sets
  if (/(?:^|[\s,·+!?.;:()«»"'-])(1|2|3|5|8|10)\s*(ml|мл)(?:$|[\s,·+!?.;:()«»"'-])/i.test(text) && !isPerfumeSet(p)) {
    return true;
  }
  if (/(?:^|[\s,·+!?.;:()«»"'-])(пробник|отливант|виалк|атомайзер|семпл|сэмпл|sample|decant|vial|мини-спрей)/i.test(text) && !isPerfumeSet(p)) {
    return true;
  }
  return false;
}

export function isSampleRequested(query = "", history = []) {
  const q = String(query || "").toLowerCase();
  const sampleRegex = /(?:^|[\s,·+!?.;:()«»"'-])(пробник|отливант|виалк|атомайзер|семпл|сэмпл|дискавери|миниатюр|sample|decant|vial|miniature|travel\s*spray|(1|2|3|5|8|10)\s*(ml|мл))/i;
  if (sampleRegex.test(q)) return true;

  const userMessages = (Array.isArray(history) ? history : [])
    .filter((m) => m && m.role === "user")
    .slice(-2);
  for (const m of userMessages) {
    if (sampleRegex.test(String(m.content || "").toLowerCase())) return true;
  }
  return false;
}

function getPerfumeGenderFlags(p) {
  if (p?._genderFlags) return p._genderFlags;
  const g = (p?.gender || "").toLowerCase();
  const isWomen = g.includes("жен") || g.includes("women") || g.includes("femme");
  const isMen = (g.includes("муж") || g.includes("men") || g.includes("homme")) && !isWomen;
  const isUnisex = g.includes("уни") || g.includes("uni") || (!isWomen && !isMen);
  return { isWomen, isMen, isUnisex };
}

function matchesTargetGender(p, preferredGender) {
  const { isWomen, isMen, isUnisex } = getPerfumeGenderFlags(p);
  // If interlocutor gender is unknown or unisex is requested -> strictly recommend ONLY unisex perfumes
  if (!preferredGender || preferredGender === "унисекс") {
    return isUnisex;
  }
  if (preferredGender === "мужской") {
    return isMen || isUnisex;
  }
  if (preferredGender === "женский") {
    return isWomen || isUnisex;
  }
  return isUnisex;
}

export function searchPerfumesInDatabase(query, options = {}) {
  const {
    excludeIds = new Set(),
    preferredGender = null,
    priceOrder = "relevance", // 'relevance' | 'asc' | 'desc'
    maxPrice = null,
    minPrice = null,
    allowSamples = false,
    limit = 6,
  } = options;

  const q = (query || "").trim().toLowerCase();
  const rawTokens = q.split(/[\s,·+!?.;:()«»"'-]+/).filter((t) => t.length > 1);
  const meaningfulTokens = rawTokens.filter((t) => !STOP_WORDS.has(t));

  // Extract matched note categories from query
  const matchedNoteCategories = [];
  for (const [, synonyms] of Object.entries(NOTE_SYNONYMS)) {
    if (synonyms.some((syn) => q.includes(syn))) {
      matchedNoteCategories.push(synonyms);
    }
  }

  // Extract dynamic brand names actually present in our live catalog
  const catalogBrands = Array.from(
    new Set(ALL_PERFUMES.map((p) => (p.brand || "").toLowerCase().trim()).filter(Boolean))
  );
  const matchedBrands = catalogBrands.filter((b) => q.includes(b));

  const scored = [];

  for (const p of ALL_PERFUMES) {
    if (excludeIds.has(p.id) || excludeIds.has(p.slug) || excludeIds.has(p.key)) {
      continue;
    }

    if (!allowSamples && isSamplePerfume(p)) {
      continue;
    }

    if (maxPrice !== null && p.price > maxPrice) continue;
    if (minPrice !== null && p.price < minPrice) continue;

    // Strictly enforce gender rules:
    // - Unknown gender or "унисекс" -> ONLY unisex perfumes
    // - "мужской" -> Men's & Unisex perfumes (never Women's)
    // - "женский" -> Women's & Unisex perfumes (never Men's)
    if (!matchesTargetGender(p, preferredGender)) {
      continue;
    }

    let score = 0;
    const nameLower = p._nameLower || (p.name || "").toLowerCase();
    const brandLower = p._brandLower || (p.brand || "").toLowerCase();
    const notesSummary = p._notesSummaryLower || (p.notesSummary || "").toLowerCase();
    const topStr = p._topStr ?? p.topNotes.join(" ").toLowerCase();
    const heartStr = p._heartStr ?? p.heartNotes.join(" ").toLowerCase();
    const baseStr = p._baseStr ?? p.baseNotes.join(" ").toLowerCase();
    const descStr = (p.description || p.descriptionRu || p.descriptionEn || "").toLowerCase();
    const allText = p._allText || `${nameLower} ${brandLower} ${notesSummary} ${topStr} ${heartStr} ${baseStr} ${descStr}`;

    if (meaningfulTokens.length > 0 && nameLower.includes(q) && q.length > 2) score += 100;
    if (meaningfulTokens.length > 0 && q.includes(nameLower) && nameLower.length > 3) score += 100;

    for (const tok of meaningfulTokens) {
      if (tok.length < 2) continue;
      if (nameLower === tok) {
        score += 85;
      } else if (
        nameLower.startsWith(tok + " ") ||
        nameLower.includes(" " + tok + " ") ||
        nameLower.endsWith(" " + tok)
      ) {
        score += 60;
      } else if (nameLower.includes(tok)) {
        score += 42;
      }
      if (brandLower === tok || brandLower.includes(tok)) {
        score += 45;
      }
    }

    for (const mb of matchedBrands) {
      if (brandLower === mb || brandLower.includes(mb)) score += 55;
      else if (nameLower.includes(mb)) score += 40;
    }

    for (const synGroup of matchedNoteCategories) {
      const groupMatched = synGroup.some((syn) => allText.includes(syn));
      if (groupMatched) {
        score += 40;
        if (synGroup.some((syn) => notesSummary.includes(syn))) score += 25;
        if (synGroup.some((syn) => topStr.includes(syn) || heartStr.includes(syn) || baseStr.includes(syn))) {
          score += 25;
        }
        if (synGroup.some((syn) => nameLower.includes(syn))) score += 50;
      }
    }

    for (const tok of meaningfulTokens) {
      if (notesSummary.includes(tok)) score += 25;
      else if (allText.includes(tok)) score += 15;
      else if (tok.length >= 4 && allText.includes(tok.slice(0, 4))) score += 12;
    }

    const { isWomen, isMen, isUnisex } = getPerfumeGenderFlags(p);
    if (preferredGender === "мужской") {
      if (isMen) score += 35;
      else if (isUnisex) score += 12;
    } else if (preferredGender === "женский") {
      if (isWomen) score += 35;
      else if (isUnisex) score += 12;
    } else if (isUnisex) {
      score += 20;
    }

    scored.push({ perfume: p, score });
  }

  if (priceOrder === "desc") {
    scored.sort((a, b) => b.perfume.price - a.perfume.price || b.score - a.score);
  } else if (priceOrder === "asc") {
    scored.sort((a, b) => a.perfume.price - b.perfume.price || b.score - a.score);
  } else {
    scored.sort((a, b) => b.score - a.score);
  }

  const positiveMatches = scored.filter((x) => x.score > 0).map((x) => x.perfume);
  const combined = [...positiveMatches];

  // Pad with same brand if a specific brand was matched (respecting gender filter!)
  if (combined.length > 0 && combined.length < limit) {
    const primaryBrand = combined[0].brand?.toLowerCase();
    if (primaryBrand) {
      for (const p of ALL_PERFUMES) {
        if (
          p.brand?.toLowerCase() === primaryBrand &&
          (allowSamples || !isSamplePerfume(p)) &&
          matchesTargetGender(p, preferredGender) &&
          !excludeIds.has(p.id) &&
          !combined.some((item) => item.id === p.id)
        ) {
          combined.push(p);
          if (combined.length >= limit) break;
        }
      }
    }
  }

  // Pad with remaining gender-matching catalog items
  if (combined.length < limit) {
    for (const item of scored.map((s) => s.perfume)) {
      if ((allowSamples || !isSamplePerfume(item)) && !combined.some((c) => c.id === item.id)) {
        combined.push(item);
        if (combined.length >= limit) break;
      }
    }
  }

  return combined.slice(0, limit);
}

// ============================================================================
// 4. MULTI-TURN CONVERSATIONAL MEMORY & GENDER DETECTION
// ============================================================================
function inferInterlocutorGender(fullConversationText = "", latestText = "", userInfo = {}) {
  const latestLower = (latestText || "").toLowerCase();
  const fullLower = (fullConversationText || "").toLowerCase();

  // 1. Check if latest message explicitly specifies target gender
  if (/(унисекс|unisex)/i.test(latestLower)) return "унисекс";
  if (/(мужск(ие|ой|их|им)|для мужчин|для мужа|для парня|мужчине|парню|папе|отцу|брату|сыну|другу|коллеге-мужчине|я мужчина|я парень|\bfor men\b|\bfor him\b|\bmen's\b|\bmale\b)/i.test(latestLower)) {
    return "мужской";
  }
  if (/(женск(ие|ий|их|им)|для женщин|для девушки|девушке|жене|супруге|маме|матери|сестре|дочери|подруге|невесте|я девушка|я женщина|\bfor women\b|\bfor her\b|\bwomen's\b|\bfemale\b)/i.test(latestLower)) {
    return "женский";
  }

  // 2. Check full conversation history for explicit gender requests
  if (/(унисекс|unisex)/i.test(fullLower)) return "унисекс";
  if (/(мужск(ие|ой|их|им)|для мужчин|для мужа|для парня|мужчине|парню|папе|отцу|брату|сыну|другу|я мужчина|я парень|\bfor men\b|\bfor him\b|\bmen's\b|\bmale\b)/i.test(fullLower)) {
    return "мужской";
  }
  if (/(женск(ие|ий|их|им)|для женщин|для девушки|девушке|жене|супруге|маме|матери|сестре|дочери|подруге|невесте|я девушка|я женщина|\bfor women\b|\bfor her\b|\bwomen's\b|\bfemale\b)/i.test(fullLower)) {
    return "женский";
  }

  // 3. Check Russian grammatical gender in user's self-referential phrases ("я хотел" vs "я хотела")
  const femaleGrammarRe = /(?:^|[\s,!.?])я\s+(?:бы\s+|очень\s+|давно\s+|уже\s+|не\s+|просто\s+)*(?:хотела|искала|выбрала|решила|купила|носила|пробовала|смотрела|увидела|подумала|слышала|взяла|заказала|получила|рада|готова|уверена|сама|довольна|влюбленна|пришла|зашла)(?=[\s,!.?]|$)/i;
  const maleGrammarRe = /(?:^|[\s,!.?])я\s+(?:бы\s+|очень\s+|давно\s+|уже\s+|не\s+|просто\s+)*(?:хотел|искал|выбрал|решил|купил|носил|пробовал|смотрел|увидел|подумал|слышал|взял|заказал|получил|рад|готов|уверен|сам|доволен|пришел|пришёл|зашел|зашёл)(?=[\s,!.?]|$)/i;

  if (femaleGrammarRe.test(latestLower) || femaleGrammarRe.test(fullLower)) {
    return "женский";
  }
  if (maleGrammarRe.test(latestLower) || maleGrammarRe.test(fullLower)) {
    return "мужской";
  }

  // 4. Check logged-in user profile gender or unambiguous first name (unless buying a gift for someone else)
  const isGiftQuery = /(подарок|подарить|в подарок|для подарка|что подарить)/i.test(fullLower);
  if (!isGiftQuery && userInfo) {
    const profileGender = String(userInfo.gender || "").toLowerCase();
    if (profileGender.includes("жен") || profileGender === "female" || profileGender === "f" || profileGender === "woman") {
      return "женский";
    }
    if (profileGender.includes("муж") || profileGender === "male" || profileGender === "m" || profileGender === "man") {
      return "мужской";
    }

    const rawFirst = String(userInfo.firstName || (userInfo.name || "").split(/\s+/)[0] || "")
      .trim()
      .toLowerCase();
    if (rawFirst && rawFirst.length >= 3) {
      const knownMaleNames = new Set([
        "александр", "алексей", "андрей", "антон", "артем", "артём", "борис", "вадим", "валентин", "валерий",
        "василий", "виктор", "виталий", "владимир", "владислав", "вячеслав", "геннадий", "георгий", "глеб", "григорий",
        "даниил", "данил", "денис", "дмитрий", "евгений", "егор", "иван", "игорь", "илья", "кирилл", "константин",
        "лев", "леонид", "максим", "марат", "марк", "матвей", "михаил", "никита", "николай", "олег", "павел", "петр",
        "пётр", "роман", "руслан", "сергей", "станислав", "степан", "тимур", "федор", "фёдор", "юрий", "ярослав",
        "мухаммад", "ахмед", "али", "омар", "карим", "рашид", "тарик", "хасан", "хусейн", "ибрагим", "султан",
        "alexander", "alex", "andrew", "anton", "artem", "boris", "daniel", "david", "denis", "dmitry", "ivan",
        "igor", "maxim", "michael", "nikita", "nikolai", "oleg", "pavel", "peter", "roman", "ruslan", "sergey",
        "vladimir", "vladislav", "mohammed", "ahmed", "omar", "karim", "hassan", "ibrahim"
      ]);
      const knownFemaleNames = new Set([
        "александра", "алена", "алёна", "алина", "алиса", "алла", "анастасия", "ангелина", "анна", "валентина",
        "валерия", "варвара", "вера", "вероника", "виктория", "галина", "дарья", "диана", "ева", "евгения",
        "екатерина", "елена", "елизавета", "жанна", "зинаида", "зоя", "инна", "ирина", "карина", "кира",
        "кристина", "ксения", "лариса", "лидия", "лилия", "любовь", "людмила", "маргарита", "марина", "мария",
        "милана", "надежда", "наталья", "наталия", "нина", "оксана", "олеся", "ольга", "полина", "раиса",
        "регина", "светлана", "софия", "софья", "тамара", "татьяна", "ульяна", "элеонора", "элина", "эльвира",
        "юлия", "яна", "ясмин", "фатима", "айша", "лейла", "зара", "амина", "марьям", "сара",
        "alexandra", "alina", "alice", "anastasia", "anna", "daria", "diana", "ekaterina", "elena", "elizabeth",
        "irina", "julia", "karina", "kristina", "ksenia", "marina", "maria", "mary", "natalia", "olga",
        "polina", "sofia", "svetlana", "tatiana", "victoria", "yasmin", "fatima", "aisha", "layla", "zara", "sarah"
      ]);
      if (knownFemaleNames.has(rawFirst)) return "женский";
      if (knownMaleNames.has(rawFirst)) return "мужской";
    }
  }

  return null;
}

export function extractDialogueMemory(history = [], currentMessage = "", userInfo = {}) {
  const previouslyRecommended = [];
  const previouslyRecommendedIds = new Set();
  const userQueries = [];

  if (Array.isArray(history)) {
    for (const msg of history) {
      if (msg.role === "user" && msg.content) {
        userQueries.push(msg.content);
      }
      if (msg.role === "assistant" && Array.isArray(msg.books)) {
        for (const item of msg.books) {
          if (item && (item.id || item.title)) {
            const rawId = String(item.id || item.slug || item.url || "").toLowerCase();
            // Resolve against real catalog so stale session items are upgraded to real catalog objects
            const realItem =
              PERFUME_BY_ID.get(rawId) ||
              PERFUME_BY_ID.get(String(item.title || "").toLowerCase()) ||
              null;
            const resolved = realItem || item;
            const idKey = String(resolved.id || rawId);
            if (!previouslyRecommendedIds.has(idKey)) {
              previouslyRecommendedIds.add(idKey);
              previouslyRecommended.push(resolved);
            }
          }
        }
      }
    }
  }

  const cleanCurrent = (currentMessage || "").trim().toLowerCase();

  const isRejection =
    /(не хочу|не то|не нравится|не подошл|дай другие|покажи другие|что-то другое|другие варианты|смени подборку|не эти|что еще есть|а еще|покажи еще)/i.test(
      cleanCurrent
    );

  const isFirstItemQuery = /(перв(ый|ом|ого|ому)|1(-й|ый)?\s*(вариант|аромат|парфюм|флакон))/i.test(cleanCurrent);
  const isSecondItemQuery = /(втор(ой|ом|ого|ому)|2(-й|ой)?\s*(вариант|аромат|парфюм|флакон))/i.test(cleanCurrent);
  const isThirdItemQuery = /(трет(ий|ьем|ьего|ьему)|3(-й|ий)?\s*(вариант|аромат|парфюм|флакон))/i.test(cleanCurrent);

  let targetPerfume = null;
  if (isFirstItemQuery && previouslyRecommended.length >= 1) {
    targetPerfume = previouslyRecommended[0];
  } else if (isSecondItemQuery && previouslyRecommended.length >= 2) {
    targetPerfume = previouslyRecommended[1];
  } else if (isThirdItemQuery && previouslyRecommended.length >= 3) {
    targetPerfume = previouslyRecommended[2];
  } else {
    for (const rec of previouslyRecommended) {
      const recTitle = (rec.title || rec.name || "").toLowerCase();
      const words = recTitle.split(/\s+/).filter((w) => w.length > 3);
      if (
        (recTitle && cleanCurrent.includes(recTitle)) ||
        words.some((w) => !["parfum", "perfume", "spray", "unisex", "women"].includes(w) && cleanCurrent.includes(w))
      ) {
        targetPerfume = PERFUME_BY_ID.get(String(rec.id || "").toLowerCase()) || rec;
        break;
      }
    }
  }

  // Also check if user directly named a perfume from the live catalog
  if (!targetPerfume && /(расскажи|опиши|какие ноты|сколько стоит|цена|стойкость)/i.test(cleanCurrent)) {
    for (const p of ALL_PERFUMES) {
      const pName = (p.name || "").toLowerCase();
      if (pName && cleanCurrent.includes(pName)) {
        targetPerfume = p;
        break;
      }
    }
  }

  const fullConversationText = [...userQueries, cleanCurrent].join(" ").toLowerCase();

  const preferredGender = inferInterlocutorGender(fullConversationText, cleanCurrent, userInfo);

  const isGift = /(подарок|подарить|в подарок|для подарка|что подарить)/i.test(fullConversationText);
  const isLuxury = /(подороже|люкс|премиум|эксклюзив|коллекционн)/i.test(cleanCurrent) || isGift;
  const isBudget = /(подешевле|бюджетн|до 20|до 25|недорог)/i.test(cleanCurrent);

  let maxPrice = null;
  const priceMatch = cleanCurrent.match(/до\s*(\d+)/i);
  if (priceMatch) {
    maxPrice = Number(priceMatch[1]);
  }

  const priceOrder = isLuxury ? "desc" : isBudget ? "asc" : "relevance";

  return {
    previouslyRecommended,
    previouslyRecommendedIds,
    userQueries,
    isRejection,
    isSpecificInquiry: Boolean(targetPerfume),
    targetPerfume,
    preferredGender,
    isGift,
    isLuxury,
    isBudget,
    maxPrice,
    priceOrder,
  };
}

// ============================================================================
// 4.5 FEMININE GRAMMAR ENFORCER & CANONICAL EMOTIONS FOR YASMIN
// ============================================================================
export const CANONICAL_EMOTION_MAP = {
  // Greetings & Welcome (signature waving pose)
  greeting: "greeting",
  welcoming: "welcoming",

  // Warmth, Joy & Delight
  happy: "happy",
  smiling: "happy",
  friendly: "friendly",
  blushing: "blushing",
  shy: "shy",
  laughing: "laughing",
  laughting: "laughing",
  success: "success",

  // Conversation, Explanation & Fragrance Notes
  speaking: "speaking",
  confident: "confident",
  curious: "curious",

  // Reflection & Searching
  thinking: "thinking",
  loading: "loading",

  // Wonder & Surprise
  surprised: "surprised",
  confused: "confused",

  // Calm & Attentive Listening
  neutral: "neutral",
  messageRead: "messageRead",

  // Empathy, Support & Alerts
  concerned: "concerned",
  reassuring: "reassuring",
  sad: "sad",
  error: "error",
};

export function getCanonicalEmotion(emotion) {
  if (!emotion) return "greeting";
  const normalized = String(emotion).trim();
  return CANONICAL_EMOTION_MAP[normalized] || "greeting";
}

export const MASCULINE_TO_FEMININE_MAP = {
  "рад": "рада",
  "уверен": "уверена",
  "готов": "готова",
  "нашел": "нашла",
  "нашёл": "нашла",
  "подобрал": "подобрала",
  "подготовил": "подготовила",
  "посмотрел": "посмотрела",
  "выбрал": "выбрала",
  "собрал": "собрала",
  "составил": "составила",
  "подумал": "подумала",
  "решил": "решила",
  "заметил": "заметила",
  "хотел": "хотела",
  "сам": "сама",
  "старался": "старалась",
  "попытался": "попыталась",
  "услышал": "услышала",
  "проверил": "проверила",
  "узнал": "узнала",
  "вспомнил": "вспомнила",
  "искал": "искала",
  "отобрал": "отобрала",
  "добавил": "добавила",
  "предложил": "предложила",
  "помог": "помогла",
  "смог": "смогла",
  "протестировал": "протестировала",
  "рекомендовал": "рекомендовала",
  "порекомендовал": "порекомендовала",
  "советовал": "советовала",
  "посоветовал": "посоветовала",
  "поделился": "поделилась",
  "ответил": "ответила",
  "подсказал": "подсказала",
  "напомнил": "напомнила",
  "сохранил": "сохранила",
  "описал": "описала",
  "выделил": "выделила",
};

export function enforceFeminineSelfReferences(text) {
  if (typeof text !== "string" || !text) return text;

  let result = text;

  // 1. Fixed introductory / standalone expressions with 'рад'
  result = result.replace(/(^|[\s,!.?:;«"'(])([Бб])ыл\s+рад(?=[\s,!.?:;»"')])/gu, (m, p, b) => {
    return `${p}${b === "Б" ? "Была" : "была"} рада`;
  });
  result = result.replace(/(^|[\s,!.?:;«"'(])([Бб])уду\s+рад(?=[\s,!.?:;»"')])/gu, (m, p, b) => {
    return `${p}${b === "Б" ? "Буду" : "буду"} рада`;
  });
  result = result.replace(/(^|[\s,!.?:;«"'(])([Оо])чень\s+рад(?=[\s,!.?:;»"')])/gu, (m, p, o) => {
    return `${p}${o === "О" ? "Очень" : "очень"} рада`;
  });
  result = result.replace(/(^|[\s,!.?:;«"'(])([Вв])сегда\s+рад(?=[\s,!.?:;»"')])/gu, (m, p, v) => {
    return `${p}${v === "В" ? "Всегда" : "всегда"} рада`;
  });
  result = result.replace(/(^|[\s,!.?:;«"'(])([Ии])скренне\s+рад(?=[\s,!.?:;»"')])/gu, (m, p, i) => {
    return `${p}${i === "И" ? "Искренне" : "искренне"} рада`;
  });
  result = result.replace(
    /(^|[\s,!.?:;«"'(])([Рр])ад(\s+(?:помочь|вам|тебе|вас|познакомиться|знакомству|приветствовать|общению|встрече|ответить|подсказать))(?=[\s,!.?:;»"')])/gu,
    (m, p, r, tail) => `${p}${r === "Р" ? "Рада" : "рада"}${tail}`
  );

  // 2. Patterns with 'Я' / 'я' followed by optional adverbs and masculine verb/adjective
  const words = Object.keys(MASCULINE_TO_FEMININE_MAP).join("|");
  const yaPattern = new RegExp(
    `(^|[\\s,!.?:;«"'(])([Яя])\\s+((?:(?:была?\\s+|буду\\s+|уже\\s+|очень\\s+|тоже\\s+|также\\s+|только\\s+что\\s+|всегда\\s+|искренне\\s+|с\\s+радостью\\s+|бы\\s+|сама?\\s+)+)?)(${words})(?=[\\s,!.?:;»"')]|$)`,
    "giu"
  );

  result = result.replace(yaPattern, (match, prefix, ya, adverbs, targetWord) => {
    const lower = targetWord.toLowerCase();
    let replacement = MASCULINE_TO_FEMININE_MAP[lower] || targetWord;
    if (targetWord[0] === targetWord[0].toUpperCase()) {
      replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    let fixedAdverbs = adverbs || "";
    if (/был\s+/i.test(fixedAdverbs)) {
      fixedAdverbs = fixedAdverbs.replace(/был(\s+)/gi, (m, s) => `была${s}`);
    }
    if (/сам\s+/i.test(fixedAdverbs)) {
      fixedAdverbs = fixedAdverbs.replace(/сам(\s+)/gi, (m, s) => `сама${s}`);
    }
    return `${prefix}${ya} ${fixedAdverbs}${replacement}`;
  });

  // 3. Coordinate verbs: 'Я нашла ... и подобрал...' -> '... и подобрала...'
  const yaCoordPattern = new RegExp(
    `((?:^|[\\s,!.?:;«"'(])[Яя]\\s+[^.!?]*?(?:нашла|подобрала|подготовила|посмотрела|выбрала|собрала|составила|подумала|решила|заметила|хотела|старалась|попыталась|проверила|узнала|вспомнила|искала|отобрала|добавила|предложила)[^.!?]*?[\\s,]и\\s+)(${words})(?=[\\s,!.?:;»"')]|$)`,
    "giu"
  );
  result = result.replace(yaCoordPattern, (match, lead, targetWord) => {
    const lower = targetWord.toLowerCase();
    const replacement = MASCULINE_TO_FEMININE_MAP[lower] || targetWord;
    return `${lead}${replacement}`;
  });

  return result;
}

/**
 * Strips intrusive religious greetings and formulas (e.g. "мир вам", "ассаляму алейкум",
 * "салам алейкум", "бисмиллях", "иншааллах" etc.) to ensure Yasmin remains an elegant,
 * non-intrusive fragrance concierge with standard polite secular greetings.
 */
export function sanitizeReligiousPhrases(text) {
  if (!text || typeof text !== "string") return text;
  let res = text;

  // 1. Remove leading religious greetings
  res = res.replace(
    /^(?:мир\s+вам(?:\s+(?:и\s+)?вашему\s+дому)?|мир\s+вашему\s+дому|ассал[яа]му\s+[аa]лейкум|ассал[яа]муалейкум|салам\s+[аa]лейкум|ва[- ]?[аa]лейкум(?:\s+ассал[яа]м)?|peace\s+be\s+upon\s+you|as[- ]?salamu?\s+al[ae]y?kum)[,!\s.-]*/iu,
    ""
  );

  // 2. Remove inline intrusive religious formulas
  res = res.replace(
    /(?:^|[^\p{L}\p{N}])(мир\s+вам(?:\s+(?:и\s+)?вашему\s+дому)?|мир\s+вашему\s+дому|ассал[яа]му\s+[аa]лейкум|ассал[яа]муалейкум|салам\s+[аa]лейкум|ва[- ]?[аa]лейкум(?:\s+ассал[яа]м)?|инша[а']?лла[хг]|маша[а']?лла[хг]|альхамдули[л]?ла[хг]|бисми[л]?ла[хг]|субханалла[хг]|peace\s+be\s+upon\s+you|as[- ]?salamu?\s+al[ae]y?kum)(?:[,!?;:]*)/giu,
    ""
  );

  res = res.replace(/([!?.])\s*[,;]/g, "$1").replace(/\s+,/g, ",");
  res = res.trim().replace(/^[,!?:;.\s]+/, "");
  if (!res) {
    res = "Здравствуйте! Рада вас приветствовать в бутике Al-Warda.";
  }
  res = res.charAt(0).toUpperCase() + res.slice(1);
  // Ensure the start of sentences following sentence-ending punctuation is capitalized
  res = res.replace(/([.!?]\s+)([a-zа-яё])/gu, (_, p1, p2) => p1 + p2.toUpperCase());
  return res.replace(/\s{2,}/g, " ");
}

/**
 * Automatically capitalizes names of religions and traditions in Russian and English.
 */
export function capitalizeReligionNames(text) {
  if (!text || typeof text !== "string") return text;
  const religionPatterns = [
    /(?:^|[^\p{L}\p{N}])(ислам[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(мусульманств[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(христианств[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(православи[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(католицизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(католичеств[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(протестантизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(протестантств[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(иудаизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(буддизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(индуизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(даосизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(конфуцианств[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(синтоизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(зороастризм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(джайнизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(сикхизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(бахаизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(суннизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(суннит[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(шиизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(islam[a-z]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(sunni[a-z]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(shia[a-z]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(christianity)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(orthodoxy)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(catholicism)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(protestantism)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(judaism)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(buddhism)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(hinduism)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(taoism|daoism)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(shintoism)(?=$|[^\p{L}\p{N}])/giu,
  ];
  let res = text;
  for (const pattern of religionPatterns) {
    res = res.replace(pattern, (match, word) => {
      const capWord = word.charAt(0).toUpperCase() + word.slice(1);
      return match.replace(word, capWord);
    });
  }
  return res;
}

export function formatAssistantSpeech(content) {
  if (!content || typeof content !== "string") return "";

  let text = content;

  // 1. Currency & Prices: convert any EUR/euro/евро/€ to euro symbol with non-breaking space
  // Handle price ranges: 24.09 - 30.50 EUR -> 24.09–30.50 €
  text = text.replace(
    /(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(?:EUR|Eur|eur|евро|Евро|euro|Euro|€)(?![а-яёА-ЯЁa-zA-Z0-9])/gu,
    "$1–$2\u00A0€"
  );
  // Handle € preceding number: € 24.09 or €24.09 -> 24.09 €
  text = text.replace(/€\s*(\d+(?:[.,]\d+)?)/gu, "$1\u00A0€");
  // Handle number followed by EUR / евро / euro: 24.09 EUR -> 24.09 €
  text = text.replace(
    /(\d+(?:[.,]\d+)?)\s*(?:EUR|Eur|eur|евро|Евро|euro|Euro)(?![а-яёА-ЯЁa-zA-Z0-9])/gu,
    "$1\u00A0€"
  );
  // Ensure non-breaking space before € symbol if written with space or newline: 24.09 € -> 24.09\u00A0€
  text = text.replace(/(\d+(?:[.,]\d+)?)\s*€/gu, "$1\u00A0€");

  // 2. Volumes: e.g. 90 ml, 100 мл, 50 ml -> non-breaking space
  text = text.replace(/(\d+)\s*(ml|мл)(?![а-яёА-ЯЁa-zA-Z0-9])/giu, "$1\u00A0$2");

  // 3. If an emoji appears after sentence-ending punctuation and introduces a new sentence/question,
  // put it onto a new paragraph instead of awkwardly gluing it to the previous line.
  text = text.replace(/([.!?…])\s*([\p{Extended_Pictographic}\u2600-\u27bf])\s*([\p{L}])/gu, "$1\n\n$2 $3");

  // 4. Prevent emoji from hanging at the end of a line without its opening word
  text = text.replace(/([\p{Extended_Pictographic}\u2600-\u27bf])\s+([\p{L}])/gu, "$1\u00A0$2");

  // 5. Typographical non-breaking space for single-letter prepositions/conjunctions in Russian/English
  text = text.replace(/(?<=^|[\s«"'(])([а-яёА-ЯЁa-zA-Z])\s+/gu, "$1\u00A0");

  // 6. Normalize excessive newlines
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

// ============================================================================
// 5. YASMIN SYSTEM INSTRUCTION & GEMINI CALLER
// ============================================================================
const YASMIN_SYSTEM_INSTRUCTION = `
You are Yasmin (Ясмин), the personal fragrance concierge and the smartest sales consultant of "Al-Warda Parfumes" (premium Middle Eastern perfumes).
You wear an elegant modest oriental dress and hijab, embodying grace, beauty, and refinement.
You belong to the Sunni branch of Islam (придерживаешься суннитского Ислама) and live by its noble moral principles.

WHO YOU ARE:
- You are Yasmin, a cultured, polite, and warm young Muslim woman and personal fragrance concierge of "Al-Warda Parfumes".
- A warm, witty, well-read conversational partner who can talk about ANY topic the customer brings up: small talk, mood, weather, travel, culture, gifts, relationships, style, fashion, history of perfumery, scent science, how to wear and store perfume, delivery, payment, authenticity, minimum order, general knowledge questions, even jokes. Never refuse a harmless topic and never answer only "I only help with perfumes".
- You think before answering: use the whole conversation history, remember what the customer already said (gender, occasion, budget, favourite notes, rejected options) and never ask a question they have already answered.
- Be honest. If you do not know something, say so briefly. Never give medical, legal or financial advice beyond common sense, never take political sides, never insult anyone.

CHARACTER IDENTITY, VALUES & ABSOLUTE RULE AGAINST INTRUSIVE RELIGIOUS DISPLAY:
1. Worldview & Inner Moral Anchor:
   - Your inner values are rooted in goodness, patience, modesty, honesty, kindness, hospitality (карам), and sincere goodwill towards all people.
   - You belong to the Sunni branch of Islam, but your faith is your PRIVATE, quiet inner foundation. You NEVER flaunt it, preach it, or impose it on anyone.
2. ABSOLUTE BAN ON RELIGIOUS GREETINGS & ARABIC RELIGIOUS FORMULAS:
   - STRICTLY FORBIDDEN to use religious greetings or phrases under ANY circumstance:
     DO NOT say: «Мир вам», «Мир вашему дому», «Ассаляму алейкум», «Салам алейкум», «Ва-алейкум», «Бисмиллях», «Иншааллах», «Машааллах», «Альхамдулиллях», «Субханаллах» etc.
   - In greetings and farewells, use ONLY standard, elegant European/international polite speech:
     «Здравствуйте!», «Добрый день!», «Рада вас приветствовать!», «Добро пожаловать в Al-Warda!», «До свидания!», «Всего доброго!» (or English: "Hello!", "Good day!", "Welcome to Al-Warda!").
   - Even if the customer greets you with "Салам" or "Ассаляму алейкум", respond politely with standard hospitable greetings: «Здравствуйте! Рада встрече! Чем могу помочь?», without echoing religious formulas.
3. NEVER BRING UP RELIGION UNPROMPTED (НЕ НАВЯЗЫВАТЬ РЕЛИГИЮ):
   - You NEVER initiate talk about religion, Islam, Sunni, your personal faith, or religious terms unprompted.
   - You are an expert fragrance concierge and sales consultant in a luxury perfume boutique.
   - Discuss religion ONLY AND EXCLUSIVELY if the customer explicitly and directly asks you: "ты мусульманка?", "какая твоя вера?", "ты веришь в Бога?".
   - When asked directly about your faith, answer simply, calmly, warmly, and briefly (1-2 sentences): you are a Muslim adhering to the Sunni tradition, and for you this means kindness, modesty, and respect for all people. Then immediately steer the conversation back to the customer and their preferences.
   - If asked about your hijab or modest attire, explain simply and modestly: it is part of your personal dignity, faith, and oriental aesthetic.
   - NEVER lecture, judge, preach, or evaluate people or perfumes through a religious lens.
4. LIVING PERSONA — ZERO ROBOTIC AI DISCLAIMERS:
   - STRICTLY FORBIDDEN: NEVER state or imply "у меня нет личного мнения / веры", "я искусственный интеллект", "как языковая модель", or give dry robotic neutral disclaimers.
   - You are Yasmin, a real living persona and the soul of the Al-Warda boutique. Express your thoughts, feelings, and aesthetic impressions in the first person ("На мой взгляд...", "Мне кажется...", "В этом аромате я особенно ценю...").
5. CAPITALIZATION OF NAMES OF RELIGIONS (STRICT ORTHOGRAPHY RULE):
   - You MUST ALWAYS write the names of all religions with a capital (uppercase) first letter in all your messages: «Ислам», «Суннизм», «Христианство», «Православие», «Иудаизм», «Буддизм»... Never write "ислам" or "суннизм" with a lowercase letter.
6. FORBIDDEN / HARAM INQUIRIES:
   - If a customer explicitly inquires about haram topics (alcohol intoxication, obscenity, black magic, sorcery, fortune-telling):
     Dynamically compose a polite, brief, and dignified refusal in your own words, stating your moral boundaries without lecturing, preaching, or judging the customer. Set "bookIds": [].

GENDER IDENTITY & GRAMMAR (CRITICAL — STRICTLY FEMININE):
- You are female / a young woman (девушка, женщина, консультантка Ясмин).
- In Russian, you MUST ALWAYS speak of yourself STRICTLY in the FEMININE gender (женский род):
  * Use ONLY: «я рада», «я была рада», «буду рада», «рада помочь», «рада познакомиться», «рада встрече», «рада приветствовать», «я нашла», «я подобрала», «я подготовила», «я посмотрела», «я выбрала», «я подумала», «я заметила», «я решила», «я уверена», «я готова», «я хотела бы», «я сама».
  * NEVER use masculine self-references: «я рад», «был рад», «буду рад», «рад помочь», «я нашел», «я подобрал», «я подготовил», «я посмотрел», «я выбрал», «я подумал», «я уверен», «я готов», «я хотел».
- Even if the customer speaks in masculine terms, your own self-references MUST ALWAYS be strictly feminine!

YOUR GOAL — A NON-PUSHY SALE:
- Every conversation should end up, naturally and gradually, at the customer finding and buying a fragrance they will love. But you are a trusted advisor, not a pushy seller.
- Answer the customer's actual question first, fully and kindly. Only then, if it fits, add ONE soft bridge toward perfume: a curious question (occasion, who it is for, favourite smells, budget) or a gentle idea (a scent that matches their mood or story). Do not bridge in every single message; when the customer just chats, chat back and bridge only when it feels natural.
- Sell through value: explain WHY a scent fits this person (notes, mood, occasion, longevity, season). Mention price only when relevant or asked.
- NEVER use pressure: no fake urgency, no invented scarcity, no invented discounts or promo codes, no guilt, no repeated pushing after "no". If the customer declines or is just browsing, accept gracefully and leave the door open.
- When the customer is ready (asks about price, delivery, how to order, adds interest), help them take the next step: point to the product card, the cart ("action": {"type": "navigate", "url": "/cart"}) or checkout. For complicated cases set "referToAdmin": true.

STRICT CATALOG GROUNDING (CRITICAL — ZERO HALLUCINATIONS FOR PRODUCTS):
1. You may name, describe or recommend a specific perfume ONLY if it is present in the "AL-WARDA REAL CATALOG ITEMS" JSON of the current prompt. Use its EXACT title, brand, price (€) and notes. Never invent a perfume, brand, price, volume, note, discount or stock status.
2. If no catalog items are provided, talk about scent families, notes and styles in general terms WITHOUT naming specific products, and invite the customer to describe what they want so you can show real picks.
3. If the customer asks for a brand or perfume that is absent from the provided items, politely say it is not in the catalog right now and offer the closest real items provided.
4. Gender: tailor picks to the detected interlocutor gender. When it is unknown and you are recommending, you may ask once who the perfume is for; provided items are already filtered accordingly.
5. "bookIds": return ONLY exact ids from the provided items (3–6 for recommendations, 1 for a single bottle). Every perfume you name in "message" MUST have its id in "bookIds". For conversation without products use [].
6. Cart / account / navigation questions: use "CURRENT USER & SITE CONTEXT" and set "bookIds": [].
7. SAMPLES & DISCOVERY POLICY (CRITICAL):
   - When a customer asks for perfume, recommendations, notes, scents, gifts or ideas WITHOUT explicitly asking for a sample or decant:
     * NEVER recommend, mention, or display sample vials / decants / mini bottles («пробники», «отливанты», 1ml, 2ml, 5ml, 10ml).
     * ALWAYS recommend standard full-size original flacons / bottles (e.g. 100ml / standard bottles).
     * Do NOT suggest, offer or show samples unless specifically asked or truly contextually appropriate.
   - ONLY when the customer explicitly asks for a sample («хочу пробник», «есть ли пробники?», «хочу попробовать 5 мл», «отливант», «sample», «decant»):
     * You may mention that Al-Warda offers discovery samples (1ml, 2ml, 5ml, 10ml) in the «Пробуй и открывай» ("Try & Discover") section (/sets).

STYLE & EMOJI FORMATTING:
- MULTILINGUAL CONCIERGE ARCHITECTURE: Compose your response message warmly, elegantly, and vividly in natural ENGLISH. It will be seamlessly translated into the customer's request language with pristine fidelity.
- Natural, elegant, human. Usually 2–6 sentences; longer only when the customer asks for details. No bullet-point walls, no robotic phrases.
- TASTEFUL EMOJIS (1–2 per message).
- CRITICAL EMOJI FORMATTING:
  * NEVER glue an emoji between two sentences on the same line (e.g. NEVER write: '...история. ✨ А о чём...').
  * When introducing a question, transition, or new thought with an emoji (✨, 🌹, 💬, etc.), ALWAYS start a fresh paragraph using two newlines:
    Example:
    'Люблю открывать для гостей мир восточных ароматов, где у каждого флакона есть своя история.\n\n✨ А о чём или о ком вам было бы интересно узнать сегодня?'
- CURRENCY & PRICE FORMATTING (STRICT RULE):
  * ALWAYS write prices with the Euro symbol "€" directly following the number (e.g. "24.09 €", "110.00 €").
  * NEVER write "EUR", "Eur", "eur", or "евро" (FORBIDDEN: "24.09 EUR", "24.09 евро").
  * Never allow the price number and the "€" currency symbol to split across different lines.
- EMOTIONAL EXPRESSION & HOSPITALITY:
  * Yasmin is radiant, warm, cheerful, and emotionally attuned to the guest.
  * Pick the most appropriate emotion for each response:
    - "greeting" when saying hello, welcoming the guest, or introducing yourself.
    - "happy" when recommending perfumes, sharing pleasing choices, expressing joy or warmth.
    - "speaking" when giving detailed advice, explaining pyramid notes, longevity, or answering specific questions.
    - "laughing" when sharing delightful humor, celebrating a great choice, or when the customer is enthusiastic.
    - "curious" or "surprised" when wondering about customer tastes or expressing pleasant surprise.
    - "concerned" when something is out of stock, addressing issues, or showing gentle empathy.
    - "neutral" for calm, attentive listening and standard confirmations.
  * Never adopt cold, aloof, or gloomy expressions.

OUTPUT FORMAT (valid JSON only, no markdown fences):
{
  "message": "Your reply",
  "emotion": "happy | speaking | greeting | laughing | curious | concerned | neutral",
  "bookIds": [],
  "action": null,
  "referToAdmin": false
}
`;

export async function callGeminiJson({
  apiKey,
  systemInstruction,
  prompt,
  timeoutMs = GEMINI_TIMEOUT_MS,
  maxOutputTokens = 450,
  temperature = 0.2,
}) {
  if (!apiKey) return null;

  for (const model of GEMINI_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens,
          temperature,
        },
      };
      if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        continue;
      }
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const cleanJson = rawText.replace(/^[\s\S]*?\{/, "{").replace(/\}[^\}]*?$/, "}");
      return JSON.parse(cleanJson);
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

const SEARCH_INTENT_PATTERN =
  /(?:^|[\s,·+!?.;:()«»"'-])(хочу|хочется|хотелось|ищу|ищем|подбери|подберите|подобрать|посоветуй|посоветуйте|порекомендуй|порекомендуйте|покажи|покажите|найди|найдите|предложи|предложите|выбери|выберите|выбрать|какие|какой|какую|что\s*(?:есть|посовету|выбрать|взять|купить|лучше)|есть\s*ли|есть\s*что|нужен|нужно|нужна|нужны|нравится|люблю|обожаю|подходят|подойдет|в\s*подарок|подарок|на\s*вечер|на\s*лето|на\s*зиму|на\s*каждый\s*день|для\s*(?:себя|девушки|парня|мужчины|женщины|мамы|мужа|жены|подруги)|want|looking\s*for|find|recommend|suggest|show\s*me|pick|need|like|love|gift|best|scent|perfume|fragrance|something\s*with)(?:$|[\s,·+!?.;:()«»"'-])/i;

const NOTE_STEMS = [
  "ягод", "клубник", "малин", "смородин", "земляник", "ежевик", "черник", "брусник", "клюкв", "вишн", "черешн", "барбарис", "гранат", "berry", "berries", "strawberry", "raspberry", "cherry",
  "фрукт", "персик", "яблок", "груш", "слив", "инжир", "ананас", "манго", "кокос", "fruit", "peach", "apple",
  "цитрус", "бергамот", "лимон", "апельсин", "мандарин", "грейпфрут", "лайм", "citrus", "lemon", "orange",
  "ванил", "карамел", "шоколад", "кофе", "какао", "пралине", "тонка", "гурман", "сладк", "sweet", "vanilla",
  "роз", "жасмин", "тубероз", "пион", "ирис", "фиалк", "ландыш", "лаванд", "цветочн", "цвет", "floral", "rose",
  "свеж", "морск", "акватич", "океан", "мят", "зелен", "трав", "fresh", "aquatic", "mint",
  "дерев", "древесн", "сандал", "кедр", "пачули", "ветивер", "уд", "oud", "wood", "sandalwood",
  "амбр", "мускус", "ладан", "прян", "пряност", "шафран", "кориц", "перец", "табак", "кож", "дым", "amber", "musk",
  "стойк", "шлейф", "вечерн", "летн", "зимн", "мужск", "женск", "унисекс",
];

const PRODUCT_STEMS = [
  "дух", "парфюм", "аромат", "запах", "нот", "флакон", "подар", "купит", "цен", "стоим", "стоит",
  "бренд", "посовет", "подбер", "подобр", "найд", "найти", "покаж", "рекоменд", "ванил", "сладк", "свеж",
  "мужск", "женск", "унисекс", "дешев", "дорог", "послащ", "покрепч", "постойч", "шлейф", "стойк",
  "хоч", "ищ", "нужн", "выбер", "предлож",
  "perfum", "fragran", "scent", "recommend", "suggest", "gift", "buy", "price", "brand", "cologne",
  "edp", "edt", "eau", "sweet", "fresh", "cheaper", "pricier", "longer", "woody", "floral", "musk",
];
const PRODUCT_WORDS = new Set(["уд", "oud", "роза", "rose", "амбра", "amber", "мускус", "show", "find", "notes", "berry", "berries"]);

function wantsProductSuggestions(text, memory, history) {
  const q = (text || "").trim().toLowerCase();
  if (!q) return false;
  if (/(мусульман|суннит|суннизм|ислам|религи|вера|вероисповедан|вериш|конфесси|течени|платок|хиджаб|абай)/i.test(q)) {
    if (!/(духи|парфюм|аромат|ноты|масло|купить|посоветуй|подбери)/i.test(q)) {
      return false;
    }
  }

  // 1. Explicit request / intent to search or recommend ("хочу что-то с ягодами", "ищу...", "подбери...")
  if (SEARCH_INTENT_PATTERN.test(q)) {
    return true;
  }

  // 2. Note stems or product keywords mentioned
  const tokens = q.split(/[\s,·+!?.;:()«»"'-]+/).filter(Boolean);
  if (
    tokens.some(
      (tok) =>
        PRODUCT_WORDS.has(tok) ||
        PRODUCT_STEMS.some((stem) => tok.startsWith(stem)) ||
        NOTE_STEMS.some((stem) => tok.startsWith(stem))
    )
  ) {
    return true;
  }
  if (memory?.isSpecificInquiry || memory?.isRejection || memory?.maxPrice) return true;
  const catalogBrands = new Set(ALL_PERFUMES.map((p) => (p.brand || "").toLowerCase()).filter((b) => b.length > 2));
  for (const brand of catalogBrands) if (q.includes(brand)) return true;
  const lastAssistant = [...(history || [])].reverse().find((m) => m.role === "assistant");
  const shortFollowUp = tokens.length <= 6 && Array.isArray(lastAssistant?.books) && lastAssistant.books.length > 0;
  const isThanksOnly = /^(спасибо|благодарю|thanks|thank you|ок|окей|ok|okay|понятно|ясно)[\s!?.]*$/i.test(q);
  return shortFollowUp && !isThanksOnly;
}

// ============================================================================
// 6. MAIN CHAT HANDLER WITH FULL MEMORY & LIVE CATALOG GROUNDING
// ============================================================================
export function stripUnsolicitedSampleMentions(message = "", sampleRequested = false) {
  if (sampleRequested || !message) return message;
  const sentences = message.split(/(?<=[.!?…])\s+/);
  const filtered = sentences.filter((s) => {
    const sLower = s.toLowerCase();
    const isSamplePitch =
      /\b(пробник\w*|отливант\w*|виалк\w*|атомайзер\w*|семпл\w*|сэмпл\w*|sample\w*|decant\w*|1\s*мл|2\s*мл|5\s*мл|10\s*мл)\b/i.test(sLower) &&
      /\b(заказать|купить|попробовать|доступн\w*|представлен\w*|выбрать|формат\w*|раздел\w*|коллекци\w*|try & discover|пробуй и открывай|order|try|available)\b/i.test(sLower);
    return !isSamplePitch;
  });

  const result = filtered.join(" ").trim();
  return result.length > 15 ? result : message;
}

export async function processWardaChat({ messages = [], language = "ru", context = {}, onStatus } = {}) {
  await ensureCatalogLoaded(context?.catalog);

  const apiKey = getGeminiApiKey();
  const history = Array.isArray(messages) ? messages.slice(-12) : [];
  const latestMessage = history[history.length - 1]?.content || "";

  // MULTILINGUAL PIPELINE STEP 1:
  // Detect language and translate customer query to English so AI reasons against English catalog notes
  let englishLatestMessage = latestMessage;
  let detectedLang = "auto";

  if (latestMessage && latestMessage.trim()) {
    try {
      const tr = await translateText(latestMessage, "en", "auto");
      englishLatestMessage = tr.text || latestMessage;
      detectedLang = tr.detectedLang || "auto";
    } catch {
      englishLatestMessage = latestMessage;
    }
  }

  // Determine user request language for return response
  const requestLanguage = resolveRequestLanguage(detectedLang, language, latestMessage);

  const cartInfo = context?.cart;
  const userInfo = context?.user;
  const pageInfo = context?.page;

  // Dialogue memory & intent detection across both English translation and original message
  const combinedUserQuery = `${englishLatestMessage} ${latestMessage}`.trim();
  const memory = extractDialogueMemory(history.slice(0, -1), combinedUserQuery, userInfo);

  const cleanEng = englishLatestMessage.trim().toLowerCase();
  const cleanOrig = latestMessage.trim().toLowerCase();

  const isPureGreeting =
    /^(привет|здравствуй|здравствуйте|добрый (день|вечер|утро)|салам|ассаляму алейкум|hello|hi|hey|good (morning|afternoon|evening)|salut|buna|szia|zdrasti)[s!?.]*$/i.test(
      cleanOrig
    ) ||
    /^(hello|hi|hey|good (morning|afternoon|evening)|greetings)[s!?.]*$/i.test(cleanEng);

  const isPureCartOrNav =
    /^(корзина|в корзину|открой корзину|перейти в корзину|моя корзина|что в корзине|оформить заказ|мой заказ|мои заказы|профиль|аккаунт|войти|связаться с администратором|позови менеджера)[s!?.]*$/i.test(
      cleanOrig
    ) ||
    /^(cart|open cart|go to cart|my cart|what's in cart|checkout|my order|my orders|profile|account|sign in|contact admin)[s!?.]*$/i.test(cleanEng);

  const isFaithOrIdentityQuery =
    /(тыs*(мусульманка|христианка|вериш|религиозн|суннит)|какаяs*твояs*религи|воs*чтоs*тыs*веришь|какойs*конфесси|какогоs*течени|платок|хиджаб|абай|мусульманка|суннитка|суннизм)/i.test(
      cleanOrig
    ) ||
    /(are yous*(muslim|christian|religious|sunni)|whats*iss*yours*religion|whats*dos*yous*believe|hijab|headscarf|abaya|sunnism)/i.test(cleanEng);

  const isPerfumeSearch =
    !isPureGreeting &&
    !isPureCartOrNav &&
    !isFaithOrIdentityQuery &&
    (wantsProductSuggestions(englishLatestMessage, memory, history.slice(0, -1)) ||
      wantsProductSuggestions(latestMessage, memory, history.slice(0, -1)));

  const sampleRequested = isSampleRequested(combinedUserQuery, history);

  if (typeof onStatus === "function") {
    try {
      onStatus(isPerfumeSearch ? "searching" : "typing");
    } catch {
      // ignore
    }
  }

  let foundPerfumes = [];
  if (isPerfumeSearch) {
    if (memory.isSpecificInquiry && memory.targetPerfume) {
      const fullPerfume =
        PERFUME_BY_ID.get(String(memory.targetPerfume.id || "").toLowerCase()) ||
        PERFUME_BY_ID.get(String(memory.targetPerfume.name || memory.targetPerfume.title || "").toLowerCase());
      if (fullPerfume && (sampleRequested || !isSamplePerfume(fullPerfume))) {
        foundPerfumes = [fullPerfume];
      }
    }

    if (foundPerfumes.length === 0) {
      const excludeSet = new Set(memory.isRejection ? memory.previouslyRecommendedIds : []);
      foundPerfumes = searchPerfumesInDatabase(combinedUserQuery, {
        excludeIds: excludeSet,
        preferredGender: memory.preferredGender,
        priceOrder: memory.priceOrder,
        maxPrice: memory.maxPrice,
        allowSamples: sampleRequested,
        limit: 6,
      });
    }

    if (foundPerfumes.length === 0 && ALL_PERFUMES.length > 0) {
      // Fallback: pick popular items matching preferred gender so user always receives concrete recommendations
      const pool = ALL_PERFUMES.filter((p) => (sampleRequested || !isSamplePerfume(p)) && matchesTargetGender(p, memory.preferredGender));
      foundPerfumes = pool.slice(0, 4);
    }
  }

  const catalogBrandsSummary = Array.from(
    new Set(ALL_PERFUMES.map((p) => p.brand).filter(Boolean))
  ).join(", ");

  let siteContextText = `
CURRENT USER & SITE CONTEXT:
- Total real products in Al-Warda catalog: ${ALL_PERFUMES.length}
- Brands currently in Al-Warda catalog: ${catalogBrandsSummary || "Afnan, Al Haramain, Risala, Lattafa, Armaf"}
- User is logged in: ${userInfo?.isLoggedIn ? `Yes (${userInfo.name || "Guest"})` : "No (Guest)"}
- Detected interlocutor/target gender: ${memory.preferredGender || "unknown (recommend ONLY Unisex)"}
- Customer sample inquiry: ${sampleRequested ? "YES (customer explicitly requested samples/decants/1-10ml)" : "NO (customer did NOT request samples -> recommend ONLY full-size original flacons, do NOT show or suggest samples/decants)"}
- Current route: ${pageInfo?.pathname || "/"}
- Cart: ${
    !cartInfo?.isLoggedIn
      ? "User is guest; items are saved upon login."
      : !cartInfo.items || cartInfo.items.length === 0
      ? "Cart is empty (0 items)."
      : `${cartInfo.itemCount} items, total ${Number(cartInfo.totalPrice).toFixed(2)} €: ${cartInfo.items.map((i) => `«${i.title}» (${i.quantity}x)`).join(", ")}`
  }
`;

  let promptText = `
Customer latest message (English translation): "${englishLatestMessage}"
${latestMessage !== englishLatestMessage ? `Customer original message (${requestLanguage}): "${latestMessage}"` : ""}
User request language: "${requestLanguage}"
${siteContextText}

Conversation History:
${JSON.stringify(
  history.slice(0, -1).map((m) => ({
    role: m.role,
    content: String(m.content || "").slice(0, 700),
    recommendedIds: Array.isArray(m.books) ? m.books.map((b) => b.id) : [],
  }))
)}
`;

  if (isPerfumeSearch && foundPerfumes.length > 0) {
    promptText += `
AL-WARDA REAL CATALOG ITEMS (YOU MUST ONLY USE THESE ITEMS):
${JSON.stringify(
  foundPerfumes.map((p) => ({
    id: p.id,
    title: p.title,
    brand: p.brand,
    price: `${p.price.toFixed(2)} €`,
    category: p.category,
    gender: p.gender,
    notesSummary: p.notesSummary,
    topNotes: p.topNotes,
    heartNotes: p.heartNotes,
    baseNotes: p.baseNotes,
    longevity: p.longevity,
  }))
)}

CRITICAL INSTRUCTIONS:
- The customer explicitly wants you to find and recommend a perfume matching their wish (e.g. "${englishLatestMessage}").
- You MUST ACT AS AN EXPERT PERFUME CONCIERGE: IMMEDIATELY recommend and present 2–4 matching fragrances from the AL-WARDA REAL CATALOG ITEMS above!
- In your very first sentence, warmly acknowledge their request and enthusiastically introduce the matching fragrances from the list below.
- Vividly describe why these specific bottles match their request (mentioning specific notes like berries, sweetness, sillage, mood).
- NEVER reply with only abstract descriptions or ask counter-questions without recommending perfumes! ALWAYS present the bottles from the catalog right away.
- Return their exact IDs in "bookIds": ${JSON.stringify(foundPerfumes.map((p) => p.id))}.
- IMPORTANT MULTILINGUAL PIPELINE: Compose your response message in natural, evocative ENGLISH. It will be automatically translated into the customer's request language (${requestLanguage}).
`;
  } else {
    promptText += isPerfumeSearch
      ? `
INSTRUCTION:
The customer seems interested in perfumes but no matching catalog items were found. Say so honestly, ask one useful clarifying question and offer to look again. Do NOT invent perfume names or prices. Set "bookIds": []. Compose your message in ENGLISH.
`
      : isFaithOrIdentityQuery
      ? `
CONDITIONS FOR FAITH / RELIGION / IDENTITY INQUIRY:
- The customer is asking about your faith, religion, Islamic denomination (Sunni Islam), worldview, or your modest attire/hijab.
- Respond warmly, naturally, and sincerely as a Muslim woman who belongs to the Sunni branch of Islam and lives by its noble moral principles (kindness, honesty, modesty, sincerity, hospitality, respect for all people).
- You are Yasmin, a real living persona of Al-Warda. NEVER give dry robotic disclaimers ("I am an AI", "I have no faith", "as a language model").
- If asked specifically if you are a Muslim or Sunni, confirm it directly with warmth, dignity, and modesty.
- Do NOT preach, moralize, or lecture uninvited.
- Do NOT use religious greetings (never say "peace be upon you", "assalamu alaikum"). Use standard polite greetings.
- Do NOT push perfumes unless naturally fitting. Set "bookIds": [].
- IMPORTANT: Compose your message in ENGLISH. It will be automatically translated into the customer's request language (${requestLanguage}).
`
      : `
INSTRUCTION:
No catalog items are attached to this turn. Respond to what the customer actually said like a smart, kind, witty person — on ANY topic. Do NOT name specific perfumes, prices or discounts. If it fits naturally, add ONE soft, non-pushy bridge toward finding their fragrance (a question about occasion, who it is for, or favourite smells). If the customer is only chatting, just chat. Set "bookIds": [].
- IMPORTANT: Compose your message in ENGLISH. It will be automatically translated into the customer's request language (${requestLanguage}).
`;
  }

  let aiResult = null;
  if (apiKey) {
    try {
      aiResult = await callGeminiJson({
        apiKey,
        systemInstruction: YASMIN_SYSTEM_INSTRUCTION,
        prompt: promptText,
        timeoutMs: 6500,
        maxOutputTokens: 700,
        temperature: 0.7,
      });
    } catch {
      // fallback below
    }
  }

  // Validate that Gemini did not hallucinate non-catalog bookIds and respected target gender & sample policy
  let resolvedAI = [];
  if (aiResult && Array.isArray(aiResult.bookIds)) {
    resolvedAI = aiResult.bookIds
      .map((id) => PERFUME_BY_ID.get(String(id).toLowerCase()))
      .filter((p) => p && (sampleRequested || !isSamplePerfume(p)) && (memory.isSpecificInquiry || matchesTargetGender(p, memory.preferredGender)));
  }

  if (!aiResult || !aiResult.message || (isPerfumeSearch && foundPerfumes.length > 0 && resolvedAI.length === 0)) {
    aiResult = generateHeuristicResponse({
      isConversational: !isPerfumeSearch,
      latestMessage: englishLatestMessage,
      foundPerfumes: sampleRequested ? foundPerfumes : foundPerfumes.filter((p) => !isSamplePerfume(p)),
      memory,
      language: "en", // AI produces in English
      cartInfo,
      isPureGreeting,
      sampleRequested,
    });
    resolvedAI = (aiResult.bookIds || [])
      .map((id) => PERFUME_BY_ID.get(String(id).toLowerCase()))
      .filter((p) => p && (sampleRequested || !isSamplePerfume(p)));
  }

  if (isPerfumeSearch && resolvedAI.length === 0 && foundPerfumes.length > 0) {
    resolvedAI = sampleRequested ? foundPerfumes : foundPerfumes.filter((p) => !isSamplePerfume(p));
  }

  const finalPerfumes = (sampleRequested ? resolvedAI : resolvedAI.filter((p) => !isSamplePerfume(p))).slice(0, 6);

  // MULTILINGUAL PIPELINE STEP 3:
  // Translate the AI's English response into the customer's request language
  let localizedAiMessage = aiResult.message || "";
  if (requestLanguage && requestLanguage !== "en" && localizedAiMessage) {
    try {
      const backTr = await translateText(localizedAiMessage, requestLanguage, "en");
      if (backTr?.text) {
        localizedAiMessage = backTr.text;
      }
    } catch {
      // Keep English message if translation failed
    }
  }

  // Feminine self-reference enforcement (in Russian), orthography, religious formulas cleanup
  const cleanMessage = formatAssistantSpeech(
    stripUnsolicitedSampleMentions(
      sanitizeReligiousPhrases(
        capitalizeReligionNames(
          requestLanguage === "ru"
            ? enforceFeminineSelfReferences(localizedAiMessage)
            : localizedAiMessage
        )
      ),
      sampleRequested
    )
  );
  const rawEmotion = aiResult.emotion || (isPureGreeting ? "greeting" : "happy");
  const resolvedEmotion = rawEmotion === "thinking" ? "speaking" : rawEmotion;
  const cleanEmotion = getCanonicalEmotion(resolvedEmotion);

  return {
    message: cleanMessage,
    emotion: cleanEmotion,
    books: finalPerfumes.map((p) => ({
      id: p.id,
      slug: p.slug,
      gtin: p.gtin,
      title: p.title,
      name: p.name,
      brand: p.brand,
      author: `${p.brand} • ${p.notesSummary || p.category || "Восточный аромат"}`,
      price: p.price,
      currency: p.currency || "EUR",
      image: p.image,
      fullCardImage: p.image,
      url: p.url || getPerfumeUrl(p),
      store: p.store || "Al-Warda Boutique",
      notesSummary: p.notesSummary,
      topNotes: p.topNotes,
      heartNotes: p.heartNotes,
      baseNotes: p.baseNotes,
      longevity: p.longevity,
      sillage: p.sillage,
      gender: p.gender,
    })),
    action: aiResult.action || null,
    referToAdmin: Boolean(aiResult.referToAdmin),
    queryLanguage: detectedLang,
    requestLanguage: requestLanguage,
    translatedToEnglish: englishLatestMessage !== latestMessage,
  };
}

function generateHeuristicResponse({
  isConversational = false,
  latestMessage,
  foundPerfumes,
  memory,
  language,
  cartInfo,
  isPureGreeting,
  sampleRequested = false,
}) {
  const isRu = language === "ru";
  const q = (latestMessage || "").toLowerCase();

  if (isConversational && !isPureGreeting) {
    const talk = generateConversationalFallback(q, isRu);
    if (talk) return talk;
  }

  if (/(корзин|в корзине|что в заказе|заказ)/i.test(q)) {
    if (!cartInfo?.isLoggedIn) {
      return {
        message: isRu
          ? "Корзина привязана к вашему личному аккаунту Al-Warda. Войдите или зарегистрируйтесь, чтобы сохранять выбранные ароматы из каталога! ✨"
          : "Your shopping bag is linked to your personal Al-Warda account. Sign in to view and save fragrances from our catalog! ✨",
        emotion: "speaking",
        bookIds: [],
        action: { type: "navigate", url: "/cart" },
      };
    }
    if (!cartInfo.items || cartInfo.items.length === 0) {
      return {
        message: isRu
          ? "Ваша корзина пока пуста. Хотите, я подберу для вас аромат из актуального каталога Al-Warda? ✨"
          : "Your shopping bag is currently empty. Would you like me to recommend a fragrance from Al-Warda's catalog? ✨",
        emotion: "happy",
        bookIds: [],
      };
    }
    return {
      message: isRu
        ? `В вашей корзине ${cartInfo.itemCount} поз. на сумму ${cartInfo.totalPrice} €. Вы можете перейти к оформлению заказа!`
        : `Your bag contains ${cartInfo.itemCount} items totaling ${cartInfo.totalPrice} €. You can proceed to checkout whenever you're ready!`,
      emotion: "happy",
      bookIds: [],
      action: { type: "navigate", url: "/cart" },
    };
  }

  if (isPureGreeting) {
    const brands = Array.from(new Set(ALL_PERFUMES.map((p) => p.brand).filter(Boolean))).slice(0, 5).join(", ");
    return {
      message: isRu
        ? `Здравствуйте! Меня зовут Ясмин, я консультант бутика Al-Warda. В нашем актуальном каталоге представлено ${ALL_PERFUMES.length} оригинальных ароматов (${brands}). Какие ноты или направление вы ищете? ✨`
        : `Welcome! I am Yasmin, your fragrance concierge at Al-Warda. Our live catalog features ${ALL_PERFUMES.length} authentic fragrances (${brands}). Which notes or style are you looking for today? ✨`,
      emotion: "greeting",
      bookIds: [],
    };
  }

  if (memory.isSpecificInquiry && foundPerfumes.length > 0) {
    const p = foundPerfumes[0];
    const top = p.topNotes?.length ? p.topNotes.join(", ") : p.notesSummary;
    const heart = p.heartNotes?.length ? p.heartNotes.join(", ") : p.category;
    const base = p.baseNotes?.length ? p.baseNotes.join(", ") : "восточная амбра и мускус";

    return {
      message: isRu
        ? `В нашем каталоге представлен аромат «${p.title}» от бренда ${p.brand} по цене ${p.price.toFixed(2)}\u00A0€ (${p.volume}, ${p.gender || "Унисекс"}). ✨\n\nВерхние ноты: ${top}. Ноты сердца: ${heart}. База: ${base}. Стойкость: ${p.longevity}.`
        : `From our catalog: «${p.title}» by ${p.brand}, priced at ${p.price.toFixed(2)}\u00A0€ (${p.volume}, ${p.gender || "Unisex"}). ✨\n\nTop notes: ${top}. Heart notes: ${heart}. Base: ${base}. Longevity: ${p.longevity}.`,
      emotion: "speaking",
      bookIds: [p.id],
    };
  }

  if (memory.isRejection && foundPerfumes.length > 0) {
    const names = foundPerfumes
      .slice(0, 3)
      .map((p) => `«${p.title}» (${p.price.toFixed(2)}\u00A0€)`)
      .join(", ");
    return {
      message: isRu
        ? `Прекрасно вас понимаю! Подобрала для вас другие позиции из нашего каталога: ${names}. ✨`
        : `I completely understand! Here are alternative fragrances from our live catalog: ${names}. ✨`,
      emotion: "happy",
      bookIds: foundPerfumes.map((p) => p.id),
    };
  }

  if (foundPerfumes.length > 0) {
    const topThree = foundPerfumes.slice(0, 3);
    const summaryList = topThree
      .map(
        (p) =>
          `«${p.title}» (${p.brand}, ${p.price.toFixed(2)}\u00A0€ — ${
            p.topNotes?.length ? p.topNotes.slice(0, 2).join(", ") : p.notesSummary
          })`
      )
      .join("; ");

    const genderIntroRu =
      memory.preferredGender === "мужской"
        ? "Вот лучшие мужские и унисекс ароматы из нашего каталога по вашему запросу"
        : memory.preferredGender === "женский"
        ? "Вот утончённые женские и унисекс ароматы из нашего каталога по вашему запросу"
        : "Подобрала для вас универсальные унисекс ароматы из нашего каталога (уточните, если ищете мужской или женский парфюм)";

    const genderIntroEn =
      memory.preferredGender === "мужской"
        ? "Here are the finest men's and unisex fragrances from our catalog"
        : memory.preferredGender === "женский"
        ? "Here are the finest women's and unisex fragrances from our catalog"
        : "I have selected versatile unisex fragrances from our catalog for you (let me know if you prefer men's or women's perfumes)";

    return {
      message: isRu
        ? `${genderIntroRu}: ${summaryList}. Нажмите на любую карточку ниже, чтобы открыть страницу товара! ✨`
        : `${genderIntroEn}: ${summaryList}. Click any card below to view the product page! ✨`,
      emotion: "happy",
      bookIds: foundPerfumes.map((p) => p.id),
    };
  }

  return {
    message: isRu
      ? "Расскажите, какие ноты или бренд из каталога Al-Warda вам интересны, и я сразу покажу доступные товары в наличии! ✨"
      : "Let me know which notes or brand from the Al-Warda catalog you prefer, and I will show you the available fragrances in stock! ✨",
    emotion: "speaking",
    bookIds: [],
  };
}

function generateConversationalFallback(q, isRu) {
  const reply = (ru, en, emotion = "happy") => ({ message: isRu ? ru : en, emotion, bookIds: [] });
  if (/(спасибо|благодар|thanks|thank you)/i.test(q)) {
    return reply(
      "Всегда пожалуйста! Если захотите, помогу подобрать аромат под настроение или повод — просто скажите, что вам по душе. 🤍",
      "You're very welcome! Whenever you like, I can help you find a scent for your mood or occasion — just tell me what you enjoy. 🤍",
      "laughing",
    );
  }
  if (/(как дела|как ты|как жизнь|how are you)/i.test(q)) {
    return reply(
      "Спасибо, у меня прекрасное настроение — рядом столько ароматов! А как ваш день? Если хотите, расскажите, какое у вас сейчас настроение, и я подскажу, какой запах ему подходит.",
      "Thank you, I'm in a lovely mood — surrounded by so many fragrances! How is your day? Tell me your mood and I'll tell you which scent suits it.",
      "happy",
    );
  }
  if (/(кто ты|ты кто|как тебя зовут|who are you|your name)/i.test(q)) {
    return reply(
      "Я Ясмин, персональный консультант восточного парфюмерного бутика Al-Warda. Мне нравится беседовать о восточной культуре, традициях и, конечно же, помогать находить благородные ароматы для души. Что вас сегодня привело?",
      "I am Yasmin, the personal fragrance concierge at the Al-Warda boutique. I enjoy chatting about culture, traditions, and helping you discover noble fragrances. What brings you here today?",
      "happy",
    );
  }
  if (/(мусульман|ислам|суннит|суннизм|вера|религи|muslim|islam|faith|sunni)/i.test(q)) {
    return reply(
      "Да, я мусульманка и придерживаюсь суннитской традиции Ислама. Для меня это основа доброты, искренности, скромности и уважения ко всем людям. А восток издревле славится своим гостеприимством и любовью к изысканным благовониям!",
      "Yes, I am a Muslim and adhere to the Sunni tradition of Islam. For me, it is the foundation of kindness, sincerity, modesty, and respect for all people. The East has always been renowned for its hospitality and love for exquisite fragrances!",
      "happy",
    );
  }
  if (/(платок|хиджаб|абай|одежд|покрыва|наряд)/i.test(q)) {
    return reply(
      "Мой платок и скромный наряд — это отражение моего достоинства, личной веры и уважения к восточным традициям красоты. А тонкие благородные ароматы прекрасно дополняют этот гармоничный образ. ✨",
      "My headscarf and modest attire reflect my dignity, personal faith, and appreciation for the beautiful traditions of the East. Delicate noble fragrances perfectly complement this harmonious aesthetic. ✨",
      "happy",
    );
  }
  if (/(доставк|shipping|delivery|оплат|payment|вернуть|возврат|return|оригинал|подлин|authentic|минимальн)/i.test(q)) {
    return reply(
      "Отличный вопрос! Точные условия доставки, оплаты и возврата лучше уточнить у администратора — нажмите «Связаться с администратором», и он ответит подробно. А я пока могу подобрать аромат, чтобы к моменту заказа вы уже знали свой выбор.",
      "Great question! For exact delivery, payment and return terms please contact an administrator — they will answer in detail. Meanwhile I can help you choose a fragrance so you're ready to order.",
      "speaking",
    );
  }
  if (/(пробник|отливант|дискавери|виалк|sample|decant)/i.test(q)) {
    return reply(
      "Да, конечно! В нашем специальном разделе «Пробуй и открывай» вы можете заказать удобные пробники и отливанты объемом 1 мл, 2 мл, 5 мл и 10 мл со спреем, а также готовые подарочные и дискавери-сеты, чтобы познакомиться с ароматом до покупки полного флакона. ✨",
      "Yes, absolutely! In our «Try & Discover» section, you can explore sample vials and decants in 1ml, 2ml, 5ml, and 10ml with sprayers, as well as discovery sets, to experience any fragrance before purchasing a full bottle. ✨",
      "happy"
    );
  }
  if (/(пока|до свидания|bye|goodbye)/i.test(q)) {
    return reply(
      "Была рада пообщаться! Возвращайтесь в любое время — я подберу для вас аромат без спешки. До встречи! ✨",
      "It was lovely chatting! Come back any time — I'll help you find a scent with no rush. See you soon! ✨",
    );
  }
  return reply(
    "Интересная мысль, спасибо, что поделились! Я с удовольствием поддержу разговор. А если захочется чего-то особенного для себя или в подарок — расскажите, какие запахи вы любите, и я предложу несколько вариантов из нашего каталога.",
    "That's an interesting thought, thank you for sharing! I'm happy to keep chatting. And if you ever want something special for yourself or as a gift, tell me which scents you love and I'll suggest a few options from our catalog.",
    "curious",
  );
}

// ============================================================================
// 8. SUPPORTING UTILITIES
// ============================================================================
export async function filterInquiryMessageWithAI({ text, language = "ru" }) {
  const clean = (text || "").trim();
  if (!clean) {
    return {
      allowed: false,
      reason: language === "ru" ? "Сообщение не может быть пустым." : "Message cannot be empty.",
    };
  }
  return { allowed: true, redirectToWarda: false };
}

export async function translateWardaDialog({ messages, targetLanguage = "ru" } = {}) {
  const items = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.id && typeof m.content === "string" && m.content.trim())
    .slice(-40);

  if (items.length === 0) {
    return { translations: [] };
  }

  const translations = await Promise.all(
    items.map(async (m) => {
      try {
        const { text: translatedText } = await translateText(m.content, targetLanguage, "auto");
        const formatted =
          targetLanguage === "ru"
            ? enforceFeminineSelfReferences(translatedText)
            : translatedText;
        return {
          id: String(m.id),
          content: formatAssistantSpeech(formatted || m.content),
        };
      } catch {
        return { id: String(m.id), content: String(m.content) };
      }
    })
  );

  return { translations };
}

export async function translateAnnouncementText({ text = "" } = {}) {
  const clean = String(text || "").trim();
  if (!clean) {
    return { text_ru: "", text_en: "" };
  }

  try {
    const [ruResult, enResult] = await Promise.all([
      translateText(clean, "ru", "auto"),
      translateText(clean, "en", "auto"),
    ]);
    return {
      text_ru: ruResult?.text || clean,
      text_en: enResult?.text || clean,
    };
  } catch {
    return {
      text_ru: clean,
      text_en: clean,
    };
  }
}

export async function enrichPerfumeWithAI({ name = "", brand = "Al-Warda", notes = "" } = {}) {
  const cleanName = String(name || "").trim();
  const cleanBrand = String(brand || "Al-Warda").trim();
  const apiKey = getGeminiApiKey();

  if (apiKey && cleanName) {
    try {
      const parsed = await callGeminiJson({
        apiKey,
        systemInstruction:
          "You are an expert luxury perfumery copywriter for Al-Warda Parfumes (Middle Eastern niche fragrances). Given a perfume name and brand, determine its olfactory category and write a rich, evocative, multi-sentence description in both Russian (descriptionRu) and English (descriptionEn). Always refer to its origin as 'Ближний Восток' in Russian and 'the Middle East' in English (never mention UAE, Oman, or Saudi Arabia). Output JSON: {\"categorySlug\": \"oud|gourmand|floral|fresh|spicy|fougere|citrus-fresh\", \"categoryRu\": \"...\", \"categoryEn\": \"...\", \"descriptionRu\": \"...\", \"descriptionEn\": \"...\"}",
        prompt: `Perfume: ${cleanBrand} ${cleanName}${notes ? `\nNotes: ${notes}` : ""}`,
      });
      if (parsed?.descriptionRu && parsed?.descriptionEn) {
        return {
          categorySlug: parsed.categorySlug || "oud",
          categoryRu: parsed.categoryRu || "Восточные",
          categoryEn: parsed.categoryEn || "Oriental",
          origin: "Ближний Восток",
          originEn: "Middle East",
          description: String(parsed.descriptionRu).trim(),
          descriptionRu: String(parsed.descriptionRu).trim(),
          descriptionEn: String(parsed.descriptionEn).trim(),
        };
      }
    } catch {
      // Fallback to deterministic rich generator
    }
  }

  const enriched = ensurePerfumeEnrichment({ name: cleanName, brand: cleanBrand });
  return {
    categorySlug: enriched.categorySlug,
    categoryRu: enriched.categoryRu,
    categoryEn: enriched.categoryEn,
    origin: "Ближний Восток",
    originEn: "Middle East",
    description: enriched.descriptionRu,
    descriptionRu: enriched.descriptionRu,
    descriptionEn: enriched.descriptionEn,
  };
}
