async function getBcrypt() {
  const mod = await import("bcryptjs");
  return mod.default || mod;
}

async function getEmailJs() {
  const mod = await import("@emailjs/browser");
  return mod.default || mod;
}

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";
const TABLE_URL = `${SUPABASE_URL}/rest/v1/user`;
const KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

const EMAILJS_SERVICE_ID =
  import.meta.env.VITE_EMAILJS_SERVICE_ID || "default_service";
const EMAILJS_TEMPLATE_ID =
  import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "template_tco32u6";
const EMAILJS_PUBLIC_KEY =
  import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "mq7sRq7QGzp9XQUTh";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const checkEmail = (email) => {
  const normalized = (email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) throw new Error("Enter a valid email");
  return normalized;
};

export function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const isLoggedIn = () =>
  document.cookie.split("; ").some((c) => c.startsWith("user="));

export function resolveUserRoles(user) {
  if (!user) return ["user"];

  const isPrivilegedStatus =
    user.status === "privileged" ||
    user.status === "priveleged" ||
    user.status === "привилегированный" ||
    user.role === "privileged";

  // Если пользователь не имеет статуса привилегированного, его роль всегда только 'user'
  if (!isPrivilegedStatus) {
    return ["user"];
  }

  const rawRole = user.role ?? user.roles;
  let parsedRoles = [];

  if (Array.isArray(rawRole)) {
    parsedRoles = rawRole;
  } else if (typeof rawRole === "string" && rawRole.trim()) {
    try {
      const parsed = JSON.parse(rawRole);
      if (Array.isArray(parsed)) {
        parsedRoles = parsed;
      } else if (typeof parsed === "string") {
        parsedRoles = [parsed];
      }
    } catch {
      parsedRoles = rawRole.split(",").map((r) => r.trim());
    }
  }

  const roleSet = new Set();
  // Любой привилегированный пользователь также всегда имеет статус/роль VIP
  roleSet.add("vip");

  for (const r of parsedRoles) {
    if (!r || typeof r !== "string") continue;
    const norm = r.trim().toLowerCase();
    if (norm === "admin" || norm === "админ" || norm === "administrator") {
      roleSet.add("admin");
    } else if (
      norm === "developer" ||
      norm === "девелопер" ||
      norm === "dev" ||
      norm === "разработчик"
    ) {
      roleSet.add("developer");
    } else if (norm === "vip" || norm === "вип") {
      roleSet.add("vip");
    }
  }

  // Привилегированный пользователь автоматически не может иметь роль 'user'.
  // Он должен иметь роль VIP, или разработчик, или админ.
  if (roleSet.size === 0) {
    return ["vip"];
  }

  return Array.from(roleSet);
}

export function formatRoleName(role, language = "ru") {
  const norm = String(role).trim().toLowerCase();
  if (norm === "developer") return language === "ru" ? "Девелопер" : "Developer";
  if (norm === "admin") return language === "ru" ? "Админ" : "Admin";
  if (norm === "vip") return "VIP";
  return language === "ru" ? "Юзер" : "User";
}

export function formatStatusName(status, language = "ru") {
  const norm = String(status).trim().toLowerCase();
  if (norm === "privileged" || norm === "привилегированный") {
    return language === "ru" ? "Привилегированный" : "Privileged";
  }
  return language === "ru" ? "Юзер" : "User";
}

export const setUserCookie = (user = {}) => {
  if (!user) return;
  const { id, role, status, roles } = user;
  const firstName = user.firstName ?? user.firstname ?? "";
  const lastName = user.lastName ?? user.lastname ?? "";
  const email = user.email || "";
  const userStatus = status || (role === "privileged" ? "privileged" : "user");
  const resolvedRoles = roles || resolveUserRoles({ role, status: userStatus });
  const value = encodeURIComponent(
    JSON.stringify({
      id,
      firstName,
      lastName,
      email,
      status: userStatus,
      role: resolvedRoles[0] || "user",
      roles: resolvedRoles,
    }),
  );
  document.cookie = `user=${value}; max-age=${7 * 24 * 60 * 60}; path=/; SameSite=Lax`;
};

