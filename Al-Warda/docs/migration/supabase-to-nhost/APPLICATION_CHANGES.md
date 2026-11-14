# APPLICATION_CHANGES — replacing the PostgREST REST layer

## What must change

The app talks to Supabase exclusively through **raw PostgREST REST**
(`fetch` to `/rest/v1/<table>` with `apikey` + `Authorization` headers and
PostgREST query syntax). `@supabase/supabase-js` is declared but **never
imported**, so there is no SDK to swap — only the HTTP surface.

Nhost exposes **Hasura GraphQL**, not PostgREST. All of the following must be
re-pointed:

### Browser call sites (anon key → Hasura `public` role)

| File                           | Tables               | Endpoints used                                                                                               |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `utils/perfumes.js`            | `stocks`             | list (light select), `order=id.asc`, pagination, `info->imageGeneration->>status=eq.completed`, detail by id |
| `utils/auth.js`                | `user`               | select by email/firstname (`or=(email.ilike…)`), insert (register), patch (reset password)                   |
| `utils/cart.js`                | `cart`               | select by `user_id`, insert, patch (`id=eq.…`), delete                                                       |
| `utils/orders.js`              | `orders_in_progress` | insert, select by `user_id`, patch status                                                                    |
| `utils/inquiries.js`           | `inquiries`, `user`  | insert, select, patch, user lookup by id                                                                     |
| `utils/feedbacks.js`           | `feedbacks`          | insert, select, patch (`id=eq.…&user_id=eq.…`), delete                                                       |
| `utils/coupons.js`             | `coupons`            | select by code                                                                                               |
| `utils/announcements.js`       | `announcements`      | select                                                                                                       |
| `utils/getBookPicks.js`        | `book_picks`         | select                                                                                                       |
| `utils/getHomepageBooks.js`    | `books_on_home_page` | select                                                                                                       |
| `utils/getNewBooks.js`         | `new_books`          | select                                                                                                       |
| `utils/getDiscountSnapshot.js` | `discounts`          | select                                                                                                       |

### Server / Worker call sites (service key → Hasura admin)

| File                               | Tables                                     |
| ---------------------------------- | ------------------------------------------ |
| `server/productImageQueueAdmin.js` | `stocks`, `user`                           |
| `server/deepseekNotesService.js`   | `stocks`                                   |
| `server/descriptionQueue.js`       | `stocks`                                   |
| `server/catalogActionsService.js`  | `categories`, `perfumes`                   |
| `server/wardaAssistantService.js`  | via `fetchPerfumesFromSupabase` (`stocks`) |

### Scripts (GitHub Actions / manual)

`scripts/sync-stocks-supabase.js`, `sync_qogita_mov_prices.js`,
`researchPerfumeNotes.mjs`, `backfillFragranceNotes.mjs`,
`generate_product_images.py` (incl. RPC `update_stock_image_if_unchanged`),
`qogita_weekly_sync_upscayl.py`, `import_all_qogita_perfumes.py`, plus
diagnostic scripts (`dump_stocks.py`, `query_supabase.py`,
`find_gtin_stocks.py`, …) — all target `stocks`.

### Non-database Supabase usage

- `server/qogitaWorker.js` uses `SUPABASE_SECRET_KEY` only as a **session
  encryption secret** (not a DB call). Keep any stable secret, but rename the
  env var to avoid confusion.

## Recommended approach: PostgREST-compatible proxy in the existing Worker

The Cloudflare Worker (`server/worker.js`) already fronts `/api/*`. Add a
route that accepts the **current** PostgREST-style requests and translates them
to Hasura GraphQL. This keeps all 20+ call sites unchanged and centralizes the
migration in one file.

- Map `GET /rest/v1/<table>?select=…&filter=…&order=…&limit=…&offset=…` → a
  Hasura GraphQL `query`.
- Map `POST/PATCH/DELETE` → GraphQL `insert_<table>` / `update_<table>` /
  `delete_<table>` mutations; return the same row shapes the app expects.
- Replicate the PostgREST operators the app actually uses: `eq`, `ilike`,
  `or`, `order`, `limit/offset`, JSONB arrow operators
  (`info->imageGeneration->>status`), and `Prefer: return=representation`.
- Replace the headers: `apikey`/`Authorization: Bearer <key>` → Hasura
  `x-hasura-admin-secret` (server) or `Authorization: Bearer <Nhost JWT>` /
  `x-hasura-role: public` (browser).

### Alternative A — rewrite to Nhost GraphQL SDK

Cleaner long-term but touches every file above. Only choose this if you also
migrate auth to Nhost Auth and accept a larger review surface.

### Alternative B — self-host PostgREST against the Nhost Postgres

Keeps the REST API byte-compatible, but you operate an extra service and must
map JWT roles yourself.

## What NOT to do

- Do **not** delete `utils/*` Supabase code during preparation — keep the old
  integration behind a feature flag (`USE_NHOST`) until cutover.
- Do **not** change `PRODUCT_IMAGE_GENERATION.md`-documented image pipeline.

## Required behavior preservation checklist

- Registration / login / reset (bcrypt) — unchanged semantics.
- User profile, `privileged`/`admin` roles.
- Perfume catalog, search, filters, notes, details.
- Cart, orders-in-progress, status updates.
- Inquiries / messenger + EmailJS.
- Product images (repo static + legacy storage URLs).
- Admin panel (`/privileged`) product-image queue, descriptions, notes queues.
- Background jobs (GitHub Actions + Worker cron).
