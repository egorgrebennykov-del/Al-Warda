const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";

const TABLE_URL = `${SUPABASE_URL}/rest/v1/announcements`;
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

/**
 * Normalizes an announcement row from Supabase.
 * Supports localized `content_ru` and `content_en` as well as legacy `content`.
 */
export function normalizeAnnouncement(row) {
  if (!row) return null;

  const ru = safeParse(row.content_ru);
  const en = safeParse(row.content_en);
  const legacy = safeParse(row.content);

  const type =
    ru.type === "large" || en.type === "large" || legacy.type === "large"
      ? "large"
      : "small";

  const order = Number(ru.order ?? en.order ?? legacy.order ?? 0);
  const active =
    (ru.active !== false) && (en.active !== false) && (legacy.active !== false);

  const text_ru = ru.text || legacy.text || "";
  const text_en = en.text || legacy.text || "";
  const imageUrl_ru = ru.imageUrl || legacy.imageUrl || "";
  const imageUrl_en = en.imageUrl || legacy.imageUrl || "";
  const linkUrl_ru = ru.linkUrl || legacy.linkUrl || "";
  const linkUrl_en = en.linkUrl || legacy.linkUrl || linkUrl_ru;

  return {
    id: row.id,
    created_at: row.created_at,
    from: row.from || row.created_at,
    until: row.until,
    userId: row.user_id,
    type,
    order,
    active,
    // Localized content objects
    ru: {
      type,
      text: text_ru,
      imageUrl: imageUrl_ru,
      linkUrl: linkUrl_ru,
    },
    en: {
      type,
      text: text_en,
      imageUrl: imageUrl_en,
      linkUrl: linkUrl_en,
    },
    // Distinct language field accessors
    text_ru,
    text_en,
    imageUrl_ru,
    imageUrl_en,
    linkUrl_ru,
    linkUrl_en,
    // Universal accessors with language fallback
    text: text_ru || text_en,
    imageUrl: imageUrl_ru || imageUrl_en,
    linkUrl: linkUrl_ru || linkUrl_en,
  };
}

/**
 * Fetch all announcements for the Privileged panel.
 */