async function findByEmail(email) {
  const normalized = (email || "").trim();
  if (!normalized) return null;
  const encoded = encodeURIComponent(normalized);
  const response = await fetch(
    `${TABLE_URL}?select=id,firstname,lastname,email,password_hash,status,role&or=(email.ilike.${encoded},firstname.ilike.${encoded})&limit=1`,
    { headers },
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("findByEmail failed:", response.status, errText);
    throw new Error("Server error, try again later");
  }
  const row = (await response.json())[0] ?? null;
  if (!row) return null;
  return {
    ...row,
    firstName: row.firstname ?? row.firstName ?? "",
    lastName: row.lastname ?? row.lastName ?? "",
  };
}

export async function checkEmailAvailable(email) {
  const normalized = checkEmail(email);
  if (await findByEmail(normalized)) {
    throw new Error("This email is already registered");
  }
  return normalized;
}

export async function checkUserExistsForReset(email) {
  const normalized = checkEmail(email);
  const user = await findByEmail(normalized);
  if (!user) {
    throw new Error("No account found with this email");
  }
  return {
    id: user.id,
    email: user.email || normalized,
    firstName: user.firstName || "",
  };
}

export async function sendVerificationCodeEmail({
  email,
  code,
  purpose = "signup",
  firstName = "",
  language = "ru",
}) {
  const cleanEmail = checkEmail(email);
  const cleanCode = String(code || "").trim();
  const isRu = language !== "en";
  const cleanName = (firstName || "").trim() || (isRu ? "Читатель" : "Reader");

  const subject =
    purpose === "reset"
      ? isRu
        ? `Код для смены пароля Litera: ${cleanCode}`
        : `Litera Password Reset Code: ${cleanCode}`
      : isRu
        ? `Код подтверждения регистрации Litera: ${cleanCode}`
        : `Litera Registration Verification Code: ${cleanCode}`;

  const text =
    purpose === "reset"
      ? isRu
        ? `Здравствуйте, ${cleanName}!\n\nВаш 6-значный код для восстановления и смены пароля в книжном магазине Litera:\n\n${cleanCode}\n\nВведите этот код в окне смены пароля на сайте и укажите новый пароль.\nЕсли вы не запрашивали смену пароля, просто проигнорируйте это письмо.`
        : `Hello, ${cleanName}!\n\nYour 6-digit verification code to reset your password on Litera bookstore is:\n\n${cleanCode}\n\nEnter this code in the password reset window on the website.\nIf you did not request a password reset, please ignore this email.`
      : isRu
        ? `Здравствуйте, ${cleanName}!\n\nВаш 6-значный код для подтверждения электронной почты при регистрации в книжном магазине Litera:\n\n${cleanCode}\n\nВведите этот код в окне подтверждения на сайте, чтобы завершить создание аккаунта.`
        : `Hello, ${cleanName}!\n\nYour 6-digit verification code to confirm your email on Litera bookstore is:\n\n${cleanCode}\n\nEnter this code in the verification window on the website to complete your registration.`;

  const timeStr = new Date().toLocaleString(isRu ? "ru-RU" : "en-US");
  const templateParams = {
    to_email: cleanEmail,
    email: cleanEmail,
    user_email: cleanEmail,
    recipient: cleanEmail,
    to: cleanEmail,
    to_name: cleanName,
    user_name: cleanName,
    name: "Litera Bookstore",
    from_name: "Litera Bookstore",
    admin_name: "Litera Bookstore",
    sender_name: "Litera Bookstore",
    subject,
    title: subject,
    message: text,
    text,
    reply: text,
    content: text,
    code: cleanCode,
    verification_code: cleanCode,
    otp: cleanCode,
    time: timeStr,
    reply_to: "litera.eu@gmail.com",
  };

  if (typeof window !== "undefined") {
    const emailjs = await getEmailJs();
    const candidateServices = Array.from(
      new Set([EMAILJS_SERVICE_ID, "default_service", "service_zzl5x89"]),
    );
    for (const serviceId of candidateServices) {
      try {
        await emailjs.send(serviceId, EMAILJS_TEMPLATE_ID, templateParams, {
          publicKey: EMAILJS_PUBLIC_KEY,
        });
        return { success: true };
      } catch (err) {
        console.warn(
          `[EmailJS Verification] Service ${serviceId} attempt failed:`,
          err?.text || err?.message || err,
        );
      }
    }
  }

  const res = await fetch("/api/send-inquiry-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: cleanEmail,
      userName: cleanName,
      adminName: "Litera Bookstore",
      subject,
      text,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        (isRu
          ? "Не удалось отправить код подтверждения на email"
          : "Could not send verification code to email"),
    );
  }
  return { success: true };
}

