# AUTH_MIGRATION — users, IDs and password hashes

## Current reality (critical context)

The app does **not** use Supabase Auth. Authentication is **custom**:

- Table: `public.user`
- Password storage: `bcryptjs` hash (cost 10) in `password_hash` — `$2a$…`
- Session: `user=` cookie (7 days), set client-side; no Supabase JWT
- Email verification / password reset: 6-digit code sent via EmailJS
- Roles: `status` (`user`/`privileged`) + `role` jsonb array
  (`user`/`vip`/`developer`/`admin`)

Relevant code: `utils/auth.js` (`register`, `login`, `findByEmail`,
`resetPasswordByEmail`, `resolveUserRoles`, `setUserCookie`, `getCookieUser`),
`utils/inquiries.js`, `server/productImageQueueAdmin.js` (`/rest/v1/user`).

## Can passwords be preserved without reset?

**Yes — with verification.**

- The hashes are plain bcrypt in a data table, so a data migration copies them
  1:1 and logins keep working with zero changes.
- If a later move to **Nhost Auth** (`auth.users`) is desired, Nhost Auth also
  stores bcrypt hashes, so the same `$2a$` values are accepted. This must be
  **proven on a test project** against a few real hashes before promising it in
  production — do not assert it unconditionally.

## Strategy (recommended): keep the custom `user` table

This is the lowest-risk path and requires **no password reset**:

1. Migrate `public.user` as ordinary data (see `DATA_MIGRATION.md`).
2. Keep `utils/auth.js` unchanged; only the REST base URL / GraphQL adapter
   changes (see `APPLICATION_CHANGES.md`).
3. Re-map the `user` table permission so anon can `select`/`insert`/`patch`
   (equivalent of today's open RLS) or tighten to authenticated-only if
   desired — a decision, not a data-loss issue.

### Preserved automatically

- `id` (uuid) — copied verbatim.
- `firstname`, `lastname`, `email`, `phone`, `adresses`, `status`, `role`.
- `password_hash` — bcrypt values unchanged.

## Strategy (optional, later): adopt Nhost Auth

If you want real JWT sessions and the Nhost SDK:

1. Copy `public.user` → `auth.users` (`id`, `email`, `password_hash`,
   metadata `{firstname,lastname,phone,status,role}`).
2. Verify bcrypt compatibility on a few accounts.
3. Re-point `user_id` foreign references (cart, orders, inquiries, feedbacks,
   orders_in_progress) — they already use uuid `id` values, so they remain
   valid.
4. Replace the cookie session with the Nhost SDK session (this is the only
   part that would force code changes in `utils/auth.js`).

## Fallback if hash migration is impossible (not expected)

- Keep every `user` row (no users lost).
- Set a `must_reset_password` flag; issue a secure reset link/code through the
  existing EmailJS flow. Users keep their data and re-set a password once.

## Verification checklist

- Row count of `public.user` identical.
- A sample of `password_hash` values verified with `bcrypt.compare` against
  known test accounts (do NOT log the plaintext passwords).
- A login smoke test with an existing account on the Nhost copy.
- `resolveUserRoles`/admin checks still grant `privileged`/`admin` correctly.
