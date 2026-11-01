/**
 * Frontend client for Qogita B2B wholesale API through Al-Warda backend proxy
 */

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.detail || data?.message || `Request failed with status ${res.status}`;
    const error = new Error(errorMsg);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function getQogitaStatus() {
  return fetchJson("/api/qogita/status");
}

export async function configureQogita({ email, password, apiUrl, webhookSecret }) {
  return fetchJson("/api/qogita/configure", {
    method: "POST",
    body: JSON.stringify({ email, password, apiUrl, webhookSecret }),
  });
}

export async function searchQogitaProducts(params = {}) {
  const query = new URLSearchParams();
  if (params.categoryName) query.set("categoryName", params.categoryName);
  if (params.brandName) query.set("brandName", params.brandName);
  if (params.stockAvailability) query.set("stockAvailability", params.stockAvailability);
  if (params.gtin) query.set("gtin", params.gtin);
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));

  const qs = query.toString();
  return fetchJson(`/api/qogita/products${qs ? `?${qs}` : ""}`);
}

export async function getQogitaVariantOffers(variantFid, params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  if (params.allocation_status) query.set("allocation_status", params.allocation_status);

  const qs = query.toString();
  return fetchJson(`/api/qogita/variants/${encodeURIComponent(variantFid)}/offers${qs ? `?${qs}` : ""}`);
}

export async function getQogitaSupplierOffer(variantFid, supplierAlias) {
  return fetchJson(
    `/api/qogita/variants/${encodeURIComponent(variantFid)}/suppliers/${encodeURIComponent(supplierAlias)}/offers`
  );
}

export async function getQogitaCart() {
  return fetchJson("/api/qogita/cart");
}

export async function addQogitaCartItem(offerQid, quantity = 1) {
  return fetchJson("/api/qogita/cart/items", {
    method: "POST",
    body: JSON.stringify({ offerQid, quantity }),
  });
}

export async function updateQogitaCartItem({ allocationQid, allocationLineQid, offerQid, quantity }) {
  return fetchJson("/api/qogita/cart/items", {
    method: "PATCH",
    body: JSON.stringify({ allocationQid, allocationLineQid, offerQid, quantity }),
  });
}

export async function deleteQogitaCartItem({ allocationQid, allocationLineQid, offerQid }) {
  return fetchJson("/api/qogita/cart/items", {
    method: "DELETE",
    body: JSON.stringify({ allocationQid, allocationLineQid, offerQid }),
  });
}

export async function requestQogitaCatalogDownload(filters = {}) {
  return fetchJson("/api/qogita/catalog/download", {
    method: "POST",
    body: JSON.stringify(filters),
  });
}

export async function getQogitaCatalogDownloads(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  const qs = query.toString();
  return fetchJson(`/api/qogita/catalog/downloads${qs ? `?${qs}` : ""}`);
}

export async function getQogitaDownloadStatus(qid) {
  return fetchJson(`/api/qogita/catalog/download/${encodeURIComponent(qid)}/status`);
}

export async function getQogitaWebhooks(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  const qs = query.toString();
  return fetchJson(`/api/qogita/webhooks${qs ? `?${qs}` : ""}`);
}

export async function createQogitaWebhook(data) {
  return fetchJson("/api/qogita/webhooks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteQogitaWebhook(qid) {
  return fetchJson(`/api/qogita/webhooks/${encodeURIComponent(qid)}`, {
    method: "DELETE",
  });
}

export async function sendQogitaTestWebhook() {
  return fetchJson("/api/qogita/webhooks/test-event", {
    method: "POST",
  });
}
