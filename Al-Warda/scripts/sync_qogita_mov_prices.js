#!/usr/bin/env node
/**
 * Al-Warda - Qogita MOV <= 500 Price Synchronization Script
 * 
 * Fetches real supplier offers from Qogita (/buyers/variants/{fid}/offers/)
 * for each perfume and ensures the catalog price is set to the lowest available
 * price for accessible purchase orders (Minimum Order Value MOV <= 500 EUR),
 * rather than the inaccessible bulk tier (MOV 15,000+ EUR).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { QogitaClient } from "../server/qogitaClient.js";
import qogitaMap from "../src/data/qogitaProductsMap.js";
import { slugifyPerfumeName } from "../utils/perfumes.js";
import { invalidateProductImageQueueCache } from "../server/productImageQueueAdmin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(rootDir, "..");

function loadEnv() {
  const envPaths = [
    path.resolve(rootDir, ".env"),
    path.resolve(projectRoot, ".env"),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const idx = trimmed.indexOf("=");
          const k = trimmed.slice(0, idx).trim();
          const v = trimmed.slice(idx + 1).trim();
          if (!process.env[k]) process.env[k] = v;
        }
      }
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || "https://mfvenfrmlkxqgvdtedet.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ENRICHED_STOCKS_PATH = path.resolve(rootDir, "server", "data", "enrichedStocks.json");

if (!SUPABASE_KEY) {
  console.error("❌ SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.");
  process.exit(1);
}

const client = new QogitaClient({
  email: process.env.QOGITA_EMAIL,
  password: process.env.QOGITA_PASSWORD,
  apiUrl: process.env.QOGITA_API_URL,
});

function extractVariantFid(product) {
  if (!product) return null;
  // 1. Check direct variant FID in info
  if (product.info?.variantFid) return product.info.variantFid;
  if (product.info?.qogitaFid) return product.info.qogitaFid;

  // 2. Check productUrl in product or product.info
  const url = product.info?.productUrl || product.productUrl || product.info?.qogitaUrl || product.qogitaUrl;
  if (typeof url === "string") {
    const match = url.match(/\/products\/([a-zA-Z0-9_-]+)\//);
    if (match) return match[1];
  }

  // 3. Check qogitaMap by slug
  const name = product.name || product.title;
  if (name) {
    const slug = slugifyPerfumeName(name);
    if (qogitaMap[slug]) return qogitaMap[slug];
  }

  return null;
}

export function extractBestPriceForMov(offersData, targetMov = 500.0) {
  const offers = Array.isArray(offersData) ? offersData : (offersData?.offers || []);
  const eligible = [];
  let lowestOverall = null;

  for (const off of offers) {
    const tiers = off.tieredPrices || off.tiered_prices || [];
    for (const t of tiers) {
      const mov = parseFloat(t.tierMov?.amount ?? t.mov ?? t.tier_mov?.amount ?? 0);
      const price = parseFloat(t.tierPrice?.amount ?? t.price ?? t.amount ?? t.tier_price?.amount ?? 0);
      const currency = t.tierPrice?.currency || t.currency || "EUR";

      if (price > 0) {
        if (!lowestOverall || price < lowestOverall.price) {
          lowestOverall = { price, mov, currency, seller: off.seller };
        }
        if (mov <= targetMov) {
          eligible.push({ price, mov, currency, seller: off.seller });
        }
      }
    }
  }

  if (eligible.length > 0) {
    eligible.sort((a, b) => a.price - b.price);
    return eligible[0];
  }

  // If no offer exists with MOV <= targetMov, pick lowest overall MOV tier
  return lowestOverall;
}

const gtinToFidCache = new Map();

export async function resolvePerfumeMovPrice(perfume, targetMov = 500.0) {
  let fid = extractVariantFid(perfume);

  // If FID not known, search Qogita by GTIN
  const gtin = perfume.info?.gtin || perfume.gtin;
  if (!fid && gtin) {
    if (gtinToFidCache.has(String(gtin))) {
      fid = gtinToFidCache.get(String(gtin));
    } else {
      try {
        const searchRes = await client.searchProducts({ gtin: String(gtin) });
        const prod = searchRes.results?.[0];
        if (prod?.productUrl) {
          const match = prod.productUrl.match(/\/products\/([a-zA-Z0-9_-]+)\//);
          if (match) {
            fid = match[1];
            gtinToFidCache.set(String(gtin), fid);
          }
        }
      } catch {
        // ignore search error
      }
    }
  }

  if (!fid) return null;

  try {
    const offersRes = await client.getVariantOffers(fid);
    const best = extractBestPriceForMov(offersRes, targetMov);
    if (best) {
      return {
        fid,
        price: Math.round(best.price * 100) / 100,
        mov: best.mov,
        currency: best.currency,
        seller: best.seller,
      };
    }
  } catch (err) {
    // getVariantOffers failed
  }

  return null;
}

async function main() {
  console.log("=================================================");
  console.log("🌸 Al-Warda - Qogita MOV <= 500 Price Synchronization");
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log("=================================================");

  await client.login();
  console.log("✓ Logged into Qogita successfully.");

  // Fetch all completed perfumes from Supabase
  console.log("Fetching completed products from Supabase...");
  let allCompleted = [];
  let from = 0;
  const pageSize = 500;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/stocks?select=id,name,brand,price,info&info->imageGeneration->>status=eq.completed&order=id.asc`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Range: `${from}-${from + pageSize - 1}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to load stocks (${res.status}): ${await res.text()}`);
    }

    const rows = await res.json();
    if (!rows.length) break;
    allCompleted.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Found ${allCompleted.length} completed products.`);

  // Load enrichedStocks.json
  let enrichedStocks = {};
  if (fs.existsSync(ENRICHED_STOCKS_PATH)) {
    try {
      enrichedStocks = JSON.parse(fs.readFileSync(ENRICHED_STOCKS_PATH, "utf8"));
    } catch (e) {
      console.warn("Could not read enrichedStocks.json:", e.message);
    }
  }

  let updatedCount = 0;
  let verifiedCount = 0;
  let skippedCount = 0;
  const concurrency = 2;

  for (let i = 0; i < allCompleted.length; i += concurrency) {
    const batch = allCompleted.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (perfume) => {
        try {
          const result = await resolvePerfumeMovPrice(perfume, 500.0);
          if (!result) {
            skippedCount++;
            return;
          }

          const currentPrice = Number(perfume.price) || 0;
          const newPrice = result.price;
          verifiedCount++;

          // Always save variantFid if missing in info
          const currentFid = perfume.info?.variantFid;
          const needsFidSave = result.fid && currentFid !== result.fid;
          const priceChanged = Math.abs(currentPrice - newPrice) > 0.05;

          if (priceChanged || needsFidSave) {
            if (priceChanged) {
              console.log(
                `[UPDATE] #${perfume.id} "${perfume.name}": €${currentPrice} -> €${newPrice} (MOV ${result.mov} by ${result.seller})`
              );
            }

            const updatedInfo = {
              ...(perfume.info || {}),
              variantFid: result.fid,
            };

            // 1. Update Supabase
            const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/stocks?id=eq.${perfume.id}`, {
              method: "PATCH",
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify({
                price: newPrice,
                info: updatedInfo,
              }),
            });

            if (!patchRes.ok) {
              console.warn(`Failed to patch #${perfume.id}: ${patchRes.status}`);
            } else if (priceChanged) {
              updatedCount++;
            }

            // 2. Update enrichedStocks.json
            const gtin = perfume.info?.gtin;
            const key = gtin ? `dropship-${gtin}` : null;
            if (key && enrichedStocks[key]) {
              enrichedStocks[key].price = newPrice;
              if (enrichedStocks[key].info) {
                enrichedStocks[key].info.variantFid = result.fid;
              }
            }
          }
        } catch (err) {
          console.warn(`Error on perfume #${perfume.id}:`, err.message);
        }
      })
    );

    // Polite delay to protect Qogita API rate limit
    await new Promise((r) => setTimeout(r, 100));
  }

  // Save updated enrichedStocks.json
  if (updatedCount > 0) {
    try {
      fs.writeFileSync(ENRICHED_STOCKS_PATH, JSON.stringify(enrichedStocks, null, 2), "utf8");
      console.log(`✓ Saved ${updatedCount} price updates to enrichedStocks.json.`);
    } catch (e) {
      console.warn("Failed to save enrichedStocks.json:", e.message);
    }
    invalidateProductImageQueueCache();
  }

  console.log("=================================================");
  console.log(`✓ Done! Verified: ${verifiedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}`);
  console.log("=================================================");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  });
}
