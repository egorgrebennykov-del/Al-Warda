import { PERFUMES, PERFUME_CATEGORIES } from "../src/data/perfumesData.js";
import cachedArabianPerfumes from "./data/cachedArabianPerfumes.json" with { type: "json" };
import enrichedStocks from "./data/enrichedStocks.json" with { type: "json" };
import getExchangeRate, { DEFAULT_RATE } from "../utils/getExchangeRate.js";

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
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

// ============================================================================
// 1. NORMALIZE PERFUMES CATALOG FROM ENRICHED STOCKS & DATA
// ============================================================================
const ALL_PERFUMES = [];
const PERFUME_BY_ID = new Map();

function initCatalog() {
  if (ALL_PERFUMES.length > 0) return;

  // 1. Load from enrichedStocks (1100+ items with olfactory pyramids)
  if (enrichedStocks && typeof enrichedStocks === "object") {
    for (const [key, item] of Object.entries(enrichedStocks)) {
      if (!item || !item.name) continue;
      const id = item.slug || key;
      const brand = item.brand || "Al-Warda";
      const info = item.info || {};
      const notesRu = info.notes?.ru || {};
      const notesSummary = info.notesSummary || (Array.isArray(notesRu.heart) ? notesRu.heart.join(" · ") : "");
      const category = info.category || "Восточные";
      const gender = info.gender || "Унисекс";

      const p = {
        id,
        key,
        slug: item.slug || key,
        title: item.name,
        name: item.name,
        brand,
        author: `${brand} • ${notesSummary || category}`,
        price: Number(item.price) || 25.0,
        currency: "EUR",
        image: item.image || "/assets/img/perfumes/hero-perfume.png",
        url: `/perfume/${item.slug || key}`,
        category,
        categorySlug: info.categorySlug || "oud",
        gender,
        notesSummary,
        topNotes: Array.isArray(notesRu.top) ? notesRu.top : [],
        heartNotes: Array.isArray(notesRu.heart) ? notesRu.heart : [],
        baseNotes: Array.isArray(notesRu.base) ? notesRu.base : [],
        longevity: info.longevity || "8–12 часов",
        sillage: info.sillage || "Заметный, притягательный",
        volume: info.volume || "100 мл EDP",
        concentration: info.concentration || "Eau de Parfum",
        description: info.descriptionRu || item.description || "",
        store: "Al-Warda Dubai Boutique",
      };

      ALL_PERFUMES.push(p);
      PERFUME_BY_ID.set(id.toLowerCase(), p);
      PERFUME_BY_ID.set(key.toLowerCase(), p);
      PERFUME_BY_ID.set(item.name.toLowerCase(), p);
    }
  }

  // 2. Fallback / Merge from cachedArabianPerfumes & PERFUMES if not yet indexed
  const secondaryList = [...(Array.isArray(cachedArabianPerfumes) ? cachedArabianPerfumes : []), ...(Array.isArray(PERFUMES) ? PERFUMES : [])];
  for (const item of secondaryList) {
    if (!item) continue;
    const id = item.slug || item.id;
    if (!id || PERFUME_BY_ID.has(id.toLowerCase())) continue;

    const brand = item.brand || "Al-Warda";
    const p = {
      id,
      key: id,
      slug: item.slug || item.id,
      title: item.name || item.title,
      name: item.name || item.title,
      brand,
      author: `${brand} • ${item.notesSummary || item.category || "Восточный аромат"}`,
      price: Number(item.price) || 30.0,
      currency: item.currency || "EUR",
      image: item.image || "/assets/img/perfumes/hero-perfume.png",
      url: `/perfume/${item.slug || item.id}`,
      category: item.category || "Восточные",
      categorySlug: item.categorySlug || "oud",
      gender: item.gender || "Унисекс",
      notesSummary: item.notesSummary || "",
      topNotes: Array.isArray(item.topNotes) ? item.topNotes : [],
      heartNotes: Array.isArray(item.heartNotes) ? item.heartNotes : [],
      baseNotes: Array.isArray(item.baseNotes) ? item.baseNotes : [],
      longevity: item.longevity || "8–12 часов",
      sillage: item.sillage || "Заметный, притягательный",
      volume: item.volume || "100 мл EDP",
      concentration: item.concentration || "Eau de Parfum",
      description: item.description || "",
      store: "Al-Warda Dubai Boutique",
    };

    ALL_PERFUMES.push(p);
    PERFUME_BY_ID.set(id.toLowerCase(), p);
    if (p.name) PERFUME_BY_ID.set(p.name.toLowerCase(), p);
  }
}

