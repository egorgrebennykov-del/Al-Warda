const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";
const KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";
const TABLE_URL = `${SUPABASE_URL}/rest/v1/books_on_home_page`;

const STORAGE_KEY = "kazbook_homepage_books_v1";
const CACHE_TTL_MS = 5 * 60 * 1000;

const DEFAULT_HOMEPAGE_BOOKS = [
  {
    title: "Загадочное происшествие в Стайлзе",
    url: "https://librarius.md/ru/book/zagadochnoe-proisshestvie-v-staylze-623066",
    image: "/assets/img/home/home-1.webp",
    price: 115,
    currency: "MDL",
    store: "librarius.md",
    publisher: "Эксмо",
  },
  {
    title: "Идиот",
    url: "https://librarius.md/ru/book/idiot-680616",
    image: "/assets/img/home/home-2.webp",
    price: 95,
    currency: "MDL",
    store: "librarius.md",
    publisher: "АСТ",
  },
  {
    title: "Миссия выполнима. Технология счастливой жизни",
    url: "https://librarius.md/ru/book/missiya-vypolnima-tehnologiya-schastlivoy-zhizni-720759",
    image: "/assets/img/home/home-3.webp",
    price: 290,
    currency: "MDL",
    store: "librarius.md",
    publisher: "Альпина Паблишер",
  },
  {
    title: "Искусство любить",
    url: "https://librarius.md/ru/book/iskusstvo-lyubiti-372609",
    image: "/assets/img/home/home-4.webp",
    price: 110,
    currency: "MDL",
    store: "librarius.md",
    publisher: "АСТ",
  },
  {
    title: "Смерть на Ниле",
    url: "https://librarius.md/ru/book/smerti-na-nile-602898",
    image: "/assets/img/home/home-5.webp",
    price: 125,
    currency: "MDL",
    store: "librarius.md",
    publisher: "Эксмо",
  },
];

let cachedBooks = null;
let cacheExpiry = 0;
let inflight = null;

function readStoredBooks() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function getCachedHomepageBooks() {
  if (cachedBooks !== null) return cachedBooks;
  const stored = readStoredBooks();
  if (stored) {
    cachedBooks = stored;
    return cachedBooks;
  }
  return DEFAULT_HOMEPAGE_BOOKS;
}

export default async function getHomepageBooks() {
  if (cachedBooks !== null && Date.now() < cacheExpiry) {
    return cachedBooks;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const response = await fetch(`${TABLE_URL}?select=books&limit=1`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.message ?? "Could not load featured books");
    }

    const rows = await response.json();
    const books = rows[0]?.books;
    const result = Array.isArray(books) ? books : [];
    cachedBooks = result;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    if (typeof window !== "undefined" && result.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      } catch {
        // ignore storage quota errors
      }
    }
    return result;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
