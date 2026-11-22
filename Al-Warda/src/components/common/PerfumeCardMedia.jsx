import { useState, useRef } from "react";
import { bustProductImageCache } from "../../../utils/perfumes";

/**
 * Renders a luxury perfume card stage with a bottom-grounded cutout flacon,
 * golden horizon glow, and a dedicated non-overlapping floor reflection.
 */
export default function PerfumeCardMedia({
  src,
  alt = "",
  loading = "lazy",
  onMissingImage,
  children,
}) {
  const mediaRef = useRef(null);
  const [prevSrc, setPrevSrc] = useState(src);
  const [overrideSrc, setOverrideSrc] = useState(null);
  const [padPct, setPadPct] = useState("0%");
  const [loaded, setLoaded] = useState(false);

  if (src !== prevSrc) {
    setPrevSrc(src);
    setOverrideSrc(null);
    setPadPct("0%");
    setLoaded(false);
  }

  const activeSrc = overrideSrc || bustProductImageCache(src);

  const handleLoad = (e) => {
    const imgEl = e.currentTarget;
    if (mediaRef.current) {
      mediaRef.current.classList.remove("is-processing-photo");
    }
    try {
      const nw = imgEl.naturalWidth || 0;
      const nh = imgEl.naturalHeight || 0;
      if (nw > 0 && nh > 0) {
        const s = 128;
        const c = document.createElement("canvas");
        c.width = s;
        c.height = s;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(imgEl, 0, 0, s, s);
          const data = ctx.getImageData(0, 0, s, s).data;
          let bottomY = s - 1;
          outer: for (let y = s - 1; y >= 0; y--) {
            for (let x = 0; x < s; x++) {
              if (data[(y * s + x) * 4 + 3] > 20) {
                bottomY = y;
                break outer;
              }
            }
          }
          const pct = Math.max(0, Math.min(35, ((s - 1 - bottomY) / s) * 100));
          setPadPct(`${pct.toFixed(2)}%`);
        }
      }
    } catch {
      // ignore cross-origin canvas scan errors
    }
    setLoaded(true);
    imgEl.style.opacity = "1";
  };

  const handleError = (e) => {
    const imgEl = e.currentTarget;
    const cleanPath = String(src || "").split("?")[0];
    if (
      !imgEl.dataset.triedGh &&
      cleanPath.startsWith("/assets/img/generated-products/")
    ) {
      imgEl.dataset.triedGh = "1";
      setOverrideSrc(
        `https://raw.githubusercontent.com/egorgrebennykov-del/Al-Warda/main/Al-Warda/public${cleanPath.replace(/\.webp$/, ".png")}`,
      );
      return;
    }
    if (onMissingImage) {
      onMissingImage(e);
    } else {
      const card = mediaRef.current?.closest(".warda-perfume-card");
      if (card) card.style.display = "none";
    }
  };

  return (
    <div
      ref={mediaRef}
      className="warda-perfume-card__media"
      style={{ "--card-flacon-pad-pct": padPct }}
    >
      {children}
      <div className="warda-perfume-card__bottom-glow" aria-hidden="true">
        <img
          src="/assets/img/stage/bottom_glow_stage.webp"
          alt=""
          className="warda-perfume-card__bottom-glow-img"
          loading={loading}
          decoding="async"
        />
      </div>
      <div className="warda-perfume-card__processing" aria-hidden="true">
        <span className="warda-perfume-card__processing-ring" />
      </div>

      <div className="warda-perfume-card__stage">
        {activeSrc && (
          <img
            src={activeSrc}
            alt={alt}
            className="warda-perfume-card__img"
            loading={loading}
            decoding="async"
            onLoad={handleLoad}
            onError={handleError}
          />
        )}
        <span className="warda-perfume-card__horizon" aria-hidden="true" />
      </div>

      <div className="warda-perfume-card__reflection" aria-hidden="true">
        {loaded && activeSrc && (
          <img
            src={activeSrc}
            alt=""
            className="warda-perfume-card__reflection-img"
            loading={loading}
            decoding="async"
          />
        )}
      </div>
    </div>
  );
}
