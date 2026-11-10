import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { clearCart, getCart } from "../../../utils/cart";
import {
  deleteUserAddress,
  deleteUserPhone,
  getCookieUser,
  getProfile,
  getUserAddresses,
  getUserPhones,
  isLoggedIn,
  isPrivileged,
  saveUserAddress,
  saveUserPhone,
} from "../../../utils/auth";
import { createOrderInProgress } from "../../../utils/orders";
import {
  getCouponByCode,
  redeemCoupon,
  validateCouponForCart,
} from "../../../utils/coupons";
import BookImage from "../common/BookImage";
import decodeHtmlEntities from "../../../utils/decodeHtmlEntities";
import { useLanguage } from "../../context/languageContext";
import { useCurrency } from "../../context/currencyContext";
import { useConfirm } from "../../context/ConfirmContext";
import { useAuth } from "../../context/AuthContext";
import PhoneInput from "../common/PhoneInput";
import {
  findCountryByPhone,
  normalizePhone,
  stripCountryCodeAndLeadingZero,
} from "../../../utils/phone.js";
import { countries } from "./countryPhoneCodes.js";
import "./Checkout.css";

// Base shipping calculation - can be customized by the user with any formula
function calculateShipping(address) {
  if (!address) return 0;
  const hasCityOrStreet = Boolean(
    (address.city && address.city.trim().length > 0) ||
      (address.street && address.street.trim().length > 0),
  );
  if (!hasCityOrStreet) return 0;
  // Default delivery fee in EUR (user will customize this later)
  return 5.0;
}

function generateOrderNumber() {
  return `AW-${Math.floor(100000 + Math.random() * 900000)}`;
}

function formatPrice(price, currency, language) {
  const locale = language === "ru" ? "ru-RU" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: currency === "EUR" ? 2 : 0,
  }).format(price);
}

