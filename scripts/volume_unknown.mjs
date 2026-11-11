import fs from "node:fs";
import { resolvePerfumeVolume } from "../Al-Warda/utils/perfumes.js";
const rows = JSON.parse(fs.readFileSync("scripts/temp_images/stocks_dump.json", "utf8"));
const out = [];
let unknown = 0;
for (const r of rows) {
  const vol = resolvePerfumeVolume({ rawName: r.name, rawDescription: r.description, info: r.info || {} });
  if (r.id === 4443 || r.id === 5580) out.push(`${r.id} -> ${vol}`);
  if (!vol) { unknown++; if (unknown <= 25) out.push(`UNKNOWN ${r.id} | ${r.name} | ${(r.description || "").slice(0, 110)}`); }
}
out.push(`unknown=${unknown} of ${rows.length}`);
fs.writeFileSync("scripts/volume_unknown.txt", out.join("\n"), "utf8");
