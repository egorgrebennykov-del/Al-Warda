# BCRYPT_POC — bcrypt portability (VERIFIED locally, synthetic data)

Status: **VERIFIED** (isolated, synthetic data only — no real users/passwords).

## Test performed

`poc/bcrypt_poc.mjs` (run with Node against the repo's `bcryptjs`):

1. Hashed a synthetic password with the same library and cost the app uses
   (`bcryptjs`, cost 10 → `$2b$10$…`).
2. Simulated storing the row in PostgreSQL (password hash in a text column,
   serialized/parsed round-trip).
3. "Imported" the existing hash string back (as `pg_restore` would).
4. Verified: correct password → accepted; wrong password → rejected.
5. Verified the user UUID survives the round-trip unchanged.

## Result

```
hash prefix (stored)   : $2b$10$
correct password ok    : true
wrong password rejected: true
user UUID preserved    : true
row survived text round-trip: true
RESULT: PASS — bcrypt hashes are portable; no password reset required
```

## Conclusion

- The compatibility conclusion is based on an **actual compare round-trip**, not
  just the `$2b$` prefix.
- `bcryptjs` hashes are self-contained strings: they can be copied into any
  PostgreSQL (Nhost) and verified there with no knowledge of the plaintext.
- User UUIDs are an independent column and are preserved verbatim.
- A test-project confirmation against Nhost Auth (`auth.users.password_hash`)
  is still recommended if the team later switches to Nhost Auth — but for the
  chosen architecture (keep the custom `public.user` table) this is already
  sufficient.
