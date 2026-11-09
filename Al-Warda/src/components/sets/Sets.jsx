import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { getPerfumeSets, getPerfumeUrl } from "../../../utils/perfumes";
import { addToCart } from "../../../utils/cart";
import { useLanguage } from "../../context/languageContext";
import { OrnateCard, SectionDivider, SensesMotif } from "../common/OrnateCard";
import "../featured/Featured.css";
import "../common/ProductCardImages.css";
import "./Sets.css";

function isDiscoveryOrMiniSet(item) {
  const txt = `${item?.name || ""} ${item?.title || ""}`.toLowerCase();
  return /\b(discovery|mini|travel|sample|\d+\s*[x×]\s*[1-9]\d?\s*ml|pen\s*spray|pack\s+of)\b/i.test(txt);
}

function getSetBadgeLabel(item, language = "ru") {
  if (isDiscoveryOrMiniSet(item)) {
    return language === "ru" ? "ДИСКАВЕРИ СЕТ" : "DISCOVERY SET";
  }
  return language === "ru" ? "ПОДАРОЧНЫЙ СЕТ" : "GIFT SET";
}

function formatSetCount(count, language = "ru") {
  const n = Math.abs(Number(count) || 0);
  if (language === "ru") {
    const mod100 = n % 100;
    const mod10 = n % 10;
    if (mod100 >= 11 && mod100 <= 19) return `${n} сетов`;
    if (mod10 === 1) return `${n} сет`;
    if (mod10 >= 2 && mod10 <= 4) return `${n} сета`;
    return `${n} сетов`;
  }
  return `${n} ${n === 1 ? "set" : "sets"}`;
}