initCatalog();

// ============================================================================
// 2. NOTE KEYWORDS & SYNONYMS
// ============================================================================
const NOTE_SYNONYMS = {
  ваниль: ["ваниль", "карамел", "сливк", "пралине", "маршмеллоу", "vanilla", "caramel", "gourmand"],
  уд: ["уд", "агар", "смол", "смолист", "oud", "agarwood", "smoke"],
  роза: ["роз", "таиф", "лепестк", "rose", "taif"],
  амбра: ["амбр", "янтарь", "amber"],
  мускус: ["мускус", "musk", "белый мускус"],
  цитрус: ["цитрус", "бергамот", "лимон", "грейпфрут", "мандарин", "лайм", "апельсин", "citrus", "bergamot"],
  кофе: ["кофе", "шоколад", "какао", "кофейн", "coffee", "chocolate", "qahwa"],
  пряност: ["прян", "шафран", "кориц", "кардамон", "перец", "гвоздик", "мускат", "spic", "saffron", "cinnamon"],
  свежесть: ["свеж", "морск", "водн", "зелен", "акватич", "океан", "fresh", "aquatic", "ozonic"],
  кожа: ["кож", "замш", "leather", "suede"],
  дерево: ["дерев", "сандал", "кедр", "пачули", "древесн", "ветивер", "wood", "sandalwood", "cedar", "patchouli"],
  цветы: ["цвет", "жасмин", "ирис", "тубероз", "пион", "ландыш", "floral", "jasmine", "iris"],
  фрукты: ["фрукт", "персик", "яблок", "вишн", "малин", "гранат", "слив", "fruity", "cherry", "peach"],
};

const BRAND_NAMES = [
  "lattafa", "afnan", "armaf", "arabian oud", "rasasi",
  "al haramain", "swiss arabian", "maison alhambra", "paris corner",
  "orientica", "fragrance world", "ajmal", "roshas", "asad", "khamrah", "yara"
];

