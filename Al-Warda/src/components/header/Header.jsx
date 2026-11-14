import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { formatRoleName } from "../../../utils/auth";
import { useLanguage } from "../../context/languageContext";
import { useCurrency } from "../../context/currencyContext";
import { useAuth } from "../../context/AuthContext";
import { useConfirm } from "../../context/ConfirmContext";
import {
  fetchUserInquiry,
  fetchAdminUnreadCount,
} from "../../../utils/inquiries";
import { getCartItemCount } from "../../../utils/cart";
import "./Header.css";

const MessengerModal = lazy(() => import("../messenger/MessengerModal"));

const navClass = ({ isActive }) =>
  isActive ? "nav__link active-link" : "nav__link";

export const LANGUAGES = [
  { code: "bg", label: "Български", short: "BG" },
  { code: "el", label: "Ελληνικά", short: "EL" },
  { code: "en", label: "English", short: "EN" },
  { code: "hu", label: "Magyar", short: "HU" },
  { code: "ro", label: "Română", short: "RO" },
  { code: "ru", label: "Русский", short: "RU" },
];

export const CURRENCY_LIST = [
  { code: "EUR", symbol: "€", nameKey: "currency.eur" },
  { code: "HUF", symbol: "Fr", nameKey: "currency.huf" },
  { code: "RON", symbol: "lei", nameKey: "currency.ron" },
];

