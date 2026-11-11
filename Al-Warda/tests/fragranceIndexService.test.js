import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  buildNotesInfo,
  detectConcentration,
  formatNoteName,
  lookupFragranceIndex,
  normalizeText,
  scoreCandidate,
  selectBestMatch,
  stripMarketingNoise,
  tokenizeName,
} from "../server/fragranceIndexService.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("normalizes names and strips volume, concentration and marketing noise", () => {
  assert.equal(normalizeText("  Bade’e Al Oud  "), "badee al oud");
  assert.equal(
    stripMarketingNoise("Lattafa Khamrah Eau de Parfum for Women 100 ml"),
    "lattafa khamrah",
  );
  assert.deepEqual(tokenizeName("Armaf Club de Nuit Intense Man EDP 105ml"), [
    "armaf",
    "club",
    "de",
    "nuit",
    "intense",
    "man",
  ]);
});

test("detects concentration from the earliest explicit marker", () => {
  assert.equal(detectConcentration("Club de Nuit Intense Man Eau de Toilette"), "edt");
  assert.equal(detectConcentration("Badee Al Oud Oud for Glory EDP"), "edp");
  assert.equal(detectConcentration("Amouage Existence Woman"), "");
  assert.equal(detectConcentration("Lattafa Fakhar Extrait de Parfum"), "extrait");
});

test("scores exact name/house matches and rejects other houses", () => {
  const input = { name: "Khamrah", brand: "Lattafa", concentration: "edp" };
  const candidate = { name: "Khamrah", house: "Lattafa", concentration: "Eau de Parfum" };
  assert.equal(scoreCandidate(candidate, input), 120);

  assert.equal(
    scoreCandidate({ name: "Khamrah", house: "Afnan", concentration: "Eau de Parfum" }, input),
    0,
  );
});

test("penalizes concentration mismatches but keeps a strong name match", () => {
  const input = { name: "Club de Nuit Intense Man EDP", brand: "Armaf" };
  const candidate = { name: "Club de Nuit Intense Man", house: "Armaf", concentration: "Eau de Toilette" };
  assert.equal(scoreCandidate(candidate, input), 80);
});

test("selects the closest search result instead of the first one", () => {
  const input = { name: "Badee Al Oud - Oud for Glory EDP", brand: "Lattafa" };
  const results = [
    { id: "1", name: "Badee Al Oud Glory", house: "Lattafa", concentration: "Eau de Parfum" },
    { id: "2", name: "Bade'e Al Oud Oud for Glory", house: "Lattafa", concentration: "Eau de Parfum" },
  ];
  assert.equal(selectBestMatch(input, results)?.candidate.id, "2");
});

test("formats note names like the storefront expects", () => {
  assert.equal(formatNoteName("bergamot"), "Bergamot");
  assert.equal(formatNoteName("oud of the desert"), "Oud of the Desert");
  assert.equal(formatNoteName("  "), "");
});

test("persists found notes with verification metadata", () => {
  const info = buildNotesInfo(
    { existing: true },
    {
      status: "found",
      notes: { en: { top: ["Bergamot"], heart: ["Rose"], base: ["Oud"] } },
      matched: { id: "x", name: "Khamrah", house: "Lattafa", score: 120 },
      checkedAt: "2026-01-01T00:00:00.000Z",
      query: "Lattafa Khamrah",
    },
  );
  assert.equal(info.existing, true);
  assert.equal(info.notesVerified, true);
  assert.equal(info.notesSource, "10ml");
  assert.deepEqual(info.notes.en.top, ["Bergamot"]);
  assert.deepEqual(info.notes.ru.top, ["Bergamot"]);
  assert.equal(info.notesLookup.status, "found");
  assert.equal(info.notesLookup.matched.name, "Khamrah");
});

test("a miss clears unverified notes but keeps manual verified notes", () => {
  const cleared = buildNotesInfo(
    { notesVerified: false, notes: { ru: { top: ["Fake"] } } },
    { status: "not_found", checkedAt: "2026-01-01T00:00:00.000Z", query: "X" },
  );
  assert.equal(cleared.notesVerified, false);
  assert.equal(cleared.notes, undefined);
  assert.equal(cleared.notesLookup.status, "not_found");

  const manualNotes = {
    ru: { top: ["Шафран"], heart: ["Роза"], base: ["Уд"] },
    en: { top: ["Saffron"], heart: ["Rose"], base: ["Oud"] },
  };
  const preserved = buildNotesInfo(
    { notesVerified: true, notesSource: "manual", notes: manualNotes },
    { status: "not_found", checkedAt: "2026-01-01T00:00:00.000Z" },
  );
  assert.equal(preserved.notesVerified, true);
  assert.deepEqual(preserved.notes, manualNotes);
  assert.equal(preserved.notesLookup.status, "not_found");
});

test("lookup falls back to search when the exact detail is the wrong concentration", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/perfumes/edp")) {
      return Response.json({
        found: true,
        exact: true,
        perfume: {
          id: "edp",
          name: "Club de Nuit Intense Man",
          house: "Armaf",
          concentration: "Eau de Parfum",
          pyramid: { top: ["Pineapple"], heart: ["Birch"], base: ["Vanilla"] },
        },
      });
    }
    if (String(url).includes("/perfumes/") && String(url).includes("format=detailed")) {
      return Response.json({
        found: true,
        exact: true,
        perfume: {
          id: "edt",
          name: "Club de Nuit Intense Man",
          house: "Armaf",
          concentration: "Eau de Toilette",
          pyramid: { top: ["Lemon"], heart: ["Rose"], base: ["Musk"] },
        },
      });
    }
    if (String(url).includes("/perfumes?")) {
      return Response.json({
        total: 1,
        results: [
          { id: "edp", name: "Club de Nuit Intense Man", house: "Armaf", concentration: "Eau de Parfum" },
        ],
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await lookupFragranceIndex({
    name: "Club de Nuit Intense Man EDP",
    brand: "Armaf",
  });

  assert.equal(result.status, "found");
  assert.equal(result.matched.id, "edp");
  assert.equal(result.matched.method, "search");
  assert.deepEqual(result.notes.en.top, ["Pineapple"]);
  assert.ok(calls.some((url) => url.includes("/perfumes?q=")));
});
