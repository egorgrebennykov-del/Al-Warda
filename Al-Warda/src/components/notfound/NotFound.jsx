import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useLanguage } from "../../context/languageContext";
import "./NotFound.css";

export default function NotFound() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const handleOpenAssistant = () => {
    window.dispatchEvent(new CustomEvent("open-litera-assistant"));
  };

  return (
    <section className="not-found section container" id="not-found">
      <div className="not-found__wrapper">
        {/* Artistic Thematic 404 Visual */}
        <div className="not-found__art">
          <span className="not-found__digit">4</span>
          <div className="not-found__book-illustration" aria-hidden="true">
            <div className="not-found__book-cover">
              <div className="not-found__book-pages">
                <span className="not-found__page not-found__page--1" />
                <span className="not-found__page not-found__page--2" />
                <span className="not-found__page not-found__page--3" />
              </div>
              <div className="not-found__book-bookmark">
                <i className="ri-bookmark-3-fill" />
              </div>
            </div>
            <div className="not-found__floating-elements">
              <i className="ri-sparkle-fill not-found__float-star not-found__float-star--1" />
              <i className="ri-sparkle-line not-found__float-star not-found__float-star--2" />
              <i className="ri-book-mark-line not-found__float-leaf" />
            </div>
          </div>
          <span className="not-found__digit">4</span>
        </div>

        {/* Status Tag */}
        <div className="not-found__tag">
          <i className="ri-compass-3-line" />
          <span>{t("notFound.tag")}</span>
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
            {t("notFound.searchBtn")}
          </button>
        </form>

        {/* Primary Action Buttons */}
        <div className="not-found__actions">
          <Link to="/" className="button not-found__btn-primary">
            <i className="ri-home-4-line not-found__btn-icon" />
            <span className="not-found__btn-text">{t("notFound.goHome")}</span>
          </Link>

          <button
            type="button"
            className="button button--ghost not-found__btn-assistant"
            onClick={handleOpenAssistant}
          >
            <i className="ri-chat-smile-2-line not-found__btn-icon" />
            <span className="not-found__btn-text">
              {t("notFound.askAssistant")}
            </span>
          </button>
        </div>

        {/* Quick Navigation Cards */}
        <div className="not-found__nav-section">
          <span className="not-found__nav-title">
            {t("notFound.quickNavTitle")}
          </span>
          <div className="not-found__nav-grid">
            <Link to="/discount" className="not-found__nav-card">
              <div className="not-found__nav-icon not-found__nav-icon--discount">
                <i className="ri-price-tag-3-line" />
              </div>
              <div className="not-found__nav-info">
                <strong>{t("notFound.catalog")}</strong>
                <span>
                  {language === "ru"
                    ? "Выгодные скидки на лучшие книги"
                    : "Great deals on top books"}
                </span>
              </div>
              <i className="ri-arrow-right-s-line not-found__nav-arrow" />
            </Link>

            <Link to="/featured" className="not-found__nav-card">
              <div className="not-found__nav-icon not-found__nav-icon--featured">
                <i className="ri-book-open-line" />
              </div>
              <div className="not-found__nav-info">
                <strong>{t("notFound.featured")}</strong>
                <span>
                  {language === "ru"
                    ? "Курируемые подборки издательств"
                    : "Curated selections from publishers"}
                </span>
              </div>
              <i className="ri-arrow-right-s-line not-found__nav-arrow" />
            </Link>

            <Link to="/new" className="not-found__nav-card">
              <div className="not-found__nav-icon not-found__nav-icon--new">
                <i className="ri-sparkles-line" />
              </div>
              <div className="not-found__nav-info">
                <strong>{t("notFound.new")}</strong>
                <span>
                  {language === "ru"
                    ? "Свежие книжные поступления"
                    : "Fresh arrivals and novelties"}
                </span>
              </div>
              <i className="ri-arrow-right-s-line not-found__nav-arrow" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
