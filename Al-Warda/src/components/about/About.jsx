import { Link } from "react-router";
import { useLanguage } from "../../context/languageContext";
import { OrnateCard, SectionDivider, SensesMotif } from "../common/OrnateCard";
import "./About.css";

const FEATURED_HOUSES = [
  "Lattafa",
  "Armaf",
  "Afnan",
  "Al Haramain",
  "Rasasi",
  "Swiss Arabian",
  "Arabian Oud",
  "Orientica",
  "Maison Alhambra",
  "French Avenue",
  "Paris Corner",
  "Khadlaj",
  "Ajmal",
  "Zimaya",
];

export default function About() {
  const { t } = useLanguage();

  const handleAskYasmin = () => {
    window.dispatchEvent(new CustomEvent("open-warda-assistant"));
  };

  const pillars = [
    {
      icon: "ri-shield-star-line",
      title: t("about.pillar1Title"),
      desc: t("about.pillar1Desc"),
    },
    {
      icon: "ri-drop-line",
      title: t("about.pillar2Title"),
      desc: t("about.pillar2Desc"),
    },
    {
      icon: "ri-gift-2-line",
      title: t("about.pillar3Title"),
      desc: t("about.pillar3Desc"),
    },
    {
      icon: "ri-sparkling-2-line",
      title: t("about.pillar4Title"),
      desc: t("about.pillar4Desc"),
    },
  ];

  const ingredients = [
    {
      icon: "🪵",
      name: t("about.ing1Name"),
      role: t("about.ing1Role"),
      desc: t("about.ing1Desc"),
    },
    {
      icon: "🌹",
      name: t("about.ing2Name"),
      role: t("about.ing2Role"),
      desc: t("about.ing2Desc"),
    },
    {
      icon: "✨",
      name: t("about.ing3Name"),
      role: t("about.ing3Role"),
      desc: t("about.ing3Desc"),
    },
    {
      icon: "🌿",
      name: t("about.ing4Name"),
      role: t("about.ing4Role"),
      desc: t("about.ing4Desc"),
    },
  ];

  return (
    <div className="warda-about-page container">
      {/* 1. HERO SECTION */}
      <section className="warda-about-hero">
        <div className="warda-about-hero__badge">
          <i className="ri-vip-diamond-line" />
          <span>{t("about.heroBadge")}</span>
        </div>

        <h1 className="warda-about-hero__title">
          {t("about.heroTitle")}
        </h1>

        <p className="warda-about-hero__lead">
          {t("about.heroLead")}
        </p>

        <div className="warda-about-stats">
          <div className="warda-about-stat">
            <span className="warda-about-stat__num">44+</span>
            <span className="warda-about-stat__label">
              {t("about.statHouses")}
            </span>
          </div>
          <div className="warda-about-stat">
            <span className="warda-about-stat__num">100%</span>
            <span className="warda-about-stat__label">
              {t("about.statAuthentic")}
            </span>
          </div>
          <div className="warda-about-stat">
            <span className="warda-about-stat__num">{t("about.statLongevityVal")}</span>
            <span className="warda-about-stat__label">
              {t("about.statLongevity")}
            </span>
          </div>
          <div className="warda-about-stat">
            <span className="warda-about-stat__num">{t("about.statDeliveryVal")}</span>
            <span className="warda-about-stat__label">
              {t("about.statDelivery")}
            </span>
          </div>
        </div>
      </section>

      {/* 2. STORY & HERITAGE */}
      <SectionDivider
        title={t("about.storySec")}
        showMotif={true}
      />

      <section className="warda-about-story">
        <div className="warda-about-story__card">
          <div className="warda-about-story__visual">
            <img
              src="/assets/img/al-warda-header-logo.webp"
              alt="Al-Warda Emblem"
              className="warda-about-story__emblem"
            />
          </div>
          <div className="warda-about-story__content">
            <h2>
              {t("about.storyTitle")}
            </h2>
            <p>
              {t("about.storyP1")}
            </p>
            <p>
              {t("about.storyP2")}
            </p>
          </div>
        </div>
      </section>

      {/* 3. PILLARS */}
      <SectionDivider
        title={t("about.valuesSec")}
        showMotif={true}
      />

      <section className="warda-about-pillars">
        {pillars.map((item, idx) => (
          <OrnateCard key={idx} className="warda-about-pillar-card">
            <div className="warda-about-pillar__icon">
              <i className={item.icon} />
            </div>
            <h3 className="warda-about-pillar__title">
              {item.title}
            </h3>
            <p className="warda-about-pillar__desc">
              {item.desc}
            </p>
          </OrnateCard>
        ))}
      </section>

      {/* 4. PRECIOUS INGREDIENTS */}
      <SectionDivider
        title={t("about.notesSec")}
        showMotif={true}
      />

      <section className="warda-about-ingredients">
        {ingredients.map((ing, idx) => (
          <div key={idx} className="warda-about-ingredient-card">
            <div className="warda-about-ingredient__top">
              <span className="warda-about-ingredient__emoji" aria-hidden="true">
                {ing.icon}
              </span>
              <div>
                <h3 className="warda-about-ingredient__name">
                  {ing.name}
                </h3>
                <span className="warda-about-ingredient__role">
                  {ing.role}
                </span>
              </div>
            </div>
            <p className="warda-about-ingredient__desc">
              {ing.desc}
            </p>
          </div>
        ))}
      </section>

      {/* 5. PARTNER HOUSES */}
      <SectionDivider
        title={t("about.housesSec")}
        showMotif={true}
      />

      <section className="warda-about-houses">
        <p className="warda-about-houses__subtitle">
          {t("about.housesSubtitle")}
        </p>
        <div className="warda-about-houses__list">
          {FEATURED_HOUSES.map((brand) => (
            <Link
              key={brand}
              to={`/featured?brand=${encodeURIComponent(brand)}`}
              className="warda-about-house-pill"
            >
              <span>{brand}</span>
              <i className="ri-arrow-right-up-line" />
            </Link>
          ))}
        </div>
      </section>

      {/* 6. CTA BANNER */}
      <section className="warda-about-cta">
        <h2 className="warda-about-cta__title">
          {t("about.ctaTitle")}
        </h2>
        <p className="warda-about-cta__desc">
          {t("about.ctaDesc") || t("about.ctaSubtitle")}
        </p>
        <div className="warda-about-cta__actions">
          <Link to="/featured" className="warda-btn">
            <i className="ri-compass-3-line" />
            <span>{t("about.ctaExplore")}</span>
          </Link>
          <Link to="/sets" className="warda-btn warda-about-cta__btn-secondary">
            <i className="ri-flask-line" />
            <span>{t("about.ctaSets")}</span>
          </Link>
          <button
            type="button"
            className="warda-btn warda-about-cta__btn-secondary"
            onClick={handleAskYasmin}
          >
            <i className="ri-sparkling-2-line" />
            <span>{t("about.ctaYasmin")}</span>
          </button>
        </div>
      </section>

      <SensesMotif />
    </div>
  );
}
