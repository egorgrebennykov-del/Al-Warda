import { PERFUMES, PERFUME_CATEGORIES } from "../src/data/perfumesData.js";
import qogitaClient from "./qogitaClient.js";
import { mapQogitaProductToPerfume } from "./qogitaService.js";

const DEFAULT_SUPABASE_URL = "https://mfvenfrmlkxqgvdtedet.supabase.co";

function getConfig() {
  const env = globalThis.process?.env || {};
  return {
    supabaseUrl:
      env.SUPABASE_URL || env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    supabaseKey:
      env.SUPABASE_SECRET_KEY ||
      env.SUPABASE_SERVICE_ROLE_KEY ||
      env.VITE_SUPABASE_ANON_KEY ||
      "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB",
  };
}

function supabaseHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

export async function syncPerfumeCatalog() {
  const { supabaseUrl, supabaseKey } = getConfig();
  const headers = supabaseHeaders(supabaseKey);

  // Attempt to sync categories
  try {
    for (const cat of PERFUME_CATEGORIES) {
      await fetch(`${supabaseUrl}/rest/v1/categories`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          title: cat.title,
          image: cat.image,
          description: cat.description,
        }),
      });
    }
  } catch (err) {
    console.warn("Categories sync warning:", err.message);
  }

  // Attempt to sync perfumes
  let synced = 0;
  for (const p of PERFUMES) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/perfumes`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          slug: p.id,
          name: p.name,
          brand: p.brand,
          category: p.category,
          notes_summary: p.notesSummary,
          price: p.price,
          currency: p.currency,
          price_mdl: p.priceMdl,
          volume: p.volume,
          concentration: p.concentration,
          gender: p.gender,
          rating: p.rating,
          reviews_count: p.reviewsCount,
          is_best_seller: p.isBestSeller,
          is_featured: p.isFeatured,
          in_stock: p.inStock,
          image: p.image,
          full_card_image: p.fullCardImage,
          top_notes: p.topNotes,
          heart_notes: p.heartNotes,
          base_notes: p.baseNotes,
          description: p.description,
        }),
      });
      if (res.ok) synced++;
    } catch {
      // ignore
    }
  }
  return `Synchronized ${synced} perfumes with Supabase`;
}

export async function syncQogitaCatalog(searchParams = {}) {
  if (!qogitaClient.isConfigured()) {
    return "Qogita credentials not configured. Please configure QOGITA_EMAIL and QOGITA_PASSWORD in .env or Settings.";
  }

  try {
    const res = await qogitaClient.searchProducts({
      categoryName: searchParams.categoryName || "Fragrances",
      stockAvailability: "in_stock",
      page: 1,
      page_size: searchParams.pageSize || 20,
    });

    const items = res?.results || [];
    if (items.length === 0) {
      return "Qogita search returned 0 items.";
    }

    const { supabaseUrl, supabaseKey } = getConfig();
    const headers = supabaseHeaders(supabaseKey);
    let synced = 0;

    for (const item of items) {
      const p = mapQogitaProductToPerfume(item);
      try {
        const insertRes = await fetch(`${supabaseUrl}/rest/v1/perfumes`, {
          method: "POST",
          headers: { ...headers, Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({
            slug: p.id,
            name: p.name,
            brand: p.brand,
            category: p.category,
            notes_summary: p.notesSummary,
            price: p.price,
            currency: p.currency,
            price_mdl: p.priceMdl,
            volume: p.volume,
            concentration: p.concentration,
            gender: p.gender,
            rating: p.rating,
            reviews_count: p.reviewsCount,
            is_best_seller: p.isBestSeller,
            is_featured: p.isFeatured,
            in_stock: p.inStock,
            description: p.description,
          }),
        });
        if (insertRes.ok) synced++;
      } catch (err) {
        console.warn("Failed to insert Qogita perfume:", err.message);
      }
    }

    return `Synced ${synced} / ${items.length} wholesale fragrances from Qogita to database.`;
  } catch (err) {
    return `Qogita sync failed: ${err.message}`;
  }
}

export async function executeCatalogActionById(actionId) {
  if (actionId === "sync-perfumes" || actionId === "update-perfume-catalog") {
    return await syncPerfumeCatalog();
  }
  if (actionId === "sync-qogita" || actionId === "sync-qogita-catalog") {
    return await syncQogitaCatalog();
  }
  return `Action ${actionId} processed`;
}
