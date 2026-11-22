import { useCallback, useEffect, useState } from "react";

const COUNTRY_LABELS = {
  BG: "Болгария (BG)",
  GR: "Греция (GR)",
  HU: "Венгрия (HU)",
  RO: "Румыния (RO)",
  GLOBAL: "Общий рынок (GLOBAL)",
};

const STATUS_META = {
  green: {
    label: "Конкурентоспособна",
    color: "#4ade80",
    bg: "rgba(34, 197, 94, 0.14)",
    border: "rgba(34, 197, 94, 0.42)",
  },
  yellow: {
    label: "Недостаточно данных",
    color: "#facc15",
    bg: "rgba(234, 179, 8, 0.14)",
    border: "rgba(234, 179, 8, 0.42)",
  },
  red: {
    label: "Выше рынка (себестоимость)",
    color: "#f87171",
    bg: "rgba(239, 68, 68, 0.14)",
    border: "rgba(239, 68, 68, 0.42)",
  },
};

const TABLE_COLUMNS = [
  {
    key: "product",
    label: "Товар и объём",
    tooltip:
      "Название аромата, бренд, объём флакона и текущая базовая цена в каталоге.",
  },
  {
    key: "cost",
    label: "Закупка (C)",
    tooltip:
      "Закупочная стоимость товара на Qogita (в EUR), от которой рассчитывается себестоимость.",
  },
  {
    key: "extra",
    label: "Доп. (E)",
    tooltip:
      "Дополнительные расходы на единицу товара (доставка, упаковка, логистика в EUR).",
  },
  {
    key: "mean",
    label: "Среднее / N",
    tooltip:
      "Среднее арифметическое цен 5 продавцов (Notino, Douglas, Dubai Perfumery, AromaRay, Arabic Scents) и число найденных предложений (N). Если данных нет — используется рекомендуемая цена Qogita или Pmin.",
  },
  {
    key: "pmin",
    label: "Pmin",
    tooltip:
      "Минимально допустимая цена продажи: (C + E + N / (1 − налог)) / (1 − комиссия оплаты). Ниже этой цены продавать нельзя.",
  },
  {
    key: "countries",
    label: "BG / GR / HU / RO",
    tooltip:
      "Итоговые цены продажи для Болгарии (BG), Греции (GR), Венгрии (HU) и Румынии (RO) с учётом скидки от рынка, порога Pmin и округления.",
  },
  {
    key: "profit",
    label: "Прибыль / Маржа",
    alignRight: true,
    tooltip:
      "Ожидаемая чистая прибыль (EUR) и маржа (%) с продажи после вычета закупки, доп. расходов, комиссии оплаты и налога.",
  },
  {
    key: "status",
    label: "Статус",
    alignRight: true,
    tooltip:
      "Зелёный — цена рассчитана и конкурентоспособна; Жёлтый — нет данных (ни цены Qogita, ни продавцов); Красный — рыночная цена ниже минимальной Pmin.",
  },
];

function fmtEur(val) {
  if (val === null || val === undefined || val === "") return "—";
  const num = Number(val);
  if (!Number.isFinite(num)) return "—";
  return `€${num.toFixed(2)}`;
}

