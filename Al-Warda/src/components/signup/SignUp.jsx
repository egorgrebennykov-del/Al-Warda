import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  checkEmailAvailable,
  generateVerificationCode,
  sendVerificationCodeEmail,
} from "../../../utils/auth";
import { useLanguage } from "../../context/languageContext";
import { useAuth } from "../../context/AuthContext";
import PhoneInput from "../common/PhoneInput";
import { countries } from "../checkout/countryPhoneCodes";
import {
  showValidationTooltip,
  hideValidationTooltip,
} from "../../utils/validationTooltip";

export default function SignUp({ onLogin, onClose }) {
  const { t, language } = useLanguage();
  const { register: authRegister } = useAuth();
  const isRu = language !== "en";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    repeat: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [phone, setPhone] = useState("");
  const [countryIso, setCountryIso] = useState("MD");
  const [step, setStep] = useState("form"); // "form" | "verify"
  const [verificationCode, setVerificationCode] = useState("");
  const [expectedCode, setExpectedCode] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  const codeInputRef = useRef(null);

  useEffect(() => {
    return () => {
      hideValidationTooltip();
    };
  }, []);

  useEffect(() => {
    if (step === "verify") {
      setTimeout(() => codeInputRef.current?.focus(), 80);
    }
  }, [step]);

  const handlePasswordCopy = (e, fieldName) => {
    const input = e.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const val = form[fieldName] || "";
    const textToCopy =
      start !== null && end !== null && start !== end
        ? val.substring(start, end)
        : val;

    if (textToCopy) {
      if (e.clipboardData) {
        e.clipboardData.setData("text/plain", textToCopy);
        e.preventDefault();
      }
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(textToCopy).catch(() => {});
      }
    }
  };

  const handlePasswordCut = (e, fieldName) => {
    const input = e.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const val = form[fieldName] || "";
    const textToCopy =
      start !== null && end !== null && start !== end
        ? val.substring(start, end)
        : val;

    if (textToCopy) {
      if (e.clipboardData) {
        e.clipboardData.setData("text/plain", textToCopy);
        e.preventDefault();
      }
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(textToCopy).catch(() => {});
      }
      if (start !== null && end !== null && start !== end) {
        setForm((f) => ({
          ...f,
          [fieldName]: val.slice(0, start) + val.slice(end),
        }));
      } else {
        setForm((f) => ({ ...f, [fieldName]: "" }));
      }
    }
  };

  const handlePasswordKeyDown = (e, fieldName) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
      const input = e.currentTarget;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const val = form[fieldName] || "";
      const textToCopy =
        start !== null && end !== null && start !== end
          ? val.substring(start, end)
          : val;
      if (textToCopy && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(textToCopy).catch(() => {});
      }
    }
  };

  const field = (name) => ({
    value: form[name],
    onChange: (e) => setForm((f) => ({ ...f, [name]: e.target.value })),
  });

  const translateAuthError = (rawMessage) => {
    if (rawMessage === "Enter a valid email") {
      return isRu ? "Введите корректный email" : "Enter a valid email";
    }
    if (rawMessage === "This email is already registered") {
      return isRu
        ? "Этот email уже зарегистрирован"
        : "This email is already registered";
    }
    return rawMessage;
  };

  const handleRequestCode = async (event) => {
    event.preventDefault();
    setError("");
    setInfoMessage("");

    if (!form.firstName.trim()) {
      const msg = isRu ? "Введите ваше имя" : "Please enter your first name";
      setError(msg);
      showValidationTooltip(document.getElementById("signup-first-name"), msg);
      return;
    }
    if (!form.lastName.trim()) {
      const msg = isRu ? "Введите вашу фамилию" : "Please enter your last name";
      setError(msg);
      showValidationTooltip(document.getElementById("signup-last-name"), msg);
      return;
    }
    if (!phone.trim()) {
      const msg = t("checkout.phoneRequired");
      setError(msg);
      showValidationTooltip(document.getElementById("signup-phone"), msg);
      return;
    }
    if (!form.password || form.password.length < 8) {
      const msg = isRu
        ? "Пароль должен содержать минимум 8 символов"
        : "Password must be at least 8 characters";
      setError(msg);
      showValidationTooltip(document.getElementById("signup-password"), msg);
      return;
    }
    if (form.password !== form.repeat) {
      const msg = t("auth.passwordsMismatch");
      setError(msg);
      showValidationTooltip(
        document.getElementById("signup-repeat-password") ||
          document.getElementById("signup-password"),
        msg,
      );
      return;
    }

    setSubmitting(true);
    try {
      await checkEmailAvailable(form.email);
      const code = generateVerificationCode();
      await sendVerificationCodeEmail({
        email: form.email,
        code,
        purpose: "signup",
        firstName: form.firstName,
        language,
      });
      setExpectedCode(code);
      setVerificationCode("");
      setStep("verify");
      setInfoMessage(
        isRu
          ? `Мы отправили 6-значный код подтверждения на ${form.email.trim()}`
          : `We sent a 6-digit verification code to ${form.email.trim()}`,
      );
      hideValidationTooltip();
    } catch (err) {
      const msg = translateAuthError(err.message);
      setError(msg);
      showValidationTooltip(document.getElementById("signup-email"), msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyAndRegister = async (event) => {
    event.preventDefault();
    setError("");

    const cleanEntered = verificationCode.replace(/\D/g, "").trim();
    if (cleanEntered.length !== 6) {
      const msg = isRu
        ? "Введите 6-значный код из письма"
        : "Enter the 6-digit code from the email";
      setError(msg);
      showValidationTooltip(codeInputRef.current, msg);
      codeInputRef.current?.focus();
      return;
    }

    if (cleanEntered !== expectedCode) {
      const msg = isRu
        ? "Неверный код подтверждения. Проверьте письмо и попробуйте снова."
        : "Invalid verification code. Please check your email and try again.";
      setError(msg);
      showValidationTooltip(codeInputRef.current, msg);
      codeInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const selectedCountry =
        countries.find((c) => c.iso2 === countryIso) || countries[0];
      const fullPhone = `${selectedCountry.dialCode} ${phone.trim()}`;
      await authRegister({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        phone: fullPhone,
      });
      hideValidationTooltip();
      const destination = params.get("redirect");
      navigate(
        destination?.startsWith("/") && !destination.startsWith("//")
          ? destination
          : "/",
      );
    } catch (err) {
      const msg = translateAuthError(err.message);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (resending || submitting) return;
    setError("");
    setResending(true);
    try {
      const newCode = generateVerificationCode();
      await sendVerificationCodeEmail({
        email: form.email,
        code: newCode,
        purpose: "signup",
        firstName: form.firstName,
        language,
      });
      setExpectedCode(newCode);
      setVerificationCode("");
      setInfoMessage(
        isRu
          ? `Новый 6-значный код отправлен на ${form.email.trim()}`
          : `A new 6-digit code was sent to ${form.email.trim()}`,
      );
    } catch (err) {
      setError(translateAuthError(err.message));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="login grid show-login" id="signup-content">
      {step === "form" ? (
        <form className="login__form grid" onSubmit={handleRequestCode}>
          <button
            type="button"
            className="auth-close"
            id="signup-close"
            aria-label="Close sign up"
            onClick={() => {
              hideValidationTooltip();
              onClose();
            }}
          >
            ×
          </button>
          <h3 className="login__title">{t("auth.signUpTitle")}</h3>
          <div className="login__group grid">
            <div>
              <label htmlFor="signup-first-name" className="login__label">
                {t("auth.firstName")}
              </label>
              <input
                type="text"
                placeholder={t("auth.firstNamePlaceholder")}
                id="signup-first-name"
                className="login__input"
                autoComplete="given-name"
                maxLength={100}
                required
                {...field("firstName")}
              />
            </div>
            <div>
              <label htmlFor="signup-last-name" className="login__label">
                {t("auth.lastName")}
              </label>
              <input
                type="text"
                placeholder={t("auth.lastNamePlaceholder")}
                id="signup-last-name"
                className="login__input"
                autoComplete="family-name"
                maxLength={100}
                required
                {...field("lastName")}
              />
            </div>
            <div>
              <label htmlFor="signup-email" className="login__label">
                {t("auth.email")}
              </label>
              <input
                type="email"
                placeholder={t("auth.emailPlaceholder")}
                id="signup-email"
                className="login__input"
                autoComplete="email"
                required
                {...field("email")}
              />
            </div>
            <div>
              <label htmlFor="signup-phone" className="login__label">
                {t("checkout.phone")} <span className="checkout__required">*</span>
              </label>
              <PhoneInput
                id="signup-phone"
                phone={phone}
                countryIso={countryIso}
                onPhoneChange={setPhone}
                onCountryChange={setCountryIso}
                required
              />
            </div>
            <div>
              <label htmlFor="signup-password" className="login__label">
                {t("auth.password")}
              </label>
              <div className="auth__password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.passwordPlaceholder")}
                  id="signup-password"
                  className="login__input auth__password-input"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                  onCopy={(e) => handlePasswordCopy(e, "password")}
                  onCut={(e) => handlePasswordCut(e, "password")}
                  onKeyDown={(e) => handlePasswordKeyDown(e, "password")}
                  {...field("password")}
                />
                <button
                  type="button"
                  className="auth__password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  tabIndex={-1}
                >
                  <i className={showPassword ? "ri-eye-off-line" : "ri-eye-line"} />
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="signup-repeat-password" className="login__label">
                {t("auth.repeatPassword")}
              </label>
              <div className="auth__password-wrap">
                <input
                  type={showRepeat ? "text" : "password"}
                  placeholder={t("auth.repeatPasswordPlaceholder")}
                  id="signup-repeat-password"
                  className="login__input auth__password-input"
                  autoComplete="new-password"
                  required
                  onCopy={(e) => handlePasswordCopy(e, "repeat")}
                  onCut={(e) => handlePasswordCut(e, "repeat")}
                  onKeyDown={(e) => handlePasswordKeyDown(e, "repeat")}
                  {...field("repeat")}
                />
                <button
                  type="button"
                  className="auth__password-toggle"
                  onClick={() => setShowRepeat((prev) => !prev)}
                  title={showRepeat ? t("auth.hidePassword") : t("auth.showPassword")}
                  aria-label={showRepeat ? t("auth.hidePassword") : t("auth.showPassword")}
                  tabIndex={-1}
                >
                  <i className={showRepeat ? "ri-eye-off-line" : "ri-eye-line"} />
                </button>
              </div>
            </div>
          </div>
          {error && (
            <p role="alert" style={{ color: "hsl(0, 70%, 50%)" }}>
              {error}
            </p>
          )}
          <div>
            <span className="login__signup">
              {t("auth.haveAccount")}{" "}
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  hideValidationTooltip();
                  onLogin();
                }}
              >
                {t("auth.loginBtn")}
              </a>
            </span>
            <button
              type="submit"
              className="login__button button"
              disabled={submitting}
            >
              {submitting
                ? isRu
                  ? "Отправка кода..."
                  : "Sending code..."
                : t("auth.signUpBtn")}
            </button>
          </div>
        </form>
      ) : (
        <form className="login__form grid" onSubmit={handleVerifyAndRegister}>
          <button
            type="button"
            className="auth-close"
            id="signup-close"
            aria-label="Close sign up"
            onClick={() => {
              hideValidationTooltip();
              onClose();
            }}
          >
            ×
          </button>
          <h3 className="login__title">
            {isRu ? "Подтверждение Email" : "Confirm Your Email"}
          </h3>
          {infoMessage && (
            <p
              style={{
                fontSize: "0.88rem",
                lineHeight: 1.45,
                color: "var(--text-color)",
                textAlign: "center",
                margin: 0,
              }}
            >
              {infoMessage}
            </p>
          )}
          <div className="login__group grid">
            <div>
              <label htmlFor="signup-verify-code" className="login__label">
                {isRu ? "Код из 6 цифр" : "6-Digit Verification Code"}
              </label>
              <input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                id="signup-verify-code"
                className="login__input"
                style={{
                  textAlign: "center",
                  fontSize: "1.35rem",
                  letterSpacing: "0.45rem",
                  fontWeight: 700,
                }}
                value={verificationCode}
                onChange={(e) =>
                  setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                autoComplete="one-time-code"
                required
              />
            </div>
          </div>
          {error && (
            <p role="alert" style={{ color: "hsl(0, 70%, 50%)" }}>
              {error}
            </p>
          )}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
                marginBottom: "1rem",
                fontSize: "var(--small-font-size)",
              }}
            >
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  hideValidationTooltip();
                  setError("");
                  setStep("form");
                }}
                style={{ color: "var(--first-color)", fontWeight: 600 }}
              >
                ← {isRu ? "Изменить данные" : "Edit details"}
              </a>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleResendCode();
                }}
                style={{
                  color: "var(--first-color)",
                  fontWeight: 600,
                  opacity: resending ? 0.6 : 1,
                }}
              >
                {resending
                  ? isRu
                    ? "Отправка..."
                    : "Sending..."
                  : isRu
                    ? "Отправить код повторно"
                    : "Resend code"}
              </a>
            </div>
            <button
              type="submit"
              className="login__button button"
              disabled={submitting}
            >
              {submitting
                ? isRu
                  ? "Создание аккаунта..."
                  : "Creating account..."
                : isRu
                  ? "Подтвердить и создать аккаунт"
                  : "Verify & Create Account"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
