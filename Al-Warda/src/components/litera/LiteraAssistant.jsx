import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import LiteraCharacter from "./LiteraCharacter";
import BookImage from "../common/BookImage";
import { useLanguage } from "../../context/languageContext";
import { useConfirm, useAlert } from "../../context/ConfirmContext";
import { addToCart, getCart } from "../../../utils/cart";
import { isLoggedIn, getCookieUser, isPrivileged } from "../../../utils/auth";
import "./LiteraAssistant.css";

const STORAGE_KEY = "litera_assistant_history_v2";
const DIALOG_LANG_KEY = "litera_assistant_dialog_lang_v1";

const isSearchQuery = (text) =>
  /(посоветуй|порекомендуй|найди|что почитать|подобрать книгу|выбери книгу|какие книги|книги про|книгу про|recommend|suggest|search catalogue|find book)/i.test(
    text,
  ) &&
  !/(корзин|в корзине|заказ|мои заказы|профиль|аккаунт|где найти|куда нажать|выжил|умер|кто убийца|спойлер|финал|концовк)/i.test(
    text,
  );

let idCounter = 0;
const generateId = (prefix) => `${prefix}-${Date.now()}-${++idCounter}`;
const getNowIso = () => new Date().toISOString();

const STORE_NAMES = {
  "librarius.md": "Librarius",
  "carturesti.md": "Cărturești",
  "ulysses.md": "Ulysses",
  "carteamea.md": "CarteaMea",
  "biblion.md": "Biblion",
};

