import { useCallback, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { useAuth } from "../../context/AuthContext";
import {
  getAllUsers,
  getCookieUser,
  getProfile,
  isLoggedIn,
  isPrivileged,
  resolveUserRoles,
  formatRoleName,
  updateUserStatus,
  updateUserRoles,
  createUserByAdmin,
} from "../../../utils/auth";
import { getAllOrdersAdmin, updateOrderStatus } from "../../../utils/orders";
import {
  createCoupon,
  deleteCoupon,
  getAllCoupons,
} from "../../../utils/coupons";
import {
  fetchAllInquiries,
  sendInquiryMessage,
  markInquiryReadByAdmin,
  getCandidateAdmins,
  transferInquiryAdmin,
} from "../../../utils/inquiries";
import {
  fetchAllAnnouncementsAdmin,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  reorderAnnouncements,
  translateAnnouncementWithAI,
} from "../../../utils/announcements";
import BookImage from "../common/BookImage";
import { RussianFlag, BritishFlag } from "../common/FlagIcon";
import decodeHtmlEntities from "../../../utils/decodeHtmlEntities";
import { useLanguage } from "../../context/languageContext";
import { useConfirm, useAlert } from "../../context/ConfirmContext";
import QogitaManager from "./QogitaManager";
import ProductImageQueue from "./ProductImageQueue";
import ProductsManager from "./ProductsManager";
import "./Privileged.css";

function formatPrice(price, currency = "EUR", language = "ru") {
  const locale = language === "ru" ? "ru-RU" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: currency === "EUR" ? 2 : 0,
  }).format(price || 0);
}

