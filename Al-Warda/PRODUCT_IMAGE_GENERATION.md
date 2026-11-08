# Product image generation

The Qogita image queue is driven by GitHub Actions. Flux 2 Klein edits the
original Qogita photo into a three-dimensional studio product image, using the
original as a reference. U2Net removes the background from the edited image;
the final PNG retains transparency so the product sits on the site's background.
Generative editing and segmentation can change labels, details or edges; review
the output against the original before relying on it. Final PNG files are committed to the repository
under `public/assets/img/generated-products` and deployed as Cloudflare static
assets; no Supabase Storage bucket is used for new images. Queue state is stored
in the existing `stocks.info` JSON.
Public catalog products require a completed generated product image, regardless
of the text generation provider. Images are marked `completed` only after their
deployed bytes match the locally generated file. Existing completed images in
Supabase Storage remain supported.

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
   products to attempt in that run and can select a secondary Cloudflare
   account. To enable the secondary account, set GitHub Actions secrets
   `CLOUDFLARE_SECONDARY_ACCOUNT_ID`, `CLOUDFLARE_SECONDARY_API_TOKEN`, and
   `CLOUDFLARE_SECONDARY_FREE_PLAN_CONFIRMED` (set to `true` only after
   confirming its Free plan).
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

Never put service-role keys or Cloudflare tokens in Vite variables,
`wrangler.jsonc`, source code, or browser storage.

If publication times out, records remain in `publishing` and the next workflow
run verifies them again before generating new images. If a generated file was
never committed, its record is marked failed and can be retried on a later run.
Stopping a run requests GitHub cancellation; the workflow attempts to commit and
publish completed files during cancellation. If cancellation is forced or the
runner is interrupted, uncommitted outputs may need regeneration.

## Daily quota and billing

The application does not impose a daily image or Neuron quota. Each run attempts
up to the selected batch size, stopping when Cloudflare reports a quota or rate
limit. The scheduled run defaults to 160 attempts. A failed or interrupted item
can be retried in a later run; an active processing item is not retried until
it becomes stale.

The application refuses to call Workers AI until the Free-plan confirmation
secret is set. It never enables or upgrades a Cloudflare plan. To maintain a $0
budget, keep the account on the Workers AI Free plan and account for other AI
workloads sharing the account quota. The application cannot verify the account's
actual plan, inspect billing, or guarantee that paid usage is disabled.
