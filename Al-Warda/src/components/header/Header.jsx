import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { formatRoleName } from "../../../utils/auth";
import { useLanguage } from "../../context/languageContext";
import { useAuth } from "../../context/AuthContext";
import { fetchUserInquiry, fetchAdminUnreadCount } from "../../../utils/inquiries";
import { getCartItemCount } from "../../../utils/cart";
import "./Header.css";

const MessengerModal = lazy(() => import("../messenger/MessengerModal"));

const navClass = ({ isActive }) =>
  isActive ? "nav__link active-link" : "nav__link";

export default function Header({ theme, isLight, onSearch }) {
  const navigate = useNavigate();
  const { language, toggleLanguage, t } = useLanguage();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const profileMenuRef = useRef(null);

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
    return () => window.removeEventListener("alwarda-cart-updated", updateCount);
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
    const interval = setInterval(checkUnread, 15000);
    const onUpdated = () => checkUnread();
    window.addEventListener("warda-inquiries-updated", onUpdated);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
      window.removeEventListener("warda-inquiries-updated", onUpdated);
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
    const interval = setInterval(checkAdminUnread, 15000);
    const onUpdated = () => checkAdminUnread();
    window.addEventListener("warda-inquiries-updated", onUpdated);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
      window.removeEventListener("warda-inquiries-updated", onUpdated);
    };
  }, [isPrivilegedUser, isAdminOrDev, user?.id]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
    };
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isMenuOpen]);

  const handleLogout = () => {
    setIsDropdownOpen(false);
    authLogout();
    navigate("/");
  };

  return (
    <header className="header warda-header" id="header">
      <nav className="nav container warda-nav">
        <button
          type="button"
          className="warda-nav__menu-toggle"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-expanded={isMenuOpen}
          aria-controls="warda-main-navigation"
          aria-label={isMenuOpen
            ? (language === "ru" ? "Закрыть меню" : "Close menu")
            : (language === "ru" ? "Открыть меню" : "Open menu")}
        >
          <i className={isMenuOpen ? "ri-close-line" : "ri-menu-line"} aria-hidden="true" />
        </button>
        {/* LEFT NAVIGATION LINKS */}
        <div id="warda-main-navigation" className={`warda-nav__left ${isMenuOpen ? "warda-nav__left--open" : ""}`} onClick={(event) => {
          if (event.target.closest("a")) setIsMenuOpen(false);
        }}>
          <ul className="warda-nav__links">
            <li className="warda-nav__item">
              <NavLink to="/" end className={navClass}>
                <span>{language === "ru" ? "ГЛАВНАЯ" : "HOME"}</span>
              </NavLink>
            </li>
            <li className="warda-nav__item">
              <NavLink to="/featured" className={navClass}>
                <span>{language === "ru" ? "КАТАЛОГ" : "SHOP"}</span>
              </NavLink>
            </li>
            <li className="warda-nav__item">
              <NavLink to="/sets" className={navClass}>
                <span>{language === "ru" ? "СЕТЫ" : "SETS"}</span>
              </NavLink>
            </li>
            <li className="warda-nav__item">
              <NavLink to="/about" className={navClass}>
                <span>{language === "ru" ? "О БРЕНДЕ" : "ABOUT"}</span>
              </NavLink>
            </li>
            <li className="warda-nav__item">
              <NavLink to="/contacts" className={navClass}>
                <span>{language === "ru" ? "КОНТАКТЫ" : "CONTACT"}</span>
              </NavLink>
            </li>
            {(isPrivilegedUser || isAdminOrDev) && (
              <li className="warda-nav__item warda-nav__item--privileged">
                <NavLink
                  to="/privileged"
                  className={({ isActive }) =>
                    `warda-nav__privileged-pill ${isActive ? "active" : ""}`
                  }
                  title={language === "ru" ? "Панель управления" : "Control Panel"}
                >
                  <i className="ri-vip-crown-fill" />
                  <span>{language === "ru" ? "ПАНЕЛЬ УПРАВЛЕНИЯ" : "CONTROL PANEL"}</span>
                  {adminUnreadCount > 0 && (
                    <span className="warda-nav__badge">{adminUnreadCount}</span>
                  )}
                </NavLink>
              </li>
            )}
          </ul>
        </div>

        {/* CENTER PROMINENT LOGO - PURE EMBLEM WITHOUT ANY CIRCLES OR FRAMES */}
        <div className="warda-nav__center">
          <Link to="/" className="warda-nav__crest-logo" aria-label="Al-Warda Parfumes Home">
            <img
              src="/assets/img/al-warda-header-logo.png?v=transparent-20261108"
              alt="Al-Warda Parfumes"
              className="warda-nav__crest-img"
            />
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
                setIsMessengerOpen((prev) => !prev);
                setAdminAttention(false);
              }}
              title="Fragrance Concierge"
              aria-label="Fragrance Concierge"
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
                onClick={() => setIsDropdownOpen((prev) => !prev)}
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
                        {language === "ru" ? "Здравствуйте," : "Welcome,"}
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
                            background: "linear-gradient(135deg, rgba(212, 175, 55, 0.18), rgba(255, 215, 0, 0.08))",
                            border: "1px solid rgba(212, 175, 55, 0.4)",
                            borderRadius: "6px",
                            marginBottom: "6px"
                          }}
                        >
                          <i className="ri-vip-crown-fill" style={{ color: "#ffd700" }} />
                          <span style={{ color: "#ffd700", fontWeight: 700 }}>
                            {language === "ru" ? "Панель управления" : "Privileged Panel"}
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

          <button
            type="button"
            className="warda-nav__lang-btn"
            onClick={toggleLanguage}
            title={language === "ru" ? "Switch to English" : "Переключить на русский"}
          >
            {language === "ru" ? "RU" : "EN"}
          </button>
        </div>
      </nav>

      {/* HORIZONTAL LINE SEPARATING HEADER FROM BODY WITH GAP IN THE CENTER */}
      <div className="warda-header__divider-line" aria-hidden="true">
        <span className="warda-header__line-half warda-header__line-half--left"></span>
        <span className="warda-header__line-gap"></span>
        <span className="warda-header__line-half warda-header__line-half--right"></span>
      </div>

      {isMessengerOpen && (
        <Suspense fallback={null}>
          <MessengerModal
            isOpen={isMessengerOpen}
            onClose={() => setIsMessengerOpen(false)}
            onUnreadChange={(cnt) => setUnreadCount(cnt)}
          />
        </Suspense>
      )}
    </header>
  );
}
