import { PERFUMES, PERFUME_CATEGORIES, getPerfumeById as getLocalPerfumeById } from "../src/data/perfumesData.js";

const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";

const SUPABASE_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";

const TABLE_PERFUMES = `${SUPABASE_URL}/rest/v1/stocks`;

let memoryPerfumesCache = null;

export async function fetchPerfumesFromSupabase() {
  try {
    const res = await fetch(`${TABLE_PERFUMES}?select=*&order=id.asc`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        // Map database fields to standard schema
        const mapped = rows.map((r) => {
          const info = r.info || {};
          let catSlug = info.categorySlug || "spicy";
          const catLower = (info.category || "").toLowerCase();
          if (catLower.includes("гурманские")) catSlug = "gourmand";
          else if (catLower.includes("акватические") || catLower.includes("морск") || catLower.includes("свеж") || catLower.includes("fresh")) catSlug = "fresh";
          else if (catLower.includes("фужерные") || catLower.includes("fougere") || catLower.includes("fougère")) catSlug = "fougere";
          else if (catLower.includes("древесные") || catLower.includes("уд") || catLower.includes("благородные")) catSlug = "oud";
          else if (catLower.includes("цветочные")) catSlug = "floral";
          else if (catLower.includes("цитрусовые")) catSlug = "citrus-fresh";
          else if (catLower.includes("пряные") || catLower.includes("специи")) catSlug = "spicy";

          const topNotes = info.notes?.top || (Array.isArray(r.top_notes) ? r.top_notes : (r.top_notes ? r.top_notes.split(",") : []));
          const heartNotes = info.notes?.heart || (Array.isArray(r.heart_notes) ? r.heart_notes : (r.heart_notes ? r.heart_notes.split(",") : []));
          const baseNotes = info.notes?.base || (Array.isArray(r.base_notes) ? r.base_notes : (r.base_notes ? r.base_notes.split(",") : []));

          return {
            id: String(r.id),
            slug: `stock-${r.id}`,
            name: r.name || r.title,
            title: r.name || r.title,
            brand: r.brand || "Al-Warda",
            category: catSlug,
            categoryName: info.category || "Восточные",
            notesSummary: info.notesSummary || r.notes_summary || r.brand || "Шлейфовый восточный аромат",
            price: Number(r.price) || 29.99,
            currency: r.currency || "EUR",
            priceMdl: Math.round((Number(r.price) || 29.99) * 19.5),
            volume: info.volume || r.volume || "100ml / 3.4 FL.OZ.",
            concentration: info.concentration || r.concentration || "Eau De Parfum",
            gender: info.gender || r.gender || "Унисекс",
            longevity: info.longevity || "8–12 часов",
            sillage: info.sillage || "Выразительный, шлейфовый",
            rating: 4.9,
            reviewsCount: 35 + ((r.id * 7) % 50),
            isBestSeller: (r.id % 7 === 0),
            isFeatured: (r.id % 5 === 0),
            inStock: info.inStock !== false,
            deliveryTime: info.deliveryTime || "4–7 дней (прямая поставка)",
            image: r.image || "/assets/img/perfumes/hero-perfume.png",
            fullCardImage: r.image || "/assets/img/perfumes/hero-perfume.png",
            topNotes,
            heartNotes,
            baseNotes,
            description: r.description || "Al-Warda luxury oriental fragrance crafted from the rarest Arabian essences.",
            info,
          };
        });
        memoryPerfumesCache = mapped;
        return mapped;
      }
    }
  } catch (err) {
    console.warn("fetchPerfumesFromSupabase error:", err);
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
