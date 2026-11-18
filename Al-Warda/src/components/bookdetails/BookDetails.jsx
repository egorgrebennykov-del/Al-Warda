import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router";
import {
  getPerfumeById,
  getPerfumeDetailsById,
  ensurePerfumeEnrichment,
  isPerfumeSet,
  inferSetItems,
  getPerfumeGtin,
  getPerfumeVolumeOptions,
  markPerfumesEvictedAsFailed,
  unmarkPerfumesEvictedAsFailed,
} from "../../../utils/perfumes";
import { isPrivileged as checkIsPrivileged } from "../../../utils/auth";
import { useAuth } from "../../context/AuthContext";
import { useConfirm, usePrompt } from "../../context/ConfirmContext";
import { useCartState } from "../../hooks/useCartState";
import { useLanguage } from "../../context/languageContext";
import { useCurrency } from "../../context/currencyContext";
import {
  getLocalizedCategory,
  getLocalizedGender,
  getLocalizedLongevity,
  getLocalizedNote,
  formatVolume,
  formatFallbackDescription,
} from "../../utils/localization";
import "../common/ProductCardImages.css";
import "./BookDetails.css";

function bustImageCache(url) {
  if (!url || typeof url !== "string") return url;
  if (!url.startsWith("/assets/img/")) return url;
  const clean = url.split("?")[0];
  return `${clean}?v=cutout-clean-v12`;
}

function getPerfumeImageSources(perfume, retryTick = 0) {
  if (!perfume) return [];
  const rawPrimary =
    perfume.image ||
    perfume.imageUrl ||
    perfume.info?.imageGeneration?.imageUrl ||
    "";
  // Never fall back to unprocessed raw supplier photos with white backgrounds
  if (
    !rawPrimary ||
    typeof rawPrimary !== "string" ||
    !rawPrimary.includes("/generated-products/")
  ) {
    return [];
  }
  const primary = bustImageCache(rawPrimary);
  const cleanPrimary = primary.split("?")[0];
  const retryParam = retryTick > 0 ? `&r=${retryTick}` : "";
  const ghRetryParam = retryTick > 0 ? `?r=${retryTick}` : "";
  const rawGhUrl =
    /^\/assets\/img\/generated-products\/[a-f0-9]{64}\.(png|webp)$/.test(cleanPrimary)
      ? `https://raw.githubusercontent.com/egorgrebennykov-del/Al-Warda/main/Al-Warda/public${cleanPrimary.replace(/\.webp$/, ".png")}${ghRetryParam}`
      : null;
  const webpUrl = cleanPrimary.endsWith(".png")
    ? `${cleanPrimary.replace(/\.png$/, ".webp")}?v=cutout-clean-v12${retryParam}`
    : null;
  const pngUrl = cleanPrimary.endsWith(".webp")
    ? `${cleanPrimary.replace(/\.webp$/, ".png")}?v=cutout-clean-v12${retryParam}`
    : null;
  const rawGhWebpUrl = rawGhUrl
    ? rawGhUrl.replace(/\.png(\?.*)?$/, `.webp${ghRetryParam}`)
    : null;

  return [
    `${primary}${retryParam}`,
    webpUrl,
    pngUrl,
    rawGhUrl,
    rawGhWebpUrl,
  ].filter(Boolean);
}

