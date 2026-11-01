import fs from "node:fs";
import path from "node:path";
import client from "./qogitaClient.js";
import { mapQogitaProductToPerfume, ARABIAN_BRANDS_TO_FETCH } from "./qogitaService.js";

async function updateCatalog() {
  const jsonPath = path.resolve("server/data/cachedArabianPerfumes.json");
  let existingItems = [];
  if (fs.existsSync(jsonPath)) {
    existingItems = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  }
  console.log("Existing items count:", existingItems.length);

  await client.login();
  const seenKeys = new Set(existingItems.map((p) => p.gtin || p.id || p.name));
  const newMappedItems = [];

  for (const brand of ARABIAN_BRANDS_TO_FETCH) {
    try {
      console.log(`Fetching brand: ${brand} ...`);
      const res = await client.searchProducts({
        brandName: brand,
        stockAvailability: "in_stock",
        page_size: 40,
      });
      const items = res.results || [];
      let brandAdded = 0;
      for (const item of items) {
        const key = item.gtin || item.qid || item.name;
        if (!key || seenKeys.has(key)) continue;
        const mapped = mapQogitaProductToPerfume(item);
        if (mapped && mapped.image) {
          seenKeys.add(key);
          newMappedItems.push(mapped);
          brandAdded++;
        }
      }
      console.log(`  Added from ${brand}: ${brandAdded}`);
      await new Promise((r) => setTimeout(r, 350));
    } catch (e) {
      console.warn(`  Error for ${brand}:`, e.message);
    }
  }

  const combined = [...existingItems, ...newMappedItems];
  console.log("Total combined catalog items:", combined.length);

  fs.writeFileSync(jsonPath, JSON.stringify(combined, null, 2), "utf8");
  console.log("Successfully wrote combined catalog to cachedArabianPerfumes.json");
}

updateCatalog().catch(console.error);
