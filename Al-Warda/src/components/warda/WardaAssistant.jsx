import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import WardaCharacter from "./WardaCharacter";
import BookImage from "../common/BookImage";
import { useLanguage } from "../../context/languageContext";
import { useCurrency } from "../../context/currencyContext";
import { useConfirm, useAlert } from "../../context/ConfirmContext";
import { addToCart, getCart } from "../../../utils/cart";
import { useCartState } from "../../hooks/useCartState";
import { getPerfumeUrl, getDefaultPerfumeVolumeOption } from "../../../utils/perfumes";
import { isLoggedIn, getCookieUser, isPrivileged } from "../../../utils/auth";
import "./WardaAssistant.css";

const STORAGE_KEY = "warda_assistant_history_v5";
const DIALOG_LANG_KEY = "warda_assistant_dialog_lang_v1";

const isSearchQuery = (text) =>
  !/(корзин|в корзине|заказ|мои заказы|профиль|аккаунт|где найти|куда нажать|войти|пароль)/i.test(
    text || "",
  );

let idCounter = 0;
const generateId = (prefix) => `${prefix}-${Date.now()}-${++idCounter}`;
const getNowIso = () => new Date().toISOString();

const STORE_NAMES = {
  "alwarda.ae": "Al-Warda Boutique",
  "middle_east": "Middle East Hub",
};

