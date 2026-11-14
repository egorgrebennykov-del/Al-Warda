import { getAllUsers, resolveUserRoles, isPrivileged } from "./auth.js";

async function getEmailJs() {
  const mod = await import("@emailjs/browser");
  return mod.default || mod;
}

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";

const EMAILJS_SERVICE_ID =
  import.meta.env.VITE_EMAILJS_SERVICE_ID || "default_service";
const EMAILJS_TEMPLATE_ID =
  import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "template_tco32u6";
const EMAILJS_PUBLIC_KEY =
  import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "mq7sRq7QGzp9XQUTh";

function buildEmailJsParams({
  to,
  userName = "Читатель",
  adminName = "Администратор Al-Warda",
  subject = "Ответ от службы поддержки Al-Warda",
  text = "",
}) {
  const cleanTo = String(to || "")
    .trim()
    .toLowerCase();
  const cleanUser = String(userName || "Читатель").trim();
  const cleanAdmin = String(adminName || "Администратор Al-Warda").trim();
  const cleanSubject = String(
    subject || "Ответ от службы поддержки Al-Warda",
  ).trim();
  const cleanText = String(text || "").trim();
  const timeStr = new Date().toLocaleString("ru-RU");

  return {
    to_email: cleanTo,
    email: cleanTo,
    user_email: cleanTo,
    recipient: cleanTo,
    to: cleanTo,
    to_name: cleanUser,
    user_name: cleanUser,
    name: cleanAdmin,
    from_name: cleanAdmin,
    admin_name: cleanAdmin,
    sender_name: cleanAdmin,
    subject: cleanSubject,
    title: cleanSubject,
    message: cleanText,
    text: cleanText,
    reply: cleanText,
    content: cleanText,
    time: timeStr,
    reply_to: "alwardaparfumes@gmail.com",
  };
}

async function dispatchGuestEmailViaEmailJs({
  to,
  userName,
  adminName,
  subject,
  text,
}) {
  const templateParams = buildEmailJsParams({
    to,
    userName,
    adminName,
    subject,
    text,
  });

  // 1. Primary: send directly from browser via @emailjs/browser
  if (typeof window !== "undefined") {
    const emailjs = await getEmailJs();
    const candidateServices = Array.from(
      new Set([EMAILJS_SERVICE_ID, "default_service", "service_zzl5x89"]),
    );
    for (const serviceId of candidateServices) {
      try {
        const response = await emailjs.send(
          serviceId,
          EMAILJS_TEMPLATE_ID,
          templateParams,
          { publicKey: EMAILJS_PUBLIC_KEY },
        );
        return {
          success: true,
          result: {
            success: true,
            provider: "emailjs",
            status: response?.status || 200,
            recipient: templateParams.to_email,
          },
        };
      } catch (browserErr) {
        console.warn(
          `[EmailJS Browser] Service ${serviceId} attempt failed:`,
          browserErr?.text || browserErr?.message || browserErr,
        );
      }
    }
  }

  // 2. Fallback: send via server endpoint (/api/send-inquiry-email)
  const mailRes = await fetch("/api/send-inquiry-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to,
      userName,
      subject,
      text,
      adminName,
    }),
  });
  if (mailRes.ok) {
    return await mailRes.json();
  }
  const errJson = await mailRes.json().catch(() => ({}));
  return {
    error: errJson.message || errJson.error || "Email delivery failed",
  };
}

const TABLE_URL = `${SUPABASE_URL}/rest/v1/inquiries`;
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

/**
 * Fetch all available admins for load balancing.
 * Finds all users with the 'admin' role. If none have 'admin', falls back to any privileged user.
 */
