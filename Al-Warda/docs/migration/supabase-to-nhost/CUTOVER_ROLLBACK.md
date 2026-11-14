# CUTOVER_ROLLBACK — switch-over and rollback plan

## Preconditions

- Test migration is fully green (`TEST_PLAN.md`).
- Live Supabase schema dump + full data dump exist and are checksum-verified.
- The app has been updated behind a `USE_NHOST` flag but still defaults to
  Supabase.

## Step-by-step cutover

1. **Final Supabase backup.** Take a fresh `pg_dump` and a Storage listing;
   record `sha256` of both. Keep the Supabase project running (do not pause).

2. **Sync the tail.** Run the data migration once more (full or incremental
   diff) to bring Nhost up to the latest Supabase state. Prefer a short
   maintenance window where writes are paused (see "Writes during cutover").

3. **Verify Nhost integrity.** Run `tools/verify_*.sql`, checksums, and the
   app behavior checklist against Nhost (staging build).

4. **Switch the app configuration.**
   - Deploy env change: `SUPABASE_URL` → Nhost base URL (and headers via the
     proxy / SDK), `SUPABASE_SERVICE_ROLE_KEY` → Hasura admin secret,
     `VITE_SUPABASE_ANON_KEY` → Nhost public JWT.
   - Flip `USE_NHOST=true` in the Worker and the frontend build.
   - Update GitHub Actions secrets (never remove the Supabase ones yet).

5. **Verify critical scenarios on production** (read-only first, then a
   controlled smoke test): catalog load, product page, login, cart, order
   creation, admin panel, images.

6. **Monitor.** Watch Worker logs, error rate, failed orders, missing images
   for the first 24–72 h. Keep Supabase available.

7. **Rollback if needed** (see below).

## Writes during cutover (avoid losing new records)

Choose **one**:

- **(Recommended) Short freeze:** disable checkout/inquiry writes for the
  duration of the final sync (minutes). Simplest and safest.
- **Dual-write:** during the transition, write new records to both systems;
  on rollback the Supabase copy is authoritative. More code, higher risk.

New records created after the last sync must be replayed into Nhost before the
switch is declared final.

## Rollback plan

1. Flip `USE_NHOST=false` and redeploy — the app returns to Supabase
   immediately (old integration is retained).
2. Restore GitHub Actions secrets to the Supabase values.
3. Replay any records written to Nhost during the trial back into Supabase
   (or accept them as test data — decide per record).
4. Keep the Supabase project **untouched and running** until the migration is
   confirmed stable for an agreed period (e.g. 1 week), then archive it.

## Finalization (after the agreed stabilization period)

- Point all remaining references at Nhost.
- Remove the `USE_NHOST` flag and the Supabase env/secrets.
- Archive (do not delete) the Supabase project.
