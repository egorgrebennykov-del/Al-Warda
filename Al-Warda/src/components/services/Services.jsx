import { useLanguage } from "../../context/languageContext";

export default function Services() {
  const { t } = useLanguage();

  return (
    <section className="services section">
      <div className="services__container container grid">
        <article className="services__card">
          <i className="ri-truck-line" />
          <h3 className="services__title">{t("home.freeShipping")}</h3>
          <p className="services__description">{t("home.freeShippingDesc")}</p>
        </article>
        <article className="services__card">
          <i className="ri-lock-2-line" />
          <h3 className="services__title">{t("home.securePayment")}</h3>
          <p className="services__description">{t("home.securePaymentDesc")}</p>
        </article>
        <article className="services__card">
          <i className="ri-customer-service-2-line" />
          <h3 className="services__title">{t("home.support")}</h3>
          <p className="services__description">{t("home.supportDesc")}</p>
        </article>
      </div>
    </section>
  );
}
