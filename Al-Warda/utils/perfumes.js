import { PERFUMES, PERFUME_CATEGORIES, getPerfumeById as getLocalPerfumeById } from "../src/data/perfumesData.js";

const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";

const SUPABASE_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";

const TABLE_PERFUMES = `${SUPABASE_URL}/rest/v1/perfumes`;

let memoryPerfumesCache = null;

export async function fetchPerfumesFromSupabase() {
  try {
    const res = await fetch(`${TABLE_PERFUMES}?select=*&order=is_best_seller.desc,id.asc`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        // Map database fields to standard schema
        const mapped = rows.map((r) => ({
          id: r.slug || String(r.id),
          name: r.name || r.title,
          title: r.name || r.title,
          brand: r.brand || "Al-Warda",
          category: (r.category || "oud").toLowerCase(),
          notesSummary: r.notes_summary || r.notesSummary || "Warm · Seductive · Oriental",
          price: Number(r.price) || 50,
          currency: r.currency || "EUR",
          priceMdl: Number(r.price_mdl) || Math.round((Number(r.price) || 50) * 19.5),
          volume: r.volume || "100ml / 3.4 FL.OZ.",
          concentration: r.concentration || "Eau De Parfum",
          gender: r.gender || "Unisex",
          rating: Number(r.rating) || 4.9,
          reviewsCount: Number(r.reviews_count) || 45,
          isBestSeller: Boolean(r.is_best_seller),
          isFeatured: Boolean(r.is_featured),
          inStock: r.in_stock !== false,
          image: r.image || "/assets/img/perfumes/hero-perfume.png",
          fullCardImage: r.full_card_image || r.image,
          topNotes: Array.isArray(r.top_notes) ? r.top_notes : (r.top_notes ? r.top_notes.split(",") : []),
          heartNotes: Array.isArray(r.heart_notes) ? r.heart_notes : (r.heart_notes ? r.heart_notes.split(",") : []),
          baseNotes: Array.isArray(r.base_notes) ? r.base_notes : (r.base_notes ? r.base_notes.split(",") : []),
          description: r.description || "Al-Warda luxury oriental fragrance crafted from the rarest Arabian essences.",
        }));
        memoryPerfumesCache = mapped;
        return mapped;
      }
    }
  } catch {
    // If Supabase table is not yet created or connection error, return empty array
  }
  memoryPerfumesCache = [];
  return [];
}

let memoryDropshipCache = null;

export async function fetchDropshipArabianPerfumes(query = "") {
  try {
    let res = await fetch(`/api/qogita/arabian-perfumes${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    if (!res.ok) {
      res = await fetch("/data/cachedArabianPerfumes.json");
    }
    if (res.ok) {
      const data = await res.json();
      const rawList = Array.isArray(data) ? data : (data.results || []);
      const items = rawList.filter(
        (p) =>
          p.image &&
          !p.image.includes("c1b79cffa1a5fa8aab226414b9e4a063") &&
          (!p.rawImage || !p.rawImage.includes("c1b79cffa1a5fa8aab226414b9e4a063"))
      );
      if (!query) {
        memoryDropshipCache = items;
      }
      return items;
    }
  } catch (err) {
    try {
      const fallbackRes = await fetch("/data/cachedArabianPerfumes.json");
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        const rawList = Array.isArray(fallbackData) ? fallbackData : (fallbackData.results || []);
        const items = rawList.filter(
          (p) => p.image && !p.image.includes("c1b79cffa1a5fa8aab226414b9e4a063")
        );
        if (!query) memoryDropshipCache = items;
        return items;
      }
    } catch {}
    console.warn("Could not fetch dropship perfumes:", err);
  }
  return memoryDropshipCache || [];
}

export async function getPerfumes(options = {}) {
  const { includeDropship = true } = options;

  // 1. In-memory hot cache
  if (memoryPerfumesCache && memoryDropshipCache) {
    return includeDropship ? [...memoryPerfumesCache, ...memoryDropshipCache] : memoryPerfumesCache;
  }

  // 2. SessionStorage instant restore for 0ms transitions
  if (typeof window !== "undefined" && !memoryDropshipCache) {
    try {
      const stored = sessionStorage.getItem("alwarda_perfumes_cache");
      if (stored) {
        memoryDropshipCache = JSON.parse(stored);
      }
    } catch {
      // non-fatal
    }
  }

  // 3. Parallel fetch of Supabase & Dropship catalogs
  const [supabaseResult, dropshipResult] = await Promise.allSettled([
    memoryPerfumesCache ? Promise.resolve(memoryPerfumesCache) : fetchPerfumesFromSupabase(),
    memoryDropshipCache ? Promise.resolve(memoryDropshipCache) : fetchDropshipArabianPerfumes(),
  ]);

  const base = supabaseResult.status === "fulfilled" ? supabaseResult.value : (memoryPerfumesCache || []);
  const dropship = dropshipResult.status === "fulfilled" ? dropshipResult.value : (memoryDropshipCache || []);

  if (typeof window !== "undefined" && dropship.length > 0 && !sessionStorage.getItem("alwarda_perfumes_cache")) {
    try {
      sessionStorage.setItem("alwarda_perfumes_cache", JSON.stringify(dropship));
    } catch {
      // non-fatal storage quota
    }
  }

  return includeDropship ? [...base, ...dropship] : base;
}

export function getCachedPerfumes() {
  return [...(memoryPerfumesCache || []), ...(memoryDropshipCache || [])];
}

export async function getPerfumeById(id) {
  const clean = String(id).toLowerCase().trim();
  const all = await getPerfumes();
  let found = all.find(
    (p) =>
      p.id?.toLowerCase() === clean ||
      p.slug?.toLowerCase() === clean ||
      p.name?.toLowerCase().replace(/[^a-z0-9]/g, "") === clean.replace(/[^a-z0-9]/g, "")
  );

  if (found) return found;

  if (clean.startsWith("dropship-") || clean.includes("dropship")) {
    const dropshipItems = await fetchDropshipArabianPerfumes();
    found = dropshipItems.find(
      (p) => p.id?.toLowerCase() === clean || p.slug?.toLowerCase() === clean
    );
    if (found) return found;
  }

  return null;
}

export async function getBestSellerPerfumes() {
  const all = await getPerfumes();
  const best = all.filter((p) => p.isBestSeller);
  return best.length > 0 ? best.slice(0, 3) : all.slice(0, 3);
}

export function getCategories() {
  return PERFUME_CATEGORIES;
}
