import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../context/languageContext";
import "./LargeAnnouncementRoulette.css";

export default function LargeAnnouncementRoulette({ items = [] }) {
  const { language } = useLanguage();

  const getPosterImage = (item) => {
    if (!item) return "";
    return language === "en"
      ? item.imageUrl_en || item.en?.imageUrl || item.imageUrl_ru || item.imageUrl
      : item.imageUrl_ru || item.ru?.imageUrl || item.imageUrl_en || item.imageUrl;
  };

  const getPosterLink = (item) => {
    if (!item) return "";
    return language === "en"
      ? item.linkUrl_en || item.en?.linkUrl || item.linkUrl_ru || item.linkUrl
      : item.linkUrl_ru || item.ru?.linkUrl || item.linkUrl_en || item.linkUrl;
  };

  const posters = items.filter(
    (item) => item && item.type === "large" && Boolean(getPosterImage(item)),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);
  const touchStartXRef = useRef(null);

  const count = posters.length;

  useEffect(() => {
    if (count <= 1 || isPaused) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % count);
    }, 5000);

    return () => clearInterval(timerRef.current);
  }, [count, isPaused]);

  if (count === 0) return null;

  const handlePrev = (e) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + count) % count);
  };

  const handleNext = (e) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % count);
  };

  const currentPoster = posters[currentIndex];
  const posterImageUrl = getPosterImage(currentPoster);
  const posterLinkUrl = getPosterLink(currentPoster);
  const hasLink = Boolean(posterLinkUrl?.trim());
  const isExternal =
    hasLink &&
    (posterLinkUrl.startsWith("http://") ||
      posterLinkUrl.startsWith("https://"));

  return (
    <div
      className="warda-poster-roulette-container"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={(e) => {
        touchStartXRef.current = e.touches?.[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (count <= 1 || touchStartXRef.current === null) return;
        const endX = e.changedTouches?.[0]?.clientX ?? touchStartXRef.current;
        const diff = endX - touchStartXRef.current;
        touchStartXRef.current = null;
        if (Math.abs(diff) > 40) {
          if (diff < 0) handleNext();
          else handlePrev();
        }
      }}
    >
      <div className="warda-poster-slide-wrapper">
        {hasLink ? (
          <a
            href={posterLinkUrl}
            target={isExternal ? "_blank" : "_self"}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="warda-poster-link"
          >
            <img
              src={posterImageUrl}
              alt={language === "ru" ? "Рекламный плакат" : "Promotional poster"}
              className="warda-poster-image"
              loading="eager"
            />
          </a>
        ) : (
          <div className="warda-poster-link">
            <img
              src={posterImageUrl}
              alt={language === "ru" ? "Рекламный плакат" : "Promotional poster"}
              className="warda-poster-image"
              loading="eager"
            />
          </div>
        )}

        {/* Controls if multiple */}
        {count > 1 && (
          <>
            <button
              type="button"
              className="warda-poster-btn warda-poster-btn--prev"
              onClick={handlePrev}
              aria-label="Предыдущий плакат"
            >
              <i className="ri-arrow-left-s-line" />
            </button>
            <button
              type="button"
              className="warda-poster-btn warda-poster-btn--next"
              onClick={handleNext}
              aria-label="Следующий плакат"
            >
              <i className="ri-arrow-right-s-line" />
            </button>

            {/* Dots */}
            <div className="warda-poster-dots">
              {posters.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`warda-poster-dot ${idx === currentIndex ? "warda-poster-dot--active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(idx);
                  }}
                  aria-label={`Плакат ${idx + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
