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
    perfume.notesSummary,
    ...(Array.isArray(perfume.topNotes) ? perfume.topNotes : []),
    ...(Array.isArray(perfume.heartNotes) ? perfume.heartNotes : []),
    ...(Array.isArray(perfume.baseNotes) ? perfume.baseNotes : []),
  ].filter(Boolean);

  const noteTokens = noteList.flatMap(tokenizeSearchQuery);
  if (noteTokens.includes(compactQuery)) return 30;
  if (
    compactQuery.length >= 3 &&
    noteList.map(normalizeSearchCompact).some((f) => f.includes(compactQuery))
  ) {
    return 25;
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
