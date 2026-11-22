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
 * Returns true if a perfume matches a search query regardless of case,
 * spaces, apostrophes, dashes, commas, or other punctuation.
 */
export function matchesPerfumeSearch(perfume, rawQuery) {
  const compactQuery = normalizeSearchCompact(rawQuery);
  if (!compactQuery) return true;
  if (!perfume) return false;

  const fields = [
    perfume.name,
    perfume.title,
    perfume.brand,
    perfume.series,
    perfume.category,
    perfume.notesSummary,
    perfume.description,
    ...(Array.isArray(perfume.topNotes) ? perfume.topNotes : []),
    ...(Array.isArray(perfume.heartNotes) ? perfume.heartNotes : []),
    ...(Array.isArray(perfume.baseNotes) ? perfume.baseNotes : []),
  ];

  const compactFields = fields.map(normalizeSearchCompact).filter(Boolean);
  if (compactFields.some((f) => f.includes(compactQuery))) {
    return true;
  }

  const combinedCompact = compactFields.join("");
  if (combinedCompact.includes(compactQuery)) {
    return true;
  }

  const tokens = tokenizeSearchQuery(rawQuery);
  return tokens.length > 1 && tokens.every((tok) => combinedCompact.includes(tok));
}
