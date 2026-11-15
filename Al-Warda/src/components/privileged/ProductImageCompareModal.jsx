import { useEffect, useState } from "react";
import "./ProductImageCompareModal.css";

export default function ProductImageCompareModal({
  item,
  onClose,
  language = "ru",
}) {
  const isRussian = language === "ru";
  const [backgroundMode, setBackgroundMode] = useState("checker"); // "checker" | "dark" | "light"

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!item) return null;

  const originalSrc = item.rawImage || item.image || item.info?.rawImage;
  const studioSrc = item.imageUrl;
  const [studioFailed, setStudioFailed] = useState(false);
  const currentStudioSrc =
    studioFailed &&
    typeof studioSrc === "string" &&
    /^\/assets\/img\/generated-products\/[a-f0-9]{64}\.png$/.test(studioSrc)
      ? `https://raw.githubusercontent.com/egorgrebennykov-del/Al-Warda/main/Al-Warda/public${studioSrc}`
      : studioSrc;

  return (
    <div
      className="product-compare-modal__backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-modal-title"
    >
      <div className="product-compare-modal">
        <header className="product-compare-modal__header">
          <div className="product-compare-modal__title-group">
            <span className="product-compare-modal__badge">
              <i className="ri-shield-check-line" />
              {isRussian ? "100% Аутентичность флакона" : "100% Authentic Product"}
            </span>
            <h2 id="compare-modal-title" className="product-compare-modal__title">
              {item.name || (isRussian ? `Товар #${item.id}` : `Product #${item.id}`)}
            </h2>
            {item.brand && (
              <p className="product-compare-modal__brand">
                {isRussian ? "Бренд:" : "Brand:"} <strong>{item.brand}</strong> &bull; ID: <code>{item.id}</code>
              </p>
            )}
          </div>
          <button
            type="button"
            className="product-compare-modal__close-btn"
            onClick={onClose}
            aria-label={isRussian ? "Закрыть окно" : "Close"}
          >
            <i className="ri-close-line" />
          </button>
        </header>

        <div className="product-compare-modal__toolbar">
          <div className="product-compare-modal__bg-selector">
            <span className="product-compare-modal__toolbar-label">
              {isRussian ? "Фон студийного фото:" : "Studio preview background:"}
            </span>
            <button
              type="button"
              className={`product-compare-modal__bg-btn ${backgroundMode === "checker" ? "active" : ""}`}
              onClick={() => setBackgroundMode("checker")}
              title={isRussian ? "Шахматная доска (прозрачность)" : "Checkerboard (transparency)"}
            >
              <i className="ri-grid-line" /> {isRussian ? "Шахматка" : "Checker"}
            </button>
            <button
              type="button"
              className={`product-compare-modal__bg-btn ${backgroundMode === "dark" ? "active" : ""}`}
              onClick={() => setBackgroundMode("dark")}
              title={isRussian ? "Тёмный фон сайта" : "Dark theme"}
            >
              <i className="ri-moon-line" /> {isRussian ? "Тёмный" : "Dark"}
            </button>
            <button
              type="button"
              className={`product-compare-modal__bg-btn ${backgroundMode === "light" ? "active" : ""}`}
              onClick={() => setBackgroundMode("light")}
              title={isRussian ? "Светлый фон" : "Light"}
            >
              <i className="ri-sun-line" /> {isRussian ? "Светлый" : "Light"}
            </button>
          </div>
        </div>

        <div className="product-compare-modal__body">
          <div className="product-compare-modal__grid">
            {/* Original Qogita Photo */}
            <div className="product-compare-card product-compare-card--original">
              <div className="product-compare-card__header">
                <span className="product-compare-card__tag product-compare-card__tag--original">
                  <i className="ri-camera-line" />
                  {isRussian ? "Исходное фото Qogita (Оригинал)" : "Original Qogita Photo"}
                </span>
                <span className="product-compare-card__status">
                  {isRussian ? "Источник истины" : "Source of truth"}
                </span>
              </div>
              <div className="product-compare-card__preview product-compare-card__preview--white">
                {originalSrc ? (
                  <img
                    src={originalSrc}
                    alt={isRussian ? "Исходное фото" : "Original photo"}
                    loading="lazy"
                  />
                ) : (
                  <div className="product-compare-card__empty">
                    <i className="ri-image-line" />
                    <span>{isRussian ? "Исходное фото недоступно" : "Original photo unavailable"}</span>
                  </div>
                )}
              </div>
              <div className="product-compare-card__footer">
                <p>
                  {isRussian
                    ? "Оригинальное изображение из оптового каталога Qogita с непрозрачным фоном и заводским освещением."
                    : "Raw catalog photograph from Qogita with opaque background and warehouse lighting."}
                </p>
              </div>
            </div>

            {/* Studio AI Enhanced Transparent PNG */}
            <div className="product-compare-card product-compare-card--studio">
              <div className="product-compare-card__header">
                <span className="product-compare-card__tag product-compare-card__tag--studio">
                  <i className="ri-sparkling-fill" />
                  {isRussian ? "Студийное фото Al-Warda (1024×1024 RGBA)" : "Al-Warda Studio Photography"}
                </span>
                <span className="product-compare-card__status product-compare-card__status--success">
                  <i className="ri-check-line" />
                  {isRussian ? "100% сохранность надписей" : "100% authentic typography"}
                </span>
              </div>
              <div
                className={`product-compare-card__preview product-compare-card__preview--${backgroundMode}`}
              >
                {currentStudioSrc ? (
                  <img
                    src={currentStudioSrc}
                    alt={isRussian ? "Студийное фото" : "Studio photo"}
                    loading="lazy"
                    onError={() => {
                      if (!studioFailed) setStudioFailed(true);
                    }}
                  />
                ) : (
                  <div className="product-compare-card__empty">
                    <i className="ri-image-line" />
                    <span>{isRussian ? "Студийное фото не сгенерировано" : "Studio photo not generated"}</span>
                  </div>
                )}
              </div>
              <div className="product-compare-card__footer">
                <p>
                  {isRussian
                    ? "U2Net ONNX сегментация + Студийная фотометрия (CLAHE + Unsharp mask). Истинный прозрачный фон, аутентичный флакон без галлюцинаций."
                    : "U2Net ONNX segmentation + Studio Photometry (CLAHE + Unsharp mask). Genuine transparent background, zero bottle hallucinations."}
                </p>
              </div>
            </div>
          </div>
        </div>

        <footer className="product-compare-modal__footer">
          <div className="product-compare-modal__metrics">
            <span className="product-compare-pill">
              <i className="ri-money-dollar-circle-line" />
              <strong>$0.00</strong> {isRussian ? "затрат на API" : "API cost"}
            </span>
            <span className="product-compare-pill">
              <i className="ri-cpu-line" />
              <strong>U2Net ONNX</strong> ({isRussian ? "локальный CPU" : "local CPU"})
            </span>
            <span className="product-compare-pill">
              <i className="ri-speed-line" />
              <strong>~1.5 {isRussian ? "сек" : "s"}</strong> / {isRussian ? "фото" : "image"}
            </span>
            <span className="product-compare-pill">
              <i className="ri-aspect-ratio-line" />
              <strong>1024×1024</strong> RGBA PNG
            </span>
          </div>
          <button
            type="button"
            className="product-compare-modal__action-btn"
            onClick={onClose}
          >
            {isRussian ? "Закрыть просмотр" : "Close preview"}
          </button>
        </footer>
      </div>
    </div>
  );
}
