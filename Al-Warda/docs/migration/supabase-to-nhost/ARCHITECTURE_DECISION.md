# ARCHITECTURE_DECISION — Nhost for Al-Warda

Status: **PREPARATION ONLY.** No production project, no data transfer, no code
or auth changes have been made. This document records the technical verdict.

Sources used:
- Hasura JWT authentication docs (authoritative for the JWT claims Hasura/Nhost
  accept): `https://hasura.io/docs/latest/auth/authentication/jwt/`
- Nhost pricing page: `https://nhost.io/pricing`
- Repository audit: `AUDIT.md`
- Isolated bcrypt test: `tools/bcrypt_compat_check.mjs` (PASS, synthetic hash).

> Note: the Nhost "external signing" doc path returned 404 at the time of
> writing; the JWT mechanics below are taken from the Hasura JWT reference,
> which is exactly what Nhost's embedded Hasura enforces. The concrete Nhost
> config key (`hasura.jwtSecrets`) must be confirmed in the Nhost dashboard
> during the test phase.

---

## 1. Can the current auth be kept? — YES

Current auth is **not** Supabase Auth: it is a custom `public.user` table with
`bcryptjs` hashes, EmailJS verification codes, and a `user=` cookie session
(`utils/auth.js`).

To keep it unchanged against Nhost, use **Hasura external JWT signing**:

- A shared secret (HS256, ≥32 chars) is configured in Hasura:
  ```json
  { "type": "HS256", "key": "<shared-secret>" }
  ```
- The Cloudflare Worker verifies the existing `user=` cookie and **mints a
  short-lived JWT** signed with that same secret, with the claims Hasura
  requires (below).
- Hasura verifies the JWT signature and derives the role/user from the claims.

No user re-registration, no Supabase Auth, no Nhost Auth dependency is required.

### JWT the Worker must produce

Payload:

```json
{
  "sub": "<user.id>",
  "iat": 1710000000,
  "exp": 1710000900,
  "https://hasura.io/jwt/claims": {
    "x-hasura-allowed-roles": ["user", "admin"],
    "x-hasura-default-role": "user",
    "x-hasura-user-id": "<user.id>"
  }
}
```

- `x-hasura-default-role` and `x-hasura-allowed-roles` are **mandatory**
  (Hasura requirement).
- `x-hasura-user-id` carries the user id for row-level permission rules.
- `x-hasura-*` values must be strings (they are coerced automatically).
- Hasura reads the token from `Authorization: Bearer <JWT>` by default (cookie
  or custom-header mode is also supported via the `header` JWT config).

### Passing user ID and role

- `user.id` → `sub` and `x-hasura-user-id`.
- `resolveUserRoles()` result → `x-hasura-allowed-roles` (e.g. `["user"]`, or
  `["user","vip","admin"]` for privileged accounts).

### Preventing admin-role forgery

- The frontend **never** builds the JWT and **never** claims `admin`. Only the
  Worker signs tokens, and it derives roles **server-side** from the DB row /
  server-held session — it must not trust role values in the browser cookie.
- The `admin`/`vip` role appears in `x-hasura-allowed-roles` **only** when the
  server re-checks `status`/`role` against the database.
- The Hasura **admin secret** is kept only in Worker secrets and is never sent
  to the browser.

### Session expiry & refresh

- Keep the existing `user=` cookie (7 days) as the browser credential.
- The Hasura JWT is short-lived (e.g. 15 min `exp`), re-issued by the Worker
  on each request (or via a `/api/auth/token` endpoint) from the cookie.
- `iat`/`exp` + Hasura `allowed_skew` guard clock drift; set an `issuer` and
  `audience` check to prevent cross-tenant token acceptance.

### Cookie security

- `HttpOnly`, `Secure` (production), `SameSite=Lax` for the session cookie.
- Do not put the raw Hasura JWT in a browser-readable cookie for longer than
  needed; the Worker exchanges the HttpOnly cookie for the JWT server-side.

