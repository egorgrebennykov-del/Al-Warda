import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useLanguage } from "./languageContext";
import "../components/common/ConfirmModal.css";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const { language, t } = useLanguage();
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "",
    cancelText: "",
    type: "danger", // "danger" | "warning" | "info" | "primary"
    icon: null,
    isAlert: false,
    showInput: false,
    inputLabel: "",
    inputPlaceholder: "",
  });

  const [inputValue, setInputValue] = useState("");
  const inputValueRef = useRef("");
  const isPromptRef = useRef(false);
  const resolverRef = useRef(null);

  const confirm = useCallback(
    (opts) => {
      const options =
        typeof opts === "string" ? { message: opts } : opts || {};

      return new Promise((resolve) => {
        isPromptRef.current = false;
        inputValueRef.current = "";
        setInputValue("");
        resolverRef.current = resolve;
        setModalState({
          isOpen: true,
          title: options.title || "",
          message: options.message || "",
          confirmText: options.confirmText || "",
          cancelText: options.cancelText || "",
          type: options.type || "danger",
          icon: options.icon || null,
          isAlert: false,
          showInput: false,
          inputLabel: "",
          inputPlaceholder: "",
          presets: [],
          checkboxLabel: "",
        });
      });
    },
    [],
  );

  const [checkboxValue, setCheckboxValue] = useState(false);
  const checkboxValueRef = useRef(false);

  const prompt = useCallback(
    (opts) => {
      const options =
        typeof opts === "string" ? { message: opts } : opts || {};
      const initialVal = typeof options.defaultValue === "string" ? options.defaultValue : "";
      const initialChecked = Boolean(options.defaultChecked);

      return new Promise((resolve) => {
        isPromptRef.current = true;
        inputValueRef.current = initialVal;
        setInputValue(initialVal);
        checkboxValueRef.current = initialChecked;
        setCheckboxValue(initialChecked);
        resolverRef.current = resolve;
        setModalState({
          isOpen: true,
          title: options.title || "",
          message: options.message || "",
          confirmText: options.confirmText || "",
          cancelText: options.cancelText || "",
          type: options.type || "warning",
          icon: options.icon || null,
          isAlert: false,
          showInput: true,
          inputLabel: options.inputLabel || "",
          inputPlaceholder: options.inputPlaceholder || "",
          presets: Array.isArray(options.presets) ? options.presets : [],
          checkboxLabel: options.checkboxLabel || "",
        });
      });
    },
    [],
  );

  const alert = useCallback(
    (opts) => {
      const options =
        typeof opts === "string" ? { message: opts } : opts || {};

      return new Promise((resolve) => {
        isPromptRef.current = false;
        inputValueRef.current = "";
        setInputValue("");
        resolverRef.current = resolve;
        setModalState({
          isOpen: true,
          title: options.title || "",
          message: options.message || "",
          confirmText: options.confirmText || "",
          cancelText: "",
          type: options.type || "info",
          icon: options.icon || null,
          isAlert: true,
          showInput: false,
          inputLabel: "",
          inputPlaceholder: "",
        });
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(
        isPromptRef.current
          ? {
              confirmed: true,
              value: inputValueRef.current,
              checked: checkboxValueRef.current,
            }
          : true,
      );
      resolverRef.current = null;
    }
    setModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleCancel = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(
        isPromptRef.current ? { confirmed: false, value: "", checked: false } : false,
      );
      resolverRef.current = null;
    }
    setModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Keyboard accessibility: Escape cancels, Enter confirms (Shift+Enter adds newline in textarea)
  useEffect(() => {
    if (!modalState.isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if (e.key === "Enter") {
        if (e.target?.tagName === "TEXTAREA" && e.shiftKey) return;
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalState.isOpen, handleCancel, handleConfirm]);

  // Derive defaults based on language & type
  const defaultTitle = modalState.isAlert
    ? t("confirm.notice")
    : t("confirm.action");

  const defaultConfirmText = modalState.isAlert
    ? t("confirm.ok")
    : modalState.type === "danger"
    ? t("confirm.delete")
    : t("confirm.confirm");

  const defaultCancelText = t("confirm.cancel");

  const title = modalState.title || defaultTitle;
  const confirmText = modalState.confirmText || defaultConfirmText;
  const cancelText = modalState.cancelText || defaultCancelText;

  // Icon derivation
  let iconClass = modalState.icon;
  if (!iconClass) {
    if (modalState.type === "danger") {
      iconClass = "ri-delete-bin-line";
    } else if (modalState.type === "warning") {
      iconClass = "ri-alert-line";
    } else if (modalState.type === "info") {
      iconClass = "ri-information-line";
    } else {
      iconClass = "ri-question-line";
    }
  }

  return (
    <ConfirmContext.Provider value={{ confirm, alert, prompt }}>
      {children}

      {modalState.isOpen && (
        <div
          className="warda-confirm-backdrop"
          onClick={handleCancel}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="warda-confirm-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Cross */}
            <button
              type="button"
              className="warda-confirm-close"
              onClick={handleCancel}
              aria-label={defaultCancelText}
            >
              ×
            </button>

            {/* Icon Wrap */}
            <div
              className={`warda-confirm-icon-wrap warda-confirm-icon-wrap--${modalState.type}`}
            >
              <i className={iconClass} />
            </div>

            {/* Title & Message */}
            <h3 className="warda-confirm-title">{title}</h3>
            <p className="warda-confirm-message">{modalState.message}</p>

            {/* Optional Input Field */}
            {modalState.showInput && (
              <div className="warda-confirm-input-wrap">
                {Array.isArray(modalState.presets) &&
                  modalState.presets.length > 0 && (
                    <div className="warda-confirm-presets">
                      {modalState.presets.map((preset) => {
                        const parts = inputValue
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const isActive = parts.includes(preset);
                        return (
                          <button
                            key={preset}
                            type="button"
                            className={`warda-confirm-preset-btn ${isActive ? "warda-confirm-preset-btn--active" : ""}`}
                            onClick={() => {
                              const nextParts = isActive
                                ? parts.filter((p) => p !== preset)
                                : [...parts, preset];
                              const nextVal = nextParts.join(", ");
                              inputValueRef.current = nextVal;
                              setInputValue(nextVal);
                            }}
                          >
                            {preset}
                          </button>
                        );
                      })}
                    </div>
                  )}
                {modalState.inputLabel && (
                  <label
                    className="warda-confirm-input-label"
                    htmlFor="warda-confirm-prompt-input"
                  >
                    {modalState.inputLabel}
                  </label>
                )}
                <textarea
                  id="warda-confirm-prompt-input"
                  className="warda-confirm-input"
                  rows={2}
                  value={inputValue}
                  placeholder={modalState.inputPlaceholder}
                  autoFocus
                  onChange={(e) => {
                    inputValueRef.current = e.target.value;
                    setInputValue(e.target.value);
                  }}
                />
                {modalState.checkboxLabel && (
                  <label className="warda-confirm-checkbox-row">
                    <input
                      type="checkbox"
                      checked={checkboxValue}
                      onChange={(e) => {
                        checkboxValueRef.current = e.target.checked;
                        setCheckboxValue(e.target.checked);
                      }}
                    />
                    <span>{modalState.checkboxLabel}</span>
                  </label>
                )}
              </div>
            )}

            {/* Buttons */}
            <div className="warda-confirm-actions">
              {!modalState.isAlert && (
                <button
                  type="button"
                  className="warda-confirm-btn warda-confirm-btn--cancel"
                  onClick={handleCancel}
                >
                  {cancelText}
                </button>
              )}
              <button
                type="button"
                className={`warda-confirm-btn warda-confirm-btn--${modalState.type === "danger" ? "danger" : modalState.type === "warning" ? "warning" : "primary"}`}
                onClick={handleConfirm}
                autoFocus={!modalState.showInput}
              >
                {modalState.type === "danger" && <i className="ri-delete-bin-line" />}
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return ctx.confirm;
}

export function useAlert() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useAlert must be used within a ConfirmProvider");
  }
  return ctx.alert;
}

export function usePrompt() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("usePrompt must be used within a ConfirmProvider");
  }
  return ctx.prompt;
}
