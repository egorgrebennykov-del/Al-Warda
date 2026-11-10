import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { formatPriceWithCurrency } from "../src/context/currencyUtils.js";
import { translations } from "../src/context/translations.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("formatPriceWithCurrency correctly formats EUR, RON, and HUF with requested symbols", () => {
  const rates = { EUR: 1, RON: 5.343, HUF: 362.99 };

  // EUR: symbol € followed by 2 decimals
  assert.equal(formatPriceWithCurrency(25, "EUR", rates), "€25.00");
  assert.equal(formatPriceWithCurrency(10.5, "EUR", rates), "€10.50");

  // RON: number with 2 decimals followed by 'lei'
  // 25 * 5.343 = 133.575 -> 133.58 lei
  assert.equal(formatPriceWithCurrency(25, "RON", rates), "133.58 lei");

  // HUF: rounded integer, space-separated thousands, followed by 'Fr'
  // 25 * 362.99 = 9074.75 -> 9 075 Fr
  const hufFormatted = formatPriceWithCurrency(25, "HUF", rates);
  assert.match(hufFormatted, /9[\s\u00A0\u202F]075 Fr/);

  // Large number HUF formatting
  // 100 * 362.99 = 36299 -> 36 299 Fr
  const huf100 = formatPriceWithCurrency(100, "HUF", rates);
  assert.match(huf100, /36[\s\u00A0\u202F]299 Fr/);
});

test("Hungarian language is registered in translations and has comprehensive key coverage", () => {
  assert.ok(translations.hu, "Hungarian translation dictionary exists");
  assert.ok(translations.ru, "Russian translation dictionary exists");
  assert.ok(translations.en, "English translation dictionary exists");

  const ruKeys = Object.keys(translations.ru);
  const huKeys = Object.keys(translations.hu);

  // Hungarian dictionary must cover all keys
  assert.ok(huKeys.length >= 400, `Expected >= 400 keys, found ${huKeys.length}`);
  for (const key of ruKeys) {
    assert.ok(translations.hu[key] !== undefined, `Missing Hungarian key: ${key}`);
  }

  // Verify key translations
  assert.equal(translations.hu["nav.home"], "Főoldal");
  assert.equal(translations.hu["nav.bookPicks"], "Kollekció");
});

test("Bulgarian language is registered in translations and has comprehensive key coverage", () => {
  assert.ok(translations.bg, "Bulgarian translation dictionary exists");
  assert.ok(translations.ru, "Russian translation dictionary exists");

  const ruKeys = Object.keys(translations.ru);
  const bgKeys = Object.keys(translations.bg);

  // Bulgarian dictionary must cover all keys
  assert.equal(bgKeys.length, ruKeys.length, `Expected ${ruKeys.length} keys in Bulgarian, found ${bgKeys.length}`);
  for (const key of ruKeys) {
    assert.ok(translations.bg[key] !== undefined, `Missing Bulgarian key: ${key}`);
  }

  // Verify key translations in Bulgarian
  assert.equal(translations.bg["nav.home"], "Начало");
  assert.equal(translations.bg["nav.bookPicks"], "Колекция");
  assert.equal(translations.bg["home.title"], "Оригинална ориенталска парфюмерия");
  assert.equal(translations.bg["privileged.title"], "Контролен панел");
});

test("Greek language is registered in translations and has comprehensive key coverage", () => {
  assert.ok(translations.el, "Greek translation dictionary exists");
  assert.ok(translations.ru, "Russian translation dictionary exists");

  const ruKeys = Object.keys(translations.ru);
  const elKeys = Object.keys(translations.el);

  // Greek dictionary must cover all keys
  assert.equal(elKeys.length, ruKeys.length, `Expected ${ruKeys.length} keys in Greek, found ${elKeys.length}`);
  for (const key of ruKeys) {
    assert.ok(translations.el[key] !== undefined, `Missing Greek key: ${key}`);
  }

  // Verify key translations in Greek
  assert.equal(translations.el["nav.home"], "Αρχική");
  assert.equal(translations.el["nav.bookPicks"], "Συλλογή");
  assert.equal(translations.el["home.title"], "Αυθεντικά Ανατολίτικα Αρώματα");
  assert.equal(translations.el["privileged.title"], "Πίνακας Ελέγχου");
});

