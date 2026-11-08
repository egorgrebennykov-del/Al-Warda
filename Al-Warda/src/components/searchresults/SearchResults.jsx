import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { getPerfumes, getPerfumeUrl } from "../../../utils/perfumes";
import { addToCart } from "../../../utils/cart";
import { useLanguage } from "../../context/languageContext";
import { OrnateCard } from "../common/OrnateCard";
import "./SearchResults.css";
import "../common/ProductCardImages.css";

const POPULAR_ARABIAN_BRANDS = [
  "All",
  "Lattafa",
  "Armaf",
  "Afnan",
  "Ajmal",
  "Al Fares",
  "Al Haramain",
  "Al Majed for Oud",
  "Al Rehab",
  "Al Wataniah",
  "Amouage",
  "Anfas",
  "Arabian Oud",
  "Ard Al Zaafaran",
  "Asdaaf",
  "Atyab Al Marshoud",
  "Ayat Perfumes",
  "Azha",
  "Azhaara",
  "Clive Dorris",
  "Emper",
  "Flavia",
  "Fragrance World",
  "French Avenue",
  "Grandeur",
  "Gulf Orchid",
  "Hamidi",
  "Hayaati",
  "Hekayat Attar",
  "Jenny Glow",
  "Just Jack",
  "Khadlaj",
  "Khalis",
  "La Fede",
  "Le Falcone",
  "Maison Alhambra",
  "Mamlakt Al Oud",
  "Ministry of Oud",
  "Myperfumes",
  "Nabeel",
  "Ojar",
  "Orientica",
  "Paris Corner",
  "Prime Collection",
  "Privezarah",
  "Rasasi",
  "Rayhaan",
  "Riiffs",
  "Risala",
  "Shaikh Mohd Saeed",
  "Sterling Parfums",
  "Swiss Arabian",
  "Tayyib",
  "Vurv",
  "Zimaya",
];

const PAGE_SIZE = 21;

