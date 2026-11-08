import { useCallback, useEffect, useState } from "react";
import "./ProductImageQueue.css";

export default function ProductImageQueue({ language = "ru" }) {
  const isRussian = language === "ru";
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/product-images/status", {
        credentials: "same-origin",
      });
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
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadStatus]);

  const processed = status ? status.completed + status.failed : 0;
  const progress = status?.total
    ? Math.min(100, Math.round((processed / status.total) * 100))
    : 0;
  const dailyLimitReached = status && status.attemptedToday >= status.dailyLimit;

  return (
    <section className="product-image-queue">
      <header className="product-image-queue__header">
        <div>
          <h2>{isRussian ? "Генерация изображений товаров" : "Product image generation"}</h2>
          <p>
            {isRussian
              ? "Flux создаёт только фон; исходный флакон компонуется программно."
              : "Flux generates the background only; the original bottle is composited programmatically."}
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

      {error && <div className="product-image-queue__message product-image-queue__message--error" role="alert">{error}</div>}
      {loading && !status && <div role="status">{isRussian ? "Загрузка очереди..." : "Loading queue..."}</div>}
      {dailyLimitReached && (
        <div className="product-image-queue__message">
          {isRussian
            ? "Дневной лимит достигнут. Очередь продолжится после сброса квоты в 00:00 UTC."
            : "Daily limit reached. The queue resumes after the quota resets at 00:00 UTC."}
        </div>
      )}

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
          {" "}<strong>{status.attemptedToday} / {status.dailyLimit}</strong>
        </span>
        <span>
          {isRussian ? "Оценка Neurons" : "Estimated Neurons"}:
          {" "}<strong>{status.estimatedNeuronsToday.toLocaleString()} / {status.neuronSafetyBudget.toLocaleString()}</strong>
        </span>
      </div>
      <p className="product-image-queue__footnote">
        {isRussian
          ? "Лимит приложения — 160 попыток в сутки и 9 000 расчётных Neurons. Платный тариф автоматически не подключается; для бюджета $0 аккаунт Cloudflare должен оставаться на Free."
          : "Application limit: 160 attempts per day and 9,000 estimated Neurons. No paid plan is enabled automatically; keep the Cloudflare account on Free for a $0 budget."}
      </p>
      </>}
    </section>
  );
}