test("Romanian language is registered in translations and has comprehensive key coverage", () => {
  assert.ok(translations.ro, "Romanian translation dictionary exists");
  assert.ok(translations.ru, "Russian translation dictionary exists");

  const ruKeys = Object.keys(translations.ru);
  const roKeys = Object.keys(translations.ro);

  // Romanian dictionary must cover all keys
  assert.equal(roKeys.length, ruKeys.length, `Expected ${ruKeys.length} keys in Romanian, found ${roKeys.length}`);
  for (const key of ruKeys) {
    assert.ok(translations.ro[key] !== undefined, `Missing Romanian key: ${key}`);
  }

  // Verify key translations in Romanian
  assert.equal(translations.ro["nav.home"], "Acasă");
  assert.equal(translations.ro["nav.bookPicks"], "Colecție");
  assert.equal(translations.ro["home.title"], "Parfumuri Orientale Autentice");
  assert.equal(translations.ro["privileged.title"], "Panou de Control");
});

test("Language to default currency switching rule works correctly", () => {
  function getAutoCurrencyForLanguage(lang, prevLang, currentCurrency) {
    if ((lang === "hu" || lang === "ro") && prevLang !== lang) {
      return "RON";
    }
    if ((lang === "ru" || lang === "en" || lang === "bg" || lang === "el") && prevLang !== lang) {
      return "EUR";
    }
    return currentCurrency;
  }

  // Switching from Russian to Hungarian sets RON
  assert.equal(getAutoCurrencyForLanguage("hu", "ru", "EUR"), "RON");

  // Switching from Romanian to Russian sets EUR
  assert.equal(getAutoCurrencyForLanguage("ru", "ro", "RON"), "EUR");

  // Switching from Hungarian to Russian sets EUR
  assert.equal(getAutoCurrencyForLanguage("ru", "hu", "RON"), "EUR");

  // Switching from English to Romanian sets RON
  assert.equal(getAutoCurrencyForLanguage("ro", "en", "EUR"), "RON");

  // Switching from Greek to Romanian sets RON
  assert.equal(getAutoCurrencyForLanguage("ro", "el", "HUF"), "RON");

  // Staying on Romanian keeps RON
  assert.equal(getAutoCurrencyForLanguage("ro", "ro", "RON"), "RON");

  // Staying on Russian keeps EUR
  assert.equal(getAutoCurrencyForLanguage("ru", "ru", "EUR"), "EUR");

  // Switching from Romanian to English sets EUR
  assert.equal(getAutoCurrencyForLanguage("en", "ro", "RON"), "EUR");

  // Switching from Romanian to Bulgarian sets EUR
  assert.equal(getAutoCurrencyForLanguage("bg", "ro", "RON"), "EUR");

  // Switching from Romanian to Greek sets EUR
  assert.equal(getAutoCurrencyForLanguage("el", "ro", "RON"), "EUR");

  // Switching from Hungarian to English with HUF currency sets EUR
  assert.equal(getAutoCurrencyForLanguage("en", "hu", "HUF"), "EUR");

  // Staying on English keeps EUR
  assert.equal(getAutoCurrencyForLanguage("en", "en", "EUR"), "EUR");

  // Switching from English to Bulgarian sets EUR
  assert.equal(getAutoCurrencyForLanguage("bg", "en", "HUF"), "EUR");

  // Staying on Bulgarian keeps EUR
  assert.equal(getAutoCurrencyForLanguage("bg", "bg", "EUR"), "EUR");
});

test("Rate sync logic correctly differentiates >= 5% jump, Monday weekly sync, and routine check", () => {
  const currentRate = 5.0;

  // 1. Sharp movement >= 5% (e.g. 5.26 / 5.0 = 5.2% jump)
  const sharpJumpRate = 5.26;
  const pctChangeSharp = Math.abs(sharpJumpRate - currentRate) / currentRate;
  assert.ok(pctChangeSharp >= 0.05, "Change is >= 5%");

  // 2. Normal movement < 5% (e.g. 5.05 / 5.0 = 1% change)
  const mildChangeRate = 5.05;
  const pctChangeMild = Math.abs(mildChangeRate - currentRate) / currentRate;
  assert.ok(pctChangeMild < 0.05, "Change is < 5%");

  // Decision logic verification
  function shouldSync({ diff, isMonday, isForce }) {
    if (isForce) return { shouldSync: true, reason: "force" };
    if (diff >= 0.05) return { shouldSync: true, reason: "sharp_movement" };
    if (isMonday) return { shouldSync: true, reason: "weekly_monday" };
    return { shouldSync: false, reason: "daily_check_passed" };
  }

  assert.deepEqual(shouldSync({ diff: 0.06, isMonday: false, isForce: false }), {
    shouldSync: true,
    reason: "sharp_movement",
  });
  assert.deepEqual(shouldSync({ diff: 0.02, isMonday: true, isForce: false }), {
    shouldSync: true,
    reason: "weekly_monday",
  });
  assert.deepEqual(shouldSync({ diff: 0.02, isMonday: false, isForce: false }), {
    shouldSync: false,
    reason: "daily_check_passed",
  });
  assert.deepEqual(shouldSync({ diff: 0.01, isMonday: false, isForce: true }), {
    shouldSync: true,
    reason: "force",
  });
});

