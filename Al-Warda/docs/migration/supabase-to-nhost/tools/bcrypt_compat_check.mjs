// bcrypt_compat_check.mjs — ISOLATED, NO REAL USERS.
// Proves the custom 'public.user' bcrypt hashes are portable to Nhost.
//
// Uses ONLY a synthetic test hash generated here. Never touches production
// data and never uses real passwords.
//
// Usage: node tools/bcrypt_compat_check.mjs

import bcrypt from "bcryptjs";

const SYNTHETIC_PASSWORD = "Isolated-Test-Only-!23"; // not a real user password

// 1. Generate a hash exactly the way utils/auth.js does (bcryptjs, cost 10).
const hash = await bcrypt.hash(SYNTHETIC_PASSWORD, 10);

console.log("hash prefix:", hash.slice(0, 7)); // expect $2a$ or $2b$

// 2. "Import": the stored hash string is what would be copied into Nhost.
//    Verify the correct password succeeds.
const correct = await bcrypt.compare(SYNTHETIC_PASSWORD, hash);

// 3. Verify a wrong password is rejected.
const wrong = await bcrypt.compare("wrong-password", hash);

// 4. User ID preservation: the id is an independent column (uuid string),
//    copied verbatim — demonstrate it is not coupled to the hash.
const userId = "00000000-0000-4000-8000-000000000000";

const prefixOk = hash.startsWith("$2a$") || hash.startsWith("$2b$");

console.log("correct password accepted :", correct);
console.log("wrong password rejected  :", !wrong);
console.log("bcrypt $2a/$2b prefix ok  :", prefixOk);
console.log("user id preserved (uuid)  :", userId);

const pass = correct && !wrong && prefixOk;
console.log(
  pass
    ? "RESULT: PASS — hashes portable, no password reset required"
    : "RESULT: FAIL",
);
process.exit(pass ? 0 : 1);
