import { Link } from "react-router";
import { isLoggedIn } from "../../../utils/auth";
import { useLanguage } from "../../context/languageContext";
import "./Footer.css";

export default function Footer() {
  const { t, language } = useLanguage();
  const accountPath = isLoggedIn() ? "/profile" : "/login";
  const accountLabel = isLoggedIn() ? t("nav.profile") : t("nav.login");

  return (
    <footer className="footer warda-footer">
      <div className="footer__container container">
        <div className="warda-footer__col warda-footer__col--brand">
          <Link to="/" className="footer__brand" aria-label="Al-Warda Parfumes home">
            <img
              src="/assets/img/logo.png"
              alt="Al-Warda Parfumes"
              className="footer__logo-image"
            />
          </Link>
          <p className="warda-footer__desc">
            {language === "ru"
              ? "Шедевры восточной парфюмерии, созданные из редчайшего уда, драгоценного янтаря и роз Таифа. Воплощение арабской роскоши."
              : "Masterpieces of oriental perfumery crafted with the rarest oud, amber, and Taif roses. The pinnacle of Arabian luxury."}
          </p>
        </div>

        <div className="warda-footer__col">
          <h4 className="warda-footer__heading">
            {language === "ru" ? "КОЛЛЕКЦИИ" : "COLLECTIONS"}
          </h4>
          <ul className="footer__links">
            <li>
              <Link to="/featured?category=oud" className="footer__link">
                Oud Collection
              </Link>
            </li>
            <li>
              <Link to="/featured?category=floral" className="footer__link">
                Floral Collection
              </Link>
            </li>
            <li>
              <Link to="/featured?category=amber" className="footer__link">
                Amber Collection
              </Link>
            </li>
            <li>
              <Link to="/featured" className="footer__link">
                {language === "ru" ? "Все парфюмы" : "All Fragrances"}
              </Link>
            </li>
          </ul>
        </div>

        <div className="warda-footer__col">
          <h4 className="warda-footer__heading">
            {language === "ru" ? "НАВИГАЦИЯ" : "NAVIGATION"}
          </h4>
          <ul className="footer__links">
            <li>
              <Link to="/" className="footer__link">
                {language === "ru" ? "Главная" : "Home"}
              </Link>
            </li>
            <li>
              <Link to="/testimonial" className="footer__link">
                {language === "ru" ? "О бренде" : "About Us"}
              </Link>
            </li>
            <li>
              <Link to="/contacts" className="footer__link">
                {language === "ru" ? "Контакты" : "Contact"}
              </Link>
            </li>
            <li>
              <Link to="/cart" className="footer__link">
                {language === "ru" ? "Корзина" : "Shopping Bag"}
              </Link>
            </li>
            <li>
              <Link to={accountPath} className="footer__link">
                {accountLabel}
              </Link>
            </li>
          </ul>
        </div>

        <div className="warda-footer__col">
          <h4 className="warda-footer__heading">
            {language === "ru" ? "КОНТАКТЫ" : "CONTACT"}
          </h4>
          <p className="warda-footer__info">
            <span>alwardaparfumes@gmail.com</span>
            <span>+373 68 123 456</span>
            <span>Chisinau, Moldova</span>
          </p>
        </div>
      </div>

      <div className="footer__bottom container">
        <span className="footer__copy">
          © {new Date().getFullYear()} Al-Warda Parfumes. All rights reserved.
        </span>
        <span className="footer__tagline">
          Timeless Arabian Fragrances
        </span>
      </div>
    </footer>
  );
}