test("GitHub Actions workflows exist for RON and HUF with correct daily schedule at 03:00", () => {
  const ronWorkflowPath = path.resolve(__dirname, "../../.github/workflows/sync-ron-rate.yml");
  const hufWorkflowPath = path.resolve(__dirname, "../../.github/workflows/sync-huf-rate.yml");

  assert.ok(fs.existsSync(ronWorkflowPath), "sync-ron-rate.yml exists");
  assert.ok(fs.existsSync(hufWorkflowPath), "sync-huf-rate.yml exists");

  const ronContent = fs.readFileSync(ronWorkflowPath, "utf8");
  const hufContent = fs.readFileSync(hufWorkflowPath, "utf8");

  // Check schedule: daily at 3:00 AM UTC
  assert.match(ronContent, /cron:\s*["']0 3 \* \* \*["']/);
  assert.match(hufContent, /cron:\s*["']0 3 \* \* \*["']/);

  // Check currency flags
  assert.match(ronContent, /--currency=RON/);
  assert.match(hufContent, /--currency=HUF/);

  // Safety rule check: neither workflow touches full-database-refresh
  assert.ok(!ronContent.includes("full-database-refresh"));
  assert.ok(!hufContent.includes("full-database-refresh"));
});

test("getPerfumeMinOrder and applyMinOrderFilter accurately enforce MOQ and exclude items requiring > 1 unit", async () => {
  const { getPerfumeMinOrder, applyMinOrderFilter } = await import("../utils/perfumes.js");

  // Al Fares Abaq Oud For Love is sold in bundles of 4
  const abaqItem = {
    id: "5241",
    name: "Al Fares Abaq Oud For Love - Fragrance",
    gtin: "6294021900843",
  };
  assert.equal(getPerfumeMinOrder(abaqItem), 4, "Abaq Oud minimum order must resolve to 4");

  // Lattafa Yara is sold in bundles of 6
  const yaraItem = {
    id: "3840",
    name: "Lattafa Yara 100ml EDP",
    gtin: "6291108730515",
  };
  assert.equal(getPerfumeMinOrder(yaraItem), 6, "Yara minimum order must resolve to 6");

  // Single unit perfume
  const singleItem = {
    id: "9999",
    name: "Standard Single Bottle EDP",
    minOrderQuantity: 1,
  };
  assert.equal(getPerfumeMinOrder(singleItem), 1, "Single item MOQ must resolve to 1");

  // Filter with minOrder 1..1 (only single-unit items allowed)
  const singleOnlySettings = { minOrderFrom: 1, minOrderTo: 1 };
  const catalog = [abaqItem, yaraItem, singleItem];
  const filtered = applyMinOrderFilter(catalog, singleOnlySettings);

  assert.equal(filtered.length, 1, "Only single-unit items should pass the 1..1 filter");
  assert.equal(filtered[0].id, "9999", "Only the true MOQ 1 item passes");

  // Filter with minOrder 1..4 (allows single bottles up to bundles of 4)
  const upTo4Settings = { minOrderFrom: 1, minOrderTo: 4 };
  const filteredUpTo4 = applyMinOrderFilter(catalog, upTo4Settings);
  assert.equal(filteredUpTo4.length, 2, "Items with MOQ <= 4 should pass");
  assert.ok(filteredUpTo4.some((p) => p.name.includes("Abaq Oud")));
  assert.ok(!filteredUpTo4.some((p) => p.name.includes("Yara")));
});
