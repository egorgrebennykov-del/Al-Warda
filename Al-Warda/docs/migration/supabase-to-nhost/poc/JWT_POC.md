# JWT_POC — Hasura JWT configuration in Nhost

Status: **CONFIG CONFIRMED from official docs; live JWT test BLOCKED** (needs a
test Nhost project — see blockers at the end).

## 1. Confirmed configuration key

Verified against official Nhost docs (`https://docs.nhost.io/products/graphql/configuration`
and `https://docs.nhost.io/products/auth/jwt`):

The correct, working configuration is the `[hasura]` block in `nhost.toml`:

```toml
[hasura]
adminSecret   = '<admin-secret>'
webhookSecret = '<webhook-secret>'

[[hasura.jwtSecrets]]
type = 'HS256'
key  = '<shared-signing-secret>'
```

- **`hasura.jwtSecrets` is a valid key** — confirmed by the docs, not assumed.
- **HS256 is supported** (also HS384, HS512); symmetric keys are the current
  default.
- `key` holds the shared symmetric secret (recommended: reference a Nhost
  [Secret](https://docs.nhost.io/platform/cloud/secrets), not a literal).
- `adminSecret` — server-only; the Hasura admin secret (never ship to the
  browser).
- `claims_namespace` defaults to `https://hasura.io/jwt/claims` (retained
  Hasura-compatible identifier).
- `claims_map` / `issuer` / `jwk_url` available for remapping and external
  issuers.

## 2. Hasura claims the Worker must sign

From the Hasura JWT reference (which Nhost's engine enforces):

- **Required:** `x-hasura-allowed-roles`, `x-hasura-default-role`.
- **Optional:** `x-hasura-user-id` (row-level permissions) and any other
  `x-hasura-*` string claims.
- Hasura reads the token from `Authorization: Bearer <JWT>` by default.
- `x-hasura-admin-secret` header bypasses JWT for admin access (server-only).

## 3. Example claims (no secrets included)

Normal user:

```json
{
  "sub": "<user-uuid>",
  "iat": 1710000000,
  "exp": 1710000900,
  "https://hasura.io/jwt/claims": {
    "x-hasura-allowed-roles": ["user"],
    "x-hasura-default-role": "user",
    "x-hasura-user-id": "<user-uuid>"
  }
}
```

Administrator (role granted only after a server-side check):

```json
{
  "sub": "<user-uuid>",
  "iat": 1710000000,
  "exp": 1710000900,
  "https://hasura.io/jwt/claims": {
    "x-hasura-allowed-roles": ["user", "admin"],
    "x-hasura-default-role": "user",
    "x-hasura-user-id": "<user-uuid>"
  }
}
```

Key points:

- The `admin` role appears in `x-hasura-allowed-roles` **only** when the Worker
  re-derives it server-side from the DB row — never from browser input.
- The signing secret is a shared symmetric key between the Worker and Hasura; it
  is **separate** from the cookie-session secret (see `SECURITY_POC.md`).

## 4. What is BLOCKED (live verification)

The following must run against a real test Nhost project and are **not yet
verified**: JWT issuance/verification, expiry, forged-token rejection,
wrong-signature rejection, non-existent-user rejection, role-escalation
block, and "no admin secret on frontend". They are enumerated in
`SECURITY_POC.md` and require the test project from Stage 2.

## 5. Blockers

- Creating a test Nhost project requires an Nhost account login (CLI
  `nhost login` or the dashboard) — credentials I do not have. Free tier means
  no payment, but the account/project must be created by the owner.
