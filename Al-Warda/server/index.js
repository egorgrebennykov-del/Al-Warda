import zlib from "node:zlib";
import axios from "axios";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import https from "node:https";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import sharp from "sharp";
import { PERFUMES, PERFUME_CATEGORIES, getPerfumeById, getPerfumesByCategory, getBestSellers } from "../src/data/perfumesData.js";
import {
  processWardaChat,
  filterInquiryMessageWithAI,
  translateWardaDialog,
  translateAnnouncementText,
  enrichPerfumeWithAI,
} from "./wardaAssistantService.js";
import { sendGuestInquiryEmail } from "./emailService.js";
import { syncPerfumeCatalog, executeCatalogActionById } from "./catalogActionsService.js";
import { setHttpAdapter } from "./httpClient.js";
import qogitaClient, { QogitaClient } from "./qogitaClient.js";
import { handleInboundWebhook, getWebhookLogs, mapQogitaProductToPerfume, getArabianDropshipPerfumes, getTransparentImageBuffer } from "./qogitaService.js";
import { getOrGenerateFlaconByGtin } from "./productGeneratorService.js";
import {
  getProductImageQueueStatus,
  deleteFailedProductItems,
  requeueFailedProductItems,
  saveManualProductItem,
  getAllAdminProducts,
  deleteAdminProducts,
  getSiteSettings,
  saveSiteSettings,
} from "./productImageQueueAdmin.js";
import { handleProductImageActions } from "./productImageActions.js";
import { createQogitaSessionCookie, handleQogitaWorker } from "./qogitaWorker.js";
import { localRequestUrl, localWebRequest } from "./localRequest.js";
import { isSameOrigin } from "./sameOrigin.js";

const defaultHttpsAgent = new https.Agent({ rejectUnauthorized: false });
setHttpAdapter({
  get: (url, config = {}) =>
    axios.get(url, { httpsAgent: defaultHttpsAgent, ...config }),
  post: (url, payload, config = {}) =>
    axios.post(url, payload, { httpsAgent: defaultHttpsAgent, ...config }),
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.resolve(appDir, ".env") });

const ACTIONS = {
  "sync-perfumes": {
    id: "sync-perfumes",
    name: "Sync Perfume Catalog with Supabase",
    action: "sync-perfumes",
  },
  "sync-qogita": {
    id: "sync-qogita",
    name: "Sync Qogita Wholesale Fragrances",
    action: "sync-qogita",
  },
};

const actionStatuses = {
  "qogita-smart-sync": { status: "idle", lastRun: null, error: null, output: "" },
  "brand-sync": { status: "idle", lastRun: null, error: null, output: "" },
  "full-database-refresh": { status: "idle", lastRun: null, error: null, output: "" },
};

const PORT = Number(process.env.BOOK_COMPARE_PORT) || 3001;
const MAX_BODY_SIZE = 5 * 1024 * 1024;

function respond(res, status, payload, req) {
  const jsonStr = typeof payload === "string" ? payload : JSON.stringify(payload);
  const acceptEncoding = (req?.headers?.["accept-encoding"] || res._req?.headers?.["accept-encoding"] || "").toLowerCase();
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PATCH, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, X-Qogita-Signature",
  };

  if (acceptEncoding.includes("gzip") && jsonStr.length > 1024) {
    const compressed = zlib.gzipSync(Buffer.from(jsonStr, "utf8"));
    headers["Content-Encoding"] = "gzip";
    headers["Content-Length"] = compressed.length;
    res.writeHead(status, headers);
    res.end(compressed);
  } else {
    headers["Content-Length"] = Buffer.byteLength(jsonStr, "utf8");
    res.writeHead(status, headers);
    res.end(jsonStr);
  }
}

