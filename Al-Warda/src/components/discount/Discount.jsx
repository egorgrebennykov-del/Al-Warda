import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { addToCart, getCart, removeFromCart } from "../../../utils/cart";
import { getCookieUser, isLoggedIn, isPrivileged } from "../../../utils/auth";
import getExchangeRate, { getCachedExchangeRate, DEFAULT_RATE } from "../../../utils/getExchangeRate";
import getDiscountSnapshot, { getCachedDiscountSnapshot } from "../../../utils/getDiscountSnapshot";
import BookImage from "../common/BookImage";
import decodeHtmlEntities from "../../../utils/decodeHtmlEntities";
import { useLanguage } from "../../context/languageContext";
import "./Discount.css";

function formatPrice(value, currency, language) {
  const locale = language === "ru" ? "ru-RU" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "EUR" ? 2 : 0,
  }).format(value);
}

function normalizeSnapshot(value) {
  const source = typeof value === "string" ? JSON.parse(value) : value;
  const products = Array.isArray(source?.products) ? source.products : [];

  return {
    updatedAt: source?.updatedAt ?? source?.metadata?.dateDownloaded ?? null,
    products: products
      .map((book) => {
        const price = Number.parseFloat(
          String(book.price ?? "").replace(/[^\d.]/g, ""),
        );
        const regularPrice = Number.parseFloat(
          String(book.regularPrice ?? "").replace(/[^\d.]/g, ""),
        );
        const calculatedDiscount =
          Number.isFinite(price) && regularPrice > price
            ? Math.round((1 - price / regularPrice) * 100)
            : 0;

        return {
          ...book,
          title: decodeHtmlEntities(book.title ?? book.name ?? ""),
          image:
            book.image ?? book.mainImage?.url ?? book.images?.[0]?.url ?? "",
          price,
          regularPrice,
          currency: book.currency ?? "EUR",
          discountPercent: Number(book.discountPercent) || calculatedDiscount,
          store: book.store ?? "librarius.md",
        };
      })
      .filter(
        (book) =>
          book.title &&
          book.url &&
          book.image &&
          Number.isFinite(book.price) &&
          Number.isFinite(book.regularPrice) &&
          book.regularPrice > book.price,
      ),
  };
}

