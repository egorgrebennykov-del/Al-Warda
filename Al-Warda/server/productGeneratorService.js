import path from "node:path";
import { fileURLToPath } from "node:url";
import enrichedStocks from "./data/enrichedStocks.json" with { type: "json" };
import cachedArabianPerfumes from "./data/cachedArabianPerfumes.json" with { type: "json" };
import { isGeneratedProductImage } from "../utils/generatedProductImage.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(currentDir, "..");

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

export async function generateProductFlacon({ gtin, name, brand, volume, concentration } = {}) {
  if (!gtin) throw new Error("GTIN is required to process a Qogita product photo");
  const product = findProductByGtin(gtin);
  const generation = product?.info?.imageGeneration;
  if (!generation || generation.status !== "completed") {
    throw new Error(`No completed generated image for GTIN ${gtin}`);
  }
  const imageUrl = generation.imageUrl;
  if (!imageUrl || !isGeneratedProductImage(imageUrl)) {
    throw new Error(`Generated image for GTIN ${gtin} is not a valid generated product image`);
  }

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
