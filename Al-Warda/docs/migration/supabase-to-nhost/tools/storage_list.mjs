// storage_list.mjs — list + download Supabase 'product-images' bucket objects,
// writing objects.json (path -> sha256). PREPARED ONLY — not executed.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node tools/storage_list.mjs [outputDir] [objects.json]
//
// SECURITY: the service key is a secret — read from env only, never log it.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const bucket = "product-images";
const outDir = process.argv[2] || "storage-download";
const objectsFile = process.argv[3] || "objects.json";

const base = `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}`;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// List the bucket (paged). The listing endpoint requires the storage API:
const listUrl = `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/list/${bucket}`;
const listRes = await fetch(listUrl, { headers });
if (!listRes.ok) {
  console.error(`list failed: ${listRes.status}`);
  process.exit(1);
}
const objects = await listRes.json();

const manifest = [];
for (const obj of objects) {
  const name = obj.name;
  const res = await fetch(`${base}/${encodeURIComponent(name)}`, { headers });
  if (!res.ok) {
    console.error(`download failed: ${name} ${res.status}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const sha = createHash("sha256").update(buf).digest("hex");
  const dest = path.join(outDir, name);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  manifest.push({ path: name, size: buf.length, sha256: sha });
  console.log(`[list] ${name} ${buf.length} ${sha}`);
}
await writeFile(objectsFile, JSON.stringify(manifest, null, 2));
console.log(`[list] wrote ${objectsFile} (${manifest.length} objects)`);
