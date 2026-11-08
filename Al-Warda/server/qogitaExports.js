const API_URL = "https://api.qogita.com";
const TOKEN_URL = "https://auth.qogita.com/oauth/v2/token";
const EXPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function oauthToken(env) {
  const { QOGITA_CLIENT_ID: id, QOGITA_CLIENT_SECRET: secret, QOGITA_TOKEN_SCOPE: scope } = env;
  if (!id || !secret || !scope) {
    const error = new Error("Qogita catalog export credentials are not configured on the server");
    error.status = 503;
    throw error;
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope }),
  });
  if (!response.ok) {
    const error = new Error(`Qogita OAuth failed (${response.status})`);
    error.status = 502;
    throw error;
  }
  const result = await response.json();
  if (typeof result.access_token !== "string" || !result.access_token) {
    throw new Error("Qogita OAuth response did not contain an access token");
  }
  return result.access_token;
}

export async function qogitaProductExport(env, { id, filters } = {}) {
  if (id !== undefined && !EXPORT_ID.test(id)) {
    const error = new Error("Invalid Qogita export ID");
    error.status = 400;
    throw error;
  }
  const token = await oauthToken(env);
  const response = await fetch(`${API_URL}/v1/buyers/product-exports/${id ? `${id}/` : ""}`, {
    method: id ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(id ? {} : { "Content-Type": "application/json" }),
    },
    ...(id ? {} : { body: JSON.stringify(filters || {}) }),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || data.detail || data.code || `Qogita export failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}
