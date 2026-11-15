// Central REST origin for the frontend data layer.
//
// Nhost is the DEFAULT data store: requests go through the Cloudflare Worker's
// /rest/v1/* proxy (which translates PostgREST → Nhost Hasura GraphQL).
// Empty string => same-origin (the Worker serves the SPA), so /rest/v1/* hits the proxy.

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export function restOrigin() {
  // Empty string => same-origin (the Worker serves the SPA), so /rest/v1/* hits the proxy.
  return env.VITE_NHOST_REST_ORIGIN || "";
}

export function restUrl(table) {
  // Route through the Worker's /api/* path, then normalized to /rest/v1/* inside the Worker.
  return `${restOrigin()}/api/rest/v1/${table}`;
}
