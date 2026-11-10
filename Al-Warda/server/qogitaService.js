import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import axios from "axios";
import https from "node:https";
import qogitaClient from "./qogitaClient.js";
import { isGeneratedProductImage } from "../utils/generatedProductImage.js";

const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(currentDir, "..");
const dropshipDir = path.resolve(appDir, "public/assets/img/dropship");
if (!fs.existsSync(dropshipDir)) {
  fs.mkdirSync(dropshipDir, { recursive: true });
}

// Keep an in-memory log of recent webhook deliveries and catalog downloads for the admin UI
const recentWebhookEvents = [];
const recentCatalogJobs = [];
const MAX_LOG_SIZE = 50;

// In-memory cache for Arabian Dropship perfumes
const cacheFilePath = path.resolve(appDir, "server/data/cachedArabianPerfumes.json");
const minOrderMapPath = path.resolve(appDir, "server/data/qogitaMinOrderMap.json");
let minOrderMap = { byGtin: {}, byName: {} };
if (fs.existsSync(minOrderMapPath)) {
  try {
    minOrderMap = JSON.parse(fs.readFileSync(minOrderMapPath, "utf8"));
  } catch (err) {
    console.warn("Could not load qogitaMinOrderMap.json:", err.message);
  }
}
let cachedArabianPerfumes = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

if (fs.existsSync(cacheFilePath)) {
  try {
    cachedArabianPerfumes = JSON.parse(fs.readFileSync(cacheFilePath, "utf8"));
    for (const item of cachedArabianPerfumes) {
      if (item.rawImage) {
        item.image = getProcessedQogitaPhotoPath(item.gtin, item.rawImage);
      } else if (item.image && item.image.startsWith("/assets/img/dropship/")) {
        item.image = item.image.split("?")[0] + "?v=qogita-gemini-image-v3";
        item.fullCardImage = item.image;
      }
      item.fullCardImage = item.image;
    }
    lastCacheTime = Date.now();
  } catch {
    // ignore
  }
}

export const ARABIAN_BRANDS_TO_FETCH = [
  "Lattafa",
  "Armaf",
  "Al Haramain",
  "Ard Al Zaafaran",
  "Maison Alhambra",
  "Afnan",
  "Ajmal",
  "Al Wataniah",
  "Amouage",
  "Arabian Oud",
  "Asdaaf",
  "Ayat Perfumes",
  "French Avenue",
  "Khadlaj",
  "Rasasi",
  "Swiss Arabian",
  "Zimaya",
  "Riiffs",
  "Gulf Orchid",
  "My Perfumes",
  "Rayhaan",
  "Orientica",
  "Al Rehab",
  "Nabeel",
  "Fragrance World",
  "Paris Corner",
];

