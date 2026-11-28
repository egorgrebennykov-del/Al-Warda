import { getCookieUser } from "./auth.js";
import { restUrl } from "./restBase.js";
import { buildAromadealCartPermalink } from "./aromadealProductUrls.js";

const TABLE_URL = restUrl("orders_in_progress");
const STOCKS_URL = restUrl("stocks");

async function enrichOrderItemsWithAromadeal(items = []) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return Promise.all(
    items.map(async (item) => {
      if (!item) return item;
      if (item.aromadealVariantId || item.info?.aromadealVariantId) {
        return {
          ...item,
          aromadealVariantId:
            item.aromadealVariantId || item.info?.aromadealVariantId || "",
          aromadealHandle:
            item.aromadealHandle || item.info?.aromadealHandle || "",
        };
      }
      const stockId = String(item.id || "").replace(/^stock-/, "").trim();
      if (!/^\d+$/.test(stockId)) return item;
      try {
        const res = await fetch(
          `${STOCKS_URL}?select=id,info&id=eq.${stockId}&limit=1`,
          { headers: { apikey: "", Authorization: "" } },
        );
        if (!res.ok) return item;
        const rows = await res.json();
        const row = Array.isArray(rows) ? rows[0] : null;
        const info = row?.info && typeof row.info === "object" ? row.info : {};
        return {
          ...item,
          aromadealVariantId: info.aromadealVariantId || "",
          aromadealHandle: info.aromadealHandle || item.aromadealHandle || "",
          aromadealUrl: info.aromadealUrl || item.aromadealUrl || "",
        };
      } catch {
        return item;
      }
    }),
  );
}

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
    const enrichedItems = await enrichOrderItemsWithAromadeal(items);
    const aromadealCartUrl = buildAromadealCartPermalink(enrichedItems);
    const response = await fetch(TABLE_URL, {
      method: "POST",
      headers: {
        apikey: "",
        Authorization: "",
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: userId,
        link: aromadealCartUrl || null,
        content: {
          orderNumber,
          items: enrichedItems,
          address,
          itemsSubtotal,
          shippingCost,
          finalTotal,
          coupon: coupon || null,
          aromadealCartUrl: aromadealCartUrl || null,
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
        apikey: "",
        Authorization: "",
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
  return all.filter(
    (o) => (o.status || "in_progress").toLowerCase() !== "completed",
  );
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
        apikey: "",
        Authorization: "",
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
        apikey: "",
        Authorization: "",
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
