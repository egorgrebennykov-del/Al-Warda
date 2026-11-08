import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";

const DEFAULT_API_URL = "https://api.qogita.com";
const DEFAULT_TOLERANCE_SECONDS = 5 * 60; // 5 minutes

export class QogitaClient {
  constructor(options = {}) {
    this.apiUrl = (options.apiUrl || process.env.QOGITA_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
    this.email = options.email || "";
    this.password = options.password || "";
    this.useEnvironmentCredentials = options.useEnvironmentCredentials !== false;
    this.webhookSecret = options.webhookSecret || process.env.QOGITA_WEBHOOK_SECRET || "";
    this.accessToken = options.accessToken || null;
    this.tokenExpiresAt = options.tokenExpiresAt || 0;
    this.refreshCookie = null;
  }

  setCredentials(email, password, apiUrl = null) {
    this.email = email || this.email;
    this.password = password || this.password;
    if (apiUrl) {
      this.apiUrl = apiUrl.replace(/\/+$/, "");
    }
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  isConfigured() {
    return Boolean((this.email || (this.useEnvironmentCredentials && process.env.QOGITA_EMAIL)) && (this.password || (this.useEnvironmentCredentials && process.env.QOGITA_PASSWORD)));
  }

  getStatus() {
    const email = this.email || (this.useEnvironmentCredentials && process.env.QOGITA_EMAIL);
    return {
      apiUrl: this.apiUrl,
      email: email ? `${email.slice(0, 3)}***@${email.split("@")[1] || ""}` : null,
      isConfigured: this.isConfigured(),
      isAuthenticated: Boolean(this.accessToken && Date.now() < this.tokenExpiresAt),
      hasWebhookSecret: Boolean(this.webhookSecret),
    };
  }

  /**
   * Authenticate and obtain JWT Bearer token
   * Endpoint: POST /auth/login/
   */
  async login(force = false) {
    if (!force && this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const email = this.email || (this.useEnvironmentCredentials && process.env.QOGITA_EMAIL);
    const password = this.password || (this.useEnvironmentCredentials && process.env.QOGITA_PASSWORD);
    if (!email || !password) {
      throw new Error("Qogita credentials not configured. Please set QOGITA_EMAIL and QOGITA_PASSWORD.");
    }

    const url = `${this.apiUrl}/auth/login/`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      let parsedErr = {};
      try {
        parsedErr = JSON.parse(errText);
      } catch {
        // fallback
      }
      const msg = parsedErr.detail || parsedErr.message || parsedErr.error || `Login failed with status ${res.status}`;
      const error = new Error(`Qogita Auth Error: ${msg}`);
      error.status = res.status;
      throw error;
    }

    const data = await res.json();
    const cookies = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie() : [res.headers.get("set-cookie") || ""];
    this.refreshCookie = cookies.find((cookie) => cookie.startsWith("Refresh-Token=")) || null;
    this.accessToken = data.accessToken || data.access_token;
    if (!this.accessToken) throw new Error("Qogita login response did not contain an access token");
    const expires = Number(data.accessExp || data.access_exp);
    this.tokenExpiresAt = Number.isFinite(expires) && expires > Date.now()
      ? Math.min(expires - 60_000, Date.now() + 55 * 60 * 1000)
      : Date.now() + 55 * 60 * 1000;
    return this.accessToken;
  }

  /**
   * Internal request helper enforcing trailing slash and auth header
   */
  async request(path, options = {}, retryOnAuth = true) {
    let token = this.accessToken;
    if (!token || Date.now() >= this.tokenExpiresAt) {
      token = await this.login();
    }

    // Ensure path ends with trailing slash before query string
    let normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const [pathname, queryString] = normalizedPath.split("?");
    const pathWithSlash = pathname.endsWith("/") ? pathname : `${pathname}/`;
    const fullUrl = `${this.apiUrl}${pathWithSlash}${queryString ? `?${queryString}` : ""}`;

    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    };

    const res = await fetch(fullUrl, {
      method: options.method || "GET",
      headers,
      body: options.body ? (typeof options.body === "string" ? options.body : JSON.stringify(options.body)) : undefined,
    });

    if (res.status === 401 && retryOnAuth) {
      if (!this.isConfigured()) {
        const error = new Error("Qogita session expired. Sign in again.");
        error.status = 401;
        throw error;
      }
      this.accessToken = null;
      await this.login(true);
      return this.request(path, options, false);
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after") || "60";
      throw new Error(`Qogita Rate Limit Exceeded (429). Retry after ${retryAfter} seconds.`);
    }

    if (res.status === 204) {
      return { success: true };
    }

    const contentType = res.headers.get("content-type") || "";
    const responseText = await res.text();
    let responseData;
    if (contentType.includes("application/json") || responseText.startsWith("{") || responseText.startsWith("[")) {
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }
    } else {
      responseData = responseText;
    }

    if (!res.ok) {
      const errMsg =
        responseData?.message ||
        responseData?.detail ||
        responseData?.error ||
        responseData?.code ||
        `Qogita API error ${res.status}: ${res.statusText}`;
      const err = new Error(errMsg);
      err.status = res.status;
      err.data = responseData;
      throw err;
    }

    return responseData;
  }

