import { useState, useEffect } from "react";
import { Link } from "react-router";
import { useLanguage } from "../../context/languageContext";
import "./SmallAnnouncements.css";

const DISMISSED_KEY = "litera_dismissed_announcements";

export default function SmallAnnouncements({ items = [] }) {
  const { language } = useLanguage();
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
    <div className="litera-small-announcements-stack">
      {visibleItems.map((item) => {
        const text =
          language === "en"
            ? item.text_en || item.en?.text || item.text_ru || item.text
            : item.text_ru || item.ru?.text || item.text_en || item.text;
        const linkUrl =
          language === "en"
            ? item.linkUrl_en || item.en?.linkUrl || item.linkUrl_ru || item.linkUrl
            : item.linkUrl_ru || item.ru?.linkUrl || item.linkUrl_en || item.linkUrl;
        const hasLink = Boolean(linkUrl?.trim());
        const isExternal =
          hasLink &&
          (linkUrl.startsWith("http://") || linkUrl.startsWith("https://"));

        return (
          <div key={item.id} className="litera-small-announcement-banner">
            <div className="litera-small-announcement-icon">
              <i className="ri-megaphone-fill" />
            </div>

            <div className="litera-small-announcement-content">
              <span className="litera-small-announcement-text">{text}</span>

              {hasLink &&
                (isExternal ? (
                  <a
                    href={linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="litera-small-announcement-link"
                  >
                    {language === "ru" ? "Подробнее" : "Learn more"}{" "}
                    <i className="ri-arrow-right-line" />
                  </a>
                ) : (
                  <Link
                    to={linkUrl}
                    className="litera-small-announcement-link"
                  >
                    {language === "ru" ? "Подробнее" : "Learn more"}{" "}
                    <i className="ri-arrow-right-line" />
                  </Link>
                ))}
            </div>

            <button
              type="button"
              className="litera-small-announcement-close"
              onClick={() => handleDismiss(item.id)}
              aria-label={
                language === "ru"
                  ? "Закрыть объявление"
                  : "Close announcement"
              }
              title={language === "ru" ? "Закрыть" : "Close"}
            >
              <i className="ri-close-line" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
