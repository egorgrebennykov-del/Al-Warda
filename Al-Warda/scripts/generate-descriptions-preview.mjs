/**
 * PREVIEW SCRIPT — generates Gemini descriptions for 5 random products
 * that already have aroma notes. Run this before mass generation to approve style.
 *
 * Usage:
 *   node scripts/generate-descriptions-preview.mjs
 *
 * Requires GEMINI_API_KEY in .env (already present).
 */
import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import { readFileSync } from "node:fs";
import { generatePerfumeDescriptions } from "../server/geminiDescriptionService.js";

const CACHE_PATH = "public/data/cachedArabianPerfumes.json";
const PREVIEW_COUNT = 5;

function pickRandom(items, n) {
  const shuffled = [...items].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

function buildNotesFromItem(item) {
  const notesEn = {
    top: Array.isArray(item.topNotesEn) ? item.topNotesEn : [],
    heart: Array.isArray(item.heartNotesEn) ? item.heartNotesEn : [],
    base: Array.isArray(item.baseNotesEn) ? item.baseNotesEn : [],
  };
  const notesRu = {
    top: Array.isArray(item.topNotesRu) ? item.topNotesRu : [],
    heart: Array.isArray(item.heartNotesRu) ? item.heartNotesRu : [],
    base: Array.isArray(item.baseNotesRu) ? item.baseNotesRu : [],
  };
  return {
    en: notesEn,
    ru: notesRu,
  };
}

async function main() {
  const raw = readFileSync(CACHE_PATH, "utf8");
  const items = JSON.parse(raw);

  const candidates = items.filter(
    (i) =>
      (Array.isArray(i.topNotesEn) && i.topNotesEn.length > 0) ||
      (Array.isArray(i.topNotesRu) && i.topNotesRu.length > 0)
  );

  console.log(`\nCatalog total: ${items.length}`);
  console.log(`Items with aroma notes: ${candidates.length}`);
  console.log(`Generating ${PREVIEW_COUNT} preview descriptions...\n`);

  const preview = pickRandom(candidates, PREVIEW_COUNT);

  for (const item of preview) {
    const notes = buildNotesFromItem(item);
    const env = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY,
    };

    console.log(`\n${"=".repeat(70)}`);
    console.log(`PRODUCT: ${item.name}`);
    console.log(`BRAND: ${item.brand}`);
    console.log(`GTIN: ${item.gtin || "—"}`);
    console.log(`CATEGORY: ${item.categoryEn || item.category}`);
    console.log(`CONCENTRATION: ${item.concentration}`);
    console.log(`VOLUME: ${item.volume}`);
    console.log(`GENDER: ${item.genderEn || item.gender}`);
    console.log(`NOTES (EN):`, JSON.stringify(notes.en, null, 2));
    console.log(`${"-".repeat(70)}`);

    try {
      const result = await generatePerfumeDescriptions({
        name: item.name,
        brand: item.brand,
        notes,
        category: item.categoryEn || item.category,
        env,
      });

      if (!result) {
        console.log("\n❌ Gemini returned null (no API key or all models failed).\n");
        continue;
      }

      console.log(`\n✅ GENERATED (model: ${result.model})`);
      console.log(`\n--- RU ---\n${result.descriptionRu}`);
      console.log(`\n--- EN ---\n${result.descriptionEn}`);
      console.log(`\nSOURCE: ${result.source}`);
      console.log(`GENERATED AT: ${result.generatedAt}`);
    } catch (err) {
      console.log(`\n❌ ERROR: ${err.message}\n`);
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("Preview complete. Review the 5 descriptions above.");
  console.log("If approved, run the mass-generation script for all eligible products.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});