export async function getCandidateAdmins() {
  const allUsers = await getAllUsers();
  const admins = allUsers.filter((u) => resolveUserRoles(u).includes("admin"));

  if (admins.length > 0) {
    return admins;
  }

  // Fallback to any privileged user if no explicit admin role exists yet
  const privileged = allUsers.filter((u) => isPrivileged(u));
  if (privileged.length > 0) {
    return privileged;
  }

  // Fallback placeholder if no users exist
  return [
    {
      id: "warda_admin_default",
      firstName: "Администратор",
      lastName: "Al-Warda",
      email: "alwardaparfumes@gmail.com",
    },
  ];
}

/**
 * Assigns an admin to an inquiry using load-balancing (least inquiries assigned).
 */
export async function assignAdminForNewInquiry() {
  try {
    const admins = await getCandidateAdmins();
    if (!admins || admins.length === 0) {
      return {
        id: "warda_admin_default",
        firstName: "Администратор",
        lastName: "Al-Warda",
        email: "alwardaparfumes@gmail.com",
      };
    }
    if (admins.length === 1) {
      return admins[0];
    }

    // Query all inquiries to count distribution
    const res = await fetch(`${TABLE_URL}?select=interlocutors_info`, {
      headers,
    });
    if (res.ok) {
      const list = await res.json();
      const counts = {};
      admins.forEach((a) => {
        counts[a.id] = 0;
      });

      if (Array.isArray(list)) {
        list.forEach((inq) => {
          const aid = inq.interlocutors_info?.adminId;
          if (aid && counts[aid] !== undefined) {
            counts[aid] += 1;
          }
        });
      }

      // Pick admin with lowest count
      let selectedAdmin = admins[0];
      let minCount = counts[selectedAdmin.id] ?? 0;

      for (const admin of admins) {
        const count = counts[admin.id] ?? 0;
        if (count < minCount) {
          minCount = count;
          selectedAdmin = admin;
        }
      }

      return selectedAdmin;
    }
    return admins[0];
  } catch (err) {
    console.warn("Error calculating admin load balance:", err);
    return {
      id: "warda_admin_default",
      firstName: "Администратор",
      lastName: "Al-Warda",
      email: "alwardaparfumes@gmail.com",
    };
  }
}

/**
 * Fetch a single inquiry by its ID.
 */
export async function fetchInquiryById(inquiryId) {
  if (!inquiryId) return null;
  const res = await fetch(
    `${TABLE_URL}?id=eq.${encodeURIComponent(inquiryId)}&limit=1`,
    { headers },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0] || null;
}

/**
 * Fetch existing inquiry for a registered user or a guest email.
 */
export async function fetchUserInquiry({ userId = null, userEmail = null }) {
  try {
    if (userId) {
      const url = `${TABLE_URL}?select=id,notifications_user&interlocutors_info->>userId=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=1`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          return list[0];
        }
      }
    }

    if (userEmail) {
      const cleanEmail = userEmail.trim().toLowerCase();
      const url = `${TABLE_URL}?select=id,notifications_user&interlocutors_info->>userEmail=eq.${encodeURIComponent(cleanEmail)}&order=created_at.desc&limit=1`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          return list[0];
        }
      }
    }

    return null;
  } catch (err) {
    console.warn("Error fetching user inquiry:", err);
    return null;
  }
}

/**
 * Get or create an inquiry for the user / guest.
 */
