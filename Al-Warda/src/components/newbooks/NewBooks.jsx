import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { addToCart, getCart, removeFromCart } from "../../../utils/cart";
import { getCookieUser, isLoggedIn, isPrivileged } from "../../../utils/auth";
import getExchangeRate, { getCachedExchangeRate, DEFAULT_RATE } from "../../../utils/getExchangeRate";
import getNewBooks, { getCachedNewBooks } from "../../../utils/getNewBooks";
import BookImage from "../common/BookImage";
import decodeHtmlEntities from "../../../utils/decodeHtmlEntities";
import { useLanguage } from "../../context/languageContext";
import "./NewBooks.css";

function getEuroPrice(book, rate) {
  const price = Number(book.price);
  if (!Number.isFinite(price)) return null;
  if (book.currency === "EUR") return price;
  return rate ? price / rate : null;
}

function formatPrice(value, currency, language) {
  const locale = language === "ru" ? "ru-RU" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "EUR" ? 2 : 0,
  }).format(value);
}

export default function NewBooks() {
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const [data, setData] = useState(() => {
    const cached = getCachedNewBooks();
    if (!cached) return { updatedAt: null, products: [] };
    const products = Array.isArray(cached)
      ? cached
      : Array.isArray(cached?.products)
        ? cached.products
        : [];
    return { updatedAt: cached?.updatedAt ?? null, products };
  });
  const [status, setStatus] = useState(() => {
    const cached = getCachedNewBooks();
    if (!cached) return "loading";
    const products = Array.isArray(cached)
      ? cached
      : Array.isArray(cached?.products)
        ? cached.products
        : [];
    return products.length ? "ready" : "empty";
  });
  const [rate, setRate] = useState(() => getCachedExchangeRate() ?? DEFAULT_RATE);
  const [cartItems, setCartItems] = useState(() => new Map());
  const [quantities, setQuantities] = useState(() => new Map());
  const [pendingUrls, setPendingUrls] = useState(() => new Set());
  const [cartLoaded, setCartLoaded] = useState(false);
  const [addingUrls, setAddingUrls] = useState(() => new Set());
  const [cartError, setCartError] = useState("");
  const userId = getCookieUser()?.id;
  const needsCartCheck = isLoggedIn() && Boolean(userId);
  const cartReady = !needsCartCheck || cartLoaded;

  useEffect(() => {
    let cancelled = false;
    Promise.all([getNewBooks(), getExchangeRate().catch(() => null)])
      .then(([snapshot, exchangeRate]) => {
        if (cancelled) return;
        const products = Array.isArray(snapshot)
          ? snapshot
          : Array.isArray(snapshot?.products)
            ? snapshot.products
            : [];
        setData({
          updatedAt: snapshot?.updatedAt ?? null,
          products,
        });
        setRate(exchangeRate);
        setStatus(products.length ? "ready" : "empty");
      })
      .catch(() => !cancelled && setStatus("error"));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!needsCartCheck) return;
    let cancelled = false;
    getCart(userId)
      .then((items) => {
        if (cancelled) return;
        setCartItems(new Map(items.map((item) => [item.link, item])));
        setQuantities(
          new Map(
            items.map((item) => [
              item.link,
              Math.max(1, Number(item.quantity) || 1),
            ]),
          ),
        );
      })
      .catch((error) => !cancelled && setCartError(error.message))
      .finally(() => !cancelled && setCartLoaded(true));

    return () => {
      cancelled = true;
    };
  }, [needsCartCheck, userId]);

  const handleToggleCart = async (book) => {
    if (!isLoggedIn()) {
      navigate("/cart");
      return;
    }

    setCartError("");
    const cartItem = cartItems.get(book.url);
    if (cartItem) {
      setAddingUrls((current) => new Set(current).add(book.url));
      try {
        await removeFromCart(cartItem.id, userId);
        setCartItems((current) => {
          const next = new Map(current);
          next.delete(book.url);
          return next;
        });
        setQuantities((current) => new Map(current).set(book.url, 1));
        setPendingUrls((current) => {
          const next = new Set(current);
          next.delete(book.url);
          return next;
        });
      } catch (error) {
        setCartError(error.message);
      } finally {
        setAddingUrls((current) => {
          const next = new Set(current);
          next.delete(book.url);
          return next;
        });
      }
      return;
    }

    if (!pendingUrls.has(book.url)) {
      setQuantities((current) => new Map(current).set(book.url, 1));
      setPendingUrls((current) => new Set(current).add(book.url));
      return;
    }

    const euroPrice = getEuroPrice(book, rate);
    if (!userId || !Number.isFinite(euroPrice)) {
      setCartError("Could not determine the EUR price for this book.");
      return;
    }

    setAddingUrls((current) => new Set(current).add(book.url));
    try {
      const quantity = Math.max(
        1,
        Math.floor(Number(quantities.get(book.url)) || 1),
      );
      const inserted = await addToCart(
        {
          title: book.title,
          url: book.url,
          price: euroPrice,
          image: book.image,
          store: book.store || "librarius.md",
          quantity,
        },
        userId,
      );
      if (inserted) {
        setCartItems((current) => new Map(current).set(book.url, inserted));
        setQuantities((current) =>
          new Map(current).set(book.url, inserted.quantity ?? quantity),
        );
      }
      setPendingUrls((current) => {
        const next = new Set(current);
        next.delete(book.url);
        return next;
      });
    } catch (error) {
      setCartError(error.message);
    } finally {
      setAddingUrls((current) => {
        const next = new Set(current);
        next.delete(book.url);
        return next;
      });
    }
  };

  const { products, updatedAt } = data;

  return (
    <section className="new-books section container" id="new">
      <div className="new-books__header">
        <div>
          <h1 className="new-books__title">{t("newBooks.title")}</h1>
          {updatedAt && (
            <p className="new-books__info">
              {t("newBooks.updated")}{" "}
              {new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(updatedAt))}
            </p>
          )}
        </div>
        {products.length > 0 && (
          <span className="new-books__info">{products.length} {t("newBooks.arrivals")}</span>
        )}
      </div>

      {cartError && (
        <p className="new-books__cart-error" role="alert">
          {cartError}
        </p>
      )}

      {status === "loading" && (
        <div className="new-books__status">
          <div className="results__spinner" />
          <p>{t("newBooks.loading")}</p>
        </div>
      )}

      {status === "error" && (
        <div className="new-books__status">
          <p>{t("newBooks.error")}</p>
        </div>
      )}

      {status === "empty" && (
        <div className="new-books__status">
          <p>{t("newBooks.empty")}</p>
        </div>
      )}

      {status === "ready" && products.length > 0 && (
        <div className="new-books__grid">
          {products.map((book, index) => {
            const currency = "EUR";
            const price = rate ? (getEuroPrice(book, rate) ?? book.price) : book.price;
            const preview = {
              title: book.title,
              url: book.url,
              image: book.image,
              store: book.store || "librarius.md",
              price,
              currency,
            };
            const cartItem = cartItems.get(book.url);
            const quantity = Math.max(
              1,
              Number(quantities.get(book.url) ?? cartItem?.quantity) || 1,
            );
            const isBusy = addingUrls.has(book.url) || !cartReady;
            const isPending = pendingUrls.has(book.url);

            return (
              <article
                className="results__card new-books__card"
                key={`${book.url}-${index}`}
              >
                <Link
                  className="results__open"
                  to={`/book?url=${encodeURIComponent(book.url)}&source=new`}
                  state={{
                    book: preview,
                    query: book.title,
                    fromNew: true,
                  }}
                >
                  <BookImage
                    className="results__img"
                    src={book.image}
                    alt={book.title}
                    loading={index < 6 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={index < 4 ? "high" : "auto"}
                  />
                  <h2 className="results__title">{decodeHtmlEntities(book.title)}</h2>
                  {isPrivileged() && (
                    <span className="results__store">{book.store || "librarius.md"}</span>
                  )}
                  <span className="results__price">
                    {formatPrice(price, currency, language)}
                  </span>
                </Link>

                <div className="results__cart-actions">
                  {isPending && !cartItem && (
                    <div className="results__quantity-control">
                      <div className="results__quantity" aria-label="Quantity">
                        <button
                          type="button"
                          aria-label={`Decrease ${book.title} quantity`}
                          disabled={isBusy || quantity <= 1}
                          onClick={() =>
                            setQuantities((current) =>
                              new Map(current).set(book.url, quantity - 1),
                            )
                          }
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          aria-label={`${book.title} quantity`}
                          value={quantities.get(book.url) ?? quantity}
                          disabled={isBusy}
                          onChange={(event) =>
                            setQuantities((current) =>
                              new Map(current).set(
                                book.url,
                                event.target.value,
                              ),
                            )
                          }
                          onBlur={() =>
                            setQuantities((current) =>
                              new Map(current).set(
                                book.url,
                                Math.max(
                                  1,
                                  Math.floor(
                                    Number(current.get(book.url)) || 1,
                                  ),
                                ),
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          aria-label={`Increase ${book.title} quantity`}
                          disabled={isBusy}
                          onClick={() =>
                            setQuantities((current) =>
                              new Map(current).set(book.url, quantity + 1),
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                      <button
                        className="results__cart-confirm"
                        type="button"
                        aria-label={`Confirm adding ${book.title} to cart`}
                        title={t("cart.confirm")}
                        disabled={isBusy}
                        onClick={() => handleToggleCart(book)}
                      >
                        <i className="ri-check-line" />
                      </button>
                    </div>
                  )}

                  {(!isPending || cartItem) && (
                    <button
                      className="results__cart-button new-books__cart-button"
                      type="button"
                      disabled={isBusy}
                      title={cartItem ? t("cart.remove") : t("cart.addToCart")}
                      onClick={() => handleToggleCart(book)}
                    >
                      <i
                        className={
                          cartItem
                            ? "ri-check-line"
                            : "ri-shopping-basket-2-line"
                        }
                      />
                      {addingUrls.has(book.url)
                        ? cartItem
                          ? t("cart.removing")
                          : isPending
                            ? t("cart.adding")
                            : t("cart.addToCart")
                        : cartItem
                          ? t("cart.addedToCart")
                          : cartReady
                            ? t("cart.addToCart")
                            : t("cart.checking")}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
