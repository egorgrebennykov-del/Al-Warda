import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useLanguage } from "../../context/languageContext";
import { useCurrency } from "../../context/currencyContext";
import { getPerfumes, getPerfumeUrl } from "../../../utils/perfumes";
import { addToCart } from "../../../utils/cart";
import "./Search.css";
import "../common/ProductCardImages.css";

export default function Search({ show, onClose }) {
  const { t } = useLanguage();
  const { formatPrice } = useCurrency();
  const [query, setQuery] = useState("");
  const [allPerfumes, setAllPerfumes] = useState([]);
  const [matchingPerfumes, setMatchingPerfumes] = useState([]);
  const [addedIds, setAddedIds] = useState({});
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const quickTags = [
    { label: "Lattafa", query: "Lattafa" },
    { label: "Armaf", query: "Armaf" },
    { label: "Afnan", query: "Afnan" },
    { label: "Al Haramain", query: "Al Haramain" },
    { label: "Amouage", query: "Amouage" },
    { label: "Arabian Oud", query: "Arabian Oud" },
    { label: "Ajmal", query: "Ajmal" },
    { label: "Ard Al Zaafaran", query: "Ard Al Zaafaran" },
    { label: "Rasasi", query: "Rasasi" },
    { label: "Swiss Arabian", query: "Swiss Arabian" },
    { label: "Maison Alhambra", query: "Maison Alhambra" },
    { label: "French Avenue", query: "French Avenue" },
    { label: "Khadlaj", query: "Khadlaj" },
    { label: t("search.tagOud") || "Oud", query: "oud" },
    { label: t("search.tagAmber") || "Amber", query: "amber" },
    { label: t("search.tagMusk") || "Musk", query: "musk" },
    { label: t("search.tagBestsellers") || "Bestsellers", query: "bestseller" },
  ];

  useEffect(() => {
    if (!show) return;
    let active = true;
    const refresh = () => {
      getPerfumes({ refresh: true })
        .then((data) => {
          if (active && Array.isArray(data)) setAllPerfumes(data);
        })
        .catch((err) => console.warn("Could not refresh perfumes for search:", err));
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [show]);

  useEffect(() => {
    if (show) {
      setTimeout(() => inputRef.current?.focus(), 150);
    } else {
      setQuery("");
    }
  }, [show]);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // When query is empty, show top bestsellers / popular perfumes in grid
      const suggested = allPerfumes
        .filter((p) => p.isBestSeller || p.isFeatured)
        .slice(0, 8);
      setMatchingPerfumes(suggested.length > 0 ? suggested : allPerfumes.slice(0, 8));
      return;
    }

    const filtered = allPerfumes.filter((p) => {
      if (q === "bestseller") return p.isBestSeller;
      const name = (p.name || "").toLowerCase();
      const brand = (p.brand || "").toLowerCase();
      const cat = (p.category || "").toLowerCase();
      const notes = (p.notesSummary || "").toLowerCase();
      const desc = (p.description || "").toLowerCase();

      return (
        name.includes(q) ||
        brand.includes(q) ||
        cat.includes(q) ||
        notes.includes(q) ||
        desc.includes(q) ||
        (p.topNotes && p.topNotes.some((n) => n.toLowerCase().includes(q))) ||
        (p.heartNotes && p.heartNotes.some((n) => n.toLowerCase().includes(q))) ||
        (p.baseNotes && p.baseNotes.some((n) => n.toLowerCase().includes(q)))
      );
    });

    setMatchingPerfumes(filtered);
  }, [query, allPerfumes]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    const text = query.trim();
    if (!text) return;

    navigate(`/search?q=${encodeURIComponent(text)}`);
    onClose();
  };

  const handleSelectPerfume = (perfume) => {
    navigate(getPerfumeUrl(perfume));
    onClose();
  };

  const handleTagClick = (tag) => {
    setQuery(tag);
    inputRef.current?.focus();
  };

  const handleCardMouseMove = (e) => {
    if (typeof window !== "undefined" && (window.innerWidth <= 768 || window.matchMedia("(hover: none)").matches)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const rotateX = -(y / (rect.height / 2)) * 6.5;
    const rotateY = (x / (rect.width / 2)) * 6.5;
    e.currentTarget.style.setProperty("--tilt-x", `${rotateX.toFixed(2)}deg`);
    e.currentTarget.style.setProperty("--tilt-y", `${rotateY.toFixed(2)}deg`);
  };

  const handleCardMouseLeave = (e) => {
    e.currentTarget.style.setProperty("--tilt-x", "0deg");
    e.currentTarget.style.setProperty("--tilt-y", "0deg");
  };

  const handleAddToCart = async (perfume, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      await addToCart(perfume, undefined, 1);
      setAddedIds((prev) => ({ ...prev, [perfume.id]: true }));
      setTimeout(() => {
        setAddedIds((prev) => ({ ...prev, [perfume.id]: false }));
      }, 2000);
    } catch (err) {
      console.warn("Cart error:", err);
    }
  };

  return (
    <div className={`search ${show ? "show-search" : ""}`} id="search-content">
      <div className="search__container">
        {/* Search Header Form */}
        <form className="search__form" onSubmit={handleSubmit}>
          <i className="ri-search-line search__icon" />
          <input
            ref={inputRef}
            type="search"
            placeholder={t("search.inputPlaceholder") || t("search.placeholder")}
            className="search__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="search__clear-btn"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </form>

        {/* Quick Filter Tag Chips */}
        <div className="search__quick-tags">
          {quickTags.map((tag) => (
            <button
              key={tag.query}
              type="button"
              className={`search__tag-chip ${query.toLowerCase() === tag.query.toLowerCase() ? "active" : ""}`}
              onClick={() => handleTagClick(tag.query)}
            >
              {tag.label}
            </button>
          ))}
        </div>

        {/* Live Search Results Header */}
        <div className="search__results-header">
          <span>
            {query.trim()
              ? `${t("search.foundFragrances")} ${matchingPerfumes.length}`
              : t("search.popularFragrances")}
          </span>
          {query.trim() && matchingPerfumes.length > 0 && (
            <span
              className="search__view-all-link"
              onClick={handleSubmit}
            >
              {t("search.openInCatalog")}
            </span>
          )}
        </div>

        {/* Perfume Grid (Без фона) */}
        {matchingPerfumes.length === 0 ? (
          <div className="search__no-results">
            <i className="ri-search-eye-line search__no-results-icon" />
            <p>{t("search.noFragrancesFound") || t("search.nothingFound")}</p>
            <div className="search__no-results-hint">
              {t("search.tryChoosingBrand")}
            </div>
          </div>
        ) : (
          <>
            <div className="search__grid">
              {matchingPerfumes.slice(0, 8).map((p) => {
                const isAdded = Boolean(addedIds[p.id]);
                return (
                  <div
                    key={p.id}
                    className="search__card"
                    onClick={() => handleSelectPerfume(p)}
                    onMouseMove={handleCardMouseMove}
                    onMouseLeave={handleCardMouseLeave}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && handleSelectPerfume(p)}
                  >
                    {/* Perfume Bottle Image */}
                    <div className="search__card-img-wrap">
                      <div className="search__card-aura" />
                      <img
                        src={p.image}
                        alt={p.name}
                        className="search__card-img"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.hidden = true;
                        }}
                      />
                      <div className="search__card-sheen" />
                    </div>

                    {/* Perfume Info */}
                    <div className="search__card-body">
                      <span className="search__card-brand">{p.brand || "Al-Warda"}</span>
                      <h4 className="search__card-title">{p.name}</h4>
                      <p className="search__card-notes">{p.notesSummary}</p>
                      <div className="search__card-price">{formatPrice(p.price)}</div>
                    </div>

                    {/* Action Button */}
                    <button
                      type="button"
                      className={`search__card-btn ${isAdded ? "search__card-btn--added" : ""}`}
                      onClick={(e) => handleAddToCart(p, e)}
                    >
                      {isAdded ? t("featured.added") : t("featured.addToCart")}
                    </button>
                  </div>
                );
              })}
            </div>

            {matchingPerfumes.length > 8 && (
              <div className="search__view-all-row">
                <button
                  type="button"
                  className="search__view-all-btn"
                  onClick={handleSubmit}
                >
                  <span>{t("search.viewAllResults")} ({matchingPerfumes.length})</span>
                  <i className="ri-arrow-right-line" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <i
        className="ri-close-line search__close"
        id="search-close"
        onClick={onClose}
        aria-label="Close search"
      />
    </div>
  );
}
