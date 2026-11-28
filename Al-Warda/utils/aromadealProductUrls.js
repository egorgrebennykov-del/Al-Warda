import { slugifyPerfumeName } from "./perfumesLite.js";

const AROMADEAL_BASE = "https://aromadeal.de";

/**
 * Resolves the direct supplier product URL on aromadeal.de for a perfume.
 * Falls back to an aromadeal.de search query when no handle is stored yet.
 */
export function getAromadealProductUrl(perfume) {
  try {
    if (!perfume) return `${AROMADEAL_BASE}/collections/all`;

    const explicitUrl =
      perfume.aromadealUrl ||
      perfume.info?.aromadealUrl ||
      perfume.productUrl ||
      perfume.product_url ||
      perfume.info?.productUrl ||
      perfume.info?.product_url;

    if (
      explicitUrl &&
      typeof explicitUrl === "string" &&
      /^https?:\/\/([^/]*\.)?aromadeal\.de\//i.test(explicitUrl)
    ) {
      return explicitUrl;
    }

    const handle =
      perfume.aromadealHandle ||
      perfume.info?.aromadealHandle ||
      perfume.info?.aromadeal_handle;
    if (handle && typeof handle === "string") {
      return `${AROMADEAL_BASE}/products/${encodeURIComponent(handle.trim())}`;
    }

    const name = (perfume.name || perfume.title || "").trim();
    const brand = (perfume.brand || perfume.info?.brand || "").trim();
    const query = name || brand;
    if (query) {
      return `${AROMADEAL_BASE}/search?q=${encodeURIComponent(query)}`;
    }

    if (brand) {
      return `${AROMADEAL_BASE}/collections/${slugifyPerfumeName(brand)}`;
    }

    return `${AROMADEAL_BASE}/collections/all`;
  } catch {
    return `${AROMADEAL_BASE}/collections/all`;
  }
}

/**
 * Builds a Shopify Cart Permalink URL that adds all ordered items (with exact quantities)
 * directly to the Aromadeal cart: https://aromadeal.de/cart/<variantId>:<qty>,...
 */
export function buildAromadealCartPermalink(items = []) {
  if (!Array.isArray(items) || items.length === 0) return "";
  const qtyByVariant = new Map();
  for (const item of items) {
    if (!item) continue;
    const rawVariant =
      item.aromadealVariantId ||
      item.info?.aromadealVariantId ||
      item.variantId ||
      "";
    const cleanId = String(rawVariant).replace(/[^\d]/g, "");
    if (!cleanId) continue;
    const qty = Math.max(1, Math.round(Number(item.quantity || 1)));
    qtyByVariant.set(cleanId, (qtyByVariant.get(cleanId) || 0) + qty);
  }
  if (qtyByVariant.size === 0) return "";
  const pairs = Array.from(qtyByVariant.entries()).map(
    ([variantId, qty]) => `${variantId}:${qty}`,
  );
  return `${AROMADEAL_BASE}/cart/${pairs.join(",")}`;
}