## 2. Can bcrypt hashes be kept without password reset? — YES (tested)

The isolated test `tools/bcrypt_compat_check.mjs` (synthetic hash only, no real
passwords) confirms:

- bcryptjs produces `$2b$10$…` (identical family to `$2a$`).
- Correct password → accepted; wrong password → rejected.
- The stored hash string is self-contained — it can be copied into Nhost and
  verified there with no knowledge of the plaintext.
- The user `id` is an independent uuid column, copied verbatim.

## 3. Can user IDs be preserved? — YES

`public.user.id` (uuid) is copied as data. `cart.user_id`, `orders.user_id`,
`inquiries.user_id`, `feedbacks.user_id`, `orders_in_progress.user_id` are
uuid references and remain valid unchanged.

## 4. Can the Thin Proxy be implemented? — YES

```
Frontend → Cloudflare Worker → Nhost Hasura GraphQL → PostgreSQL
```

- Existing server routes (`/api/*`) stay; only the data layer inside the Worker
  changes.
- The Worker translates PostgREST-style requests into Hasura GraphQL:
  - `select` → GraphQL query fields
  - `id=eq.…` / `or=(…)` / `ilike` → `where` clauses
  - `order=…` / `limit` / `offset` → `order_by` / `limit` / `offset`
  - JSONB arrow filters (`info->imageGeneration->>status`) → `_has`/`_contains`
    or a small Postgres view/computed column to keep queries simple
  - `POST`/`PATCH`/`DELETE` → `insert_…` / `update_…` / `delete_…` mutations,
    returning the same row shapes (`Prefer: return=representation` behavior).
- Access control is preserved by sending the **user JWT** (browser requests) or
  the **admin secret** (server/Worker background paths) to Hasura; the admin
  secret never reaches the frontend.

### Preventing direct-GraphQL privilege bypass

- Expose only the **public** role with the minimal permission set to the
  browser; do not publish the admin secret.
- Or keep the GraphQL endpoint private and allow only the Worker (admin
  secret) — the recommended option, since the frontend already talks only to
  the Worker.
- Never grant `public` role any `admin`-only mutation (e.g. role escalation).

## 5. RLS and admin rights — mapping

RLS policies (from `supabase_schema.sql`) map to Hasura permission rules:

| Supabase policy | Hasura role/permission |
| --------------- | ---------------------- |
| `categories/perfumes/reviews select using(true)` | `public` → select, no filter |
| `cart for all using(true) with check(true)` | `public` → select/insert/update/delete |
| `orders insert with check(true)` | `public` → insert |
| `orders select using(true)` | `public` → select |
| `inquiries insert with check(true)`, `select using(true)` | `public` → insert/select |
| service-role bypass | `admin` role (admin secret) only |

Enforced answers:

- **Normal user** → role `user`, sees own rows only where a `user_id =
  X-Hasura-User-Id` predicate is configured.
- **Admin** → role `admin` (server-issued JWT or admin secret), full read/write.
- **Anonymous** → role `public` (or no JWT), only public-read/open-insert
  tables, matching today's anon behavior.