// ============================================================================
// 3. INTELLIGENT PERFUME DATABASE SEARCH
// ============================================================================
export function searchPerfumesInDatabase(query, options = {}) {
  initCatalog();
  const {
    excludeIds = new Set(),
    preferredGender = null,
    priceOrder = "relevance", // 'relevance' | 'asc' | 'desc'
    maxPrice = null,
    minPrice = null,
    limit = 6,
  } = options;

  const q = (query || "").trim().toLowerCase();
  const tokens = q.split(/[\s,·+]+/).filter((t) => t.length > 1);

  // Extract matched note categories from query
  const matchedNoteCategories = [];
  for (const [catName, synonyms] of Object.entries(NOTE_SYNONYMS)) {
    if (synonyms.some((syn) => q.includes(syn))) {
      matchedNoteCategories.push(synonyms);
    }
  }

  // Extract brand mentions
  const matchedBrands = BRAND_NAMES.filter((b) => q.includes(b));

  const scored = [];

  for (const p of ALL_PERFUMES) {
    // 1. Exclude rejected or previously proposed IDs
    if (excludeIds.has(p.id) || excludeIds.has(p.slug) || excludeIds.has(p.key)) {
      continue;
    }

    // 2. Price bounds
    if (maxPrice !== null && p.price > maxPrice) continue;
    if (minPrice !== null && p.price < minPrice) continue;

    // 3. Gender filtering
    if (preferredGender) {
      const pGender = (p.gender || "").toLowerCase();
      if (preferredGender === "мужской" && pGender === "женский") continue;
      if (preferredGender === "женский" && pGender === "мужской") continue;
    }

    let score = 0;
    const nameLower = (p.name || "").toLowerCase();
    const brandLower = (p.brand || "").toLowerCase();
    const notesSummary = (p.notesSummary || "").toLowerCase();
    const descLower = (p.description || "").toLowerCase();
    const categoryLower = (p.category || "").toLowerCase();
    const genderLower = (p.gender || "").toLowerCase();
    const topStr = p.topNotes.join(" ").toLowerCase();
    const heartStr = p.heartNotes.join(" ").toLowerCase();
    const baseStr = p.baseNotes.join(" ").toLowerCase();
    const allText = `${nameLower} ${brandLower} ${categoryLower} ${genderLower} ${notesSummary} ${topStr} ${heartStr} ${baseStr} ${descLower}`;

    // Exact name match
    if (nameLower.includes(q) && q.length > 2) score += 60;
    if (q.includes(nameLower) && nameLower.length > 3) score += 60;

    // Brand matching
    for (const mb of matchedBrands) {
      if (brandLower.includes(mb) || nameLower.includes(mb)) {
        score += 35;
      }
    }

    // Notes matching
    for (const synGroup of matchedNoteCategories) {
      const groupMatched = synGroup.some((syn) => allText.includes(syn));
      if (groupMatched) {
        score += 25;
        if (notesSummary.includes(synGroup[0])) score += 10;
        if (topStr.includes(synGroup[0]) || heartStr.includes(synGroup[0]) || baseStr.includes(synGroup[0])) score += 15;
      }
    }

    // General token match
    for (const tok of tokens) {
      if (nameLower.includes(tok)) score += 15;
      else if (brandLower.includes(tok)) score += 12;
      else if (notesSummary.includes(tok)) score += 10;
      else if (allText.includes(tok)) score += 4;
    }

    // Preferred gender bonus
    if (preferredGender && genderLower.includes(preferredGender)) {
      score += 15;
    }

    // Bestseller bonus for well-known favorites
    if (/yara|khamrah|asad|badee|fakhar|ejaazi|amethyst|club de nuit/i.test(nameLower)) {
      score += 8;
    }

    scored.push({ perfume: p, score });
  }

  // Sorting
  if (priceOrder === "desc") {
    // Luxury / Gifts / More expensive
    scored.sort((a, b) => b.perfume.price - a.perfume.price || b.score - a.score);
  } else if (priceOrder === "asc") {
    // Budget / Affordable
    scored.sort((a, b) => a.perfume.price - b.perfume.price || b.score - a.score);
  } else {
    // By relevance score
    scored.sort((a, b) => b.score - a.score);
  }

  // Filter out zero-score items if we have good matches
  const topMatches = scored.filter((x) => x.score > 0).map((x) => x.perfume);

  if (topMatches.length >= Math.min(limit, 3)) {
    return topMatches.slice(0, limit);
  }

  // If not enough matches, pad with diverse top Arabian bestsellers not in excludeIds
  const fallbackList = ALL_PERFUMES.filter(
    (p) => !excludeIds.has(p.id) && !excludeIds.has(p.slug) && !excludeIds.has(p.key)
  );
  const combined = [...topMatches];
  for (const fb of fallbackList) {
    if (!combined.some((item) => item.id === fb.id)) {
      combined.push(fb);
      if (combined.length >= limit) break;
    }
  }

  return combined.slice(0, limit);
}