export async function resetPasswordByEmail(email, newPassword) {
  const normalized = checkEmail(email);
  if (!newPassword || newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const user = await findByEmail(normalized);
  if (!user) {
    throw new Error("No account found with this email");
  }

  const bcrypt = await getBcrypt();
  const password_hash = await bcrypt.hash(newPassword, 10);
  const response = await fetch(
    `${TABLE_URL}?id=eq.${encodeURIComponent(user.id)}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ password_hash }),
    },
  );
  if (!response.ok) {
    throw new Error("Could not update password");
  }
  const rows = await response.json().catch(() => []);
  const updatedUser = rows[0] || user;
  setUserCookie(updatedUser);
  return updatedUser;
}

export function parseUserPhones(rawPhone) {
  if (!rawPhone) return [];
  if (Array.isArray(rawPhone)) {
    return rawPhone
      .map((p) =>
        typeof p === "string"
          ? p.trim()
          : (p?.phone || p?.number || "").trim(),
      )
      .filter(Boolean);
  }
  if (typeof rawPhone === "string") {
    try {
      const parsed = JSON.parse(rawPhone);
      if (Array.isArray(parsed)) {
        return parsed
          .map((p) =>
            typeof p === "string"
              ? p.trim()
              : (p?.phone || p?.number || "").trim(),
          )
          .filter(Boolean);
      }
      if (typeof parsed === "string" && parsed.trim()) {
        return [parsed.trim()];
      }
    } catch {
      // not JSON
    }
    if (rawPhone.trim()) return [rawPhone.trim()];
  }
  if (typeof rawPhone === "object") {
    const val = rawPhone.phone || rawPhone.number;
    if (typeof val === "string" && val.trim()) return [val.trim()];
  }
  return [];
}

export async function register({ firstName, lastName, email, password, phone }) {
  const normalized = checkEmail(email);
  if (await findByEmail(normalized)) {
    throw new Error("This email is already registered");
  }

  const phoneArray = phone && phone.trim() ? [phone.trim()] : [];
  const cleanFirstName = (firstName || "").trim();
  const cleanLastName = (lastName || "").trim();

  const bcrypt = await getBcrypt();
  const response = await fetch(TABLE_URL, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({
      firstname: cleanFirstName,
      lastname: cleanLastName,
      email: normalized,
      password_hash: await bcrypt.hash(password, 10),
      phone: phoneArray,
      status: "user",
      role: ["user"],
    }),
  });
  if (
    response.status === 409 ||
    (await response.clone().text()).includes("23505")
  ) {
    throw new Error("This email is already registered");
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("register failed:", response.status, errText);
    throw new Error("Could not create the account");
  }

  const rows = await response.json();
  const createdUser = rows[0] || {};
  setUserCookie({
    ...createdUser,
    firstName: cleanFirstName,
    lastName: cleanLastName,
  });
}

export async function login(email, password) {
  const identifier = (email || "").trim();
  if (!identifier) {
    throw new Error("Enter an email or login");
  }
  const [user, bcrypt] = await Promise.all([findByEmail(identifier), getBcrypt()]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new Error("Invalid email or password");
  }
  setUserCookie(user);
}

export function getCookieUser() {
  const pair = document.cookie.split("; ").find((c) => c.startsWith("user="));
  if (!pair) return null;
  try {
    return JSON.parse(decodeURIComponent(pair.slice(5)));
  } catch {
    return null;
  }
}

export function logout() {
  document.cookie = "user=; max-age=0; path=/; SameSite=Lax";
}

export async function getProfile() {
  const cookieUser = getCookieUser();
  if (!cookieUser) return null;

  const response = await fetch(
    `${TABLE_URL}?select=id,firstname,lastname,email,phone,adresses,status,role&id=eq.${encodeURIComponent(cookieUser.id)}&limit=1`,
    { headers },
  );
  const row = response.ok ? (await response.json())[0] : null;
  if (response.ok && !row) {
    logout();
    return null;
  }
  const phones = parseUserPhones(row?.phone);
  const primaryPhone =
    phones[0] || (typeof row?.phone === "string" ? row.phone.trim() : "");

  const userStatus =
    row?.status || (row?.role === "privileged" ? "privileged" : "user");
  const userRoles = resolveUserRoles({ status: userStatus, role: row?.role });
  const primaryRole = userRoles[0] || "user";
  const userFirstName = row?.firstname ?? row?.firstName ?? cookieUser.firstName ?? "";
  const userLastName = row?.lastname ?? row?.lastName ?? cookieUser.lastName ?? "";

  setUserCookie({
    id: cookieUser.id,
    firstName: userFirstName,
    lastName: userLastName,
    email: row?.email || cookieUser.email || "",
    status: userStatus,
    role: primaryRole,
    roles: userRoles,
  });

  return {
    id: cookieUser.id,
    firstName: userFirstName,
    lastName: userLastName,
    email: row?.email || cookieUser.email || "",
    status: userStatus,
    role: primaryRole,
    roles: userRoles,
    adresses: [],
    ...(row || {}),
    firstName: userFirstName,
    lastName: userLastName,
    phone: primaryPhone,
    phones,
  };
}

export function isPrivileged(user) {
  const u = user ?? getCookieUser();
  if (!u) return false;
  if (u.status === "privileged" || u.status === "привилегированный") return true;
  const roles = resolveUserRoles(u);
  return roles.some(
    (r) =>
      r === "admin" ||
      r === "developer" ||
      r === "vip" ||
      r === "privileged",
  );
}

export function hasRole(user, roleName) {
  const roles = resolveUserRoles(user);
  return roles.includes(roleName.toLowerCase().trim());
}

export async function getAllUsers() {
  try {
    const response = await fetch(
      `${TABLE_URL}?select=id,created_at,firstname,lastname,email,phone,status,role&order=created_at.desc`,
      { headers },
    );
    if (!response.ok) return [];
    const list = await response.json();
    if (!Array.isArray(list)) return [];
    return list.map((u) => {
      const userStatus =
        u.status || (u.role === "privileged" ? "privileged" : "user");
      const userRoles = resolveUserRoles({ status: userStatus, role: u.role });
      return {
        ...u,
        firstName: u.firstname ?? u.firstName ?? "",
        lastName: u.lastname ?? u.lastName ?? "",
        status: userStatus,
        roles: userRoles,
        role: u.role,
      };
    });
  } catch (err) {
    console.warn("Error fetching users:", err);
    return [];
  }
}

export async function updateUserStatus(userId, newStatus) {
  const payload = { status: newStatus };
  if (newStatus === "user") {
    payload.role = ["user"];
  } else if (newStatus === "privileged") {
    payload.role = ["vip"];
  }
  const response = await fetch(
    `${TABLE_URL}?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.message || "Could not update user status");
  }
  return (await response.json())[0];
}

