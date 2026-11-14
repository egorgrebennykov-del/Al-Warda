// storage_upload.mjs — upload the downloaded objects into Nhost Storage and
// verify sha256. PREPARED ONLY — not executed.
//
// Nhost Storage is S3-compatible; this script targets the Nhost Storage
// presigned/upload API. Adjust the endpoint/headers to the Nhost SDK contract.
//
// Usage:
//   NHOST_STORAGE_URL=... NHOST_ADMIN_SECRET=... \
//     node tools/storage_upload.mjs [inputDir] [objects.json]
//
// SECURITY: the admin secret is a secret — read from env only, never log it.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.NHOST_STORAGE_URL; // e.g. https://<subdomain>.storage.<region>.nhost.run/v1/files
const ADMIN = process.env.NHOST_ADMIN_SECRET;
if (!BASE || !ADMIN) {
  console.error("Set NHOST_STORAGE_URL and NHOST_ADMIN_SECRET");
  process.exit(1);
}

const inDir = process.argv[2] || "storage-download";
const objectsFile = process.argv[3] || "objects.json";
const manifest = JSON.parse(await readFile(objectsFile, "utf8"));
const report = [];

for (const obj of manifest) {
  const file = path.join(inDir, obj.path);
  const buf = await readFile(file);
  const res = await fetch(
    `${BASE.replace(/\/+$/, "")}/product-images/${obj.path}`,
    {
      method: "PUT",
      headers: {
        "x-hasura-admin-secret": ADMIN,
        "content-type": "application/octet-stream",
      },
      body: buf,
    },
  );
  const destSha = createHash("sha256").update(buf).digest("hex");
  const ok = res.ok && destSha === obj.sha256;
  report.push({
    path: obj.path,
    uploaded: res.ok,
    sha256Match: destSha === obj.sha256,
  });
  console.log(
    `[upload] ${obj.path} status=${res.status} sha=${destSha} match=${destSha === obj.sha256}`,
  );
}
console.log(
  `[upload] ${report.filter((r) => r.sha256Match).length}/${manifest.length} checksums match`,
);
