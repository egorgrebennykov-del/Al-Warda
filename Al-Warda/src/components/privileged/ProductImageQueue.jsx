import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "../../context/ConfirmContext";
import ProductManualConfigModal from "./ProductManualConfigModal";
import "./ProductImageQueue.css";

async function fetchActions(options = {}) {
  return fetch("/api/admin/product-images/actions", { credentials: "same-origin", ...options });
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
    parts.push(`${String(seconds).padStart(2, "0")} ${isRussian ? "сек" : "s"}`);
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
  if (/не парфюм|не содержит флакон|бижутер|браслет|украшен|non-perfume|jewelry|bracelet/i.test(text)) {
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

export default function ProductImageQueue({ language = "ru", onOpenQogita }) {
  const isRussian = language === "ru";
  const [status, setStatus] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [count, setCount] = useState(50);
  const [account, setAccount] = useState("auto");
  const [regenerateCompleted, setRegenerateCompleted] = useState(false);
  const [runs, setRuns] = useState([]);
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
  const confirm = useConfirm();

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const actionErrorMessage = useCallback((payload, response) => {
    setNeedsQogita(false);
    return payload.error || `HTTP ${response.status}`;
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const response = await fetchActions();
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        if ([502, 503, 504].includes(response.status)) {
          throw new Error(isRussian
            ? `Сервер временно недоступен или перезагружается (HTTP ${response.status}). Пожалуйста, подождите 10-20 секунд и обновите статус.`
            : `Server temporarily unavailable or restarting (HTTP ${response.status}). Please wait 10-20 seconds and refresh.`);
        }
        throw new Error(`GitHub Actions: HTTP ${response.status}, expected JSON`);
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(actionErrorMessage(payload, response));
      setRuns(payload.runs);
      setDeletions(payload.deletions);
      setActionError("");
      setNeedsQogita(false);
      setRunsLoaded(true);
      const requested = deletionRequestedAt.current && payload.deletions.find(
        (run) => Date.parse(run.createdAt) >= deletionRequestedAt.current - 5000,
      );
      if (requested?.status === "completed") {
        deletionRequestedAt.current = null;
        setDeletionPending(false);
        if (requested.conclusion !== "success") {
          setActionError(isRussian
            ? "Удаление завершилось с ошибкой. Откройте журнал GitHub Actions; часть изображений могла быть удалена."
            : "Deletion failed. Check the GitHub Actions log; some images may have been deleted.");
        } else {
          setActionMessage(isRussian ? "Удаление изображений завершено." : "Image deletion completed.");
        }
      }
    } catch (err) {
      setRuns([]);
      setRunsLoaded(false);
      setActionError(err.message);
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
        body: JSON.stringify({ action, count: Number(count), account, regenerateCompleted }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        if ([502, 503, 504].includes(response.status)) {
          throw new Error(isRussian
            ? `Сервер временно недоступен или перезагружается (HTTP ${response.status}). Пожалуйста, подождите 10-20 секунд и обновите статус.`
            : `Server temporarily unavailable or restarting (HTTP ${response.status}). Please wait 10-20 seconds and refresh.`);
        }
        throw new Error(`GitHub Actions: HTTP ${response.status}, expected JSON`);
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(actionErrorMessage(payload, response));
      setActionMessage(action === "start"
        ? (isRussian ? "Запуск отправлен в GitHub Actions." : "Workflow dispatch accepted.")
        : (isRussian ? "Запрошена остановка. Все сгенерированные к этому моменту изображения будут сохранены и добавлены на сайт." : "Stop requested. All images generated up to this moment will be saved and published to the website."));
      await loadRuns();
    } catch (err) {
      setRunsLoaded(false);
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/product-images/status", {
        credentials: "same-origin",
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        if ([502, 503, 504].includes(response.status)) {
          throw new Error(isRussian
            ? `Сервер временно недоступен или перезагружается (HTTP ${response.status}). Пожалуйста, подождите 10-20 секунд и обновите статус.`
            : `Server temporarily unavailable or restarting (HTTP ${response.status}). Please wait 10-20 seconds and refresh.`);
        }
        throw new Error(`HTTP ${response.status}: ${isRussian ? "сервер вернул не JSON" : "server returned a non-JSON response"}`);
      }
      const payload = await response.json();
      if (!response.ok) {
        if (payload.code === "SUPABASE_SERVICE_KEY_MISSING") {
          throw new Error(isRussian
            ? "На сервере не настроен секрет SUPABASE_SERVICE_ROLE_KEY. Добавьте его в настройки Cloudflare Worker; секреты GitHub Actions на сервер не передаются."
            : "SUPABASE_SERVICE_ROLE_KEY is not configured on the server. Add it to the Cloudflare Worker secrets; GitHub Actions secrets are not shared with the server.");
        }
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setStatus(payload);
      setNowMs(Date.now());
      setSelectedImages((current) => Object.fromEntries(
        Object.entries(current).filter(([id, imageUrl]) =>
          payload.images.some((image) => String(image.id) === id && image.imageUrl === imageUrl)),
      ));
      const validFailedIds = new Set((payload.failedItems || []).map((item) => String(item.id)));
      setSelectedFailed((current) => Object.fromEntries(
        Object.entries(current).filter(([id, checked]) => checked && validFailedIds.has(String(id))),
      ));
      setError("");
    } catch (loadError) {
      setStatus(null);
      setError(loadError.message || (isRussian ? "Не удалось загрузить очередь" : "Could not load queue"));
    } finally {
      setLoading(false);
    }
  }, [isRussian]);

  const deleteFailedFromDb = async (explicitIds = null) => {
    const ids = explicitIds || Object.keys(selectedFailed).filter((id) => selectedFailed[id]);
    if (!ids.length) return;
    const approved = await confirm({
      title: isRussian ? "Удалить товары с ошибками из БД" : "Delete failed items from DB",
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
        throw new Error(`HTTP ${response.status}: ${isRussian ? "сервер вернул не JSON" : "server returned a non-JSON response"}`);
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
      await loadStatus();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeletingFailed(false);
      setBusy(false);
    }
  };

  const requeueFailed = async (explicitIds = null) => {
    const ids = explicitIds || Object.keys(selectedFailed).filter((id) => selectedFailed[id]);
    if (!ids.length) return;
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
        throw new Error(`HTTP ${response.status}: ${isRussian ? "сервер вернул не JSON" : "server returned a non-JSON response"}`);
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
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
      await loadStatus();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeletingFailed(false);
      setBusy(false);
    }
  };

  const deleteImages = async () => {
    const images = Object.entries(selectedImages).map(([id, imageUrl]) => ({ id, imageUrl }));
    if (!images.length) return;
    if (images.length > 400) {
      setActionError(isRussian ? "За один раз можно удалить до 400 фото. Снимите часть отметок." : "You can delete up to 400 images at a time. Deselect some images.");
      return;
    }
    const approved = await confirm({
      title: isRussian ? "Удалить изображения" : "Delete images",
      message: isRussian
        ? `Удалить ${images.length} фото? Товары исчезнут из каталога и вернутся в очередь генерации.`
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
        body: JSON.stringify({ action: "delete", images }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(actionErrorMessage(payload, response));
      deletionRequestedAt.current = Date.now();
      setDeletionPending(true);
      setSelectedImages({});
      setActionMessage(isRussian
        ? "Удаление отправлено в GitHub Actions. Список обновится после выполнения."
        : "Deletion queued in GitHub Actions. The list will update after it runs.");
      await loadStatus();
      await loadRuns();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeletionSubmitting(false);
      setBusy(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(loadStatus, 0);
    const timer = window.setInterval(loadStatus, 15000);
    const actionsLoad = window.setTimeout(loadRuns, 0);
    const actionsTimer = window.setInterval(loadRuns, 15000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      window.clearTimeout(actionsLoad);
      window.clearInterval(actionsTimer);
    };
  }, [loadStatus, loadRuns]);

  const deleting = deletionSubmitting || deletionPending || deletions.some((run) => run.status !== "completed");
  const selectableImages = (status?.images || []).filter(
    (image) => /^\d{1,20}$/.test(String(image.id)) && /^\/assets\/img\/generated-products\/[a-f0-9]{64}\.png$/.test(image.imageUrl),
  );
  const allSelected = selectableImages.length > 0 &&
    selectableImages.every((image) => selectedImages[image.id] === image.imageUrl);

  const failedItems = status?.failedItems || [];
  const selectedFailedIds = Object.keys(selectedFailed).filter((id) => selectedFailed[id]);
  const allFailedSelected = failedItems.length > 0 &&
    failedItems.every((item) => Boolean(selectedFailed[String(item.id)]));

  const progress = status?.total
    ? Math.min(100, Math.round((status.completed / status.total) * 100))
    : 0;

  const liveAccounts = (status?.accounts || []).map((item) => {
    const availableAtMs = item.availableAt ? Date.parse(item.availableAt) : 0;
    const partialAtMs = item.partialAvailableAt ? Date.parse(item.partialAvailableAt) : 0;
    const isAvailable = !availableAtMs || nowMs >= availableAtMs;
    const remainingMs = isAvailable ? 0 : Math.max(0, availableAtMs - nowMs);
    const partialRemainingMs = partialAtMs && nowMs < partialAtMs ? Math.max(0, partialAtMs - nowMs) : 0;
    const partialReady = Boolean(partialAtMs && !isAvailable && nowMs >= partialAtMs);
    return {
      ...item,
      isAvailable,
      remainingMs,
      partialRemainingMs,
      partialReady,
    };
  });

  const unavailableAccounts = liveAccounts.filter((item) => !item.isAvailable);
  const availableAccountsCount = liveAccounts.length - unavailableAccounts.length;
  const allAccountsAvailable = liveAccounts.length > 0 && unavailableAccounts.length === 0;
  const nextAvailableAccount = [...unavailableAccounts].sort(
    (a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt),
  )[0] || null;
  const lastAvailableAccount = [...unavailableAccounts].sort(
    (a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt),
  ).at(-1) || null;
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
          <h2>{isRussian ? "Генерация изображений товаров" : "Product image generation"}</h2>
          <p>
            {isRussian
              ? "Flux создаёт студийное 3D-изображение по исходному фото, затем фон удаляется. Проверьте детали и края флакона."
              : "Flux creates a studio 3D image from the original photo, then the background is removed. Review the bottle details and edges."}
          </p>
        </div>
        <a
          className="product-image-queue__start"
          href="https://github.com/egorgrebennykov-del/Al-Warda/actions/workflows/product-image-generation.yml"
          target="_blank"
          rel="noopener noreferrer"
        >
          <i className="ri-external-link-line" />
          {isRussian ? "Открыть запуск в GitHub Actions" : "Open GitHub Actions"}
        </a>
      </header>

      <div className="product-image-queue__controls">
        <label>
          {isRussian ? "Количество фото" : "Number of photos"}
          <input type="number" min="1" max="100000" step="1" value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <label className="product-image-queue__regenerate">
          <input type="checkbox" checked={regenerateCompleted} onChange={(e) => setRegenerateCompleted(e.target.checked)} />
          {isRussian ? "Пересоздать готовые фото старой модели" : "Regenerate completed images from older models"}
        </label>
        <label>
          {isRussian ? "Аккаунт Cloudflare" : "Cloudflare account"}
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="auto">
              {isRussian ? "Автоматически (все пять)" : "Automatic (all five)"}
              {liveAccounts.length > 0
                ? (allAccountsAvailable
                  ? (isRussian ? " — все 5 доступны" : " — all 5 available")
                  : (isRussian
                    ? ` — все 5 через ${formatDuration(lastAvailableAccount?.remainingMs || 0, true, false)}`
                    : ` — all 5 in ${formatDuration(lastAvailableAccount?.remainingMs || 0, false, false)}`))
                : ""}
            </option>
            <option value="primary">{(isRussian ? "Основной" : "Primary") + accountOptionSuffix("primary")}</option>
            <option value="secondary">{(isRussian ? "Второй" : "Secondary") + accountOptionSuffix("secondary")}</option>
            <option value="third">{(isRussian ? "Третий" : "Third") + accountOptionSuffix("third")}</option>
            <option value="fourth">{(isRussian ? "Четвёртый" : "Fourth") + accountOptionSuffix("fourth")}</option>
            <option value="fifth">{(isRussian ? "Пятый" : "Fifth") + accountOptionSuffix("fifth")}</option>
          </select>
        </label>
        <button type="button" className="product-image-queue__start" disabled={busy || deleting || !runsLoaded || runs.length > 0 || !Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 100000} onClick={() => runAction("start")}>
          {isRussian ? "Запустить" : "Start"}
        </button>
        <button type="button" className="product-image-queue__start" disabled={busy || !runsLoaded || !runs.length} onClick={() => runAction("stop")}>
          {isRussian ? "Остановить" : "Stop"}
        </button>
      </div>
      {actionError && <div className="product-image-queue__message product-image-queue__message--error" role="alert">
        <span>{actionError}</span>
        <button type="button" style={{ marginLeft: "0.5rem", padding: "0.2rem 0.6rem", fontSize: "0.8rem", cursor: "pointer", borderRadius: "4px" }} onClick={() => { loadRuns(); loadStatus(); }}>{isRussian ? "Обновить статус" : "Retry"}</button>
        {needsQogita && onOpenQogita && <button type="button" onClick={onOpenQogita}>{isRussian ? "Открыть Qogita B2B" : "Open Qogita B2B"}</button>}
      </div>}
      {actionMessage && <div className="product-image-queue__message" role="status">{actionMessage}</div>}
      {deleting && <div className="product-image-queue__deleting" role="status" aria-live="polite">
        <span className="product-image-queue__spinner" aria-hidden="true" />
        <span>
          <strong>{isRussian ? "Удаление фотографий запущено" : "Image deletion in progress"}</strong>
          <span>{isRussian ? "Задача выполняется в GitHub Actions. Дождитесь завершения." : "The GitHub Actions job is running or queued. Please wait for it to finish."}</span>
        </span>
      </div>}
      {runs.map((run) => <a key={run.id} href={run.url} target="_blank" rel="noopener noreferrer">GitHub Actions: {run.status}</a>)}
      {deletions.slice(0, 1).map((run) => <a key={run.id} href={run.url} target="_blank" rel="noopener noreferrer">
        {isRussian ? "Удаление фото" : "Image deletion"}: {run.status === "completed" ? run.conclusion : run.status}
        {run.status === "completed" && run.conclusion !== "success"
          ? (isRussian ? " — возможен частичный результат, проверьте журнал" : " — partial results possible, check the log")
          : ""}
      </a>)}
      {error && <div className="product-image-queue__message product-image-queue__message--error" role="alert">
        <span>{error}</span>
        <button type="button" style={{ marginLeft: "0.5rem", padding: "0.2rem 0.6rem", fontSize: "0.8rem", cursor: "pointer", borderRadius: "4px" }} onClick={() => { loadRuns(); loadStatus(); }}>{isRussian ? "Обновить статус" : "Retry"}</button>
      </div>}
      {loading && !status && <div role="status">{isRussian ? "Загрузка очереди..." : "Loading queue..."}</div>}

      {status && <>
      <div className="product-image-queue__progress-heading">
        <strong>{isRussian ? "Общий прогресс" : "Overall progress"}</strong>
        <span>{status.completed.toLocaleString()} / {status.total.toLocaleString()} ({progress}%)</span>
      </div>
      <progress className="product-image-queue__progress" value={progress} max="100" />

      <div className="product-image-queue__cards">
        {[
          ["pending", isRussian ? "Ожидают" : "Pending", "ri-time-line"],
          ["processing", isRussian ? "В обработке" : "Processing", "ri-loader-4-line"],
          ["completed", isRussian ? "Готово" : "Completed", "ri-checkbox-circle-line"],
          ["failed", isRussian ? "Ошибки" : "Failed", "ri-error-warning-line"],
        ].map(([key, label, icon]) => (
          <div className={`product-image-queue__card product-image-queue__card--${key}`} key={key}>
            <i className={icon} />
            <span>{label}</span>
            <strong>{status[key].toLocaleString()}</strong>
          </div>
        ))}
      </div>

      {liveAccounts.length > 0 && (
        <section className="product-image-queue__accounts" aria-labelledby="cloudflare-accounts-heading">
          <div className="product-image-queue__accounts-header">
            <div>
              <h3 id="cloudflare-accounts-heading">
                {isRussian
                  ? "Лимиты аккаунтов Cloudflare Workers AI и автозапуск GitHub"
                  : "Cloudflare Workers AI Account Quotas & GitHub Auto-Schedule"}
              </h3>
              <p>
                {isRussian
                  ? "Бесплатный лимит (10 000 Neurons на аккаунт) в API Cloudflare обновляется по скользящему 24-часовому окну с момента исчерпания. GitHub Actions проверяет очередь каждые 30 минут и автоматически запускает генерацию только тогда, когда в ожидании есть изображения и все 5 аккаунтов доступны."
                  : "The free quota (10,000 Neurons per account) in Cloudflare Workers AI resets on a rolling 24-hour window after exhaustion. GitHub Actions checks every 30 minutes and automatically starts generation only when images are waiting and all 5 accounts are available."}
              </p>
            </div>
            <div className={`product-image-queue__schedule-badge ${allAccountsAvailable && hasWaitingImages ? "product-image-queue__schedule-badge--ready" : "product-image-queue__schedule-badge--waiting"}`}>
              <i className={allAccountsAvailable && hasWaitingImages ? "ri-play-circle-line" : "ri-timer-flash-line"} />
              <div>
                <strong>
                  {!hasWaitingImages
                    ? (isRussian ? "Автозапуск: нет ожидающих фото" : "Auto-run: no pending images")
                    : allAccountsAvailable
                      ? (isRussian ? "Все 5 аккаунтов доступны — автозапуск готов" : "All 5 accounts available — auto-run ready")
                      : (isRussian
                        ? `Все 5 аккаунтов будут доступны через ${formatDuration(lastAvailableAccount?.remainingMs || 0, true, true)}`
                        : `All 5 accounts available in ${formatDuration(lastAvailableAccount?.remainingMs || 0, false, true)}`)}
                </strong>
                <span>
                  {isRussian
                    ? `Доступно аккаунтов: ${availableAccountsCount} из ${liveAccounts.length} • В очереди на генерацию: ${waitingImagesCount.toLocaleString()}`
                    : `Available accounts: ${availableAccountsCount} of ${liveAccounts.length} • Waiting in queue: ${waitingImagesCount.toLocaleString()}`}
                  {!allAccountsAvailable && lastAvailableAccount?.availableAt && (
                    isRussian
                      ? ` • Полный старт: ${formatDateTime(lastAvailableAccount.availableAt, true)}`
                      : ` • Full start: ${formatDateTime(lastAvailableAccount.availableAt, false)}`
                  )}
                  {!allAccountsAvailable && nextAvailableAccount && nextAvailableAccount.id !== lastAvailableAccount?.id && (
                    isRussian
                      ? ` • Ближайший аккаунт через ${formatDuration(nextAvailableAccount.remainingMs, true, false)}`
                      : ` • Next account in ${formatDuration(nextAvailableAccount.remainingMs, false, false)}`
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="product-image-queue__accounts-grid">
            {liveAccounts.map((acc) => (
              <article
                key={acc.id}
                className={`product-image-queue__account-card ${acc.isAvailable ? "product-image-queue__account-card--available" : "product-image-queue__account-card--cooldown"}`}
              >
                <div className="product-image-queue__account-top">
                  <strong>{isRussian ? acc.labelRu : acc.labelEn}</strong>
                  <span className={`product-image-queue__account-pill ${acc.isAvailable ? "product-image-queue__account-pill--ok" : "product-image-queue__account-pill--wait"}`}>
                    {acc.isAvailable
                      ? (isRussian ? "Доступен" : "Available")
                      : (isRussian
                        ? `Будет доступно через ${formatDuration(acc.remainingMs, true, true)}`
                        : `Available in ${formatDuration(acc.remainingMs, false, true)}`)}
                  </span>
                </div>
                <div className="product-image-queue__account-meta">
                  {acc.availableAt && !acc.isAvailable && (
                    <div>
                      <span>{isRussian ? "Полное обновление:" : "Full reset:"}</span>{" "}
                      <strong>{formatDateTime(acc.availableAt, isRussian)}</strong>
                    </div>
                  )}
                  {acc.partialAvailableAt && !acc.isAvailable && (
                    <div className="product-image-queue__account-partial">
                      {acc.partialReady
                        ? (isRussian
                          ? `Частичная квота (~140 фото) уже доступна (с ${formatDateTime(acc.partialAvailableAt, true)})`
                          : `Partial quota (~140 photos) is already available (since ${formatDateTime(acc.partialAvailableAt, false)})`)
                        : (isRussian
                          ? `Частичная квота (~140 фото): будет доступно через ${formatDuration(acc.partialRemainingMs, true, false)} (${formatDateTime(acc.partialAvailableAt, true)})`
                          : `Partial quota (~140 photos): available in ${formatDuration(acc.partialRemainingMs, false, false)} (${formatDateTime(acc.partialAvailableAt, false)})`)}
                    </div>
                  )}
                  {acc.limitedAt && (
                    <div>
                      <span>
                        {acc.isAvailable
                          ? (isRussian ? "Предыдущий лимит:" : "Previous limit:")
                          : (isRussian ? "Лимит исчерпан:" : "Limit reached:")}
                      </span>{" "}
                      <time dateTime={acc.limitedAt}>
                        {formatDateTime(acc.limitedAt, isRussian)}
                        {acc.isAvailable && (isRussian ? " (восстановлен)" : " (restored)")}
                      </time>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="product-image-queue__quota">
        <span>
          {isRussian ? "Попытки сегодня (UTC)" : "Attempts today (UTC)"}:
          {" "}<strong>{status.attemptedToday}</strong>
        </span>
      </div>
      <p className="product-image-queue__footnote">
        {isRussian
          ? "В автоматическом режиме при лимите генератор переходит к следующему аккаунту; когда все пять достигнут лимита, задача остановится и запишет точное время восстановления (24 часа)."
          : "In automatic mode the generator switches accounts on a provider limit; when all five reach their limit, the batch stops and records the exact 24-hour recovery time."}
      </p>

      <section className="product-image-queue__failed" aria-labelledby="failed-images-heading">
        <div className="product-image-queue__failed-header">
          <div>
            <h3 id="failed-images-heading">
              {isRussian ? "Список ошибок генерации" : "Failed generation items"} ({failedItems.length})
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
                      Object.fromEntries(failedItems.map((item) => [String(item.id), true])),
                    );
                  }
                }}
              >
                {allFailedSelected
                  ? (isRussian ? "Снять выделение" : "Deselect all")
                  : (isRussian ? `Выбрать все (${failedItems.length})` : `Select all (${failedItems.length})`)}
              </button>
              <button
                type="button"
                className="product-image-queue__start"
                disabled={busy || deletingFailed || selectedFailedIds.length === 0}
                onClick={() => requeueFailed()}
              >
                <i className="ri-refresh-line" />
                {isRussian
                  ? `Вернуть в ожидание (${selectedFailedIds.length})`
                  : `Return to pending (${selectedFailedIds.length})`}
              </button>
              {selectedFailedIds.length === 1 && (
                <button
                  type="button"
                  className="product-image-queue__start product-image-queue__start--manual"
                  disabled={busy || deletingFailed}
                  onClick={() => {
                    const target = failedItems.find((i) => String(i.id) === selectedFailedIds[0]);
                    if (target) setManualConfigItem(target);
                  }}
                  title={isRussian ? "Ручная настройка выбранного товара" : "Manual setup for selected item"}
                >
                  <i className="ri-settings-3-line" />
                  {isRussian ? "Ручная настройка (1)" : "Manual setup (1)"}
                </button>
              )}
              <button
                type="button"
                className="product-image-queue__start product-image-queue__start--danger"
                disabled={busy || deletingFailed || selectedFailedIds.length === 0}
                onClick={() => deleteFailedFromDb()}
              >
                <i className="ri-delete-bin-line" />
                {isRussian
                  ? `Удалить выбранные из БД (${selectedFailedIds.length})`
                  : `Delete selected from DB (${selectedFailedIds.length})`}
              </button>
            </div>
          )}
        </div>

        {failedItems.length === 0 ? (
          <p className="product-image-queue__failed-empty">
            {isRussian ? "Ошибок генерации сейчас нет." : "No failed generation items right now."}
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
                        title={isRussian ? "Ручная настройка и добавление фото" : "Manual setup and photo upload"}
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
                        <a
                          href={item.rawImage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="product-image-queue__failed-thumb"
                          title={isRussian ? "Открыть исходное фото Qogita" : "Open original Qogita photo"}
                        >
                          <img src={item.rawImage} alt={item.name || `ID ${itemId}`} loading="lazy" />
                        </a>
                      )}
                      <div className="product-image-queue__failed-info">
                        <strong>{item.name || (isRussian ? `Товар #${itemId}` : `Product #${itemId}`)}</strong>
                        {item.brand && <span className="product-image-queue__failed-brand">{item.brand}</span>}
                        {summary && (
                          <span className="product-image-queue__failed-badge">{summary}</span>
                        )}
                        <code className="product-image-queue__failed-code">{item.error}</code>
                        {item.failedAt && (
                          <time dateTime={item.failedAt}>
                            {isRussian ? "Время ошибки: " : "Failed at: "}
                            {new Date(item.failedAt).toLocaleString(isRussian ? "ru-RU" : "en-US", {
                              dateStyle: "medium",
                              timeStyle: "medium",
                            })}
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
                {isRussian ? "Показать ещё ошибки" : "Show more errors"} ({failedItems.length - visibleFailed})
              </button>
            )}
          </>
        )}
      </section>

      <section className="product-image-queue__gallery" aria-labelledby="generated-images-heading">
        <h3 id="generated-images-heading">{isRussian ? "Готовые изображения" : "Generated images"}</h3>
        <p>{isRussian ? "Сначала новые. Время завершения публикации указано в вашем часовом поясе." : "Newest first. Publication completion time is shown in your time zone."}</p>
        {status.images.length === 0 ? <p>{isRussian ? "Готовых изображений пока нет." : "No completed images yet."}</p> : <>
          <div className="product-image-queue__gallery-actions">
            <button type="button" className="product-image-queue__start" disabled={!selectableImages.length} onClick={() => {
              setSelectedImages(allSelected ? {} : Object.fromEntries(selectableImages.map((image) => [image.id, image.imageUrl])));
            }}>
              {allSelected ? (isRussian ? "Снять выделение" : "Deselect all") : (isRussian ? "Выбрать все фото" : "Select all images")}
            </button>
            <button type="button" className="product-image-queue__start" disabled={busy || deleting || !runsLoaded || runs.length > 0 || Object.keys(selectedImages).length === 0} onClick={deleteImages}>
              {isRussian ? "Удалить выбранные" : "Delete selected"} ({Object.keys(selectedImages).length})
            </button>
            <a href="https://github.com/egorgrebennykov-del/Al-Warda/actions/workflows/product-image-delete.yml" target="_blank" rel="noopener noreferrer">
              {isRussian ? "Статус удаления" : "Deletion status"}
            </a>
          </div>
          <p>{isRussian ? "Можно удалить до 400 фото из хранилища сайта за один раз. Дождитесь окончания генерации или предыдущего удаления." : "Delete up to 400 site-hosted images at a time. Wait for generation or the previous deletion to finish."}</p>
          <div className="product-image-queue__gallery-grid">
            {status.images.slice(0, visibleImages).map((image) => (
              <article className="product-image-queue__gallery-item" key={image.id}>
                <label>
                  <input type="checkbox" checked={selectedImages[image.id] === image.imageUrl}
                    disabled={!/^\d{1,20}$/.test(String(image.id)) || !/^\/assets\/img\/generated-products\/[a-f0-9]{64}\.png$/.test(image.imageUrl)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelectedImages((current) => {
                        const next = { ...current };
                        if (checked) next[image.id] = image.imageUrl;
                        else delete next[image.id];
                        return next;
                      });
                    }} />
                  {isRussian ? "Выбрать" : "Select"}
                </label>
                <a href={image.imageUrl} target="_blank" rel="noopener noreferrer">
                  <img src={image.imageUrl} alt={image.name || (isRussian ? "Изображение товара" : "Product image")} loading="lazy" />
                </a>
                <strong>{image.name || (isRussian ? `Товар ${image.id}` : `Product ${image.id}`)}</strong>
                {image.brand && <span>{image.brand}</span>}
                {image.completedAt
                  ? <time dateTime={image.completedAt}>{new Date(image.completedAt).toLocaleString(isRussian ? "ru-RU" : "en-US", { dateStyle: "medium", timeStyle: "medium" })}</time>
                  : <span>{isRussian ? "Время неизвестно" : "Time unavailable"}</span>}
              </article>
            ))}
          </div>
          {visibleImages < status.images.length && <button type="button" className="product-image-queue__start" onClick={() => setVisibleImages((count) => count + 24)}>
            {isRussian ? "Показать ещё" : "Show more"} ({status.images.length - visibleImages})
          </button>}
        </>}
      </section>
      </>}

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
            await loadStatus();
          }}
        />
      )}
    </section>
  );
}
