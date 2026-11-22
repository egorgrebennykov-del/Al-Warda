import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasuraGraphQL } from "../server/hasuraProxy.js";
import qogitaClient from "../server/qogitaClient.js";
import { autoCalculateAllProductPrices } from "../server/pricingService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "../.env");

function loadDotEnvIfNeeded() {
  if (!fs.existsSync(ENV_PATH)) return;
  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env) || !process.env[key]) {
      process.env[key] = val;
    }
  }
}

function normalizeName(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|мл|oz|fl\.?\s*oz)\b/gi, " ")
    .replace(/\b(?:eau de parfum|eau de toilette|extrait de parfum|parfum|edp|edt|spray|for women|for men|unisex|perfume|cologne|tester)\b/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokenize(str) {
  return normalizeName(str).split(/\s+/).filter((t) => t.length >= 2);
}

function extractVolumeMl(str) {
  const m = String(str || "").match(/\b(\d+(?:[.,]\d+)?)\s*(ml|мл)\b/i);
  if (!m) return null;
  const val = Number(m[1].replace(",", "."));
  return Number.isFinite(val) && val > 0 ? val : null;
}

const EXCLUDED_VARIANT_RE =
  /\b(?:miniature|sample|travel|discovery|body\s*spray|deodorant|deo|mist|hair\s*mist|air\s*freshener|roll\s*on|bor\s*m|after\s*shave|lotion|shower\s*gel)\b/i;

function isCompatibleCandidate(stock, qItem) {
  const sName = String(stock.name || "");
  const qName = String(qItem.name || "");

  // Do not match a regular perfume to a deodorant/mist/miniature/sample/travel/bor m
  if (EXCLUDED_VARIANT_RE.test(qName) && !EXCLUDED_VARIANT_RE.test(sName)) {
    return false;
  }

  const sVol = extractVolumeMl(stock.name) ?? extractVolumeMl(stock.info?.volume);
  const qVol = extractVolumeMl(qName);

  if (sVol !== null && qVol !== null) {
    const ratio = Math.max(sVol, qVol) / Math.min(sVol, qVol);
    if (ratio > 1.25) return false;
  } else if (sVol === null && qVol !== null) {
    // Stock has no explicit volume: never match a <45ml travel/miniature unless stock itself is cheap (<10 EUR)
    if (qVol < 45 && Number(stock.price || 0) >= 8) return false;
  }

  const sPrice = Number(stock.price || 0);
  const qPrice = Number(qItem.searchPrice || 0);
  if (sPrice > 0 && qPrice > 0) {
    if (qPrice < sPrice * 0.4 || qPrice > sPrice * 2.5) return false;
  }

  return true;
}

function findBestBrandMatch(stock, candidates) {
  const sTokens = tokenize(stock.name);
  if (sTokens.length === 0 || !candidates?.length) return null;
  const sSet = new Set(sTokens);
  const sPrice = Number(stock.price || 0);
  let best = null;
  let bestRank = -1;

  for (const qItem of candidates) {
    if (!isCompatibleCandidate(stock, qItem)) continue;
    const qTokens = qItem.tokens;
    if (!qTokens?.length) continue;
    let overlap = 0;
    for (const t of sSet) {
      if (qTokens.includes(t)) overlap += 1;
    }
    const union = new Set([...sSet, ...qTokens]).size;
    const score = union > 0 ? overlap / union : 0;
    if (score < 0.7) continue;

    // Prefer higher token overlap, and break ties by price proximity
    const pricePenalty =
      sPrice > 0 && qItem.searchPrice > 0
        ? Math.abs(qItem.searchPrice - sPrice) / Math.max(sPrice, qItem.searchPrice)
        : 0;
    const rank = score - pricePenalty * 0.15;
    if (rank > bestRank) {
      bestRank = rank;
      best = qItem;
    }
  }
  return best;
}

function extractVolumeFromTitle(title) {
  const m = String(title || "").match(/\b(\d+(?:[.,]\d+)?\s*(?:ml|oz|fl\.?\s*oz))\b/i);
  return m ? m[1].replace(/\s+/g, "").toLowerCase() : "";
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function extractVariantFid(productUrl) {
  const m = String(productUrl || "").match(/\/products\/([^/]+)\//);
  return m ? m[1] : null;
}

export function extractMov500PriceFromOffers(offersData, targetMov = 500) {
  const offers = Array.isArray(offersData?.offers)
    ? offersData.offers
    : Array.isArray(offersData?.results)
      ? offersData.results
      : [];

  let bestMovPrice = Infinity;
  let bestAnyPrice = Infinity;

  for (const offer of offers) {
    const tiers = Array.isArray(offer?.tieredPrices)
      ? offer.tieredPrices
      : Array.isArray(offer?.tiered_prices)
        ? offer.tiered_prices
        : [];

    for (const tier of tiers) {
      const amount = Number(tier?.tierPrice?.amount ?? tier?.price ?? tier?.amount);
      const mov = Number(tier?.tierMov?.amount ?? tier?.mov ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      if (amount < bestAnyPrice) bestAnyPrice = amount;
      if (Number.isFinite(mov) && mov <= targetMov && amount < bestMovPrice) {
        bestMovPrice = amount;
      }
    }

    const directAmount = Number(offer?.price?.amount ?? offer?.unitPrice?.amount);
    if (Number.isFinite(directAmount) && directAmount > 0 && directAmount < bestAnyPrice) {
      bestAnyPrice = directAmount;
    }
  }

  if (Number.isFinite(bestMovPrice)) return round2(bestMovPrice);
  if (Number.isFinite(bestAnyPrice)) return round2(bestAnyPrice);
  return null;
}

async function fetchAllInStockProducts(env, { visibleOnly = false } = {}) {
  const where = visibleOnly
    ? {
        _and: [
          { in_stock: { _eq: true } },
          { slug: { _neq: "site-settings" } },
          { info: { _contains: { imageGeneration: { status: "completed" } } } },
        ],
      }
    : {
        _and: [
          { in_stock: { _eq: true } },
          { slug: { _neq: "site-settings" } },
        ],
      };

  const rows = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await hasuraGraphQL(
      env,
      `query LoadStocksForPriceSync($where: stocks_bool_exp!, $limit: Int!, $offset: Int!) {
        stocks(where: $where, order_by: { id: asc }, limit: $limit, offset: $offset) {
          id
          name
          brand
          price
          info
        }
      }`,
      { where, limit, offset },
    );
    const batch = res?.stocks || [];
    rows.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return rows;
}

async function fetchQogitaBrandCatalog(brands) {
  const byGtin = new Map();
  const byName = new Map();
  const byBrand = new Map();

  for (const brand of brands) {
    if (!brand) continue;
    const brandKey = brand.toLowerCase();
    if (!byBrand.has(brandKey)) byBrand.set(brandKey, []);
    let page = 1;
    while (true) {
      let data;
      try {
        data = await qogitaClient.searchProducts({
          brandName: brand,
          stockAvailability: "in_stock",
          page,
          page_size: 100,
        });
      } catch (err) {
        console.warn(`Brand search failed for "${brand}" page ${page}:`, err.message);
        break;
      }
      const results = Array.isArray(data?.results) ? data.results : [];
      for (const item of results) {
        const gtin = String(item?.gtin || "").trim();
        const nameKey = normalizeName(item?.name);
        const entry = {
          gtin,
          name: item?.name || "",
          brand: item?.brand || brand,
          tokens: tokenize(item?.name),
          variantFid: extractVariantFid(item?.productUrl),
          searchPrice: Number(item?.price?.amount || 0),
        };
        if (gtin) byGtin.set(gtin, entry);
        if (nameKey) {
          if (!byName.has(nameKey)) byName.set(nameKey, []);
          byName.get(nameKey).push(entry);
        }
        byBrand.get(brandKey).push(entry);
      }
      if (!data?.next || results.length < 100 || page >= 30) break;
      page += 1;
    }
  }

  return { byGtin, byName, byBrand };
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current], current);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function fetchMov500PriceWithRetry(variantFid, fallbackPrice) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const offers = await qogitaClient.getVariantOffers(variantFid, {
        page_size: 20,
      });
      const mov500 = extractMov500PriceFromOffers(offers, 500);
      return mov500 ?? (fallbackPrice > 0 ? round2(fallbackPrice) : null);
    } catch (err) {
      if (attempt < 2 && /429|timeout|502|503/i.test(err.message || "")) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      return fallbackPrice > 0 ? round2(fallbackPrice) : null;
    }
  }
  return fallbackPrice > 0 ? round2(fallbackPrice) : null;
}

