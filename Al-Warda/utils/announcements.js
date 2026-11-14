import { restUrl } from "./restBase.js";

const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";
const SUPABASE_KEY =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";

const TABLE_URL = restUrl("announcements");
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

function safeParse(val) {
  if (!val) return {};
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return { text: val };
    }
  }
  return {};
}

// Site languages, in display order. All announcements are translated into every one.
export const ANNOUNCEMENT_LANGS = ["ru", "en", "hu", "bg", "el", "ro"];

/**
 * Normalizes an announcement row from Supabase.
 * Supports localized `content_<lang>` for every site language as well as legacy `content`.
 */
export function normalizeAnnouncement(row) {
  if (!row) return null;

  const parsed = {};
  for (const lang of ANNOUNCEMENT_LANGS) {
    parsed[lang] = safeParse(row[`content_${lang}`]);
  }
  const legacy = safeParse(row.content);

  const type =
    parsed.ru.type === "large" ||
    parsed.en.type === "large" ||
    parsed.hu.type === "large" ||
    parsed.bg.type === "large" ||
    parsed.el.type === "large" ||
    parsed.ro.type === "large" ||
    legacy.type === "large"
      ? "large"
      : "small";

  const order = Number(
    parsed.ru.order ??
      parsed.en.order ??
      parsed.hu.order ??
      parsed.bg.order ??
      parsed.el.order ??
      parsed.ro.order ??
      legacy.order ??
      0,
  );
  const active =
    parsed.ru.active !== false &&
    parsed.en.active !== false &&
    parsed.hu.active !== false &&
    parsed.bg.active !== false &&
    parsed.el.active !== false &&
    parsed.ro.active !== false &&
    legacy.active !== false;

  const langs = {};
  for (const lang of ANNOUNCEMENT_LANGS) {
    const src = parsed[lang] || legacy;
    langs[lang] = {
      type,
      text: src.text || legacy.text || "",
      imageUrl: src.imageUrl || legacy.imageUrl || "",
      linkUrl: src.linkUrl || legacy.linkUrl || "",
    };
  }

  // Distinct language field accessors (text_/imageUrl_/linkUrl_<lang>)
  const fields = {};
  for (const lang of ANNOUNCEMENT_LANGS) {
    fields[`text_${lang}`] = langs[lang].text;
    fields[`imageUrl_${lang}`] = langs[lang].imageUrl;
    fields[`linkUrl_${lang}`] = langs[lang].linkUrl;
  }

  // Universal accessors with language fallback (default ru -> en)
  const text = langs.ru.text || langs.en.text || "";
  const imageUrl = langs.ru.imageUrl || langs.en.imageUrl || "";
  const linkUrl = langs.ru.linkUrl || langs.en.linkUrl || "";

  return {
    id: row.id,
    created_at: row.created_at,
    starts_at: row.starts_at || row.from || row.created_at,
    from: row.starts_at || row.from || row.created_at,
    until: row.until,
    userId: row.user_id,
    type,
    order,
    active,
    // Localized content objects for every site language
    ru: langs.ru,
    en: langs.en,
    hu: langs.hu,
    bg: langs.bg,
    el: langs.el,
    ro: langs.ro,
    ...fields,
    // Universal accessors with language fallback
    text,
    imageUrl,
    linkUrl,
  };
}

/**
 * Fetch all announcements for the Privileged panel.
 */
export async function fetchAllAnnouncementsAdmin() {
  try {
    const res = await fetch(
      `${TABLE_URL}?select=id,created_at,starts_at,until,user_id,content,content_ru,content_en,content_hu,content_bg,content_el,content_ro&order=created_at.desc`,
      { headers },
    );
    if (!res.ok) return [];
    const list = await res.json();
    if (!Array.isArray(list)) return [];

    const normalized = list.map(normalizeAnnouncement).filter(Boolean);
    // Sort by order ascending, then created_at desc
    return normalized.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  } catch (err) {
    console.warn("Error fetching admin announcements:", err);
    return [];
  }
}

const ACTIVE_STORAGE_KEY = "alwarda_active_announcements_v1";
const ACTIVE_CACHE_TTL_MS = 2 * 60 * 1000;