export function hasValidPhoto(item) {
  if (!item) return false;
  const raw = item.imageUrl || item.image || item.variants?.[0]?.imageUrl || item.rawImage;
  if (!raw || typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return false;
  if (/placeholder|no-image|default_image|missing|not_found/i.test(trimmed)) return false;
  if (trimmed.includes("c1b79cffa1a5fa8aab226414b9e4a063")) return false;
  return true;
}

export const ARABIAN_BRANDS = [
  "lattafa",
  "armaf",
  "al haramain",
  "ard al zaafaran",
  "maison alhambra",
  "ajmal",
  "amouage",
  "rasasi",
  "swiss arabian",
  "ayat perfumes",
  "khadlaj",
  "arabian oud",
  "riiffs",
  "al wataniah",
  "gulf orchid",
  "afnan",
  "maison asrar",
  "french avenue",
  "zimaya",
  "myperfumes",
  "my perfumes",
  "rayhaan",
  "asdaaf",
  "reef",
  "matin martin",
  "nylah by rasasi",
  "turathi",
  "oudh anfar",
  "arabiyat al-ighra",
  "arabiyat",
  "fragrance world",
  "le chameau",
  "musk by afnan",
  "nishane",
  "pendora scents",
  "paris corner",
  "orientica",
  "al rehab",
  "nabeel",
  "al-warda",
];

const WESTERN_EXCLUSIONS = [
  "tom ford", "gucci", "dior", "chanel", "versace", "calvin klein",
  "armani", "giorgio armani", "dolce", "yves saint laurent", "prada",
  "burberry", "givenchy", "paco rabanne", "hugo boss", "creed", "bielenda"
];

function getProcessedQogitaPhotoPath(gtin, rawImageUrl) {
  const filename = gtin
    ? `${gtin}.jpg`
    : `${createHash("md5").update(rawImageUrl).digest("hex")}.jpg`;
  const directory = gtin ? "products" : "dropship";
  return `/assets/img/${directory}/${filename}?v=qogita-gemini-image-v3`;
}

/**
 * Filter items strictly to Arabian perfumes
 */
export function isArabianPerfume(item) {
  if (!item) return false;
  const brand = (item.brand || item.brandName || "").toLowerCase();
  const name = (item.name || "").toLowerCase();
  const category = (item.category || item.categoryName || "").toLowerCase();

  // Exclude western luxury brands from false positives on "oud/amber" keywords
  if (WESTERN_EXCLUSIONS.some((w) => brand.includes(w) || name.includes(w))) {
    return false;
  }

  // Exclude non-perfumes / skincare / cosmetics
  if (
    category.includes("cream") ||
    category.includes("mask") ||
    category.includes("serum") ||
    category.includes("shampoo") ||
    category.includes("lotion") ||
    name.includes("wrapping mask") ||
    name.includes("sunscreen") ||
    name.includes("collagen") ||
    name.includes("retinal")
  ) {
    return false;
  }

  // Check Arabian brands
  const matchesBrand = ARABIAN_BRANDS.some(
    (b) => brand.includes(b) || name.includes(b),
  );
  if (matchesBrand) return true;

  // Check oriental / Arabian perfume keywords in name
  const hasOrientalKeywords =
    (name.includes("oud") ||
      name.includes("attar") ||
      name.includes("bakhoor") ||
      name.includes("musk") ||
      name.includes("amber")) &&
    (name.includes("edp") ||
      name.includes("parfum") ||
      name.includes("perfume") ||
      name.includes("eau de"));

  return Boolean(hasOrientalKeywords);
}

/**
 * Extract lowest price for minimum purchase MOV <= targetMov (default 500 EUR)
 * On Qogita, suppliers define tiered prices by Minimum Order Value (MOV):
 * e.g., MOV 15,000 -> 14.10, MOV 1,500 -> 14.12, MOV 500 -> 14.21.
 * Standard wholesale orders use the lowest unit price from the <= 500 EUR MOV tier.
 */
export function extractQogitaPriceForMov(qogitaItem, targetMov = 500) {
  let allTiers = [];

  // 1. Direct tiered prices on item
  if (Array.isArray(qogitaItem.tieredPrices)) {
    allTiers.push(...qogitaItem.tieredPrices);
  }
  if (Array.isArray(qogitaItem.tiered_prices)) {
    allTiers.push(...qogitaItem.tiered_prices);
  }

  // 2. Tiers within variants
  if (Array.isArray(qogitaItem.variants)) {
    for (const v of qogitaItem.variants) {
      if (Array.isArray(v.tieredPrices)) allTiers.push(...v.tieredPrices);
      if (Array.isArray(v.tiered_prices)) allTiers.push(...v.tiered_prices);
    }
  }

  // 3. Tiers within offers
  if (Array.isArray(qogitaItem.offers)) {
    for (const off of qogitaItem.offers) {
      if (Array.isArray(off.tieredPrices)) allTiers.push(...off.tieredPrices);
      if (Array.isArray(off.tiered_prices)) allTiers.push(...off.tiered_prices);
    }
  }

  // Filter tiers where tier MOV <= targetMov
  const eligible = allTiers.filter((t) => {
    const movVal = parseFloat(t.tierMov?.amount ?? t.mov ?? t.tier_mov?.amount ?? 0);
    return movVal <= targetMov;
  });

  if (eligible.length > 0) {
    eligible.sort((a, b) => {
      const pa = parseFloat(a.tierPrice?.amount ?? a.amount ?? a.tier_price?.amount ?? 999999);
      const pb = parseFloat(b.tierPrice?.amount ?? b.amount ?? b.tier_price?.amount ?? 999999);
      return pa - pb;
    });
    const best = eligible[0];
    const bestAmount = parseFloat(best.tierPrice?.amount ?? best.amount ?? best.tier_price?.amount ?? 0);
    if (bestAmount > 0) {
      return {
        amount: Math.round(bestAmount * 100) / 100,
        currency: best.tierPrice?.currency || best.currency || "EUR",
      };
    }
  }

  // Fallback to top-level price if no eligible tier is found
  let amount = 0;
  let currency = "EUR";
  if (qogitaItem.price && qogitaItem.price.amount) {
    amount = parseFloat(qogitaItem.price.amount);
    currency = qogitaItem.price.currency || "EUR";
  } else if (qogitaItem.variants?.[0]?.lowestOfferPrice) {
    amount = parseFloat(qogitaItem.variants[0].lowestOfferPrice.amount || 0);
    currency = qogitaItem.variants[0].lowestOfferPrice.currency || "EUR";
  }
  if (!amount || isNaN(amount)) amount = 19.90;

  return {
    amount: Math.round(amount * 100) / 100,
    currency,
  };
}

export function stripVolumeFromName(name) {
  if (!name || typeof name !== "string") return name || "";
  let s = name;
  s = s.replace(/\(?\b\d+(?:[.,]\d+)?\s*(?:ml|мл)\s*\/\s*\d+(?:[.,]\d+)?\s*(?:fl\.?\s*oz\.?|oz\.?)\)?/gi, " ");
  s = s.replace(/\b\d+\s*[xX×*]\s*\d+(?:[.,]\d+)?\s*(?:ml|мл)\b/gi, " ");
  s = s.replace(/\bsize[:\s]+\d+(?:[.,]\d+)?\s*(?:ml|мл|oz|fl\.?\s*oz\.?|ounce)\b/gi, " ");
  s = s.replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|мл|milliliters?|millilitres?|миллилитр(?:ов|а)?)\b/gi, " ");
  s = s.replace(/\b\d+(?:[.,]\d+)?\s*(?:fl\.?\s*oz\.?|fluid\s*ounces?|oz\.?|ounces?)\b/gi, " ");
  s = s.replace(/\(\s*\)/g, " ").replace(/\[\s*\]/g, " ");
  s = s.replace(/\s*-\s*-\s*/g, " - ");
  s = s.replace(/\s+([,.])\s*/g, "$1 ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[-–—,/:;|]+\s*/, "").replace(/\s*[-–—,/:;|]+$/, "").trim();
  return s;
}