function formatDate(dateString, language = "ru") {
  if (!dateString) return "";
  try {
    const locale = language === "ru" ? "ru-RU" : "en-US";
    return new Date(dateString).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

const PRIVILEGED_TAB_ALIASES = {
  users: "users",
  privileged: "privileged",
  priviledged: "privileged",
  admins: "privileged",
  roles: "privileged",
  coupons: "coupons",
  orders: "orders",
  inquiries: "inquiries",
  messenger: "inquiries",
  messages: "inquiries",
  announcements: "announcements",
  "git-actions": "git-actions",
  gitactions: "git-actions",
  git: "git-actions",
  actions: "git-actions",
  products: "products",
  tovary: "products",
  items: "products",
  stock: "products",
  stocks: "products",
  catalog: "products",
  qogita: "qogita",
  "product-images": "product-images",
  productimages: "product-images",
  images: "product-images",
  photos: "product-images",
  other: "other",
  misc: "other",
  settings: "other",
};

function resolvePrivilegedTab(rawTab) {
  if (!rawTab) return "users";
  const key = String(rawTab).trim().toLowerCase();
  return PRIVILEGED_TAB_ALIASES[key] || "users";
}

function getPrivilegedBasePath(pathname = "") {
  if (pathname.startsWith("/priviledged")) return "/priviledged";
  if (pathname.startsWith("/admin")) return "/admin";
  return "/privileged";
}

export default function Privileged() {
  const { language, t } = useLanguage();
  const confirm = useConfirm();
  const customAlert = useAlert();
  const { tab: routeTab } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user: authUser, isLoggedIn: loggedIn, isPrivileged: isPrivContext } = useAuth();
  const cookieUser = authUser || getCookieUser();

  const [checkingAuth, setCheckingAuth] = useState(
    !loggedIn ? false : !isPrivContext && !isPrivileged(cookieUser),
  );
  const [isPrivilegedUser, setIsPrivilegedUser] = useState(() =>
    isPrivContext || isPrivileged(cookieUser),
  );

  useEffect(() => {
    if (isPrivContext) {
      setIsPrivilegedUser(true);
      setCheckingAuth(false);
    }
  }, [isPrivContext]);

  const [activeSection, setActiveSectionState] = useState(() => resolvePrivilegedTab(routeTab));

  useEffect(() => {
    const resolved = resolvePrivilegedTab(routeTab);
    setActiveSectionState(resolved);
    const basePath = getPrivilegedBasePath(location.pathname);
    if (!routeTab || String(routeTab).toLowerCase() !== resolved) {
      navigate(`${basePath}/${resolved}${location.search || ""}`, {
        replace: true,
        state: { preventScrollReset: true },
      });
    }
  }, [routeTab, location.pathname, location.search, navigate]);

  const setActiveSection = useCallback(
    (nextTab) => {
      const resolved = resolvePrivilegedTab(nextTab);
      setActiveSectionState(resolved);
      const basePath = getPrivilegedBasePath(location.pathname);
      const targetPath = `${basePath}/${resolved}`;
      if (location.pathname !== targetPath) {
        navigate(targetPath, { state: { preventScrollReset: true } });
      }
    },
    [location.pathname, navigate]
  );
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [actionNotice, setActionNotice] = useState(null);
  const [openCellPopover, setOpenCellPopover] = useState(null); // { id, field }

  // Create user modal state
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
    status: "user",
    roles: ["user"],
  });
  const [showCreateUserPassword, setShowCreateUserPassword] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  const handleGeneratePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let pass = "";
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCreateUserForm((prev) => ({ ...prev, password: pass }));
    setShowCreateUserPassword(true);
  };

  const resetCreateUserForm = () => {
    setCreateUserForm({
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      phone: "",
      status: "user",
      roles: ["user"],
    });
    setShowCreateUserPassword(false);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const cleanEmail = createUserForm.email.trim();
    if (!cleanEmail) {
      showNotice(
        language === "ru"
          ? "Укажите email или логин пользователя"
          : "Please specify user email or login",
        true,
      );
      return;
    }
    if (!createUserForm.password || createUserForm.password.length < 4) {
      showNotice(
        language === "ru"
          ? "Пароль должен содержать не менее 4 символов"
          : "Password must be at least 4 characters",
        true,
      );
      return;
    }

    setCreatingUser(true);
    try {
      const isPriv = createUserForm.status === "privileged";
      const sanitizedRoles = isPriv
        ? createUserForm.roles.filter(
            (r) => r !== "user" && (r === "vip" || r === "admin" || r === "developer"),
          )
        : ["user"];
      const finalRoles =
        isPriv && sanitizedRoles.length === 0 ? ["vip"] : sanitizedRoles;

      const newUser = await createUserByAdmin({
        firstName: createUserForm.firstName.trim() || cleanEmail,
        lastName: createUserForm.lastName.trim(),
        email: cleanEmail,
        password: createUserForm.password,
        phone: createUserForm.phone.trim(),
        status: isPriv ? "privileged" : "user",
        roles: finalRoles,
      });

      setUsers((prev) => [newUser, ...prev]);
      setShowCreateUserModal(false);
      resetCreateUserForm();
      showNotice(
        language === "ru"
          ? `Пользователь ${newUser.email} успешно создан!`
          : `User ${newUser.email} successfully created!`,
        false,
      );
    } catch (err) {
      showNotice(err.message, true);
    } finally {
      setCreatingUser(false);
    }
  };

  // New coupon form state
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponAudienceTab, setCouponAudienceTab] = useState("public"); // "public" | "personalized"
  const [couponFilter, setCouponFilter] = useState("all"); // "all" | "public" | "personalized"
  const [couponCode, setCouponCode] = useState("");
  const [couponName, setCouponName] = useState("");
  const [couponType, setCouponType] = useState("percent"); // "percent" | "fixed" | "gift" | "free_shipping"
  const [couponUsageType, setCouponUsageType] = useState("unlimited"); // "single" | "unlimited" | "limited"
  const [couponUsageLimit, setCouponUsageLimit] = useState("10");
  const [couponApplyScope, setCouponApplyScope] = useState("without_shipping"); // "without_shipping" | "with_shipping"
  const [couponDiscount, setCouponDiscount] = useState("10");
  const [couponFixedAmount, setCouponFixedAmount] = useState("5");
  const [couponMinAmount, setCouponMinAmount] = useState("");
  const [couponMaxAmount, setCouponMaxAmount] = useState("");
  const [giftName, setGiftName] = useState("");
  const [hasGiftCondition, setHasGiftCondition] = useState(false);
  const [giftConditionType, setGiftConditionType] = useState("purchased"); // "purchased" | "client"
  const [giftPurchasedAmount, setGiftPurchasedAmount] = useState("50");
  const [giftClientMode, setGiftClientMode] = useState("since"); // "since" | "already"
  const [giftClientSinceDate, setGiftClientSinceDate] = useState("");
  const [giftDurationYears, setGiftDurationYears] = useState("0");
  const [giftDurationMonths, setGiftDurationMonths] = useState("0");
  const [giftDurationDays, setGiftDurationDays] = useState("0");
  const [giftDurationHours, setGiftDurationHours] = useState("0");
  const [giftDurationMinutes, setGiftDurationMinutes] = useState("0");
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [applyToAllUsers, setApplyToAllUsers] = useState(true);
  const [userSearchText, setUserSearchText] = useState("");
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [couponDays, setCouponDays] = useState("30");
  const [couponSubmitting, setCouponSubmitting] = useState(false);

  // Git Actions state
  const [actionStatuses, setActionStatuses] = useState({});
  const [selectedLogAction, setSelectedLogAction] = useState(null);
  // DANGER ZONE: Full Database Refresh must always be confirmed by a human.
  // AI agents / automation must NEVER start this process on their own.
  const [dangerConfirm, setDangerConfirm] = useState(null); // workflow object | null
  const [dangerAcknowledged, setDangerAcknowledged] = useState(false);

  // Inquiries / Messenger state
  const [inquiries, setInquiries] = useState([]);
  const [selectedInquiryId, setSelectedInquiryId] = useState(null);
  const [inquiryReplyText, setInquiryReplyText] = useState("");
  const [sendingInquiryReply, setSendingInquiryReply] = useState(false);
  const [inquiryFilter, setInquiryFilter] = useState("all"); // "all" | "unread" | "guest" | "registered"
  const [inquirySearch, setInquirySearch] = useState("");
  const [expandedInquiryMsgIds, setExpandedInquiryMsgIds] = useState(
    () => new Set(),
  );

  const toggleInquiryMsgExpand = (id) => {
    setExpandedInquiryMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Inquiry transfer and history state
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [candidateAdmins, setCandidateAdmins] = useState([]);
  const [selectedTargetAdminId, setSelectedTargetAdminId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferring, setTransferring] = useState(false);

  const handleOpenTransferModal = async (inq) => {
    try {
      setTransferReason("");
      const admins = await getCandidateAdmins();
      setCandidateAdmins(admins || []);
      const currentAdminId = inq?.interlocutors_info?.adminId;
      const otherAdmins = (admins || []).filter((a) => a.id !== currentAdminId);
      setSelectedTargetAdminId(otherAdmins[0]?.id || admins?.[0]?.id || "");
      setTransferModalOpen(true);
    } catch (err) {
      console.warn("Failed to load candidate admins:", err);
      await customAlert({
        title: language === "ru" ? "Ошибка" : "Error",
        message:
          language === "ru"
            ? "Не удалось загрузить список администраторов"
            : "Failed to load admin list",
        type: "danger",
      });
    }
  };

  const handleConfirmTransfer = async () => {
    if (!activeInquiry || !selectedTargetAdminId || transferring) return;
    const targetAdmin = candidateAdmins.find(
      (a) => a.id === selectedTargetAdminId,
    );
    if (!targetAdmin) return;

    setTransferring(true);
    try {
      const targetAdminName =
        `${targetAdmin.firstName || ""} ${targetAdmin.lastName || ""}`.trim() ||
        targetAdmin.email ||
        "Администратор";

      const updated = await transferInquiryAdmin({
        inquiryId: activeInquiry.id,
        toAdminId: targetAdmin.id,
        toAdminName: targetAdminName,
        toAdminEmail: targetAdmin.email || "",
        reason: transferReason,
        fromAdminUser: cookieUser || getCookieUser(),
      });

      const currentAdminId = (cookieUser || getCookieUser())?.id;
      const transferredAway =
        updated?.interlocutors_info?.adminId &&
        currentAdminId &&
        updated.interlocutors_info.adminId !== currentAdminId;

      setInquiries((prev) =>
        transferredAway
          ? prev.filter((i) => i.id !== activeInquiry.id)
          : prev.map((i) => (i.id === activeInquiry.id ? updated : i)),
      );
      if (transferredAway && selectedInquiryId === activeInquiry.id) {
        setSelectedInquiryId(null);
      }
      setTransferModalOpen(false);
      setTransferReason("");

      await customAlert({
        title: language === "ru" ? "Клиент передан" : "Client Transferred",
        message:
          language === "ru"
            ? `Диалог с клиентом успешно передан администратору: ${targetAdminName}`
            : `Client inquiry has been successfully transferred to: ${targetAdminName}`,
        type: "success",
      });
    } catch (err) {
      console.error("Transfer error:", err);
      await customAlert({
        title: language === "ru" ? "Ошибка передачи" : "Transfer Error",
        message:
          err.message ||
          (language === "ru"
            ? "Не удалось передать диалог"
            : "Failed to transfer inquiry"),
        type: "danger",
      });
    } finally {
      setTransferring(false);
    }
  };

  // Announcements state
  const [announcements, setAnnouncements] = useState([]);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [announcementFilter, setAnnouncementFilter] = useState("all"); // "all" | "small" | "large"
  const [announcementType, setAnnouncementType] = useState("small"); // "small" | "large"
  const [announcementTextRu, setAnnouncementTextRu] = useState("");
  const [announcementTextEn, setAnnouncementTextEn] = useState("");
  const [announcementImageUrlRu, setAnnouncementImageUrlRu] = useState("");
  const [announcementImageUrlEn, setAnnouncementImageUrlEn] = useState("");
  const [announcementLinkUrlRu, setAnnouncementLinkUrlRu] = useState("");
  const [announcementLinkUrlEn, setAnnouncementLinkUrlEn] = useState("");
  const [announcementFrom, setAnnouncementFrom] = useState("");
  const [announcementUntil, setAnnouncementUntil] = useState("");
  const [announcementActive, setAnnouncementActive] = useState(true);

  // Other / site settings state
  const [minOrderFrom, setMinOrderFrom] = useState("");
  const [minOrderTo, setMinOrderTo] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [catalogMinOrders, setCatalogMinOrders] = useState([]);

  useEffect(() => {
    if (!isPrivilegedUser || activeSection !== "other") return;
    let cancelled = false;
    fetch("/api/admin/settings", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || data.error) return;
        setMinOrderFrom(data.minOrderFrom ? String(data.minOrderFrom) : "");
        setMinOrderTo(data.minOrderTo ? String(data.minOrderTo) : "");
        setSettingsLoaded(true);
      })
      .catch(() => {});
    import("../../../utils/perfumes").then(async (mod) => {
      try {
        const all = await mod.getPerfumes({ refresh: true });
        if (!cancelled) setCatalogMinOrders(all.map((p) => mod.getPerfumeMinOrder(p)));
      } catch {
        // ignore
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isPrivilegedUser, activeSection]);

  const handleSaveSettings = async (e) => {
    e?.preventDefault();
    const from = minOrderFrom === "" ? 0 : Number(minOrderFrom);
    const to = minOrderTo === "" ? 0 : Number(minOrderTo);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0) {
      showNotice(language === "ru" ? "Введите целые числа не меньше 0" : "Enter whole numbers, 0 or greater", true);
      return;
    }
    if (to > 0 && from > to) {
      showNotice(language === "ru" ? "«От» не может быть больше «До»" : "\"From\" cannot exceed \"To\"", true);
      return;
    }
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minOrderFrom: from, minOrderTo: to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const mod = await import("../../../utils/perfumes");
      await mod.fetchMinOrderSettings(true);
      showNotice(language === "ru" ? "Настройка сохранена" : "Setting saved");
    } catch (err) {
      showNotice(err.message, true);
    } finally {
      setSavingSettings(false);
    }
  };

  const settingsFromNum = minOrderFrom === "" ? 0 : Number(minOrderFrom) || 0;
  const settingsToNum = minOrderTo === "" ? 0 : Number(minOrderTo) || 0;
  const matchingPerfumesCount = catalogMinOrders.filter(
    (q) => q >= settingsFromNum && (!settingsToNum || q <= settingsToNum),
  ).length;

  // Check auth and verify privileged role/status
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    getProfile()
      .then((p) => {
        if (cancelled) return;
        if (isPrivileged(p)) {
          setIsPrivilegedUser(true);
        } else {
          setIsPrivilegedUser(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsPrivilegedUser(false);
      })
      .finally(() => {
        if (!cancelled) setCheckingAuth(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  // Load section data
  useEffect(() => {
    if (!isPrivilegedUser) return;
    let cancelled = false;

    Promise.all([
      getAllUsers(),
      getAllOrdersAdmin(),
      getAllCoupons(),
      fetchAllAnnouncementsAdmin(),
    ])
      .then(([usersList, ordersList, couponsList, annList]) => {
        if (!cancelled) {
          setUsers(usersList);
          setOrders(ordersList);
          setCoupons(couponsList);
          if (Array.isArray(annList)) setAnnouncements(annList);
        }
      })
      .catch((err) => {
        console.error("Error loading dashboard data:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [isPrivilegedUser]);

  // Poll Git Action statuses when tab is active
  useEffect(() => {
    if (!isPrivilegedUser || activeSection !== "git-actions") return;
    let cancelled = false;

    const fetchStatuses = async () => {
      try {
        const res = await fetch("/api/actions-status");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.actions) {
            setActionStatuses(data.actions);
          }
        }
      } catch {
        // Ignore polling network errors
      }
    };

    fetchStatuses();
    const interval = setInterval(fetchStatuses, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isPrivilegedUser, activeSection]);

  const handleRefresh = async () => {
    setLoadingData(true);
    try {
      const currentAdminId = (cookieUser || getCookieUser())?.id;
      const [usersList, ordersList, couponsList, inqList, annList] =
        await Promise.all([
          getAllUsers(),
          getAllOrdersAdmin(),
          getAllCoupons(),
          fetchAllInquiries(currentAdminId),
          fetchAllAnnouncementsAdmin(),
        ]);
      setUsers(usersList);
      setOrders(ordersList);
      setCoupons(couponsList);
      if (Array.isArray(inqList)) setInquiries(inqList);
      if (Array.isArray(annList)) setAnnouncements(annList);
      if (activeSection === "git-actions") {
        const res = await fetch("/api/actions-status");
        if (res.ok) {
          const data = await res.json();
          if (data.actions) setActionStatuses(data.actions);
        }
      }
    } catch (err) {
      console.error("Error refreshing data:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!isPrivilegedUser) return;
    let cancelled = false;

    const loadInquiries = async () => {
      try {
        const currentAdminId = (cookieUser || getCookieUser())?.id;
        const list = await fetchAllInquiries(currentAdminId);
        if (!cancelled && Array.isArray(list)) {
          setInquiries(list);
          if (selectedInquiryId) {
            const current = list.find((i) => i.id === selectedInquiryId);
            if (current && current.notifications_admin > 0) {
              markInquiryReadByAdmin(current.id);
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load inquiries:", err);
      }
    };

    loadInquiries();
    const interval = setInterval(loadInquiries, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isPrivilegedUser, selectedInquiryId]);

  // Auto-select first inquiry if none is selected
  useEffect(() => {
    if (!selectedInquiryId && inquiries.length > 0) {
      setSelectedInquiryId(inquiries[0].id);
    }
  }, [inquiries, selectedInquiryId]);

  const handleRunAction = async (actionId, actionTitle) => {
    setActionStatuses((prev) => ({
      ...prev,
      [actionId]: {
        ...(prev[actionId] || {}),
        status: "running",
        startedAt: new Date().toISOString(),
        output: `[${new Date().toLocaleTimeString()}] Starting ${actionTitle}...\n`,
      },
    }));

    try {
      const res = await fetch("/api/run-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start action");
      }
      showNotice(
        language === "ru"
          ? `Действие "${actionTitle}" успешно запущено!`
          : `Action "${actionTitle}" successfully started!`,
      );
    } catch (err) {
      setActionStatuses((prev) => ({
        ...prev,
        [actionId]: {
          ...(prev[actionId] || {}),
          status: "error",
          error: err.message,
        },
      }));
      showNotice(err.message, true);
    }
  };

  const showNotice = (msg, isError = false) => {
    setActionNotice({ msg, isError });
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleCopyText = (text, label) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      showNotice(`${label ? `${label} ` : ""}${t("privileged.users.copied")}`);
    }
  };

  useEffect(() => {
    if (!openCellPopover) return;
    const handleClickOutside = (e) => {
      if (
        !e.target.closest(".privileged__cell-popover") &&
        !e.target.closest(".privileged__truncate-btn")
      ) {
        setOpenCellPopover(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openCellPopover]);

  const handleToggleUserStatus = async (targetUser) => {
    const isTargetPrivileged =
      targetUser.status === "privileged" ||
      targetUser.status === "priveleged" ||
      targetUser.role === "privileged";
    const nextStatus = isTargetPrivileged ? "user" : "privileged";
    try {
      await updateUserStatus(targetUser.id, nextStatus);
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== targetUser.id) return u;
          const updated = {
            ...u,
            status: nextStatus,
            role: nextStatus === "user" ? ["user"] : ["vip"],
          };
          const resolvedRoles = resolveUserRoles(updated);
          return {
            ...updated,
            roles: resolvedRoles,
          };
        }),
      );
      showNotice(
        isTargetPrivileged
          ? `${t("privileged.users.noticeRevoked")} ${targetUser.email}`
          : language === "ru"
            ? `Пользователь ${targetUser.email} получил статус привилегированного (роль VIP)`
            : `User ${targetUser.email} is now privileged (role VIP)`,
      );
    } catch (err) {
      showNotice(err.message, true);
    }
  };

  const handleToggleUserRole = async (targetUser, roleToToggle) => {
    const currentRoles = resolveUserRoles(targetUser);
    let newRoles;

    if (currentRoles.includes(roleToToggle)) {
      newRoles = currentRoles.filter(
        (r) => r !== roleToToggle && r !== "user",
      );
      if (newRoles.length === 0) {
        newRoles = ["vip"];
      }
    } else {
      newRoles = [
        ...currentRoles.filter((r) => r !== "user"),
        roleToToggle,
      ];
    }

    try {
      await updateUserRoles(targetUser.id, newRoles);

      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== targetUser.id) return u;
          const updated = {
            ...u,
            status: "privileged",
            role: newRoles,
          };
          const resolvedRoles = resolveUserRoles(updated);
          return {
            ...updated,
            roles: resolvedRoles,
          };
        }),
      );

      const resolved = resolveUserRoles({
        status: "privileged",
        role: newRoles,
      });

      showNotice(
        language === "ru"
          ? `Роли пользователя ${targetUser.email} обновлены: ${resolved.map((r) => formatRoleName(r, "ru")).join(", ")}`
          : `Roles for ${targetUser.email} updated: ${resolved.map((r) => formatRoleName(r, "en")).join(", ")}`,
      );
    } catch (err) {
      showNotice(err.message, true);
    }
  };

  const handleSelectInquiry = async (id) => {
    setSelectedInquiryId(id);
    const target = inquiries.find((i) => i.id === id);
    if (target && target.notifications_admin > 0) {
      setInquiries((prev) =>
        prev.map((i) => (i.id === id ? { ...i, notifications_admin: 0 } : i)),
      );
      await markInquiryReadByAdmin(id);
    }
  };

  const handleSendAdminReply = async (e) => {
    e?.preventDefault();
    const text = inquiryReplyText.trim();
    const targetId = selectedInquiryId || activeInquiry?.id;
    if (!text || sendingInquiryReply) return;

    if (!targetId) {
      showNotice(
        language === "ru"
          ? "Выберите обращение для ответа"
          : "Please select an inquiry to reply",
        true,
      );
      return;
    }

    setSendingInquiryReply(true);
    try {
      const activeAdminUser = cookieUser || getCookieUser();
      const updated = await sendInquiryMessage({
        inquiryId: targetId,
        text,
        sender: "admin",
        senderUser: activeAdminUser,
      });

      setSelectedInquiryId(targetId);
      setInquiryReplyText("");
      setInquiries((prev) =>
        prev.map((inq) => (inq.id === targetId ? updated : inq)),
      );

      const isGuest = Boolean(updated?.interlocutors_info?.isGuest);
      if (isGuest) {
        if (updated?.emailResult?.result?.warning) {
          showNotice(
            language === "ru"
              ? `Ответ отправлен в чат. В тестовом режиме Resend письмо доставлено на ${updated.emailResult.result.deliveredTo} (для отправки гостю ${updated.interlocutors_info.userEmail} подтвердите домен в resend.com)`
              : `Reply sent to chat. Delivered to ${updated.emailResult.result.deliveredTo} in Resend sandbox mode`,
          );
        } else if (updated?.emailResult?.error) {
          showNotice(
            language === "ru"
              ? `Ответ отправлен в чат, но email не доставлен: ${updated.emailResult.error}`
              : `Reply sent to chat, but email delivery failed: ${updated.emailResult.error}`,
            true,
          );
        } else {
          showNotice(
            language === "ru"
              ? `Ответ отправлен пользователю в чат и на email ${updated.interlocutors_info.userEmail}`
              : `Reply sent to chat and delivered to email ${updated.interlocutors_info.userEmail}`,
          );
        }
      } else {
        showNotice(
          language === "ru" ? "Ответ отправлен" : "Reply sent successfully",
        );
      }
    } catch (err) {
      console.error("Failed to send admin reply:", err);
      showNotice(
        err?.message ||
          (language === "ru"
            ? "Не удалось отправить ответ"
            : "Failed to send reply"),
        true,
      );
    } finally {
      setSendingInquiryReply(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)),
      );
      const statusLabel =
        newStatus === "completed"
          ? t("privileged.orders.statusCompleted")
          : t("privileged.orders.statusInProgress");
      showNotice(`${t("privileged.orders.statusUpdated")} "${statusLabel}"`);
    } catch (err) {
      showNotice(err.message, true);
    }
  };

  const resetCouponForm = () => {
    setCouponAudienceTab("public");
    setCouponCode("");
    setCouponName("");
    setCouponType("percent");
    setCouponUsageType("unlimited");
    setCouponUsageLimit("10");
    setCouponApplyScope("without_shipping");
    setCouponDiscount("10");
    setCouponFixedAmount("5");
    setCouponMinAmount("");
    setCouponMaxAmount("");
    setGiftName("");
    setHasGiftCondition(false);
    setGiftConditionType("purchased");
    setGiftPurchasedAmount("50");
    setGiftClientMode("since");
    setGiftClientSinceDate("");
    setGiftDurationYears("0");
    setGiftDurationMonths("0");
    setGiftDurationDays("0");
    setGiftDurationHours("0");
    setGiftDurationMinutes("0");
    setSelectedUserIds([]);
    setApplyToAllUsers(true);
    setUserSearchText("");
    setUserSearchOpen(false);
    setCouponDays("30");
  };

  const handleGenerateCouponCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCouponCode(code);
  };

  const handleSelectUser = (userId) => {
    if (!selectedUserIds.includes(userId)) {
      setSelectedUserIds((prev) => [...prev, userId]);
      setApplyToAllUsers(false);
    }
    setUserSearchText("");
    setUserSearchOpen(false);
  };

  const handleRemoveUser = (userId) => {
    const next = selectedUserIds.filter((id) => id !== userId);
    setSelectedUserIds(next);
    if (next.length === 0) {
      setApplyToAllUsers(true);
    }
  };

  const handleToggleApplyToAll = (checked) => {
    setApplyToAllUsers(checked);
    if (checked) {
      setSelectedUserIds([]);
    }
  };

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    if (!couponCode.trim()) return;

    if (
      couponAudienceTab === "personalized" &&
      !applyToAllUsers &&
      selectedUserIds.length === 0
    ) {
      await customAlert({
        title:
          language === "ru" ? "Пользователи не выбраны" : "No Users Selected",
        message: t("privileged.coupons.noUserSelectedAlert"),
        type: "warning",
      });
      return;
    }

    setCouponSubmitting(true);
    try {
      const now = new Date();
      const endsAt = new Date();
      endsAt.setDate(now.getDate() + (Number(couponDays) || 30));

      const isAudiencePublic = couponAudienceTab === "public";
      const isForAll = isAudiencePublic ? true : applyToAllUsers;
      const targetUserIds = isForAll ? [] : selectedUserIds;

      const maxUses =
        couponUsageType === "single"
          ? 1
          : couponUsageType === "limited"
            ? Math.max(1, Number(couponUsageLimit) || 1)
            : null;

      const actionPayload = {
        type: couponType,
        applyScope:
          couponType === "percent" || couponType === "fixed"
            ? couponApplyScope
            : "without_shipping",
        applyToShipping:
          (couponType === "percent" || couponType === "fixed") &&
          couponApplyScope === "with_shipping",
        percent:
          couponType === "percent" ? Number(couponDiscount) || 10 : undefined,
        amount:
          couponType === "fixed" ? Number(couponFixedAmount) || 5 : undefined,
        minAmount:
          couponMinAmount !== "" ? Number(couponMinAmount) : undefined,
        maxAmount:
          (couponType === "percent" || couponType === "fixed") &&
          couponMaxAmount !== ""
            ? Number(couponMaxAmount)
            : undefined,
        usageType: couponUsageType,
        maxUses,
        usedCount: 0,
        usedByUsers: [],
        hasCondition: hasGiftCondition,
        condition: hasGiftCondition
          ? {
              type: giftConditionType,
              amount:
                giftConditionType === "purchased"
                  ? Number(giftPurchasedAmount) || 0
                  : undefined,
              clientMode:
                giftConditionType === "client" ? giftClientMode : undefined,
              sinceDate:
                giftConditionType === "client" && giftClientMode === "since"
                  ? giftClientSinceDate
                  : undefined,
              duration:
                giftConditionType === "client" && giftClientMode === "already"
                  ? {
                      years: Number(giftDurationYears) || 0,
                      months: Number(giftDurationMonths) || 0,
                      days: Number(giftDurationDays) || 0,
                      hours: Number(giftDurationHours) || 0,
                      minutes: Number(giftDurationMinutes) || 0,
                    }
                  : undefined,
            }
          : null,
        gift:
          couponType === "gift"
            ? {
                name: giftName.trim() || t("privileged.coupons.giftBadge"),
                hasCondition: hasGiftCondition,
                condition: hasGiftCondition
                  ? {
                      type: giftConditionType,
                      amount:
                        giftConditionType === "purchased"
                          ? Number(giftPurchasedAmount) || 0
                          : undefined,
                      clientMode:
                        giftConditionType === "client"
                          ? giftClientMode
                          : undefined,
                      sinceDate:
                        giftConditionType === "client" &&
                        giftClientMode === "since"
                          ? giftClientSinceDate
                          : undefined,
                      duration:
                        giftConditionType === "client" &&
                        giftClientMode === "already"
                          ? {
                              years: Number(giftDurationYears) || 0,
                              months: Number(giftDurationMonths) || 0,
                              days: Number(giftDurationDays) || 0,
                              hours: Number(giftDurationHours) || 0,
                              minutes: Number(giftDurationMinutes) || 0,
                            }
                          : undefined,
                    }
                  : null,
              }
            : undefined,
        target: {
          applyToAll: isForAll,
          userIds: targetUserIds,
        },
      };

      const newCoupon = await createCoupon({
        code: couponCode.trim(),
        name:
          couponName.trim() ||
          (couponType === "free_shipping"
            ? (language === "ru" ? "Бесплатная доставка" : "Free shipping")
            : couponType === "gift"
              ? giftName.trim()
              : ""),
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        action: actionPayload,
      });

      setCoupons((prev) => [newCoupon, ...prev]);
      setShowCouponModal(false);
      resetCouponForm();
      showNotice(
        language === "ru"
          ? `Купон ${newCoupon.code} ${t("privileged.coupons.created")}`
          : `Coupon ${newCoupon.code} ${t("privileged.coupons.created")}`,
      );
    } catch (err) {
      showNotice(err.message, true);
    } finally {
      setCouponSubmitting(false);
    }
  };

  const handleDeleteCoupon = async (id, code) => {
    const confirmMsg = `${t("privileged.coupons.confirmDelete")} ${code}?`;
    const ok = await confirm({
      title: language === "ru" ? "Удаление купона" : "Delete Coupon",
      message: confirmMsg,
      confirmText: language === "ru" ? "Удалить купон" : "Delete Coupon",
      type: "danger",
    });
    if (!ok) return;

    try {
      await deleteCoupon(id);
      setCoupons((prev) => prev.filter((c) => c.id !== id));
      showNotice(
        language === "ru"
          ? `Купон ${code} ${t("privileged.coupons.deleted")}`
          : `Coupon ${code} ${t("privileged.coupons.deleted")}`,
      );
    } catch (err) {
      showNotice(err.message, true);
    }
  };

  // Announcement Handlers
  const [translatingAnnouncement, setTranslatingAnnouncement] = useState(false);

  const handleOpenCreateAnnouncement = () => {
    const now = new Date();
    const formatIsoForInput = (d) => {
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setEditingAnnouncement(null);
    setAnnouncementType("small");
    setAnnouncementTextRu("");
    setAnnouncementTextEn("");
    setAnnouncementImageUrlRu("");
    setAnnouncementImageUrlEn("");
    setAnnouncementLinkUrlRu("");
    setAnnouncementLinkUrlEn("");
    setAnnouncementFrom(formatIsoForInput(now));
    // Default until to +7 days
    const defaultUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    setAnnouncementUntil(formatIsoForInput(defaultUntil));
    setAnnouncementActive(true);
    setAnnouncementModalOpen(true);
  };

  const handleOpenEditAnnouncement = (ann) => {
    const formatIsoForInput = (isoStr) => {
      if (!isoStr) return "";
      try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return "";
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      } catch {
        return "";
      }
    };

    setEditingAnnouncement(ann);
    setAnnouncementType(ann.type || "small");
    setAnnouncementTextRu(ann.text_ru || ann.ru?.text || ann.text || ann.text_en || "");
    setAnnouncementTextEn(ann.text_en || ann.en?.text || "");
    setAnnouncementImageUrlRu(
      ann.imageUrl_ru || ann.ru?.imageUrl || ann.imageUrl || ann.imageUrl_en || "",
    );
    setAnnouncementImageUrlEn(ann.imageUrl_en || ann.en?.imageUrl || "");
    setAnnouncementLinkUrlRu(
      ann.linkUrl_ru || ann.ru?.linkUrl || ann.linkUrl || ann.linkUrl_en || "",
    );
    setAnnouncementLinkUrlEn(ann.linkUrl_en || ann.en?.linkUrl || "");
    setAnnouncementFrom(formatIsoForInput(ann.from));
    setAnnouncementUntil(formatIsoForInput(ann.until));
    setAnnouncementActive(ann.active !== false);
    setAnnouncementModalOpen(true);
  };

  const handlePreviewAiTranslation = async () => {
    const raw = announcementTextRu.trim();
    if (!raw) return;
    setTranslatingAnnouncement(true);
    try {
      const translated = await translateAnnouncementWithAI(raw);
      if (translated.text_ru) setAnnouncementTextRu(translated.text_ru);
      if (translated.text_en) setAnnouncementTextEn(translated.text_en);
    } catch (err) {
      console.warn("AI translation preview error:", err);
    } finally {
      setTranslatingAnnouncement(false);
    }
  };

  const handleSaveAnnouncement = async (e) => {
    if (e) e.preventDefault();

    if (!announcementUntil) {
      showNotice(
        language === "ru"
          ? "Пожалуйста, укажите срок окончания показа объявления (обязательно)"
          : "Please specify the expiration date/time (required)",
        true,
      );
      return;
    }

    if (announcementType === "small") {
      if (!announcementTextRu.trim()) {
        showNotice(
          language === "ru"
            ? "Введите текст объявления (на любом языке — ИИ переведёт его на языки сайта)"
            : "Please enter the announcement text (in any language — AI will translate it)",
          true,
        );
        return;
      }
    }

    if (announcementType === "large") {
      if (!announcementImageUrlRu.trim()) {
        showNotice(
          language === "ru"
            ? "Для большого объявления укажите ссылку на фото плаката"
            : "Please provide a poster photo URL for the large announcement",
          true,
        );
        return;
      }
    }

    setSavingAnnouncement(true);
    try {
      let finalTextRu = announcementTextRu.trim();
      let finalTextEn = announcementTextEn.trim();

      if (announcementType === "small") {
        const translated = await translateAnnouncementWithAI(finalTextRu);
        finalTextRu = translated.text_ru || finalTextRu;
        finalTextEn = translated.text_en || finalTextRu;
      }

      const finalImgRu = announcementImageUrlRu.trim();
      const finalImgEn = (announcementImageUrlEn || announcementImageUrlRu).trim();
      const finalLinkRu = announcementLinkUrlRu.trim();
      const finalLinkEn = (announcementLinkUrlEn || announcementLinkUrlRu).trim();

      if (editingAnnouncement) {
        const updated = await updateAnnouncement(editingAnnouncement.id, {
          type: announcementType,
          text: finalTextRu,
          text_ru: finalTextRu,
          text_en: finalTextEn,
          imageUrl_ru: finalImgRu,
          imageUrl_en: finalImgEn,
          linkUrl_ru: finalLinkRu,
          linkUrl_en: finalLinkEn,
          from: announcementFrom || new Date().toISOString(),
          until: announcementUntil,
          active: announcementActive,
          order: editingAnnouncement.order,
          autoTranslate: false,
        });

        setAnnouncements((prev) =>
          prev.map((item) =>
            item.id === editingAnnouncement.id ? updated : item,
          ),
        );
        showNotice(
          language === "ru"
            ? "Объявление переведено ИИ на RU и EN и успешно обновлено"
            : "Announcement translated by AI into RU & EN and updated",
        );
      } else {
        const maxOrder = announcements.reduce(
          (max, a) => Math.max(max, a.order || 0),
          0,
        );
        const created = await createAnnouncement({
          type: announcementType,
          text: finalTextRu,
          text_ru: finalTextRu,
          text_en: finalTextEn,
          imageUrl_ru: finalImgRu,
          imageUrl_en: finalImgEn,
          linkUrl_ru: finalLinkRu,
          linkUrl_en: finalLinkEn,
          from: announcementFrom || new Date().toISOString(),
          until: announcementUntil,
          order: maxOrder + 1,
          userId: cookieUser?.id,
          autoTranslate: false,
        });

        setAnnouncements((prev) => [...prev, created]);
        showNotice(
          language === "ru"
            ? "Объявление переведено ИИ на русский и английский и размещено на сайте"
            : "Announcement translated by AI into Russian & English and published",
        );
      }
      setAnnouncementModalOpen(false);
    } catch (err) {
      console.error("Save announcement error:", err);
      showNotice(err.message || "Ошибка сохранения объявления", true);
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    const ok = await confirm({
      title: language === "ru" ? "Удаление объявления" : "Delete Announcement",
      message:
        language === "ru"
          ? "Вы уверены, что хотите удалить это объявление? Оно сразу перестанет показываться на сайте."
          : "Are you sure you want to delete this announcement? It will immediately stop showing on the website.",
      confirmText:
        language === "ru" ? "Удалить объявление" : "Delete Announcement",
      type: "danger",
    });
    if (!ok) return;

    try {
      await deleteAnnouncement(id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      showNotice(
        language === "ru" ? "Объявление удалено" : "Announcement deleted",
      );
    } catch (err) {
      console.error("Delete announcement error:", err);
      showNotice(err.message || "Ошибка при удалении", true);
    }
  };

  const handleMoveAnnouncement = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= announcements.length) return;

    const newList = [...announcements];
    const [movedItem] = newList.splice(index, 1);
    newList.splice(targetIndex, 0, movedItem);

    const reordered = newList.map((item, idx) => ({ ...item, order: idx + 1 }));
    setAnnouncements(reordered);

    try {
      await reorderAnnouncements(reordered);
      showNotice(
        language === "ru"
          ? "Порядок показывания сохранён"
          : "Announcement order updated",
      );
    } catch (err) {
      console.error("Reorder error:", err);
      showNotice(err.message || "Ошибка обновления порядка", true);
    }
  };

  const handleToggleAnnouncementActive = async (ann) => {
    try {
      const updated = await updateAnnouncement(ann.id, {
        ...ann,
        active: !ann.active,
      });
      setAnnouncements((prev) =>
        prev.map((item) => (item.id === ann.id ? updated : item)),
      );
      showNotice(
        language === "ru"
          ? updated.active
            ? "Объявление активировано"
            : "Объявление приостановлено"
          : updated.active
            ? "Announcement activated"
            : "Announcement paused",
      );
    } catch (err) {
      showNotice(err.message || "Ошибка обновления", true);
    }
  };

  const getAnnouncementStatusInfo = (ann) => {
    if (!ann.active) {
      return {
        label: language === "ru" ? "Приостановлено" : "Paused",
        badgeClass: "privileged__ann-badge--inactive",
        icon: "ri-pause-circle-line",
      };
    }
    const now = new Date();
    const until = new Date(ann.until);
    const from = ann.from ? new Date(ann.from) : null;

    if (until < now) {
      return {
        label: language === "ru" ? "Истекло" : "Expired",
        badgeClass: "privileged__ann-badge--expired",
        icon: "ri-time-line",
      };
    }
    if (from && from > now) {
      return {
        label: language === "ru" ? "Запланировано" : "Scheduled",
        badgeClass: "privileged__ann-badge--scheduled",
        icon: "ri-calendar-event-line",
      };
    }
    return {
      label: language === "ru" ? "Активно" : "Active",
      badgeClass: "privileged__ann-badge--active",
      icon: "ri-checkbox-circle-line",
    };
  };

  if (checkingAuth) {
    return (
      <section className="privileged section container">
        <div className="privileged__spinner-wrap">
          <div className="privileged__spinner" />
          <p>{t("privileged.checkingAuth")}</p>
        </div>
      </section>
    );
  }

  if (!loggedIn || !isPrivilegedUser) {
    return <Navigate to="/" replace />;
  }

  const privilegedUsers = users.filter((u) => isPrivileged(u));

  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
    const email = (u.email || "").toLowerCase();
    const phone = (
      Array.isArray(u.phone) ? u.phone.join(" ") : u.phone || ""
    ).toLowerCase();
    return name.includes(q) || email.includes(q) || phone.includes(q);
  });

  const filteredOrders = orders.filter((o) => {
    if (orderStatusFilter === "all") return true;
    const s = (o.status || "in_progress").toLowerCase();
    return s === orderStatusFilter;
  });

  const totalAdminUnread = inquiries.reduce(
    (acc, inq) => acc + (inq.notifications_admin || 0),
    0,
  );

  const filteredInquiries = inquiries.filter((inq) => {
    const info = inq.interlocutors_info || {};
    const isGuest = Boolean(info.isGuest);
    const unread = inq.notifications_admin || 0;

    if (inquiryFilter === "unread" && unread <= 0) return false;
    if (inquiryFilter === "guest" && !isGuest) return false;
    if (inquiryFilter === "registered" && isGuest) return false;

    if (!inquirySearch.trim()) return true;
    const q = inquirySearch.toLowerCase();
    const name = (info.userName || "").toLowerCase();
    const email = (info.userEmail || "").toLowerCase();
    const admin = (info.adminName || "").toLowerCase();
    const chatText = (inq.chat || [])
      .map((m) => m.text || "")
      .join(" ")
      .toLowerCase();

    return (
      name.includes(q) ||
      email.includes(q) ||
      admin.includes(q) ||
      chatText.includes(q)
    );
  });

  const activeInquiry =
    inquiries.find((i) => i.id === selectedInquiryId) ||
    filteredInquiries[0] ||
    null;

  const renderConditionFields = () => (
    <>
      <label className="privileged__checkbox-label">
        <input
          type="checkbox"
          checked={hasGiftCondition}
          onChange={(e) => setHasGiftCondition(e.target.checked)}
        />
        <span>{t("privileged.coupons.giftConditionCheckbox")}</span>
      </label>

      {hasGiftCondition && (
        <div className="privileged__condition-box">
          <div className="privileged__condition-row">
            <span className="privileged__condition-label">
              {t("privileged.coupons.ifText")}
            </span>
            <select
              value={giftConditionType}
              onChange={(e) => setGiftConditionType(e.target.value)}
              className="privileged__condition-select"
            >
              <option value="purchased">
                {t("privileged.coupons.condPurchased")}
              </option>
              <option value="client">
                {t("privileged.coupons.condOurClient")}
              </option>
            </select>

            {giftConditionType === "purchased" && (
              <>
                <span className="privileged__condition-label">
                  {t("privileged.coupons.onAmountText")}
                </span>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  placeholder="50"
                  value={giftPurchasedAmount}
                  onChange={(e) => setGiftPurchasedAmount(e.target.value)}
                  required
                  className="privileged__condition-number-input"
                />
              </>
            )}

            {giftConditionType === "client" && (
              <select
                value={giftClientMode}
                onChange={(e) => setGiftClientMode(e.target.value)}
                className="privileged__condition-select"
              >
                <option value="since">
                  {t("privileged.coupons.clientSinceOption")}
                </option>
                <option value="already">
                  {t("privileged.coupons.clientAlreadyOption")}
                </option>
              </select>
            )}
          </div>

          {giftConditionType === "client" && giftClientMode === "since" && (
            <div className="privileged__condition-subfield">
              <label>{t("privileged.coupons.clientSinceDateLabel")}</label>
              <input
                type="datetime-local"
                value={giftClientSinceDate}
                onChange={(e) => setGiftClientSinceDate(e.target.value)}
                required
                className="privileged__condition-date-input"
              />
            </div>
          )}

          {giftConditionType === "client" && giftClientMode === "already" && (
            <div className="privileged__condition-subfield">
              <label>{t("privileged.coupons.clientAlreadyOption")}</label>
              <div className="privileged__duration-grid">
                <div className="privileged__duration-item">
                  <input
                    type="number"
                    min="0"
                    value={giftDurationYears}
                    onChange={(e) => setGiftDurationYears(e.target.value)}
                  />
                  <span>{t("privileged.coupons.durationYears")}</span>
                </div>
                <div className="privileged__duration-item">
                  <input
                    type="number"
                    min="0"
                    max="11"
                    value={giftDurationMonths}
                    onChange={(e) => setGiftDurationMonths(e.target.value)}
                  />
                  <span>{t("privileged.coupons.durationMonths")}</span>
                </div>
                <div className="privileged__duration-item">
                  <input
                    type="number"
                    min="0"
                    max="31"
                    value={giftDurationDays}
                    onChange={(e) => setGiftDurationDays(e.target.value)}
                  />
                  <span>{t("privileged.coupons.durationDays")}</span>
                </div>
                <div className="privileged__duration-item">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={giftDurationHours}
                    onChange={(e) => setGiftDurationHours(e.target.value)}
                  />
                  <span>{t("privileged.coupons.durationHours")}</span>
                </div>
                <div className="privileged__duration-item">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={giftDurationMinutes}
                    onChange={(e) => setGiftDurationMinutes(e.target.value)}
                  />
                  <span>{t("privileged.coupons.durationMinutes")}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <section className="privileged section container">
      {actionNotice && (
        <div
          className={`privileged__notice ${actionNotice.isError ? "privileged__notice--error" : "privileged__notice--success"}`}
          role="alert"
        >
          <i
            className={
              actionNotice.isError
                ? "ri-error-warning-line"
                : "ri-checkbox-circle-line"
            }
          />
          <span>{actionNotice.msg}</span>
        </div>
      )}

      <div className="privileged__header">
        <div>
          <div className="privileged__badge-row">
            <span className="privileged__role-badge">
              <i className="ri-shield-check-line" />
              {t("privileged.badge")}
            </span>
          </div>
          <h1 className="privileged__title">{t("privileged.title")}</h1>
          <p className="privileged__subtitle">{t("privileged.subtitle")}</p>
        </div>

        <button
          type="button"
          className="button button--ghost privileged__refresh-btn"
          onClick={handleRefresh}
          disabled={loadingData}
          title={t("privileged.refreshTitle")}
        >
          <i
            className={`ri-restart-line privileged__refresh-icon ${loadingData ? "privileged__spin" : ""}`}
          />
          <span className="privileged__refresh-text">
            {t("privileged.refresh")}
          </span>
        </button>
      </div>

      {/* 5 Requested Buttons/Tabs */}
      <div className="privileged__nav-buttons" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "users"}
          className={`privileged__nav-btn ${activeSection === "users" ? "privileged__nav-btn--active" : ""}`}
          onClick={() => setActiveSection("users")}
        >
          <i className="ri-user-line" />
          <span>{t("privileged.tabs.users")}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "privileged"}
          className={`privileged__nav-btn ${activeSection === "privileged" ? "privileged__nav-btn--active" : ""}`}
          onClick={() => setActiveSection("privileged")}
        >
          <i className="ri-vip-crown-line" />
          <span>{t("privileged.tabs.privileged")}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "coupons"}
          className={`privileged__nav-btn ${activeSection === "coupons" ? "privileged__nav-btn--active" : ""}`}
          onClick={() => setActiveSection("coupons")}
        >
          <i className="ri-coupon-3-line" />
          <span>{t("privileged.tabs.coupons")}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "orders"}
          className={`privileged__nav-btn ${activeSection === "orders" ? "privileged__nav-btn--active" : ""}`}
          onClick={() => setActiveSection("orders")}
        >
          <i className="ri-shopping-bag-3-line" />
          <span>{t("privileged.tabs.orders")}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "inquiries"}
          className={`privileged__nav-btn ${activeSection === "inquiries" ? "privileged__nav-btn--active" : ""}`}
          onClick={() => setActiveSection("inquiries")}
        >
          <i className="ri-customer-service-2-line" />
          <span>{language === "ru" ? "Мессенджер" : "Messenger"}</span>
          {totalAdminUnread > 0 && (
            <span className="privileged__unread-indicator">
              +{totalAdminUnread}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "announcements"}
          className={`privileged__nav-btn ${activeSection === "announcements" ? "privileged__nav-btn--active" : ""}`}
          onClick={() => setActiveSection("announcements")}
        >
          <i className="ri-megaphone-line" />
          <span>{language === "ru" ? "Объявления" : "Announcements"}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "git-actions"}
          className={`privileged__nav-btn ${activeSection === "git-actions" ? "privileged__nav-btn--active" : ""}`}
          onClick={() => setActiveSection("git-actions")}
        >
          <i className="ri-github-fill" />
          <span>{t("privileged.tabs.gitActions")}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "qogita"}
          className={`privileged__nav-btn ${activeSection === "qogita" ? "privileged__nav-btn--active" : ""}`}
          onClick={() => setActiveSection("qogita")}
        >
          <i className="ri-shopping-bag-3-line" />
          <span>Qogita B2B</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "products"}
          className={`privileged__nav-btn ${activeSection === "products" ? "privileged__nav-btn--active" : ""}`}
          onClick={() => setActiveSection("products")}
        >
          <i className="ri-store-2-line" />
          <span>{language === "ru" ? "Товары" : "Products"}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "product-images"}
          className={`privileged__nav-btn ${activeSection === "product-images" ? "privileged__nav-btn--active" : ""}`}
          onClick={() => setActiveSection("product-images")}
        >
          <i className="ri-image-edit-line" />
          <span>{language === "ru" ? "Фото товаров" : "Product images"}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "other"}
          className={`privileged__nav-btn ${activeSection === "other" ? "privileged__nav-btn--active" : ""}`}
          onClick={() => setActiveSection("other")}
        >
          <i className="ri-settings-3-line" />
          <span>{language === "ru" ? "Прочее" : "Other"}</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="privileged__content">
        {/* SECTION 1: ПОЛЬЗОВАТЕЛИ */}
        {activeSection === "users" && (
          <div className="privileged__panel">
            <div className="privileged__panel-header">
              <div className="privileged__search-box">
                <i className="ri-search-line" />
                <input
                  type="text"
                  placeholder={t("privileged.users.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="privileged__search-clear"
                    onClick={() => setSearchQuery("")}
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="privileged__users-header-actions">
                {Boolean(searchQuery.trim()) && (
                  <span className="privileged__stats-text">
                    {t("privileged.users.found")}{" "}
                    <strong>{filteredUsers.length}</strong>
                  </span>
                )}
                <button
                  type="button"
                  className="button privileged__create-btn"
                  onClick={() => setShowCreateUserModal(true)}
                >
                  <i className="ri-user-add-line" />
                  <span>
                    {language === "ru"
                      ? "Создать пользователя"
                      : "Create User"}
                  </span>
                </button>
              </div>
            </div>

            <div className="privileged__table-wrap">
              <table className="privileged__table">
                <thead>
                  <tr>
                    <th>{t("privileged.users.thUser")}</th>
                    <th>{t("privileged.users.thEmail")}</th>
                    <th>{t("privileged.users.thPhone")}</th>
                    <th>{t("privileged.users.thRegistered")}</th>
                    <th>
                      <span className="privileged__th-main">
                        {language === "ru" ? "Статус" : "Status"}
                      </span>
                      <span className="privileged__th-sub">
                        {language === "ru"
                          ? "(нажмите чтобы изменить)"
                          : "(click to change)"}
                      </span>
                    </th>
                    <th>
                      <span className="privileged__th-main">
                        {language === "ru" ? "Роли" : "Roles"}
                      </span>
                      <span className="privileged__th-sub">
                        {language === "ru"
                          ? "(нажмите чтобы сменить)"
                          : "(click to change)"}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u, rowIndex) => {
                    const isStatusPriv =
                      u.status === "privileged" ||
                      u.status === "priveleged" ||
                      u.role === "privileged";
                    const userRolesList = resolveUserRoles(u);
                    const phones = Array.isArray(u.phone)
                      ? u.phone
                      : u.phone
                        ? [u.phone]
                        : [];
                    const isEmailOpen =
                      openCellPopover?.id === u.id &&
                      openCellPopover?.field === "email";
                    const isPhoneOpen =
                      openCellPopover?.id === u.id &&
                      openCellPopover?.field === "phone";
                    const isBottomRow =
                      rowIndex >= filteredUsers.length - 2 &&
                      filteredUsers.length > 2;
                    const phonesJoined = phones.join(", ");

                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="privileged__user-cell">
                            <div
                              className={`privileged__user-avatar ${isStatusPriv ? "privileged__user-avatar--star" : ""}`}
                            >
                              {(u.firstName?.[0] || "?").toUpperCase()}
                            </div>
                            <div>
                              <strong className="privileged__user-name">
                                {u.firstName} {u.lastName}
                              </strong>
                              <span className="privileged__user-id">
                                {u.id}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="privileged__cell-relative">
                          {u.email ? (
                            <div className="privileged__truncate-box">
                              <button
                                type="button"
                                className="privileged__truncate-btn privileged__link"
                                onClick={() =>
                                  setOpenCellPopover((prev) =>
                                    prev?.id === u.id && prev?.field === "email"
                                      ? null
                                      : { id: u.id, field: "email" },
                                  )
                                }
                                title={t("privileged.users.clickToView")}
                              >
                                <span className="privileged__truncate-text">
                                  {u.email}
                                </span>
                              </button>

                              {isEmailOpen && (
                                <div
                                  className={`privileged__cell-popover ${isBottomRow ? "privileged__cell-popover--top" : ""}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="privileged__cell-popover-header">
                                    <span className="privileged__cell-popover-title">
                                      <i className="ri-mail-line" />{" "}
                                      {t("privileged.users.thEmail")}
                                    </span>
                                    <button
                                      type="button"
                                      className="privileged__cell-popover-close"
                                      onClick={() => setOpenCellPopover(null)}
                                    >
                                      ×
                                    </button>
                                  </div>
                                  <div className="privileged__cell-popover-content">
                                    <a
                                      href={`mailto:${u.email}`}
                                      className="privileged__popover-full-text"
                                    >
                                      {u.email}
                                    </a>
                                    <button
                                      type="button"
                                      className="privileged__copy-btn"
                                      onClick={() =>
                                        handleCopyText(u.email, "Email")
                                      }
                                      title={t("privileged.users.copy")}
                                    >
                                      <i className="ri-file-copy-line" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="privileged__muted">—</span>
                          )}
                        </td>
                        <td className="privileged__cell-relative">
                          {phones.length > 0 ? (
                            <div className="privileged__truncate-box">
                              <button
                                type="button"
                                className="privileged__truncate-btn privileged__phone-btn"
                                onClick={() =>
                                  setOpenCellPopover((prev) =>
                                    prev?.id === u.id && prev?.field === "phone"
                                      ? null
                                      : { id: u.id, field: "phone" },
                                  )
                                }
                                title={t("privileged.users.clickToView")}
                              >
                                <span className="privileged__truncate-text privileged__phone-tag">
                                  {phonesJoined}
                                </span>
                              </button>

                              {isPhoneOpen && (
                                <div
                                  className={`privileged__cell-popover ${isBottomRow ? "privileged__cell-popover--top" : ""}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="privileged__cell-popover-header">
                                    <span className="privileged__cell-popover-title">
                                      <i className="ri-phone-line" />{" "}
                                      {t("privileged.users.thPhone")}
                                      {phones.length > 1
                                        ? ` (${phones.length})`
                                        : ""}
                                    </span>
                                    <button
                                      type="button"
                                      className="privileged__cell-popover-close"
                                      onClick={() => setOpenCellPopover(null)}
                                    >
                                      ×
                                    </button>
                                  </div>
                                  <div className="privileged__cell-popover-list">
                                    {phones.map((phone, idx) => (
                                      <div
                                        key={idx}
                                        className="privileged__cell-popover-item"
                                      >
                                        <a
                                          href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                                          className="privileged__popover-full-text privileged__phone-tag"
                                        >
                                          {phone}
                                        </a>
                                        <button
                                          type="button"
                                          className="privileged__copy-btn"
                                          onClick={() =>
                                            handleCopyText(
                                              phone,
                                              t("privileged.users.thPhone"),
                                            )
                                          }
                                          title={t("privileged.users.copy")}
                                        >
                                          <i className="ri-file-copy-line" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="privileged__muted">—</span>
                          )}
                        </td>
                        <td>{formatDate(u.created_at, language)}</td>
                        <td>
                          <button
                            type="button"
                            className={`privileged__status-toggle-btn ${isStatusPriv ? "privileged__status-toggle-btn--privileged" : "privileged__status-toggle-btn--user"}`}
                            onClick={() => handleToggleUserStatus(u)}
                            title={
                              isStatusPriv
                                ? language === "ru"
                                  ? "Нажмите, чтобы отозвать привилегии"
                                  : "Click to revoke privilege"
                                : language === "ru"
                                  ? "Нажмите, чтобы сделать привилегированным"
                                  : "Click to make privileged"
                            }
                          >
                            <i
                              className={
                                isStatusPriv
                                  ? "ri-vip-crown-fill"
                                  : "ri-user-line"
                              }
                            />
                            <span>
                              {isStatusPriv
                                ? language === "ru"
                                  ? "Привилегированный"
                                  : "Privileged"
                                : language === "ru"
                                  ? "Юзер"
                                  : "User"}
                            </span>
                          </button>
                        </td>
                        <td>
                          <div className="privileged__roles-cell">
                            {isStatusPriv ? (
                              <div className="privileged__role-quick-toggle">
                                {["vip", "admin", "developer"].map((r) => {
                                  const has = userRolesList.includes(r);
                                  return (
                                    <button
                                      key={r}
                                      type="button"
                                      className={`privileged__mini-role-btn ${has ? "privileged__mini-role-btn--active" : ""}`}
                                      onClick={() => handleToggleUserRole(u, r)}
                                      title={`${has ? (language === "ru" ? "Убрать роль " : "Remove role ") : language === "ru" ? "Назначить роль " : "Add role "}${formatRoleName(r, language)}`}
                                    >
                                      {has ? "✓ " : "+ "}
                                      {formatRoleName(r, language)}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="privileged__role-pill privileged__role-pill--user privileged__role-pill--clickable"
                                onClick={() =>
                                  showNotice(
                                    language === "ru"
                                      ? "Непривилегированный пользователь не может иметь других ролей"
                                      : "An unprivileged user cannot have other roles",
                                    true,
                                  )
                                }
                              >
                                {formatRoleName("user", language)}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan="6" className="privileged__no-data">
                        {t("privileged.users.empty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Create User Modal */}
            {showCreateUserModal && (
              <div
                className="privileged__modal-backdrop"
                onClick={() => {
                  if (!creatingUser) {
                    resetCreateUserForm();
                    setShowCreateUserModal(false);
                  }
                }}
              >
                <div
                  className="privileged__modal privileged__modal--create-user"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="privileged__modal-header">
                    <h3>
                      <i className="ri-user-add-line" />
                      {language === "ru"
                        ? "Создание нового пользователя"
                        : "Create New User"}
                    </h3>
                    <button
                      type="button"
                      className="privileged__modal-close"
                      disabled={creatingUser}
                      onClick={() => {
                        resetCreateUserForm();
                        setShowCreateUserModal(false);
                      }}
                    >
                      ×
                    </button>
                  </div>

                  <form onSubmit={handleCreateUser} className="privileged__create-user-form">
                    <div className="privileged__create-user-body">
                      <div className="privileged__form-row-2">
                        <div className="privileged__form-group">
                          <label className="privileged__form-label">
                            {language === "ru" ? "Имя" : "First Name"}{" "}
                            <span className="privileged__required">*</span>
                          </label>
                          <input
                            type="text"
                            className="privileged__form-input"
                            placeholder={language === "ru" ? "Введите имя" : "Enter first name"}
                            value={createUserForm.firstName}
                            onChange={(e) =>
                              setCreateUserForm((prev) => ({
                                ...prev,
                                firstName: e.target.value,
                              }))
                            }
                            required
                          />
                        </div>

                        <div className="privileged__form-group">
                          <label className="privileged__form-label">
                            {language === "ru" ? "Фамилия" : "Last Name"}
                          </label>
                          <input
                            type="text"
                            className="privileged__form-input"
                            placeholder={language === "ru" ? "Введите фамилию (необязательно)" : "Enter last name (optional)"}
                            value={createUserForm.lastName}
                            onChange={(e) =>
                              setCreateUserForm((prev) => ({
                                ...prev,
                                lastName: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="privileged__form-row-2">
                        <div className="privileged__form-group">
                          <label className="privileged__form-label">
                            {language === "ru" ? "Email или логин" : "Email or Login"}{" "}
                            <span className="privileged__required">*</span>
                          </label>
                          <input
                            type="text"
                            className="privileged__form-input"
                            placeholder={language === "ru" ? "ivan@al-warda.com или test_users" : "ivan@al-warda.com or test_users"}
                            value={createUserForm.email}
                            onChange={(e) =>
                              setCreateUserForm((prev) => ({
                                ...prev,
                                email: e.target.value,
                              }))
                            }
                            required
                          />
                          <span className="privileged__form-hint">
                            {language === "ru"
                              ? "Любой email или логин"
                              : "Standard email or custom username"}
                          </span>
                        </div>

                        <div className="privileged__form-group">
                          <label className="privileged__form-label">
                            {language === "ru" ? "Телефон" : "Phone"}
                          </label>
                          <input
                            type="text"
                            className="privileged__form-input"
                            placeholder="+39 312 345 6789"
                            value={createUserForm.phone}
                            onChange={(e) =>
                              setCreateUserForm((prev) => ({
                                ...prev,
                                phone: e.target.value,
                              }))
                            }
                          />
                          <span className="privileged__form-hint">
                            {language === "ru" ? "Необязательно" : "Optional"}
                          </span>
                        </div>
                      </div>

                      <div className="privileged__form-group">
                        <label className="privileged__form-label">
                          {language === "ru" ? "Пароль" : "Password"}{" "}
                          <span className="privileged__required">*</span>
                        </label>
                        <div className="privileged__pw-input-wrap">
                          <input
                            type={showCreateUserPassword ? "text" : "password"}
                            className="privileged__form-input"
                            placeholder={language === "ru" ? "Придумайте пароль" : "Create password"}
                            value={createUserForm.password}
                            onChange={(e) =>
                              setCreateUserForm((prev) => ({
                                ...prev,
                                password: e.target.value,
                              }))
                            }
                            required
                            minLength={4}
                          />
                          <button
                            type="button"
                            className="privileged__pw-btn"
                            onClick={() => setShowCreateUserPassword((prev) => !prev)}
                            title={showCreateUserPassword ? "Скрыть пароль" : "Показать пароль"}
                          >
                            <i className={showCreateUserPassword ? "ri-eye-off-line" : "ri-eye-line"} />
                          </button>
                          <button
                            type="button"
                            className="privileged__pw-btn privileged__pw-btn--gen"
                            onClick={handleGeneratePassword}
                            title={language === "ru" ? "Сгенерировать безопасный пароль" : "Generate random password"}
                          >
                            <i className="ri-magic-line" />
                            <span>{language === "ru" ? "Сгенерировать" : "Generate"}</span>
                          </button>
                        </div>
                      </div>

                      <div className="privileged__form-group">
                        <label className="privileged__form-label">
                          {language === "ru" ? "Статус пользователя" : "User Status"}
                        </label>
                        <div className="privileged__radio-group">
                          <label className={`privileged__radio-card ${createUserForm.status === "user" ? "privileged__radio-card--active" : ""}`}>
                            <input
                              type="radio"
                              name="create-user-status"
                              value="user"
                              checked={createUserForm.status === "user"}
                              onChange={() =>
                                setCreateUserForm((prev) => ({
                                  ...prev,
                                  status: "user",
                                  roles: ["user"],
                                }))
                              }
                            />
                            <div className="privileged__radio-card-info">
                              <span className="privileged__radio-card-title">
                                <i className="ri-user-line" />
                                {language === "ru" ? "Обычный пользователь" : "Standard User"}
                              </span>
                              <span className="privileged__radio-card-desc">
                                {language === "ru" ? "Стандартный аккаунт покупателя" : "Regular customer account"}
                              </span>
                            </div>
                          </label>
                          <label className={`privileged__radio-card ${createUserForm.status === "privileged" ? "privileged__radio-card--active" : ""}`}>
                            <input
                              type="radio"
                              name="create-user-status"
                              value="privileged"
                              checked={createUserForm.status === "privileged"}
                              onChange={() =>
                                setCreateUserForm((prev) => {
                                  const filtered = prev.roles.filter(
                                    (r) => r !== "user" && (r === "vip" || r === "admin" || r === "developer"),
                                  );
                                  return {
                                    ...prev,
                                    status: "privileged",
                                    roles: filtered.length > 0 ? filtered : ["vip"],
                                  };
                                })
                              }
                            />
                            <div className="privileged__radio-card-info">
                              <span className="privileged__radio-card-title">
                                <i className="ri-vip-crown-fill" />
                                {language === "ru" ? "Привилегированный" : "Privileged"}
                              </span>
                              <span className="privileged__radio-card-desc">
                                {language === "ru" ? "Доступ к панели управления" : "Access to dashboard & tools"}
                              </span>
                            </div>
                          </label>
                        </div>
                      </div>

                      {createUserForm.status === "privileged" && (
                        <div className="privileged__form-group">
                          <label className="privileged__form-label">
                            {language === "ru" ? "Назначить роли" : "Assign Roles"}
                          </label>
                          <div className="privileged__roles-box">
                            <div className="privileged__roles-checkboxes">
                              {["vip", "admin", "developer"].map((roleKey) => {
                                const isChecked = createUserForm.roles.includes(roleKey);
                                return (
                                  <label
                                    key={roleKey}
                                    className={`privileged__checkbox-pill ${isChecked ? "privileged__checkbox-pill--active" : ""}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        setCreateUserForm((prev) => {
                                          let nextRoles = isChecked
                                            ? prev.roles.filter((r) => r !== roleKey && r !== "user")
                                            : [...prev.roles.filter((r) => r !== "user"), roleKey];
                                          if (nextRoles.length === 0) {
                                            nextRoles = ["vip"];
                                          }
                                          return {
                                            ...prev,
                                            roles: nextRoles,
                                          };
                                        });
                                      }}
                                    />
                                    <span>{isChecked ? "✓ " : "+ "}{formatRoleName(roleKey, language)}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="privileged__modal-actions privileged__create-user-actions">
                      <button
                        type="button"
                        className="privileged__modal-action-btn privileged__modal-action-btn--cancel"
                        disabled={creatingUser}
                        onClick={() => {
                          resetCreateUserForm();
                          setShowCreateUserModal(false);
                        }}
                      >
                        {language === "ru" ? "Отмена" : "Cancel"}
                      </button>
                      <button
                        type="submit"
                        className="privileged__modal-action-btn privileged__modal-action-btn--confirm"
                        disabled={creatingUser}
                      >
                        <i className="ri-user-add-line" />
                        {creatingUser
                          ? language === "ru"
                            ? "Создание..."
                            : "Creating..."
                          : language === "ru"
                            ? "Создать пользователя"
                            : "Create User"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 2: ПРИВИЛЕГИРОВАННЫЕ ПОЛЬЗОВАТЕЛИ */}
        {activeSection === "privileged" && (
          <div className="privileged__panel">
            <div className="privileged__panel-header">
              <h2 className="privileged__panel-title">
                <i className="ri-vip-crown-fill" />
                {t("privileged.privilegedUsers.title")} (
                {privilegedUsers.length})
              </h2>
              <span className="privileged__stats-text">
                {t("privileged.privilegedUsers.subtitle")}
              </span>
            </div>

            <div className="privileged__grid">
              {privilegedUsers.map((u) => {
                const phones = Array.isArray(u.phone)
                  ? u.phone
                  : u.phone
                    ? [u.phone]
                    : [];
                return (
                  <div className="privileged__user-card" key={u.id}>
                    <div className="privileged__user-card-head">
                      <div className="privileged__user-avatar privileged__user-avatar--star">
                        {(u.firstName?.[0] || "?").toUpperCase()}
                      </div>
                      <div className="privileged__user-card-info">
                        <strong className="privileged__user-name">
                          {u.firstName} {u.lastName}
                        </strong>
                        <div className="privileged__user-roles-wrap">
                          <span className="privileged__role-pill privileged__role-pill--privileged">
                            {language === "ru"
                              ? "Привилегированный"
                              : "Privileged"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="privileged__user-card-details">
                      <div className="privileged__card-row">
                        <span>{t("privileged.privilegedUsers.email")}</span>
                        <a
                          href={`mailto:${u.email}`}
                          className="privileged__link"
                        >
                          {u.email}
                        </a>
                      </div>
                      <div className="privileged__card-row">
                        <span>{t("privileged.privilegedUsers.phones")}</span>
                        <span>{phones.join(", ") || "—"}</span>
                      </div>
                      <div className="privileged__card-row">
                        <span>
                          {t("privileged.privilegedUsers.registered")}
                        </span>
                        <span>{formatDate(u.created_at, language)}</span>
                      </div>
                      <div className="privileged__card-row">
                        <span>{t("privileged.privilegedUsers.id")}</span>
                        <code className="privileged__code">{u.id}</code>
                      </div>
                    </div>

                    <div className="privileged__user-card-actions">
                      <div className="privileged__role-quick-toggle">
                        {["vip", "admin", "developer"].map((r) => {
                          const userRolesList = resolveUserRoles(u);
                          const has = userRolesList.includes(r);
                          return (
                            <button
                              key={r}
                              type="button"
                              className={`privileged__mini-role-btn ${has ? "privileged__mini-role-btn--active" : ""}`}
                              onClick={() => handleToggleUserRole(u, r)}
                              title={`${has ? (language === "ru" ? "Убрать роль " : "Remove role ") : language === "ru" ? "Назначить роль " : "Add role "}${formatRoleName(r, language)}`}
                            >
                              {has ? "✓ " : "+ "}
                              {formatRoleName(r, language)}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className="button button--ghost privileged__btn-sm"
                        onClick={() => handleToggleUserStatus(u)}
                      >
                        <i className="ri-close-circle-line" />
                        {t("privileged.privilegedUsers.revokeBtn")}
                      </button>
                    </div>
                  </div>
                );
              })}
              {privilegedUsers.length === 0 && (
                <div className="privileged__empty-box">
                  <p>{t("privileged.privilegedUsers.empty")}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 3: КУПОНЫ */}
        {activeSection === "coupons" && (
          <div className="privileged__panel">
            <div className="privileged__panel-header">
              <div>
                <h2 className="privileged__panel-title">
                  <i className="ri-coupon-3-line" />
                  {t("privileged.coupons.title")}
                </h2>
                <span className="privileged__stats-text">
                  {t("privileged.coupons.total")} {coupons.length}
                </span>
              </div>
              <button
                type="button"
                className="button privileged__create-btn"
                onClick={() => setShowCouponModal(true)}
              >
                <i className="ri-add-line" />
                {t("privileged.coupons.createBtn")}
              </button>
            </div>

            {/* Filter Tabs: All, Public, Personalized */}
            {(() => {
              const publicCouponsCount = coupons.filter((c) => {
                const target = c.action?.target || {};
                return (
                  target.applyToAll !== false ||
                  !target.userIds ||
                  target.userIds.length === 0
                );
              }).length;

              const personalizedCouponsCount = coupons.filter((c) => {
                const target = c.action?.target || {};
                return (
                  target.applyToAll === false &&
                  target.userIds &&
                  target.userIds.length > 0
                );
              }).length;

              const displayedCoupons = coupons.filter((c) => {
                if (couponFilter === "all") return true;
                const target = c.action?.target || {};
                const isPublic =
                  target.applyToAll !== false ||
                  !target.userIds ||
                  target.userIds.length === 0;
                if (couponFilter === "public") return isPublic;
                if (couponFilter === "personalized") return !isPublic;
                return true;
              });

              return (
                <>
                  <div className="privileged__coupon-filter-tabs">
                    <button
                      type="button"
                      className={`privileged__coupon-filter-btn ${couponFilter === "all" ? "privileged__coupon-filter-btn--active" : ""}`}
                      onClick={() => setCouponFilter("all")}
                    >
                      {t("privileged.coupons.filterAll")} ({coupons.length})
                    </button>
                    <button
                      type="button"
                      className={`privileged__coupon-filter-btn ${couponFilter === "public" ? "privileged__coupon-filter-btn--active" : ""}`}
                      onClick={() => setCouponFilter("public")}
                    >
                      <i className="ri-global-line" />
                      {t("privileged.coupons.filterPublic")} (
                      {publicCouponsCount})
                    </button>
                    <button
                      type="button"
                      className={`privileged__coupon-filter-btn ${couponFilter === "personalized" ? "privileged__coupon-filter-btn--active" : ""}`}
                      onClick={() => setCouponFilter("personalized")}
                    >
                      <i className="ri-user-star-line" />
                      {t("privileged.coupons.filterPersonalized")} (
                      {personalizedCouponsCount})
                    </button>
                  </div>

                  {/* Coupons list */}
                  <div className="privileged__coupons-grid">
                    {displayedCoupons.map((coupon) => {
                      const action = coupon.action || {};
                      const isFreeShipping = action.type === "free_shipping";
                      const isPercent =
                        action.type === "percent" ||
                        (!action.type && action.percent != null);
                      const isFixed =
                        action.type === "fixed" ||
                        (!action.type && action.amount != null);
                      const isGift = action.type === "gift";

                      const discountLabel = isFreeShipping
                        ? `🚚 ${t("privileged.coupons.typeFreeShipping")}`
                        : isPercent
                          ? `${action.percent || 10}%`
                          : isFixed
                            ? `${action.amount || 0} €`
                            : isGift
                              ? `🎁 ${t("privileged.coupons.giftBadge")}`
                              : action.percent
                                ? `${action.percent}%`
                                : action.amount
                                  ? `${action.amount} €`
                                  : t("privileged.coupons.discountFallback");

                      const isExpired =
                        coupon.ends_at && new Date(coupon.ends_at) < new Date();
                      const target = action.target || {};
                      const isForAll =
                        target.applyToAll !== false ||
                        !target.userIds ||
                        target.userIds.length === 0;
                      const couponCondition =
                        (action.hasCondition && action.condition) ||
                        (action.gift?.hasCondition && action.gift?.condition) ||
                        action.condition;

                      return (
                        <div
                          className={`privileged__coupon-card ${isExpired ? "privileged__coupon-card--expired" : ""} ${isGift ? "privileged__coupon-card--gift" : ""} ${isFreeShipping ? "privileged__coupon-card--shipping" : ""}`}
                          key={coupon.id}
                        >
                          <div
                            className={`privileged__coupon-ticket ${isGift ? "privileged__coupon-ticket--gift" : ""} ${isFreeShipping ? "privileged__coupon-ticket--shipping" : ""}`}
                          >
                            <div className="privileged__coupon-code">
                              {coupon.code}
                            </div>
                            <div className="privileged__coupon-discount">
                              {discountLabel}
                            </div>
                          </div>
                          <div className="privileged__coupon-body">
                            <strong className="privileged__coupon-name">
                              {coupon.name ||
                                (isFreeShipping && t("privileged.coupons.typeFreeShipping")) ||
                                (isGift && action.gift?.name) ||
                                t("privileged.coupons.nameFallback")}
                            </strong>

                            {/* Coupon metadata tags */}
                            <div className="privileged__coupon-tags">
                              {/* Usage mode tag */}
                              <span className="privileged__coupon-tag privileged__coupon-tag--usage">
                                {action.usageType === "single" || action.maxUses === 1 ? (
                                  <>
                                    <i className="ri-user-follow-line" />
                                    <span>
                                      {t("privileged.coupons.singleBadge")} ({action.usedCount || 0}/1)
                                    </span>
                                  </>
                                ) : action.usageType === "limited" ? (
                                  <>
                                    <i className="ri-numbers-line" />
                                    <span>
                                      {t("privileged.coupons.usedTimes")} {action.usedCount || 0} {t("privileged.coupons.timesOf")} {action.maxUses}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <i className="ri-repeat-line" />
                                    <span>
                                      {t("privileged.coupons.unlimitedBadge")} ({action.usedCount || 0})
                                    </span>
                                  </>
                                )}
                              </span>

                              {(action.applyScope ||
                                action.applyToShipping != null ||
                                action.type === "percent" ||
                                action.type === "fixed") &&
                                action.type !== "free_shipping" && (
                                  <span
                                    className={`privileged__coupon-tag ${action.applyScope === "with_shipping" || action.applyToShipping ? "privileged__coupon-tag--shipping-scope" : ""}`}
                                  >
                                    <i
                                      className={
                                        action.applyScope === "with_shipping" ||
                                        action.applyToShipping
                                          ? "ri-truck-line"
                                          : "ri-shopping-basket-line"
                                      }
                                    />
                                    <span>
                                      {action.applyScope === "with_shipping" ||
                                      action.applyToShipping
                                        ? t("privileged.coupons.badgeWithShipping")
                                        : t("privileged.coupons.badgeWithoutShipping")}
                                    </span>
                                  </span>
                                )}

                              <span
                                className="privileged__coupon-tag"
                                title={
                                  !isForAll
                                    ? target.userIds
                                        .map((uid) => {
                                          const u = users.find(
                                            (x) => x.id === uid,
                                          );
                                          return u
                                            ? `${u.first_name || ""} ${u.last_name || ""} (${u.email})`.trim()
                                            : uid;
                                        })
                                        .join(", ")
                                    : ""
                                }
                              >
                                <i
                                  className={
                                    isForAll ? "ri-group-line" : "ri-user-line"
                                  }
                                />
                                {isForAll
                                  ? t("privileged.coupons.forAllUsers")
                                  : `${t("privileged.coupons.forUsersCount")} ${target.userIds.length}`}
                              </span>

                              {(action.minAmount != null ||
                                action.maxAmount != null) && (
                                <span className="privileged__coupon-tag">
                                  {action.minAmount != null &&
                                    `min: ${action.minAmount} €`}
                                  {action.minAmount != null &&
                                    action.maxAmount != null &&
                                    " / "}
                                  {action.maxAmount != null &&
                                    `max: ${action.maxAmount} €`}
                                </span>
                              )}

                              {couponCondition && (
                                <span className="privileged__coupon-tag privileged__coupon-tag--condition">
                                  <i className="ri-information-line" />
                                  {couponCondition.type === "purchased" && (
                                    <>
                                      {t("privileged.coupons.condPurchased")}:{" "}
                                      {couponCondition.amount} €
                                    </>
                                  )}
                                  {couponCondition.type === "client" &&
                                    couponCondition.clientMode === "since" && (
                                      <>
                                        {t("privileged.coupons.condOurClient")}{" "}
                                        {t(
                                          "privileged.coupons.clientSinceOption",
                                        )}{" "}
                                        {formatDate(
                                          couponCondition.sinceDate,
                                          language,
                                        )}
                                      </>
                                    )}
                                  {couponCondition.type === "client" &&
                                    couponCondition.clientMode ===
                                      "already" && (
                                      <>
                                        {t("privileged.coupons.condOurClient")}{" "}
                                        {t(
                                          "privileged.coupons.clientAlreadyOption",
                                        )}
                                        :{" "}
                                        {[
                                          couponCondition.duration?.years
                                            ? `${couponCondition.duration.years} ${t("privileged.coupons.durationYears")}`
                                            : null,
                                          couponCondition.duration?.months
                                            ? `${couponCondition.duration.months} ${t("privileged.coupons.durationMonths")}`
                                            : null,
                                          couponCondition.duration?.days
                                            ? `${couponCondition.duration.days} ${t("privileged.coupons.durationDays")}`
                                            : null,
                                          couponCondition.duration?.hours
                                            ? `${couponCondition.duration.hours} ${t("privileged.coupons.durationHours")}`
                                            : null,
                                          couponCondition.duration?.minutes
                                            ? `${couponCondition.duration.minutes} ${t("privileged.coupons.durationMinutes")}`
                                            : null,
                                        ]
                                          .filter(Boolean)
                                          .join(" ") || "0"}
                                      </>
                                    )}
                                </span>
                              )}
                            </div>

                            <div className="privileged__coupon-meta">
                              <span>
                                {t("privileged.coupons.validUntil")}{" "}
                                <strong>
                                  {coupon.ends_at
                                    ? formatDate(coupon.ends_at, language)
                                    : t("privileged.coupons.indefinite")}
                                </strong>
                              </span>
                              {isExpired && (
                                <span className="privileged__expired-badge">
                                  {t("privileged.coupons.expired")}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="privileged__coupon-delete-btn"
                              onClick={() =>
                                handleDeleteCoupon(coupon.id, coupon.code)
                              }
                              title={t("privileged.coupons.deleteTitle")}
                            >
                              <i className="ri-delete-bin-line" />
                              {t("privileged.coupons.deleteBtn")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {coupons.length === 0 && (
                      <div className="privileged__empty-box">
                        <i className="ri-ticket-2-line privileged__empty-icon" />
                        <p>{t("privileged.coupons.empty")}</p>
                        <button
                          type="button"
                          className="button button--ghost"
                          onClick={() => {
                            resetCouponForm();
                            setShowCouponModal(true);
                          }}
                        >
                          <i className="ri-add-line" />
                          {t("privileged.coupons.createFirst")}
                        </button>
                      </div>
                    )}
                    {coupons.length > 0 && displayedCoupons.length === 0 && (
                      <div className="privileged__empty-box">
                        <i className="ri-ticket-2-line privileged__empty-icon" />
                        <p>{t("privileged.coupons.empty")}</p>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Create Coupon Modal */}
            {showCouponModal && (
              <div
                className="privileged__modal-backdrop"
                onClick={() => {
                  resetCouponForm();
                  setShowCouponModal(false);
                }}
              >
                <div
                  className="privileged__modal privileged__modal--coupon"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="privileged__modal-header">
                    <h3>
                      <i className="ri-coupon-3-line" />
                      {t("privileged.coupons.modalTitle")}
                    </h3>
                    <button
                      type="button"
                      className="privileged__modal-close"
                      onClick={() => {
                        resetCouponForm();
                        setShowCouponModal(false);
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <form onSubmit={handleCreateCoupon}>
                    {/* Audience Switcher: Public Coupons vs Personalized Coupons */}
                    <div
                      className="privileged__coupon-modal-tabs"
                      role="tablist"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={couponAudienceTab === "public"}
                        className={`privileged__coupon-modal-tab ${couponAudienceTab === "public" ? "privileged__coupon-modal-tab--active" : ""}`}
                        onClick={() => {
                          setCouponAudienceTab("public");
                          setApplyToAllUsers(true);
                          setSelectedUserIds([]);
                        }}
                      >
                        <i className="ri-global-line" />
                        <div className="privileged__coupon-modal-tab-content">
                          <span className="privileged__coupon-modal-tab-title">
                            {t("privileged.coupons.tabPublic")}
                          </span>
                          <span className="privileged__coupon-modal-tab-sub">
                            {t("privileged.coupons.tabPublicDesc")}
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        role="tab"
                        aria-selected={couponAudienceTab === "personalized"}
                        className={`privileged__coupon-modal-tab ${couponAudienceTab === "personalized" ? "privileged__coupon-modal-tab--active" : ""}`}
                        onClick={() => {
                          setCouponAudienceTab("personalized");
                          setApplyToAllUsers(false);
                        }}
                      >
                        <i className="ri-user-star-line" />
                        <div className="privileged__coupon-modal-tab-content">
                          <span className="privileged__coupon-modal-tab-title">
                            {t("privileged.coupons.tabPersonalized")}
                          </span>
                          <span className="privileged__coupon-modal-tab-sub">
                            {t("privileged.coupons.tabPersonalizedDesc")}
                          </span>
                        </div>
                      </button>
                    </div>

                    {couponAudienceTab === "public" ? (
                      <div className="privileged__coupon-audience-info">
                        <i className="ri-information-line" />
                        <span>{t("privileged.coupons.publicHint")}</span>
                      </div>
                    ) : (
                      <>
                        <div className="privileged__coupon-audience-info privileged__coupon-audience-info--user">
                          <i className="ri-shield-user-line" />
                          <span>
                            {t("privileged.coupons.personalizedHint")}
                          </span>
                        </div>

                        {/* Target Users */}
                        <div className="privileged__form-field">
                          <label>
                            {t("privileged.coupons.targetUsersLabel")}
                          </label>
                          <div className="privileged__user-selector">
                            {selectedUserIds.length > 0 && (
                              <div className="privileged__selected-users">
                                {selectedUserIds.map((userId) => {
                                  const u = users.find((x) => x.id === userId);
                                  const name = u
                                    ? `${u.first_name || ""} ${u.last_name || ""}`.trim() ||
                                      u.email
                                    : userId;
                                  return (
                                    <span
                                      key={userId}
                                      className="privileged__user-chip"
                                    >
                                      <i className="ri-user-line" />
                                      <span
                                        className="privileged__user-chip-text"
                                        title={u?.email || ""}
                                      >
                                        {name}
                                      </span>
                                      <button
                                        type="button"
                                        className="privileged__user-chip-remove"
                                        onClick={() => handleRemoveUser(userId)}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            <div className="privileged__user-input-wrap">
                              <input
                                type="text"
                                placeholder={t(
                                  "privileged.coupons.targetUsersPlaceholder",
                                )}
                                value={userSearchText}
                                onChange={(e) => {
                                  setUserSearchText(e.target.value);
                                  setUserSearchOpen(true);
                                }}
                                onFocus={() => setUserSearchOpen(true)}
                              />
                              {userSearchOpen && (
                                <div className="privileged__user-dropdown">
                                  {users
                                    .filter((u) => {
                                      if (selectedUserIds.includes(u.id))
                                        return false;
                                      if (!userSearchText.trim()) return true;
                                      const q = userSearchText.toLowerCase();
                                      const fullName =
                                        `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase();
                                      const email = (
                                        u.email || ""
                                      ).toLowerCase();
                                      const phone = (
                                        u.phone || ""
                                      ).toLowerCase();
                                      return (
                                        fullName.includes(q) ||
                                        email.includes(q) ||
                                        phone.includes(q)
                                      );
                                    })
                                    .slice(0, 10)
                                    .map((u) => (
                                      <div
                                        key={u.id}
                                        className="privileged__user-dropdown-item"
                                        onClick={() => handleSelectUser(u.id)}
                                      >
                                        <div className="privileged__user-dropdown-avatar">
                                          {u.first_name?.[0]?.toUpperCase() ||
                                            u.email?.[0]?.toUpperCase() ||
                                            "U"}
                                        </div>
                                        <div className="privileged__user-dropdown-info">
                                          <div className="privileged__user-dropdown-name">
                                            {`${u.first_name || ""} ${u.last_name || ""}`.trim() ||
                                              t("privileged.users.thUser")}
                                          </div>
                                          <div className="privileged__user-dropdown-email">
                                            {u.email}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  {users.filter(
                                    (u) => !selectedUserIds.includes(u.id),
                                  ).length === 0 && (
                                    <div className="privileged__user-dropdown-empty">
                                      {t("privileged.users.empty")}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <label className="privileged__checkbox-label">
                            <input
                              type="checkbox"
                              checked={applyToAllUsers}
                              onChange={(e) =>
                                handleToggleApplyToAll(e.target.checked)
                              }
                            />
                            <span>{t("privileged.coupons.applyToAll")}</span>
                          </label>
                        </div>
                      </>
                    )}

                    {/* Coupon Code + Generator */}
                    <div className="privileged__form-field">
                      <label htmlFor="couponCode">
                        {t("privileged.coupons.codeLabel")}
                      </label>
                      <div className="privileged__code-input-group">
                        <input
                          id="couponCode"
                          type="text"
                          placeholder={t("privileged.coupons.codePlaceholder")}
                          required
                          value={couponCode}
                          onChange={(e) =>
                            setCouponCode(e.target.value.toUpperCase())
                          }
                          autoFocus
                        />
                        <button
                          type="button"
                          className="button button--ghost privileged__generate-code-btn"
                          onClick={handleGenerateCouponCode}
                          title={t("privileged.coupons.generateCodeTitle")}
                        >
                          <i className="ri-magic-line" />
                          {t("privileged.coupons.generateCode")}
                        </button>
                      </div>
                    </div>

                    {/* Description / Name */}
                    <div className="privileged__form-field">
                      <label htmlFor="couponName">
                        {t("privileged.coupons.descLabel")}
                      </label>
                      <input
                        id="couponName"
                        type="text"
                        placeholder={t("privileged.coupons.descPlaceholder")}
                        value={couponName}
                        onChange={(e) => setCouponName(e.target.value)}
                      />
                    </div>

                    {/* Coupon Type Selector */}
                    <div className="privileged__form-field">
                      <label>{t("privileged.coupons.typeLabel")}</label>
                      <div className="privileged__type-options">
                        <label
                          className={`privileged__type-option ${couponType === "percent" ? "privileged__type-option--active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={couponType === "percent"}
                            onChange={() => setCouponType("percent")}
                          />
                          <span>
                            <i className="ri-percent-line" />{" "}
                            {t("privileged.coupons.typePercent")}
                          </span>
                        </label>

                        <label
                          className={`privileged__type-option ${couponType === "fixed" ? "privileged__type-option--active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={couponType === "fixed"}
                            onChange={() => setCouponType("fixed")}
                          />
                          <span>
                            <i className="ri-money-euro-box-line" />{" "}
                            {t("privileged.coupons.typeFixed")}
                          </span>
                        </label>

                        <label
                          className={`privileged__type-option ${couponType === "gift" ? "privileged__type-option--active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={couponType === "gift"}
                            onChange={() => setCouponType("gift")}
                          />
                          <span>
                            <i className="ri-gift-line" />{" "}
                            {t("privileged.coupons.typeGift")}
                          </span>
                        </label>

                        <label
                          className={`privileged__type-option ${couponType === "free_shipping" ? "privileged__type-option--active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={couponType === "free_shipping"}
                            onChange={() => setCouponType("free_shipping")}
                          />
                          <span>
                            <i className="ri-truck-line" />{" "}
                            {t("privileged.coupons.typeFreeShipping")}
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Conditional Settings based on selected couponType */}
                    {couponType === "percent" && (
                      <div className="privileged__type-settings">
                        <div className="privileged__form-row">
                          <div className="privileged__form-field">
                            <label htmlFor="couponDiscount">
                              {t("privileged.coupons.discountPercentLabel")}
                            </label>
                            <input
                              id="couponDiscount"
                              type="number"
                              min="1"
                              max="100"
                              value={couponDiscount}
                              onChange={(e) =>
                                setCouponDiscount(e.target.value)
                              }
                              required
                            />
                          </div>
                          <div className="privileged__form-field">
                            <label htmlFor="couponMinAmount">
                              {t("privileged.coupons.minAmountLabel")}
                            </label>
                            <input
                              id="couponMinAmount"
                              type="number"
                              min="0"
                              step="0.5"
                              placeholder={t(
                                "privileged.coupons.minAmountPlaceholder",
                              )}
                              value={couponMinAmount}
                              onChange={(e) =>
                                setCouponMinAmount(e.target.value)
                              }
                            />
                          </div>
                        </div>
                        <div className="privileged__form-field">
                          <label htmlFor="couponMaxAmount">
                            {t("privileged.coupons.maxAmountLabel")}
                          </label>
                          <input
                            id="couponMaxAmount"
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder={t(
                              "privileged.coupons.maxAmountPlaceholder",
                            )}
                            value={couponMaxAmount}
                            onChange={(e) => setCouponMaxAmount(e.target.value)}
                          />
                        </div>
                        {renderConditionFields()}
                      </div>
                    )}

                    {couponType === "fixed" && (
                      <div className="privileged__type-settings">
                        <div className="privileged__form-row">
                          <div className="privileged__form-field">
                            <label htmlFor="couponFixedAmount">
                              {t("privileged.coupons.fixedAmountLabel")}
                            </label>
                            <input
                              id="couponFixedAmount"
                              type="number"
                              min="1"
                              step="0.5"
                              value={couponFixedAmount}
                              onChange={(e) =>
                                setCouponFixedAmount(e.target.value)
                              }
                              required
                            />
                          </div>
                          <div className="privileged__form-field">
                            <label htmlFor="couponMinAmountFixed">
                              {t("privileged.coupons.minAmountLabel")}
                            </label>
                            <input
                              id="couponMinAmountFixed"
                              type="number"
                              min="0"
                              step="0.5"
                              placeholder={t(
                                "privileged.coupons.minAmountPlaceholder",
                              )}
                              value={couponMinAmount}
                              onChange={(e) =>
                                setCouponMinAmount(e.target.value)
                              }
                            />
                          </div>
                        </div>
                        <div className="privileged__form-field">
                          <label htmlFor="couponMaxAmountFixed">
                            {t("privileged.coupons.maxAmountLabel")}
                          </label>
                          <input
                            id="couponMaxAmountFixed"
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder={t(
                              "privileged.coupons.maxAmountPlaceholder",
                            )}
                            value={couponMaxAmount}
                            onChange={(e) => setCouponMaxAmount(e.target.value)}
                          />
                        </div>
                        {renderConditionFields()}
                      </div>
                    )}

                    {couponType === "gift" && (
                      <div className="privileged__type-settings">
                        <div className="privileged__form-field">
                          <label htmlFor="giftName">
                            {t("privileged.coupons.giftNameLabel")}
                          </label>
                          <input
                            id="giftName"
                            type="text"
                            placeholder={t(
                              "privileged.coupons.giftNamePlaceholder",
                            )}
                            value={giftName}
                            onChange={(e) => setGiftName(e.target.value)}
                            required
                          />
                        </div>
                        {renderConditionFields()}
                      </div>
                    )}

                    {couponType === "free_shipping" && (
                      <div className="privileged__type-settings">
                        <div className="privileged__form-field">
                          <label htmlFor="couponMinAmountShipping">
                            {t("privileged.coupons.minAmountLabel")}
                          </label>
                          <input
                            id="couponMinAmountShipping"
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder={t(
                              "privileged.coupons.minAmountPlaceholder",
                            )}
                            value={couponMinAmount}
                            onChange={(e) =>
                              setCouponMinAmount(e.target.value)
                            }
                          />
                        </div>
                        {renderConditionFields()}
                      </div>
                    )}

                    {/* Amount affected by coupon: without shipping vs with shipping */}
                    {(couponType === "percent" || couponType === "fixed") && (
                      <div className="privileged__form-field">
                        <label>{t("privileged.coupons.applyScopeLabel")}</label>
                        <div className="privileged__type-options">
                          <label
                            className={`privileged__type-option ${couponApplyScope === "without_shipping" ? "privileged__type-option--active" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={couponApplyScope === "without_shipping"}
                              onChange={() =>
                                setCouponApplyScope("without_shipping")
                              }
                            />
                            <span>
                              <i className="ri-shopping-basket-line" />{" "}
                              {t(
                                "privileged.coupons.applyScopeWithoutShipping",
                              )}
                            </span>
                          </label>

                          <label
                            className={`privileged__type-option ${couponApplyScope === "with_shipping" ? "privileged__type-option--active" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={couponApplyScope === "with_shipping"}
                              onChange={() =>
                                setCouponApplyScope("with_shipping")
                              }
                            />
                            <span>
                              <i className="ri-truck-line" />{" "}
                              {t("privileged.coupons.applyScopeWithShipping")}
                            </span>
                          </label>
                        </div>
                        <span className="privileged__field-hint">
                          {couponApplyScope === "with_shipping"
                            ? t(
                                "privileged.coupons.applyScopeWithShippingHint",
                              )
                            : t(
                                "privileged.coupons.applyScopeWithoutShippingHint",
                              )}
                        </span>
                      </div>
                    )}

                    {/* Coupon Usage Type (Single, Unlimited, Limited) */}
                    <div className="privileged__form-field">
                      <label>{t("privileged.coupons.usageTypeLabel")}</label>
                      <div className="privileged__type-options">
                        <label
                          className={`privileged__type-option ${couponUsageType === "single" ? "privileged__type-option--active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={couponUsageType === "single"}
                            onChange={() => setCouponUsageType("single")}
                          />
                          <span>
                            <i className="ri-user-follow-line" />{" "}
                            {t("privileged.coupons.usageSingle")}
                          </span>
                        </label>

                        <label
                          className={`privileged__type-option ${couponUsageType === "unlimited" ? "privileged__type-option--active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={couponUsageType === "unlimited"}
                            onChange={() => setCouponUsageType("unlimited")}
                          />
                          <span>
                            <i className="ri-repeat-line" />{" "}
                            {t("privileged.coupons.usageUnlimited")}
                          </span>
                        </label>

                        <label
                          className={`privileged__type-option ${couponUsageType === "limited" ? "privileged__type-option--active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={couponUsageType === "limited"}
                            onChange={() => setCouponUsageType("limited")}
                          />
                          <span>
                            <i className="ri-numbers-line" />{" "}
                            {t("privileged.coupons.usageLimited")}
                          </span>
                        </label>
                      </div>
                    </div>

                    {couponUsageType === "limited" && (
                      <div className="privileged__form-field">
                        <label htmlFor="couponUsageLimit">
                          {t("privileged.coupons.usageLimitLabel")}
                        </label>
                        <input
                          id="couponUsageLimit"
                          type="number"
                          min="1"
                          max="100000"
                          placeholder={t(
                            "privileged.coupons.usageLimitPlaceholder",
                          )}
                          value={couponUsageLimit}
                          onChange={(e) => setCouponUsageLimit(e.target.value)}
                          required
                        />
                      </div>
                    )}

                    <div className="privileged__form-field">
                      <label htmlFor="couponDays">
                        {t("privileged.coupons.durationLabel")}
                      </label>
                      <input
                        id="couponDays"
                        type="number"
                        min="1"
                        max="365"
                        value={couponDays}
                        onChange={(e) => setCouponDays(e.target.value)}
                        required
                      />
                    </div>

                    <div className="privileged__modal-actions">
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => {
                          resetCouponForm();
                          setShowCouponModal(false);
                        }}
                      >
                        {t("privileged.coupons.cancel")}
                      </button>
                      <button
                        type="submit"
                        className="button"
                        disabled={couponSubmitting}
                      >
                        {couponSubmitting
                          ? t("privileged.coupons.submitting")
                          : t("privileged.coupons.submit")}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 4: ЗАКАЗЫ */}
        {activeSection === "orders" && (
          <div className="privileged__panel">
            <div className="privileged__panel-header">
              <div>
                <h2 className="privileged__panel-title">
                  <i className="ri-shopping-bag-3-line" />
                  {t("privileged.orders.title")}
                </h2>
                <span className="privileged__stats-text">
                  {t("privileged.orders.total")} {orders.length}
                </span>
              </div>

              <div className="privileged__order-filters">
                <button
                  type="button"
                  className={`privileged__filter-pill ${orderStatusFilter === "all" ? "privileged__filter-pill--active" : ""}`}
                  onClick={() => setOrderStatusFilter("all")}
                >
                  {t("privileged.orders.filterAll")} ({orders.length})
                </button>
                <button
                  type="button"
                  className={`privileged__filter-pill ${orderStatusFilter === "in_progress" ? "privileged__filter-pill--active" : ""}`}
                  onClick={() => setOrderStatusFilter("in_progress")}
                >
                  {t("privileged.orders.filterInProgress")} (
                  {
                    orders.filter(
                      (o) =>
                        (o.status || "in_progress").toLowerCase() ===
                        "in_progress",
                    ).length
                  }
                  )
                </button>
                <button
                  type="button"
                  className={`privileged__filter-pill ${orderStatusFilter === "completed" ? "privileged__filter-pill--active" : ""}`}
                  onClick={() => setOrderStatusFilter("completed")}
                >
                  {t("privileged.orders.filterCompleted")} (
                  {
                    orders.filter(
                      (o) => (o.status || "").toLowerCase() === "completed",
                    ).length
                  }
                  )
                </button>
              </div>
            </div>

            <div className="privileged__orders-list">
              {filteredOrders.map((order) => {
                const content = order.content || {};
                const items = Array.isArray(content.items) ? content.items : [];
                const address = content.address || {};
                const orderNum = content.orderNumber || order.id?.slice(0, 8);
                const isCompleted =
                  (order.status || "").toLowerCase() === "completed";

                return (
                  <div className="privileged__order-card" key={order.id}>
                    <div className="privileged__order-card-header">
                      <div className="privileged__order-meta">
                        <span className="privileged__order-num">
                          {t("privileged.orders.order")}{" "}
                          <strong>#{orderNum}</strong>
                        </span>
                        <span className="privileged__order-date">
                          {formatDate(
                            order.created_at || content.createdAt,
                            language,
                          )}
                        </span>
                        <span className="privileged__order-user-id">
                          {t("privileged.orders.userId")} {order.user_id}
                        </span>
                      </div>

                      <div className="privileged__order-status-actions">
                        <span
                          className={`privileged__status-badge ${isCompleted ? "privileged__status-badge--completed" : "privileged__status-badge--in-progress"}`}
                        >
                          <i
                            className={
                              isCompleted
                                ? "ri-checkbox-circle-fill"
                                : "ri-time-line"
                            }
                          />
                          {isCompleted
                            ? t("privileged.orders.statusCompleted")
                            : t("privileged.orders.statusInProgress")}
                        </span>

                        <button
                          type="button"
                          className="privileged__order-status-btn"
                          onClick={() =>
                            handleUpdateOrderStatus(
                              order.id,
                              isCompleted ? "in_progress" : "completed",
                            )
                          }
                          title={t("privileged.orders.toggleStatusTitle")}
                        >
                          <i className="ri-swap-line" />
                          <span>
                            {isCompleted
                              ? t("privileged.orders.markInProgress")
                              : t("privileged.orders.markCompleted")}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Address & Contact info */}
                    <div className="privileged__order-details-grid">
                      <div className="privileged__order-section">
                        <span className="privileged__detail-label">
                          <i className="ri-map-pin-line" />{" "}
                          {t("privileged.orders.deliveryAddress")}
                        </span>
                        <p className="privileged__detail-text">
                          {address.recipientName && (
                            <strong>{address.recipientName}, </strong>
                          )}
                          {address.street}, {address.city}
                          {address.country ? `, ${address.country}` : ""}
                          {address.postalCode ? ` (${address.postalCode})` : ""}
                        </p>
                        {address.phone && (
                          <span className="privileged__detail-phone">
                            <i className="ri-phone-line" /> {address.phone}
                          </span>
                        )}
                      </div>

                      <div className="privileged__order-section privileged__order-section--price">
                        <span className="privileged__detail-label">
                          <i className="ri-money-euro-circle-line" />{" "}
                          {t("privileged.orders.totalPrice")}
                        </span>
                        <strong className="privileged__order-final-price">
                          {formatPrice(
                            content.finalTotal || content.itemsSubtotal || 0,
                            "EUR",
                            language,
                          )}
                        </strong>
                        <small className="privileged__detail-shipping">
                          ({t("privileged.orders.booksSubtotal")}{" "}
                          {formatPrice(
                            content.itemsSubtotal || 0,
                            "EUR",
                            language,
                          )}
                          , {t("privileged.orders.shippingCost")}{" "}
                          {formatPrice(
                            content.shippingCost || 0,
                            "EUR",
                            language,
                          )}
                          )
                        </small>
                      </div>
                    </div>

                    {/* Items */}
                    {items.length > 0 && (
                      <div className="privileged__order-items">
                        {items.map((item, idx) => (
                          <div
                            className="privileged__order-item"
                            key={item.id || idx}
                          >
                            <BookImage
                              className="privileged__item-thumb"
                              src={item.image}
                              alt={item.title}
                            />
                            <div className="privileged__item-info">
                              <span className="privileged__item-title">
                                {decodeHtmlEntities(item.title)}
                              </span>
                              <span className="privileged__item-qty">
                                {item.quantity} {t("privileged.orders.pcs")} ×{" "}
                                {formatPrice(item.price, "EUR", language)}
                              </span>
                            </div>
                            <span className="privileged__item-total">
                              {formatPrice(
                                (Number(item.price) || 0) *
                                  (Number(item.quantity) || 1),
                                "EUR",
                                language,
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredOrders.length === 0 && (
                <div className="privileged__empty-box">
                  <i className="ri-inbox-line privileged__empty-icon" />
                  <p>{t("privileged.orders.empty")}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 5: МЕССЕНДЖЕР / ОБРАЩЕНИЯ */}
        {activeSection === "inquiries" && (
          <div className="privileged__panel privileged__panel--inquiries">
            <div className="privileged__panel-header">
              <div>
                <h2 className="privileged__panel-title">
                  <i className="ri-customer-service-2-line" />
                  {language === "ru"
                    ? "Обращения клиентов и гостей"
                    : "Customer & Guest Inquiries"}
                </h2>
                <span className="privileged__stats-text">
                  {language === "ru"
                    ? `Всего обращений: ${inquiries.length} • Непрочитанных: ${totalAdminUnread}`
                    : `Total inquiries: ${inquiries.length} • Unread: ${totalAdminUnread}`}
                </span>
              </div>

              <div className="privileged__inquiries-filter-group">
                <button
                  type="button"
                  className={`privileged__filter-pill ${inquiryFilter === "all" ? "privileged__filter-pill--active" : ""}`}
                  onClick={() => setInquiryFilter("all")}
                >
                  {language === "ru" ? "Все" : "All"} ({inquiries.length})
                </button>
                <button
                  type="button"
                  className={`privileged__filter-pill ${inquiryFilter === "unread" ? "privileged__filter-pill--active" : ""}`}
                  onClick={() => setInquiryFilter("unread")}
                >
                  {language === "ru" ? "Непрочитанные" : "Unread"} (
                  {
                    inquiries.filter((i) => (i.notifications_admin || 0) > 0)
                      .length
                  }
                  )
                </button>
                <button
                  type="button"
                  className={`privileged__filter-pill ${inquiryFilter === "guest" ? "privileged__filter-pill--active" : ""}`}
                  onClick={() => setInquiryFilter("guest")}
                >
                  <i className="ri-mail-line" />{" "}
                  {language === "ru" ? "Гости" : "Guests"} (
                  {
                    inquiries.filter((i) => i.interlocutors_info?.isGuest)
                      .length
                  }
                  )
                </button>
                <button
                  type="button"
                  className={`privileged__filter-pill ${inquiryFilter === "registered" ? "privileged__filter-pill--active" : ""}`}
                  onClick={() => setInquiryFilter("registered")}
                >
                  <i className="ri-user-star-line" />{" "}
                  {language === "ru" ? "Зарегистрированные" : "Registered"} (
                  {
                    inquiries.filter((i) => !i.interlocutors_info?.isGuest)
                      .length
                  }
                  )
                </button>
              </div>
            </div>

            <div className="privileged__inquiries-layout">
              {/* Sidebar with inquiries list */}
              <div className="privileged__inquiries-sidebar">
                <div className="privileged__inquiries-search">
                  <i className="ri-search-line" />
                  <input
                    type="text"
                    placeholder={
                      language === "ru"
                        ? "Поиск по имени, email или сообщению..."
                        : "Search by name, email or message..."
                    }
                    value={inquirySearch}
                    onChange={(e) => setInquirySearch(e.target.value)}
                  />
                  {inquirySearch && (
                    <button type="button" onClick={() => setInquirySearch("")}>
                      ×
                    </button>
                  )}
                </div>

                <div className="privileged__inquiries-list">
                  {filteredInquiries.map((inq) => {
                    const info = inq.interlocutors_info || {};
                    const isGuest = Boolean(info.isGuest);
                    const isSelected = inq.id === activeInquiry?.id;
                    const unread = inq.notifications_admin || 0;
                    const chat = Array.isArray(inq.chat) ? inq.chat : [];
                    const lastMsg = chat[chat.length - 1];

                    return (
                      <div
                        key={inq.id}
                        className={`privileged__inquiry-item ${isSelected ? "privileged__inquiry-item--active" : ""} ${unread > 0 ? "privileged__inquiry-item--unread" : ""}`}
                        onClick={() => handleSelectInquiry(inq.id)}
                      >
                        <div className="privileged__inquiry-item-top">
                          <div className="privileged__inquiry-avatar">
                            {isGuest ? (
                              <i className="ri-mail-line" />
                            ) : (
                              (info.userName?.[0] || "?").toUpperCase()
                            )}
                          </div>
                          <div className="privileged__inquiry-meta">
                            <div className="privileged__inquiry-user-row">
                              <strong className="privileged__inquiry-name">
                                {info.userName ||
                                  (isGuest
                                    ? language === "ru"
                                      ? "Гость"
                                      : "Guest"
                                    : language === "ru"
                                      ? "Пользователь"
                                      : "User")}
                              </strong>
                              {unread > 0 && (
                                <span className="privileged__inquiry-badge-unread">
                                  +{unread}
                                </span>
                              )}
                            </div>
                            <span className="privileged__inquiry-email">
                              {info.userEmail}
                            </span>
                          </div>
                        </div>

                        <div className="privileged__inquiry-status-row">
                          {isGuest ? (
                            <span className="privileged__inquiry-tag privileged__inquiry-tag--guest">
                              <i className="ri-mail-send-line" />{" "}
                              {language === "ru"
                                ? "Гость (Email)"
                                : "Guest (Email)"}
                            </span>
                          ) : (
                            <span className="privileged__inquiry-tag privileged__inquiry-tag--reg">
                              <i className="ri-shield-user-line" />{" "}
                              {language === "ru"
                                ? "Зарегистрирован"
                                : "Registered"}
                            </span>
                          )}
                          {info.adminName && (
                            <span className="privileged__inquiry-admin-tag">
                              {language === "ru" ? "Админ: " : "Admin: "}
                              {info.adminName}
                            </span>
                          )}
                        </div>

                        {lastMsg && (
                          <div className="privileged__inquiry-preview">
                            <span className="privileged__inquiry-preview-sender">
                              {lastMsg.sender === "admin"
                                ? language === "ru"
                                  ? "Вы: "
                                  : "You: "
                                : ""}
                            </span>
                            {lastMsg.text}
                          </div>
                        )}
                        <span className="privileged__inquiry-date">
                          {formatDate(
                            lastMsg?.timestamp || inq.created_at,
                            language,
                          )}
                        </span>
                      </div>
                    );
                  })}

                  {filteredInquiries.length === 0 && (
                    <div className="privileged__inquiries-empty">
                      <i className="ri-inbox-archive-line" />
                      <p>
                        {language === "ru"
                          ? "Нет обращений"
                          : "No inquiries found"}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat View */}
              <div className="privileged__inquiries-chat">
                {activeInquiry ? (
                  <>
                    <div className="privileged__chat-header">
                      <div className="privileged__chat-header-user">
                        <div className="privileged__chat-avatar">
                          {activeInquiry.interlocutors_info?.isGuest ? (
                            <i className="ri-mail-line" />
                          ) : (
                            (
                              activeInquiry.interlocutors_info?.userName?.[0] ||
                              "?"
                            ).toUpperCase()
                          )}
                        </div>
                        <div className="privileged__chat-user-details">
                          <div className="privileged__chat-name-row">
                            <h3 className="privileged__chat-client-name">
                              {activeInquiry.interlocutors_info?.userName ||
                                "Пользователь"}
                            </h3>
                            {activeInquiry.interlocutors_info?.isGuest ? (
                              <span className="privileged__inquiry-tag privileged__inquiry-tag--guest">
                                <i className="ri-mail-line" />
                                <span>
                                  {language === "ru"
                                    ? "Гость (не зарегистрирован)"
                                    : "Guest (unregistered)"}
                                </span>
                              </span>
                            ) : (
                              <span className="privileged__inquiry-tag privileged__inquiry-tag--reg">
                                <i className="ri-check-line" />
                                <span>
                                  {language === "ru" ? "Клиент" : "Registered"}
                                </span>
                              </span>
                            )}
                          </div>
                          <div className="privileged__chat-meta-row">
                            <a
                              href={`mailto:${activeInquiry.interlocutors_info?.userEmail}`}
                              className="privileged__client-email-link"
                              title={
                                activeInquiry.interlocutors_info?.userEmail
                              }
                            >
                              <i className="ri-mail-line" />
                              <span>
                                {activeInquiry.interlocutors_info?.userEmail}
                              </span>
                            </a>
                            {activeInquiry.interlocutors_info?.adminName && (
                              <span className="privileged__assigned-chip">
                                <i className="ri-shield-user-line" />
                                <span>
                                  {language === "ru"
                                    ? "Ответственный: "
                                    : "Assigned: "}
                                  <strong>
                                    {
                                      activeInquiry.interlocutors_info
                                        ?.adminName
                                    }
                                  </strong>
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="privileged__chat-header-actions">
                        <button
                          type="button"
                          className="privileged__chat-action-btn privileged__chat-action-btn--history"
                          onClick={() => setHistoryModalOpen(true)}
                          title={
                            language === "ru"
                              ? "История передач этого клиента"
                              : "Transfer history"
                          }
                        >
                          <i className="ri-history-line" />
                          <span>
                            {language === "ru" ? "История передач" : "History"}
                          </span>
                          {Array.isArray(
                            activeInquiry.interlocutors_info?.transferHistory,
                          ) &&
                            activeInquiry.interlocutors_info.transferHistory
                              .length > 0 && (
                              <span className="privileged__history-count-badge">
                                {
                                  activeInquiry.interlocutors_info
                                    .transferHistory.length
                                }
                              </span>
                            )}
                        </button>

                        <button
                          type="button"
                          className="privileged__chat-action-btn privileged__chat-action-btn--transfer"
                          onClick={() => handleOpenTransferModal(activeInquiry)}
                          title={
                            language === "ru"
                              ? "Передать клиента другому администратору"
                              : "Transfer client"
                          }
                        >
                          <i className="ri-user-shared-line" />
                          <span>
                            {language === "ru"
                              ? "Передать клиента"
                              : "Transfer"}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Guest Notification Banner */}
                    {activeInquiry.interlocutors_info?.isGuest && (
                      <div className="privileged__guest-email-alert">
                        <i className="ri-information-line" />
                        <div>
                          <strong>
                            {language === "ru"
                              ? "Пользователь не зарегистрирован"
                              : "Unregistered Guest User"}
                          </strong>
                          <p>
                            {language === "ru"
                              ? `Гость указал email: ${activeInquiry.interlocutors_info?.userEmail}. Ваши ответы будут автоматически отправлены ему на электронную почту и сохранены в истории переписки.`
                              : `Guest user email: ${activeInquiry.interlocutors_info?.userEmail}. Your messages will be automatically sent to their email inbox and saved in chat history.`}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Messages feed */}
                    <div className="privileged__chat-feed">
                      {(activeInquiry.chat || []).map((msg, idx) => {
                        const msgKey = msg.id || `admin-inq-${idx}`;

                        if (msg.sender === "system") {
                          return (
                            <div
                              key={msgKey}
                              className="privileged__msg-system-row"
                            >
                              <div className="privileged__msg-system-badge">
                                <i className="ri-user-shared-line" />
                                <span>{msg.text}</span>
                                <time>
                                  {formatDate(msg.timestamp, language)}
                                </time>
                              </div>
                            </div>
                          );
                        }

                        const isAdmin = msg.sender === "admin";
                        const isLongMsg =
                          Boolean(msg.text) &&
                          (msg.text.length > 55 ||
                            (msg.text.match(/\n/g) || []).length >= 2 ||
                            (!msg.text.includes(" ") && msg.text.length > 32));
                        const isExpanded = expandedInquiryMsgIds.has(msgKey);

                        return (
                          <div
                            key={msgKey}
                            className={`privileged__msg-row ${isAdmin ? "privileged__msg-row--admin" : "privileged__msg-row--user"}`}
                          >
                            <div
                              className={`privileged__msg-bubble ${
                                isLongMsg
                                  ? isExpanded
                                    ? "privileged__msg-bubble--expanded"
                                    : "privileged__msg-bubble--collapsed"
                                  : ""
                              }`}
                              onClick={
                                isLongMsg && !isExpanded
                                  ? () => toggleInquiryMsgExpand(msgKey)
                                  : undefined
                              }
                              style={
                                isLongMsg && !isExpanded
                                  ? { cursor: "pointer" }
                                  : undefined
                              }
                            >
                              <div className="privileged__msg-author">
                                {isAdmin
                                  ? msg.senderName || "Администратор"
                                  : msg.senderName || "Клиент"}
                              </div>
                              <div className="privileged__msg-text">
                                {msg.text}
                              </div>

                              {isLongMsg && (
                                <button
                                  type="button"
                                  className="privileged__msg-expand-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleInquiryMsgExpand(msgKey);
                                  }}
                                  title={
                                    isExpanded
                                      ? language === "ru"
                                        ? "Свернуть сообщение"
                                        : "Collapse"
                                      : language === "ru"
                                        ? "Раскрыть полностью"
                                        : "Expand"
                                  }
                                  aria-label={
                                    isExpanded
                                      ? language === "ru"
                                        ? "Свернуть сообщение"
                                        : "Collapse"
                                      : language === "ru"
                                        ? "Раскрыть полностью"
                                        : "Expand"
                                  }
                                >
                                  <i
                                    className={
                                      isExpanded
                                        ? "ri-arrow-up-s-line"
                                        : "ri-arrow-down-s-line"
                                    }
                                  />
                                </button>
                              )}

                              <div className="privileged__msg-footer">
                                <span>
                                  {formatDate(msg.timestamp, language)}
                                </span>
                                {isAdmin && msg.deliveredViaEmail && (
                                  <span
                                    className="privileged__msg-email-tag"
                                    title={
                                      language === "ru"
                                        ? "Доставлено на email"
                                        : "Delivered via email"
                                    }
                                  >
                                    <i className="ri-mail-check-line" />{" "}
                                    {language === "ru"
                                      ? "Отправлено на email"
                                      : "Sent to email"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {(activeInquiry.chat || []).length === 0 && (
                        <div className="privileged__chat-empty">
                          <p>
                            {language === "ru"
                              ? "В этом обращении ещё нет сообщений"
                              : "No messages in this inquiry yet"}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Reply Composer */}
                    <form
                      className="privileged__chat-composer"
                      onSubmit={handleSendAdminReply}
                    >
                      <textarea
                        rows={2}
                        className="privileged__chat-input"
                        placeholder={
                          activeInquiry.interlocutors_info?.isGuest
                            ? language === "ru"
                              ? "Напишите ответ (будет отправлен в чат и на email гостя)..."
                              : "Type reply (will be delivered to chat and email)..."
                            : language === "ru"
                              ? "Напишите ответ пользователю..."
                              : "Type reply to user..."
                        }
                        value={inquiryReplyText}
                        onChange={(e) => setInquiryReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendAdminReply(e);
                          }
                        }}
                        disabled={sendingInquiryReply}
                      />
                      <button
                        type="submit"
                        className="button button--primary privileged__chat-send-btn"
                        disabled={
                          !inquiryReplyText.trim() || sendingInquiryReply
                        }
                      >
                        {sendingInquiryReply ? (
                          <i className="ri-loader-4-line ri-spin" />
                        ) : (
                          <>
                            <i className="ri-send-plane-2-fill" />
                            {activeInquiry.interlocutors_info?.isGuest
                              ? language === "ru"
                                ? "Ответить (в чат и на Email)"
                                : "Send (Chat & Email)"
                              : language === "ru"
                                ? "Отправить"
                                : "Send"}
                          </>
                        )}
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="privileged__chat-placeholder">
                    <i className="ri-chat-voice-line" />
                    <h3>
                      {language === "ru"
                        ? "Выберите обращение"
                        : "Select an inquiry"}
                    </h3>
                    <p>
                      {language === "ru"
                        ? "Выберите диалог из списка слева для просмотра переписки и ответа."
                        : "Choose a conversation from the left sidebar to view messages and reply."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 6: ОБЪЯВЛЕНИЯ (ANNOUNCEMENTS) */}
        {activeSection === "announcements" && (
          <div className="privileged__panel">
            <div className="privileged__panel-header">
              <div>
                <h2 className="privileged__panel-title">
                  <i className="ri-megaphone-line" />
                  {language === "ru" ? "Объявления" : "Announcements"}
                </h2>
                <span className="privileged__stats-text">
                  {language === "ru"
                    ? "Управление вставками вверху страницы и плакатами над рулеткой"
                    : "Manage top banner announcements and roulette posters"}
                </span>
              </div>

              <button
                type="button"
                className="button privileged__create-btn"
                onClick={handleOpenCreateAnnouncement}
              >
                <i className="ri-add-line privileged__btn-icon" />
                <span className="privileged__btn-text">
                  {language === "ru"
                    ? "Создать объявление"
                    : "New Announcement"}
                </span>
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="privileged__ann-filter-tabs">
              <button
                type="button"
                className={`privileged__ann-filter-btn ${announcementFilter === "all" ? "privileged__ann-filter-btn--active" : ""}`}
                onClick={() => setAnnouncementFilter("all")}
              >
                {language === "ru" ? "Все объявления" : "All Announcements"} (
                {announcements.length})
              </button>
              <button
                type="button"
                className={`privileged__ann-filter-btn ${announcementFilter === "small" ? "privileged__ann-filter-btn--active" : ""}`}
                onClick={() => setAnnouncementFilter("small")}
              >
                <i className="ri-layout-top-line" />
                {language === "ru" ? "Вставки вверху" : "Top Insets"} (
                {announcements.filter((a) => a.type === "small").length})
              </button>
              <button
                type="button"
                className={`privileged__ann-filter-btn ${announcementFilter === "large" ? "privileged__ann-filter-btn--active" : ""}`}
                onClick={() => setAnnouncementFilter("large")}
              >
                <i className="ri-image-2-line" />
                {language === "ru"
                  ? "Плакаты над рулеткой"
                  : "Roulette Posters"}{" "}
                ({announcements.filter((a) => a.type === "large").length})
              </button>
            </div>

            {/* Announcements List */}
            {announcements.length === 0 ? (
              <div className="privileged__empty-state">
                <i className="ri-megaphone-line privileged__empty-icon" />
                <h3 className="privileged__empty-title">
                  {language === "ru"
                    ? "Объявлений пока нет"
                    : "No announcements yet"}
                </h3>
                <p className="privileged__empty-text">
                  {language === "ru"
                    ? "Создайте небольшую текстовую вставку вверху страницы или большой плакат над витриной парфюмерии."
                    : "Create a small top banner or a large poster banner above the fragrance showcase."}
                </p>
                <button
                  type="button"
                  className="button privileged__empty-create-btn"
                  onClick={handleOpenCreateAnnouncement}
                >
                  <i className="ri-add-line privileged__btn-icon" />
                  <span className="privileged__btn-text">
                    {language === "ru"
                      ? "Создать объявление"
                      : "New Announcement"}
                  </span>
                </button>
              </div>
            ) : (
              <div className="privileged__ann-list">
                {announcements
                  .filter((item) => {
                    if (announcementFilter === "small")
                      return item.type === "small";
                    if (announcementFilter === "large")
                      return item.type === "large";
                    return true;
                  })
                  .map((ann) => {
                    const statusInfo = getAnnouncementStatusInfo(ann);
                    const originalIndex = announcements.findIndex(
                      (a) => a.id === ann.id,
                    );

                    return (
                      <div
                        key={ann.id}
                        className={`privileged__ann-card ${!ann.active ? "privileged__ann-card--disabled" : ""}`}
                      >
                        {/* Order & Reorder Controls */}
                        <div className="privileged__ann-order-col">
                          <span className="privileged__ann-order-badge">
                            #{originalIndex + 1}
                          </span>
                          <div className="privileged__ann-order-actions">
                            <button
                              type="button"
                              className="privileged__ann-order-btn"
                              title={
                                language === "ru" ? "Поднять выше" : "Move up"
                              }
                              disabled={originalIndex === 0}
                              onClick={() =>
                                handleMoveAnnouncement(originalIndex, -1)
                              }
                            >
                              <i className="ri-arrow-up-s-line" />
                            </button>
                            <button
                              type="button"
                              className="privileged__ann-order-btn"
                              title={
                                language === "ru"
                                  ? "Опустить ниже"
                                  : "Move down"
                              }
                              disabled={
                                originalIndex === announcements.length - 1
                              }
                              onClick={() =>
                                handleMoveAnnouncement(originalIndex, 1)
                              }
                            >
                              <i className="ri-arrow-down-s-line" />
                            </button>
                          </div>
                        </div>

                        {/* Card Content & Preview */}
                        <div className="privileged__ann-content-col">
                          <div className="privileged__ann-header-row">
                            <div className="privileged__ann-tags">
                              <span
                                className={`privileged__ann-type-tag privileged__ann-type-tag--${ann.type}`}
                              >
                                <i
                                  className={
                                    ann.type === "large"
                                      ? "ri-image-2-line"
                                      : "ri-layout-top-line"
                                  }
                                />
                                {ann.type === "large"
                                  ? language === "ru"
                                    ? "Большой плакат (рулетка)"
                                    : "Large Poster (roulette)"
                                  : language === "ru"
                                    ? "Небольшая вставка (вверху)"
                                    : "Small Inset (top)"}
                              </span>

                              <span
                                className={`privileged__ann-status-badge ${statusInfo.badgeClass}`}
                              >
                                <i className={statusInfo.icon} />
                                {statusInfo.label}
                              </span>
                            </div>

                            {/* Actions: Edit, Toggle Active, Delete */}
                            <div className="privileged__ann-actions">
                              <button
                                type="button"
                                className="privileged__ann-action-btn"
                                title={
                                  ann.active
                                    ? language === "ru"
                                      ? "Приостановить"
                                      : "Pause"
                                    : language === "ru"
                                      ? "Включить"
                                      : "Enable"
                                }
                                onClick={() =>
                                  handleToggleAnnouncementActive(ann)
                                }
                              >
                                <i
                                  className={
                                    ann.active
                                      ? "ri-pause-circle-line"
                                      : "ri-play-circle-line"
                                  }
                                />
                              </button>
                              <button
                                type="button"
                                className="privileged__ann-action-btn"
                                title={
                                  language === "ru" ? "Редактировать" : "Edit"
                                }
                                onClick={() => handleOpenEditAnnouncement(ann)}
                              >
                                <i className="ri-edit-line" />
                              </button>
                              <button
                                type="button"
                                className="privileged__ann-action-btn privileged__ann-action-btn--delete"
                                title={language === "ru" ? "Удалить" : "Delete"}
                                onClick={() => handleDeleteAnnouncement(ann.id)}
                              >
                                <i className="ri-delete-bin-line" />
                              </button>
                            </div>
                          </div>

                          {/* Preview Area */}
                          <div className="privileged__ann-preview-box">
                            {ann.type === "large" ? (
                              <div className="privileged__ann-large-preview-dual">
                                <div className="privileged__ann-poster-col">
                                  <span className="privileged__ann-lang-badge">
                                    <RussianFlag width={16} height={11} /> RU
                                  </span>
                                  {ann.imageUrl_ru || ann.imageUrl ? (
                                    <img
                                      src={ann.imageUrl_ru || ann.imageUrl}
                                      alt="Poster RU"
                                      className="privileged__ann-poster-img"
                                      onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                        const next =
                                          e.currentTarget.nextElementSibling;
                                        if (next) next.style.display = "flex";
                                      }}
                                    />
                                  ) : null}
                                  <div
                                    className="privileged__ann-img-fallback"
                                    style={{
                                      display:
                                        ann.imageUrl_ru || ann.imageUrl
                                          ? "none"
                                          : "flex",
                                    }}
                                  >
                                    <i className="ri-image-line" />
                                    <span>
                                      {language === "ru"
                                        ? "Нет фото (RU)"
                                        : "No photo (RU)"}
                                    </span>
                                  </div>
                                </div>

                                <div className="privileged__ann-poster-col">
                                  <span className="privileged__ann-lang-badge">
                                    <BritishFlag width={16} height={11} /> EN
                                  </span>
                                  {ann.imageUrl_en || ann.imageUrl ? (
                                    <img
                                      src={ann.imageUrl_en || ann.imageUrl}
                                      alt="Poster EN"
                                      className="privileged__ann-poster-img"
                                      onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                        const next =
                                          e.currentTarget.nextElementSibling;
                                        if (next) next.style.display = "flex";
                                      }}
                                    />
                                  ) : null}
                                  <div
                                    className="privileged__ann-img-fallback"
                                    style={{
                                      display:
                                        ann.imageUrl_en || ann.imageUrl
                                          ? "none"
                                          : "flex",
                                    }}
                                  >
                                    <i className="ri-image-line" />
                                    <span>
                                      {language === "ru"
                                        ? "Нет фото (EN)"
                                        : "No photo (EN)"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="privileged__ann-small-preview-dual">
                                <div className="privileged__ann-small-lang-item">
                                  <span className="privileged__ann-lang-badge">
                                    <RussianFlag width={16} height={11} /> RU
                                  </span>
                                  <span className="privileged__ann-text-preview">
                                    {ann.text_ru ||
                                      ann.ru?.text ||
                                      ann.text ||
                                      "—"}
                                  </span>
                                </div>
                                <div className="privileged__ann-small-lang-item">
                                  <span className="privileged__ann-lang-badge">
                                    <BritishFlag width={16} height={11} /> EN
                                  </span>
                                  <span className="privileged__ann-text-preview">
                                    {ann.text_en ||
                                      ann.en?.text ||
                                      "—"}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          {(ann.linkUrl_ru || ann.linkUrl_en || ann.linkUrl) && (
                            <div className="privileged__ann-links-row">
                              <i className="ri-link" />
                              <span className="privileged__ann-link-label">
                                {language === "ru" ? "Ссылки:" : "Links:"}
                              </span>
                              {(ann.linkUrl_ru || ann.linkUrl) && (
                                <span className="privileged__ann-link-pill">
                                  <RussianFlag width={14} height={10} />{" "}
                                  {ann.linkUrl_ru || ann.linkUrl}
                                </span>
                              )}
                              {ann.linkUrl_en &&
                                ann.linkUrl_en !==
                                  (ann.linkUrl_ru || ann.linkUrl) && (
                                  <span className="privileged__ann-link-pill">
                                    <BritishFlag width={14} height={10} />{" "}
                                    {ann.linkUrl_en}
                                  </span>
                                )}
                            </div>
                          )}

                          {/* Footer Details */}
                          <div className="privileged__ann-footer-row">
                            <div className="privileged__ann-dates">
                              <span
                                title={
                                  language === "ru"
                                    ? "Дата начала"
                                    : "Start date"
                                }
                              >
                                <i className="ri-calendar-line" />{" "}
                                <strong>
                                  {language === "ru" ? "С:" : "From:"}
                                </strong>{" "}
                                {formatDate(ann.from, language)}
                              </span>
                              <span
                                className="privileged__ann-until-date"
                                title={
                                  language === "ru"
                                    ? "Срок окончания (обязательно)"
                                    : "Expiration date (required)"
                                }
                              >
                                <i className="ri-calendar-check-line" />{" "}
                                <strong>
                                  {language === "ru" ? "По:" : "Until:"}
                                </strong>{" "}
                                {formatDate(ann.until, language)}
                              </span>
                            </div>

                            {ann.linkUrl && (
                              <a
                                href={ann.linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="privileged__ann-link"
                              >
                                <i className="ri-link" />
                                <span>{ann.linkUrl}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Modal for Creating / Editing Announcement */}
            {announcementModalOpen && (
              <div
                className="privileged__modal-backdrop"
                onClick={() => setAnnouncementModalOpen(false)}
              >
                <div
                  className="privileged__modal privileged__modal--announcement"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="privileged__modal-header">
                    <div>
                      <h3 className="privileged__modal-title">
                        <i className="ri-megaphone-line" />
                        {editingAnnouncement
                          ? language === "ru"
                            ? "Редактировать объявление"
                            : "Edit Announcement"
                          : language === "ru"
                            ? "Новое объявление"
                            : "New Announcement"}
                      </h3>
                      <p className="privileged__modal-subtitle">
                        {language === "ru"
                          ? "Заполните параметры для размещения объявления на сайте"
                          : "Configure announcement options for the homepage"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="privileged__modal-close"
                      onClick={() => setAnnouncementModalOpen(false)}
                    >
                      ×
                    </button>
                  </div>

                  <form
                    onSubmit={handleSaveAnnouncement}
                    className="privileged__modal-form"
                  >
                    {/* Step 1: Type Selection */}
                    <div className="privileged__form-section">
                      <div className="privileged__form-section-title">
                        <span className="privileged__step-num">1</span>
                        <span>
                          {language === "ru"
                            ? "Формат объявления"
                            : "Announcement Format"}
                        </span>
                      </div>

                      <div className="privileged__ann-type-selector">
                        <button
                          type="button"
                          className={`privileged__ann-type-card ${announcementType === "small" ? "privileged__ann-type-card--selected" : ""}`}
                          onClick={() => setAnnouncementType("small")}
                        >
                          <div className="privileged__ann-card-radio">
                            <span className="privileged__radio-circle" />
                          </div>
                          <i className="ri-layout-top-line privileged__ann-card-icon" />
                          <div className="privileged__ann-card-text">
                            <strong>
                              {language === "ru"
                                ? "Небольшая вставка"
                                : "Small Top Inset"}
                            </strong>
                            <span>
                              {language === "ru"
                                ? "Текстовая полоса в самом верху страницы над шапкой. Посетитель может закрыть её крестиком."
                                : "Text banner at the very top of the page. Dismissible with an X."}
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          className={`privileged__ann-type-card ${announcementType === "large" ? "privileged__ann-type-card--selected" : ""}`}
                          onClick={() => setAnnouncementType("large")}
                        >
                          <div className="privileged__ann-card-radio">
                            <span className="privileged__radio-circle" />
                          </div>
                          <i className="ri-image-2-line privileged__ann-card-icon" />
                          <div className="privileged__ann-card-text">
                            <strong>
                              {language === "ru"
                                ? "Большой плакат"
                                : "Large Poster"}
                            </strong>
                            <span>
                              {language === "ru"
                                ? "Красочный баннер над витриной парфюмерии (только фото). Если плакатов несколько, создается рулетка."
                                : "Banner above the fragrance carousel (photo only). Rotates as a roulette if multiple."}
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Step 2: Content (Single input in any language -> AI auto-translates to RU & EN) */}
                    <div className="privileged__form-section">
                      <div className="privileged__form-section-title">
                        <span className="privileged__step-num">2</span>
                        <span>
                          {announcementType === "small"
                            ? language === "ru"
                              ? "Текст объявления (на любом языке — ИИ переведёт на RU и EN)"
                              : "Announcement Text (any language — AI auto-translates to RU & EN)"
                            : language === "ru"
                              ? "Изображение большого плаката"
                              : "Poster Image"}
                        </span>
                      </div>

                      {announcementType === "small" ? (
                        <div className="privileged__ann-lang-blocks" style={{ gridTemplateColumns: "1fr" }}>
                          <div className="privileged__ann-lang-card">
                            <div className="privileged__ann-lang-card-header" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <i className="ri-sparkling-2-fill" style={{ color: "#d4af37", fontSize: "1.15rem" }} />
                                <strong>
                                  {language === "ru"
                                    ? "Введите объявление на любом языке (укр, рус, англ и др.)"
                                    : "Enter announcement in any language (Ukrainian, Russian, English, etc.)"}
                                </strong>
                                <span className="privileged__required-mark">*</span>
                              </div>
                              <button
                                type="button"
                                className="privileged__copy-val-btn"
                                onClick={handlePreviewAiTranslation}
                                disabled={!announcementTextRu.trim() || translatingAnnouncement}
                              >
                                <i className={translatingAnnouncement ? "ri-loader-4-line privileged__button-spin" : "ri-translate-2"} />
                                {language === "ru"
                                  ? translatingAnnouncement
                                    ? "ИИ переводит..."
                                    : "Предпросмотр перевода ИИ (RU + EN)"
                                  : translatingAnnouncement
                                    ? "AI translating..."
                                    : "Preview AI Translation (RU + EN)"}
                              </button>
                            </div>

                            <div className="privileged__form-field">
                              <label className="privileged__field-label">
                                {language === "ru"
                                  ? "Текст объявления (ИИ автоматически создаст русскую и английскую версии на сайте)"
                                  : "Announcement Text (AI will automatically create Russian and English versions on the site)"}
                                <span className="privileged__required-mark">*</span>
                              </label>
                              <textarea
                                className="privileged__field-textarea"
                                rows={3}
                                required
                                value={announcementTextRu}
                                onChange={(e) => {
                                  setAnnouncementTextRu(e.target.value);
                                  setAnnouncementTextEn("");
                                }}
                                placeholder={
                                  language === "ru"
                                    ? "Например (на любом языке): Увага! Знижка 20% на всі східні парфуми за промокодом WARDA20! Бесплатная доставка от 50€!"
                                    : "e.g. (in any language): Special offer! 20% off all Arabian perfumes with code WARDA20!"
                                }
                              />
                            </div>

                            {announcementTextEn && (
                              <div className="privileged__ann-small-preview-dual" style={{ marginTop: "8px", marginBottom: "10px" }}>
                                <div className="privileged__ann-small-lang-item">
                                  <span className="privileged__ann-lang-badge">
                                    <RussianFlag width={16} height={11} /> RU
                                  </span>
                                  <span className="privileged__ann-text-preview">
                                    {announcementTextRu}
                                  </span>
                                </div>
                                <div className="privileged__ann-small-lang-item">
                                  <span className="privileged__ann-lang-badge">
                                    <BritishFlag width={16} height={11} /> EN
                                  </span>
                                  <span className="privileged__ann-text-preview">
                                    {announcementTextEn}
                                  </span>
                                </div>
                              </div>
                            )}

                            <div className="privileged__form-field">
                              <label className="privileged__field-label">
                                {language === "ru"
                                  ? "Ссылка при клике (необязательно)"
                                  : "Click URL (optional)"}
                              </label>
                              <input
                                type="text"
                                className="privileged__field-input"
                                value={announcementLinkUrlRu}
                                onChange={(e) => {
                                  setAnnouncementLinkUrlRu(e.target.value);
                                  setAnnouncementLinkUrlEn(e.target.value);
                                }}
                                placeholder="/featured или https://..."
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="privileged__ann-lang-blocks" style={{ gridTemplateColumns: "1fr" }}>
                          <div className="privileged__ann-lang-card">
                            <div className="privileged__ann-lang-card-header">
                              <i className="ri-image-2-line" style={{ color: "#d4af37", fontSize: "1.15rem" }} />
                              <strong>
                                {language === "ru"
                                  ? "Плакат (отображается на всех языках сайта)"
                                  : "Poster (displayed across all site languages)"}
                              </strong>
                              <span className="privileged__required-mark">*</span>
                            </div>

                            <div className="privileged__form-field">
                              <label className="privileged__field-label">
                                {language === "ru"
                                  ? "Ссылка на фото плаката"
                                  : "Poster Image URL"}
                                <span className="privileged__required-mark">*</span>
                              </label>
                              <input
                                type="url"
                                className="privileged__field-input"
                                required
                                value={announcementImageUrlRu}
                                onChange={(e) => {
                                  setAnnouncementImageUrlRu(e.target.value);
                                  setAnnouncementImageUrlEn(e.target.value);
                                }}
                                placeholder="https://images.unsplash.com/... или https://site.com/poster.jpg"
                              />
                            </div>

                            {/* Live preview */}
                            {announcementImageUrlRu && (
                              <div className="privileged__ann-live-preview-box">
                                <span className="privileged__preview-tag">
                                  {language === "ru"
                                    ? "Предпросмотр фото:"
                                    : "Image Preview:"}
                                </span>
                                <div className="privileged__preview-img-wrap">
                                  <img
                                    src={announcementImageUrlRu}
                                    alt="Live Preview"
                                    className="privileged__preview-img"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none";
                                      const errEl =
                                        e.currentTarget.nextElementSibling;
                                      if (errEl) errEl.style.display = "flex";
                                    }}
                                    onLoad={(e) => {
                                      e.currentTarget.style.display = "block";
                                      const errEl =
                                        e.currentTarget.nextElementSibling;
                                      if (errEl) errEl.style.display = "none";
                                    }}
                                  />
                                  <div
                                    className="privileged__preview-error"
                                    style={{ display: "none" }}
                                  >
                                    <i className="ri-error-warning-line" />
                                    <span>
                                      {language === "ru"
                                        ? "Не удалось загрузить изображение"
                                        : "Failed to load image"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="privileged__form-field">
                              <label className="privileged__field-label">
                                {language === "ru"
                                  ? "Ссылка при клике (необязательно)"
                                  : "Click URL (optional)"}
                              </label>
                              <input
                                type="text"
                                className="privileged__field-input"
                                value={announcementLinkUrlRu}
                                onChange={(e) => {
                                  setAnnouncementLinkUrlRu(e.target.value);
                                  setAnnouncementLinkUrlEn(e.target.value);
                                }}
                                placeholder="/featured или https://..."
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Step 3: Dates */}
                    <div className="privileged__form-section">
                      <div className="privileged__form-section-title">
                        <span className="privileged__step-num">3</span>
                        <span>
                          {language === "ru"
                            ? "Сроки показа на сайте"
                            : "Display Schedule"}
                        </span>
                      </div>

                      <div className="privileged__dates-row">
                        <div className="privileged__form-field">
                          <label className="privileged__field-label">
                            <i className="ri-calendar-line" />
                            {language === "ru" ? "Начало показа" : "Start Date"}
                          </label>
                          <input
                            type="datetime-local"
                            className="privileged__field-input"
                            value={announcementFrom}
                            onChange={(e) =>
                              setAnnouncementFrom(e.target.value)
                            }
                          />
                          <span className="privileged__field-hint">
                            {language === "ru"
                              ? "По умолчанию — прямо сейчас"
                              : "Defaults to right now"}
                          </span>
                        </div>

                        <div className="privileged__form-field">
                          <label className="privileged__field-label privileged__field-label--required">
                            <i className="ri-calendar-check-line" />
                            {language === "ru"
                              ? "Срок окончания показа"
                              : "Expiration Date"}
                            <span className="privileged__required-mark">
                              * (обязательно)
                            </span>
                          </label>
                          <input
                            type="datetime-local"
                            required
                            className="privileged__field-input privileged__field-input--highlight"
                            value={announcementUntil}
                            onChange={(e) =>
                              setAnnouncementUntil(e.target.value)
                            }
                          />
                          <span className="privileged__field-hint">
                            {language === "ru"
                              ? "После этой даты объявление автоматически исчезнет"
                              : "After this date, the announcement will auto-hide"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status toggle if editing */}
                    {editingAnnouncement && (
                      <div className="privileged__form-field">
                        <label className="privileged__checkbox-label">
                          <input
                            type="checkbox"
                            checked={announcementActive}
                            onChange={(e) =>
                              setAnnouncementActive(e.target.checked)
                            }
                          />
                          <span>
                            {language === "ru"
                              ? "Объявление активно (показывать на сайте)"
                              : "Announcement active (show on site)"}
                          </span>
                        </label>
                      </div>
                    )}

                    <div className="privileged__modal-actions">
                      <button
                        type="button"
                        className="button privileged__cancel-btn"
                        onClick={() => setAnnouncementModalOpen(false)}
                      >
                        {language === "ru" ? "Отмена" : "Cancel"}
                      </button>
                      <button
                        type="submit"
                        className="button privileged__submit-btn"
                        disabled={savingAnnouncement}
                      >
                        {savingAnnouncement ? (
                          <>
                            <i className="ri-loader-4-line privileged__button-spin" />
                            {language === "ru" ? "Сохранение..." : "Saving..."}
                          </>
                        ) : (
                          <>
                            <i className="ri-check-line" />
                            {editingAnnouncement
                              ? language === "ru"
                                ? "Сохранить изменения"
                                : "Save Changes"
                              : language === "ru"
                                ? "Создать объявление"
                                : "Create Announcement"}
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 7: GIT ACTIONS (ПОСЛЕДНИЙ РАЗДЕЛ) */}
        {activeSection === "git-actions" && (
          <div className="privileged__panel">
            <div className="privileged__panel-header">
              <div>
                <h2 className="privileged__panel-title">
                  <i className="ri-github-fill" />
                  {t("privileged.gitActions.title")}
                </h2>
                <span className="privileged__stats-text">
                  {t("privileged.gitActions.subtitle")}
                </span>
              </div>

              <a
                href="https://github.com/egorgrebennykov-del/Al-Warda/actions"
                target="_blank"
                rel="noopener noreferrer"
                className="button privileged__github-btn"
              >
                <i className="ri-github-fill" />
                {t("privileged.gitActions.openGithub")}
              </a>
            </div>

            <div className="privileged__workflows-grid">
              {[
                {
                  id: "qogita-smart-sync",
                  title: t("privileged.gitActions.wfSmartSyncTitle"),
                  file: ".github/workflows/qogita-smart-sync.yml",
                  descKey: "privileged.gitActions.wfSmartSyncDesc",
                  icon: "ri-refresh-line",
                  actionUrl: "https://github.com/egorgrebennykov-del/Al-Warda/actions/workflows/qogita-smart-sync.yml",
                },
                {
                  id: "brand-sync",
                  title: t("privileged.gitActions.wfBrandSyncTitle"),
                  file: ".github/workflows/brand-sync.yml",
                  descKey: "privileged.gitActions.wfBrandSyncDesc",
                  icon: "ri-filter-3-line",
                  actionUrl: "https://github.com/egorgrebennykov-del/Al-Warda/actions/workflows/brand-sync.yml",
                },
                {
                  id: "full-database-refresh",
                  title: t("privileged.gitActions.wfFullRefreshTitle"),
                  file: ".github/workflows/full-database-refresh.yml",
                  descKey: "privileged.gitActions.wfFullRefreshDesc",
                  icon: "ri-database-2-line",
                  actionUrl: "https://github.com/egorgrebennykov-del/Al-Warda/actions/workflows/full-database-refresh.yml",
                  danger: true,
                },
              ].map((wf) => {
                const info = actionStatuses[wf.id] || {};
                const isRunning = info.status === "running";
                const isSuccess = info.status === "success";
                const isError = info.status === "error";

                return (
                  <div className={`privileged__workflow-card ${wf.danger ? "privileged__workflow-card--danger" : ""}`} key={wf.id}>
                    <div className="privileged__wf-icon-wrap">
                      <i className={wf.icon} />
                    </div>
                    <div className="privileged__wf-content">
                      {wf.danger && (
                        <span className="privileged__danger-badge">
                          <i className="ri-error-warning-fill" />
                          {language === "ru" ? "Опасная зона" : "Danger zone"}
                        </span>
                      )}
                      <strong className="privileged__wf-title">
                        {wf.title}
                      </strong>
                      <span className="privileged__wf-file">{wf.file}</span>
                      <p className="privileged__wf-desc">{t(wf.descKey)}</p>

                      <div className="privileged__wf-status-row">
                        <span
                          className={`privileged__action-status ${
                            isRunning
                              ? "privileged__action-status--running"
                              : isSuccess
                                ? "privileged__action-status--success"
                                : isError
                                  ? "privileged__action-status--error"
                                  : ""
                          }`}
                        >
                          <i
                            className={
                              isRunning
                                ? "ri-loader-4-line privileged__spin"
                                : isSuccess
                                  ? "ri-checkbox-circle-fill"
                                  : isError
                                    ? "ri-error-warning-fill"
                                    : "ri-time-line"
                            }
                          />
                          {isRunning
                            ? t("privileged.gitActions.statusRunning")
                            : isSuccess
                              ? t("privileged.gitActions.statusSuccess")
                              : isError
                                ? t("privileged.gitActions.statusError")
                                : t("privileged.gitActions.statusIdle")}
                        </span>
                      </div>
                    </div>

                    <div className="privileged__wf-actions-row">
                      <button
                        type="button"
                        className={`button privileged__btn-sm ${isRunning ? "button--ghost" : ""}`}
                        disabled={isRunning}
                        onClick={() => {
                          if (wf.danger) {
                            setDangerAcknowledged(false);
                            setDangerConfirm(wf);
                          } else {
                            handleRunAction(wf.id, wf.title);
                          }
                        }}
                        title={
                          isRunning
                            ? t("privileged.gitActions.running")
                            : t("privileged.gitActions.run")
                        }
                      >
                        {isRunning ? (
                          <>
                            <i className="ri-loader-4-line privileged__spin" />
                            {t("privileged.gitActions.running")}
                          </>
                        ) : (
                          <>
                            <i className="ri-play-fill" />
                            {t("privileged.gitActions.run")}
                          </>
                        )}
                      </button>

                      {wf.actionUrl && (
                        <a
                          href={wf.actionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="button button--ghost privileged__btn-sm"
                          title="Открыть воркфлоу на GitHub"
                        >
                          <i className="ri-github-line" />
                          <span>GitHub ↗</span>
                        </a>
                      )}

                      {info.output && (
                        <button
                          type="button"
                          className="button button--ghost privileged__btn-sm"
                          onClick={() => setSelectedLogAction(wf.id)}
                          title={t("privileged.gitActions.viewLogs")}
                        >
                          <i className="ri-terminal-box-line" />
                          {t("privileged.gitActions.logs")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="privileged__git-repo-card">
              <i className="ri-git-repository-line" />
              <div>
                <strong>{t("privileged.gitActions.repoLabel")}</strong>
                <a
                  href="https://github.com/egorgrebennykov-del/Al-Warda"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="privileged__link"
                >
                  https://github.com/egorgrebennykov-del/Al-Warda ↗
                </a>
              </div>
            </div>
          </div>
        )}

        {/* SECTION: QOGITA B2B WHOLESALE */}
        {activeSection === "qogita" && (
          <div className="privileged__panel">
            <QogitaManager language={language} />
          </div>
        )}
        {activeSection === "products" && (
          <div className="privileged__panel">
            <ProductsManager language={language} />
          </div>
        )}
        {activeSection === "product-images" && (
          <div className="privileged__panel">
            <ProductImageQueue language={language} onOpenQogita={() => setActiveSection("qogita")} />
          </div>
        )}
        {activeSection === "other" && (
          <div className="privileged__panel">
            <div className="privileged__panel-header">
              <div>
                <h2 className="privileged__panel-title">
                  <i className="ri-settings-3-line" />
                  {language === "ru" ? "Прочее" : "Other"}
                </h2>
              </div>
            </div>
            <form onSubmit={handleSaveSettings} style={{ display: "grid", gap: "1rem", maxWidth: 520 }}>
              <strong>
                {language === "ru" ? "Допустимый минимальный заказ (шт.)" : "Allowed minimum order (pcs)"}
              </strong>
              <p className="privileged__stats-text">
                {language === "ru"
                  ? "В системе Qogita параметр Stock показывает остаток товара на складе, а MOV — минимальную сумму заказа у поставщика (от 500 €). Все духи в каталоге доступны по 1 штуке (поштучно), оптовые бандлы исключены."
                  : "In Qogita, Stock represents remaining supplier inventory, while MOV is the minimum order value (€500+). All perfumes in the boutique are available by 1 piece; wholesale multipacks/bundles are excluded."}
              </p>
              <div className="privileged__form-row-2">
                <div className="privileged__form-group">
                  <label className="privileged__form-label">{language === "ru" ? "От (шт.)" : "From (pcs)"}</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="privileged__form-input"
                    placeholder="1"
                    value={minOrderFrom}
                    onChange={(e) => setMinOrderFrom(e.target.value)}
                  />
                </div>
                <div className="privileged__form-group">
                  <label className="privileged__form-label">{language === "ru" ? "До (шт.)" : "To (pcs)"}</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="privileged__form-input"
                    placeholder="∞"
                    value={minOrderTo}
                    onChange={(e) => setMinOrderTo(e.target.value)}
                  />
                </div>
              </div>
              {catalogMinOrders.length > 0 && (
                <span className="privileged__stats-text">
                  {language === "ru"
                    ? `Подходит под условие: ${matchingPerfumesCount} из ${catalogMinOrders.length} духов`
                    : `Matching: ${matchingPerfumesCount} of ${catalogMinOrders.length} perfumes`}
                </span>
              )}
              <div>
                <button type="submit" className="button" disabled={savingSettings || !settingsLoaded}>
                  {savingSettings
                    ? language === "ru" ? "Сохранение..." : "Saving..."
                    : language === "ru" ? "Сохранить" : "Save"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Danger zone confirmation modal (Full Database Refresh) */}
      {dangerConfirm && (
        <div
          className="privileged__modal-backdrop"
          onClick={() => setDangerConfirm(null)}
        >
          <div
            className="privileged__modal privileged__modal--danger"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="privileged__modal-header privileged__modal-header--danger">
              <h3>
                <i className="ri-error-warning-fill" />
                {language === "ru"
                  ? "Опасная зона: полное обновление базы"
                  : "Danger zone: full database refresh"}
              </h3>
              <button
                type="button"
                className="privileged__modal-close"
                onClick={() => setDangerConfirm(null)}
              >
                ×
              </button>
            </div>
            <div className="privileged__danger-body">
              <p>
                <strong>
                  {language === "ru"
                    ? "Вы запускаете необратимый и долгий процесс. Последствия:"
                    : "You are starting a long, irreversible process. Consequences:"}
                </strong>
              </p>
              <ul className="privileged__danger-list">
                {(language === "ru"
                  ? [
                      "Весь каталог Qogita (все бренды, максимум товаров) будет загружен заново и перезапишет данные в таблице stocks (Supabase).",
                      "Цены, категории, описания и ноты, изменённые вручную или ИИ, могут быть перезаписаны значениями по умолчанию.",
                      "Товары, у которых изменилось исходное фото, вернутся в очередь генерации (статус «Ожидают») и будут пропадать с сайта до новой генерации.",
                      "Процесс идёт десятки минут, нагружает API Qogita (возможны лимиты 429) и расходует минуты GitHub Actions.",
                      "Процесс делает коммиты в репозиторий; отменить уже внесённые изменения в базе кнопкой нельзя.",
                    ]
                  : [
                      "The entire Qogita catalog (all brands, maximum items) will be downloaded again and will overwrite data in the Supabase stocks table.",
                      "Prices, categories, descriptions and notes edited manually or by AI may be overwritten with defaults.",
                      "Products whose source photo changed return to the generation queue (Pending) and disappear from the site until regenerated.",
                      "The run takes tens of minutes, loads the Qogita API (429 rate limits possible) and consumes GitHub Actions minutes.",
                      "The process commits to the repository; changes already written to the database cannot be undone with a button.",
                    ]
                ).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <label className="privileged__checkbox-label">
                <input
                  type="checkbox"
                  checked={dangerAcknowledged}
                  onChange={(e) => setDangerAcknowledged(e.target.checked)}
                />
                <span>
                  {language === "ru"
                    ? "Я понимаю последствия и хочу продолжить"
                    : "I understand the consequences and want to continue"}
                </span>
              </label>
            </div>
            <div className="privileged__modal-actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setDangerConfirm(null)}
              >
                {language === "ru" ? "Отмена" : "Cancel"}
              </button>
              <button
                type="button"
                className="button privileged__danger-confirm-btn"
                disabled={!dangerAcknowledged}
                onClick={() => {
                  const wf = dangerConfirm;
                  setDangerConfirm(null);
                  handleRunAction(wf.id, wf.title);
                }}
              >
                <i className="ri-play-fill" />
                {language === "ru" ? "Подтвердить и запустить" : "Confirm and start"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Logs Modal */}
      {selectedLogAction && (
        <div
          className="privileged__modal-backdrop"
          onClick={() => setSelectedLogAction(null)}
        >
          <div
            className="privileged__modal privileged__modal--logs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="privileged__modal-header">
              <h3>
                <i className="ri-terminal-box-line" />
                {t("privileged.gitActions.logModalTitle")} - {selectedLogAction}
              </h3>
              <button
                type="button"
                className="privileged__modal-close"
                onClick={() => setSelectedLogAction(null)}
              >
                ×
              </button>
            </div>
            <pre className="privileged__terminal-output">
              {actionStatuses[selectedLogAction]?.output ||
                t("privileged.gitActions.noLogs")}
            </pre>
            <div className="privileged__modal-actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setSelectedLogAction(null)}
              >
                {t("privileged.gitActions.closeLogs")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Inquiry Modal */}
      {transferModalOpen && activeInquiry && (
        <div
          className="privileged__modal-backdrop"
          onClick={() => setTransferModalOpen(false)}
        >
          <div
            className="privileged__modal privileged__modal--transfer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="privileged__modal-header">
              <div className="privileged__modal-header-left">
                <div className="privileged__modal-header-icon">
                  <i className="ri-user-shared-line" />
                </div>
                <div className="privileged__modal-header-text">
                  <h3>
                    {language === "ru"
                      ? "Передать клиента другому администратору"
                      : "Transfer Client to Another Admin"}
                  </h3>
                  <p className="privileged__modal-header-sub">
                    <span className="privileged__modal-client-label">
                      {language === "ru" ? "Клиент:" : "Client:"}
                    </span>
                    <strong className="privileged__modal-client-name">
                      {activeInquiry.interlocutors_info?.userName ||
                        "Пользователь"}
                    </strong>
                    <span className="privileged__modal-client-email">
                      ({activeInquiry.interlocutors_info?.userEmail})
                    </span>
                    {activeInquiry.interlocutors_info?.isGuest && (
                      <span className="privileged__inquiry-tag privileged__inquiry-tag--guest">
                        <i className="ri-mail-line" />{" "}
                        {language === "ru" ? "Гость" : "Guest"}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="privileged__modal-close-btn"
                onClick={() => setTransferModalOpen(false)}
                aria-label="Close"
              >
                <i className="ri-close-line" />
              </button>
            </div>

            <div className="privileged__modal-body">
              <div className="privileged__form-group">
                <label className="privileged__form-label">
                  {language === "ru"
                    ? "Текущий ответственный администратор"
                    : "Current Assigned Administrator"}
                </label>
                <div className="privileged__current-admin-pill">
                  <i className="ri-user-star-line" />
                  <strong>
                    {activeInquiry.interlocutors_info?.adminName ||
                      "Администратор"}
                  </strong>
                  <span className="privileged__muted">
                    (
                    {activeInquiry.interlocutors_info?.adminEmail ||
                      "alwardaparfumes@gmail.com"}
                    )
                  </span>
                </div>
              </div>

              <div className="privileged__form-group">
                <label className="privileged__form-label">
                  {language === "ru"
                    ? "Выберите нового администратора"
                    : "Select New Administrator"}{" "}
                  *
                </label>
                <select
                  className="privileged__select"
                  value={selectedTargetAdminId}
                  onChange={(e) => setSelectedTargetAdminId(e.target.value)}
                >
                  {candidateAdmins.map((admin) => {
                    const isCurrent =
                      admin.id === activeInquiry.interlocutors_info?.adminId;
                    const name =
                      `${admin.firstName || ""} ${admin.lastName || ""}`.trim() ||
                      admin.email ||
                      "Администратор";
                    return (
                      <option
                        key={admin.id}
                        value={admin.id}
                        disabled={isCurrent}
                      >
                        {name} ({admin.email}){" "}
                        {isCurrent
                          ? language === "ru"
                            ? "— текущий"
                            : "— current"
                          : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="privileged__form-group">
                <label className="privileged__form-label">
                  {language === "ru"
                    ? "Причина передачи / Примечание (необязательно)"
                    : "Transfer Reason / Note (optional)"}
                </label>
                <textarea
                  className="privileged__textarea"
                  rows={3}
                  placeholder={
                    language === "ru"
                      ? "Например: Клиент интересуется оптовым заказом парфюмерии / Клиент хочет подобрать редкий уд..."
                      : "E.g. Client inquiries about wholesale orders / Specific fragrance consultation..."
                  }
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                />
              </div>
            </div>

            <div className="privileged__modal-actions">
              <button
                type="button"
                className="privileged__modal-action-btn privileged__modal-action-btn--cancel"
                onClick={() => setTransferModalOpen(false)}
                disabled={transferring}
              >
                {language === "ru" ? "Отмена" : "Cancel"}
              </button>
              <button
                type="button"
                className="privileged__modal-action-btn privileged__modal-action-btn--confirm"
                onClick={handleConfirmTransfer}
                disabled={
                  !selectedTargetAdminId ||
                  transferring ||
                  selectedTargetAdminId ===
                    activeInquiry.interlocutors_info?.adminId
                }
              >
                {transferring ? (
                  <>
                    <i className="ri-loader-4-line ri-spin" />
                    <span>
                      {language === "ru" ? "Передача..." : "Transferring..."}
                    </span>
                  </>
                ) : (
                  <>
                    <i className="ri-check-line" />
                    <span>
                      {language === "ru"
                        ? "Подтвердить передачу"
                        : "Confirm Transfer"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer History Modal */}
      {historyModalOpen && activeInquiry && (
        <div
          className="privileged__modal-backdrop"
          onClick={() => setHistoryModalOpen(false)}
        >
          <div
            className="privileged__modal privileged__modal--history"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="privileged__modal-header">
              <div className="privileged__modal-header-left">
                <div className="privileged__modal-header-icon privileged__modal-header-icon--history">
                  <i className="ri-history-line" />
                </div>
                <div className="privileged__modal-header-text">
                  <h3>
                    {language === "ru"
                      ? "История передачи клиента"
                      : "Client Transfer History"}
                  </h3>
                  <p className="privileged__modal-header-sub">
                    <span className="privileged__modal-client-label">
                      {language === "ru" ? "Клиент:" : "Client:"}
                    </span>
                    <strong className="privileged__modal-client-name">
                      {activeInquiry.interlocutors_info?.userName ||
                        "Пользователь"}
                    </strong>
                    <span className="privileged__modal-client-email">
                      ({activeInquiry.interlocutors_info?.userEmail})
                    </span>
                    {activeInquiry.interlocutors_info?.isGuest && (
                      <span className="privileged__inquiry-tag privileged__inquiry-tag--guest">
                        <i className="ri-mail-line" />{" "}
                        {language === "ru" ? "Гость" : "Guest"}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="privileged__modal-close-btn"
                onClick={() => setHistoryModalOpen(false)}
                aria-label="Close"
              >
                <i className="ri-close-line" />
              </button>
            </div>

            <div className="privileged__modal-body">
              <div className="privileged__history-summary-box">
                <div className="privileged__history-stat">
                  <span className="privileged__muted">
                    {language === "ru"
                      ? "Текущий администратор:"
                      : "Current admin:"}
                  </span>
                  <strong>
                    {activeInquiry.interlocutors_info?.adminName ||
                      "Администратор"}
                  </strong>
                </div>
                <div className="privileged__history-stat">
                  <span className="privileged__muted">
                    {language === "ru" ? "Всего передач:" : "Total transfers:"}
                  </span>
                  <span className="privileged__history-badge">
                    {
                      (activeInquiry.interlocutors_info?.transferHistory || [])
                        .length
                    }
                  </span>
                </div>
              </div>

              {!activeInquiry.interlocutors_info?.transferHistory ||
              activeInquiry.interlocutors_info.transferHistory.length === 0 ? (
                <div className="privileged__history-empty">
                  <i className="ri-shield-user-line" />
                  <p>
                    {language === "ru"
                      ? `Этот диалог ещё не передавался. За клиентом закреплен администратор: ${
                          activeInquiry.interlocutors_info?.adminName ||
                          "Администратор"
                        }.`
                      : `This client inquiry has not been transferred yet. Assigned to: ${
                          activeInquiry.interlocutors_info?.adminName || "Admin"
                        }.`}
                  </p>
                </div>
              ) : (
                <div className="privileged__transfer-timeline">
                  {activeInquiry.interlocutors_info.transferHistory.map(
                    (tr, idx) => (
                      <div
                        key={tr.id || idx}
                        className="privileged__timeline-item"
                      >
                        <div className="privileged__timeline-marker">
                          <span className="privileged__timeline-number">
                            {idx + 1}
                          </span>
                          {idx <
                            activeInquiry.interlocutors_info.transferHistory
                              .length -
                              1 && (
                            <span className="privileged__timeline-line" />
                          )}
                        </div>
                        <div className="privileged__timeline-content">
                          <div className="privileged__timeline-header">
                            <div className="privileged__timeline-route">
                              <span className="privileged__timeline-from">
                                {tr.fromAdminName}
                              </span>
                              <i className="ri-arrow-right-line" />
                              <span className="privileged__timeline-to">
                                {tr.toAdminName}
                              </span>
                            </div>
                            <time className="privileged__timeline-time">
                              {formatDate(tr.timestamp, language)}
                            </time>
                          </div>
                          {tr.reason && (
                            <div className="privileged__timeline-reason">
                              <i className="ri-chat-quote-line" />
                              <span>{tr.reason}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>

            <div className="privileged__modal-actions">
              <button
                type="button"
                className="privileged__modal-action-btn privileged__modal-action-btn--cancel"
                onClick={() => setHistoryModalOpen(false)}
              >
                {language === "ru" ? "Закрыть" : "Close"}
              </button>
              <button
                type="button"
                className="privileged__modal-action-btn privileged__modal-action-btn--confirm"
                onClick={() => {
                  setHistoryModalOpen(false);
                  handleOpenTransferModal(activeInquiry);
                }}
              >
                <i className="ri-user-shared-line" />
                <span>
                  {language === "ru"
                    ? "Передать другому админу"
                    : "Transfer to Another Admin"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