const DEFAULT_ACTIVE_ANNOUNCEMENTS = [
  normalizeAnnouncement({
    id: "624b6192-89a5-4756-b0c2-cdf98118d318",
    created_at: "2026-10-25T10:39:59.929661+00:00",
    from: "2026-10-25T10:37:00+00:00",
    until: "2026-11-30T22:00:00+00:00",
    content_ru: {
      type: "small",
      text: "Пока Al-Warda находится в разработке, реальные заказы недоступны. Используйте промокод TEST, чтобы получить скидку 100% на весь заказ.",
      imageUrl: "",
      linkUrl: "",
      order: 1,
      active: true,
    },
    content_en: {
      type: "small",
      text: "Al-Warda is currently under development, and real orders are not yet available. Use promo code TEST to get 100% off your entire order.",
      imageUrl: "",
      linkUrl: "",
      order: 1,
      active: true,
    },
    content_hu: {
      type: "small",
      text: "Az Al-Warda jelenleg fejlesztés alatt áll, a valórendelések még nem érhetők el. Használja a TEST promókódot, hogy a teljes rendszerre 100% kedvezményt kapjon.",
      imageUrl: "",
      linkUrl: "",
      order: 1,
      active: true,
    },
    content_bg: {
      type: "small",
      text: "Al-Warda все още е в разработка и реалните поръчки все още не са налични. Използвайте промокод TEST, за да получите 100% отстъпка по цялата поръчка.",
      imageUrl: "",
      linkUrl: "",
      order: 1,
      active: true,
    },
    content_el: {
      type: "small",
      text: "Το Al-Warda βρίσκεται ακόμα υπό ανάπτυξη και οι πραγματικές παραγγελίες δεν είναι ακόμα διαθέσιμες. Χρησιμοποιήστε τον κωδικό TEST για να λάβετε έκπτωση 100% σε ολόκληρη την παραγγελία σας.",
      imageUrl: "",
      linkUrl: "",
      order: 1,
      active: true,
    },
    content_ro: {
      type: "small",
      text: "Al-Warda este în curs de dezvoltare, iar comenzile reale nu sunt încă disponibile. Folosiți codul PROMO TEST pentru a primi 100% reducere la întreaga comandă.",
      imageUrl: "",
      linkUrl: "",
      order: 1,
      active: true,
    },
  }),
];

let cachedActiveAnnouncements = null;
let activeCacheExpiry = 0;
let activeInflight = null;

export function getCachedActiveAnnouncements() {
  if (cachedActiveAnnouncements !== null) return cachedActiveAnnouncements;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(ACTIVE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          cachedActiveAnnouncements = parsed;
          return cachedActiveAnnouncements;
        }
      }
    } catch {
      // ignore
    }
  }
  return DEFAULT_ACTIVE_ANNOUNCEMENTS;
}

export function invalidateAnnouncementsCache() {
  cachedActiveAnnouncements = null;
  activeCacheExpiry = 0;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(ACTIVE_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/**
 * Fetch currently active announcements for the frontend (Home page).
 * Filters strictly by dates: from <= now && until >= now.
 */
export async function fetchActiveAnnouncements() {
  if (cachedActiveAnnouncements !== null && Date.now() < activeCacheExpiry) {
    return cachedActiveAnnouncements;
  }
  if (activeInflight) return activeInflight;

  activeInflight = (async () => {
    try {
      const res = await fetch(
        `${TABLE_URL}?select=id,created_at,starts_at,until,user_id,content,content_ru,content_en,content_hu,content_bg,content_el,content_ro&order=created_at.desc`,
        { headers },
      );
      if (!res.ok) return cachedActiveAnnouncements || [];
      const list = await res.json();
      if (!Array.isArray(list)) return cachedActiveAnnouncements || [];

      const now = new Date();

      const normalized = list.map(normalizeAnnouncement).filter((item) => {
        if (!item || !item.active) return false;
        // From date check
        if (item.from) {
          const fromDate = new Date(item.from);
          if (fromDate > now) return false;
        }
        // Until date check (strictly required by requirements)
        if (item.until) {
          const untilDate = new Date(item.until);
          if (untilDate < now) return false;
        } else {
          return false; // Until is mandatory
        }
        return true;
      });

      // Sort by order ascending
      const sorted = normalized.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return new Date(b.created_at) - new Date(a.created_at);
      });
      const finalResult =
        sorted.length > 0 ? sorted : DEFAULT_ACTIVE_ANNOUNCEMENTS;
      cachedActiveAnnouncements = finalResult;
      activeCacheExpiry = Date.now() + ACTIVE_CACHE_TTL_MS;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(finalResult));
        } catch {
          // ignore
        }
      }
      return finalResult;
    } catch (err) {
      console.warn("Error fetching active announcements:", err);
      return cachedActiveAnnouncements || [];
    }
  })().finally(() => {
    activeInflight = null;
  });

  return activeInflight;
}

