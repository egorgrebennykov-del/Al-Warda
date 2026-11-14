# PERFORMANCE_POC — latency, payload and egress

Status: **BLOCKED.** Requires both a live Supabase and a live Nhost test project
with identical synthetic data. Supabase currently returns
`402 exceed_egress_quota`, so a like-for-like benchmark cannot be produced and
no numbers are fabricated here.

## Planned measurements (once unblocked)

On identical synthetic `stocks` data (light catalog columns only — **never the
full `info` JSONB in the catalog**):

- Light catalog query (Supabase PostgREST vs Nhost GraphQL via Worker)
- Product detail query (with `info`)
- Pagination (limit/offset)
- Repeated/cached requests
- Worker + GraphQL response latency and payload sizes

Record: HTTP response bytes, request count, latency (p50/p95), transferred
bytes, and the overhead of the GraphQL wrapper.

## Expected egress (honest)

No real metrics are available in this session, so **no monthly figure is
asserted**. The governing fact remains: egress is driven by payload size and
request count, and the existing catalog/details split (light `select` without
`info`) is what keeps it low. The thin proxy must preserve that light query;
naively returning full rows would raise egress.

## Tariffs (from nhost.io/pricing, 2026-11)

|          | Starter            | Pro                     |
| -------- | ------------------ | ----------------------- |
| Price    | $0                 | from $25/mo (+ compute) |
| Database | 1 GB               | 10 GB, then $0.20/GB    |
| Storage  | 1 GB               | 50 GB, then $0.05/GB    |
| Egress   | 5 GB               | 50 GB, then $0.10/GB    |
| Backups  | —                  | 7 days                  |
| Compute  | shared $15/vCPU/mo | dedicated $50/vCPU/mo   |

Overage never stops the project (pay-as-you-grow).

## Bottleneck assessment

- The **Supabase egress quota** is replaced by Nhost's metered egress; this does
  not remove egress cost, it changes the billing model.
- The real egress fix (already in `utils/perfumes.js`) is the light catalog
  select; the GraphQL wrapper adds a small fixed overhead per request, which
  must be measured but is not expected to dominate.
