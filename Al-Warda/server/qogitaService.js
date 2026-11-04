import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import axios from "axios";
import https from "node:https";
import qogitaClient from "./qogitaClient.js";

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
 * Map Qogita product to Al-Warda dropship perfume schema
 * Fixed price directly in EUR (no dynamic markup formula)
 */
export function mapQogitaProductToPerfume(qogitaItem) {
  const gtin = qogitaItem.gtin || "";
  const name = qogitaItem.name || "Unknown Fragrance";
  const brand = qogitaItem.brand || qogitaItem.brandName || "Arabian Perfume";
  const slug = `dropship-${(qogitaItem.qid || gtin || name).toString().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  // Direct wholesale price in EUR
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

  const rawImageUrl =
    qogitaItem.imageUrl ||
    qogitaItem.image ||
    qogitaItem.variants?.[0]?.imageUrl;

  // Strictly exclude items with missing or invalid photos
  if (
    !rawImageUrl ||
    typeof rawImageUrl !== "string" ||
    !rawImageUrl.startsWith("http") ||
    /placeholder|no-image|default_image|missing|not_found/i.test(rawImageUrl) ||
    rawImageUrl.includes("c1b79cffa1a5fa8aab226414b9e4a063")
  ) {
    return null;
  }

  const imageUrl = getProcessedQogitaPhotoPath(gtin, rawImageUrl);

  const isTopBestSeller = /khamrah|club de nuit|asad|yara|odyssey|amber oud|honor & glory|liquid brun/i.test(name);

  return {
    id: slug,
    slug: slug,
    name: name,
    title: name,
    brand: brand,
    category: "oud",
    notesSummary: brand,
    price: Math.round(amount * 100) / 100,
    currency: currency,
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
    description: `${brand} ${name} — премиальный оригинальный арабский парфюм с богатой ольфакторной пирамидой.`,
    descriptionRu: `${brand} ${name} — премиальный оригинальный арабский парфюм со стойким шлейфом.`,
    descriptionEn: `${brand} ${name} is an authentic luxury Arabian fragrance with an opulent sillage.`,
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
      /^https:\/\/[^/]+\/storage\/v1\/object\/public\/product-images\//i.test(image || "")
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
  mapQogitaProductToPerfume,
  isArabianPerfume,
  getArabianDropshipPerfumes,
  ARABIAN_BRANDS,
};
