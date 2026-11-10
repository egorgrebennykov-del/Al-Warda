import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  checkUserExistsForReset,
  generateVerificationCode,
  sendVerificationCodeEmail,
  resetPasswordByEmail,
} from "../../../utils/auth";
import { useLanguage } from "../../context/languageContext";
import { useAuth } from "../../context/AuthContext";
import {
  showValidationTooltip,
  hideValidationTooltip,
} from "../../utils/validationTooltip";

export default function Login({ onSignUp, onClose }) {
  const { t, language } = useLanguage();
  const { login: authLogin, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Password reset / change flow ("login" | "resetRequest" | "resetVerify" | "resetSuccess")
  const [mode, setMode] = useState("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetUserName, setResetUserName] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [expectedResetCode, setExpectedResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatNewPassword, setRepeatNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showRepeatNewPassword, setShowRepeatNewPassword] = useState(false);
  const [resetInfo, setResetInfo] = useState("");
  const [resendingCode, setResendingCode] = useState(false);

  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const resetEmailRef = useRef(null);
  const resetCodeRef = useRef(null);
  const newPasswordRef = useRef(null);
  const repeatNewPasswordRef = useRef(null);

  useEffect(() => {
    return () => {
      hideValidationTooltip();
    };
  }, []);

  useEffect(() => {
    hideValidationTooltip();
    if (mode === "resetRequest") {
      setTimeout(() => resetEmailRef.current?.focus(), 80);
    } else if (mode === "resetVerify") {
      setTimeout(() => resetCodeRef.current?.focus(), 80);
    }
  }, [mode]);

  const handlePasswordCopy = (e, val = password) => {
    const input = e.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;
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

  const handlePasswordCut = (e, val = password, setter = setPassword) => {
    const input = e.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;
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
        setter(val.slice(0, start) + val.slice(end));
      } else {
        setter("");
      }
    }
  };

  const handlePasswordKeyDown = (e, val = password) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
      const input = e.currentTarget;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const textToCopy =
        start !== null && end !== null && start !== end
          ? val.substring(start, end)
          : val;
      if (textToCopy && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(textToCopy).catch(() => {});
      }
    }
  };

  const translateResetError = (rawMessage) => {
    if (rawMessage === "Enter a valid email") {
      return t("auth.invalidEmail");
    }
    if (rawMessage === "No account found with this email") {
      return t("auth.noAccountFound");
    }
    if (rawMessage === "Password must be at least 8 characters") {
      return t("auth.passwordMinLength");
    }
    return rawMessage;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const trimmedIdentifier = email.trim();
    if (!trimmedIdentifier) {
      const msg = t("auth.fillField");
      showValidationTooltip(emailRef.current, msg);
      emailRef.current?.focus();
      return;
    }

    if (!password) {
      const msg = t("auth.fillField");
      showValidationTooltip(passwordRef.current, msg);
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await authLogin(trimmedIdentifier, password);
      hideValidationTooltip();
      const destination = params.get("redirect");
      navigate(
        destination?.startsWith("/") && !destination.startsWith("//")
          ? destination
          : "/",
      );
    } catch (err) {
      let displayMsg = err.message;
      if (err.message === "Invalid email or password") {
        displayMsg = t("auth.invalidCredentials");
      }
      setError(displayMsg);
      showValidationTooltip(emailRef.current, displayMsg);
      emailRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestResetCode = async (event) => {
    event.preventDefault();
    setError("");
    setResetInfo("");

    const trimmedEmail = resetEmail.trim();
    if (!trimmedEmail) {
      const msg = t("auth.enterEmail");
      setError(msg);
      showValidationTooltip(resetEmailRef.current, msg);
      resetEmailRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const userInfo = await checkUserExistsForReset(trimmedEmail);
      const code = generateVerificationCode();
      await sendVerificationCodeEmail({
        email: userInfo.email,
        code,
        purpose: "reset",
        firstName: userInfo.firstName,
        language,
      });
      setResetEmail(userInfo.email);
      setResetUserName(userInfo.firstName || "");
      setExpectedResetCode(code);
      setResetCode("");
      setNewPassword("");
      setRepeatNewPassword("");
      setResetInfo(
        t("auth.resetCodeSent").replace("{email}", userInfo.email),
      );
      setMode("resetVerify");
      hideValidationTooltip();
    } catch (err) {
      const msg = translateResetError(err.message);
      setError(msg);
      showValidationTooltip(resetEmailRef.current, msg);
      resetEmailRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendResetCode = async () => {
    if (resendingCode || submitting) return;
    setError("");
    setResendingCode(true);
    try {
      const code = generateVerificationCode();
      await sendVerificationCodeEmail({
        email: resetEmail,
        code,
        purpose: "reset",
        firstName: resetUserName,
        language,
      });
      setExpectedResetCode(code);
      setResetCode("");
      setResetInfo(
        t("auth.newResetCodeSent").replace("{email}", resetEmail),
      );
    } catch (err) {
      setError(translateResetError(err.message));
    } finally {
      setResendingCode(false);
    }
  };

  const handleVerifyAndResetPassword = async (event) => {
    event.preventDefault();
    setError("");

    const cleanCode = resetCode.replace(/\D/g, "").trim();
    if (cleanCode.length !== 6) {
      const msg = t("auth.enterSixDigitCode");
      setError(msg);
      showValidationTooltip(resetCodeRef.current, msg);
      resetCodeRef.current?.focus();
      return;
    }

    if (cleanCode !== expectedResetCode) {
      const msg = t("auth.invalidVerificationCode");
      setError(msg);
      showValidationTooltip(resetCodeRef.current, msg);
      resetCodeRef.current?.focus();
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      const msg = t("auth.passwordMinLength");
      setError(msg);
      showValidationTooltip(newPasswordRef.current, msg);
      newPasswordRef.current?.focus();
      return;
    }

    if (newPassword !== repeatNewPassword) {
      const msg = t("auth.passwordsMismatch");
      setError(msg);
      showValidationTooltip(repeatNewPasswordRef.current, msg);
      repeatNewPasswordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await resetPasswordByEmail(resetEmail, newPassword);
      await refreshUser().catch(() => {});
      hideValidationTooltip();
      setError("");
      setMode("resetSuccess");
    } catch (err) {
      const msg = translateResetError(err.message);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login grid show-login" id="login-content">
      {mode === "login" && (
        <form className="login__form grid" onSubmit={handleSubmit} noValidate>
          <button
            type="button"
            className="auth-close"
            id="login-close"
            aria-label="Close login"
            onClick={() => {
              hideValidationTooltip();
              onClose();
            }}
          >
            ×
          </button>
          <h3 className="login__title">{t("auth.loginTitle")}</h3>
          <div className="login__group grid">
            <div>
              <label htmlFor="login-email" className="login__label">
                {t("auth.email")}
              </label>
              <input
                type="text"
                placeholder={t("auth.emailPlaceholder")}
                id="login-email"
                className="login__input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                ref={emailRef}
              />
            </div>
            <div>
              <label htmlFor="login-pass" className="login__label">
                {t("auth.password")}
              </label>
              <div className="auth__password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.passwordPlaceholder")}
                  id="login-pass"
                  className="login__input auth__password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onCopy={(e) => handlePasswordCopy(e, password)}
                  onCut={(e) => handlePasswordCut(e, password, setPassword)}
                  onKeyDown={(e) => handlePasswordKeyDown(e, password)}
                  autoComplete="current-password"
                  required
                  ref={passwordRef}
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
          </div>
          {error && (
            <p role="alert" style={{ color: "hsl(0, 70%, 50%)" }}>
              {error}
            </p>
          )}
          <div>
            <span className="login__signup">
              {t("auth.noAccount")}{" "}
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  hideValidationTooltip();
                  onSignUp();
                }}
              >
                {t("auth.signUpBtn")}
              </a>
            </span>
            <a
              href="#"
              className="login__forgot"
              onClick={(event) => {
                event.preventDefault();
                hideValidationTooltip();
                setError("");
                setResetEmail(email.includes("@") ? email.trim() : "");
                setMode("resetRequest");
              }}
            >
              {t("auth.forgotPassword")}
            </a>
            <button
              type="submit"
              className="login__button button"
              disabled={submitting}
            >
              {t("auth.loginBtn")}
            </button>
          </div>
        </form>
      )}

      {mode === "resetRequest" && (
        <form
          className="login__form grid"
          onSubmit={handleRequestResetCode}
          noValidate
        >
          <button
            type="button"
            className="auth-close"
            aria-label="Close password reset"
            onClick={() => {
              hideValidationTooltip();
              onClose();
            }}
          >
            ×
          </button>
          <h3 className="login__title">
            {t("auth.resetPassword")}
          </h3>
          <p
            style={{
              fontSize: "0.88rem",
              lineHeight: 1.45,
              color: "var(--text-color)",
              textAlign: "center",
              margin: 0,
            }}
          >
            {t("auth.resetEmailPrompt")}
          </p>
          <div className="login__group grid">
            <div>
              <label htmlFor="reset-email" className="login__label">
                {t("auth.email")}
              </label>
              <input
                ref={resetEmailRef}
                type="email"
                placeholder={t("auth.emailPlaceholder")}
                id="reset-email"
                className="login__input"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                autoComplete="email"
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
            <span className="login__signup" style={{ marginBottom: "1rem" }}>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  hideValidationTooltip();
                  setError("");
                  setMode("login");
                }}
              >
                ← {t("auth.backToLogin")}
              </a>
            </span>
            <button
              type="submit"
              className="login__button button"
              disabled={submitting}
            >
              {submitting
                ? t("auth.sendingCode")
                : t("auth.sendVerificationCode")}
            </button>
          </div>
        </form>
      )}

      {mode === "resetVerify" && (
        <form
          className="login__form grid"
          onSubmit={handleVerifyAndResetPassword}
          noValidate
        >
          <button
            type="button"
            className="auth-close"
            aria-label="Close password reset"
            onClick={() => {
              hideValidationTooltip();
              onClose();
            }}
          >
            ×
          </button>
          <h3 className="login__title">
            {t("auth.setNewPassword")}
          </h3>
          {resetInfo && (
            <p
              style={{
                fontSize: "0.86rem",
                lineHeight: 1.45,
                color: "var(--text-color)",
                textAlign: "center",
                margin: 0,
              }}
            >
              {resetInfo}
            </p>
          )}
          <div className="login__group grid">
            <div>
              <label htmlFor="reset-code" className="login__label">
                {t("auth.codePlaceholder")}
              </label>
              <input
                ref={resetCodeRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                id="reset-code"
                className="login__input"
                style={{
                  textAlign: "center",
                  fontSize: "1.3rem",
                  letterSpacing: "0.4rem",
                  fontWeight: 700,
                }}
                value={resetCode}
                onChange={(e) =>
                  setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                autoComplete="one-time-code"
                required
              />
            </div>
            <div>
              <label htmlFor="reset-new-password" className="login__label">
                {t("auth.newPasswordLabel")}
              </label>
              <div className="auth__password-wrap">
                <input
                  ref={newPasswordRef}
                  type={showNewPassword ? "text" : "password"}
                  placeholder={t("auth.passwordPlaceholder")}
                  id="reset-new-password"
                  className="login__input auth__password-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onCopy={(e) => handlePasswordCopy(e, newPassword)}
                  onCut={(e) =>
                    handlePasswordCut(e, newPassword, setNewPassword)
                  }
                  onKeyDown={(e) => handlePasswordKeyDown(e, newPassword)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                />
                <button
                  type="button"
                  className="auth__password-toggle"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  title={
                    showNewPassword
                      ? t("auth.hidePassword")
                      : t("auth.showPassword")
                  }
                  aria-label={
                    showNewPassword
                      ? t("auth.hidePassword")
                      : t("auth.showPassword")
                  }
                  tabIndex={-1}
                >
                  <i
                    className={
                      showNewPassword ? "ri-eye-off-line" : "ri-eye-line"
                    }
                  />
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="reset-repeat-password" className="login__label">
                {t("auth.repeatPassword")}
              </label>
              <div className="auth__password-wrap">
                <input
                  ref={repeatNewPasswordRef}
                  type={showRepeatNewPassword ? "text" : "password"}
                  placeholder={t("auth.repeatPasswordPlaceholder")}
                  id="reset-repeat-password"
                  className="login__input auth__password-input"
                  value={repeatNewPassword}
                  onChange={(e) => setRepeatNewPassword(e.target.value)}
                  onCopy={(e) => handlePasswordCopy(e, repeatNewPassword)}
                  onCut={(e) =>
                    handlePasswordCut(
                      e,
                      repeatNewPassword,
                      setRepeatNewPassword,
                    )
                  }
                  onKeyDown={(e) => handlePasswordKeyDown(e, repeatNewPassword)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="auth__password-toggle"
                  onClick={() => setShowRepeatNewPassword((prev) => !prev)}
                  title={
                    showRepeatNewPassword
                      ? t("auth.hidePassword")
                      : t("auth.showPassword")
                  }
                  aria-label={
                    showRepeatNewPassword
                      ? t("auth.hidePassword")
                      : t("auth.showPassword")
                  }
                  tabIndex={-1}
                >
                  <i
                    className={
                      showRepeatNewPassword ? "ri-eye-off-line" : "ri-eye-line"
                    }
                  />
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
                  setMode("resetRequest");
                }}
                style={{ color: "var(--first-color)", fontWeight: 600 }}
              >
                ← {t("auth.editEmail")}
              </a>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleResendResetCode();
                }}
                style={{
                  color: "var(--first-color)",
                  fontWeight: 600,
                  opacity: resendingCode ? 0.6 : 1,
                }}
              >
                {resendingCode
                  ? t("auth.sending")
                  : t("auth.resendCode")}
              </a>
            </div>
            <button
              type="submit"
              className="login__button button"
              disabled={submitting}
            >
              {submitting
                ? t("auth.savingPassword")
                : t("auth.changePasswordBtn")}
            </button>
          </div>
        </form>
      )}

      {mode === "resetSuccess" && (
        <div
          className="login__form grid"
          style={{ textAlign: "center", gap: "1.25rem" }}
        >
          <button
            type="button"
            className="auth-close"
            id="login-close"
            aria-label="Close"
            onClick={() => {
              hideValidationTooltip();
              navigate("/");
            }}
          >
            ×
          </button>
          <div
            style={{
              width: "4rem",
              height: "4rem",
              borderRadius: "50%",
              backgroundColor: "hsla(145, 65%, 42%, 0.14)",
              color: "hsl(145, 65%, 38%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0.25rem auto 0",
              fontSize: "2.25rem",
            }}
          >
            <i className="ri-checkbox-circle-fill" />
          </div>
          <h3 className="login__title" style={{ marginBottom: 0 }}>
            {t("auth.passwordSuccess")}
          </h3>
          <p
            style={{
              fontSize: "var(--small-font-size)",
              color: "var(--text-color)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {t("auth.resetSuccessDesc")}
          </p>
          <button
            type="button"
            className="login__button button"
            onClick={() => {
              hideValidationTooltip();
              navigate("/");
            }}
          >
            {t("auth.goHome")}
          </button>
        </div>
      )}
    </div>
  );
}
