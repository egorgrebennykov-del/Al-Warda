import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useConfirm, useAlert } from "../../context/ConfirmContext";
import { getPerfumeUrl } from "../../../utils/perfumes";
import ProductManualConfigModal from "./ProductManualConfigModal";
import ProductImageCompareModal from "./ProductImageCompareModal";
import GpuDeviceAnalysisModal from "./GpuDeviceAnalysisModal";
import {
  getSavedDeviceProfile,
  clearSavedDeviceProfile,
} from "../../utils/deviceGpuAnalysis";
import "./ProductImageQueue.css";

async function callGpuApi(endpoint, options = {}) {
  try {
    const res = await fetch(`/api/admin/gpu-generation/${endpoint}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (res.ok) {
      const data = await res.json();
      if (!data.isCloudflare) return data;
    }
  } catch {}

  try {
    const res = await fetch(`http://127.0.0.1:3001/api/admin/gpu-generation/${endpoint}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (res.ok) return await res.json();
  } catch {}

  try {
    const res = await fetch(`http://localhost:3001/api/admin/gpu-generation/${endpoint}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (res.ok) return await res.json();
  } catch {}

  try {
    const res = await fetch(`http://localhost:5000/api/admin/gpu-generation/${endpoint}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (res.ok) return await res.json();
  } catch {}

  return null;
}

async function fetchWithRetry(url, options = {}, retries = 2, delayMs = 1000) {
  let lastResponse = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
      });
      if ([502, 503, 504].includes(response.status) && attempt < retries) {
        lastResponse = response;
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  return lastResponse;
}

async function fetchActions(options = {}) {
  return fetchWithRetry("/api/admin/product-images/actions", options);
}

function formatDuration(ms, isRussian = true, includeSeconds = true) {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const parts = [];
  if (hours > 0) {
    parts.push(`${hours} ${isRussian ? "ч" : "h"}`);
  }
  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes} ${isRussian ? "мин" : "m"}`);
  }
  if (includeSeconds && hours === 0) {
    parts.push(`${seconds} ${isRussian ? "сек" : "s"}`);
  } else if (includeSeconds && parts.length > 0) {
    parts.push(
      `${String(seconds).padStart(2, "0")} ${isRussian ? "сек" : "s"}`,
    );
  }
  if (!parts.length) {
    return includeSeconds
      ? `0 ${isRussian ? "сек" : "s"}`
      : `< 1 ${isRussian ? "мин" : "m"}`;
  }
  return parts.join(" ");
}

function formatDateTime(isoString, isRussian = true) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(isRussian ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeErrorSummary(errorText = "", isRussian = true) {
  const text = String(errorText || "");
  if (
    /не парфюм|не содержит флакон|бижутер|браслет|украшен|non-perfume|jewelry|bracelet/i.test(
      text,
    )
  ) {
    return isRussian
      ? "Отклонено: на изображении нет парфюма (бижутерия / посторонний предмет)"
      : "Rejected: no perfume bottle in image (jewelry / non-fragrance item)";
  }
  if (/flagged|3030/i.test(text)) {
    return isRussian
      ? "Отклонено фильтром безопасности Cloudflare AI (код 3030)"
      : "Flagged by Cloudflare AI safety filter (code 3030)";
  }
  if (/quota|rate limit|429/i.test(text)) {
    return isRussian
      ? "Достигнут суточный лимит Cloudflare Workers AI"
      : "Cloudflare Workers AI daily quota reached";
  }
  if (/opaque border/i.test(text)) {
    return isRussian
      ? "Непрозрачная рамка после удаления фона"
      : "Opaque border after background removal";
  }
  if (/transparent background/i.test(text)) {
    return isRussian
      ? "Ошибка сегментации прозрачного фона"
      : "Transparent background segmentation failed";
  }
  return null;
}

function getRawGithubUrl(imageUrl) {
  if (
    typeof imageUrl === "string" &&
    /^\/assets\/img\/generated-products\/[a-f0-9]{64}\.png$/.test(imageUrl)
  ) {
    return `https://raw.githubusercontent.com/egorgrebennykov-del/Al-Warda/main/Al-Warda/public${imageUrl}`;
  }
  return null;
}