export async function runQogitaPriceSync({ visibleOnly = false } = {}) {
  loadDotEnvIfNeeded();
  const env = process.env;

  if (env.QOGITA_EMAIL && env.QOGITA_PASSWORD) {
    qogitaClient.setCredentials(env.QOGITA_EMAIL, env.QOGITA_PASSWORD, env.QOGITA_API_URL);
  }

  if (!qogitaClient.isConfigured()) {
    throw new Error("Qogita credentials are not configured in environment (QOGITA_EMAIL / QOGITA_PASSWORD)");
  }

  await qogitaClient.login(true);
  const stocks = await fetchAllInStockProducts(env, { visibleOnly });
  console.log(`[sync_qogita_prices] Loaded ${stocks.length} in-stock products (visibleOnly=${visibleOnly})`);

  // Prioritize visible completed products first
  stocks.sort((a, b) => {
    const aDone = a?.info?.imageGeneration?.status === "completed" ? 0 : 1;
    const bDone = b?.info?.imageGeneration?.status === "completed" ? 0 : 1;
    return aDone - bDone || Number(a.id) - Number(b.id);
  });

  const brands = Array.from(
    new Set(stocks.map((s) => String(s.brand || "").trim()).filter(Boolean)),
  );
  console.log(`[sync_qogita_prices] Querying Qogita catalog for ${brands.length} brands...`);
  const { byGtin, byName, byBrand } = await fetchQogitaBrandCatalog(brands);
  console.log(`[sync_qogita_prices] Indexed ${byGtin.size} GTINs from Qogita`);

  const matched = [];
  for (const stock of stocks) {
    const info = stock?.info && typeof stock.info === "object" ? stock.info : {};
    const gtin = String(info.gtin || "").trim();
    const brandKey = String(stock.brand || "").trim().toLowerCase();
    const nameCandidates = byName.get(normalizeName(stock.name)) || [];
    let qItem =
      (gtin && byGtin.get(gtin)) ||
      findBestBrandMatch(stock, nameCandidates) ||
      findBestBrandMatch(stock, byBrand.get(brandKey)) ||
      null;

    if (!qItem && gtin) {
      try {
        const res = await qogitaClient.searchProducts({ gtin });
        const first = res?.results?.[0];
        if (first) {
          qItem = {
            gtin: String(first.gtin || gtin),
            variantFid: extractVariantFid(first.productUrl),
            searchPrice: Number(first?.price?.amount || 0),
          };
        }
      } catch {
        // ignore single lookup miss
      }
    }

    if (qItem?.variantFid) {
      matched.push({ stock, qItem });
    }
  }

  console.log(`[sync_qogita_prices] Fetching live MOV<=500 prices for ${matched.length} matched products...`);
  let updatedCount = 0;
  const updates = [];

  await mapWithConcurrency(matched, 8, async ({ stock, qItem }) => {
    const livePrice = await fetchMov500PriceWithRetry(qItem.variantFid, qItem.searchPrice);
    if (!livePrice || livePrice <= 0) return;

    const oldPrice = round2(Number(stock.price || 0));
    const oldMov = round2(Number(stock.info?.movPrice || 0));
    const info = stock?.info && typeof stock.info === "object" ? { ...stock.info } : {};
    const gtinChanged = qItem.gtin && info.gtin !== qItem.gtin;
    const detectedVol = !info.volume ? extractVolumeFromTitle(qItem.name) : "";
    const volumeAdded = Boolean(detectedVol);

    if (
      Math.abs(oldPrice - livePrice) >= 0.01 ||
      Math.abs(oldMov - livePrice) >= 0.01 ||
      gtinChanged ||
      volumeAdded
    ) {
      info.price = livePrice;
      info.movPrice = livePrice;
      if (qItem.gtin) info.gtin = qItem.gtin;
      if (detectedVol) info.volume = detectedVol;
      updates.push({
        id: Number(stock.id),
        price: livePrice,
        info,
        oldPrice,
        name: stock.name,
      });
    }
  });

  console.log(`[sync_qogita_prices] Updating ${updates.length} changed prices in stocks...`);
  const CHUNK = 50;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const batch = updates.slice(i, i + CHUNK);
    await mapWithConcurrency(batch, 10, async (u) => {
      await hasuraGraphQL(
        env,
        `mutation UpdateStockPrice($id: bigint!, $price: numeric!, $info: jsonb!) {
          update_stocks_by_pk(pk_columns: { id: $id }, _set: { price: $price, info: $info }) {
            id
          }
        }`,
        { id: u.id, price: u.price, info: u.info },
      );
      updatedCount += 1;
    });
  }

  console.log(`[sync_qogita_prices] Updated ${updatedCount} stocks. Recalculating retail pricing...`);
  const calcRes = await autoCalculateAllProductPrices(env, {
    updatedBy: "qogita-price-sync",
    publish: true,
  });

  console.log(`[sync_qogita_prices] Done! Stocks updated: ${updatedCount}, Pricing recalculated: ${calcRes.updated}`);
  return { matched: matched.length, updatedCount, pricingUpdated: calcRes.updated };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const visibleOnly = process.argv.includes("--visible-only");
  runQogitaPriceSync({ visibleOnly })
    .then((res) => {
      console.log(JSON.stringify(res));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[sync_qogita_prices] Fatal error:", err);
      process.exit(1);
    });
}
