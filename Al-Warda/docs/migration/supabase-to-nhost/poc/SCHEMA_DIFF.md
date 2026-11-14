# SCHEMA_DIFF — findings from `al_warda_import.sql`

Source file: `Al-Warda/Al-Warda/al_warda_import.sql` (10.3 MB, plain SQL, data-only
`INSERT`s wrapped in `BEGIN … COMMIT`). Header: "import data from Supabase export…
preserves original UUIDs, skips rows with conflicting keys". **No `CREATE TABLE`**
statements — the Nhost tables must already exist (or be created) before import.

## Tables present in the export (with data)

| #   | Table                | Rows     | Columns (from INSERT)                                                                      |
| --- | -------------------- | -------- | ------------------------------------------------------------------------------------------ |
| 1   | `user`               | 2        | `created_at, firstname, lastname, email, password_hash, adresses, id, phone, status, role` |
| 2   | `coupons`            | 1        | `id, created_at, starts_at, ends_at, code, name, action`                                   |
| 3   | `stocks`             | **5063** | `id, created_at, name, image, description, brand, price, info`                             |
| 4   | `announcements`      | 1        | `id, created_at, user_id, content_ru, content_en, starts_at, until`                        |
| 5   | `cart`               | 1        | `created_at, link, price, image, title, shop, quantity, id, user_id`                       |
| 6   | `inquiries`          | 1        | `id, created_at, interlocutors_info, chat, notifications_admin, notifications_user`        |
| 7   | `orders_in_progress` | 2        | `id, created_at, user_id, content, status, link`                                           |

Tables from the task list that are **NOT in the export** (empty or no rows):
`feedbacks`, `new_perfumes`, `discounts`, `perfume_picks`,
`perfumes_on_home_page`, `order_coupons` (and `perfumes`, `categories`,
`orders`, `reviews` from the repo seed SQL).

## Key discoveries

### 1. `stocks.id` is NUMERIC, not text

Sample rows: `6860`, `5031`, `4814`, `9374` — integer-like ids. The earlier
repo-based audit assumed `id text`; that was wrong. The app filters by numeric
id in several scripts (`id=eq.5333`, etc.).

### 2. `stocks` real columns are 8, not the 11 the app queries

Export columns: `id, created_at, name, image, description, brand, price, info`.

But `utils/perfumes.js` (light catalog) selects
`id, slug, name, title, brand, category, price, currency, image, in_stock,
description`. Therefore `slug`, `title`, `category`, `currency`, `in_stock`
are **either missing from the real table or were omitted by the exporter**.
This must be resolved against the live Supabase schema — see blocker below.
`proposal_catalog_columns.sql` (marked "NOT EXECUTED") already flags that some
of these fields live only inside `info` and were proposed as top-level columns.

### 3. `user.password_hash` is bcrypt `$2b$10$…`

Confirmed from the export (`$2b$10$r6vB0…`). Compatible with Nhost Auth's bcrypt
(`$2a$`/`$2b$`), so passwords can be preserved **without forced reset**, subject
to a test verification. `role` is stored as JSON (array), `adresses` as JSON.

### 4. `orders_in_progress.content` / `inquiries.chat` are JSONB

Confirmed by the export's `::json` casts and `content`/`chat` columns.

## What this means for import

- The Nhost target tables must be created with the exact columns above (plus the
  app-required `stocks` columns) before running `al_warda_import.sql`.
- Exact column **types** are not in this data-only export; they must come from
  the live Supabase schema (`pg_dump --schema-only`) or be confirmed manually.