function GalleryImageItem({
  image,
  isRussian,
  isSelected,
  isDisabled,
  refreshKey,
  onToggleSelect,
  onRequeue,
  onManualConfig,
  onCompare,
}) {
  const [imgStatus, setImgStatus] = useState("initial"); // "initial" | "syncing" | "failed"
  const [sourceIndex, setSourceIndex] = useState(0); // 0 = primary, 1 = raw github
  const [retryCount, setRetryCount] = useState(0);
  const [cacheBuster, setCacheBuster] = useState("");

  const [lastImageUrl, setLastImageUrl] = useState(image.imageUrl);
  const [lastRefreshKey, setLastRefreshKey] = useState(refreshKey);

  if (image.imageUrl !== lastImageUrl) {
    setLastImageUrl(image.imageUrl);
    setImgStatus("initial");
    setSourceIndex(0);
    setRetryCount(0);
    setCacheBuster("");
  }

  if (refreshKey && refreshKey !== lastRefreshKey) {
    setLastRefreshKey(refreshKey);
    if (imgStatus === "failed") {
      setImgStatus("initial");
      setSourceIndex(0);
      setRetryCount(0);
      setCacheBuster(`?t=${Date.now()}`);
    }
  }

  const rawUrl = getRawGithubUrl(image.imageUrl);
  const webpUrl =
    typeof image.imageUrl === "string" && image.imageUrl.endsWith(".png")
      ? image.imageUrl.replace(/\.png$/, ".webp")
      : null;
  const rawWebpUrl =
    typeof rawUrl === "string" && rawUrl.endsWith(".png")
      ? rawUrl.replace(/\.png$/, ".webp")
      : null;
  const supplierRawImage =
    image.rawImage ||
    image.info?.rawImage ||
    image.source_image_url ||
    image.raw_image_url ||
    null;

  const sources = [
    image.imageUrl,
    webpUrl,
    rawUrl,
    rawWebpUrl,
    supplierRawImage,
  ].filter(Boolean);

  let currentSrc = sources[sourceIndex] || image.imageUrl;
  if (cacheBuster && currentSrc && !currentSrc.startsWith("data:")) {
    currentSrc = `${currentSrc}${currentSrc.includes("?") ? "&" : "?"}${cacheBuster.replace(/^\?/, "")}`;
  }

  const productUrl = image.url || getPerfumeUrl(image);

  const handleImageError = () => {
    // If next fallback source is available, switch to it immediately
    if (sourceIndex + 1 < sources.length) {
      setSourceIndex((prev) => prev + 1);
      return;
    }

    // All source fallbacks failed on this attempt
    if (retryCount < 2) {
      setImgStatus("syncing");
      const nextRetry = retryCount + 1;
      setTimeout(() => {
        setRetryCount(nextRetry);
        setSourceIndex(0);
        setCacheBuster(`?retry=${nextRetry}_${Date.now()}`);
        setImgStatus("initial");
      }, 2000);
      return;
    }

    setImgStatus("failed");
  };

  const handleManualRetry = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setImgStatus("initial");
    setSourceIndex(0);
    setRetryCount(0);
    setCacheBuster(`?manual=${Date.now()}`);
  };

  return (
    <article
      className={`product-image-queue__gallery-item ${
        imgStatus === "failed"
          ? "product-image-queue__gallery-item--failed"
          : ""
      }`}
      key={image.id}
    >
      <div className="product-image-queue__gallery-item-header">
        <label>
          <input
            type="checkbox"
            checked={isSelected}
            disabled={isDisabled}
            onChange={onToggleSelect}
          />
          {isRussian ? "Выбрать" : "Select"}
        </label>
      </div>

      <div className="product-image-queue__gallery-thumb-wrap">
        {imgStatus === "syncing" ? (
          <div
            className="product-image-queue__gallery-placeholder product-image-queue__gallery-placeholder--syncing"
            title={
              isRussian
                ? "Синхронизация файла изображения с хранилищем..."
                : "Syncing image file with storage..."
            }
          >
            <i className="ri-loader-4-line ri-spin" style={{ color: "#d97706" }} />
            <span className="product-image-queue__syncing-badge">
              {isRussian ? "Публикация..." : "Publishing..."}
            </span>
            <span className="product-image-queue__broken-hint">
              {isRussian
                ? "Синхронизация с сервером..."
                : "Syncing with server..."}
            </span>
          </div>
        ) : imgStatus === "failed" ? (
          <div
            className="product-image-queue__gallery-placeholder"
            title={
              isRussian
                ? "Файл изображения недоступен или ещё не опубликован"
                : "Image file unavailable or still publishing"
            }
          >
            <i className="ri-image-broken-line" />
            <span className="product-image-queue__broken-badge">
              <i className="ri-error-warning-line" />
              {isRussian ? "Файл недоступен" : "Image missing"}
            </span>
            <span className="product-image-queue__broken-hint">
              {isRussian
                ? "Файл не опубликован или удалён"
                : "Not published or missing"}
            </span>
            <button
              type="button"
              className="product-image-queue__retry-btn"
              onClick={handleManualRetry}
              title={isRussian ? "Повторить проверку файла" : "Retry checking image"}
            >
              <i className="ri-refresh-line" />
              {isRussian ? "Повторить загрузку" : "Retry"}
            </button>
          </div>
        ) : (
          <Link
            to={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={
              isRussian
                ? "Открыть страницу товара"
                : "Open product page"
            }
          >
            <img
              src={currentSrc}
              alt={
                image.name ||
                (isRussian ? "Изображение товара" : "Product image")
              }
              loading="lazy"
              onError={handleImageError}
              onLoad={() => {
                if (imgStatus !== "initial") setImgStatus("initial");
              }}
            />
          </Link>
        )}
      </div>

      <strong>
        <Link
          to={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="product-image-queue__product-link"
          title={
            isRussian
              ? "Открыть страницу товара"
              : "Open product page"
          }
        >
          {image.name ||
            (isRussian ? `Товар ${image.id}` : `Product ${image.id}`)}
        </Link>
      </strong>
      {image.brand && <span>{image.brand}</span>}
      {(() => {
        const timestamp =
          image.completedAt ||
          image.info?.imageGeneration?.completedAt ||
          image.info?.imageGeneration?.startedAt ||
          image.info?.descriptionGeneratedAt ||
          image.info?.imageGeneration?.updatedAt ||
          image.created_at;
        return timestamp && Number.isFinite(Date.parse(timestamp)) ? (
          <time dateTime={timestamp}>
            {new Date(timestamp).toLocaleString(
              isRussian ? "ru-RU" : "en-US",
              {
                dateStyle: "medium",
                timeStyle: "medium",
              },
            )}
          </time>
        ) : (
          <span>{isRussian ? "Время неизвестно" : "Time unavailable"}</span>
        );
      })()}

      {imgStatus === "failed" ? (
        <div className="product-image-queue__gallery-item-actions">
          <button
            type="button"
            className="product-image-queue__gallery-btn"
            onClick={() => onRequeue(image.id)}
            title={
              isRussian
                ? "Вернуть в очередь для повторной генерации"
                : "Return to queue for regeneration"
            }
          >
            <i className="ri-refresh-line" />
            {isRussian ? "В ожидание" : "To pending"}
          </button>
          <button
            type="button"
            className="product-image-queue__gallery-btn"
            onClick={() => onManualConfig(image)}
            title={
              isRussian
                ? "Настроить вручную и загрузить фото"
                : "Manual setup and photo upload"
            }
          >
            <i className="ri-settings-3-line" />
            {isRussian ? "Настроить" : "Manual setup"}
          </button>
        </div>
      ) : (
        <div className="product-image-queue__gallery-item-actions">
          <button
            type="button"
            className="product-image-queue__gallery-btn product-image-queue__gallery-btn--compare"
            onClick={() => onCompare?.(image)}
            title={
              isRussian
                ? "Сравнить с оригинальным фото Qogita"
                : "Compare with original Qogita photo"
            }
          >
            <i className="ri-split-cells-horizontal" />
            {isRussian ? "Сравнить с оригиналом" : "Compare with original"}
          </button>
        </div>
      )}
    </article>
  );
}

export default function ProductImageQueue({
  language = "ru",
  onOpenQogita,
  active = true,
}) {
  const isRussian = language === "ru";
  const [status, setStatus] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [count, setCount] = useState(50);
  const [account, setAccount] = useState("local");
  const [regenerateCompleted, setRegenerateCompleted] = useState(false);
  const [compareItem, setCompareItem] = useState(null);
  const [runs, setRuns] = useState([]);
  const [globalHalted, setGlobalHalted] = useState(false);
  const [deletions, setDeletions] = useState([]);
  const deletionRequestedAt = useRef(null);
  const [deletionPending, setDeletionPending] = useState(false);
  const [deletionSubmitting, setDeletionSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [needsQogita, setNeedsQogita] = useState(false);
  const [visibleImages, setVisibleImages] = useState(24);
  const [selectedImages, setSelectedImages] = useState({});
  const [visibleFailed, setVisibleFailed] = useState(24);
  const [selectedFailed, setSelectedFailed] = useState({});
  const [deletingFailed, setDeletingFailed] = useState(false);
  const [manualConfigItem, setManualConfigItem] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showGpuAnalysisModal, setShowGpuAnalysisModal] = useState(false);
  const [gpuDeviceProfile, setGpuDeviceProfile] = useState(() =>
    getSavedDeviceProfile(),
  );
  const [gpuCountMode, setGpuCountMode] = useState("all");
  const [gpuCustomCount, setGpuCustomCount] = useState("50");
  const [gpuJobStatus, setGpuJobStatus] = useState(null);
  const [gpuBusy, setGpuBusy] = useState(false);
  const [gpuError, setGpuError] = useState("");
  const [showGpuLogs, setShowGpuLogs] = useState(false);
  const confirm = useConfirm();
  const alert = useAlert();

  const [activeBatch, setActiveBatch] = useState(() => {
    try {
      const saved = sessionStorage.getItem("alwarda_active_batch");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const updateActiveBatch = useCallback((batch) => {
    setActiveBatch(batch);
    try {
      if (batch) {
        sessionStorage.setItem("alwarda_active_batch", JSON.stringify(batch));
      } else {
        sessionStorage.removeItem("alwarda_active_batch");
      }
    } catch {}
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const actionErrorMessage = useCallback((payload, response) => {
    setNeedsQogita(false);
    return payload.error || `HTTP ${response.status}`;
  }, []);

  const loadRuns = useCallback(async (isManual = false) => {
    try {
      const response = await fetchActions();
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        if ([502, 503, 504].includes(response.status)) {
          if (!isManual) return; // Keep existing running state smoothly on background polls
          throw new Error(
            isRussian
              ? `Сервер временно недоступен или перезагружается (HTTP ${response.status}). Пожалуйста, подождите 10-20 секунд и обновите статус.`
              : `Server temporarily unavailable or restarting (HTTP ${response.status}). Please wait 10-20 seconds and refresh.`,
          );
        }
        if (!isManual) return;
        throw new Error(
          `GitHub Actions: HTTP ${response.status}, expected JSON`,
        );
      }
      const payload = await response.json();
      if (!response.ok) {
        if (!isManual) return;
        throw new Error(actionErrorMessage(payload, response));
      }
      setRuns(payload.runs);
      setDeletions(payload.deletions);
      if (typeof payload.globalHalted === "boolean") {
        setGlobalHalted(payload.globalHalted);
      }
      setActionError("");
      setNeedsQogita(false);
      setRunsLoaded(true);
      const requested =
        deletionRequestedAt.current &&
        payload.deletions.find(
          (run) =>
            Date.parse(run.createdAt) >= deletionRequestedAt.current - 5000,
        );
      if (requested?.status === "completed") {
        deletionRequestedAt.current = null;
        setDeletionPending(false);
        if (requested.conclusion !== "success") {
          setActionError(
            isRussian
              ? "Удаление завершилось с ошибкой. Откройте журнал GitHub Actions; часть изображений могла быть удалена."
              : "Deletion failed. Check the GitHub Actions log; some images may have been deleted.",
          );
        } else {
          setActionMessage(
            isRussian
              ? "Удаление изображений завершено."
              : "Image deletion completed.",
          );
        }
      }
    } catch (err) {
      if (isManual) {
        setActionError(err.message);
      }
    }
  }, [actionErrorMessage, isRussian]);

  const runAction = async (action) => {
    setBusy(true);
    setActionError("");
    setActionMessage("");
    try {
      const response = await fetchActions({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          count: Number(count),
          account,
          regenerateCompleted,
        }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        if ([502, 503, 504].includes(response.status)) {
          throw new Error(
            isRussian
              ? `Сервер временно недоступен или перезагружается (HTTP ${response.status}). Пожалуйста, подождите 10-20 секунд и обновите статус.`
              : `Server temporarily unavailable or restarting (HTTP ${response.status}). Please wait 10-20 seconds and refresh.`,
          );
        }
        throw new Error(
          `GitHub Actions: HTTP ${response.status}, expected JSON`,
        );
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(actionErrorMessage(payload, response));
      if (typeof payload.globalHalted === "boolean") {
        setGlobalHalted(payload.globalHalted);
      }
      if (action === "start") {
        setGlobalHalted(false);
        const batchInfo = {
          targetCount: Number(count),
          startCompleted: status?.completed || 0,
          startTime: Date.now(),
          account,
        };
        updateActiveBatch(batchInfo);
        setActionMessage(
          isRussian
            ? `Запуск генерации партии (${count} фото) отправлен в обработку.`
            : `Batch of ${count} photos dispatched.`,
        );
      } else if (action === "resume" || action === "resume-global") {
        setGlobalHalted(false);
        setActionMessage(
          isRussian
            ? "Глобальный процесс генерации возобновлен. Автоматические запуски по расписанию активны."
            : "Global generation resumed. Scheduled runs are active.",
        );
      } else {
        setGlobalHalted(true);
        updateActiveBatch(null);
        setActionMessage(
          isRussian
            ? "Глобальный процесс генерации остановлен. Все сгенерированные к этому моменту изображения сохраняются и добавляются на сайт."
            : "Global generation stopped. All images generated up to this moment will be saved and published to the website.",
        );
      }
      try {
        await loadRuns(false);
      } catch {}
    } catch (err) {
      setRunsLoaded(false);
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleStopGlobalGeneration = async () => {
    const isRunning = runs.length > 0;
    const approved = await confirm({
      title: isRussian
        ? "Остановить глобальный процесс генерации?"
        : "Stop global generation process?",
      message: isRussian
        ? isRunning
          ? "Остановить выполняющуюся генерацию? Текущая задача в GitHub Actions будет отменена, а автоматические запуски по расписанию приостановлены. Все сгенерированные к этому моменту изображения сохранятся."
          : "Приостановить глобальный процесс генерации? Автоматические запуски по расписанию (раз в 30 минут) выполняться не будут."
        : isRunning
          ? "Stop running generation? The active GitHub Actions job will be cancelled and scheduled runs will be paused. Images generated so far will be saved."
          : "Pause the global generation process? Automatic scheduled runs (every 30 minutes) will be paused.",
      confirmText: isRussian ? "Остановить" : "Stop",
      cancelText: isRussian ? "Отмена" : "Cancel",
      variant: "danger",
    });
    if (!approved) return;
    await runAction("stop");
  };

  const handleResumeGlobalGeneration = async () => {
    await runAction("resume");
  };

  const loadStatus = useCallback(
    async (options = {}) => {
      const force = Boolean(options?.force);
      const isManual = Boolean(options?.manual);
      try {
        const url = force
          ? "/api/admin/product-images/status?force=1"
          : "/api/admin/product-images/status";
        const response = await fetchWithRetry(url);
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          if ([502, 503, 504].includes(response.status)) {
            if (!isManual) return; // Keep existing status smoothly on background polls
            throw new Error(
              isRussian
                ? `Сервер временно недоступен или перезагружается (HTTP ${response.status}). Пожалуйста, подождите 10-20 секунд и обновите статус.`
                : `Server temporarily unavailable or restarting (HTTP ${response.status}). Please wait 10-20 seconds and refresh.`,
            );
          }
          if (!isManual) return;
          throw new Error(
            `HTTP ${response.status}: ${isRussian ? "сервер вернул не JSON" : "server returned a non-JSON response"}`,
          );
        }
        const payload = await response.json();
        if (!response.ok) {
          if (!isManual) return;
          if (payload.code === "SUPABASE_SERVICE_KEY_MISSING") {
            throw new Error(
              isRussian
                ? "На сервере не настроен секрет SUPABASE_SERVICE_ROLE_KEY. Добавьте его в настройки Cloudflare Worker; секреты GitHub Actions на сервер не передаются."
                : "SUPABASE_SERVICE_ROLE_KEY is not configured on the server. Add it to the Cloudflare Worker secrets; GitHub Actions secrets are not shared with the server.",
            );
          }
          throw new Error(payload.error || `HTTP ${response.status}`);
        }
        setStatus(payload);
        setNowMs(Date.now());
        if (typeof payload.globalHalted === "boolean") {
          setGlobalHalted(payload.globalHalted);
        }
        setSelectedImages((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([id, imageUrl]) =>
              payload.images.some(
                (image) =>
                  String(image.id) === id && image.imageUrl === imageUrl,
              ),
            ),
          ),
        );
        const validFailedIds = new Set(
          (payload.failedItems || []).map((item) => String(item.id)),
        );
        setSelectedFailed((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([id, checked]) => checked && validFailedIds.has(String(id)),
            ),
          ),
        );
        setError("");
      } catch (loadError) {
        if (isManual) {
          setStatus((current) => current);
          setError(
            loadError.message ||
              (isRussian
                ? "Не удалось загрузить очередь"
                : "Could not load queue"),
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [isRussian],
  );

  const handleManualRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setActionError("");
    setError("");
    try {
      await Promise.allSettled([loadRuns(true), loadStatus({ force: true, manual: true })]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, loadRuns, loadStatus]);

  const handleGpuButtonClick = () => {
    setGpuError("");
    const profile = getSavedDeviceProfile();
    if (!profile) {
      setShowGpuAnalysisModal(true);
    } else {
      executeGpuGeneration();
    }
  };

  const executeGpuGeneration = async () => {
    setGpuBusy(true);
    setGpuError("");
    try {
      const countVal =
        gpuCountMode === "all"
          ? "all"
          : Math.max(1, parseInt(gpuCustomCount, 10) || 50);
      const res = await callGpuApi("start", {
        method: "POST",
        body: JSON.stringify({ count: countVal, coolingDelay: 0.8 }),
      });
      if (res && res.ok) {
        setGpuJobStatus(res.job);
      } else {
        const msg =
          res?.error ||
          res?.message ||
          (isRussian
            ? "Локальный сервис GPU не отвечает на порту 3001. Обновите страницу (F5) или перезапустите «Запустить_Генерацию_ИИ_GPU.bat»."
            : "Local GPU service is not responding on port 3001. Refresh the page (F5) or start 'Запустить_Генерацию_ИИ_GPU.bat'.");
        setGpuError(msg);
      }
    } catch (err) {
      setGpuError(err.message);
    } finally {
      setGpuBusy(false);
    }
  };

  const handleStopGpuGeneration = async () => {
    setGpuBusy(true);
    try {
      await callGpuApi("stop", { method: "POST" });
      const statusRes = await callGpuApi("status");
      if (statusRes) setGpuJobStatus(statusRes);
    } catch (err) {
      setGpuError(err.message);
    } finally {
      setGpuBusy(false);
    }
  };

  // Poll GPU generation status while active
  useEffect(() => {
    let timer = null;
    let cancelled = false;

    const checkStatus = async () => {
      try {
        const data = await callGpuApi("status");
        if (data && !cancelled) {
          setGpuJobStatus((prev) => {
            if (prev?.isRunning && !data.isRunning) {
              loadStatus();
              loadRuns(false);
            }
            return data;
          });
        }
      } catch {}
    };

    checkStatus();

    timer = setInterval(() => {
      checkStatus();
    }, 2000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [loadStatus, loadRuns]);

  const deleteFailedFromDb = async (explicitIds = null) => {
    let ids =
      explicitIds ||
      Object.keys(selectedFailed).filter((id) => selectedFailed[id]);
    if (!ids.length) {
      if (failedItems.length > 0) {
        ids = failedItems.map((item) => String(item.id));
      } else {
        return;
      }
    }
    const approved = await confirm({
      title: isRussian
        ? "Удалить товары с ошибками из БД"
        : "Delete failed items from DB",
      message: isRussian
        ? `Удалить ${ids.length} поз. из базы данных (таблица stocks)? Эти товары будут полностью удалены из базы и очереди генерации.`
        : `Delete ${ids.length} items from the database (stocks table)? These products will be permanently removed from the database and generation queue.`,
    });
    if (!approved) return;

    setDeletingFailed(true);
    setBusy(true);
    setActionError("");
    setActionMessage("");
    try {
      const response = await fetch("/api/admin/product-images/failed", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error(
          `HTTP ${response.status}: ${isRussian ? "сервер вернул не JSON" : "server returned a non-JSON response"}`,
        );
      }
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setSelectedFailed((current) => {
        const next = { ...current };
        for (const id of ids) {
          delete next[String(id)];
        }
        return next;
      });
      setActionMessage(
        isRussian
          ? `Удалено записей из базы данных: ${payload.deletedCount ?? ids.length}.`
          : `Deleted records from database: ${payload.deletedCount ?? ids.length}.`,
      );
      await loadStatus({ force: true });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeletingFailed(false);
      setBusy(false);
    }
  };

  const requeueFailed = async (explicitIds = null) => {
    let ids =
      explicitIds ||
      Object.keys(selectedFailed).filter((id) => selectedFailed[id]);
    if (!ids.length) {
      if (failedItems.length > 0) {
        ids = failedItems.map((item) => String(item.id));
      } else {
        return;
      }
    }
    setDeletingFailed(true);
    setBusy(true);
    setActionError("");
    setActionMessage("");
    try {
      const response = await fetch("/api/admin/product-images/requeue", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error(
          `HTTP ${response.status}: ${isRussian ? "сервер вернул не JSON" : "server returned a non-JSON response"}`,
        );
      }
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || `HTTP ${response.status}`);
      setSelectedFailed((current) => {
        const next = { ...current };
        for (const id of ids) delete next[String(id)];
        return next;
      });
      setActionMessage(
        isRussian
          ? `Возвращено в ожидание: ${payload.requeuedCount ?? ids.length}.`
          : `Returned to pending: ${payload.requeuedCount ?? ids.length}.`,
      );
      await loadStatus({ force: true });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeletingFailed(false);
      setBusy(false);
    }
  };

  const deleteImages = async () => {
    const images = Object.entries(selectedImages).map(([id, imageUrl]) => ({
      id,
      imageUrl,
    }));
    if (!images.length) return;
    const isAll = selectableImages.length > 0 && images.length >= selectableImages.length;
    const approved = await confirm({
      title: isRussian
        ? isAll
          ? "Удалить ВСЕ изображения"
          : "Удалить изображения"
        : isAll
          ? "Delete ALL images"
          : "Delete images",
      message: isRussian
        ? isAll
          ? `Удалить ВСЕ ${images.length} фото? Все товары вернутся в очередь генерации.`
          : `Удалить ${images.length} фото? Товары исчезнут из каталога и вернутся в очередь генерации.`
        : isAll
          ? `Delete ALL ${images.length} images? All products will return to the generation queue.`
          : `Delete ${images.length} images? The products will leave the catalog and return to the generation queue.`,
    });
    if (!approved) return;
    setBusy(true);
    setDeletionSubmitting(true);
    setActionError("");
    setActionMessage("");
    try {
      const response = await fetchActions({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isAll ? { action: "delete", all: true } : { action: "delete", images }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(actionErrorMessage(payload, response));
      deletionRequestedAt.current = Date.now();
      setDeletionPending(true);
      setSelectedImages({});
      setActionMessage(
        isRussian
          ? isAll
            ? `Удаление всех ${images.length} фото запущено в GitHub Actions. Список обновится после выполнения.`
            : "Удаление отправлено в GitHub Actions. Список обновится после выполнения."
          : isAll
            ? `Deletion of all ${images.length} images queued in GitHub Actions. The list will update after it runs.`
            : "Deletion queued in GitHub Actions. The list will update after it runs.",
      );
      await loadStatus({ force: true });
      await loadRuns();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeletionSubmitting(false);
      setBusy(false);
    }
  };

  const deleteAllImages = async () => {
    if (!selectableImages.length) return;
    const totalCount = selectableImages.length;
    const approved = await confirm({
      title: isRussian ? "Удалить ВСЕ изображения" : "Delete ALL images",
      message: isRussian
        ? `Вы действительно хотите удалить ВСЕ ${totalCount} фото товаров разом? Все товары исчезнут из каталога и вернутся в очередь генерации.`
        : `Are you sure you want to delete ALL ${totalCount} product images at once? All products will leave the catalog and return to the generation queue.`,
    });
    if (!approved) return;
    setBusy(true);
    setDeletionSubmitting(true);
    setActionError("");
    setActionMessage("");
    try {
      const response = await fetchActions({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", all: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(actionErrorMessage(payload, response));
      deletionRequestedAt.current = Date.now();
      setDeletionPending(true);
      setSelectedImages({});
      setActionMessage(
        isRussian
          ? `Удаление всех ${totalCount} фото запущено в GitHub Actions. Список обновится после выполнения.`
          : `Deletion of all ${totalCount} images queued in GitHub Actions. The list will update after it runs.`,
      );
      await loadStatus({ force: true });
      await loadRuns();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeletionSubmitting(false);
      setBusy(false);
    }
  };

  const deleting =
    deletionSubmitting ||
    deletionPending ||
    deletions.some((run) => run.status !== "completed");
  const hasActiveRuns = runs.some((run) => run.status !== "completed");
  const batchCompletedReal = activeBatch
    ? Math.max(0, (status?.completed || 0) - activeBatch.startCompleted)
    : 0;
  const batchTarget = activeBatch?.targetCount || Number(count) || 50;

  const isBatchRunning = Boolean(
    !globalHalted &&
      (hasActiveRuns ||
        busy ||
        (activeBatch && batchCompletedReal < batchTarget)),
  );
  const hasActiveTasks = hasActiveRuns || deleting || busy || isBatchRunning;

  useEffect(() => {
    if (!active) return undefined;

    const initialLoad = window.setTimeout(() => {
      loadStatus();
      loadRuns();
    }, 0);

    const intervalMs = hasActiveTasks ? 3000 : 30000;
    const timer = window.setInterval(() => {
      loadStatus({ force: hasActiveTasks });
      loadRuns();
    }, intervalMs);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadStatus, loadRuns, hasActiveTasks, active]);

  const batchStartedAt =
    activeBatch?.startTime || (hasActiveRuns ? nowMs - 15000 : null);
  const elapsedSec = batchStartedAt
    ? Math.max(0, Math.floor((nowMs - batchStartedAt) / 1000))
    : 0;

  const secPerItem = 12;
  const startupSec = 15;
  const elapsedAfterStartup = Math.max(0, elapsedSec - startupSec);
  const simulatedDone = Math.min(
    batchTarget - 0.05,
    elapsedSec < startupSec
      ? (elapsedSec / startupSec) * 0.4
      : 0.4 + elapsedAfterStartup / secPerItem,
  );

  const currentItemElapsed = Math.max(
    0,
    elapsedSec - batchCompletedReal * secPerItem,
  );
  const currentFraction = Math.min(
    0.95,
    1 - Math.exp(-currentItemElapsed / (secPerItem * 0.8)),
  );
  const virtualCompleted = Math.max(
    batchCompletedReal + currentFraction,
    simulatedDone,
  );

  const displayItemsCompleted = isBatchRunning
    ? Math.min(
        batchTarget,
        Math.max(batchCompletedReal, Math.floor(virtualCompleted)),
      )
    : activeBatch && batchCompletedReal >= batchTarget
      ? batchTarget
      : batchCompletedReal;

  const rawBatchPercent = isBatchRunning
    ? Math.min(
        99,
        Math.max(1, (virtualCompleted / Math.max(1, batchTarget)) * 100),
      )
    : activeBatch && batchCompletedReal >= batchTarget
      ? 100
      : Math.min(
          100,
          Math.round((batchCompletedReal / Math.max(1, batchTarget)) * 100),
        );

  const smoothBatchPercent = Math.round(rawBatchPercent);

  const displayOverallCompleted = Math.min(
    status?.total || 0,
    Math.max(
      status?.completed || 0,
      (activeBatch?.startCompleted || 0) + displayItemsCompleted,
    ),
  );
  const overallProgress = status?.total
    ? Math.min(
        100,
        Math.round((displayOverallCompleted / status.total) * 100),
      )
    : 0;

  const selectableImages = (status?.images || []).filter(
    (image) =>
      /^\d{1,20}$/.test(String(image.id)) &&
      /^\/assets\/img\/generated-products\/[a-f0-9]{64}\.png$/.test(
        image.imageUrl,
      ),
  );
  const allSelected =
    selectableImages.length > 0 &&
    selectableImages.every(
      (image) => selectedImages[image.id] === image.imageUrl,
    );

  const failedItems = status?.failedItems || [];
  const selectedFailedIds = Object.keys(selectedFailed).filter(
    (id) => selectedFailed[id],
  );
  const allFailedSelected =
    failedItems.length > 0 &&
    failedItems.every((item) => Boolean(selectedFailed[String(item.id)]));

  const progress = overallProgress;

  const liveAccounts = (status?.accounts || []).map((item) => {
    const availableAtMs = item.availableAt ? Date.parse(item.availableAt) : 0;
    const partialAtMs = item.partialAvailableAt
      ? Date.parse(item.partialAvailableAt)
      : 0;
    const isAvailable = !availableAtMs || nowMs >= availableAtMs;
    const remainingMs = isAvailable ? 0 : Math.max(0, availableAtMs - nowMs);
    const partialRemainingMs =
      partialAtMs && nowMs < partialAtMs ? Math.max(0, partialAtMs - nowMs) : 0;
    const partialReady = Boolean(
      partialAtMs && !isAvailable && nowMs >= partialAtMs,
    );
    return {
      ...item,
      isAvailable,
      remainingMs,
      partialRemainingMs,
      partialReady,
    };
  });

  const unavailableAccounts = liveAccounts.filter((item) => !item.isAvailable);
  const availableAccountsCount =
    liveAccounts.length - unavailableAccounts.length;
  const allAccountsAvailable =
    liveAccounts.length > 0 && unavailableAccounts.length === 0;
  const nextAvailableAccount =
    [...unavailableAccounts].sort(
      (a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt),
    )[0] || null;
  const lastAvailableAccount =
    [...unavailableAccounts]
      .sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt))
      .at(-1) || null;
  const waitingImagesCount = (status?.pending || 0) + (status?.failed || 0);
  const hasWaitingImages = waitingImagesCount > 0;

  const accountOptionSuffix = (id) => {
    const found = liveAccounts.find((item) => item.id === id);
    if (!found) return "";
    if (found.isAvailable) {
      return isRussian ? " — доступен" : " — available";
    }
    return isRussian
      ? ` — будет доступно через ${formatDuration(found.remainingMs, true, false)}`
      : ` — available in ${formatDuration(found.remainingMs, false, false)}`;
  };

  return (
    <section className="product-image-queue">
      <header className="product-image-queue__header">
        <div>
          <div className="product-image-queue__header-title-row">
            <h2>
              {isRussian
                ? "Генерация изображений товаров"
                : "Product image generation"}
            </h2>
            {gpuJobStatus?.isRunning ? (
              <span className="product-image-queue__status-badge product-image-queue__status-badge--running">
                <span className="product-image-queue__pulse-dot" />
                {isRussian ? "Генерация на видеокарте" : "GPU Generation Running"}
              </span>
            ) : (
              <span className="product-image-queue__status-badge product-image-queue__status-badge--active">
                <i className="ri-cpu-line" />
                {isRussian ? "Локальный GPU активен" : "Local GPU Ready"}
              </span>
            )}
          </div>
          <p>
            {isRussian
              ? "Генерация изображений флаконов выполняется прямиком на компьютере (локальная видеокарта GPU с аппаратным ускорением Vulkan и RMBG-1.4). Без облачных процессов и без автоматических запусков."
              : "Product images are generated directly on your computer's GPU with Vulkan hardware acceleration and RMBG-1.4. No cloud processes and no automated background jobs."}
          </p>
        </div>
        <div className="product-image-queue__header-actions">
          <button
            type="button"
            className="product-image-queue__start"
            disabled={refreshing}
            onClick={handleManualRefresh}
            title={isRussian ? "Обновить данные очереди" : "Refresh queue"}
          >
            <i className={`ri-refresh-line ${refreshing ? "ri-spin" : ""}`} />
            {isRussian ? "Обновить статус" : "Refresh"}
          </button>
        </div>
      </header>

      {/* GPU Hardware Generation Hub (Local Intel Iris Xe / Vulkan) */}
      <section className="product-image-queue__gpu-hub">
        <div className="product-image-queue__gpu-header">
          <div className="product-image-queue__gpu-title-group">
            <div className="product-image-queue__gpu-icon">
              <i className="ri-cpu-line" />
            </div>
            <div>
              <h3>
                {isRussian
                  ? "Генерация на видеокарте устройства (GPU)"
                  : "Device GPU Hardware Generation"}
              </h3>
              <p>
                {isRussian
                  ? "Прямое аппаратное супер-разрешение Upscayl Vulkan: неограниченное количество фото, 100% четкость и защита устройства от перегрузки."
                  : "Direct Upscayl Vulkan hardware super-resolution: unlimited photos, true clarity, and thermal overload protection."}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {gpuDeviceProfile ? (
              <span className="product-image-queue__gpu-badge">
                <i className="ri-checkbox-circle-fill" />
                {gpuDeviceProfile.gpuName || "GPU проверен"}
                <button
                  type="button"
                  className="product-image-queue__gpu-retest-btn"
                  onClick={() => setShowGpuAnalysisModal(true)}
                  title={isRussian ? "Запустить повторный тест устройства" : "Retest hardware"}
                >
                  {isRussian ? "Перепроверить" : "Retest"}
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="product-image-queue__gpu-badge product-image-queue__gpu-badge--untested"
                onClick={() => setShowGpuAnalysisModal(true)}
                style={{ cursor: "pointer" }}
              >
                <i className="ri-radar-line" />
                {isRussian ? "Выполнить анализ устройства" : "Analyze Device"}
              </button>
            )}
          </div>
        </div>

        <div className="product-image-queue__gpu-body">
          <div className="product-image-queue__gpu-options">
            <label className="product-image-queue__gpu-radio-label">
              <input
                type="radio"
                name="gpuCountMode"
                value="all"
                checked={gpuCountMode === "all"}
                onChange={() => setGpuCountMode("all")}
              />
              <span>
                <strong>{isRussian ? "Вся очередь товаров" : "All queue products"}</strong>{" "}
                ({isRussian ? "неограниченное количество фото" : "unlimited photos"})
              </span>
            </label>

            <label className="product-image-queue__gpu-radio-label">
              <input
                type="radio"
                name="gpuCountMode"
                value="custom"
                checked={gpuCountMode === "custom"}
                onChange={() => setGpuCountMode("custom")}
              />
              <span>
                {isRussian ? "Выбранное количество фото:" : "Custom photo count:"}
                <input
                  type="number"
                  min="1"
                  max="10000"
                  className="product-image-queue__gpu-custom-input"
                  value={gpuCustomCount}
                  disabled={gpuCountMode !== "custom"}
                  onChange={(e) => setGpuCustomCount(e.target.value)}
                  onClick={() => setGpuCountMode("custom")}
                />
              </span>
            </label>

            <div className="product-image-queue__gpu-safeguard">
              <i className="ri-shield-check-line" />
              <span>
                {isRussian
                  ? "Защита от перегрузки включена: пауза 0.8с между товарами, фоновый приоритет Windows (BELOW_NORMAL), защита от нагрева."
                  : "Overload protection active: 0.8s cooling pause, Windows below-normal priority, anti-freeze guard."}
              </span>
            </div>
          </div>

          <div className="product-image-queue__gpu-actions">
            {gpuJobStatus?.isRunning ? (
              <button
                type="button"
                className="product-image-queue__gpu-btn-stop"
                disabled={gpuBusy}
                onClick={handleStopGpuGeneration}
              >
                <i className="ri-stop-circle-line" />
                {isRussian ? "Остановить генерацию на GPU" : "Stop GPU Generation"}
              </button>
            ) : (
              <button
                type="button"
                className="product-image-queue__gpu-btn-launch"
                disabled={gpuBusy}
                onClick={handleGpuButtonClick}
              >
                <i className="ri-flashlight-fill" />
                {isRussian ? "Запустить генерацию на видеокарте" : "Launch GPU Generation"}
              </button>
            )}
          </div>
        </div>

        {gpuError && (
          <div
            className="product-image-queue__message product-image-queue__message--error"
            style={{ marginTop: "1rem" }}
          >
            <span>{gpuError}</span>
            <button
              type="button"
              className="product-image-queue__retry-btn"
              onClick={() => setGpuError("")}
            >
              ×
            </button>
          </div>
        )}

        {gpuJobStatus && (gpuJobStatus.isRunning || gpuJobStatus.completedCount > 0) && (
          <div className="product-image-queue__gpu-monitor">
            <div className="product-image-queue__gpu-monitor-header">
              <div className="product-image-queue__gpu-monitor-title">
                {gpuJobStatus.isRunning ? (
                  <>
                    <span className="product-image-queue__pulse-dot" />
                    <span>
                      {isRussian
                        ? "Выполняется генерация на видеокарте..."
                        : "Generating on device GPU..."}
                    </span>
                  </>
                ) : (
                  <>
                    <i className="ri-check-double-line" style={{ color: "#4ade80" }} />
                    <span style={{ color: "#4ade80" }}>
                      {isRussian
                        ? "Генерация на видеокарте завершена"
                        : "GPU generation finished"}
                    </span>
                  </>
                )}
              </div>
              <span style={{ fontSize: "0.85rem", color: "#e5d8b8" }}>
                {isRussian ? "Готово:" : "Completed:"}{" "}
                <strong>{gpuJobStatus.completedCount}</strong>
                {gpuJobStatus.totalCandidates > 0
                  ? ` / ${gpuJobStatus.totalCandidates}`
                  : gpuJobStatus.targetCount !== "unlimited"
                  ? ` / ${gpuJobStatus.targetCount}`
                  : " фото"}
              </span>
            </div>

            <div className="product-image-queue__gpu-progress-bar">
              <div
                className="product-image-queue__gpu-progress-fill"
                style={{
                  width: `${
                    gpuJobStatus.totalCandidates > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (gpuJobStatus.completedCount / gpuJobStatus.totalCandidates) * 100
                          )
                        )
                      : gpuJobStatus.isRunning
                      ? 50
                      : 100
                  }%`,
                }}
              />
            </div>

            <div className="product-image-queue__gpu-monitor-status">
              <div>
                {gpuJobStatus.currentProduct ? (
                  <span>
                    <i className="ri-loader-4-line ri-spin" /> {gpuJobStatus.currentProduct}
                  </span>
                ) : (
                  <span>{gpuJobStatus.lastLogLine || "Ожидание следующего товара..."}</span>
                )}
              </div>
              <button
                type="button"
                className="product-image-queue__gpu-retest-btn"
                onClick={() => setShowGpuLogs((v) => !v)}
              >
                {showGpuLogs
                  ? isRussian ? "Скрыть журнал" : "Hide log"
                  : isRussian ? "Показать журнал" : "Show log"}
              </button>
            </div>

            {showGpuLogs && gpuJobStatus.logs && (
              <div
                style={{
                  marginTop: "0.75rem",
                  background: "#0a0806",
                  padding: "0.75rem",
                  borderRadius: "6px",
                  maxHeight: "160px",
                  overflowY: "auto",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  color: "#d4af37",
                }}
              >
                {gpuJobStatus.logs.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {actionError && (
        <div
          className="product-image-queue__message product-image-queue__message--error"
          role="alert"
        >
          <span>{actionError}</span>
          <button
            type="button"
            className="product-image-queue__retry-btn"
            disabled={refreshing}
            onClick={handleManualRefresh}
            title={
              isRussian
                ? "Обновить статус очереди и задачи"
                : "Refresh queue and task status"
            }
          >
            {refreshing ? (
              <>
                <span
                  className="product-image-queue__btn-spinner"
                  aria-hidden="true"
                />
                <span>{isRussian ? "Обновление..." : "Refreshing..."}</span>
              </>
            ) : (
              <>
                <i className="ri-refresh-line" />
                <span>{isRussian ? "Обновить статус" : "Retry"}</span>
              </>
            )}
          </button>
          {needsQogita && onOpenQogita && (
            <button type="button" onClick={onOpenQogita}>
              {isRussian ? "Открыть Qogita B2B" : "Open Qogita B2B"}
            </button>
          )}
        </div>
      )}
      {actionMessage && (
        <div className="product-image-queue__message" role="status">
          {actionMessage}
        </div>
      )}
      {deleting && (
        <div
          className="product-image-queue__deleting"
          role="status"
          aria-live="polite"
        >
          <span className="product-image-queue__spinner" aria-hidden="true" />
          <span>
            <strong>
              {isRussian
                ? "Удаление фотографий запущено"
                : "Image deletion in progress"}
            </strong>
            <span>
              {isRussian
                ? "Задача выполняется в GitHub Actions. Дождитесь завершения."
                : "The GitHub Actions job is running or queued. Please wait for it to finish."}
            </span>
          </span>
        </div>
      )}
      {deletions.slice(0, 1).map((run) => (
        <a
          key={run.id}
          href={run.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {isRussian ? "Удаление фото" : "Image deletion"}:{" "}
          {run.status === "completed" ? run.conclusion : run.status}
          {run.status === "completed" && run.conclusion !== "success"
            ? isRussian
              ? " — возможен частичный результат, проверьте журнал"
              : " — partial results possible, check the log"
            : ""}
        </a>
      ))}
      {error && (
        <div
          className="product-image-queue__message product-image-queue__message--error"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            className="product-image-queue__retry-btn"
            disabled={refreshing}
            onClick={handleManualRefresh}
            title={
              isRussian
                ? "Обновить статус очереди и задачи"
                : "Refresh queue and task status"
            }
          >
            {refreshing ? (
              <>
                <span
                  className="product-image-queue__btn-spinner"
                  aria-hidden="true"
                />
                <span>{isRussian ? "Обновление..." : "Refreshing..."}</span>
              </>
            ) : (
              <>
                <i className="ri-refresh-line" />
                <span>{isRussian ? "Обновить статус" : "Retry"}</span>
              </>
            )}
          </button>
        </div>
      )}
      {loading && !status && (
        <div className="product-image-queue__loading-state" role="status">
          <span
            className="product-image-queue__btn-spinner"
            aria-hidden="true"
          />
          <span>{isRussian ? "Загрузка очереди..." : "Loading queue..."}</span>
        </div>
      )}

      {status && (
        <>
          {Boolean(
            (hasActiveRuns || busy || (activeBatch && !globalHalted)) && status,
          ) && (
            <div className="product-image-queue__batch-card">
              <div className="product-image-queue__batch-header">
                <div className="product-image-queue__batch-title-group">
                  <span
                    className={`product-image-queue__pulsing-dot ${
                      isBatchRunning
                        ? "product-image-queue__pulsing-dot--active"
                        : "product-image-queue__pulsing-dot--done"
                    }`}
                  />
                  <strong>
                    {isBatchRunning
                      ? isRussian
                        ? "Выполняется генерация партии"
                        : "Active batch generation in progress"
                      : isRussian
                        ? "Партия завершена"
                        : "Batch generation completed"}
                  </strong>
                </div>
                <div className="product-image-queue__batch-counts">
                  <span className="product-image-queue__batch-numbers">
                    {displayItemsCompleted} / {batchTarget}{" "}
                    {isRussian ? "фото" : "photos"} ({smoothBatchPercent}%)
                  </span>
                  {activeBatch && !isBatchRunning && (
                    <button
                      type="button"
                      className="product-image-queue__batch-dismiss-btn"
                      onClick={() => updateActiveBatch(null)}
                      title={
                        isRussian
                          ? "Закрыть карточку партии"
                          : "Dismiss batch card"
                      }
                    >
                      <i className="ri-close-line" />
                    </button>
                  )}
                </div>
              </div>

              <div className="product-image-queue__batch-progress-track">
                <div
                  className="product-image-queue__batch-progress-fill"
                  style={{
                    width: `${isBatchRunning ? rawBatchPercent.toFixed(1) : smoothBatchPercent}%`,
                  }}
                />
              </div>

              <div className="product-image-queue__batch-footer">
                <span className="product-image-queue__batch-stage">
                  <i className="ri-sparkling-fill" />{" "}
                  {isBatchRunning
                    ? isRussian
                      ? `Обработка фото ${Math.min(
                          batchTarget,
                          displayItemsCompleted + 1,
                        )} из ${batchTarget}: локальный ИИ, студийная резкость и защита этикеток...`
                      : `Processing photo ${Math.min(
                          batchTarget,
                          displayItemsCompleted + 1,
                        )} of ${batchTarget}: local AI studio sharpness & label protection...`
                    : isRussian
                      ? `Все ${batchTarget} фото успешно обработаны и опубликованы на сайте.`
                      : `All ${batchTarget} photos processed and published.`}
                </span>
                <span className="product-image-queue__batch-timer">
                  <i className="ri-time-line" />{" "}
                  {isRussian ? "Прошло: " : "Elapsed: "}
                  {String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:
                  {String(elapsedSec % 60).padStart(2, "0")}
                </span>
              </div>
            </div>
          )}

          <div className="product-image-queue__progress-heading">
            <strong>{isRussian ? "Общий прогресс" : "Overall progress"}</strong>
            <span>
              {displayOverallCompleted.toLocaleString()} /{" "}
              {status.total.toLocaleString()} ({overallProgress}%)
            </span>
          </div>
          <progress
            className="product-image-queue__progress"
            value={overallProgress}
            max="100"
          />

          <div className="product-image-queue__cards">
            {[
              ["pending", isRussian ? "Ожидают" : "Pending", "ri-time-line"],
              [
                "processing",
                isRussian ? "В обработке" : "Processing",
                "ri-loader-4-line",
              ],
              [
                "completed",
                isRussian ? "Готово" : "Completed",
                "ri-checkbox-circle-line",
              ],
              [
                "failed",
                isRussian ? "Ошибки" : "Failed",
                "ri-error-warning-line",
              ],
            ].map(([key, label, icon]) => (
              <div
                className={`product-image-queue__card product-image-queue__card--${key}`}
                key={key}
              >
                <i className={icon} />
                <span>{label}</span>
                <strong>{status[key].toLocaleString()}</strong>
              </div>
            ))}
          </div>

          <section
            className="product-image-queue__failed"
            aria-labelledby="failed-images-heading"
          >
            <div className="product-image-queue__failed-header">
              <div>
                <h3 id="failed-images-heading">
                  {isRussian
                    ? "Список ошибок генерации"
                    : "Failed generation items"}{" "}
                  ({failedItems.length})
                </h3>
                <p>
                  {isRussian
                    ? "Товары, при обработке которых возникла ошибка. Вы можете выбрать отдельные позиции или все сразу, вернуть их в ожидание или удалить из базы данных."
                    : "Products that failed during image generation. You can select individual items or all at once, return them to pending or delete them from the database."}
                </p>
              </div>
              {failedItems.length > 0 && (
                <div className="product-image-queue__gallery-actions">
                  <button
                    type="button"
                    className="product-image-queue__start"
                    disabled={busy || deletingFailed}
                    onClick={() => {
                      if (allFailedSelected) {
                        setSelectedFailed({});
                      } else {
                        setSelectedFailed(
                          Object.fromEntries(
                            failedItems.map((item) => [String(item.id), true]),
                          ),
                        );
                      }
                    }}
                  >
                    {allFailedSelected
                      ? isRussian
                        ? "Снять выделение"
                        : "Deselect all"
                      : isRussian
                        ? `Выбрать все (${failedItems.length})`
                        : `Select all (${failedItems.length})`}
                  </button>
                  <button
                    type="button"
                    className="product-image-queue__start"
                    disabled={busy || deletingFailed}
                    onClick={() => requeueFailed()}
                    title={
                      selectedFailedIds.length === 0
                        ? isRussian
                          ? `Вернуть ВСЕ ${failedItems.length} поз. с ошибками в ожидание`
                          : `Return ALL ${failedItems.length} failed items to pending`
                        : isRussian
                          ? `Вернуть ${selectedFailedIds.length} выбранных поз. в ожидание`
                          : `Return ${selectedFailedIds.length} selected items to pending`
                    }
                  >
                    <i className="ri-refresh-line" />
                    {selectedFailedIds.length > 0
                      ? isRussian
                        ? `Вернуть в ожидание (${selectedFailedIds.length})`
                        : `Return to pending (${selectedFailedIds.length})`
                      : isRussian
                        ? `Вернуть все в ожидание (${failedItems.length})`
                        : `Return all to pending (${failedItems.length})`}
                  </button>
                  {selectedFailedIds.length === 1 && (
                    <button
                      type="button"
                      className="product-image-queue__start product-image-queue__start--manual"
                      disabled={busy || deletingFailed}
                      onClick={() => {
                        const target = failedItems.find(
                          (i) => String(i.id) === selectedFailedIds[0],
                        );
                        if (target) setManualConfigItem(target);
                      }}
                      title={
                        isRussian
                          ? "Ручная настройка выбранного товара"
                          : "Manual setup for selected item"
                      }
                    >
                      <i className="ri-settings-3-line" />
                      {isRussian ? "Ручная настройка (1)" : "Manual setup (1)"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="product-image-queue__start product-image-queue__start--danger"
                    disabled={busy || deletingFailed}
                    onClick={() => deleteFailedFromDb()}
                    title={
                      selectedFailedIds.length === 0
                        ? isRussian
                          ? `Удалить ВСЕ ${failedItems.length} поз. с ошибками из БД (или выберите нужные галочками)`
                          : `Delete ALL ${failedItems.length} failed items from DB`
                        : isRussian
                          ? `Удалить ${selectedFailedIds.length} выбранных поз. из БД`
                          : `Delete ${selectedFailedIds.length} selected items from DB`
                    }
                  >
                    <i className="ri-delete-bin-line" />
                    {selectedFailedIds.length > 0
                      ? isRussian
                        ? `Удалить выбранные из БД (${selectedFailedIds.length})`
                        : `Delete selected from DB (${selectedFailedIds.length})`
                      : isRussian
                        ? `Удалить все ошибки из БД (${failedItems.length})`
                        : `Delete all failed from DB (${failedItems.length})`}
                  </button>
                </div>
              )}
            </div>

            {failedItems.length === 0 ? (
              <p className="product-image-queue__failed-empty">
                {isRussian
                  ? "Ошибок генерации сейчас нет."
                  : "No failed generation items right now."}
              </p>
            ) : (
              <>
                <div className="product-image-queue__failed-list">
                  {failedItems.slice(0, visibleFailed).map((item) => {
                    const itemId = String(item.id);
                    const checked = Boolean(selectedFailed[itemId]);
                    const summary = describeErrorSummary(item.error, isRussian);
                    return (
                      <article
                        key={itemId}
                        className={`product-image-queue__failed-item ${checked ? "product-image-queue__failed-item--selected" : ""}`}
                      >
                        <div className="product-image-queue__failed-top">
                          <label className="product-image-queue__failed-check">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={busy || deletingFailed}
                              onChange={(e) => {
                                const nextChecked = e.target.checked;
                                setSelectedFailed((current) => {
                                  const next = { ...current };
                                  if (nextChecked) next[itemId] = true;
                                  else delete next[itemId];
                                  return next;
                                });
                              }}
                            />
                            <span>ID #{itemId}</span>
                          </label>
                          <button
                            type="button"
                            className="product-image-queue__failed-delete-one product-image-queue__failed-requeue-one"
                            disabled={busy || deletingFailed}
                            onClick={() => requeueFailed([itemId])}
                          >
                            <i className="ri-refresh-line" />
                            {isRussian ? "В ожидание" : "To pending"}
                          </button>
                          <button
                            type="button"
                            className="product-image-queue__failed-manual-one"
                            disabled={busy || deletingFailed}
                            onClick={() => setManualConfigItem(item)}
                            title={
                              isRussian
                                ? "Ручная настройка и добавление фото"
                                : "Manual setup and photo upload"
                            }
                          >
                            <i className="ri-settings-3-line" />
                            {isRussian ? "Ручная настройка" : "Manual setup"}
                          </button>
                          <button
                            type="button"
                            className="product-image-queue__failed-delete-one"
                            disabled={busy || deletingFailed}
                            onClick={() => deleteFailedFromDb([itemId])}
                          >
                            <i className="ri-delete-bin-line" />
                            {isRussian ? "Удалить из БД" : "Delete from DB"}
                          </button>
                        </div>

                        <div className="product-image-queue__failed-body">
                          {item.rawImage && (
                            <Link
                              to={item.url || getPerfumeUrl(item)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="product-image-queue__failed-thumb"
                              title={
                                isRussian
                                  ? "Открыть страницу товара"
                                  : "Open product page"
                              }
                            >
                              <img
                                src={item.rawImage}
                                alt={item.name || `ID ${itemId}`}
                                loading="lazy"
                              />
                            </Link>
                          )}
                          <div className="product-image-queue__failed-info">
                            <strong>
                              <Link
                                to={item.url || getPerfumeUrl(item)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="product-image-queue__product-link"
                                title={
                                  isRussian
                                    ? "Открыть страницу товара"
                                    : "Open product page"
                                }
                              >
                                {item.name ||
                                  (isRussian
                                    ? `Товар #${itemId}`
                                    : `Product #${itemId}`)}
                              </Link>
                            </strong>
                            {item.brand && (
                              <span className="product-image-queue__failed-brand">
                                {item.brand}
                              </span>
                            )}
                            {summary && (
                              <span className="product-image-queue__failed-badge">
                                {summary}
                              </span>
                            )}
                            <code className="product-image-queue__failed-code">
                              {item.error}
                            </code>
                            {item.failedAt && (
                              <time dateTime={item.failedAt}>
                                {isRussian ? "Время ошибки: " : "Failed at: "}
                                {new Date(item.failedAt).toLocaleString(
                                  isRussian ? "ru-RU" : "en-US",
                                  {
                                    dateStyle: "medium",
                                    timeStyle: "medium",
                                  },
                                )}
                              </time>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {visibleFailed < failedItems.length && (
                  <button
                    type="button"
                    className="product-image-queue__start"
                    onClick={() => setVisibleFailed((current) => current + 24)}
                  >
                    {isRussian ? "Показать ещё ошибки" : "Show more errors"} (
                    {failedItems.length - visibleFailed})
                  </button>
                )}
              </>
            )}
          </section>

          <section
            className="product-image-queue__gallery"
            aria-labelledby="generated-images-heading"
          >
            <h3 id="generated-images-heading">
              {isRussian ? "Готовые изображения" : "Generated images"}
            </h3>
            <p>
              {isRussian
                ? "Сначала новые. Время завершения публикации указано в вашем часовом поясе."
                : "Newest first. Publication completion time is shown in your time zone."}
            </p>
            {status.images.length === 0 ? (
              <p>
                {isRussian
                  ? "Готовых изображений пока нет."
                  : "No completed images yet."}
              </p>
            ) : (
              <>
                <div className="product-image-queue__gallery-actions">
                  <button
                    type="button"
                    className="product-image-queue__start"
                    disabled={!selectableImages.length}
                    onClick={() => {
                      setSelectedImages(
                        allSelected
                          ? {}
                          : Object.fromEntries(
                              selectableImages.map((image) => [
                                image.id,
                                image.imageUrl,
                              ]),
                            ),
                      );
                    }}
                  >
                    {allSelected
                      ? isRussian
                        ? "Снять выделение"
                        : "Deselect all"
                      : isRussian
                        ? "Выбрать все фото"
                        : "Select all images"}
                  </button>
                  <button
                    type="button"
                    className="product-image-queue__start product-image-queue__start--danger"
                    disabled={busy || deleting}
                    onClick={() => {
                      if (Object.keys(selectedImages).length === 0) {
                        alert({
                          title: isRussian ? "Ничего не выбрано" : "No images selected",
                          message: isRussian
                            ? "Пожалуйста, выберите нужные фотографии галочками на карточках ниже или нажмите «Выбрать все фото»."
                            : "Please select images with checkboxes on the cards below or click 'Select all images'.",
                        });
                      } else {
                        deleteImages();
                      }
                    }}
                    title={
                      Object.keys(selectedImages).length === 0
                        ? isRussian
                          ? "Выберите фото галочками ниже, чтобы удалить их"
                          : "Select images below to delete them"
                        : isRussian
                          ? `Удалить ${Object.keys(selectedImages).length} выбранных фото`
                          : `Delete ${Object.keys(selectedImages).length} selected images`
                    }
                  >
                    <i className="ri-delete-bin-line" />
                    {isRussian ? "Удалить выбранные" : "Delete selected"} (
                    {Object.keys(selectedImages).length})
                  </button>
                  <button
                    type="button"
                    className="product-image-queue__start product-image-queue__start--danger"
                    disabled={
                      busy ||
                      deleting ||
                      !selectableImages.length
                    }
                    onClick={deleteAllImages}
                    title={
                      isRussian
                        ? `Удалить ВСЕ ${selectableImages.length} готовых фото и вернуть товары в очередь`
                        : `Delete ALL ${selectableImages.length} images`
                    }
                  >
                    <i className="ri-delete-bin-2-line" />
                    {isRussian ? "Удалить ВСЕ фото разом" : "Delete ALL images"} (
                    {selectableImages.length})
                  </button>
                  <a
                    href="https://github.com/egorgrebennykov-del/Al-Warda/actions/workflows/product-image-delete.yml"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {isRussian ? "Статус удаления" : "Deletion status"}
                  </a>
                </div>
                <p>
                  {isRussian
                    ? "Удаление фото из каталога и хранилища сайта. Выбранные товары вернутся в очередь генерации без ограничений по количеству."
                    : "Delete images from catalog and site repository. Selected products will return to the generation queue with no batch limits."}
                </p>
                <div className="product-image-queue__gallery-grid">
                  {status.images.slice(0, visibleImages).map((image) => (
                    <GalleryImageItem
                      key={image.id}
                      image={image}
                      isRussian={isRussian}
                      refreshKey={nowMs}
                      isSelected={selectedImages[image.id] === image.imageUrl}
                      isDisabled={
                        !/^\d{1,20}$/.test(String(image.id)) ||
                        !/^\/assets\/img\/generated-products\/[a-f0-9]{64}\.png$/.test(
                          image.imageUrl,
                        )
                      }
                      onToggleSelect={(e) => {
                        const checked = e.target.checked;
                        setSelectedImages((current) => {
                          const next = { ...current };
                          if (checked) next[image.id] = image.imageUrl;
                          else delete next[image.id];
                          return next;
                        });
                      }}
                      onRequeue={(id) => requeueFailed([id])}
                      onManualConfig={(item) => setManualConfigItem(item)}
                      onCompare={(item) => setCompareItem(item)}
                    />
                  ))}
                </div>
                {visibleImages < status.images.length && (
                  <button
                    type="button"
                    className="product-image-queue__start"
                    onClick={() => setVisibleImages((count) => count + 24)}
                  >
                    {isRussian ? "Показать ещё" : "Show more"} (
                    {status.images.length - visibleImages})
                  </button>
                )}
              </>
            )}
          </section>
        </>
      )}

      {manualConfigItem && (
        <ProductManualConfigModal
          item={manualConfigItem}
          language={language}
          onClose={() => setManualConfigItem(null)}
          onSaved={async (result) => {
            setManualConfigItem(null);
            setActionMessage(
              isRussian
                ? `Товар #${result.id} успешно настроен вручную, отправлен в базу данных и опубликован!`
                : `Product #${result.id} manually configured, saved to database, and published!`,
            );
            await loadStatus({ force: true });
          }}
        />
      )}

      {compareItem && (
        <ProductImageCompareModal
          item={compareItem}
          language={language}
          onClose={() => setCompareItem(null)}
        />
      )}

      <GpuDeviceAnalysisModal
        isOpen={showGpuAnalysisModal}
        language={language}
        onClose={() => {
          setShowGpuAnalysisModal(false);
          setGpuDeviceProfile(getSavedDeviceProfile());
        }}
        onConfirmStart={() => {
          setGpuDeviceProfile(getSavedDeviceProfile());
          executeGpuGeneration();
        }}
      />
    </section>
  );
}
