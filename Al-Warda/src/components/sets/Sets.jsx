import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  getPerfumes,
  getCachedPerfumes,
  getPerfumeUrl,
  isPerfumeSet,
  hasCompletedGeneratedImage,
  parseVolumeMl,
} from "../../../utils/perfumes";
import { addToCart } from "../../../utils/cart";
import { useCartState } from "../../hooks/useCartState";
import { useLanguage } from "../../context/languageContext";
import { useCurrency } from "../../context/currencyContext";
import { formatVolume, getLocalizedSampleDesc } from "../../utils/localization";
import { OrnateCard, SectionDivider, SensesMotif } from "../common/OrnateCard";
import "../featured/Featured.css";
import "../common/ProductCardImages.css";
import "./Sets.css";

function isDiscoveryOrMiniSet(item) {
  const txt = `${item?.name || ""} ${item?.title || ""}`.toLowerCase();
  return /\b(discovery|mini|travel|sample|\d+\s*[x×]\s*[1-9]\d?\s*ml|pen\s*spray|pack\s+of)\b/i.test(txt);
}

function isMiniatureOrSample(item) {
  const vol = parseVolumeMl(item?.name) || parseVolumeMl(item?.volume);
  if (vol && vol < 30) return true;
  const txt = `${item?.name || ""} ${item?.title || ""}`.toLowerCase();
  return /\b(miniature|travel|sample|vial|миниатюр|пробник)\b/i.test(txt);
}

function isSetOrDiscoveryProduct(item) {
  return isPerfumeSet(item) || isDiscoveryOrMiniSet(item) || isMiniatureOrSample(item);
}

function getSetBadgeLabel(item, language = "ru", t) {
  const isDisc = isDiscoveryOrMiniSet(item);
  if (t) {
    return isDisc ? t("sets.badgeDiscovery") : t("sets.badgeGift");
  }
  const lang = String(language || "ru").toLowerCase();
  if (lang === "ru") return isDisc ? "ДИСКАВЕРИ СЕТ" : "ПОДАРОЧНЫЙ СЕТ";
  if (lang === "hu") return isDisc ? "FELFEDEZŐ KÉSZLET" : "AJÁNDÉK SZETT";
  if (lang === "bg") return isDisc ? "ДИСКАВЪРИ КОМПЛЕКТ" : "ПОДАРЪЧЕН КОМПЛЕКТ";
  if (lang === "el") return isDisc ? "DISCOVERY SET" : "ΣΕΤ ΔΩΡΟΥ";
  if (lang === "ro") return isDisc ? "DISCOVERY SET" : "SET CADOU";
  return isDisc ? "DISCOVERY SET" : "GIFT SET";
}

function formatItemCount(count, language = "ru") {
  const n = Math.abs(Number(count) || 0);
  const lang = String(language || "ru").toLowerCase();
  if (lang === "ru") {
    const mod100 = n % 100;
    const mod10 = n % 10;
    if (mod100 >= 11 && mod100 <= 19) return `${n} предложений`;
    if (mod10 === 1) return `${n} предложение`;
    if (mod10 >= 2 && mod10 <= 4) return `${n} предложения`;
    return `${n} предложений`;
  }
  if (lang === "bg") {
    return `${n} ${n === 1 ? "предложение" : "предложения"}`;
  }
  if (lang === "hu") {
    return `${n} ajánlat`;
  }
  if (lang === "el") {
    return `${n} ${n === 1 ? "προσφορά" : "προσφορές"}`;
  }
  if (lang === "ro") {
    return `${n} ${n === 1 ? "ofertă" : "oferte"}`;
  }
  return `${n} ${n === 1 ? "offer" : "offers"}`;
}

function formatShowingOf(count, total, language = "ru") {
  const lang = String(language || "ru").toLowerCase();
  if (lang === "ru") return `Показано ${count} из ${total} предложений`;
  if (lang === "bg") return `Показани ${count} от ${total} предложения`;
  if (lang === "hu") return `Megjelenítve: ${count} / ${total} ajánlat`;
  if (lang === "el") return `Εμφάνιση ${count} από ${total} προσφορές`;
  if (lang === "ro") return `Se afișează ${count} din ${total} oferte`;
  return `Showing ${count} of ${total} offers`;
}

const PAGE_SIZE = 28;