export default function LiteraAssistant() {
  const { language, t } = useLanguage();
  const confirm = useConfirm();
  const customAlert = useAlert();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [showGreetingBubble, setShowGreetingBubble] = useState(true);
  const [showHelpOfferBubble, setShowHelpOfferBubble] = useState(false);
  const [emotion, setEmotion] = useState("greeting");
  const [input, setInput] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTooLarge, setIsTooLarge] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px)").matches
      : false,
  );
  const [expandedMsgIds, setExpandedMsgIds] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("typing");
  const [cartAddingId, setCartAddingId] = useState(null);
  const [cartSuccessId, setCartSuccessId] = useState(null);
  const [cartLoginAlertId, setCartLoginAlertId] = useState(null);
  const [loginAlert, setLoginAlert] = useState("");

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const pendingQueryRef = useRef(null);

  // Initialize messages from sessionStorage or default welcome
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore sessionStorage errors
    }
    return [
      {
        id: "msg-welcome",
        role: "assistant",
        content: t("assistant.welcome"),
        emotion: "greeting",
        timestamp: getNowIso(),
        books: [],
      },
    ];
  });

  // Save conversation in sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Ignore sessionStorage errors
    }
  }, [messages]);

  // Track which language the current dialog is written in
  const [isTranslating, setIsTranslating] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const translateRequestRef = useRef(0);
  const dialogLanguageRef = useRef(
    (() => {
      try {
        return sessionStorage.getItem(DIALOG_LANG_KEY) || language;
      } catch {
        return language;
      }
    })(),
  );

  // When the interface language changes, translate the whole dialog via Gemini
  useEffect(() => {
    if (dialogLanguageRef.current === language) return;
    const targetLanguage = language;
    const requestId = ++translateRequestRef.current;
    const current = messagesRef.current;
    const hasUserMessages = current.some((m) => m.role === "user");

    const finish = () => {
      dialogLanguageRef.current = targetLanguage;
      try {
        sessionStorage.setItem(DIALOG_LANG_KEY, targetLanguage);
      } catch {
        // Ignore sessionStorage errors
      }
    };

    // Fresh dialog with only the welcome message: swap it locally, no API call needed
    if (!hasUserMessages) {
      setMessages((prev) =>
        prev.map((m) =>
          m.role === "assistant" ? { ...m, content: t("assistant.welcome") } : m,
        ),
      );
      finish();
      return;
    }

    const toTranslate = current
      .filter((m) => typeof m.content === "string" && m.content.trim())
      .map((m) => ({ id: m.id, content: m.content }));

    setIsTranslating(true);
    fetch("/api/litera-translate", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ messages: toTranslate, targetLanguage }),
    })
      .then((res) => (res.ok ? res.json() : { translations: [] }))
      .catch(async () => {
        // Local dev fallback: call the service directly
        try {
          const { translateLiteraDialog } = await import(
            "../../../server/literaAssistantService"
          );
          return await translateLiteraDialog({ messages: toTranslate, targetLanguage });
        } catch {
          return { translations: [] };
        }
      })
      .then((data) => {
        if (requestId !== translateRequestRef.current) return;
        const map = new Map(
          (Array.isArray(data?.translations) ? data.translations : []).map((tr) => [
            tr.id,
            tr.content,
          ]),
        );
        if (map.size > 0) {
          // Only message texts change — book cards, URLs and links stay exactly the same
          setMessages((prev) =>
            prev.map((m) => (map.has(m.id) ? { ...m, content: map.get(m.id) } : m)),
          );
          finish();
        }
      })
      .finally(() => {
        if (requestId === translateRequestRef.current) {
          setIsTranslating(false);
        }
      });
  }, [language, t]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, loading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  // Focus input when opened on desktop
  useEffect(() => {
    if (isOpen && !isMobile) {
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMobile]);

  // Auto-resize input textarea on desktop; on mobile ONLY resize when user purposefully toggles isExpanded
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    if (isMobile) {
      const hasOverflow = input.length > 32 || input.includes("\n");
      setIsTooLarge(hasOverflow);
      textarea.style.height = isExpanded ? "100px" : "24px";
      return;
    }

    // Reset height temporarily to accurately measure scrollHeight
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;

    // Expand button appears as soon as content wraps past 1 line (~34px+), or length > 40, or has newline
    const isLarge = scrollHeight > 34 || input.length > 40 || input.includes("\n");
    setIsTooLarge(isLarge);

    if (isExpanded) {
      // Substantial expansion mode
      textarea.style.height = "220px";
    } else if (isLarge) {
      // Multi-line auto-expand: grows smoothly line-by-line up to 110px (~5 lines)
      const targetHeight = Math.min(Math.max(scrollHeight, 24), 110);
      textarea.style.height = `${targetHeight}px`;
    } else {
      // Single line: neat 24px height perfectly centered
      textarea.style.height = "24px";
    }
  }, [input, isExpanded, isMobile]);

  // Global listeners to trigger assistant from other components (404 page, admin messenger redirect)
  useEffect(() => {
    const handleTrigger = (e) => {
      const query = e?.detail?.query || e?.detail?.text || null;
      handleOpen(query);
    };

    const handleOfferHelp = (e) => {
      const query = e?.detail?.query || e?.detail?.text || "";
      if (query) {
        pendingQueryRef.current = query;
        setShowHelpOfferBubble(true);
        setShowGreetingBubble(false);
        setEmotion("speaking");
      }
    };

    window.addEventListener("open-litera-assistant", handleTrigger);
    window.addEventListener("litera-offer-help", handleOfferHelp);
    return () => {
      window.removeEventListener("open-litera-assistant", handleTrigger);
      window.removeEventListener("litera-offer-help", handleOfferHelp);
    };
  }, []);

  const handleOpen = (autoSendText = null) => {
    setIsOpen(true);
    setHasUnread(false);
    setShowGreetingBubble(false);
    setShowHelpOfferBubble(false);
    setEmotion("happy");

    const textToSubmit = autoSendText || pendingQueryRef.current;
    if (textToSubmit) {
      pendingQueryRef.current = null;
      setTimeout(() => {
        handleSendMessage(textToSubmit);
      }, 200);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setEmotion("neutral");
  };

  const toggleMsgExpand = (id) => {
    setExpandedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleClearHistory = async () => {
    const ok = await confirm({
      title: language === "ru" ? "Очистить историю диалога?" : "Clear Chat History?",
      message: t("assistant.clearHistoryConfirm"),
      confirmText: language === "ru" ? "Очистить" : "Clear",
      type: "warning",
    });
    if (!ok) return;

    setExpandedMsgIds(new Set());
    const freshWelcome = [
      {
        id: generateId("msg"),
        role: "assistant",
        content: t("assistant.welcome"),
        emotion: "greeting",
        timestamp: getNowIso(),
        books: [],
      },
    ];
    setMessages(freshWelcome);
    setEmotion("greeting");
    sessionStorage.removeItem(STORAGE_KEY);
    dialogLanguageRef.current = language;
    try {
      sessionStorage.setItem(DIALOG_LANG_KEY, language);
    } catch {
      // Ignore sessionStorage errors
    }
  };

  const handleSendMessage = async (textToSend) => {
    const queryText = (textToSend || input).trim();
    if (!queryText || loading || isTranslating) return;

    setInput("");
    setIsExpanded(false);
    setIsTooLarge(false);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    const userMsg = {
      id: generateId("user"),
      role: "user",
      content: queryText,
      timestamp: getNowIso(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    const initialStatus = isSearchQuery(queryText) ? "searching" : "typing";
    setLoadingStatus(initialStatus);
    setLoading(true);
    setEmotion(initialStatus === "searching" ? "thinking" : "speaking");

    try {
      let cartContext = {
        isLoggedIn: isLoggedIn(),
        itemCount: 0,
        totalPrice: 0,
        items: [],
      };

      if (isLoggedIn()) {
        try {
          const cartRows = await getCart();
          const items = (cartRows || []).map((row) => ({
            title: row.title,
            price: Number(row.price) || 0,
            quantity: Math.max(1, Number(row.quantity) || 1),
            store: row.shop || "",
            url: row.link || "",
          }));
          const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
          const totalPrice =
            Math.round(
              items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100,
            ) / 100;
          cartContext = {
            isLoggedIn: true,
            itemCount,
            totalPrice,
            items,
          };
        } catch {
          // Ignore cart fetch error
        }
      }

      const userObj = getCookieUser();
      const userContext = {
        isLoggedIn: isLoggedIn(),
        name: userObj?.name || userObj?.email?.split("@")[0] || "",
        email: userObj?.email || "",
      };

      const pageContext = {
        pathname: window.location.pathname,
        title: document.title,
      };

      const payload = {
        messages: nextMessages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          books: Array.isArray(m.books)
            ? m.books.map((b) => ({
                id: b.id,
                title: b.title,
                author: b.author,
                price: b.price,
                store: b.store,
                url: b.url,
                image: b.image || "",
                currency: b.currency || "EUR",
              }))
            : [],
        })),
        language,
        context: {
          cart: cartContext,
          user: userContext,
          page: pageContext,
        },
      };

      let data = null;
      try {
        const response = await fetch("/api/litera-chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Accept: "text/event-stream, application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("text/event-stream") && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() || "";

            for (const chunk of chunks) {
              const trimmed = chunk.trim();
              if (!trimmed.startsWith("data:")) continue;
              try {
                const eventData = JSON.parse(trimmed.replace(/^data:\s*/, ""));
                if (eventData.type === "status") {
                  setLoadingStatus(eventData.status);
                  setEmotion(
                    eventData.status === "searching" ? "thinking" : "speaking",
                  );
                } else if (eventData.type === "result") {
                  data = eventData;
                }
              } catch {
                // Ignore malformed chunk
              }
            }
          }
        } else if (contentType.includes("application/json")) {
          data = await response.json();
        } else {
          throw new Error("Unexpected response content-type");
        }
      } catch {
        const { processLiteraChat } = await import(
          "../../../server/literaAssistantService"
        );
        data = await processLiteraChat({
          ...payload,
          onStatus: (status) => {
            setLoadingStatus(status);
            setEmotion(status === "searching" ? "thinking" : "speaking");
          },
        });
      }

      // Handle navigation action if requested
      if (data?.action?.type === "navigate" && data.action.url) {
        navigate(data.action.url);
      }

      if (data?.referToAdmin) {
        window.dispatchEvent(new CustomEvent("litera-refer-to-admin"));
      }

      const assistantEmotion = data?.emotion || "happy";
      setEmotion(assistantEmotion);

      const assistantMsg = {
        id: generateId("assistant"),
        role: "assistant",
        content: data?.message || "",
        emotion: assistantEmotion,
        books: Array.isArray(data?.books) ? data.books : [],
        referToAdmin: Boolean(data?.referToAdmin),
        timestamp: getNowIso(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (!isOpen) {
        setHasUnread(true);
      }
    } catch (err) {
      console.error("Litera chat error:", err);
      setEmotion("concerned");
      setMessages((prev) => [
        ...prev,
        {
          id: generateId("assistant"),
          role: "assistant",
          content:
            language === "ru"
              ? "Ой, кажется, возникла ошибка соединения! 💜 Попробуйте повторить запрос."
              : "Oops, a connection error occurred! 💜 Please try again.",
          emotion: "concerned",
          books: [],
          timestamp: getNowIso(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if ((e.key === "Enter" && !e.shiftKey) || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleAddToCart = async (book) => {
    if (!isLoggedIn()) {
      setLoginAlert(t("assistant.loginRequired"));
      setCartLoginAlertId(book.id || book.url);
      setTimeout(() => {
        setLoginAlert("");
        setCartLoginAlertId(null);
      }, 4000);
      return;
    }

    try {
      setCartAddingId(book.id || book.url);
      await addToCart({
        url: book.url,
        title: book.title,
        price: book.price,
        image: book.image || "",
        store: book.store,
        currency: book.currency || "EUR",
        quantity: 1,
      });

      setCartSuccessId(book.id || book.url);
      window.dispatchEvent(new Event("cart-updated"));
      setTimeout(() => setCartSuccessId(null), 2500);
    } catch (err) {
      console.error("Failed to add book to cart:", err);
      await customAlert({
        title: language === "ru" ? "Ошибка добавления в корзину" : "Cart Error",
        message: err.message || (language === "ru" ? "Не удалось добавить книгу в корзину" : "Failed to add book to cart"),
        type: "danger",
      });
    } finally {
      setCartAddingId(null);
    }
  };

  const handleViewBook = (book) => {
    navigate(`/book?url=${encodeURIComponent(book.url)}`, {
      state: { book },
    });
  };

  const isNewDialog = messages.filter((m) => m.role === "user").length === 0;

  const initialQuestions = [
    t("assistant.q1"),
    t("assistant.q2"),
    t("assistant.q3"),
    t("assistant.q4"),
    t("assistant.q5"),
  ];

  return (
    <div className={`litera-assistant-root ${isOpen ? "litera-assistant-root--open" : ""}`}>
      {/* Floating trigger button when closed */}
      {!isOpen && (
        <div className="litera-trigger-container">
          {showHelpOfferBubble ? (
            <div
              className="litera-trigger-bubble litera-trigger-bubble--offer"
              onClick={() => handleOpen()}
              title={
                language === "ru"
                  ? "Нажмите, чтобы задать вопрос Литере"
                  : "Click to ask Litera"
              }
              role="button"
              tabIndex={0}
            >
              <span className="litera-offer-badge-icon">✨</span>
              <span className="litera-offer-badge-text">
                {language === "ru"
                  ? "Я с радостью отвечу на этот вопрос! Нажмите на меня 🤍"
                  : "I'll gladly answer this question! Click me 🤍"}
              </span>
              <button
                type="button"
                className="litera-trigger-bubble__close"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHelpOfferBubble(false);
                }}
                aria-label="Close bubble"
              >
                ×
              </button>
            </div>
          ) : showGreetingBubble ? (
            <div className="litera-trigger-bubble">
              <span>{t("assistant.badge")}</span>
              <button
                type="button"
                className="litera-trigger-bubble__close"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowGreetingBubble(false);
                }}
                aria-label="Close bubble"
              >
                ×
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="litera-trigger-btn"
            onClick={handleOpen}
            aria-label={t("assistant.openChat")}
            title={t("assistant.openChat")}
          >
            <LiteraCharacter
              emotion={emotion}
              size={64}
              className="litera-trigger-avatar"
            />
            {hasUnread && <span className="litera-unread-badge" />}
          </button>
        </div>
      )}

      {/* Interactive Chat Window */}
      {isOpen && (
        <div className="litera-window-wrapper">
          {/* Side character companion (Desktop) */}
          <div className="litera-companion-dock">
            <div className="litera-companion-dock__character-box">
              <LiteraCharacter
                emotion={loading ? (loadingStatus === "searching" ? "thinking" : "speaking") : emotion}
                size={170}
                className="litera-companion-dock__character"
              />
              <div className="litera-companion-dock__name-tag">
                <span className="litera-companion-dock__name">{t("assistant.name")}</span>
                <span className="litera-companion-dock__status">
                  <span className="litera-status-dot" />
                  {loading ? (
                    <span className="litera-status-inline">
                      {loadingStatus === "searching"
                        ? t("assistant.searching")
                        : t("assistant.typing")}
                    </span>
                  ) : (
                    t("assistant.statusOnline")
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Main Chat Panel */}
          <div className="litera-chat-panel">
            {/* Header */}
            <div className="litera-chat-header">
              <div className="litera-chat-header__info">
                <div className="litera-chat-header__avatar-wrap">
                  <LiteraCharacter
                    emotion={loading ? (loadingStatus === "searching" ? "thinking" : "speaking") : emotion}
                    size={38}
                    className="litera-chat-header__avatar"
                  />
                  <span className="litera-status-dot litera-status-dot--online" />
                </div>
                <div>
                  <h3 className="litera-chat-header__title">{t("assistant.name")}</h3>
                  <p className="litera-chat-header__subtitle">{t("assistant.title")}</p>
                </div>
              </div>

              <div className="litera-chat-header__actions">
                <button
                  type="button"
                  className="litera-header-btn"
                  onClick={handleClearHistory}
                  title={t("assistant.clearHistory")}
                  aria-label={t("assistant.clearHistory")}
                >
                  <i className="ri-refresh-line" />
                </button>
                <button
                  type="button"
                  className="litera-header-btn litera-header-btn--close"
                  onClick={handleClose}
                  title={t("assistant.closeChat")}
                  aria-label={t("assistant.closeChat")}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
            </div>

            {/* Login Required Notice */}
            {loginAlert && (
              <div className="litera-alert-banner">
                <span>{loginAlert}</span>
                <button
                  type="button"
                  className="litera-alert-banner__link"
                  onClick={() => navigate("/login")}
                >
                  {t("nav.login")}
                </button>
              </div>
            )}

            {/* Messages Body */}
            <div className="litera-chat-body">
              {messages.map((msg) => {
                const isUser = msg.role === "user";
                const isLongMsg =
                  isUser &&
                  msg.content &&
                  (msg.content.length > 55 ||
                    (msg.content.match(/\n/g) || []).length >= 2 ||
                    (!msg.content.includes(" ") && msg.content.length > 32));
                const isMsgExpanded = expandedMsgIds.has(msg.id);

                return (
                  <div
                    key={msg.id}
                    className={`litera-msg-row litera-msg-row--${msg.role}`}
                  >
                    {msg.role === "assistant" && (
                      <LiteraCharacter
                        emotion={msg.emotion || "neutral"}
                        size={32}
                        className="litera-msg-avatar"
                      />
                    )}

                    <div className="litera-msg-bubble-wrap">
                      <div
                        className={`litera-msg-bubble ${
                          isLongMsg
                            ? isMsgExpanded
                              ? "litera-msg-bubble--expanded"
                              : "litera-msg-bubble--collapsed"
                            : ""
                        }`}
                        onClick={
                          isLongMsg && !isMsgExpanded
                            ? () => toggleMsgExpand(msg.id)
                            : undefined
                        }
                        style={
                          isLongMsg && !isMsgExpanded
                            ? { cursor: "pointer" }
                            : undefined
                        }
                      >
                        <p className="litera-msg-text">{msg.content}</p>

                        {isLongMsg && (
                          <button
                            type="button"
                            className="litera-msg-expand-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMsgExpand(msg.id);
                            }}
                            title={
                              language === "ru"
                                ? isMsgExpanded
                                  ? "Свернуть сообщение"
                                  : "Раскрыть полностью"
                                : isMsgExpanded
                                  ? "Collapse message"
                                  : "Show full message"
                            }
                            aria-label={
                              language === "ru"
                                ? isMsgExpanded
                                  ? "Свернуть сообщение"
                                  : "Раскрыть полностью"
                                : isMsgExpanded
                                  ? "Collapse message"
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

                        {msg.referToAdmin && (
                          <div className="litera-msg-admin-action">
                            <button
                              type="button"
                              className="litera-msg-admin-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.dispatchEvent(
                                  new CustomEvent("litera-open-messenger"),
                                );
                              }}
                            >
                              <i className="ri-customer-service-2-line" />
                              <span>
                                {language === "ru"
                                  ? "Связаться с администратором"
                                  : "Contact administrator"}
                              </span>
                            </button>
                          </div>
                        )}

                      {/* Recommended Real Book Cards */}
                      {Array.isArray(msg.books) && msg.books.length > 0 && (
                        <div className="litera-books-container">
                          <div className="litera-books-container__label">
                            <i className="ri-book-read-line" />
                            <span>{t("assistant.recommendationsTitle")}</span>
                          </div>
                          <div className="litera-books-grid">
                            {msg.books.map((book) => {
                              const storeLabel =
                                STORE_NAMES[book.store] || book.store;
                              const isAdding =
                                cartAddingId === (book.id || book.url);
                              const isSuccess =
                                cartSuccessId === (book.id || book.url);

                              const isLoginPrompt =
                                cartLoginAlertId === (book.id || book.url);

                              return (
                                <div
                                  key={book.id || book.url}
                                  className="litera-book-card"
                                >
                                  <div
                                    className="litera-book-card__cover-wrap"
                                    onClick={() => handleViewBook(book)}
                                    role="button"
                                    tabIndex={0}
                                  >
                                    <BookImage
                                      src={book.image}
                                      alt={book.title}
                                      className="litera-book-card__cover"
                                      loading="eager"
                                      decoding="async"
                                      fetchPriority="high"
                                    />
                                    {isPrivileged() && storeLabel && (
                                      <span className="litera-book-card__store-badge">
                                        {storeLabel}
                                      </span>
                                    )}
                                  </div>

                                  <div className="litera-book-card__details">
                                    <h4
                                      className="litera-book-card__title"
                                      onClick={() => handleViewBook(book)}
                                      title={book.title}
                                    >
                                      {book.title}
                                    </h4>
                                    {book.author && (
                                      <p className="litera-book-card__author">
                                        {book.author}
                                      </p>
                                    )}
                                    <div className="litera-book-card__price-row">
                                      <span className="litera-book-card__price">
                                        €{Number(book.price).toFixed(2)}
                                      </span>
                                    </div>

                                    <div className="litera-book-card__actions">
                                      <button
                                        type="button"
                                        className={`litera-book-card__btn-cart ${
                                          isSuccess
                                            ? "litera-book-card__btn-cart--success"
                                            : isLoginPrompt
                                              ? "litera-book-card__btn-cart--login-prompt"
                                              : ""
                                        }`}
                                        onClick={() => handleAddToCart(book)}
                                        disabled={isAdding}
                                      >
                                        <i
                                          className={
                                            isSuccess
                                              ? "ri-check-line"
                                              : isLoginPrompt
                                                ? "ri-login-box-line"
                                                : isAdding
                                                  ? "ri-loader-4-line ri-spin"
                                                  : "ri-shopping-cart-2-line"
                                          }
                                        />
                                        <span>
                                          {isSuccess
                                            ? t("assistant.addedToCart")
                                            : isLoginPrompt
                                              ? t("assistant.loginRequired")
                                              : t("assistant.addToCart")}
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        className="litera-book-card__btn-view"
                                        onClick={() => handleViewBook(book)}
                                        title={t("assistant.viewBook")}
                                      >
                                        <i className="ri-external-link-line" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="litera-msg-timestamp">
                      {msg.timestamp
                        ? new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                  </div>
                </div>
              );
            })}

              {/* Thinking / Searching / Typing animation */}
              {loading && (
                <div className="litera-msg-row litera-msg-row--assistant">
                  <LiteraCharacter
                    emotion={loadingStatus === "searching" ? "thinking" : "speaking"}
                    size={32}
                    className="litera-msg-avatar"
                  />
                  <div className="litera-msg-bubble-wrap">
                    <div className="litera-msg-bubble litera-msg-bubble--thinking">
                      <div className="litera-typing-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                      <span className="litera-typing-text">
                        {loadingStatus === "searching"
                          ? t("assistant.searching")
                          : t("assistant.typing")}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {isTranslating && (
              <div className="litera-translating-banner" role="status">
                <i className="ri-translate-2 ri-spin" />
                <span>
                  {language === "ru"
                    ? "Литера переводит диалог на русский..."
                    : "Litera is translating the dialog into English..."}
                </span>
              </div>
            )}

            {/* 5 Suggestion Questions in a Scrollable Row (When starting a new dialog) */}
            {isNewDialog && !loading && (
              <div className="litera-questions-bar">
                <div className="litera-questions-track">
                  {initialQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="litera-question-chip"
                      onClick={() => handleSendMessage(q)}
                      title={q}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Bar */}
            <div className={`litera-chat-footer ${isExpanded ? "footer-expanded" : ""}`}>
              <form
                className={`litera-chat-input-form ${(!isMobile && isTooLarge) || isExpanded ? "multiline" : ""} ${isExpanded ? "litera-input-expanded" : ""}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
              >
                <textarea
                  ref={inputRef}
                  className={`litera-chat-textarea ${isExpanded ? "expanded" : ""}`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isMobile
                      ? language === "ru"
                        ? "Спросите о книгах или авторах..."
                        : "Ask about books or authors..."
                      : t("assistant.placeholder")
                  }
                  rows={1}
                  disabled={loading || isTranslating}
                />
                <div className="litera-input-actions">
                  {(isTooLarge || isExpanded) && (
                    <button
                      type="button"
                      className={`litera-expand-btn ${isExpanded ? "active" : ""}`}
                      onClick={() => setIsExpanded((prev) => !prev)}
                      title={
                        language === "ru"
                          ? isExpanded
                            ? "Свернуть поле ввода"
                            : "Расширить поле ввода"
                          : isExpanded
                            ? "Collapse input"
                            : "Expand input"
                      }
                      aria-label={
                        language === "ru"
                          ? isExpanded
                            ? "Свернуть поле ввода"
                            : "Расширить поле ввода"
                          : isExpanded
                            ? "Collapse input"
                            : "Expand input"
                      }
                    >
                      <i className={isExpanded ? "ri-fullscreen-exit-line" : "ri-fullscreen-line"} />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="litera-send-btn"
                    disabled={!input.trim() || loading || isTranslating}
                    aria-label={t("assistant.send")}
                    title={t("assistant.send")}
                  >
                    <i className="ri-send-plane-fill" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
