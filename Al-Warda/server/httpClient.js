let customAdapter = null;

export function setHttpAdapter(adapter) {
  customAdapter = adapter;
}

function extractSetCookie(headers) {
  if (typeof headers.getSetCookie === "function") {
    const list = headers.getSetCookie();
    if (Array.isArray(list) && list.length > 0) return list;
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

async function fetchWithTimeout(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const cleanHeaders = { ...(options.headers || {}) };
    delete cleanHeaders.Connection;
    delete cleanHeaders.connection;

    const res = await fetch(url, {
      method: options.method || "GET",
      headers: cleanHeaders,
      body: options.body,
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    let data = text;
    if (options.parseJson || contentType.includes("application/json")) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return {
      data,
      status: res.status,
      headers: {
        "set-cookie": extractSetCookie(res.headers),
        "content-type": contentType,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

const httpClient = {
  async get(url, config = {}) {
    if (customAdapter) {
      return customAdapter.get(url, config);
    }
    return fetchWithTimeout(
      url,
      { method: "GET", headers: config.headers },
      config.timeout || 8000,
    );
  },

  async post(url, payload, config = {}) {
    if (customAdapter) {
      return customAdapter.post(url, payload, config);
    }
    const body =
      typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
    return fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.headers || {}),
        },
        body,
        parseJson: true,
      },
      config.timeout || 8000,
    );
  },
};

export default httpClient;
