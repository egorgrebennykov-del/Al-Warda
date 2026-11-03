import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateProductFlacon } from "../server/productGeneratorService.js";
import enrichedStocks from "../server/data/enrichedStocks.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runBatch(limit = 100) {
  console.log("Starting GTIN Product Image Generation according to luxury template...");
  const entries = Object.entries(enrichedStocks);
  let generated = 0;
  let skipped = 0;

  for (const [key, item] of entries) {
    if (limit && generated >= limit) break;
    const gtin = item.gtin || item.info?.gtin || key.replace("dropship-", "");
    if (!gtin || gtin.length < 8) continue;

    const outPath = path.resolve(__dirname, `../public/assets/img/products/${gtin}.jpg`);
    if (fs.existsSync(outPath)) {
      skipped++;
      continue;
    }

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
      console.warn(`Error on ${gtin}:`, err.message);
    }
  }

  console.log(`Complete! Generated: ${generated}, Already existing: ${skipped}`);
}

runBatch(0).catch(console.error);
