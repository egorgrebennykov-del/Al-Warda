import { useState } from "react";
import { Link } from "react-router";
import { useLanguage } from "../../context/languageContext";
import "./SmallAnnouncements.css";

const DISMISSED_KEY = "warda_dismissed_announcements";

export default function SmallAnnouncements({ items = [] }) {
  const { language, t } = useLanguage();
  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      const saved = localStorage.getItem(DISMISSED_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleDismiss = (id) => {
    const updated = [...dismissedIds, id];
    setDismissedIds(updated);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const visibleItems = items.filter(
    (item) => item && item.type === "small" && !dismissedIds.includes(item.id)
  );

  if (visibleItems.length === 0) return null;

  return (
    <div className="warda-small-announcements-stack">
      {visibleItems.map((item) => {
        const text =
          item[`text_${language}`] ||
          item[language]?.text ||
          item.text_en ||
          item.en?.text ||
          item.text_ru ||
          item.text;
        const linkUrl =
          item[`linkUrl_${language}`] ||
          item[language]?.linkUrl ||
          item.linkUrl_en ||
          item.en?.linkUrl ||
          item.linkUrl_ru ||
          item.linkUrl;
        const hasLink = Boolean(linkUrl?.trim());
        const isExternal =
          hasLink &&
          (linkUrl.startsWith("http://") || linkUrl.startsWith("https://"));

        return (
          <div key={item.id} className="warda-small-announcement-banner">
            <div className="warda-small-announcement-icon" aria-hidden="true">
              <i className="ri-sparkling-fill" />
            </div>

            <div className="warda-small-announcement-content">
              <span className="warda-small-announcement-text">{text}</span>

              {hasLink &&
                (isExternal ? (
                  <a
                    href={linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="warda-small-announcement-link"
                  >
                    {t("announcements.learnMore")}{" "}
                    <i className="ri-arrow-right-line" />
                  </a>
                ) : (
                  <Link
                    to={linkUrl}
                    className="warda-small-announcement-link"
                  >
                    {t("announcements.learnMore")}{" "}
                    <i className="ri-arrow-right-line" />
                  </Link>
                ))}
            </div>

            <button
              type="button"
              className="warda-small-announcement-close"
              onClick={() => handleDismiss(item.id)}
              aria-label={t("announcements.close")}
              title={t("announcements.close")}
            >
              <i className="ri-close-line" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
