import { useState } from "react";
import { useLanguage } from "../../context/languageContext";
import "./Contacts.css";

export default function Contacts() {
  const { language, t } = useLanguage();
  const [copiedKey, setCopiedKey] = useState(null);

  const handleCopy = (key, text) => {
    if (!navigator?.clipboard?.writeText) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    });
  };

  const phone = "+373 68 123 456";
  const email = "alwardaparfumes@gmail.com";
  const addressText =
    language === "ru"
      ? "ул. „Первая“, 8240 Несебр, Болгария"
      : "1st Street, 8240 Nessebar, Bulgaria";
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent("1st Street, 8240 Nessebar, Bulgaria")}`;

  return (
    <section className="contacts section container" id="contacts">
      <div className="contacts__header">
        <h1 className="section__title">{t("contacts.title")}</h1>
        <p className="contacts__subtitle">{t("contacts.subtitle")}</p>
      </div>

      {/* Main Founder Card */}
      <div className="contacts__hero-card">
        <div className="contacts__hero-grid">
          <div className="contacts__photo-wrap">
            <div className="contacts__photo-frame">
              <img
                src="/assets/img/director.png"
                alt={language === "ru" ? "Егор Гребенников" : "Yegor Grebennykov"}
                className="contacts__photo"
                loading="eager"
              />
            </div>
            <div className="contacts__photo-glow" aria-hidden="true" />
          </div>

          <div className="contacts__hero-info">
            <div className="contacts__hero-badge">
              <i className="ri-award-fill" />
              <span>{t("contacts.role")}</span>
            </div>

            <h2 className="contacts__hero-name">
              {language === "ru" ? "Егор Гребенников" : "Yegor Grebennykov"}
            </h2>

            <div className="contacts__hero-tags">
              <span className="contacts__tag contacts__tag--gold">
                <i className="ri-vip-crown-fill" /> VIP
              </span>
              <span className="contacts__tag contacts__tag--dev">
                <i className="ri-code-box-line" />
                {language === "ru" ? "Девелопер" : "Developer"}
              </span>
              <span className="contacts__tag contacts__tag--warda">
                <i className="ri-sparkling-2-line" /> Al-Warda
              </span>
            </div>

            <div className="contacts__story">
              <p className="contacts__story-lead">{t("contacts.aboutP1")}</p>
              <p>{t("contacts.aboutP2")}</p>
              <p>{t("contacts.aboutP3")}</p>
            </div>

            {/* Social Buttons under Bio */}
            <div className="contacts__quick-actions">
              <a
                href="https://t.me/egorgeb"
                target="_blank"
                rel="noopener noreferrer"
                className="button contacts__action-btn contacts__action-btn--tg"
              >
                <i className="ri-telegram-fill" />
                <span>Telegram</span>
              </a>

              <a
                href="https://www.instagram.com/egorgeb/"
                target="_blank"
                rel="noopener noreferrer"
                className="button contacts__action-btn contacts__action-btn--insta"
              >
                <i className="ri-instagram-line" />
                <span>Instagram</span>
              </a>

              <a
                href="https://www.facebook.com/egor.grebennykov/"
                target="_blank"
                rel="noopener noreferrer"
                className="button contacts__action-btn contacts__action-btn--fb"
              >
                <i className="ri-facebook-circle-fill" />
                <span>Facebook</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Direct Contact Channels Grid */}
      <div className="contacts__section-block">
        <h3 className="contacts__section-title">
          <i className="ri-contacts-line" />
          {t("contacts.direct")}
        </h3>

        <div className="contacts__cards-grid">
          {/* Phone Card */}
          <div className="contacts__card">
            <div className="contacts__card-icon contacts__card-icon--phone">
              <i className="ri-phone-fill" />
            </div>
            <div className="contacts__card-content">
              <span className="contacts__card-label">{t("contacts.phone")}</span>
              <a href={`tel:${phone}`} className="contacts__card-value">
                {phone}
              </a>
              <span className="contacts__card-desc">
                {language === "ru"
                  ? "Звонки и сообщения WhatsApp / Viber"
                  : "Calls & instant messaging"}
              </span>
            </div>
            <button
              type="button"
              className="contacts__copy-btn"
              onClick={() => handleCopy("phone", phone)}
              title={copiedKey === "phone" ? t("contacts.copied") : t("contacts.copy")}
            >
              <i className={copiedKey === "phone" ? "ri-check-line" : "ri-file-copy-line"} />
              <span>{copiedKey === "phone" ? t("contacts.copied") : t("contacts.copy")}</span>
            </button>
          </div>

          {/* Email Card */}
          <div className="contacts__card">
            <div className="contacts__card-icon contacts__card-icon--email">
              <i className="ri-mail-fill" />
            </div>
            <div className="contacts__card-content">
              <span className="contacts__card-label">{t("contacts.email")}</span>
              <span className="contacts__card-value">{email}</span>
              <span className="contacts__card-desc">
                {language === "ru"
                  ? "Вопросы сотрудничества и партнерства"
                  : "Partnerships & general inquiries"}
              </span>
            </div>
            <button
              type="button"
              className="contacts__copy-btn"
              onClick={() => handleCopy("email", email)}
              title={copiedKey === "email" ? t("contacts.copied") : t("contacts.copy")}
            >
              <i className={copiedKey === "email" ? "ri-check-line" : "ri-file-copy-line"} />
              <span>{copiedKey === "email" ? t("contacts.copied") : t("contacts.copy")}</span>
            </button>
          </div>

          {/* Address Card */}
          <div className="contacts__card">
            <div className="contacts__card-icon contacts__card-icon--address">
              <i className="ri-map-pin-2-fill" />
            </div>
            <div className="contacts__card-content">
              <span className="contacts__card-label">{t("contacts.address")}</span>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="contacts__card-value contacts__card-value--address"
              >
                {addressText}
              </a>
              <span className="contacts__card-desc">
                {language === "ru"
                  ? "Отправка заказов и корреспонденции"
                  : "Orders shipping & correspondence"}
              </span>
            </div>
            <button
              type="button"
              className="contacts__copy-btn"
              onClick={() => handleCopy("address", addressText)}
              title={copiedKey === "address" ? t("contacts.copied") : t("contacts.copy")}
            >
              <i className={copiedKey === "address" ? "ri-check-line" : "ri-file-copy-line"} />
              <span>{copiedKey === "address" ? t("contacts.copied") : t("contacts.copy")}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
