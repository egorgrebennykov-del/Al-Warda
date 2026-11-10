import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router";
import {
  getPerfumeById,
  ensurePerfumeEnrichment,
  getHarmoniousNotes,
  isPerfumeSet,
  isDecantablePerfume,
  SAMPLE_VOLUMES,
  getSamplePrice,
  createSampleCartItem,
} from "../../../utils/perfumes";
import { addToCart } from "../../../utils/cart";
import { useCartState } from "../../hooks/useCartState";
import { useLanguage } from "../../context/languageContext";
import { OrnateCard, CornerBracket } from "../common/OrnateCard";
import "../common/ProductCardImages.css";
import "./BookDetails.css";

export default function BookDetails() {
  const { bookId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isRu = language === "ru";
  const { isInCart, toggleCart } = useCartState();

  const idFromQuery = searchParams.get("url") || searchParams.get("q") || searchParams.get("id");
  const targetId = bookId || idFromQuery || "raghba";

  const [perfume, setPerfume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxScale, setLightboxScale] = useState(1.5);
  const [zoomPoint, setZoomPoint] = useState({ x: 50, y: 50 });
  const [selectedVolume, setSelectedVolume] = useState(() => {
    const s = searchParams.get("sample");
    return ["1ml", "2ml", "5ml", "10ml"].includes(s) ? s : "full";
  });

  useEffect(() => {
    const s = searchParams.get("sample");
    if (["1ml", "2ml", "5ml", "10ml"].includes(s)) {
      setSelectedVolume(s);
    } else if (!s) {
      setSelectedVolume("full");
    }
  }, [searchParams]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [targetId]);

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


  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPerfume(null);

    getPerfumeById(targetId)
      .then((p) => {
        if (!cancelled) {
          setPerfume(p);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.warn("Could not load product:", error);
        if (!cancelled) setLoading(false);
      });

    const timer = window.setInterval(() => {
      getPerfumeById(targetId, { refresh: true })
        .then((item) => { if (!cancelled && item) setPerfume(item); })
        .catch((err) => console.warn("Could not refresh product:", err));
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [targetId]);

  const isSet = perfume ? isPerfumeSet(perfume) : false;
  const isDecantable = perfume ? isDecantablePerfume(perfume) : false;
  const hasSampleParam = Boolean(searchParams.get("sample"));
  const allowSamples = !isSet && (isDecantable || hasSampleParam);
  const activeSampleConfig = allowSamples && selectedVolume !== "full"
    ? SAMPLE_VOLUMES.find((v) => v.key === selectedVolume)
    : null;
  const displayPrice = activeSampleConfig
    ? getSamplePrice(perfume?.price, activeSampleConfig.key)
    : Number(perfume?.price || 0);
  const displayVolume = activeSampleConfig
    ? `${isRu ? activeSampleConfig.labelRu : activeSampleConfig.labelEn} (${isRu ? activeSampleConfig.descRu : activeSampleConfig.descEn})`
    : (perfume?.volume || "100 мл");
  const fullBottleVol = (perfume?.volume || "").match(/\d+\s*(?:ml|мл)/i)?.[0]?.replace(/ml/i, isRu ? " мл" : " ml") || (isRu ? "100 мл" : "100 ml");

  const handleSelectVolume = (vol) => {
    setSelectedVolume(vol);
    const newParams = new URLSearchParams(searchParams);
    if (vol === "full") {
      newParams.delete("sample");
    } else {
      newParams.set("sample", vol);
    }
    navigate(`?${newParams.toString()}`, { replace: true, preventScrollReset: true });
  };

  const handleAddToCart = async () => {
    if (!perfume) return;
    try {
      const currentVolKey = activeSampleConfig ? activeSampleConfig.key : null;
      const currentlyInCart = isInCart(perfume, activeSampleConfig ? activeSampleConfig.key : "full");
      await toggleCart(perfume, {
        volKey: currentVolKey,
        isSample: Boolean(activeSampleConfig),
        quantity,
        language,
      });
      if (!currentlyInCart) {
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2200);
      }
    } catch (err) {
      console.warn("Toggle cart error:", err);
    }
  };

  if (loading) {
    return (
      <div className="warda-details-page warda-details-loading" role="status" aria-live="polite">
        <div className="container">
          <span className="warda-details-sr-only">{language === "ru" ? "Загрузка парфюма" : "Loading fragrance"}</span>
          <div className="warda-details-skeleton-nav" />
          <div className="warda-details-grid" aria-hidden="true">
            <div className="warda-details-skeleton-image" />
            <div className="warda-details-skeleton-info">
              <span /><span /><span /><span /><span />
            </div>
          </div>
        </div>
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
            <div className="warda-details-card">
              <div
                className="warda-details-img-wrap"
                onClick={() => setIsLightboxOpen(true)}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setZoomPoint({ x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 });
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setIsLightboxOpen(true);
                  }
                }}
                aria-label="Inspect perfume flacon details"
                title={language === "ru" ? "Нажмите для полноэкранного осмотра флакона" : "Click to view full size bottle"}
              >
                <div className="warda-details-aura" />
                <div className="warda-details-photo">
                  <img
                    src={perfume?.image}
                    alt={perfume.name}
                    className="warda-details-img"
                    style={{ transformOrigin: `${zoomPoint.x}% ${zoomPoint.y}%` }}
                    loading="eager"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.hidden = true;
                    }}
                  />
                </div>
              </div>
            </div>
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
              <span className="warda-details-price">€{displayPrice.toFixed(2)}</span>
              {perfume.inStock === false && <span className="warda-stock-status">{language === "ru" ? "Под заказ" : "Pre-order"}</span>}
            </div>

            {/* FORMAT / VOLUME SELECTOR: INLINE ROW UNDER PRICE (ASCENDING ORDER) */}
            {allowSamples && (
              <div className="warda-details-volumes" role="radiogroup" aria-label={isRu ? "Выбор объема" : "Select volume"}>
                <div className="warda-details-volume-pills">
                  {SAMPLE_VOLUMES.map((sv) => {
                    const sPrice = getSamplePrice(perfume.price, sv.key);
                    return (
                      <button
                        key={sv.key}
                        type="button"
                        className={`warda-volume-pill ${selectedVolume === sv.key ? "active" : ""}`}
                        onClick={() => handleSelectVolume(sv.key)}
                        role="radio"
                        aria-checked={selectedVolume === sv.key}
                      >
                        <span className="warda-volume-pill__title">{isRu ? sv.labelRu : sv.labelEn}</span>
                        <span className="warda-volume-pill__price">€{sPrice.toFixed(2)}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={`warda-volume-pill ${selectedVolume === "full" ? "active" : ""}`}
                    onClick={() => handleSelectVolume("full")}
                    role="radio"
                    aria-checked={selectedVolume === "full"}
                  >
                    <span className="warda-volume-pill__title">{fullBottleVol}</span>
                    <span className="warda-volume-pill__price">€{Number(perfume.price).toFixed(2)}</span>
                  </button>
                </div>
              </div>
            )}

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
                <span className="warda-spec-val">{displayVolume}</span>
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

              {(() => {
                const inCart = isInCart(perfume, activeSampleConfig ? activeSampleConfig.key : "full");
                return (
                  <button
                    type="button"
                    className={`warda-btn warda-btn--add-details ${inCart ? "warda-btn--in-cart" : isAdded ? "warda-btn--added" : ""}`}
                    onClick={handleAddToCart}
                    title={inCart ? (language === "ru" ? "Удалить из корзины" : "Remove from bag") : undefined}
                  >
                    {inCart ? (
                      <>
                        <span className="warda-btn__text-normal">{language === "ru" ? "В КОРЗИНЕ ✓" : "IN BAG ✓"}</span>
                        <span className="warda-btn__text-hover">{language === "ru" ? "УДАЛИТЬ ✕" : "REMOVE ✕"}</span>
                      </>
                    ) : isAdded ? (
                      language === "ru" ? "ДОБАВЛЕНО В КОРЗИНУ ✓" : "ADDED TO BAG ✓"
                    ) : (
                      language === "ru" ? "ДОБАВИТЬ В КОРЗИНУ" : "ADD TO CART"
                    )}
                  </button>
                );
              })()}
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
                <div className="warda-lightbox-zoom-pills">
                  {[1, 1.3, 1.6, 2].map((scale) => (
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
                  src={perfume?.image}
                  alt={perfume.name}
                  className="warda-lightbox-img"
                  style={{
                    transform: `scale(${lightboxScale})`,
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