async function readRawBody(req) {
  const chunks = [];
  let totalLength = 0;
  for await (const chunk of req) {
    totalLength += chunk.length;
    if (totalLength > MAX_BODY_SIZE) {
      throw new Error("Request body is too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = await readRawBody(req);
  if (!raw || raw.length === 0) return {};
  return JSON.parse(raw.toString("utf8"));
}

const server = createServer(async (req, res) => {
  res._req = req;
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PATCH, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    });
    res.end();
    return;
  }

  const reqUrl = req.url || "/";
  const urlObj = new URL(reqUrl, "http://localhost");
  const pathname = urlObj.pathname;

  // Static assets serving (dist / public assets)
  if (req.method === "GET" && (pathname.startsWith("/assets/") || pathname.startsWith("/favicon"))) {
    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
    let filePath = path.join(appDir, "dist", safePath);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(appDir, "public", safePath);
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json",
      };
      const contentType = mimeTypes[ext] || "application/octet-stream";
      const isAsset = ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp" || ext === ".svg" || ext === ".js" || ext === ".css";
      const cacheControl = isAsset
        ? "public, max-age=2592000, immutable"
        : "public, max-age=86400, stale-while-revalidate=604800";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        "Access-Control-Allow-Origin": "*",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  if (req.method === "GET" && pathname === "/health") {
    respond(res, 200, { ok: true, store: "Al-Warda Parfumes" });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/product-images/status") {
    const response = await getProductImageQueueStatus(req, process.env);
    respond(res, response.status, await response.json(), req);
    return;
  }

  if ((req.method === "POST" || req.method === "DELETE") && pathname === "/api/admin/product-images/failed") {
    try {
      const request = await localWebRequest(req, readRawBody);
      const response = await deleteFailedProductItems(request, process.env);
      respond(res, response.status, await response.json(), req);
    } catch (error) {
      respond(res, 400, { error: error.message }, req);
    }
    return;
  }

  if (pathname === "/api/admin/product-images/requeue" && req.method === "POST") {
    try {
      const request = await localWebRequest(req, readRawBody);
      const response = await requeueFailedProductItems(request, process.env);
      respond(res, response.status, await response.json(), req);
    } catch (error) {
      respond(res, 400, { error: error.message }, req);
    }
    return;
  }

  if (pathname === "/api/admin/product-images/manual-save" && req.method === "POST") {
    try {
      const request = await localWebRequest(req, readRawBody);
      const response = await saveManualProductItem(request, process.env);
      respond(res, response.status, await response.json(), req);
    } catch (error) {
      respond(res, 400, { error: error.message }, req);
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/products") {
    try {
      const request = await localWebRequest(req, readRawBody);
      const response = await getAllAdminProducts(request, process.env);
      respond(res, response.status, await response.json(), req);
    } catch (error) {
      respond(res, 400, { error: error.message }, req);
    }
    return;
  }

  if ((req.method === "POST" || req.method === "DELETE") && (pathname === "/api/admin/products/delete" || pathname === "/api/admin/products")) {
    try {
      const request = await localWebRequest(req, readRawBody);
      const response = await deleteAdminProducts(request, process.env);
      respond(res, response.status, await response.json(), req);
    } catch (error) {
      respond(res, 400, { error: error.message }, req);
    }
    return;
  }

  if (pathname === "/api/admin/settings" && (req.method === "GET" || req.method === "POST")) {
    try {
      const request = await localWebRequest(req, readRawBody);
      const response = req.method === "GET" ? await getSiteSettings(request, process.env) : await saveSiteSettings(request, process.env);
      respond(res, response.status, await response.json(), req);
    } catch (error) {
      respond(res, 400, { error: error.message }, req);
    }
    return;
  }

  if (pathname === "/api/admin/product-images/actions") {
    try {
      const request = await localWebRequest(req, readRawBody);
      const response = await handleProductImageActions(request, process.env);
      respond(res, response.status, await response.json(), req);
    } catch (error) {
      respond(res, 400, { error: error.message }, req);
    }
    return;
  }

  // Perfume catalog API
  if (req.method === "GET" && pathname === "/api/perfumes") {
    const category = urlObj.searchParams.get("category");
    const query = urlObj.searchParams.get("q");
    let result = PERFUMES;
    if (category && category !== "all") {
      result = getPerfumesByCategory(category);
    }
    if (query) {
      const q = query.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.notesSummary.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)),
      );
    }
    respond(res, 200, { perfumes: result });
    return;
  }

  if (req.method === "GET" && (pathname === "/api/best-sellers" || pathname === "/api/perfumes/best-sellers")) {
    respond(res, 200, { bestSellers: getBestSellers() });
    return;
  }

  if (req.method === "GET" && pathname === "/api/categories") {
    respond(res, 200, { categories: PERFUME_CATEGORIES });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/perfumes/")) {
    const id = pathname.replace("/api/perfumes/", "");
    const perfume = getPerfumeById(id);
    if (!perfume) {
      respond(res, 404, { error: "Perfume not found" });
      return;
    }
    respond(res, 200, { perfume });
    return;
  }

  // Admin Actions
  if (req.method === "GET" && pathname === "/api/actions-status") {
    respond(res, 200, { actions: actionStatuses });
    return;
  }

  // -------------------------------------------------------------
  // Qogita B2B Wholesale API
  // -------------------------------------------------------------

  if (req.method === "POST" && pathname === "/api/qogita/refresh") {
    try {
      const request = await localWebRequest(req, readRawBody);
      const response = await handleQogitaWorker(request, process.env);
      const cookie = response.headers.get("set-cookie");
      if (cookie) res.setHeader("Set-Cookie", cookie);
      respond(res, response.status, await response.json(), req);
    } catch (error) {
      respond(res, 500, { error: error.message }, req);
    }
    return;
  }

  // Status & credentials check
  if (req.method === "GET" && pathname === "/api/qogita/status") {
    try {
      const status = qogitaClient.getStatus();
      const logs = getWebhookLogs();
      respond(res, 200, { ...status, ...logs });
    } catch (err) {
      respond(res, 500, { error: err.message });
    }
    return;
  }

  // Arabian Perfumes for Dropshipping (strictly Arabian brands & perfumes)
  if (req.method === "GET" && (pathname === "/api/stocks" || pathname === "/api/qogita/arabian-perfumes" || pathname === "/api/dropship-perfumes")) {
    try {
      const q = urlObj.searchParams.get("q") || "";
      const brand = urlObj.searchParams.get("brand") || "";
      const perfumes = await getArabianDropshipPerfumes({ query: q, brand });
      respond(res, 200, perfumes);
    } catch (err) {
      respond(res, 500, { error: err.message });
    }
    return;
  }

  // Luxury GTIN Product Flacon Generator / Cache
  if ((req.method === "GET" || req.method === "HEAD") && (pathname === "/api/product-image" || pathname === "/api/perfumes/product-image")) {
    try {
      const gtin = urlObj.searchParams.get("gtin") || urlObj.searchParams.get("id");
      if (!gtin) {
        respond(res, 400, { error: "Missing gtin parameter" });
        return;
      }
      const imgPath = await getOrGenerateFlaconByGtin(gtin);
      const absPath = path.resolve(__dirname, `../public${imgPath}`);
      if (fs.existsSync(absPath)) {
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*",
        });
        fs.createReadStream(absPath).pipe(res);
        return;
      }
      respond(res, 404, { error: "Product image not found" });
    } catch (err) {
      respond(res, 500, { error: err.message });
    }
    return;
  }

  // Original photo proxy. The complete source image and its background are preserved.
  if (req.method === "GET" && (pathname === "/api/transparent-image" || pathname === "/api/perfumes/transparent-image")) {
    try {
      const rawUrl = urlObj.searchParams.get("url");
      if (!rawUrl) {
        respond(res, 400, { error: "Missing url parameter" });
        return;
      }
      const pngBuffer = await getTransparentImageBuffer(rawUrl);
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=2592000, immutable",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(pngBuffer);
    } catch (err) {
      console.warn("Transparent image error:", err.message);
      const rawUrl = urlObj.searchParams.get("url");
      if (rawUrl) {
        res.writeHead(302, { Location: rawUrl });
        res.end();
      } else {
        respond(res, 500, { error: err.message });
      }
    }
    return;
  }

  // Update credentials & test login
  if (req.method === "POST" && pathname === "/api/qogita/configure") {
    try {
      const request = new Request(localRequestUrl(req), { method: req.method, headers: req.headers });
      if (!isSameOrigin(request)) {
        respond(res, 403, { error: "Invalid request origin" }, req);
        return;
      }
      const body = await readJson(req);
      const officialLogin = body.email && body.password &&
        (!body.apiUrl || body.apiUrl.replace(/\/+$/, "") === "https://api.qogita.com");
      let verifiedClient;
      if (officialLogin) {
        verifiedClient = new QogitaClient({ email: body.email.trim(), password: body.password, apiUrl: "https://api.qogita.com", useEnvironmentCredentials: false });
        await verifiedClient.login(true);
        qogitaClient.setCredentials(body.email.trim(), body.password, "https://api.qogita.com");
        qogitaClient.accessToken = verifiedClient.accessToken;
        qogitaClient.tokenExpiresAt = verifiedClient.tokenExpiresAt;
      } else if (body.email && body.password) {
        qogitaClient.setCredentials(body.email, body.password, body.apiUrl);
      }
      if (body.webhookSecret !== undefined) {
        qogitaClient.webhookSecret = body.webhookSecret;
      }
      // Attempt login to test credentials
      if (!verifiedClient) await qogitaClient.login(true);
      if (verifiedClient &&
          (process.env.QOGITA_SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
        const cookie = await createQogitaSessionCookie(process.env, {
          token: verifiedClient.accessToken,
          expires: verifiedClient.tokenExpiresAt,
          email: verifiedClient.email,
          refreshCookie: verifiedClient.refreshCookie,
        });
        res.setHeader("Set-Cookie", cookie);
      } else {
        console.warn("Qogita image-control session not created: official API URL and server session secret are required.");
      }
      respond(res, 200, {
        success: true,
        message: "Qogita credentials configured and verified successfully!",
        status: qogitaClient.getStatus(),
      });
    } catch (err) {
      respond(res, 400, {
        success: false,
        error: err.message,
        status: qogitaClient.getStatus(),
      });
    }
    return;
  }

  // Search wholesale products
  if (req.method === "GET" && pathname === "/api/qogita/products") {
    try {
      const categoryName = urlObj.searchParams.get("categoryName") || undefined;
      const brandName = urlObj.searchParams.get("brandName") || undefined;
      const stockAvailability = urlObj.searchParams.get("stockAvailability") || undefined;
      const gtin = urlObj.searchParams.get("gtin") || undefined;
      const page = urlObj.searchParams.get("page") || 1;
      const page_size = urlObj.searchParams.get("page_size") || 20;

      const results = await qogitaClient.searchProducts({
        categoryName,
        brandName,
        stockAvailability,
        gtin,
        page,
        page_size,
      });
      respond(res, 200, results);
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // Get offers for variant: /api/qogita/variants/:variantFid/offers
  const variantOffersMatch = pathname.match(/^\/api\/qogita\/variants\/([^/]+)\/offers\/?$/);
  if (req.method === "GET" && variantOffersMatch) {
    try {
      const variantFid = decodeURIComponent(variantOffersMatch[1]);
      const page = urlObj.searchParams.get("page") || 1;
      const page_size = urlObj.searchParams.get("page_size") || 20;
      const allocation_status = urlObj.searchParams.get("allocation_status") || undefined;

      const offers = await qogitaClient.getVariantOffers(variantFid, {
        page,
        page_size,
        allocation_status,
      });
      respond(res, 200, offers);
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // Get supplier offer: /api/qogita/variants/:variantFid/suppliers/:supplierAlias/offers
  const supplierOfferMatch = pathname.match(/^\/api\/qogita\/variants\/([^/]+)\/suppliers\/([^/]+)\/offers\/?$/);
  if (req.method === "GET" && supplierOfferMatch) {
    try {
      const variantFid = decodeURIComponent(supplierOfferMatch[1]);
      const supplierAlias = decodeURIComponent(supplierOfferMatch[2]);
      const offer = await qogitaClient.getSupplierOffer(variantFid, supplierAlias);
      respond(res, 200, offer);
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // Cart operations: GET /api/qogita/cart
  if (req.method === "GET" && pathname === "/api/qogita/cart") {
    try {
      const fullCart = await qogitaClient.getFullCartDetails();
      respond(res, 200, fullCart);
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // Add line to active cart: POST /api/qogita/cart/items
  if (req.method === "POST" && pathname === "/api/qogita/cart/items") {
    try {
      const body = await readJson(req);
      const { offerQid, quantity = 1 } = body;
      if (!offerQid) {
        respond(res, 400, { error: "Missing required parameter: offerQid" });
        return;
      }
      const result = await qogitaClient.addToCart(offerQid, quantity);
      respond(res, 200, { success: true, result });
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // Update line quantity in active cart: PATCH /api/qogita/cart/items
  if (req.method === "PATCH" && pathname === "/api/qogita/cart/items") {
    try {
      const body = await readJson(req);
      const { allocationQid, allocationLineQid, offerQid, quantity } = body;
      if (quantity === undefined || quantity === null) {
        respond(res, 400, { error: "Missing required parameter: quantity" });
        return;
      }

      let result;
      if (allocationQid && allocationLineQid) {
        result = await qogitaClient.updateCartLine(allocationQid, allocationLineQid, quantity);
      } else if (offerQid) {
        result = await qogitaClient.updateOfferQuantity(offerQid, quantity);
      } else {
        respond(res, 400, { error: "Provide either { allocationQid, allocationLineQid } or { offerQid }" });
        return;
      }
      respond(res, 200, { success: true, result });
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // Remove line from active cart: DELETE /api/qogita/cart/items
  if (req.method === "DELETE" && pathname === "/api/qogita/cart/items") {
    try {
      const body = await readJson(req);
      const { allocationQid, allocationLineQid, offerQid } = body;

      let result;
      if (allocationQid && allocationLineQid) {
        result = await qogitaClient.removeCartLine(allocationQid, allocationLineQid);
      } else if (offerQid) {
        result = await qogitaClient.removeOfferFromCart(offerQid);
      } else {
        respond(res, 400, { error: "Provide either { allocationQid, allocationLineQid } or { offerQid }" });
        return;
      }
      respond(res, 200, { success: true, result });
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // Catalog downloads: POST /api/qogita/catalog/download
  if (req.method === "POST" && pathname === "/api/qogita/catalog/download") {
    try {
      const body = await readJson(req);
      const result = await qogitaClient.requestCatalogDownload(body || {});
      respond(res, 202, { success: true, result });
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // List catalog downloads: GET /api/qogita/catalog/downloads
  if (req.method === "GET" && pathname === "/api/qogita/catalog/downloads") {
    try {
      const page = urlObj.searchParams.get("page") || 1;
      const page_size = urlObj.searchParams.get("page_size") || 20;
      const result = await qogitaClient.listCatalogDownloads({ page, page_size });
      respond(res, 200, result);
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // Check download status: GET /api/qogita/catalog/download/:qid/status
  const downloadStatusMatch = pathname.match(/^\/api\/qogita\/catalog\/download\/([^/]+)\/status\/?$/);
  if (req.method === "GET" && downloadStatusMatch) {
    try {
      const qid = decodeURIComponent(downloadStatusMatch[1]);
      const status = await qogitaClient.getCatalogDownloadStatus(qid);
      respond(res, 200, status);
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // Webhook management: GET /api/qogita/webhooks
  if (req.method === "GET" && pathname === "/api/qogita/webhooks") {
    try {
      const page = urlObj.searchParams.get("page") || 1;
      const page_size = urlObj.searchParams.get("page_size") || 20;
      const result = await qogitaClient.listWebhooks({ page, page_size });
      respond(res, 200, result);
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // POST /api/qogita/webhooks
  if (req.method === "POST" && pathname === "/api/qogita/webhooks") {
    try {
      const body = await readJson(req);
      const result = await qogitaClient.createWebhook(body);
      respond(res, 201, result);
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // DELETE /api/qogita/webhooks/:qid
  const deleteWebhookMatch = pathname.match(/^\/api\/qogita\/webhooks\/([^/]+)\/?$/);
  if (req.method === "DELETE" && deleteWebhookMatch) {
    try {
      const qid = decodeURIComponent(deleteWebhookMatch[1]);
      const result = await qogitaClient.deleteWebhook(qid);
      respond(res, 200, { success: true, result });
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // POST /api/qogita/webhooks/test-event
  if (req.method === "POST" && pathname === "/api/qogita/webhooks/test-event") {
    try {
      const result = await qogitaClient.sendTestWebhookEvent();
      respond(res, 202, result);
    } catch (err) {
      respond(res, err.status || 500, { error: err.message, data: err.data });
    }
    return;
  }

  // Inbound Webhook Receiver from Qogita: POST /api/qogita/webhooks/inbound
  if (req.method === "POST" && (pathname === "/api/qogita/webhooks/inbound" || pathname === "/api/qogita/webhooks/callback")) {
    try {
      const rawBodyBuffer = await readRawBody(req);
      const signatureHeader = req.headers["x-qogita-signature"] || req.headers["X-Qogita-Signature"] || "";
      const result = await handleInboundWebhook(rawBodyBuffer, signatureHeader);
      respond(res, 200, result);
    } catch (err) {
      console.error("[Qogita Webhook Error]:", err.message);
      respond(res, err.status || 400, { error: err.message });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/run-action") {
    try {
      const body = await readJson(req);
      const actionId = body.actionId || "qogita-smart-sync";
      actionStatuses[actionId] = {
        status: "running",
        startedAt: new Date().toISOString(),
        lastRun: new Date().toISOString(),
        method: "local",
        output: `[${new Date().toLocaleTimeString()}] Запуск действия: ${actionId}...\n`,
      };

      // Run asynchronously in the background so response is immediate and client polls status
      executeCatalogActionById(actionId, body)
        .then((summary) => {
          actionStatuses[actionId] = {
            status: "success",
            finishedAt: new Date().toISOString(),
            lastRun: new Date().toISOString(),
            method: "local",
            output: summary,
          };
        })
        .catch((err) => {
          actionStatuses[actionId] = {
            status: "error",
            finishedAt: new Date().toISOString(),
            lastRun: new Date().toISOString(),
            method: "local",
            output: `Ошибка выполнения: ${err.message}`,
            error: err.message,
          };
        });

      respond(res, 200, { success: true, message: `Действие ${actionId} запущено.` });
    } catch (err) {
      respond(res, 500, { error: err.message });
    }
    return;
  }

  // Chat / Assistant
  if (req.method === "POST" && (pathname === "/api/warda-chat" || pathname === "/api/warda-chat")) {
    try {
      const body = await readJson(req);
      const isSse = req.headers.accept?.includes("text/event-stream");

      if (isSse) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        });

        const onStatus = (status) => {
          res.write(`data: ${JSON.stringify({ type: "status", status })}\n\n`);
        };

        const result = await processWardaChat({ ...body, onStatus });
        res.write(`data: ${JSON.stringify({ type: "result", ...result })}\n\n`);
        res.end();
        return;
      }

      const result = await processWardaChat(body);
      respond(res, 200, result);
    } catch (err) {
      console.error("Assistant chat error:", err);
      respond(res, 500, {
        error: "Fragrance assistant failed to respond",
        message: err.message,
      });
    }
    return;
  }

  // Email inquiry
  if (req.method === "POST" && pathname === "/api/send-inquiry-email") {
    try {
      const body = await readJson(req);
      const { to, userName, subject, text, adminName } = body || {};
      if (!to || !text) {
        respond(res, 400, { error: "Missing required fields: to, text" });
        return;
      }
      const result = await sendGuestInquiryEmail({
        to,
        userName,
        subject,
        text,
        adminName,
      });
      respond(res, 200, { success: true, result });
    } catch (err) {
      console.error("Failed to send inquiry email:", err);
      respond(res, 500, {
        error: "Failed to send inquiry email",
        message: err.message,
      });
    }
    return;
  }

  if (req.method === "POST" && (pathname === "/api/warda-translate" || pathname === "/api/warda-translate")) {
    try {
      const body = await readJson(req);
      const result = await translateWardaDialog({
        messages: body?.messages,
        targetLanguage: body?.targetLanguage,
      });
      respond(res, 200, result);
    } catch (err) {
      respond(res, 500, { translations: [], error: err.message });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/translate-announcement") {
    try {
      const body = await readJson(req);
      const result = await translateAnnouncementText({ text: body?.text });
      respond(res, 200, result);
    } catch (err) {
      respond(res, 500, { error: err.message });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/enrich-perfume") {
    try {
      const body = await readJson(req);
      const result = await enrichPerfumeWithAI(body || {});
      respond(res, 200, result);
    } catch (err) {
      respond(res, 500, { error: err.message });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/filter-inquiry-message") {
    try {
      const body = await readJson(req);
      const { text, language } = body || {};
      const result = await filterInquiryMessageWithAI({ text, language });
      respond(res, 200, result);
    } catch (err) {
      respond(res, 500, {
        allowed: false,
        reason: "Ошибка проверки сообщения.",
        message: err.message,
      });
    }
    return;
  }

  // SPA Fallback for non-API GET requests
  const indexPath = path.join(appDir, "dist", "index.html");
  if (req.method === "GET" && !pathname.startsWith("/api") && fs.existsSync(indexPath)) {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(indexPath).pipe(res);
    return;
  }

  respond(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Al-Warda Parfumes API listening on ${PORT}`);
});
