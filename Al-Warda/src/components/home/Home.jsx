import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  getBestSellerPerfumes,
  getCategories,
  getPerfumeUrl,
  getDefaultPerfumeVolumeOption,
  INITIAL_BEST_SELLERS,
} from "../../../utils/perfumes";
import { addToCart } from "../../../utils/cart";
import { useCartState } from "../../hooks/useCartState";
import { useLanguage } from "../../context/languageContext";
import { useCurrency } from "../../context/currencyContext";
import { OrnateCard, SectionDivider, SensesMotif } from "../common/OrnateCard";
import LargeAnnouncementRoulette from "../announcements/LargeAnnouncementRoulette";
import { fetchActiveAnnouncements } from "../../../utils/announcements";
import CategoryCinematicMotion from "./CategoryCinematicMotion";
import "./Home.css";
import "../common/ProductCardImages.css";

export default function Home() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { formatPrice } = useCurrency();
  const { isInCart, toggleCart } = useCartState();
  const [bestSellers, setBestSellers] = useState(INITIAL_BEST_SELLERS);
  const [categories] = useState(() => getCategories());
  const [largeAnnouncements, setLargeAnnouncements] = useState([]);
  const [addedIds, setAddedIds] = useState({});

  const carouselRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchActiveAnnouncements()
      .then((items) => {
        if (!cancelled && Array.isArray(items)) {
          const largeOnly = items.filter((item) => item && item.type === "large");
          setLargeAnnouncements(largeOnly);
        }
      })
      .catch((err) => console.warn("Could not load large announcements:", err));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getBestSellerPerfumes()
      .then((items) => {
        if (!cancelled && Array.isArray(items) && items.length > 0) {
          setBestSellers(items.slice(0, 3));
        }
      })
      .catch((err) => console.warn("Could not load bestsellers:", err));

    const timer = window.setInterval(() => {
      getBestSellerPerfumes()
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

    const defaultOpt = getDefaultPerfumeVolumeOption(perfume);
    const isSample = defaultOpt.isSecondLargest && defaultOpt.isSample;
    const volKey = isSample ? defaultOpt.key : null;
    const currentlyInCart = isInCart(perfume, isSample ? defaultOpt.key : "full");
    try {
      await toggleCart(perfume, {
        volKey,
        isSample,
        quantity: 1,
        language,
      });
      if (!currentlyInCart) {
        setAddedIds((prev) => ({ ...prev, [perfume.id]: true }));
        setTimeout(() => {
          setAddedIds((prev) => ({ ...prev, [perfume.id]: false }));
        }, 2000);
      }
    } catch (err) {
      console.warn("Cart error:", err);
    }
  };

  const handleCategoryClick = (categoryId) => {
    navigate(`/featured?category=${encodeURIComponent(categoryId)}`);
  };

  const handleCardMouseMove = (e) => {
    if (typeof window !== "undefined" && (window.innerWidth <= 768 || window.matchMedia("(hover: none)").matches)) return;
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
    const scrollKey = `warda_scroll_${window.location.pathname}${window.location.search}`;
    sessionStorage.setItem(scrollKey, String(window.scrollY));
    const defaultOpt = getDefaultPerfumeVolumeOption(perfume);
    const isSample = defaultOpt.isSecondLargest && defaultOpt.isSample;
    const productUrl = defaultOpt.isSecondLargest
      ? (isSample ? `${getPerfumeUrl(perfume)}?sample=${defaultOpt.key}` : `${getPerfumeUrl(perfume)}?size=${defaultOpt.key}`)
      : getPerfumeUrl(perfume);
    navigate(productUrl);
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
            <picture>
              <source
                media="(max-width: 640px)"
                srcSet="/assets/img/perfumes/al-warda-rose-smoke-mobile.webp"
                type="image/webp"
              />
              <img
                src="/assets/img/perfumes/al-warda-rose-smoke-cropped.webp?v=grand-hero-20261108"
                alt="Al-Warda Royal Fragrance"
                className="warda-hero__img"
                loading="eager"
                fetchPriority="high"
                decoding="async"
                width="1600"
                height="1066"
              />
            </picture>
          </div>
        </div>
      </section>

      {/* 1.5. LARGE PROMOTIONAL ANNOUNCEMENT POSTERS ROULETTE */}
      {largeAnnouncements.length > 0 && (
        <section className="container" style={{ margin: "1.5rem auto 1rem auto" }}>
          <LargeAnnouncementRoulette items={largeAnnouncements} />
        </section>
      )}

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
            const defaultOpt = getDefaultPerfumeVolumeOption(perfume);
            const isSample = defaultOpt.isSecondLargest && defaultOpt.isSample;
            const displayPrice = defaultOpt.price;
            const displayVolume = defaultOpt.isSecondLargest
              ? (language === "ru" ? defaultOpt.labelRu : defaultOpt.labelEn)
              : (perfume.volume ? perfume.volume.split("/")[0].trim() : "");
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
                      const card = e.currentTarget.closest(".warda-perfume-card");
                      if (card) card.style.display = "none";
                    }}
                  />
                </div>

                <div className="warda-perfume-card__info">
                  <h3 className="warda-perfume-card__title">{perfume.name}</h3>
                  <p className="warda-perfume-card__notes">
                    {perfume.brand}
                    {displayVolume && (
                      <span style={{ marginLeft: "0.4rem", opacity: 0.75, fontSize: "0.8rem" }}>
                        · {displayVolume}
                      </span>
                    )}
                  </p>
                  <div className="warda-perfume-card__price">
                    {formatPrice(displayPrice)}
                    {defaultOpt.isSecondLargest && (
                      <span style={{ fontSize: "0.74rem", color: "#a89882", marginLeft: "0.35rem", fontWeight: 400 }}>
                        / {language === "ru" ? defaultOpt.labelRu : defaultOpt.labelEn}
                      </span>
                    )}
                  </div>
                </div>

                <div className="warda-perfume-card__action">
                  {(() => {
                    const inCart = isInCart(perfume, isSample ? defaultOpt.key : "full");
                    return (
                      <button
                        type="button"
                        className={`warda-btn warda-btn--card ${inCart ? "warda-btn--in-cart" : isAdded ? "warda-btn--added" : ""}`}
                        onClick={(e) => handleAddToCart(perfume, e)}
                        aria-label={inCart ? (language === "ru" ? "Удалить из корзины" : "Remove from cart") : `Add ${perfume.name} to cart`}
                        title={inCart ? (language === "ru" ? "Удалить из корзины" : "Remove from bag") : undefined}
                      >
                        {inCart ? (
                          <>
                            <span className="warda-btn__text-normal">{language === "ru" ? "В КОРЗИНЕ ✓" : "IN BAG ✓"}</span>
                            <span className="warda-btn__text-hover">{language === "ru" ? "УДАЛИТЬ ✕" : "REMOVE ✕"}</span>
                          </>
                        ) : isAdded ? (
                          language === "ru" ? "ДОБАВЛЕНО ✓" : "ADDED ✓"
                        ) : (
                          language === "ru" ? "В КОРЗИНУ" : "ADD TO CART"
                        )}
                      </button>
                    );
                  })()}
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
