import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import {
  isPrivileged,
  resolveUserRoles,
  formatRoleName,
} from "../../../utils/auth";
import { useLanguage } from "../../context/languageContext";
import { useAuth } from "../../context/AuthContext";
import "./Profile.css";

function TruncatedField({
  text,
  items,
  type = "text",
  label,
  className = "",
  as: Component = "span",
  align = "right",
  primaryBadge,
  onCopy,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!text) return null;

  const isPhone = type === "phone";
  const isEmail = type === "email";
  const listItems = items || (isPhone ? [text] : []);

  const handleCopyText = (val, e) => {
    e?.stopPropagation();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(val);
      if (onCopy) onCopy(val);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`profile__truncate-box profile__truncate-box--${align}`}
    >
      <Component
        className={`profile__truncate-btn ${className}`}
        onClick={() => setOpen((prev) => !prev)}
        title={label ? `${label}: ${text}` : text}
        type={Component === "button" ? "button" : undefined}
      >
        <span className="profile__truncate-text">{text}</span>
      </Component>

      {open && (
        <div
          className={`profile__cell-popover ${align === "center" ? "profile__cell-popover--center" : "profile__cell-popover--right"}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="profile__cell-popover-header">
            <span className="profile__cell-popover-title">
              {isEmail && <i className="ri-mail-line" />}
              {isPhone && <i className="ri-phone-line" />}
              {!isEmail && !isPhone && <i className="ri-information-line" />}
              {label || (isEmail ? "Email" : isPhone ? "Телефон" : "Информация")}
              {listItems.length > 1 && ` (${listItems.length})`}
            </span>
            <button
              type="button"
              className="profile__cell-popover-close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          {isPhone && listItems.length > 0 ? (
            <div className="profile__cell-popover-list">
              {listItems.map((ph, idx) => (
                <div key={ph} className="profile__cell-popover-item">
                  <div className="profile__popover-phone-wrap">
                    <a
                      href={`tel:${ph.replace(/[^\d+]/g, "")}`}
                      className="profile__popover-full-text"
                    >
                      {ph}
                    </a>
                    {idx === 0 && primaryBadge && (
                      <span className="profile__phone-tag">{primaryBadge}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="profile__copy-btn"
                    onClick={(e) => handleCopyText(ph, e)}
                    title="Копировать"
                  >
                    <i className="ri-file-copy-line" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="profile__cell-popover-content">
              {isEmail ? (
                <a
                  href={`mailto:${text}`}
                  className="profile__popover-full-text"
                >
                  {text}
                </a>
              ) : (
                <span className="profile__popover-full-text">{text}</span>
              )}
              <button
                type="button"
                className="profile__copy-btn"
                onClick={(e) => handleCopyText(text, e)}
                title="Копировать"
              >
                <i className="ri-file-copy-line" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { user, isLoggedIn: loggedIn, logout: authLogout, refreshUser } = useAuth();
  const [profile, setProfile] = useState(() => user);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    refreshUser()
      .then((data) => !cancelled && data && setProfile(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loggedIn, refreshUser]);

  if (!loggedIn) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    authLogout();
    navigate("/");
  };

  const handleCopy = (val) => {
    setNotice(
      language === "ru"
        ? `"${val}" скопировано в буфер обмена!`
        : `"${val}" copied to clipboard!`,
    );
    setTimeout(() => setNotice(null), 3000);
  };

  const fullName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : "";
  const initials = profile
    ? `${profile.firstName?.[0] ?? ""}${profile.lastName?.[0] ?? ""}`.toUpperCase()
    : "";

  return (
    <section className="profile section container">
      <div className="profile__card">
        {!profile ? (
          <div className="profile__spinner" />
        ) : (
          <>
            {notice && (
              <div className="profile__notice">
                <i className="ri-checkbox-circle-line" />
                <span>{notice}</span>
              </div>
            )}
            <div
              className={`profile__avatar ${isPrivileged(profile) ? "profile__avatar--privileged" : ""}`}
            >
              {initials || "?"}
            </div>
            <div className="profile__name-wrap">
              <TruncatedField
                text={fullName}
                label={language === "ru" ? "Имя пользователя" : "User Name"}
                as="h2"
                className="profile__name"
                align="center"
                onCopy={handleCopy}
              />
            </div>
            {profile.email && (
              <div className="profile__email-wrap">
                <TruncatedField
                  text={profile.email}
                  type="email"
                  label={t("auth.email")}
                  as="p"
                  className="profile__email"
                  align="center"
                  onCopy={handleCopy}
                />
              </div>
            )}

            <div className="profile__badges-container">
              {profile.status === "privileged" && (
                <span
                  className="profile__status-badge"
                  title={
                    language === "ru"
                      ? "Статус: Привилегированный"
                      : "Status: Privileged"
                  }
                >
                  <i className="ri-vip-crown-fill" />
                  <span>
                    {language === "ru" ? "Привилегированный" : "Privileged"}
                  </span>
                </span>
              )}
              {resolveUserRoles(profile).map((role) => (
                <span
                  key={role}
                  className={`profile__role-tag profile__role-tag--${role}`}
                  title={`${language === "ru" ? "Роль: " : "Role: "}${formatRoleName(role, language)}`}
                >
                  {role === "developer" && <i className="ri-code-box-line" />}
                  {role === "admin" && <i className="ri-shield-star-line" />}
                  {role === "vip" && <i className="ri-medal-fill" />}
                  {role === "user" && <i className="ri-user-line" />}
                  <span>{formatRoleName(role, language)}</span>
                </span>
              ))}
            </div>

            {isPrivileged(profile) && (
              <Link
                to="/privileged"
                className="profile__privileged-badge"
                title={t("privileged.title")}
              >
                <i className="ri-shield-check-line" />
                <span>
                  {language === "ru"
                    ? "Панель управления"
                    : "Management Panel"}
                </span>
              </Link>
            )}

            <dl className="profile__details">
              <div className="profile__row">
                <dt>{t("auth.firstName")}</dt>
                <dd>
                  <TruncatedField
                    text={profile.firstName}
                    label={t("auth.firstName")}
                    onCopy={handleCopy}
                  />
                </dd>
              </div>
              {profile.lastName && (
                <div className="profile__row">
                  <dt>{t("auth.lastName")}</dt>
                  <dd>
                    <TruncatedField
                      text={profile.lastName}
                      label={t("auth.lastName")}
                      onCopy={handleCopy}
                    />
                  </dd>
                </div>
              )}
              {profile.email && (
                <div className="profile__row">
                  <dt>{t("auth.email")}</dt>
                  <dd>
                    <TruncatedField
                      text={profile.email}
                      type="email"
                      label={t("auth.email")}
                      onCopy={handleCopy}
                    />
                  </dd>
                </div>
              )}
              {profile.phones && profile.phones.length > 0 ? (
                <div className="profile__row">
                  <dt>{t("checkout.phone")}</dt>
                  <dd>
                    <TruncatedField
                      text={profile.phones.join(", ")}
                      items={profile.phones}
                      type="phone"
                      label={t("checkout.phone")}
                      primaryBadge={t("checkout.primaryBadge")}
                      onCopy={handleCopy}
                    />
                  </dd>
                </div>
              ) : profile.phone ? (
                <div className="profile__row">
                  <dt>{t("checkout.phone")}</dt>
                  <dd>
                    <TruncatedField
                      text={profile.phone}
                      items={[profile.phone]}
                      type="phone"
                      label={t("checkout.phone")}
                      onCopy={handleCopy}
                    />
                  </dd>
                </div>
              ) : null}
            </dl>

            <button
              type="button"
              className="profile__logout button"
              onClick={handleLogout}
            >
              {t("auth.logout")}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
