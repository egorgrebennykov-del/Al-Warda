import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { getCurrentOrders, getCompletedOrders } from "../../../utils/orders";
import BookImage from "../common/BookImage";
import decodeHtmlEntities from "../../../utils/decodeHtmlEntities";
import { useLanguage } from "../../context/languageContext";
import "./Orders.css";

function formatPrice(price, currency, language) {
  const locale = language === "ru" ? "ru-RU" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: currency === "EUR" ? 2 : 0,
  }).format(price || 0);
}

function formatDate(dateString, language) {
  if (!dateString) return "";
  try {
    const locale = language === "ru" ? "ru-RU" : "en-US";
    return new Date(dateString).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

export default function Orders({ defaultTab = "current" }) {
  const { language, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { tab } = useParams();
  const { user, isLoggedIn: loggedIn } = useAuth();

  const isCompletedTab =
    tab === "completed" ||
    location.pathname.includes("/completed") ||
    defaultTab === "completed";
  const activeTab = isCompletedTab ? "completed" : "current";

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(loggedIn);

  useEffect(() => {
    if (!loggedIn || !user?.id) return;
    let cancelled = false;

    const fetcher = isCompletedTab ? getCompletedOrders : getCurrentOrders;
    fetcher(user.id)
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loggedIn, user?.id, isCompletedTab]);

  if (!loggedIn) {
    return (
      <section className="orders section container">
        <div className="orders__guest-card">
          <i className="ri-user-follow-line orders__guest-icon" />
          <h1 className="orders__title">{t("orders.title")}</h1>
          <p>{t("cart.guestDesc")}</p>
          <div className="orders__actions">
            <Link className="button" to={`/login?redirect=${encodeURIComponent(location.pathname)}`}>
              {t("auth.loginBtn")}
            </Link>
            <Link className="button button--ghost" to={`/sign-up?redirect=${encodeURIComponent(location.pathname)}`}>
              {t("auth.signUpBtn")}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="orders section container">
      <div className="orders__header">
        <h1 className="orders__title">
          <i className="ri-shopping-bag-3-line" />
          {t("orders.title")}
        </h1>

        <div className="orders__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "current"}
            className={`orders__tab ${activeTab === "current" ? "orders__tab--active" : ""}`}
            onClick={() => navigate("/orders/current")}
          >
            <i className="ri-time-line" />
            {t("orders.currentTab")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "completed"}
            className={`orders__tab ${activeTab === "completed" ? "orders__tab--active" : ""}`}
            onClick={() => navigate("/orders/completed")}
          >
            <i className="ri-checkbox-circle-line" />
            {t("orders.completedTab")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="orders__loading-wrap">
          <div className="orders__spinner" />
          <p>{t("orders.loading")}</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="orders__empty-card">
          <div className="orders__empty-icon-wrap">
            <i
              className={
                activeTab === "completed"
                  ? "ri-check-double-line"
                  : "ri-inbox-line"
              }
            />
          </div>
          <h2 className="orders__empty-title">
            {activeTab === "completed"
              ? t("orders.emptyCompleted")
              : t("orders.emptyCurrent")}
          </h2>
          <Link to="/featured" className="button">
            <i className="ri-book-open-line" />
            {t("orders.toCatalog")}
          </Link>
        </div>
      ) : (
        <div className="orders__list">
          {orders.map((order) => {
            const content = order.content || {};
            const items = Array.isArray(content.items) ? content.items : [];
            const address = content.address || {};
            const orderNum = content.orderNumber || order.id?.slice(0, 8);
            const isCompleted = (order.status || "").toLowerCase() === "completed";

            return (
              <div className="orders__card" key={order.id}>
                <div className="orders__card-header">
                  <div className="orders__meta-primary">
                    <span className="orders__number">
                      {t("orders.orderNumber")} <strong>#{orderNum}</strong>
                    </span>
                    <span className="orders__date">
                      {formatDate(order.created_at || content.createdAt, language)}
                    </span>
                  </div>

                  <div className="orders__status-wrap">
                    {isCompleted ? (
                      <span className="orders__badge orders__badge--completed">
                        <i className="ri-checkbox-circle-fill" />
                        {t("orders.statusCompleted")}
                      </span>
                    ) : (
                      <span className="orders__badge orders__badge--in-progress">
                        <i className="ri-time-line" />
                        {t("orders.statusInProgress")}
                      </span>
                    )}
                  </div>
                </div>

                {items.length > 0 && (
                  <div className="orders__items-list">
                    {items.map((item, idx) => (
                      <div className="orders__item" key={item.id || idx}>
                        <BookImage
                          className="orders__item-thumb"
                          src={item.image}
                          alt={item.title}
                        />
                        <div className="orders__item-info">
                          <span className="orders__item-title">
                            {decodeHtmlEntities(item.title)}
                          </span>
                          <span className="orders__item-qty">
                            {item.quantity} × {formatPrice(item.price, "EUR", language)}
                          </span>
                        </div>
                        <span className="orders__item-total">
                          {formatPrice(
                            (Number(item.price) || 0) * (Number(item.quantity) || 1),
                            "EUR",
                            language,
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="orders__card-footer">
                  <div className="orders__address-block">
                    <span className="orders__address-label">
                      <i className="ri-map-pin-line" />
                      {t("orders.deliveryAddress")}:
                    </span>
                    <p className="orders__address-text">
                      {address.recipientName && (
                        <strong>{address.recipientName}, </strong>
                      )}
                      {address.street}, {address.city}
                      {address.country ? `, ${address.country}` : ""}
                      {address.postalCode ? ` (${address.postalCode})` : ""}
                      {address.phone && (
                        <span className="orders__address-phone">
                          {" · "}
                          <i className="ri-phone-line" /> {address.phone}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="orders__total-block">
                    <span className="orders__total-label">{t("orders.total")}:</span>
                    <strong className="orders__total-value">
                      {formatPrice(
                        content.finalTotal || content.itemsSubtotal || 0,
                        "EUR",
                        language,
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
