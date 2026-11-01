import getBooksFromLibrarius from "./getBooksFromLibrarius.js";
import getBooksFromCarturesti from "./getBooksFromCarturesti.js";
import getBooksFromUlysses from "./getBooksFromUlysses.js";
import getBooksFromCarteamea from "./getBooksFromCarteamea.js";
import getBooksFromBiblion from "./getBooksFromBiblion.js";
import getExchangeRate, { DEFAULT_RATE, getCachedExchangeRate } from "./getExchangeRate.js";
import dedupeBooks, { dedupeBooksFast } from "./dedupeBooks.js";
import enhancedImageUrl from "./enhancedImageUrl.js";
import decodeHtmlEntities from "./decodeHtmlEntities.js";

function normalize(product, store, rate) {
  const mdl = Number.parseFloat(
    String(product.price ?? "").replace(/[^\d.]/g, ""),
  );
  const inEur = rate && !Number.isNaN(mdl);
  const rawImage = product.mainImage?.url ?? product.images?.[0]?.url ?? "";
  const image = enhancedImageUrl(rawImage) || rawImage;
  return {
    title: decodeHtmlEntities(product.name ?? ""),
    price: inEur ? Math.round((mdl / rate) * 100) / 100 : mdl,
    currency: rate ? "EUR" : "MDL",
    url: product.url ?? "",
    image,
    store,
    author: decodeHtmlEntities(product.author || ""),
  };
}

