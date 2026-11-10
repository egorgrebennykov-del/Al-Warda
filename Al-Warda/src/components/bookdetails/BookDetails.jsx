import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router";
import {
  getPerfumeById,
  ensurePerfumeEnrichment,
  getHarmoniousNotes,
  isPerfumeSet,
  inferSetItems,
  isDecantablePerfume,
  SAMPLE_VOLUMES,
  getSamplePrice,
  createSampleCartItem,
  getDefaultPerfumeVolumeOption,
  getPerfumeGtin,
  getQogitaProductUrl,
} from "../../../utils/perfumes";
import { addToCart } from "../../../utils/cart";
import { isPrivileged as checkIsPrivileged } from "../../../utils/auth";
import { useAuth } from "../../context/AuthContext";
import { useCartState } from "../../hooks/useCartState";
import { useLanguage } from "../../context/languageContext";
import { useCurrency } from "../../context/currencyContext";
import {
  getLocalizedCategory,
  getLocalizedGender,
  getLocalizedLongevity,
  getLocalizedNote,
  getLocalizedSampleDesc,
  formatVolume,
  formatFallbackDescription,
} from "../../utils/localization";
import { OrnateCard, CornerBracket } from "../common/OrnateCard";
import "../common/ProductCardImages.css";
import "./BookDetails.css";

