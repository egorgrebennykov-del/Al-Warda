import { getCookieUser } from "./auth.js";
import { getPerfumeUrl, createSampleCartItem } from "./perfumes.js";
import { restUrl } from "./restBase.js";

const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";
const TABLE_URL = restUrl("cart");
const KEY =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

const GUEST_CART_KEY = "alwarda_guest_cart";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id) {
  return typeof id === "string" && UUID_REGEX.test(id.trim());
}

function getGuestCart() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGuestCart(items) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
    window.dispatchEvent(
      new CustomEvent("alwarda-cart-updated", { detail: { items } }),
    );
    window.dispatchEvent(new Event("cart-updated"));
  } catch {
    // ignore
  }
}

function notifyCartUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("alwarda-cart-updated"));
    window.dispatchEvent(new Event("cart-updated"));
  }
}

let isMergingGuestCart = false;
async function syncGuestCartToRemote(userId) {
  if (isMergingGuestCart || !isValidUuid(userId)) return;
  const guestItems = getGuestCart();
  if (!Array.isArray(guestItems) || guestItems.length === 0) return;

  isMergingGuestCart = true;
  try {
    for (const item of guestItems) {
      await addToCart(item, userId, item.quantity || 1);
    }
    saveGuestCart([]);
  } catch (err) {
    console.warn("Could not sync guest cart to remote:", err);
  } finally {
    isMergingGuestCart = false;
  }
}

export async function getCart(userIdInput) {
  const cookieUserId = getCookieUser()?.id;
  const candidateId = userIdInput !== undefined ? userIdInput : cookieUserId;
  const userId = isValidUuid(candidateId) ? candidateId : null;

  if (!userId) {
    return getGuestCart();
  }

  // Attempt to sync any guest cart items if user is logged in
  await syncGuestCartToRemote(userId);

  try {
    const params = new URLSearchParams({
      select: "id,link,price,user_id,image,title,quantity,shop,created_at",
      user_id: `eq.${userId}`,
      order: "id.desc",
    });
    const res = await fetch(`${TABLE_URL}?${params}`, { headers });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows)) {
        return rows.map((row) => ({
          ...row,
          perfume_id: row.link
            ? String(row.link).replace(/^\/book\//, "")
            : row.title || row.id,
        }));
      }
    }
  } catch (e) {
    console.warn("Could not fetch remote cart, falling back to local:", e);
  }
  return getGuestCart();
}

export async function getCartItemCount(userIdInput) {
  const items = await getCart(userIdInput);
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
}

/**
 * Add product to cart. Robust signature supports:
 * - addToCart(perfume)
 * - addToCart(perfume, quantity)
 * - addToCart(perfume, userId, quantity)
 * - addToCart(perfume, undefined, quantity)
 *
 * Automatically normalizes parameters and falls back to local storage if network/db fails.
 */