export async function getOrCreateInquiry({
  user = null,
  guestEmail = null,
  guestName = "Гость",
}) {
  const userId = user?.id || null;
  let userEmail = (user?.email || guestEmail || "").trim().toLowerCase();
  let userName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.email ||
      "Пользователь"
    : guestName;

  // If user is registered but email was not provided in cookie, look up in database
  if (userId && (!userEmail || !userName || userName === "Пользователь")) {
    try {
      const uRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user?id=eq.${encodeURIComponent(userId)}&limit=1`,
        { headers },
      );
      if (uRes.ok) {
        const uList = await uRes.json();
        const found = uList?.[0];
        if (found) {
          if (!userEmail && found.email) {
            userEmail = found.email.trim().toLowerCase();
          }
          if (!userName || userName === "Пользователь") {
            const fName = found.firstName ?? found.firstname ?? "";
            const lName = found.lastName ?? found.lastname ?? "";
            userName =
              `${fName} ${lName}`.trim() || found.email || "Пользователь";
          }
        }
      }
    } catch (dbErr) {
      console.warn("Could not query user table for inquiry details:", dbErr);
    }
  }

  // Fallback email for registered users so lack of email in cookie never blocks messaging
  if (userId && !userEmail) {
    userEmail = `user_${userId.slice(0, 8)}@al-warda.customer`;
  }

  const isGuest = !userId;

  if (isGuest && !userEmail) {
    throw new Error(
      "Пожалуйста, укажите ваш email для связи с администратором",
    );
  }

  // Check if inquiry already exists
  const existing = await fetchUserInquiry({ userId, userEmail });
  if (existing) {
    return existing;
  }

  // Load-balance and pick an admin
  const assignedAdmin = await assignAdminForNewInquiry();
  const adminName =
    `${assignedAdmin.firstName || ""} ${assignedAdmin.lastName || ""}`.trim() ||
    assignedAdmin.email ||
    "Администратор";

  const newInquiryPayload = {
    interlocutors_info: {
      userId,
      userEmail,
      userName: userName || "Пользователь",
      isGuest,
      adminId: assignedAdmin.id,
      adminName,
      adminEmail: assignedAdmin.email || "",
    },
    chat: [],
    notifications_admin: 0,
    notifications_user: 0,
  };

  const createRes = await fetch(TABLE_URL, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(newInquiryPayload),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => null);
    throw new Error(err?.message || "Failed to create inquiry");
  }

  const created = await createRes.json();
  return created?.[0] || null;
}

/**
 * Pre-filter user inquiry message with AI before delivering to administrator.
 */
export async function filterInquiryMessage({ text, language = "ru" }) {
  if (!text || !text.trim()) {
    return {
      allowed: false,
      reason:
        language === "ru"
          ? "Сообщение не может быть пустым."
          : "Message cannot be empty.",
    };
  }

  try {
    const res = await fetch("/api/filter-inquiry-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim(), language }),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("AI inquiry filter network error:", err);
  }

  return { allowed: true };
}

/**
 * Send a message within an inquiry.
 * If sender === 'admin' and the recipient is a guest, sends an email notification.
 */
export async function sendInquiryMessage({
  inquiryId,
  text,
  sender = "user", // "user" | "admin"
  senderUser = null,
}) {
  if (!inquiryId || !text?.trim()) {
    throw new Error("Не указан ID диалога или текст сообщения");
  }

  const cleanText = text.trim();

  // If message is from user to admin, filter via AI
  if (sender === "user") {
    const check = await filterInquiryMessage({ text: cleanText });
    if (!check.allowed) {
      throw new Error(
        check.reason ||
          "Сообщение отклонено: администратор принимает сообщения только по вопросам книг, работы магазина или сотрудничества.",
      );
    }
  }
  let inquiry = await fetchInquiryById(inquiryId);
  if (!inquiry) {
    // Retry once in case of network latency
    await new Promise((r) => setTimeout(r, 400));
    inquiry = await fetchInquiryById(inquiryId);
  }

  if (!inquiry) {
    throw new Error("Диалог не найден. Попробуйте обновить страницу.");
  }

  const info = inquiry.interlocutors_info || {};
  if (
    sender === "admin" &&
    info.adminId &&
    senderUser?.id &&
    info.adminId !== senderUser.id
  ) {
    throw new Error(
      "Доступ запрещён: этот диалог закреплён за другим ответственным администратором.",
    );
  }
  const isGuest = Boolean(info.isGuest);
  const currentChat = Array.isArray(inquiry.chat) ? inquiry.chat : [];

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const senderName =
    sender === "admin"
      ? senderUser
        ? `${senderUser.firstName || ""} ${senderUser.lastName || ""}`.trim() ||
          senderUser.email
        : info.adminName || "Администратор"
      : senderUser
        ? `${senderUser.firstName || ""} ${senderUser.lastName || ""}`.trim() ||
          senderUser.email
        : info.userName || "Пользователь";

  const newMsg = {
    id: messageId,
    sender,
    senderId: senderUser?.id || null,
    senderName,
    text: cleanText,
    timestamp: new Date().toISOString(),
    deliveredViaEmail: sender === "admin" && isGuest,
  };

  const updatedChat = [...currentChat, newMsg];
  const updatePayload = {
    chat: updatedChat,
  };

  if (sender === "user") {
    updatePayload.notifications_admin = (inquiry.notifications_admin || 0) + 1;
  } else {
    updatePayload.notifications_user = (inquiry.notifications_user || 0) + 1;
  }

  const patchRes = await fetch(
    `${TABLE_URL}?id=eq.${encodeURIComponent(inquiryId)}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(updatePayload),
    },
  );

  if (!patchRes.ok) {
    const errData = await patchRes.json().catch(() => null);
    throw new Error(
      errData?.message || "Не удалось отправить сообщение на сервер",
    );
  }

  // If sender is admin and user is guest, automatically send an email via EmailJS
  let emailDeliveryResult = null;
  if (sender === "admin" && isGuest && info.userEmail) {
    try {
      emailDeliveryResult = await dispatchGuestEmailViaEmailJs({
        to: info.userEmail,
        userName: info.userName || "Уважаемый гость",
        adminName: senderName,
        subject: "Ответ от службы поддержки Al-Warda",
        text: cleanText,
      });
    } catch (mailErr) {
      console.warn("Failed to dispatch email to guest:", mailErr);
      emailDeliveryResult = { error: mailErr.message };
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("warda-inquiries-updated"));
  }

  const updatedRow = await patchRes.json().catch(() => null);
  const resultObj = updatedRow?.[0] || { ...inquiry, ...updatePayload };
  return {
    ...resultObj,
    emailResult: emailDeliveryResult,
  };
}

