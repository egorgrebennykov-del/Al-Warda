/**
 * Normalizes text for case-, space-, punctuation-, and diacritic-insensitive search.
 * Strips apostrophes, dashes, commas, dots, spaces, and other non-alphanumeric characters
 * across Latin, Cyrillic, Greek, and digits.
 */
export function normalizeSearchCompact(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Splits a search query into normalized tokens (ignoring punctuation & spaces).
 */
export function tokenizeSearchQuery(query) {
  if (query === null || query === undefined) return [];
  return String(query)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const SEARCH_NOTE_GROUPS = [
  ["ваниль", "ванилин", "ванилью", "vanilla", "vanille", "vanilie", "vanilia", "ванилия", "βανιλια"],
  ["уд", "удовый", "удом", "oud", "oudh", "agarwood", "агаровое"],
  ["роза", "розой", "розы", "rose", "taif", "trandafir", "rozsa", "τριανταφυλλο"],
  ["амбра", "амброй", "amber", "ambre", "ambroxan", "амброксан", "κεχριμπαρι"],
  ["мускус", "мускусом", "musk", "musc", "mosc", "mosusz", "μοσχος"],
  ["карамель", "карамелью", "caramel", "toffee", "ириска", "καραμελα"],
  ["кофе", "coffee", "espresso", "cafea", "kave", "καφες", "капучино", "cappuccino"],
  ["шоколад", "какао", "chocolate", "cacao", "cocoa", "ciocolata", "csokolade", "σοκολατα"],
  ["шафран", "saffron", "safran", "sofran", "шафран", "σαφραν"],
  ["жасмин", "jasmine", "jasmin", "iasomie", "jazmin", "γιασεμι"],
  ["бергамот", "bergamot", "bergamote", "bergamota", "μπεργαμοτο"],
  ["цитрус", "лимон", "апельсин", "мандарин", "лайм", "грейпфрут", "citrus", "lemon", "orange", "mandarin", "lime", "grapefruit"],
  ["кокос", "coconut", "coco", "nucadecocos", "kokusz", "καρυδα"],
  ["вишня", "черешня", "cherry", "cerise", "cirese", "cseresznye", "κερασι"],
  ["персик", "peach", "peche", "piersica", "barack", "ροδακινο"],
  ["мед", "мёд", "honey", "miel", "miere", "mez", "μελι"],
  ["кожа", "кожей", "leather", "cuir", "piele", "bor", "δερμα"],
  ["табак", "tobacco", "tabac", "tutun", "dohany", "καπνος"],
  ["сандал", "sandalwood", "santal", "santali", "szantalfa", "σανταλοξυλο"],
  ["кедр", "cedar", "cedarwood", "cedre", "cedru", "cedrus", "κεδρος"],
  ["пачули", "patchouli", "paciuli", "pacsuli", "πατσουλι"],
  ["лаванда", "lavender", "lavande", "lavanda", "levendula", "λεβαντα"],
  ["корица", "cinnamon", "cannelle", "scortisoara", "fahej", "κανελα"],
  ["кардамон", "cardamom", "cardamome", "kardamom", "καρδαμο"],
  ["фисташка", "фисташки", "pistachio", "pistache", "fistic", "pisztacia", "φιστικι"],
  ["манго", "mango", "μανγκο"],
  ["клубника", "ягода", "ягоды", "малина", "berry", "berries", "strawberry", "raspberry", "fraise", "capsuni", "eper", "malna", "φραουλα"],
  ["яблоко", "apple", "pomme", "mar", "alma", "μηλο"],
  ["бобытонка", "тонка", "tonka", "tonkabean"],
];

function getSearchNoteSynonyms(compactQuery, queryTokens) {
  const matched = new Set();
  for (const group of SEARCH_NOTE_GROUPS) {
    const hit = group.some(
      (syn) =>
        syn === compactQuery ||
        (compactQuery.length >= 4 && (syn.includes(compactQuery) || compactQuery.includes(syn))) ||
        queryTokens.some((tok) => tok.length >= 3 && (syn === tok || syn.startsWith(tok) || tok.startsWith(syn))),
    );
    if (hit) {
      for (const syn of group) matched.add(syn);
    }
  }
  return Array.from(matched);
}

/**
 * Computes a relevance score (0 = no match) for a perfume against a search query.
 */
export function scorePerfumeSearch(perfume, rawQuery) {
  const compactQuery = normalizeSearchCompact(rawQuery);
  if (!compactQuery) return 1;
  if (!perfume) return 0;

  const rawName = perfume.name || perfume.title || "";
  const rawBrand = perfume.brand || "";
  const rawSeries = perfume.series || "";

  const nameCompact = normalizeSearchCompact(rawName);
  const brandCompact = normalizeSearchCompact(rawBrand);
  const seriesCompact = normalizeSearchCompact(rawSeries);
  const nameTokens = tokenizeSearchQuery(rawName);
  const brandTokens = tokenizeSearchQuery(rawBrand);
  const seriesTokens = tokenizeSearchQuery(rawSeries);
  const queryTokens = tokenizeSearchQuery(rawQuery);

  if (nameCompact === compactQuery) return 100;
  if (nameTokens.includes(compactQuery)) return 92;
  if (
    queryTokens.length === 1 &&
    nameTokens.some((t) => t.startsWith(compactQuery) && compactQuery.length >= 2)
  ) {
    return 86;
  }
  if (nameCompact.startsWith(compactQuery)) return 85;
  if (compactQuery.length >= 3 && nameCompact.includes(compactQuery)) return 70;
  if (
    compactQuery.length <= 2 &&
    nameTokens.some((t) => t.includes(compactQuery))
  ) {
    return 70;
  }

  if (brandCompact === compactQuery || seriesCompact === compactQuery) return 60;
  if (brandTokens.includes(compactQuery) || seriesTokens.includes(compactQuery)) return 58;
  if (brandCompact.startsWith(compactQuery) || seriesCompact.startsWith(compactQuery)) return 50;
  if (
    compactQuery.length >= 3 &&
    (brandCompact.includes(compactQuery) || seriesCompact.includes(compactQuery))
  ) {
    return 40;
  }

  const nameBrandTokens = new Set([...nameTokens, ...brandTokens, ...seriesTokens]);
  if (
    queryTokens.length > 1 &&
    queryTokens.every(
      (tok) => nameBrandTokens.has(tok) || (tok.length >= 3 && `${nameCompact} ${brandCompact} ${seriesCompact}`.includes(tok)),
    )
  ) {
    return 45;
  }

  const noteList = [
    perfume.category,
    perfume.categoryRu,
    perfume.categoryEn,
    perfume.notesSummary,
    perfume.notesSummaryRu,
    perfume.notesSummaryEn,
    ...(Array.isArray(perfume.topNotes) ? perfume.topNotes : []),
    ...(Array.isArray(perfume.heartNotes) ? perfume.heartNotes : []),
    ...(Array.isArray(perfume.baseNotes) ? perfume.baseNotes : []),
    ...(Array.isArray(perfume.topNotesRu) ? perfume.topNotesRu : []),
    ...(Array.isArray(perfume.heartNotesRu) ? perfume.heartNotesRu : []),
    ...(Array.isArray(perfume.baseNotesRu) ? perfume.baseNotesRu : []),
    ...(Array.isArray(perfume.topNotesEn) ? perfume.topNotesEn : []),
    ...(Array.isArray(perfume.heartNotesEn) ? perfume.heartNotesEn : []),
    ...(Array.isArray(perfume.baseNotesEn) ? perfume.baseNotesEn : []),
  ].filter(Boolean);

  const noteTokens = noteList.flatMap(tokenizeSearchQuery);
  const noteCompactList = noteList.map(normalizeSearchCompact);
  if (noteTokens.includes(compactQuery)) return 30;
  if (
    compactQuery.length >= 3 &&
    noteCompactList.some((f) => f.includes(compactQuery))
  ) {
    return 25;
  }

  const noteSynonyms = getSearchNoteSynonyms(compactQuery, queryTokens);
  if (noteSynonyms.length > 0) {
    if (noteSynonyms.some((syn) => nameTokens.includes(syn) || nameCompact.includes(syn))) {
      return 68;
    }
    if (
      noteSynonyms.some(
        (syn) =>
          noteTokens.includes(syn) ||
          noteCompactList.some((f) => f.includes(syn)),
      )
    ) {
      return 28;
    }
  }

  const descTokens = tokenizeSearchQuery(perfume.description || "");
  if (descTokens.includes(compactQuery)) return 18;
  const descCompact = normalizeSearchCompact(perfume.description || "");
  if (compactQuery.length >= 3 && descCompact.includes(compactQuery)) return 15;

  // Multi-word queries across separate fields (space-separated so adjacent words never fuse into fake tokens)
  const spaceJoined = [
    rawName,
    rawBrand,
    rawSeries,
    ...noteList,
    perfume.description || "",
  ]
    .map(normalizeSearchCompact)
    .filter(Boolean)
    .join(" ");

  if (
    queryTokens.length > 1 &&
    queryTokens.every((tok) =>
      tok.length <= 2
        ? [...nameBrandTokens, ...noteTokens, ...descTokens].includes(tok)
        : spaceJoined.includes(tok),
    )
  ) {
    return 10;
  }

  return 0;
}

/**
 * Returns true if a perfume matches a search query regardless of case,
 * spaces, apostrophes, dashes, commas, or other punctuation.
 */
export function matchesPerfumeSearch(perfume, rawQuery) {
  return scorePerfumeSearch(perfume, rawQuery) > 0;
}

function getGoogleTrendsValue(perfume) {
  const avg = Number(
    perfume?.googleTrendsAverage ??
      perfume?.googleTrends?.average ??
      perfume?.googleTrends?.avg ??
      perfume?.info?.googleTrends?.average ??
      perfume?.info?.googleTrends?.avg,
  );
  if (Number.isFinite(avg)) return avg;
  const max = Number(
    perfume?.googleTrendsMax ??
      perfume?.googleTrends?.max ??
      perfume?.info?.googleTrends?.max,
  );
  return Number.isFinite(max) ? max : -1;
}

function getGoogleTrendsMaxValue(perfume) {
  const max = Number(
    perfume?.googleTrendsMax ??
      perfume?.googleTrends?.max ??
      perfume?.info?.googleTrends?.max,
  );
  return Number.isFinite(max) ? max : -1;
}

/**
 * Sorts perfumes first by search relevance (descending), then by Google Trends rating (descending).
 */
export function sortPerfumesBySearchAndTrends(list, rawQuery) {
  if (!Array.isArray(list) || list.length <= 1) return Array.isArray(list) ? [...list] : [];
  return [...list].sort((a, b) => {
    const scoreDiff = scorePerfumeSearch(b, rawQuery) - scorePerfumeSearch(a, rawQuery);
    if (scoreDiff !== 0) return scoreDiff;

    const gtAvgDiff = getGoogleTrendsValue(b) - getGoogleTrendsValue(a);
    if (gtAvgDiff !== 0) return gtAvgDiff;

    const gtMaxDiff = getGoogleTrendsMaxValue(b) - getGoogleTrendsMaxValue(a);
    if (gtMaxDiff !== 0) return gtMaxDiff;

    return Number(a?.id || 0) - Number(b?.id || 0);
  });
}