export default function Sets() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { language } = useLanguage();

  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addedIds, setAddedIds] = useState({});

  const [selectedType, setSelectedType] = useState(() => searchParams.get("type") || "all");
  const [selectedBrand, setSelectedBrand] = useState(() => searchParams.get("brand") || "all");
  const [selectedGender, setSelectedGender] = useState(() => searchParams.get("gender") || "all");
  const [sortBy, setSortBy] = useState("popular");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedType && selectedType !== "all") params.set("type", selectedType);
    if (selectedBrand && selectedBrand !== "all") params.set("brand", selectedBrand);
    if (selectedGender && selectedGender !== "all") params.set("gender", selectedGender);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }, [selectedType, selectedBrand, selectedGender, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPerfumeSets()
      .then((items) => {
        if (!cancelled) {
          setSets(items);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("Could not load perfume sets:", err);
        if (!cancelled) setLoading(false);
      });

    const timer = window.setInterval(() => {
      getPerfumeSets({ refresh: true })
        .then((items) => {
          if (!cancelled) setSets(items);
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
    for (const s of sets) {
      const b = (s.brand || "").trim();
      if (b) map.set(b, (map.get(b) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([brand]) => brand);
  }, [sets]);

  const filteredSets = useMemo(() => {
    let result = [...sets];

    if (selectedType === "gift") {
      result = result.filter((item) => !isDiscoveryOrMiniSet(item));
    } else if (selectedType === "discovery") {
      result = result.filter((item) => isDiscoveryOrMiniSet(item));
    }

    if (selectedBrand !== "all") {
      result = result.filter(
        (item) => (item.brand || "").toLowerCase() === selectedBrand.toLowerCase()
      );
    }

    if (selectedGender !== "all") {
      result = result.filter((item) => {
        const g = `${item.gender || ""} ${item.genderRu || ""} ${item.genderEn || ""}`.toLowerCase();
        if (selectedGender === "women") return g.includes("жен") || g.includes("women") || g.includes("femme");
        if (selectedGender === "men") return (g.includes("муж") || g.includes("men") || g.includes("homme")) && !g.includes("women") && !g.includes("femme");
        if (selectedGender === "unisex") return g.includes("унисекс") || g.includes("unisex");
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item) =>
          (item.name || "").toLowerCase().includes(q) ||
          (item.brand || "").toLowerCase().includes(q) ||
          (item.notesSummary || "").toLowerCase().includes(q)
      );
    }

    if (sortBy === "price-asc") {
      result.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (sortBy === "price-desc") {
      result.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    } else if (sortBy === "popular") {
      result.sort((a, b) => {
        const scoreA = (a.isBestSeller ? 50 : 0) + (a.isFeatured ? 25 : 0) + (Number(a.rating) || 4.5) * 10 + (Number(a.reviewsCount) || 0);
        const scoreB = (b.isBestSeller ? 50 : 0) + (b.isFeatured ? 25 : 0) + (Number(b.rating) || 4.5) * 10 + (Number(b.reviewsCount) || 0);
        return scoreB - scoreA;
      });
    }

    return result;
  }, [sets, selectedType, selectedBrand, selectedGender, searchQuery, sortBy]);

  const handleAddToCart = async (perfume, e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await addToCart(perfume);
      setAddedIds((prev) => ({ ...prev, [perfume.id]: true }));
      setTimeout(() => {
        setAddedIds((prev) => ({ ...prev, [perfume.id]: false }));
      }, 2000);
    } catch (err) {
      console.warn("Cart error:", err);
    }
  };

  const resetFilters = () => {
    setSelectedType("all");
    setSelectedBrand("all");
    setSelectedGender("all");
    setSearchQuery("");
  };

  return (
    <div className="container warda-shop-page warda-sets-page">
      {/* HERO BANNER FOR SETS */}
      <div className="warda-sets-hero">
        <span className="warda-sets-eyebrow">
          <i className="ri-gift-2-line" />
          {language === "ru" ? "ЭКСКЛЮЗИВНАЯ КОЛЛЕКЦИЯ" : "EXCLUSIVE COLLECTION"}
        </span>
        <h1 className="warda-shop-title">
          {language === "ru" ? "Парфюмерные Сеты и Наборы" : "Luxury Perfume & Gift Sets"}
        </h1>
        <p className="warda-shop-subtitle">
          {language === "ru"
            ? "Исключительно оригинальные подарочные наборы, тревел-коллекции и дискавери-сеты с Ближнего Востока в фирменном оформлении."
            : "Exclusively authentic gift coffrets, travel collections, and discovery sets from the Middle East in signature presentation boxes."}
        </p>

        {/* FILTER CONTROLS */}
        <div className="warda-sets-controls">
          <div className="warda-sets-tabs" role="tablist">
            {[
              { id: "all", ru: "Все сеты", en: "All Sets", icon: "ri-apps-2-line" },
              { id: "gift", ru: "Подарочные наборы", en: "Gift Sets", icon: "ri-gift-line" },
              { id: "discovery", ru: "Дискавери и мини-сеты", en: "Discovery & Mini Sets", icon: "ri-flask-line" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`warda-sets-tab ${selectedType === tab.id ? "active" : ""}`}
                onClick={() => setSelectedType(tab.id)}
              >
                <i className={tab.icon} />
                <span>{language === "ru" ? tab.ru : tab.en}</span>
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
                placeholder={
                  language === "ru"
                    ? "Поиск сета по названию или бренду..."
                    : "Search sets by name or brand..."
                }
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
              {availableBrands.length > 1 && (
                <select
                  className="warda-sort-select"
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  aria-label={language === "ru" ? "Бренд" : "Brand"}
                >
                  <option value="all">{language === "ru" ? "Все бренды" : "All Brands"}</option>
                  {availableBrands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              )}

              <select
                className="warda-sort-select"
                value={selectedGender}
                onChange={(e) => setSelectedGender(e.target.value)}
                aria-label={language === "ru" ? "Для кого" : "Gender"}
              >
                <option value="all">{language === "ru" ? "Для всех" : "All Genders"}</option>
                <option value="unisex">{language === "ru" ? "Унисекс" : "Unisex"}</option>
                <option value="women">{language === "ru" ? "Женские" : "For Her"}</option>
                <option value="men">{language === "ru" ? "Мужские" : "For Him"}</option>
              </select>

              <select
                className="warda-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label={language === "ru" ? "Сортировка" : "Sort by"}
              >
                <option value="popular">{language === "ru" ? "По популярности" : "Most Popular"}</option>
                <option value="price-asc">{language === "ru" ? "Сначала дешевле" : "Price: Low to High"}</option>
                <option value="price-desc">{language === "ru" ? "Сначала дороже" : "Price: High to Low"}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <SectionDivider
        title={`${language === "ru" ? "НАЙДЕНО" : "SHOWING"}: ${formatSetCount(filteredSets.length, language).toUpperCase()}`}
        showMotif={true}
      />

      {loading ? (
        <div className="warda-loading">
          {language === "ru" ? "Загрузка коллекции сетов..." : "Loading luxury sets..."}
        </div>
      ) : filteredSets.length === 0 ? (
        <div className="warda-empty">
          <p>
            {language === "ru"
              ? "По выбранным параметрам сеты не найдены."
              : "No perfume sets found matching your filters."}
          </p>
          <button
            type="button"
            className="warda-btn"
            style={{ marginTop: "1rem" }}
            onClick={resetFilters}
          >
            {language === "ru" ? "ПОКАЗАТЬ ВСЕ СЕТЫ" : "SHOW ALL SETS"}
          </button>
        </div>
      ) : (
        <div className="warda-shop-grid">
          {filteredSets.map((perfume) => {
            const isAdded = Boolean(addedIds[perfume.id]);
            const productUrl = getPerfumeUrl(perfume);

            return (
              <OrnateCard
                key={perfume.id}
                className="warda-perfume-card warda-set-card"
                onClick={() => navigate(productUrl)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && navigate(productUrl)}
              >
                <div className="warda-perfume-card__media">
                  <span className="warda-set-card__badge">
                    <i className="ri-gift-2-fill" />
                    {getSetBadgeLabel(perfume, language)}
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
                        e.currentTarget.hidden = true;
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
                    {isAdded
                      ? language === "ru"
                        ? "ДОБАВЛЕНО ✓"
                        : "ADDED ✓"
                      : language === "ru"
                        ? "В КОРЗИНУ"
                        : "ADD TO CART"}
                  </button>
                </div>
              </OrnateCard>
            );
          })}
        </div>
      )}

      <SensesMotif />
    </div>
  );
}