/**
 * Translate announcement text from any input language (e.g. Ukrainian, Russian, English, Romanian)
 * into every site language: ru, en, hu, bg, el, ro.
 */
export async function translateAnnouncementWithAI(rawText) {
  const clean = String(rawText || "").trim();
  if (!clean) {
    return Object.fromEntries(ANNOUNCEMENT_LANGS.map((l) => [l, ""]));
  }

  // 1. Try backend AI translation endpoint (/api/translate-announcement)
  try {
    const res = await fetch("/api/translate-announcement", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ text: clean }),
    });
    if (res.ok) {
      const data = await res.json();
      const langs = {};
      let ok = true;
      for (const lang of ANNOUNCEMENT_LANGS) {
        const val = String(data?.[`text_${lang}`] || data?.[lang] || "").trim();
        if (!val) ok = false;
        langs[lang] = val;
      }
      if (ok) return langs;
    }
  } catch {
    // Fallback to direct client-side translation below
  }

  // 2. Try direct Gemini API if VITE_GEMINI_API_KEY is available
  const geminiKey =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const langsList = ANNOUNCEMENT_LANGS.map((l) => `"${l}": "..."`).join(
        ", ",
      );
      const prompt = `Translate the following store announcement (which may be written in Ukrainian, Russian, English, or any other language) into ALL of the following languages for the luxury Arabian perfume boutique "Al-Warda": Russian (ru), English (en), Hungarian (hu), Bulgarian (bg), Greek (el), Romanian (ro). Keep all promo codes, numbers, percentages, dates, and emojis intact. Return ONLY valid JSON: {${langsList}}\n\nInput announcement:\n${clean}`;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJson) {
          const parsed = JSON.parse(
            rawJson.replace(/^[\s\S]*?\{/, "{").replace(/\}[^\}]*?$/, "}"),
          );
          const langs = {};
          let ok = true;
          for (const lang of ANNOUNCEMENT_LANGS) {
            const val = String(parsed?.[lang] || "").trim();
            if (!val) ok = false;
            langs[lang] = val;
          }
          if (ok) return langs;
        }
      }
    } catch {
      // Fallback to Google Translate neural endpoint below
    }
  }

  // 3. Direct Google neural translation fallback (supports many languages without API key)
  const translateSingle = async (targetLang) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(clean)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (Array.isArray(d?.[0])) {
      return d[0]
        .map((segment) => segment?.[0] || "")
        .join("")
        .trim();
    }
    return clean;
  };

  try {
    const langs = {};
    await Promise.all(
      ANNOUNCEMENT_LANGS.map(async (lang) => {
        langs[lang] = (await translateSingle(lang)) || clean;
      }),
    );
    return langs;
  } catch {
    return Object.fromEntries(ANNOUNCEMENT_LANGS.map((l) => [l, clean]));
  }
}

/**
 * Create a new announcement. If a single `text` (in any language) is provided,
 * AI automatically translates it into every site language (ru, en, hu, bg, el, ro).
 * 'until' is mandatory!
 */