/**
 * Transfer an inquiry/client to another administrator.
 * Records the transfer in interlocutors_info.transferHistory and adds a system message to the chat.
 */
export async function transferInquiryAdmin({
  inquiryId,
  toAdminId,
  toAdminName,
  toAdminEmail = "",
  reason = "",
  fromAdminUser = null,
}) {
  if (!inquiryId || !toAdminId) {
    throw new Error("Не указан ID диалога или администратора");
  }

  let inquiry = await fetchInquiryById(inquiryId);
  if (!inquiry) {
    throw new Error("Диалог не найден");
  }

  const info = inquiry.interlocutors_info || {};
  const fromAdminId = fromAdminUser?.id || info.adminId || "admin";
  const fromAdminName =
    (fromAdminUser
      ? `${fromAdminUser.firstName || ""} ${fromAdminUser.lastName || ""}`.trim() ||
        fromAdminUser.email
      : null) ||
    info.adminName ||
    "Администратор";

  const transferTimestamp = new Date().toISOString();
  const transferEntry = {
    id: `tr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fromAdminId,
    fromAdminName,
    toAdminId,
    toAdminName: toAdminName || "Администратор",
    toAdminEmail: toAdminEmail || "",
    reason: (reason || "").trim(),
    timestamp: transferTimestamp,
  };

  const currentHistory = Array.isArray(info.transferHistory)
    ? info.transferHistory
    : [];
  const updatedHistory = [...currentHistory, transferEntry];

  const updatedInfo = {
    ...info,
    adminId: toAdminId,
    adminName: toAdminName || "Администратор",
    adminEmail: toAdminEmail || info.adminEmail || "",
    transferHistory: updatedHistory,
  };

  const cleanReason = (reason || "").trim();
  const systemText = cleanReason
    ? `Диалог передан: ${fromAdminName} → ${toAdminName}. Причина: ${cleanReason}`
    : `Диалог передан: ${fromAdminName} → ${toAdminName}`;

  const currentChat = Array.isArray(inquiry.chat) ? inquiry.chat : [];
  const systemMsg = {
    id: `sys_tr_${Date.now()}`,
    sender: "system",
    text: systemText,
    timestamp: transferTimestamp,
  };

  const updatedChat = [...currentChat, systemMsg];

  const patchRes = await fetch(
    `${TABLE_URL}?id=eq.${encodeURIComponent(inquiryId)}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        interlocutors_info: updatedInfo,
        chat: updatedChat,
        notifications_admin: (inquiry.notifications_admin || 0) + 1,
        notifications_user: (inquiry.notifications_user || 0) + 1,
      }),
    },
  );

  if (!patchRes.ok) {
    const err = await patchRes.json().catch(() => null);
    throw new Error(err?.message || "Не удалось сохранить передачу диалога");
  }

  // Notify guest user via email if guest has provided email address
  if (info.isGuest && info.userEmail) {
    try {
      dispatchGuestEmailViaEmailJs({
        to: info.userEmail,
        userName: info.userName || "Уважаемый гость",
        adminName: toAdminName || "Администратор",
        subject: "Ответ от службы поддержки Al-Warda",
        text: `Ваше обращение в службу поддержки передано специалисту: ${toAdminName}.${cleanReason ? ` Причина: ${cleanReason}` : ""}`,
      }).catch((mErr) =>
        console.warn("Failed to notify guest about transfer via email:", mErr),
      );
    } catch {
      // Non-blocking
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("warda-inquiries-updated"));
  }

  const updatedRow = await patchRes.json().catch(() => null);
  return (
    updatedRow?.[0] || {
      ...inquiry,
      interlocutors_info: updatedInfo,
      chat: updatedChat,
    }
  );
}

