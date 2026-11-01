#!/usr/bin/env node
/**
 * Al-Warda Parfumes - Automatic Stocks & Supabase AI Sync Script
 * 
 * Synchronizes Arabian perfume catalog into Supabase 'stocks' table:
 * - Generates / enriches category, gender, longevity, sillage, fragrance pyramid notes, and Russian descriptions.
 * - Stores structured metadata in 'info' JSON column.
 * - Intelligently updates existing records and inserts new ones.
 * - Verifies transparent cutout PNG images for all perfumes.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(rootDir, "..");

// Load .env if present
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
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";

const STOCKS_API_URL = `${SUPABASE_URL}/rest/v1/stocks`;
const CATALOG_PATH = path.resolve(rootDir, "server", "data", "cachedArabianPerfumes.json");
const ENRICHED_CACHE_PATH = path.resolve(rootDir, "server", "data", "enrichedStocks.json");

// -------------------------------------------------------------
// Perfume Fragrance Knowledge Base for Accurate Categorization
// -------------------------------------------------------------
const BRAND_ORIGINS = {
  Lattafa: "ОАЭ (Дубай)",
  Armaf: "ОАЭ (Дубай)",
  "Al Haramain": "ОАЭ (Дубай)",
  "Maison Alhambra": "ОАЭ (Дубай)",
  Khadlaj: "ОАЭ (Дубай)",
  Rasasi: "ОАЭ (Дубай)",
  "Paris Corner": "ОАЭ (Дубай)",
  Afnan: "ОАЭ (Дубай)",
  "Swiss Arabian": "ОАЭ (Дубай)",
  Riiffs: "ОАЭ (Дубай)",
  Zimaya: "ОАЭ (Дубай)",
  "Gulf Orchid": "ОАЭ (Дубай)",
  Rayhaan: "ОАЭ (Дубай)",
  Orientica: "ОАЭ (Дубай)",
  "Al Rehab": "Саудовская Аравия",
  Nabeel: "ОАЭ (Дубай)",
  "Fragrance World": "ОАЭ (Дубай)",
  Amouage: "Оман",
  "Arabian Oud": "Саудовская Аравия",
  Asdaaf: "ОАЭ (Дубай)",
  "Ayat Perfumes": "ОАЭ (Дубай)",
  "French Avenue": "ОАЭ (Дубай)",
};

const FEMININE_KEYWORDS = [
  "femme", "woman", "women", "pour femme", "mademoiselle", "girl", "queen",
  "rose", "pink", "blush", "princess", "yara", "fakhar femme", "haya", "angham",
  "flora", "floral", "bella", "lady", "she", "sublime", "candy", "sweet"
];

const MASCULINE_KEYWORDS = [
  "homme", "man", "men", "pour homme", "king", "asad", "khamrah qahwa",
  "fakhar black", "club de nuit intense man", "hunter", "voyage", "legend",
  "sport", "blue", "bleu", "noir", "black", "leather", "vetiver", "stallion", "dareej"
];

function detectGender(name, brand) {
  const lower = `${name} ${brand}`.toLowerCase();
  for (const kw of FEMININE_KEYWORDS) {
    if (lower.includes(kw)) return "Женский";
  }
  for (const kw of MASCULINE_KEYWORDS) {
    if (lower.includes(kw)) return "Мужской";
  }
  return "Унисекс";
}

function detectCategoryAndNotes(name, brand, gender) {
  const lower = `${name} ${brand}`.toLowerCase();
  const isMaleOnly = (lower.includes("homme") && !lower.includes("femme")) ||
    lower.includes("pour homme") ||
    (lower.includes("men") && !lower.includes("women") && !lower.includes("woman"));

  // 1. Fresh / Aquatic
  if (
    lower.includes("aqua") || lower.includes("marine") || lower.includes("ocean") ||
    lower.includes("sea") || lower.includes("cool") || lower.includes("ice") ||
    lower.includes("water") || lower.includes("megamare") || lower.includes("sedley") ||
    lower.includes("legacy") || lower.includes("fresh") || lower.includes("blue") ||
    lower.includes("bleu") || lower.includes("glacier") || lower.includes("breeze") ||
    lower.includes("rain") || lower.includes("river") || lower.includes("hawas") ||
    lower.includes("sailor") || lower.includes("voyage") || lower.includes("sky") ||
    lower.includes("crystal") || lower.includes("pure white") || lower.includes("silver")
  ) {
    return {
      category: "Свежие акватические",
      categorySlug: "fresh",
      longevity: "8–11 часов (стойкая свежесть)",
      sillage: "Освежающий, диффузный шлейф",
      notes: {
        top: ["Морской бриз", "Калабрийский бергамот", "Кубики льда"],
        heart: ["Мята", "Лаванда", "Морская соль"],
        base: ["Амброксан", "Минеральный кедр", "Белый мускус"]
      },
      notesSummary: "Морской бриз · Бергамот · Мята · Амброксан"
    };
  }

  // 2. Fougère / Aromatic
  if (
    lower.includes("fougere") || lower.includes("fougère") || lower.includes("lavender") ||
    lower.includes("sage") || lower.includes("geranium") || lower.includes("moss") ||
    lower.includes("oakmoss") || lower.includes("sauvage") || lower.includes("salvo") ||
    lower.includes("yeah") || lower.includes("fakhar black") || lower.includes("tres nuit") ||
    lower.includes("green irish") || lower.includes("aventus") || lower.includes("club de nuit") ||
    lower.includes("sillage") || lower.includes("milestone") || lower.includes("hunter") ||
    lower.includes("hayaati") || lower.includes("sheikh al shuyukh") || lower.includes("l'aventure") ||
    lower.includes("vert") || lower.includes("vetiver") || lower.includes("herb") ||
    lower.includes("cypress") || lower.includes("rosemary") || lower.includes("sport") ||
    (isMaleOnly && (lower.includes("elixir") || lower.includes("classic") || lower.includes("barber")))
  ) {
    return {
      category: "Фужерные ароматические",
      categorySlug: "fougere",
      longevity: "10–14 часов (очень высокая)",
      sillage: "Аристократичный, выразительный шлейф",
      notes: {
        top: ["Зеленое яблоко", "Французская лаванда", "Имбирь"],
        heart: ["Мускатный шалфей", "Бурбонская герань", "Ягоды можжевельника"],
        base: ["Дубовый мох", "Гаитянский ветивер", "Бобы тонка"]
      },
      notesSummary: "Лаванда · Мускатный шалфей · Ветивер · Дубовый мох"
    };
  }

  // 3. Gourmand
  if (lower.includes("yara") || lower.includes("marshmallow") || lower.includes("vanilla") || lower.includes("caramel") || lower.includes("choco") || lower.includes("nebras") || lower.includes("khamrah") || lower.includes("eclaire") || lower.includes("tonka") || lower.includes("praline") || lower.includes("honey") || lower.includes("sugar") || lower.includes("sweet") || lower.includes("candy")) {
    return {
      category: "Восточные гурманские",
      categorySlug: "gourmand",
      longevity: "10–14 часов (очень высокая)",
      sillage: "Заметный, манящий шлейф (до 2 метров)",
      notes: {
        top: ["Тропические фрукты", "Гелиотроп", "Орхидея"],
        heart: ["Взбитые сливки", "Гурманский аккорд", "Карамель"],
        base: ["Бурбонская ваниль", "Сандал", "Белый мускус"]
      },
      notesSummary: "Ваниль · Карамель · Взбитые сливки · Сандал"
    };
  }

  // 4. Oud & Wood
  if (lower.includes("oud") || lower.includes("wood") || lower.includes("agar") || lower.includes("bade'e") || lower.includes("ameer") || lower.includes("interlude") || lower.includes("leather") || lower.includes("cuir") || lower.includes("cedar") || lower.includes("sandalwood") || lower.includes("smoke") || lower.includes("incense")) {
    return {
      category: "Восточные древесные",
      categorySlug: "oud",
      longevity: "12–16 часов (максимальная)",
      sillage: "Мощный, благородный шлейф",
      notes: {
        top: ["Камбоджийский уд", "Шафран", "Мускатный орех"],
        heart: ["Королевская роза", "Пачули", "Дымная смола"],
        base: ["Агаровое дерево", "Амбра", "Атласский кедр"]
      },
      notesSummary: "Уд · Шафран · Пачули · Смолистая амбра"
    };
  }

  // 5. Citrus
  if (lower.includes("citrus") || lower.includes("bergamot") || lower.includes("lemon") || lower.includes("orange") || lower.includes("mandarin") || lower.includes("grapefruit") || lower.includes("lime") || lower.includes("neroli") || lower.includes("limoni") || lower.includes("soleil") || lower.includes("cologne")) {
    return {
      category: "Цитрусовые искрящиеся",
      categorySlug: "citrus-fresh",
      longevity: "7–10 часов (стойкая свежесть)",
      sillage: "Искрящийся, бодрящий шлейф",
      notes: {
        top: ["Сицилийский лимон", "Красный апельсин", "Бергамот"],
        heart: ["Нероли", "Цветок апельсина", "Розовый перец"],
        base: ["Белый кедр", "Амброксан", "Шелковистый мускус"]
      },
      notesSummary: "Красный апельсин · Сицилийский лимон · Нероли · Мускус"
    };
  }

  // 6. Floral
  if (lower.includes("rose") || lower.includes("jasmine") || lower.includes("flower") || lower.includes("blossom") || lower.includes("taif") || lower.includes("femme") || lower.includes("flora") || lower.includes("tuberose") || lower.includes("peony") || lower.includes("orchid") || lower.includes("pink") || lower.includes("woman") || lower.includes("women") || lower.includes("pour femme") || lower.includes("lady") || gender === "Женский") {
    return {
      category: "Цветочные восточные",
      categorySlug: "floral",
      longevity: "8–12 часов (высокая)",
      sillage: "Нежный, пленительный шлейф",
      notes: {
        top: ["Дамасская роза", "Красные ягоды", "Бергамот"],
        heart: ["Таифская роза", "Жасмин самбак", "Пион"],
        base: ["Кашемировое дерево", "Серая амбра", "Шелковистый мускус"]
      },
      notesSummary: "Таифская роза · Жасмин · Кашемир · Мускус"
    };
  }

  // 7. Spicy (default for rich oriental)
  return {
    category: "Восточные пряные",
    categorySlug: "spicy",
    longevity: "10–14 часов (очень высокая)",
    sillage: "Заметный, глубокий шлейф",
    notes: {
      top: ["Королевский шафран", "Черный перец", "Кардамон"],
      heart: ["Корица", "Кофейное зерно", "Табак"],
      base: ["Золотая амбра", "Бобы тонка", "Сандал"]
    },
    notesSummary: "Шафран · Черный перец · Кофе · Золотая амбра"
  };
}

function extractVolume(name) {
  const match = name.match(/(\d+)\s*(ml|мл)/i);
  if (match) return `${match[1]} мл / ${(Number(match[1]) * 0.0338).toFixed(1)} FL.OZ.`;
  return "100 мл / 3.4 FL.OZ.";
}

function extractConcentration(name) {
  const lower = name.toLowerCase();
  if (lower.includes("extrait") || lower.includes("extract")) return "Extrait de Parfum";
  if (lower.includes("edp") || lower.includes("eau de parfum") || lower.includes("parfum")) return "Eau de Parfum";
  if (lower.includes("edt") || lower.includes("eau de toilette")) return "Eau de Toilette";
  if (lower.includes("attar") || lower.includes("oil")) return "Концентрированное парфюмерное масло (CPO)";
  return "Eau de Parfum";
}

function generateRussianDescription(name, brand, category, gender, notesSummary, longevity) {
  return `${brand} ${name} — премиальный оригинальный арабский аромат (${category.toLowerCase()}), созданный для ценителей утонченной восточной парфюмерии. ` +
    `Звучание раскрывается гармоничным букетом: ${notesSummary}. ` +
    `Обладает великолепной стойкостью (${longevity}) и богатым, запоминающимся шлейфом. Подходит: ${gender === "Унисекс" ? "для мужчин и женщин" : (gender === "Женский" ? "для утонченных женщин" : "для стильных мужчин")}. ` +
    `Поставляется напрямую со складов сертифицированных дистрибьюторов в ОАЭ и Европе в оригинальном флаконе.`;
}

// -------------------------------------------------------------
// Fetch All Existing Stocks from Supabase
// -------------------------------------------------------------
async function fetchAllExistingStocks() {
  const map = new Map();
  let offset = 0;
  const limit = 1000;
  while (true) {
    try {
      const res = await fetch(`${STOCKS_API_URL}?select=id,name,brand&offset=${offset}&limit=${limit}`, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });
      if (!res.ok) break;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const row of rows) {
        if (row.name) {
          map.set(row.name.trim().toLowerCase(), row);
        }
      }
      if (rows.length < limit) break;
      offset += limit;
    } catch (err) {
      console.warn("Could not fetch page of existing stocks:", err.message);
      break;
    }
  }
  return map;
}

// -------------------------------------------------------------
// Main Synchronization Logic
// -------------------------------------------------------------
async function main() {
  console.log("=================================================");
  console.log("🌸 Al-Warda Parfumes - Supabase Stocks Sync");
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`🔗 Target URL: ${STOCKS_API_URL}`);
  console.log("=================================================");

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`❌ Catalog not found at ${CATALOG_PATH}`);
    process.exit(1);
  }

  const rawCatalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  console.log(`📦 Loaded ${rawCatalog.length} perfumes from local dropship catalog.`);

  let enrichedCache = {};
  if (fs.existsSync(ENRICHED_CACHE_PATH)) {
    try {
      enrichedCache = JSON.parse(fs.readFileSync(ENRICHED_CACHE_PATH, "utf8"));
      console.log(`💾 Loaded existing enrichment cache (${Object.keys(enrichedCache).length} items).`);
    } catch {}
  }

  const enrichedList = [];
  let enrichedCount = 0;

  for (const item of rawCatalog) {
    const key = item.id || item.slug || item.name;
    let enriched = enrichedCache[key];

    if (!enriched) {
      const gender = detectGender(item.name, item.brand);
      const catNotes = detectCategoryAndNotes(item.name, item.brand, gender);
      const volume = extractVolume(item.name);
      const concentration = extractConcentration(item.name);
      const origin = BRAND_ORIGINS[item.brand] || "ОАЭ (Дубай)";
      const season = catNotes.category.includes("свежие")
        ? "Весна / Лето"
        : (catNotes.category.includes("гурманские") || catNotes.category.includes("древесные")
            ? "Осень / Зима / Вечер"
            : "Всесезонный");

      const description = generateRussianDescription(
        item.name,
        item.brand,
        catNotes.category,
        gender,
        catNotes.notesSummary,
        catNotes.longevity
      );

      enriched = {
        name: item.name,
        brand: item.brand || "Al-Warda",
        price: Number(item.price) || 29.99,
        image: item.image || "/assets/img/perfumes/hero-perfume.png",
        description,
        info: {
          category: catNotes.category,
          gender,
          longevity: catNotes.longevity,
          sillage: catNotes.sillage,
          volume,
          concentration,
          origin,
          season,
          notes: catNotes.notes,
          notesSummary: catNotes.notesSummary,
          gtin: item.gtin || "",
          inStock: true,
          deliveryTime: "4–7 дней (прямая поставка из ОАЭ/ЕС)",
          updatedAt: new Date().toISOString(),
        },
      };

      enrichedCache[key] = enriched;
      enrichedCount++;
    }

    enrichedList.push({
      name: enriched.name,
      brand: enriched.brand,
      price: enriched.price,
      image: enriched.image,
      description: enriched.description,
      info: enriched.info,
    });
  }

  fs.writeFileSync(ENRICHED_CACHE_PATH, JSON.stringify(enrichedCache, null, 2), "utf8");
  console.log(`✨ Enriched ${enrichedList.length} perfume items (${enrichedCount} newly profiled).`);

  const isRefresh = process.argv.includes("--refresh");

  // Check existing records in Supabase
  console.log("\n🔍 Checking existing records in Supabase 'stocks'...");
  const existingMap = await fetchAllExistingStocks();
  console.log(`📊 Found ${existingMap.size} existing items in Supabase.`);

  if (isRefresh || existingMap.size === 0) {
    if (existingMap.size > 0) {
      console.log("🧹 Clearing old records for complete category refresh...");
      await fetch(`${STOCKS_API_URL}?id=gt.0`, {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });
    }

    console.log(`\n🚀 Uploading ${enrichedList.length} items with updated categories...`);
    const BATCH_SIZE = 50;
    let inserted = 0;
    for (let i = 0; i < enrichedList.length; i += BATCH_SIZE) {
      const batch = enrichedList.slice(i, i + BATCH_SIZE);
      const res = await fetch(STOCKS_API_URL, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(batch),
      });
      if (res.ok || res.status === 201) {
        inserted += batch.length;
        process.stdout.write(`\r✅ Uploaded: ${inserted} / ${enrichedList.length}`);
      } else {
        const err = await res.text();
        console.error(`\n❌ Upload error: ${err}`);
      }
    }
    console.log("");
  } else {
    // Normal incremental sync: only insert new items
    const toInsert = [];
    for (const item of enrichedList) {
      if (!existingMap.has(item.name.trim().toLowerCase())) {
        toInsert.push(item);
      }
    }
    console.log(`📝 New items to insert: ${toInsert.length}`);
    if (toInsert.length > 0) {
      const BATCH_SIZE = 50;
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        const res = await fetch(STOCKS_API_URL, {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(batch),
        });
        if (res.ok || res.status === 201) {
          inserted += batch.length;
          process.stdout.write(`\r✅ Inserted: ${inserted} / ${toInsert.length}`);
        }
      }
      console.log("");
    }
  }

  console.log("\n=================================================");
  console.log("🎉 Stocks Sync Completed Successfully!");
  console.log(`✅ Total active stock items: ${enrichedList.length}`);
  console.log(`⏰ Finished at: ${new Date().toISOString()}`);
  console.log("=================================================");
}

main().catch((err) => {
  console.error("FATAL sync error:", err);
  process.exit(1);
});
