import assert from "node:assert/strict";
import { test } from "node:test";
import { ensurePerfumeEnrichment, isAirFreshener } from "../utils/perfumes.js";

const basePerfume = {
  id: "1",
  name: "Test Fragrance Eau de Parfum 100ml",
  brand: "Test House",
  price: 29.99,
};

test("never shows cached notes that were not verified", () => {
  const enriched = ensurePerfumeEnrichment({
    ...basePerfume,
    // These arrays mimic the invented pyramids stored in cachedArabianPerfumes.json.
    topNotes: ["Fake Top"],
    heartNotes: ["Fake Heart"],
    baseNotes: ["Fake Base"],
    topNotesRu: ["Фейк верх"],
    heartNotesRu: ["Фейк сердце"],
    baseNotesRu: ["Фейк база"],
    info: {},
  });

  assert.equal(enriched.notesVerified, false);
  assert.deepEqual(enriched.topNotes, []);
  assert.deepEqual(enriched.heartNotes, []);
  assert.deepEqual(enriched.baseNotes, []);
  assert.deepEqual(enriched.topNotesRu, []);
  assert.deepEqual(enriched.baseNotesEn, []);
});

test("shows notes stored as verified in info", () => {
  const enriched = ensurePerfumeEnrichment({
    ...basePerfume,
    info: {
      notesVerified: true,
      notesSource: "deepseek",
      notes: {
        ru: { top: ["Бергамот"], heart: ["Роза"], base: ["Уд"] },
        en: { top: ["Bergamot"], heart: ["Rose"], base: ["Oud"] },
      },
    },
  });

  assert.equal(enriched.notesVerified, true);
  assert.equal(enriched.notesSource, "deepseek");
  assert.deepEqual(enriched.topNotesRu, ["Бергамот"]);
  assert.deepEqual(enriched.heartNotesEn, ["Rose"]);
  assert.deepEqual(enriched.baseNotes, ["Уд"]);
});

test("keeps trusted top-level notes when the product is marked verified", () => {
  const enriched = ensurePerfumeEnrichment({
    ...basePerfume,
    notesVerified: true,
    topNotesRu: ["Шафран"],
    heartNotesRu: ["Роза"],
    baseNotesRu: ["Амбра"],
    topNotesEn: ["Saffron"],
    heartNotesEn: ["Rose"],
    baseNotesEn: ["Amber"],
  });

  assert.equal(enriched.notesVerified, true);
  assert.deepEqual(enriched.topNotesRu, ["Шафран"]);
  assert.deepEqual(enriched.topNotesEn, ["Saffron"]);
  assert.deepEqual(enriched.baseNotesEn, ["Amber"]);
});

test("isAirFreshener identifies standalone air fresheners and room sprays without misclassifying EDP gift sets", () => {
  assert.equal(isAirFreshener({ name: "Lattafa Khamrah Air Freshener 300ml" }), true);
  assert.equal(isAirFreshener({ name: "Al Haramain Velvet Carbon Room Spray" }), true);
  assert.equal(isAirFreshener({ name: "Lattafa Khamrah EDP 100ml" }), false);
  assert.equal(
    isAirFreshener({
      name: "Lattafa Maahir Set - Edp Spray, Perfumed Spray, Air Freshener",
      isSet: true,
    }),
    false,
  );
});
