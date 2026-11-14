# BACKUP_POC — backup, export, restore, rollback

Status: **DESCRIBED** (no restore performed; nothing executed).

## Nhost backups

- Nhost Pro provides **automated daily backups** (7 days retention); PITR is an
  add-on (from $100). Restore is done from the dashboard.
- Postgres is a normal PostgreSQL: full export/import is available at any time
  via `pg_dump`/`pg_restore` using the Nhost database connection string
  (`nhost db` or the dashboard). No vendor lock-in (Nhost FAQ confirms full
  access to database and storage).

## Procedures

1. **Backup** — daily automated (Pro), plus a manual `pg_dump -Fc` snapshot
   before any migration step.
2. **Export PostgreSQL** — `pg_dump "$NHOST_DB_URL" --format=custom` (see
   `../tools/export_pg.sh`, adapted to the Nhost connection string).
3. **Restore** — `pg_restore --dbname=... --exit-on-error`, then `setval` the
   serial sequences (see `../tools/import_nhost.sh`).
4. **Verify restore** — `../tools/verify_counts.sql`, `verify_keys.sql`,
   `verify_sequences.sql`; spot-check key rows and `info` JSONB.
5. **Storage files** — list/download with checksums
   (`../tools/storage_list.mjs`), re-upload and verify (`storage_upload.mjs`).
6. **Rollback to Supabase** — keep the Supabase project running and untouched;
   the app reverts by flipping the feature flag back (old Supabase integration
   is retained). Replay any writes made to Nhost during the trial.

## Safety

- Never restore over existing production data; always into a fresh schema or a
  separate test project.
- Do not drop the Supabase project until the migration is confirmed stable.
