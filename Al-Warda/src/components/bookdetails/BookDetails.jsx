import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router";
import { getPerfumeById, getPerfumes, ensurePerfumeEnrichment, getHarmoniousNotes } from "../../../utils/perfumes";
import { addToCart } from "../../../utils/cart";
import { useLanguage } from "../../context/languageContext";
import { OrnateCard, CornerBracket } from "../common/OrnateCard";
import "./BookDetails.css";

export default function BookDetails() {
  const { bookId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const idFromQuery = searchParams.get("url") || searchParams.get("q") || searchParams.get("id");
  const targetId = bookId || idFromQuery || "raghba";

  const [perfume, setPerfume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [viewMode, setViewMode] = useState("flacon"); // 'flacon' | 'studio'
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxScale, setLightboxScale] = useState(1.5);
  const [isHoverZooming, setIsHoverZooming] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsLightboxOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen]);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setMousePos({ x, y });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getPerfumeById(targetId)
      .then((p) => {
        if (!cancelled) {
          if (p) {
            setPerfume(p);
          } else {
            // fallback to first perfume
            getPerfumes().then((all) => {
              if (!cancelled && all.length > 0) setPerfume(all[0]);
            });
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [targetId]);

  const handleAddToCart = async () => {
    if (!perfume) return;
    try {
      for (let i = 0; i < quantity; i++) {
        await addToCart(perfume);
      }
      setIsAdded(true);
      setTimeout(() => setIsAdded(false), 2200);
    } catch (err) {
      console.warn("Add to cart error:", err);
    }
  };

  if (loading) {
    return (
      <div className="warda-details-loader">
        <div className="app-route-loader__spinner" />
        <p>{language === "ru" ? "Загрузка парфюма..." : "Loading fragrance..."}</p>
      </div>
    );
  }

  if (!perfume) {
    return (
      <div className="container warda-details-empty">
        <h2>{language === "ru" ? "Парфюм не найден" : "Fragrance not found"}</h2>
        <Link to="/featured" className="warda-btn">
          {language === "ru" ? "В каталог" : "To Collection"}
        </Link>
      </div>
    );
  }

  const enrichedPerfume = perfume ? ensurePerfumeEnrichment(perfume) : null;
  const isRu = language === "ru";
  const notesFallback = enrichedPerfume ? getHarmoniousNotes(enrichedPerfume) : null;

  const topNotes = (isRu
    ? (enrichedPerfume?.topNotesRu?.length ? enrichedPerfume.topNotesRu : enrichedPerfume?.topNotes)
    : (enrichedPerfume?.topNotesEn?.length ? enrichedPerfume.topNotesEn : enrichedPerfume?.topNotes)) || (isRu ? notesFallback?.ru?.top : notesFallback?.en?.top) || [];

  const heartNotes = (isRu
    ? (enrichedPerfume?.heartNotesRu?.length ? enrichedPerfume.heartNotesRu : enrichedPerfume?.heartNotes)
    : (enrichedPerfume?.heartNotesEn?.length ? enrichedPerfume.heartNotesEn : enrichedPerfume?.heartNotes)) || (isRu ? notesFallback?.ru?.heart : notesFallback?.en?.heart) || [];

  const baseNotes = (isRu
    ? (enrichedPerfume?.baseNotesRu?.length ? enrichedPerfume.baseNotesRu : enrichedPerfume?.baseNotes)
    : (enrichedPerfume?.baseNotesEn?.length ? enrichedPerfume.baseNotesEn : enrichedPerfume?.baseNotes)) || (isRu ? notesFallback?.ru?.base : notesFallback?.en?.base) || [];

  let displayDesc = isRu
    ? (enrichedPerfume?.descriptionRu || enrichedPerfume?.description)
    : (enrichedPerfume?.descriptionEn || enrichedPerfume?.description);

  if (!displayDesc || displayDesc.includes("Сертифицированная оригинальная") || displayDesc.length < 25) {
    displayDesc = isRu
      ? (enrichedPerfume?.name + " от легендарного дома " + enrichedPerfume?.brand + " — утонченное воплощение арабской парфюмерной традиции. Аромат раскрывается нотами " + topNotes.join(", ") + ", переходя в сердце из " + heartNotes.join(", ") + ", и оставляет благородный стойкий шлейф: " + baseNotes.join(", ") + ".")
      : (enrichedPerfume?.name + " by " + enrichedPerfume?.brand + " is an authentic luxury Arabian fragrance. Opening with notes of " + topNotes.join(", ") + ", unfolding into an alluring heart of " + heartNotes.join(", ") + ", enveloped in an opulent base of " + baseNotes.join(", ") + ".");
  }

  const currentImage =
    viewMode === "studio" && perfume?.rawImage ? perfume.rawImage : perfume?.image;
  const hasStudioPhoto = Boolean(
    perfume?.rawImage && perfume?.rawImage !== perfume?.image
  );

  return (
    <div className="warda-details-page">
      <div className="container">
        <div className="warda-details-top-nav">
          <button
            type="button"
            className="warda-back-button"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate("/featured");
              }
            }}
            aria-label="Back"
          >
            <span className="warda-back-arrow">←</span>
            <span>{language === "ru" ? "Назад в каталог" : "Back to catalog"}</span>
          </button>

          <div className="warda-details-breadcrumb">
            <Link to="/">{language === "ru" ? "Главная" : "Home"}</Link>
            <span className="warda-breadcrumb-sep">/</span>
            <Link to="/featured">{language === "ru" ? "Коллекция" : "Collection"}</Link>
            <span className="warda-breadcrumb-sep">/</span>
            <span className="warda-breadcrumb-current">{perfume.name}</span>
          </div>
        </div>

        <div className="warda-details-grid">
          {/* MEDIA COLUMN */}
          <div className="warda-details-media">
            <OrnateCard className="warda-details-card">
              <div
                className={`warda-details-img-wrap ${isHoverZooming ? "warda-details-img-wrap--zooming" : ""}`}
                onMouseEnter={() => setIsHoverZooming(true)}
                onMouseLeave={() => setIsHoverZooming(false)}
                onMouseMove={handleMouseMove}
                onClick={() => setIsLightboxOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setIsLightboxOpen(true)}
                aria-label="Inspect perfume flacon details"
                title={language === "ru" ? "Нажмите для детального осмотра флакона (Zoom)" : "Click to inspect bottle details (Zoom)"}
              >
                <div className="warda-details-aura" />
                <span className="warda-details-zoom-pill">
                  <i className="ri-zoom-in-line" />
                  <span>{language === "ru" ? "Детальный зум" : "Inspect Zoom"}</span>
                </span>
                <img
                  src={currentImage}
                  alt={perfume.name}
                  className={`warda-details-img ${viewMode === "studio" ? "warda-details-img--studio" : ""}`}
                  style={{
                    transformOrigin: isHoverZooming ? `${mousePos.x}% ${mousePos.y}%` : "center center",
                    transform: isHoverZooming ? "scale(2.25) translateZ(0)" : "scale(1) translateZ(0)",
                  }}
                  onError={(e) => {
                    if (perfume.rawImage && e.target.src !== perfume.rawImage) {
                      e.target.src = perfume.rawImage;
                    }
                  }}
                />
              </div>

              {hasStudioPhoto && (
                <div className="warda-details-view-switch">
                  <button
                    type="button"
                    className={`warda-switch-btn ${viewMode === "flacon" ? "active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewMode("flacon");
                    }}
                  >
                    ✨ {language === "ru" ? "3D Флакон" : "3D Flacon"}
                  </button>
                  <button
                    type="button"
                    className={`warda-switch-btn ${viewMode === "studio" ? "active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewMode("studio");
                    }}
                  >
                    📸 {language === "ru" ? "Студийный пакшот" : "Studio Packshot"}
                  </button>
                </div>
              )}
            </OrnateCard>
          </div>

          {/* INFO COLUMN */}
          <div className="warda-details-info">
            <div className="warda-details-tag">
              <span className="warda-tag-category">
                {language === "ru" ? (perfume.categoryRu || perfume.categoryName || perfume.category?.toUpperCase()) : (perfume.categoryEn || perfume.category?.toUpperCase())}
              </span>
              <span className="warda-tag-badge">{perfume.concentration}</span>
            </div>

            <h1 className="warda-details-title">{perfume.name}</h1>
            <p className="warda-details-subtitle">{perfume.brand}</p>

            <div className="warda-details-rating">
              <div className="warda-stars">★★★★★</div>
              <span className="warda-rating-num">{perfume.rating} / 5.0</span>
              <span className="warda-reviews-count">({perfume.reviewsCount} {language === "ru" ? "отзывов" : "reviews"})</span>
            </div>

            <div className="warda-details-price-row">
              <span className="warda-details-price">€{Number(perfume.price).toFixed(2)}</span>
              <span className="warda-stock-status">
                {perfume.inStock !== false
                  ? (language === "ru" ? "✓ В наличии на складе (доставка 3–5 дней)" : "✓ In Stock • Express Delivery (3–5 days)")
                  : (language === "ru" ? "Под заказ" : "Pre-order")}
              </span>
            </div>

            <p className="warda-details-desc">
              {displayDesc}
            </p>

            {/* OLFACTORY PYRAMID */}
            <div className="warda-pyramid">
              <h3 className="warda-pyramid-title">
                {language === "ru" ? "Ольфакторная пирамида" : "Olfactory Pyramid"}
              </h3>
              <div className="warda-pyramid-grid">
                <div className="warda-pyramid-step">
                  <span className="warda-step-name">{language === "ru" ? "Верхние ноты:" : "Top Notes:"}</span>
                  <div className="warda-notes-tags">
                    {topNotes.map((n) => (
                      <span key={n} className="warda-note-tag">{n}</span>
                    ))}
                  </div>
                </div>

                <div className="warda-pyramid-step">
                  <span className="warda-step-name">{language === "ru" ? "Ноты сердца:" : "Heart Notes:"}</span>
                  <div className="warda-notes-tags">
                    {heartNotes.map((n) => (
                      <span key={n} className="warda-note-tag">{n}</span>
                    ))}
                  </div>
                </div>

                <div className="warda-pyramid-step">
                  <span className="warda-step-name">{language === "ru" ? "Базовые ноты:" : "Base Notes:"}</span>
                  <div className="warda-notes-tags">
                    {baseNotes.map((n) => (
                      <span key={n} className="warda-note-tag">{n}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* SPECS ROW */}
            <div className="warda-specs-row">
              <div className="warda-spec-item">
                <span className="warda-spec-lbl">{language === "ru" ? "Объем:" : "Volume:"}</span>
                <span className="warda-spec-val">{perfume.volume}</span>
              </div>
              <div className="warda-spec-item">
                <span className="warda-spec-lbl">{language === "ru" ? "Пол:" : "Gender:"}</span>
                <span className="warda-spec-val">{language === "ru" ? (perfume.genderRu || perfume.gender) : (perfume.genderEn || perfume.gender)}</span>
              </div>
              <div className="warda-spec-item">
                <span className="warda-spec-lbl">{language === "ru" ? "Стойкость:" : "Longevity:"}</span>
                <span className="warda-spec-val">{language === "ru" ? (perfume.longevityRu || perfume.longevity) : (perfume.longevityEn || perfume.longevity)}</span>
              </div>
            </div>

            {/* ACTION ROW */}
            <div className="warda-details-actions">
              <div className="warda-qty-selector">
                <button
                  type="button"
                  className="warda-qty-btn"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                >
                  -
                </button>
                <span className="warda-qty-val">{quantity}</span>
                <button
                  type="button"
                  className="warda-qty-btn"
                  onClick={() => setQuantity((q) => q + 1)}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className={`warda-btn warda-btn--add-details ${isAdded ? "warda-btn--added" : ""}`}
                onClick={handleAddToCart}
              >
                {isAdded ? (language === "ru" ? "ДОБАВЛЕНО В КОРЗИНУ ✓" : "ADDED TO BAG ✓") : (language === "ru" ? "ДОБАВИТЬ В КОРЗИНУ" : "ADD TO CART")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FULLSCREEN LIGHTBOX / HIGH-RES INSPECTION MODAL */}
      {isLightboxOpen && (
        <div
          className="warda-lightbox-backdrop"
          onClick={() => setIsLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="warda-lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header / Controls */}
            <div className="warda-lightbox-header">
              <div className="warda-lightbox-title-box">
                <span className="warda-lightbox-brand">{perfume.brand}</span>
                <h2 className="warda-lightbox-title">{perfume.name}</h2>
              </div>

              <div className="warda-lightbox-controls">
                {hasStudioPhoto && (
                  <div className="warda-lightbox-view-switch">
                    <button
                      type="button"
                      className={`warda-lightbox-switch-btn ${viewMode === "flacon" ? "active" : ""}`}
                      onClick={() => setViewMode("flacon")}
                    >
                      ✨ {language === "ru" ? "3D Флакон" : "3D Flacon"}
                    </button>
                    <button
                      type="button"
                      className={`warda-lightbox-switch-btn ${viewMode === "studio" ? "active" : ""}`}
                      onClick={() => setViewMode("studio")}
                    >
                      📸 {language === "ru" ? "Пакшот" : "Packshot"}
                    </button>
                  </div>
                )}

                <div className="warda-lightbox-zoom-pills">
                  {[1, 1.5, 2, 2.6, 3.2].map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      className={`warda-lightbox-scale-btn ${lightboxScale === scale ? "active" : ""}`}
                      onClick={() => setLightboxScale(scale)}
                    >
                      {scale}×
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="warda-lightbox-close"
                  onClick={() => setIsLightboxOpen(false)}
                  aria-label="Close inspection modal"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Viewport with Zoomable Image */}
            <div className="warda-lightbox-viewport">
              <div className="warda-lightbox-stage">
                <img
                  src={currentImage}
                  alt={perfume.name}
                  className={`warda-lightbox-img ${viewMode === "studio" ? "warda-lightbox-img--studio" : ""}`}
                  style={{
                    transform: `scale(${lightboxScale})`,
                  }}
                  onError={(e) => {
                    if (perfume.rawImage && e.target.src !== perfume.rawImage) {
                      e.target.src = perfume.rawImage;
                    }
                  }}
                />
              </div>
            </div>

            {/* Footer Hint */}
            <div className="warda-lightbox-footer">
              <span className="warda-lightbox-hint">
                <i className="ri-information-line" />
                {language === "ru"
                  ? "Детальный осмотр надписей, концентрации и флакона • Выберите масштаб или прокрутите • Esc для закрытия"
                  : "Detail inspection of bottle, inscriptions and concentration • Select zoom • Esc to close"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
