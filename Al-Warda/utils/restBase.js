// Central PostgREST-style REST origin for the frontend data layer.
//
// Nhost is the DEFAULT data store: requests go through the Cloudflare Worker's
// /rest/v1/* proxy (which translates PostgREST → Nhost Hasura GraphQL). The
// admin secret stays server-side and is never exposed to the browser.
//
// Set VITE_USE_SUPABASE=true only to roll back to the legacy Supabase
// PostgREST path.

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const USE_SUPABASE = env.VITE_USE_SUPABASE === "true";

const SUPABASE_FALLBACK = "https://mfvenfrmlkxqgvdtedet.supabase.co";

export function restOrigin() {
  if (USE_SUPABASE) {
    return env.VITE_SUPABASE_URL || SUPABASE_FALLBACK;
  }
  // Empty string => same-origin (the Worker serves the SPA), so /rest/v1/* hits the proxy.
  return env.VITE_NHOST_REST_ORIGIN || "";
}

export function restUrl(table) {
  return `${restOrigin()}/rest/v1/${table}`;
}