export default function Checkout() {
  const { language, t } = useLanguage();
  const { currency, formatPrice: currencyFormatPrice } = useCurrency();
  const formatPrice = (price) => currencyFormatPrice(price);
  const { user, isLoggedIn: loggedIn } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(loggedIn);
  const [error, setError] = useState("");

  // Step 1: books list review; Step 2: address & payment
  const [step, setStep] = useState(1);

  // Address state
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [loadingAddresses, setLoadingAddresses] = useState(loggedIn);
  const [selectedAddressId, setSelectedAddressId] = useState("new");
  const [saveAddressOption, setSaveAddressOption] = useState(true);
  const [addressForm, setAddressForm] = useState({
    recipientName: "",
    country: "",
    city: "",
    street: "",
    postalCode: "",
  });
  const [addressError, setAddressError] = useState("");

  // Country selector & phone state (defaults to Italy "IT")
  const [selectedCountryIso, setSelectedCountryIso] = useState("IT");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [usePrimaryPhone, setUsePrimaryPhone] = useState(false);
  const [savedPhones, setSavedPhones] = useState([]);

  // Coupon state
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [couponValidating, setCouponValidating] = useState(false);

  const selectedCountry = useMemo(
    () => countries.find((c) => c.iso2 === selectedCountryIso) || countries.find((c) => c.iso2 === "IT") || countries[0],
    [selectedCountryIso],
  );

  const handleTogglePrimaryPhone = (e) => {
    const checked = e.target.checked;
    setUsePrimaryPhone(checked);
    if (checked) {
      if (primaryPhone) {
        const matched = findCountryByPhone(primaryPhone);
        if (matched) {
          setSelectedCountryIso(matched.iso2);
          const sub = stripCountryCodeAndLeadingZero(primaryPhone, matched.dialCode);
          setPhoneNumber(sub);
        } else {
          setPhoneNumber(primaryPhone);
        }
      }
    } else {
      setPhoneNumber("");
      setSelectedCountryIso("IT");
    }
  };

  const handlePhoneInputChange = (newSubscriber) => {
    setPhoneNumber(newSubscriber);
    if (primaryPhone) {
      const full = newSubscriber.trim()
        ? `${selectedCountry.dialCode} ${newSubscriber.trim()}`
        : "";
      const isMatch =
        Boolean(full) &&
        normalizePhone(full) === normalizePhone(primaryPhone);
      setUsePrimaryPhone(isMatch);
    }
  };

  const handleCountryInputChange = (newIso) => {
    setSelectedCountryIso(newIso);
    if (primaryPhone) {
      const c = countries.find((item) => item.iso2 === newIso) || countries[0];
      const full = phoneNumber.trim()
        ? `${c.dialCode} ${phoneNumber.trim()}`
        : "";
      const isMatch =
        Boolean(full) &&
        normalizePhone(full) === normalizePhone(primaryPhone);
      setUsePrimaryPhone(isMatch);
    }
  };

  const handleSelectSavedPhone = (savedNumber) => {
    if (primaryPhone) {
      const isMatch =
        normalizePhone(savedNumber) === normalizePhone(primaryPhone);
      setUsePrimaryPhone(isMatch);
    }
  };

  const handleDeleteSavedPhone = async (phoneToDelete) => {
    if (!user?.id) return;
    const ok = await confirm({
      title: language === "ru" ? "Удалить номер телефона?" : "Delete Phone Number?",
      message: `${language === "ru" ? "Удалить сохранённый номер" : "Delete saved phone"} ${phoneToDelete}?`,
      confirmText: language === "ru" ? "Удалить" : "Delete",
      type: "danger",
    });
    if (!ok) return;

    try {
      const updated = await deleteUserPhone(user.id, phoneToDelete);
      setSavedPhones(updated);
      if (normalizePhone(phoneToDelete) === normalizePhone(primaryPhone)) {
        setPrimaryPhone(updated[0] || "");
      }
    } catch (err) {
      console.error("Could not delete phone:", err);
    }
  };

  // Order completion state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderComplete, setOrderComplete] = useState(null);

  // Load cart items & user profile
  useEffect(() => {
    let cancelled = false;

    if (!loggedIn) {
      getCart(null)
        .then((cartRows) => {
          if (!cancelled) setItems(cartRows);
        })
        .catch((err) => !cancelled && setError(err.message))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }

    Promise.all([
      getCart(user?.id),
      getProfile(),
      getUserPhones(user?.id),
    ])
      .then(([cartRows, profile, fetchedPhones]) => {
        if (cancelled) return;
        setItems(cartRows);
        if (profile?.firstName || profile?.lastName) {
          const defaultName = `${profile.firstName || ""} ${profile.lastName || ""}`.trim();
          setAddressForm((current) => ({
            ...current,
            recipientName: current.recipientName || defaultName,
          }));
        }

        const phoneList =
          fetchedPhones && fetchedPhones.length > 0
            ? fetchedPhones
            : (profile?.phones || []);
        setSavedPhones(phoneList);

        const primaryRaw = (profile?.phone || phoneList[0] || "").trim();
        if (primaryRaw) {
          setPrimaryPhone(primaryRaw);
          setUsePrimaryPhone(true);
          const matched = findCountryByPhone(primaryRaw);
          if (matched) {
            setSelectedCountryIso(matched.iso2);
            const sub = stripCountryCodeAndLeadingZero(primaryRaw, matched.dialCode);
            setPhoneNumber(sub);
          } else {
            setPhoneNumber(primaryRaw);
          }
        }
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [loggedIn, user?.id]);

  // Load user saved addresses from Supabase user.adresses JSON column
  useEffect(() => {
    if (!loggedIn || !user?.id) return;
    let cancelled = false;

    getUserAddresses(user.id)
      .then((addresses) => {
        if (cancelled) return;
        setSavedAddresses(addresses);
        if (addresses.length > 0) {
          setSelectedAddressId(addresses[0].id);
        } else {
          setSelectedAddressId("new");
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingAddresses(false));

    return () => {
      cancelled = true;
    };
  }, [loggedIn, user?.id]);

  if (!loggedIn) {
    return (
      <section className="checkout section container">
        <div className="checkout__guest">
          <i className="ri-shopping-bag-3-line checkout__guest-icon" />
          <h1 className="checkout__title">{t("checkout.title")}</h1>
          <p>{t("cart.guestDesc")}</p>
          <div className="checkout__actions">
            <Link className="button" to="/login?redirect=%2Fcheckout">
              {t("auth.loginBtn")}
            </Link>
            <Link className="checkout__signup" to="/sign-up?redirect=%2Fcheckout">
              {t("auth.signUpBtn")}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // Calculate items subtotal
  const itemsSubtotal = items.reduce((acc, book) => {
    const qty = Math.max(1, Number(book.quantity) || 1);
    const unitPrice = Number(book.price) || 0;
    return acc + unitPrice * qty;
  }, 0);

  // Active address determination
  const selectedSavedAddress =
    selectedAddressId !== "new"
      ? savedAddresses.find((a) => a.id === selectedAddressId)
      : null;

  const fullPhone = phoneNumber.trim()
    ? `${selectedCountry.dialCode} ${phoneNumber.trim()}`
    : "";

  const currentAddress = selectedSavedAddress || addressForm;

  // Shipping cost calculation based on address
  const baseShippingCost = calculateShipping(currentAddress);
  const hasValidAddress = Boolean(
    (currentAddress.city && currentAddress.city.trim().length > 0) &&
      (currentAddress.street && currentAddress.street.trim().length > 0),
  );

  // Validate coupon against current cart & address state
  const couponValidation = useMemo(() => {
    if (!appliedCoupon) return null;
    return validateCouponForCart({
      coupon: appliedCoupon,
      itemsSubtotal,
      shippingCost: baseShippingCost,
      user,
      language,
    });
  }, [appliedCoupon, itemsSubtotal, baseShippingCost, user, language]);

  const isFreeShipping = Boolean(
    couponValidation?.valid && couponValidation?.isFreeShipping,
  );
  const effectiveShipping = isFreeShipping ? 0 : baseShippingCost;
  const couponDeduction = couponValidation?.valid
    ? couponValidation.deduction || 0
    : 0;

  // The actual final total:
  // If free shipping, base shipping is waived (effectiveShipping = 0).
  // If percent/fixed, couponDeduction is subtracted from items total.
  const finalTotal = Math.max(
    0,
    itemsSubtotal + effectiveShipping - (isFreeShipping ? 0 : couponDeduction),
  );

  const handleApplyCoupon = async (e) => {
    if (e) e.preventDefault();
    const code = couponCodeInput.trim().toUpperCase();
    if (!code) return;

    setCouponError("");
    setCouponValidating(true);
    try {
      const coupon = await getCouponByCode(code);
      if (!coupon) {
        setCouponError(t("checkout.couponErrorNotFound"));
        setAppliedCoupon(null);
        return;
      }
      const val = validateCouponForCart({
        coupon,
        itemsSubtotal,
        shippingCost: baseShippingCost,
        user,
        language,
      });
      if (!val.valid) {
        setCouponError(val.error || t("checkout.couponErrorNotFound"));
        setAppliedCoupon(null);
        return;
      }
      setAppliedCoupon(coupon);
      setCouponError("");
    } catch (err) {
      setCouponError(err.message || t("checkout.couponErrorNotFound"));
      setAppliedCoupon(null);
    } finally {
      setCouponValidating(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCodeInput("");
    setCouponError("");
  };

  // Handle continuing from books list to address step
  const handleContinueToAddress = () => {
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Handle address deletion
  const handleDeleteAddress = async (id, e) => {
    e.stopPropagation();
    const ok = await confirm({
      title: language === "ru" ? "Удалить адрес?" : "Delete Address?",
      message:
        language === "ru"
          ? "Вы действительно хотите удалить этот сохранённый адрес доставки?"
          : "Are you sure you want to delete this saved delivery address?",
      confirmText: language === "ru" ? "Удалить адрес" : "Delete Address",
      type: "danger",
    });
    if (!ok) return;

    try {
      const updated = await deleteUserAddress(user.id, id);
      setSavedAddresses(updated);
      if (selectedAddressId === id) {
        if (updated.length > 0) {
          setSelectedAddressId(updated[0].id);
        } else {
          setSelectedAddressId("new");
        }
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle payment and order placement
  const handlePay = async () => {
    setAddressError("");
    setError("");

    // Validate address if typing a new one
    if (selectedAddressId === "new") {
      if (!addressForm.city.trim() || !addressForm.street.trim()) {
        setAddressError(t("checkout.fillRequired"));
        return;
      }
    }

    if (!phoneNumber.trim()) {
      setAddressError(t("checkout.phoneRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      let finalShippingAddress = currentAddress;

      // Save address if user opted in for new address (saves address only, not phone)
      if (selectedAddressId === "new" && saveAddressOption) {
        try {
          const addressToSave = {
            recipientName: addressForm.recipientName.trim(),
            country: addressForm.country.trim(),
            city: addressForm.city.trim(),
            street: addressForm.street.trim(),
            postalCode: addressForm.postalCode.trim(),
          };
          if (user?.id) {
            const saved = await saveUserAddress(user.id, addressToSave);
            finalShippingAddress = saved;
          }
        } catch {
          // Continue even if saving address fails
        }
      }

      // Save phone to user's phone list if not already saved
      if (fullPhone && user?.id) {
        try {
          const updatedPhones = await saveUserPhone(user.id, fullPhone);
          setSavedPhones(updatedPhones);
        } catch {
          // Continue even if saving phone fails
        }
      }

      // Generate order ID
      const orderNumber = generateOrderNumber();

      const finalOrderAddress = {
        ...finalShippingAddress,
        phone: fullPhone,
      };

      // Record order in Supabase orders_in_progress
      await createOrderInProgress({
        userId: user?.id || null,
        orderNumber,
        currency,
        items,
        address: finalOrderAddress,
        itemsSubtotal,
        shippingCost: effectiveShipping,
        finalTotal,
        coupon: appliedCoupon
          ? {
              id: appliedCoupon.id,
              code: appliedCoupon.code,
              name: appliedCoupon.name || "",
              deduction: isFreeShipping ? baseShippingCost : couponDeduction,
              type: appliedCoupon.action?.type,
            }
          : null,
      });

      // Increment coupon usage count if coupon applied
      if (appliedCoupon?.id && user?.id) {
        try {
          await redeemCoupon(appliedCoupon.id, user.id);
        } catch (couponErr) {
          console.warn("Could not redeem coupon:", couponErr);
        }
      }

      // Clear the cart
      await clearCart(user?.id);

      // Record successful order
      setOrderComplete({
        orderNumber,
        items: [...items],
        address: finalOrderAddress,
        itemsSubtotal,
        shippingCost: effectiveShipping,
        finalTotal,
        coupon: appliedCoupon
          ? {
              code: appliedCoupon.code,
              deduction: isFreeShipping ? baseShippingCost : couponDeduction,
              isFreeShipping,
            }
          : null,
        date: new Date(),
      });
      setItems([]);
    } catch (err) {
      setError(err.message || "Failed to process payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Order confirmation view
  if (orderComplete) {
    return (
      <section className="checkout section container">
        <div className="checkout__success-card">
          <div className="checkout__success-badge">
            <i className="ri-check-line" />
          </div>
          <h1 className="checkout__success-title">{t("checkout.successTitle")}</h1>
          <p className="checkout__success-desc">{t("checkout.successDesc")}</p>

          <div className="checkout__order-meta">
            <div className="checkout__order-info-item">
              <span className="checkout__meta-label">{t("checkout.orderNumber")}:</span>
              <strong>#{orderComplete.orderNumber}</strong>
            </div>
            <div className="checkout__order-info-item">
              <span className="checkout__meta-label">{t("checkout.deliveryAddress")}:</span>
              <span>
                {orderComplete.address.recipientName && (
                  <strong>{orderComplete.address.recipientName}, </strong>
                )}
                {orderComplete.address.street}, {orderComplete.address.city}
                {orderComplete.address.country ? `, ${orderComplete.address.country}` : ""}
                {orderComplete.address.postalCode ? ` (${orderComplete.address.postalCode})` : ""}
              </span>
            </div>
            <div className="checkout__order-info-item">
              <span className="checkout__meta-label">{t("checkout.finalTotal")}:</span>
              <strong className="checkout__meta-total">
                {formatPrice(orderComplete.finalTotal, "EUR", language)}
              </strong>
            </div>
            {orderComplete.coupon && (
              <div className="checkout__order-info-item">
                <span className="checkout__meta-label">{t("checkout.couponDiscount")}:</span>
                <span className="checkout__order-coupon-used">
                  <i className="ri-coupon-3-line" /> {orderComplete.coupon.code}
                  {orderComplete.coupon.isFreeShipping
                    ? ` (${t("checkout.couponFreeShipping")})`
                    : ` (-${formatPrice(orderComplete.coupon.deduction, "EUR", language)})`}
                </span>
              </div>
            )}
          </div>

          <div className="checkout__success-items">
            {orderComplete.items.map((item) => (
              <div className="checkout__success-item" key={item.id}>
                <BookImage
                  className="checkout__success-thumb"
                  src={item.image}
                  alt={item.title}
                />
                <div className="checkout__success-item-info">
                  <span className="checkout__success-item-title">
                    {decodeHtmlEntities(item.title)}
                  </span>
                  <small className="checkout__success-item-meta">
                    {item.quantity} × {formatPrice(item.price, "EUR", language)}
                  </small>
                </div>
                <strong className="checkout__success-item-price">
                  {formatPrice(item.price * item.quantity, "EUR", language)}
                </strong>
              </div>
            ))}
          </div>

          <div className="checkout__success-actions">
            <button
              type="button"
              className="button"
              onClick={() => navigate("/")}
            >
              <i className="ri-home-4-line" />
              {t("checkout.toHome")}
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => navigate("/featured")}
            >
              <i className="ri-book-open-line" />
              {t("checkout.toCatalog")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="checkout section container">
      <div className="checkout__heading">
        <div>
          <h1 className="checkout__title">{t("checkout.title")}</h1>
          <div className="checkout__steps-indicator">
            <button
              type="button"
              className={`checkout__step-tab ${step === 1 ? "checkout__step-tab--active" : ""}`}
              onClick={() => setStep(1)}
            >
              1. {t("checkout.booksTitle")}
            </button>
            <span className="checkout__step-divider">›</span>
            <button
              type="button"
              className={`checkout__step-tab ${step === 2 ? "checkout__step-tab--active" : ""}`}
              onClick={() => items.length > 0 && setStep(2)}
              disabled={items.length === 0}
            >
              2. {t("checkout.addressTitle")}
            </button>
          </div>
        </div>
        <Link to="/cart" className="checkout__back-link">
          <i className="ri-arrow-left-line" />
          {t("checkout.backToCart")}
        </Link>
      </div>

      {error && (
        <p className="checkout__error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="checkout__loading" aria-label={t("cart.loading")} />
      ) : items.length === 0 ? (
        <div className="checkout__empty">
          <i className="ri-shopping-basket-line" />
          <h2>{t("checkout.emptyCart")}</h2>
          <Link to="/cart" className="button">
            {t("checkout.backToCart")}
          </Link>
        </div>
      ) : (
        <div className="checkout__content">
          {/* STEP 1: Books List & Subtotal */}
          {step === 1 && (
            <div className="checkout__step-container">
              <h2 className="checkout__section-title">
                <i className="ri-book-2-line" />
                {t("checkout.booksTitle")}
              </h2>

              <div className="checkout__items-list">
                {items.map((book) => {
                  const qty = Math.max(1, Number(book.quantity) || 1);
                  const unitPrice = Number(book.price) || 0;
                  const itemTotal = unitPrice * qty;

                  return (
                    <article className="checkout__item-card" key={book.id}>
                      <BookImage
                        className="checkout__item-img"
                        src={book.image}
                        alt={book.title || ""}
                      />
                      <div className="checkout__item-details">
                        <strong className="checkout__item-title">
                          {decodeHtmlEntities(book.title)}
                        </strong>
                        {isPrivileged(user) && book.shop && (
                          <span className="checkout__item-shop">{book.shop}</span>
                        )}
                        <div className="checkout__item-qty-row">
                          <span className="checkout__item-unit-price">
                            {formatPrice(unitPrice, "EUR", language)} × {qty}
                          </span>
                        </div>
                      </div>
                      <div className="checkout__item-total-col">
                        <strong className="checkout__item-total">
                          {formatPrice(itemTotal, "EUR", language)}
                        </strong>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Subtotal & Continue Button */}
              <div className="checkout__subtotal-card">
                <div className="checkout__subtotal-row">
                  <span className="checkout__subtotal-label">
                    {t("checkout.subtotal")}
                  </span>
                  <strong className="checkout__subtotal-value">
                    {formatPrice(itemsSubtotal, "EUR", language)}
                  </strong>
                </div>
                <button
                  type="button"
                  className="button checkout__continue-btn"
                  onClick={handleContinueToAddress}
                >
                  {t("checkout.continue")}
                  <i className="ri-arrow-right-line" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Address Entry/Selection & Shipping & Payment */}
          {step === 2 && (
            <div className="checkout__step-container">
              <div className="checkout__address-step-header">
                <h2 className="checkout__section-title">
                  <i className="ri-map-pin-line" />
                  {t("checkout.addressTitle")}
                </h2>
                <button
                  type="button"
                  className="checkout__back-btn"
                  onClick={() => setStep(1)}
                >
                  <i className="ri-arrow-left-s-line" />
                  {t("checkout.back")}
                </button>
              </div>

              {/* Saved Addresses list if any exist */}
              {loadingAddresses ? (
                <div className="checkout__addresses-loading">
                  <div className="checkout__spinner" />
                </div>
              ) : savedAddresses.length > 0 ? (
                <div className="checkout__saved-section">
                  <h3 className="checkout__subset-title">
                    {t("checkout.savedAddresses")}
                  </h3>
                  <div className="checkout__saved-grid">
                    {savedAddresses.map((addr) => {
                      const isSelected = selectedAddressId === addr.id;
                      return (
                        <label
                          key={addr.id}
                          className={`checkout__address-card ${isSelected ? "checkout__address-card--selected" : ""}`}
                          onClick={() => setSelectedAddressId(addr.id)}
                        >
                          <div className="checkout__address-radio-wrap">
                            <input
                              type="radio"
                              name="checkoutAddress"
                              checked={isSelected}
                              onChange={() => setSelectedAddressId(addr.id)}
                            />
                          </div>
                          <div className="checkout__address-card-body">
                            {addr.recipientName && (
                              <strong className="checkout__address-name">
                                {addr.recipientName}
                              </strong>
                            )}
                            <p className="checkout__address-line">
                              {addr.street}, {addr.city}
                              {addr.country ? `, ${addr.country}` : ""}
                            </p>
                            {addr.postalCode && (
                              <span className="checkout__address-postal">
                                {addr.postalCode}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="checkout__address-delete-btn"
                            title={t("checkout.deleteAddress")}
                            aria-label={t("checkout.deleteAddress")}
                            onClick={(e) => handleDeleteAddress(addr.id, e)}
                          >
                            <i className="ri-delete-bin-line" />
                          </button>
                        </label>
                      );
                    })}

                    {/* Option to enter a new address */}
                    <button
                      type="button"
                      className={`checkout__address-card checkout__address-card--new ${selectedAddressId === "new" ? "checkout__address-card--selected" : ""}`}
                      onClick={() => setSelectedAddressId("new")}
                    >
                      <div className="checkout__address-card-body">
                        <strong>+ {t("checkout.newAddress")}</strong>
                      </div>
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Form to enter a new address */}
              {selectedAddressId === "new" && (
                <div className="checkout__form-card">
                  <h3 className="checkout__subset-title">
                    {t("checkout.newAddress")}
                  </h3>

                  <div className="checkout__form-grid">
                    <div className="checkout__form-field checkout__form-field--full">
                      <label htmlFor="recipientName">{t("checkout.recipientName")}</label>
                      <input
                        id="recipientName"
                        type="text"
                        value={addressForm.recipientName}
                        onChange={(e) =>
                          setAddressForm({ ...addressForm, recipientName: e.target.value })
                        }
                      />
                    </div>

                    <div className="checkout__form-field">
                      <label htmlFor="country">{t("checkout.country")}</label>
                      <input
                        id="country"
                        type="text"
                        value={addressForm.country}
                        onChange={(e) =>
                          setAddressForm({ ...addressForm, country: e.target.value })
                        }
                      />
                    </div>

                    <div className="checkout__form-field">
                      <label htmlFor="city">
                        {t("checkout.city")} <span className="checkout__required">*</span>
                      </label>
                      <input
                        id="city"
                        type="text"
                        required
                        value={addressForm.city}
                        onChange={(e) =>
                          setAddressForm({ ...addressForm, city: e.target.value })
                        }
                      />
                    </div>

                    <div className="checkout__form-field checkout__form-field--full">
                      <label htmlFor="street">
                        {t("checkout.street")} <span className="checkout__required">*</span>
                      </label>
                      <input
                        id="street"
                        type="text"
                        required
                        value={addressForm.street}
                        onChange={(e) =>
                          setAddressForm({ ...addressForm, street: e.target.value })
                        }
                      />
                    </div>

                    <div className="checkout__form-field">
                      <label htmlFor="postalCode">{t("checkout.postalCode")}</label>
                      <input
                        id="postalCode"
                        type="text"
                        value={addressForm.postalCode}
                        onChange={(e) =>
                          setAddressForm({ ...addressForm, postalCode: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <label className="checkout__checkbox-label">
                    <input
                      type="checkbox"
                      checked={saveAddressOption}
                      onChange={(e) => setSaveAddressOption(e.target.checked)}
                    />
                    <span>{t("checkout.saveAddress")}</span>
                  </label>
                </div>
              )}

              {/* Contact phone section */}
              <div className="checkout__form-card checkout__contact-card">
                <h3 className="checkout__subset-title">
                  <i className="ri-phone-line" />
                  {t("checkout.phone")}
                </h3>

                <div className="checkout__form-field">
                  <PhoneInput
                    id="phone"
                    phone={phoneNumber}
                    countryIso={selectedCountryIso}
                    onPhoneChange={handlePhoneInputChange}
                    onCountryChange={handleCountryInputChange}
                    savedPhones={savedPhones}
                    onSelectSavedPhone={handleSelectSavedPhone}
                    onDeleteSavedPhone={handleDeleteSavedPhone}
                  />
                  {primaryPhone && (
                    <label className="checkout__primary-phone-label">
                      <input
                        type="checkbox"
                        checked={usePrimaryPhone}
                        onChange={handleTogglePrimaryPhone}
                      />
                      <span>{t("checkout.usePrimaryPhone")}</span>
                    </label>
                  )}
                </div>
              </div>

              {addressError && (
                <p className="checkout__form-error" role="alert">
                  {addressError}
                </p>
              )}

              {/* Delivery and Final Total Card */}
              <div className="checkout__summary-card">
                <h3 className="checkout__subset-title">
                  <i className="ri-secure-payment-line" />
                  {t("checkout.deliveryTitle")}
                </h3>

                <div className="checkout__summary-rows">
                  <div className="checkout__summary-row">
                    <span>{t("checkout.itemsTotal")}</span>
                    <span>{formatPrice(itemsSubtotal, "EUR", language)}</span>
                  </div>

                  <div className="checkout__summary-row">
                    <span className="checkout__shipping-label">
                      <i className="ri-truck-line" />
                      {t("checkout.shipping")}
                    </span>
                    <span className="checkout__shipping-val">
                      {hasValidAddress ? (
                        isFreeShipping ? (
                          <span className="checkout__shipping-free-container">
                            <span className="checkout__shipping-strikethrough">
                              {formatPrice(baseShippingCost, "EUR", language)}
                            </span>
                            <span className="checkout__shipping-free-tag">
                              <i className="ri-gift-line" />
                              {language === "ru" ? "Бесплатно" : "Free"}
                            </span>
                          </span>
                        ) : (
                          formatPrice(baseShippingCost, "EUR", language)
                        )
                      ) : (
                        `—`
                      )}
                    </span>
                  </div>

                  {couponValidation?.valid && !isFreeShipping && couponDeduction > 0 && (
                    <div className="checkout__summary-row checkout__summary-row--discount">
                      <span className="checkout__discount-label">
                        <i className="ri-coupon-3-line" /> {t("checkout.couponDiscount")} ({appliedCoupon.code})
                      </span>
                      <span className="checkout__discount-val">
                        -{formatPrice(couponDeduction, "EUR", language)}
                      </span>
                    </div>
                  )}

                  {!hasValidAddress && (
                    <p className="checkout__shipping-hint">
                      <i className="ri-information-line" />
                      {t("checkout.fillAddressPrompt")}
                    </p>
                  )}

                  {/* Coupon section: Directly above "Итого к оплате" */}
                  <div className="checkout__coupon-box">
                    <label htmlFor="checkoutCouponInput" className="checkout__coupon-label">
                      <i className="ri-coupon-2-line" />
                      {t("checkout.couponTitle")}
                    </label>

                    {!appliedCoupon ? (
                      <div className="checkout__coupon-form">
                        <input
                          id="checkoutCouponInput"
                          type="text"
                          className="checkout__coupon-input"
                          placeholder={t("checkout.couponPlaceholder")}
                          value={couponCodeInput}
                          onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleApplyCoupon(e);
                            }
                          }}
                          disabled={couponValidating}
                          autoComplete="off"
                          spellCheck="false"
                        />
                        <button
                          type="button"
                          className="button checkout__coupon-apply-btn"
                          onClick={handleApplyCoupon}
                          disabled={!couponCodeInput.trim() || couponValidating}
                        >
                          {couponValidating ? "..." : t("checkout.couponApply")}
                        </button>
                      </div>
                    ) : (
                      <div className="checkout__coupon-active-badge">
                        <div className="checkout__coupon-active-left">
                          <span className="checkout__coupon-code-pill">
                            <i className="ri-coupon-3-fill" /> {appliedCoupon.code}
                          </span>
                          {appliedCoupon.name && (
                            <span className="checkout__coupon-name-text">
                              {appliedCoupon.name}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="checkout__coupon-remove-btn"
                          onClick={handleRemoveCoupon}
                          title={t("checkout.couponRemove")}
                        >
                          <i className="ri-close-line" />
                          <span>{t("checkout.couponRemove")}</span>
                        </button>
                      </div>
                    )}

                    {/* Deduction notice: Underneath the input / active coupon */}
                    {appliedCoupon && couponValidation?.valid && (
                      <div className="checkout__coupon-deduction-msg">
                        <i className="ri-discount-percent-fill" />
                        <div className="checkout__coupon-deduction-content">
                          <span className="checkout__coupon-deduction-label">
                            {t("checkout.couponDeduction")}
                          </span>
                          <strong className="checkout__coupon-deduction-amount">
                            {isFreeShipping
                              ? `-${formatPrice(hasValidAddress ? baseShippingCost : 5.0, "EUR", language)} (${t("checkout.couponFreeShipping")})`
                              : `-${formatPrice(couponDeduction, "EUR", language)}${couponValidation.applyWithShipping ? ` (${language === "ru" ? "с доставкой" : "with shipping"})` : ""}`}
                          </strong>
                        </div>
                      </div>
                    )}

                    {couponError && (
                      <div className="checkout__coupon-error" role="alert">
                        <i className="ri-error-warning-line" />
                        <span>{couponError}</span>
                      </div>
                    )}
                  </div>

                  <div className="checkout__summary-row checkout__summary-row--total">
                    <span>{t("checkout.finalTotal")}</span>
                    <strong className="checkout__final-price">
                      {formatPrice(
                        hasValidAddress
                          ? finalTotal
                          : Math.max(
                              0,
                              itemsSubtotal - (isFreeShipping ? 0 : couponDeduction),
                            ),
                        "EUR",
                        language,
                      )}
                    </strong>
                  </div>
                </div>

                {/* Pay button directly beneath the final price */}
                <button
                  type="button"
                  className="button checkout__pay-btn"
                  disabled={!hasValidAddress || isSubmitting}
                  onClick={handlePay}
                >
                  <i className="ri-shield-check-line" />
                  {isSubmitting ? t("checkout.paying") : t("checkout.pay")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
