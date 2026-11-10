import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  getPerfumes,
  getCachedPerfumes,
  getPerfumeUrl,
  isPerfumeSet,
  isDecantablePerfume,
  SAMPLE_VOLUMES,
  getSamplePrice,
  createSampleCartItem,
  hasCompletedGeneratedImage,
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

  const availableBrands = useMemo(() => {
    const map = new Map();
    for (const item of allItems) {
      const b = (item.brand || "").trim();
      if (b) map.set(b, (map.get(b) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([brand]) => brand);
  }, [allItems]);

  const filteredItems = useMemo(() => {
    let result = [...allItems];

    // Filter by type (tab)
    if (selectedType === "samples") {
      result = result.filter((item) => !isPerfumeSet(item) && isDecantablePerfume(item));
    } else if (selectedType === "discovery") {
      result = result.filter((item) => isPerfumeSet(item) && isDiscoveryOrMiniSet(item));
    } else if (selectedType === "gift") {
      result = result.filter((item) => isPerfumeSet(item) && !isDiscoveryOrMiniSet(item));
    }

    // Filter by volume
    if (selectedVolume === "sets") {
      result = result.filter((item) => isPerfumeSet(item));
    } else if (["1ml", "2ml", "5ml", "10ml"].includes(selectedVolume)) {
      result = result.filter((item) => !isPerfumeSet(item) && isDecantablePerfume(item));
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
    const volForSort = ["1ml", "2ml", "5ml", "10ml"].includes(selectedVolume)
      ? selectedVolume
      : (SAMPLE_VOLUMES[0]?.key || "1ml");
    if (sortBy === "price-asc") {
      result.sort((a, b) => {
        const isSetA = isPerfumeSet(a);
        const isSetB = isPerfumeSet(b);
        const priceA = isSetA ? Number(a.price) : getSamplePrice(a.price, volForSort);
        const priceB = isSetB ? Number(b.price) : getSamplePrice(b.price, volForSort);
        return priceA - priceB;
      });
    } else if (sortBy === "price-desc") {
      result.sort((a, b) => {
        const isSetA = isPerfumeSet(a);
        const isSetB = isPerfumeSet(b);
        const priceA = isSetA ? Number(a.price) : getSamplePrice(a.price, volForSort);
        const priceB = isSetB ? Number(b.price) : getSamplePrice(b.price, volForSort);
        return priceB - priceA;
      });
    } else if (sortBy === "popular") {
      result.sort((a, b) => {
        const isSetA = isPerfumeSet(a);
        const isSetB = isPerfumeSet(b);
        // Sets and featured perfumes get priority in Try & Discover
        const scoreA =
          (isSetA ? 40 : 0) +
          (a.isBestSeller ? 50 : 0) +
          (a.isFeatured ? 25 : 0) +
          (Number(a.rating) || 4.5) * 10 +
          (Number(a.reviewsCount) || 0);
        const scoreB =
          (isSetB ? 40 : 0) +
          (b.isBestSeller ? 50 : 0) +
          (b.isFeatured ? 25 : 0) +
          (Number(b.rating) || 4.5) * 10 +
          (Number(b.reviewsCount) || 0);
        return scoreB - scoreA;
      });
    }

    return result;
  }, [allItems, selectedType, selectedVolume, selectedBrand, selectedGender, searchQuery, sortBy]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedType, selectedVolume, selectedBrand, selectedGender, searchQuery, sortBy]);

  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, visibleCount);
  }, [filteredItems, visibleCount]);

  const handleAddToCartItem = async (perfume, volKey, e) => {
    e.preventDefault();
    e.stopPropagation();

    const isSet = isPerfumeSet(perfume);
    const itemKey = isSet ? perfume.id : `${perfume.id}-${volKey}`;
    const checkVol = isSet ? "full" : volKey;
    const currentlyInCart = isInCart(perfume, checkVol);

    try {
      await toggleCart(perfume, {
        volKey: isSet ? null : volKey,
        isSample: !isSet,
        language,
      });

      if (!currentlyInCart) {
        setAddedIds((prev) => ({ ...prev, [itemKey]: true }));
        setTimeout(() => {
          setAddedIds((prev) => ({ ...prev, [itemKey]: false }));
        }, 2200);
      }
    } catch (err) {
      console.warn("Cart error:", err);
    }
  };

  const handleCardClick = (perfume, volKey) => {
    const scrollKey = `warda_scroll_${window.location.pathname}${window.location.search}`;
    sessionStorage.setItem(scrollKey, String(window.scrollY));
    const isSet = isPerfumeSet(perfume);
    const baseUrl = getPerfumeUrl(perfume);
    const targetUrl = isSet ? baseUrl : `${baseUrl}?sample=${volKey || "1ml"}`;
    navigate(targetUrl);
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
              { id: "samples", label: t("sets.tabSamples"), icon: "ri-flask-line" },
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
              {/* VOLUME FILTER */}
              <select
                className="warda-sort-select"
                value={selectedVolume}
                onChange={(e) => setSelectedVolume(e.target.value)}
                aria-label={t("featured.volume")}
              >
                <option value="all">{t("sets.volAll")}</option>
                <option value="1ml">{t("sets.vol1ml")}</option>
                <option value="2ml">{t("sets.vol2ml")}</option>
                <option value="5ml">{t("sets.vol5ml")}</option>
                <option value="10ml">{t("sets.vol10ml")}</option>
                <option value="sets">{t("sets.volSets")}</option>
              </select>

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
              const isSet = isPerfumeSet(perfume);
              const defaultVol = ["1ml", "2ml", "5ml", "10ml"].includes(selectedVolume)
                ? selectedVolume
                : (SAMPLE_VOLUMES[0]?.key || "1ml");
              const activeVol = cardVolumes[perfume.id] || defaultVol;
              const sampleCfg = !isSet
                ? SAMPLE_VOLUMES.find((v) => v.key === activeVol) || SAMPLE_VOLUMES[0]
                : null;
              const currentPrice = isSet
                ? Number(perfume.price)
                : getSamplePrice(perfume.price, activeVol);
              const rawVolLabel = sampleCfg ? (sampleCfg.labelEn || sampleCfg.key) : "";
              const volLabel = formatVolume(rawVolLabel, language);
              const itemKey = isSet ? perfume.id : `${perfume.id}-${activeVol}`;
              const isAdded = Boolean(addedIds[itemKey]);

              return (
                <OrnateCard
                  key={itemKey}
                  className="warda-perfume-card warda-set-card"
                  onClick={() => handleCardClick(perfume, activeVol)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && handleCardClick(perfume, activeVol)}
                >
                  <div className="warda-perfume-card__media">
                    {isSet ? (
                      <span className="warda-set-card__badge">
                        <i className="ri-gift-2-fill" />
                        {getSetBadgeLabel(perfume, language, t)}
                      </span>
                    ) : (
                      <span className="warda-sample-card__badge">
                        <i className="ri-flask-fill" />
                        {`${t("sets.badgeSample")} • ${volLabel}`}
                      </span>
                    )}

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

                    {/* INTERACTIVE VOLUME SWITCHER FOR SAMPLES */}
                    {!isSet && (
                      <div className="warda-card-volumes" onClick={(e) => e.stopPropagation()}>
                        {SAMPLE_VOLUMES.map((sv) => (
                          <button
                            key={sv.key}
                            type="button"
                            className={`warda-card-vol-pill ${activeVol === sv.key ? "active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCardVolumes((prev) => ({ ...prev, [perfume.id]: sv.key }));
                              handleCardClick(perfume, sv.key);
                            }}
                            title={`${formatVolume(sv.labelEn || sv.key, language)} — ${getLocalizedSampleDesc(sv.key, language)}`}
                          >
                            {formatVolume(sv.labelEn || sv.key, language)}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="warda-perfume-card__price">
                      {formatPrice(currentPrice)}
                    </div>
                  </div>

                  <div className="warda-perfume-card__action">
                    {(() => {
                      const inCart = isInCart(perfume, isSet ? "full" : activeVol);
                      return (
                        <button
                          type="button"
                          className={`warda-btn warda-btn--card ${inCart ? "warda-btn--in-cart" : isAdded ? "warda-btn--added" : ""}`}
                          onClick={(e) => handleAddToCartItem(perfume, activeVol, e)}
                          aria-label={inCart ? t("featured.remove") : `Add ${perfume.name} to cart`}
                          title={inCart ? t("featured.remove") : undefined}
                        >
                          {inCart ? (
                            <>
                              <span className="warda-btn__text-normal">
                                {isSet ? t("featured.inBag") : `${t("featured.inBag").replace("✓", "").trim()} (${volLabel}) ✓`}
                              </span>
                              <span className="warda-btn__text-hover">
                                {t("featured.remove")}
                              </span>
                            </>
                          ) : isAdded ? (
                            t("featured.added")
                          ) : isSet ? (
                            t("featured.addToCart")
                          ) : (
                            `${t("featured.addToCart")} (${volLabel})`
                          )}
                        </button>
                      );
                    })()}
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
