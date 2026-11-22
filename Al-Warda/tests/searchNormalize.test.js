import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSearchCompact,
  matchesPerfumeSearch,
} from "../utils/searchNormalize.js";

test("normalizeSearchCompact strips case, spaces, apostrophes, dashes, commas, and diacritics", () => {
  assert.equal(normalizeSearchCompact("Al-Haramain"), "alharamain");
  assert.equal(normalizeSearchCompact("Al Haramain"), "alharamain");
  assert.equal(normalizeSearchCompact("J'adore, L’Or — Dior"), "jadorelordior");
  assert.equal(normalizeSearchCompact("9 PM"), "9pm");
  assert.equal(normalizeSearchCompact("Café Rose"), "caferose");
});

test("matchesPerfumeSearch finds perfumes regardless of case, spaces, and punctuation", () => {
  const sample = {
    name: "Al-Haramain L'Aventure Knight, EDP",
    brand: "Al Haramain",
    series: "L'Aventure",
    category: "Woody",
    notesSummary: "Бергамот, Вербена",
    description: "Luxury fragrance",
    topNotes: ["Bergamot", "Verbena"],
  };

  assert.equal(matchesPerfumeSearch(sample, "laventure"), true);
  assert.equal(matchesPerfumeSearch(sample, "L’Aventure-Knight"), true);
  assert.equal(matchesPerfumeSearch(sample, "al haramain, laventure"), true);
  assert.equal(matchesPerfumeSearch(sample, "ALHARAMAIN"), true);
  assert.equal(matchesPerfumeSearch(sample, "al haramain knight"), true);
  assert.equal(matchesPerfumeSearch(sample, "бергамот,"), true);
  assert.equal(matchesPerfumeSearch(sample, "nonexistent perfume"), false);
});
