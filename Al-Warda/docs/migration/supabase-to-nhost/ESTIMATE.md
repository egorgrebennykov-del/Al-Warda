# ESTIMATE — scope, risks and blockers

## Scope summary

| Area                          | Effort | Notes                                                |
| ----------------------------- | ------ | ---------------------------------------------------- |
| Live schema dump + audit      | S      | Requires Supabase dashboard/SQL access               |
| PostgreSQL data migration     | S–M    | `pg_dump`/`pg_restore` + `setval`                    |
| RLS → Hasura permissions      | M      | Config only                                          |
| REST → GraphQL/proxy          | **L**  | ~20 utils + server files (or build a proxy)          |
| Auth users                    | S      | Custom `user` table copies verbatim; bcrypt portable |
| Storage                       | S      | Bucket copy + URL base                               |
| CI / secrets                  | S      | Rename env + GitHub Actions secrets                  |
| Test migration + verification | M      | Separate Nhost project + checklists                  |
| Cutover + monitoring          | M      | Short freeze recommended                             |

## Risks

| Risk                                                    | Likelihood | Impact | Mitigation                                                       |
| ------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------- |
| Dashboard-only table schemas missed                     | High       | High   | Live `pg_dump` before anything else                              |
| PostgREST → GraphQL filter translation bugs             | Medium     | High   | Proxy with unit tests; staging parity checks                     |
| Open anon-write RLS semantics lost in Hasura            | Medium     | Medium | Explicit permission review; tighten if acceptable                |
| Password-hash incompatibility (if moving to Nhost Auth) | Low        | Medium | Keep custom `user` table; verify bcrypt on test                  |
| New writes lost during cutover                          | Low        | High   | Short write freeze + tail sync                                   |
| Storage URL host changes break images                   | Low        | Medium | Base URL already centralized in `utils/generatedProductImage.js` |
| Legacy book-shop tables with unknown schema             | Low        | Low    | Dump + copy as-is; deprecate later                               |

## Blockers (need owner input before starting)

1. **Live Supabase access** for `pg_dump` / SQL editor / Storage listing
   (not secrets pasted in chat — provide access via the dashboard/SQL editor
   or a secure channel).
2. **Target Nhost project** (region + plan) and whether to keep the custom
   `user` auth or adopt Nhost Auth.
3. **Decision on the REST layer**: compatibility proxy (recommended) vs full
   GraphQL rewrite vs self-hosted PostgREST.

## Honest bottom line

- The **database** and **users** (including passwords) can be migrated without
  loss and without forced password resets.
- The **application** needs a real change in its data-access layer (PostgREST →
  GraphQL or a proxy); this is the dominant cost.
- Overall risk of data loss is **low** if the dump/restore + verification
  sequence is followed and a write freeze is used during cutover.
