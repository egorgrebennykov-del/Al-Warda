const NAMED_ENTITIES = {
  "&quot;": '"',
  "&apos;": "'",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&laquo;": "«",
  "&raquo;": "»",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&ndash;": "–",
  "&mdash;": "—",
  "&hellip;": "…",
  "&nbsp;": " ",
  "&shy;": "",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
};

/**
 * Universal decoder for HTML entities in book titles, descriptions, and authors.
 * Handles named entities (&quot;, &amp;, &laquo;, etc.) and numeric entities (&#039;, &#x22;),
 * with multiple passes to handle double-encoded entities.
 *
 * @param {string} str
 * @returns {string}
 */
export default function decodeHtmlEntities(str) {
  if (!str || typeof str !== "string") return "";
  let result = str;

  for (let pass = 0; pass < 2; pass++) {
    if (!result.includes("&")) break;
    result = result
      .replace(
        /&(?:quot|apos|amp|lt|gt|laquo|raquo|ldquo|rdquo|lsquo|rsquo|ndash|mdash|hellip|nbsp|shy|copy|reg|trade);/gi,
        (match) => NAMED_ENTITIES[match.toLowerCase()] ?? match,
      )
      .replace(/&#(\d+);/g, (_, code) => {
        try {
          return String.fromCodePoint(Number(code));
        } catch {
          return "";
        }
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        try {
          return String.fromCodePoint(parseInt(hex, 16));
        } catch {
          return "";
        }
      });
  }

  return result.trim();
}
