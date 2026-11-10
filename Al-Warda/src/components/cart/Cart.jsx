import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  getCart,
  removeFromCart,
  updateQuantity,
} from "../../../utils/cart";
import { useLanguage } from "../../context/languageContext";
import { useCurrency } from "../../context/currencyContext";
import { useAuth } from "../../context/AuthContext";
import "./Cart.css";

function formatPerfumeCount(count, language = "ru") {
  const n = Math.abs(Number(count) || 0);
  if (language === "ru") {
    const mod100 = n % 100;
    const mod10 = n % 10;
    if (mod100 >= 11 && mod100 <= 19) return `${n} парфюмов`;
    if (mod10 === 1) return `${n} парфюм`;
    if (mod10 >= 2 && mod10 <= 4) return `${n} парфюма`;
    return `${n} парфюмов`;
  }
  if (language === "bg") {
    return `${n} ${n === 1 ? "парфюм" : "парфюма"}`;
  }
  if (language === "hu") {
    return `${n} parfüm`;
  }
  if (language === "el") {
    return `${n} ${n === 1 ? "άρωμα" : "αρώματα"}`;
  }
  if (language === "ro") {
    return `${n} ${n === 1 ? "parfum" : "parfumuri"}`;
  }
  return `${n} ${n === 1 ? "perfume" : "perfumes"}`;
}

export default function Cart({ onSearch }) {
  const { language, t } = useLanguage();
  const { formatPrice } = useCurrency();
  const location = useLocation();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadItems = async () => {
    try {
      setLoading(true);
      const rows = await getCart(user?.id);
      setItems(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    const onUpdated = () => loadItems();
    window.addEventListener("alwarda-cart-updated", onUpdated);
    return () => window.removeEventListener("alwarda-cart-updated", onUpdated);
  }, [user?.id]);

  const handleRemove = async (id) => {
    setError("");
    try {
      await removeFromCart(id, user?.id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleQty = async (itemId, newQty) => {
    if (newQty < 1) return;
    try {
      await updateQuantity(itemId, newQty, user?.id);
      setItems((current) =>
        current.map((item) =>
          item.id === itemId ? { ...item, quantity: newQty } : item
        )
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const totalItems = items.reduce(
    (total, item) => total + Math.max(1, Number(item.quantity) || 1),
    0
  );

  const totalPrice = items.reduce((total, item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const p = Number(item.price) || 0;
    return total + p * qty;
  }, 0);

  return (
    <section className="cart section container warda-cart-page">
      <div className="cart__heading">
        <div>
          <h1 className="cart__title">
            {t("cart.yourBag")}
          </h1>
          <p className="cart__count">
            {loading
              ? t("cart.loading")
              : formatPerfumeCount(totalItems, language)}
          </p>
        </div>
        {!loading && items.length > 0 && (
          <Link to="/checkout" className="warda-btn cart__order-btn">
            <i className="ri-shopping-bag-3-line" />
            <span>{t("cart.checkoutBtn")}</span>
          </Link>
        )}
      </div>

      {error && (
        <p className="cart__error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="cart__loading" />
      ) : items.length === 0 ? (
        <div className="cart__empty">
          <i className="ri-shopping-bag-line" style={{ fontSize: "3rem", color: "#c5a059" }} />
          <p style={{ marginTop: "1rem", fontSize: "1.1rem" }}>
            {t("cart.bagEmpty")}
          </p>
          <Link to="/featured" className="warda-btn" style={{ marginTop: "1.5rem" }}>
            {t("cart.explore")}
          </Link>
        </div>
      ) : (
        <div className="cart__list">
          {items.map((item) => {
            const quantity = Math.max(1, Number(item.quantity) || 1);
            const unitPrice = Number(item.price) || 0;
            return (
              <article className="cart__item" key={item.id}>
                <Link
                  className="cart__book-link"
                  to={item.link || `/book/${item.perfume_id || "raghba"}`}
                >
                  {item.image && <img
                    className="cart__image"
                    src={item.image}
                    alt={item.title || ""}
                    onError={(e) => { e.currentTarget.hidden = true; }}
                  />}
                  <span className="cart__book-info">
                    <strong style={{ fontFamily: "var(--second-font)", color: "#f7ede2" }}>
                      {item.title}
                    </strong>
                  </span>
                </Link>

                <div className="cart__quantity" aria-label="Quantity">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={quantity <= 1}
                    onClick={() => handleQty(item.id, quantity - 1)}
                  >
                    −
                  </button>
                  <span style={{ padding: "0 0.8rem", color: "#f7ede2", fontWeight: "600" }}>
                    {quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => handleQty(item.id, quantity + 1)}
                  >
                    +
                  </button>
                </div>

                <div className="cart__price-block">
                  <strong className="cart__price" style={{ color: "#d4af37" }}>
                    {formatPrice(unitPrice * quantity)}
                  </strong>
                  <small className="cart__unit-price" style={{ color: "#8c7e6c" }}>
                    {formatPrice(unitPrice)} {t("cart.eachItem")}
                  </small>
                </div>

                <button
                  className="cart__remove"
                  type="button"
                  aria-label="Remove item"
                  onClick={() => handleRemove(item.id)}
                >
                  <i className="ri-delete-bin-line" />
                </button>
              </article>
            );
          })}

          <div className="warda-cart-total" style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1.5rem",
            background: "#0c0906",
            border: "1px solid rgba(197, 160, 89, 0.3)",
            marginTop: "1.5rem"
          }}>
            <div>
              <span style={{ color: "#a89882", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {t("cart.totalAmount")}
              </span>
              <div style={{ fontFamily: "var(--second-font)", fontSize: "1.8rem", color: "#d4af37", fontWeight: "600" }}>
                {formatPrice(totalPrice)}
              </div>
            </div>
            <Link to="/checkout" className="warda-btn">
              {t("cart.checkoutBtn")}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
