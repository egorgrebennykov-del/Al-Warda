import { useState } from "react";
import { Link } from "react-router";
import { useLanguage } from "../../context/languageContext";
import { OrnateCard, SectionDivider } from "../common/OrnateCard";
import "./Delivery.css";

const BLAZO_TRACK_URL = "https://yey2ss.blazo.bg/track";

export default function Delivery() {
  const { t } = useLanguage();
  const [trackingCode, setTrackingCode] = useState("");

  const handleTrackSubmit = (e) => {
    e.preventDefault();
    const cleaned = trackingCode.trim();
    const targetUrl = cleaned
      ? `${BLAZO_TRACK_URL}?order=${encodeURIComponent(cleaned)}`
      : BLAZO_TRACK_URL;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  const handleAskYasmin = () => {
    window.dispatchEvent(new CustomEvent("open-warda-assistant"));
  };

  const zones = [
    {
      flag: "🇧🇬",
      country: t("delivery.zoneBgTitle"),
      couriers: t("delivery.zoneBgCouriers"),
      eta: t("delivery.zoneBgEta"),
      price: t("delivery.zoneBgPrice"),
      desc: t("delivery.zoneBgDesc"),
      highlight: true,
    },
    {
      flag: "🇷🇴",
      country: t("delivery.zoneRoTitle"),
      couriers: t("delivery.zoneRoCouriers"),
      eta: t("delivery.zoneRoEta"),
      price: t("delivery.zoneRoPrice"),
      desc: t("delivery.zoneRoDesc"),
    },
    {
      flag: "🇬🇷",
      country: t("delivery.zoneGrTitle"),
      couriers: t("delivery.zoneGrCouriers"),
      eta: t("delivery.zoneGrEta"),
      price: t("delivery.zoneGrPrice"),
      desc: t("delivery.zoneGrDesc"),
    },
    {
      flag: "🇭🇺",
      country: t("delivery.zoneHuTitle"),
      couriers: t("delivery.zoneHuCouriers"),
      eta: t("delivery.zoneHuEta"),
      price: t("delivery.zoneHuPrice"),
      desc: t("delivery.zoneHuDesc"),
    },
  ];

  const standards = [
    {
      icon: "ri-shield-check-line",
      title: t("delivery.std1Title"),
      desc: t("delivery.std1Desc"),
    },
    {
      icon: "ri-gift-2-line",
      title: t("delivery.std2Title"),
      desc: t("delivery.std2Desc"),
    },
    {
      icon: "ri-bank-card-line",
      title: t("delivery.std3Title"),
      desc: t("delivery.std3Desc"),
    },
  ];

  return (
    <div className="warda-delivery-page container">
      {/* 1. HERO SECTION */}
      <section className="warda-delivery-hero">
        <div className="warda-delivery-hero__badge">
          <i className="ri-truck-line" />
          <span>{t("delivery.heroBadge")}</span>
        </div>

        <h1 className="warda-delivery-hero__title">
          {t("delivery.heroTitle")}
        </h1>

        <p className="warda-delivery-hero__lead">
          {t("delivery.heroLead")}
        </p>

        <div className="warda-delivery-stats">
          <div className="warda-delivery-stat">
            <span className="warda-delivery-stat__num">{t("delivery.statDispatchVal")}</span>
            <span className="warda-delivery-stat__label">{t("delivery.statDispatchLabel")}</span>
          </div>
          <div className="warda-delivery-stat">
            <span className="warda-delivery-stat__num">{t("delivery.statEtaVal")}</span>
            <span className="warda-delivery-stat__label">{t("delivery.statEtaLabel")}</span>
          </div>
          <div className="warda-delivery-stat">
            <span className="warda-delivery-stat__num">100%</span>
            <span className="warda-delivery-stat__label">{t("delivery.statInsuredLabel")}</span>
          </div>
          <div className="warda-delivery-stat">
            <span className="warda-delivery-stat__num">Blazo</span>
            <span className="warda-delivery-stat__label">{t("delivery.statTrackingLabel")}</span>
          </div>
        </div>
      </section>

      {/* 2. ORDER TRACKING VIA BLAZO */}
      <SectionDivider title={t("delivery.trackSec")} showMotif={true} />

      <section className="warda-delivery-track">
        <div className="warda-delivery-track__card">
          <div className="warda-delivery-track__info">
            <span className="warda-delivery-track__eyebrow">
              <i className="ri-map-pin-time-line" />
              <span>{t("delivery.trackEyebrow")}</span>
            </span>
            <h2>{t("delivery.trackTitle")}</h2>
            <p>{t("delivery.trackDesc")}</p>
          </div>

          <form className="warda-delivery-track__form" onSubmit={handleTrackSubmit}>
            <div className="warda-delivery-track__input-wrap">
              <i className="ri-search-line" />
              <input
                type="text"
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                placeholder={t("delivery.trackPlaceholder")}
                aria-label={t("delivery.trackPlaceholder")}
                className="warda-delivery-track__input"
              />
            </div>
            <button type="submit" className="warda-delivery-btn warda-delivery-btn--gold">
              <i className="ri-radar-line" />
              <span>{t("delivery.trackBtn")}</span>
              <i className="ri-external-link-line" />
            </button>
          </form>

          <div className="warda-delivery-track__footer">
            <a
              href={BLAZO_TRACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="warda-delivery-track__direct"
            >
              <i className="ri-links-line" />
              <span>{t("delivery.trackDirectLink")}</span>
            </a>
            <Link to="/orders" className="warda-delivery-track__orders">
              <i className="ri-file-list-3-line" />
              <span>{t("delivery.myOrdersLink")}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 3. REGIONAL DELIVERY ZONES */}
      <SectionDivider title={t("delivery.zonesSec")} showMotif={true} />

      <section className="warda-delivery-zones">
        {zones.map((zone) => (
          <OrnateCard
            key={zone.country}
            className={`warda-delivery-zone ${zone.highlight ? "is-highlighted" : ""}`}
            variant="solid"
          >
            <div className="warda-delivery-zone__head">
              <span className="warda-delivery-zone__flag" aria-hidden="true">
                {zone.flag}
              </span>
              <div>
                <h3 className="warda-delivery-zone__title">{zone.country}</h3>
                <span className="warda-delivery-zone__couriers">{zone.couriers}</span>
              </div>
            </div>

            <div className="warda-delivery-zone__meta">
              <div className="warda-delivery-zone__pill">
                <i className="ri-time-line" />
                <span>{zone.eta}</span>
              </div>
              <div className="warda-delivery-zone__pill warda-delivery-zone__pill--gold">
                <i className="ri-price-tag-3-line" />
                <span>{zone.price}</span>
              </div>
            </div>

            <p className="warda-delivery-zone__desc">{zone.desc}</p>
          </OrnateCard>
        ))}
      </section>

      {/* 4. PACKAGING & PAYMENT STANDARDS */}
      <SectionDivider title={t("delivery.standardsSec")} showMotif={true} />

      <section className="warda-delivery-standards">
        {standards.map((item) => (
          <OrnateCard key={item.title} className="warda-delivery-standard" variant="solid">
            <div className="warda-delivery-standard__icon">
              <i className={item.icon} />
            </div>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
          </OrnateCard>
        ))}
      </section>

      {/* 5. CTA FOOTER */}
      <section className="warda-delivery-cta">
        <div className="warda-delivery-cta__inner">
          <h2>{t("delivery.ctaTitle")}</h2>
          <p>{t("delivery.ctaDesc")}</p>
          <div className="warda-delivery-cta__actions">
            <Link to="/featured" className="warda-delivery-btn warda-delivery-btn--gold">
              <i className="ri-sparkling-line" />
              <span>{t("delivery.ctaCatalog")}</span>
            </Link>
            <button
              type="button"
              onClick={handleAskYasmin}
              className="warda-delivery-btn warda-delivery-btn--outline"
            >
              <i className="ri-chat-voice-line" />
              <span>{t("delivery.ctaYasmin")}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