export default function Header({ theme, isLight, onSearch }) {
  const navigate = useNavigate();
  const { language, setLanguage, toggleLanguage, t } = useLanguage();
  const confirm = useConfirm();
  const { currency, setCurrency, toggleCurrency } = useCurrency();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);

  const sortedCurrencies = useMemo(() => {
    return [...CURRENCY_LIST].sort((a, b) => {
      const nameA = t(a.nameKey) || a.code;
      const nameB = t(b.nameKey) || b.code;
      return nameA.localeCompare(nameB, language, { sensitivity: "base" });
    });
  }, [t, language]);

  const sortedLanguages = useMemo(() => {
    return [...LANGUAGES].sort((a, b) => a.short.localeCompare(b.short));
  }, []);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const profileMenuRef = useRef(null);
  const langMenuRef = useRef(null);
  const currencyMenuRef = useRef(null);

  const {
    user,
    isLoggedIn: loggedIn,
    isPrivileged: isPrivilegedUser,
    roles: userRoles,
    logout: authLogout,
  } = useAuth();
  const [isMessengerOpen, setIsMessengerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const [adminAttention, setAdminAttention] = useState(false);

  useEffect(() => {
    const updateCount = async () => {
      try {
        const count = await getCartItemCount(user?.id);
        setCartCount(count);
      } catch {
        // ignore
      }
    };
    updateCount();
    window.addEventListener("alwarda-cart-updated", updateCount);
    return () =>
      window.removeEventListener("alwarda-cart-updated", updateCount);
  }, [user?.id]);

  useEffect(() => {
    const onRefer = () => setAdminAttention(true);
    const onOpen = () => {
      setIsMessengerOpen(true);
      setAdminAttention(false);
    };

    window.addEventListener("warda-refer-to-admin", onRefer);
    window.addEventListener("warda-open-messenger", onOpen);

    return () => {
      window.removeEventListener("warda-refer-to-admin", onRefer);
      window.removeEventListener("warda-open-messenger", onOpen);
    };
  }, []);

  useEffect(() => {
    if (isMessengerOpen) {
      setAdminAttention(false);
    }
  }, [isMessengerOpen]);

  const isAdminOrDev =
    userRoles.includes("admin") || userRoles.includes("developer");

  useEffect(() => {
    if (isAdminOrDev) return;
    const checkUnread = async () => {
      try {
        const guestEmail = localStorage.getItem("warda_guest_inquiry_email");
        const activeUserId = loggedIn ? user?.id : null;
        if (!activeUserId && !guestEmail) return;
        const inq = await fetchUserInquiry({
          userId: activeUserId,
          userEmail: loggedIn ? null : guestEmail,
        });
        if (inq?.notifications_user) {
          setUnreadCount(Number(inq.notifications_user));
        } else {
          setUnreadCount(0);
        }
      } catch {
        // ignore
      }
    };
    const initTimer = setTimeout(checkUnread, 2000);
    const onUpdated = () => checkUnread();
    const onVisible = () => {
      if (document.visibilityState === "visible") checkUnread();
    };
    window.addEventListener("warda-inquiries-updated", onUpdated);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearTimeout(initTimer);
      window.removeEventListener("warda-inquiries-updated", onUpdated);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [loggedIn, user?.id, isAdminOrDev]);

  useEffect(() => {
    if (!isPrivilegedUser && !isAdminOrDev) return;
    const checkAdminUnread = async () => {
      try {
        const currentUserId = user?.id;
        const cnt = await fetchAdminUnreadCount(currentUserId);
        setAdminUnreadCount(cnt);
      } catch {
        // ignore
      }
    };
    const initTimer = setTimeout(checkAdminUnread, 2000);
    const onUpdated = () => checkAdminUnread();
    const onVisible = () => {
      if (document.visibilityState === "visible") checkAdminUnread();
    };
    window.addEventListener("warda-inquiries-updated", onUpdated);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearTimeout(initTimer);
      window.removeEventListener("warda-inquiries-updated", onUpdated);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [isPrivilegedUser, isAdminOrDev, user?.id]);

  const handleSelectLanguage = (code) => {
    setLanguage(code);
    setIsLangDropdownOpen(false);
  };

  const handleSelectCurrency = (code) => {
    setCurrency(code);
    setIsCurrencyDropdownOpen(false);
  };

  useEffect(() => {
    const handleOutside = (e) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target)
      ) {
        setIsDropdownOpen(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(e.target)) {
        setIsLangDropdownOpen(false);
      }
      if (
        currencyMenuRef.current &&
        !currencyMenuRef.current.contains(e.target)
      ) {
        setIsCurrencyDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        setIsDropdownOpen(false);
        setIsLangDropdownOpen(false);
        setIsCurrencyDropdownOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleLogout = async () => {
    setIsDropdownOpen(false);
    const confirmed = await confirm({
      title: t("auth.logoutConfirmTitle"),
      message: t("auth.logoutConfirmMessage"),
      confirmText: t("auth.logoutConfirmBtn"),
      cancelText: t("auth.logoutCancelBtn"),
      type: "warning",
      icon: "ri-logout-box-r-line",
    });
    if (!confirmed) return;
    authLogout();
    navigate("/");
  };

  return (
    <>
      <header className="header warda-header" id="header">
        <nav className="nav container warda-nav">
          <button
            type="button"
            className="warda-nav__menu-toggle"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-controls="warda-main-navigation"
            aria-label={isMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          >
            <i
              className={isMenuOpen ? "ri-close-line" : "ri-menu-line"}
              aria-hidden="true"
            />
          </button>
          {/* LEFT NAVIGATION LINKS */}
          <div
            id="warda-main-navigation"
            className={`warda-nav__left ${isMenuOpen ? "warda-nav__left--open" : ""}`}
            onClick={(event) => {
              if (event.target.closest("a")) setIsMenuOpen(false);
            }}
          >
            <ul className="warda-nav__links">
              <li className="warda-nav__item">
                <NavLink to="/" end className={navClass}>
                  <span>{t("nav.home").toUpperCase()}</span>
                </NavLink>
              </li>
              <li className="warda-nav__item">
                <NavLink to="/featured" className={navClass}>
                  <span>{t("nav.catalog").toUpperCase()}</span>
                </NavLink>
              </li>
              <li className="warda-nav__item">
                <NavLink
                  to="/sets"
                  className={navClass}
                  title={t("nav.setsTitle")}
                >
                  <span>{t("nav.sets").toUpperCase()}</span>
                </NavLink>
              </li>
              <li className="warda-nav__item">
                <NavLink to="/about" className={navClass}>
                  <span>{t("nav.about").toUpperCase()}</span>
                </NavLink>
              </li>
              <li className="warda-nav__item">
                <NavLink to="/contacts" className={navClass}>
                  <span>{t("nav.contacts").toUpperCase()}</span>
                </NavLink>
              </li>
              {(isPrivilegedUser || isAdminOrDev) && (
                <li className="warda-nav__item warda-nav__item--privileged">
                  <NavLink
                    to="/privileged"
                    className={({ isActive }) =>
                      `warda-nav__privileged-pill ${isActive ? "active" : ""}`
                    }
                    title={t("nav.privileged")}
                  >
                    <i className="ri-vip-crown-fill" />
                    <span>{t("nav.privileged").toUpperCase()}</span>
                    {adminUnreadCount > 0 && (
                      <span className="warda-nav__badge">
                        {adminUnreadCount}
                      </span>
                    )}
                  </NavLink>
                </li>
              )}
            </ul>
          </div>

          {/* CENTER PROMINENT LOGO - PURE EMBLEM WITHOUT ANY CIRCLES OR FRAMES */}
          <div className="warda-nav__center">
            <Link
              to="/"
              className="warda-nav__crest-logo"
              aria-label="Al-Warda Parfumes Home"
            >
              <picture>
                <source
                  media="(max-width: 1050px)"
                  srcSet="/assets/img/al-warda-header-logo-mobile.webp"
                  type="image/webp"
                />
                <img
                  src="/assets/img/al-warda-header-logo.webp"
                  alt="Al-Warda Parfumes"
                  className="warda-nav__crest-img"
                  width="73"
                  height="80"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                />
              </picture>
            </Link>
          </div>

          {/* RIGHT ACTIONS: SEARCH, CART, CONCIERGE, PROFILE, LANG */}
          <div className="warda-nav__right">
            <button
              type="button"
              className="warda-nav__action-btn"
              onClick={onSearch}
              title={t("nav.search") || "Search fragrances"}
              aria-label="Search"
            >
              <i className="ri-search-line" />
            </button>

            <Link
              to="/cart"
              className="warda-nav__action-btn warda-nav__cart-btn"
              aria-label={t("nav.cart") || "Shopping Bag"}
              title={t("nav.cart") || "Shopping Bag"}
            >
              <i className="ri-shopping-bag-line" />
              {cartCount > 0 && (
                <span className="warda-nav__badge">{cartCount}</span>
              )}
            </Link>

            {!isAdminOrDev && (
              <button
                type="button"
                className={`warda-nav__action-btn ${adminAttention ? "warda-nav__action-btn--pulse" : ""}`}
                onClick={() => {
                  setIsMessengerOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      window.dispatchEvent(
                        new CustomEvent("warda-open-messenger"),
                      );
                    }
                    return next;
                  });
                  setAdminAttention(false);
                }}
                title={t("nav.concierge")}
                aria-label={t("nav.concierge")}
              >
                <i className="ri-customer-service-2-line" />
                {unreadCount > 0 && (
                  <span className="warda-nav__badge">{unreadCount}</span>
                )}
              </button>
            )}

            {loggedIn ? (
              <div className="nav__profile-wrap" ref={profileMenuRef}>
                <button
                  type="button"
                  className={`warda-nav__action-btn ${isDropdownOpen ? "warda-nav__action-btn--active" : ""}`}
                  onClick={() => {
                    setIsDropdownOpen((prev) => !prev);
                    setIsLangDropdownOpen(false);
                    setIsCurrencyDropdownOpen(false);
                  }}
                  aria-expanded={isDropdownOpen}
                  aria-label={t("nav.profile")}
                  title={t("nav.profile")}
                >
                  <i className="ri-user-line" />
                </button>

                {isDropdownOpen && (
                  <div className="nav__profile-dropdown" role="menu">
                    {user?.firstName && (
                      <div className="nav__profile-header">
                        <span className="nav__profile-welcome">
                          {t("nav.welcome")}
                        </span>
                        <div className="nav__profile-name-row">
                          <span className="nav__profile-name">
                            {user.firstName}
                          </span>
                        </div>
                        <span className="nav__profile-role">
                          {formatRoleName(userRoles[0], language)}
                        </span>
                      </div>
                    )}
                    <ul className="nav__profile-list" role="none">
                      {(isPrivilegedUser || isAdminOrDev) && (
                        <li className="nav__profile-item" role="none">
                          <Link
                            to="/privileged"
                            role="menuitem"
                            onClick={() => setIsDropdownOpen(false)}
                            style={{
                              background:
                                "linear-gradient(135deg, rgba(212, 175, 55, 0.18), rgba(255, 215, 0, 0.08))",
                              border: "1px solid rgba(212, 175, 55, 0.4)",
                              borderRadius: "6px",
                              marginBottom: "6px",
                            }}
                          >
                            <i
                              className="ri-vip-crown-fill"
                              style={{ color: "#ffd700" }}
                            />
                            <span style={{ color: "#ffd700", fontWeight: 700 }}>
                              {t("nav.privileged")}
                            </span>
                          </Link>
                        </li>
                      )}
                      <li className="nav__profile-item" role="none">
                        <Link
                          to="/profile"
                          role="menuitem"
                          onClick={() => setIsDropdownOpen(false)}
                        >
                          <i className="ri-user-settings-line" />
                          <span>{t("nav.profileSettings")}</span>
                        </Link>
                      </li>
                      <li className="nav__profile-item" role="none">
                        <Link
                          to="/orders"
                          role="menuitem"
                          onClick={() => setIsDropdownOpen(false)}
                        >
                          <i className="ri-time-line" />
                          <span>{t("nav.currentOrders")}</span>
                        </Link>
                      </li>
                      <li className="nav__profile-divider" role="separator" />
                      <li className="nav__profile-item" role="none">
                        <button
                          type="button"
                          role="menuitem"
                          className="nav__profile-logout-btn"
                          onClick={handleLogout}
                        >
                          <i className="ri-logout-box-r-line" />
                          <span>{t("nav.logout")}</span>
                        </button>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="warda-nav__action-btn"
                aria-label={t("nav.login")}
                title={t("nav.login")}
              >
                <i className="ri-user-line" />
              </Link>
            )}

            {/* Language Dropdown */}
            <div className="warda-nav__dropdown-wrap" ref={langMenuRef}>
              <button
                type="button"
                className={`warda-nav__lang-btn ${isLangDropdownOpen ? "warda-nav__action-btn--active" : ""}`}
                onClick={() => {
                  setIsLangDropdownOpen((prev) => !prev);
                  setIsCurrencyDropdownOpen(false);
                  setIsDropdownOpen(false);
                }}
                title={t("nav.selectLanguage")}
                aria-label={t("nav.selectLanguage")}
                aria-haspopup="listbox"
                aria-expanded={isLangDropdownOpen}
              >
                {language.toUpperCase()}
              </button>

              {isLangDropdownOpen && (
                <div
                  className="warda-nav__dropdown"
                  role="listbox"
                  aria-label={t("nav.selectLanguage")}
                >
                  <div className="warda-nav__dropdown-header">
                    {t("nav.selectLanguage")}
                  </div>
                  <ul className="warda-nav__dropdown-list" role="none">
                    {sortedLanguages.map((item) => {
                      const isSelected = language === item.code;
                      return (
                        <li key={item.code} role="none">
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`warda-nav__dropdown-item-btn ${isSelected ? "warda-nav__dropdown-item-btn--active" : ""}`}
                            onClick={() => handleSelectLanguage(item.code)}
                          >
                            <span className="warda-nav__dropdown-item-left">
                              <span className="warda-nav__dropdown-badge">
                                {item.short}
                              </span>
                              <span className="warda-nav__dropdown-item-name">
                                {item.label}
                              </span>
                            </span>
                            {isSelected && (
                              <i className="ri-check-line warda-nav__dropdown-check" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* Currency Dropdown */}
            <div className="warda-nav__dropdown-wrap" ref={currencyMenuRef}>
              <button
                type="button"
                className={`warda-nav__currency-btn ${isCurrencyDropdownOpen ? "warda-nav__action-btn--active" : ""}`}
                onClick={() => {
                  setIsCurrencyDropdownOpen((prev) => !prev);
                  setIsLangDropdownOpen(false);
                  setIsDropdownOpen(false);
                }}
                title={t("nav.selectCurrency")}
                aria-label={t("nav.selectCurrency")}
                aria-haspopup="listbox"
                aria-expanded={isCurrencyDropdownOpen}
              >
                {currency === "EUR" ? "€" : currency === "RON" ? "lei" : "Fr"}
              </button>

              {isCurrencyDropdownOpen && (
                <div
                  className="warda-nav__dropdown"
                  role="listbox"
                  aria-label={t("nav.selectCurrency")}
                >
                  <div className="warda-nav__dropdown-header">
                    {t("nav.selectCurrency")}
                  </div>
                  <ul className="warda-nav__dropdown-list" role="none">
                    {sortedCurrencies.map((item) => {
                      const isSelected = currency === item.code;
                      return (
                        <li key={item.code} role="none">
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`warda-nav__dropdown-item-btn ${isSelected ? "warda-nav__dropdown-item-btn--active" : ""}`}
                            onClick={() => handleSelectCurrency(item.code)}
                          >
                            <span className="warda-nav__dropdown-item-left">
                              <span className="warda-nav__dropdown-badge">
                                {item.symbol}
                              </span>
                              <span className="warda-nav__dropdown-item-name">
                                {t(item.nameKey)} ({item.code})
                              </span>
                            </span>
                            {isSelected && (
                              <i className="ri-check-line warda-nav__dropdown-check" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </nav>

        {/* HORIZONTAL LINE SEPARATING HEADER FROM BODY WITH GAP IN THE CENTER */}
        <div className="warda-header__divider-line" aria-hidden="true">
          <span className="warda-header__line-half warda-header__line-half--left"></span>
          <span className="warda-header__line-gap"></span>
          <span className="warda-header__line-half warda-header__line-half--right"></span>
        </div>
      </header>

      {isMessengerOpen && (
        <Suspense fallback={null}>
          <MessengerModal
            isOpen={isMessengerOpen}
            onClose={() => setIsMessengerOpen(false)}
            onUnreadChange={(cnt) => setUnreadCount(cnt)}
          />
        </Suspense>
      )}
    </>
  );
}
