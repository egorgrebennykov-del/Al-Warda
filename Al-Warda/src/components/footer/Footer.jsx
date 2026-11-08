import { Link } from "react-router";
import { isLoggedIn } from "../../../utils/auth";
import { useLanguage } from "../../context/languageContext";
import "./Footer.css";

export default function Footer() {
  const { language } = useLanguage();
  const isRu = language === "ru";
  const accountPath = isLoggedIn() ? "/profile" : "/login";
  const accountLabel = isLoggedIn() ? (isRu ? "Мой профиль" : "My Account") : (isRu ? "Войти в аккаунт" : "Sign In");

  return (
    <footer className="footer warda-footer">
      <div className="footer__container container">
        {/* BRAND & EMBLEM COLUMN */}
        <div className="warda-footer__col warda-footer__col--brand">
          <Link to="/" className="footer__brand" aria-label="Al-Warda Parfumes home">
            <img
              src="/assets/img/al-warda-header-logo.png"
              alt="Al-Warda Parfumes"
              className="footer__logo-image"
            />
          </Link>
          <p className="warda-footer__desc">
            {isRu
              ? "Дом эксклюзивной арабской парфюмерии. Оригинальные селективные ароматы прямиком из парфюмерных мануфактур Дубая и ОАЭ: редчайший уд, дамасская роза, золотая амбра и чувственный мускус."
              : "House of exclusive Arabian perfumery. Authentic niche creations sourced directly from premier master perfumers in Dubai and the UAE: precious oud, Damask rose, solar amber, and alluring white musk."}
          </p>

          <div className="warda-footer__badges">
            <span className="warda-footer__badge">
              <i className="ri-shield-check-line" />
              <span>{isRu ? "100% Оригинал" : "100% Authentic"}</span>
            </span>
            <span className="warda-footer__badge">
              <i className="ri-truck-line" />
              <span>{isRu ? "Быстрая доставка" : "Express Delivery"}</span>
            </span>
          </div>
        </div>

        {/* COLLECTIONS COLUMN */}
        <div className="warda-footer__col">
          <h4 className="warda-footer__heading">
            {isRu ? "КОЛЛЕКЦИИ" : "COLLECTIONS"}
          </h4>
          <ul className="footer__links">
            <li>
              <Link to="/featured?category=oud" className="footer__link">
                {isRu ? "Уд и Древесные" : "Oud & Woody"}
              </Link>
            </li>
            <li>
              <Link to="/featured?category=gourmand" className="footer__link">
                {isRu ? "Гурманские и Ваниль" : "Gourmand & Vanilla"}
              </Link>
            </li>
            <li>
              <Link to="/featured?category=floral" className="footer__link">
                {isRu ? "Цветочные и Роза" : "Floral & Rose"}
              </Link>
            </li>
            <li>
              <Link to="/featured?category=fresh" className="footer__link">
                {isRu ? "Свежие и Акватика" : "Fresh & Aquatic"}
              </Link>
            </li>
            <li>
              <Link to="/featured?brand=Lattafa,Armaf,Amouage,Arabian Oud" className="footer__link">
                {isRu ? "Популярные бренды" : "Featured Brands"}
              </Link>
            </li>
            <li>
              <Link to="/featured" className="footer__link warda-footer__collection-link">
                {isRu ? "Вся коллекция" : "All Fragrances"} →
              </Link>
            </li>
          </ul>
        </div>

        {/* NAVIGATION & SERVICE COLUMN */}
        <div className="warda-footer__col">
          <h4 className="warda-footer__heading">
            {isRu ? "СЕРВИС И БУТИК" : "SERVICE & BOUTIQUE"}
          </h4>
          <ul className="footer__links">
            <li>
              <Link to="/" className="footer__link">
                {isRu ? "Главная страница" : "Home"}
              </Link>
            </li>
            <li>
              <Link to="/testimonial" className="footer__link">
                {isRu ? "О бренде Al-Warda" : "About Al-Warda"}
              </Link>
            </li>
            <li>
              <Link to="/contacts" className="footer__link">
                {isRu ? "Контакты и бутик" : "Contact & Boutique"}
              </Link>
            </li>
            <li>
              <Link to="/orders" className="footer__link">
                {isRu ? "Отследить заказ" : "Track Order"}
              </Link>
            </li>
            <li>
              <Link to="/cart" className="footer__link">
                {isRu ? "Корзина покупок" : "Shopping Bag"}
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
            {isRu ? "КОНТАКТЫ" : "CONTACT"}
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
              <span>Chisinau / Dubai</span>
            </span>
          </div>

          <div className="warda-footer__payment-section">
            <span className="warda-footer__payment-title">
              {isRu ? "СПОСОБЫ ОПЛАТЫ" : "ACCEPTED PAYMENTS"}
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
          © {new Date().getFullYear()} Al-Warda Parfumes. {isRu ? "Все права защищены." : "All rights reserved."}
        </span>
        <span className="footer__tagline">
          ✦ Timeless Arabian Luxury Fragrances ✦
        </span>
      </div>
    </footer>
  );
}
