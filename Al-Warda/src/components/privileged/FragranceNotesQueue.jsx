import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProductManualConfigModal from "./ProductManualConfigModal";
import "./FragranceNotesQueue.css";

const STATUS_OPTIONS = ["all", "unchecked", "error", "not_found", "unverified"];
const EMPTY_COUNTS = {
  total: 0,
  unchecked: 0,
  error: 0,
  notFound: 0,
  unverified: 0,
  photoPending: 0,
  sets: 0,
  readyToGenerate: 0,
  problem: 0,
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

async function readJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`HTTP ${response.status}: ${response.statusText || "non-JSON response"}`);
  }
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

export default function FragranceNotesQueue({ language = "ru" }) {
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
  const [autoProgress, setAutoProgress] = useState({ processed: 0, found: 0, errors: 0 });
  const autoRunRef = useRef(false);

  const labels = useMemo(() => ({
    title: isRussian ? "Палитры ароматов" : "Aroma palettes",
    subtitle: isRussian
      ? "Пайплайн: данные Qogita → генерация фото → палитра ароматов (DeepSeek) → описание (Gemini). "
        + "Палитра генерируется только для товаров с готовым фото и без сетов. "
        + "Товары без палитры или с ошибкой попадают в раздел «Ошибки», где можно настроить их вручную."
      : "Pipeline: Qogita data → photo generation → aroma palette (DeepSeek) → description (Gemini). "
        + "Palettes are generated only for products with a completed photo and never for sets. "
        + "Products without a palette or with an error land in the Errors section, where you can set them up manually.",
    refreshList: isRussian ? "Обновить список" : "Refresh list",
    checkSelected: isRussian ? "Сгенерировать выбранные" : "Generate selected",
    checkNext: isRussian ? "Сгенерировать следующие 10" : "Generate next 10",
    generateAll: isRussian ? "Сгенерировать все" : "Generate all",
    stopAll: isRussian ? "Остановить" : "Stop",
    batchProgress: (processed, remaining) =>
      isRussian
        ? `Массовая генерация: обработано ${processed}, осталось ~${remaining}`
        : `Batch generation: ${processed} processed, ~${remaining} left`,
    search: isRussian ? "Поиск по названию или бренду" : "Search by name or brand",
    selectAll: isRussian ? "Выбрать все" : "Select all",
    clearSelection: isRussian ? "Снять выбор" : "Clear selection",
    empty: isRussian ? "У всех товаров есть палитра." : "Every product has a palette.",
    emptyFiltered: isRussian ? "По этому фильтру ничего не найдено." : "Nothing matches this filter.",
    selectedCount: (count) => (isRussian ? `Выбрано: ${count}` : `Selected: ${count}`),
    checkOne: isRussian ? "Сгенерировать" : "Generate",
    regenerate: isRussian ? "Сгенерировать снова" : "Regenerate",
    manual: isRussian ? "Настроить вручную" : "Manual setup",
    checking: isRussian ? "Генерируем…" : "Generating…",
    noImage: isRussian ? "Нет фото" : "No image",
    photoPending: isRussian ? "Фото ещё не сгенерировано" : "Photo not generated yet",
    setExcluded: isRussian ? "Сет — генерация не применяется" : "Set — generation skipped",
    queryLabel: isRussian ? "Запрос" : "Query",
    checkedAt: isRussian ? "Сгенерировано" : "Generated",
    never: isRussian ? "Ещё не генерировались" : "Not generated yet",
    groupPending: isRussian ? "Очередь генерации" : "Generation queue",
    groupErrors: isRussian ? "Ошибки" : "Errors",
    groupAwaitingPhoto: isRussian ? "Ожидают фото" : "Awaiting photo",
    groupSets: isRussian ? "Сеты (ручная настройка)" : "Sets (manual setup)",
    groupEmpty: isRussian ? "Пусто" : "Empty",
    errorsHint: isRussian
      ? "Товары без палитры или с ошибкой генерации. Нажмите «Настроить вручную», чтобы задать ноты и описание самому."
      : "Products without a palette or with a generation error. Click Manual setup to enter notes and description yourself.",
    statusLabels: {
      all: isRussian ? "Все" : "All",
      unchecked: isRussian ? "Не сгенерированы" : "Not generated",
      error: isRussian ? "Ошибки" : "Errors",
      not_found: isRussian ? "Пустой ответ" : "Empty result",
      unverified: isRussian ? "Без палитры" : "No palette",
    },
    countLabels: {
      readyToGenerate: isRussian ? "Готовы к генерации" : "Ready to generate",
      problem: isRussian ? "Ошибки" : "Errors",
      photoPending: isRussian ? "Ожидают фото" : "Awaiting photo",
      sets: isRussian ? "Сеты" : "Sets",
      total: isRussian ? "Всего без палитры" : "Missing palette",
    },
  }), [isRussian]);

  const loadQueue = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (query.trim()) params.set("q", query.trim());
    const response = await fetch(
      `/api/admin/fragrance-notes/misses${params.toString() ? `?${params.toString()}` : ""}`,
      { credentials: "same-origin" },
    );
    const payload = await readJson(response);
    const nextItems = Array.isArray(payload.items) ? payload.items : [];
    setItems(nextItems);
    setCounts({ ...EMPTY_COUNTS, ...(payload.counts || {}) });
    setSelected((current) => {
      const validIds = new Set(nextItems.map((item) => String(item.id)));
      return Object.fromEntries(
        Object.entries(current).filter(([id, checked]) => checked && validIds.has(id)),
      );
    });
    setError("");
  }, [statusFilter, query]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      loadQueue()
        .catch((loadError) => {
          if (!cancelled) setError(loadError.message || (isRussian ? "Не удалось загрузить список" : "Could not load the list"));
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

  const groups = useMemo(() => {
    const setItems = items.filter((item) => item.isSet);
    const nonSet = items.filter((item) => !item.isSet);
    return {
      sets: setItems,
      pending: nonSet.filter((item) => item.photoReady && item.status === "unchecked"),
      problems: nonSet.filter((item) => item.photoReady && item.status !== "unchecked"),
      awaitingPhoto: nonSet.filter((item) => !item.photoReady),
    };
  }, [items]);

  const selectableItems = groups.pending;
  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  const toggleSelect = (id) => {
    setSelected((current) => ({ ...current, [String(id)]: !current[String(id)] }));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === selectableItems.length && selectableItems.length > 0) {
      setSelected({});
      return;
    }
    setSelected(Object.fromEntries(selectableItems.map((item) => [String(item.id), true])));
  };

  const runRefresh = async (body, idsForSpinner = []) => {
    setBusy(true);
    setError("");
    setMessage("");
    if (idsForSpinner.length) {
      setBusyIds(Object.fromEntries(idsForSpinner.map((id) => [String(id), true])));
    }
    try {
      const response = await fetch("/api/admin/fragrance-notes/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await readJson(response);
      setMessage(
        isRussian
          ? `Сгенерировано палитр: ${payload.found}. Пустой ответ: ${payload.notFound}. Ошибок: ${payload.errors}.`
            + (payload.photoPending ? ` Ожидают фото: ${payload.photoPending}.` : "")
            + (payload.setsSkipped ? ` Пропущено сетов: ${payload.setsSkipped}.` : "")
          : `Palettes generated: ${payload.found}. Empty result: ${payload.notFound}. Errors: ${payload.errors}.`
            + (payload.photoPending ? ` Awaiting photo: ${payload.photoPending}.` : "")
            + (payload.setsSkipped ? ` Sets skipped: ${payload.setsSkipped}.` : ""),
      );
      setSelected({});
      await loadQueue();
    } catch (refreshError) {
      setError(refreshError.message || (isRussian ? "Не удалось сгенерировать палитру" : "Could not generate the palette"));
    } finally {
      setBusy(false);
      setBusyIds({});
    }
  };

  const checkSelected = () => {
    if (!selectedIds.length) return;
    runRefresh({ ids: selectedIds }, selectedIds);
  };

  const checkNext = () => runRefresh({ limit: 10 });

  const checkOne = (id) => runRefresh({ id }, [id]);

  const fetchReadyCount = async () => {
    const response = await fetch("/api/admin/fragrance-notes/misses", { credentials: "same-origin" });
    const payload = await readJson(response);
    return Number(payload?.counts?.readyToGenerate) || 0;
  };

  // Walk the whole eligible queue (photo-ready, non-set, no palette yet) in
  // batches of 25 until nothing is left or the queue stops shrinking (the rest
  // are permanent errors that belong in the Errors section).
  const runAll = async () => {
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
        const response = await fetch("/api/admin/fragrance-notes/refresh", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 25 }),
        });
        const payload = await readJson(response);
        totals.processed += payload.checked || 0;
        totals.found += payload.found || 0;
        totals.errors += payload.errors || 0;
        setAutoProgress({ ...totals });
        await loadQueue().catch(() => {});
        const after = await fetchReadyCount();
        if (after === 0 || after >= before) break;
      }
    } catch (runError) {
      setError(runError.message || (isRussian ? "Не удалось выполнить массовую генерацию" : "Could not run the batch generation"));
    } finally {
      autoRunRef.current = false;
      setAutoRun(false);
      await loadQueue().catch(() => {});
      setMessage(
        isRussian
          ? `Массовая генерация завершена. Обработано: ${totals.processed}. Палитр: ${totals.found}. Ошибок: ${totals.errors}.`
          : `Batch generation finished. Processed: ${totals.processed}. Palettes: ${totals.found}. Errors: ${totals.errors}.`,
      );
    }
  };

  const stopAll = () => {
    autoRunRef.current = false;
  };

  useEffect(() => () => {
    autoRunRef.current = false;
  }, []);

  const renderRow = (item, { selectable = false, allowGenerate = true, allowManual = false }) => {
    const itemId = String(item.id);
    const isBusy = Boolean(busyIds[itemId]);
    return (
      <li key={itemId} className="fragrance-notes__item">
        {selectable ? (
          <label className="fragrance-notes__check">
            <input
              type="checkbox"
              checked={Boolean(selected[itemId])}
              onChange={() => toggleSelect(item.id)}
              aria-label={item.name}
            />
          </label>
        ) : (
          <span className="fragrance-notes__check-spacer" aria-hidden="true" />
        )}

        <div className="fragrance-notes__thumb">
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
            <span>{labels.noImage}</span>
          )}
        </div>

        <div className="fragrance-notes__info">
          <div className="fragrance-notes__name-row">
            <strong>{item.name || "—"}</strong>
            <span className={`fragrance-notes__badge fragrance-notes__badge--${item.status}`}>
              {labels.statusLabels[item.status] || item.status}
            </span>
            {item.isSet && (
              <span className="fragrance-notes__badge fragrance-notes__badge--set">
                {isRussian ? "Сет" : "Set"}
              </span>
            )}
          </div>
          <span className="fragrance-notes__brand">{item.brand || "—"}</span>
          <div className="fragrance-notes__meta">
            <span>
              <i className="ri-time-line" />
              {item.checkedAt ? formatDateTime(item.checkedAt, isRussian) : labels.never}
            </span>
            {!item.photoReady && (
              <span title={labels.photoPending}>
                <i className="ri-image-line" />
                {labels.photoPending}
              </span>
            )}
            {item.isSet && (
              <span title={labels.setExcluded}>
                <i className="ri-gift-line" />
                {labels.setExcluded}
              </span>
            )}
            {item.error && (
              <span title={item.error}>
                <i className="ri-error-warning-line" />
                {item.error}
              </span>
            )}
            {item.query && (
              <span>
                <i className="ri-search-line" />
                {labels.queryLabel}: {item.query}
              </span>
            )}
          </div>
        </div>

        <div className="fragrance-notes__actions">
          {allowGenerate && (
            <button
              type="button"
              className="fragrance-notes__btn fragrance-notes__btn--small"
              onClick={() => checkOne(item.id)}
              disabled={busy || !item.photoReady || isBusy}
              title={item.photoReady ? "" : labels.photoPending}
            >
              <i className={`ri-sparkling-2-line ${isBusy ? "ri-spin" : ""}`} />
              {isBusy
                ? labels.checking
                : (item.status === "unchecked" ? labels.checkOne : labels.regenerate)}
            </button>
          )}
          {allowManual && (
            <button
              type="button"
              className="fragrance-notes__btn fragrance-notes__btn--small fragrance-notes__btn--manual"
              onClick={() => setManualConfigItem(item)}
              disabled={busy}
              title={isRussian ? "Настроить товар вручную" : "Configure the product manually"}
            >
              <i className="ri-settings-3-line" />
              {labels.manual}
            </button>
          )}
        </div>
      </li>
    );
  };

  const renderGroup = (key, title, list, options = {}) => (
    <section className={`fragrance-notes__group fragrance-notes__group--${key}`} key={key}>
      <div className="fragrance-notes__group-header">
        <h3 className="fragrance-notes__group-title">{title}</h3>
        <span className="fragrance-notes__group-count">{list.length}</span>
      </div>
      {options.hint && <p className="fragrance-notes__group-hint">{options.hint}</p>}
      {list.length === 0 ? (
        <p className="fragrance-notes__group-empty">{labels.groupEmpty}</p>
      ) : (
        <ul className="fragrance-notes__list">
          {list.map((item) => renderRow(item, options))}
        </ul>
      )}
    </section>
  );

  return (
    <section className="fragrance-notes">
      <header className="fragrance-notes__header">
        <div>
          <h2 className="fragrance-notes__title">
            <i className="ri-sparkling-2-line" />
            {labels.title}
          </h2>
          <p className="fragrance-notes__subtitle">{labels.subtitle}</p>
        </div>
        <div className="fragrance-notes__header-actions">
          <button
            type="button"
            className="fragrance-notes__btn fragrance-notes__btn--ghost"
            onClick={() => {
              setLoading(true);
              loadQueue()
                .catch((loadError) => setError(loadError.message))
                .finally(() => setLoading(false));
            }}
            disabled={loading || busy}
          >
            <i className={`ri-refresh-line ${loading ? "ri-spin" : ""}`} />
            {labels.refreshList}
          </button>
          <button
            type="button"
            className="fragrance-notes__btn"
            onClick={checkSelected}
            disabled={busy || !selectedIds.length}
          >
            <i className="ri-sparkling-2-line" />
            {labels.checkSelected}
          </button>
          <button
            type="button"
            className="fragrance-notes__btn"
            onClick={checkNext}
            disabled={busy || autoRun || !selectableItems.length}
          >
            <i className={`ri-play-list-line ${busy ? "ri-spin" : ""}`} />
            {labels.checkNext}
          </button>
          {autoRun ? (
            <button
              type="button"
              className="fragrance-notes__btn fragrance-notes__btn--stop"
              onClick={stopAll}
            >
              <i className="ri-stop-circle-line" />
              {labels.stopAll}
            </button>
          ) : (
            <button
              type="button"
              className="fragrance-notes__btn fragrance-notes__btn--all"
              onClick={runAll}
              disabled={busy || (counts.readyToGenerate || 0) === 0}
              title={labels.generateAll}
            >
              <i className="ri-flashlight-line" />
              {labels.generateAll} ({counts.readyToGenerate || 0})
            </button>
          )}
        </div>
      </header>

      {autoRun && (
        <div className="fragrance-notes__progress" role="status">
          <i className="ri-loader-4-line ri-spin" />
          <span>{labels.batchProgress(autoProgress.processed, counts.readyToGenerate || 0)}</span>
        </div>
      )}

      <div className="fragrance-notes__counters">
        {Object.entries(labels.countLabels).map(([key, label]) => (
          <div key={key} className={`fragrance-notes__counter fragrance-notes__counter--${key}`}>
            <span>{label}</span>
            <strong>{counts[key] ?? 0}</strong>
          </div>
        ))}
      </div>

      <div className="fragrance-notes__toolbar">
        <div className="fragrance-notes__filters" role="tablist">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={statusFilter === status}
              className={`fragrance-notes__filter ${statusFilter === status ? "fragrance-notes__filter--active" : ""}`}
              onClick={() => setStatusFilter(status)}
            >
              {labels.statusLabels[status]}
            </button>
          ))}
        </div>
        <div className="fragrance-notes__search">
          <i className="ri-search-line" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.search}
            aria-label={labels.search}
          />
        </div>
      </div>

      {(error || message) && (
        <div className={`fragrance-notes__notice ${error ? "fragrance-notes__notice--error" : "fragrance-notes__notice--ok"}`} role="status">
          <i className={error ? "ri-error-warning-line" : "ri-checkbox-circle-line"} />
          <span>{error || message}</span>
        </div>
      )}

      {loading ? (
        <div className="fragrance-notes__empty" role="status">
          <i className="ri-loader-4-line ri-spin" />
          <span>{isRussian ? "Загружаем список…" : "Loading the list…"}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="fragrance-notes__empty">
          <i className="ri-checkbox-circle-line" />
          <span>{statusFilter === "all" && !query.trim() ? labels.empty : labels.emptyFiltered}</span>
        </div>
      ) : (
        <>
          {selectableItems.length > 0 && (
            <div className="fragrance-notes__selection">
              <label>
                <input
                  type="checkbox"
                  checked={selectedIds.length === selectableItems.length && selectableItems.length > 0}
                  onChange={toggleSelectAll}
                />
                <span>{labels.selectAll}</span>
              </label>
              {selectedIds.length > 0 && (
                <button type="button" className="fragrance-notes__link" onClick={() => setSelected({})}>
                  {labels.clearSelection}
                </button>
              )}
              <span className="fragrance-notes__selected-count">{labels.selectedCount(selectedIds.length)}</span>
            </div>
          )}

          {renderGroup("pending", labels.groupPending, groups.pending, {
            selectable: true,
            allowGenerate: true,
          })}
          {renderGroup("errors", labels.groupErrors, groups.problems, {
            hint: labels.errorsHint,
            allowGenerate: true,
            allowManual: true,
          })}
          {renderGroup("photo", labels.groupAwaitingPhoto, groups.awaitingPhoto, {
            allowGenerate: false,
          })}
          {renderGroup("sets", labels.groupSets, groups.sets, {
            allowGenerate: false,
            allowManual: true,
          })}
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
