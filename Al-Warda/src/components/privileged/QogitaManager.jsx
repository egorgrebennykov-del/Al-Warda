import { useState, useEffect, useMemo } from "react";
import "./QogitaManager.css";

export default function QogitaManager({ language = "ru" }) {
  const isRu = language === "ru";
  const [activeTab, setActiveTab] = useState("catalog"); // "catalog" | "live"
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterText, setFilterText] = useState("");
  const [onlyVisible, setOnlyVisible] = useState(true);

  // Live Aromadeal search state
  const [liveQuery, setLiveQuery] = useState("");
  const [liveResults, setLiveResults] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");

  const loadOverview = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/aromadeal/overview", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setOverview(data);
    } catch (err) {
      setError(err.message || (isRu ? "Не удалось загрузить данные Aromadeal" : "Failed to load Aromadeal data"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const handleLiveSearch = async (e) => {
    e?.preventDefault?.();
    const q = liveQuery.trim();
    if (!q) return;
    setLiveLoading(true);
    setLiveError("");
    try {
      const res = await fetch(`/api/admin/aromadeal/search?q=${encodeURIComponent(q)}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setLiveResults(Array.isArray(data.products) ? data.products : []);
    } catch (err) {
      setLiveError(err.message || (isRu ? "Ошибка поиска на Aromadeal" : "Aromadeal search error"));
    } finally {
      setLiveLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const items = overview?.items || [];
    const q = filterText.trim().toLowerCase();
    return items.filter((item) => {
      if (onlyVisible && (!item.inStock || !item.imageReady)) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        String(item.id).includes(q) ||
        (item.sku || "").toLowerCase().includes(q)
      );
    });
  }, [overview, filterText, onlyVisible]);

  const stats = overview?.stats || {};
  const lastSyncStr = stats.lastUpdatedAt
    ? new Date(stats.lastUpdatedAt).toLocaleString(isRu ? "ru-RU" : "en-US")
    : "—";

  return (
    <div className="qogita-manager">
      <div className="qogita-header">
        <div className="qogita-header-title">
          <i className="ri-store-3-line" style={{ fontSize: "1.5rem", color: "#d4af37" }} />
          <div>
            <h2>Aromadeal</h2>
            <div style={{ fontSize: "0.82rem", color: "#a89882", marginTop: 2 }}>
              {isRu
                ? "Основной поставщик • aromadeal.de • Без оптового минимума (от 1 шт.)"
                : "Primary Supplier • aromadeal.de • No Wholesale Minimum (1 pc MOQ)"}
            </div>
          </div>
          <span className="qogita-badge qogita-badge--connected">
            <i className="ri-checkbox-circle-line" />
            {isRu ? "Подключён" : "Connected"}
          </span>
        </div>

        <div className="qogita-header-actions">
          <a
            href="https://aromadeal.de/"
            target="_blank"
            rel="noopener noreferrer"
            className="privileged__btn privileged__btn--secondary"
            style={{ textDecoration: "none" }}
          >
            <i className="ri-external-link-line" />
            {isRu ? "Открыть aromadeal.de" : "Open aromadeal.de"}
          </a>
          <button
            type="button"
            className="privileged__btn privileged__btn--primary"
            onClick={loadOverview}
            disabled={loading}
          >
            <i className="ri-refresh-line" />
            {loading ? (isRu ? "Обновление..." : "Refreshing...") : (isRu ? "Обновить" : "Refresh")}
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.85rem",
        }}
      >
        <div className="qogita-card" style={{ padding: "1rem 1.2rem" }}>
          <div style={{ fontSize: "0.78rem", color: "#a89882" }}>
            {isRu ? "Активно на сайте" : "Visible on Site"}
          </div>
          <div style={{ fontSize: "1.45rem", fontWeight: 700, color: "#d4af37", marginTop: 4 }}>
            {stats.availableOnSite ?? "—"}
          </div>
        </div>
        <div className="qogita-card" style={{ padding: "1rem 1.2rem" }}>
          <div style={{ fontSize: "0.78rem", color: "#a89882" }}>
            {isRu ? "Синхронизировано с Aromadeal" : "Matched on Aromadeal"}
          </div>
          <div style={{ fontSize: "1.45rem", fontWeight: 700, color: "#fff", marginTop: 4 }}>
            {stats.matchedCount ?? "—"}
          </div>
        </div>
        <div className="qogita-card" style={{ padding: "1rem 1.2rem" }}>
          <div style={{ fontSize: "0.78rem", color: "#a89882" }}>
            {isRu ? "Всего позиций в базе" : "Total DB Rows"}
          </div>
          <div style={{ fontSize: "1.45rem", fontWeight: 700, color: "#fff", marginTop: 4 }}>
            {stats.totalStocks ?? "—"}
          </div>
        </div>
        <div className="qogita-card" style={{ padding: "1rem 1.2rem" }}>
          <div style={{ fontSize: "0.78rem", color: "#a89882" }}>
            {isRu ? "Последняя синхронизация" : "Last Sync"}
          </div>
          <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#e5dccb", marginTop: 8 }}>
            {lastSyncStr}
          </div>
        </div>
      </div>

      {error && (
        <div className="qogita-alert qogita-alert--error">
          <i className="ri-error-warning-line" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="qogita-nav-tabs">
        <button
          type="button"
          className={`qogita-nav-tab ${activeTab === "catalog" ? "qogita-nav-tab--active" : ""}`}
          onClick={() => setActiveTab("catalog")}
        >
          <i className="ri-list-check-2" />
          {isRu ? `Товары поставщика (${filteredItems.length})` : `Synced Products (${filteredItems.length})`}
        </button>
        <button
          type="button"
          className={`qogita-nav-tab ${activeTab === "live" ? "qogita-nav-tab--active" : ""}`}
          onClick={() => setActiveTab("live")}
        >
          <i className="ri-search-eye-line" />
          {isRu ? "Живой поиск на aromadeal.de" : "Live Search on aromadeal.de"}
        </button>
      </div>

      {activeTab === "catalog" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <input
              type="text"
              className="privileged__input"
              style={{ flex: "1 1 260px", maxWidth: 420 }}
              placeholder={isRu ? "Поиск по названию, бренду, ID или SKU..." : "Search by name, brand, ID, or SKU..."}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", color: "#d8ccb8", fontSize: "0.88rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={onlyVisible}
                onChange={(e) => setOnlyVisible(e.target.checked)}
              />
              {isRu ? "Только активные на сайте" : "Only visible on site"}
            </label>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="privileged__table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.65rem" }}>ID</th>
                  <th style={{ textAlign: "left", padding: "0.65rem" }}>{isRu ? "Товар" : "Product"}</th>
                  <th style={{ textAlign: "left", padding: "0.65rem" }}>{isRu ? "Бренд" : "Brand"}</th>
                  <th style={{ textAlign: "right", padding: "0.65rem" }}>{isRu ? "Цена Aromadeal" : "Aromadeal Price"}</th>
                  <th style={{ textAlign: "center", padding: "0.65rem" }}>{isRu ? "Наличие" : "Stock"}</th>
                  <th style={{ textAlign: "right", padding: "0.65rem" }}>{isRu ? "Ссылка" : "Link"}</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.slice(0, 150).map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    <td style={{ padding: "0.6rem 0.65rem", color: "#a89882", fontSize: "0.84rem" }}>#{item.id}</td>
                    <td style={{ padding: "0.6rem 0.65rem", color: "#f3eadb", fontSize: "0.88rem" }}>{item.name}</td>
                    <td style={{ padding: "0.6rem 0.65rem", color: "#c9bba6", fontSize: "0.84rem" }}>{item.brand}</td>
                    <td style={{ padding: "0.6rem 0.65rem", textAlign: "right", color: "#d4af37", fontWeight: 600 }}>
                      €{item.priceEur.toFixed(2)}
                    </td>
                    <td style={{ padding: "0.6rem 0.65rem", textAlign: "center" }}>
                      <span
                        className={`qogita-badge ${item.availableOnSupplier ? "qogita-badge--connected" : "qogita-badge--disconnected"}`}
                        style={{ fontSize: "0.72rem", padding: "0.15rem 0.55rem" }}
                      >
                        {item.availableOnSupplier ? (isRu ? "В наличии" : "In Stock") : (isRu ? "Нет" : "Out")}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem 0.65rem", textAlign: "right" }}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#d4af37", textDecoration: "none", fontSize: "0.84rem" }}
                      >
                        Aromadeal ↗
                      </a>
                    </td>
                  </tr>
                ))}
                {!loading && filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "#a89882" }}>
                      {isRu ? "Ничего не найдено" : "No matching products"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "live" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <form onSubmit={handleLiveSearch} style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
            <input
              type="text"
              className="privileged__input"
              style={{ flex: "1 1 280px", maxWidth: 460 }}
              placeholder={isRu ? "Например: Lattafa Khamrah или Amouage Interlude..." : "e.g. Lattafa Khamrah or Amouage Interlude..."}
              value={liveQuery}
              onChange={(e) => setLiveQuery(e.target.value)}
            />
            <button type="submit" className="privileged__btn privileged__btn--primary" disabled={liveLoading}>
              <i className="ri-search-line" />
              {liveLoading ? (isRu ? "Поиск..." : "Searching...") : (isRu ? "Искать на aromadeal.de" : "Search aromadeal.de")}
            </button>
          </form>

          {liveError && (
            <div className="qogita-alert qogita-alert--error">
              <i className="ri-error-warning-line" />
              <span>{liveError}</span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "0.9rem" }}>
            {liveResults.map((p) => (
              <div key={p.id} className="qogita-card" style={{ padding: "0.9rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {p.image && (
                  <img
                    src={p.image}
                    alt={p.title}
                    style={{ width: "100%", height: 150, objectFit: "contain", background: "#fff", borderRadius: 8, padding: 6 }}
                  />
                )}
                <div style={{ fontWeight: 600, color: "#f3eadb", fontSize: "0.9rem" }}>{p.title}</div>
                <div style={{ fontSize: "0.8rem", color: "#a89882" }}>{p.vendor}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 6 }}>
                  <span style={{ color: "#d4af37", fontWeight: 700 }}>€{Number(p.price || 0).toFixed(2)}</span>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: "#d4af37", fontSize: "0.82rem", textDecoration: "none" }}>
                    {isRu ? "Открыть ↗" : "Open ↗"}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
