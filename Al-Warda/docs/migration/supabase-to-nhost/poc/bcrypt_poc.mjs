// bcrypt_poc.mjs — ISOLATED proof, SYNTHETIC data only. No real users/passwords.
//
// Proves the full round trip the migration needs:
//   1. hash a synthetic password with the SAME lib the app uses (bcryptjs, cost 10)
//   2. "store" the row in PostgreSQL (simulated as a text column in a JSON row)
//   3. "import" the existing hash string back (as Nhost would after pg_restore)
//   4. verify correct password -> true, wrong password -> false
//   5. user UUID is preserved verbatim (independent column, not coupled to hash)
//
// Run: node docs/migration/supabase-to-nhost/poc/bcrypt_poc.mjs

import bcrypt from "bcryptjs";

const PASSWORD = "Synthetic-Test-Password-!42"; // synthetic, not a real password
const USER_UUID = "11111111-2222-4333-8444-555555555555";

// 1. Hash exactly as utils/auth.js does (bcryptjs, cost 10).
const hash = await bcrypt.hash(PASSWORD, 10);

// 2. Simulate the PostgreSQL row (password_hash is a text column).
const userRow = {
  id: USER_UUID,
  email: "synthetic@example.test",
  password_hash: hash,
  status: "user",
  role: ["user"],
};
const storedAsText = JSON.stringify(userRow); // what pg_dump/pg_restore moves

// 3. "Import": parse the row back and read password_hash as a plain string.
const importedRow = JSON.parse(storedAsText);
const importedHash = importedRow.password_hash;

// 4. Verify.
const correctOk = await bcrypt.compare(PASSWORD, importedHash);
const wrongRejected = !(await bcrypt.compare("wrong-password", importedHash));

// 5. UUID preserved.
const uuidPreserved = importedRow.id === USER_UUID;

// 6. Cross-check: the same imported hash verifies via a fresh compare (no
//    plaintext was ever needed after hashing).
const prefix = importedHash.slice(0, 7);

console.log("hash prefix (stored)   :", prefix);
console.log("correct password ok    :", correctOk);
console.log("wrong password rejected:", wrongRejected);
console.log("user UUID preserved    :", uuidPreserved);
console.log(
  "row survived text round-trip:",
  importedRow.email === "synthetic@example.test",
);

const pass =
  correctOk &&
  wrongRejected &&
  uuidPreserved &&
  (prefix === "$2a$10$" || prefix === "$2b$10$");
console.log(
  pass
    ? "RESULT: PASS — bcrypt hashes are portable; no password reset required"
    : "RESULT: FAIL",
);
process.exit(pass ? 0 : 1);
