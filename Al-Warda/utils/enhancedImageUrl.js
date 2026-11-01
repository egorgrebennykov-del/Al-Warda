export function decodeLibrariusImage(url) {
  if (!url || typeof url !== "string") return "";
  let target = url;
  if (target.includes("/img/original/")) {
    target = target.replace("/img/original/", "/img/catalog/");
  }
  try {
    const match = target.match(/\/img\/\d+\/\d+\/(?:x)?([A-Za-z0-9_-]+)/);
    if (match) {
      let b64 = match[1].replace(/_e_/g, "=").replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4 !== 0) b64 += "=";
      const raw =
        typeof atob === "function"
          ? atob(b64)
          : globalThis.Buffer?.from(b64, "base64").toString("binary") ?? "";
      try {
        const decoded = decodeURIComponent(escape(raw));
        if (decoded.startsWith("http")) {
          return decoded
            .replace(/^http:/i, "https:")
            .replace("/img/original/", "/img/catalog/");
        }
      } catch {
        if (raw.startsWith("http")) {
          return raw
            .replace(/^http:/i, "https:")
            .replace("/img/original/", "/img/catalog/");
        }
      }
    }
  } catch {
    // Ignore decoding errors
  }
  return target.replace(/^http:\/\/cdn\./i, "https://cdn.");
}

export function decodeCarturestiImage(url) {
  if (!url || typeof url !== "string") return "";
  if (!url.includes("carturesti.md")) return url;
  // Convert /img-prod/126286-0-240.jpeg -> /img-prod/126286-0.jpeg (full original resolution)
  // Only remove thumbnail dimensions (e.g. -240, -480) and keep photo index (e.g. -0, -1)
  return url.replace(
    /(\/img-prod\/\d+(?:-\d+)?)-\d{3,4}\.(jpe?g|png|webp)(\?.*)?$/i,
    "$1.$2$3",
  );
}

export function decodeUlyssesImage(url) {
  if (!url || typeof url !== "string") return "";
  if (!url.includes("ulysses.md")) return url;
  // If it's a resize_cache URL, restore the original uncompressed image path
  if (url.includes("/resize_cache/iblock/")) {
    return url.replace(/\/resize_cache\/iblock\/([^/]+)\/[^/]+\/([^/]+)$/, "/iblock/$1/$2");
  }
  return url;
}

export function decodeCarteameaImage(url) {
  if (!url || typeof url !== "string") return "";
  if (!url.includes("carteamea.md")) return url;
  // Convert /wp-content/uploads/.../name-150x225.jpg -> /wp-content/uploads/.../name.jpg (full original resolution)
  return url.replace(/-\d+x\d+\.(jpe?g|png|webp)(\?.*)?$/i, ".$1$2");
}

export function decodeBiblionImage(url) {
  if (!url || typeof url !== "string") return "";
  if (!url.includes("biblion.md")) return url;
  const decoded = url.replace(/-\d+x\d+\.(avif|jpe?g|png|webp)(\?.*)?$/i, ".$1$2");
  try {
    return new URL(decoded).href;
  } catch {
    return decoded;
  }
}

const LOCAL_HOME_COVERS = [
  ["zagadochnoe-proisshestvie-v-staylze_1561396259", "/assets/img/home/home-1.webp"],
  ["idiot_1645512389", "/assets/img/home/home-2.webp"],
  ["missiya-vypolnima-tehnologiya-schastlivoy-zhizni_1690538879", "/assets/img/home/home-3.webp"],
  ["iskusstvo-lyubiti_1563466168", "/assets/img/home/home-4.webp"],
  ["smerti-na-nile_1552219429", "/assets/img/home/home-5.webp"],
];

export default function enhancedImageUrl(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== "string") return "";
  if (sourceUrl.startsWith("/assets/") || sourceUrl.startsWith("/api/enhance-image")) {
    return sourceUrl;
  }

  let resolved = sourceUrl;

  if (resolved.includes("librarius.md")) {
    resolved = decodeLibrariusImage(resolved);
  } else if (resolved.includes("carturesti.md")) {
    resolved = decodeCarturestiImage(resolved);
  } else if (resolved.includes("ulysses.md")) {
    resolved = decodeUlyssesImage(resolved);
  } else if (resolved.includes("carteamea.md")) {
    resolved = decodeCarteameaImage(resolved);
  } else if (resolved.includes("biblion.md")) {
    resolved = decodeBiblionImage(resolved);
  }

  for (const [slug, localPath] of LOCAL_HOME_COVERS) {
    if (resolved.includes(slug)) {
      return localPath;
    }
  }

  if (/^https?:\/\//i.test(resolved)) {
    return resolved.replace(/^http:\/\/cdn\./i, "https://cdn.");
  }
  return resolved;
}