export default function PricingTab() {
  const [subTab, setSubTab] = useState("products"); // "products" | "settings"
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 30;
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Settings state
  const [settings, setSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Selected product editor state
  const [editingItem, setEditingItem] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [publishingProduct, setPublishingProduct] = useState(false);
  const [autoCalculatingAll, setAutoCalculatingAll] = useState(false);
  const [updateBasePriceOnPublish, setUpdateBasePriceOnPublish] = useState(false);

  const loadProducts = useCallback(
    async ({ nextOffset = 0, q = searchQuery, status = statusFilter } = {}) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(nextOffset),
          status,
        });
        if (q) params.set("q", q);
        const res = await fetch(`/api/admin/pricing/products?${params.toString()}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setProducts(Array.isArray(data.items) ? data.items : []);
        setTotal(Number(data.total || 0));
        setOffset(nextOffset);
        if (data.settings && !settings) {
          setSettings(data.settings);
        }
      } catch (err) {
        setError(err.message || "Не удалось загрузить ценообразование");
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, statusFilter, settings],
  );

  const loadSettings = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/pricing/settings", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setSettings(data.settings);
    } catch (err) {
      setError(err.message || "Не удалось загрузить настройки");
    }
  }, []);

  useEffect(() => {
    loadProducts({ nextOffset: 0 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (subTab === "settings" && !settings) {
      loadSettings();
    }
  }, [subTab, settings, loadSettings]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = searchInput.trim();
    setSearchQuery(q);
    loadProducts({ nextOffset: 0, q, status: statusFilter });
  };

  const handleStatusChange = (nextStatus) => {
    setStatusFilter(nextStatus);
    loadProducts({ nextOffset: 0, q: searchQuery, status: nextStatus });
  };

  const openEditor = (item) => {
    setNotice("");
    setError("");
    setUpdateBasePriceOnPublish(false);
    setEditingItem({
      ...item,
      desiredNetProfitEur:
        item.desiredNetProfitEur === null || item.desiredNetProfitEur === undefined
          ? ""
          : String(item.desiredNetProfitEur),
      qogitaRecommendedPriceEur:
        item.qogitaRecommendedPriceEur === null || item.qogitaRecommendedPriceEur === undefined
          ? ""
          : String(item.qogitaRecommendedPriceEur),
      manualPrices: {
        BG: item.manualPrices?.BG ?? "",
        GR: item.manualPrices?.GR ?? "",
        HU: item.manualPrices?.HU ?? "",
        RO: item.manualPrices?.RO ?? "",
      },
      competitors: Array.isArray(item.competitors)
        ? item.competitors.map((c) => ({ ...c }))
        : [],
    });
  };

  const addTargetSellers = () => {
    if (!editingItem) return;
    const targetNames = [
      "Notino",
      "Douglas",
      "Dubai Perfumery",
      "AromaRay",
      "Arabic Scents",
    ];
    const existing = new Set(
      (editingItem.competitors || []).map((c) =>
        String(c.competitorName || "").trim().toLowerCase(),
      ),
    );
    const additions = targetNames
      .filter((name) => !existing.has(name.toLowerCase()))
      .map((name) => ({
        country: "GLOBAL",
        competitorName: name,
        priceEur: "",
        productUrl: "",
      }));
    if (additions.length === 0) return;
    setEditingItem({
      ...editingItem,
      competitors: [...(editingItem.competitors || []), ...additions],
    });
  };

  const addCompetitorRow = () => {
    if (!editingItem) return;
    setEditingItem({
      ...editingItem,
      competitors: [
        ...editingItem.competitors,
        {
          country: "BG",
          competitorName: "",
          priceEur: "",
          productUrl: "",
        },
      ],
    });
  };

  const updateCompetitorRow = (index, field, value) => {
    if (!editingItem) return;
    const next = editingItem.competitors.map((c, idx) =>
      idx === index ? { ...c, [field]: value } : c,
    );
    setEditingItem({ ...editingItem, competitors: next });
  };

  const removeCompetitorRow = (index) => {
    if (!editingItem) return;
    setEditingItem({
      ...editingItem,
      competitors: editingItem.competitors.filter((_, idx) => idx !== index),
    });
  };

  const handleSaveProduct = async () => {
    if (!editingItem) return;
    setSavingProduct(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        purchaseCostEur: Number(editingItem.purchaseCostEur || 0),
        extraCostEur: Number(editingItem.extraCostEur || 0),
        desiredNetProfitEur:
          editingItem.desiredNetProfitEur === ""
            ? null
            : Number(editingItem.desiredNetProfitEur),
        qogitaRecommendedPriceEur:
          editingItem.qogitaRecommendedPriceEur === ""
            ? null
            : Number(editingItem.qogitaRecommendedPriceEur),
        manualPrices: {
          BG: editingItem.manualPrices?.BG === "" ? null : Number(editingItem.manualPrices?.BG),
          GR: editingItem.manualPrices?.GR === "" ? null : Number(editingItem.manualPrices?.GR),
          HU: editingItem.manualPrices?.HU === "" ? null : Number(editingItem.manualPrices?.HU),
          RO: editingItem.manualPrices?.RO === "" ? null : Number(editingItem.manualPrices?.RO),
        },
        competitors: editingItem.competitors
          .filter((c) => c.priceEur !== "" && Number(c.priceEur) > 0)
          .map((c) => ({
            country: c.country,
            competitorName: c.competitorName || "",
            priceEur: Number(c.priceEur),
            productUrl: c.productUrl || "",
          })),
      };

      const res = await fetch(`/api/admin/pricing/products/${editingItem.stockId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const updated = data.item;
      setProducts((prev) =>
        prev.map((p) => (p.stockId === updated.stockId ? updated : p)),
      );
      openEditor(updated);
      setNotice("Расчёт цен сохранён и пересчитан на сервере.");
    } catch (err) {
      setError(err.message || "Ошибка сохранения расчёта");
    } finally {
      setSavingProduct(false);
    }
  };

  const handleAutoCalculateAll = async () => {
    setAutoCalculatingAll(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/pricing/auto-calculate", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setNotice(
        `Автоматический расчёт завершён: обновлено и опубликовано ${data.updated ?? data.total ?? 0} товаров.`,
      );
      await loadProducts({ nextOffset: offset, q: searchQuery, status: statusFilter });
    } catch (err) {
      setError(err.message || "Не удалось выполнить автоматический расчёт цен");
    } finally {
      setAutoCalculatingAll(false);
    }
  };

  const handlePublishProduct = async () => {
    if (!editingItem) return;
    setPublishingProduct(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(
        `/api/admin/pricing/products/${editingItem.stockId}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ updateBasePrice: updateBasePriceOnPublish }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setNotice("Рассчитанные цены опубликованы в публичный каталог.");
      loadProducts({ nextOffset: offset, q: searchQuery, status: statusFilter });
    } catch (err) {
      setError(err.message || "Ошибка публикации цен");
    } finally {
      setPublishingProduct(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/pricing/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setSettings(data.settings);
      setNotice("Общие настройки ценообразования сохранены.");
    } catch (err) {
      setError(err.message || "Ошибка сохранения настроек");
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleSupportedCountry = (code) => {
    if (!settings) return;
    const current = Array.isArray(settings.supportedCountries)
      ? settings.supportedCountries
      : ["BG", "GR", "HU", "RO"];
    const exists = current.includes(code);
    const next = exists
      ? current.filter((c) => c !== code)
      : [...current, code];
    if (next.length === 0) return;
    setSettings({ ...settings, supportedCountries: next });
  };

  return (
    <div className="privileged__section">
      <div className="privileged__subtabs" style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`privileged__nav-btn ${subTab === "products" ? "privileged__nav-btn--active" : ""}`}
          onClick={() => setSubTab("products")}
        >
          <i className="ri-price-tag-3-line" />
          <span>Товары и расчёт цен</span>
        </button>
        <button
          type="button"
          className={`privileged__nav-btn ${subTab === "settings" ? "privileged__nav-btn--active" : ""}`}
          onClick={() => setSubTab("settings")}
        >
          <i className="ri-settings-4-line" />
          <span>Общие настройки ценообразования</span>
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            borderRadius: "8px",
            background: "rgba(239, 68, 68, 0.14)",
            border: "1px solid rgba(239, 68, 68, 0.45)",
            color: "#fca5a5",
          }}
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            borderRadius: "8px",
            background: "rgba(34, 197, 94, 0.14)",
            border: "1px solid rgba(34, 197, 94, 0.45)",
            color: "#86efac",
          }}
        >
          {notice}
        </div>
      )}

      {subTab === "settings" && settings && (
        <form
          onSubmit={handleSaveSettings}
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(212, 175, 55, 0.25)",
            borderRadius: "12px",
            padding: "1.25rem",
            maxWidth: "780px",
          }}
        >
          <h3 style={{ marginTop: 0, color: "#d4af37" }}>
            Глобальные параметры ценообразования (EUR)
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <span>Целевая скидка от медианы рынка (%)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="80"
                value={settings.targetDiscountPct}
                onChange={(e) =>
                  setSettings({ ...settings, targetDiscountPct: Number(e.target.value) })
                }
                className="privileged__input"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <span>Желаемая чистая прибыль N (€)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={settings.desiredNetProfitEur}
                onChange={(e) =>
                  setSettings({ ...settings, desiredNetProfitEur: Number(e.target.value) })
                }
                className="privileged__input"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <span>Корпоративный налог T (%)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="80"
                value={settings.corporateTaxPct}
                onChange={(e) =>
                  setSettings({ ...settings, corporateTaxPct: Number(e.target.value) })
                }
                className="privileged__input"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <span>Комиссия платёжной системы F (%)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="50"
                value={settings.paymentFeePct}
                onChange={(e) =>
                  setSettings({ ...settings, paymentFeePct: Number(e.target.value) })
                }
                className="privileged__input"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <span>Правило округления</span>
              <select
                value={settings.roundingMode}
                onChange={(e) => setSettings({ ...settings, roundingMode: e.target.value })}
                className="privileged__input"
              >
                <option value="psych_99">Психологическое до .99 (не ниже Pmin)</option>
                <option value="ceil_99">Вверх до .99</option>
                <option value="none">Без округления (.00)</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <span>Режим НДС</span>
              <select
                value={settings.vatMode}
                onChange={(e) => setSettings({ ...settings, vatMode: e.target.value })}
                className="privileged__input"
              >
                <option value="standard">Стандартный режим (без авто-освобождения)</option>
                <option value="oss">EU OSS (по стране покупателя)</option>
                <option value="reverse_charge">Reverse Charge (B2B)</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={Boolean(settings.fallbackToGlobalMarket)}
                onChange={(e) =>
                  setSettings({ ...settings, fallbackToGlobalMarket: e.target.checked })
                }
              />
              <span>
                Использовать общее среднее по 5 продавцам, если по стране нет локальных данных
              </span>
            </label>

            <div>
              <div style={{ marginBottom: "0.4rem", opacity: 0.85 }}>Поддерживаемые страны:</div>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {["BG", "GR", "HU", "RO"].map((code) => (
                  <label key={code} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <input
                      type="checkbox"
                      checked={(settings.supportedCountries || []).includes(code)}
                      onChange={() => toggleSupportedCountry(code)}
                    />
                    <span>{COUNTRY_LABELS[code]}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: "1.25rem" }}>
            <button type="submit" className="privileged__btn" disabled={savingSettings}>
              {savingSettings ? "Сохранение..." : "Сохранить настройки"}
            </button>
          </div>
        </form>
      )}

      {subTab === "products" && (
        <div>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: "1rem",
            }}
          >
            <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "0.5rem", flex: "1 1 280px" }}>
              <input
                type="text"
                placeholder="Поиск по названию или бренду..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="privileged__input"
                style={{ flex: 1 }}
              />
              <button type="submit" className="privileged__btn" disabled={loading}>
                Найти
              </button>
            </form>

            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="privileged__input"
              style={{ width: "auto", minWidth: "220px" }}
            >
              <option value="all">Все статусы</option>
              <option value="green">Зелёный — Конкурентоспособна</option>
              <option value="yellow">Жёлтый — Недостаточно данных</option>
              <option value="red">Красный — Выше рынка</option>
            </select>

            <button
              type="button"
              className="privileged__btn privileged__btn--primary"
              disabled={autoCalculatingAll || loading}
              onClick={handleAutoCalculateAll}
            >
              {autoCalculatingAll ? "Расчёт цен..." : "⚡ Авторассчёт всех цен"}
            </button>
          </div>

          {editingItem && (
            <div
              style={{
                background: "rgba(20, 16, 12, 0.95)",
                border: "1px solid rgba(212, 175, 55, 0.45)",
                borderRadius: "12px",
                padding: "1.25rem",
                marginBottom: "1.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, color: "#d4af37" }}>
                  {editingItem.name} {editingItem.volume ? `(${editingItem.volume})` : ""}
                </h3>
                <button
                  type="button"
                  className="privileged__btn privileged__btn--secondary"
                  onClick={() => setEditingItem(null)}
                >
                  Закрыть
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(195px, 1fr))",
                  gap: "0.85rem",
                  marginTop: "1rem",
                  alignItems: "end",
                }}
              >
                <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  <span>Закупочная стоимость C (€)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingItem.purchaseCostEur}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, purchaseCostEur: e.target.value })
                    }
                    className="privileged__input"
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  <span>Доп. расходы E (€)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingItem.extraCostEur}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, extraCostEur: e.target.value })
                    }
                    className="privileged__input"
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  <span>Индивид. прибыль N (€, опц.)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={settings ? `По умолч. €${settings.desiredNetProfitEur}` : "€5"}
                    value={editingItem.desiredNetProfitEur}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, desiredNetProfitEur: e.target.value })
                    }
                    className="privileged__input"
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  <span>Рекомендуемая цена Qogita (€, опц.)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Если нет цен продавцов"
                    value={editingItem.qogitaRecommendedPriceEur ?? ""}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        qogitaRecommendedPriceEur: e.target.value,
                      })
                    }
                    className="privileged__input"
                  />
                </label>
              </div>

              <div style={{ marginTop: "1.1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", gap: "0.5rem", flexWrap: "wrap" }}>
                  <strong>Цены продавцов (Notino, Douglas, Dubai Perfumery, AromaRay, Arabic Scents)</strong>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" className="privileged__btn" onClick={addTargetSellers}>
                      + 5 продавцов
                    </button>
                    <button type="button" className="privileged__btn" onClick={addCompetitorRow}>
                      + Добавить строку
                    </button>
                  </div>
                </div>

                {editingItem.competitors.length === 0 ? (
                  <p style={{ opacity: 0.7, margin: "0.4rem 0" }}>
                    Конкурентные цены ещё не добавлены.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {editingItem.competitors.map((comp, idx) => (
                      <div
                        key={comp.id || idx}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "170px 1fr 120px 1fr auto",
                          gap: "0.5rem",
                          alignItems: "center",
                        }}
                      >
                        <select
                          value={comp.country}
                          onChange={(e) => updateCompetitorRow(idx, "country", e.target.value)}
                          className="privileged__input"
                        >
                          <option value="BG">Bulgaria (BG)</option>
                          <option value="GR">Greece (GR)</option>
                          <option value="HU">Hungary (HU)</option>
                          <option value="RO">Romania (RO)</option>
                          <option value="GLOBAL">Общий (GLOBAL)</option>
                        </select>

                        <input
                          type="text"
                          placeholder="Магазин / конкурент"
                          value={comp.competitorName || ""}
                          onChange={(e) =>
                            updateCompetitorRow(idx, "competitorName", e.target.value)
                          }
                          className="privileged__input"
                        />

                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="Цена €"
                          value={comp.priceEur}
                          onChange={(e) => updateCompetitorRow(idx, "priceEur", e.target.value)}
                          className="privileged__input"
                        />

                        <input
                          type="url"
                          placeholder="Ссылка (опционально)"
                          value={comp.productUrl || ""}
                          onChange={(e) => updateCompetitorRow(idx, "productUrl", e.target.value)}
                          className="privileged__input"
                        />

                        <button
                          type="button"
                          className="privileged__btn privileged__btn--danger"
                          onClick={() => removeCompetitorRow(idx)}
                          title="Удалить"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: "1.1rem" }}>
                <strong>Расчёт по 4 странам и ручная корректировка</strong>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "0.75rem",
                    marginTop: "0.5rem",
                  }}
                >
                  {Object.entries(editingItem.countries || {}).map(([code, calc]) => {
                    const st = STATUS_META[calc.status] || STATUS_META.yellow;
                    return (
                      <div
                        key={code}
                        style={{
                          padding: "0.75rem",
                          borderRadius: "8px",
                          background: "rgba(255,255,255,0.03)",
                          border: `1px solid ${st.border}`,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                          <strong>{COUNTRY_LABELS[code] || code}</strong>
                          <span style={{ color: st.color, fontSize: "0.78rem" }}>{st.label}</span>
                        </div>
                        <div style={{ fontSize: "0.84rem", lineHeight: 1.5, opacity: 0.9 }}>
                          <div>
                            Среднее ({calc.competitorCount}):{" "}
                            {fmtEur(calc.competitorMeanEur ?? calc.competitorMedianEur)}
                          </div>
                          {calc.usedQogitaRecommended && (
                            <div>Реком. Qogita: {fmtEur(calc.qogitaRecommendedPriceEur)}</div>
                          )}
                          <div>Рыночная: {fmtEur(calc.marketRecommendedEur)}</div>
                          <div>Минимальная Pmin: {fmtEur(calc.minPriceEur)}</div>
                          <div>Авто-цена: <strong>{fmtEur(calc.calculatedPriceEur)}</strong></div>
                          <div>
                            Прибыль: {fmtEur(calc.expectedNetProfitEur)} ({calc.marginPct}%)
                          </div>
                        </div>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", marginTop: "0.5rem", fontSize: "0.82rem" }}>
                          <span>Ручная цена (€, опц.):</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder={String(calc.calculatedPriceEur)}
                            value={editingItem.manualPrices?.[code] ?? ""}
                            onChange={(e) =>
                              setEditingItem({
                                ...editingItem,
                                manualPrices: {
                                  ...editingItem.manualPrices,
                                  [code]: e.target.value,
                                },
                              })
                            }
                            className="privileged__input"
                          />
                        </label>
                        {calc.warnings?.length > 0 && (
                          <div style={{ marginTop: "0.4rem", fontSize: "0.75rem", color: st.color }}>
                            {calc.warnings.join(" • ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginTop: "1.1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  className="privileged__btn"
                  disabled={savingProduct}
                  onClick={handleSaveProduct}
                >
                  {savingProduct ? "Сохранение..." : "Сохранить и пересчитать"}
                </button>

                <button
                  type="button"
                  className="privileged__btn"
                  disabled={publishingProduct}
                  onClick={handlePublishProduct}
                  style={{ background: "linear-gradient(135deg, #d4af37, #b38b1d)", color: "#080605" }}
                >
                  {publishingProduct ? "Публикация..." : "Применить цены в каталог"}
                </button>

                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
                  <input
                    type="checkbox"
                    checked={updateBasePriceOnPublish}
                    onChange={(e) => setUpdateBasePriceOnPublish(e.target.checked)}
                  />
                  <span>Также обновить базовую цену товара (`stocks.price`)</span>
                </label>
              </div>
            </div>
          )}

          {loading ? (
            <p>Загрузка товаров...</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(212,175,55,0.3)", textAlign: "left" }}>
                    {TABLE_COLUMNS.map((col) => (
                      <th key={col.key} style={{ padding: "0.6rem" }}>
                        <span
                          tabIndex={0}
                          title={col.tooltip}
                          className={`privileged__th-tip-wrap ${col.alignRight ? "privileged__th-tip-wrap--right" : ""}`}
                        >
                          <span className="privileged__th-tip-label">{col.label}</span>
                          <span className="privileged__th-tip-icon" aria-hidden="true">?</span>
                          <span className="privileged__th-tip-popup" role="tooltip">
                            {col.tooltip}
                          </span>
                        </span>
                      </th>
                    ))}
                    <th style={{ padding: "0.6rem" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((item) => {
                    const bg = item.countries?.BG || {};
                    const st = STATUS_META[item.overallStatus] || STATUS_META.yellow;
                    return (
                      <tr
                        key={item.stockId}
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <td style={{ padding: "0.6rem" }}>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          <div style={{ opacity: 0.7, fontSize: "0.78rem" }}>
                            {item.brand} {item.volume ? `• ${item.volume}` : ""} • Каталог: {fmtEur(item.currentCatalogPriceEur)}
                          </div>
                        </td>
                        <td style={{ padding: "0.6rem" }}>{fmtEur(item.purchaseCostEur)}</td>
                        <td style={{ padding: "0.6rem" }}>{fmtEur(item.extraCostEur)}</td>
                        <td style={{ padding: "0.6rem" }}>
                          {fmtEur(bg.competitorMedianEur)} ({item.competitors?.length || 0})
                        </td>
                        <td style={{ padding: "0.6rem" }}>{fmtEur(bg.minPriceEur)}</td>
                        <td style={{ padding: "0.6rem", whiteSpace: "nowrap" }}>
                          {["BG", "GR", "HU", "RO"]
                            .map((c) => `${c}: ${fmtEur(item.recommendedPrices?.[c])}`)
                            .join(" | ")}
                        </td>
                        <td style={{ padding: "0.6rem" }}>
                          {fmtEur(bg.expectedNetProfitEur)} ({bg.marginPct ?? 0}%)
                        </td>
                        <td style={{ padding: "0.6rem" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "6px",
                              fontSize: "0.76rem",
                              color: st.color,
                              background: st.bg,
                              border: `1px solid ${st.border}`,
                            }}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding: "0.6rem" }}>
                          <button
                            type="button"
                            className="privileged__btn"
                            onClick={() => openEditor(item)}
                          >
                            Настроить
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
            <span style={{ opacity: 0.75, fontSize: "0.85rem" }}>
              Показано {products.length} из {total}
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="privileged__btn"
                disabled={offset === 0 || loading}
                onClick={() => loadProducts({ nextOffset: Math.max(0, offset - limit) })}
              >
                Назад
              </button>
              <button
                type="button"
                className="privileged__btn"
                disabled={offset + limit >= total || loading}
                onClick={() => loadProducts({ nextOffset: offset + limit })}
              >
                Далее
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
