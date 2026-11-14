# Product image generation

The Qogita image queue is driven by GitHub Actions. The pipeline uses the
previous Flux workflow: Flux 2 Klein re-photographs the original Qogita photo
into a studio product image, U2Net removes the background, the cutout is
centred on a transparent canvas, and the result is saved as PNG. The one
addition is **text preservation**: `restore_source_text_regions()` warps the
ORIGINAL label/logo/text pixels back onto the generated cutout via ORB +
homography, so Flux cannot invent or blur brand/name text. If the text cannot
be confidently restored, the job records `requiresManualReview` instead of
silently publishing invented text. Final PNG files are committed to the
repository under `public/assets/img/generated-products` and deployed as
Cloudflare static assets; no Supabase Storage bucket is used for new images.
Queue state is stored in the existing `stocks.info` JSON.
Public catalog products require a completed generated product image, regardless
of the text generation provider. Images are marked `completed` only after their
deployed bytes match the locally generated file. Existing completed images in
Supabase Storage remain supported.

## Image quality diagnostics

Every generation records these fields in `stocks.info.imageGeneration`
(`imageGenerationReplacement` for regenerations):

- `processingMethod` — `flux_redraw`;
- `whetherUpscaled` — whether the product was enlarged beyond its original
  resolution;
- `textRestored` — whether the original label/text was overlaid onto the result
  (only true when a non-empty projected text mask actually landed inside the
  opaque product area);
- `textMatchPoints` — number of ORB homography inliers used for text alignment;
- `textRestoreReason` — why restoration was skipped/failed (`empty_text_mask`,
  `homography_failed`, `insufficient_inliers`, `insufficient_matches`,
  `insufficient_orb_features`, or an `error:` prefix), null on success;
- `requiresManualReview` — set when text could not be restored confidently;
- `originalWidth` / `originalHeight` / `originalFileSize` — the real source
  photo dimensions and byte size;
- `processedWidth` / `processedHeight` — the final canvas size;
- `sharpness` — Laplacian variance of the product region (null if unavailable);
- `qualityStatus` — `ok`, `low_source_quality` (small original) or
  `low_sharpness`;
- `sourceImageId` — a short SHA-256 identifier of the source URL.

Small originals are kept at their native size and flagged
`low_source_quality` instead of being upscaled and presented as an improvement.
`SHARPNESS_THRESHOLD` (in `scripts/generate_product_images.py`) is a starting
value to be tuned on real photos.

## One-time setup

1. Make sure Cloudflare automatically deploys the `main` branch after a GitHub
   push, and GitHub Actions has permission to push to that branch. Generated
   files increase repository size; Cloudflare Free supports up to 20,000 static
   files per deployment and 25 MiB per file.