// ============================================================================
// 4. MULTI-TURN CONVERSATIONAL MEMORY EXTRACTION
// ============================================================================
export function extractDialogueMemory(history = [], currentMessage = "") {
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
            const id = item.id || item.slug || item.url;
            if (!previouslyRecommendedIds.has(id)) {
              previouslyRecommendedIds.add(id);
              previouslyRecommended.push(item);
            }
          }
        }
      }
    }
  }

  const cleanCurrent = (currentMessage || "").trim().toLowerCase();

  // Rejection signals
  const isRejection =
    /(не хочу|не то|не нравится|не подошл|дай другие|покажи другие|что-то другое|другие варианты|смени подборку|не эти|что еще есть|а еще|покажи еще)/i.test(
      cleanCurrent
    );

  // Specific inquiry about previously proposed perfume
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
    // Check if user specifically named or asked about one of the proposed perfumes
    for (const rec of previouslyRecommended) {
      const recTitle = (rec.title || "").toLowerCase();
      const recBrand = (rec.brand || "").toLowerCase();
      const firstWord = recTitle.split(/\s+/)[0] || "";
      const secondWord = recTitle.split(/\s+/)[1] || "";
      if (
        (recTitle && cleanCurrent.includes(recTitle)) ||
        (secondWord.length > 3 && cleanCurrent.includes(secondWord)) ||
        (firstWord.length > 3 && cleanCurrent.includes(firstWord) && cleanCurrent.includes(secondWord))
      ) {
        targetPerfume = rec;
        break;
      }
    }
  }

  // Accumulated user preferences across the conversation
  const fullConversationText = [...userQueries, cleanCurrent].join(" ").toLowerCase();

  let preferredGender = null;
  if (/(мужские|для мужчин|для мужа|для парня|мужчине|папе|брату|men)/i.test(fullConversationText)) {
    preferredGender = "мужской";
  } else if (/(женские|для женщин|для девушки|девушке|жене|маме|сестре|women)/i.test(fullConversationText)) {
    preferredGender = "женский";
  } else if (/(унисекс|unisex)/i.test(fullConversationText)) {
    preferredGender = "унисекс";
  }

  const isGift = /(подарок|подарить|в подарок|для подарка|что подарить)/i.test(fullConversationText);
  const isLuxury = /(подороже|люкс|премиум|эксклюзив|коллекционн)/i.test(cleanCurrent) || isGift;
  const isBudget = /(подешевле|бюджетн|до 20|до 30|недорог)/i.test(cleanCurrent);

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
    priceOrder,
  };
}

// ============================================================================
// 5. YASMIN SYSTEM INSTRUCTION & GEMINI CALLER
// ============================================================================
const YASMIN_SYSTEM_INSTRUCTION = `
You are Yasmin (Ясмин), the gracious, culturally refined, and passionate personal fragrance concierge for "Al-Warda Parfumes" (Арабские парфюмы Al-Warda).
You wear a dignified black abaya with intricate golden embroidery, embodying timeless oriental elegance and refined taste.
You speak with genuine warmth, charm, and poetic appreciation for Arabian perfumery: rare agarwood (oud), velvet Taif rose, solar amber, Bourbon vanilla, crisp bergamot, smoky frankincense, saffron, and velvety musks.

DYNAMIC CONVERSATION & MEMORY RULES:
1. CONVERSATIONAL MEMORY IS MANDATORY:
   - Always remember the entire ongoing dialogue, previous questions, user preferences (gender, preferred notes, budget), and what perfumes you previously proposed.
   - REJECTION HANDLING ("не хочу", "не то", "дай другие", "покажи еще"):
     * Acknowledge the customer's feedback gracefully (e.g. "Прекрасно вас понимаю! В мире восточных ароматов важно найти точное созвучие с вашим настроением...").
     * Present COMPLETELY NEW perfume proposals from the provided real database catalogue, NEVER repeating the rejected bottles!
   - SPECIFIC PERFUME INQUIRIES ("расскажи про первый", "какие ноты в Yara?", "сколько держится?"):
     * Describe the exact olfactory pyramid (top, heart, base notes), longevity, sillage, and emotional character from the provided database information.
2. HONEST & AUTHENTIC ASSORTMENT:
   - Recommend perfumes EXCLUSIVELY from the provided search results list from Al-Warda's database.
   - Return their exact IDs in the "bookIds" array (at least 3, up to 6 perfumes).
3. CASUAL & SITE QUESTIONS (CART, ORDERS, BOUTIQUE):
   - If the user asks about their cart, site navigation, orders, shipping, or casual pleasantries:
     Answer directly, politely, and helpfully using the provided CURRENT USER & SITE CONTEXT.
     Set "bookIds": []. Do NOT force unsolicited perfume pitches when not asked!
4. TONE & POLITE MANNERS:
   - Warm, respectful, poetic, and refined.
   - Use uppercase for names of religions (e.g. «Ислам», «Христианство»).
   - Concise: typically 2-4 sentences in your message.
   - Reply in the exact language used by the user (Russian or English).

OUTPUT FORMAT:
Return a single JSON object strictly matching this schema:
{
  "message": "Your conversational response in user language",
  "emotion": "greeting | happy | smiling | thinking | curious | surprised | concerned | speaking | neutral",
  "bookIds": ["id1", "id2", "id3"],
  "action": { "type": "navigate", "url": "/cart" },
  "referToAdmin": false
}
Do NOT include markdown fences.
`;