export async function createAnnouncement({
  type = "small", // "small" | "large"
  text = "",
  order = 0,
  from = null,
  until,
  userId = null,
  imageUrl = "",
  linkUrl = "",
  autoTranslate = true,
  // Per-language overrides (optional)
  text_ru = "",
  text_en = "",
  text_hu = "",
  text_bg = "",
  text_el = "",
  text_ro = "",
  imageUrl_ru = "",
  imageUrl_en = "",
  imageUrl_hu = "",
  imageUrl_bg = "",
  imageUrl_el = "",
  imageUrl_ro = "",
  linkUrl_ru = "",
  linkUrl_en = "",
  linkUrl_hu = "",
  linkUrl_bg = "",
  linkUrl_el = "",
  linkUrl_ro = "",
}) {
  if (!until) {
    throw new Error(
      "Срок окончания показа объявления обязателен для заполнения",
    );
  }

  const explicitLangs = {
    ru: text_ru,
    en: text_en,
    hu: text_hu,
    bg: text_bg,
    el: text_el,
    ro: text_ro,
  };
  const sourceText = (text || Object.values(explicitLangs).join(" ")).trim();

  if (
    type === "small" &&
    sourceText &&
    (autoTranslate || ANNOUNCEMENT_LANGS.some((l) => !explicitLangs[l]))
  ) {
    const translated = await translateAnnouncementWithAI(sourceText);
    for (const lang of ANNOUNCEMENT_LANGS) {
      if (!explicitLangs[lang]) {
        explicitLangs[lang] = translated[lang] || sourceText;
      }
    }
  }

  const explicitImages = {
    ru: imageUrl_ru,
    en: imageUrl_en,
    hu: imageUrl_hu,
    bg: imageUrl_bg,
    el: imageUrl_el,
    ro: imageUrl_ro,
  };
  for (const lang of ANNOUNCEMENT_LANGS) {
    if (!explicitImages[lang]) {
      explicitImages[lang] = imageUrl || "";
    }
  }

  const explicitLinks = {
    ru: linkUrl_ru,
    en: linkUrl_en,
    hu: linkUrl_hu,
    bg: linkUrl_bg,
    el: linkUrl_el,
    ro: linkUrl_ro,
  };
  for (const lang of ANNOUNCEMENT_LANGS) {
    if (!explicitLinks[lang]) {
      explicitLinks[lang] = linkUrl || "";
    }
  }

  if (type === "small") {
    if (ANNOUNCEMENT_LANGS.some((l) => !explicitLangs[l])) {
      throw new Error("Для небольшого объявления введите текст на любом языке");
    }
  }

  if (type === "large") {
    if (!explicitImages.ru) {
      throw new Error("Для большого объявления ссылка на фото обязательна");
    }
  }

  const fromDate = from
    ? new Date(from).toISOString()
    : new Date().toISOString();
  const untilDate = new Date(until).toISOString();

  const payload = {
    user_id: userId || null,
    starts_at: fromDate,
    until: untilDate,
  };
  for (const lang of ANNOUNCEMENT_LANGS) {
    payload[`content_${lang}`] = {
      type: type === "large" ? "large" : "small",
      text: explicitLangs[lang],
      imageUrl: explicitImages[lang],
      linkUrl: explicitLinks[lang],
      order: Number(order) || 0,
      active: true,
    };
  }

  const res = await fetch(TABLE_URL, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Не удалось создать объявление");
  }

  const created = await res.json();
  invalidateAnnouncementsCache();
  return normalizeAnnouncement(created?.[0]);
}

/**
 * Update an existing announcement. Automatically translates any single-input text into
 * every site language (ru, en, hu, bg, el, ro).
 */