2. Add these GitHub Actions secrets:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN` (Workers AI inference permission only)
   - `CLOUDFLARE_WORKERS_AI_FREE_PLAN_CONFIRMED` set to `true` after verifying
     that the account is on the Free plan
3. Add these Cloudflare Worker secrets:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GITHUB_TOKEN` (Actions read/write on this repository)
   - `QOGITA_EXPORT_ACCOUNT_EMAIL` (the Qogita owner allowed to operate the queue)

   GitHub Actions secrets are separate from Worker secrets. In the Cloudflare
   dashboard, open the deployed `al-warda` Worker, then **Settings → Variables
   and Secrets**, add `SUPABASE_SERVICE_ROLE_KEY` as a secret, and deploy the
   updated configuration. Alternatively, from the repository root, run
   `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` and enter the key at
   the prompt. `SUPABASE_SECRET_KEY` is also accepted as a server-side alias.
   The controls require both the site's privileged user cookie and an active
   Qogita session for the configured owner, authenticated in Qogita connection
   settings. No GitHub token is entered or stored in the browser. Account
   credentials used by the workflow remain GitHub Actions secrets, separate
   from Cloudflare Worker secrets.
   For local development, set `GITHUB_TOKEN` (or `GH_TOKEN`),
   `QOGITA_EXPORT_ACCOUNT_EMAIL`, `SUPABASE_URL`, and a server-only
   `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) in the local server
   environment or `Al-Warda/.env`. Optionally set `QOGITA_SESSION_SECRET`;
   otherwise the server uses the Supabase secret to protect the session.
   Restart the server after changing these values and sign in to Qogita again
   in the connection settings. Do not commit the local secrets file.

4. Deploy the Worker and open **Admin → Product images** to view progress or
   open GitHub Actions to manually dispatch the queue. The scheduled job runs
   daily at 00:20 UTC. The manual dispatch accepts the maximum number of
   products to attempt in that run and can select one account or automatic
   rotation across all five. For each of `SECONDARY`, `THIRD`, `FOURTH`, and
   `FIFTH`, add GitHub Actions secrets `CLOUDFLARE_<NAME>_ACCOUNT_ID`,
   `CLOUDFLARE_<NAME>_API_TOKEN`, and
   `CLOUDFLARE_<NAME>_FREE_PLAN_CONFIRMED`. Set the last secret to `true`
   only after confirming that account's Free plan. Automatic rotation requires
   all five distinct accounts to be configured and confirmed.
   To replace previously completed images made by an older model, enable
   **Regenerate completed images from older models** on the generation page
   (or `regenerate_completed` when dispatching in GitHub). This mode processes
   those images instead of the pending queue. The original published image stays
   available until the replacement is deployed and its bytes are verified.
   After the stock record is updated, the workflow removes the replaced
   repository PNG if no stock references it, commits that deletion and deploys
   again. Shared images remain until no product references them. Older images
   in other storage locations require manual cleanup; they are not deleted by
   the workflow. Open search refreshes its product data every 30 seconds.
   The page also lists completed images, newest publication completion first.
   Times are displayed in the browser's local time zone; older records without a
   valid completion timestamp appear last with their time marked unavailable.
   Select repository-hosted images individually or all at once; delete up to
   400 in each run. The deletion
   workflow checks that each selected image is still current, hides the product
   until regeneration, and returns it to the queue. It removes unreferenced
   generated files in a separate commit. Other storage locations cannot be
   selected for deletion in the page. Wait for generation or another deletion
   to finish before submitting a deletion. If a batch fails, inspect its Actions
   log: unchanged selections may already have been deleted, while changed
   products are left untouched.
   The deletion workflow requires the service-role-only
   `update_stock_image_if_unchanged` function from
   [conditional_image_delete.sql](scripts/sql/conditional_image_delete.sql).
   Apply it in the Supabase SQL editor before deploying the workflow.

Qogita sessions use the provider's refresh cookie, encrypted in an HttpOnly
site cookie. Refresh is attempted when needed; Qogita can expire or revoke the
refresh token, in which case the owner must sign in again. Existing sessions
created before this feature must sign in once to receive a refresh token.

Never put service-role keys or Cloudflare tokens in Vite variables,
`wrangler.jsonc`, source code, or browser storage.

When running the Vite development server against the shared catalog, a
completed generated image may not yet exist in the local checkout. Vite serves
local files when present and redirects missing generated image files to the
published site. This development-only fallback does not apply to production.

If publication times out, records remain in `publishing` and the next workflow
run verifies them again before generating new images. If a generated file was
never committed, its record is marked failed and can be retried on a later run.
Stopping a run requests GitHub cancellation; the workflow attempts to commit and
publish completed files during cancellation. If cancellation is forced or the
runner is interrupted, uncommitted outputs may need regeneration.

## Daily quota and billing

The application does not impose a daily image or Neuron quota. In automatic
mode, a Cloudflare quota or rate-limit response moves the same image attempt to
the next account; if all accounts report a limit, the run fails visibly.
Authorization failures stop the run rather than being treated as quota errors.
Manual single-account mode stops on that account's limit. The scheduled run
uses automatic mode and defaults to 160 attempts. A failed or interrupted item
can be retried in a later run; an active processing item is not retried until
it becomes stale.

The application refuses to call Workers AI until the Free-plan confirmation
secret is set. It never enables or upgrades a Cloudflare plan. To maintain a $0
budget, keep the account on the Workers AI Free plan and account for other AI
workloads sharing the account quota. The application cannot verify the account's
actual plan, inspect billing, or guarantee that paid usage is disabled.
The interface does not currently retrieve account balances or remaining neurons.
Cloudflare documents that the daily allocation resets at 00:00 UTC.
