# Al-Warda: Supabase → Nhost migration

> **STATUS: PREPARATION ONLY.** Nothing in this folder has been executed.
> Production Supabase is untouched. No data has been copied. The application
> has not been switched. Await explicit owner approval before any test
> migration.

This folder contains the full technical plan for migrating Al-Warda from
Supabase to [Nhost](https://nhost.io/) with no data loss.

## Documents

| File                     | Contents                                                                  |
| ------------------------ | ------------------------------------------------------------------------- |
| `AUDIT.md`               | Complete inventory of every Supabase feature in use, with code references |
| `COMPATIBILITY.md`       | Per-component compatibility with Nhost and the required changes           |
| `DATA_MIGRATION.md`      | Strategy to move every PostgreSQL record, key, sequence and relation      |
| `AUTH_MIGRATION.md`      | Users and password-hash migration (custom `user` table, bcrypt)           |
| `STORAGE_MIGRATION.md`   | `product-images` bucket and file reference migration                      |
| `APPLICATION_CHANGES.md` | Every call site (`/rest/v1/…`) and how to replace it                      |
| `TEST_PLAN.md`           | Test-migration procedure and verification checks                          |
| `CUTOVER_ROLLBACK.md`    | Switch-over and rollback plan                                             |
| `ESTIMATE.md`            | Scope, risks and blockers                                                 |
| `README.md`              | This file — execution order and summary table                             |
| `tools/`                 | Prepared (not yet run) export / import / verify scripts                   |

## Execution order (all gated on owner approval)

1. `AUDIT.md` — confirm the inventory (requires live Supabase access).
2. `COMPATIBILITY.md` — freeze the target architecture decision.
3. `DATA_MIGRATION.md` + `tools/` — prepare and dry-run export.
4. `AUTH_MIGRATION.md` + `STORAGE_MIGRATION.md` — prepare user/file moves.
5. `APPLICATION_CHANGES.md` — implement behind a flag (do NOT remove Supabase).
6. `TEST_PLAN.md` — run a test migration into a separate Nhost project.
7. `CUTOVER_ROLLBACK.md` — cutover only after the test migration passes.

## Summary table

| Component  | Found in repo                                                                                                                                                                                                                                               | Nhost target                                | Compatibility                  | What is required                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| PostgreSQL | 14+ tables (`stocks`, `user`, `categories`, `perfumes`, `cart`, `orders`, `orders_in_progress`, `reviews`, `inquiries`, `feedbacks`, `coupons`, `announcements`, `book_picks`, `books_on_home_page`, `new_books`, `discounts`), `uuid-ossp`, 1 RPC function | Nhost Postgres (same engine)                | ✅ Full (plain Postgres)       | `pg_dump` → `nhost db` restore; live schema dump (several tables are not in repo SQL) |
| Auth       | Custom `public.user` table + `bcryptjs` + EmailJS + cookie session. **No Supabase Auth**                                                                                                                                                                    | Nhost Auth (optional) or keep custom        | ✅ Passwords portable (bcrypt) | Keep `user` table as-is (zero password reset) OR map to `auth.users`                  |
| Storage    | `product-images` public bucket; referenced by URL only                                                                                                                                                                                                      | Nhost Storage (S3)                          | ✅ Compatible                  | Copy objects + update base URL                                                        |
| RLS        | Enabled on 6 seeded tables; `stocks`/`user` unknown (must dump)                                                                                                                                                                                             | Hasura permissions (not Postgres RLS)       | ⚠️ Different model             | Map policies to Hasura permission rules                                               |
| Realtime   | Not used in code                                                                                                                                                                                                                                            | Nhost GraphQL subscriptions                 | ✅ Not needed                  | None                                                                                  |
| Functions  | None (backend = Cloudflare Worker + Node)                                                                                                                                                                                                                   | Keep Cloudflare Worker                      | ✅ Unchanged                   | None                                                                                  |
| Secrets    | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_ANON_KEY`                                                                                                                                                                | Nhost subdomain / Hasura admin secret / JWT | ⚠️ Rename/remap                | Update env + GitHub Actions secrets                                                   |

## Bottom-line answers (details in the documents)

1. **Can all data be migrated?** Yes — PostgreSQL data, keys and sequences via
   `pg_dump`/`setval`; files via Storage copy. Prerequisite: live Supabase
   access (SQL editor or `pg_dump` credentials) because several table schemas
   live only in the dashboard.
2. **Can user IDs be preserved?** Yes — copy `public.user` rows verbatim (and
   sequences via `setval`).
3. **Can passwords be preserved without reset?** Yes — the app stores bcrypt
   hashes in `public.user.password_hash`; Nhost Auth is also bcrypt-compatible.
   Verification against real hashes is required before promising this in
   production.
4. **Can files and links be preserved?** Yes — copy the bucket; the only
   change is the URL host, which is already derived from `SUPABASE_URL` in code.
5. **What must be rewritten?** The PostgREST REST access layer
   (`/rest/v1/…` in ~20 `utils/*` + `server/*`). Nhost exposes GraphQL, not
   PostgREST — see `APPLICATION_CHANGES.md` for the recommended thin
   compatibility layer.
6. **Data-loss risk?** Low for DB (dump/restore + verify). Medium for live
   writes during cutover (mitigated by the dual-write/freeze step).
7. **Stages for a safe switch?** 7 — see `CUTOVER_ROLLBACK.md`.