export async function updateUserRoles(userId, newRoles) {
  let rolesArray = Array.isArray(newRoles) ? newRoles : [newRoles];
  rolesArray = rolesArray.filter(
    (r) => r === "developer" || r === "admin" || r === "vip",
  );
  if (rolesArray.length === 0) {
    rolesArray = ["vip"];
  }
  const payload = { role: rolesArray, status: "privileged" };
  const response = await fetch(
    `${TABLE_URL}?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.message || "Could not update user roles");
  }
  return (await response.json())[0];
}

export async function updateUserRole(userId, newRole) {
  if (newRole === "privileged" || newRole === "user") {
    return updateUserStatus(userId, newRole);
  }
  return updateUserRoles(userId, Array.isArray(newRole) ? newRole : [newRole]);
}

export async function createUserByAdmin({
  firstName,
  lastName = "",
  email,
  password,
  phone = "",
  status = "user",
  roles = ["user"],
}) {
  const cleanEmail = (email || "").trim();
  if (!cleanEmail) {
    throw new Error("Email/login is required");
  }
  if (!password || password.length < 4) {
    throw new Error("Password must be at least 4 characters");
  }

  // Check if a user with this email/login already exists
  const existing = await findByEmail(cleanEmail);
  if (existing) {
    throw new Error("User with this email/login already exists");
  }

  const phoneArray =
    Array.isArray(phone)
      ? phone
      : typeof phone === "string" && phone.trim()
        ? [phone.trim()]
        : [];

  // Hash the password with bcrypt (10 salt rounds)
  const bcrypt = await getBcrypt();
  const hashedPassword = await bcrypt.hash(password, 10);

  const isPriv = status === "privileged";
  let finalRoles;
  if (isPriv) {
    const filtered = (Array.isArray(roles) ? roles : [roles]).filter(
      (r) => r === "vip" || r === "admin" || r === "developer",
    );
    finalRoles = filtered.length > 0 ? filtered : ["vip"];
  } else {
    finalRoles = ["user"];
  }

  const payload = {
    firstname: (firstName || "").trim() || cleanEmail,
    lastname: (lastName || "").trim(),
    email: cleanEmail,
    password_hash: hashedPassword,
    phone: phoneArray,
    status: isPriv ? "privileged" : "user",
    role: finalRoles,
  };

  const response = await fetch(TABLE_URL, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });

  if (
    response.status === 409 ||
    (await response.clone().text()).includes("23505")
  ) {
    throw new Error("User with this email/login already exists");
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error("Could not create user:", errText);
    throw new Error("Could not create user in database");
  }

  const data = await response.json();
  const created = data && data[0];
  if (!created) {
    throw new Error("Failed to receive created user data");
  }

  const userStatus =
    created.status || (created.role === "privileged" ? "privileged" : "user");
  const userRoles = resolveUserRoles({ status: userStatus, role: created.role });

  return {
    ...created,
    status: userStatus,
    roles: userRoles,
    role: created.role,
  };
}

export async function getUserPhones(userId) {
  const id = userId ?? getCookieUser()?.id;
  if (!id) return [];
  const response = await fetch(
    `${TABLE_URL}?select=phone&id=eq.${encodeURIComponent(id)}&limit=1`,
    { headers },
  );
  if (!response.ok) return [];
  const data = await response.json();
  return parseUserPhones(data?.[0]?.phone);
}

export async function saveUserPhone(userId, newPhone) {
  const id = userId ?? getCookieUser()?.id;
  if (!id) throw new Error("User ID is required");
  if (!newPhone || typeof newPhone !== "string" || !newPhone.trim()) {
    return await getUserPhones(id);
  }
  const cleanPhone = newPhone.trim();
  const current = await getUserPhones(id);
  const normNew = cleanPhone.replace(/[^\d+]/g, "");
  const exists = current.some((p) => p.replace(/[^\d+]/g, "") === normNew);
  if (exists) {
    return current;
  }
  const updated = [...current, cleanPhone];
  const response = await fetch(
    `${TABLE_URL}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ phone: updated }),
    },
  );
  if (!response.ok) {
    throw new Error("Could not save phone to profile");
  }
  return updated;
}

