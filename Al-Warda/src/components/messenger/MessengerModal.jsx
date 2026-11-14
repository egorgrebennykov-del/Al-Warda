import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCookieUser, isLoggedIn, getProfile } from "../../../utils/auth";
import {
  getOrCreateInquiry,
  sendInquiryMessage,
  markInquiryReadByUser,
  fetchInquiryById,
  filterInquiryMessage,
} from "../../../utils/inquiries";
import { useLanguage } from "../../context/languageContext";
import "./MessengerModal.css";

const GUEST_EMAIL_KEY = "warda_guest_inquiry_email";
const GUEST_NAME_KEY = "warda_guest_inquiry_name";

function formatMsgTime(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const LOCALE_MAP = {
  ru: "ru-RU",
  hu: "hu-HU",
  bg: "bg-BG",
  el: "el-GR",
  ro: "ro-RO",
  en: "en-US",
};

function formatTransferTime(isoStr, lang = "ru") {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(LOCALE_MAP[lang] || "en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

export default function MessengerModal({ isOpen, onClose, onUnreadChange }) {
  const { language, t } = useLanguage();
  const loggedIn = isLoggedIn();
  const [currentUser, setCurrentUser] = useState(() =>
    loggedIn ? getCookieUser() : null,
  );

  const [guestEmail, setGuestEmail] = useState(() => {
    return localStorage.getItem(GUEST_EMAIL_KEY) || "";
  });
  const [guestName, setGuestName] = useState(() => {
    return localStorage.getItem(GUEST_NAME_KEY) || "";
  });
  const [emailInput, setEmailInput] = useState(guestEmail);
  const [nameInput, setNameInput] = useState(guestName);
  const [emailError, setEmailError] = useState("");
  const [sendError, setSendError] = useState("");

  const [inquiry, setInquiry] = useState(null);
  const inquiryRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isInputTooLarge, setIsInputTooLarge] = useState(false);
  const [showTransferHistoryModal, setShowTransferHistoryModal] =
    useState(false);
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [isEditingGuest, setIsEditingGuest] = useState(false);
  const [expandedMsgIds, setExpandedMsgIds] = useState(() => new Set());
  const [wardaRedirectQuery, setWardaRedirectQuery] = useState(null);

  const toggleMsgExpand = (id) => {
    setExpandedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const messagesEndRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Auto-resize input textarea and detect when content exceeds normal height
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    // Reset height temporarily to accurately measure scrollHeight
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;

    // Expand button appears as soon as content wraps past 1 line (~38px+), or length > 40, or has newline
    const isLarge =
      scrollHeight > 38 || inputText.length > 40 || inputText.includes("\n");
    setIsInputTooLarge(isLarge);

    if (isInputExpanded) {
      // Substantial expansion mode
      textarea.style.height = "160px";
    } else if (isLarge) {
      // Multi-line auto-expand: grows smoothly line-by-line up to 110px (~5 lines)
      textarea.style.height = `${Math.min(Math.max(scrollHeight, 40), 110)}px`;
    } else {
      // Default single-line height
      textarea.style.height = "40px";
    }
  }, [inputText, isInputExpanded]);

  const isIdentified = loggedIn || (Boolean(guestEmail) && !isEditingGuest);

  // Auto-fetch profile for logged-in user if email is missing in cookie
  useEffect(() => {
    if (loggedIn && (!currentUser || !currentUser.email)) {
      getProfile()
        .then((p) => {
          if (p) setCurrentUser(p);
        })
        .catch((pErr) =>
          console.warn("Failed to fetch profile in messenger:", pErr),
        );
    }
  }, [loggedIn]);

  const scrollToBottom = (behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Ensure inquiry exists and load it (synchronously stores in inquiryRef)
  const ensureInquiry = async (emailOverride = null, nameOverride = null) => {
    if (inquiryRef.current?.id) return inquiryRef.current;

    setSendError("");
    try {
      let activeUser = loggedIn ? currentUser || getCookieUser() : null;
      if (loggedIn && (!activeUser || !activeUser.email)) {
        try {
          const profile = await getProfile();
          if (profile) {
            activeUser = profile;
            setCurrentUser(profile);
          }
        } catch (pErr) {
          console.warn("Could not load user profile:", pErr);
        }
      }

      const targetEmail = loggedIn
        ? activeUser?.email || ""
        : (
            emailOverride ||
            guestEmail ||
            localStorage.getItem(GUEST_EMAIL_KEY) ||
            ""
          )
            .trim()
            .toLowerCase();
      const targetName = loggedIn
        ? `${activeUser?.firstName || ""} ${activeUser?.lastName || ""}`.trim() ||
          activeUser?.email ||
          "Пользователь"
        : (
            nameOverride ||
            guestName ||
            localStorage.getItem(GUEST_NAME_KEY) ||
            "Гость"
          ).trim();

      if (!loggedIn && !targetEmail) return null;

      const inq = await getOrCreateInquiry({
        user: loggedIn ? activeUser : null,
        guestEmail: loggedIn ? null : targetEmail,
        guestName: loggedIn ? null : targetName,
      });

      if (inq) {
        setInquiry(inq);
        inquiryRef.current = inq;
        const chatList = Array.isArray(inq.chat) ? inq.chat : [];
        setMessages(chatList);

        if (inq.notifications_user > 0) {
          await markInquiryReadByUser(inq.id);
          if (onUnreadChange) onUnreadChange(0);
        }
        return inq;
      }
    } catch (err) {
      console.warn("Failed to ensure inquiry:", err);
      setSendError(err?.message || t("messenger.connectError"));
    }
    return null;
  };

  // Load inquiry when modal opens or user/guest changes
  const loadInquiry = async (showSpinner = true) => {
    if (!isOpen) return;
    if (showSpinner) setLoading(true);
    try {
      await ensureInquiry();
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  // Initial load when opened
  useEffect(() => {
    if (isOpen && isIdentified) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadInquiry(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isIdentified]);

  // Polling for incoming messages while modal is open
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(async () => {
      const currentId = inquiryRef.current?.id || inquiry?.id;
      if (!currentId) return;

      try {
        const fresh = await fetchInquiryById(currentId);
        if (fresh && fresh.chat) {
          const freshList = Array.isArray(fresh.chat) ? fresh.chat : [];
          setMessages((prev) => {
            if (freshList.length !== prev.length) {
              return freshList;
            }
            return prev;
          });
          setInquiry(fresh);
          inquiryRef.current = fresh;
          if (fresh.notifications_user > 0) {
            await markInquiryReadByUser(fresh.id);
            if (onUnreadChange) onUnreadChange(0);
          }
        }
      } catch (err) {
        console.warn("Poll inquiry failed:", err);
      }
    }, 5000);

    pollTimerRef.current = interval;
    return () => clearInterval(interval);
  }, [isOpen, inquiry?.id]);

  // Auto-scroll when messages update
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length]);

  const handleGuestSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setEmailError(t("messenger.invalidEmail"));
      return;
    }
    setEmailError("");
    const cleanName = nameInput.trim() || t("messenger.guest");
    localStorage.setItem(GUEST_EMAIL_KEY, cleanEmail);
    localStorage.setItem(GUEST_NAME_KEY, cleanName);
    setGuestEmail(cleanEmail);
    setGuestName(cleanName);
    setIsEditingGuest(false);

    setLoading(true);
    await ensureInquiry(cleanEmail, cleanName);
    setLoading(false);
  };

  const handleSend = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const text = inputText.trim();
    if (!text || sending) return;

    setSendError("");
    setSending(true);

    try {
      // 1. AI Pre-filtering & Routing: Check if message is for Al-Warda or prohibited
      const check = await filterInquiryMessage({ text, language });
      if (!check.allowed) {
        if (check.redirectToWarda) {
          setWardaRedirectQuery(text);
          setSendError(check.reason || t("messenger.redirectWardaPrompt"));
          // Trigger Al-Warda's floating speech bubble with help offer
          window.dispatchEvent(
            new CustomEvent("warda-offer-help", {
              detail: { query: text },
            }),
          );
        } else {
          setWardaRedirectQuery(null);
          setSendError(check.reason || t("messenger.rejectedPrompt"));
        }
        setSending(false);
        return;
      }

      setWardaRedirectQuery(null);

      let activeInquiry = inquiryRef.current || inquiry;
      if (!activeInquiry?.id) {
        activeInquiry = await ensureInquiry();
      }

      if (!activeInquiry?.id) {
        throw new Error(t("messenger.initError"));
      }

      const activeUser = loggedIn ? currentUser || getCookieUser() : null;
      const optimisticMsg = {
        id: `opt_${Date.now()}`,
        sender: "user",
        senderName: loggedIn
          ? `${activeUser?.firstName || ""} ${activeUser?.lastName || ""}`.trim() ||
            activeUser?.email ||
            t("auth.profile")
          : guestName ||
            localStorage.getItem(GUEST_NAME_KEY) ||
            t("messenger.guest"),
        text,
        timestamp: new Date().toISOString(),
        deliveredViaEmail: false,
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      setInputText("");

      const updatedInq = await sendInquiryMessage({
        inquiryId: activeInquiry.id,
        text,
        sender: "user",
        senderUser: activeUser,
      });

      if (updatedInq) {
        setInquiry(updatedInq);
        inquiryRef.current = updatedInq;
        if (Array.isArray(updatedInq.chat)) {
          setMessages(updatedInq.chat);
        }
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setInputText(text);
      setSendError(err?.message || t("messenger.sendError"));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  const adminName = inquiry?.interlocutors_info?.adminName || "Администратор";

  const modalNode = (
    <div className="warda-messenger-overlay" onClick={onClose}>
      <div
        className="warda-messenger-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="warda-messenger-header">
          <div className="warda-messenger-admin-info">
            <div className="warda-messenger-avatar">
              <i className="ri-customer-service-2-line" />
              <span className="warda-messenger-online-dot" />
            </div>
            <div>
              <h3 className="warda-messenger-title">
                {t("messenger.supportTitle")}
              </h3>
              <p className="warda-messenger-subtitle">
                <span className="warda-messenger-online-text">
                  {t("messenger.adminOnline")}
                </span>
              </p>
            </div>
          </div>
          <div className="warda-messenger-header-actions">
            {Array.isArray(inquiry?.interlocutors_info?.transferHistory) &&
              inquiry.interlocutors_info.transferHistory.length > 0 && (
                <button
                  type="button"
                  className="warda-messenger-history-btn"
                  onClick={() => setShowTransferHistoryModal(true)}
                  title={t("messenger.transferHistoryTitle")}
                >
                  <i className="ri-history-line" />
                  <span>
                    {t("messenger.transfers")} (
                    {inquiry.interlocutors_info.transferHistory.length})
                  </span>
                </button>
              )}
            <button
              type="button"
              className="warda-messenger-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <i className="ri-close-line" />
            </button>
          </div>
        </div>

        {/* Guest Identification Form */}
        {!isIdentified ? (
          <div className="warda-messenger-guest-form">
            <div className="warda-messenger-guest-intro">
              <div className="warda-messenger-guest-icon">
                <i className="ri-mail-send-line" />
              </div>
              <h4>{t("messenger.contactAdmin")}</h4>
              <p>{t("messenger.guestPrompt")}</p>
            </div>

            <form onSubmit={handleGuestSubmit}>
              <div className="warda-messenger-field">
                <label>{t("messenger.yourEmail")} *</label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="warda-messenger-field">
                <label>{t("messenger.yourNameOptional")}</label>
                <input
                  type="text"
                  placeholder={t("messenger.namePlaceholder")}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                />
              </div>

              {emailError && (
                <div className="warda-messenger-error">{emailError}</div>
              )}

              <button type="submit" className="warda-messenger-submit-btn">
                <i className="ri-chat-1-line" />
                {t("messenger.startChat")}
              </button>
            </form>
          </div>
        ) : (
          /* Chat Area */
          <div className="warda-messenger-body">
            {/* Guest Banner if guest */}
            {!loggedIn && guestEmail && (
              <div className="warda-messenger-guest-banner">
                <span>
                  <i className="ri-mail-line" /> {guestEmail}
                </span>
                <button
                  type="button"
                  className="warda-messenger-change-email-btn"
                  onClick={() => setIsEditingGuest(true)}
                  title={t("messenger.changeEmail")}
                >
                  {t("messenger.change")}
                </button>
              </div>
            )}

            {/* Messages List */}
            <div className="warda-messenger-messages">
              {loading && messages.length === 0 ? (
                <div className="warda-messenger-loading">
                  <i className="ri-loader-4-line ri-spin" />
                  <span>{t("messenger.loadingMessages")}</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="warda-messenger-empty">
                  <div className="warda-messenger-empty-icon">
                    <i className="ri-chat-smile-2-line" />
                  </div>
                  <p>{t("messenger.emptyPrompt")}</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const msgKey = msg.id || `msg-${idx}`;

                  if (msg.sender === "system") {
                    return (
                      <div key={msgKey} className="inquiry-msg-system-row">
                        <div className="inquiry-msg-system-badge">
                          <i className="ri-user-shared-line" />
                          <span>{msg.text}</span>
                        </div>
                      </div>
                    );
                  }

                  const isUser = msg.sender === "user";
                  const isLongMsg =
                    Boolean(msg.text) &&
                    (msg.text.length > 55 ||
                      (msg.text.match(/\n/g) || []).length >= 2 ||
                      (!msg.text.includes(" ") && msg.text.length > 32));
                  const isMsgExpanded = expandedMsgIds.has(msgKey);

                  return (
                    <div
                      key={msgKey}
                      className={`inquiry-msg-row ${isUser ? "inquiry-msg-row--user" : "inquiry-msg-row--admin"}`}
                    >
                      <div
                        className={`inquiry-msg-bubble ${
                          isLongMsg
                            ? isMsgExpanded
                              ? "inquiry-msg-bubble--expanded"
                              : "inquiry-msg-bubble--collapsed"
                            : ""
                        }`}
                        onClick={
                          isLongMsg && !isMsgExpanded
                            ? () => toggleMsgExpand(msgKey)
                            : undefined
                        }
                        style={
                          isLongMsg && !isMsgExpanded
                            ? { cursor: "pointer" }
                            : undefined
                        }
                      >
                        {!isUser && (
                          <div className="inquiry-msg-sender">
                            {t("messenger.administrator")}
                          </div>
                        )}
                        <div className="inquiry-msg-text">{msg.text}</div>

                        {isLongMsg && (
                          <button
                            type="button"
                            className="inquiry-msg-expand-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMsgExpand(msgKey);
                            }}
                            title={
                              isMsgExpanded
                                ? language === "ru"
                                  ? "Свернуть сообщение"
                                  : language === "hu"
                                    ? "Üzenet összecsukása"
                                    : language === "bg"
                                      ? "Свиване на съобщението"
                                      : language === "el"
                                        ? "Σύμπτυξη μηνύματος"
                                        : language === "ro"
                                          ? "Restrânge mesajul"
                                          : "Collapse message"
                                : language === "ru"
                                  ? "Раскрыть полностью"
                                  : language === "hu"
                                    ? "Teljes üzenet megjelenítése"
                                    : language === "bg"
                                      ? "Показване на цялото съобщение"
                                      : language === "el"
                                        ? "Εμφάνιση πλήρους μηνύματος"
                                        : language === "ro"
                                          ? "Afișează mesajul complet"
                                          : "Show full message"
                            }
                            aria-label={
                              isMsgExpanded
                                ? language === "ru"
                                  ? "Свернуть сообщение"
                                  : language === "hu"
                                    ? "Üzenet összecsukása"
                                    : language === "bg"
                                      ? "Свиване на съобщението"
                                      : language === "el"
                                        ? "Σύμπτυξη μηνύματος"
                                        : language === "ro"
                                          ? "Restrânge mesajul"
                                          : "Collapse message"
                                : language === "ru"
                                  ? "Раскрыть полностью"
                                  : language === "hu"
                                    ? "Teljes üzenet megjelenítése"
                                    : language === "bg"
                                      ? "Показване на цялото съобщение"
                                      : language === "el"
                                        ? "Εμφάνιση πλήρους μηνύματος"
                                        : language === "ro"
                                          ? "Afișează mesajul complet"
                                          : "Show full message"
                            }
                          >
                            <i
                              className={
                                isMsgExpanded
                                  ? "ri-arrow-up-s-line"
                                  : "ri-arrow-down-s-line"
                              }
                            />
                          </button>
                        )}

                        <div className="inquiry-msg-meta">
                          <span className="inquiry-msg-time">
                            {formatMsgTime(msg.timestamp)}
                          </span>
                          {!isUser && msg.deliveredViaEmail && (
                            <span
                              className="inquiry-msg-email-badge"
                              title={t("messenger.emailBadgeTitle")}
                            >
                              <i className="ri-mail-check-line" />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Error or Al-Warda Suggestion Banner */}
            {sendError && (
              <div
                className={`warda-messenger-send-error ${
                  wardaRedirectQuery ? "warda-messenger-send-error--warda" : ""
                }`}
              >
                <i
                  className={
                    wardaRedirectQuery
                      ? "ri-sparkling-fill"
                      : "ri-shield-keyhole-line"
                  }
                />
                <div className="warda-messenger-send-error-content">
                  <span className="warda-messenger-send-error-text">
                    {sendError}
                  </span>
                  {wardaRedirectQuery && (
                    <button
                      type="button"
                      className="warda-messenger-ask-warda-btn"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent("open-warda-assistant", {
                            detail: { query: wardaRedirectQuery },
                          }),
                        );
                        onClose?.();
                      }}
                    >
                      <i className="ri-chat-smile-3-line" />
                      <span>{t("messenger.askWardaBtn")}</span>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="warda-messenger-send-error-close"
                  onClick={() => {
                    setSendError("");
                    setWardaRedirectQuery(null);
                  }}
                  aria-label="Close error"
                >
                  <i className="ri-close-line" />
                </button>
              </div>
            )}

            {/* Input Footer */}
            <form
              className={`warda-messenger-footer ${isInputExpanded ? "warda-messenger-footer--expanded" : ""}`}
              onSubmit={handleSend}
            >
              <textarea
                ref={inputRef}
                rows={1}
                className={`warda-messenger-input ${isInputExpanded ? "expanded" : ""}`}
                placeholder={t("messenger.typeMessage")}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  if (sendError) setSendError("");
                }}
                onKeyDown={handleKeyDown}
                disabled={sending}
              />
              <div className="warda-messenger-input-actions">
                {(isInputTooLarge || isInputExpanded) && (
                  <button
                    type="button"
                    className={`warda-messenger-expand-btn ${isInputExpanded ? "active" : ""}`}
                    onClick={() => setIsInputExpanded((prev) => !prev)}
                    title={
                      isInputExpanded
                        ? language === "ru"
                          ? "Свернуть поле ввода"
                          : language === "hu"
                            ? "Beviteli mező összecsukása"
                            : language === "bg"
                              ? "Свиване на полето за въвеждане"
                              : language === "el"
                                ? "Σύμπτυξη πεδίου εισαγωγής"
                                : language === "ro"
                                  ? "Restrânge câmpul de introducere"
                                  : "Collapse input"
                        : language === "ru"
                          ? "Расширить поле ввода"
                          : language === "hu"
                            ? "Beviteli mező kiterjesztése"
                            : language === "bg"
                              ? "Разширяване на полето за въвеждане"
                              : language === "el"
                                ? "Ανάπτυξη πεδίου εισαγωγής"
                                : language === "ro"
                                  ? "Extinde câmpul de introducere"
                                  : "Expand input"
                    }
                    aria-label={
                      isInputExpanded
                        ? language === "ru"
                          ? "Свернуть поле ввода"
                          : language === "hu"
                            ? "Beviteli mező összecsukása"
                            : language === "bg"
                              ? "Свиване на полето за въвеждане"
                              : language === "el"
                                ? "Σύμπτυξη πεδίου εισαγωγής"
                                : language === "ro"
                                  ? "Restrânge câmpul de introducere"
                                  : "Collapse input"
                        : language === "ru"
                          ? "Расширить поле ввода"
                          : language === "hu"
                            ? "Beviteli mező kiterjesztése"
                            : language === "bg"
                              ? "Разширяване на полето за въвеждане"
                              : language === "el"
                                ? "Ανάπτυξη πεδίου εισαγωγής"
                                : language === "ro"
                                  ? "Extinde câmpul de introducere"
                                  : "Expand input"
                    }
                  >
                    <i
                      className={
                        isInputExpanded
                          ? "ri-fullscreen-exit-line"
                          : "ri-fullscreen-line"
                      }
                    />
                  </button>
                )}
                <button
                  type="submit"
                  className="warda-messenger-send-btn"
                  disabled={!inputText.trim() || sending}
                  title={t("messenger.sendBtnTitle")}
                  aria-label="Send message"
                >
                  {sending ? (
                    <i className="ri-loader-4-line ri-spin" />
                  ) : (
                    <i className="ri-send-plane-2-fill" />
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* User / Guest Support Transfer History Modal */}
        {showTransferHistoryModal && inquiry && (
          <div
            className="warda-messenger-transfer-modal-backdrop"
            onClick={() => setShowTransferHistoryModal(false)}
          >
            <div
              className="warda-messenger-transfer-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="warda-messenger-transfer-modal-header">
                <div className="warda-messenger-transfer-icon">
                  <i className="ri-history-line" />
                </div>
                <div className="warda-messenger-transfer-title-group">
                  <h4>{t("messenger.transferHistoryTitle")}</h4>
                  <p>{t("messenger.dialogTitle")}</p>
                </div>
                <button
                  type="button"
                  className="warda-messenger-transfer-close"
                  onClick={() => setShowTransferHistoryModal(false)}
                  aria-label="Close"
                >
                  <i className="ri-close-line" />
                </button>
              </div>

              <div className="warda-messenger-transfer-modal-body">
                {Array.isArray(inquiry.interlocutors_info?.transferHistory) &&
                inquiry.interlocutors_info.transferHistory.length > 0 ? (
                  <div className="warda-messenger-transfer-timeline">
                    {inquiry.interlocutors_info.transferHistory.map(
                      (tr, idx) => (
                        <div
                          key={tr.id || idx}
                          className="warda-messenger-transfer-item"
                        >
                          <div className="warda-messenger-transfer-marker">
                            <span className="warda-messenger-transfer-num">
                              {idx + 1}
                            </span>
                            {idx <
                              inquiry.interlocutors_info.transferHistory
                                .length -
                                1 && (
                              <span className="warda-messenger-transfer-line" />
                            )}
                          </div>
                          <div className="warda-messenger-transfer-info">
                            <div className="warda-messenger-transfer-route">
                              <span className="warda-messenger-transfer-admin-from">
                                {tr.fromAdminName}
                              </span>
                              <i className="ri-arrow-right-line" />
                              <span className="warda-messenger-transfer-admin-to">
                                {tr.toAdminName}
                              </span>
                            </div>
                            <time className="warda-messenger-transfer-time">
                              {formatTransferTime(tr.timestamp, language)}
                            </time>
                            {tr.reason && (
                              <div className="warda-messenger-transfer-reason">
                                <span>«{tr.reason}»</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="warda-messenger-transfer-empty">
                    {t("messenger.transferEmpty")}
                  </p>
                )}
              </div>

              <div className="warda-messenger-transfer-modal-footer">
                <button
                  type="button"
                  className="warda-messenger-transfer-close-btn"
                  onClick={() => setShowTransferHistoryModal(false)}
                >
                  {t("messenger.gotIt")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
}
