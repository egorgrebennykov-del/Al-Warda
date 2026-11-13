import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm, useAlert } from "../../context/ConfirmContext";
import ProductManualConfigModal from "./ProductManualConfigModal";
import "./ProductsManager.css";

function formatPrice(price, currency = "EUR", language = "ru") {
  const locale = language === "ru" ? "ru-RU" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 2,
  }).format(price || 0);
}

export default function ProductsManager({ language = "ru" }) {
  const isRussian = language === "ru";
  const confirm = useConfirm();
  const alert = useAlert();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStock, setSelectedStock] = useState("all");
  const [selectedSort, setSelectedSort] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(24);

  // Modal
  const [editingProduct, setEditingProduct] = useState(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/products", {
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setProducts(data.products || []);
    } catch (err) {
      setError(
        err.message ||
          (isRussian
            ? "Не удалось загрузить список товаров"
            : "Failed to load products list"),
      );
    } finally {
      setLoading(false);
    }
  }, [isRussian]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Extract unique brands & categories
  const brands = useMemo(() => {
    const set = new Set();
    for (const p of products) {
      if (p.brand && typeof p.brand === "string") {
        set.add(p.brand.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const categories = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      const slug = p.categorySlug || "oud";
      const name = isRussian
        ? p.category || "Восточные"
        : p.categoryEn || p.category || "Oriental";
      if (!map.has(slug)) {
        map.set(slug, name);
      }
    }
    return Array.from(map.entries()).map(([slug, name]) => ({ slug, name }));
  }, [products, isRussian]);

  // Filter & sort products
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    return products
      .filter((p) => {
        // Search
        if (q) {
          const matchName = (p.name || "").toLowerCase().includes(q);
          const matchBrand = (p.brand || "").toLowerCase().includes(q);
          const matchId = String(p.id).includes(q);
          const matchCat = (p.category || "").toLowerCase().includes(q);
          const matchNotes = (p.notesSummary || "").toLowerCase().includes(q);
          if (
            !matchName &&
            !matchBrand &&
            !matchId &&
            !matchCat &&
            !matchNotes
          ) {
            return false;
          }
        }

        // Brand
        if (selectedBrand !== "all" && p.brand !== selectedBrand) {
          return false;
        }

        // Category
        if (selectedCategory !== "all") {
          const slug = p.categorySlug || "";
          if (slug !== selectedCategory && p.category !== selectedCategory) {
            return false;
          }
        }

        // Stock
        if (selectedStock === "in_stock" && p.inStock === false) return false;
        if (selectedStock === "out_of_stock" && p.inStock !== false)
          return false;

        return true;
      })
      .sort((a, b) => {
        if (selectedSort === "newest") {
          return Number(b.id) - Number(a.id);
        }
        if (selectedSort === "oldest") {
          return Number(a.id) - Number(b.id);
        }
        if (selectedSort === "name_asc") {
          return (a.name || "").localeCompare(b.name || "");
        }
        if (selectedSort === "name_desc") {
          return (b.name || "").localeCompare(a.name || "");
        }
        if (selectedSort === "price_asc") {
          return (Number(a.price) || 0) - (Number(b.price) || 0);
        }
        if (selectedSort === "price_desc") {
          return (Number(b.price) || 0) - (Number(a.price) || 0);
        }
        return 0;
      });
  }, [
    products,
    search,
    selectedBrand,
    selectedCategory,
    selectedStock,
    selectedSort,
  ]);

  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  const handleDelete = async (product) => {
    const approved = await confirm({
      title: isRussian ? "Удаление товара" : "Delete Product",
      message: isRussian
        ? `Вы действительно хотите удалить товар «${product.name || `ID #${product.id}`}» из базы данных? Это действие нельзя отменить.`
        : `Are you sure you want to delete "${product.name || `ID #${product.id}`}" from the database? This action cannot be undone.`,
    });
    if (!approved) return;

    setDeletingId(product.id);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/admin/products/delete", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setProducts((prev) =>
        prev.filter((p) => String(p.id) !== String(product.id)),
      );
      setMessage(
        isRussian
          ? `Товар «${product.name}» (ID #${product.id}) успешно удалён из базы данных.`
          : `Product "${product.name}" (ID #${product.id}) deleted successfully.`,
      );
    } catch (err) {
      setError(
        err.message ||
          (isRussian ? "Не удалось удалить товар" : "Failed to delete product"),
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaved = (result) => {
    setEditingProduct(null);
    setMessage(
      isRussian
        ? `Товар «${result.product?.name || `#${result.id}`}» успешно сохранён в базе данных!`
        : `Product "${result.product?.name || `#${result.id}`}" saved successfully!`,
    );
    loadProducts();
  };

  const hasActiveFilters =
    search.trim() !== "" ||
    selectedBrand !== "all" ||
    selectedCategory !== "all" ||
    selectedStock !== "all" ||
    selectedSort !== "newest";

  const handleResetFilters = () => {
    setSearch("");
    setSelectedBrand("all");
    setSelectedCategory("all");
    setSelectedStock("all");
    setSelectedSort("newest");
    setVisibleCount(24);
  };

  return (
    <div className="products-manager">
      {/* Top Header */}
      <div className="products-manager__header">
        <div className="products-manager__title-wrap">
          <h2 className="products-manager__title">
            <i className="ri-store-2-line" />
            {isRussian ? "Каталог товаров магазина" : "Store Products Catalog"}
          </h2>
          <span className="products-manager__count-badge">
            {isRussian
              ? `Всего: ${products.length}`
              : `Total: ${products.length}`}
          </span>
        </div>

        <button
          type="button"
          className="products-manager__add-btn"
          onClick={() => setEditingProduct({ id: "new", isNew: true })}
        >
          <i className="ri-add-circle-line" />
          {isRussian ? "Добавить новый товар" : "Add New Product"}
        </button>
      </div>

      {message && (
        <div
          className="product-image-queue__message"
          role="status"
          style={{
            background: "#eefbf1",
            color: "#1b6932",
            border: "1px solid #a3e6b5",
          }}
        >
          <i
            className="ri-checkbox-circle-line"
            style={{ marginRight: "0.5rem" }}
          />
          {message}
        </div>
      )}

      {error && (
        <div
          className="product-image-queue__message product-image-queue__message--error"
          role="alert"
        >
          <i
            className="ri-error-warning-line"
            style={{ marginRight: "0.5rem" }}
          />
          {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="products-manager__toolbar">
        <div className="products-manager__search-row">
          <div className="products-manager__search-box">
            <i className="ri-search-line" />
            <input
              type="text"
              className="products-manager__search-input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(24);
              }}
              placeholder={
                isRussian
                  ? "Поиск по названию, бренду, нотам или ID..."
                  : "Search by name, brand, notes or ID..."
              }
            />
            {search && (
              <button
                type="button"
                className="products-manager__clear-search"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <i className="ri-close-line" />
              </button>
            )}
          </div>
        </div>

        <div className="products-manager__filters-row">
          <select
            className="products-manager__select"
            value={selectedBrand}
            onChange={(e) => {
              setSelectedBrand(e.target.value);
              setVisibleCount(24);
            }}
          >
            <option value="all">
              {isRussian ? "Все бренды" : "All brands"}
            </option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <select
            className="products-manager__select"
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setVisibleCount(24);
            }}
          >
            <option value="all">
              {isRussian ? "Все категории" : "All categories"}
            </option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            className="products-manager__select"
            value={selectedStock}
            onChange={(e) => {
              setSelectedStock(e.target.value);
              setVisibleCount(24);
            }}
          >
            <option value="all">
              {isRussian ? "Любой статус" : "Any stock"}
            </option>
            <option value="in_stock">
              {isRussian ? "В наличии" : "In stock"}
            </option>
            <option value="out_of_stock">
              {isRussian ? "Нет в наличии" : "Out of stock"}
            </option>
          </select>

          <select
            className="products-manager__select"
            value={selectedSort}
            onChange={(e) => setSelectedSort(e.target.value)}
          >
            <option value="newest">
              {isRussian ? "Сначала новые (ID ↓)" : "Newest first"}
            </option>
            <option value="oldest">
              {isRussian ? "Сначала старые (ID ↑)" : "Oldest first"}
            </option>
            <option value="name_asc">
              {isRussian ? "Название (А–Я)" : "Name (A–Z)"}
            </option>
            <option value="name_desc">
              {isRussian ? "Название (Я–А)" : "Name (Z–A)"}
            </option>
            <option value="price_asc">
              {isRussian ? "Цена: по возрастанию" : "Price: Low to High"}
            </option>
            <option value="price_desc">
              {isRussian ? "Цена: по убыванию" : "Price: High to Low"}
            </option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              className="products-manager__reset-filters"
              onClick={handleResetFilters}
            >
              <i className="ri-refresh-line" />
              {isRussian ? "Сбросить фильтры" : "Reset filters"}
            </button>
          )}

          <span
            style={{
              marginLeft: "auto",
              fontSize: "0.82rem",
              color: "#8c8172",
            }}
          >
            {isRussian
              ? `Найдено: ${filteredProducts.length}`
              : `Matches: ${filteredProducts.length}`}
          </span>
        </div>
      </div>

      {/* Grid of products */}
      {loading ? (
        <div className="products-manager__loading">
          <div className="product-image-queue__spinner" />
          <span>
            {isRussian ? "Загрузка каталога товаров..." : "Loading products..."}
          </span>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="products-manager__empty">
          <i className="ri-inbox-line" />
          <p>{isRussian ? "Товары не найдены" : "No products found"}</p>
          {hasActiveFilters && (
            <button
              type="button"
              className="products-manager__reset-filters"
              onClick={handleResetFilters}
            >
              {isRussian ? "Сбросить фильтры поиска" : "Clear filters"}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="products-manager__grid">
            {displayedProducts.map((p) => {
              const imgUrl = p.image || p.rawImage;
              const isDeleting = deletingId === p.id;
              return (
                <article key={p.id} className="products-manager__card">
                  <div className="products-manager__card-thumb">
                    {imgUrl ? (
                      <img src={imgUrl} alt={p.name} loading="lazy" />
                    ) : (
                      <div className="products-manager__card-placeholder">
                        <i className="ri-image-line" />
                        <span>{isRussian ? "Нет фото" : "No photo"}</span>
                      </div>
                    )}

                    <div className="products-manager__card-badges">
                      <span
                        className="products-manager__brand-pill"
                        title={p.brand}
                      >
                        {p.brand}
                      </span>
                      <span
                        className={`products-manager__stock-pill ${p.inStock ? "products-manager__stock-pill--in" : "products-manager__stock-pill--out"}`}
                      >
                        {p.inStock
                          ? isRussian
                            ? "В наличии"
                            : "In stock"
                          : isRussian
                            ? "Под заказ"
                            : "Out of stock"}
                      </span>
                    </div>
                  </div>

                  <div className="products-manager__card-body">
                    <div className="products-manager__card-meta">
                      <span>{p.category}</span>
                      <span>{p.gender}</span>
                    </div>

                    <h3 className="products-manager__card-title" title={p.name}>
                      {p.name}
                    </h3>

                    <div className="products-manager__card-details">
                      {p.volume} {p.concentration ? `· ${p.concentration}` : ""}
                    </div>

                    <div className="products-manager__card-price">
                      <span className="products-manager__price-tag">
                        {formatPrice(p.price, p.currency, language)}
                      </span>
                      <span className="products-manager__moq-tag">
                        ID #{p.id}
                      </span>
                    </div>
                  </div>

                  <div className="products-manager__card-actions">
                    <button
                      type="button"
                      className="products-manager__edit-btn"
                      onClick={() => setEditingProduct(p)}
                      disabled={isDeleting}
                    >
                      <i className="ri-edit-2-line" />
                      {isRussian ? "Редактировать" : "Edit"}
                    </button>
                    <button
                      type="button"
                      className="products-manager__delete-btn"
                      onClick={() => handleDelete(p)}
                      disabled={isDeleting}
                      title={
                        isRussian
                          ? "Удалить товар из базы данных"
                          : "Delete product from database"
                      }
                    >
                      {isDeleting ? (
                        <i className="ri-loader-4-line ri-spin" />
                      ) : (
                        <i className="ri-delete-bin-line" />
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {visibleCount < filteredProducts.length && (
            <div className="products-manager__load-more-wrap">
              <button
                type="button"
                className="products-manager__load-more-btn"
                onClick={() => setVisibleCount((prev) => prev + 24)}
              >
                <i className="ri-arrow-down-line" />
                {isRussian
                  ? `Показать ещё (осталось ${filteredProducts.length - visibleCount})`
                  : `Show more (${filteredProducts.length - visibleCount} remaining)`}
              </button>
              <span style={{ fontSize: "0.82rem", color: "#8c8172" }}>
                {isRussian
                  ? `Показано ${displayedProducts.length} из ${filteredProducts.length} товаров`
                  : `Showing ${displayedProducts.length} of ${filteredProducts.length} products`}
              </span>
            </div>
          )}
        </>
      )}

      {/* Editing / Creating modal */}
      {editingProduct && (
        <ProductManualConfigModal
          item={editingProduct}
          language={language}
          onClose={() => setEditingProduct(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
