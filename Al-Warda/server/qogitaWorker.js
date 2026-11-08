import { QogitaClient } from "./qogitaClient.js";
import { qogitaProductExport } from "./qogitaExports.js";

const COOKIE_NAME = "__Host-qogita_session";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}

async function sessionKey(env) {
  const secret = env.QOGITA_SESSION_SECRET || env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Server session secret is not configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`qogita-session:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function createSession(env, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sessionKey(env), encoder.encode(JSON.stringify(payload)));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function createQogitaSessionCookie(env, { token, expires, email }) {
  const session = await createSession(env, { token, expires, email: null, accountEmail: email.trim().toLowerCase() });
  const maxAge = Math.max(0, Math.floor((expires - Date.now()) / 1000));
  return `${COOKIE_NAME}=${session}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export async function readQogitaSession(request, env) {
  const cookie = (request.headers.get("cookie") || "").split(";").map(item => item.trim())
    .find(item => item.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!cookie) return null;
  const key = await sessionKey(env);
  try {
    const [iv, encrypted, extra] = cookie.split(".");
    if (!iv || !encrypted || extra) return null;
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, key, base64ToBytes(encrypted));
    const session = JSON.parse(decoder.decode(plaintext));
    if (typeof session.token !== "string" || typeof session.expires !== "number" || session.expires <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function checkOrigin(request) {
  const origin = request.headers.get("origin");
  return origin && origin === new URL(request.url).origin;
}

export async function handleQogitaWorker(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  if (method !== "GET" && !checkOrigin(request)) return json({ error: "Invalid request origin" }, 403);

  try {
    if (method === "POST" && path === "/api/qogita/configure") {
      const body = await request.json();
      if (typeof body.email !== "string" || typeof body.password !== "string" || !body.email.trim() || !body.password) {
        return json({ error: "Enter your Qogita email and password" }, 400);
      }
      const client = new QogitaClient({ apiUrl: "https://api.qogita.com", email: body.email.trim(), password: body.password, useEnvironmentCredentials: false });
      await client.login();
      const session = await createSession(env, { token: client.accessToken, expires: client.tokenExpiresAt, email: client.getStatus().email, accountEmail: body.email.trim().toLowerCase() });
      const maxAge = Math.max(0, Math.floor((client.tokenExpiresAt - Date.now()) / 1000));
      return json({ success: true, status: { ...client.getStatus(), isConfigured: true } }, 200, {
        "Set-Cookie": `${COOKIE_NAME}=${session}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`,
      });
    }

    const session = await readQogitaSession(request, env);
    if (method === "GET" && path === "/api/qogita/status") {
      return json({ apiUrl: "https://api.qogita.com", isConfigured: Boolean(session), isAuthenticated: Boolean(session), email: session?.email || null });
    }
    if (!session) return json({ error: "Sign in to Qogita in the connection settings" }, 401);

    if (path === "/api/qogita/catalog/download" || /^\/api\/qogita\/catalog\/download\/[^/]+\/status$/.test(path)) {
      if (!env.QOGITA_EXPORT_ACCOUNT_EMAIL || session.accountEmail !== env.QOGITA_EXPORT_ACCOUNT_EMAIL.trim().toLowerCase()) {
        return json({ error: "Catalog export is not configured for this Qogita account" }, 403);
      }
      if (method === "POST" && path === "/api/qogita/catalog/download") {
        return json({ result: await qogitaProductExport(env, { filters: await request.json() }) }, 202);
      }
      const match = path.match(/^\/api\/qogita\/catalog\/download\/([^/]+)\/status$/);
      if (method === "GET" && match) return json(await qogitaProductExport(env, { id: match[1] }));
      return json({ error: "Method not allowed" }, 405);
    }

    const client = new QogitaClient({ apiUrl: "https://api.qogita.com", accessToken: session.token, tokenExpiresAt: session.expires, useEnvironmentCredentials: false });
    const params = Object.fromEntries(url.searchParams);
    let result;
    if (method === "GET" && path === "/api/qogita/products") result = await client.searchProducts(params);
    else if (method === "GET" && path === "/api/qogita/cart") result = await client.getFullCartDetails();
    else if (path === "/api/qogita/cart/items" && ["POST", "PATCH", "DELETE"].includes(method)) {
      const body = await request.json();
      if (method === "POST") result = await client.addToCart(body.offerQid, body.quantity);
      else if (method === "PATCH" && body.allocationQid && body.allocationLineQid) result = await client.updateCartLine(body.allocationQid, body.allocationLineQid, body.quantity);
      else if (method === "PATCH") result = await client.updateOfferQuantity(body.offerQid, body.quantity);
      else if (body.allocationQid && body.allocationLineQid) result = await client.removeCartLine(body.allocationQid, body.allocationLineQid);
      else result = await client.removeOfferFromCart(body.offerQid);
      result = { success: true, result };
    } else if (method === "GET" && path === "/api/qogita/catalog/downloads") return json({ error: "List exports by their saved IDs" }, 405);
    else if (method === "GET" && path === "/api/qogita/webhooks") result = await client.listWebhooks(params);
    else if (method === "POST" && path === "/api/qogita/webhooks") result = await client.createWebhook(await request.json());
    else if (method === "POST" && path === "/api/qogita/webhooks/test-event") result = await client.sendTestWebhookEvent();
    else {
      const variant = path.match(/^\/api\/qogita\/variants\/([^/]+)\/offers$/);
      const supplier = path.match(/^\/api\/qogita\/variants\/([^/]+)\/suppliers\/([^/]+)\/offers$/);
      const webhook = path.match(/^\/api\/qogita\/webhooks\/([^/]+)$/);
      if (method === "GET" && variant) result = await client.getVariantOffers(decodeURIComponent(variant[1]), params);
      else if (method === "GET" && supplier) result = await client.getSupplierOffer(decodeURIComponent(supplier[1]), decodeURIComponent(supplier[2]));
      else if (method === "DELETE" && webhook) result = { success: true, result: await client.deleteWebhook(decodeURIComponent(webhook[1])) };
      else return json({ error: "Endpoint not found" }, 404);
    }
    return json(result);
  } catch (error) {
    console.error("Qogita request failed:", error.message);
    return json({ error: error.message }, error.status >= 400 && error.status <= 599 ? error.status : 502);
  }
}
