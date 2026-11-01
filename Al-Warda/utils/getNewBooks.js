const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";
const KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";
const TABLE_URL = `${SUPABASE_URL}/rest/v1/new_books`;

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedNewBooks = null;
let cacheExpiry = 0;
let inflight = null;

export function getCachedNewBooks() {
  return cachedNewBooks;
}

export default async function getNewBooks() {
  if (cachedNewBooks !== null && Date.now() < cacheExpiry) {
    return cachedNewBooks;
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
      throw new Error(error?.message ?? "Could not load new books");
    }

    const rows = await response.json();
    const raw = rows[0]?.books;
    let result;
    if (!raw) {
      result = { updatedAt: null, products: [] };
    } else if (Array.isArray(raw)) {
      result = { updatedAt: null, products: raw };
    } else {
      result = {
        updatedAt: raw.updatedAt ?? null,
        products: Array.isArray(raw.products) ? raw.products : [],
      };
    }
    cachedNewBooks = result;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return result;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
