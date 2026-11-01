import { getCookieUser } from "./auth.js";
import { getPerfumeUrl } from "./perfumes.js";

const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";
const TABLE_URL = `${SUPABASE_URL}/rest/v1/cart`;
const KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

const GUEST_CART_KEY = "alwarda_guest_cart";

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
    window.dispatchEvent(new CustomEvent("alwarda-cart-updated", { detail: { items } }));
  } catch {
    // ignore
  }
}

function notifyCartUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("alwarda-cart-updated"));
  }
}

export async function getCart(userId = getCookieUser()?.id) {
  if (!userId) {
    return getGuestCart();
  }

  try {
    const params = new URLSearchParams({
      select: "id,link,price,user_id,image,title,quantity,perfume_id",
      user_id: `eq.${userId}`,
      order: "id.desc",
    });
    const res = await fetch(`${TABLE_URL}?${params}`, { headers });
    if (res.ok) {
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    }
  } catch (e) {
    console.warn("Could not fetch remote cart, falling back to local:", e);
  }
  return getGuestCart();
}

export async function getCartItemCount(userId = getCookieUser()?.id) {
  const items = await getCart(userId);
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
}

export async function addToCart(perfume, userId = getCookieUser()?.id, quantityToAdd = 1) {
  const qty = Math.max(1, Number(quantityToAdd) || 1);
  const price = Number(perfume.price) || 45;
  const link = perfume.url || perfume.link || getPerfumeUrl(perfume);
  const title = perfume.name || perfume.title || "Al-Warda Perfume";
  const image = perfume.image || perfume.fullCardImage || "/assets/img/perfumes/hero-perfume.png";
  const perfumeId = String(perfume.id || perfume.slug || title);
  const isDropship = Boolean(perfume.isDropship);

  if (!userId) {
    const items = getGuestCart();
    const existingIndex = items.findIndex((it) => it.perfume_id === perfumeId || it.link === link || it.title === title);
    if (existingIndex > -1) {
      items[existingIndex].quantity = (Number(items[existingIndex].quantity) || 1) + qty;
    } else {
      items.push({
        id: `guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        perfume_id: perfumeId,
        title,
        price,
        image,
        link,
        quantity: qty,
        isDropship,
      });
    }
    saveGuestCart(items);
    return items;
  }

  try {
    // Check if item already exists in user cart
    const checkParams = new URLSearchParams({
      select: "id,quantity",
      user_id: `eq.${userId}`,
      perfume_id: `eq.${perfumeId}`,
      limit: "1",
    });
    const checkRes = await fetch(`${TABLE_URL}?${checkParams}`, { headers });
    const existing = checkRes.ok ? await checkRes.json() : null;

    if (existing && existing.length > 0) {
      const item = existing[0];
      const newQty = (Number(item.quantity) || 1) + qty;
      await fetch(`${TABLE_URL}?id=eq.${item.id}&user_id=eq.${userId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ quantity: newQty }),
      });
    } else {
      await fetch(TABLE_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          user_id: userId,
          perfume_id: perfumeId,
          title,
          price,
          image,
          link,
          quantity: qty,
        }),
      });
    }
    notifyCartUpdate();
  } catch {
    // Fallback to guest cart on network error
    const items = getGuestCart();
    items.push({
      id: `fallback_${Date.now()}`,
      perfume_id: perfumeId,
      title,
      price,
      image,
      link,
      quantity: qty,
      isDropship,
    });
    saveGuestCart(items);
  }
}

export async function updateQuantity(itemId, quantity, userId = getCookieUser()?.id) {
  const newQty = Math.max(1, Number(quantity) || 1);
  if (!userId || String(itemId).startsWith("guest_") || String(itemId).startsWith("fallback_")) {
    const items = getGuestCart();
    const item = items.find((i) => String(i.id) === String(itemId));
    if (item) {
      item.quantity = newQty;
      saveGuestCart(items);
    }
    return;
  }

  try {
    await fetch(`${TABLE_URL}?id=eq.${itemId}&user_id=eq.${userId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ quantity: newQty }),
    });
    notifyCartUpdate();
  } catch (e) {
    console.warn("Failed to update cart quantity:", e);
  }
}

export async function removeFromCart(itemId, userId = getCookieUser()?.id) {
  if (!userId || String(itemId).startsWith("guest_") || String(itemId).startsWith("fallback_")) {
    const items = getGuestCart().filter((i) => String(i.id) !== String(itemId));
    saveGuestCart(items);
    return;
  }

  try {
    await fetch(`${TABLE_URL}?id=eq.${itemId}&user_id=eq.${userId}`, {
      method: "DELETE",
      headers,
    });
    notifyCartUpdate();
  } catch (e) {
    console.warn("Failed to remove item from cart:", e);
  }
}

export async function clearCart(userId = getCookieUser()?.id) {
  saveGuestCart([]);
  if (userId) {
    try {
      await fetch(`${TABLE_URL}?user_id=eq.${userId}`, {
        method: "DELETE",
        headers,
      });
      notifyCartUpdate();
    } catch {
      // ignore
    }
  }
}
