# STORAGE_MIGRATION — `product-images` bucket and references

## Current state

- Bucket `product-images`, **public** (`supabase_product_image_queue.sql`).
- Objects referenced only by public URL:
  `https://<host>/storage/v1/object/public/product-images/<path>`.
- New generated images are repo static assets served by Cloudflare; the bucket
  holds **legacy completed images** still referenced by some `stocks` rows.

Code refs: `utils/generatedProductImage.js` (detects/rebases storage URLs),
`scripts/qogita_weekly_sync_upscayl.py`, `tests/perfumeReadiness.test.js`,
`scripts/sql/…`.

## Plan

1. **List** every object in `product-images` (Supabase Storage API / CLI
   `supabase storage` or direct S3-compatible listing).
2. **Download** each object to a local staging folder, keeping the relative
   path, and record `sha256`.
3. **Upload** each object to the Nhost `product-images` public bucket,
   preserving the path.
4. **Verify** `sha256` on the Nhost side equals the source.
5. **Re-point** references: the code derives the host from `SUPABASE_URL`
   (`utils/generatedProductImage.js`), so switching the env to the Nhost base
   URL is enough; only hardcoded test fixtures need editing.

## File layout

```
tools/
  storage_list.mjs      # list + download objects, write objects.json (path → sha256)
  storage_upload.mjs    # upload to Nhost, verify sha256, write report.json
  storage_verify.mjs    # compare source vs destination checksums
```

## Idempotency & safety

- Never delete the source bucket.
- Re-running `storage_upload` skips objects whose checksum already matches.
- Log every object to `storage-migration.log`; on failure, continue-safe and
  report the missing list.

## References to update after cutover

| File                                    | Change                                                               |
| --------------------------------------- | -------------------------------------------------------------------- |
| `utils/generatedProductImage.js`        | base URL already derived — no code change                            |
| `tests/perfumeReadiness.test.js`        | replace hardcoded `mfvenfrmlkxqgvdtedet.supabase.co` with a variable |
| `scripts/qogita_weekly_sync_upscayl.py` | uses `SUPABASE_URL` var — no code change                             |
