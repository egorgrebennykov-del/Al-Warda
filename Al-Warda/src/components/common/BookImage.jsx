import { useState } from "react";
import enhancedImageUrl from "../../../utils/enhancedImageUrl";
import "./BookImage.css";

export default function BookImage({
  src,
  alt = "",
  className = "",
  loading = "lazy",
  decoding = "async",
  fetchPriority = "auto",
  onLoad,
  onError,
}) {
  const [prevSrc, setPrevSrc] = useState(src);
  const [overrideSrc, setOverrideSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  // Sync state when src prop changes following React 19 recommended pattern
  if (src !== prevSrc) {
    setPrevSrc(src);
    setOverrideSrc(null);
    setFailed(false);
  }

  const currentSrc = overrideSrc ?? enhancedImageUrl(src);

  if (!currentSrc || failed) {
    return (
      <div
        className={`${className} book-image__placeholder`}
        aria-label={alt || "Book cover"}
      >
        <i className="ri-book-2-line book-image__placeholder-icon" />
        {alt && <span className="book-image__placeholder-title">{alt}</span>}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      referrerPolicy="no-referrer"
      onLoad={onLoad}
      onError={() => {
        // Fallback chain:
        // 1. Librarius /img/original/ -> /img/catalog/
        if (currentSrc.includes("/img/original/")) {
          setOverrideSrc(currentSrc.replace("/img/original/", "/img/catalog/"));
        } else if (
          currentSrc.includes("carturesti.md") &&
          !currentSrc.includes("-240.") &&
          !currentSrc.startsWith("/api/enhance-image")
        ) {
          // 2. Carturesti high-res failed -> try thumbnail with -240
          setOverrideSrc(
            currentSrc.replace(
              /-(\d+)\.(jpe?g|png|webp)(\?.*)?$/i,
              "-$1-240.$2$3",
            ),
          );
        } else if (currentSrc.startsWith("/api/enhance-image")) {
          // 3. Enhanced proxy failed -> try unwrapped source URL or prop src
          try {
            const inner = new URL(currentSrc, "http://localhost").searchParams.get("url");
            if (inner && inner !== currentSrc) {
              setOverrideSrc(inner);
            } else if (src && src !== currentSrc) {
              setOverrideSrc(src);
            } else {
              setFailed(true);
              onError?.();
            }
          } catch {
            if (src && src !== currentSrc) {
              setOverrideSrc(src);
            } else {
              setFailed(true);
              onError?.();
            }
          }
        } else if (
          currentSrc.includes("carteamea.md") &&
          src &&
          src !== currentSrc
        ) {
          // 4. Carteamea high-res failed -> try raw thumbnail
          setOverrideSrc(src);
        } else if (src || currentSrc) {
          // 5. Try backend proxy cache which bypasses browser certificate/CORS/hotlink issues
          const target = src || currentSrc;
          setOverrideSrc(`/api/enhance-image?url=${encodeURIComponent(target)}`);
        } else {
          // 6. Final fallback to placeholder
          setFailed(true);
          onError?.();
        }
      }}
    />
  );
}
