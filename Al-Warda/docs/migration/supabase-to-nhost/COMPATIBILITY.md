# COMPATIBILITY — Supabase ↔ Nhost

## What Nhost provides

Nhost = **Postgres** (same engine as Supabase) + **Hasura GraphQL** (not
PostgREST) + **Nhost Auth** (Hasura Auth) + **Storage** (S3-compatible) +
**Functions** (serverless, optional). Nhost does **not** natively expose
PostgREST.

## Component-by-component

### PostgreSQL — ✅ Fully compatible

Plain Postgres. Tables, columns, constraints, indexes, `serial` sequences,
`uuid-ossp`/`pgcrypto` extensions, plpgsql functions (`update_stock_image_if_unchanged`)
and data all port via `pg_dump` → `nhost db import` / `psql`. No rewrite.
Sequence values are preserved explicitly with `setval`.

### RLS → Hasura permissions — ⚠️ Different model, manual mapping

- Supabase enforces RLS inside Postgres (per `anon`/`authenticated`/
  `service_role` roles). Hasura **ignores Postgres RLS** and enforces its own
  **permission rules** (role → select/insert/update/delete on table +
  columns + row predicates).
- Mapping table:

| Supabase policy                        | Hasura rule                              |
| -------------------------------------- | ---------------------------------------- |
| `select using(true)`                   | role `public` → select allow (no filter) |
| `insert with check(true)`              | role `public` → insert allow             |
| `for all using(true) with check(true)` | role `public` → all allow                |
| service-role bypass                    | `admin` role (x-hasura-admin-secret)     |
| anon key                               | `public` role (no auth header)           |

- Risk: the browser currently does open anon writes (cart, inquiries, orders,
  feedbacks). Replicating "open anon write" in Hasura is possible but is a
  security downgrade to review explicitly during migration.

### PostgREST REST API — ⚠️ Largest change

Nhost exposes **GraphQL**, not `GET /rest/v1/…`. The app never uses the
Supabase SDK, so the surface to replace is the **raw REST + PostgREST query
syntax** (`?select=`, `id=eq.`, `order=`, JSONB operators, `Prefer:
return=representation`).

Three options (details in `APPLICATION_CHANGES.md`):

1. **Thin compatibility proxy (recommended):** keep the existing
   `fetch("/rest/v1/…")` call sites and add a Cloudflare-Worker route (the
   Worker already exists) that translates PostgREST-style requests into Hasura
   GraphQL. Smallest code churn, one place to change.
2. **Rewrite to Nhost SDK / GraphQL:** correct long-term, but touches ~20
   `utils/*` + `server/*` files and re-implements filters/pagination.
3. **Self-host PostgREST pointed at the Nhost Postgres connection string:**
   keeps the REST API byte-for-byte, but adds an extra component to operate and
   JWT/role mapping complexity.

### Auth — ✅ Passwords portable

- Supabase Auth is **not used**; the app's custom `public.user` table is just
  data. Copying it verbatim preserves users **and bcrypt hashes**, so **no
  password reset is required**.
- If moving to Nhost Auth later, Nhost `auth.users.password_hash` also uses
  bcrypt, so the same `$2a$` hashes are accepted — but this needs a one-time
  user-table → `auth.users` copy and re-linking `user_id` references.

### Storage — ✅ Compatible

- `product-images` is a public bucket. Nhost Storage has public buckets with a
  different URL host. Files copy 1:1; only the URL base changes, and the base
  is already derived from `SUPABASE_URL` in `utils/generatedProductImage.js`.
- Legacy URL regexes that hardcode `supabase.co` (tests) must be updated.

### Realtime — ✅ Not used

Nothing to migrate. If needed later, Nhost offers GraphQL subscriptions.

### Functions / backend — ✅ Unchanged

No Supabase Edge Functions. The Cloudflare Worker (`server/worker.js`), the
local Node server and all GitHub Actions stay; only their env vars/secrets
change.

### Secrets — ⚠️ Rename/remap

| Supabase                                            | Nhost                                            |
| --------------------------------------------------- | ------------------------------------------------ |
| `SUPABASE_URL`                                      | `NHOST_SUBDOMAIN` (or `NHOST_GRAPHQL_URL`)       |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` | Hasura admin secret (Nhost `NHOST_ADMIN_SECRET`) |
| `VITE_SUPABASE_ANON_KEY`                            | Nhost public JWT / `x-hasura-role=public` header |

## Effort estimate per area

| Area                     | Effort                                |
| ------------------------ | ------------------------------------- |
| PostgreSQL data + schema | Low (dump/restore)                    |
| RLS → Hasura permissions | Low–medium (config, no code)          |
| REST → GraphQL/proxy     | **High** (largest code change)        |
| Auth users               | Low (table copy; zero password reset) |
| Storage                  | Low                                   |
| Secrets/CI               | Low                                   |

## Blockers / unknowns before proceeding

1. **Live Supabase schema dump** — needed for `stocks`, `user`,
   `orders_in_progress`, `feedbacks`, `coupons`, `announcements`,
   `book_picks`, `books_on_home_page`, `new_books`, `discounts`, their RLS,
   indexes and sequences.
2. **Decision on the REST layer** (proxy vs GraphQL rewrite vs self-hosted
   PostgREST) — this drives the application-changes effort.
3. **Nhost plan/region** — pick a Postgres region and confirm Hasura is
   enabled and the `public` role configuration.