  /* -------------------------------------------------------------
   * Product & Offer Endpoints
   * ------------------------------------------------------------- */

  /**
   * Search products catalog
   * GET /public/buyers/products/?categoryName=...&brandName=...&stockAvailability=...&gtin=...&page=...&page_size=...
   */
  async searchProducts(params = {}) {
    const query = new URLSearchParams();
    if (params.categoryName || params.category_name) {
      query.set("category_name", params.categoryName || params.category_name);
    }
    if (params.brandName || params.brand_name || params.brand) {
      query.set("brand_name", params.brandName || params.brand_name || params.brand);
    }
    if (params.stockAvailability || params.stock_availability) {
      query.set("stock_availability", params.stockAvailability || params.stock_availability);
    }
    if (params.gtin) query.set("gtin", params.gtin);
    if (params.page) query.set("page", String(params.page));
    if (params.page_size) query.set("page_size", String(params.page_size));

    const qs = query.toString();
    return this.request(`/public/buyers/products/${qs ? `?${qs}` : ""}`);
  }

  /**
   * Retrieve offers for a single product variant
   * GET /buyers/variants/{variant_fid}/offers/?page=...&page_size=...&allocation_status=...
   */
  async getVariantOffers(variantFid, params = {}) {
    if (!variantFid) throw new Error("variantFid is required");
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.page_size) query.set("page_size", String(params.page_size));
    if (params.allocation_status) query.set("allocation_status", params.allocation_status);

