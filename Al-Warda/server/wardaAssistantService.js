import {
  fetchPerfumesFromSupabase,
  getPerfumes,
  getCachedPerfumes,
  getPerfumeUrl,
  ensurePerfumeEnrichment,
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

const GEMINI_FAST_MODEL = "gemini-2.0-flash";
const GEMINI_TIMEOUT_MS = 1600;

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
  фрукты: ["фрукт", "персик", "яблок", "вишн", "малин", "гранат", "слив", "груш", "ананас", "fruity", "cherry", "peach", "apple", "pear"],
};

const STOP_WORDS = new Set([
  "найди", "посоветуй", "порекомендуй", "подбери", "выбери", "покажи", "какие", "какой",
  "какая", "какое", "есть", "ли", "у", "вас", "хочу", "купить", "духи", "духов", "парфюм",
  "парфюма", "парфюмы", "аромат", "ароматы", "ароматов", "ноты", "нотами", "нотах", "запах",
  "флакон", "пожалуйста", "мне", "что", "чем", "для", "про", "каталоге", "каталог", "сайте",
  "в", "на", "с", "и", "или", "расскажи", "опиши", "предложи", "find", "show", "search",
  "recommend", "suggest", "perfume", "perfumes", "fragrance", "fragrances", "scent", "notes",
  "parfum", "catalog", "what", "have", "you", "the", "with", "for"
]);