const tokenize = (s) => (s || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

const EDITION_TOKENS = new Set([
  "в", "во", "из", "и", "на", "с", "со", "для", "у", "по",
  "одном", "двух", "трех", "трёх", "четырех", "четырёх", "пяти", "шести",
  "томах", "тома", "том", "т",
  "частях", "части", "часть", "ч",
  "книгах", "книге", "книга", "книги", "кн",
  "выпуск", "выпуске", "выпусках",
  "роман", "романы", "повесть", "повести", "рассказ", "рассказы", "пьеса", "пьесы",
  "комплект", "сборник", "сочинения", "избранное",
  "том1", "том2", "том3",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "1-2", "2-х", "3-х", "4-х", "1-й", "2-й", "3-й", "4-й",
  "первая", "вторая", "третья", "четвертая",
  "мягкая", "твердая", "твердый", "мягкий", "переплет", "обложка",
  "иллюстрациями", "иллюстрированное", "иллюстрированная", "иллюстр",
  "издание", "классика", "классики", "русская", "русские", "мировая", "мировые",
  "зарубежная", "детская", "детские", "школьная", "библиотека", "серия",
  "азбука", "эксклюзивная", "эксклюзив", "подарочное", "шедевры", "золотая", "золотые",
  "exclusive", "classics", "pocket", "book", "edition", "vol", "volume",
  "volum", "volume", "carte", "carti", "editie"
]);

function isCoreWorkMatch(title, query) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return false;
  const queryPhrase = queryTokens.join(" ");
  const titleTokens = tokenize(title);
  if (!titleTokens.length) return false;
  const titlePhrase = titleTokens.join(" ");

  // 1. Exact phrase match
  if (titlePhrase === queryPhrase) return true;

  // 2. Remove brackets: (...), [...], {...}
  const noBrackets = title.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/gu, " ").trim();
  const noBracketsTokens = tokenize(noBrackets);
  if (noBracketsTokens.join(" ") === queryPhrase) return true;

  // 3. Title starts with query and remaining tokens are all edition/series/volume words
  if (titlePhrase.startsWith(queryPhrase + " ")) {
    const rest = titleTokens.slice(queryTokens.length);
    if (rest.length > 0 && rest.every((t) => EDITION_TOKENS.has(t) || /^\d+[-–]?х?$/.test(t))) {
      return true;
    }
  }

  // 4. Check combinations after removing brackets
  if (
    noBracketsTokens.length > queryTokens.length &&
    noBracketsTokens.slice(0, queryTokens.length).join(" ") === queryPhrase
  ) {
    const rest = noBracketsTokens.slice(queryTokens.length);
    if (rest.every((t) => EDITION_TOKENS.has(t) || /^\d+[-–]?х?$/.test(t))) {
      return true;
    }
  }

  // 5. Split by common separators (colon, slash, dash, dot)
  const separators = [":", "/", " - ", " — ", ". "];
  for (const sep of separators) {
    if (title.includes(sep)) {
      const parts = title.split(sep);
      for (const part of parts) {
        const pClean = part.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/gu, " ").trim();
        const pTokens = tokenize(pClean);
        if (pTokens.join(" ") === queryPhrase) return true;
        const pPhrase = pTokens.join(" ");
        if (pPhrase.startsWith(queryPhrase + " ")) {
          const rest = pTokens.slice(queryTokens.length);
          if (rest.length > 0 && rest.every((t) => EDITION_TOKENS.has(t) || /^\d+[-–]?х?$/.test(t))) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function splitTitle(title) {
  const colon = title.indexOf(":");
  if (colon > 0) return [title.slice(0, colon), title.slice(colon + 1), true];
  const sentence = title.match(/^.*?\p{L}{3,}\./u);
  if (sentence) return [sentence[0], title.slice(sentence[0].length), true];
  return [title.split(/\s+/).slice(0, 3).join(" "), title, false];
}

function calculateRelevance(title, query, author = "") {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 1;
  const titleTokens = tokenize(title);
  if (titleTokens.length === 0) return 0;

  const queryPhrase = queryTokens.join(" ");
  const titlePhrase = titleTokens.join(" ");

  // Highest tier (100): Core work exact match ("Идиот", "Идиот (в двух томах)", "Идиот: роман", etc.)
  if (isCoreWorkMatch(title, query)) return 100;

  // Split title author / work checks (e.g. "Ф. М. Достоевский. Идиот (в 2 томах)")
  const [splitAuthor, work, hasAuthor] = splitTitle(title);
  if (hasAuthor && isCoreWorkMatch(work, query)) return 100;

  // Title starts with query phrase (partial match)
  if (titlePhrase.startsWith(queryPhrase + " ")) return 80;
  if ((" " + titlePhrase + " ").includes(" " + queryPhrase + " ")) return 60;

  // Author match
  if (author) {
    const authorTokens = tokenize(author);
    const authorPhrase = authorTokens.join(" ");
    if (authorPhrase === queryPhrase) return 70;
    if ((" " + authorPhrase + " ").includes(" " + queryPhrase + " ")) return 55;
    if (queryTokens.every((w) => authorTokens.includes(w))) return 50;
  }

  // Split title author / work checks fallback
  if (tokenize(work).join(" ") === queryPhrase) return 75;
  if (
    hasAuthor &&
    (" " + tokenize(work).join(" ") + " ").includes(" " + queryPhrase + " ")
  ) {
    return 55;
  }
  if (queryTokens.every((w) => splitAuthor.toLowerCase().includes(w))) {
    return 45;
  }

  // Token overlap ratio
  const titleSet = new Set(titleTokens);
  const matchedTokens = queryTokens.filter((w) => titleSet.has(w)).length;
  const tokenRatio = matchedTokens / queryTokens.length;

  if (tokenRatio === 1) return 40;
  if (tokenRatio > 0.5) return Math.round(20 * tokenRatio);
  if (tokenRatio > 0) return Math.round(10 * tokenRatio);
  return 0;
}

function rankAndSort(books, searchBook) {
  return books
    .map((b) => ({
      ...b,
      relevance: calculateRelevance(b.title, searchBook, b.author),
    }))
    .sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      return a.price - b.price;
    });
}

export default async function searchBooks(searchBook, { onProgress } = {}) {
  let activeRate = getCachedExchangeRate() || DEFAULT_RATE;
  const ratePromise = getExchangeRate()
    .then((r) => {
      if (r) activeRate = r;
      return r;
    })
    .catch(() => activeRate);

  const partialByStore = new Map();
  const fullCompletedStores = new Set();

  const emitProgress = () => {
    if (typeof onProgress !== "function") return;
    const current = [];
    for (const [store, rawList] of partialByStore.entries()) {
      for (const p of rawList) {
        const item = normalize(p, store, activeRate);
        if (
          item.title &&
          item.url &&
          Number.isFinite(item.price) &&
          item.price > 0 &&
          Boolean(item.image)
        ) {
          current.push(item);
        }
      }
    }
    if (current.length > 0) {
      onProgress(rankAndSort(dedupeBooksFast(current), searchBook));
    }
  };

  // Fire an ultra-fast Page-1 wave so the first batch of books renders within ~300-500ms,
  // while the full multi-page searches complete in parallel without dropping any data
  if (typeof onProgress === "function" && typeof window !== "undefined") {
    const encodedQ = encodeURIComponent(searchBook);
    const fastEndpoints = [
      ["librarius.md", `/api/search-librarius?q=${encodedQ.replace(/%20/g, "+")}&fast=1`],
      ["biblion.md", `/api/search-biblion?q=${encodedQ}&fast=1`],
      ["carteamea.md", `/api/search-carteamea?q=${encodedQ}&fast=1`],
      ["ulysses.md", `/api/search-ulysses?q=${encodedQ}&fast=1`],
    ];
    for (const [store, url] of fastEndpoints) {
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (
            !fullCompletedStores.has(store) &&
            Array.isArray(data?.products) &&
            data.products.length > 0
          ) {
            partialByStore.set(store, data.products);
            emitProgress();
          }
        })
        .catch(() => {});
    }
  }

  const wrapStore = (store, promise) =>
    promise
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        fullCompletedStores.add(store);
        partialByStore.set(store, arr);
        emitProgress();
        return arr;
      })
      .catch((err) => {
        console.warn(`${store} search failed:`, err.message);
        return [];
      });

  // Query all bookstores and the exchange rate concurrently in parallel
  const [
    librariusRaw,
    carturestiRaw,
    ulyssesRaw,
    carteameaRaw,
    biblionRaw,
    rate,
  ] = await Promise.all([
    wrapStore("librarius.md", getBooksFromLibrarius(searchBook)),
    wrapStore("carturesti.md", getBooksFromCarturesti(searchBook)),
    wrapStore("ulysses.md", getBooksFromUlysses(searchBook)),
    wrapStore("carteamea.md", getBooksFromCarteamea(searchBook)),
    wrapStore("biblion.md", getBooksFromBiblion(searchBook)),
    ratePromise,
  ]);

  const finalRate = rate || activeRate;

  const librariusBooks = (librariusRaw ?? []).map((p) =>
    normalize(p, "librarius.md", finalRate),
  );
  const carturestiBooks = (carturestiRaw ?? []).map((p) =>
    normalize(p, "carturesti.md", finalRate),
  );
  const ulyssesBooks = (ulyssesRaw ?? []).map((p) =>
    normalize(p, "ulysses.md", finalRate),
  );
  const carteameaBooks = (carteameaRaw ?? []).map((p) =>
    normalize(p, "carteamea.md", finalRate),
  );
  const biblionBooks = (biblionRaw ?? []).map((p) =>
    normalize(p, "biblion.md", finalRate),
  );

  const combined = [
    ...librariusBooks,
    ...carturestiBooks,
    ...ulyssesBooks,
    ...carteameaBooks,
    ...biblionBooks,
  ].filter(
    (b) =>
      b.title &&
      b.url &&
      Number.isFinite(b.price) &&
      b.price > 0 &&
      Boolean(b.image),
  );

  // Deduplicate: if an identical book is more expensive on another site, remove it from the other site,
  // and keep all copies/editions from the cheaper site
  const deduped = await dedupeBooks(combined, searchBook);

  return rankAndSort(deduped, searchBook);
}

export { calculateRelevance, isCoreWorkMatch };