/**
 * Map Qogita product to Al-Warda dropship perfume schema
 * Fixed price directly in EUR (no dynamic markup formula)
 */
export function mapQogitaProductToPerfume(qogitaItem) {
  const gtin = qogitaItem.gtin || "";
  const name = qogitaItem.name || "Unknown Fragrance";
  const brand = qogitaItem.brand || qogitaItem.brandName || "Arabian Perfume";
  const slug = `dropship-${(qogitaItem.qid || gtin || name).toString().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  // Direct wholesale price in EUR (lowest price for MOV <= 500 EUR)
  const priceInfo = extractQogitaPriceForMov(qogitaItem, 500);
  const amount = priceInfo.amount;
  const currency = priceInfo.currency;

  const rawImageUrl =
    qogitaItem.imageUrl ||
    qogitaItem.image ||
    qogitaItem.variants?.[0]?.imageUrl;

  // Strictly exclude items with missing or invalid photos or wholesale bundles
  if (
    !rawImageUrl ||
    typeof rawImageUrl !== "string" ||
    !rawImageUrl.startsWith("http") ||
    /placeholder|no-image|default_image|missing|not_found/i.test(rawImageUrl) ||
    rawImageUrl.includes("c1b79cffa1a5fa8aab226414b9e4a063") ||
    /\b(pack\s*of\s*\d+|\d+\s*pack\b|bundle\s*of\s*\d+|\bcase\s*of\s*\d+|\bcarton\s*of\s*\d+|\bwholesale\s*bundle\b|\bmultipack\b)\b/i.test(name)
  ) {
    return null;
  }

  const imageUrl = getProcessedQogitaPhotoPath(gtin, rawImageUrl);

  const isTopBestSeller = /khamrah|club de nuit|asad|yara|odyssey|amber oud|honor & glory|liquid brun/i.test(name);

  const cleanDisplayName = stripVolumeFromName(name);

  return {
    id: slug,
    slug: slug,
    name: cleanDisplayName,
    title: cleanDisplayName,
    brand: brand,
    category: "oud",
    notesSummary: brand,
    price: Math.round(amount * 100) / 100,
    currency: currency,
    minOrderQuantity: 1,
    unit: 1,
    volume: "100ml / 3.4 FL.OZ.",
    concentration: "Eau de Parfum",
    gender: "Unisex",
    rating: 4.9,
    reviewsCount: 38,
    isBestSeller: isTopBestSeller,
    isFeatured: true,
    inStock: true,
    isDropship: true,
    deliveryTime: "4–7 дней (прямая поставка)",
    image: imageUrl,
    fullCardImage: imageUrl,
    rawImage: rawImageUrl,
    qogitaQid: qogitaItem.qid,
    gtin: gtin,
    origin: "Ближний Восток",
    originEn: "Middle East",
    categoryRu: "Восточные",
    categoryEn: "Oriental",
    topNotes: ["Шафран", "Бергамот", "Розовый перец"],
    heartNotes: ["Дамасская роза", "Благородный уд", "Амбра"],
    baseNotes: ["Белый мускус", "Сандал", "Мадагаскарская ваниль"],
    topNotesRu: ["Шафран", "Бергамот", "Розовый перец"],
    heartNotesRu: ["Дамасская роза", "Благородный уд", "Амбра"],
    baseNotesRu: ["Белый мускус", "Сандал", "Мадагаскарская ваниль"],
    topNotesEn: ["Saffron", "Bergamot", "Pink Pepper"],
    heartNotesEn: ["Damask Rose", "Precious Oud", "Amber"],
    baseNotesEn: ["White Musk", "Sandalwood", "Madagascar Vanilla"],
    description: `${brand} ${name} — роскошный селективный аромат с Ближнего Востока, созданный в лучших традициях восточного парфюмерного искусства. С первых мгновений композиция завораживает ярким вступлением верхних нот (Шафран, Бергамот, Розовый перец), плавно раскрываясь глубоким сердцем из Дамасской розы, Благородного уда и Амбры, и оставляя бархатистый шлейф из Белого мускуса, Сандала и Мадагаскарской ванили.`,
    descriptionRu: `${brand} ${name} — роскошный селективный аромат с Ближнего Востока, созданный в лучших традициях восточного парфюмерного искусства. С первых мгновений композиция завораживает ярким вступлением верхних нот (Шафран, Бергамот, Розовый перец), плавно раскрываясь глубоким сердцем из Дамасской розы, Благородного уда и Амбры, и оставляя бархатистый шлейф из Белого мускуса, Сандала и Мадагаскарской ванили.`,
    descriptionEn: `${brand} ${name} is an opulent niche fragrance from the Middle East, crafted in the finest traditions of oriental perfumery. From the very first spritz, the composition captivates with luminous top notes of Saffron, Bergamot, and Pink Pepper, unfolding into a rich heart of Damask Rose, Precious Oud, and Amber, and settling into a velvety trail of White Musk, Sandalwood, and Madagascar Vanilla.`,
  };
}

/**
 * Fetch and cache the complete original product photo as PNG without removing its background.
 */
export async function getTransparentImageBuffer(rawUrl) {
  if (!rawUrl) throw new Error("Missing image URL");
  const hash = createHash("md5").update(`original-photo-v2:${rawUrl}`).digest("hex");
  const cachePath = path.join(dropshipDir, `${hash}.png`);

  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath);
  }

  const res = await axios.get(rawUrl, {
    responseType: "arraybuffer",
    httpsAgent: insecureHttpsAgent,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    timeout: 10000,
  });

  const png = await sharp(Buffer.from(res.data)).rotate().png().toBuffer();
  fs.writeFileSync(cachePath, png);
  const distPath = path.resolve(appDir, `dist/assets/img/dropship/${hash}.png`);
  if (fs.existsSync(path.dirname(distPath))) {
    fs.writeFileSync(distPath, png);
  }

  return png;
}

/**
 * Fetch and filter Arabian perfumes available for dropshipping
 */
export async function getArabianDropshipPerfumes(params = {}) {
  const { query = "", brand = "", inStockOnly = true } = params;

  // Refresh cache if stale
  if (!cachedArabianPerfumes || Date.now() - lastCacheTime > CACHE_TTL_MS) {
    try {
      if (qogitaClient.isConfigured()) {
        const allRawItems = [];
        for (const brandName of ARABIAN_BRANDS_TO_FETCH) {
          try {
            const rawRes = await qogitaClient.searchProducts({
              brandName: brandName,
              stockAvailability: "in_stock",
              page_size: 50,
            });
            const items = rawRes.results || [];
            allRawItems.push(...items);
          } catch (err) {
            console.warn(`Could not load brand ${brandName}:`, err.message);
          }
        }

        // Deduplicate items by GTIN or qid or name, strictly checking photo validity
        const seen = new Set();
        const uniqueItems = allRawItems.filter((item) => {
          if (!hasValidPhoto(item)) return false;
          const key = item.gtin || item.qid || item.name;
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        cachedArabianPerfumes = uniqueItems
          .filter(isArabianPerfume)
          .map(mapQogitaProductToPerfume)
          .filter(Boolean);
        lastCacheTime = Date.now();

        try {
          fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
          fs.writeFileSync(cacheFilePath, JSON.stringify(cachedArabianPerfumes, null, 2), "utf8");
        } catch {
          // ignore cache write error
        }
      } else {
        cachedArabianPerfumes = [];
      }
    } catch (err) {
      console.warn("Failed to load Arabian dropship products from Qogita:", err.message);
      if (!cachedArabianPerfumes) cachedArabianPerfumes = [];
    }
  }

  let results = [...(cachedArabianPerfumes || [])].filter((product) => {
    const generation = product?.info?.imageGeneration;
    const image = generation?.imageUrl || product?.image;
    return (
      generation?.status === "completed" &&
      isGeneratedProductImage(image)
    );
  });

  if (brand) {
    const b = brand.toLowerCase();
    results = results.filter((p) => (p.brand || "").toLowerCase().includes(b));
  }

  if (query) {
    const q = query.toLowerCase().trim();
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.notesSummary.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }

  return {
    count: results.length,
    results,
  };
}

/**
 * Handle incoming webhook POST from Qogita
 */
export async function handleInboundWebhook(rawBodyBuffer, signatureHeader) {
  if (qogitaClient.webhookSecret) {
    const verification = qogitaClient.verifyWebhookSignature(rawBodyBuffer, signatureHeader);
    if (!verification.valid) {
      const err = new Error(`Invalid webhook signature: ${verification.reason}`);
      err.status = 401;
      throw err;
    }
  }

  let event = null;
  try {
    event = JSON.parse(rawBodyBuffer.toString("utf8"));
  } catch (err) {
    const parseErr = new Error("Invalid JSON body in webhook payload");
    parseErr.status = 400;
    throw parseErr;
  }

  const record = {
    id: event.id || `evt_${Date.now()}`,
    type: event.type || "unknown",
    receivedAt: new Date().toISOString(),
    createdAt: event.created_at,
    data: event.data || {},
  };

  recentWebhookEvents.unshift(record);
  if (recentWebhookEvents.length > MAX_LOG_SIZE) {
    recentWebhookEvents.pop();
  }

  if (event.type === "catalog_download.completed") {
    const downloadUrl = event.data?.object?.url;
    console.log(`[Qogita Webhook] Catalog download ready: ${downloadUrl}`);
    recentCatalogJobs.unshift({
      id: event.id,
      status: "completed",
      completedAt: new Date().toISOString(),
      url: downloadUrl,
    });
  } else if (event.type === "catalog_download.failed") {
    console.warn(`[Qogita Webhook] Catalog download failed:`, event.data);
    recentCatalogJobs.unshift({
      id: event.id,
      status: "failed",
      failedAt: new Date().toISOString(),
      reason: event.data?.object?.reason || "Unknown error",
    });
  } else if (event.type === "webhook.test") {
    console.log("[Qogita Webhook] Test event successfully received and verified!");
  }

  return { received: true, id: record.id, type: record.type };
}

/**
 * Get webhook log for admin dashboard
 */
export function getWebhookLogs() {
  return {
    events: recentWebhookEvents,
    catalogJobs: recentCatalogJobs,
  };
}

export default {
  handleInboundWebhook,
  getWebhookLogs,
  extractQogitaPriceForMov,
  mapQogitaProductToPerfume,
  isArabianPerfume,
  getArabianDropshipPerfumes,
  ARABIAN_BRANDS,
};
