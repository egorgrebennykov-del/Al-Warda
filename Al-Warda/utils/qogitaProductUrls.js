import QOGITA_PRODUCTS_MAP from "../src/data/qogitaProductsMap.js";
import { getPerfumeGtin, slugifyPerfumeName } from "./perfumes.js";

// The slug -> Qogita product-id map above is large (~340 KB) and is only needed
// by privileged surfaces (Qogita manager, product page admin links). It lives in
// its own module so the bundler can keep it out of the public critical path and
// load it on demand.
export function getQogitaProductUrl(perfume) {
  try {
    if (!perfume) return "https://www.qogita.com/brands/";

    // 1. Explicit direct product URL if available
    const explicitUrl =
      perfume.qogitaUrl ||
      perfume.qogita_url ||
      perfume.productUrl ||
      perfume.product_url ||
      perfume.info?.qogitaUrl ||
      perfume.info?.qogita_url ||
      perfume.info?.productUrl ||
      perfume.info?.product_url;

    if (
      explicitUrl &&
      typeof explicitUrl === "string" &&
      /^https?:\/\//i.test(explicitUrl)
    ) {
      return explicitUrl;
    }

    const name = (perfume.name || perfume.title || "").trim();
    const brand = (perfume.brand || perfume.info?.brand || "").trim();
    const normName = slugifyPerfumeName(name);

    // 2. Direct match by exact slug in Qogita products map
    if (QOGITA_PRODUCTS_MAP && QOGITA_PRODUCTS_MAP[normName]) {
      return `https://www.qogita.com/products/${QOGITA_PRODUCTS_MAP[normName]}/${normName}/`;
    }

    // 3. Match by key perfume name words
    if (QOGITA_PRODUCTS_MAP && normName) {
      const stopWords = new Set([
        "eau",
        "de",
        "parfum",
        "edp",
        "edt",
        "spray",
        "for",
        "men",
        "women",
        "unisex",
        "fragrance",
        "perfume",
        "extrait",
        "ml",
        "oz",
        "100ml",
        "50ml",
        "90ml",
        "80ml",
        "60ml",
        "отливант",
        "пробник",
        "набор",
      ]);
      // Brand words ("al", "haramain") must not count towards a match, otherwise any
      // product of the same brand (e.g. a different gift set) can be picked by mistake.
      const brandWords = new Set(
        slugifyPerfumeName(brand).split("-").filter(Boolean),
      );
      const nameWords = normName
        .split("-")
        .filter(
          (w) => w && !stopWords.has(w) && !brandWords.has(w) && !/^\d/.test(w),
        );

      if (nameWords.length > 0) {
        let bestSlug = null;
        let bestId = null;
        let bestScore = 0;
        let bestExtra = Infinity;

        for (const [slug, id] of Object.entries(QOGITA_PRODUCTS_MAP)) {
          const slugWords = slug.split("-");
          let score = 0;
          for (const w of nameWords) {
            if (slugWords.includes(w)) score++;
          }
          if (!score) continue;
          // Prefer the slug with the fewest unrelated words ("khamrah" over "khamrah-qahwa").
          const extra = slugWords.filter(
            (w) =>
              w &&
              !stopWords.has(w) &&
              !brandWords.has(w) &&
              !/^\d/.test(w) &&
              !nameWords.includes(w),
          ).length;
          if (score > bestScore || (score === bestScore && extra < bestExtra)) {
            bestScore = score;
            bestExtra = extra;
            bestSlug = slug;
            bestId = id;
          }
        }

        // Require (nearly) every distinctive word to match; otherwise fall back to the exact GTIN search.
        const requiredScore =
          nameWords.length <= 2
            ? nameWords.length
            : Math.ceil(nameWords.length * 0.8);
        if (bestScore >= requiredScore && bestSlug && bestId) {
          return `https://www.qogita.com/products/${bestId}/${bestSlug}/`;
        }
      }
    }

    // 4. GTIN search link on Qogita. Use the public catalog page: the
    // buyer-account catalog (`/account/catalog/`) is login-gated and bounced
    // anonymous visitors to a blank login wall, which looked like a dead link.
    const gtin = getPerfumeGtin(perfume);
    if (gtin) {
      return `https://www.qogita.com/catalog/?search=${encodeURIComponent(gtin)}`;
    }

    // 5. Brand page fallback on Qogita
    if (brand) {
      const brandSlug = slugifyPerfumeName(brand);
      return `https://www.qogita.com/brands/${brandSlug}/`;
    }

    return "https://www.qogita.com/brands/";
  } catch {
    // Never break the whole admin surface on a malformed product object.
    return "https://www.qogita.com/brands/";
  }
}
