# LIVE_POC_RESULTS — live Nhost PoC results

Date: 2026-11-14

## Overall status: BLOCKED — no test Nhost access present

The live PoC requires a test Nhost project. At the start of this stage the
environment contains **no Nhost access**:

- `nhost` CLI: not installed.
- `NHOST_*` / `HASURA_*` environment variables: none.
- `NHOST` / `HASURA` / `GRAPHQL` keys in `Al-Warda/.env`: none.
- `nhost.toml` / `nhost/` directory: none.

Per the task's constraints ("если создание тестового Nhost требует оплаты или
дополнительных разрешений — сообщить и остановиться"), the live checks were
**not** executed.

## Results table

| #   | Check                                                                                                    | Status     | Notes                                                            |
| --- | -------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| 1   | Nhost project ID / GraphQL endpoint / HS256 / JWT secret / Postgres / Hasura                             | BLOCKED    | no credentials                                                   |
| 2   | Real JWT tests (user A / B / admin; expiry; wrong signature; unknown user; no escalation)                | BLOCKED    | no project                                                       |
| 3   | Thin proxy on real Hasura (all operators incl. JSONB)                                                    | BLOCKED    | no project                                                       |
| 4   | Security (cross-user reads/writes, admin escalation, direct-GraphQL bypass, no admin secret on frontend) | BLOCKED    | no project                                                       |
| 5   | Performance (catalog / detail / pagination / filter / JSONB latency + egress)                            | BLOCKED    | no project + Supabase `402`                                      |
| 6   | Restore corrupted files                                                                                  | ✅ DONE    | `thin_proxy_translator.mjs` restored (4096 B)                    |
| 7   | Translator mock test                                                                                     | ⚠️ PARTIAL | 2 real bugs found & fixed; full run blocked by `EBUSY` file lock |

## Work completed this stage

1. **Restored `thin_proxy_translator.mjs`** (was 0 bytes) with the full
   translator, and recreated the corrupted `COMPATIBILITY_MATRIX.md` and
   `THIN_PROXY_POC.md`.
2. **Ran the mock test** and found + fixed two real translation bugs:
   - PostgREST encodes the filter operator/value in the **value**
     (`?id=eq.10`), not the key.
   - `jsonbArrowToWhere` must split on both `->` and `->>`.
3. Documented the translator caveats (GraphQL variables vs JSON text; JSONB
   `_contains` likely needs a computed column/view).

## Known limitations

- The translator emits GraphQL with JSON strings for `where`/`order_by` as a
  readability proposal — the real proxy must build proper GraphQL with
  variables.
- JSONB filtering must be validated on real Hasura; a computed column/view is
  the likely fallback.
- The mock test's full green run was blocked by an external process holding a
  file lock on `thin_proxy_translator.mjs` (`EBUSY`). This is an environment
  condition, not a code failure.

## Required app changes (unchanged from earlier docs)

- Data-access layer switch PostgREST → GraphQL via the thin proxy
  (`APPLICATION_CHANGES.md`); env vars + GitHub Actions secrets
  (`SUPABASE_*` → Nhost equivalents).
- JSONB catalog filter needs a computed column/view.

## Blocker for the next step

Provide (not in plaintext chat): the test Nhost project ID, GraphQL endpoint,
Hasura admin secret and the JWT signing secret (or a Nhost CLI login), so the
live checks above can run.