    const qs = query.toString();
    return this.request(`/buyers/variants/${encodeURIComponent(variantFid)}/offers/${qs ? `?${qs}` : ""}`);
  }

  /**
   * Retrieve variant offers from a specific supplier
   * GET /buyers/variants/{variant_fid}/suppliers/{supplier_alias}/offers/
   */
  async getSupplierOffer(variantFid, supplierAlias) {
    if (!variantFid || !supplierAlias) {
      throw new Error("Both variantFid and supplierAlias are required");
    }
    return this.request(
      `/buyers/variants/${encodeURIComponent(variantFid)}/suppliers/${encodeURIComponent(supplierAlias)}/offers/`
    );
  }

  /* -------------------------------------------------------------
   * Active Cart & Minimum Order Value (MOV) Endpoints
   * ------------------------------------------------------------- */

  /**
   * Get active cart summary
   * GET /buyers/carts/active/
   */
  async getActiveCart() {
    return this.request("/buyers/carts/active/");
  }

  /**
   * Get cart allocations and MOV progress
   * GET /buyers/carts/active/allocations/
   */
  async getCartAllocations() {
    return this.request("/buyers/carts/active/allocations/");
  }

  /**
   * Get lines for a specific allocation
   * GET /buyers/carts/active/allocations/{allocation_fid}/lines/
   */
  async getAllocationLines(allocationFid) {
    if (!allocationFid) throw new Error("allocationFid is required");
    return this.request(`/buyers/carts/active/allocations/${encodeURIComponent(allocationFid)}/lines/`);
  }

  /**
   * Aggregate helper: returns cart summary + all allocations with their lines & MOV status
   */
  async getFullCartDetails() {
    try {
      const [cart, allocationsRes] = await Promise.all([
        this.getActiveCart(),
        this.getCartAllocations(),
      ]);

      const allocations = allocationsRes?.results || allocationsRes || [];
      const populatedAllocations = await Promise.all(
        allocations.map(async (allocation) => {
          const fid = allocation.fid || allocation.qid;
          try {
            const linesRes = await this.getAllocationLines(fid);
            return {
              ...allocation,
              lines: linesRes?.results || linesRes || [],
            };
          } catch (err) {
            console.warn(`Could not load lines for allocation ${fid}:`, err.message);
            return {
              ...allocation,
              lines: [],
              linesError: err.message,
            };
          }
        })
      );

      return {
        cart,
        allocations: populatedAllocations,
        totalAllocations: populatedAllocations.length,
      };
    } catch (err) {
      if (err.status === 404) {
        return {
          cart: null,
          allocations: [],
          message: "No active cart found",
        };
      }
      throw err;
    }
  }

  /**
   * Add offer to active cart
   * POST /carts/active/lines/
   * Body: { offerQid, quantity }
   */
  async addToCart(offerQid, quantity = 1) {
    if (!offerQid) throw new Error("offerQid is required");
    return this.request("/carts/active/lines/", {
      method: "POST",
      body: {
        offerQid,
        quantity: Math.max(1, Number(quantity) || 1),
      },
    });
  }

  /**
   * Update line quantity within an allocation
   * PATCH /carts/active/allocations/{allocation_qid}/lines/{allocation_line_qid}/
   * Body: { quantity }
   */
  async updateCartLine(allocationQid, allocationLineQid, quantity) {
    if (!allocationQid || !allocationLineQid) {
      throw new Error("Both allocationQid and allocationLineQid are required");
    }
    return this.request(
      `/carts/active/allocations/${encodeURIComponent(allocationQid)}/lines/${encodeURIComponent(allocationLineQid)}/`,
      {
        method: "PATCH",
        body: { quantity: Number(quantity) },
      }
    );
  }

  /**
   * Remove line from an allocation
   * DELETE /carts/active/allocations/{allocation_qid}/lines/{allocation_line_qid}/
   */
  async removeCartLine(allocationQid, allocationLineQid) {
    if (!allocationQid || !allocationLineQid) {
      throw new Error("Both allocationQid and allocationLineQid are required");
    }
    return this.request(
      `/carts/active/allocations/${encodeURIComponent(allocationQid)}/lines/${encodeURIComponent(allocationLineQid)}/`,
      { method: "DELETE" }
    );
  }

  /**
   * Find an allocation line matching an offerQid
   */
  async findAllocationLineForOffer(offerQid) {
    const allocationsRes = await this.getCartAllocations();
    const allocations = allocationsRes?.results || allocationsRes || [];
    for (const alloc of allocations) {
      const fid = alloc.fid || alloc.qid;
      const linesRes = await this.getAllocationLines(fid);
      const lines = linesRes?.results || linesRes || [];
      const match = lines.find((l) => l.offerQid === offerQid || l.offer?.qid === offerQid);
      if (match) {
        return {
          allocationQid: alloc.qid || alloc.fid,
          allocationLineQid: match.qid || match.fid,
          line: match,
        };
      }
    }
    return null;
  }

  /**
   * Convenience: update quantity by offerQid
   */
  async updateOfferQuantity(offerQid, quantity) {
    const found = await this.findAllocationLineForOffer(offerQid);
    if (!found) throw new Error(`Line with offerQid ${offerQid} not found in active cart`);
    return this.updateCartLine(found.allocationQid, found.allocationLineQid, quantity);
  }

  /**
   * Convenience: remove line by offerQid
   */
  async removeOfferFromCart(offerQid) {
    const found = await this.findAllocationLineForOffer(offerQid);
    if (!found) throw new Error(`Line with offerQid ${offerQid} not found in active cart`);
    return this.removeCartLine(found.allocationQid, found.allocationLineQid);
  }

  /* -------------------------------------------------------------
   * Catalog Download Workflow
   * ------------------------------------------------------------- */

  /**
   * Request full or filtered catalog download
   * POST /public/buyers/catalog-downloads/
   * Rate Limit: 3/min, 50/24h
   */
  async requestCatalogDownload(filters = {}) {
    const body = {};
    if (filters.brands?.length) body.brands = filters.brands;
    if (filters.categories?.length) body.categories = filters.categories;
    if (filters.supplier_aliases?.length) body.supplier_aliases = filters.supplier_aliases;

    return this.request("/public/buyers/catalog-downloads/", {
      method: "POST",
      body,
    });
  }

  /**
   * List catalog download jobs
   * GET /public/buyers/catalog-downloads/
   */
  async listCatalogDownloads(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.page_size) query.set("page_size", String(params.page_size));
    const qs = query.toString();
    return this.request(`/public/buyers/catalog-downloads/${qs ? `?${qs}` : ""}`);
  }

  /**
   * Get specific catalog download job
   * GET /public/buyers/catalog-downloads/{qid}/
   */
  async getCatalogDownload(qid) {
    if (!qid) throw new Error("Catalog download qid is required");
    return this.request(`/public/buyers/catalog-downloads/${encodeURIComponent(qid)}/`);
  }

  /**
   * Check status of a catalog download job
   * GET /public/buyers/catalog-downloads/{qid}/status/
   */
  async getCatalogDownloadStatus(qid) {
    if (!qid) throw new Error("Catalog download qid is required");
    return this.request(`/public/buyers/catalog-downloads/${encodeURIComponent(qid)}/status/`);
  }

  /* -------------------------------------------------------------
   * Webhook Management & Signature Verification
   * ------------------------------------------------------------- */

  /**
   * Create webhook endpoint
   * POST /public/webhooks/
   */
  async createWebhook(data) {
    const { url, eventTypes, description, enabled = true } = data;
    if (!url || !eventTypes?.length) {
      throw new Error("url (HTTPS) and eventTypes (array) are required to create a webhook");
    }
    return this.request("/public/webhooks/", {
      method: "POST",
      body: {
        url,
        eventTypes,
        description: description || "Qogita integration webhook",
        enabled: Boolean(enabled),
      },
    });
  }

  /**
   * List registered webhooks
   * GET /public/webhooks/
   */
  async listWebhooks(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.page_size) query.set("page_size", String(params.page_size));
    const qs = query.toString();
    return this.request(`/public/webhooks/${qs ? `?${qs}` : ""}`);
  }

  /**
   * Get webhook by qid
   * GET /public/webhooks/{qid}/
   */
  async getWebhook(qid) {
    if (!qid) throw new Error("Webhook qid is required");
    return this.request(`/public/webhooks/${encodeURIComponent(qid)}/`);
  }

  /**
   * Update webhook endpoint
   * PATCH /public/webhooks/{qid}/
   */
  async updateWebhook(qid, updates) {
    if (!qid) throw new Error("Webhook qid is required");
    return this.request(`/public/webhooks/${encodeURIComponent(qid)}/`, {
      method: "PATCH",
      body: updates,
    });
  }

  /**
   * Delete webhook endpoint
   * DELETE /public/webhooks/{qid}/
   */
  async deleteWebhook(qid) {
    if (!qid) throw new Error("Webhook qid is required");
    return this.request(`/public/webhooks/${encodeURIComponent(qid)}/`, {
      method: "DELETE",
    });
  }

  /**
   * Send test webhook event
   * POST /public/webhooks/test-event
   * Rate limit: 10/min
   */
  async sendTestWebhookEvent() {
    return this.request("/public/webhooks/test-event", {
      method: "POST",
    });
  }

  /**
   * Verify inbound Qogita webhook delivery signature
   * Header format: X-Qogita-Signature: t=<timestamp>,v1=<signature>
   * Signed payload format: `${t}.` + raw_body
   */
  verifyWebhookSignature(rawBody, signatureHeader, signingSecret = null) {
    const secret = signingSecret || this.webhookSecret;
    if (!secret) {
      throw new Error("Webhook signing secret not configured");
    }
    if (!signatureHeader) {
      return { valid: false, reason: "Missing X-Qogita-Signature header" };
    }

    try {
      const parts = {};
      for (const item of signatureHeader.split(",")) {
        const [k, v] = item.trim().split("=");
        if (k && v) parts[k] = v;
      }

      const timestamp = parseInt(parts.t, 10);
      const expectedSignature = parts.v1;

      if (!timestamp || !expectedSignature) {
        return { valid: false, reason: "Malformed X-Qogita-Signature format" };
      }

      // Check replay attack tolerance window (default 5 minutes)
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSeconds - timestamp) > DEFAULT_TOLERANCE_SECONDS) {
        return { valid: false, reason: `Timestamp outside tolerance window (${Math.abs(nowSeconds - timestamp)}s > 300s)` };
      }

      const payloadPrefix = Buffer.from(`${timestamp}.`, "utf8");
      const rawBodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || "", "utf8");
      const signedPayload = Buffer.concat([payloadPrefix, rawBodyBuffer]);

      const computedHmac = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");

      const a = Buffer.from(computedHmac, "utf8");
      const b = Buffer.from(expectedSignature, "utf8");

      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { valid: false, reason: "Signature mismatch" };
      }

      return { valid: true, timestamp };
    } catch (err) {
      return { valid: false, reason: `Verification error: ${err.message}` };
    }
  }
}

export const qogitaClient = new QogitaClient();
export default qogitaClient;
