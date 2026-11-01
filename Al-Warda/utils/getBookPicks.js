const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";
const KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";
const TABLE_URL = `${SUPABASE_URL}/rest/v1/book_picks`;

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedPicks = null;
let cacheExpiry = 0;
let inflight = null;

export function getCachedBookPicks() {
  return cachedPicks;
}

export default async function getBookPicks() {
  if (!KEY) throw new Error("VITE_SUPABASE_ANON_KEY is not configured");
  if (cachedPicks !== null && Date.now() < cacheExpiry) {
    return cachedPicks;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const response = await fetch(`${TABLE_URL}?select=books&limit=1`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.message ?? "Could not load Book Picks");
    }

    const rows = await response.json();
    const books = rows[0]?.books;
    const result = Array.isArray(books)
      ? books.filter((book) => book?.title && book?.url && book?.image)
      : [];
    cachedPicks = result;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return result;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
