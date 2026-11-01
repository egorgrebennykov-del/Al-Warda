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
  const { language } = useLanguage();
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "",
    cancelText: "",
    type: "danger", // "danger" | "warning" | "info" | "primary"
    icon: null,
    isAlert: false,
  });

  const resolverRef = useRef(null);

  const confirm = useCallback(
    (opts) => {
      const options =
        typeof opts === "string" ? { message: opts } : opts || {};

      return new Promise((resolve) => {
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
        });
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
    setModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleCancel = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Keyboard accessibility: Escape cancels, Enter confirms
  useEffect(() => {
    if (!modalState.isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalState.isOpen, handleCancel, handleConfirm]);

  // Derive defaults based on language & type
  const isRu = language === "ru";
  const defaultTitle = modalState.isAlert
    ? isRu
      ? "Внимание"
      : "Notice"
    : isRu
    ? "Подтверждение действия"
    : "Confirm Action";

  const defaultConfirmText = modalState.isAlert
    ? isRu
      ? "Понятно"
      : "OK"
    : modalState.type === "danger"
    ? isRu
      ? "Удалить"
      : "Delete"
    : isRu
    ? "Подтвердить"
    : "Confirm";

  const defaultCancelText = isRu ? "Отмена" : "Cancel";

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
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}

      {modalState.isOpen && (
        <div
          className="litera-confirm-backdrop"
          onClick={handleCancel}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="litera-confirm-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Cross */}
            <button
              type="button"
              className="litera-confirm-close"
              onClick={handleCancel}
              aria-label={isRu ? "Закрыть" : "Close"}
            >
              ×
            </button>

            {/* Icon Wrap */}
            <div
              className={`litera-confirm-icon-wrap litera-confirm-icon-wrap--${modalState.type}`}
            >
              <i className={iconClass} />
            </div>

            {/* Title & Message */}
            <h3 className="litera-confirm-title">{title}</h3>
            <p className="litera-confirm-message">{modalState.message}</p>

            {/* Buttons */}
            <div className="litera-confirm-actions">
              {!modalState.isAlert && (
                <button
                  type="button"
                  className="litera-confirm-btn litera-confirm-btn--cancel"
                  onClick={handleCancel}
                >
                  {cancelText}
                </button>
              )}
              <button
                type="button"
                className={`litera-confirm-btn litera-confirm-btn--${modalState.type === "danger" ? "danger" : modalState.type === "warning" ? "warning" : "primary"}`}
                onClick={handleConfirm}
                autoFocus
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
