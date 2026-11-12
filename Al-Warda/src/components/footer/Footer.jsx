import { Link } from "react-router";
import { isLoggedIn } from "../../../utils/auth";
import { useLanguage } from "../../context/languageContext";
import "./Footer.css";

export default function Footer() {
  const { t } = useLanguage();
  const accountPath = isLoggedIn() ? "/profile" : "/login";
  const accountLabel = isLoggedIn() ? t("footer.myProfile") : t("footer.signIn");

  return (
    <footer className="footer warda-footer">
      <div className="footer__container container">
        {/* BRAND & EMBLEM COLUMN */}
        <div className="warda-footer__col warda-footer__col--brand">
          <Link to="/" className="footer__brand" aria-label="Al-Warda Parfumes home">
            <img
              src="/assets/img/al-warda-header-logo.webp"
              alt="Al-Warda Parfumes"
              className="footer__logo-image"
            />
          </Link>
          <p className="warda-footer__desc">
            {t("footer.brandDesc")}
          </p>

          <div className="warda-footer__badges">
            <span className="warda-footer__badge">
              <i className="ri-shield-check-line" />
              <span>{t("footer.authentic")}</span>
            </span>
            <span className="warda-footer__badge">
              <i className="ri-truck-line" />
              <span>{t("footer.fastDelivery")}</span>
            </span>
          </div>
        </div>

        {/* COLLECTIONS COLUMN */}
        <div className="warda-footer__col">
          <h4 className="warda-footer__heading">
            {t("footer.collections")}
          </h4>
          <ul className="footer__links">
            <li>
              <Link to="/featured?category=oud" className="footer__link">
                {t("footer.oudWoody")}
              </Link>
            </li>
            <li>
              <Link to="/featured?category=gourmand" className="footer__link">
                {t("footer.gourmandVanilla")}
              </Link>
            </li>
            <li>
              <Link to="/featured?category=floral" className="footer__link">
                {t("footer.floralRose")}
              </Link>
            </li>
            <li>
              <Link to="/featured?category=fresh" className="footer__link">
                {t("footer.freshAquatic")}
              </Link>
            </li>
            <li>
              <Link to="/featured?brand=Lattafa,Armaf,Amouage,Arabian Oud" className="footer__link">
                {t("footer.featuredBrands")}
              </Link>
            </li>
            <li>
              <Link to="/sets" className="footer__link">
                {t("footer.tryAndDiscover")}
              </Link>
            </li>
            <li>
              <Link to="/featured" className="footer__link warda-footer__collection-link">
                {t("footer.allFragrances")} →
              </Link>
            </li>
          </ul>
        </div>

        {/* NAVIGATION & SERVICE COLUMN */}
        <div className="warda-footer__col">
          <h4 className="warda-footer__heading">
            {t("footer.service")}
          </h4>
          <ul className="footer__links">
            <li>
              <Link to="/" className="footer__link">
                {t("footer.home")}
              </Link>
            </li>
            <li>
              <Link to="/about" className="footer__link">
                {t("footer.aboutWarda")}
              </Link>
            </li>
            <li>
              <Link to="/contacts" className="footer__link">
                {t("footer.contactBoutique") || t("footer.contactsBoutique")}
              </Link>
            </li>
            <li>
              <Link to="/orders" className="footer__link">
                {t("footer.trackOrder")}
              </Link>
            </li>
            <li>
              <Link to="/cart" className="footer__link">
                {t("footer.shoppingBag")}
              </Link>
            </li>
            <li>
              <Link to={accountPath} className="footer__link">
                {accountLabel}
              </Link>
            </li>
          </ul>
        </div>

        {/* CONTACT & PAYMENT COLUMN */}
        <div className="warda-footer__col">
          <h4 className="warda-footer__heading">
            {t("footer.contact") || t("footer.contacts")}
          </h4>
          <div className="warda-footer__info">
            <span className="warda-footer__info-item">
              <i className="ri-mail-line" />
              <a href="mailto:alwardaparfumes@gmail.com">alwardaparfumes@gmail.com</a>
            </span>
            <span className="warda-footer__info-item">
              <i className="ri-phone-line" />
              <a href="tel:+37368123456">+373 68 123 456</a>
            </span>
            <span className="warda-footer__info-item">
              <i className="ri-map-pin-line" />
              <span>{t("footer.location")}</span>
            </span>
          </div>

          <div className="warda-footer__payment-section">
            <span className="warda-footer__payment-title">
              {t("footer.acceptedPayments") || t("footer.payments")}
            </span>
            <div className="warda-footer__payment-icons">
              <span className="warda-payment-pill">VISA</span>
              <span className="warda-payment-pill">Mastercard</span>
              <span className="warda-payment-pill">Apple Pay</span>
              <span className="warda-payment-pill">Google Pay</span>
            </div>
          </div>
        </div>
      </div>

      <div className="footer__bottom container">
        <span className="footer__copy">
          © {new Date().getFullYear()} Al-Warda Parfumes. {t("footer.allRightsReserved") || t("footer.allRights")}
        </span>
        <span className="footer__tagline">
          ✦ Timeless Arabian Luxury Fragrances ✦
        </span>
      </div>
    </footer>
  );
}