export async function addToCart(perfume, arg2, arg3) {
  if (!perfume) return null;

  let userId = null;
  let quantityToAdd = 1;

  if (typeof arg2 === "number") {
    // Called as addToCart(perfume, quantity, userId?)
    quantityToAdd = Math.max(1, Math.floor(arg2) || 1);
    userId = isValidUuid(arg3)
      ? arg3
      : isValidUuid(getCookieUser()?.id)
        ? getCookieUser().id
        : null;
  } else if (typeof arg2 === "string") {
    if (isValidUuid(arg2)) {
      // Called as addToCart(perfume, userId, quantity?)
      userId = arg2;
      quantityToAdd = Math.max(1, Number(arg3) || 1);
    } else if (!isNaN(Number(arg2)) && Number(arg2) > 0) {
      // String numeric quantity e.g. "1"
      quantityToAdd = Math.max(1, Math.floor(Number(arg2)) || 1);
      userId = isValidUuid(arg3)
        ? arg3
        : isValidUuid(getCookieUser()?.id)
          ? getCookieUser().id
          : null;
    } else {
      userId = isValidUuid(getCookieUser()?.id) ? getCookieUser().id : null;
      quantityToAdd = Math.max(1, Number(arg3) || 1);
    }
  } else {
    // arg2 is undefined / null
    userId = isValidUuid(getCookieUser()?.id) ? getCookieUser().id : null;
    quantityToAdd = Math.max(1, Number(arg3) || 1);
  }

  // If perfume object itself has a quantity and no explicit quantity was provided > 1
  if (
    quantityToAdd === 1 &&
    typeof perfume.quantity === "number" &&
    perfume.quantity > 0
  ) {
    quantityToAdd = Math.max(1, Math.floor(perfume.quantity));
  }

  const qty = quantityToAdd;
  const price = Number(perfume.price) || 45;
  const link = perfume.url || perfume.link || getPerfumeUrl(perfume);
  const title = perfume.name || perfume.title || "Al-Warda Perfume";
  const image =
    perfume.image ||
    perfume.fullCardImage ||
    "/assets/img/perfumes/hero-perfume.png";
  const perfumeId = String(perfume.id || perfume.slug || link || title);
  const isDropship = Boolean(perfume.isDropship);

  // Guest Cart (localStorage)
  if (!userId) {
    const items = getGuestCart();
    const existingIndex = items.findIndex(
      (it) =>
        (it.perfume_id && it.perfume_id === perfumeId) ||
        (it.link && it.link === link) ||
        (it.title && it.title === title),
    );
    let targetItem;
    if (existingIndex > -1) {
      items[existingIndex].quantity =
        (Number(items[existingIndex].quantity) || 1) + qty;
      targetItem = items[existingIndex];
    } else {
      targetItem = {
        id: `guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        perfume_id: perfumeId,
        title,
        price,
        image,
        link,
        quantity: qty,
        isDropship,
      };
      items.push(targetItem);
    }
    saveGuestCart(items);
    return targetItem;
  }

  // Remote Cart (Supabase)
  try {
    const checkParams = new URLSearchParams({
      select: "id,quantity,link,title,price,image",
      user_id: `eq.${userId}`,
      link: `eq.${link}`,
      limit: "1",
    });
    const checkRes = await fetch(`${TABLE_URL}?${checkParams}`, { headers });
    const existing = checkRes.ok ? await checkRes.json() : null;

    let targetItem;
    if (existing && existing.length > 0) {
      const item = existing[0];
      const newQty = (Number(item.quantity) || 1) + qty;
      const patchRes = await fetch(
        `${TABLE_URL}?id=eq.${item.id}&user_id=eq.${userId}`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify({ quantity: newQty }),
        },
      );
      if (!patchRes.ok)
        throw new Error(`Cart update failed: ${patchRes.status}`);
      const updatedRows = await patchRes.json().catch(() => null);
      targetItem =
        updatedRows && updatedRows[0]
          ? updatedRows[0]
          : { ...item, quantity: newQty };
    } else {
      const postRes = await fetch(TABLE_URL, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: userId,
          title,
          price,
          image,
          link,
          quantity: qty,
        }),
      });
      if (!postRes.ok) throw new Error(`Cart insert failed: ${postRes.status}`);
      const insertedRows = await postRes.json().catch(() => null);
      targetItem =
        insertedRows && insertedRows[0]
          ? insertedRows[0]
          : {
              user_id: userId,
              title,
              price,
              image,
              link,
              quantity: qty,
            };
    }

    targetItem.perfume_id = perfumeId;
    notifyCartUpdate();
    return targetItem;
  } catch (err) {
    console.warn(
      "Could not write to remote cart, saving to local guest cart fallback:",
      err,
    );
    const items = getGuestCart();
    const existingIndex = items.findIndex(
      (it) =>
        (it.perfume_id && it.perfume_id === perfumeId) ||
        (it.link && it.link === link) ||
        (it.title && it.title === title),
    );
    let targetItem;
    if (existingIndex > -1) {
      items[existingIndex].quantity =
        (Number(items[existingIndex].quantity) || 1) + qty;
      targetItem = items[existingIndex];
    } else {
      targetItem = {
        id: `fallback_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        perfume_id: perfumeId,
        title,
        price,
        image,
        link,
        quantity: qty,
        isDropship,
      };
      items.push(targetItem);
    }
    saveGuestCart(items);
    return targetItem;
  }
}

