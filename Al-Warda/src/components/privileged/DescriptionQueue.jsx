import { useCallback, useEffect, useMemo, useState } from "react";
import "./DescriptionQueue.css";

const STATUS_OPTIONS = ["all", "unchecked", "error", "not_found", "unverified"];
const EMPTY_COUNTS = {
  total: 0,
  unchecked: 0,
  error: 0,
  notFound: 0,
  unverified: 0,
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
  const [autoProgress, setAutoProgress] = useState({ processed: 0, found: 0, errors: 0 });
  const autoRunRef = useRef(false);

  const labels = useMemo(() => ({
    title: isRussian ? "Описание товаров" : "Product descriptions",
    subtitle: isRussian
      ? "Пайплайн: данные Qogita -> генерация фото -> палитра ароматов -> описание (Gemini). "
        + "Описание генерируется только для товаров с готовым фото и без реального описания."
      : "Pipeline: Qogita data -> photo generation -> aroma palette -> description (Gemini). "
        + "Descriptions are generated only for products with a completed photo and no real description yet.",
    refreshList: isRussian ? "Обновить список" : "Refresh list",
    generateSelected: isRussian ? "Сгенерировать выбранные" : "Generate selected",
    generateNext: isRussian ? "Сгенерировать следующие 10" : "Generate next 10",
    generateAll: isRussian ? "Сгенерировать все" : "Generate all",
    stopAll: isRussian ? "Остановить" : "Stop",
    batchProgress: (processed, remaining) =>
      isRussian
        ? `Массовая генерация: обработано ${processed}, осталось ~${remaining}`
        : `Batch generation: ${processed} processed, ~${remaining} left`,
    search: isRussian ? "Поиск по названию или бренду" : "Search by name or brand",
    selectAll: isRussian ? "Выбрать все" : "Select all",
    clearSelection: isRussian ? "Снять выбор" : "Clear selection",
    empty: isRussian ? "У всех товаров есть описание." : "Every product has a description.",
    emptyFiltered: isRussian ? "По этому фильтру ничего не найдено." : "Nothing matches this filter.",
    selectedCount: (count) => (isRussian ? `Выбрано: ${count}` : `Selected: ${count}`),
    generateOne: isRussian ? "Сгенерировать" : "Generate",
    manual: isRussian ? "Настроить вручную" : "Manual setup",
    checking: isRussian ? "Генерируем..." : "Generating...",
    noImage: isRussian ? "Нет фото" : "No image",
    photoPending: isRussian ? "Фото ещё не сгенерировано" : "Photo not generated yet",
    setExcluded: isRussian ? "Сет - генерация не применяется" : "Set - generation skipped",
    queryLabel: isRussian ? "Запрос" : "Query",
    generatedAt: isRussian ? "Сгенерировано" : "Generated",
    never: isRussian ? "Ещё не генерировались" : "Not generated yet",
    groupPending: isRussian ? "Очередь генерации" : "Generation queue",
    groupErrors: isRussian ? "Ошибки" : "Errors",
    groupEmpty: isRussian ? "Пусто" : "Empty",
    errorsHint: isRussian
      ? "Товары без описания или с ошибкой генерации. Нажмите «Настроить вручную», чтобы задать описание самому."
      : "Products without a description or with a generation error. Click Manual setup to enter the description yourself.",
    statusLabels: {
      all: isRussian ? "Все" : "All",
      unchecked: isRussian ? "Не сгенерированы" : "Not generated",
      error: isRussian ? "Ошибки" : "Errors",
      not_found: isRussian ? "Пустой ответ" : "Empty result",
      unverified: isRussian ? "Без описания" : "No description",
    },
    countLabels: {
      readyToGenerate: isRussian ? "Готовы к генерации" : "Ready to generate",
      problem: isRussian ? "Ошибки" : "Errors",
      total: isRussian ? "Всего без описания" : "Missing description",
    },
  }), [isRussian]);