export async function deleteUserPhone(userId, phoneToDelete) {
  const id = userId ?? getCookieUser()?.id;
  if (!id) throw new Error("User ID is required");
  const current = await getUserPhones(id);
  const normDelete = phoneToDelete.replace(/[^\d+]/g, "");
  const updated = current.filter(
    (p) => p.replace(/[^\d+]/g, "") !== normDelete,
  );
  const response = await fetch(
    `${TABLE_URL}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ phone: updated }),
    },
  );
  if (!response.ok) {
    throw new Error("Could not delete phone");
  }
  return updated;
}

export async function getUserAddresses(userId) {
  const id = userId ?? getCookieUser()?.id;
  if (!id) return [];
  const response = await fetch(
    `${TABLE_URL}?select=adresses&id=eq.${encodeURIComponent(id)}&limit=1`,
    { headers },
  );
  if (!response.ok) return [];
  const data = await response.json();
  const raw = data?.[0]?.adresses;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return [raw];
  return [];
}

export async function saveUserAddress(userId, newAddress) {
  const id = userId ?? getCookieUser()?.id;
  if (!id) throw new Error("User ID is required");
  const current = await getUserAddresses(id);
  const addressToSave = {
    id:
      newAddress.id ||
      `addr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    recipientName: newAddress.recipientName || "",
    country: newAddress.country || "",
    city: newAddress.city || "",
    street: newAddress.street || "",
    postalCode: newAddress.postalCode || "",
    savedAt: new Date().toISOString(),
  };
  const updated = [...current, addressToSave];
  const response = await fetch(
    `${TABLE_URL}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ adresses: updated }),
    },
  );
  if (!response.ok) {
    throw new Error("Could not save address to profile");
  }
  return addressToSave;
}

export async function deleteUserAddress(userId, addressId) {
  const id = userId ?? getCookieUser()?.id;
  if (!id) throw new Error("User ID is required");
  const current = await getUserAddresses(id);
  const updated = current.filter((addr) => addr.id !== addressId);
  const response = await fetch(
    `${TABLE_URL}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ adresses: updated }),
    },
  );
  if (!response.ok) {
    throw new Error("Could not delete address");
  }
  return updated;
}
