# DATA_MIGRATION — PostgreSQL data, keys, sequences and relations

## Goal

Move every PostgreSQL record with **no loss** and **no renumbering**, preserving
primary keys, foreign keys, sequences, JSONB payloads and logical references.

## 1. Export from Supabase

Use `pg_dump` (not PostgREST paging) so schema + data + sequences + functions
travel together. PostgREST cannot dump schema/sequences.

```bash
pg_dump "$SUPABASE_DB_URL" \
  --no-owner --no-acl \
  --format=custom \
  --file=supabase-full.dump
```

Also export a human-readable schema for review:

```bash
pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner --file=schema.sql
```

> The DB connection string is obtained from Supabase **Database settings**.
> It is a secret — never commit it or echo it in logs.

## 2. Restore into Nhost

Nhost exposes a Postgres connection; use `nhost db` or plain `psql`.

```bash
pg_restore --dbname="$NHOST_DB_URL" --no-owner --no-acl --exit-on-error \
  supabase-full.dump
```

Then reconcile sequences (do this **after** restoring data so `setval` uses the
max existing id):

```sql
-- per serial table, e.g.:
SELECT setval(pg_get_serial_sequence('public.perfumes','id'),
              COALESCE((SELECT MAX(id) FROM public.perfumes), 1));
-- …repeat for cart, orders, reviews, inquiries and any other serial column.
```

## 3. Data categories and preservation rules

| Data                                                                                                                          | How                                        | Preservation                              |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| Table rows                                                                                                                    | `pg_dump`/`pg_restore`                     | 100% rows, all columns                    |
| Primary keys                                                                                                                  | dump/restore                               | unchanged ids                             |
| Foreign keys (`perfumes.category→categories.id`)                                                                              | dump/restore                               | constraint + values preserved             |
| Logical references (`cart.user_id`, `orders.user_id`, `inquiries.user_id`, `feedbacks.user_id`, `orders_in_progress.user_id`) | dump/restore (no FK constraint)            | values preserved; verified by join checks |
| Sequences                                                                                                                     | `setval` after restore                     | next ids continue correctly               |
| JSONB (`stocks.info`, `orders.items`, `orders_in_progress.content`, `user.adresses`, `user.role`)                             | dump/restore                               | byte-for-byte                             |
| Functions (`update_stock_image_if_unchanged`)                                                                                 | dump/restore                               | grants re-applied manually (see below)    |
| Extensions (`uuid-ossp`)                                                                                                      | `create extension` in Nhost                | enabled                                   |
| RLS policies                                                                                                                  | **not** carried by `pg_restore --no-owner` | re-created as Hasura permissions          |

Re-grant the RPC function on Nhost:

```sql
revoke all on function public.update_stock_image_if_unchanged(text, jsonb, text, jsonb, text) from public;
grant execute on function public.update_stock_image_if_unchanged(text, jsonb, text, jsonb, text) to service_role;
-- Nhost: the "service_role"-equivalent is the Hasura admin secret (bypasses
-- Postgres roles), so grant to the postgres/hasura role actually used.
```

## 4. Verification (run after every restore)

Prepared scripts in `tools/`:

- `verify_counts.sql` — row counts per table, compared to a Supabase snapshot.
- `verify_keys.sql` — missing PKs, and orphan `user_id`/`perfume_id`/`category`
  references.
- `verify_sequences.sql` — sequence `last_value` ≥ max(id) per serial table.

## 5. Idempotency, logging, resume

- Restore into a **fresh, empty** Nhost schema on each attempt (drop schema
  `public` and re-create) so a rerun never double-inserts.
- Log every `pg_restore`/`psql` invocation to `migration.log`; on failure the
  script reports the step and can be re-run from scratch.
- Store checksums of the dump file (`sha256`) and compare after download to
  detect a truncated export.

## 6. Things that are NOT data but must be migrated

- **Storage files** → see `STORAGE_MIGRATION.md`.
- **Users/password hashes** → see `AUTH_MIGRATION.md`.
- **RLS → Hasura permissions** → see `COMPATIBILITY.md` / `TEST_PLAN.md`.