export async function fetchAllAnnouncementsAdmin() {
  try {
    const res = await fetch(`${TABLE_URL}?select=*&order=created_at.desc`, { headers });
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

const ACTIVE_STORAGE_KEY = "kazbook_active_announcements_v1";
const ACTIVE_CACHE_TTL_MS = 2 * 60 * 1000;

const DEFAULT_ACTIVE_ANNOUNCEMENTS = [
  normalizeAnnouncement({
    id: "624b6192-89a5-4756-b0c2-cdf98118d318",
    created_at: "2026-10-25T10:39:59.929661+00:00",
    from: "2026-10-25T10:37:00+00:00",
    until: "2026-11-30T22:00:00+00:00",
    content_ru: {
      type: "small",
      text: "Пока Litera находится в разработке, реальные заказы недоступны. Используйте промокод TEST, чтобы получить скидку 100% на весь заказ.",
      imageUrl: "",
      linkUrl: "",
      order: 1,
      active: true,
    },
    content_en: {
      type: "small",
      text: "Litera is currently under development, and real orders are not yet available. Use promo code TEST to get 100% off your entire order.",
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
      const res = await fetch(`${TABLE_URL}?select=*&order=created_at.desc`, { headers });
      if (!res.ok) return cachedActiveAnnouncements || [];
      const list = await res.json();
      if (!Array.isArray(list)) return cachedActiveAnnouncements || [];

      const now = new Date();

      const normalized = list
        .map(normalizeAnnouncement)
        .filter((item) => {
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
      cachedActiveAnnouncements = sorted;
      activeCacheExpiry = Date.now() + ACTIVE_CACHE_TTL_MS;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(sorted));
        } catch {
          // ignore
        }
      }
      return sorted;
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
 * Create a new announcement with both Russian and English variants.
 * 'until' is mandatory!
 */
export async function createAnnouncement({
  type = "small", // "small" | "large"
  text_ru = "",
  text_en = "",
  imageUrl_ru = "",
  imageUrl_en = "",
  linkUrl_ru = "",
  linkUrl_en = "",
  order = 0,
  from = null,
  until,
  userId = null,
  text = "",
  imageUrl = "",
  linkUrl = "",
}) {
  if (!until) {
    throw new Error("Срок окончания показа объявления обязателен для заполнения");
  }

  const final_text_ru = (text_ru || text || "").trim();
  const final_text_en = (text_en || text || "").trim();
  const final_image_ru = (imageUrl_ru || imageUrl || "").trim();
  const final_image_en = (imageUrl_en || imageUrl || "").trim();
  const final_link_ru = (linkUrl_ru || linkUrl || "").trim();
  const final_link_en = (linkUrl_en || final_link_ru).trim();

  if (type === "small") {
    if (!final_text_ru) {
      throw new Error("Для небольшого объявления текст на русском языке обязателен");
    }
    if (!final_text_en) {
      throw new Error("Для небольшого объявления текст на английском языке обязателен");
    }
  }

  if (type === "large") {
    if (!final_image_ru) {
      throw new Error("Для большого объявления ссылка на фото (RU) обязательна");
    }
    if (!final_image_en) {
      throw new Error("Для большого объявления ссылка на фото (EN) обязательна");
    }
  }

  const fromDate = from ? new Date(from).toISOString() : new Date().toISOString();
  const untilDate = new Date(until).toISOString();

  const content_ru = {
    type: type === "large" ? "large" : "small",
    text: final_text_ru,
    imageUrl: final_image_ru,
    linkUrl: final_link_ru,
    order: Number(order) || 0,
    active: true,
  };

  const content_en = {
    type: type === "large" ? "large" : "small",
    text: final_text_en,
    imageUrl: final_image_en,
    linkUrl: final_link_en,
    order: Number(order) || 0,
    active: true,
  };

  const payload = {
    user_id: userId || null,
    from: fromDate,
    until: untilDate,
    content_ru,
    content_en,
  };

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
 * Update an existing announcement with Russian and English variants.
 */
export async function updateAnnouncement(id, {
  type = "small",
  text_ru = "",
  text_en = "",
  imageUrl_ru = "",
  imageUrl_en = "",
  linkUrl_ru = "",
  linkUrl_en = "",
  order = 0,
  from,
  until,
  active = true,
  text = "",
  imageUrl = "",
  linkUrl = "",
}) {
  if (!id) throw new Error("ID объявления обязателен");
  if (!until) {
    throw new Error("Срок окончания показа объявления обязателен для заполнения");
  }

  const final_text_ru = (text_ru || text || "").trim();
  const final_text_en = (text_en || text || "").trim();
  const final_image_ru = (imageUrl_ru || imageUrl || "").trim();
  const final_image_en = (imageUrl_en || imageUrl || "").trim();
  const final_link_ru = (linkUrl_ru || linkUrl || "").trim();
  const final_link_en = (linkUrl_en || final_link_ru).trim();

  if (type === "small") {
    if (!final_text_ru) {
      throw new Error("Для небольшого объявления текст на русском языке обязателен");
    }
    if (!final_text_en) {
      throw new Error("Для небольшого объявления текст на английском языке обязателен");
    }
  }

  if (type === "large") {
    if (!final_image_ru) {
      throw new Error("Для большого объявления ссылка на фото (RU) обязательна");
    }
    if (!final_image_en) {
      throw new Error("Для большого объявления ссылка на фото (EN) обязательна");
    }
  }

  const fromDate = from ? new Date(from).toISOString() : new Date().toISOString();
  const untilDate = new Date(until).toISOString();

  const content_ru = {
    type: type === "large" ? "large" : "small",
    text: final_text_ru,
    imageUrl: final_image_ru,
    linkUrl: final_link_ru,
    order: Number(order) || 0,
    active: active !== false,
  };

  const content_en = {
    type: type === "large" ? "large" : "small",
    text: final_text_en,
    imageUrl: final_image_en,
    linkUrl: final_link_en,
    order: Number(order) || 0,
    active: active !== false,
  };

  const payload = {
    from: fromDate,
    until: untilDate,
    content_ru,
    content_en,
  };

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
 * Reorder a list of announcements by index.
 */
export async function reorderAnnouncements(orderedList) {
  if (!Array.isArray(orderedList)) return;

  const promises = orderedList.map(async (item, idx) => {
    const newOrder = idx + 1;
    const content_ru = {
      type: item.type,
      text: item.text_ru || item.ru?.text || item.text || "",
      imageUrl: item.imageUrl_ru || item.ru?.imageUrl || item.imageUrl || "",
      linkUrl: item.linkUrl_ru || item.ru?.linkUrl || item.linkUrl || "",
      order: newOrder,
      active: item.active !== false,
    };
    const content_en = {
      type: item.type,
      text: item.text_en || item.en?.text || item.text || "",
      imageUrl: item.imageUrl_en || item.en?.imageUrl || item.imageUrl || "",
      linkUrl: item.linkUrl_en || item.en?.linkUrl || item.linkUrl || "",
      order: newOrder,
      active: item.active !== false,
    };

    return fetch(`${TABLE_URL}?id=eq.${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ content_ru, content_en }),
    });
  });

  await Promise.all(promises);
  invalidateAnnouncementsCache();
}
