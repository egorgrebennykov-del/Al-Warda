import { useCallback, useEffect, useState } from "react";
import "./ProductImageQueue.css";

export default function ProductImageQueue({ language = "ru", onOpenQogita }) {
  const isRussian = language === "ru";
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [count, setCount] = useState(50);
  const [account, setAccount] = useState("primary");
  const [regenerateCompleted, setRegenerateCompleted] = useState(false);
  const [runs, setRuns] = useState([]);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [needsQogita, setNeedsQogita] = useState(false);
  const [visibleImages, setVisibleImages] = useState(24);

  const actionErrorMessage = useCallback((payload, response) => {
    if (payload.code === "QOGITA_OWNER_SESSION_REQUIRED" ||
        payload.error === "Sign in to the configured Qogita owner account in connection settings") {
      setNeedsQogita(true);
      return isRussian
        ? "Сессия владельца Qogita недействительна или истекла. Войдите снова в настройках подключения."
        : "The Qogita owner session is invalid or expired. Sign in again in connection settings.";
    }
    setNeedsQogita(false);
    return payload.error || `HTTP ${response.status}`;
  }, [isRussian]);

  const loadRuns = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/product-images/actions", { credentials: "same-origin" });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error(`GitHub Actions: HTTP ${response.status}, expected JSON`);
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(actionErrorMessage(payload, response));
      setRuns(payload.runs);
      setActionError("");
      setNeedsQogita(false);
      setRunsLoaded(true);
    } catch (err) {
      setRuns([]);
      setRunsLoaded(false);
      setActionError(err.message);
    }
  }, [actionErrorMessage]);

  const runAction = async (action) => {
    setBusy(true);
    setActionError("");
    setActionMessage("");
    try {
      const response = await fetch("/api/admin/product-images/actions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, count: Number(count), account, regenerateCompleted }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error(`GitHub Actions: HTTP ${response.status}, expected JSON`);
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(actionErrorMessage(payload, response));
      setActionMessage(action === "start"
        ? (isRussian ? "Запуск отправлен в GitHub Actions." : "Workflow dispatch accepted.")
        : (isRussian ? "Запрошена остановка. Уже созданные, но не опубликованные файлы могут потребовать повторной обработки." : "Cancellation requested. Unpublished files may need to be regenerated."));
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
      if (!response.headers.get("content-type")?.includes("application/json")) {
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
      setError("");
    } catch (loadError) {
      setStatus(null);
      setError(loadError.message || (isRussian ? "Не удалось загрузить очередь" : "Could not load queue"));
    } finally {
      setLoading(false);
    }
  }, [isRussian]);

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

  const progress = status?.total
    ? Math.min(100, Math.round((status.completed / status.total) * 100))
    : 0;

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
            <option value="primary">{isRussian ? "Основной" : "Primary"}</option>
            <option value="secondary">{isRussian ? "Второй" : "Secondary"}</option>
          </select>
        </label>
        <button type="button" className="product-image-queue__start" disabled={busy || !runsLoaded || runs.length > 0 || !Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 100000} onClick={() => runAction("start")}>
          {isRussian ? "Запустить" : "Start"}
        </button>
        <button type="button" className="product-image-queue__start" disabled={busy || !runsLoaded || !runs.length} onClick={() => runAction("stop")}>
          {isRussian ? "Остановить" : "Stop"}
        </button>
      </div>
      {actionError && <div className="product-image-queue__message product-image-queue__message--error" role="alert">
        {actionError}
        {needsQogita && onOpenQogita && <button type="button" onClick={onOpenQogita}>{isRussian ? "Открыть Qogita B2B" : "Open Qogita B2B"}</button>}
      </div>}
      {actionMessage && <div className="product-image-queue__message" role="status">{actionMessage}</div>}
      {runs.map((run) => <a key={run.id} href={run.url} target="_blank" rel="noopener noreferrer">GitHub Actions: {run.status}</a>)}
      {error && <div className="product-image-queue__message product-image-queue__message--error" role="alert">{error}</div>}
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

      <div className="product-image-queue__quota">
        <span>
          {isRussian ? "Попытки сегодня (UTC)" : "Attempts today (UTC)"}:
          {" "}<strong>{status.attemptedToday}</strong>
        </span>
      </div>
      <p className="product-image-queue__footnote">
        {isRussian
          ? "Обработка остановится, если Cloudflare сообщит о превышении квоты или ограничении запросов. Аккаунт должен оставаться на Free."
          : "Processing stops when Cloudflare reports a quota or rate limit. Keep the account on the Free plan."}
      </p>
      <section className="product-image-queue__gallery" aria-labelledby="generated-images-heading">
        <h3 id="generated-images-heading">{isRussian ? "Готовые изображения" : "Generated images"}</h3>
        <p>{isRussian ? "Сначала новые. Время завершения публикации указано в вашем часовом поясе." : "Newest first. Publication completion time is shown in your time zone."}</p>
        {status.images.length === 0 ? <p>{isRussian ? "Готовых изображений пока нет." : "No completed images yet."}</p> : <>
          <div className="product-image-queue__gallery-grid">
            {status.images.slice(0, visibleImages).map((image) => (
              <article className="product-image-queue__gallery-item" key={image.id}>
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
    </section>
  );
}