export async function updateAnnouncement(
  id,
  {
    type = "small",
    text = "",
    order = 0,
    from,
    until,
    active = true,
    imageUrl = "",
    linkUrl = "",
    autoTranslate = true,
    // Per-language overrides (optional)
    text_ru = "",
    text_en = "",
    text_hu = "",
    text_bg = "",
    text_el = "",
    text_ro = "",
    imageUrl_ru = "",
    imageUrl_en = "",
    imageUrl_hu = "",
    imageUrl_bg = "",
    imageUrl_el = "",
    imageUrl_ro = "",
    linkUrl_ru = "",
    linkUrl_en = "",
    linkUrl_hu = "",
    linkUrl_bg = "",
    linkUrl_el = "",
    linkUrl_ro = "",
  },
) {
  if (!id) throw new Error("ID объявления обязателен");
  if (!until) {
    throw new Error(
      "Срок окончания показа объявления обязателен для заполнения",
    );
  }

  const explicitLangs = {
    ru: text_ru,
    en: text_en,
    hu: text_hu,
    bg: text_bg,
    el: text_el,
    ro: text_ro,
  };
  const sourceText = (text || Object.values(explicitLangs).join(" ")).trim();

  if (
    type === "small" &&
    sourceText &&
    (autoTranslate || ANNOUNCEMENT_LANGS.some((l) => !explicitLangs[l]))
  ) {
    const translated = await translateAnnouncementWithAI(sourceText);
    for (const lang of ANNOUNCEMENT_LANGS) {
      if (!explicitLangs[lang]) {
        explicitLangs[lang] = translated[lang] || sourceText;
      }
    }
  }

  const explicitImages = {
    ru: imageUrl_ru,
    en: imageUrl_en,
    hu: imageUrl_hu,
    bg: imageUrl_bg,
    el: imageUrl_el,
    ro: imageUrl_ro,
  };
  for (const lang of ANNOUNCEMENT_LANGS) {
    if (!explicitImages[lang]) {
      explicitImages[lang] = imageUrl || "";
    }
  }

  const explicitLinks = {
    ru: linkUrl_ru,
    en: linkUrl_en,
    hu: linkUrl_hu,
    bg: linkUrl_bg,
    el: linkUrl_el,
    ro: linkUrl_ro,
  };
  for (const lang of ANNOUNCEMENT_LANGS) {
    if (!explicitLinks[lang]) {
      explicitLinks[lang] = linkUrl || "";
    }
  }

  if (type === "small") {
    if (ANNOUNCEMENT_LANGS.some((l) => !explicitLangs[l])) {
      throw new Error("Для небольшого объявления введите текст на любом языке");
    }
  }

  if (type === "large") {
    if (!explicitImages.ru) {
      throw new Error("Для большого объявления ссылка на фото обязательна");
    }
  }

  const fromDate = from
    ? new Date(from).toISOString()
    : new Date().toISOString();
  const untilDate = new Date(until).toISOString();

  const payload = {
    starts_at: fromDate,
    until: untilDate,
  };
  for (const lang of ANNOUNCEMENT_LANGS) {
    payload[`content_${lang}`] = {
      type: type === "large" ? "large" : "small",
      text: explicitLangs[lang],
      imageUrl: explicitImages[lang],
      linkUrl: explicitLinks[lang],
      order: Number(order) || 0,
      active: active !== false,
    };
  }

  const res = await fetch(`${TABLE_URL}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Не удалось обновить объявление");
  }

  const updated = await res.json();
  invalidateAnnouncementsCache();
  return normalizeAnnouncement(updated?.[0]);
}

/**
 * Delete an announcement.
 */
export async function deleteAnnouncement(id) {
  if (!id) return;
  const res = await fetch(`${TABLE_URL}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Не удалось удалить объявление");
  }
  invalidateAnnouncementsCache();
}

/**
 * Reorder a list of announcements by index. Preserves every localized variant.
 */
export async function reorderAnnouncements(orderedList) {
  if (!Array.isArray(orderedList)) return;

  const promises = orderedList.map(async (item, idx) => {
    const newOrder = idx + 1;
    const payload = { order: newOrder };
    for (const lang of ANNOUNCEMENT_LANGS) {
      payload[`content_${lang}`] = {
        type: item.type,
        text: item[`text_${lang}`] || item[lang]?.text || item.text || "",
        imageUrl:
          item[`imageUrl_${lang}`] ||
          item[lang]?.imageUrl ||
          item.imageUrl ||
          "",
        linkUrl:
          item[`linkUrl_${lang}`] || item[lang]?.linkUrl || item.linkUrl || "",
        order: newOrder,
        active: item.active !== false,
      };
    }

    return fetch(`${TABLE_URL}?id=eq.${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
  });

  await Promise.all(promises);
  invalidateAnnouncementsCache();
}