export async function updateQuantity(itemId, quantity, userIdInput) {
  const newQty = Math.max(1, Number(quantity) || 1);
  const cookieUserId = getCookieUser()?.id;
  const candidateId = userIdInput !== undefined ? userIdInput : cookieUserId;
  const userId = isValidUuid(candidateId) ? candidateId : null;

  if (
    !userId ||
    String(itemId).startsWith("guest_") ||
    String(itemId).startsWith("fallback_")
  ) {
    const items = getGuestCart();
    const item = items.find((i) => String(i.id) === String(itemId));
    if (item) {
      item.quantity = newQty;
      saveGuestCart(items);
    }
    return;
  }

  try {
    const res = await fetch(
      `${TABLE_URL}?id=eq.${encodeURIComponent(itemId)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ quantity: newQty }),
      },
    );
    if (!res.ok) throw new Error(`Update failed: ${res.status}`);
    notifyCartUpdate();
  } catch (e) {
    console.warn(
      "Failed to update cart quantity on server, updating local fallback:",
      e,
    );
    const items = getGuestCart();
    const item = items.find((i) => String(i.id) === String(itemId));
    if (item) {
      item.quantity = newQty;
      saveGuestCart(items);
    }
  }
}

export async function removeFromCart(itemId, userIdInput) {
  const cookieUserId = getCookieUser()?.id;
  const candidateId = userIdInput !== undefined ? userIdInput : cookieUserId;
  const userId = isValidUuid(candidateId) ? candidateId : null;

  if (
    !userId ||
    String(itemId).startsWith("guest_") ||
    String(itemId).startsWith("fallback_")
  ) {
    const items = getGuestCart().filter((i) => String(i.id) !== String(itemId));
    saveGuestCart(items);
    return;
  }

  try {
    const res = await fetch(
      `${TABLE_URL}?id=eq.${encodeURIComponent(itemId)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers,
      },
    );
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    notifyCartUpdate();
  } catch (e) {
    console.warn(
      "Failed to remove item from server, filtering local fallback:",
      e,
    );
    const items = getGuestCart().filter((i) => String(i.id) !== String(itemId));
    saveGuestCart(items);
  }
}

