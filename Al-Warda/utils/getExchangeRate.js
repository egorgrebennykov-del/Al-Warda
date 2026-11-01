const env =
  (typeof import.meta !== "undefined" && import.meta.env) ||
  globalThis.process?.env ||
  {};

const SUPABASE_URL =
  env.VITE_SUPABASE_URL ||
  env.SUPABASE_URL ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";

const SUPABASE_KEY =
  env.VITE_SUPABASE_ANON_KEY ||
  env.SUPABASE_SECRET_KEY ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";

// In-memory cache: avoids repeated Supabase fetches within the same session.
// The rate is updated once a day by the GitHub Action, so 5 minutes is fine.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedRate = null;
let cacheExpiry = 0;
// Pending promise deduplication: concurrent callers share one in-flight request.
let inflight = null;

export const DEFAULT_RATE = 20.2;

export function getCachedExchangeRate() {
  return cachedRate;
}

export default async function getExchangeRate() {
  // Return from cache if still fresh.
  if (cachedRate !== null && Date.now() < cacheExpiry) return cachedRate;

  // Deduplicate concurrent calls — only one fetch in flight at a time.
  if (inflight) return inflight;

  if (!SUPABASE_KEY) {
    console.warn("VITE_SUPABASE_ANON_KEY не задан в .env — курс не загружен");
    return DEFAULT_RATE;
  }

  inflight = (async () => {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/exchange_rate?select=rate&base_currency=eq.EUR&quote_currency=eq.MDL&limit=1`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        const rate = Number(data[0]?.rate);
        if (Number.isFinite(rate) && rate > 0) {
          cachedRate = rate;
          cacheExpiry = Date.now() + CACHE_TTL_MS;
          return rate;
        }
      }
    } catch (error) {
      console.warn("Ошибка загрузки курса валют:", error.message);
    }
    return cachedRate || DEFAULT_RATE;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
