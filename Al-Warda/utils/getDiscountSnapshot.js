import { restUrl } from "./restBase.js";

const TABLE_URL = restUrl("discounts");

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedSnapshot = null;
let cacheExpiry = 0;
let inflight = null;

export function getCachedDiscountSnapshot() {
  return cachedSnapshot;
}

export default async function getDiscountSnapshot() {
  if (cachedSnapshot !== null && Date.now() < cacheExpiry) {
    return cachedSnapshot;
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
      throw new Error(error?.message ?? "Could not load discount books");
    }

    const rows = await response.json();
    const result = rows[0]?.books ?? { updatedAt: null, products: [] };
    cachedSnapshot = result;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return result;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
