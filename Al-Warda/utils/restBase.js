// Central PostgREST-style REST origin for the frontend data layer.
//
// When VITE_USE_NHOST === "true", requests go through the Cloudflare Worker's
// /rest/v1/* proxy (which translates PostgREST → Nhost Hasura GraphQL). The
// admin secret stays server-side and is never exposed to the browser.
// Otherwise the data layer keeps pointing at Supabase PostgREST (legacy).

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const USE_NHOST = env.VITE_USE_NHOST === "true";

const SUPABASE_FALLBACK = "https://mfvenfrmlkxqgvdtedet.supabase.co";

export function restOrigin() {
  if (USE_NHOST) {
    // Empty string => same-origin (the Worker serves the SPA), so /rest/v1/* hits the proxy.
    return env.VITE_NHOST_REST_ORIGIN || "";
  }
  return env.VITE_SUPABASE_URL || SUPABASE_FALLBACK;
}

export function restUrl(table) {
  return `${restOrigin()}/rest/v1/${table}`;
}
