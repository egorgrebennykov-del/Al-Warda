import { useCallback, useEffect, useState } from "react";
import "./ProductImageQueue.css";

export default function ProductImageQueue({ language = "ru" }) {
  const isRussian = language === "ru";
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [workflow, setWorkflow] = useState(null);
  const [workflowError, setWorkflowError] = useState("");
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const requestWorkflow = useCallback(async (action, token) => {
    const response = await fetch("/api/admin/product-images/workflow", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, token }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  }, []);

  const refreshWorkflow = useCallback(async () => {
    if (!githubToken) return;
    try {
      setWorkflow(await requestWorkflow("status", githubToken));
      setWorkflowError("");
    } catch (err) {
      setWorkflow(null);
      setWorkflowError(err.message);
    }
  }, [githubToken, requestWorkflow]);

  useEffect(() => {
    if (!githubToken) return;
    const initial = window.setTimeout(refreshWorkflow, 0);
    const timer = window.setInterval(refreshWorkflow, 15000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [githubToken, refreshWorkflow]);

  async function connectGithub(event) {
    event.preventDefault();
    setBusy(true);
    setWorkflowError("");
    try {
      const token = tokenInput.trim();
      const current = await requestWorkflow("status", token);
      setGithubToken(token);
      setTokenInput("");
      setWorkflow(current);
      setWorkflowMessage("");
    } catch (err) {
      setGithubToken("");
      setWorkflow(null);
      setWorkflowError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function controlWorkflow(action) {
    setBusy(true);
    setWorkflowError("");
    setWorkflowMessage("");
    try {
      await requestWorkflow(action, githubToken);
      setWorkflow(null);
      setWorkflowMessage(action === "start"
        ? (isRussian ? "Запуск запрошен. GitHub может показать его с задержкой." : "Start requested. GitHub may take a moment to show the run.")
        : (isRussian ? "Остановка запрошена; выполнение может завершиться не сразу." : "Cancellation requested; the run may take a moment to stop."));
      window.setTimeout(refreshWorkflow, 5000);
    } catch (err) {
      await refreshWorkflow();
      setWorkflowError(err.message);
    } finally {
      setBusy(false);
    }
  }

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
      <form className="product-image-queue__controls" onSubmit={connectGithub}>
        <label htmlFor="image-github-token">{isRussian ? "GitHub-токен для управления" : "GitHub token for workflow control"}</label>
        <div className="product-image-queue__control-buttons">
          <input id="image-github-token" type="password" autoComplete="off" value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder={githubToken ? (isRussian ? "Токен подключён" : "Token connected") : "GitHub token"} />
          <button className="product-image-queue__start" type="submit" disabled={busy || !tokenInput.trim()}>
            {isRussian ? "Подключить" : "Connect"}
          </button>
          {githubToken && <button type="button" className="product-image-queue__start" onClick={() => {
            setGithubToken(""); setWorkflow(null); setWorkflowMessage(""); setWorkflowError("");
          }}>{isRussian ? "Отключить" : "Disconnect"}</button>}
        </div>
        <small>{isRussian
          ? "Токен хранится только до закрытия или обновления вкладки. Для запуска и остановки нужны права Actions: read and write."
          : "The token is kept only until this tab is closed or refreshed. Starting and stopping require Actions: read and write."}</small>
      </form>
      {workflowError && <div className="product-image-queue__message product-image-queue__message--error" role="alert">{workflowError}</div>}
      {workflowMessage && <div className="product-image-queue__message" role="status">{workflowMessage}</div>}
      {githubToken && <div className="product-image-queue__control-buttons">
        <span>{workflow ? (workflow.active ? (isRussian ? "Генерация запущена" : "Generation running") : (isRussian ? "Генерация остановлена" : "Generation stopped")) : (isRussian ? "Проверка состояния…" : "Checking status…")}</span>
        <button className="product-image-queue__start" type="button" disabled={busy || !workflow || workflow.active} onClick={() => controlWorkflow("start")}>
          {isRussian ? "Запустить" : "Start"}
        </button>
        <button className="product-image-queue__start" type="button" disabled={busy || !workflow || !workflow.active} onClick={() => controlWorkflow("stop")}>
          {isRussian ? "Остановить" : "Stop"}
        </button>
        <small>{isRussian ? "Остановка не отключает ежедневное расписание." : "Stopping does not disable the daily schedule."}</small>
      </div>}
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
