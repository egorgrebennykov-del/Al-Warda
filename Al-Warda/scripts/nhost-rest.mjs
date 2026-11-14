// Shared helper for standalone Node scripts: route PostgREST-style requests to
// Nhost Hasura through the same translator used by the Cloudflare Worker.
//
// Scripts keep their existing PostgREST URLs — only the host is ignored, the
// path drives the GraphQL translation. The Hasura admin secret is read from
// process.env.NHOST_ADMIN_SECRET (loaded from `.env` locally, or injected by
// GitHub Actions). It is never printed.
import { supabaseFetch } from "../server/hasuraProxy.js";

export function restFetch(url, init = {}) {
  return supabaseFetch(process.env, url, init);
}
