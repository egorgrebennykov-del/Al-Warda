import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { getBestSellerPerfumes, getCategories, getPerfumeUrl } from "../../../utils/perfumes";
import { addToCart } from "../../../utils/cart";
import { useLanguage } from "../../context/languageContext";
import { OrnateCard, SectionDivider, SensesMotif } from "../common/OrnateCard";
import CategoryCinematicMotion from "./CategoryCinematicMotion";
import "./Home.css";
import "../common/ProductCardImages.css";

export default function Home() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [bestSellers, setBestSellers] = useState([]);
  const [categories] = useState(() => getCategories());
  const [addedIds, setAddedIds] = useState({});

  const carouselRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getBestSellerPerfumes({ refresh: true })
      .then((items) => {
        if (!cancelled && Array.isArray(items) && items.length > 0) {
          setBestSellers(items.slice(0, 3));
        }
      })
      .catch((err) => console.warn("Could not load bestsellers:", err));

    const timer = window.setInterval(() => {
      getBestSellerPerfumes({ refresh: true })
        .then((items) => { if (!cancelled) setBestSellers(items.slice(0, 3)); })
        .catch((err) => console.warn("Could not refresh bestsellers:", err));
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    let frame = 0;
    const checkScroll = () => {
      frame = 0;
      setCanScrollLeft(el.scrollLeft > 10);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
    };
    const scheduleCheck = () => {
      if (!frame) frame = window.requestAnimationFrame(checkScroll);
    };
    checkScroll();
    el.addEventListener("scroll", scheduleCheck, { passive: true });
    window.addEventListener("resize", scheduleCheck);
    return () => {
      el.removeEventListener("scroll", scheduleCheck);
      window.removeEventListener("resize", scheduleCheck);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [categories]);

  const scrollCarousel = (direction) => {
    const el = carouselRef.current;
    if (!el) return;
    // Scroll exactly 3 slides at a time
    const scrollAmount = el.clientWidth;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };

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

  const handleCategoryClick = (categoryId) => {
    navigate(`/featured?category=${encodeURIComponent(categoryId)}`);
  };

  const handleCardMouseMove = (e) => {
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

  const handleProductClick = (perfume) => {
    navigate(getPerfumeUrl(perfume));
  };

  return (
    <div className="warda-home">
      {/* 1. HERO SECTION */}
      <section className="warda-hero container">
        <div className="warda-hero__content">
          <h1 className="warda-hero__title">
            Timeless Arabian<br />Fragrances
          </h1>
          <p className="warda-hero__subtitle">
            {language === "ru"
              ? "Откройте для себя ваш неповторимый восточный аромат"
              : "Discover your signature scent"}
          </p>
          <div className="warda-hero__action">
            <Link to="/featured" className="warda-btn warda-btn--hero">
              <span>{language === "ru" ? "ИССЛЕДОВАТЬ КОЛЛЕКЦИЮ" : "EXPLORE COLLECTION"}</span>
              <span className="warda-btn__arrow">→</span>
            </Link>
          </div>
        </div>

        <div className="warda-hero__visual">
          <div className="warda-hero__img-frame">
            <img
              src="/assets/img/perfumes/al-warda-home-hero.webp"
              alt="Al-Warda Royal Fragrance"
              className="warda-hero__img"
              loading="eager"
              fetchPriority="high"
              width="1365"
              height="768"
            />
          </div>
        </div>
      </section>

      {/* 2. SECTION DIVIDER: SHOP BY CATEGORY */}
      <div className="container">
        <SectionDivider
          title={language === "ru" ? "КАТЕГОРИИ АРОМАТОВ" : "SHOP BY CATEGORY"}
          showMotif={true}
        />
      </div>

      {/* 3. CATEGORIES CAROUSEL - BRIGHT, FRAMELSS PHOTOS */}
      <section className="warda-categories-section container">
        <div className="warda-carousel-wrapper">
          {/* Carousel navigation buttons */}
          <button
            type="button"
            className={`warda-carousel-btn warda-carousel-btn--prev ${!canScrollLeft ? "warda-carousel-btn--disabled" : ""}`}
            onClick={() => scrollCarousel("left")}
            aria-label="Previous categories"
            disabled={!canScrollLeft}
          >
            <i className="ri-arrow-left-s-line" />
          </button>

          <div className="warda-categories-carousel" ref={carouselRef}>
            {categories.map((cat) => {
              const catName = language === "ru" ? (cat.nameRu || cat.name) : (cat.nameEn || cat.name);
              return (
                <article
                  key={cat.id}
                  className="warda-cat-slide"
                  onClick={() => handleCategoryClick(cat.id)}
                  onMouseMove={handleCardMouseMove}
                  onMouseLeave={handleCardMouseLeave}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && handleCategoryClick(cat.id)}
                >
                  <div className="warda-cat-slide__media">
                    <CategoryCinematicMotion categoryId={cat.id || cat.slug} layer="back" />
                    <img
                      src={cat.image}
                      alt={catName}
                      className="warda-cat-slide__img"
                      loading="lazy" decoding="async"
                    />
                    <CategoryCinematicMotion categoryId={cat.id || cat.slug} layer="front" />
                  </div>
                  <div className="warda-cat-slide__info">
                    <span className="warda-cat-slide__title">{catName}</span>
                    <span className="warda-cat-slide__arrow">→</span>
                  </div>
                </article>
              );
            })}
          </div>

          <button
            type="button"
            className={`warda-carousel-btn warda-carousel-btn--next ${!canScrollRight ? "warda-carousel-btn--disabled" : ""}`}
            onClick={() => scrollCarousel("right")}
            aria-label="Next categories"
            disabled={!canScrollRight}
          >
            <i className="ri-arrow-right-s-line" />
          </button>
        </div>
      </section>

      {/* 4. SECTION DIVIDER: BEST SELLERS */}
      <div className="container">
        <SectionDivider
          title={language === "ru" ? "БЕСТСЕЛЛЕРЫ" : "BEST SELLERS"}
          showMotif={true}
        />
      </div>

      {/* 5. BEST SELLERS GRID */}
      <section className="warda-bestsellers container">
        <div className="warda-bestsellers__grid">
          {bestSellers.map((perfume) => {
            const isAdded = Boolean(addedIds[perfume.id]);
            return (
              <OrnateCard
                key={perfume.id}
                className="warda-perfume-card"
                onClick={() => handleProductClick(perfume)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && handleProductClick(perfume)}
              >
                <div className="warda-perfume-card__media">
                  <img
                    src={perfume.image}
                    alt={perfume.name}
                    className="warda-perfume-card__img"
                    loading="lazy" decoding="async"
                    onError={(e) => {
                      e.currentTarget.hidden = true;
                    }}
                  />
                </div>

                <div className="warda-perfume-card__info">
                  <h3 className="warda-perfume-card__title">{perfume.name}</h3>
                  <p className="warda-perfume-card__notes">{perfume.brand}</p>
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
      </section>

      {/* 6. BOTTOM SENSES MOTIF */}
      <div className="container">
        <SensesMotif />
      </div>
    </div>
  );
}
