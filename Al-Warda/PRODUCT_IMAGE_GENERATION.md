# Product image generation

The Qogita image queue is driven by GitHub Actions. Flux Schnell receives a text
prompt for an empty background only; the original Qogita photo is segmented and
composited in the action. The original bottle RGB pixels are retained and the
source canvas is not cropped. Final PNG files are committed to the repository
under `public/assets/img/generated-products` and deployed as Cloudflare static
assets; no Supabase Storage bucket is used for new images. Queue state is stored
in the existing `stocks.info` JSON.
Public catalog products must also have
`info.contentGeneration.provider = "claude"`; products without that explicit
Claude provenance are hidden. Images are marked `completed` only after their
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

   GitHub Actions secrets are separate from Worker secrets. In the Cloudflare
   dashboard, open the deployed `al-warda` Worker, then **Settings → Variables
   and Secrets**, add `SUPABASE_SERVICE_ROLE_KEY` as a secret, and deploy the
   updated configuration. Alternatively, from the repository root, run
   `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` and enter the key at
   the prompt. `SUPABASE_SECRET_KEY` is also accepted as a server-side alias.
4. Deploy the Worker and open **Admin → Product images** to view progress or
   open GitHub Actions to manually dispatch the queue. The scheduled job runs
   daily at 00:20 UTC.

Never put service-role keys or Cloudflare tokens in Vite variables,
`wrangler.jsonc`, source code, or browser storage.

The admin image page can start or cancel GitHub Actions runs after the operator
enters a GitHub token with repository Actions read and write permissions. The
token remains in the current browser tab's memory and is sent only to the
same-origin control endpoint and GitHub's API. Do not share it in chat. Stop
cancels active runs, not the daily schedule. A cancelled run can leave a
processing item to be recovered on a later run.

If publication times out, records remain in `publishing` and the next workflow
run verifies them again before generating new images. If a generated file was
never committed, its record is marked failed and can be retried after the UTC
daily reset. Failed attempts still count against the daily quota.

## Daily quota and billing

The application attempts at most 160 backgrounds per UTC day, reserves an
estimated 38.4 Neurons per background (two Flux steps and a conservative
1024×1024 tile estimate), and stops at an estimated 9,000 Neurons. Failed
requests count as attempts and are eligible for retry after the next UTC reset.
Interrupted `processing` records can be resumed on a later run.

The application refuses to call Workers AI until the Free-plan confirmation
secret is set. It never enables or upgrades a Cloudflare plan. To maintain a $0
budget, keep the account on the Workers AI Free plan and account for other AI
workloads sharing the account quota; the application can enforce its own
estimate, but cannot inspect or control account billing or usage from other
projects.
