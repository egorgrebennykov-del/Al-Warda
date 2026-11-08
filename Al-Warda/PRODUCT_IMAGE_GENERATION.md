# Product image generation

The Qogita image queue is driven by GitHub Actions. Flux Schnell receives a text
prompt for an empty background only; the original Qogita photo is segmented and
composited locally in the action. The original bottle RGB pixels are retained,
the source canvas is not cropped, and the final lossless PNG is stored in
Supabase Storage. Queue state is stored in the existing `stocks.info` JSON.
Public catalog products must also have
`info.contentGeneration.provider = "claude"`; products without that explicit
Claude provenance are hidden. Images are published only after
`imageGeneration.status` becomes `completed`.

## One-time setup

1. Run [`supabase_product_image_queue.sql`](./supabase_product_image_queue.sql)
   in the Supabase SQL editor. It creates the public-read `product-images`
   bucket and marks existing rows with an original Qogita image as pending.
2. Add these GitHub Actions secrets:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN` (Workers AI inference permission only)
   - `CLOUDFLARE_WORKERS_AI_FREE_PLAN_CONFIRMED` set to `true` after verifying
     that the account is on the Free plan
3. Add these Cloudflare Worker secrets:
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy the Worker and open **Admin → Product images** to view progress or
   open GitHub Actions to manually dispatch the queue. The scheduled job runs
   daily at 00:20 UTC.

Never put service-role keys or Cloudflare tokens in Vite variables,
`wrangler.jsonc`, source code, or browser storage.

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
