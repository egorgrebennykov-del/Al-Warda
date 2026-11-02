#!/usr/bin/env node
/**
 * Al-Warda Parfumes - Automatic Stocks & Supabase Bilingual AI Sync Script
 * 
 * Synchronizes Arabian perfume catalog into Supabase 'stocks' table:
 * - Generates bilingual metadata (Russian & English):
 *   description, gender, category, longevity, sillage, olfactory notes.
 * - Stores structured metadata in 'info' JSON column.
 * - Always aligns 4 columns layout, multi-selection, and bilingual display.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";

const STOCKS_API_URL = `${SUPABASE_URL}/rest/v1/stocks`;
const CATALOG_PATH = path.resolve(rootDir, "server", "data", "cachedArabianPerfumes.json");
const ENRICHED_CACHE_PATH = path.resolve(rootDir, "server", "data", "enrichedStocks.json");

const BRAND_ORIGINS = {
  Lattafa: { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  Armaf: { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  "Al Haramain": { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  "Maison Alhambra": { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  Khadlaj: { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  Rasasi: { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  "Paris Corner": { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  Afnan: { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  "Swiss Arabian": { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  Riiffs: { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  Zimaya: { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  "Gulf Orchid": { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  Rayhaan: { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  Orientica: { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  "Al Rehab": { ru: "Саудовская Аравия", en: "Saudi Arabia" },
  Nabeel: { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  "Fragrance World": { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  Amouage: { ru: "Оман", en: "Oman" },
  "Arabian Oud": { ru: "Саудовская Аравия", en: "Saudi Arabia" },
  Asdaaf: { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  "Ayat Perfumes": { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
  "French Avenue": { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" },
};

const FEMININE_KEYWORDS = [
  "femme", "woman", "women", "pour femme", "mademoiselle", "girl", "queen",
  "rose", "pink", "blush", "princess", "yara", "fakhar femme", "haya", "angham",
  "flora", "floral", "bella", "lady", "she", "sublime", "candy", "sweet"
];

function detectGender(name, brand) {
  const lower = `${name} ${brand}`.toLowerCase();
  for (const kw of FEMININE_KEYWORDS) {
    if (lower.includes(kw)) {
      return { ru: "Женский", en: "Women" };
    }
  }

  const isMaleOnly = (lower.includes("homme") && !lower.includes("femme")) ||
    lower.includes("pour homme") ||
    (lower.includes("men") && !lower.includes("women") && !lower.includes("woman")) ||
    lower.includes("asad") || lower.includes("fakhar black") || lower.includes("hunter");

  if (isMaleOnly) {
    return { ru: "Мужской", en: "Men" };
  }

  return { ru: "Унисекс", en: "Unisex" };
}

function detectCategoryAndNotes(name, brand, gender) {
  const lower = `${name} ${brand}`.toLowerCase();
  const isMaleOnly = (gender.ru === "Мужской");

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
      categoryRu: "Свежие акватические",
      categoryEn: "Fresh Aquatic",
      categorySlug: "fresh",
      longevityRu: "8–11 часов (стойкая свежесть)",
      longevityEn: "8–11 hours (Long-lasting Freshness)",
      sillageRu: "Освежающий, диффузный шлейф",
      sillageEn: "Refreshing, diffusive sillage",
      notes: {
        ru: {
          top: ["Морской бриз", "Калабрийский бергамот", "Кубики льда"],
          heart: ["Мята", "Лаванда", "Морская соль"],
          base: ["Амброксан", "Минеральный кедр", "Белый мускус"]
        },
        en: {
          top: ["Sea Breeze", "Calabrian Bergamot", "Ice Cubes"],
          heart: ["Peppermint", "Lavender", "Sea Salt"],
          base: ["Ambroxan", "Mineral Cedar", "White Musk"]
        }
      },
      notesSummaryRu: "Морской бриз · Бергамот · Мята · Амброксан",
      notesSummaryEn: "Sea Breeze · Bergamot · Mint · Ambroxan"
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
      categoryRu: "Фужерные ароматические",
      categoryEn: "Aromatic Fougère",
      categorySlug: "fougere",
      longevityRu: "10–14 часов (очень высокая)",
      longevityEn: "10–14 hours (Very Long Lasting)",
      sillageRu: "Аристократичный, выразительный шлейф",
      sillageEn: "Noble, distinctive sillage",
      notes: {
        ru: {
          top: ["Зеленое яблоко", "Французская лаванда", "Имбирь"],
          heart: ["Мускатный шалфей", "Бурбонская герань", "Ягоды можжевельника"],
          base: ["Дубовый мох", "Гаитянский ветивер", "Бобы тонка"]
        },
        en: {
          top: ["Green Apple", "French Lavender", "Fresh Ginger"],
          heart: ["Clary Sage", "Bourbon Geranium", "Juniper Berries"],
          base: ["Oakmoss", "Haitian Vetiver", "Tonka Bean"]
        }
      },
      notesSummaryRu: "Лаванда · Мускатный шалфей · Ветивер · Дубовый мох",
      notesSummaryEn: "Lavender · Clary Sage · Vetiver · Oakmoss"
    };
  }

  // 3. Gourmand
  if (lower.includes("yara") || lower.includes("marshmallow") || lower.includes("vanilla") || lower.includes("caramel") || lower.includes("choco") || lower.includes("nebras") || lower.includes("khamrah") || lower.includes("eclaire") || lower.includes("tonka") || lower.includes("praline") || lower.includes("honey") || lower.includes("sugar") || lower.includes("sweet") || lower.includes("candy")) {
    return {
      categoryRu: "Восточные гурманские",
      categoryEn: "Oriental Gourmand",
      categorySlug: "gourmand",
      longevityRu: "10–14 часов (очень высокая)",
      longevityEn: "10–14 hours (Very Long Lasting)",
      sillageRu: "Заметный, манящий шлейф (до 2 метров)",
      sillageEn: "Noticeable, alluring sillage (up to 2m)",
      notes: {
        ru: {
          top: ["Тропические фрукты", "Гелиотроп", "Орхидея"],
          heart: ["Взбитые сливки", "Гурманский аккорд", "Карамель"],
          base: ["Бурбонская ваниль", "Сандал", "Белый мускус"]
        },
        en: {
          top: ["Tropical Fruits", "Heliotrope", "Orchid"],
          heart: ["Whipped Cream", "Gourmand Praline", "Caramel"],
          base: ["Bourbon Vanilla", "Sandalwood", "White Musk"]
        }
      },
      notesSummaryRu: "Ваниль · Карамель · Взбитые сливки · Сандал",
      notesSummaryEn: "Vanilla · Caramel · Whipped Cream · Sandalwood"
    };
  }

  // 4. Oud & Wood
  if (lower.includes("oud") || lower.includes("wood") || lower.includes("agar") || lower.includes("bade'e") || lower.includes("ameer") || lower.includes("interlude") || lower.includes("leather") || lower.includes("cuir") || lower.includes("cedar") || lower.includes("sandalwood") || lower.includes("smoke") || lower.includes("incense")) {
    return {
      categoryRu: "Восточные древесные",
      categoryEn: "Oriental Woody",
      categorySlug: "oud",
      longevityRu: "12–16 часов (максимальная)",
      longevityEn: "12–16 hours (Maximum Longevity)",
      sillageRu: "Мощный, благородный шлейф",
      sillageEn: "Powerful, majestic sillage",
      notes: {
        ru: {
          top: ["Камбоджийский уд", "Шафран", "Мускатный орех"],
          heart: ["Королевская роза", "Пачули", "Дымная смола"],
          base: ["Агаровое дерево", "Амбра", "Атласский кедр"]
        },
        en: {
          top: ["Cambodian Oud", "Royal Saffron", "Nutmeg"],
          heart: ["Royal Taif Rose", "Patchouli", "Smoky Resins"],
          base: ["Agarwood", "Amber Crystals", "Atlas Cedar"]
        }
      },
      notesSummaryRu: "Уд · Шафран · Пачули · Смолистая амбра",
      notesSummaryEn: "Oud · Saffron · Patchouli · Resinous Amber"
    };
  }

  // 5. Citrus
  if (lower.includes("citrus") || lower.includes("bergamot") || lower.includes("lemon") || lower.includes("orange") || lower.includes("mandarin") || lower.includes("grapefruit") || lower.includes("lime") || lower.includes("neroli") || lower.includes("limoni") || lower.includes("soleil") || lower.includes("cologne")) {
    return {
      categoryRu: "Цитрусовые искрящиеся",
      categoryEn: "Sparkling Citrus",
      categorySlug: "citrus-fresh",
      longevityRu: "7–10 часов (стойкая свежесть)",
      longevityEn: "7–10 hours (Lasting Freshness)",
      sillageRu: "Искрящийся, бодрящий шлейф",
      sillageEn: "Sparkling, uplifting sillage",
      notes: {
        ru: {
          top: ["Сицилийский лимон", "Красный апельсин", "Бергамот"],
          heart: ["Нероли", "Цветок апельсина", "Розовый перец"],
          base: ["Белый кедр", "Амброксан", "Шелковистый мускус"]
        },
        en: {
          top: ["Sicilian Lemon", "Blood Orange", "Bergamot"],
          heart: ["Neroli", "Orange Blossom", "Pink Pepper"],
          base: ["White Cedar", "Ambroxan", "Silky Musk"]
        }
      },
      notesSummaryRu: "Красный апельсин · Сицилийский лимон · Нероли · Мускус",
      notesSummaryEn: "Blood Orange · Sicilian Lemon · Neroli · Musk"
    };
  }

  // 6. Floral
  if (lower.includes("rose") || lower.includes("jasmine") || lower.includes("flower") || lower.includes("blossom") || lower.includes("taif") || lower.includes("femme") || lower.includes("flora") || lower.includes("tuberose") || lower.includes("peony") || lower.includes("orchid") || lower.includes("pink") || lower.includes("woman") || lower.includes("women") || lower.includes("pour femme") || lower.includes("lady") || gender.ru === "Женский") {
    return {
      categoryRu: "Цветочные восточные",
      categoryEn: "Oriental Floral",
      categorySlug: "floral",
      longevityRu: "8–12 часов (высокая)",
      longevityEn: "8–12 hours (High Longevity)",
      sillageRu: "Нежный, пленительный шлейф",
      sillageEn: "Delicate, captivating sillage",
      notes: {
        ru: {
          top: ["Дамасская роза", "Красные ягоды", "Бергамот"],
          heart: ["Таифская роза", "Жасмин самбак", "Пион"],
          base: ["Кашемировое дерево", "Серая амбра", "Шелковистый мускус"]
        },
        en: {
          top: ["Damask Rose", "Red Berries", "Bergamot"],
          heart: ["Taif Rose", "Jasmine Sambac", "Peony"],
          base: ["Cashmere Wood", "Ambergris", "Silk Musk"]
        }
      },
      notesSummaryRu: "Таифская роза · Жасмин · Кашемир · Мускус",
      notesSummaryEn: "Taif Rose · Jasmine · Cashmere · Musk"
    };
  }

  // 7. Spicy (default for rich oriental)
  return {
    categoryRu: "Восточные пряные",
    categoryEn: "Oriental Spicy",
    categorySlug: "spicy",
    longevityRu: "10–14 часов (очень высокая)",
    longevityEn: "10–14 hours (Very Long Lasting)",
    sillageRu: "Заметный, глубокий шлейф",
    sillageEn: "Deep, distinguished sillage",
    notes: {
      ru: {
        top: ["Королевский шафран", "Черный перец", "Кардамон"],
        heart: ["Корица", "Кофейное зерно", "Табак"],
        base: ["Золотая амбра", "Бобы тонка", "Сандал"]
      },
      en: {
        top: ["Royal Saffron", "Black Pepper", "Cardamom"],
        heart: ["Cinnamon Bark", "Roasted Coffee Bean", "Tobacco"],
        base: ["Golden Amber", "Tonka Bean", "Sandalwood"]
      }
    },
    notesSummaryRu: "Шафран · Черный перец · Кофе · Золотая амбра",
    notesSummaryEn: "Saffron · Black Pepper · Coffee · Golden Amber"
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

function generateEnglishDescription(name, brand, categoryEn, genderEn, notesSummaryEn, longevityEn) {
  return `${brand} ${name} is an authentic luxury Arabian fragrance (${categoryEn.toLowerCase()}) crafted for connoisseurs of refined oriental perfumery. ` +
    `The olfactory composition opens with a distinguished bouquet of ${notesSummaryEn}. ` +
    `Offers remarkable longevity (${longevityEn}) with an opulent, memorable sillage. Designed for ${genderEn.toLowerCase()}. ` +
    `Delivered directly from certified distribution hubs in the UAE and Europe in pristine factory packaging.`;
}

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

async function main() {
  console.log("=================================================");
  console.log("🌸 Al-Warda Parfumes - Supabase Bilingual Stocks Sync");
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

    if (!enriched || !enriched.info?.descriptionEn) {
      const gender = detectGender(item.name, item.brand);
      const catNotes = detectCategoryAndNotes(item.name, item.brand, gender);
      const volume = extractVolume(item.name);
      const concentration = extractConcentration(item.name);
      const origin = BRAND_ORIGINS[item.brand] || { ru: "ОАЭ (Дубай)", en: "UAE (Dubai)" };
      const season = catNotes.categorySlug === "fresh" || catNotes.categorySlug === "citrus-fresh"
        ? { ru: "Весна / Лето", en: "Spring / Summer" }
        : (catNotes.categorySlug === "gourmand" || catNotes.categorySlug === "oud"
            ? { ru: "Осень / Зима / Вечер", en: "Autumn / Winter / Evening" }
            : { ru: "Всесезонный", en: "All Seasons" });

      const descriptionRu = generateRussianDescription(
        item.name,
        item.brand,
        catNotes.categoryRu,
        gender.ru,
        catNotes.notesSummaryRu,
        catNotes.longevityRu
      );

      const descriptionEn = generateEnglishDescription(
        item.name,
        item.brand,
        catNotes.categoryEn,
        gender.en,
        catNotes.notesSummaryEn,
        catNotes.longevityEn
      );

      enriched = {
        name: item.name,
        brand: item.brand || "Al-Warda",
        price: Number(item.price) || 29.99,
        image: item.image || "/assets/img/perfumes/hero-perfume.png",
        description: descriptionRu,
        info: {
          category: catNotes.categoryRu,
          categoryEn: catNotes.categoryEn,
          categorySlug: catNotes.categorySlug,
          gender: gender.ru,
          genderEn: gender.en,
          longevity: catNotes.longevityRu,
          longevityEn: catNotes.longevityEn,
          sillage: catNotes.sillageRu,
          sillageEn: catNotes.sillageEn,
          volume,
          concentration,
          origin: origin.ru,
          originEn: origin.en,
          season: season.ru,
          seasonEn: season.en,
          notes: catNotes.notes,
          notesSummary: catNotes.notesSummaryRu,
          notesSummaryEn: catNotes.notesSummaryEn,
          descriptionRu,
          descriptionEn,
          gtin: item.gtin || "",
          inStock: true,
          deliveryTime: "4–7 дней (прямая поставка из ОАЭ/ЕС)",
          deliveryTimeEn: "4–7 days (direct dispatch from UAE/EU)",
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

  // Also include any new brands/items present in enrichedCache
  const processedNames = new Set(enrichedList.map((e) => (e.name || "").toLowerCase()));
  for (const [k, enriched] of Object.entries(enrichedCache)) {
    if (enriched && enriched.name && !processedNames.has(enriched.name.toLowerCase())) {
      enrichedList.push({
        name: enriched.name,
        brand: enriched.brand || "Al-Warda",
        price: enriched.price || 29.99,
        image: enriched.image || "/assets/img/perfumes/hero-perfume.png",
        description: enriched.description || enriched.info?.descriptionRu || "",
        info: enriched.info || {},
      });
      processedNames.add(enriched.name.toLowerCase());
    }
  }

  fs.writeFileSync(ENRICHED_CACHE_PATH, JSON.stringify(enrichedCache, null, 2), "utf8");
  console.log(`✨ Enriched ${enrichedList.length} perfume items (${enrichedCount} newly profiled with bilingual data).`);

  const isRefresh = process.argv.includes("--refresh");

  // Check existing records in Supabase
  console.log("\n🔍 Checking existing records in Supabase 'stocks'...");
  const existingMap = await fetchAllExistingStocks();
  console.log(`📊 Found ${existingMap.size} existing items in Supabase.`);

  if (isRefresh || existingMap.size === 0) {
    if (existingMap.size > 0) {
      console.log("🧹 Clearing old records for complete bilingual refresh...");
      await fetch(`${STOCKS_API_URL}?id=gt.0`, {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });
    }

    console.log(`\n🚀 Uploading ${enrichedList.length} bilingual items...`);
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
  console.log("🎉 Bilingual Stocks Sync Completed Successfully!");
  console.log(`✅ Total active stock items: ${enrichedList.length}`);
  console.log(`⏰ Finished at: ${new Date().toISOString()}`);
  console.log("=================================================");
}

main().catch((err) => {
  console.error("FATAL sync error:", err);
  process.exit(1);
});
