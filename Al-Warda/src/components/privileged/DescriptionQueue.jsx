import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "../../context/ConfirmContext";
import ProductManualConfigModal from "./ProductManualConfigModal";
import "./DescriptionQueue.css";

const STATUS_OPTIONS = ["all", "unchecked", "error", "not_found"];
const EMPTY_COUNTS = {
  total: 0,
  generated: 0,
  missing: 0,
  unchecked: 0,
  error: 0,
  notFound: 0,
  readyToGenerate: 0,
};

function formatDateTime(isoString, isRussian) {
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

function extractDescriptions(item) {
  const info = item && typeof item.info === "object" ? item.info : {};
  return {
    ru: item?.descriptionRu || info.descriptionRu || info.description || "",
    en: item?.descriptionEn || info.descriptionEn || "",
  };
}

async function readJson(response, isRussian = false) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    if ([502, 503, 504].includes(response.status)) {
      throw new Error(
        isRussian
          ? `Сервер временно недоступен или перезагружается (HTTP ${response.status}). Подождите 10–20 секунд и обновите список.`
          : `Server temporarily unavailable or restarting (HTTP ${response.status}). Please wait 10-20 seconds and refresh the list.`,
      );
    }
    throw new Error(
      `HTTP ${response.status}: ${response.statusText || "non-JSON response"}`,
    );
  }
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