export async function clearCart(userIdInput) {
  saveGuestCart([]);
  const cookieUserId = getCookieUser()?.id;
  const candidateId = userIdInput !== undefined ? userIdInput : cookieUserId;
  const userId = isValidUuid(candidateId) ? candidateId : null;

  if (userId) {
    try {
      await fetch(`${TABLE_URL}?user_id=eq.${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers,
      });
      notifyCartUpdate();
    } catch {
      // ignore
    }
  }
}

export function findCartItem(cartItems, perfume, volKey = null) {
  if (!Array.isArray(cartItems) || !perfume) return null;

  const targetId = String(perfume.id || "")
    .toLowerCase()
    .trim();
  const targetSlug = String(perfume.slug || "")
    .toLowerCase()
    .trim();
  const targetUrl = String(
    perfume.url || perfume.link || getPerfumeUrl(perfume),
  ).toLowerCase();
  const targetTitle = String(perfume.name || perfume.title || "")
    .toLowerCase()
    .trim();

  // 1. If checking for a specific sample volume (1ml, 2ml, 5ml, 10ml)
  if (volKey && volKey !== "full") {
    const expectedSampleId = `sample-${targetId}-${volKey}`.toLowerCase();
    const sampleParam = `sample=${volKey}`.toLowerCase();

    return (
      cartItems.find((it) => {
        const itId = String(it.id || it.perfume_id || "").toLowerCase();
        const itLink = String(it.link || it.url || "").toLowerCase();
        const itTitle = String(it.title || "").toLowerCase();

        if (itId === expectedSampleId) return true;
        if (
          itLink.includes(sampleParam) &&
          (itLink.includes(targetId) || itLink.includes(targetSlug))
        )
          return true;
        if (itTitle.includes(targetTitle) && itTitle.includes(volKey))
          return true;
        return false;
      }) || null
    );
  }

  // 2. If checking for full bottle (or general perfume if volKey not specified)
  return (
    cartItems.find((it) => {
      // Exclude sample items if we are checking for full bottle
      const itId = String(it.id || it.perfume_id || "").toLowerCase();
      const itLink = String(it.link || it.url || "").toLowerCase();
      const isSample =
        it.isSample || itId.startsWith("sample-") || itLink.includes("sample=");

      if (volKey === "full" && isSample) {
        return false;
      }

      // Check perfume_id
      const itPerfumeId = String(it.perfume_id || "")
        .toLowerCase()
        .trim();
      if (
        itPerfumeId &&
        (itPerfumeId === targetId || itPerfumeId === targetSlug)
      )
        return true;

      // Check link
      if (itLink) {
        const cleanLink = itLink.split("?")[0].replace(/\/+$/, "");
        const cleanTarget = targetUrl.split("?")[0].replace(/\/+$/, "");
        if (cleanLink && cleanTarget && cleanLink === cleanTarget) return true;
        if (
          targetId &&
          (cleanLink.endsWith(`/${targetId}`) ||
            cleanLink.includes(`/book/${targetId}`) ||
            cleanLink.includes(`/perfume/${targetId}`))
        ) {
          return true;
        }
        if (
          targetSlug &&
          (cleanLink.endsWith(`/${targetSlug}`) ||
            cleanLink.includes(`/book/${targetSlug}`) ||
            cleanLink.includes(`/perfume/${targetSlug}`))
        ) {
          return true;
        }
      }

      // Check id
      if (itId && (itId === targetId || itId === targetSlug)) return true;

      // Check title (exact base title match)
      const itTitle = String(it.title || it.name || "")
        .toLowerCase()
        .trim();
      if (!isSample && itTitle && itTitle === targetTitle) return true;

      return false;
    }) || null
  );
}

export async function removePerfumeFromCart(
  perfume,
  userIdInput,
  volKey = null,
) {
  const cookieUserId = getCookieUser()?.id;
  const candidateId = userIdInput !== undefined ? userIdInput : cookieUserId;
  const userId = isValidUuid(candidateId) ? candidateId : null;

  const items = await getCart(userId);
  const existing = findCartItem(items, perfume, volKey);
  if (existing && existing.id) {
    await removeFromCart(existing.id, userId);
    return true;
  }
  return false;
}

export async function togglePerfumeInCart(perfume, userIdInput, options = {}) {
  const {
    volKey = null,
    quantity = 1,
    isSample = false,
    language = "ru",
  } = options;
  const cookieUserId = getCookieUser()?.id;
  const candidateId = userIdInput !== undefined ? userIdInput : cookieUserId;
  const userId = isValidUuid(candidateId) ? candidateId : null;

  const items = await getCart(userId);
  const existing = findCartItem(items, perfume, volKey);

  if (existing && existing.id) {
    await removeFromCart(existing.id, userId);
    return { action: "removed", item: existing };
  } else {
    let itemToAdd = perfume;
    if (isSample && volKey) {
      itemToAdd = createSampleCartItem(perfume, volKey, language);
    }
    const added = await addToCart(itemToAdd, userId, quantity);
    return { action: "added", item: added };
  }
}
