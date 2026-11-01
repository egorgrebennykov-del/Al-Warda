import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { getPerfumes, getCategories } from "../../../utils/perfumes";
import { addToCart } from "../../../utils/cart";
import { useLanguage } from "../../context/languageContext";
import { OrnateCard } from "../common/OrnateCard";
import "./Featured.css";

const POPULAR_ARABIAN_BRANDS = [
  "All",
  "Lattafa",
  "Armaf",
  "Al Haramain",
  "Ard Al Zaafaran",
  "Maison Alhambra",
  "Afnan",
  "Ajmal",
  "Al Wataniah",
  "Amouage",
  "Arabian Oud",
  "Asdaaf",
  "Ayat Perfumes",
  "French Avenue",
  "Khadlaj",
  "Rasasi",
  "Swiss Arabian",
  "Zimaya",
  "Riiffs",
  "Gulf Orchid",
  "Rayhaan",
  "Orientica",
  "Al Rehab",
  "Nabeel",
  "Fragrance World",
  "Paris Corner",
];

const PAGE_SIZE = 21;

export default function Featured() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeCategory = searchParams.get("category") || "all";
  const [selectedBrand, setSelectedBrand] = useState("All");
  const [perfumes, setPerfumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories] = useState(() => getCategories());
  const [addedIds, setAddedIds] = useState({});

  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPerfumes()
      .then((items) => {
        if (!cancelled) {
          setPerfumes(items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCategoryChange = (catId) => {
    setVisibleLimit(PAGE_SIZE);
    if (catId === "all") {
      setSearchParams({});
    } else {
      setSearchParams({ category: catId });
    }
  };

  const handleBrandChange = (brandName) => {
    setSelectedBrand(brandName);
    setVisibleLimit(PAGE_SIZE);
  };

  const filteredPerfumes = perfumes.filter((p) => {
    if (activeCategory !== "all") {
      const catLower = activeCategory.toLowerCase();
      const pCat = (p.category || "").toLowerCase();
      const pInfoCat = (p.info?.category || p.categoryName || "").toLowerCase();

      const isFresh =
        (catLower === "fresh" || catLower === "aquatic") &&
        (pCat === "fresh" || pCat === "aquatic" || pInfoCat.includes("свеж") || pInfoCat.includes("акват"));

      const isFougere =
        (catLower === "fougere" || catLower === "fougère" || catLower === "woody-fougere") &&
        (pCat === "fougere" || pCat === "woody-fougere" || pInfoCat.includes("фужер"));

      const isCitrus =
        (catLower === "citrus" || catLower === "citrus-fresh") &&
        (pCat === "citrus" || pCat === "citrus-fresh" || pInfoCat.includes("цитрус"));

      const isSpicy =
        (catLower === "spicy" || catLower === "spices") &&
        (pCat === "spicy" || pCat === "spices" || pInfoCat.includes("прян") || pInfoCat.includes("специ"));

      const isGourmand =
        catLower === "gourmand" &&
        (pCat === "gourmand" || pInfoCat.includes("гурман"));

      const isFloral =
        catLower === "floral" &&
        (pCat === "floral" || pInfoCat.includes("цвет"));

      const isOud =
        (catLower === "oud" || catLower === "wood") &&
        (pCat === "oud" || pCat === "wood" || pInfoCat.includes("уд") || pInfoCat.includes("древ"));

      const directMatch =
        pCat === catLower ||
        pCat.replace(/[^a-z0-9]/g, "") === catLower.replace(/[^a-z0-9]/g, "");

      const matchesCat =
        directMatch || isFresh || isFougere || isCitrus || isSpicy || isGourmand || isFloral || isOud;

      if (!matchesCat) return false;
    }

    if (selectedBrand !== "All") {
      const bLower = selectedBrand.toLowerCase();
      const pBrand = (p.brand || "").toLowerCase();
      const pName = (p.name || "").toLowerCase();
      if (!pBrand.includes(bLower) && !pName.includes(bLower)) {
        return false;
      }
    }

    return true;
  });

  const visiblePerfumes = filteredPerfumes.slice(0, visibleLimit);

  const loadMoreItems = useCallback(() => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleLimit((prev) => Math.min(prev + PAGE_SIZE, filteredPerfumes.length));
      setIsLoadingMore(false);
    }, 450);
  }, [isLoadingMore, filteredPerfumes.length]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && visibleLimit < filteredPerfumes.length) {
          loadMoreItems();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isLoadingMore, visibleLimit, filteredPerfumes.length, loadMoreItems]);

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

  return (
    <div className="warda-shop-page container">
      <div className="warda-shop-header">
        <h1 className="warda-shop-title">
          {language === "ru" ? "Коллекция Ароматов" : "Fragrance Collection"}
        </h1>
        <p className="warda-shop-subtitle">
          {language === "ru"
            ? "Эксклюзивная коллекция восточной парфюмерии: более 900 оригинальных ароматов от ведущих брендов ОАЭ."
            : "Exclusive oriental perfume collection: over 900 authentic fragrances from leading UAE perfume houses."}
        </p>

        {/* CATEGORY TABS */}
        <div className="warda-shop-tabs">
          <button
            type="button"
            className={`warda-tab-btn ${activeCategory === "all" ? "warda-tab-btn--active" : ""}`}
            onClick={() => handleCategoryChange("all")}
          >
            {language === "ru" ? "ВСЕ АРОМАТЫ" : "ALL FRAGRANCES"}
          </button>
          {categories.map((cat) => {
            const catName = language === "ru" ? (cat.nameRu || cat.name) : (cat.nameEn || cat.name);
            return (
              <button
                key={cat.id}
                type="button"
                className={`warda-tab-btn ${activeCategory === cat.id || activeCategory === cat.slug ? "warda-tab-btn--active" : ""}`}
                onClick={() => handleCategoryChange(cat.slug || cat.id)}
              >
                {catName}
              </button>
            );
          })}
        </div>

        {/* BRAND PILLS */}
        <div className="warda-brands-bar">
          <div className="warda-brands-scroll">
            {POPULAR_ARABIAN_BRANDS.map((brand) => (
              <button
                key={brand}
                type="button"
                className={`warda-filter-pill ${selectedBrand === brand ? "active" : ""}`}
                onClick={() => handleBrandChange(brand)}
              >
                {brand === "All" ? (language === "ru" ? "Все бренды" : "All Brands") : brand}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="warda-shop-loader">
          <div className="app-route-loader__spinner" />
          <p>{language === "ru" ? "Загрузка коллекции..." : "Loading collection..."}</p>
        </div>
      ) : filteredPerfumes.length === 0 ? (
        <div className="warda-shop-empty">
          <p>{language === "ru" ? "В этой категории нет духов" : "No fragrances found in this category"}</p>
        </div>
      ) : (
        <>
          <div className="warda-shop-grid">
            {visiblePerfumes.map((perfume) => {
              const isAdded = Boolean(addedIds[perfume.id]);
              return (
                <OrnateCard
                  key={perfume.id}
                  className="warda-perfume-card"
                  onClick={() => navigate(`/book/${perfume.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/book/${perfume.id}`)}
                >
                  <div className="warda-perfume-card__media">
                    <span className="warda-perfume-card__aura" />
                    <span className="warda-perfume-card__sheen" />
                    <img
                      src={perfume.image}
                      alt={perfume.name}
                      className="warda-perfume-card__img"
                      loading="lazy" decoding="async"
                    />
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
                        ? (language === "ru" ? "ДОБАВЛЕНО ✓" : "ADDED ✓")
                        : (language === "ru" ? "В КОРЗИНУ" : "ADD TO CART")}
                    </button>
                  </div>
                </OrnateCard>
              );
            })}
          </div>

          {/* INFINITE SCROLL SENTINEL & ANIMATION */}
          <div ref={sentinelRef} className="warda-sentinel" style={{ minHeight: "40px", marginTop: "2rem" }}>
            {isLoadingMore && (
              <div className="warda-shop-loader" style={{ padding: "1.5rem 0" }}>
                <div className="app-route-loader__spinner" style={{ width: "2rem", height: "2rem" }} />
                <p style={{ fontSize: "0.85rem", color: "#d4af37" }}>
                  {language === "ru" ? "Загрузка следующих духов..." : "Loading more fragrances..."}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