export default function DescriptionQueue({ language = "ru" }) {
  const isRussian = language === "ru";
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyIds, setBusyIds] = useState({});
  const [selected, setSelected] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [manualConfigItem, setManualConfigItem] = useState(null);
  const [autoRun, setAutoRun] = useState(false);
  const [autoProgress, setAutoProgress] = useState({
    processed: 0,
    found: 0,
    errors: 0,
  });
  const [clearing, setClearing] = useState(false);
  const [viewingId, setViewingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  // The full catalog can be thousands of rows; rendering them all at once makes
  // the tab laggy and checkbox clicks feel unresponsive. Paginate instead.
  const [missingPage, setMissingPage] = useState(1);
  const [generatedPage, setGeneratedPage] = useState(1);
  const [showGeneratedDescriptions, setShowGeneratedDescriptions] =
    useState(false);
  // Top-level view switch: show only products WITHOUT a description, or only
  // those that already have one (with the full text visible).
  const [view, setView] = useState("missing");
  const autoRunRef = useRef(false);
  const confirm = useConfirm();

  const PAGE_SIZE = 100;

  const copyText = (id, text) => {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    } else {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {
        // ignore
      }
      document.body.removeChild(area);
    }
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1600);
  };

  const labels = useMemo(
    () => ({
      title: isRussian ? "Описание товаров" : "Product descriptions",
      subtitle: isRussian
        ? "Пайплайн: данные Qogita -> генерация фото -> палитра ароматов -> описание (Gemini). " +
          "Описание генерируется только для товаров с готовым фото и без реального описания."
        : "Pipeline: Qogita data -> photo generation -> aroma palette -> description (Gemini). " +
          "Descriptions are generated only for products with a completed photo and no real description yet.",
      refreshList: isRussian ? "Обновить список" : "Refresh list",
      generateSelected: isRussian
        ? "Сгенерировать выбранные"
        : "Generate selected",
      generateNext: isRussian
        ? "Сгенерировать следующие 10"
        : "Generate next 10",
      generateAll: isRussian ? "Сгенерировать все" : "Generate all",
      stopAll: isRussian ? "Остановить" : "Stop",
      batchProgress: (processed, remaining) =>
        isRussian
          ? `Массовая генерация: обработано ${processed}, осталось ~${remaining}`
          : `Batch generation: ${processed} processed, ~${remaining} left`,
      search: isRussian
        ? "Поиск по названию или бренду"
        : "Search by name or brand",
      selectAll: isRussian ? "Выбрать все" : "Select all",
      clearSelection: isRussian ? "Снять выбор" : "Clear selection",
      empty: isRussian
        ? "У всех товаров есть описание."
        : "Every product has a description.",
      emptyFiltered: isRussian
        ? "По этому фильтру ничего не найдено."
        : "Nothing matches this filter.",
      selectedCount: (count) =>
        isRussian ? `Выбрано: ${count}` : `Selected: ${count}`,
      generateOne: isRussian ? "Сгенерировать" : "Generate",
      manual: isRussian ? "Настроить вручную" : "Manual setup",
      checking: isRussian ? "Генерируем..." : "Generating...",
      noImage: isRussian ? "Нет фото" : "No image",
      photoPending: isRussian
        ? "Фото ещё не сгенерировано"
        : "Photo not generated yet",
      setExcluded: isRussian
        ? "Сет - генерация не применяется"
        : "Set - generation skipped",
      queryLabel: isRussian ? "Запрос" : "Query",
      generatedAt: isRussian ? "Сгенерировано" : "Generated",
      never: isRussian ? "Ещё не генерировались" : "Not generated yet",
      groupEmpty: isRussian ? "Пусто" : "Empty",
      missingTitle: isRussian ? "Без описания" : "Without a description",
      missingSubtitle: isRussian
        ? "Товары с готовым фото, у которых ещё нет описания, сгенерированного Gemini."
        : "Products with a completed photo that don't have a Gemini-generated description yet.",
      generatedTitle: isRussian ? "Уже сгенерировано" : "Already generated",
      generatedSubtitle: isRussian
        ? "Товары, для которых описание уже сгенерировано этим пайплайном (Gemini)."
        : "Products that already have a description generated by this pipeline (Gemini).",
      viewMissing: isRussian ? "Без описания" : "Without description",
      viewGenerated: isRussian ? "С описанием" : "With description",
      regenerate: isRussian ? "Перегенерировать" : "Regenerate",
      viewDescription: isRussian ? "Показать описание" : "View description",
      hideDescription: isRussian ? "Скрыть описание" : "Hide description",
      showAllDescriptions: isRussian
        ? "Показать все описания"
        : "Show all descriptions",
      hideAllDescriptions: isRussian
        ? "Скрыть все описания"
        : "Hide all descriptions",
      copy: isRussian ? "Копировать" : "Copy",
      copied: isRussian ? "Скопировано" : "Copied",
      clearAll: isRussian ? "Очистить все описания" : "Clear all descriptions",
      clearAllConfirmTitle: isRussian
        ? "Очистить все описания"
        : "Clear all descriptions",
      clearAllConfirmMessage: (count) =>
        isRussian
          ? `Описание будет удалено у всех ${count} товаров (фото и ноты не затрагиваются). Это действие нельзя отменить. Продолжить?`
          : `The description will be removed from all ${count} products (photos and notes are untouched). This cannot be undone. Continue?`,
      statusLabels: {
        all: isRussian ? "Все" : "All",
        unchecked: isRussian ? "Не сгенерированы" : "Not generated",
        error: isRussian ? "Ошибки" : "Errors",
        not_found: isRussian ? "Пустой ответ" : "Empty result",
      },
      countLabels: {
        total: isRussian
          ? "Всего товаров с фото"
          : "Total products with a photo",
        generated: isRussian ? "Уже сгенерировано" : "Already generated",
        missing: isRussian ? "Без описания" : "Missing description",
      },
      showing: (from, to, total) =>
        isRussian
          ? `Показано ${from}–${to} из ${total}`
          : `Showing ${from}–${to} of ${total}`,
      prevPage: isRussian ? "Назад" : "Previous",
      nextPage: isRussian ? "Вперёд" : "Next",
      pageOf: (page, total) =>
        isRussian ? `Страница ${page} из ${total}` : `Page ${page} of ${total}`,
    }),
    [isRussian],
  );

  const loadQueue = useCallback(async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    const response = await fetch(
      `/api/admin/descriptions/misses${params.toString() ? `?${params.toString()}` : ""}`,
      { credentials: "same-origin" },
    );
    const payload = await readJson(response, isRussian);
    const nextItems = Array.isArray(payload.items) ? payload.items : [];
    setItems(nextItems);
    setCounts({ ...EMPTY_COUNTS, ...(payload.counts || {}) });
    setSelected((current) => {
      const validIds = new Set(nextItems.map((item) => String(item.id)));
      return Object.fromEntries(
        Object.entries(current).filter(
          ([id, checked]) => checked && validIds.has(id),
        ),
      );
    });
    setError("");
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      loadQueue()
        .catch((loadError) => {
          if (!cancelled)
            setError(
              loadError.message ||
                (isRussian
                  ? "Не удалось загрузить список"
                  : "Could not load the list"),
            );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadQueue, isRussian]);

  // Products are split into two lists: those without a Gemini-generated
  // description yet (actionable, selectable, bulk-generatable) and those that
  // already have one (informational, with a per-item regenerate button).
  const missingItems = useMemo(
    () => items.filter((item) => !item.hasDescription),
    [items],
  );
  const generatedItems = useMemo(
    () => items.filter((item) => item.hasDescription),
    [items],
  );
  const missingFiltered = useMemo(
    () =>
      statusFilter === "all"
        ? missingItems
        : missingItems.filter((item) => item.status === statusFilter),
    [missingItems, statusFilter],
  );

  const selectableItems = missingFiltered;
  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  // Paginate both lists so the DOM never holds thousands of rows at once.
  const totalMissingPages = Math.max(
    1,
    Math.ceil(missingFiltered.length / PAGE_SIZE),
  );
  const currentMissingPage = Math.min(missingPage, totalMissingPages);
  const visibleMissing = missingFiltered.slice(
    (currentMissingPage - 1) * PAGE_SIZE,
    currentMissingPage * PAGE_SIZE,
  );
  const totalGeneratedPages = Math.max(
    1,
    Math.ceil(generatedItems.length / PAGE_SIZE),
  );
  const currentGeneratedPage = Math.min(generatedPage, totalGeneratedPages);
  const visibleGenerated = generatedItems.slice(
    (currentGeneratedPage - 1) * PAGE_SIZE,
    currentGeneratedPage * PAGE_SIZE,
  );

  // Reset pagination whenever the filter or search changes.
  useEffect(() => {
    setMissingPage(1);
    setGeneratedPage(1);
  }, [statusFilter, query]);

  const toggleSelect = (id) => {
    setSelected((current) => ({
      ...current,
      [String(id)]: !current[String(id)],
    }));
  };

  const toggleSelectAll = () => {
    if (
      selectedIds.length === selectableItems.length &&
      selectableItems.length > 0
    ) {
      setSelected({});
      return;
    }
    setSelected(
      Object.fromEntries(
        selectableItems.map((item) => [String(item.id), true]),
      ),
    );
  };

  const clearAllDescriptions = async () => {
    const approved = await confirm({
      title: labels.clearAllConfirmTitle,
      message: labels.clearAllConfirmMessage(counts.total || 0),
    });
    if (!approved) return;

    setClearing(true);
    setError("");
    setMessage("");
    let totalCleared = 0;
    let totalErrors = 0;
    try {
      // The server clears a bounded batch per request (otherwise the Worker
      // exceeds its subrequest/time limits); loop until nothing is left.
      while (true) {
        const response = await fetch("/api/admin/descriptions/clear", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 100 }),
        });
        const payload = await readJson(response, isRussian);
        totalCleared += payload.cleared || 0;
        totalErrors += payload.errors || 0;
        setMessage(
          isRussian
            ? `Удаляем описания… обработано ${totalCleared}${payload.remaining ? `, осталось ~${payload.remaining}` : ""}`
            : `Clearing descriptions… processed ${totalCleared}${payload.remaining ? `, ~${payload.remaining} left` : ""}`,
        );
        // Break when nothing is left OR no progress was made (avoid an endless
        // loop if some rows keep failing).
        if (!payload.remaining || !payload.cleared) break;
      }
      setMessage(
        isRussian
          ? `Описание удалено у ${totalCleared} товаров. Ошибок: ${totalErrors}.`
          : `Description cleared for ${totalCleared} products. Errors: ${totalErrors}.`,
      );
      setSelected({});
      await loadQueue();
    } catch (clearError) {
      setError(
        clearError.message ||
          (isRussian
            ? "Не удалось очистить описания"
            : "Could not clear descriptions"),
      );
    } finally {
      setClearing(false);
    }
  };

  const runRefresh = async (body, idsForSpinner = []) => {
    setBusy(true);
    setError("");
    setMessage("");
    if (idsForSpinner.length) {
      setBusyIds(
        Object.fromEntries(idsForSpinner.map((id) => [String(id), true])),
      );
    }
    try {
      const response = await fetch("/api/admin/descriptions/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await readJson(response, isRussian);
      setMessage(
        isRussian
          ? `Сгенерировано описаний: ${payload.found}. Пустой ответ: ${payload.notFound}. Ошибок: ${payload.errors}.`
          : `Descriptions generated: ${payload.found}. Empty result: ${payload.notFound}. Errors: ${payload.errors}.`,
      );
      setSelected({});
      await loadQueue();
    } catch (refreshError) {
      setError(
        refreshError.message ||
          (isRussian
            ? "Не удалось сгенерировать описание"
            : "Could not generate the description"),
      );
    } finally {
      setBusy(false);
      setBusyIds({});
    }
  };

  const generateSelected = () => {
    if (!selectedIds.length) return;
    runRefresh({ ids: selectedIds }, selectedIds);
  };

  const generateNext = () => runRefresh({ limit: 10 });

  const generateOne = (id) => runRefresh({ id }, [id]);

  const fetchReadyCount = async () => {
    const response = await fetch("/api/admin/descriptions/misses", {
      credentials: "same-origin",
    });
    const payload = await readJson(response, isRussian);
    return Number(payload?.counts?.readyToGenerate) || 0;
  };

  // Walk the whole eligible queue (photo-ready, no description yet) in batches
  // of 25 until nothing is left or the queue stops shrinking (the rest are
  // permanent errors that belong in the Errors filter).
  const generateAll = async () => {
    if (autoRunRef.current) return;
    autoRunRef.current = true;
    setAutoRun(true);
    setError("");
    setMessage("");
    const totals = { processed: 0, found: 0, errors: 0 };
    setAutoProgress({ ...totals });
    try {
      while (autoRunRef.current) {
        const before = await fetchReadyCount();
        if (before === 0) break;
        const response = await fetch("/api/admin/descriptions/refresh", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 25 }),
        });
        const payload = await readJson(response, isRussian);
        totals.processed += payload.checked || 0;
        totals.found += payload.found || 0;
        totals.errors += payload.errors || 0;
        setAutoProgress({ ...totals });
        await loadQueue().catch(() => {});
        const after = await fetchReadyCount();
        if (after === 0 || after >= before) break;
      }
    } catch (runError) {
      setError(
        runError.message ||
          (isRussian
            ? "Не удалось выполнить массовую генерацию"
            : "Could not run the batch generation"),
      );
    } finally {
      autoRunRef.current = false;
      setAutoRun(false);
      await loadQueue().catch(() => {});
      setMessage(
        isRussian
          ? `Массовая генерация завершена. Обработано: ${totals.processed}. Описаний: ${totals.found}. Ошибок: ${totals.errors}.`
          : `Batch generation finished. Processed: ${totals.processed}. Descriptions: ${totals.found}. Errors: ${totals.errors}.`,
      );
    }
  };

  const stopAll = () => {
    autoRunRef.current = false;
  };

  useEffect(
    () => () => {
      autoRunRef.current = false;
    },
    [],
  );

  const renderItem = (
    item,
    { selectable = false, forceExpanded = false } = {},
  ) => {
    const itemId = String(item.id);
    const isBusy = Boolean(busyIds[itemId]);
    const isError = item.status === "error" || item.status === "not_found";
    const isViewing = forceExpanded || viewingId === itemId;
    const descriptions = extractDescriptions(item);
    const hasText = Boolean(descriptions.ru || descriptions.en);
    return (
      <>
        <li
          key={itemId}
          className={`description-queue__item ${selected[itemId] ? "description-queue__item--selected" : ""}`}
        >
          {selectable ? (
            <label className="description-queue__checkbox">
              <input
                type="checkbox"
                checked={Boolean(selected[itemId])}
                onChange={() => toggleSelect(item.id)}
                aria-label={item.name}
              />
            </label>
          ) : (
            <span
              className="description-queue__check-spacer"
              aria-hidden="true"
            />
          )}

          <div className="description-queue__thumb">
            {item.image ? (
              <img
                src={item.image}
                alt=""
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <span className="description-queue__thumb-placeholder">
                <i className="ri-image-line" />
                <small>{labels.noImage}</small>
              </span>
            )}
          </div>

          <div className="description-queue__info">
            <div className="description-queue__name">{item.name || "—"}</div>
            <div className="description-queue__brand">{item.brand || "—"}</div>
            <div className="description-queue__meta">
              <span
                className={`description-queue__badge description-queue__badge--${item.status}`}
              >
                {labels.statusLabels[item.status] || item.status}
              </span>
              <span className="description-queue__photo-ready">
                <i className="ri-image-circle-line" />
                {isRussian ? "Фото готово" : "Photo ready"}
              </span>
              <span>
                <i className="ri-time-line" />
                {item.checkedAt
                  ? formatDateTime(item.checkedAt, isRussian)
                  : labels.never}
              </span>
            </div>
            {item.error && (
              <div className="description-queue__item-error" title={item.error}>
                {item.error}
              </div>
            )}
            {hasText && (
              <p className="description-queue__item-desc">
                {descriptions.ru || descriptions.en}
              </p>
            )}
          </div>

          <div className="description-queue__item-actions">
            {hasText && !forceExpanded && (
              <button
                type="button"
                className="description-queue__btn description-queue__btn--small description-queue__btn--ghost"
                onClick={() => setViewingId(isViewing ? null : itemId)}
                aria-expanded={isViewing}
              >
                <i
                  className={`ri-${isViewing ? "arrow-up-s-line" : "eye-line"}`}
                />
                {isViewing ? labels.hideDescription : labels.viewDescription}
              </button>
            )}
            <button
              type="button"
              className="description-queue__btn description-queue__btn--small"
              onClick={() => generateOne(item.id)}
              disabled={busy || isBusy}
            >
              <i className={`ri-sparkling-2-line ${isBusy ? "ri-spin" : ""}`} />
              {isBusy
                ? labels.checking
                : item.hasDescription
                  ? labels.regenerate
                  : labels.generateOne}
            </button>
            {isError && (
              <button
                type="button"
                className="description-queue__btn description-queue__btn--small description-queue__btn--ghost"
                onClick={() => setManualConfigItem(item)}
                disabled={busy}
                title={
                  isRussian
                    ? "Настроить товар вручную"
                    : "Configure the product manually"
                }
              >
                <i className="ri-settings-3-line" />
                {labels.manual}
              </button>
            )}
          </div>
        </li>
        {isViewing && hasText && (
          <li className="description-queue__detail" key={`${itemId}-detail`}>
            {descriptions.ru && (
              <div className="description-queue__detail-block">
                <div className="description-queue__detail-head">
                  <strong>
                    {isRussian ? "Описание (RU)" : "Description (RU)"}
                  </strong>
                  <button
                    type="button"
                    className="description-queue__btn description-queue__btn--small description-queue__btn--ghost"
                    onClick={() => copyText(`${itemId}-ru`, descriptions.ru)}
                  >
                    <i className="ri-file-copy-line" />
                    {copiedId === `${itemId}-ru` ? labels.copied : labels.copy}
                  </button>
                </div>
                <p className="description-queue__detail-text">
                  {descriptions.ru}
                </p>
              </div>
            )}
            {descriptions.en && (
              <div className="description-queue__detail-block">
                <div className="description-queue__detail-head">
                  <strong>
                    {isRussian ? "Описание (EN)" : "Description (EN)"}
                  </strong>
                  <button
                    type="button"
                    className="description-queue__btn description-queue__btn--small description-queue__btn--ghost"
                    onClick={() => copyText(`${itemId}-en`, descriptions.en)}
                  >
                    <i className="ri-file-copy-line" />
                    {copiedId === `${itemId}-en` ? labels.copied : labels.copy}
                  </button>
                </div>
                <p className="description-queue__detail-text">
                  {descriptions.en}
                </p>
              </div>
            )}
          </li>
        )}
      </>
    );
  };

  return (
    <section className="description-queue">
      <header className="description-queue__header">
        <div className="description-queue__header-top">
          <button
            type="button"
            className="description-queue__btn description-queue__btn--danger description-queue__btn--small"
            onClick={clearAllDescriptions}
            disabled={clearing || busy || autoRun || !counts.total}
          >
            <i className={`ri-delete-bin-line ${clearing ? "ri-spin" : ""}`} />
            {labels.clearAll}
          </button>
        </div>
        <div>
          <h2 className="description-queue__title">
            <i className="ri-sparkling-2-line" />
            {labels.title}
          </h2>
          <p className="description-queue__subtitle">{labels.subtitle}</p>
        </div>
      </header>

      {(error || message) && (
        <div
          className={`description-queue__message ${error ? "description-queue__message--error" : "description-queue__message--success"}`}
          role="status"
        >
          <i
            className={
              error ? "ri-error-warning-line" : "ri-checkbox-circle-line"
            }
          />
          <span>{error || message}</span>
          {error && (
            <button
              type="button"
              className="description-queue__btn description-queue__btn--small"
              onClick={() => {
                setLoading(true);
                setError("");
                loadQueue()
                  .catch((loadError) => setError(loadError.message))
                  .finally(() => setLoading(false));
              }}
              disabled={loading || busy}
            >
              <i className={`ri-refresh-line ${loading ? "ri-spin" : ""}`} />
              {isRussian ? "Повторить" : "Retry"}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div
          className="description-queue__loader"
          role="status"
          aria-live="polite"
        >
          <div className="description-queue__spinner" />
          <span>{isRussian ? "Загружаем список…" : "Loading the list…"}</span>
          <div className="description-queue__skeleton-stats" aria-hidden="true">
            <div className="description-queue__skeleton-stat" />
            <div className="description-queue__skeleton-stat" />
            <div className="description-queue__skeleton-stat" />
          </div>
          <div className="description-queue__skeleton-list" aria-hidden="true">
            <div className="description-queue__skeleton-row" />
            <div className="description-queue__skeleton-row" />
            <div className="description-queue__skeleton-row" />
          </div>
        </div>
      ) : (
        <>
          <div className="description-queue__stats">
            <div className="description-queue__stat">
              <span className="description-queue__stat-value">
                {counts.total ?? 0}
              </span>
              <span className="description-queue__stat-label">
                {labels.countLabels.total}
              </span>
            </div>
            <div className="description-queue__stat">
              <span className="description-queue__stat-value">
                {counts.missing ?? 0}
              </span>
              <span className="description-queue__stat-label">
                {labels.countLabels.missing}
              </span>
            </div>
            <div className="description-queue__stat">
              <span className="description-queue__stat-value">
                {counts.generated ?? 0}
              </span>
              <span className="description-queue__stat-label">
                {labels.countLabels.generated}
              </span>
            </div>
          </div>

          <div className="description-queue__toolbar">
            <input
              type="search"
              className="description-queue__search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.search}
              aria-label={labels.search}
            />
          </div>

          <div className="description-queue__view-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={view === "missing"}
              className={`description-queue__view-tab ${view === "missing" ? "description-queue__view-tab--active" : ""}`}
              onClick={() => setView("missing")}
            >
              <i className="ri-inbox-line" />
              {labels.viewMissing}
              <span className="description-queue__view-tab-count">
                {counts.missing ?? 0}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "generated"}
              className={`description-queue__view-tab ${view === "generated" ? "description-queue__view-tab--active" : ""}`}
              onClick={() => setView("generated")}
            >
              <i className="ri-check-double-line" />
              {labels.viewGenerated}
              <span className="description-queue__view-tab-count">
                {counts.generated ?? 0}
              </span>
            </button>
          </div>

          {(view === "missing" || query.trim()) && (
            <section className="description-queue__group">
              <div className="description-queue__group-header">
                <div>
                  <h3 className="description-queue__group-title">
                    {labels.missingTitle}
                  </h3>
                  <p className="description-queue__group-subtitle">
                    {labels.missingSubtitle}
                  </p>
                </div>
                <span className="description-queue__group-count">
                  {missingItems.length}
                </span>
              </div>

              <div className="description-queue__filters" role="tablist">
                {STATUS_OPTIONS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === status}
                    className={`description-queue__filter ${statusFilter === status ? "description-queue__filter--active" : ""}`}
                    onClick={() => setStatusFilter(status)}
                  >
                    {labels.statusLabels[status]}
                  </button>
                ))}
              </div>

              {missingFiltered.length > 0 && (
                <div className="description-queue__actions">
                  <div className="description-queue__selection-row">
                    <label className="description-queue__select-all">
                      <input
                        type="checkbox"
                        checked={
                          selectedIds.length === selectableItems.length &&
                          selectableItems.length > 0
                        }
                        onChange={toggleSelectAll}
                        disabled={!selectableItems.length}
                      />
                      <span>{labels.selectAll}</span>
                    </label>
                    {selectedIds.length > 0 && (
                      <button
                        type="button"
                        className="description-queue__btn description-queue__btn--ghost description-queue__btn--small"
                        onClick={() => setSelected({})}
                      >
                        {labels.clearSelection}
                      </button>
                    )}
                    <span className="description-queue__selected">
                      {labels.selectedCount(selectedIds.length)}
                    </span>
                  </div>

                  <div className="description-queue__buttons-row">
                    <button
                      type="button"
                      className="description-queue__btn"
                      onClick={() => {
                        setLoading(true);
                        loadQueue()
                          .catch((loadError) => setError(loadError.message))
                          .finally(() => setLoading(false));
                      }}
                      disabled={loading || busy}
                    >
                      <i
                        className={`ri-refresh-line ${loading ? "ri-spin" : ""}`}
                      />
                      {labels.refreshList}
                    </button>
                    <button
                      type="button"
                      className="description-queue__btn description-queue__btn--primary"
                      onClick={generateSelected}
                      disabled={busy || !selectedIds.length}
                    >
                      <i className="ri-sparkling-2-line" />
                      {labels.generateSelected}
                    </button>
                    <button
                      type="button"
                      className="description-queue__btn"
                      onClick={generateNext}
                      disabled={busy || autoRun || !selectableItems.length}
                    >
                      <i
                        className={`ri-play-list-line ${busy ? "ri-spin" : ""}`}
                      />
                      {labels.generateNext}
                    </button>
                    {autoRun ? (
                      <button
                        type="button"
                        className="description-queue__btn description-queue__btn--danger"
                        onClick={stopAll}
                      >
                        <i className="ri-stop-circle-line" />
                        {labels.stopAll}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="description-queue__btn"
                        onClick={generateAll}
                        disabled={busy || (counts.readyToGenerate || 0) === 0}
                        title={labels.generateAll}
                      >
                        <i className="ri-flashlight-line" />
                        {labels.generateAll} ({counts.readyToGenerate || 0})
                      </button>
                    )}
                  </div>
                </div>
              )}

              {autoRun && (
                <div
                  className="description-queue__batch-progress"
                  role="status"
                >
                  <i className="ri-loader-4-line ri-spin" />
                  <span>
                    {labels.batchProgress(
                      autoProgress.processed,
                      counts.readyToGenerate || 0,
                    )}
                  </span>
                </div>
              )}

              {missingFiltered.length === 0 ? (
                <div className="description-queue__empty">
                  {statusFilter === "all" && !query.trim()
                    ? labels.empty
                    : labels.emptyFiltered}
                </div>
              ) : (
                <>
                  <ul className="description-queue__list">
                    {visibleMissing.map((item) =>
                      renderItem(item, { selectable: true }),
                    )}
                  </ul>
                  <div className="description-queue__pagination">
                    <span className="description-queue__pagination-info">
                      {labels.showing(
                        (currentMissingPage - 1) * PAGE_SIZE + 1,
                        Math.min(
                          currentMissingPage * PAGE_SIZE,
                          missingFiltered.length,
                        ),
                        missingFiltered.length,
                      )}
                    </span>
                    <div className="description-queue__pagination-controls">
                      <button
                        type="button"
                        className="description-queue__btn description-queue__btn--small description-queue__btn--ghost"
                        onClick={() =>
                          setMissingPage((p) => Math.max(1, p - 1))
                        }
                        disabled={currentMissingPage <= 1}
                      >
                        {labels.prevPage}
                      </button>
                      <span className="description-queue__pagination-page">
                        {labels.pageOf(currentMissingPage, totalMissingPages)}
                      </span>
                      <button
                        type="button"
                        className="description-queue__btn description-queue__btn--small description-queue__btn--ghost"
                        onClick={() =>
                          setMissingPage((p) =>
                            Math.min(totalMissingPages, p + 1),
                          )
                        }
                        disabled={currentMissingPage >= totalMissingPages}
                      >
                        {labels.nextPage}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {(view === "generated" || query.trim()) && (
            <section className="description-queue__group">
              <div className="description-queue__group-header">
                <div>
                  <h3 className="description-queue__group-title">
                    {labels.generatedTitle}
                  </h3>
                  <p className="description-queue__group-subtitle">
                    {labels.generatedSubtitle}
                  </p>
                </div>
                <div className="description-queue__group-header-actions">
                  <span className="description-queue__group-count">
                    {generatedItems.length}
                  </span>
                  {generatedItems.length > 0 && (
                    <button
                      type="button"
                      className="description-queue__btn description-queue__btn--small"
                      onClick={() => setShowGeneratedDescriptions((v) => !v)}
                      aria-expanded={showGeneratedDescriptions}
                    >
                      <i
                        className={`ri-${showGeneratedDescriptions ? "arrow-up-s-line" : "eye-line"}`}
                      />
                      {showGeneratedDescriptions
                        ? labels.hideAllDescriptions
                        : labels.showAllDescriptions}
                    </button>
                  )}
                </div>
              </div>

              {generatedItems.length === 0 ? (
                <div className="description-queue__empty">
                  {labels.groupEmpty}
                </div>
              ) : (
                <>
                  <ul className="description-queue__list">
                    {visibleGenerated.map((item) =>
                      renderItem(item, {
                        selectable: false,
                        forceExpanded: showGeneratedDescriptions,
                      }),
                    )}
                  </ul>
                  <div className="description-queue__pagination">
                    <span className="description-queue__pagination-info">
                      {labels.showing(
                        (currentGeneratedPage - 1) * PAGE_SIZE + 1,
                        Math.min(
                          currentGeneratedPage * PAGE_SIZE,
                          generatedItems.length,
                        ),
                        generatedItems.length,
                      )}
                    </span>
                    <div className="description-queue__pagination-controls">
                      <button
                        type="button"
                        className="description-queue__btn description-queue__btn--small description-queue__btn--ghost"
                        onClick={() =>
                          setGeneratedPage((p) => Math.max(1, p - 1))
                        }
                        disabled={currentGeneratedPage <= 1}
                      >
                        {labels.prevPage}
                      </button>
                      <span className="description-queue__pagination-page">
                        {labels.pageOf(
                          currentGeneratedPage,
                          totalGeneratedPages,
                        )}
                      </span>
                      <button
                        type="button"
                        className="description-queue__btn description-queue__btn--small description-queue__btn--ghost"
                        onClick={() =>
                          setGeneratedPage((p) =>
                            Math.min(totalGeneratedPages, p + 1),
                          )
                        }
                        disabled={currentGeneratedPage >= totalGeneratedPages}
                      >
                        {labels.nextPage}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}

      {manualConfigItem && (
        <ProductManualConfigModal
          item={manualConfigItem}
          language={language}
          onClose={() => setManualConfigItem(null)}
          onSaved={async (result) => {
            setManualConfigItem(null);
            setMessage(
              isRussian
                ? `Товар #${result.id} настроен вручную и сохранён в базе данных.`
                : `Product #${result.id} was configured manually and saved to the database.`,
            );
            await loadQueue();
          }}
        />
      )}
    </section>
  );
}
