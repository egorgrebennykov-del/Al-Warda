# SECURITY_POC — permissions and admin rights

Status: **TEST MATRIX PREPARED; NOT EXECUTED** (requires the test Nhost project).

## Design principles

- JWT is signed **only** server-side (Worker). The frontend never builds JWTs
  and never claims `admin`.
- Two separate secrets: one for the cookie session, one for the Hasura JWT
  signing key. They are **not** reused without separate justification.
- The Hasura admin secret stays server-side; ordinary requests use per-user
  JWTs (role `user`) or the anonymous `public` role.
- Cookie flags: `HttpOnly`, `Secure` (production), `SameSite=Lax`. CSRF is
  addressed by `SameSite=Lax` plus the fact that mutations go through the
  Worker (which validates the session cookie + short-lived JWT), not
  cookie-authenticated cross-site GETs.

## Scenario matrix (to run on the test project)

| #   | Scenario                                                      | Expected                                             |
| --- | ------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | User A reads own `user`/`cart` row                            | allowed                                              |
| 2   | User A reads User B's `cart`/`orders_in_progress`             | blocked (row predicate `user_id = X-Hasura-User-Id`) |
| 3   | User A modifies User B's record                               | blocked                                              |
| 4   | User A sets `role`/`status` to admin                          | blocked (no update permission on `user.role`)        |
| 5   | Admin performs an admin operation                             | allowed (role `admin` JWT or admin secret)           |
| 6   | Anonymous client hits closed tables                           | blocked (no `public` role permission)                |
| 7   | Forged JWT (wrong signature)                                  | rejected by Hasura signature check                   |
| 8   | Expired JWT                                                   | rejected (`exp` + `allowed_skew`)                    |
| 9   | JWT with `x-hasura-allowed-roles: ["admin"]` minted by client | impossible (only Worker signs)                       |
| 10  | Non-existent user ID in JWT                                   | no rows returned / blocked by row predicate          |

## Hasura permission rules per test table

| Table                           | `public` (anon)                        | `user`                    | `admin` |
| ------------------------------- | -------------------------------------- | ------------------------- | ------- |
| `user`                          | none (or select of non-sensitive cols) | select own row            | all     |
| `perfumes`                      | select                                 | select                    | all     |
| `orders` / `orders_in_progress` | insert                                 | insert; select/update own | all     |
| `user_profiles`                 | none                                   | select/update own         | all     |

These are proposals to be entered in the Hasura permission editor and tested —
**equivalence with today's RLS is not automatic**.

## Direct-GraphQL bypass check

Verify the browser cannot call the GraphQL endpoint directly with privileges it
should not have: the `public` role must have no admin mutations, and the admin
secret must not be present in any client bundle or the `wrangler.jsonc`
`vars`/`VITE_*` (frontend) surface.
