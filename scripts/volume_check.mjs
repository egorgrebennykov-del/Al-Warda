import fs from "node:fs";
import { resolvePerfumeVolume, parseVolumeFromText } from "../Al-Warda/utils/perfumes.js";

const rows = JSON.parse(fs.readFileSync("scripts/temp_images/stocks_dump.json", "utf8"));
const out = [];
let unknown = 0;
let changed = 0;
const samples = { 5580: 1, 5449: 1, 4443: 1, 4441: 1, 4667: 1, 4211: 1, 5013: 1, 6371: 1 };
for (const r of rows) {
  const vol = resolvePerfumeVolume({ rawName: r.name, rawDescription: r.description, info: r.info || {} });
  if (!vol) unknown++;
  if (vol !== (r.info || {}).volume) changed++;
  if (samples[r.id]) out.push(`${r.id} | ${r.name} | stored=${(r.info || {}).volume} -> ${vol}`);
}
out.push(`total=${rows.length} unknown=${unknown} changed=${changed}`);
for (const s of ["0.4 Oz", "34 Fl Oz", "27 Ounce", "338 Oz", "10 Ounce", "30g", "5x2ml", "100 Ml", "Chapter 3"]) {
  out.push(`${s} -> ${parseVolumeFromText(s)}`);
}
fs.writeFileSync("scripts/volume_check.txt", out.join("\n"), "utf8");
