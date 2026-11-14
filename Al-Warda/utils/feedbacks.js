import { getCookieUser } from "./auth";
import { moderateReview } from "./geminiModeration";
import { restUrl } from "./restBase.js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";
const TABLE_URL = restUrl("feedbacks");
const KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

export async function getFeedbacks() {
  const url = `${TABLE_URL}?select=*&order=created_at.desc`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error("Could not load feedbacks");
  }
  return (await response.json()) ?? [];
}

export async function addFeedback({
  userId = getCookieUser()?.id,
  userFirstName,
  userLastName = "",
  feedback = "",
  stars = null,
}) {
  if (!userId) {
    throw new Error("Sign in to leave a review");
  }
  const cleanFeedback = (feedback ?? "").trim();
  const validStars =
    Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null;

  if (!cleanFeedback && validStars === null) {
    throw new Error("Please provide review text or a star rating");
  }

  // Moderate & translate with Google AI
  let moderation = null;
  if (cleanFeedback) {
    try {
      moderation = await moderateReview(cleanFeedback);
    } catch (err) {
      console.warn("AI moderation error in addFeedback:", err);
    }
  }

  const payload = {
    user_id: userId,
    user_first_name: (userFirstName || "Пользователь").trim(),
    user_last_name: userLastName ? userLastName.trim() : null,
    feedback: cleanFeedback,
    stars: validStars,
    ststus: moderation?.decision || "approved",
    feedback_ru: moderation?.russian_translation || cleanFeedback,
    feedback_en: moderation?.english_translation || cleanFeedback,
  };

  const response = await fetch(TABLE_URL, {
    method: "POST",
    headers: {
      ...headers,
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? body?.hint ?? "Could not submit review");
  }
  return body?.[0] ?? body;
}

export async function updateFeedback({
  id,
  userId = getCookieUser()?.id,
  feedback = "",
  stars = null,
}) {
  if (!id || !userId) {
    throw new Error("Cannot update review without id and user");
  }
  const cleanFeedback = (feedback ?? "").trim();
  const validStars =
    Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null;

  if (!cleanFeedback && validStars === null) {
    throw new Error("Please provide review text or a star rating");
  }

  // Re-moderate & translate with Google AI on update
  let moderation = null;
  if (cleanFeedback) {
    try {
      moderation = await moderateReview(cleanFeedback);
    } catch (err) {
      console.warn("AI moderation error in updateFeedback:", err);
    }
  }

  const payload = {
    feedback: cleanFeedback,
    stars: validStars,
    ststus: moderation?.decision || "approved",
    feedback_ru: moderation?.russian_translation || cleanFeedback,
    feedback_en: moderation?.english_translation || cleanFeedback,
  };

  const response = await fetch(
    `${TABLE_URL}?id=eq.${id}&user_id=eq.${userId}`,
    {
      method: "PATCH",
      headers: {
        ...headers,
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    },
  );

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? body?.hint ?? "Could not update review");
  }
  return body?.[0] ?? body;
}

export async function deleteFeedback({ id, userId = getCookieUser()?.id }) {
  if (!id || !userId) {
    throw new Error("Cannot delete review without id and user");
  }

  const response = await fetch(
    `${TABLE_URL}?id=eq.${id}&user_id=eq.${userId}`,
    {
      method: "DELETE",
      headers,
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? body?.hint ?? "Could not delete review");
  }
  return true;
}
