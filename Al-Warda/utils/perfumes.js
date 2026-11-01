import { PERFUMES, PERFUME_CATEGORIES, getPerfumeById as getLocalPerfumeById } from "../src/data/perfumesData.js";

const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";

const SUPABASE_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";

const TABLE_PERFUMES = `${SUPABASE_URL}/rest/v1/stocks`;

let memoryPerfumesCache = null;

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

          const notesObj = info.notes || {};
          const topNotesRu = notesObj.ru?.top || notesObj.top || (Array.isArray(r.top_notes) ? r.top_notes : (r.top_notes ? r.top_notes.split(",") : []));
          const heartNotesRu = notesObj.ru?.heart || notesObj.heart || (Array.isArray(r.heart_notes) ? r.heart_notes : (r.heart_notes ? r.heart_notes.split(",") : []));
          const baseNotesRu = notesObj.ru?.base || notesObj.base || (Array.isArray(r.base_notes) ? r.base_notes : (r.base_notes ? r.base_notes.split(",") : []));

          const topNotesEn = notesObj.en?.top || topNotesRu;
          const heartNotesEn = notesObj.en?.heart || heartNotesRu;
          const baseNotesEn = notesObj.en?.base || baseNotesRu;

          const descRu = info.descriptionRu || r.description || "Роскошный восточный аромат Al-Warda.";
          const descEn = info.descriptionEn || "An exquisite authentic luxury Arabian fragrance by Al-Warda.";

          const perfumeObj = {
            id: String(r.id),
            slug: `stock-${r.id}`,
            name: r.name || r.title,
            title: r.name || r.title,
            brand: r.brand || "Al-Warda",
            category: catSlug,
            categoryRu: info.category || "Восточные",
            categoryEn: info.categoryEn || "Oriental",
            categoryName: info.category || "Восточные",
            notesSummary: info.notesSummary || r.notes_summary || r.brand || "Шлейфовый восточный аромат",
            notesSummaryRu: info.notesSummary || r.notes_summary || r.brand || "Шлейфовый восточный аромат",
            notesSummaryEn: info.notesSummaryEn || info.notesSummary || r.brand || "Distinctive Oriental Sillage",
            price: Number(r.price) || 29.99,
            currency: r.currency || "EUR",
            priceMdl: Math.round((Number(r.price) || 29.99) * 19.5),
            volume: info.volume || r.volume || "100ml / 3.4 FL.OZ.",
            concentration: info.concentration || r.concentration || "Eau De Parfum",
            gender: info.gender || r.gender || "Унисекс",
            genderRu: info.gender || r.gender || "Унисекс",
            genderEn: info.genderEn || (info.gender === "Женский" ? "Women" : (info.gender === "Мужской" ? "Men" : "Unisex")),
            longevity: info.longevity || "8–12 часов",
            longevityRu: info.longevity || "8–12 часов",
            longevityEn: info.longevityEn || "8–12 hours",
            sillage: info.sillage || "Выразительный, шлейфовый",
            sillageRu: info.sillage || "Выразительный, шлейфовый",
            sillageEn: info.sillageEn || "Noticeable, alluring sillage",
            rating: 4.9,
            reviewsCount: 35 + ((r.id * 7) % 50),
            isBestSeller: (r.id % 7 === 0),
            isFeatured: (r.id % 5 === 0),
            inStock: info.inStock !== false,
            deliveryTime: info.deliveryTime || "4–7 дней (прямая поставка)",
            deliveryTimeEn: info.deliveryTimeEn || "4–7 days (direct dispatch)",
            image: r.image || "/assets/img/perfumes/hero-perfume.png",
            fullCardImage: r.image || "/assets/img/perfumes/hero-perfume.png",
            topNotes: topNotesRu,
            heartNotes: heartNotesRu,
            baseNotes: baseNotesRu,
            topNotesRu,
            heartNotesRu,
            baseNotesRu,
            topNotesEn,
            heartNotesEn,
            baseNotesEn,
            description: descRu,
            descriptionRu: descRu,
            descriptionEn: descEn,
            info,
          };
          perfumeObj.url = getPerfumeUrl(perfumeObj);
          return perfumeObj;
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
  if (!id) return null;
  const clean = String(id).toLowerCase().trim();
  const all = await getPerfumes();

  // 1. Exact ID or slug match
  let found = all.find(
    (p) =>
      p.id?.toLowerCase() === clean ||
      p.slug?.toLowerCase() === clean
  );
  if (found) return found;

  // 2. Extract trailing ID from slug (e.g. "lattafa-yara-100ml-edp-3840" -> "3840" or "dropship-6291108730515")
  const trailingDropship = clean.match(/(dropship-\d+)$/i);
  if (trailingDropship) {
    found = all.find((p) => p.id?.toLowerCase() === trailingDropship[1]);
    if (found) return found;
  }
  const trailingNum = clean.match(/-(\d+)$/);
  if (trailingNum) {
    found = all.find((p) => p.id === trailingNum[1]);
    if (found) return found;
  }

  // 3. Match by name or slug match
  const cleanLetters = clean.replace(/[^a-z0-9]/g, "");
  found = all.find((p) => {
    const pSlug = slugifyPerfumeName(p.name || p.title);
    if (clean === pSlug || clean.startsWith(pSlug)) return true;
    const pLetters = (p.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return pLetters === cleanLetters || cleanLetters.includes(pLetters) || pLetters.includes(cleanLetters);
  });
  if (found) return found;

  // 4. Fallback search in dropship
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