export default function BookDetails() {
  const { bookId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const isRussian = language === "ru";
  const { formatPrice } = useCurrency();
  const { isInCart, toggleCart } = useCartState();
  const { user, isPrivileged: isPrivContext } = useAuth();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const isPriv = Boolean(isPrivContext || checkIsPrivileged(user));

  const idFromQuery =
    searchParams.get("url") || searchParams.get("q") || searchParams.get("id");
  const targetId = bookId || idFromQuery || "raghba";

  const [perfume, setPerfume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxScale, setLightboxScale] = useState(1.5);
  const [zoomPoint, setZoomPoint] = useState({ x: 50, y: 50 });
  const [selectedVolume, setSelectedVolume] = useState("full");
  const [imgSourceIndex, setImgSourceIndex] = useState(0);
  const [imgRetryTick, setImgRetryTick] = useState(0);
  const [flaconLoaded, setFlaconLoaded] = useState(false);
  const [allSourcesExhausted, setAllSourcesExhausted] = useState(false);
  const [flaconBottomPadPct, setFlaconBottomPadPct] = useState(7.4);
  const [flaconScale, setFlaconScale] = useState(1);
  const [markingFailed, setMarkingFailed] = useState(false);
  const [markedFailedMsg, setMarkedFailedMsg] = useState("");
  const [isInErrors, setIsInErrors] = useState(false);
  const flaconImgRef = useRef(null);
  const imageSources = useMemo(
    () => getPerfumeImageSources(perfume, imgRetryTick),
    [perfume, imgRetryTick],
  );

  const perfumeKey = perfume?.id ?? "";
  useEffect(() => {
    setSelectedVolume("full");
    setImgSourceIndex(0);
    setImgRetryTick(0);
    setFlaconLoaded(false);
    setAllSourcesExhausted(false);
    setFlaconBottomPadPct(7.4);
    setFlaconScale(perfume && isPerfumeSet(perfume) ? 1.15 : 1);
    setMarkedFailedMsg("");
    setIsInErrors(
      Boolean(
        perfume?.info?.imageGeneration?.status === "failed" ||
          perfume?.info?.imageGeneration?.failed === true ||
          perfume?.info?.imageGeneration?.manualFailed === true,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfumeKey]);

  const handleMoveProductToFailed = async () => {
    if (!perfume?.id || markingFailed) return;
    const {
      confirmed,
      value: reason,
      checked: chooseNewPhoto,
    } = await prompt({
      title: isRussian ? "Перенести товар в ошибки" : "Move Product to Errors",
      message: isRussian
        ? `Перенести «${perfume.name || `#${perfume.id}`}» в список ошибок генерации?`
        : `Move "${perfume.name || `#${perfume.id}`}" to the failed generation list?`,
      presets: isRussian
        ? [
            "Плохое качество",
            "Неправильный наклон",
            "Не стоит ровно",
            "Не вырезан фон",
            "Неправильное отражение",
            "Лишние предметы",
            "Отсутствуют части",
            "Не тот товар",
          ]
        : [
            "Low quality",
            "Wrong tilt",
            "Not standing flat",
            "Background not removed",
            "Wrong reflection",
            "Extra objects",
            "Missing parts",
            "Wrong product",
          ],
      inputLabel: isRussian
        ? "Причина (необязательно)"
        : "Reason (optional)",
      inputPlaceholder: isRussian
        ? "Выберите из списка выше или напишите свою причину..."
        : "Pick from presets above or type your own reason...",
      checkboxLabel: isRussian ? "Выбрать новое фото" : "Choose new photo",
      defaultChecked: false,
      confirmText: isRussian ? "Перенести в ошибки" : "Move to Errors",
      type: "warning",
      icon: "ri-error-warning-line",
    });
    if (!confirmed) return;

    setMarkingFailed(true);
    setMarkedFailedMsg("");
    try {
      const payload = { ids: [String(perfume.id)], chooseNewPhoto };
      if (reason && reason.trim()) {
        payload.reason = reason.trim();
      }
      const res = await fetch("/api/admin/product-images/mark-failed", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      markPerfumesEvictedAsFailed([String(perfume.id)]);
      setIsInErrors(true);
      setMarkedFailedMsg(
        isRussian
          ? "Товар перенесён в список ошибок и скрыт с сайта"
          : "Product moved to failed list and hidden from the store",
      );
    } catch (err) {
      setMarkedFailedMsg(
        err.message ||
          (isRussian ? "Ошибка переноса" : "Failed to move product"),
      );
    } finally {
      setMarkingFailed(false);
    }
  };

  const handleRemoveProductFromErrors = async () => {
    if (!perfume?.id || markingFailed) return;
    const approved = await confirm({
      title: isRussian ? "Убрать товар из ошибок" : "Remove from Errors",
      message: isRussian
        ? `Убрать «${perfume.name || `#${perfume.id}`}» из списка ошибок и вернуть его на сайт?`
        : `Remove "${perfume.name || `#${perfume.id}`}" from the failed list and restore it to the store?`,
      confirmText: isRussian ? "Убрать из ошибок" : "Remove from Errors",
      type: "warning",
      icon: "ri-refresh-line",
    });
    if (!approved) return;

    setMarkingFailed(true);
    setMarkedFailedMsg("");
    try {
      const res = await fetch("/api/admin/product-images/unmark-failed", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [String(perfume.id)] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      unmarkPerfumesEvictedAsFailed([String(perfume.id)]);
      setIsInErrors(false);
      setMarkedFailedMsg(
        isRussian
          ? "Товар убран из списка ошибок"
          : "Product removed from failed list",
      );
    } catch (err) {
      setMarkedFailedMsg(
        err.message ||
          (isRussian ? "Ошибка восстановления" : "Failed to restore product"),
      );
    } finally {
      setMarkingFailed(false);
    }
  };
  useEffect(() => {
    if (!perfume) return undefined;
    if (!allSourcesExhausted && imageSources.length > 0) return undefined;
    const timer = setTimeout(() => {
      setImgSourceIndex(0);
      setAllSourcesExhausted(false);
      setImgRetryTick((prev) => prev + 1);
    }, 8000);
    return () => clearTimeout(timer);
  }, [perfume, allSourcesExhausted, imageSources.length]);

  const handleFlaconImgLoad = (e) => {
    const img = e.currentTarget;
    let bottomPadPct = 7.4;
    let computedScale = perfume && isPerfumeSet(perfume) ? 1.38 : 1;
    try {
      const sampleSize = 256;
      const canvas = document.createElement("canvas");
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
        // Reject images that still have an opaque rectangular background at all 4 corners
        const c1 = data[3];
        const c2 = data[(sampleSize - 1) * 4 + 3];
        const c3 = data[(sampleSize - 1) * sampleSize * 4 + 3];
        const c4 = data[((sampleSize - 1) * sampleSize + (sampleSize - 1)) * 4 + 3];
        if (c1 > 240 && c2 > 240 && c3 > 240 && c4 > 240) {
          setFlaconLoaded(false);
          setAllSourcesExhausted(true);
          return;
        }
        let firstRow = 0;
        let lastRow = sampleSize - 1;
        let lastSolidRow = -1;
        let firstCol = sampleSize - 1;
        let lastCol = 0;
        let foundAny = false;
        const colMaxSolidY = new Int16Array(sampleSize).fill(-1);
        for (let y = 0; y < sampleSize; y++) {
          for (let x = 0; x < sampleSize; x++) {
            const a = data[(y * sampleSize + x) * 4 + 3];
            if (a > 25) {
              if (!foundAny) {
                firstRow = y;
                foundAny = true;
              }
              lastRow = y;
              if (a > 120) {
                lastSolidRow = y;
                colMaxSolidY[x] = y;
              }
              if (x < firstCol) firstCol = x;
              if (x > lastCol) lastCol = x;
            }
          }
        }
        if (foundAny) {
          const refLast = lastSolidRow >= 0 ? lastSolidRow : lastRow;
          const allSolidCols = [];
          for (let x = firstCol; x <= lastCol; x++) {
            if (colMaxSolidY[x] >= 0) {
              allSolidCols.push(colMaxSolidY[x]);
            }
          }

          let groundRow = refLast;
          const totalSolid = allSolidCols.length;
          const wideBaseLimit = refLast - Math.round(sampleSize * 0.22);
          const wideBaseCols = allSolidCols.filter((cy) => cy >= wideBaseLimit);

          if (totalSolid >= 20 && wideBaseCols.length >= totalSolid * 0.65) {
            // For flat/3-4/multi-object bases covering >=65% of width within 22% of the bottom,
            // ground to the highest point (5th percentile) capped at 8% sink so deep 3D chests never submerge.
            wideBaseCols.sort((a, b) => a - b);
            const p5 = wideBaseCols[Math.floor(wideBaseCols.length * 0.05)];
            const maxWideSink = Math.round(sampleSize * 0.08);
            groundRow = Math.max(refLast - maxWideSink, Math.min(refLast, p5));
          } else {
            const baseZoneLimit = refLast - Math.round(sampleSize * 0.06);
            const baseCols = allSolidCols.filter((cy) => cy >= baseZoneLimit);
            if (baseCols.length > 4) {
              baseCols.sort((a, b) => a - b);
              const p25 = baseCols[Math.floor(baseCols.length * 0.25)];
              const maxSink = Math.round(sampleSize * 0.035);
              groundRow = Math.max(refLast - maxSink, Math.min(refLast, p25));
            }
          }
          bottomPadPct = Math.max(
            0,
            Math.min(42, ((sampleSize - 1 - groundRow) / sampleSize) * 100),
          );
          const fgH = Math.max(0.15, (lastRow - firstRow + 1) / sampleSize);
          const fgW = Math.max(0.15, (lastCol - firstCol + 1) / sampleSize);
          const visibleGroundH = Math.max(0.15, (groundRow - firstRow + 1) / sampleSize);
          const containerW = img.parentElement?.clientWidth || 586;
          const photoH = img.parentElement?.clientHeight || 438;
          const renderedH = img.offsetHeight || 420;
          const renderedW = img.offsetWidth || 420;
          const visiblePxH = visibleGroundH * renderedH;
          const targetScaleH = (photoH - 4) / Math.max(1, visiblePxH);
          const maxScaleW = (containerW * 0.94) / Math.max(1, renderedW * fgW);
          computedScale = Math.max(
            1,
            Math.min(1.22, targetScaleH, maxScaleW),
          );
        }
      }
    } catch {
      // Keep default percentage and scale if canvas read is blocked
    }
    setFlaconBottomPadPct(Number(bottomPadPct.toFixed(2)));
    setFlaconScale(Number(computedScale.toFixed(3)));
    setFlaconLoaded(true);
    setAllSourcesExhausted(false);
  };

  const activeImageSrc = imageSources[imgSourceIndex] || "";

  useEffect(() => {
    const imgEl = flaconImgRef.current;
    if (
      activeImageSrc &&
      !flaconLoaded &&
      !allSourcesExhausted &&
      imgEl &&
      imgEl.complete &&
      imgEl.naturalWidth > 0
    ) {
      handleFlaconImgLoad({ currentTarget: imgEl });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImageSrc, flaconLoaded, allSourcesExhausted]);

  const isGeneratedCutout =
    typeof activeImageSrc === "string" &&
    activeImageSrc.includes("/generated-products/");

  const handleFlaconImgError = () => {
    if (imgSourceIndex + 1 < imageSources.length) {
      setImgSourceIndex((prev) => prev + 1);
    } else {
      setFlaconLoaded(false);
      setAllSourcesExhausted(true);
    }
  };

  const [indexLookup, setIndexLookup] = useState({
    key: "",
    status: "idle",
    notes: null,
  });

  // The Qogita slug->id map (~350 KB) is only needed for the privileged admin link,
  // so it is loaded on demand instead of shipping on every product page.
  const [qogitaUrl, setQogitaUrl] = useState(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [targetId]);

  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsLightboxOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPerfume(null);

    getPerfumeById(targetId)
      .then(async (p) => {
        if (!cancelled && p && p.isLight) {
          // The catalog only carries light fields; load the full `info` JSONB
          // for this single product (cached + deduplicated).
          try {
            const details = await getPerfumeDetailsById(p.id);
            if (details) p = details;
          } catch {
            // keep the light object on failure
          }
        }
        if (!cancelled) {
          setPerfume(p);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.warn("Could not load product:", error);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [targetId]);

  const enrichedPerfume = perfume ? ensurePerfumeEnrichment(perfume) : null;
  const hasStoredNotes = Boolean(
    enrichedPerfume &&
    ((enrichedPerfume.topNotesRu || enrichedPerfume.topNotes || []).length ||
      (enrichedPerfume.heartNotesRu || enrichedPerfume.heartNotes || [])
        .length ||
      (enrichedPerfume.baseNotesRu || enrichedPerfume.baseNotes || []).length),
  );

  const perfumeId = perfume?.id ?? "";
  const perfumeName = perfume?.name ?? "";
  const perfumeBrand = perfume?.brand ?? "";
  const lookupKey = `${targetId}|${perfumeId}`;

  // Every fragrance must have an olfactory pyramid. When a product has no notes
  // yet, ask the server to generate them with DeepSeek and persist the result.
  useEffect(() => {
    if (hasStoredNotes || (!perfumeId && !perfumeName)) return undefined;

    const params = new URLSearchParams();
    if (perfumeId && /^\d+$/.test(String(perfumeId)))
      params.set("id", String(perfumeId));
    if (perfumeName) params.set("name", perfumeName);
    if (perfumeBrand) params.set("brand", perfumeBrand);
    if (!params.get("id") && !params.get("name")) return undefined;

    let cancelled = false;
    const key = lookupKey;
    const run = async () => {
      setIndexLookup({ key, status: "loading", notes: null });
      try {
        const response = await fetch(
          `/api/fragrance-notes?${params.toString()}`,
          {
            credentials: "same-origin",
          },
        );
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !payload) {
          setIndexLookup({ key, status: "error", notes: null });
          return;
        }
        if (payload.status === "found" && payload.notes) {
          setIndexLookup({ key, status: "found", notes: payload.notes });
          return;
        }
        setIndexLookup({
          key,
          status: payload.status === "not_found" ? "not_found" : "error",
          notes: null,
        });
      } catch {
        if (!cancelled) setIndexLookup({ key, status: "error", notes: null });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [lookupKey, hasStoredNotes, perfumeId, perfumeName, perfumeBrand]);

  const indexNotes = indexLookup.key === lookupKey ? indexLookup.notes : null;
  const indexNotesState =
    indexLookup.key === lookupKey ? indexLookup.status : "idle";

  useEffect(() => {
    const target = perfume || enrichedPerfume;
    if (!isPriv || !target) {
      setQogitaUrl(null);
      return undefined;
    }
    let cancelled = false;
    import("../../../utils/qogitaProductUrls")
      .then(({ getQogitaProductUrl }) => {
        if (!cancelled) setQogitaUrl(getQogitaProductUrl(target));
      })
      .catch(() => {
        if (!cancelled) setQogitaUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isPriv, perfume, enrichedPerfume]);

  const perfumeGtin =
    isPriv && (perfume || enrichedPerfume)
      ? getPerfumeGtin(perfume || enrichedPerfume)
      : "";
  const isSet = enrichedPerfume ? isPerfumeSet(enrichedPerfume) : false;
  const setItems =
    enrichedPerfume?.setItems ||
    (isSet
      ? inferSetItems(enrichedPerfume?.name, enrichedPerfume?.brand)
      : null);
  const rawBottleVol = isSet
    ? enrichedPerfume?.volume?.match(/\d+\s*[xX×]\s*\d+\s*(?:ml|мл)/i)?.[0] ||
      enrichedPerfume?.volume ||
      t("details.discoverySet")
    : (enrichedPerfume?.volume || "").split("/")[0].trim() || "—";
  const fullBottleVol = formatVolume(rawBottleVol, language);

  const hasMultipleSizes =
    Array.isArray(perfume?.availableSizes) && perfume.availableSizes.length > 1;
  const perfumeVolumeOptions = hasMultipleSizes
    ? getPerfumeVolumeOptions(perfume)
    : [];
  const selectedSizeOpt = hasMultipleSizes
    ? perfumeVolumeOptions.find((o) => o.key === selectedVolume) ||
      perfumeVolumeOptions[0]
    : null;
  const displayPrice = selectedSizeOpt
    ? selectedSizeOpt.price
    : Number(perfume?.price || 0);
  const displayVolume = selectedSizeOpt
    ? formatVolume(selectedSizeOpt.ml, language)
    : fullBottleVol;

  const handleSelectVolume = (vol) => {
    setSelectedVolume(vol);
  };

  const handleAddToCart = async () => {
    if (!perfume) return;
    try {
      const volKey = selectedSizeOpt ? selectedSizeOpt.key : "full";
      const currentlyInCart = isInCart(perfume, volKey);
      await toggleCart(perfume, {
        volKey,
        isSample: false,
        quantity,
        language,
      });
      if (!currentlyInCart) {
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2200);
      }
    } catch (err) {
      console.warn("Toggle cart error:", err);
    }
  };

  if (loading) {
    return (
      <div
        className="warda-details-page warda-details-loading"
        role="status"
        aria-live="polite"
      >
        <div className="container">
          <span className="warda-details-sr-only">
            {t("details.loading", "Loading fragrance")}
          </span>
          <div className="warda-details-skeleton-nav" />
          <div className="warda-details-grid" aria-hidden="true">
            <div className="warda-details-skeleton-image" />
            <div className="warda-details-skeleton-info">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!perfume) {
    return (
      <div className="container warda-details-empty">
        <h2>{t("details.fragranceNotFound")}</h2>
        <Link to="/featured" className="warda-btn">
          {t("details.toCollection")}
        </Link>
      </div>
    );
  }

  const indexNotesBucket = indexNotes
    ? indexNotes[language] || indexNotes.en || indexNotes.ru || null
    : null;

  const resolveNotes = (notesRu, notesEn, databaseNotes) => {
    let raw =
      (language === "ru"
        ? notesRu?.length
          ? notesRu
          : notesEn
        : notesEn?.length
          ? notesEn
          : notesRu) ||
      databaseNotes ||
      [];
    if (typeof raw === "string") {
      raw = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return (Array.isArray(raw) ? raw : []).map((n) =>
      getLocalizedNote(n, language),
    );
  };

  const topNotes = resolveNotes(
    enrichedPerfume?.topNotesRu || enrichedPerfume?.topNotes,
    enrichedPerfume?.topNotesEn,
    indexNotesBucket?.top,
  );
  const heartNotes = resolveNotes(
    enrichedPerfume?.heartNotesRu || enrichedPerfume?.heartNotes,
    enrichedPerfume?.heartNotesEn,
    indexNotesBucket?.heart,
  );
  const baseNotes = resolveNotes(
    enrichedPerfume?.baseNotesRu || enrichedPerfume?.baseNotes,
    enrichedPerfume?.baseNotesEn,
    indexNotesBucket?.base,
  );
  const hasDisplayNotes = Boolean(
    topNotes.length || heartNotes.length || baseNotes.length,
  );
  const notesStatus =
    hasDisplayNotes || hasStoredNotes
      ? null
      : indexNotesState === "loading"
        ? "loading"
        : indexNotesState === "found"
          ? "not_found"
          : "unavailable";

  let displayDesc =
    enrichedPerfume?.[`description_${language}`] ||
    enrichedPerfume?.[
      `description${language.charAt(0).toUpperCase() + language.slice(1)}`
    ];

  if (!displayDesc) {
    if (language === "ru") {
      displayDesc =
        enrichedPerfume?.descriptionRu || enrichedPerfume?.description;
    } else if (language === "en") {
      displayDesc = enrichedPerfume?.descriptionEn;
    }
  }

  const isCorruptedOrNonNative =
    !displayDesc ||
    displayDesc.includes("Сертифицированная оригинальная") ||
    displayDesc.length < 25 ||
    (language !== "ru" && language !== "bg" && /[а-яА-ЯёЁ]/.test(displayDesc));

  if (isCorruptedOrNonNative) {
    displayDesc = formatFallbackDescription(
      enrichedPerfume?.name,
      enrichedPerfume?.brand,
      topNotes,
      heartNotes,
      baseNotes,
      language,
    );
  }

  return (
    <div className="warda-details-page">
      <div className="container">
        <div className="warda-details-top-nav">
          <button
            type="button"
            className="warda-back-button"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate("/featured");
              }
            }}
            aria-label="Back"
          >
            <span className="warda-back-arrow">←</span>
            <span>{t("details.backToCatalog")}</span>
          </button>

          <div className="warda-details-breadcrumb">
            <Link to="/">{t("nav.home")}</Link>
            <span className="warda-breadcrumb-sep">/</span>
            <Link to="/featured">{t("nav.catalog")}</Link>
            <span className="warda-breadcrumb-sep">/</span>
            <span className="warda-breadcrumb-current">{perfume.name}</span>
          </div>

          {isPriv && qogitaUrl && (
            <a
              href={qogitaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="warda-privileged-top-badge"
              title={t("details.qogitaView")}
            >
              <i className="ri-shield-star-line" />
              <span>Qogita ↗</span>
              {perfumeGtin && (
                <span className="warda-privileged-gtin-label">
                  {perfumeGtin}
                </span>
              )}
            </a>
          )}
        </div>

        <div className="warda-details-grid">
          {/* MEDIA COLUMN */}
          <div className="warda-details-media">
            <div className="warda-details-card">
              <div
                className="warda-details-img-wrap"
                onClick={() => setIsLightboxOpen(true)}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setZoomPoint({
                    x: ((e.clientX - rect.left) / rect.width) * 100,
                    y: ((e.clientY - rect.top) / rect.height) * 100,
                  });
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setIsLightboxOpen(true);
                  }
                }}
                aria-label="Inspect perfume flacon details"
                title={t("details.clickToView")}
              >
                <div
                  className="warda-stage-assembly"
                  style={{
                    "--flacon-pad-pct": `${flaconBottomPadPct}%`,
                    "--flacon-scale": flaconScale,
                  }}
                >
                  {/* Large Warm Glow & Reflective Horizon Stage */}
                  <div className="warda-details-bottom-glow" aria-hidden="true">
                    <img
                      src="/assets/img/stage/bottom_glow_stage.webp"
                      alt=""
                      className="warda-details-bottom-glow-img"
                    />
                  </div>

                  {/* Flacon Image or Processing Loader */}
                  <div className="warda-details-photo">
                    {(!flaconLoaded || allSourcesExhausted || !activeImageSrc) && (
                      <div
                        className="warda-flacon-processing-loader"
                        role="status"
                        aria-live="polite"
                      >
                        <div className="warda-flacon-processing-spinner">
                          <span className="warda-flacon-processing-ring warda-flacon-processing-ring--outer" />
                          <span className="warda-flacon-processing-ring warda-flacon-processing-ring--inner" />
                          <i className="ri-sparkling-2-line warda-flacon-processing-icon" />
                        </div>
                        <span className="warda-flacon-processing-title">
                          {isRussian
                            ? "Обработка студийного фото..."
                            : "Processing studio photo..."}
                        </span>
                        <span className="warda-flacon-processing-subtitle">
                          {isRussian
                            ? "Удаление фона и цветокоррекция"
                            : "Removing background & color grading"}
                        </span>
                      </div>
                    )}
                    {activeImageSrc && !allSourcesExhausted && (
                      <img
                        ref={flaconImgRef}
                        src={activeImageSrc}
                        alt={perfume.name}
                        className="warda-details-img"
                        style={{
                          opacity: flaconLoaded ? 1 : 0,
                        }}
                        loading="eager"
                        decoding="async"
                        onLoad={handleFlaconImgLoad}
                        onError={handleFlaconImgError}
                      />
                    )}
                  </div>

                  {/* Contact Shadow at the Flacon Base */}
                  {flaconLoaded && !allSourcesExhausted && activeImageSrc && (
                    <div
                      className="warda-stage-contact-shadow"
                      aria-hidden="true"
                    />
                  )}

                  {/* Optical Mirror Reflection at the Bottom */}
                  <div className="warda-stage-reflection-container" aria-hidden="true">
                    {flaconLoaded && !allSourcesExhausted && activeImageSrc && (
                      <img
                        src={activeImageSrc}
                        alt=""
                        className="warda-stage-reflection-img"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Photo Source Link */}
              {(() => {
                const sourceUrl =
                  perfume?.sourceUrl ||
                  perfume?.info?.imageGeneration?.sourceUrl ||
                  perfume?.info?.imageSourceUrl ||
                  perfume?.info?.rawImage ||
                  perfume?.rawImage ||
                  (perfume?.image && !perfume.image.startsWith("/assets/") ? perfume.image : null);
                if (!sourceUrl) return null;
                const sourceLabel =
                  perfume?.sourceName ||
                  perfume?.info?.imageGeneration?.sourceName ||
                  perfume?.info?.imageSourceName ||
                  (sourceUrl.includes("qogita")
                    ? "Qogita"
                    : sourceUrl.includes("afnan")
                      ? "Afnan Official"
                      : sourceUrl.includes("lattafa")
                        ? "Lattafa Official"
                        : (isRussian ? "Источник фото" : "Photo source"));
                return (
                  <div className="warda-details-photo-source">
                    <span className="warda-details-photo-source__label">
                      {isRussian ? "Источник фото:" : "Photo source:"}
                    </span>{" "}
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="warda-details-photo-source__link"
                      title={isRussian ? "Перейти к источнику фотографии" : "Open photo source"}
                    >
                      <span>{sourceLabel}</span>
                      <i className="ri-external-link-line" />
                    </a>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* INFO COLUMN */}
          <div className="warda-details-info">
            <div className="warda-details-tag">
              <span className="warda-tag-category">
                {isSet
                  ? t("details.discoverySet")
                  : getLocalizedCategory(perfume.category, language)}
              </span>
              <span className="warda-tag-badge">
                {isSet ? t("details.miniatureSet") : perfume.concentration}
              </span>
            </div>

            <h1 className="warda-details-title">{perfume.name}</h1>
            <p className="warda-details-subtitle">{perfume.brand}</p>

            <div className="warda-details-rating">
              <div className="warda-stars">★★★★★</div>
              <span className="warda-rating-num">{perfume.rating} / 5.0</span>
              <span className="warda-reviews-count">
                ({perfume.reviewsCount} {t("details.reviews")})
              </span>
            </div>

            {/* PRIVILEGED ACCESS: DIRECT QOGITA WHOLESALE PRODUCT LINK & ADMIN CONTROLS */}
            {isPriv && (
              <div className="warda-privileged-product-bar">
                <div className="warda-privileged-product-info">
                  <span className="warda-privileged-icon-wrap">
                    <i className="ri-shield-star-fill" />
                  </span>
                  <div className="warda-privileged-text-group">
                    <div className="warda-privileged-title-row">
                      <span className="warda-privileged-badge">
                        {t("details.privilegedAccess")}
                      </span>
                      {perfumeGtin && (
                        <span className="warda-privileged-gtin-tag">
                          GTIN: {perfumeGtin}
                        </span>
                      )}
                    </div>
                    <span className="warda-privileged-desc">
                      {markedFailedMsg || t("details.qogitaDirect")}
                    </span>
                  </div>
                </div>

                <div className="warda-privileged-actions">
                  {qogitaUrl && (
                    <a
                      href={qogitaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="warda-privileged-qogita-btn"
                      title={t("details.qogitaView")}
                    >
                      <i className="ri-external-link-line" />
                      <span>{t("details.qogitaView")}</span>
                    </a>
                  )}
                  {perfumeGtin && (
                    <a
                      href={`https://www.qogita.com/account/catalog/?search=${encodeURIComponent(perfumeGtin)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="warda-privileged-panel-btn"
                      title={t("details.qogitaPortal")}
                    >
                      <i className="ri-search-line" />
                      <span>{t("details.qogitaPortal")}</span>
                    </a>
                  )}
                  <Link
                    to="/privileged/qogita"
                    className="warda-privileged-panel-btn"
                    title={t("details.qogitaWholesalePanel")}
                  >
                    <i className="ri-dashboard-3-line" />
                    <span>{t("details.qogitaWholesalePanel")}</span>
                  </Link>
                  { /^\d+$/.test(String(perfume?.id || "")) && (
                    <button
                      type="button"
                      className={`warda-privileged-panel-btn warda-privileged-fail-btn ${isInErrors ? "warda-privileged-fail-btn--active" : ""}`}
                      disabled={markingFailed}
                      onClick={
                        isInErrors
                          ? handleRemoveProductFromErrors
                          : handleMoveProductToFailed
                      }
                      title={
                        isInErrors
                          ? isRussian
                            ? "Нажмите, чтобы убрать товар из списка ошибок"
                            : "Click to remove this product from the failed list"
                          : isRussian
                            ? "Перенести этот товар в список ошибок генерации"
                            : "Move this product to the failed generation list"
                      }
                    >
                      <i
                        className={
                          markingFailed
                            ? "ri-loader-4-line ri-spin"
                            : isInErrors
                              ? "ri-error-warning-fill"
                              : "ri-error-warning-line"
                        }
                      />
                      <span>
                        {markingFailed
                          ? isRussian
                            ? isInErrors
                              ? "Убираем..."
                              : "Перенос..."
                            : isInErrors
                              ? "Removing..."
                              : "Moving..."
                          : isInErrors
                            ? isRussian
                              ? "В ошибках"
                              : "In Errors"
                            : isRussian
                              ? "В ошибки"
                              : "Move to Errors"}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* FORMAT / VOLUME SELECTOR: ONLY DISPLAYED IF MULTIPLE SIZES EXIST IN QOGITA */}
            {hasMultipleSizes && (
              <div
                className="warda-details-volumes"
                role="radiogroup"
                aria-label={t("details.selectVolume")}
              >
                <div className="warda-details-volume-pills">
                  {perfumeVolumeOptions.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      className={`warda-volume-pill ${selectedVolume === opt.key ? "active" : ""}`}
                      onClick={() => handleSelectVolume(opt.key)}
                      role="radio"
                      aria-checked={selectedVolume === opt.key}
                    >
                      <span className="warda-volume-pill__title">
                        {formatVolume(opt.ml, language)}
                      </span>
                      <span className="warda-volume-pill__price">
                        {formatPrice(opt.price)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="warda-details-price-row">
              <span className="warda-details-price">
                {formatPrice(displayPrice)}
              </span>
              {perfume.inStock === false && (
                <span className="warda-stock-status">
                  {t("details.preorder")}
                </span>
              )}
            </div>

            <p className="warda-details-desc">{displayDesc}</p>

            {/* SET COMPOSITION / INCLUDED FRAGRANCES OR OLFACTORY PYRAMID */}
            {isSet ? (
              <div className="warda-set-composition">
                <h3 className="warda-pyramid-title">
                  <i
                    className="ri-gift-2-line"
                    style={{ marginRight: "0.5rem", color: "#d4af37" }}
                  />
                  {t("details.setContents")}
                </h3>
                {setItems && setItems.length > 0 ? (
                  <div className="warda-set-items-grid">
                    {setItems.map((item, idx) => (
                      <div key={idx} className="warda-set-item-card">
                        <div className="warda-set-item-head">
                          <span className="warda-set-item-badge">
                            {formatVolume(item.volume || "10 ml", language)}
                          </span>
                          <h4 className="warda-set-item-title">{item.name}</h4>
                        </div>
                        {(item.descRu || item.descEn) && (
                          <p className="warda-set-item-desc">
                            {item[`desc_${language}`] ||
                              item[
                                `desc${language.charAt(0).toUpperCase() + language.slice(1)}`
                              ] ||
                              (language === "ru"
                                ? item.descRu
                                : item.descEn || item.descRu)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="warda-set-features">
                    <div className="warda-set-feature-row">
                      <span className="warda-set-feature-bullet">✦</span>
                      <span>{t("details.setFeature1")}</span>
                    </div>
                    <div className="warda-set-feature-row">
                      <span className="warda-set-feature-bullet">✦</span>
                      <span>{t("details.setFeature2")}</span>
                    </div>
                    <div className="warda-set-feature-row">
                      <span className="warda-set-feature-bullet">✦</span>
                      <span>{t("details.setFeature3")}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="warda-pyramid">
                <h3 className="warda-pyramid-title">{t("details.pyramid")}</h3>
                {notesStatus === "loading" ? (
                  <p className="warda-pyramid-status" role="status">
                    <i
                      className="ri-loader-4-line ri-spin"
                      aria-hidden="true"
                    />
                    <span>
                      {t("details.notesLoading", "Generating fragrance notes…")}
                    </span>
                  </p>
                ) : notesStatus ? (
                  <p className="warda-pyramid-status warda-pyramid-status--empty">
                    <i className="ri-information-line" aria-hidden="true" />
                    <span>
                      {t(
                        "details.notesUnavailable",
                        "Notes for this fragrance are not available yet.",
                      )}
                    </span>
                  </p>
                ) : (
                  <div className="warda-pyramid-grid">
                    <div className="warda-pyramid-step">
                      <span className="warda-step-name">
                        {t("details.topNotes")}
                      </span>
                      <div className="warda-notes-tags">
                        {topNotes.map((n) => (
                          <span key={n} className="warda-note-tag">
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="warda-pyramid-step">
                      <span className="warda-step-name">
                        {t("details.heartNotes")}
                      </span>
                      <div className="warda-notes-tags">
                        {heartNotes.map((n) => (
                          <span key={n} className="warda-note-tag">
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="warda-pyramid-step">
                      <span className="warda-step-name">
                        {t("details.baseNotes")}
                      </span>
                      <div className="warda-notes-tags">
                        {baseNotes.map((n) => (
                          <span key={n} className="warda-note-tag">
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SPECS ROW */}
            <div className="warda-specs-row">
              <div className="warda-spec-item">
                <span className="warda-spec-lbl">
                  {isSet ? t("details.format") : t("details.volume")}
                </span>
                <span className="warda-spec-val">
                  {isSet ? t("details.discoverySet") : displayVolume}
                </span>
              </div>
              <div className="warda-spec-item">
                <span className="warda-spec-lbl">
                  {isSet ? t("details.included") : t("details.gender")}
                </span>
                <span className="warda-spec-val">
                  {isSet
                    ? formatVolume(perfume.volume || "4 × 10 ml", language)
                    : getLocalizedGender(perfume.gender, language)}
                </span>
              </div>
              <div className="warda-spec-item">
                <span className="warda-spec-lbl">{t("details.longevity")}</span>
                <span className="warda-spec-val">
                  {getLocalizedLongevity(perfume.longevity, language)}
                </span>
              </div>
            </div>

            {/* ACTION ROW */}
            <div className="warda-details-actions">
              <div className="warda-qty-selector">
                <button
                  type="button"
                  className="warda-qty-btn"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                >
                  -
                </button>
                <span className="warda-qty-val">{quantity}</span>
                <button
                  type="button"
                  className="warda-qty-btn"
                  onClick={() => setQuantity((q) => q + 1)}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              {(() => {
                const inCart = isInCart(
                  perfume,
                  selectedSizeOpt ? selectedSizeOpt.key : "full",
                );
                return (
                  <button
                    type="button"
                    className={`warda-btn warda-btn--add-details ${inCart ? "warda-btn--in-cart" : isAdded ? "warda-btn--added" : ""}`}
                    onClick={handleAddToCart}
                    title={inCart ? t("details.remove") : undefined}
                  >
                    {inCart ? (
                      <>
                        <span className="warda-btn__text-normal">
                          {t("details.inBag")}
                        </span>
                        <span className="warda-btn__text-hover">
                          {t("details.remove")}
                        </span>
                      </>
                    ) : isAdded ? (
                      t("details.addedToBag")
                    ) : (
                      t("details.addToCart")
                    )}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* FULLSCREEN LIGHTBOX / HIGH-RES INSPECTION MODAL */}
      {isLightboxOpen && (
        <div
          className="warda-lightbox-backdrop"
          onClick={() => setIsLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="warda-lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header / Controls */}
            <div className="warda-lightbox-header">
              <div className="warda-lightbox-title-box">
                <span className="warda-lightbox-brand">{perfume.brand}</span>
                <h2 className="warda-lightbox-title">{perfume.name}</h2>
              </div>

              <div className="warda-lightbox-controls">
                <div className="warda-lightbox-zoom-pills">
                  {[1, 1.3, 1.6, 2].map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      className={`warda-lightbox-scale-btn ${lightboxScale === scale ? "active" : ""}`}
                      onClick={() => setLightboxScale(scale)}
                    >
                      {scale}×
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="warda-lightbox-close"
                  onClick={() => setIsLightboxOpen(false)}
                  aria-label="Close inspection modal"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Viewport with Zoomable Image */}
            <div className="warda-lightbox-viewport">
              <div className="warda-lightbox-stage">
                <img
                  src={activeImageSrc || perfume?.image}
                  alt={perfume.name}
                  className="warda-lightbox-img"
                  style={{
                    transform: `scale(${lightboxScale})`,
                  }}
                  onError={handleFlaconImgError}
                />
              </div>
            </div>

            {/* Footer Hint */}
            <div className="warda-lightbox-footer">
              <span className="warda-lightbox-hint">
                <i className="ri-information-line" />
                {t("details.lightboxHint")}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