export default function BookDetails() {
  const { bookId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const { formatPrice } = useCurrency();
  const { isInCart, toggleCart } = useCartState();
  const { user, isPrivileged: isPrivContext } = useAuth();
  const isPriv = Boolean(isPrivContext || checkIsPrivileged(user));

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
    } else if (!s && perfume) {
      const def = getDefaultPerfumeVolumeOption(perfume);
      if (def.isSecondLargest && def.isSample) {
        setSelectedVolume(def.key);
      } else {
        setSelectedVolume("full");
      }
    }
  }, [searchParams, perfume]);

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

  const enrichedPerfume = perfume ? ensurePerfumeEnrichment(perfume) : null;
  const perfumeGtin = isPriv && (perfume || enrichedPerfume) ? getPerfumeGtin(perfume || enrichedPerfume) : "";
  const qogitaUrl = isPriv && (perfume || enrichedPerfume) ? getQogitaProductUrl(perfume || enrichedPerfume) : null;
  const isSet = enrichedPerfume ? isPerfumeSet(enrichedPerfume) : false;
  const setItems = enrichedPerfume?.setItems || (isSet ? inferSetItems(enrichedPerfume?.name, enrichedPerfume?.brand) : null);
  const isDecantable = enrichedPerfume ? isDecantablePerfume(enrichedPerfume) : false;
  const hasSampleParam = Boolean(searchParams.get("sample"));
  const allowSamples = !isSet && (isDecantable || hasSampleParam);
  const activeSampleConfig = allowSamples && selectedVolume !== "full"
    ? SAMPLE_VOLUMES.find((v) => v.key === selectedVolume)
    : null;
  const displayPrice = activeSampleConfig
    ? getSamplePrice(perfume?.price, activeSampleConfig.key)
    : Number(perfume?.price || 0);
  const displayVolume = activeSampleConfig
    ? `${formatVolume(activeSampleConfig.ml, language)} (${getLocalizedSampleDesc(activeSampleConfig.key, language)})`
    : formatVolume(enrichedPerfume?.volume || "100 ml", language);
  const rawBottleVol = isSet
    ? (enrichedPerfume?.volume?.match(/\d+\s*[xX×]\s*\d+\s*(?:ml|мл)/i)?.[0] || enrichedPerfume?.volume || t("details.discoverySet"))
    : ((enrichedPerfume?.volume || "").split("/")[0].trim() || "100 ml");
  const fullBottleVol = formatVolume(rawBottleVol, language);

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
          <span className="warda-details-sr-only">{t("details.loading", "Loading fragrance")}</span>
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
        <h2>{t("details.fragranceNotFound")}</h2>
        <Link to="/featured" className="warda-btn">
          {t("details.toCollection")}
        </Link>
      </div>
    );
  }

  const notesFallback = enrichedPerfume ? getHarmoniousNotes(enrichedPerfume) : null;

  const resolveNotes = (notesRu, notesEn, fallbackNotes) => {
    let raw = (language === "ru" ? (notesRu?.length ? notesRu : notesEn) : (notesEn?.length ? notesEn : notesRu)) || fallbackNotes || [];
    if (typeof raw === "string") {
      raw = raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return (Array.isArray(raw) ? raw : []).map((n) => getLocalizedNote(n, language));
  };

  const topNotes = resolveNotes(
    enrichedPerfume?.topNotesRu || enrichedPerfume?.topNotes,
    enrichedPerfume?.topNotesEn,
    notesFallback?.[language === "ru" ? "ru" : "en"]?.top
  );
  const heartNotes = resolveNotes(
    enrichedPerfume?.heartNotesRu || enrichedPerfume?.heartNotes,
    enrichedPerfume?.heartNotesEn,
    notesFallback?.[language === "ru" ? "ru" : "en"]?.heart
  );
  const baseNotes = resolveNotes(
    enrichedPerfume?.baseNotesRu || enrichedPerfume?.baseNotes,
    enrichedPerfume?.baseNotesEn,
    notesFallback?.[language === "ru" ? "ru" : "en"]?.base
  );

  let displayDesc =
    enrichedPerfume?.[`description_${language}`] ||
    enrichedPerfume?.[`description${language.charAt(0).toUpperCase() + language.slice(1)}`];

  if (!displayDesc) {
    if (language === "ru") {
      displayDesc = enrichedPerfume?.descriptionRu || enrichedPerfume?.description;
    } else if (language === "en") {
      displayDesc = enrichedPerfume?.descriptionEn;
    }
  }

  const isCorruptedOrNonNative =
    !displayDesc ||
    displayDesc.includes("Сертифицированная оригинальная") ||
    displayDesc.length < 25 ||
    (language !== "ru" && language !== "bg" && /[а-яА-ЯёЁ]/.test(displayDesc));

  if (isCorruptedOrNonNative) {
    displayDesc = formatFallbackDescription(
      enrichedPerfume?.name,
      enrichedPerfume?.brand,
      topNotes,
      heartNotes,
      baseNotes,
      language
    );
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
            <span>{t("details.backToCatalog")}</span>
          </button>

          <div className="warda-details-breadcrumb">
            <Link to="/">{t("nav.home")}</Link>
            <span className="warda-breadcrumb-sep">/</span>
            <Link to="/featured">{t("nav.catalog")}</Link>
            <span className="warda-breadcrumb-sep">/</span>
            <span className="warda-breadcrumb-current">{perfume.name}</span>
          </div>

          {isPriv && qogitaUrl && (
            <a
              href={qogitaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="warda-privileged-top-badge"
              title={t("details.qogitaView")}
            >
              <i className="ri-shield-star-line" />
              <span>Qogita ↗</span>
              {perfumeGtin && <span className="warda-privileged-gtin-label">{perfumeGtin}</span>}
            </a>
          )}
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
                title={t("details.clickToView")}
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
                {isSet
                  ? t("details.discoverySet")
                  : getLocalizedCategory(perfume.category, language)}
              </span>
              <span className="warda-tag-badge">
                {isSet ? t("details.miniatureSet") : perfume.concentration}
              </span>
            </div>

            <h1 className="warda-details-title">{perfume.name}</h1>
            <p className="warda-details-subtitle">{perfume.brand}</p>

            <div className="warda-details-rating">
              <div className="warda-stars">★★★★★</div>
              <span className="warda-rating-num">{perfume.rating} / 5.0</span>
              <span className="warda-reviews-count">({perfume.reviewsCount} {t("details.reviews")})</span>
            </div>

            {/* PRIVILEGED ACCESS: DIRECT QOGITA WHOLESALE PRODUCT LINK */}
            {isPriv && qogitaUrl && (
              <div className="warda-privileged-product-bar">
                <div className="warda-privileged-product-info">
                  <span className="warda-privileged-icon-wrap">
                    <i className="ri-shield-star-fill" />
                  </span>
                  <div className="warda-privileged-text-group">
                    <div className="warda-privileged-title-row">
                      <span className="warda-privileged-badge">
                        {t("details.privilegedAccess")}
                      </span>
                      {perfumeGtin && (
                        <span className="warda-privileged-gtin-tag">
                          GTIN: {perfumeGtin}
                        </span>
                      )}
                    </div>
                    <span className="warda-privileged-desc">
                      {t("details.qogitaDirect")}
                    </span>
                  </div>
                </div>

                <div className="warda-privileged-actions">
                  <a
                    href={qogitaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="warda-privileged-qogita-btn"
                    title={t("details.qogitaView")}
                  >
                    <i className="ri-external-link-line" />
                    <span>{t("details.qogitaView")}</span>
                  </a>
                  {perfumeGtin && (
                    <a
                      href={`https://www.qogita.com/account/catalog/?search=${encodeURIComponent(perfumeGtin)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="warda-privileged-panel-btn"
                      title={t("details.qogitaPortal")}
                    >
                      <i className="ri-search-line" />
                      <span>{t("details.qogitaPortal")}</span>
                    </a>
                  )}
                  <Link
                    to="/privileged/qogita"
                    className="warda-privileged-panel-btn"
                    title={t("details.qogitaWholesalePanel")}
                  >
                    <i className="ri-dashboard-3-line" />
                    <span>{t("details.qogitaWholesalePanel")}</span>
                  </Link>
                </div>
              </div>
            )}

            {/* FORMAT / VOLUME SELECTOR: INLINE ROW ABOVE PRICE (ASCENDING ORDER) */}
            <div className="warda-details-volumes" role="radiogroup" aria-label={t("details.selectVolume")}>
              <div className="warda-details-volume-pills">
                {allowSamples && SAMPLE_VOLUMES.map((sv) => {
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
                      <span className="warda-volume-pill__title">{formatVolume(sv.ml, language)}</span>
                      <span className="warda-volume-pill__price">{formatPrice(sPrice)}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`warda-volume-pill ${selectedVolume === "full" || !allowSamples ? "active" : ""}`}
                  onClick={() => handleSelectVolume("full")}
                  role="radio"
                  aria-checked={selectedVolume === "full" || !allowSamples}
                >
                  <span className="warda-volume-pill__title">{fullBottleVol}</span>
                  <span className="warda-volume-pill__price">{formatPrice(perfume.price)}</span>
                </button>
              </div>
            </div>

            <div className="warda-details-price-row">
              <span className="warda-details-price">{formatPrice(displayPrice)}</span>
              {perfume.inStock === false && <span className="warda-stock-status">{t("details.preorder")}</span>}
            </div>

            <p className="warda-details-desc">
              {displayDesc}
            </p>

            {/* SET COMPOSITION / INCLUDED FRAGRANCES OR OLFACTORY PYRAMID */}
            {isSet ? (
              <div className="warda-set-composition">
                <h3 className="warda-pyramid-title">
                  <i className="ri-gift-2-line" style={{ marginRight: "0.5rem", color: "#d4af37" }} />
                  {t("details.setContents")}
                </h3>
                {setItems && setItems.length > 0 ? (
                  <div className="warda-set-items-grid">
                    {setItems.map((item, idx) => (
                      <div key={idx} className="warda-set-item-card">
                        <div className="warda-set-item-head">
                          <span className="warda-set-item-badge">{formatVolume(item.volume || "10 ml", language)}</span>
                          <h4 className="warda-set-item-title">{item.name}</h4>
                        </div>
                        {(item.descRu || item.descEn) && (
                          <p className="warda-set-item-desc">{item[`desc_${language}`] || item[`desc${language.charAt(0).toUpperCase() + language.slice(1)}`] || (language === "ru" ? item.descRu : (item.descEn || item.descRu))}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="warda-set-features">
                    <div className="warda-set-feature-row">
                      <span className="warda-set-feature-bullet">✦</span>
                      <span>
                        {t("details.setFeature1")}
                      </span>
                    </div>
                    <div className="warda-set-feature-row">
                      <span className="warda-set-feature-bullet">✦</span>
                      <span>
                        {t("details.setFeature2")}
                      </span>
                    </div>
                    <div className="warda-set-feature-row">
                      <span className="warda-set-feature-bullet">✦</span>
                      <span>
                        {t("details.setFeature3")}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="warda-pyramid">
                <h3 className="warda-pyramid-title">
                  {t("details.pyramid")}
                </h3>
                <div className="warda-pyramid-grid">
                  <div className="warda-pyramid-step">
                    <span className="warda-step-name">{t("details.topNotes")}</span>
                    <div className="warda-notes-tags">
                      {topNotes.map((n) => (
                        <span key={n} className="warda-note-tag">{n}</span>
                      ))}
                    </div>
                  </div>

                  <div className="warda-pyramid-step">
                    <span className="warda-step-name">{t("details.heartNotes")}</span>
                    <div className="warda-notes-tags">
                      {heartNotes.map((n) => (
                        <span key={n} className="warda-note-tag">{n}</span>
                      ))}
                    </div>
                  </div>

                  <div className="warda-pyramid-step">
                    <span className="warda-step-name">{t("details.baseNotes")}</span>
                    <div className="warda-notes-tags">
                      {baseNotes.map((n) => (
                        <span key={n} className="warda-note-tag">{n}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SPECS ROW */}
            <div className="warda-specs-row">
              <div className="warda-spec-item">
                <span className="warda-spec-lbl">{isSet ? t("details.format") : t("details.volume")}</span>
                <span className="warda-spec-val">{isSet ? t("details.discoverySet") : displayVolume}</span>
              </div>
              <div className="warda-spec-item">
                <span className="warda-spec-lbl">{isSet ? t("details.included") : t("details.gender")}</span>
                <span className="warda-spec-val">
                  {isSet
                    ? formatVolume(perfume.volume || "4 × 10 ml", language)
                    : getLocalizedGender(perfume.gender, language)}
                </span>
              </div>
              <div className="warda-spec-item">
                <span className="warda-spec-lbl">{t("details.longevity")}</span>
                <span className="warda-spec-val">{getLocalizedLongevity(perfume.longevity, language)}</span>
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
                    title={inCart ? t("details.remove") : undefined}
                  >
                    {inCart ? (
                      <>
                        <span className="warda-btn__text-normal">{t("details.inBag")}</span>
                        <span className="warda-btn__text-hover">{t("details.remove")}</span>
                      </>
                    ) : isAdded ? (
                      t("details.addedToBag")
                    ) : (
                      t("details.addToCart")
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
                {t("details.lightboxHint")}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
