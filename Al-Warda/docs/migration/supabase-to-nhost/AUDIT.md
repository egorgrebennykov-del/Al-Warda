# AUDIT — Full Supabase usage inventory

Source of truth: repository files as of 2026-11-14. URL:
`https://mfvenfrmlkxqgvdtedet.supabase.co`. Publishable (anon) key is a public
constant in `README.md`, `wrangler.jsonc`, `utils/*` defaults and several
`scripts/*.py` — it is **not** a secret.

> ⚠️ **Access gap:** several tables are referenced by the code but their `CREATE`
> statements are **not** in the repository (`supabase_schema.sql` only defines
> `categories`, `perfumes`, `cart`, `orders`, `reviews`, `inquiries`). Their real
> columns/constraints live in the Supabase dashboard. A **live schema dump is
> mandatory** before any migration. Required permissions (not secrets to paste
> here): SQL Editor access, or a `pg_dump` connection string, or a
> service-role/session token for the Storage & Auth APIs.

## 1. PostgreSQL

### 1.1 Tables

| Table                       | Schema source         | Used by (code refs)                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.stocks`             | **Dashboard only**    | `utils/perfumes.js` (`/rest/v1/stocks`), `utils/generatedProductImage.js`, `server/productImageQueueAdmin.js`, `server/deepseekNotesService.js`, `server/descriptionQueue.js`, `scripts/*` (sync-stocks, sync_qogita_mov_prices, researchPerfumeNotes, backfillFragranceNotes, qogita_weekly_sync_upscayl, generate_product_images, dump_stocks, query_supabase, …) |
| `public.user`               | **Dashboard only**    | `utils/auth.js` (`/rest/v1/user`), `utils/inquiries.js`, `server/productImageQueueAdmin.js`                                                                                                                                                                                                                                                                         |
| `public.categories`         | `supabase_schema.sql` | `server/catalogActionsService.js`                                                                                                                                                                                                                                                                                                                                   |
| `public.perfumes`           | `supabase_schema.sql` | `server/catalogActionsService.js`                                                                                                                                                                                                                                                                                                                                   |
| `public.cart`               | `supabase_schema.sql` | `utils/cart.js`                                                                                                                                                                                                                                                                                                                                                     |
| `public.orders`             | `supabase_schema.sql` | (seeded; not used at runtime — see `orders_in_progress`)                                                                                                                                                                                                                                                                                                            |
| `public.orders_in_progress` | **Dashboard only**    | `utils/orders.js`                                                                                                                                                                                                                                                                                                                                                   |
| `public.reviews`            | `supabase_schema.sql` | (seeded only)                                                                                                                                                                                                                                                                                                                                                       |
| `public.inquiries`          | `supabase_schema.sql` | `utils/inquiries.js`, `server/wardaAssistantService.js`                                                                                                                                                                                                                                                                                                             |
| `public.feedbacks`          | **Dashboard only**    | `utils/feedbacks.js`                                                                                                                                                                                                                                                                                                                                                |
| `public.coupons`            | **Dashboard only**    | `utils/coupons.js`                                                                                                                                                                                                                                                                                                                                                  |
| `public.announcements`      | **Dashboard only**    | `utils/announcements.js`                                                                                                                                                                                                                                                                                                                                            |
| `public.book_picks`         | **Dashboard only**    | `utils/getBookPicks.js` (legacy book-shop)                                                                                                                                                                                                                                                                                                                          |
| `public.books_on_home_page` | **Dashboard only**    | `utils/getHomepageBooks.js` (legacy)                                                                                                                                                                                                                                                                                                                                |
| `public.new_books`          | **Dashboard only**    | `utils/getNewBooks.js` (legacy)                                                                                                                                                                                                                                                                                                                                     |
| `public.discounts`          | **Dashboard only**    | `utils/getDiscountSnapshot.js` (legacy)                                                                                                                                                                                                                                                                                                                             |

### 1.2 Known columns / types (from repo SQL + code)

- `stocks` (from code + `scripts/sql/proposal_catalog_columns.sql` + egress
  report): `id text`, `name`, `brand`, `price numeric`, `currency`, `image`,
  `info jsonb`, `slug`, `title`, `category`, `in_stock boolean`,
  `description`, plus proposed `min_order_quantity`, `gtin`,
  `notes_summary_ru`, `notes_summary_en`. `info` holds `rawImage`,
  `imageGeneration`/`imageGenerationReplacement`, `notes`, `notesVerified`,
  `notesSource`, `minOrderQuantity`, `unit`, `descriptionRu/En`, `gtin`, …
- `user`: `id` (uuid), `firstname`, `lastname`, `email`, `password_hash`
  (bcrypt, `$2a$`), `phone` (text[]), `adresses` (jsonb), `status` (text:
  `user`/`privileged`), `role` (jsonb array). See `utils/auth.js`.
- `categories`: `id text PK`, `name`, `slug unique`, `title`, `image`,
  `description`, `created_at`.
- `perfumes`: `id serial PK`, `slug unique`, `name`, `brand`, `category text
FK→categories(id) on delete cascade`, `notes_summary`, `price numeric(10,2)`,
  `currency`, `price_mdl`, `volume`, `concentration`, `gender`, `rating`,
  `reviews_count`, `is_best_seller`, `is_featured`, `in_stock`, `image`,
  `full_card_image`, `top_notes text[]`, `heart_notes text[]`,
  `base_notes text[]`, `description`, `created_at`.
- `cart`: `id serial PK`, `user_id uuid`, `perfume_id text`, `title`,
  `price`, `image`, `quantity int default 1`, `link`, `created_at`. No unique
  constraint on `(user_id, link)` (noted in query-optimization report).
- `orders`: `id serial PK`, `user_id uuid`, `customer_name`, `customer_email`,
  `customer_phone`, `delivery_address jsonb`, `items jsonb`, `total_amount`,
  `currency`, `status`, `created_at`.
- `orders_in_progress`: `id`, `user_id`, `content jsonb`, `status`, `link`,
  `created_at` (from `utils/orders.js`).
- `reviews`: `id serial PK`, `perfume_id text`, `user_name`, `rating int
1..5`, `comment`, `created_at`.
- `inquiries`: `id serial PK`, `user_id uuid`, `user_email`, `customer_name`,
  `message`, `status default 'open'`, `notifications_user int`, `created_at`.
- `feedbacks`, `coupons`, `announcements`, `book_picks`, `books_on_home_page`,
  `new_books`, `discounts`: columns unknown — must come from live dump.

### 1.3 Primary / foreign keys

- `perfumes.category → categories.id` (only explicit FK in repo SQL).
- Serial `id` PKs on `perfumes`, `cart`, `orders`, `reviews`, `inquiries`;
  text PK on `categories`; text `id` on `stocks`; uuid `id` on `user`.
- **Loose references** (no FK constraint in SQL): `cart.user_id`,
  `orders.user_id`, `inquiries.user_id`, `feedbacks.user_id`,
  `orders_in_progress.user_id` → `user.id`. Integrity is application-level —
  the migration verification must check these manually.

### 1.4 Indexes / views / materialized views / sequences / triggers

- **Indexes:** unknown from repo — must be dumped (`pg_dump --schema-only`).
  Known candidates: unique slugs (`categories.slug`, `perfumes.slug`).
- **Views / materialized views:** none referenced in repo.
- **Sequences:** implicit `serial` sequences for the 5 seeded tables +
  `stocks`/`user`/others — must be dumped and re-synced with `setval`.
- **Triggers:** none referenced in repo (must confirm via dump).

### 1.5 SQL functions / procedures

- `public.update_stock_image_if_unchanged(p_id text, p_expected_info jsonb,
p_expected_image text, p_info jsonb, p_image text) returns boolean` —
  plpgsql, `security invoker`, `set search_path=''`, granted only to
  `service_role`. Defined in `scripts/sql/conditional_image_delete.sql`.
  Called via `/rest/v1/rpc/update_stock_image_if_unchanged`
  (`scripts/generate_product_images.py#patch_stock`).

### 1.6 Extensions

- `uuid-ossp` (`supabase_schema.sql`). `pgcrypto`/`gen_random_uuid()` may be
  used elsewhere (verify via dump).

### 1.7 RLS policies

Enabled + policies in `supabase_schema.sql` for `categories`, `perfumes`,
`cart`, `orders`, `reviews`, `inquiries`:

- `categories`: `select using(true)` (public read).
- `perfumes`: `select using(true)`.
- `reviews`: `select using(true)`.
- `cart`: `for all using(true) with check(true)` (open to anon).
- `orders`: `insert with check(true)`; `select using(true)`.
- `inquiries`: `insert with check(true)`; `select using(true)`.

**Unknown RLS:** `stocks`, `user`, `orders_in_progress`, `feedbacks`,
`coupons`, `announcements`, and legacy tables — must be dumped. The frontend
reads/writes them with the **anon/publishable key**, so RLS must currently
permit anon. Server scripts use the **service-role key**, which bypasses RLS.

### 1.8 Roles / grants

- `anon` (publishable key) — used by all frontend REST calls.
- `service_role` (service key) — used by GitHub Actions, the Worker and sync
  scripts for writes and the RPC function.
- `authenticated` — referenced in the RPC `revoke` but **not used** by the app
  (no Supabase Auth session).

## 2. Supabase Auth

- **Not used.** No `supabase.auth`, no `auth.users`, no JWT from Supabase Auth.
- The app has its **own** auth on `public.user`:
  - `register()` → `POST /rest/v1/user` with `firstname, lastname, email,
password_hash (bcryptjs, cost 10), phone[], status='user', role=['user']`
    (`utils/auth.js`).
  - `login()` → `findByEmail()` (select by email/firstname) +
    `bcrypt.compare`; session is a `user=` cookie (7 days), not a Supabase JWT.
  - Password reset → 6-digit code via EmailJS, then `PATCH
/rest/v1/user` `password_hash` (`resetPasswordByEmail`).
  - Roles: `status` (`user`/`privileged`) + `role` jsonb array
    (`user/vip/developer/admin`), resolved in `resolveUserRoles()`.

## 3. Supabase Storage

- Bucket: `product-images` (public) — `supabase_product_image_queue.sql`.
- Object URL pattern: `/storage/v1/object/public/product-images/…`
  (`scripts/qogita_weekly_sync_upscayl.py`, `utils/generatedProductImage.js`,
  `tests/perfumeReadiness.test.js`).
- **Current reality** (`PRODUCT_IMAGE_GENERATION.md`): new generated images are
  committed to the repo under `public/assets/img/generated-products` and
  served by Cloudflare; the Storage bucket is kept for **legacy completed
  images** which remain referenced by some catalog rows.
- No Storage SDK calls (`storage.from`) — only URL references.

## 4. Other services

| Service             | Status                                                                                                        | Ref                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Realtime            | **Not used** (only mentioned in docs as a future idea)                                                        | `SUPABASE_QUERY_OPTIMIZATION_REPORT.md`                               |
| Edge Functions      | **None** — backend is a Cloudflare Worker + local Node server                                                 | `server/worker.js`, `server/index.js`                                 |
| Database Webhooks   | None found                                                                                                    | —                                                                     |
| pg_cron             | None found                                                                                                    | —                                                                     |
| Cron                | Cloudflare Worker cron `"0 3 * * *"` (not Supabase)                                                           | `wrangler.jsonc`                                                      |
| Webhooks (incoming) | Qogita webhook handled by the Worker (HMAC)                                                                   | `server/qogitaWorker.js`, `server/qogitaClient.js`                    |
| GitHub Actions      | 7 workflows (see below)                                                                                       | `.github/workflows/*.yml`                                             |
| Secrets             | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY` (alias), `VITE_SUPABASE_ANON_KEY` (public) | workflows, `wrangler.jsonc`, `.env`, `scripts/generate-worker-env.js` |

### 4.1 GitHub Actions workflows

| Workflow                       | Supabase usage                                            |
| ------------------------------ | --------------------------------------------------------- |
| `brand-sync.yml`               | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`/`SECRET_KEY` |
| `full-database-refresh.yml`    | same (danger-zone per `AGENTS.md`)                        |
| `product-image-delete.yml`     | same + image deletion RPC                                 |
| `product-image-generation.yml` | same (image pipeline)                                     |
| `qogita-smart-sync.yml`        | same                                                      |
| `sync-huf-rate.yml`            | same (currency rate)                                      |
| `sync-ron-rate.yml`            | same                                                      |

## 5. Access-pattern summary

- **Transport:** raw PostgREST REST via `fetch`, headers
  `apikey: <key>` + `Authorization: Bearer <key>` + `Prefer:
return=representation`. PostgREST query syntax is used extensively
  (`?select=…&id=eq.…&order=…&limit=…&offset=…`, JSONB operators like
  `info->imageGeneration->>status=eq.completed`).
- **`@supabase/supabase-js` is declared in `package.json` but never imported**
  in application code (verified: zero `createClient`/`supabase-js` references).
- Tables hit by the **browser** (anon key): `stocks`, `user`, `cart`,
  `orders_in_progress`, `inquiries`, `feedbacks`, `coupons`, `announcements`,
  `book_picks`, `books_on_home_page`, `new_books`, `discounts`.
- Tables hit by the **server/Worker** (service key): `stocks`, `user`,
  `categories`, `perfumes`, `inquiries`.
