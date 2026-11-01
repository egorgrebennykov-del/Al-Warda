import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router";
import { getPerfumeById, getPerfumes } from "../../../utils/perfumes";
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

  return (
    <div className="warda-details-page">
      <div className="container">
        <div className="warda-details-breadcrumb">
          <Link to="/">{language === "ru" ? "Главная" : "Home"}</Link>
          <span className="warda-breadcrumb-sep">/</span>
          <Link to="/featured">{language === "ru" ? "Коллекция" : "Collection"}</Link>
          <span className="warda-breadcrumb-sep">/</span>
          <span className="warda-breadcrumb-current">{perfume.name}</span>
        </div>

        <div className="warda-details-grid">
          {/* MEDIA COLUMN */}
          <div className="warda-details-media">
            <OrnateCard className="warda-details-card">
              <div className="warda-details-img-wrap">
                <div className="warda-details-aura" />
                <img
                  src={perfume.image}
                  alt={perfume.name}
                  className="warda-details-img"
                />
              </div>
            </OrnateCard>
          </div>

          {/* INFO COLUMN */}
          <div className="warda-details-info">
            <div className="warda-details-tag">
              <span className="warda-tag-category">{perfume.category?.toUpperCase()}</span>
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
                {perfume.isDropship
                  ? (language === "ru" ? "🚀 Дропшиппинг (доставка 4–7 дней)" : "🚀 Dropshipping (4–7 days delivery)")
                  : perfume.inStock
                    ? (language === "ru" ? "✓ В наличии" : "✓ In Stock")
                    : (language === "ru" ? "Под заказ" : "Pre-order")}
              </span>
            </div>

            <p className="warda-details-desc">{perfume.description}</p>

            {/* OLFACTORY PYRAMID */}
            <div className="warda-pyramid">
              <h3 className="warda-pyramid-title">
                {language === "ru" ? "Ольфакторная пирамида" : "Olfactory Pyramid"}
              </h3>
              <div className="warda-pyramid-grid">
                <div className="warda-pyramid-step">
                  <span className="warda-step-name">{language === "ru" ? "Верхние ноты:" : "Top Notes:"}</span>
                  <div className="warda-notes-tags">
                    {perfume.topNotes?.map((n) => (
                      <span key={n} className="warda-note-tag">{n}</span>
                    ))}
                  </div>
                </div>

                <div className="warda-pyramid-step">
                  <span className="warda-step-name">{language === "ru" ? "Ноты сердца:" : "Heart Notes:"}</span>
                  <div className="warda-notes-tags">
                    {perfume.heartNotes?.map((n) => (
                      <span key={n} className="warda-note-tag">{n}</span>
                    ))}
                  </div>
                </div>

                <div className="warda-pyramid-step">
                  <span className="warda-step-name">{language === "ru" ? "Базовые ноты:" : "Base Notes:"}</span>
                  <div className="warda-notes-tags">
                    {perfume.baseNotes?.map((n) => (
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
                <span className="warda-spec-val">{perfume.gender}</span>
              </div>
              <div className="warda-spec-item">
                <span className="warda-spec-lbl">{language === "ru" ? "Стойкость:" : "Longevity:"}</span>
                <span className="warda-spec-val">12+ {language === "ru" ? "часов" : "hours"}</span>
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
    </div>
  );
}