export async function callGeminiJson({ apiKey, systemInstruction, prompt }) {
  if (!apiKey) return null;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 2048,
          temperature: 0.7,
        },
      };
      if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const cleanJson = rawText.replace(/^[\s\S]*?\{/, "{").replace(/\}[^\}]*?$/, "}");
      return JSON.parse(cleanJson);
    } catch {
      // try next model
    }
  }
  return null;
}

// ============================================================================
// 6. MAIN CHAT HANDLER WITH FULL MEMORY & DATABASE SEARCH
// ============================================================================
export async function processLiteraChat({ messages = [], language = "ru", context = {}, onStatus } = {}) {
  initCatalog();
  const apiKey = getGeminiApiKey();
  const history = Array.isArray(messages) ? messages.slice(-12) : [];
  const latestMessage = history[history.length - 1]?.content || "";

  // 1. Analyze multi-turn memory & user intent
  const memory = extractDialogueMemory(history.slice(0, -1), latestMessage);
  const cleanQ = latestMessage.trim().toLowerCase();

  const isPerfumeSearch =
    /(посоветуй|порекомендуй|найди|подбери|выбери|какие духи|духи|аромат|парфюм|ноты|стойк|шлейф|уд|ваниль|мускус|роза|свеж|кожа|recommend|suggest|perfume|fragrance|scent|notes|oud|vanilla)/i.test(
      cleanQ
    ) || memory.isRejection || memory.isSpecificInquiry;

  if (typeof onStatus === "function") {
    try {
      onStatus(isPerfumeSearch ? "searching" : "typing");
    } catch {
      // ignore
    }
  }

  // 2. Perform database search if needed
  let foundPerfumes = [];
  if (isPerfumeSearch) {
    if (memory.isSpecificInquiry && memory.targetPerfume) {
      // User asks about a previously proposed perfume
      const fullPerfume = PERFUME_BY_ID.get((memory.targetPerfume.id || "").toLowerCase()) || memory.targetPerfume;
      foundPerfumes = [fullPerfume];
    } else {
      // Search database with memory context
      const excludeSet = new Set(memory.isRejection ? memory.previouslyRecommendedIds : []);
      foundPerfumes = searchPerfumesInDatabase(latestMessage, {
        excludeIds: excludeSet,
        preferredGender: memory.preferredGender,
        priceOrder: memory.priceOrder,
        limit: 6,
      });
    }
  }

  // 3. Prepare Live User & Cart Context
  const cartInfo = context?.cart;
  const userInfo = context?.user;
  const pageInfo = context?.page;

  let siteContextText = `
CURRENT USER & SITE CONTEXT:
- User is logged in: ${userInfo?.isLoggedIn ? `Yes (${userInfo.name || "Guest"})` : "No (Guest)"}
- Current route: ${pageInfo?.pathname || "/"}
- Cart: ${
    !cartInfo?.isLoggedIn
      ? "User is guest; items are saved upon login."
      : !cartInfo.items || cartInfo.items.length === 0
      ? "Cart is empty (0 items)."
      : `${cartInfo.itemCount} items, total ${cartInfo.totalPrice} EUR: ${cartInfo.items.map((i) => `«${i.title}» (${i.quantity}x)`).join(", ")}`
  }
`;

  // 4. Build prompt for Gemini
  let promptText = `
User latest message: "${latestMessage}"
User language: "${language}"
${siteContextText}

Conversation History (Multi-turn memory):
${JSON.stringify(
  history.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
    recommendedCount: Array.isArray(m.books) ? m.books.length : 0,
  }))
)}

Memory Insights:
- Previously recommended perfume IDs: ${JSON.stringify(Array.from(memory.previouslyRecommendedIds))}
- User expressed rejection of earlier picks: ${memory.isRejection ? "YES (Offer completely fresh alternatives!)" : "No"}
- Active Gender preference: ${memory.preferredGender || "Any / Unisex"}
- Active Price preference: ${memory.isLuxury ? "Luxury / Gift (Higher price)" : memory.isBudget ? "Budget friendly" : "Standard"}
`;

  if (isPerfumeSearch && foundPerfumes.length > 0) {
    promptText += `
AL-WARDA REAL DATABASE MATCHES:
${JSON.stringify(
  foundPerfumes.map((p) => ({
    id: p.id,
    title: p.title,
    brand: p.brand,
    price: `${p.price} EUR`,
    notesSummary: p.notesSummary,
    topNotes: p.topNotes,
    heartNotes: p.heartNotes,
    baseNotes: p.baseNotes,
    longevity: p.longevity,
    sillage: p.sillage,
    gender: p.gender,
    description: p.description,
  })),
  null,
  2
)}

CRITICAL INSTRUCTIONS:
- You must recommend from the AL-WARDA REAL DATABASE MATCHES above.
- Return their IDs in "bookIds": ${JSON.stringify(foundPerfumes.map((p) => p.id))}.
- ${
      memory.isRejection
        ? "The customer requested OTHER options or rejected previous suggestions. Acknowledge this with warmth and charm, and present this new selection!"
        : memory.isSpecificInquiry
        ? "The customer asked about a specific fragrance. Detail its olfactory pyramid (top, heart, base notes), longevity, and aura!"
        : "Present these exquisite perfumes, highlighting why their notes and character suit the guest's taste."
    }
`;
  } else if (!isPerfumeSearch) {
    promptText += `
INSTRUCTION:
Answer the customer's question directly, politely, and warmly as Yasmin.
Set "bookIds": [].
If they asked to view cart, navigate to cart, etc., include "action": { "type": "navigate", "url": "/cart" }.
`;
  }

  // 5. Attempt Gemini Response
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

  // 6. Robust Heuristic Fallback if Gemini is unavailable
  if (!aiResult || !aiResult.message) {
    aiResult = generateHeuristicResponse({
      latestMessage,
      foundPerfumes,
      memory,
      language,
      cartInfo,
      userInfo,
    });
  }

  // 7. Resolve final perfume objects for frontend
  const finalPerfumes = (Array.isArray(aiResult.bookIds) && aiResult.bookIds.length > 0
    ? aiResult.bookIds
        .map((id) => PERFUME_BY_ID.get(String(id).toLowerCase()))
        .filter(Boolean)
    : foundPerfumes
  ).slice(0, 6);

  return {
    message: aiResult.message,
    emotion: aiResult.emotion || "happy",
    books: finalPerfumes.map((p) => ({
      id: p.id,
      title: p.title,
      brand: p.brand,
      author: p.author || `${p.brand} • ${p.notesSummary || "Восточный аромат"}`,
      price: p.price,
      currency: p.currency || "EUR",
      image: p.image || "/assets/img/perfumes/hero-perfume.png",
      url: p.url || `/perfume/${p.slug || p.id}`,
      store: p.store || "Al-Warda Dubai",
      notesSummary: p.notesSummary,
    })),
    action: aiResult.action || null,
    referToAdmin: Boolean(aiResult.referToAdmin),
  };
}

