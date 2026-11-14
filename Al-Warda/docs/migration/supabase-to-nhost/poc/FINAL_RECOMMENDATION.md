# FINAL_RECOMMENDATION — Nhost PoC verdict

Status: **Partial PoC.** What could be proven locally is proven; what needs a
real Nhost project is blocked on access (see "Blockers").

## Answers to the 10 questions

1. **Does external JWT work with Nhost?** Architecturally yes, and the
   configuration is confirmed: `[[hasura.jwtSecrets]]` with `type='HS256'`
   (`nhost.toml`). The live issue/verify round-trip was **not** run (no test
   project).

2. **Is the JWT config confirmed?** Yes — from official Nhost docs
   (`products/graphql/configuration`, `products/auth/jwt`): `hasura.jwtSecrets`
   is a valid key; `HS256` supported; `key` holds the symmetric secret;
   `claims_namespace` defaults to `https://hasura.io/jwt/claims`.

3. **Does the existing cookie auth keep working?** Design: the Worker keeps the
   `user=` cookie and mints a short-lived Hasura JWT from it, so the browser
   flow is unchanged. **Not live-verified.**

4. **Can bcrypt hashes be kept?** Yes — verified by an isolated full
   round-trip (hash → store → import → correct/wrong compare) with synthetic
   data. No password reset required.

5. **Can existing UUIDs be kept?** Yes — `public.user.id` is copied verbatim;
   all `user_id` references stay valid.

6. **Does the thin proxy cover all needed queries?** A translator module was
   prepared for every operator the app uses (`select/eq/neq/ilike/or/order/
limit/offset/insert/update/delete/Prefer`); it is **mock-tested only**, not
   proven against real Hasura. The JSONB `info->imageGeneration->>status`
   filter needs a computed column/view on Nhost.

7. **Can user-data protection be guaranteed?** The design enforces it
   (server-signed JWTs, row predicates on `user_id`, no client-side admin
   claim, admin secret server-only). The actual Hasura permission rules must be
   created and tested — RLS equivalence is **not** automatic.

8. **New egress bottleneck?** Not expected, provided the proxy preserves the
   existing light catalog select (no full `info` JSONB). Must be measured on the
   test project; no fabricated numbers.

9. **How much code really changes?** With the thin proxy: the ~20 data-access
   files stay as-is; the change concentrates in the Worker translation layer +
   env vars + GitHub Actions secrets. A full GraphQL SDK rewrite would instead
   touch every `utils/*` and `server/*` file.

10. **Ready for a test migration of real data?** **Not yet.** Blocker: creating
    the test Nhost project requires the owner's Nhost account. After that,
    Stages 3/5/6 must run and pass before any real-data copy.

## Final verdict

- Feasible: PostgreSQL data, bcrypt hashes, UUIDs and files are portable.
- Auth can remain the custom `public.user` + bcrypt + EmailJS + cookie model.
- The main engineering work is the thin proxy (PostgREST → GraphQL), which is
  prepared but unverified.
- **Do not switch production.** Next step, after owner approval and Nhost
  access: create the test project and run `SECURITY_POC.md` +
  `THIN_PROXY_POC.md` + `PERFORMANCE_POC.md` against it.

## Blockers (owner action required)

1. An Nhost account / project (free tier, no payment) and its credentials, or
   permission to create one on the owner's behalf.
2. Confirmation of the Nhost project region and the GraphQL/Hasura admin
   secret + JWT signing secret (kept in Nhost Secrets, never in chat).
