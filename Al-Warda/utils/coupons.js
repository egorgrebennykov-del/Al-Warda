const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";
const TABLE_URL = `${SUPABASE_URL}/rest/v1/coupons`;
const KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

export async function getAllCoupons() {
  try {
    const response = await fetch(`${TABLE_URL}?select=*&order=created_at.desc`, {
      headers,
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("Error fetching coupons:", err);
    return [];
  }
}

export async function getCouponByCode(code) {
  if (!code || typeof code !== "string") return null;
  const cleanCode = code.trim().toUpperCase();
  try {
    const response = await fetch(
      `${TABLE_URL}?select=*&code=eq.${encodeURIComponent(cleanCode)}&limit=1`,
      { headers },
    );
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (err) {
    console.warn("Error fetching coupon by code:", err);
    return null;
  }
}

export async function createCoupon({ code, name, starts_at, ends_at, action }) {
  const response = await fetch(TABLE_URL, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({
      code: code.trim().toUpperCase(),
      name: name ? name.trim() : "",
      starts_at: starts_at || new Date().toISOString(),
      ends_at: ends_at || null,
      action: action || { type: "percent", percent: 10 },
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.message || "Failed to create coupon");
  }
  return (await response.json())[0];
}

export async function deleteCoupon(couponId) {
  const response = await fetch(`${TABLE_URL}?id=eq.${encodeURIComponent(couponId)}`, {
    method: "DELETE",
    headers,
  });
  if (!response.ok) {
    throw new Error("Failed to delete coupon");
  }
  return true;
}

/**
 * Validates whether a coupon can be applied to a given cart state.
 * Returns { valid: boolean, error?: string, deduction: number, isFreeShipping: boolean, discountText?: string }
 */
export function validateCouponForCart({
  coupon,
  itemsSubtotal = 0,
  shippingCost = 0,
  user = null,
  language = "ru",
}) {
  if (!coupon || !coupon.action) {
    return {
      valid: false,
      error: language === "ru" ? "Купон не найден" : "Coupon not found",
      deduction: 0,
    };
  }

  const now = new Date();
  if (coupon.starts_at && new Date(coupon.starts_at) > now) {
    return {
      valid: false,
      error:
        language === "ru"
          ? "Срок действия купона еще не наступил"
          : "Coupon is not active yet",
      deduction: 0,
    };
  }

  if (coupon.ends_at && new Date(coupon.ends_at) < now) {
    return {
      valid: false,
      error:
        language === "ru"
          ? "Срок действия купона истек"
          : "Coupon has expired",
      deduction: 0,
    };
  }

  const act = coupon.action || {};

  // Check target audience
  const target = act.target || {};
  if (
    target.applyToAll === false &&
    Array.isArray(target.userIds) &&
    target.userIds.length > 0
  ) {
    if (!user || !user.id || !target.userIds.includes(user.id)) {
      return {
        valid: false,
        error:
          language === "ru"
            ? "Этот купон недоступен для вашего аккаунта"
            : "This coupon is not available for your account",
        deduction: 0,
      };
    }
  }

  // Check usage limit (single / limited / unlimited)
  const usageType =
    act.usageType || (act.maxUses === 1 ? "single" : "unlimited");
  const usedCount = Number(act.usedCount) || 0;
  const usedByUsers = Array.isArray(act.usedByUsers) ? act.usedByUsers : [];

  if (usageType === "single") {
    if (usedCount >= 1) {
      return {
        valid: false,
        error:
          language === "ru"
            ? "Этот купон одноразовый и уже был использован"
            : "This single-use coupon has already been used",
        deduction: 0,
      };
    }
    if (user && user.id && usedByUsers.includes(user.id)) {
      return {
        valid: false,
        error:
          language === "ru"
            ? "Вы уже использовали этот купон"
            : "You have already used this coupon",
        deduction: 0,
      };
    }
  } else if (usageType === "limited") {
    const maxUses = Number(act.maxUses) || 1;
    if (usedCount >= maxUses) {
      return {
        valid: false,
        error:
          language === "ru"
            ? `Лимит использований данного купона исчерпан (максимум ${maxUses})`
            : `This coupon's usage limit has been reached (max ${maxUses})`,
        deduction: 0,
      };
    }
  }

  const applyWithShipping = Boolean(
    act.applyToShipping === true || act.applyScope === "with_shipping",
  );
  const baseOrderAmount = applyWithShipping
    ? itemsSubtotal + shippingCost
    : itemsSubtotal;

  // Check minimum purchase amount
  if (act.minAmount != null && act.minAmount !== "") {
    const min = Number(act.minAmount);
    if (!isNaN(min) && min > 0 && baseOrderAmount < min) {
      return {
        valid: false,
        error:
          language === "ru"
            ? `Минимальная сумма заказа для этого купона: ${min.toFixed(2)} €`
            : `Minimum order amount for this coupon is ${min.toFixed(2)} €`,
        deduction: 0,
      };
    }
  }

  // Calculate deduction from the total order amount
  let deduction = 0;
  let isFreeShipping = false;
  let discountDescription = "";

  if (act.type === "free_shipping") {
    isFreeShipping = true;
    deduction = shippingCost;
    discountDescription =
      language === "ru"
        ? `Бесплатная доставка (экономия ${shippingCost.toFixed(2)} €)`
        : `Free Shipping (save ${shippingCost.toFixed(2)} €)`;
  } else if (act.type === "percent") {
    const percent = Math.min(100, Math.max(0, Number(act.percent) || 0));
    const raw = (baseOrderAmount * percent) / 100;
    const max = Number(act.maxAmount);
    deduction = !isNaN(max) && max > 0 ? Math.min(raw, max) : raw;
    deduction = Math.min(deduction, itemsSubtotal + shippingCost);
    discountDescription =
      language === "ru"
        ? `Скидка ${percent}% (-${deduction.toFixed(2)} €)${applyWithShipping ? " (с доставкой)" : ""}`
        : `Discount ${percent}% (-${deduction.toFixed(2)} €)${applyWithShipping ? " (with shipping)" : ""}`;
  } else if (act.type === "fixed") {
    const fixed = Math.max(0, Number(act.amount) || 0);
    deduction = Math.min(fixed, baseOrderAmount);
    discountDescription =
      language === "ru"
        ? `Скидка ${fixed.toFixed(2)} €${applyWithShipping ? " (с доставкой)" : ""}`
        : `Discount ${fixed.toFixed(2)} €${applyWithShipping ? " (with shipping)" : ""}`;
  } else if (act.type === "gift") {
    deduction = 0;
    const giftTitle =
      act.gift?.name || act.name || (language === "ru" ? "Подарок" : "Gift");
    discountDescription = `🎁 ${giftTitle}`;
  }

  return {
    valid: true,
    deduction,
    isFreeShipping,
    applyWithShipping,
    discountDescription,
    action: act,
  };
}

/**
 * Increment coupon usage count and record user ID in Supabase.
 */
export async function redeemCoupon(couponId, userId = null) {
  if (!couponId) return null;
  try {
    const res = await fetch(`${TABLE_URL}?id=eq.${encodeURIComponent(couponId)}`, {
      headers,
    });
    if (!res.ok) return null;
    const list = await res.json();
    const coupon = list?.[0];
    if (!coupon) return null;

    const action = coupon.action || {};
    const usedCount = (Number(action.usedCount) || 0) + 1;
    const usedByUsers = Array.isArray(action.usedByUsers)
      ? [...action.usedByUsers]
      : [];
    if (userId && !usedByUsers.includes(userId)) {
      usedByUsers.push(userId);
    }

    const updatedAction = {
      ...action,
      usedCount,
      usedByUsers,
    };

    const patchRes = await fetch(
      `${TABLE_URL}?id=eq.${encodeURIComponent(couponId)}`,
      {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({ action: updatedAction }),
      },
    );

    if (!patchRes.ok) return null;
    const updated = await patchRes.json();
    return updated?.[0] || null;
  } catch (err) {
    console.warn("Error redeeming coupon:", err);
    return null;
  }
}

