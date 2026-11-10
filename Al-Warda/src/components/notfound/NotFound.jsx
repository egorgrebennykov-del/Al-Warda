import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useLanguage } from "../../context/languageContext";
import { CornerBracket } from "../common/OrnateCard";
import "./NotFound.css";

const POPULAR_QUERIES = [
  "Lattafa",
  "Oud",
  "Khamrah",
  "Yara",
  "Amber",
  "Taif Rose",
];

export default function NotFound() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const handleChipClick = (term) => {
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  const handleOpenAssistant = () => {
    window.dispatchEvent(new CustomEvent("open-warda-assistant"));
  };

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <section className="not-found section container" id="not-found">
      <div className="not-found__wrapper">
        {/* Subtle background glow effect */}
        <div className="not-found__glow-orb" aria-hidden="true" />

        {/* 404 Perfume Flacon Art Visual */}
        <div className="not-found__art">
          <span className="not-found__digit">4</span>

          <div className="not-found__flacon-wrap" aria-hidden="true">
            {/* Fragrance vapors rising into the air */}
            <div className="not-found__scent-vapors">
              <span className="not-found__vapor not-found__vapor--1" />
              <span className="not-found__vapor not-found__vapor--2" />
              <span className="not-found__vapor not-found__vapor--3" />
            </div>

            {/* Arabian Perfume Flacon */}
            <div className="not-found__flacon">
              {/* Ornate Golden Stopper (Dome + Finial) */}
              <div className="not-found__flacon-stopper">
                <span className="not-found__stopper-finial" />
                <span className="not-found__stopper-dome" />
                <span className="not-found__stopper-collar" />
              </div>

              {/* Bottle Neck */}
              <div className="not-found__flacon-neck">
                <span className="not-found__neck-ring" />
              </div>

              {/* Bottle Body */}
              <div className="not-found__flacon-body">
                {/* Golden Elixir Liquid */}
                <div className="not-found__flacon-liquid">
                  <span className="not-found__liquid-shimmer" />
                </div>

                {/* Faceted Crystal Highlights */}
                <span className="not-found__flacon-facet not-found__flacon-facet--left" />
                <span className="not-found__flacon-facet not-found__flacon-facet--right" />

                {/* Golden Rose Emblem */}
                <div className="not-found__flacon-emblem">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="not-found__emblem-svg"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 2L14.6 9.4L22 12L14.6 14.6L12 22L9.4 14.6L2 12L9.4 9.4L12 2Z"
                      fill="url(#flaconGoldGrad)"
                    />
                    <circle cx="12" cy="12" r="2.4" fill="#fff5cc" />
                    <defs>
                      <linearGradient
                        id="flaconGoldGrad"
                        x1="2"
                        y1="2"
                        x2="22"
                        y2="22"
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop stopColor="#ffe680" />
                        <stop offset="0.5" stopColor="#d4af37" />
                        <stop offset="1" stopColor="#8c6e2d" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>

                {/* Heavy crystal base */}
                <div className="not-found__flacon-base" />
              </div>
            </div>

            {/* Floating golden sparkle particles */}
            <div className="not-found__floating-elements">
              <i className="ri-sparkle-fill not-found__float-star not-found__float-star--1" />
              <i className="ri-sparkle-line not-found__float-star not-found__float-star--2" />
              <i className="ri-sparkles-fill not-found__float-star not-found__float-star--3" />
              <i className="ri-star-s-fill not-found__float-star not-found__float-star--4" />
            </div>
          </div>

          <span className="not-found__digit">4</span>
        </div>

        {/* Status Tag & Arabic Calligraphy Motif */}
        <div className="not-found__header-block">
          <div className="not-found__tag">
            <i className="ri-compass-3-line" />
            <span>404 • {t("notFound.tag")}</span>
          </div>
          <span className="not-found__arabic-motif">
            عطور شرقية فاخرة • Al-Warda Parfumes
          </span>
        </div>

        {/* Headings */}
        <h1 className="not-found__title">{t("notFound.title")}</h1>
        <p className="not-found__subtitle">{t("notFound.subtitle")}</p>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="not-found__search-form">
          <i className="ri-search-line not-found__search-icon" />
          <input
            type="text"
            className="not-found__search-input"
            placeholder={t("notFound.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="button not-found__search-btn">
            <span>{t("notFound.searchBtn")}</span>
            <i className="ri-arrow-right-line" />
          </button>
        </form>

        {/* Popular Quick Search Chips */}
        <div className="not-found__chips">
          <span className="not-found__chips-label">
            {t("notFound.popularQueries")}
          </span>
          <div className="not-found__chips-list">
            {POPULAR_QUERIES.map((term) => (
              <button
                key={term}
                type="button"
                className="not-found__chip"
                onClick={() => handleChipClick(term)}
              >
                <i className="ri-sparkle-line" />
                <span>{term}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="not-found__actions">
          <Link to="/" className="button not-found__btn not-found__btn--primary">
            <i className="ri-home-4-line not-found__btn-icon" />
            <span className="not-found__btn-text">{t("notFound.goHome")}</span>
          </Link>

          <button
            type="button"
            className="button not-found__btn not-found__btn--secondary"
            onClick={handleGoBack}
          >
            <i className="ri-arrow-left-line not-found__btn-icon" />
            <span className="not-found__btn-text">{t("notFound.goBack")}</span>
          </button>

          <button
            type="button"
            className="button not-found__btn not-found__btn--assistant"
            onClick={handleOpenAssistant}
          >
            <i className="ri-sparkles-line not-found__btn-icon" />
            <span className="not-found__btn-text">
              {t("notFound.askAssistant")}
            </span>
          </button>
        </div>

        {/* Quick Boutique Navigation Cards */}
        <div className="not-found__nav-section">
          <div className="not-found__nav-heading-row">
            <span className="not-found__nav-line" />
            <span className="not-found__nav-title">
              {t("notFound.quickNavTitle")}
            </span>
            <span className="not-found__nav-line" />
          </div>

          <div className="not-found__nav-grid">
            <Link to="/featured" className="not-found__nav-card">
              <CornerBracket position="tl" />
              <CornerBracket position="br" />
              <div className="not-found__nav-icon not-found__nav-icon--featured">
                <i className="ri-sparkling-2-line" />
              </div>
              <div className="not-found__nav-info">
                <strong>{t("notFound.featured")}</strong>
                <span>{t("notFound.featuredDesc")}</span>
              </div>
              <i className="ri-arrow-right-s-line not-found__nav-arrow" />
            </Link>

            <Link to="/sets" className="not-found__nav-card">
              <CornerBracket position="tl" />
              <CornerBracket position="br" />
              <div className="not-found__nav-icon not-found__nav-icon--sets">
                <i className="ri-flask-line" />
              </div>
              <div className="not-found__nav-info">
                <strong>{t("notFound.sets")}</strong>
                <span>{t("notFound.setsDesc")}</span>
              </div>
              <i className="ri-arrow-right-s-line not-found__nav-arrow" />
            </Link>

            <Link to="/discount" className="not-found__nav-card">
              <CornerBracket position="tl" />
              <CornerBracket position="br" />
              <div className="not-found__nav-icon not-found__nav-icon--discount">
                <i className="ri-percent-line" />
              </div>
              <div className="not-found__nav-info">
                <strong>{t("notFound.catalog")}</strong>
                <span>{t("notFound.dealsDesc")}</span>
              </div>
              <i className="ri-arrow-right-s-line not-found__nav-arrow" />
            </Link>

            <Link to="/new" className="not-found__nav-card">
              <CornerBracket position="tl" />
              <CornerBracket position="br" />
              <div className="not-found__nav-icon not-found__nav-icon--new">
                <i className="ri-fire-line" />
              </div>
              <div className="not-found__nav-info">
                <strong>{t("notFound.new")}</strong>
                <span>{t("notFound.newDesc")}</span>
              </div>
              <i className="ri-arrow-right-s-line not-found__nav-arrow" />
            </Link>
          </div>
        </div>

        {/* Senses Motto at the bottom */}
        <div className="not-found__footer-motto">
          <span className="not-found__footer-line" />
          <span className="not-found__footer-text">
            ✦ CRAFTED FOR THE SENSES ✦
          </span>
          <span className="not-found__footer-line" />
        </div>
      </div>
    </section>
  );
}
