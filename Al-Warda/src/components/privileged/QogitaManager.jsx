import { useState, useEffect } from "react";
import {
  getQogitaStatus,
  configureQogita,
  searchQogitaProducts,
  getQogitaVariantOffers,
  getQogitaCart,
  addQogitaCartItem,
  updateQogitaCartItem,
  deleteQogitaCartItem,
  requestQogitaCatalogDownload,
  getQogitaDownloadStatus,
  getQogitaWebhooks,
  createQogitaWebhook,
  deleteQogitaWebhook,
  sendQogitaTestWebhook,
} from "../../utils/qogitaApi";
import { getQogitaProductUrl } from "../../../utils/qogitaProductUrls";
import "./QogitaManager.css";

const EXPORTS_STORAGE_KEY = "qogita-product-export-ids";

export default function QogitaManager({ language = "ru" }) {
  const [activeTab, setActiveTab] = useState("cart"); // "cart" | "products" | "downloads" | "webhooks" | "config"
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null); // { type: 'success'|'error', message }

  // Config state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Cart state
  const [cartData, setCartData] = useState(null);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartError, setCartError] = useState("");

  // Products & Offers state
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState("");
  const [searchBrand, setSearchBrand] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [variantOffers, setVariantOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);

  // Catalog downloads state
  const [downloads, setDownloads] = useState(() => {
    try {
      const ids = JSON.parse(localStorage.getItem(EXPORTS_STORAGE_KEY) || "[]");
      return Array.isArray(ids)
        ? ids
            .filter((id) => typeof id === "string")
            .map((id) => ({ id, status: "pending" }))
        : [];
    } catch (error) {
      console.error("Could not read saved Qogita exports:", error);
      return [];
    }
  });
  const [downloadsLoading, setDownloadsLoading] = useState(false);
  const [downloadsError, setDownloadsError] = useState("");

  // Webhooks state
  const [webhooks, setWebhooks] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [webhooksError, setWebhooksError] = useState("");

  // Initial load
  useEffect(() => {
    loadStatus();
    loadCart();
  }, []);

  const showNotice = (message, type = "success") => {
    setNotice({ message, type });
    setTimeout(() => setNotice(null), 5000);
  };

  const loadStatus = async () => {
    try {
      const data = await getQogitaStatus();
      setStatus(data);
      setStatusError("");
      if (!data.isConfigured) setActiveTab("config");
    } catch (err) {
      console.warn("Failed to load Qogita status:", err);
      setStatus(null);
      setStatusError(
        err.status === 404
          ? language === "ru"
            ? "Сервер сайта не поддерживает API панели Qogita."
            : "The site server does not support the Qogita dashboard API."
          : language === "ru"
            ? `Не удалось получить статус Qogita: ${err.message}`
            : `Could not load Qogita status: ${err.message}`,
      );
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await configureQogita({ email, password });
      setStatus(res.status);
      setPassword("");
      setStatusError("");
      setActiveTab("cart");
      showNotice("Авторизация в Qogita прошла успешно!");
      loadCart();
    } catch (err) {
      showNotice(err.message || "Ошибка подключения к Qogita", "error");
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Cart Actions
  // -------------------------------------------------------------
  const loadCart = async () => {
    setCartLoading(true);
    try {
      const data = await getQogitaCart();
      setCartData(data);
      setCartError("");
    } catch (err) {
      console.warn("Failed to load cart:", err);
      setCartData(null);
      setCartError(
        language === "ru"
          ? "Не удалось загрузить корзину через сайт."
          : "Could not load the cart through this site.",
      );
    } finally {
      setCartLoading(false);
    }
  };

  const handleUpdateQty = async (allocationQid, lineQid, currentQty, delta) => {
    const newQty = currentQty + delta;
    if (newQty <= 0) {
      return handleDeleteLine(allocationQid, lineQid);
    }
    try {
      await updateQogitaCartItem({
        allocationQid,
        allocationLineQid: lineQid,
        quantity: newQty,
      });
      loadCart();
      showNotice(`Количество обновлено: ${newQty}`);
    } catch (err) {
      showNotice(err.message || "Ошибка обновления количества", "error");
    }
  };

  const handleDeleteLine = async (allocationQid, lineQid) => {
    try {
      await deleteQogitaCartItem({
        allocationQid,
        allocationLineQid: lineQid,
      });
      loadCart();
      showNotice("Позиция удалена из оптовой корзины");
    } catch (err) {
      showNotice(err.message || "Ошибка удаления позиции", "error");
    }
  };

  const handleAddToCart = async (offerQid, quantity = 1) => {
    try {
      await addQogitaCartItem(offerQid, quantity);
      showNotice("Товар успешно добавлен в B2B корзину!");
      loadCart();
    } catch (err) {
      showNotice(err.message || "Ошибка добавления товара", "error");
    }
  };

  // -------------------------------------------------------------
  // Search & Offers
  // -------------------------------------------------------------
  const handleSearchProducts = async (e) => {
    if (e) e.preventDefault();
    setProductsLoading(true);
    try {
      const res = await searchQogitaProducts({
        categoryName: searchCategory || undefined,
        brandName: searchBrand || searchQuery || undefined,
        stockAvailability: inStockOnly ? "in_stock" : undefined,
        page_size: 24,
      });
      setProducts(res.results || []);
    } catch (err) {
      showNotice(err.message || "Ошибка поиска товаров", "error");
    } finally {
      setProductsLoading(false);
    }
  };

  const handleViewOffers = async (variant, productName, productImg = null) => {
    setSelectedVariant({ ...variant, productName, productImg });
    setOffersLoading(true);
    try {
      const res = await getQogitaVariantOffers(variant.fid);
      setVariantOffers(
        res.offers || res.results || (Array.isArray(res) ? res : []),
      );
    } catch (err) {
      showNotice(err.message || "Не удалось загрузить предложения", "error");
      setVariantOffers([]);
    } finally {
      setOffersLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Catalog Downloads
  // -------------------------------------------------------------
  const loadDownloads = async (jobs = downloads) => {
    setDownloadsLoading(true);
    try {
      const results = await Promise.all(
        jobs.map((job) => getQogitaDownloadStatus(job.id)),
      );
      setDownloads(results);
      setDownloadsError("");
    } catch (err) {
      console.warn("Failed to load downloads:", err);
      setDownloadsError(err.message);
    } finally {
      setDownloadsLoading(false);
    }
  };

  const handleRequestDownload = async () => {
    setDownloadsLoading(true);
    try {
      const res = await requestQogitaCatalogDownload({});
      const job = res.result;
      if (!job?.id) throw new Error("Qogita не вернула идентификатор выгрузки");
      const jobs = [job, ...downloads.filter((item) => item.id !== job.id)];
      localStorage.setItem(
        EXPORTS_STORAGE_KEY,
        JSON.stringify(jobs.map((item) => item.id)),
      );
      setDownloads(jobs);
      setDownloadsError("");
      showNotice("Выгрузка каталога запущена");
    } catch (err) {
      showNotice(err.message || "Ошибка запроса выгрузки", "error");
    } finally {
      setDownloadsLoading(false);
    }
  };

  useEffect(() => {
    if (
      activeTab !== "downloads" ||
      downloadsLoading ||
      downloadsError ||
      !downloads.some(
        (job) => job.status === "pending" || job.status === "processing",
      )
    )
      return;
    const timer = setTimeout(() => loadDownloads(), 10000);
    return () => clearTimeout(timer);
  }, [activeTab, downloads, downloadsLoading, downloadsError]);

  // -------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------
  const loadWebhooks = async () => {
    setWebhooksLoading(true);
    try {
      const res = await getQogitaWebhooks();
      setWebhooks(res.results || []);
      setWebhooksError("");
    } catch (err) {
      console.warn("Failed to load webhooks:", err);
      setWebhooksError(err.message);
    } finally {
      setWebhooksLoading(false);
    }
  };

  const handleCreateWebhook = async (e) => {
    e.preventDefault();
    if (!webhookUrl) return;
    try {
      const res = await createQogitaWebhook({
        url: webhookUrl,
        eventTypes: ["catalog_download.completed", "catalog_download.failed"],
        description: "Al-Warda wholesale webhook delivery",
      });
      showNotice(
        `Вебхук создан! Секрет подписи: ${res.signingSecret || "сохранен"}`,
      );
      setWebhookUrl("");
      loadWebhooks();
    } catch (err) {
      showNotice(err.message || "Ошибка создания вебхука", "error");
    }
  };

  const handleDeleteWebhook = async (qid) => {
    try {
      await deleteQogitaWebhook(qid);
      showNotice("Вебхук удален");
      loadWebhooks();
    } catch (err) {
      showNotice(err.message || "Ошибка удаления вебхука", "error");
    }
  };

  const handleSendTestWebhook = async () => {
    try {
      await sendQogitaTestWebhook();
      showNotice("Тестовое событие отправлено на вебхук endpoints!");
      loadStatus();
    } catch (err) {
      showNotice(err.message || "Ошибка отправки тестового события", "error");
    }
  };

  return (
    <div className="qogita-manager">
      {/* Notice alert */}
      {notice && (
        <div
          style={{
            padding: "0.85rem 1.25rem",
            borderRadius: "8px",
            background:
              notice.type === "error"
                ? "rgba(231, 76, 60, 0.2)"
                : "rgba(39, 174, 96, 0.2)",
            border: `1px solid ${notice.type === "error" ? "#e74c3c" : "#2ecc71"}`,
            color: notice.type === "error" ? "#ff7675" : "#2ecc71",
            fontWeight: 500,
          }}
        >
          {notice.message}
        </div>
      )}

      {/* Header Bar */}
      <div className="qogita-header">
        <div className="qogita-header-title">
          <i
            className="ri-shopping-bag-3-fill"
            style={{ fontSize: "1.75rem", color: "#d4af37" }}
          />
          <div>
            <h2>Qogita B2B Wholesale Hub</h2>
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--text-color-light, #a0a0ab)",
                marginTop: "2px",
              }}
            >
              API Gateway &bull; {status?.apiUrl || "https://api.qogita.com"}
            </div>
          </div>
          {statusError ? (
            <span className="qogita-badge qogita-badge--disconnected">
              <i className="ri-error-warning-fill" />{" "}
              {language === "ru" ? "API недоступен" : "API unavailable"}
            </span>
          ) : status?.isConfigured ? (
            <span className="qogita-badge qogita-badge--connected">
              <i className="ri-checkbox-circle-fill" /> Подключено (
              {status.email})
            </span>
          ) : status ? (
            <span className="qogita-badge qogita-badge--disconnected">
              <i className="ri-error-warning-fill" /> Требуется настройка
            </span>
          ) : null}
        </div>

        {statusError && <div role="alert">{statusError}</div>}

        <div className="qogita-header-actions">
          <a
            className="qogita-btn qogita-btn--primary qogita-btn--sm"
            href="https://www.qogita.com/categories/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {language === "ru" ? "Каталог Qogita" : "Qogita catalog"}
          </a>
          <a
            className="qogita-btn qogita-btn--secondary qogita-btn--sm"
            href="https://www.qogita.com/cart/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {language === "ru" ? "Корзина Qogita" : "Qogita cart"}
          </a>
          <button
            className="qogita-btn qogita-btn--secondary qogita-btn--sm"
            onClick={() => {
              loadStatus();
              if (activeTab === "cart") loadCart();
              if (activeTab === "products") handleSearchProducts();
              if (activeTab === "downloads") loadDownloads();
              if (activeTab === "webhooks") loadWebhooks();
            }}
          >
            <i className="ri-refresh-line" /> Обновить
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="qogita-nav-tabs">
        <button
          className={`qogita-nav-tab ${activeTab === "cart" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("cart");
            loadCart();
          }}
        >
          <i className="ri-shopping-cart-2-line" /> B2B Корзина & MOV
          {cartData?.cart?.itemsCount ? (
            <span
              style={{
                background: "#d4af37",
                color: "#000",
                fontSize: "0.75rem",
                padding: "2px 6px",
                borderRadius: "10px",
                fontWeight: 700,
              }}
            >
              {cartData.cart.itemsCount}
            </span>
          ) : null}
        </button>

        <button
          className={`qogita-nav-tab ${activeTab === "products" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("products");
            if (products.length === 0) handleSearchProducts();
          }}
        >
          <i className="ri-search-2-line" /> Поиск товаров и офферы
        </button>

        <button
          className={`qogita-nav-tab ${activeTab === "downloads" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("downloads");
            loadDownloads();
          }}
        >
          <i className="ri-download-cloud-2-line" /> Выгрузка каталога
        </button>

        <button
          className={`qogita-nav-tab ${activeTab === "webhooks" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("webhooks");
            loadWebhooks();
          }}
        >
          <i className="ri-broadcast-line" /> Вебхуки & События
        </button>

        <button
          className={`qogita-nav-tab ${activeTab === "config" ? "active" : ""}`}
          onClick={() => setActiveTab("config")}
        >
          <i className="ri-settings-4-line" /> Настройки подключения
        </button>
      </div>

      {/* ---------------------------------------------------------
          TAB 1: Active Cart & MOV Tracking
      --------------------------------------------------------- */}
      {activeTab === "cart" && (
        <div className="qogita-card">
          <div className="qogita-card-header">
            <h3>B2B Оптовая Корзина и Прогресс Минимального Заказа (MOV)</h3>
            <button
              className="qogita-btn qogita-btn--secondary qogita-btn--sm"
              onClick={loadCart}
            >
              <i className="ri-refresh-line" /> Пересчитать
            </button>
          </div>

          {cartLoading ? (
            <div className="qogita-empty-state">
              <i
                className="ri-loader-4-line ri-spin"
                style={{ fontSize: "2rem" }}
              />
              <p>Загрузка корзины и распределений Qogita...</p>
            </div>
          ) : cartError ? (
            <div className="qogita-empty-state" role="alert">
              <p>{cartError}</p>
              <a
                className="qogita-btn qogita-btn--primary"
                href="https://www.qogita.com/cart/"
                target="_blank"
                rel="noopener noreferrer"
              >
                {language === "ru"
                  ? "Открыть корзину в Qogita"
                  : "Open cart in Qogita"}
              </a>
            </div>
          ) : !cartData?.cart ||
            (cartData?.allocations?.length === 0 &&
              !(
                cartData?.cart?.cartlinesCount ?? cartData?.cart?.linesCount
              )) ? (
            <div className="qogita-empty-state">
              <i
                className="ri-shopping-cart-line"
                style={{ fontSize: "2.5rem", color: "#d4af37" }}
              />
              <h4>Оптовая корзина пуста</h4>
              <p>
                Используйте вкладку "Поиск товаров и офферы", чтобы добавить
                парфюмерию от поставщиков.
              </p>
              <button
                className="qogita-btn qogita-btn--primary"
                onClick={() => {
                  setActiveTab("products");
                  handleSearchProducts();
                }}
                style={{ marginTop: "1rem" }}
              >
                <i className="ri-search-line" /> Найти парфюмерию
              </button>
            </div>
          ) : (
            <div>
              {/* Overall Cart Statistics */}
              <div className="qogita-cart-summary">
                <div className="qogita-stat-box">
                  <span className="label">Общая сумма заказа</span>
                  <span className="value">
                    {cartData.cart?.estimatedTotal?.amount ??
                      cartData.cart?.subtotal?.amount ??
                      cartData.cart?.totalAmount}{" "}
                    {cartData.cart?.estimatedTotal?.currency ||
                      cartData.cart?.subtotal?.currency ||
                      cartData.cart?.currency ||
                      "EUR"}
                  </span>
                </div>
                <div className="qogita-stat-box">
                  <span className="label">Позиций / Единиц</span>
                  <span className="value">
                    {cartData.cart?.cartlinesCount ??
                      cartData.cart?.linesCount ??
                      0}{" "}
                    /{" "}
                    {cartData.cart?.quantity ?? cartData.cart?.itemsCount ?? 0}
                  </span>
                </div>
                <div className="qogita-stat-box">
                  <span className="label">Поставщиков (Аллокаций)</span>
                  <span className="value">
                    {cartData.allocations?.length || 0}
                  </span>
                </div>
              </div>

              {/* Allocations breakdown with MOV */}
              {cartData.allocations?.map((alloc) => {
                const total = parseFloat(
                  alloc.subtotal?.amount ??
                    alloc.totalAmount?.amount ??
                    alloc.totalAmount ??
                    0,
                );
                const mov = parseFloat(
                  alloc.mov?.amount ??
                    alloc.minimumOrderValue?.amount ??
                    alloc.minimumOrderValue ??
                    0,
                );
                const currency =
                  alloc.subtotal?.currency ||
                  alloc.mov?.currency ||
                  alloc.totalAmount?.currency ||
                  alloc.minimumOrderValue?.currency ||
                  "EUR";
                const isMet =
                  alloc.isMovMet ?? alloc.movMet ?? (mov > 0 && total >= mov);
                const percent =
                  mov > 0
                    ? Math.min(100, Math.round((total / mov) * 100))
                    : 100;
                const remaining =
                  alloc.remainingToMov?.amount ||
                  Math.max(0, mov - total).toFixed(2);

                return (
                  <div
                    key={alloc.qid || alloc.fid}
                    className="qogita-allocation-card"
                  >
                    <div className="qogita-allocation-header">
                      <div className="qogita-supplier-name">
                        <i
                          className="ri-building-line"
                          style={{ marginRight: "6px", color: "#d4af37" }}
                        />
                        Поставщик:{" "}
                        {alloc.supplierAlias ||
                          alloc.supplierName ||
                          "Default Supplier"}
                      </div>
                      <div>
                        {isMet ? (
                          <span className="qogita-badge qogita-badge--connected">
                            <i className="ri-check-line" /> Минимальный заказ
                            выполнен!
                          </span>
                        ) : (
                          <span className="qogita-badge qogita-badge--disconnected">
                            <i className="ri-alert-line" /> Требуется еще{" "}
                            {remaining} {currency} до MOV
                          </span>
                        )}
                      </div>
                    </div>

                    {/* MOV Progress Bar */}
                    <div className="qogita-mov-progress">
                      <div className="qogita-mov-labels">
                        <span>
                          Заказано:{" "}
                          <strong>
                            {total.toFixed(2)} {currency}
                          </strong>
                        </span>
                        <span>
                          Минимум (MOV):{" "}
                          <strong>
                            {mov.toFixed(2)} {currency}
                          </strong>{" "}
                          ({percent}%)
                        </span>
                      </div>
                      <div className="qogita-progress-track">
                        <div
                          className={`qogita-progress-bar ${
                            isMet
                              ? "qogita-progress-bar--met"
                              : "qogita-progress-bar--pending"
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>

                    {alloc.linesError && (
                      <p role="alert">
                        Не удалось загрузить товары поставщика:{" "}
                        {alloc.linesError}
                      </p>
                    )}
                    {/* Allocation Lines Table */}
                    <div className="qogita-table-container">
                      <table className="qogita-table">
                        <thead>
                          <tr>
                            <th>Товар / Вариант</th>
                            <th>Цена за ед.</th>
                            <th style={{ textAlign: "center" }}>Количество</th>
                            <th>Итого</th>
                            <th>Действие</th>
                          </tr>
                        </thead>
                        <tbody>
                          {alloc.lines?.map((line) => (
                            <tr key={line.qid || line.fid}>
                              <td>
                                <div style={{ fontWeight: 600 }}>
                                  {line.productName ||
                                    line.product?.name ||
                                    line.variant?.name ||
                                    "Товар"}
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.8rem",
                                    color: "var(--text-color-light, #a0a0ab)",
                                  }}
                                >
                                  {line.variantName ||
                                    line.variant?.name ||
                                    "Стандарт"}{" "}
                                  &bull; Оффер: {line.offerQid?.slice(0, 8)}...
                                </div>
                              </td>
                              <td>
                                {line.activeTierPrice?.amount ??
                                  line.unitPrice?.amount ??
                                  line.unitPrice}{" "}
                                {line.activeTierPrice?.currency ||
                                  line.unitPrice?.currency ||
                                  currency}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <div className="qogita-qty-control">
                                  <button
                                    className="qogita-qty-btn"
                                    onClick={() =>
                                      handleUpdateQty(
                                        alloc.qid,
                                        line.qid,
                                        line.quantity,
                                        -1,
                                      )
                                    }
                                  >
                                    -
                                  </button>
                                  <span
                                    style={{
                                      fontWeight: 600,
                                      minWidth: "24px",
                                      textAlign: "center",
                                    }}
                                  >
                                    {line.quantity}
                                  </span>
                                  <button
                                    className="qogita-qty-btn"
                                    onClick={() =>
                                      handleUpdateQty(
                                        alloc.qid,
                                        line.qid,
                                        line.quantity,
                                        1,
                                      )
                                    }
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td style={{ fontWeight: 600 }}>
                                {line.activeTierSubtotal?.amount ??
                                  line.subtotal?.amount ??
                                  line.totalPrice?.amount ??
                                  line.totalPrice ??
                                  "—"}{" "}
                                {line.activeTierSubtotal?.currency ||
                                  line.subtotal?.currency ||
                                  line.totalPrice?.currency ||
                                  currency}
                              </td>
                              <td>
                                <button
                                  className="qogita-btn qogita-btn--danger qogita-btn--sm"
                                  onClick={() =>
                                    handleDeleteLine(alloc.qid, line.qid)
                                  }
                                >
                                  <i className="ri-delete-bin-line" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------
          TAB 2: Products & Offers Search
      --------------------------------------------------------- */}
      {activeTab === "products" && (
        <div className="qogita-card">
          <div className="qogita-card-header">
            <h3>Поиск товаров в оптовом каталоге Qogita</h3>
          </div>

          <form onSubmit={handleSearchProducts} className="qogita-search-bar">
            <input
              type="text"
              placeholder="Поиск по бренду или названию (Dior, Creed, Tom Ford...)"
              className="qogita-input"
              style={{ flex: 1, minWidth: "240px" }}
              value={searchBrand}
              onChange={(e) => setSearchBrand(e.target.value)}
            />
            <input
              type="text"
              placeholder="Категория (Fragrances, Health & Beauty)"
              className="qogita-input"
              style={{ width: "180px" }}
              value={searchCategory}
              onChange={(e) => setSearchCategory(e.target.value)}
            />
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                color: "#fff",
                fontSize: "0.85rem",
              }}
            >
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
              />
              Только в наличии
            </label>
            <button
              type="submit"
              className="qogita-btn qogita-btn--primary"
              disabled={productsLoading}
            >
              {productsLoading ? (
                <i className="ri-loader-4-line ri-spin" />
              ) : (
                <i className="ri-search-line" />
              )}{" "}
              Искать
            </button>
          </form>

          {productsLoading ? (
            <div className="qogita-empty-state">
              <i
                className="ri-loader-4-line ri-spin"
                style={{ fontSize: "2rem" }}
              />
              <p>Поиск предложений в сети Qogita...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="qogita-empty-state">
              <p>
                Товаров не найдено. Нажмите "Искать", чтобы загрузить
                предложения из оптового каталога.
              </p>
            </div>
          ) : (
            <div className="qogita-products-grid">
              {products.map((item) => {
                const variants = item.variants || [];
                const lowest = variants[0]?.lowestOfferPrice || item.price;
                const itemImg =
                  item.imageUrl ||
                  item.image ||
                  variants[0]?.imageUrl ||
                  variants[0]?.image;
                const brand = item.brand || item.brandName || "Luxury";
                const category =
                  item.category || item.categoryName || "Fragrances";

                return (
                  <div
                    key={item.qid || item.gtin || item.name}
                    className="qogita-product-card"
                  >
                    {/* Product Photo */}
                    <div className="qogita-product-img-wrap">
                      {itemImg ? (
                        <img
                          src={itemImg}
                          alt={item.name}
                          className="qogita-product-img"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            if (e.currentTarget.nextElementSibling) {
                              e.currentTarget.nextElementSibling.style.display =
                                "flex";
                            }
                          }}
                        />
                      ) : null}
                      <div
                        className="qogita-product-placeholder"
                        style={{ display: itemImg ? "none" : "flex" }}
                      >
                        <i className="ri-flask-line" />
                      </div>
                    </div>

                    <span className="qogita-product-brand">{brand}</span>
                    <h4 className="qogita-product-title">{item.name}</h4>
                    <div className="qogita-product-meta">
                      <span>Категория: {category}</span>
                      {item.gtin && <span>Штрихкод (GTIN): {item.gtin}</span>}
                      {item.inventory !== undefined && (
                        <span>Склад: {item.inventory} шт.</span>
                      )}
                    </div>

                    <div style={{ marginTop: "auto" }}>
                      {lowest && (
                        <div
                          style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}
                        >
                          От:{" "}
                          <strong style={{ color: "#2ecc71" }}>
                            {lowest.amount} {lowest.currency}
                          </strong>
                        </div>
                      )}

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.4rem",
                        }}
                      >
                        {variants.length > 0 ? (
                          <>
                            {variants.map((v) => (
                              <button
                                key={v.fid || v.name}
                                className="qogita-btn qogita-btn--secondary qogita-btn--sm"
                                onClick={() =>
                                  handleViewOffers(v, item.name, itemImg)
                                }
                                style={{ justifyContent: "space-between" }}
                              >
                                <span>{v.name || "Объем"}</span>
                                <span style={{ color: "#d4af37" }}>
                                  {v.lowestOfferPrice
                                    ? `${v.lowestOfferPrice.amount} ${v.lowestOfferPrice.currency}`
                                    : "Офферы"}{" "}
                                  &rarr;
                                </span>
                              </button>
                            ))}
                            <a
                              className="qogita-btn qogita-btn--secondary qogita-btn--sm"
                              href={getQogitaProductUrl(item)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                marginTop: "0.25rem",
                                justifyContent: "center",
                              }}
                            >
                              <i className="ri-external-link-line" />{" "}
                              {language === "ru"
                                ? "Товар на сайте Qogita ↗"
                                : "View on Qogita ↗"}
                            </a>
                          </>
                        ) : (
                          <a
                            className="qogita-btn qogita-btn--secondary qogita-btn--sm"
                            href={getQogitaProductUrl(item)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ justifyContent: "center" }}
                          >
                            <i className="ri-external-link-line" />{" "}
                            {language === "ru"
                              ? "Открыть товар в Qogita ↗"
                              : "Open product in Qogita ↗"}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal / Panel for Variant Offers */}
          {selectedVariant && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.75)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                padding: "1rem",
              }}
              onClick={() => setSelectedVariant(null)}
            >
              <div
                style={{
                  background: "#1c1c28",
                  border: "1px solid rgba(255, 215, 0, 0.2)",
                  borderRadius: "12px",
                  maxWidth: "650px",
                  width: "100%",
                  maxHeight: "85vh",
                  overflowY: "auto",
                  padding: "1.5rem",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.85rem",
                    }}
                  >
                    {selectedVariant.productImg && (
                      <div
                        style={{
                          width: "56px",
                          height: "56px",
                          minWidth: "56px",
                          borderRadius: "8px",
                          background: "rgba(0,0,0,0.35)",
                          border: "1px solid rgba(212, 175, 55, 0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "4px",
                          overflow: "hidden",
                        }}
                      >
                        <img
                          src={selectedVariant.productImg}
                          alt={selectedVariant.productName}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                          }}
                        />
                      </div>
                    )}
                    <div>
                      <h3 style={{ margin: 0, color: "#fff" }}>
                        {selectedVariant.productName}
                      </h3>
                      <div style={{ color: "#d4af37", fontSize: "0.9rem" }}>
                        Вариант: {selectedVariant.name}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <a
                      className="qogita-btn qogita-btn--primary qogita-btn--sm"
                      href={getQogitaProductUrl({
                        ...selectedVariant,
                        name: selectedVariant.productName,
                        gtin: selectedVariant.gtin,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={
                        language === "ru"
                          ? "Открыть товар в Qogita"
                          : "Open product in Qogita"
                      }
                    >
                      <i className="ri-external-link-line" />{" "}
                      {language === "ru" ? "В Qogita ↗" : "On Qogita ↗"}
                    </a>
                    <button
                      className="qogita-btn qogita-btn--secondary qogita-btn--sm"
                      onClick={() => setSelectedVariant(null)}
                    >
                      <i className="ri-close-line" />
                    </button>
                  </div>
                </div>

                {offersLoading ? (
                  <div className="qogita-empty-state">
                    <i
                      className="ri-loader-4-line ri-spin"
                      style={{ fontSize: "2rem" }}
                    />
                    <p>Загрузка предложений от поставщиков...</p>
                  </div>
                ) : variantOffers.length === 0 ? (
                  <div className="qogita-empty-state">
                    <p>Нет доступных предложений для этого варианта.</p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    {variantOffers.map((offer) => {
                      const tiered = Array.isArray(offer.tieredPrices)
                        ? offer.tieredPrices
                        : [];
                      const tier500 =
                        tiered.find(
                          (t) => parseFloat(t.tierMov?.amount || 0) <= 500,
                        ) || tiered[tiered.length - 1];
                      const displayPrice =
                        tier500?.tierPrice?.amount ||
                        offer.price?.amount ||
                        "—";
                      const displayCurrency =
                        tier500?.tierPrice?.currency ||
                        offer.price?.currency ||
                        "EUR";
                      const sellerName =
                        offer.seller ||
                        offer.supplierAlias ||
                        "Qogita Supplier";
                      const qty =
                        offer.inventory ?? offer.quantityAvailable ?? 0;

                      return (
                        <div
                          key={offer.qid}
                          className="qogita-offer-row"
                          style={{
                            flexDirection: "column",
                            alignItems: "stretch",
                            gap: "0.5rem",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600 }}>
                                Поставщик: {sellerName}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.78rem",
                                  color: "var(--text-color-light, #a0a0ab)",
                                }}
                              >
                                В наличии: {qty} шт. &bull; Мин. партия:{" "}
                                {offer.unit || offer.minimumOrderQuantity || 1}{" "}
                                шт.
                                {offer.leadTimeDays
                                  ? ` &bull; Доставка: ${offer.leadTimeDays} дн.`
                                  : ""}
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "1rem",
                              }}
                            >
                              <span
                                className="qogita-offer-price"
                                title="Цена на минимальную закупку (MOV ≤ €500)"
                              >
                                {displayPrice} {displayCurrency}
                              </span>
                              <button
                                className="qogita-btn qogita-btn--primary qogita-btn--sm"
                                onClick={() =>
                                  handleAddToCart(
                                    offer.qid,
                                    offer.unit ||
                                      offer.minimumOrderQuantity ||
                                      1,
                                  )
                                }
                              >
                                <i className="ri-add-line" /> В корзину
                              </button>
                            </div>
                          </div>

                          {tiered.length > 0 && (
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "0.4rem",
                                paddingTop: "0.3rem",
                                borderTop:
                                  "1px solid rgba(255, 255, 255, 0.06)",
                                fontSize: "0.74rem",
                              }}
                            >
                              {tiered.map((t, tidx) => {
                                const movAmt = parseFloat(
                                  t.tierMov?.amount || 0,
                                );
                                const isCurrentTier = movAmt <= 500;
                                return (
                                  <span
                                    key={tidx}
                                    style={{
                                      padding: "2px 6px",
                                      borderRadius: "4px",
                                      background: isCurrentTier
                                        ? "rgba(46, 204, 113, 0.15)"
                                        : "rgba(255, 255, 255, 0.05)",
                                      color: isCurrentTier
                                        ? "#2ecc71"
                                        : "#a0a0ab",
                                      border: isCurrentTier
                                        ? "1px solid rgba(46, 204, 113, 0.4)"
                                        : "1px solid transparent",
                                    }}
                                  >
                                    MOV €{movAmt.toLocaleString()}:{" "}
                                    <strong>
                                      {t.tierPrice?.amount}{" "}
                                      {t.tierPrice?.currency || "EUR"}
                                    </strong>
                                    {isCurrentTier && " ★"}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------
          TAB 3: Catalog Downloads
      --------------------------------------------------------- */}
      {activeTab === "downloads" && (
        <div className="qogita-card">
          <div className="qogita-card-header">
            <h3>Асинхронная выгрузка полного каталога Qogita</h3>
            <button
              className="qogita-btn qogita-btn--primary qogita-btn--sm"
              onClick={handleRequestDownload}
              disabled={downloadsLoading}
            >
              <i className="ri-download-line" /> Запросить выгрузку каталога
            </button>
          </div>

          <p
            style={{
              fontSize: "0.9rem",
              color: "var(--text-color-light, #a0a0ab)",
              marginBottom: "1.25rem",
            }}
          >
            Выгрузка формирует каталог товаров в формате CSV. Статус обновляется
            каждые 10 секунд; ссылка на скачивание действует один час.
          </p>

          {downloadsError && (
            <div role="alert">
              <p>Не удалось загрузить список выгрузок: {downloadsError}</p>
              <a
                className="qogita-btn qogita-btn--secondary qogita-btn--sm"
                href="https://www.qogita.com/account/catalog/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Открыть выгрузку каталога в Qogita
              </a>
            </div>
          )}
          <div className="qogita-table-container">
            <table className="qogita-table">
              <thead>
                <tr>
                  <th>ID выгрузки</th>
                  <th>Статус</th>
                  <th>Создан</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {downloads.length === 0 && !downloadsError ? (
                  <tr>
                    <td
                      colSpan="4"
                      style={{ textAlign: "center", padding: "2rem" }}
                    >
                      Нет недавних задач выгрузки. Нажмите "Запросить выгрузку
                      каталога".
                    </td>
                  </tr>
                ) : downloads.length ? (
                  downloads.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <code>{job.id}</code>
                      </td>
                      <td>
                        <span
                          className={`qogita-badge ${
                            job.status === "succeeded"
                              ? "qogita-badge--connected"
                              : "qogita-badge--disconnected"
                          }`}
                        >
                          {job.status}
                        </span>
                        {job.error?.message && (
                          <div role="alert">{job.error.message}</div>
                        )}
                      </td>
                      <td>
                        {job.requested_at
                          ? new Date(job.requested_at).toLocaleString()
                          : "-"}
                      </td>
                      <td>
                        {job.status === "succeeded" && job.download_url ? (
                          <a
                            href={job.download_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="qogita-btn qogita-btn--secondary qogita-btn--sm"
                          >
                            <i className="ri-download-line" /> Скачать файл
                          </a>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.85rem",
                              color: "var(--text-color-light)",
                            }}
                          >
                            {job.status === "failed" ? "Ошибка" : "В обработке"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------
          TAB 4: Webhooks & Event Logger
      --------------------------------------------------------- */}
      {activeTab === "webhooks" && (
        <div className="qogita-card">
          <div className="qogita-card-header">
            <h3>Вебхуки Qogita и Журнал Событий</h3>
            <button
              className="qogita-btn qogita-btn--secondary qogita-btn--sm"
              onClick={handleSendTestWebhook}
            >
              <i className="ri-flashlight-line" /> Отправить тест-событие
            </button>
          </div>

          {/* Create webhook form */}
          <form
            onSubmit={handleCreateWebhook}
            style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}
          >
            <input
              type="url"
              placeholder="HTTPS URL вебхука (напр: https://your-domain.com/api/qogita/webhooks/inbound)"
              className="qogita-input"
              style={{ flex: 1 }}
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <button type="submit" className="qogita-btn qogita-btn--primary">
              <i className="ri-add-line" /> Зарегистрировать
            </button>
          </form>

          {/* Webhooks table */}
          <h4 style={{ color: "#fff", marginBottom: "0.5rem" }}>
            Зарегистрированные Webhook Endpoints
          </h4>
          {webhooksError && (
            <p role="alert">Не удалось загрузить вебхуки: {webhooksError}</p>
          )}
          <div
            className="qogita-table-container"
            style={{ marginBottom: "2rem" }}
          >
            <table className="qogita-table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>События</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.length === 0 && !webhooksError ? (
                  <tr>
                    <td
                      colSpan="4"
                      style={{ textAlign: "center", padding: "1.5rem" }}
                    >
                      Нет зарегистрированных вебхуков.
                    </td>
                  </tr>
                ) : webhooks.length ? (
                  webhooks.map((w) => (
                    <tr key={w.qid}>
                      <td>{w.url}</td>
                      <td>{w.eventTypes?.join(", ")}</td>
                      <td>
                        <span
                          className={`qogita-badge ${w.enabled ? "qogita-badge--connected" : "qogita-badge--disconnected"}`}
                        >
                          {w.enabled ? "Активен" : "Отключен"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="qogita-btn qogita-btn--danger qogita-btn--sm"
                          onClick={() => handleDeleteWebhook(w.qid)}
                        >
                          <i className="ri-delete-bin-line" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Live Delivery Event Log */}
          <h4 style={{ color: "#fff", marginBottom: "0.5rem" }}>
            Журнал полученных событий
          </h4>
          <div className="qogita-log-list">
            {!status?.events || status.events.length === 0 ? (
              <div className="qogita-empty-state" style={{ padding: "1.5rem" }}>
                События еще не поступали. Нажмите кнопку "Отправить
                тест-событие", чтобы проверить доставку.
              </div>
            ) : (
              status.events.map((evt) => (
                <div key={evt.id} className="qogita-log-item">
                  <div>
                    <strong style={{ color: "#fff" }}>{evt.type}</strong> &bull;{" "}
                    <span style={{ color: "var(--text-color-light)" }}>
                      ID: {evt.id}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-color-light)",
                    }}
                  >
                    {new Date(evt.receivedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------
          TAB 5: Configuration
      --------------------------------------------------------- */}
      {activeTab === "config" && (
        <div className="qogita-card">
          <div className="qogita-card-header">
            <h3>Настройки учетной записи Qogita</h3>
          </div>

          <form
            onSubmit={handleSaveConfig}
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
            <div className="qogita-form-grid">
              <div className="qogita-form-group">
                <label>Email учетной записи Qogita (Buyer account)</label>
                <input
                  type="email"
                  className="qogita-input"
                  placeholder="your-email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="qogita-form-group">
                <label>Пароль учетной записи Qogita</label>
                <input
                  type="password"
                  className="qogita-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
              <button
                type="submit"
                className="qogita-btn qogita-btn--primary"
                disabled={loading}
              >
                {loading ? (
                  <i className="ri-loader-4-line ri-spin" />
                ) : (
                  <i className="ri-save-line" />
                )}{" "}
                Сохранить и проверить подключение
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
