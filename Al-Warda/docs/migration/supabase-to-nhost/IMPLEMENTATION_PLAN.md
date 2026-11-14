# IMPLEMENTATION_PLAN — migration execution stages

This is the ordered, staged plan to move Al-Warda from Supabase to Nhost
without breaking the live app. It builds on `AUDIT.md` (full Supabase usage
inventory) and `APPLICATION_CHANGES.md` (per-file call-site mapping).

## Non-negotiable rules

- Supabase stays active and is the **default** until every Nhost stage passes.
- No Nhost table is dropped or re-created.
- No schema/column change without owner approval.
- No stubbing of real functions; the Supabase path remains the real one until
  the Nhost path is verified.
- No secrets in client code (`src/*`, `VITE_*`): only public subdomain/region
  are exposed; admin secret / service keys stay server-side (Worker/env).

## Stage 0 — SDK, client, env (DONE)

- `npm install @nhost/nhost-js` (v4.9.0) into the app `package.json`.
- `src/lib/nhost.js` — single client:
  ```js
  import { createClient } from "@nhost/nhost-js";
  export const nhost = createClient({
    subdomain: import.meta.env.VITE_NHOST_SUBDOMAIN,
    region: import.meta.env.VITE_NHOST_REGION,
  });
  ```
- `.env.local`:
  ```
  VITE_NHOST_SUBDOMAIN=jopiirogydgupiwqiwac
  VITE_NHOST_REGION=eu-central-1
  ```
- Verified `createClient({ subdomain, region })` builds a client exposing
  `auth`, `storage`, `graphql`, `functions`.

## Stage 1 — Provider flag (foundation, no behavior change)

Introduce a single switch used by every data module:

```js
// src/lib/backend.js
export const USE_NHOST = import.meta.env.VITE_USE_NHOST === "true"; // default false
```

`VITE_USE_NHOST=false` (default) keeps the exact current Supabase REST path.
Nothing is rewired until the flag flips — this guarantees the shop keeps
working during development.

## Stage 2 — Verify Nhost table structure (BLOCKED on access)

- Read the Nhost Hasura metadata (tables, columns, types, relationships,
  permissions) and diff against the Supabase inventory in `AUDIT.md`.
- Requires the Hasura admin secret or `nhost` CLI/Management access — **not yet
  available** (see blockers).

## Stage 3 — GraphQL permissions & relationships (BLOCKED)

- Map the Supabase RLS policies to Hasura permission rules per
  `SECURITY_POC.md` and `COMPATIBILITY_MATRIX.md`.
- Requires the same admin access.

## Stage 4 — Rewire data modules (only after Stage 2/3)

Target files (from `APPLICATION_CHANGES.md`), changed one at a time behind the
`USE_NHOST` flag:

- `utils/perfumes.js` (catalog list/detail — light select)
- `utils/auth.js` (register/login/reset via `public.user`)
- `utils/cart.js`, `utils/orders.js`
- `utils/inquiries.js`, `utils/feedbacks.js`, `utils/coupons.js`,
  `utils/announcements.js`
- legacy: `utils/getBookPicks.js`, `getHomepageBooks.js`, `getNewBooks.js`,
  `getDiscountSnapshot.js`
- server-side: `server/productImageQueueAdmin.js`,
  `server/deepseekNotesService.js`, `server/descriptionQueue.js`,
  `server/catalogActionsService.js`

Each module gets a Nhost branch (real GraphQL via `nhost.graphql.request`) next
to the existing Supabase branch; the flag selects the provider.

## Stage 5 — Auth migration (keep `public.user` + bcrypt)

- Do **not** treat `public.user` as Nhost Auth. Keep the custom table, bcrypt
  hashes, EmailJS and cookie session.
- Hasura external JWT signing: the Worker mints HS256 JWTs with
  `x-hasura-allowed-roles` / `x-hasura-default-role` / `x-hasura-user-id`
  (see `JWT_POC.md`, `ARCHITECTURE_DECISION.md`).
- Admin role is granted only server-side, never from the browser cookie.

## Stage 6 — Cloudflare Worker thin proxy

- Add a `/rest/v1/*` → Hasura GraphQL translation route in `server/worker.js`
  (see `poc/thin_proxy_translator.mjs`), preserving existing `/api/*`.
- Admin secret / service keys stay in Worker secrets — never in `wrangler.jsonc`
  `vars` or `VITE_*`.

## Stage 7 — Tests & build

- Node tests for the translator and the provider switch.
- `npm run build` must stay green with `VITE_USE_NHOST` off and on.
- `node --test` regression run.

## Environment variables (summary)

| Var                    | Where                       | Public?         |
| ---------------------- | --------------------------- | --------------- |
| `VITE_NHOST_SUBDOMAIN` | `.env.local`                | yes             |
| `VITE_NHOST_REGION`    | `.env.local`                | yes             |
| `VITE_USE_NHOST`       | `.env.local`                | yes (flag only) |
| `NHOST_ADMIN_SECRET`   | server env / Worker secrets | **no**          |
| `NHOST_JWT_SECRET`     | server env / Worker secrets | **no**          |
| `SUPABASE_*`           | unchanged                   | —               |

## Blockers (unchanged)

1. Nhost admin secret / Management access to read table structure + permissions
   (Stages 2–3).
2. Supabase DB connection string for `pg_dump` (data copy stage, separate).

## Files changed so far

- `package.json` (+ `@nhost/nhost-js`)
- `src/lib/nhost.js` (new)
- `.env.local` (+ `VITE_NHOST_*`)
