export function isSameOrigin(request) {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === expected;
  if (request.headers.get("sec-fetch-site") !== "same-origin") return false;
  const referer = request.headers.get("referer");
  if (!referer) return true;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}