- **Access to others' data** → blocked by row predicate `user_id =
  X-Hasura-User-Id` on `cart`, `orders_in_progress`, `feedbacks`, `inquiries`.
- **Modifying others' records** → same predicate on update/delete.
- **Self-assigning admin** → impossible: `admin` appears only in JWTs the
  Worker signs after a server-side role check; the `public`/`user` roles have
  no `update` permission on `user.status`/`user.role`.

⚠️ RLS ↔ Hasura equivalence is **not automatic** — each rule must be manually
defined and tested (see `TEST_PLAN.md`).

## 6. Files to change

See `APPLICATION_CHANGES.md` for the full list. Summary:

- **Data layer (browser, ~12 files):** `utils/perfumes.js`, `auth.js`,
  `cart.js`, `orders.js`, `inquiries.js`, `feedbacks.js`, `coupons.js`,
  `announcements.js`, `getBookPicks.js`, `getHomepageBooks.js`,
  `getNewBooks.js`, `getDiscountSnapshot.js`.
- **Server/Worker (~5 files):** `server/worker.js` (proxy routes),
  `productImageQueueAdmin.js`, `deepseekNotesService.js`, `descriptionQueue.js`,
  `catalogActionsService.js`.
- **Scripts (~6 files):** `sync-stocks-supabase.js`,
  `sync_qogita_mov_prices.js`, `researchPerfumeNotes.mjs`,
  `backfillFragranceNotes.mjs`, `generate_product_images.py`,
  `qogita_weekly_sync_upscayl.py`.
- **Env/secrets:** `wrangler.jsonc`, `.env`, `generate-worker-env.js`, GitHub
  Actions secrets.
- **Tests:** fixtures that hardcode `supabase.co` URLs.

If the **thin proxy** approach is used, most `utils/*` files do **not** change
— only the Worker's translation layer and the env vars do.

## 7. Expected Nhost cost

Current public pricing (2026-11):

| | Starter | Pro |
| - | ------- | --- |
| Price | $0 | from $25/mo (+ compute) |
| Database | 1 GB | 10 GB included, then $0.20/GB |
| Storage | 1 GB | 50 GB, then $0.05/GB |
| Egress | 5 GB | 50 GB, then $0.10/GB |
| Backups | — | 7 days automated |
| PITR | — | starts at $100 |
| Compute | shared | dedicated $50/vCPU/mo or shared $15/vCPU/mo |
| Overage | project stays up, pay-as-you-grow | same |

Al-Warda is a catalog of 1,000+ rows with modest images (generated images are
served by Cloudflare, not Nhost Storage). Expected fit: **Pro** at $25/mo plus
shared compute; overage only if the catalog grows well beyond 10 GB / 50 GB
egress. Do **not** select a paid plan until the test migration measures real
usage.

## 8. Egress risk

- Supabase's current blocker is `402 exceed_egress_quota` on a small free-plan
  allocation. Nhost **replaces the billing model** (5 GB free, 50 GB in Pro at
  $0.10/GB) but does **not** remove the egress cost itself.
- The catalog/details split already in `utils/perfumes.js` (light `select`
  without `info` JSONB) is the real egress fix and must be kept on Nhost.
- Risk of *increased* egress: **low** if the thin proxy preserves the current
  light catalog queries; **medium** if the proxy naively returns full rows.

## 9. Recommended architecture — and why

**Keep the custom auth + thin proxy in the existing Cloudflare Worker.**

```
Browser (existing SPA, unchanged)
   │  user= cookie, /api/* (unchanged surface)
   ▼
Cloudflare Worker (existing)
   ├─ mints short-lived Hasura JWT from the cookie (HS256 shared secret)
   ├─ translates /rest/v1/* → Hasura GraphQL
   └─ holds the Hasura admin secret server-side (never sent to browser)
   ▼
Nhost Hasura GraphQL → PostgreSQL
```

Why:

- Zero user-facing auth change (no re-registration, no password reset).
- bcrypt hashes and user ids are copied verbatim (proven).
- The frontend call surface stays identical, so the ~20 files need only a
  centralized proxy change, not a rewrite.
- The Worker already exists and already fronts `/api/*`; it is the natural
  place for JWT minting and GraphQL translation.
- Hasura permission rules give equivalent (and more granular) access control,
  with admin rights enforceable server-side.

Open decisions to confirm in the test phase (before any production move):
1. Nhost project region/plan.
2. Exact Nhost config key for the custom JWT secret (`hasura.jwtSecrets`).
3. Whether the browser is allowed to call Hasura directly (with user JWT) or
   only through the Worker (recommended).
