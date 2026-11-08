export function localRequestUrl(req) {
  const host = req.headers.host;
  if (!host) throw new Error("Missing Host header");
  const url = new URL(req.url || "/", `http://${host}`);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.host !== host) {
    throw new Error("Only local hosts are allowed");
  }
  return url;
}

export async function localWebRequest(req, readBody) {
  const url = localRequestUrl(req);
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
  return new Request(url, { method: req.method, headers: req.headers, body });
}
