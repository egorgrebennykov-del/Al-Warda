# COST_ANALYSIS — Nhost cost and egress

Status: **Based on public pricing (2026-11) and repo facts; no real usage
metrics were available, so no invented monthly egress figure is given.**

## Current Al-Warda footprint (from the audit)

- ~16 tables; the catalog is `stocks` (~1,000+ rows with a large `info` JSONB,
  already split into a light catalog select).
- Generated product images are served by **Cloudflare static assets**, not
  Supabase/Nhost Storage; only legacy `product-images` bucket files remain.
- Backend is a Cloudflare Worker + GitHub Actions; no serverless Functions
  required on Nhost.

## Tariffs (nhost.io/pricing)

| Item      | Starter ($0)       | Pro (from $25/mo)        |
| --------- | ------------------ | ------------------------ |
| Database  | 1 GB               | 10 GB, $0.20/GB over     |
| Storage   | 1 GB               | 50 GB, $0.05/GB over     |
| Egress    | 5 GB               | 50 GB, $0.10/GB over     |
| Backups   | —                  | 7 days                   |
| PITR      | —                  | from $100                |
| Compute   | shared $15/vCPU/mo | dedicated $50/vCPU/mo    |
| Functions | 10 free            | 50, $5/50; $0.18/GB-hour |

Overage never stops the project.

## Expected fit

- Catalog size and storage are modest → **Pro** ($25/mo + shared compute) is the
  likely tier; Starter may suffice for the **test** project.
- Compute: the heavy lifting stays on Cloudflare Workers / GitHub Actions, so
  Nhost compute is minimal (Hasura only).
- Egress: the dominant variable. The light catalog select is the egress fix and
  must be preserved through the proxy.

## Cost of exceeding egress

- Beyond 50 GB in Pro: $0.10/GB. With 1,000+ catalog rows served as light
  rows, monthly egress is expected to be well under this, but this must be
  confirmed with real metrics during the test migration (no figure is asserted
  here).

## Verdict

- Nhost **replaces** Supabase's `exceed_egress_quota` hard stop with metered,
  never-stopping billing — operationally better, but not free of egress cost.
- Total expected cost is in the $25–$60/mo range; a paid plan is **not** to be
  selected until the test migration measures real database/egress usage.
