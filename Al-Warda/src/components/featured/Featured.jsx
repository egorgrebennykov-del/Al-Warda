import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { getPerfumes, getCategories, getPerfumeUrl } from "../../../utils/perfumes";
import { addToCart } from "../../../utils/cart";
import { useLanguage } from "../../context/languageContext";
import { OrnateCard } from "../common/OrnateCard";
import "./Featured.css";
import "../common/ProductCardImages.css";

const POPULAR_ARABIAN_BRANDS = [
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

const GENDER_OPTIONS = [
  { id: "Women", nameRu: "Женский", nameEn: "Women" },
  { id: "Men", nameRu: "Мужской", nameEn: "Men" },
  { id: "Unisex", nameRu: "Унисекс", nameEn: "Unisex" },
];

const POPULAR_NOTES = [
  { id: "bergamot", nameRu: "Бергамот", nameEn: "Bergamot" },
  { id: "vanilla", nameRu: "Ваниль", nameEn: "Vanilla" },
  { id: "rose", nameRu: "Роза", nameEn: "Rose" },
  { id: "oud", nameRu: "Уд", nameEn: "Oud" },
  { id: "amber", nameRu: "Амбра", nameEn: "Amber" },
  { id: "musk", nameRu: "Мускус", nameEn: "Musk" },
  { id: "saffron", nameRu: "Шафран", nameEn: "Saffron" },
  { id: "lavender", nameRu: "Лаванда", nameEn: "Lavender" },
  { id: "caramel", nameRu: "Карамель", nameEn: "Caramel" },
  { id: "sandalwood", nameRu: "Сандал", nameEn: "Sandalwood" },
  { id: "sea-breeze", nameRu: "Морской бриз", nameEn: "Sea Breeze" },
  { id: "cardamom", nameRu: "Кардамон", nameEn: "Cardamom" },
  { id: "mint", nameRu: "Мята", nameEn: "Mint" },
  { id: "oakmoss", nameRu: "Дубовый мох", nameEn: "Oakmoss" },
];

// Always 4 items per row -> page size multiple of 4 (e.g. 24 = 6 full rows)
const PAGE_SIZE = 24;

export default function Featured() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Multi-select state synced with URL searchParams
  const [selectedCategories, setSelectedCategories] = useState(() => {
    const raw = searchParams.get("category");
    return raw && raw !== "all"
      ? raw.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean)
      : [];
  });
  const [selectedBrands, setSelectedBrands] = useState(() => {
    const raw = searchParams.get("brand");
    return raw
      ? raw.split(",").map((b) => b.trim()).filter(Boolean)
      : [];
  });
  const [selectedGenders, setSelectedGenders] = useState(() => {
    const raw = searchParams.get("gender");
    return raw
      ? raw.split(",").map((g) => g.trim()).filter(Boolean)
      : [];
  });
  const [selectedNotes, setSelectedNotes] = useState(() => {
    const raw = searchParams.get("notes") || searchParams.get("note");
    return raw
      ? raw.split(",").map((n) => n.trim().toLowerCase()).filter(Boolean)
      : [];
  });

  // Sync state back to URL query parameters
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCategories.length > 0) params.set("category", selectedCategories.join(","));
    if (selectedBrands.length > 0) params.set("brand", selectedBrands.join(","));
    if (selectedGenders.length > 0) params.set("gender", selectedGenders.join(","));
    if (selectedNotes.length > 0) params.set("notes", selectedNotes.join(","));
    setSearchParams(params, { replace: true });
  }, [selectedCategories, selectedBrands, selectedGenders, selectedNotes, setSearchParams]);

  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

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

  // Multi-toggle helpers
  const toggleCategory = (catId) => {
    setVisibleLimit(PAGE_SIZE);
    setSelectedCategories((prev) => {
      const lower = catId.toLowerCase();
      if (prev.includes(lower)) {
        return prev.filter((c) => c !== lower);
      }
      return [...prev, lower];
    });
  };

  const toggleBrand = (brand) => {
    setVisibleLimit(PAGE_SIZE);
    setSelectedBrands((prev) => {
      if (prev.includes(brand)) {
        return prev.filter((b) => b !== brand);
      }
      return [...prev, brand];
    });
  };

  const toggleGender = (genderId) => {
    setVisibleLimit(PAGE_SIZE);
    setSelectedGenders((prev) => {
      if (prev.includes(genderId)) {
        return prev.filter((g) => g !== genderId);
      }
      return [...prev, genderId];
    });
  };

  const toggleNote = (noteId) => {
    setVisibleLimit(PAGE_SIZE);
    setSelectedNotes((prev) => {
      if (prev.includes(noteId)) {
        return prev.filter((n) => n !== noteId);
      }
      return [...prev, noteId];
    });
  };

  const resetAllFilters = () => {
    setSelectedCategories([]);
    setSelectedBrands([]);
    setSelectedGenders([]);
    setSelectedNotes([]);
    setVisibleLimit(PAGE_SIZE);
    setSearchParams({});
  };

  // Active filter count
  const totalActiveFilters =
    selectedCategories.length +
    selectedBrands.length +
    selectedGenders.length +
    selectedNotes.length;

  // Deterministic shuffled collection for default assortment (вразброс)
  const shuffledPerfumes = useMemo(() => {
    if (!perfumes || perfumes.length === 0) return [];
    const arr = [...perfumes];
    let seed = 42;
    for (let i = arr.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [perfumes]);

  // Filtered perfumes calculation
  const filteredPerfumes = useMemo(() => {
    if (totalActiveFilters === 0) {
      return shuffledPerfumes;
    }

    return perfumes.filter((p) => {
      // 1. Categories filter (OR within categories)
      if (selectedCategories.length > 0) {
        const pCat = (p.category || "").toLowerCase();
        const pInfoCat = (p.info?.category || p.categoryName || "").toLowerCase();
        const matchesAnyCat = selectedCategories.some((catKey) => {
          if (catKey === "fresh" || catKey === "aquatic") {
            return pCat === "fresh" || pCat === "aquatic" || pInfoCat.includes("свеж") || pInfoCat.includes("акват");
          }
          if (catKey === "fougere" || catKey === "woody-fougere") {
            return pCat === "fougere" || pCat === "woody-fougere" || pInfoCat.includes("фужер");
          }
          if (catKey === "citrus" || catKey === "citrus-fresh") {
            return pCat === "citrus" || pCat === "citrus-fresh" || pInfoCat.includes("цитрус");
          }
          if (catKey === "spicy" || catKey === "spices") {
            return pCat === "spicy" || pCat === "spices" || pInfoCat.includes("прян") || pInfoCat.includes("специ");
          }
          if (catKey === "gourmand") {
            return pCat === "gourmand" || pInfoCat.includes("гурман");
          }
          if (catKey === "floral") {
            return pCat === "floral" || pInfoCat.includes("цвет");
          }
          if (catKey === "oud" || catKey === "wood") {
            return pCat === "oud" || pCat === "wood" || pInfoCat.includes("уд") || pInfoCat.includes("древ");
          }
          return pCat === catKey || pCat.replace(/[^a-z0-9]/g, "") === catKey.replace(/[^a-z0-9]/g, "");
        });
        if (!matchesAnyCat) return false;
      }

      // 2. Brands filter (OR within brands)
      if (selectedBrands.length > 0) {
        const pBrand = (p.brand || "").toLowerCase();
        const pName = (p.name || "").toLowerCase();
        const matchesBrand = selectedBrands.some((b) => {
          const bLower = b.toLowerCase();
          return pBrand.includes(bLower) || pName.includes(bLower);
        });
        if (!matchesBrand) return false;
      }

      // 3. Gender filter (OR within gender)
      if (selectedGenders.length > 0) {
        const pGender = (p.gender || p.info?.gender || "").toLowerCase();
        const matchesGender = selectedGenders.some((g) => {
          if (g === "Women") return pGender.includes("жен") || pGender.includes("women");
          if (g === "Men") return (pGender.includes("муж") || pGender.includes("men")) && !pGender.includes("women");
          return pGender.includes("уни") || pGender.includes("uni");
        });
        if (!matchesGender) return false;
      }

      // 4. Notes filter (check top, heart, base notes)
      if (selectedNotes.length > 0) {
        const allNotesText = [
          ...(p.topNotes || []),
          ...(p.heartNotes || []),
          ...(p.baseNotes || []),
          p.notesSummary || "",
          p.description || "",
        ]
          .join(" ")
          .toLowerCase();

        const matchesNotes = selectedNotes.every((noteKey) => {
          const noteObj = POPULAR_NOTES.find((n) => n.id === noteKey);
          if (!noteObj) return true;
          return (
            allNotesText.includes(noteObj.nameRu.toLowerCase()) ||
            allNotesText.includes(noteObj.nameEn.toLowerCase())
          );
        });
        if (!matchesNotes) return false;
      }

      return true;
    });
  }, [perfumes, shuffledPerfumes, totalActiveFilters, selectedCategories, selectedBrands, selectedGenders, selectedNotes]);

  const visiblePerfumes = filteredPerfumes.slice(0, visibleLimit);
  const remainingCount = Math.max(0, filteredPerfumes.length - visibleLimit);
  const progressPercent = filteredPerfumes.length > 0
    ? Math.min(100, Math.round((visiblePerfumes.length / filteredPerfumes.length) * 100))
    : 0;

  const loadMoreItems = useCallback(() => {
    if (isLoadingMore || visibleLimit >= filteredPerfumes.length) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleLimit((prev) => Math.min(prev + PAGE_SIZE, filteredPerfumes.length));
      setIsLoadingMore(false);
    }, 200);
  }, [isLoadingMore, visibleLimit, filteredPerfumes.length]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && visibleLimit < filteredPerfumes.length) {
          loadMoreItems();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isLoadingMore, visibleLimit, filteredPerfumes.length, loadMoreItems]);

  const handleAddToCart = (perfume, e) => {
    e.stopPropagation();
    addToCart(perfume, 1);
    setAddedIds((prev) => ({ ...prev, [perfume.id]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [perfume.id]: false }));
    }, 1800);
  };

  return (
    <div className="container warda-shop-page">
      <div className="warda-shop-header">
        <h1 className="warda-shop-title">
          {language === "ru" ? "Коллекция Арабских Духов" : "Arabian Perfumes Collection"}
        </h1>
        <p className="warda-shop-subtitle">
          {language === "ru"
            ? "Аутентичные масляные и восточные ароматы из ОАЭ, Омана и Саудовской Аравии. Прямые поставки от сертифицированных производителей."
            : "Authentic luxury Eau de Parfum and precious attars from UAE, Oman, and Saudi Arabia. Direct supply from certified perfume houses."}
        </p>

        {/* MULTI-FILTER TOOLBAR */}
        <div className="warda-filter-toolbar">
          <div className="warda-filter-bar-top">
            <div className="warda-filter-bar-left">
              <button
                type="button"
                className="warda-toggle-filters-btn"
                onClick={() => setIsFilterPanelOpen((prev) => !prev)}
                aria-expanded={isFilterPanelOpen}
              >
                <span>⚙ {language === "ru" ? "Фильтры ароматов" : "Fragrance Filters"}</span>
                {totalActiveFilters > 0 && (
                  <span className="warda-filter-count-badge">{totalActiveFilters}</span>
                )}
                <span>{isFilterPanelOpen ? "▲" : "▼"}</span>
              </button>

              {totalActiveFilters > 0 && (
                <button
                  type="button"
                  className="warda-reset-filters-btn"
                  onClick={resetAllFilters}
                >
                  ✕ {language === "ru" ? "Сбросить все" : "Clear all"}
                </button>
              )}
            </div>

            <div className="warda-filter-summary-text">
              {language === "ru"
                ? `Найдено: ${filteredPerfumes.length} ароматов`
                : `Found: ${filteredPerfumes.length} fragrances`}
            </div>
          </div>

          {/* ACTIVE FILTER CHIPS ROW */}
          {totalActiveFilters > 0 && (
            <div className="warda-active-chips">
              {selectedCategories.map((c) => {
                const catObj = categories.find((cat) => cat.id === c || cat.slug === c);
                const name = catObj ? (language === "ru" ? (catObj.nameRu || catObj.name) : (catObj.nameEn || catObj.name)) : c;
                return (
                  <span key={`chip-cat-${c}`} className="warda-chip">
                    {name}
                    <button type="button" className="warda-chip-remove" onClick={() => toggleCategory(c)}>×</button>
                  </span>
                );
              })}

              {selectedBrands.map((b) => (
                <span key={`chip-b-${b}`} className="warda-chip">
                  {b}
                  <button type="button" className="warda-chip-remove" onClick={() => toggleBrand(b)}>×</button>
                </span>
              ))}

              {selectedGenders.map((g) => {
                const gObj = GENDER_OPTIONS.find((opt) => opt.id === g);
                const gName = gObj ? (language === "ru" ? gObj.nameRu : gObj.nameEn) : g;
                return (
                  <span key={`chip-g-${g}`} className="warda-chip">
                    {gName}
                    <button type="button" className="warda-chip-remove" onClick={() => toggleGender(g)}>×</button>
                  </span>
                );
              })}

              {selectedNotes.map((n) => {
                const nObj = POPULAR_NOTES.find((opt) => opt.id === n);
                const nName = nObj ? (language === "ru" ? nObj.nameRu : nObj.nameEn) : n;
                return (
                  <span key={`chip-n-${n}`} className="warda-chip">
                    {nName}
                    <button type="button" className="warda-chip-remove" onClick={() => toggleNote(n)}>×</button>
                  </span>
                );
              })}
            </div>
          )}

          {/* EXPANDABLE MULTI-SELECT PANEL */}
          {isFilterPanelOpen && (
            <div className="warda-filters-expanded">
              {/* Category section */}
              <div>
                <div className="warda-filter-section-title">
                  🏷️ {language === "ru" ? "Категория аромата (можно несколько):" : "Fragrance Category (multi-select):"}
                </div>
                <div className="warda-pills-wrap">
                  {categories.map((cat) => {
                    const isActive = selectedCategories.includes(cat.id.toLowerCase()) || selectedCategories.includes((cat.slug || "").toLowerCase());
                    const catName = language === "ru" ? (cat.nameRu || cat.name) : (cat.nameEn || cat.name);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className={`warda-filter-pill ${isActive ? "active" : ""}`}
                        onClick={() => toggleCategory(cat.slug || cat.id)}
                      >
                        {isActive && "✓ "}
                        {catName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Gender section */}
              <div>
                <div className="warda-filter-section-title">
                  👥 {language === "ru" ? "Пол (можно несколько):" : "Gender (multi-select):"}
                </div>
                <div className="warda-pills-wrap">
                  {GENDER_OPTIONS.map((g) => {
                    const isActive = selectedGenders.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        className={`warda-filter-pill ${isActive ? "active" : ""}`}
                        onClick={() => toggleGender(g.id)}
                      >
                        {isActive && "✓ "}
                        {language === "ru" ? g.nameRu : g.nameEn}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Brands section */}
              <div>
                <div className="warda-filter-section-title">
                  💎 {language === "ru" ? "Арабские бренды (можно несколько):" : "Arabian Brands (multi-select):"}
                </div>
                <div className="warda-pills-wrap">
                  {POPULAR_ARABIAN_BRANDS.map((brand) => {
                    const isActive = selectedBrands.includes(brand);
                    return (
                      <button
                        key={brand}
                        type="button"
                        className={`warda-filter-pill ${isActive ? "active" : ""}`}
                        onClick={() => toggleBrand(brand)}
                      >
                        {isActive && "✓ "}
                        {brand}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes section */}
              <div>
                <div className="warda-filter-section-title">
                  🌿 {language === "ru" ? "Ноты композиции (верхние, сердце, база):" : "Olfactory Notes (top, heart, base):"}
                </div>
                <div className="warda-pills-wrap">
                  {POPULAR_NOTES.map((note) => {
                    const isActive = selectedNotes.includes(note.id);
                    return (
                      <button
                        key={note.id}
                        type="button"
                        className={`warda-filter-pill ${isActive ? "active" : ""}`}
                        onClick={() => toggleNote(note.id)}
                      >
                        {isActive && "✓ "}
                        {language === "ru" ? note.nameRu : note.nameEn}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="warda-shop-loader">
          <div className="app-route-loader__spinner" />
          <p>{language === "ru" ? "Загрузка коллекции..." : "Loading collection..."}</p>
        </div>
      ) : filteredPerfumes.length === 0 ? (
        <div className="warda-shop-empty">
          <p>{language === "ru" ? "По выбранным фильтрам духи не найдены" : "No fragrances found matching selected filters"}</p>
          <button type="button" className="warda-load-more-btn" onClick={resetAllFilters} style={{ marginTop: "1.5rem" }}>
            {language === "ru" ? "Сбросить фильтры" : "Reset filters"}
          </button>
        </div>
      ) : (
        <>
                    {/* CATALOG COUNT (LINE & PERCENT REMOVED) */}
          <div className="warda-catalog-progress-bar">
            <div className="warda-progress-meta">
              <span className="warda-catalog-count-text">
                {language === "ru"
                  ? `Показано ${visiblePerfumes.length} из ${filteredPerfumes.length} ароматов`
                  : `Displaying ${visiblePerfumes.length} of ${filteredPerfumes.length} fragrances`}
              </span>
            </div>
          </div>

          {/* PERFUME GRID - ALWAYS 4 ITEMS PER ROW ON DESKTOP */}
          <div className="warda-shop-grid">
            {visiblePerfumes.map((perfume) => {
              const isAdded = Boolean(addedIds[perfume.id]);
              const productUrl = getPerfumeUrl(perfume);
              return (
                <OrnateCard
                  key={perfume.id}
                  className="warda-perfume-card"
                  onClick={() => navigate(productUrl)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && navigate(productUrl)}
                >
                  <div className="warda-perfume-card__media">
                    <span className="warda-perfume-card__aura" />
                    <span className="warda-perfume-card__sheen" />
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

          {/* CONTINUATION INDICATOR / LOAD MORE / SKELETON */}
          <div ref={sentinelRef} className="warda-continuation-wrap">
            {remainingCount > 0 ? (
              <>
                <button
                  type="button"
                  className="warda-load-more-btn"
                  onClick={loadMoreItems}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore
                    ? (language === "ru" ? "Загружаем следующие ароматы..." : "Loading fragrances...")
                    : (language === "ru"
                        ? `✦ Показать следующие ${Math.min(PAGE_SIZE, remainingCount)} из ${remainingCount} ✦`
                        : `✦ Load next ${Math.min(PAGE_SIZE, remainingCount)} of ${remainingCount} ✦`)}
                </button>
                <p style={{ color: "#a89882", fontSize: "0.85rem" }}>
                  {language === "ru"
                    ? `Прокрутите страницу вниз или нажмите кнопку, чтобы открыть еще ${remainingCount} ароматов коллекции`
                    : `Scroll down or tap to reveal ${remainingCount} more exquisite fragrances`}
                </p>
              </>
            ) : (
              <div className="warda-catalog-ended">
                ✦ {language === "ru" ? `Вы просмотрели всю коллекцию из ${filteredPerfumes.length} ароматов` : `You have viewed all ${filteredPerfumes.length} collection fragrances`} ✦
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