export function formatAssistantSpeech(content) {
  if (!content || typeof content !== "string") return "";

  let text = content;

  // 1. Currency & Prices: convert any EUR/euro/евро/€ to euro symbol with non-breaking space
  // Handle price ranges: 24.09 - 30.50 EUR -> 24.09–30.50 €
  text = text.replace(
    /(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(?:EUR|Eur|eur|евро|Евро|euro|Euro|€)(?![а-яёА-ЯЁa-zA-Z0-9])/gu,
    "$1–$2\u00A0€"
  );
  // Handle € preceding number: € 24.09 or €24.09 -> 24.09 €
  text = text.replace(/€\s*(\d+(?:[.,]\d+)?)/gu, "$1\u00A0€");
  // Handle number followed by EUR / евро / euro: 24.09 EUR -> 24.09 €
  text = text.replace(
    /(\d+(?:[.,]\d+)?)\s*(?:EUR|Eur|eur|евро|Евро|euro|Euro)(?![а-яёА-ЯЁa-zA-Z0-9])/gu,
    "$1\u00A0€"
  );
  // Ensure non-breaking space before € symbol if written with space or newline: 24.09 € -> 24.09\u00A0€
  text = text.replace(/(\d+(?:[.,]\d+)?)\s*€/gu, "$1\u00A0€");

  // 2. Volumes: e.g. 90 ml, 100 мл, 50 ml -> non-breaking space
  text = text.replace(/(\d+)\s*(ml|мл)(?![а-яёА-ЯЁa-zA-Z0-9])/giu, "$1\u00A0$2");

  // 3. If an emoji appears after sentence-ending punctuation and introduces a new sentence/question,
  // put it onto a new paragraph instead of awkwardly gluing it to the previous line.
  text = text.replace(/([.!?…])\s*([\p{Extended_Pictographic}\u2600-\u27bf])\s*([\p{L}])/gu, "$1\n\n$2 $3");

  // 4. Prevent emoji from hanging at the end of a line without its opening word
  text = text.replace(/([\p{Extended_Pictographic}\u2600-\u27bf])\s+([\p{L}])/gu, "$1\u00A0$2");

  // 5. Typographical non-breaking space for single-letter prepositions/conjunctions in Russian/English
  text = text.replace(/(?<=^|[\s«"'(])([а-яёА-ЯЁa-zA-Z])\s+/gu, "$1\u00A0");

  // 6. Normalize excessive newlines
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

export function renderFormattedAssistantText(text) {
  if (!text || typeof text !== "string") return text;
  // Match formatted prices (e.g. "24.09 €" or "24 €" with nbsp) to wrap in an unbreakable inline tag
  const parts = text.split(/(\d+(?:[.,]\d+)?\u00A0€)/gu);
  if (parts.length === 1) return text;
  return parts.map((part, idx) => {
    if (/^\d+(?:[.,]\d+)?\u00A0€$/u.test(part)) {
      return (
        <span key={idx} className="warda-price-tag">
          {part}
        </span>
      );
    }
    return part;
  });
}

export default function WardaAssistant() {
  const { language, t } = useLanguage();
  const { formatPrice } = useCurrency();
  const confirm = useConfirm();
  const customAlert = useAlert();
  const navigate = useNavigate();
  const { isInCart, toggleCart } = useCartState();

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
    fetch("/api/warda-translate", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ messages: toTranslate, targetLanguage }),
    })
      .then((res) => (res.ok ? res.json() : { translations: [] }))
      .catch(async () => {
        // Local dev fallback: call the service directly
        try {
          const { translateWardaDialog } = await import(
            "../../../server/wardaAssistantService"
          );
          return await translateWardaDialog({ messages: toTranslate, targetLanguage });
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
    // Pre-warm catalog index in memory so the assistant responds instantaneously
    import("../../../server/wardaAssistantService")
      .then((mod) => mod.ensureCatalogLoaded?.())
      .catch(() => {});

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

    const handleCloseForAdmin = () => {
      setIsOpen(false);
      setEmotion("neutral");
    };

    window.addEventListener("open-warda-assistant", handleTrigger);
    window.addEventListener("warda-offer-help", handleOfferHelp);
    window.addEventListener("warda-open-messenger", handleCloseForAdmin);
    return () => {
      window.removeEventListener("open-warda-assistant", handleTrigger);
      window.removeEventListener("warda-offer-help", handleOfferHelp);
      window.removeEventListener("warda-open-messenger", handleCloseForAdmin);
    };
  }, []);

  const handleOpen = (autoSendText = null) => {
    setIsOpen(true);
    setHasUnread(false);
    setShowGreetingBubble(false);
    setShowHelpOfferBubble(false);
    setEmotion("greeting");

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
      title: t("assistant.clearHistoryTitle"),
      message: t("assistant.clearHistoryConfirm"),
      confirmText: t("assistant.clear"),
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

      const isCartQuery = /(корзин|заказ|cart|bag|order|checkout|оформ)/i.test(queryText);
      if (isLoggedIn() && isCartQuery) {
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
        name: userObj?.name || userObj?.firstName || userObj?.email?.split("@")[0] || "",
        firstName: userObj?.firstName || "",
        lastName: userObj?.lastName || "",
        gender: userObj?.gender || "",
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
      const { processWardaChat } = await import(
        "../../../server/wardaAssistantService"
      );
      data = await processWardaChat({
        ...payload,
        onStatus: (status) => {
          setLoadingStatus(status);
          setEmotion(status === "searching" ? "thinking" : "speaking");
        },
      });

      // Handle navigation action if requested
      if (data?.action?.type === "navigate" && data.action.url) {
        navigate(data.action.url);
      }

      if (data?.referToAdmin) {
        window.dispatchEvent(new CustomEvent("warda-refer-to-admin"));
      }

      const rawEmotion = data?.emotion || "happy";
      const assistantEmotion = rawEmotion === "thinking" ? "speaking" : rawEmotion;
      setEmotion(assistantEmotion);

      const assistantMsg = {
        id: generateId("assistant"),
        role: "assistant",
        content: formatAssistantSpeech(data?.message || ""),
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
      console.error("Al-Warda chat error:", err);
      setEmotion("concerned");
      setMessages((prev) => [
        ...prev,
        {
          id: generateId("assistant"),
          role: "assistant",
          content:
            language === "ru"
              ? "Ой, кажется, возникла ошибка соединения! 💜 Попробуйте повторить запрос."
              : language === "hu"
              ? "Hoppá, kapcsolódási hiba történt! 💜 Kérjük, próbálja újra a kérést."
              : language === "bg"
              ? "Опа, възникна грешка при връзката! 💜 Моля, опитайте отново."
              : language === "el"
              ? "Ωχ, παρουσιάστηκε σφάλμα σύνδεσης! 💜 Παρακαλώ δοκιμάστε ξανά."
              : language === "ro"
              ? "Ups, a apărut o eroare de conexiune! 💜 Vă rugăm să încercați din nou."
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
    try {
      const defOpt = getDefaultPerfumeVolumeOption(book);
      const isSample = defOpt.isSecondLargest && defOpt.isSample;
      const volKey = isSample ? defOpt.key : null;
      const bookKey = book.id || book.url;
      const inCart = isInCart(book, isSample ? defOpt.key : "full");
      setCartAddingId(bookKey);
      await toggleCart(book, {
        volKey,
        isSample,
        quantity: 1,
        language,
      });

      if (!inCart) {
        setCartSuccessId(bookKey);
        setTimeout(() => setCartSuccessId(null), 2500);
      }
    } catch (err) {
      console.error("Failed to toggle perfume in cart:", err);
      await customAlert({
        title: t("assistant.cartError"),
        message: err.message || t("featured.error"),
        type: "danger",
      });
    } finally {
      setCartAddingId(null);
    }
  };

  const handleViewBook = (book) => {
    const defOpt = getDefaultPerfumeVolumeOption(book);
    const isSample = defOpt.isSecondLargest && defOpt.isSample;
    const targetUrl = book
      ? (book.url || (defOpt.isSecondLargest
          ? (isSample ? `${getPerfumeUrl(book)}?sample=${defOpt.key}` : `${getPerfumeUrl(book)}?size=${defOpt.key}`)
          : getPerfumeUrl(book)))
      : "/featured";
    navigate(targetUrl, {
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
    <div className={`warda-assistant-root ${isOpen ? "warda-assistant-root--open" : ""}`}>
      {/* Floating trigger button when closed */}
      {!isOpen && (
        <div className="warda-trigger-container">
          {showHelpOfferBubble ? (
            <div
              className="warda-trigger-bubble warda-trigger-bubble--offer"
              onClick={() => handleOpen()}
              title={
                language === "ru"
                  ? "Нажмите, чтобы задать вопрос Ясмин"
                  : language === "hu"
                  ? "Kattintson, hogy kérdezzen Jázmintól"
                  : language === "bg"
                  ? "Кликнете, за да попитате Ясмин"
                  : language === "el"
                  ? "Κάντε κλικ για να ρωτήσετε τη Yasmin"
                  : language === "ro"
                  ? "Faceți clic pentru a întreba pe Yasmin"
                  : "Click to ask Yasmin"
              }
              role="button"
              tabIndex={0}
            >
              <span className="warda-offer-badge-icon">✨</span>
              <span className="warda-offer-badge-text">
                {language === "ru"
                  ? "Я с радостью отвечу на этот вопрос! Нажмите на меня 🤍"
                  : language === "hu"
                  ? "Örömmel válaszolok erre a kérdésre! Kattintson rám 🤍"
                  : language === "bg"
                  ? "С удоволствие ще отговоря на този въпрос! Кликнете върху мен 🤍"
                  : language === "el"
                  ? "Θα χαρώ να απαντήσω σε αυτή την ερώτηση! Κάντε κλικ επάνω μου 🤍"
                  : language === "ro"
                  ? "Voi răspunde cu plăcere la această întrebare! Faceți clic pe mine 🤍"
                  : "I'll gladly answer this question! Click me 🤍"}
              </span>
              <button
                type="button"
                className="warda-trigger-bubble__close"
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
            <div className="warda-trigger-bubble">
              <span>{t("assistant.badge")}</span>
              <button
                type="button"
                className="warda-trigger-bubble__close"
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
            className="warda-trigger-btn"
            onClick={handleOpen}
            aria-label={t("assistant.openChat")}
            title={t("assistant.openChat")}
          >
            <WardaCharacter
              emotion="greeting"
              size={64}
              className="warda-trigger-avatar"
            />
            {hasUnread && <span className="warda-unread-badge" />}
          </button>
        </div>
      )}

      {/* Interactive Chat Window */}
      {isOpen && (
        <div className="warda-window-wrapper">
          {/* Side character companion (Desktop) */}
          <div className="warda-companion-dock">
            <div className="warda-companion-dock__character-box">
              <WardaCharacter
                emotion={loading ? (loadingStatus === "searching" ? "thinking" : "speaking") : emotion}
                size={230}
                className="warda-companion-dock__character"
              />
              <div className="warda-companion-dock__name-tag">
                <span className="warda-companion-dock__name">{t("assistant.name")}</span>
                <span className="warda-companion-dock__status">
                  <span className="warda-status-dot" />
                  {loading ? (
                    <span className="warda-status-inline">
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
          <div className="warda-chat-panel">
            {/* Header */}
            <div className="warda-chat-header">
              <div className="warda-chat-header__info">
                <div className="warda-chat-header__avatar-wrap">
                  <WardaCharacter
                    emotion={loading ? (loadingStatus === "searching" ? "thinking" : "speaking") : emotion}
                    size={38}
                    className="warda-chat-header__avatar"
                  />
                  <span className="warda-status-dot warda-status-dot--online" />
                </div>
                <div>
                  <h3 className="warda-chat-header__title">{t("assistant.name")}</h3>
                  <p className="warda-chat-header__subtitle">{t("assistant.title")}</p>
                </div>
              </div>

              <div className="warda-chat-header__actions">
                <button
                  type="button"
                  className="warda-header-btn"
                  onClick={handleClearHistory}
                  title={t("assistant.clearHistory")}
                  aria-label={t("assistant.clearHistory")}
                >
                  <i className="ri-refresh-line" />
                </button>
                <button
                  type="button"
                  className="warda-header-btn warda-header-btn--close"
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
              <div className="warda-alert-banner">
                <span>{loginAlert}</span>
                <button
                  type="button"
                  className="warda-alert-banner__link"
                  onClick={() => navigate("/login")}
                >
                  {t("nav.login")}
                </button>
              </div>
            )}

            {/* Messages Body */}
            <div className="warda-chat-body">
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
                    className={`warda-msg-row warda-msg-row--${msg.role}`}
                  >
                    {msg.role === "assistant" && (
                      <WardaCharacter
                        emotion={msg.emotion || "happy"}
                        size={32}
                        className="warda-msg-avatar"
                      />
                    )}

                    <div className="warda-msg-bubble-wrap">
                      <div
                        className={`warda-msg-bubble ${
                          isLongMsg
                            ? isMsgExpanded
                              ? "warda-msg-bubble--expanded"
                              : "warda-msg-bubble--collapsed"
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
                        <p className="warda-msg-text">
                          {msg.role === "assistant"
                            ? renderFormattedAssistantText(formatAssistantSpeech(msg.content))
                            : msg.content}
                        </p>

                        {isLongMsg && (
                          <button
                            type="button"
                            className="warda-msg-expand-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMsgExpand(msg.id);
                            }}
                            title={
                              isMsgExpanded
                                ? (language === "ru" ? "Свернуть сообщение" : language === "hu" ? "Üzenet összecsukása" : language === "bg" ? "Свиване на съобщението" : language === "el" ? "Σύμπτυξη μηνύματος" : language === "ro" ? "Restrânge mesajul" : "Collapse message")
                                : (language === "ru" ? "Раскрыть полностью" : language === "hu" ? "Teljes üzenet megjelenítése" : language === "bg" ? "Показване на цялото съобщение" : language === "el" ? "Εμφάνιση πλήρους μηνύματος" : language === "ro" ? "Afișează mesajul complet" : "Show full message")
                            }
                            aria-label={
                              isMsgExpanded
                                ? (language === "ru" ? "Свернуть сообщение" : language === "hu" ? "Üzenet összecsukása" : language === "bg" ? "Свиване на съобщението" : language === "el" ? "Σύμπτυξη μηνύματος" : language === "ro" ? "Restrânge mesajul" : "Collapse message")
                                : (language === "ru" ? "Раскрыть полностью" : language === "hu" ? "Teljes üzenet megjelenítése" : language === "bg" ? "Показване на цялото съобщение" : language === "el" ? "Εμφάνιση πλήρους μηνύματος" : language === "ro" ? "Afișează mesajul complet" : "Show full message")
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
                          <div className="warda-msg-admin-action">
                            <button
                              type="button"
                              className="warda-msg-admin-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.dispatchEvent(
                                  new CustomEvent("warda-open-messenger"),
                                );
                              }}
                            >
                              <i className="ri-customer-service-2-line" />
                              <span>
                                {t("nav.messenger") || "Contact administrator"}
                              </span>
                            </button>
                          </div>
                        )}

                      {/* Recommended Real Book Cards */}
                      {Array.isArray(msg.books) && msg.books.length > 0 && (
                        <div className="warda-books-container">
                          <div className="warda-books-container__label">
                            <i className="ri-sparkling-2-line" />
                            <span>{t("assistant.recommendationsTitle")}</span>
                          </div>
                          <div className="warda-books-grid">
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
                                  className="warda-book-card"
                                >
                                  <div
                                    className="warda-book-card__cover-wrap"
                                    onClick={() => handleViewBook(book)}
                                    role="button"
                                    tabIndex={0}
                                  >
                                    <BookImage
                                      src={book.image}
                                      alt={book.title}
                                      className="warda-book-card__cover"
                                      loading="eager"
                                      decoding="async"
                                      fetchPriority="high"
                                    />
                                    {isPrivileged() && storeLabel && (
                                      <span className="warda-book-card__store-badge">
                                        {storeLabel}
                                      </span>
                                    )}
                                  </div>

                                  <div className="warda-book-card__details">
                                    <h4
                                      className="warda-book-card__title"
                                      onClick={() => handleViewBook(book)}
                                      title={book.title}
                                    >
                                      {book.title}
                                    </h4>
                                    {book.author && (
                                      <p className="warda-book-card__author">
                                        {book.author}
                                      </p>
                                    )}
                                    <div className="warda-book-card__price-row">
                                      <span className="warda-book-card__price">
                                        {formatPrice(getDefaultPerfumeVolumeOption(book).price)}
                                      </span>
                                    </div>

                                    <div className="warda-book-card__actions">
                                      {(() => {
                                        const defOpt = getDefaultPerfumeVolumeOption(book);
                                        const isSample = defOpt.isSecondLargest && defOpt.isSample;
                                        const inCart = isInCart(book, isSample ? defOpt.key : "full");
                                        return (
                                          <button
                                            type="button"
                                            className={`warda-book-card__btn-cart ${
                                              inCart
                                                ? "warda-book-card__btn-cart--in-cart"
                                                : isSuccess
                                                  ? "warda-book-card__btn-cart--success"
                                                  : isLoginPrompt
                                                    ? "warda-book-card__btn-cart--login-prompt"
                                                    : ""
                                            }`}
                                            onClick={() => handleAddToCart(book)}
                                            disabled={isAdding}
                                            title={inCart ? t("featured.remove") : undefined}
                                          >
                                            <i
                                              className={
                                                inCart
                                                  ? "ri-check-line"
                                                  : isSuccess
                                                    ? "ri-check-line"
                                                    : isLoginPrompt
                                                      ? "ri-login-box-line"
                                                      : isAdding
                                                        ? "ri-loader-4-line ri-spin"
                                                        : "ri-shopping-cart-2-line"
                                              }
                                            />
                                            <span>
                                              {inCart
                                                ? t("featured.inBag")
                                                : isSuccess
                                                  ? t("assistant.addedToCart")
                                                  : isLoginPrompt
                                                    ? t("assistant.loginRequired")
                                                    : t("assistant.addToCart")}
                                            </span>
                                          </button>
                                        );
                                      })()}
                                      <button
                                        type="button"
                                        className="warda-book-card__btn-view"
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
                    <span className="warda-msg-timestamp">
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
                <div className="warda-msg-row warda-msg-row--assistant">
                  <WardaCharacter
                    emotion={loadingStatus === "searching" ? "thinking" : "speaking"}
                    size={32}
                    className="warda-msg-avatar"
                  />
                  <div className="warda-msg-bubble-wrap">
                    <div className="warda-msg-bubble warda-msg-bubble--thinking">
                      <div className="warda-typing-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                      <span className="warda-typing-text">
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
              <div className="warda-translating-banner" role="status">
                <i className="ri-translate-2 ri-spin" />
                <span>
                  {language === "ru"
                    ? "Ясмин переводит диалог на русский..."
                    : language === "hu"
                    ? "Jázmin lefordítja a beszélgetést magyarra..."
                    : language === "bg"
                    ? "Ясмин превежда диалога на български..."
                    : language === "el"
                    ? "Η Yasmin μεταφράζει τον διάλογο στα ελληνικά..."
                    : language === "ro"
                    ? "Yasmin traduce dialogul în limba română..."
                    : "Yasmin is translating the dialog into English..."}
                </span>
              </div>
            )}

            {/* 5 Suggestion Questions in a Scrollable Row (When starting a new dialog) */}
            {isNewDialog && !loading && (
              <div className="warda-questions-bar">
                <div className="warda-questions-track">
                  {initialQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="warda-question-chip"
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
            <div className={`warda-chat-footer ${isExpanded ? "footer-expanded" : ""}`}>
              <form
                className={`warda-chat-input-form ${(!isMobile && isTooLarge) || isExpanded ? "multiline" : ""} ${isExpanded ? "warda-input-expanded" : ""}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
              >
                <textarea
                  ref={inputRef}
                  className={`warda-chat-textarea ${isExpanded ? "expanded" : ""}`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t("assistant.placeholder")}
                  rows={1}
                  disabled={loading || isTranslating}
                />
                <div className="warda-input-actions">
                  {(isTooLarge || isExpanded) && (
                    <button
                      type="button"
                      className={`warda-expand-btn ${isExpanded ? "active" : ""}`}
                      onClick={() => setIsExpanded((prev) => !prev)}
                      title={
                        isExpanded
                          ? (language === "ru" ? "Свернуть поле ввода" : language === "hu" ? "Beviteli mező összecsukása" : language === "bg" ? "Свиване на полето за въвеждане" : language === "el" ? "Σύμπτυξη πεδίου εισαγωγής" : language === "ro" ? "Restrânge câmpul de introducere" : "Collapse input")
                          : (language === "ru" ? "Расширить поле ввода" : language === "hu" ? "Beviteli mező kiterjesztése" : language === "bg" ? "Разширяване на полето за въвеждане" : language === "el" ? "Ανάπτυξη πεδίου εισαγωγής" : language === "ro" ? "Extinde câmpul de introducere" : "Expand input")
                      }
                      aria-label={
                        isExpanded
                          ? (language === "ru" ? "Свернуть поле ввода" : language === "hu" ? "Beviteli mező összecsukása" : language === "bg" ? "Свиване на полето за въвеждане" : language === "el" ? "Σύμπτυξη πεδίου εισαγωγής" : language === "ro" ? "Restrânge câmpul de introducere" : "Collapse input")
                          : (language === "ru" ? "Расширить поле ввода" : language === "hu" ? "Beviteli mező kiterjesztése" : language === "bg" ? "Разширяване на полето за въвеждане" : language === "el" ? "Ανάπτυξη πεδίου εισαγωγής" : language === "ro" ? "Extinde câmpul de introducere" : "Expand input")
                      }
                    >
                      <i className={isExpanded ? "ri-fullscreen-exit-line" : "ri-fullscreen-line"} />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="warda-send-btn"
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
