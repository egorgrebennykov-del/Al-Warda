// Lightweight sync helpers extracted from utils/perfumes.js so the homepage
// critical path does NOT pull in the heavy catalogue
// (SPECIFIC_PERFUME_PROFILES (~1000 lines of hardcoded scent pyramids),
// Supabase fetch logic, Qogita products map, etc.).
//
// Asynchronous catalogue loading stays in utils/perfumes.js and is imported
// on demand by the components that need it (search, product pages, etc.).
import { PERFUME_CATEGORIES } from "../src/data/perfumesData.js";

export { PERFUME_CATEGORIES };

export function getCategories() {
  return PERFUME_CATEGORIES;
}

// Simple slug generator (mirrors utils/perfumes.js slugifyPerfumeName without
// importing the heavy module).
export function slugifyPerfumeName(name) {
  if (!name) return "perfume";
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getPerfumeUrl(perfume) {
  if (!perfume) return "/featured";
  const slug = slugifyPerfumeName(perfume.name || perfume.title);
  const id = perfume.id || "1";
  return `/perfume/${slug}-${id}`;
}

// Minimal volume parsing used by getDefaultPerfumeVolumeOption.
function parseSimpleVolumeMl(val) {
  if (val == null) return null;
  if (typeof val === "number" && Number.isFinite(val) && val > 0) return val;
  const str = String(val);
  const ml = str.match(/^(\d+(?:[.,]\d+)?)\s*(?:ml|мл)\b/i);
  if (ml) return parseFloat(ml[1].replace(",", "."));
  const oz = str.match(/^(\d+(?:[.,]\d+)?)\s*(?:fl\.?\s*oz|oz)\b/i);
  if (oz) return Math.round(parseFloat(oz[1].replace(",", ".")) * 29.5735);
  const plain = str.match(/^\s*(\d+(?:[.,]\d+)?)\s*$/);
  if (plain) return parseFloat(plain[1].replace(",", "."));
  return null;
}

export function getDefaultPerfumeVolumeOption(perfume) {
  if (!perfume) {
    return {
      price: 0,
      ml: 100,
      key: "full",
      labelRu: "100 мл",
      labelEn: "100 ml",
      isSample: false,
      isSecondLargest: false,
      canChangeVolume: false,
    };
  }
  const knownBottleMl =
    parseSimpleVolumeMl(perfume.volume) ||
    parseSimpleVolumeMl(perfume.name) ||
    100;
  const bottleMl = knownBottleMl || 100;
  const rawBottleLabel = perfume.volume
    ? perfume.volume.split("/")[0].trim()
    : `${bottleMl} мл`;
  return {
    price: Number(perfume.price || 0),
    ml: bottleMl,
    key: "full",
    labelRu: rawBottleLabel.replace(/ml/gi, "мл"),
    labelEn: rawBottleLabel.replace(/мл/gi, "ml"),
    isSample: bottleMl < 30,
    isSecondLargest: false,
    canChangeVolume: false,
  };
}

// Placeholder bestsellers shown while the real catalogue loads asynchronously.
// Mirrors utils/perfumes.js INITIAL_BEST_SELLERS but without
// ensurePerfumeEnrichment (which lives in the heavy module).
export const INITIAL_BEST_SELLERS = [
  {
    id: "4991",
    slug: "stock-4991",
    name: "Afnan Mirsaal Of Trust Eau De Parfum 90ml",
    brand: "Afnan",
    price: 34.50,
    volume: "90 мл / 3.0 FL.OZ.",
    image: "/assets/img/generated-products/fe9c83a22cea23855fda914b174b89ef616d2403dc69304a09532bbaa9613ded.png",
    fullCardImage: "/assets/img/generated-products/fe9c83a22cea23855fda914b174b89ef616d2403dc69304a09532bbaa9613ded.png",
    rating: 4.9,
    reviewsCount: 38,
    isBestSeller: true,
    inStock: true,
    info: {
      imageGeneration: {
        status: "completed",
        imageUrl: "/assets/img/generated-products/fe9c83a22cea23855fda914b174b89ef616d2403dc69304a09532bbaa9613ded.png",
      },
    },
  },
  {
    id: "4998",
    slug: "stock-4998",
    name: "Afnan Rare Tiffany Eau De Parfum 100ml Spray",
    brand: "Afnan",
    price: 32.00,
    volume: "100 мл / 3.4 FL.OZ.",
    image: "/assets/img/generated-products/0bdee47030766f0cf79ea8daf46ee8db0c8651168e61b8a62703a2dbbab56324.png",
    fullCardImage: "/assets/img/generated-products/0bdee47030766f0cf79ea8daf46ee8db0c8651168e61b8a62703a2dbbab56324.png",
    rating: 4.9,
    reviewsCount: 42,
    isBestSeller: true,
    inStock: true,
    info: {
      imageGeneration: {
        status: "completed",
        imageUrl: "/assets/img/generated-products/0bdee47030766f0cf79ea8daf46ee8db0c8651168e61b8a62703a2dbbab56324.png",
      },
    },
  },
  {
    id: "5005",
    slug: "stock-5005",
    name: "Afnan Supremacy Not Only Intense Eau De Parfum 100ml For Men",
    brand: "Afnan",
    price: 36.90,
    volume: "100 мл / 3.4 FL.OZ.",
    image: "/assets/img/generated-products/d7d505ab1c19170d00a33322cf477015e6f9a4f61d01b36706becef35a7049f9.png",
    fullCardImage: "/assets/img/generated-products/d7d505ab1c19170d00a33322cf477015e6f9a4f61d01b36706becef35a7049f9.png",
    rating: 4.9,
    reviewsCount: 36,
    isBestSeller: true,
    inStock: true,
    info: {
      imageGeneration: {
        status: "completed",
        imageUrl: "/assets/img/generated-products/d7d505ab1c19170d00a33322cf477015e6f9a4f61d01b36706becef35a7049f9.png",
      },
    },
  },
];