export default function SearchResults() {
  const { language } = useLanguage();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const query = (params.get("q") || "").trim();
  const isRu = language !== "en";

  const [loading, setLoading] = useState(true);
  const [allPerfumes, setAllPerfumes] = useState([]);
  const [results, setResults] = useState([]);
  const [addedIds, setAddedIds] = useState({});
  const [filterType, setFilterType] = useState("all"); // "all" | "dropship" | "stock"
  const [selectedBrand, setSelectedBrand] = useState("All");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef(null);

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
    setIsLoadingMore(false);
  }, [query, filterType, selectedBrand]);

  const loadMoreItems = useCallback(() => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleLimit((prev) => Math.min(prev + PAGE_SIZE, results.length));
      setIsLoadingMore(false);
    }, 550);
  }, [isLoadingMore, results.length]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && visibleLimit < results.length) {
          loadMoreItems();
        }
      },
      { rootMargin: "250px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMoreItems, isLoadingMore, visibleLimit, results.length]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getPerfumes({ refresh: true })
      .then((all) => {
        if (cancelled) return;
        setAllPerfumes(all);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    const timer = window.setInterval(() => {
      getPerfumes({ refresh: true })
        .then((all) => { if (!cancelled) setAllPerfumes(all); })
        .catch((err) => console.warn("Could not refresh search results:", err));
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let filtered = [...allPerfumes];

    // Filter by search query
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.notesSummary.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // Filter by Dropship / Stock
    if (filterType === "dropship") {
      filtered = filtered.filter((p) => p.isDropship);
    } else if (filterType === "stock") {
      filtered = filtered.filter((p) => !p.isDropship);
    }

    // Filter by Brand
    if (selectedBrand !== "All") {
      const b = selectedBrand.toLowerCase().replace(/[^a-z0-9]/g, "");
      filtered = filtered.filter((p) => {
        const brandClean = (p.brand || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const nameClean = (p.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return brandClean.includes(b) || nameClean.includes(b);
      });
    }

    setResults(filtered);
  }, [query, allPerfumes, filterType, selectedBrand]);

  const handleAddToCart = async (perfume, e) => {
    e.preventDefault();
    e.stopPropagation();

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

  return (
    <section className="results section container warda-results-page">
      <div className="results__heading">
        <h1 className="results__title">
          {query
            ? `${isRu ? "Результаты поиска:" : "Search Results:"} "${query}"`
            : isRu
              ? "Каталог арабской парфюмерии"
              : "Arabian Fragrances Catalog"}
        </h1>
        <p className="results__count">
          {loading
            ? isRu
              ? "Загружаем арабские духи..."
              : "Loading Arabian perfumes..."
            : `${results.length} ${isRu ? "ароматов найдено" : "fragrances found"}`}
        </p>
      </div>

      {/* Filter Bar */}
      {!loading && (
        <div className="warda-filter-bar">
          {/* Dropship vs In Stock filter */}
          <div className="warda-filter-group">
            <button
              type="button"
              className={`warda-filter-pill ${filterType === "all" ? "active" : ""}`}
              onClick={() => setFilterType("all")}
            >
              {isRu ? "Все арабские духи" : "All Arabian Perfumes"}
            </button>
          </div>

          {/* Brand chips */}
          <div className="warda-filter-group">
            {POPULAR_ARABIAN_BRANDS.map((brand) => (
              <button
                key={brand}
                type="button"
                className={`warda-filter-pill ${selectedBrand === brand ? "active" : ""}`}
                onClick={() => setSelectedBrand(brand)}
              >
                {brand === "All" ? (isRu ? "Все бренды" : "All Brands") : brand}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="results__loading-state" style={{ textAlign: "center", padding: "4rem 0" }}>
          <div className="app-route-loader__spinner" style={{ margin: "0 auto 1rem" }} />
          <p style={{ color: "#d4af37", fontFamily: "var(--second-font)" }}>
            {isRu ? "Подбираем оригинальные арабские ароматы..." : "Selecting genuine Arabian fragrances..."}
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="results__empty" style={{ textAlign: "center", padding: "4rem 0" }}>
          <i
            className="ri-search-line"
            style={{ fontSize: "3rem", color: "#c5a059", display: "block", marginBottom: "1rem" }}
          />
          <p style={{ fontSize: "1.1rem", color: "#c2b59b" }}>
            {isRu
              ? "По вашему запросу среди арабских духов ничего не найдено"
              : "No Arabian fragrances matched your search"}
          </p>
          <button
            type="button"
            className="warda-btn"
            style={{ marginTop: "1.5rem" }}
            onClick={() => {
              setFilterType("all");
              setSelectedBrand("All");
            }}
          >
            {isRu ? "СБРОСИТЬ ФИЛЬТРЫ" : "RESET FILTERS"}
          </button>
        </div>
      ) : (
        <>
          <div className="warda-shop-grid">
            {results.slice(0, visibleLimit).map((perfume) => {
              const isAdded = Boolean(addedIds[perfume.id]);
              return (
                <OrnateCard
                  key={perfume.id}
                  className="warda-perfume-card"
                  onClick={() => navigate(getPerfumeUrl(perfume))}
                  onMouseMove={handleCardMouseMove}
                  onMouseLeave={handleCardMouseLeave}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && navigate(getPerfumeUrl(perfume))}
                >
                  <div className="warda-perfume-card__media">
                    <div className="warda-perfume-card__aura" />
                    <img
                      src={perfume.image}
                      alt={perfume.name}
                      className="warda-perfume-card__img"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.hidden = true;
                      }}
                    />
                    <div className="warda-perfume-card__sheen" />
                  </div>

                  <div className="warda-perfume-card__info">
                    <span
                      style={{
                        fontSize: "0.75rem",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        color: "#d4af37",
                        fontWeight: 600,
                      }}
                    >
                      {perfume.brand || "Al-Warda"}
                    </span>
                    <h3 className="warda-perfume-card__title">{perfume.name}</h3>
                    <p className="warda-perfume-card__notes">{perfume.brand}</p>
                    <div className="warda-perfume-card__price">
                      €{Number(perfume.price).toFixed(2)}
                    </div>
                  </div>

                  <div className="warda-perfume-card__action">
                    <button
                      type="button"
                      className={`warda-btn warda-btn--card ${isAdded ? "warda-btn--added" : ""}`}
                      onClick={(e) => handleAddToCart(perfume, e)}
                      aria-label={`Add ${perfume.name} to cart`}
                    >
                      {isAdded ? "ADDED ✓" : isRu ? "В КОРЗИНУ" : "ADD TO CART"}
                    </button>
                  </div>
                </OrnateCard>
              );
            })}
          </div>

          {/* Sentinel & Animated Loader for 21-item infinite pagination */}
          {visibleLimit < results.length && (
            <div
              ref={sentinelRef}
              className="warda-load-more-section"
            >
              {isLoadingMore ? (
                <div className="warda-load-more-loader" aria-live="polite">
                  <div className="warda-gold-spinner">
                    <div className="warda-spinner-ring" />
                    <div className="warda-spinner-gem" />
                  </div>
                  <span className="warda-loader-text">
                    {isRu ? "Загрузка парфюмерии..." : "Loading perfumes..."}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  className="warda-btn warda-btn--more"
                  onClick={loadMoreItems}
                >
                  {isRu
                    ? `ПОКАЗАТЬ ЕЩЕ (показано ${visibleLimit} из ${results.length})`
                    : `LOAD MORE (${visibleLimit} of ${results.length})`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