export default function Sets() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { language, t } = useLanguage();
  const { formatPrice } = useCurrency();
  const { isInCart, toggleCart } = useCartState();

  const [allItems, setAllItems] = useState(() => getCachedPerfumes() || []);
  const [loading, setLoading] = useState(() => (getCachedPerfumes() || []).length === 0);
  const [addedIds, setAddedIds] = useState({});
  const [cardVolumes, setCardVolumes] = useState({});
  const [visibleCount, setVisibleCount] = useState(() => {
    const saved = Number(sessionStorage.getItem("warda_visible_sets"));
    return Number.isFinite(saved) && saved >= PAGE_SIZE ? saved : PAGE_SIZE;
  });

  useEffect(() => {
    sessionStorage.setItem("warda_visible_sets", String(visibleCount));
  }, [visibleCount]);

  const [selectedType, setSelectedType] = useState(() => searchParams.get("type") || "all");
  const [selectedVolume, setSelectedVolume] = useState(() => searchParams.get("volume") || "all");
  const [selectedBrand, setSelectedBrand] = useState(() => searchParams.get("brand") || "all");
  const [selectedGender, setSelectedGender] = useState(() => searchParams.get("gender") || "all");
  const [sortBy, setSortBy] = useState("popular");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedType && selectedType !== "all") params.set("type", selectedType);
    if (selectedVolume && selectedVolume !== "all") params.set("volume", selectedVolume);
    if (selectedBrand && selectedBrand !== "all") params.set("brand", selectedBrand);
    if (selectedGender && selectedGender !== "all") params.set("gender", selectedGender);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }, [selectedType, selectedVolume, selectedBrand, selectedGender, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getPerfumes()
      .then((items) => {
        if (!cancelled) {
          setAllItems((items || []).filter(hasCompletedGeneratedImage));
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("Could not load perfumes for Try & Discover:", err);
        if (!cancelled) setLoading(false);
      });

    const timer = window.setInterval(() => {
      getPerfumes({ refresh: true })
        .then((items) => {
          if (!cancelled && items?.length) {
            setAllItems((items || []).filter(hasCompletedGeneratedImage));
          }
        })
        .catch(() => {});
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const allSetItems = useMemo(() => {
    return allItems.filter(isSetOrDiscoveryProduct);
  }, [allItems]);

  const availableBrands = useMemo(() => {
    const map = new Map();
    for (const item of allSetItems) {
      const b = (item.brand || "").trim();
      if (b) map.set(b, (map.get(b) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([brand]) => brand);
  }, [allSetItems]);

  const filteredItems = useMemo(() => {
    let result = [...allSetItems];

    // Filter by type (tab)
    if (selectedType === "discovery") {
      result = result.filter(isDiscoveryOrMiniSet);
    } else if (selectedType === "gift") {
      result = result.filter((item) => isPerfumeSet(item) && !isDiscoveryOrMiniSet(item));
    }

    // Filter by brand
    if (selectedBrand !== "all") {
      result = result.filter(
        (item) => (item.brand || "").toLowerCase() === selectedBrand.toLowerCase()
      );
    }

    // Filter by gender
    if (selectedGender !== "all") {
      result = result.filter((item) => {
        const g = `${item.gender || ""} ${item.genderRu || ""} ${item.genderEn || ""}`.toLowerCase();
        if (selectedGender === "women") return g.includes("жен") || g.includes("women") || g.includes("femme");
        if (selectedGender === "men") return (g.includes("муж") || g.includes("men") || g.includes("homme")) && !g.includes("women") && !g.includes("femme");
        if (selectedGender === "unisex") return g.includes("унисекс") || g.includes("unisex");
        return true;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item) =>
          (item.name || "").toLowerCase().includes(q) ||
          (item.title || "").toLowerCase().includes(q) ||
          (item.brand || "").toLowerCase().includes(q) ||
          (item.notesSummary || "").toLowerCase().includes(q)
      );
    }

    // Sort items
    if (sortBy === "price-asc") {
      result.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (sortBy === "price-desc") {
      result.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    } else if (sortBy === "popular") {
      result.sort((a, b) => {
        const scoreA =
          (isPerfumeSet(a) ? 40 : 0) +
          (a.isBestSeller ? 50 : 0) +
          (a.isFeatured ? 25 : 0) +
          (Number(a.rating) || 4.5) * 10 +
          (Number(a.reviewsCount) || 0);
        const scoreB =
          (isPerfumeSet(b) ? 40 : 0) +
          (b.isBestSeller ? 50 : 0) +
          (b.isFeatured ? 25 : 0) +
          (Number(b.rating) || 4.5) * 10 +
          (Number(b.reviewsCount) || 0);
        return scoreB - scoreA;
      });
    }

    return result;
  }, [allSetItems, selectedType, selectedBrand, selectedGender, searchQuery, sortBy]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedType, selectedVolume, selectedBrand, selectedGender, searchQuery, sortBy]);

  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, visibleCount);
  }, [filteredItems, visibleCount]);

  const handleAddToCartItem = async (perfume, e) => {
    e.preventDefault();
    e.stopPropagation();

    const currentlyInCart = isInCart(perfume, "full");

    try {
      await toggleCart(perfume, {
        volKey: "full",
        isSample: false,
        language,
      });

      if (!currentlyInCart) {
        setAddedIds((prev) => ({ ...prev, [perfume.id]: true }));
        setTimeout(() => {
          setAddedIds((prev) => ({ ...prev, [perfume.id]: false }));
        }, 2200);
      }
    } catch (err) {
      console.warn("Cart error:", err);
    }
  };

  const handleCardClick = (perfume) => {
    const scrollKey = `warda_scroll_${window.location.pathname}${window.location.search}`;
    sessionStorage.setItem(scrollKey, String(window.scrollY));
    navigate(getPerfumeUrl(perfume));
  };

  const resetFilters = () => {
    setSelectedType("all");
    setSelectedVolume("all");
    setSelectedBrand("all");
    setSelectedGender("all");
    setSearchQuery("");
  };

  const hasActiveFilters =
    selectedType !== "all" ||
    selectedVolume !== "all" ||
    selectedBrand !== "all" ||
    selectedGender !== "all" ||
    Boolean(searchQuery.trim());

  return (
    <div className="container warda-shop-page warda-sets-page">
      {/* HERO BANNER */}
      <div className="warda-sets-hero">
        <span className="warda-sets-eyebrow">
          <i className="ri-compass-3-line" />
          {t("sets.heroEyebrow")}
        </span>
        <h1 className="warda-shop-title">
          {t("sets.heroTitle")}
        </h1>
        <p className="warda-shop-subtitle">
          {t("sets.heroSubtitle")}
        </p>

        {/* LUXURY ASSURANCE BENEFITS */}
        <div className="warda-sets-benefits">
          <div className="warda-sets-benefit-item">
            <i className="ri-shield-star-line" />
            <div>
              <strong>{t("sets.benefit1Title")}</strong>
              <span>{t("sets.benefit1Desc")}</span>
            </div>
          </div>
          <div className="warda-sets-benefit-item">
            <i className="ri-flask-line" />
            <div>
              <strong>{t("sets.benefit2Title")}</strong>
              <span>{t("sets.benefit2Desc")}</span>
            </div>
          </div>
          <div className="warda-sets-benefit-item">
            <i className="ri-sparkling-2-line" />
            <div>
              <strong>{t("sets.benefit3Title")}</strong>
              <span>{t("sets.benefit3Desc")}</span>
            </div>
          </div>
        </div>

        {/* FILTER CONTROLS */}
        <div className="warda-sets-controls">
          <div className="warda-sets-tabs" role="tablist">
            {[
              { id: "all", label: t("sets.tabAll"), icon: "ri-apps-2-line" },
              { id: "discovery", label: t("sets.tabDiscovery"), icon: "ri-magic-line" },
              { id: "gift", label: t("sets.tabGift"), icon: "ri-gift-line" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`warda-sets-tab ${selectedType === tab.id ? "active" : ""}`}
                onClick={() => setSelectedType(tab.id)}
              >
                <i className={tab.icon} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="warda-sets-subbar">
            <div className="warda-sets-search">
              <i className="ri-search-line" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("sets.searchPlaceholder")}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="warda-sets-search-clear"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear"
                >
                  <i className="ri-close-line" />
                </button>
              )}
            </div>

            <div className="warda-sets-selects">
              

              {/* BRAND FILTER */}
              {availableBrands.length > 1 && (
                <select
                  className="warda-sort-select"
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  aria-label={t("featured.brand")}
                >
                  <option value="all">{t("sets.brandAll")}</option>
                  {availableBrands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              )}

              {/* GENDER FILTER */}
              <select
                className="warda-sort-select"
                value={selectedGender}
                onChange={(e) => setSelectedGender(e.target.value)}
                aria-label={t("featured.gender")}
              >
                <option value="all">{t("sets.genderAll")}</option>
                <option value="unisex">{t("sets.genderUnisex")}</option>
                <option value="women">{t("sets.genderWomen")}</option>
                <option value="men">{t("sets.genderMen")}</option>
              </select>

              {/* SORT FILTER */}
              <select
                className="warda-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label={t("featured.sort")}
              >
                <option value="popular">{t("sets.sortPopular")}</option>
                <option value="price-asc">{t("sets.sortPriceAsc")}</option>
                <option value="price-desc">{t("sets.sortPriceDesc")}</option>
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  className="warda-reset-filters-btn"
                  onClick={resetFilters}
                  title={t("sets.resetFilters")}
                >
                  ✕ {t("sets.resetFilters")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <SectionDivider
        title={`${t("sets.showing").toUpperCase()}: ${formatItemCount(filteredItems.length, language).toUpperCase()}`}
        showMotif={true}
      />

      {loading ? (
        <div className="warda-loading">
          {t("sets.loading")}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="warda-empty">
          <p>
            {t("sets.noOffers")}
          </p>
          <button
            type="button"
            className="warda-btn"
            style={{ marginTop: "1rem" }}
            onClick={resetFilters}
          >
            {t("sets.showAllOffers")}
          </button>
        </div>
      ) : (
        <>
          <div className="warda-shop-grid">
            {visibleItems.map((perfume) => {
              const itemKey = perfume.id;
              const isAdded = Boolean(addedIds[itemKey]);
              const inCart = isInCart(perfume, "full");

              return (
                <OrnateCard
                  key={itemKey}
                  className="warda-perfume-card warda-set-card"
                  onClick={() => handleCardClick(perfume)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && handleCardClick(perfume)}
                >
                  <div className="warda-perfume-card__media">
                    <span className="warda-set-card__badge">
                      <i className={isDiscoveryOrMiniSet(perfume) ? "ri-sparkling-fill" : "ri-gift-2-fill"} />
                      {getSetBadgeLabel(perfume, language, t)}
                    </span>

                    <span className="warda-perfume-card__aura" />
                    <span className="warda-perfume-card__sheen" />
                    {perfume.image && (
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
                    )}
                  </div>

                  <div className="warda-perfume-card__info">
                    <h3 className="warda-perfume-card__title" title={perfume.name}>
                      {perfume.name}
                    </h3>
                    <p className="warda-perfume-card__notes">{perfume.brand || "Al-Warda"}</p>

                    <div className="warda-perfume-card__price">
                      {formatPrice(perfume.price)}
                    </div>
                  </div>

                  <div className="warda-perfume-card__action">
                    <button
                      type="button"
                      className={`warda-btn warda-btn--card ${inCart ? "warda-btn--in-cart" : isAdded ? "warda-btn--added" : ""}`}
                      onClick={(e) => handleAddToCartItem(perfume, e)}
                      aria-label={inCart ? t("featured.remove") : `Add ${perfume.name} to cart`}
                      title={inCart ? t("featured.remove") : undefined}
                    >
                      {inCart ? (
                        <>
                          <span className="warda-btn__text-normal">
                            {t("featured.inBag")}
                          </span>
                          <span className="warda-btn__text-hover">
                            {t("featured.remove")}
                          </span>
                        </>
                      ) : isAdded ? (
                        t("featured.added")
                      ) : (
                        t("featured.addToCart")
                      )}
                    </button>
                  </div>
                </OrnateCard>
              );
            })}
          </div>

          {/* SHOW MORE PAGINATION BUTTON */}
          {visibleCount < filteredItems.length && (
            <div className="warda-sets-load-more">
              <button
                type="button"
                className="warda-btn warda-sets-load-more__btn"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              >
                <i className="ri-arrow-down-line" />
                <span>
                  {`${t("sets.loadMore")} (+${Math.min(PAGE_SIZE, filteredItems.length - visibleCount)})`}
                </span>
              </button>
              <p className="warda-sets-load-more__hint">
                {formatShowingOf(visibleItems.length, filteredItems.length, language)}
              </p>
            </div>
          )}
        </>
      )}

      <SensesMotif />
    </div>
  );
}
