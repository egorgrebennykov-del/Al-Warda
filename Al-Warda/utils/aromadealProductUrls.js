import { slugifyPerfumeName } from "./perfumes.js";

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
