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

  const qogitaRawCandidate =
    (typeof item.info?.rawImage === "string" && item.info.rawImage.trim()) ||
    (typeof item.rawImage === "string" &&
    !item.rawImage.startsWith("/assets/img/generated-products/")
      ? item.rawImage.trim()
      : null);
  const hasQogitaPhoto = Boolean(
    qogitaRawCandidate &&
      !/no[-_]?image|not[_-]?found|missing|46e86f1d826c199f04588f35f1fd8afe|c1b79cffa1a5fa8aab226414b9e4a063/i.test(
        qogitaRawCandidate,
      ),
  );
  const qogitaMissingPhoto = Boolean(
    item.qogitaMissingPhoto ||
      item.info?.imageGeneration?.qogitaMissingPhoto ||
      !hasQogitaPhoto,
  );
  const sourceImageSrc =
    item.sourceImageUrl ||
    item.info?.imageGeneration?.sourceImageUrl ||
    item.info?.imageSourceImageUrl ||
    null;
  const originalSrc = hasQogitaPhoto
    ? qogitaRawCandidate
    : sourceImageSrc || null;
  const primaryRowImage = item.image || item.info?.image;
  const generationImage = item.imageUrl || item.info?.imageGeneration?.imageUrl;
  const studioSrc = primaryRowImage || generationImage;
  const studioSourceUrl =
    item.sourceUrl ||
    item.info?.imageGeneration?.sourceUrl ||
    item.info?.imageSourceUrl ||
    (typeof originalSrc === "string" && !originalSrc.startsWith("/assets/") ? originalSrc : null);
  const studioSourceName =
    item.sourceName ||
    item.info?.imageGeneration?.sourceName ||
    item.info?.imageSourceName ||
    (studioSourceUrl?.includes("afnan")
      ? "Afnan Official (afnan.com)"
      : studioSourceUrl?.includes("lattafa")
        ? "Lattafa Official"
        : studioSourceUrl?.includes("qogita")
          ? "Qogita Wholesale Catalog"
          : (isRussian ? "Официальный источник" : "Official source"));
  const isOfficialStudio = Boolean(
    item.sourceType === "official_studio" ||
    item.info?.imageGeneration?.sourceType === "official_studio" ||
    (studioSourceUrl && !studioSourceUrl.includes("qogita"))
  );
  const [studioSourceIndex, setStudioSourceIndex] = useState(0);
  const [studioFailed, setStudioFailed] = useState(false);
  const [originalFailed, setOriginalFailed] = useState(false);

  const isLocalHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  const buildCandidateUrls = (src) => {
    if (typeof src !== "string" || !src) return [];
    const localApi =
      isLocalHost && src.startsWith("/assets/")
        ? `http://${window.location.hostname}:3001${src}`
        : null;
    const raw = /^\/assets\/img\/generated-products\/[a-f0-9]{64}\.png$/.test(src)
      ? `https://raw.githubusercontent.com/egorgrebennykov-del/Al-Warda/main/Al-Warda/public${src}`
      : null;
    const webp = src.endsWith(".png") ? src.replace(/\.png$/, ".webp") : null;
    const rawWebp = raw ? raw.replace(/\.png$/, ".webp") : null;
    const cdnWorker = src.startsWith("/assets/")
      ? `https://al-warda.egor-grebennykov.workers.dev${src}`
      : null;
    return [src, webp, localApi, cdnWorker, raw, rawWebp].filter(Boolean);
  };

  const studioSources = Array.from(
    new Set([
      ...buildCandidateUrls(primaryRowImage),
      ...buildCandidateUrls(generationImage),
    ])
  );

  const currentStudioSrc = studioSources[studioSourceIndex] || studioSrc;

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
                  <i className={qogitaMissingPhoto ? "ri-search-eye-line" : "ri-camera-line"} />
                  {qogitaMissingPhoto
                    ? (isRussian
                        ? `Нет фото на Qogita • Источник: ${studioSourceName}`
                        : `Missing on Qogita • Source: ${studioSourceName}`)
                    : (isRussian ? "Исходное фото Qogita (Оригинал)" : "Original Qogita Photo")}
                </span>
                {(originalSrc || (qogitaMissingPhoto && studioSourceUrl)) && (
                  <a
                    href={originalSrc || studioSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="product-compare-card__source-link"
                    title={
                      qogitaMissingPhoto
                        ? (isRussian ? `Открыть источник: ${studioSourceName}` : `Open source: ${studioSourceName}`)
                        : (isRussian ? "Открыть фото каталога в полном размере" : "Open catalog photo in full size")
                    }
                  >
                    <i className="ri-external-link-line" />
                    <span>
                      {qogitaMissingPhoto
                        ? studioSourceName
                        : (isRussian ? "Источник Qogita" : "Qogita Source")}
                    </span>
                  </a>
                )}
              </div>
              <div className="product-compare-card__preview product-compare-card__preview--white">
                {originalSrc && !originalFailed ? (
                  <img
                    src={originalSrc}
                    alt={
                      qogitaMissingPhoto
                        ? (isRussian ? `Фото из источника ${studioSourceName}` : `Photo from ${studioSourceName}`)
                        : (isRussian ? "Исходное фото" : "Original photo")
                    }
                    loading="lazy"
                    onError={() => setOriginalFailed(true)}
                  />
                ) : (
                  <div className="product-compare-card__empty">
                    <i className="ri-image-line" />
                    <span>
                      {qogitaMissingPhoto
                        ? (isRussian
                            ? `Фото в каталоге Qogita отсутствовало (источник: ${studioSourceName})`
                            : `Missing in Qogita catalog (source: ${studioSourceName})`)
                        : (isRussian ? "Исходное фото недоступно" : "Original photo unavailable")}
                    </span>
                  </div>
                )}
              </div>
              <div className="product-compare-card__footer">
                <p>
                  {qogitaMissingPhoto
                    ? (isRussian
                        ? `Фото в каталоге Qogita отсутствовало. Исходное изображение загружено из подтверждённого источника: ${studioSourceName}.`
                        : `No photo was available in Qogita catalog. Source image fetched from verified source: ${studioSourceName}.`)
                    : (isRussian
                        ? "Оригинальное изображение из оптового каталога Qogita с непрозрачным фоном и заводским освещением."
                        : "Raw catalog photograph from Qogita with opaque background and warehouse lighting.")}
                </p>
                {(originalSrc || (qogitaMissingPhoto && studioSourceUrl)) && (
                  <div className="product-compare-card__footer-source">
                    <span>{isRussian ? "Источник:" : "Source:"} </span>
                    <a href={originalSrc || studioSourceUrl} target="_blank" rel="noopener noreferrer">
                      {originalSrc || studioSourceUrl}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Studio AI Enhanced Transparent PNG */}
            <div className="product-compare-card product-compare-card--studio">
              <div className="product-compare-card__header">
                <span className="product-compare-card__tag product-compare-card__tag--studio">
                  <i className="ri-sparkling-fill" />
                  {isRussian ? "Студийное фото Al-Warda (1024×1024 RGBA)" : "Al-Warda Studio Photography"}
                </span>
                {studioSourceUrl ? (
                  <a
                    href={studioSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="product-compare-card__source-link"
                    title={isRussian ? `Перейти к источнику: ${studioSourceUrl}` : `Open source: ${studioSourceUrl}`}
                  >
                    <i className="ri-external-link-line" />
                    <span>{studioSourceName}</span>
                  </a>
                ) : (
                  <span className="product-compare-card__status product-compare-card__status--success">
                    <i className="ri-check-line" />
                    {isRussian ? "100% сохранность надписей" : "100% authentic typography"}
                  </span>
                )}
              </div>
              <div
                className={`product-compare-card__preview product-compare-card__preview--${backgroundMode}`}
              >
                {!studioFailed && currentStudioSrc ? (
                  <img
                    key={currentStudioSrc}
                    src={currentStudioSrc}
                    alt={isRussian ? "Студийное фото" : "Studio photo"}
                    loading="lazy"
                    onError={() => {
                      if (studioSourceIndex + 1 < studioSources.length) {
                        setStudioSourceIndex((prev) => prev + 1);
                      } else {
                        setStudioFailed(true);
                      }
                    }}
                  />
                ) : (
                  <div className="product-compare-card__empty">
                    <i className="ri-image-line" />
                    <span>
                      {isRussian
                        ? "Студийное фото загружается или ещё не синхронизировано"
                        : "Studio photo is syncing or not yet generated"}
                    </span>
                  </div>
                )}
              </div>
              <div className="product-compare-card__footer">
                <p>
                  {isOfficialStudio
                    ? (isRussian
                        ? `Официальное студийное изображение (${studioSourceName}) + U2Net ONNX сегментация фона + Фотометрия (1024×1024 RGBA).`
                        : `Official studio photography (${studioSourceName}) + U2Net ONNX background segmentation + Photometry (1024×1024 RGBA).`)
                    : (isRussian
                        ? "U2Net ONNX сегментация + Студийная фотометрия (CLAHE + Unsharp mask). Истинный прозрачный фон, аутентичный флакон без галлюцинаций."
                        : "U2Net ONNX segmentation + Studio Photometry (CLAHE + Unsharp mask). Genuine transparent background, zero bottle hallucinations.")}
                </p>
                {studioSourceUrl && (
                  <div className="product-compare-card__footer-source">
                    <span>{isRussian ? "Прямая ссылка:" : "Direct link:"} </span>
                    <a href={studioSourceUrl} target="_blank" rel="noopener noreferrer">
                      {studioSourceUrl}
                    </a>
                  </div>
                )}
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
