import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateProductFlacon } from "../server/productGeneratorService.js";
import enrichedStocks from "../server/data/enrichedStocks.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(raw = process.argv.slice(2)) {
  const limit = raw.includes("--limit") ? Number(raw[raw.indexOf("--limit") + 1]) : 0;
  return { limit };
}

async function runBatch({ limit = 0 }) {
  const entries = Object.entries(enrichedStocks);
  let generated = 0;
  let skipped = 0;
  let processed = 0;

  console.log(`Starting GTIN Product Image Generation according to luxury template.`);
  console.log(`Catalog size: ${entries.length}.`);

  for (const [key, item] of entries) {
    if (limit && generated >= limit) break;

    const gtin = item.gtin || item.info?.gtin || key.replace("dropship-", "");
    if (!gtin || String(gtin).length < 8) continue;

    const outPath = path.resolve(__dirname, `../public/assets/img/products/${gtin}.jpg`);
    const hasPhoto = fs.existsSync(outPath);

    // First pass: only process rows that already have a photo queued.
    if (!hasPhoto) {
      skipped++;
      continue;
    }

    processed++;

    try {
      await generateProductFlacon({
        gtin,
        name: item.name,
        brand: item.brand,
        volume: item.info?.volume || "100 ML",
        concentration: item.info?.concentration || "EAU DE PARFUM",
      });
      generated++;
      if (generated % 25 === 0) {
        console.log(`Generated ${generated} luxury flacon images...`);
      }
    } catch (err) {
      console.warn(`Error on ${gtin}:`, err.message || err);
    }
  }

  console.log(`Complete! Generated: ${generated}, Already existing: ${skipped}, Processed with photo: ${processed}`);
}

const { limit } = parseArgs();
runBatch({ limit: Number.isFinite(limit) ? limit : 0 }).catch(console.error);