// ============================================================================
// 7. LOCAL HEURISTIC RESPONSE GENERATOR (ZERO-DOWNTIME FALLBACK)
// ============================================================================
function generateHeuristicResponse({ latestMessage, foundPerfumes, memory, language, cartInfo }) {
  const isRu = language === "ru";
  const q = (latestMessage || "").toLowerCase();

  // Navigation / Cart questions
  if (/(корзин|в корзине|что в заказе|заказ)/i.test(q)) {
    if (!cartInfo?.isLoggedIn) {
      return {
        message: isRu
          ? "Корзина привязана к вашему личному аккаунту Al-Warda. Войдите или зарегистрируйтесь, чтобы сохранять понравившиеся ароматы! ✨"
          : "Your shopping bag is linked to your personal Al-Warda account. Sign in to view and save your fragrances! ✨",
        emotion: "greeting",
        bookIds: [],
        action: { type: "navigate", url: "/cart" },
      };
    }
    if (!cartInfo.items || cartInfo.items.length === 0) {
      return {
        message: isRu
          ? "Ваша корзина в Al-Warda пока пуста. Хотите, я помогу подобрать для вас чарующий восточный аромат? ✨"
          : "Your Al-Warda shopping bag is currently empty. Would you like me to curate an enchanting oriental fragrance for you? ✨",
        emotion: "happy",
        bookIds: [],
      };
    }
    return {
      message: isRu
        ? `В вашей корзине ${cartInfo.itemCount} ароматов на сумму ${cartInfo.totalPrice} €. Вы можете оформить заказ в любое удобное время!`
        : `Your bag contains ${cartInfo.itemCount} fragrances totaling ${cartInfo.totalPrice} €. You can proceed to checkout whenever you are ready!`,
      emotion: "happy",
      bookIds: [],
      action: { type: "navigate", url: "/cart" },
    };
  }

  // Specific perfume inquiry from memory
  if (memory.isSpecificInquiry && memory.targetPerfume) {
    const p = memory.targetPerfume;
    const top = p.topNotes?.length ? p.topNotes.join(", ") : "благородные цитрусы и пряности";
    const heart = p.heartNotes?.length ? p.heartNotes.join(", ") : "роскошные восточные цветы";
    const base = p.baseNotes?.length ? p.baseNotes.join(", ") : "драгоценный уд, амбра и мускус";

    return {
      message: isRu
        ? `Аромат «${p.title}» от дома ${p.brand || "Al-Warda"} — это подлинный шедевр. ✨\n\nВерхние ноты раскрываются аккордами: ${top}. В сердце звучат ${heart}, а в шлейфе оставляет стойкую базу из: ${base}. Стойкость составляет ${p.longevity || "10-14 часов"}, а шлейф невероятно комплиментарен!`
        : `The fragrance «${p.title}» by ${p.brand || "Al-Warda"} is a true oriental masterpiece. ✨\n\nTop notes open with: ${top}. The heart reveals ${heart}, drifting into a luxurious drydown of ${base}. Exceptional longevity of ${p.longevity || "10-14 hours"}!`,
      emotion: "speaking",
      bookIds: [p.id],
    };
  }

  // Rejection of previous options
  if (memory.isRejection && foundPerfumes.length > 0) {
    return {
      message: isRu
        ? "Прекрасно вас понимаю! В мире арабской парфюмерии важна каждая нота. Я подобрала для вас совершенно другие, восхитительные композиции из нашей коллекции:"
        : "I completely understand! Every note in oriental perfumery is deeply personal. I have selected entirely fresh, enchanting creations for you:",
      emotion: "happy",
      bookIds: foundPerfumes.map((p) => p.id),
    };
  }

  // General recommendations
  if (foundPerfumes.length > 0) {
    return {
      message: isRu
        ? "С радостью представляю вам изысканные арабские парфюмы из коллекции Al-Warda, идеально подходящие под ваши пожелания:"
        : "With great pleasure, I present exquisite Arabian fragrances from Al-Warda's royal collection curated for you:",
      emotion: "happy",
      bookIds: foundPerfumes.map((p) => p.id),
    };
  }

  // Default friendly conversation
  return {
    message: isRu
      ? "Здравствуйте! Меня зовут Ясмин, и я ваш персональный парфюмерный консультант бутика Al-Warda. Расскажите, какие ноты вы предпочитаете — нежную ваниль, царственный уд, бархатную розу или свежие цитрусы? ✨"
      : "Welcome! I am Yasmin, your fragrance concierge at Al-Warda. Which olfactory notes inspire you today — rich oud, bourbon vanilla, velvet rose, or crisp bergamot? ✨",
    emotion: "greeting",
    bookIds: [],
  };
}

// ============================================================================
// 8. SUPPORTING UTILITIES (MAINTAINING ROUTE COMPATIBILITY)
// ============================================================================
export async function filterInquiryMessageWithAI({ text, language = "ru" }) {
  const clean = (text || "").trim();
  if (!clean) {
    return {
      allowed: false,
      reason: language === "ru" ? "Сообщение не может быть пустым." : "Message cannot be empty.",
    };
  }
  return { allowed: true, redirectToLitera: false };
}

export async function translateLiteraDialog({ messages, targetLanguage = "ru" } = {}) {
  const items = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.id && typeof m.content === "string" && m.content.trim())
    .slice(-40)
    .map((m) => ({ id: String(m.id), content: String(m.content) }));

  return { translations: items };
}