export default function Discount() {
  const { language, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const userId = getCookieUser()?.id;
  const needsCartCheck = isLoggedIn() && Boolean(userId);
  const [snapshot, setSnapshot] = useState(() => {
    const cached = getCachedDiscountSnapshot();
    return cached ? normalizeSnapshot(cached) : null;
  });
  const [rate, setRate] = useState(() => getCachedExchangeRate() ?? DEFAULT_RATE);
  const [error, setError] = useState("");
  const [cartItems, setCartItems] = useState(() => new Map());
  const [quantities, setQuantities] = useState(() => new Map());
  const [pendingUrls, setPendingUrls] = useState(() => new Set());
  const [cartLoaded, setCartLoaded] = useState(false);
  const [addingUrls, setAddingUrls] = useState(() => new Set());
  const [cartError, setCartError] = useState("");
  const cartReady = !needsCartCheck || cartLoaded;

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDiscountSnapshot(), getExchangeRate().catch(() => null)])
      .then(([data, exchangeRate]) => {
        if (cancelled) return;
        setSnapshot(normalizeSnapshot(data));
        setRate(exchangeRate);
      })
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!snapshot || !location.state?.restoreDiscountScroll) return;
    const savedScroll = Number(
      sessionStorage.getItem("kazbook-discount-scroll"),
    );
    sessionStorage.removeItem("kazbook-discount-scroll");
    if (!Number.isFinite(savedScroll)) return;
    requestAnimationFrame(() => window.scrollTo(0, savedScroll));
  }, [snapshot, location.state]);

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
      .catch((err) => !cancelled && setCartError(err.message))
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
      } catch (err) {
        setCartError(err.message);
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

    setAddingUrls((current) => new Set(current).add(book.url));
    try {
      const quantity = Math.max(
        1,
        Math.floor(Number(quantities.get(book.url)) || 1),
      );
      const activeRate = rate || 20.2;
      const euroPrice =
        book.currency === "EUR"
          ? Math.round(book.price * 100) / 100
          : Math.round((book.price / activeRate) * 100) / 100;
      const inserted = await addToCart(
        {
          title: book.title,
          url: book.url,
          price: euroPrice,
          currency: "EUR",
          image: book.image,
          store: book.store,
          quantity,
        },
        userId,
      );
      if (inserted) {
        setCartItems((current) => new Map(current).set(book.url, inserted));
        setQuantities((current) =>
          new Map(current).set(
            book.url,
            Math.max(1, Number(inserted.quantity) || quantity),
          ),
        );
        setPendingUrls((current) => {
          const next = new Set(current);
          next.delete(book.url);
          return next;
        });
      }
    } catch (err) {
      setCartError(err.message);
    } finally {
      setAddingUrls((current) => {
        const next = new Set(current);
        next.delete(book.url);
        return next;
      });
    }
  };

  if (error) {
    return (
      <section className="deals section container">
        <div className="deals__state deals__error">{error}</div>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="deals section container">
        <div className="deals__state">{t("discount.loading")}</div>
      </section>
    );
  }

  const products = snapshot.products ?? [];

  return (
    <section className="deals section container">
      <div className="deals__heading">
        <div>
          <h1 className="deals__title">{t("discount.title")}</h1>
          {snapshot.updatedAt && (
            <p className="deals__updated">
              {t("discount.updated")}{" "}
              {new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-GB").format(
                new Date(snapshot.updatedAt),
              )}
            </p>
          )}
        </div>
        <span className="deals__updated">{products.length} {t("discount.offers")}</span>
      </div>
      {cartError && (
        <p className="results__cart-error" role="alert">
          {cartError}
        </p>
      )}

      {products.length === 0 ? (
        <div className="deals__state">
          {t("discount.empty")}
        </div>
      ) : (
        <div className="deals__grid">
          {products.map((book, index) => {
            const activeRate = rate || 20.2;
            const currency = "EUR";
            const price = Math.round((book.price / activeRate) * 100) / 100;
            const regularPrice = Math.round((book.regularPrice / activeRate) * 100) / 100;
            const preview = {
              title: book.title,
              url: book.url,
              image: book.image,
              store: book.store,
              price,
              currency,
            };
            const cartItem = cartItems.get(book.url);
            const quantity = Math.max(
              1,
              Number(quantities.get(book.url) ?? cartItem?.quantity) || 1,
            );
            const isBusy = addingUrls.has(book.url) || !cartReady;
            const canAddToCart = true;
            const isPending = pendingUrls.has(book.url);

            return (
              <article className="results__card deals__card" key={book.url}>
                <Link
                  className="deals__book-link"
                  to={`/book?url=${encodeURIComponent(book.url)}&q=${encodeURIComponent(book.title)}`}
                  state={{
                    book: preview,
                    query: book.title,
                    fromDiscount: true,
                  }}
                  onClick={() =>
                    sessionStorage.setItem(
                      "kazbook-discount-scroll",
                      String(window.scrollY),
                    )
                  }
                >
                  <div className="deals__image-wrap">
                    <BookImage
                      className="results__img deals__image"
                      src={book.image}
                      alt={book.title}
                      loading={index < 6 ? "eager" : "lazy"}
                      decoding="async"
                      fetchPriority={index < 4 ? "high" : "auto"}
                    />
                    <span className="deals__badge">
                      -{book.discountPercent}%
                    </span>
                  </div>
                  <h3 className="results__title deals__book-title">
                    {book.title}
                  </h3>
                  {isPrivileged() && book.store && (
                    <span className="results__store deals__store">
                      {book.store}
                    </span>
                  )}
                  <div className="deals__prices">
                    <strong className="results__price deals__price">
                      {formatPrice(price, currency, language)}
                    </strong>
                    <span className="deals__regular-price">
                      {formatPrice(regularPrice, currency, language)}
                    </span>
                  </div>
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
                        disabled={isBusy || !canAddToCart}
                        onClick={() => handleToggleCart(preview)}
                      >
                        <i className="ri-check-line" />
                      </button>
                    </div>
                  )}
                  {(!isPending || cartItem) && (
                    <button
                      className="results__cart-button"
                      type="button"
                      disabled={isBusy || (!cartItem && !canAddToCart)}
                      title={cartItem ? t("cart.remove") : t("cart.addToCart")}
                      onClick={() => handleToggleCart(preview)}
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
