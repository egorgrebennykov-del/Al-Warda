import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  getPerfumes,
  getPerfumeUrl,
  isPerfumeSet,
  getDefaultPerfumeVolumeOption,
  getDefaultCatalogPrice,
  hasCompletedGeneratedImage,
} from "../../../utils/perfumes";
import { addToCart } from "../../../utils/cart";
import { useCartState } from "../../hooks/useCartState";
import { useLanguage } from "../../context/languageContext";
import { useCurrency } from "../../context/currencyContext";
import { formatVolume } from "../../utils/localization";
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
  const { language, t } = useLanguage();
  const { formatPrice } = useCurrency();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isInCart, toggleCart } = useCartState();
  const query = (params.get("q") || "").trim();

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

    // Кэш-first: при повторных заходах данные показываются мгновенно из памяти,
    // запрос к Supabase делается только если кэша ещё нет (первый визит).
    // Убран рефетч каждые 30 с с refresh: true — он был причиной повторных ~12-с ожиданий.
    getPerfumes()
      .then((all) => {
        if (cancelled) return;
        setAllPerfumes((all || []).filter(hasCompletedGeneratedImage));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
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

    const defaultOpt = getDefaultPerfumeVolumeOption(perfume);
    const isSample = defaultOpt.isSecondLargest && defaultOpt.isSample;
    const volKey = isSample ? defaultOpt.key : null;
    const currentlyInCart = isInCart(perfume, isSample ? defaultOpt.key : "full");
    try {
      await toggleCart(perfume, {
        volKey,
        isSample,
        quantity: 1,
        language: isRu ? "ru" : "en",
      });
      if (!currentlyInCart) {
        setAddedIds((prev) => ({ ...prev, [perfume.id]: true }));
        setTimeout(() => {
          setAddedIds((prev) => ({ ...prev, [perfume.id]: false }));
        }, 2000);
      }
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
            ? `${t("search.resultsFor")} "${query}"`
            : t("search.allPerfumes")}
        </h1>
        <p className="results__count">
          {loading
            ? ""
            : `${t("search.foundFragrances") || t("search.foundCount")} ${results.length}`}
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
              {t("search.allPerfumes")}
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
                {brand === "All" ? t("search.allBrands") : brand}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="results__loading-state" style={{ textAlign: "center", padding: "4rem 0" }}>
          <div className="results__spinner results__spinner--gold" style={{ margin: "0 auto 1rem" }} />
        </div>
      ) : results.length === 0 ? (
        <div className="results__empty" style={{ textAlign: "center", padding: "4rem 0" }}>
          <i
            className="ri-search-line"
            style={{ fontSize: "3rem", color: "#c5a059", display: "block", marginBottom: "1rem" }}
          />
          <p style={{ fontSize: "1.1rem", color: "#c2b59b" }}>
            {t("search.notFoundQuery")}
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
            {t("search.resetFilters")}
          </button>
        </div>
      ) : (
        <>
          <div className="warda-shop-grid">
            {results.slice(0, visibleLimit).map((perfume) => {
              const isAdded = Boolean(addedIds[perfume.id]);
              const defaultOpt = getDefaultPerfumeVolumeOption(perfume);
              const isSample = defaultOpt.isSecondLargest && defaultOpt.isSample;
              const productUrl = defaultOpt.isSecondLargest
                ? (isSample ? `${getPerfumeUrl(perfume)}?sample=${defaultOpt.key}` : `${getPerfumeUrl(perfume)}?size=${defaultOpt.key}`)
                : getPerfumeUrl(perfume);
              const displayPrice = defaultOpt.price;
              const displayVolume = defaultOpt.isSecondLargest
                ? formatVolume(defaultOpt.ml || defaultOpt.labelEn, language)
                : formatVolume(perfume.volume ? perfume.volume.split("/")[0].trim() : "", language);
              return (
                <OrnateCard
                  key={perfume.id}
                  className="warda-perfume-card"
                  onClick={() => {
                    const scrollKey = `warda_scroll_${window.location.pathname}${window.location.search}`;
                    sessionStorage.setItem(scrollKey, String(window.scrollY));
                    navigate(productUrl);
                  }}
                  onMouseMove={handleCardMouseMove}
                  onMouseLeave={handleCardMouseLeave}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const scrollKey = `warda_scroll_${window.location.pathname}${window.location.search}`;
                      sessionStorage.setItem(scrollKey, String(window.scrollY));
                      navigate(productUrl);
                    }
                  }}
                >
                  <div className="warda-perfume-card__media">
                    {isPerfumeSet(perfume) && (
                      <span className="warda-perfume-card__set-tag">
                        🎁 {t("featured.giftSet")}
                      </span>
                    )}
                    <div className="warda-perfume-card__aura" />
                    <img
                      src={perfume.image}
                      alt={perfume.name}
                      className="warda-perfume-card__img"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        const card = e.currentTarget.closest(".warda-perfume-card");
                        if (card) card.style.display = "none";
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
                    <p className="warda-perfume-card__notes">
                      {perfume.brand}
                      {displayVolume && (
                        <span style={{ marginLeft: "0.4rem", opacity: 0.75, fontSize: "0.8rem" }}>
                          · {displayVolume}
                        </span>
                      )}
                    </p>
                    <div className="warda-perfume-card__price">
                      {formatPrice(displayPrice)}
                    </div>
                  </div>

                  <div className="warda-perfume-card__action">
                    {(() => {
                      const inCart = isInCart(perfume, isSample ? defaultOpt.key : "full");
                      return (
                        <button
                          type="button"
                          className={`warda-btn warda-btn--card ${inCart ? "warda-btn--in-cart" : isAdded ? "warda-btn--added" : ""}`}
                          onClick={(e) => handleAddToCart(perfume, e)}
                          aria-label={inCart ? t("featured.remove") : `Add ${perfume.name} to cart`}
                          title={inCart ? t("featured.remove") : undefined}
                        >
                          {inCart ? (
                            <>
                              <span className="warda-btn__text-normal">{t("featured.inBag")}</span>
                              <span className="warda-btn__text-hover">{t("featured.remove")}</span>
                            </>
                          ) : isAdded ? (
                            t("featured.added")
                          ) : (
                            t("featured.addToCart")
                          )}
                        </button>
                      );
                    })()}
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
                    {t("search.loadingMore")}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  className="warda-btn warda-btn--more"
                  onClick={loadMoreItems}
                >
                  {`✦ ${t("featured.loadMore")} (${visibleLimit} / ${results.length}) ✦`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
