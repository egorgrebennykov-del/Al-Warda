import { getCookieUser } from "./auth.js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";
const TABLE_URL = `${SUPABASE_URL}/rest/v1/orders_in_progress`;
const KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";

export async function createOrderInProgress({
  userId,
  orderNumber,
  items,
  address,
  itemsSubtotal,
  shippingCost,
  finalTotal,
  coupon,
}) {
  try {
    const response = await fetch(TABLE_URL, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: userId,
        content: {
          orderNumber,
          items,
          address,
          itemsSubtotal,
          shippingCost,
          finalTotal,
          coupon: coupon || null,
          createdAt: new Date().toISOString(),
        },
        status: "in_progress",
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      console.warn("Could not record order in orders_in_progress:", err);
    }
  } catch (err) {
    console.warn("Error creating order:", err);
  }
}

export async function getUserOrders(userId) {
  const id = userId ?? getCookieUser()?.id;
  if (!id) return [];
  try {
    const params = new URLSearchParams({
      select: "id,created_at,user_id,content,status,link",
      user_id: `eq.${id}`,
      order: "created_at.desc",
    });
    const response = await fetch(`${TABLE_URL}?${params}`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("Error fetching user orders:", err);
    return [];
  }
}

export async function getCurrentOrders(userId) {
  const all = await getUserOrders(userId);
  return all.filter((o) => (o.status || "in_progress").toLowerCase() !== "completed");
}

export async function getCompletedOrders(userId) {
  const all = await getUserOrders(userId);
  return all.filter((o) => (o.status || "").toLowerCase() === "completed");
}

export async function getAllOrdersAdmin() {
  try {
    const params = new URLSearchParams({
      select: "id,created_at,user_id,content,status,link",
      order: "created_at.desc",
    });
    const response = await fetch(`${TABLE_URL}?${params}`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("Error fetching all orders:", err);
    return [];
  }
}

export async function updateOrderStatus(orderId, newStatus) {
  const response = await fetch(
    `${TABLE_URL}?id=eq.${encodeURIComponent(orderId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status: newStatus }),
    },
  );
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.message || "Could not update order status");
  }
  return (await response.json())[0];
}
