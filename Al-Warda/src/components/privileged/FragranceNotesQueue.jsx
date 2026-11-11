import { useCallback, useEffect, useMemo, useState } from "react";
import "./FragranceNotesQueue.css";

const STATUS_OPTIONS = ["all", "unchecked", "error", "not_found", "unverified"];

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
  const [counts, setCounts] = useState({ total: 0, unchecked: 0, error: 0, notFound: 0, unverified: 0, photoPending: 0 });
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyIds, setBusyIds] = useState({});
  const [selected, setSelected] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const labels = useMemo(() => ({
    title: isRussian ? "Ноты ароматов (DeepSeek)" : "Fragrance notes (DeepSeek)",
    subtitle: isRussian
      ? "Товары без палитры нот. DeepSeek сгенерирует ноты только для товаров со сгенерированным фото (Qogita → фото → палитра → описание)."
      : "Products without a note pyramid. DeepSeek generates notes only for products with a generated photo (Qogita → photo → palette → description).",
    refreshList: isRussian ? "Обновить список" : "Refresh list",
    checkSelected: isRussian ? "Сгенерировать выбранные" : "Generate selected",
    checkNext: isRussian ? "Сгенерировать следующие 10" : "Generate next 10",
    search: isRussian ? "Поиск по названию или бренду" : "Search by name or brand",
    selectAll: isRussian ? "Выбрать все" : "Select all",
    clearSelection: isRussian ? "Снять выбор" : "Clear selection",
    empty: isRussian ? "У всех товаров есть ноты." : "Every product has notes.",
    emptyFiltered: isRussian ? "По этому фильтру ничего не найдено." : "Nothing matches this filter.",
    selectedCount: (count) => (isRussian ? `Выбрано: ${count}` : `Selected: ${count}`),
    checkOne: isRussian ? "Сгенерировать" : "Generate",
    checking: isRussian ? "Генерируем…" : "Generating…",
    noImage: isRussian ? "Нет фото" : "No image",
    photoPending: isRussian ? "Фото ещё не сгенерировано" : "Photo not generated yet",
    queryLabel: isRussian ? "Запрос" : "Query",
    checkedAt: isRussian ? "Сгенерировано" : "Generated",
    never: isRussian ? "Ещё не генерировались" : "Not generated yet",
    statusLabels: {
      all: isRussian ? "Все" : "All",
      unchecked: isRussian ? "Не сгенерированы" : "Not generated",
      error: isRussian ? "Ошибки" : "Errors",
      not_found: isRussian ? "Пустой ответ" : "Empty result",
      unverified: isRussian ? "Без нот" : "No notes",
    },
    countLabels: {
      total: isRussian ? "Без нот" : "Missing notes",
      unchecked: isRussian ? "Не сгенерированы" : "Not generated",
      error: isRussian ? "Ошибки" : "Errors",
      notFound: isRussian ? "Пустой ответ" : "Empty result",
      unverified: isRussian ? "Без нот" : "No notes",
      photoPending: isRussian ? "Ожидают фото" : "Awaiting photo",
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
    setCounts(payload.counts || { total: 0, unchecked: 0, error: 0, notFound: 0, unverified: 0, photoPending: 0 });
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

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  const toggleSelect = (id) => {
    setSelected((current) => ({ ...current, [String(id)]: !current[String(id)] }));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length && items.length > 0) {
      setSelected({});
      return;
    }
    setSelected(Object.fromEntries(items.map((item) => [String(item.id), true])));
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
          ? `Сгенерировано: ${payload.checked}. С нотами: ${payload.found}. Пустой ответ: ${payload.notFound}. Ошибок: ${payload.errors}.` +
            (payload.photoPending ? ` Ожидают фото: ${payload.photoPending}.` : "")
          : `Generated: ${payload.checked}. With notes: ${payload.found}. Empty result: ${payload.notFound}. Errors: ${payload.errors}.` +
            (payload.photoPending ? ` Awaiting photo: ${payload.photoPending}.` : ""),
      );
      setSelected({});
      await loadQueue();
    } catch (refreshError) {
      setError(refreshError.message || (isRussian ? "Не удалось проверить ноты" : "Could not check notes"));
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
            disabled={busy || !items.length}
          >
            <i className={`ri-play-list-line ${busy ? "ri-spin" : ""}`} />
            {labels.checkNext}
          </button>
        </div>
      </header>

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
          <div className="fragrance-notes__selection">
            <label>
              <input
                type="checkbox"
                checked={selectedIds.length === items.length && items.length > 0}
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

          <ul className="fragrance-notes__list">
            {items.map((item) => (
              <li key={item.id} className="fragrance-notes__item">
                <label className="fragrance-notes__check">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[String(item.id)])}
                    onChange={() => toggleSelect(item.id)}
                    aria-label={item.name}
                  />
                </label>
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
                    {item.query && (
                      <span>
                        <i className="ri-search-line" />
                        {labels.queryLabel}: {item.query}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="fragrance-notes__btn fragrance-notes__btn--small"
                  onClick={() => checkOne(item.id)}
                  disabled={busy || !item.photoReady || Boolean(busyIds[String(item.id)])}
                  title={item.photoReady ? "" : labels.photoPending}
                >
                  <i className={`ri-sparkling-2-line ${busyIds[String(item.id)] ? "ri-spin" : ""}`} />
                  {busyIds[String(item.id)] ? labels.checking : labels.checkOne}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
