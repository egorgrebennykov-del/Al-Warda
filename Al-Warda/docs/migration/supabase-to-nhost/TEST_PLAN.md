# TEST_PLAN — test migration into a separate Nhost project

> Run only after explicit owner approval. Production Supabase and the live app
> are **not** touched by this plan.

## 1. Create an isolated test project

1. Create a **new** Nhost project (free tier) in a non-production region.
2. Enable Hasura GraphQL and Auth.
3. Do **not** connect it to production domains or the production Worker.

## 2. Copy a data snapshot

1. Run `pg_dump` from Supabase (see `DATA_MIGRATION.md`).
2. Restore into the test project (`nhost db import`).
3. Reconcile sequences (`setval`).
4. Copy `product-images` bucket objects (see `STORAGE_MIGRATION.md`).
5. Re-create Hasura permission rules (anon read/write parity).

## 3. Verify (all must pass)

### Data

- [ ] Row count per table matches Supabase (run `tools/verify_counts.sql` on both).
- [ ] Spot-check key rows (id, name, brand, price) are identical.
- [ ] No orphan references: every `cart.user_id`, `orders.user_id`,
      `inquiries.user_id`, `feedbacks.user_id`, `orders_in_progress.user_id`
      exists in `user`; every `perfumes.category` exists in `categories`.
- [ ] Sequences: next `serial` id > current max id (no renumbering).
- [ ] `stocks.info` JSONB spot-checked byte-identical for sample rows.

### Files

- [ ] Object count matches.
- [ ] Every object `sha256` matches (source vs Nhost).

### Auth

- [ ] `user` row count matches.
- [ ] Sample `password_hash` verified with `bcrypt.compare` on test accounts.
- [ ] Login / register / reset smoke tests pass against the test backend.

### App behavior (point a **staging** build at the test project)

- [ ] Catalog lists and product details load.
- [ ] Search + notes filters work.
- [ ] Cart add/update/delete works for anon and logged-in users.
- [ ] Order creation and admin order-status update work.
- [ ] Inquiries / messenger save and load.
- [ ] Product images render (repo static + legacy storage URLs).
- [ ] `/privileged` admin panel loads queues and can read/write `stocks`.

### Background

- [ ] Worker cron and a dry GitHub Actions run read/write the **test** project
      only (do not run `full-database-refresh` — see `AGENTS.md`).

## 4. Document discrepancies

Any mismatch goes into a `DISCREPANCIES.md` with the table, expected vs actual,
and root cause. The test migration is **not** considered successful until all
checks above pass.

## 5. Decision gate

Only after a fully green test migration is the cutover plan (next document)
authorized.
