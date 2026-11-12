import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import enrichedStocks from "./data/enrichedStocks.json" with { type: "json" };
import cachedArabianPerfumes from "./data/cachedArabianPerfumes.json" with { type: "json" };

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(currentDir, "..");
const productsDir = path.join(appDir, "public/assets/img/products");
const imageMarker = Buffer.from("Al-Warda Qogita Gemini original photo edit v3");

function findProductByGtin(gtin) {
  const enrichedMatches = Object.entries(enrichedStocks).filter(([key, item]) =>
    item && (
      String(item.gtin || "") === gtin ||
      String(item.info?.gtin || "") === gtin ||
      key === `dropship-${gtin}` ||
      String(item.slug || "").endsWith(gtin)
    )
  ).map(([, item]) => item);
  const cachedMatches = cachedArabianPerfumes.filter((item) => String(item.gtin || "") === gtin);
  const matches = [...enrichedMatches, ...cachedMatches];
  return matches.find((item) => item.rawImage || item.info?.rawImage) || matches[0];
}

function hasCurrentImage(filePath) {
  try {
    return fs.readFileSync(filePath).includes(imageMarker);
  } catch {
    return false;
  }
}

function processOriginalPhoto(gtin, rawImage) {
  if (!/^https?:\/\//i.test(rawImage || "")) {
    throw new Error(`No original Qogita photo is available for GTIN ${gtin}`);
  }

  fs.mkdirSync(productsDir, { recursive: true });
  const outputPath = path.join(productsDir, `${gtin}.jpg`);
  if (hasCurrentImage(outputPath)) {
    return `/assets/img/products/${gtin}.jpg`;
  }

  const localScript = path.join(appDir, "scripts/process_qogita_luxury.py");
  const rootScript = path.resolve(appDir, "../scripts/process_qogita_luxury.py");
  const scriptPath = fs.existsSync(localScript) ? localScript : rootScript;
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Qogita photo enhancement script not found: ${localScript}`);
  }

  execFileSync(
    "python",
    [scriptPath, "--source", rawImage, "--output", outputPath],
    { timeout: 240000 },
  );
  if (!hasCurrentImage(outputPath)) {
    throw new Error(`Qogita photo enhancement did not produce a valid image for GTIN ${gtin}`);
  }

  const distProductsDir = path.resolve(appDir, "dist/assets/img/products");
  if (fs.existsSync(distProductsDir)) {
    fs.copyFileSync(outputPath, path.join(distProductsDir, `${gtin}.jpg`));
  }
  return `/assets/img/products/${gtin}.jpg`;
}

export async function generateProductFlacon({ gtin, name, brand, volume, concentration } = {}) {
  if (!gtin) throw new Error("GTIN is required to process a Qogita product photo");
  const product = findProductByGtin(gtin);
  const rawImage = product?.rawImage || product?.info?.rawImage;
  const imageUrl = processOriginalPhoto(gtin, rawImage);

  try {
    const { enrichPerfumeWithAI, withGeminiDescriptions } = await import("./wardaAssistantService.js");
    const aiDesc = await enrichPerfumeWithAI({
      name: name || product?.name || product?.title,
      brand: brand || product?.brand,
      notes: product?.notesSummary || product?.info?.notesSummary,
    });
    const updatedInfo = await withGeminiDescriptions(product?.info, {
      name: name || product?.name || product?.title,
      brand: brand || product?.brand,
      notes: product?.notesSummary || product?.info?.notesSummary,
      category: product?.category,
      env: { GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY },
    });
    if (product) {
      product.descriptionRu = updatedInfo.descriptionRu;
      product.descriptionEn = updatedInfo.descriptionEn;
      product.description = updatedInfo.descriptionRu;
      product.info.descriptionRu = updatedInfo.descriptionRu;
      product.info.descriptionEn = updatedInfo.descriptionEn;
      product.info.descriptionBg = updatedInfo.descriptionBg;
      product.info.descriptionEl = updatedInfo.descriptionEl;
      product.info.descriptionHu = updatedInfo.descriptionHu;
      product.info.descriptionRo = updatedInfo.descriptionRo;
      product.info.description = updatedInfo.descriptionRu;
      product.info.descriptionAiGenerated = true;
    }
  } catch (err) {
    console.warn(`[productGeneratorService] Could not generate AI description for GTIN ${gtin}:`, err?.message);
  }

  return imageUrl;
}

export async function getOrGenerateFlaconByGtin(gtin) {
  return generateProductFlacon({ gtin });
}