/**
 * Mark messages as read by the user (clears notifications_user).
 */
export async function markInquiryReadByUser(inquiryId) {
  if (!inquiryId) return;
  try {
    await fetch(`${TABLE_URL}?id=eq.${encodeURIComponent(inquiryId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ notifications_user: 0 }),
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("warda-inquiries-updated"));
    }
  } catch (err) {
    console.warn("Error marking inquiry read by user:", err);
  }
}

/**
 * Mark messages as read by the admin (clears notifications_admin).
 */
export async function markInquiryReadByAdmin(inquiryId) {
  if (!inquiryId) return;
  try {
    await fetch(`${TABLE_URL}?id=eq.${encodeURIComponent(inquiryId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ notifications_admin: 0 }),
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("warda-inquiries-updated"));
    }
  } catch (err) {
    console.warn("Error marking inquiry read by admin:", err);
  }
}

/**
 * Fetch inquiries assigned strictly to the responsible administrator (adminId).
 */
export async function fetchAllInquiries(adminId = null) {
  if (!adminId) return [];
  try {
    const url = `${TABLE_URL}?select=*&interlocutors_info->>adminId=eq.${encodeURIComponent(adminId)}&order=created_at.desc`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = (await res.json()) || [];
    return Array.isArray(data)
      ? data.filter((i) => i.interlocutors_info?.adminId === adminId)
      : [];
  } catch (err) {
    console.warn("Error fetching admin inquiries:", err);
    return [];
  }
}

/**
 * Fetch total unread notifications count strictly for the responsible administrator (adminId).
 */
export async function fetchAdminUnreadCount(adminId = null) {
  if (!adminId) return 0;
  try {
    const res = await fetch(
      `${TABLE_URL}?select=notifications_admin,interlocutors_info&interlocutors_info->>adminId=eq.${encodeURIComponent(adminId)}`,
      { headers },
    );
    if (!res.ok) return 0;
    const list = await res.json();
    if (!Array.isArray(list)) return 0;

    return list
      .filter((i) => i.interlocutors_info?.adminId === adminId)
      .reduce((acc, inq) => acc + (Number(inq.notifications_admin) || 0), 0);
  } catch (err) {
    console.warn("Error fetching admin unread count:", err);
    return 0;
  }
}