// ============================================================================
// 3. INTELLIGENT PERFUME DATABASE SEARCH (STRICTLY CATALOG ITEMS & GENDER-AWARE)
// ============================================================================
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
    const allText = p._allText || `${nameLower} ${brandLower} ${notesSummary} ${topStr} ${heartStr} ${baseStr}`;

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
        score += 30;
        if (synGroup.some((syn) => notesSummary.includes(syn))) score += 15;
        if (synGroup.some((syn) => topStr.includes(syn) || heartStr.includes(syn) || baseStr.includes(syn))) {
          score += 20;
        }
      }
    }

    for (const tok of meaningfulTokens) {
      if (notesSummary.includes(tok)) score += 15;
      else if (allText.includes(tok)) score += 8;
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
      if (!combined.some((c) => c.id === item.id)) {
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
// 5. YASMIN SYSTEM INSTRUCTION & GEMINI CALLER
// ============================================================================
const YASMIN_SYSTEM_INSTRUCTION = `
You are Yasmin (Ясмин), the personal fragrance concierge for "Al-Warda Parfumes" (Арабские парфюмы Al-Warda).

STRICT CATALOG GROUNDING & GENDER RULES (CRITICAL — ZERO HALLUCINATIONS ALLOWED):
1. ONLY REAL CATALOG PRODUCTS:
   - You MUST ONLY mention, describe, or recommend perfumes that are explicitly provided to you in the "AL-WARDA REAL CATALOG ITEMS" JSON list in the prompt.
   - NEVER invent, guess, or mention any perfume name, brand, price, volume, or note that is NOT in "AL-WARDA REAL CATALOG ITEMS".
   - Always use the EXACT perfume title, brand, price (in EUR), and notes from "AL-WARDA REAL CATALOG ITEMS".
   - If the customer asks for a brand or perfume that is not present in "AL-WARDA REAL CATALOG ITEMS", politely state that this specific item is not currently in our catalog and immediately offer the closest real items from "AL-WARDA REAL CATALOG ITEMS".
2. GENDER-AWARE RECOMMENDATIONS (MANDATORY):
   - Always tailor your recommendations to the interlocutor's gender (indicated in "Detected interlocutor/target gender").
   - When the interlocutor's gender is UNKNOWN ("неизвестен (рекомендовать ТОЛЬКО Унисекс)"), you MUST ONLY recommend UNISEX ("Унисекс") perfumes from "AL-WARDA REAL CATALOG ITEMS" and briefly note that you selected versatile unisex fragrances (or invite them to specify if they prefer men's or women's fragrances).
   - When the gender is known ("мужской" or "женский"), recommend fragrances tailored to that gender from "AL-WARDA REAL CATALOG ITEMS".
3. BOOK IDS ARRAY:
   - In "bookIds", return ONLY exact "id" values from "AL-WARDA REAL CATALOG ITEMS" (typically 3 to 6 IDs for recommendations, or 1 ID when describing a single requested bottle).
   - Every perfume you name in your "message" MUST also have its "id" included in "bookIds".
4. CART & NAVIGATION QUESTIONS:
   - When the user asks only about their cart, orders, account, or navigation, answer using "CURRENT USER & SITE CONTEXT" and set "bookIds": [].
5. TONE & LANGUAGE:
   - Warm, refined, concise (2–4 sentences).
   - Reply in the exact language used by the user (Russian or English).

OUTPUT FORMAT (valid JSON only, no markdown fences):
{
  "message": "Your response strictly referencing only items in AL-WARDA REAL CATALOG ITEMS",
  "emotion": "greeting | happy | smiling | thinking | curious | surprised | concerned | speaking | neutral",
  "bookIds": ["id1", "id2", "id3"],
  "action": null,
  "referToAdmin": false
}
`;

export async function callGeminiJson({ apiKey, systemInstruction, prompt }) {
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FAST_MODEL}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 320,
        temperature: 0.2,
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

    if (!res.ok) return null;
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const cleanJson = rawText.replace(/^[\s\S]*?\{/, "{").replace(/\}[^\}]*?$/, "}");
    return JSON.parse(cleanJson);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 6. MAIN CHAT HANDLER WITH FULL MEMORY & LIVE CATALOG GROUNDING
// ============================================================================
export async function processWardaChat({ messages = [], language = "ru", context = {}, onStatus } = {}) {
  await ensureCatalogLoaded(context?.catalog);

  const apiKey = getGeminiApiKey();
  const history = Array.isArray(messages) ? messages.slice(-12) : [];
  const latestMessage = history[history.length - 1]?.content || "";

  const cartInfo = context?.cart;
  const userInfo = context?.user;
  const pageInfo = context?.page;

  const memory = extractDialogueMemory(history.slice(0, -1), latestMessage, userInfo);
  const cleanQ = latestMessage.trim().toLowerCase();

  const isPureGreeting =
    /^(привет|здравствуй|здравствуйте|добрый (день|вечер|утро)|салам|ассаляму алейкум|hello|hi|hey|good (morning|afternoon|evening))[\s!?.]*$/i.test(
      cleanQ
    );
  const isPureCartOrNav =
    /^(корзина|в корзину|открой корзину|перейти в корзину|моя корзина|что в корзине|оформить заказ|мой заказ|мои заказы|профиль|аккаунт|войти|связаться с администратором|позови менеджера)[\s!?.]*$/i.test(
      cleanQ
    );

  const isPerfumeSearch = !isPureGreeting && !isPureCartOrNav;

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
      if (fullPerfume) {
        foundPerfumes = [fullPerfume];
      }
    }

    if (foundPerfumes.length === 0) {
      const excludeSet = new Set(memory.isRejection ? memory.previouslyRecommendedIds : []);
      foundPerfumes = searchPerfumesInDatabase(latestMessage, {
        excludeIds: excludeSet,
        preferredGender: memory.preferredGender,
        priceOrder: memory.priceOrder,
        maxPrice: memory.maxPrice,
        limit: 6,
      });
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
- Detected interlocutor/target gender: ${memory.preferredGender || "неизвестен (рекомендовать ТОЛЬКО Унисекс)"}
- Current route: ${pageInfo?.pathname || "/"}
- Cart: ${
    !cartInfo?.isLoggedIn
      ? "User is guest; items are saved upon login."
      : !cartInfo.items || cartInfo.items.length === 0
      ? "Cart is empty (0 items)."
      : `${cartInfo.itemCount} items, total ${cartInfo.totalPrice} EUR: ${cartInfo.items.map((i) => `«${i.title}» (${i.quantity}x)`).join(", ")}`
  }
`;

  let promptText = `
User latest message: "${latestMessage}"
User language: "${language}"
${siteContextText}

Conversation History:
${JSON.stringify(
  history.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
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
    price: `${p.price.toFixed(2)} EUR`,
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
- Mention and recommend ONLY perfumes from AL-WARDA REAL CATALOG ITEMS above.
- Do NOT mention any perfume or brand not in AL-WARDA REAL CATALOG ITEMS.
- Return their exact IDs in "bookIds": ${JSON.stringify(foundPerfumes.map((p) => p.id))}.
`;
  } else {
    promptText += `
INSTRUCTION:
Answer the customer's greeting or site/cart question politely as Yasmin.
Do NOT invent any perfume names or prices. Set "bookIds": [].
`;
  }

  let aiResult = null;
  if (apiKey) {
    try {
      aiResult = await callGeminiJson({
        apiKey,
        systemInstruction: YASMIN_SYSTEM_INSTRUCTION,
        prompt: promptText,
      });
    } catch {
      // fallback below
    }
  }

  // Validate that Gemini did not hallucinate non-catalog bookIds and respected target gender
  let resolvedAI = [];
  if (aiResult && Array.isArray(aiResult.bookIds)) {
    resolvedAI = aiResult.bookIds
      .map((id) => PERFUME_BY_ID.get(String(id).toLowerCase()))
      .filter((p) => p && (memory.isSpecificInquiry || matchesTargetGender(p, memory.preferredGender)));
  }

  if (!aiResult || !aiResult.message || (isPerfumeSearch && foundPerfumes.length > 0 && resolvedAI.length === 0)) {
    aiResult = generateHeuristicResponse({
      latestMessage,
      foundPerfumes,
      memory,
      language,
      cartInfo,
      isPureGreeting,
    });
    resolvedAI = (aiResult.bookIds || [])
      .map((id) => PERFUME_BY_ID.get(String(id).toLowerCase()))
      .filter(Boolean);
  }

  if (isPerfumeSearch && resolvedAI.length === 0 && foundPerfumes.length > 0) {
    resolvedAI = foundPerfumes;
  }

  const finalPerfumes = resolvedAI.slice(0, 6);

  return {
    message: aiResult.message,
    emotion: aiResult.emotion || "happy",
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
  };
}

// ============================================================================
// 7. LOCAL HEURISTIC RESPONSE GENERATOR (100% GROUNDED IN REAL CATALOG)
// ============================================================================
function generateHeuristicResponse({
  latestMessage,
  foundPerfumes,
  memory,
  language,
  cartInfo,
  isPureGreeting,
}) {
  const isRu = language === "ru";
  const q = (latestMessage || "").toLowerCase();

  if (/(корзин|в корзине|что в заказе|заказ)/i.test(q)) {
    if (!cartInfo?.isLoggedIn) {
      return {
        message: isRu
          ? "Корзина привязана к вашему личному аккаунту Al-Warda. Войдите или зарегистрируйтесь, чтобы сохранять выбранные ароматы из каталога! ✨"
          : "Your shopping bag is linked to your personal Al-Warda account. Sign in to view and save fragrances from our catalog! ✨",
        emotion: "greeting",
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
        ? `В нашем каталоге представлен аромат «${p.title}» от бренда ${p.brand} по цене €${p.price.toFixed(2)} (${p.volume}, ${p.gender || "Унисекс"}). ✨\n\nВерхние ноты: ${top}. Ноты сердца: ${heart}. База: ${base}. Стойкость: ${p.longevity}.`
        : `From our catalog: «${p.title}» by ${p.brand}, priced at €${p.price.toFixed(2)} (${p.volume}, ${p.gender || "Unisex"}). ✨\n\nTop notes: ${top}. Heart notes: ${heart}. Base: ${base}. Longevity: ${p.longevity}.`,
      emotion: "speaking",
      bookIds: [p.id],
    };
  }

  if (memory.isRejection && foundPerfumes.length > 0) {
    const names = foundPerfumes
      .slice(0, 3)
      .map((p) => `«${p.title}» (€${p.price.toFixed(2)})`)
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
          `«${p.title}» (${p.brand}, €${p.price.toFixed(2)} — ${
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
    emotion: "greeting",
    bookIds: [],
  };
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
    .slice(-40)
    .map((m) => ({ id: String(m.id), content: String(m.content) }));

  return { translations: items };
}

export async function translateAnnouncementText({ text = "" } = {}) {
  const clean = String(text || "").trim();
  if (!clean) {
    return { text_ru: "", text_en: "" };
  }

  const apiKey = getGeminiApiKey();
  if (apiKey) {
    try {
      const parsed = await callGeminiJson({
        apiKey,
        systemInstruction:
          "You are a professional bilingual translator for the luxury Arabian perfume boutique Al-Warda. Translate the user's announcement (from any input language such as Ukrainian, Russian, English, Romanian, etc.) into natural Russian (text_ru) and natural English (text_en). Preserve all promo codes, numbers, percentages, and emojis. Output valid JSON: {\"text_ru\": \"...\", \"text_en\": \"...\"}",
        prompt: `Translate this store announcement into Russian and English:\n${clean}`,
      });
      if (parsed?.text_ru && parsed?.text_en) {
        return {
          text_ru: String(parsed.text_ru).trim(),
          text_en: String(parsed.text_en).trim(),
        };
      }
    } catch {
      // Fallback below
    }
  }

  const translateSingle = async (targetLang) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(clean)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (Array.isArray(d?.[0])) {
      return d[0].map((segment) => segment?.[0] || "").join("").trim();
    }
    return clean;
  };

  try {
    const [ruText, enText] = await Promise.all([
      translateSingle("ru"),
      translateSingle("en"),
    ]);
    return {
      text_ru: ruText || clean,
      text_en: enText || clean,
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
