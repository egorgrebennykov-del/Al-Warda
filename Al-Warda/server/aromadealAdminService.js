import { requirePrivilegedUser } from "./productImageQueueAdmin.js";
import { hasuraGraphql } from "./hasuraProxy.js";

const AROMADEAL_BASE = "https://aromadeal.de";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function handleAromadealAdminRequest(request, env, urlObj) {
  const pathname = urlObj?.pathname || new URL(request.url).pathname;
  const method = request.method.toUpperCase();

  if (!pathname.startsWith("/api/admin/aromadeal")) {
    return null;
  }

  const auth = await requirePrivilegedUser(request, env);
  if (auth.response) return auth.response;

  if (method === "GET" && pathname === "/api/admin/aromadeal/overview") {
    try {
      const res = await hasuraGraphql(
        env,
        `query AromadealOverview {
          stocks(order_by: { id: asc }) {
            id
            name
            brand
            price
            in_stock
            info
          }
        }`,
      );
      const rows = Array.isArray(res?.stocks) ? res.stocks : [];
      let totalStocks = 0;
      let matchedCount = 0;
      let availableOnSite = 0;
      let lastUpdatedAt = null;
      const items = [];

      for (const row of rows) {
        if (!row || !row.id || String(row.id) === "999999") continue;
        totalStocks += 1;
        const info = row.info && typeof row.info === "object" ? row.info : {};
        const isMatched = Boolean(info.aromadealMatched);
        if (isMatched) matchedCount += 1;

        const imgDone = info.imageGeneration?.status === "completed";
        if (row.in_stock && imgDone && !info.mergedIntoId) {
          availableOnSite += 1;
        }

        const updatedAt = info.aromadealUpdatedAt || null;
        if (updatedAt && (!lastUpdatedAt || updatedAt > lastUpdatedAt)) {
          lastUpdatedAt = updatedAt;
        }

        if (isMatched) {
          items.push({
            id: Number(row.id),
            name: row.name || "",
            brand: row.brand || "",
            priceEur: Number(info.aromadealPrice ?? row.price ?? 0),
            inStock: Boolean(row.in_stock),
            availableOnSupplier: info.aromadealAvailable !== false,
            imageReady: imgDone,
            handle: info.aromadealHandle || "",
            sku: info.aromadealSku || "",
            url: info.aromadealUrl || (info.aromadealHandle ? `${AROMADEAL_BASE}/products/${info.aromadealHandle}` : AROMADEAL_BASE),
            updatedAt,
          });
        }
      }

      return json({
        ok: true,
        supplier: "Aromadeal",
        supplierUrl: AROMADEAL_BASE,
        minOrderQty: 1,
        stats: {
          totalStocks,
          matchedCount,
          availableOnSite,
          lastUpdatedAt,
        },
        items,
      });
    } catch (error) {
      return json({ error: error.message || "Failed to load Aromadeal overview" }, 500);
    }
  }

  if (method === "GET" && pathname === "/api/admin/aromadeal/search") {
    const q = (urlObj?.searchParams?.get("q") || "").trim();
    if (!q) return json({ ok: true, products: [] });
    try {
      const searchUrl = `${AROMADEAL_BASE}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=20`;
      const resp = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Al-Warda Admin/1.0",
          Accept: "application/json",
        },
      });
      if (!resp.ok) {
        return json({ error: `Aromadeal search failed (${resp.status})` }, 502);
      }
      const data = await resp.json();
      const rawProducts = data?.resources?.results?.products || [];
      const products = rawProducts.map((p) => ({
        id: p.id,
        title: p.title || "",
        vendor: p.vendor || "",
        price: Number(p.price || 0),
        available: p.available !== false,
        handle: p.handle || "",
        url: p.url ? `${AROMADEAL_BASE}${p.url.startsWith("/") ? p.url : `/${p.url}`}` : `${AROMADEAL_BASE}/products/${p.handle || ""}`,
        image: p.image || p.featured_image?.url || "",
      }));
      return json({ ok: true, products });
    } catch (error) {
      return json({ error: error.message || "Failed to search Aromadeal" }, 500);
    }
  }

  return json({ error: "Not found" }, 404);
}
