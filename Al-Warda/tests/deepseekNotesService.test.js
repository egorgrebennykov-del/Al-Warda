import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import {
  buildNotesInfo,
  generateFragranceNotes,
  getDeepSeekApiKey,
  normalizePyramid,
  normalizeText,
} from "../server/deepseekNotesService.js";

const originalFetch = globalThis.fetch;
const originalDeepSeekKey = globalThis.process?.env?.DEEPSEEK_API_KEY;
if (globalThis.process?.env) {
  delete globalThis.process.env.DEEPSEEK_API_KEY;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

after(() => {
  if (originalDeepSeekKey !== undefined && globalThis.process?.env) {
    globalThis.process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
  }
});

describe("normalizePyramid", () => {
  it("maps a flat DeepSeek response into en/ru buckets", () => {
    const notes = normalizePyramid({
      top: ["bergamot", "lemon"],
      heart: ["rose"],
      base: ["oud"],
      topRu: ["бергамот", "лимон"],
      heartRu: ["роза"],
      baseRu: ["уд"],
    });

    assert.deepEqual(notes.en, {
      top: ["Bergamot", "Lemon"],
      heart: ["Rose"],
      base: ["Oud"],
    });
    assert.deepEqual(notes.ru, {
      top: ["Бергамот", "Лимон"],
      heart: ["Роза"],
      base: ["Уд"],
    });
  });

  it("falls back to English notes when the Russian layer is missing", () => {
    const notes = normalizePyramid({ top: ["bergamot"], heart: [], base: ["oud"] });
    assert.deepEqual(notes.ru.top, ["Bergamot"]);
    assert.deepEqual(notes.ru.base, ["Oud"]);
  });

  it("returns null when the pyramid has no notes", () => {
    assert.equal(normalizePyramid({ top: [], heart: [], base: [] }), null);
    assert.equal(normalizePyramid(null), null);
  });
});

describe("buildNotesInfo", () => {
  it("stores a generated pyramid as verified DeepSeek notes", () => {
    const info = buildNotesInfo(
      { category: "Oriental" },
      {
        status: "found",
        notes: {
          en: { top: ["Bergamot"], heart: ["Rose"], base: ["Oud"] },
          ru: { top: ["Бергамот"], heart: ["Роза"], base: ["Уд"] },
        },
        model: "deepseek-chat",
        checkedAt: "2026-01-01T00:00:00.000Z",
      },
    );

    assert.equal(info.category, "Oriental");
    assert.equal(info.notesVerified, true);
    assert.equal(info.notesSource, "deepseek");
    assert.equal(info.notesLookup.status, "found");
    assert.equal(info.notesLookup.generated, true);
    assert.deepEqual(info.notes.ru.top, ["Бергамот"]);
    assert.equal(info.notesSummary, "Бергамот · Роза · Уд");
  });

  it("keeps manually entered notes when generation finds nothing", () => {
    const manualNotes = {
      ru: { top: ["Вручную"], heart: [], base: [] },
      en: { top: ["Manual"], heart: [], base: [] },
    };
    const info = buildNotesInfo(
      { notesVerified: true, notesSource: "manual", notes: manualNotes },
      { status: "not_found", checkedAt: "2026-01-01T00:00:00.000Z" },
    );

    assert.equal(info.notesVerified, true);
    assert.equal(info.notesSource, "manual");
    assert.deepEqual(info.notes, manualNotes);
    assert.equal(info.notesLookup.status, "not_found");
  });

  it("does not destroy existing notes on a transient DeepSeek error", () => {
    const existing = {
      ru: { top: ["Бергамот"], heart: [], base: [] },
      en: { top: ["Bergamot"], heart: [], base: [] },
    };
    const info = buildNotesInfo(
      { notesVerified: true, notesSource: "deepseek", notes: existing },
      { status: "error", error: "DeepSeek rate limit reached" },
    );

    assert.equal(info.notesVerified, true);
    assert.deepEqual(info.notes, existing);
    assert.equal(info.notesLookup.status, "error");
  });
});

describe("generateFragranceNotes", () => {
  it("parses the DeepSeek chat completion response", async () => {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.deepseek.com/chat/completions");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer test-key");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "deepseek-chat");
      assert.deepEqual(body.response_format, { type: "json_object" });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  top: ["bergamot"],
                  heart: ["rose"],
                  base: ["oud"],
                  topRu: ["бергамот"],
                  heartRu: ["роза"],
                  baseRu: ["уд"],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const lookup = await generateFragranceNotes({
      name: "Unique Test Fragrance A",
      brand: "Test House",
      env: { DEEPSEEK_API_KEY: "test-key" },
    });

    assert.equal(lookup.status, "found");
    assert.equal(lookup.source, "deepseek");
    assert.deepEqual(lookup.notes.en.top, ["Bergamot"]);
    assert.deepEqual(lookup.notes.ru.base, ["Уд"]);
  });

  it("reports a missing API key instead of calling the network", async () => {
    globalThis.fetch = async () => {
      throw new Error("fetch should not be called without a key");
    };

    const lookup = await generateFragranceNotes({
      name: "Unique Test Fragrance B",
      brand: "Test House",
      env: {},
    });

    assert.equal(lookup.status, "error");
    assert.match(lookup.error, /DEEPSEEK_API_KEY/);
  });

  it("surfaces DeepSeek HTTP failures", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { message: "Insufficient Balance" } }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });

    const lookup = await generateFragranceNotes({
      name: "Unique Test Fragrance C",
      brand: "Test House",
      env: { DEEPSEEK_API_KEY: "test-key" },
    });

    assert.equal(lookup.status, "error");
    assert.match(lookup.error, /insufficient balance/i);
  });
});

describe("helpers", () => {
  it("normalizes text for cache keys", () => {
    assert.equal(normalizeText("  Café  Noir "), "cafe noir");
  });

  it("reads the key from env", () => {
    assert.equal(getDeepSeekApiKey({ DEEPSEEK_API_KEY: "abc" }), "abc");
    assert.equal(getDeepSeekApiKey({}), "");
  });
});
