import { restUrl } from "./restBase.js";

const TABLE_URL = restUrl("book_picks");

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedPicks = null;
let cacheExpiry = 0;
let inflight = null;

export function getCachedBookPicks() {
  return cachedPicks;
}

export default async function getBookPicks() {
  if (cachedPicks !== null && Date.now() < cacheExpiry) {
    return cachedPicks;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const response = await fetch(`${TABLE_URL}?select=books&limit=1`, {
      headers: {
        apikey: "",
        Authorization: "",
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
