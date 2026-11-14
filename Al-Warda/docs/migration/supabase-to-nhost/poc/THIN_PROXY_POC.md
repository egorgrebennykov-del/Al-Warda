# THIN_PROXY_POC — PostgREST → Hasura GraphQL translation

Status: **PREPARED; mock-tested; NOT PROVEN against real Hasura.**

`poc/thin_proxy_translator.mjs` translates the PostgREST-style requests the
Al-Warda app sends into Hasura GraphQL text. `poc/thin_proxy_translator.test.mjs`
exercises the translation logic against a stub only.

## Architecture

```
Browser (unchanged /rest/v1/* fetches)
   └─ Cloudflare Worker (thin proxy)
         ├─ verify user= cookie → mint short-lived Hasura JWT (HS256)
         ├─ translate PostgREST request → Hasura GraphQL
         └─ forward with Authorization: Bearer <JWT>  (or admin secret server-side)
   └─ Nhost Hasura GraphQL → PostgreSQL
```

## Operator mapping (prepared)

| PostgREST                                           | GraphQL                                             |
| --------------------------------------------------- | --------------------------------------------------- |
| `?select=a,b`                                       | query field selection                               |
| `id=eq.10`                                          | `where: { id: { _eq: 10 } }`                        |
| `id=neq.5`                                          | `where: { id: { _neq: 5 } }`                        |
| `email=ilike.x`                                     | `where: { email: { _ilike: "x" } }`                 |
| `or=(a.ilike.x,b.ilike.y)`                          | `where: { _or: [...] }`                             |
| `order=id.asc`                                      | `order_by: [{ id: asc }]`                           |
| `limit` / `offset`                                  | `limit` / `offset`                                  |
| `POST` + `Prefer: return=representation`            | `insert_<table>` → `returning`                      |
| `PATCH` (filtered)                                  | `update_<table>(where, _set)` → `returning`         |
| `DELETE` (filtered)                                 | `delete_<table>(where)` → `returning`               |
| JSONB `info->imageGeneration->>status=eq.completed` | `info: {_contains:{imageGeneration:{status}}}` (⚠️) |

## Bugs found & fixed by the mock test

1. Filter parsing: PostgREST encodes filters in the **value**
   (`?id=eq.10` → key `id`, value `eq.10`); the translator originally parsed the
   key. Fixed to split the value.
2. JSONB nesting: `jsonbArrowToWhere` now splits on both `->` and `->>`
   (`/->>?/`) so `info->imageGeneration->>status` becomes
   `{imageGeneration:{status}}`.

## Caveats (must be resolved on the real project)

- The translator emits GraphQL **text with JSON strings** for `where`/`order_by`
  as a readability proposal; a real proxy must build proper GraphQL using
  variables and GraphQL object syntax.
- JSONB `_contains` filtering must be verified; likely needs a computed column
  or SQL view on Nhost.
- Table naming: verify Hasura's generated root field names match (e.g. `user`,
  `orders_in_progress`).

## Verification status

- Mock logic tests: written; a full green run was blocked in this session by an
  external process holding a file lock on `thin_proxy_translator.mjs`
  (`EBUSY`). The two bugs above were fixed based on the partial run.
- Real Hasura: **not run** (no test project).
