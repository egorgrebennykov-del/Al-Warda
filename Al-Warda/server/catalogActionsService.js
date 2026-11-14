import { PERFUMES, PERFUME_CATEGORIES } from "../src/data/perfumesData.js";
import qogitaClient from "./qogitaClient.js";
import { mapQogitaProductToPerfume } from "./qogitaService.js";
import { supabaseFetch } from "./hasuraProxy.js";

function serverEnv() {
  return globalThis.process?.env || {};
}

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
      await supabaseFetch(serverEnv(), `${supabaseUrl}/rest/v1/categories`, {
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
      const res = await supabaseFetch(
        serverEnv(),
        `${supabaseUrl}/rest/v1/perfumes`,
        {
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
        },
      );
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
        const insertRes = await supabaseFetch(
          serverEnv(),
          `${supabaseUrl}/rest/v1/perfumes`,
          {
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
          },
        );
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

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function runPythonProcess(args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    let output = "";
    const py = spawn("python", ["-X", "utf8", ...args], {
      cwd: projectRoot,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    py.stdout.on("data", (data) => {
      output += data.toString("utf8");
    });

    py.stderr.on("data", (data) => {
      output += data.toString("utf8");
    });

    const timer = setTimeout(() => {
      try {
        py.kill();
      } catch {}
      reject(
        new Error(output + "\n[Время ожидания превышено, процесс завершён]"),
      );
    }, timeoutMs);

    py.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(output || "Действие успешно завершено.");
      } else {
        reject(new Error(output || `Процесс завершился с кодом ${code}`));
      }
    });

    py.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function executeCatalogActionById(actionId, params = {}) {
  const pythonScript = path.resolve(
    projectRoot,
    "scripts",
    "qogita_weekly_sync_upscayl.py",
  );

  if (actionId === "qogita-smart-sync") {
    return await runPythonProcess([
      pythonScript,
      "--incremental",
      "--all",
      "--force",
    ]);
  }
  if (actionId === "brand-sync") {
    const brands = params.brands || "Lattafa,Armaf,Afnan";
    return await runPythonProcess([
      pythonScript,
      "--brands",
      brands,
      "--all",
      "--force",
    ]);
  }
  if (actionId === "full-database-refresh") {
    return await runPythonProcess([pythonScript, "--all", "--force"]);
  }
  if (actionId === "sync-perfumes" || actionId === "update-perfume-catalog") {
    return await syncPerfumeCatalog();
  }
  if (actionId === "sync-qogita" || actionId === "sync-qogita-catalog") {
    return await syncQogitaCatalog();
  }
  return `Действие ${actionId} выполнено.`;
}
