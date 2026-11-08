import { PERFUMES, PERFUME_CATEGORIES, getPerfumeById as getLocalPerfumeById } from "../src/data/perfumesData.js";
import { isClaudeGenerated } from "./perfumeProvenance.js";

const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";

const SUPABASE_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";

const TABLE_PERFUMES = `${SUPABASE_URL}/rest/v1/stocks`;
const PRODUCT_IMAGE_STORAGE_PREFIX =
  `${SUPABASE_URL}/storage/v1/object/public/product-images/`;

let memoryPerfumesCache = null;
const PRODUCT_IMAGE_VERSION = "qogita-gemini-image-v3";

function resolveCardImage(img, gtin, rawImage) {
  if (img && /^https:\/\//i.test(img)) return img;
  if (gtin) return `/assets/img/products/${gtin}.jpg?v=${PRODUCT_IMAGE_VERSION}`;
  if (img && img.startsWith("/assets/img/")) {
    return `${img.split("?")[0]}?v=${PRODUCT_IMAGE_VERSION}`;
  }
  if (rawImage && /^https?:\/\//i.test(rawImage)) {
    return `/api/transparent-image?url=${encodeURIComponent(rawImage)}&v=${PRODUCT_IMAGE_VERSION}`;
  }
  return img || "/assets/img/template/flacon_template.jpg";
}

function hasCompletedGeneratedImage(product) {
  const generation = product?.info?.imageGeneration;
  const image = generation?.imageUrl || product?.image;
  return (
    generation?.status === "completed" &&
    typeof image === "string" &&
    image.startsWith(PRODUCT_IMAGE_STORAGE_PREFIX)
  );
}

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


export function getHarmoniousNotes(perfume) {
  const name = ((perfume && (perfume.name || perfume.title)) || "").toLowerCase();
  const cat = ((perfume && perfume.category) || "").toLowerCase();

  // Keyword-specific tailored notes
  if (name.includes("vanilla") || name.includes("rose")) {
    return {
      ru: {
        top: ["Розовый перец", "Ваниль", "Сладкий персик"],
        heart: ["Дамасская роза", "Жасмин", "Лепестки фиалки"],
        base: ["Мадагаскарская ваниль", "Белый мускус", "Золотая амбра"],
      },
      en: {
        top: ["Pink Pepper", "Vanilla", "Sweet Peach"],
        heart: ["Damask Rose", "Jasmine", "Violet Petals"],
        base: ["Madagascar Vanilla", "White Musk", "Golden Amber"],
      },
    };
  }

  if (name.includes("oud") || cat === "oud" || cat.includes("древес")) {
    return {
      ru: {
        top: ["Шафран", "Мускатный орех", "Лаванда"],
        heart: ["Благородный уд", "Кожаный аккорд", "Пачули"],
        base: ["Серая амбра", "Дымный ладан", "Белый мускус"],
      },
      en: {
        top: ["Saffron", "Nutmeg", "Lavender"],
        heart: ["Precious Oud", "Leather Accord", "Patchouli"],
        base: ["Grey Amber", "Smoky Frankincense", "White Musk"],
      },
    };
  }

  if (cat === "gourmand" || cat.includes("гурман")) {
    return {
      ru: {
        top: ["Мадагаскарская ваниль", "Сладкий миндаль", "Бергамот"],
        heart: ["Карамель", "Дамасская роза", "Взбитые сливки"],
        base: ["Бурбонская ваниль", "Белый мускус", "Золотая амбра"],
      },
      en: {
        top: ["Madagascar Vanilla", "Sweet Almond", "Bergamot"],
        heart: ["Caramel", "Damask Rose", "Whipped Cream"],
        base: ["Bourbon Vanilla", "White Musk", "Golden Amber"],
      },
    };
  }

  if (cat === "floral" || cat.includes("цвет")) {
    return {
      ru: {
        top: ["Нероли", "Розовый перец", "Мандарин"],
        heart: ["Дамасская роза", "Жасмин самбак", "Иланг-иланг"],
        base: ["Белый мускус", "Сандал", "Светлая амбра"],
      },
      en: {
        top: ["Neroli", "Pink Pepper", "Mandarin"],
        heart: ["Damask Rose", "Jasmine Sambac", "Ylang-Ylang"],
        base: ["White Musk", "Sandalwood", "Light Amber"],
      },
    };
  }

  if (cat === "fresh" || cat === "aquatic" || cat.includes("морск") || cat.includes("акват")) {
    return {
      ru: {
        top: ["Морской бриз", "Бергамот", "Зеленое яблоко"],
        heart: ["Свежая мята", "Лаванда", "Шалфей"],
        base: ["Кедр", "Серая амбра", "Белый мускус"],
      },
      en: {
        top: ["Sea Breeze", "Bergamot", "Green Apple"],
        heart: ["Fresh Mint", "Lavender", "Clary Sage"],
        base: ["Cedarwood", "Grey Amber", "White Musk"],
      },
    };
  }

  if (cat === "fougere" || cat.includes("фужер")) {
    return {
      ru: {
        top: ["Французская лаванда", "Бергамот", "Мускатный шалфей"],
        heart: ["Герань", "Черный перец", "Дубовый мох"],
        base: ["Ветивер", "Кумарин", "Благородный кедр"],
      },
      en: {
        top: ["French Lavender", "Bergamot", "Clary Sage"],
        heart: ["Geranium", "Black Pepper", "Oakmoss"],
        base: ["Vetiver", "Coumarin", "Noble Cedar"],
      },
    };
  }

  if (cat === "citrus-fresh" || cat.includes("цитрус")) {
    return {
      ru: {
        top: ["Сицилийский бергамот", "Грейпфрут", "Лайм"],
        heart: ["Флердоранж", "Имбирь", "Кардамон"],
        base: ["Ветивер", "Белый кедр", "Амброксан"],
      },
      en: {
        top: ["Sicilian Bergamot", "Grapefruit", "Lime"],
        heart: ["Orange Blossom", "Ginger", "Cardamom"],
        base: ["Vetiver", "White Cedar", "Ambroxan"],
      },
    };
  }

  // Universal oriental spicy fallback
  return {
    ru: {
      top: ["Кардамон", "Розовый перец", "Корица"],
      heart: ["Гвоздика", "Цветок шафрана", "Табак"],
      base: ["Восточная амбра", "Бобы тонка", "Сандаловое дерево"],
    },
    en: {
      top: ["Cardamom", "Pink Pepper", "Cinnamon"],
      heart: ["Clove", "Saffron Blossom", "Tobacco"],
      base: ["Oriental Amber", "Tonka Bean", "Sandalwood"],
    },
  };
}

export function ensurePerfumeEnrichment(p) {
  if (!p) return p;
  const name = p.name || p.title || "";
  const brand = p.brand || "Al-Warda";
  const notesFallback = getHarmoniousNotes(p);

  const topRu = (Array.isArray(p.topNotesRu) && p.topNotesRu.length > 0)
    ? p.topNotesRu
    : (Array.isArray(p.topNotes) && p.topNotes.length > 0 ? p.topNotes : notesFallback.ru.top);

  const heartRu = (Array.isArray(p.heartNotesRu) && p.heartNotesRu.length > 0)
    ? p.heartNotesRu
    : (Array.isArray(p.heartNotes) && p.heartNotes.length > 0 ? p.heartNotes : notesFallback.ru.heart);

  const baseRu = (Array.isArray(p.baseNotesRu) && p.baseNotesRu.length > 0)
    ? p.baseNotesRu
    : (Array.isArray(p.baseNotes) && p.baseNotes.length > 0 ? p.baseNotes : notesFallback.ru.base);

  const topEn = (Array.isArray(p.topNotesEn) && p.topNotesEn.length > 0) ? p.topNotesEn : notesFallback.en.top;
  const heartEn = (Array.isArray(p.heartNotesEn) && p.heartNotesEn.length > 0) ? p.heartNotesEn : notesFallback.en.heart;
  const baseEn = (Array.isArray(p.baseNotesEn) && p.baseNotesEn.length > 0) ? p.baseNotesEn : notesFallback.en.base;

  let descRu = p.descriptionRu || p.description;
  if (!descRu || descRu.includes("Сертифицированная оригинальная") || descRu.length < 30) {
    descRu = `${name} от дома ${brand} — роскошный восточный аромат (${p.categoryRu || "восточные"}). Композиция открывается аккордами: ${topRu.join(", ")}, переходит в сердце из ${heartRu.join(", ")} и завершается чувственным шлейфом: ${baseRu.join(", ")}.`;
  }

  let descEn = p.descriptionEn;
  if (!descEn || descEn.includes("Сертифицированная оригинальная") || descEn.length < 30) {
    descEn = `${name} by ${brand} is an authentic luxury Arabian creation (${p.categoryEn || "oriental"}). Opens with vibrant notes of ${topEn.join(", ")}, unfolds into a rich heart of ${heartEn.join(", ")}, resting upon an opulent sillage of ${baseEn.join(", ")}.`;
  }

  const rawImage = p.rawImage || p.info?.rawImage || null;
  const gtin = p.gtin || p.info?.gtin;
  const resolvedImg = hasCompletedGeneratedImage(p)
    ? p.info.imageGeneration.imageUrl || p.image
    : resolveCardImage(p.image, gtin, rawImage);

  return {
    ...p,
    image: resolvedImg,
    fullCardImage: resolvedImg,
    rawImage: rawImage || p.rawImage || null,
    topNotes: topRu,
    heartNotes: heartRu,
    baseNotes: baseRu,
    topNotesRu: topRu,
    heartNotesRu: heartRu,
    baseNotesRu: baseRu,
    topNotesEn: topEn,
    heartNotesEn: heartEn,
    baseNotesEn: baseEn,
    description: descRu,
    descriptionRu: descRu,
    descriptionEn: descEn,
  };
}

export async function fetchPerfumesFromSupabase() {
  try {
    let allRows = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const res = await fetch(`${TABLE_PERFUMES}?select=*&order=id.asc`, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Range: `${from}-${to}`,
        },
      });

      if (!res.ok) break;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) break;
      allRows.push(...rows);
      if (rows.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }

    if (allRows.length > 0) {
      // Filter out items with no actual product visual (dummy Qogita "No image available" placeholders)
      const validRows = allRows.filter((r) => {
        const img = ((r.image || "") + (r.raw_image || "") + (r.info?.rawImage || "")).toLowerCase();
        if (!isClaudeGenerated(r)) return false;
        if (
          img.includes("46e86f1d826c199f04588f35f1fd8afe") ||
          img.includes("c1b79cffa1a5fa8aab226414b9e4a063") ||
          img.includes("no-image") ||
          img.includes("no_image")
        ) {
          return false;
        }
        return hasCompletedGeneratedImage(r);
      });

      // Map database fields to standard schema
      const mapped = validRows.map((r) => {
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
          const generatedImage = info.imageGeneration.imageUrl || r.image;

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
            image: generatedImage,
            fullCardImage: generatedImage,
            rawImage: info.rawImage || r.raw_image || r.info?.rawImage || null,
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
            gtin: info.gtin || r.gtin,
            dropshipId: info.gtin ? `dropship-${info.gtin}` : null,
          };
          perfumeObj.url = getPerfumeUrl(perfumeObj);
          return perfumeObj;
        });
        memoryPerfumesCache = mapped;
        return mapped;
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
      const items = rawList
        .filter(
          (p) =>
            isClaudeGenerated(p) &&
            hasCompletedGeneratedImage(p) &&
            p.image &&
            !p.image.includes("c1b79cffa1a5fa8aab226414b9e4a063") &&
            (!p.rawImage || !p.rawImage.includes("c1b79cffa1a5fa8aab226414b9e4a063"))
        )
        .map(ensurePerfumeEnrichment);

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
        const items = rawList
          .filter((p) => isClaudeGenerated(p) && hasCompletedGeneratedImage(p) && p.image && !p.image.includes("c1b79cffa1a5fa8aab226414b9e4a063"))
          .map(ensurePerfumeEnrichment);
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
    if (!includeDropship) return memoryPerfumesCache;
    const existingGtins = new Set(memoryPerfumesCache.map((b) => b.gtin || b.info?.gtin).filter(Boolean));
    const existingNames = new Set(memoryPerfumesCache.map((b) => (b.name || "").toLowerCase().trim()).filter(Boolean));
    const uniqueDropship = memoryDropshipCache.filter(
      (d) => !(d.gtin && existingGtins.has(d.gtin)) && !existingNames.has((d.name || "").toLowerCase().trim())
    );
    return [...memoryPerfumesCache, ...uniqueDropship];
  }

  // 2. Parallel fetch of Supabase & Dropship catalogs
  const [supabaseResult, dropshipResult] = await Promise.allSettled([
    memoryPerfumesCache ? Promise.resolve(memoryPerfumesCache) : fetchPerfumesFromSupabase(),
    memoryDropshipCache ? Promise.resolve(memoryDropshipCache) : fetchDropshipArabianPerfumes(),
  ]);

  const base = supabaseResult.status === "fulfilled" ? supabaseResult.value : (memoryPerfumesCache || []);
  const dropship = dropshipResult.status === "fulfilled" ? dropshipResult.value : (memoryDropshipCache || []);

  if (base.length > 0) {
    const existingGtins = new Set(base.map((b) => b.gtin || b.info?.gtin).filter(Boolean));
    const existingNames = new Set(base.map((b) => (b.name || "").toLowerCase().trim()).filter(Boolean));
    const uniqueDropship = dropship.filter(
      (d) => !(d.gtin && existingGtins.has(d.gtin)) && !existingNames.has((d.name || "").toLowerCase().trim())
    );
    return includeDropship ? [...base, ...uniqueDropship] : base;
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

  // 1. Direct ID, slug, dropshipId, or GTIN match
  let found = all.find(
    (p) =>
      p.id?.toLowerCase() === clean ||
      p.slug?.toLowerCase() === clean ||
      p.dropshipId?.toLowerCase() === clean ||
      (p.gtin && `dropship-${p.gtin}`.toLowerCase() === clean) ||
      (p.gtin && String(p.gtin).toLowerCase() === clean)
  );
  if (found) return ensurePerfumeEnrichment(found);

  // 2. Extract trailing dropship GTIN (e.g. "dropship-6285952002379" -> "6285952002379")
  const trailingDropship = clean.match(/dropship-(\d+)$/i);
  if (trailingDropship) {
    found = all.find(
      (p) =>
        p.id?.toLowerCase() === `dropship-${trailingDropship[1]}` ||
        p.dropshipId?.toLowerCase() === `dropship-${trailingDropship[1]}` ||
        String(p.gtin) === trailingDropship[1] ||
        String(p.id) === trailingDropship[1]
    );
    if (found) return ensurePerfumeEnrichment(found);
  }

  // 3. Extract trailing stock ID (e.g. "lattafa-yara-4217" -> "4217")
  const trailingNum = clean.match(/-(\d+)$/);
  if (trailingNum) {
    found = all.find(
      (p) =>
        p.id === trailingNum[1] ||
        String(p.gtin) === trailingNum[1] ||
        p.dropshipId?.toLowerCase() === `dropship-${trailingNum[1]}`
    );
    if (found) return ensurePerfumeEnrichment(found);
  }

  // 4. Match by name or slug match
  const cleanLetters = clean.replace(/[^a-z0-9]/g, "");
  found = all.find((p) => {
    const pSlug = slugifyPerfumeName(p.name || p.title);
    if (clean === pSlug || clean.startsWith(pSlug) || pSlug.startsWith(clean)) return true;
    const pLetters = (p.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return pLetters && (cleanLetters === pLetters || cleanLetters.includes(pLetters) || pLetters.includes(cleanLetters));
  });
  if (found) return ensurePerfumeEnrichment(found);

  // 5. Direct fallback search in dropship catalog
  if (clean.startsWith("dropship-") || clean.includes("dropship")) {
    const dropshipItems = await fetchDropshipArabianPerfumes();
    found = dropshipItems.find(
      (p) =>
        p.id?.toLowerCase() === clean ||
        p.slug?.toLowerCase() === clean ||
        (p.gtin && `dropship-${p.gtin}`.toLowerCase() === clean) ||
        (p.gtin && clean.includes(String(p.gtin)))
    );
    if (found) return ensurePerfumeEnrichment(found);
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
