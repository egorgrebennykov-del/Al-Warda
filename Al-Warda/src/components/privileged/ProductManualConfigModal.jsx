import { useEffect, useState } from "react";
import {
  ensurePerfumeEnrichment,
  generateRichPerfumeDescriptions,
  stripVolumeFromName,
  extractVolumeFromName,
} from "../../../utils/perfumes";
import "./ProductManualConfigModal.css";

const CATEGORY_OPTIONS = [
  { slug: "oud", ru: "Древесные и Уд", en: "Oud & Leather" },
  { slug: "oriental", ru: "Восточные", en: "Oriental" },
  { slug: "floral", ru: "Цветочные и фруктовые", en: "Floral & Fruity" },
  { slug: "gourmand", ru: "Гурманские и пряные", en: "Gourmand & Spicy" },
  { slug: "spicy", ru: "Пряные и смолистые", en: "Spicy & Amber" },
  { slug: "fresh", ru: "Свежие и акватические", en: "Fresh & Aquatic" },
  { slug: "fougere", ru: "Фужерные", en: "Fougere" },
  { slug: "sets", ru: "Подарочные наборы и сеты", en: "Discovery & Gift Sets" },
];

const GENDER_OPTIONS = [
  { ru: "Унисекс", en: "Unisex" },
  { ru: "Мужской", en: "Men" },
  { ru: "Женский", en: "Women" },
];

export default function ProductManualConfigModal({
  item,
  onClose,
  onSaved,
  language = "ru",
}) {
  const isRussian = language === "ru";

  const isNew = !item?.id || item?.id === "new" || Boolean(item?.isNew);

  // Pre-fill initial state using existing product info and enrichment
  const [initialData] = useState(() => {
    const rawName = item?.name || item?.title || "";
    const cleanName = stripVolumeFromName(rawName);
    const enriched = isNew
      ? {}
      : ensurePerfumeEnrichment({
          id: item?.id,
          name: cleanName,
          title: cleanName,
          brand: item?.brand || "Al-Warda",
          price:
            item?.price ||
            (item?.info?.price ? Number(item?.info?.price) : 29.99),
          image: item?.image || item?.rawImage || "",
          rawImage: item?.rawImage || item?.info?.rawImage || null,
          info: item?.info || {},
          ...item?.info,
        });

    const explicitVol = extractVolumeFromName(rawName);
    const volume =
      explicitVol ||
      enriched.volume ||
      item?.info?.volume ||
      "100 мл / 3.4 FL.OZ.";

    return {
      name: cleanName,
      brand: enriched.brand || item?.brand || "Al-Warda",
      categorySlug: enriched.category || "oud",
      categoryRu: enriched.categoryRu || "Восточные",
      categoryEn: enriched.categoryEn || "Oriental",
      volume,
      concentration:
        enriched.concentration || item?.info?.concentration || "Eau De Parfum",
      gender: enriched.gender || item?.info?.gender || "Унисекс",
      genderEn:
        enriched.genderEn ||
        (enriched.gender === "Женский"
          ? "Women"
          : enriched.gender === "Мужской"
            ? "Men"
            : "Unisex"),
      price:
        item?.price || (item?.info?.price ? Number(item?.info?.price) : 29.99),
      longevity: enriched.longevity || "8–12 часов",
      sillage: enriched.sillage || "Выразительный, шлейфовый",
      notesSummaryRu: enriched.notesSummaryRu || enriched.notesSummary || "",
      notesSummaryEn: enriched.notesSummaryEn || "",
      topNotesRu: (enriched.topNotesRu || []).join(", "),
      heartNotesRu: (enriched.heartNotesRu || []).join(", "),
      baseNotesRu: (enriched.baseNotesRu || []).join(", "),
      topNotesEn: (enriched.topNotesEn || []).join(", "),
      heartNotesEn: (enriched.heartNotesEn || []).join(", "),
      baseNotesEn: (enriched.baseNotesEn || []).join(", "),
      descriptionRu: enriched.descriptionRu || enriched.description || "",
      descriptionEn: enriched.descriptionEn || "",
      image: item?.image || item?.rawImage || "",
    };
  });

  const [name, setName] = useState(initialData.name);
  const [brand, setBrand] = useState(initialData.brand);
  const [categorySlug, setCategorySlug] = useState(initialData.categorySlug);
  const [volume, setVolume] = useState(initialData.volume);
  const [concentration, setConcentration] = useState(initialData.concentration);
  const [gender, setGender] = useState(initialData.gender);
  const [price, setPrice] = useState(initialData.price);
  const [longevity, setLongevity] = useState(initialData.longevity);
  const [sillage, setSillage] = useState(initialData.sillage);

  const [notesSummaryRu, setNotesSummaryRu] = useState(
    initialData.notesSummaryRu,
  );
  const [notesSummaryEn, setNotesSummaryEn] = useState(
    initialData.notesSummaryEn,
  );
  const [topNotesRu, setTopNotesRu] = useState(initialData.topNotesRu);
  const [heartNotesRu, setHeartNotesRu] = useState(initialData.heartNotesRu);
  const [baseNotesRu, setBaseNotesRu] = useState(initialData.baseNotesRu);
  const [topNotesEn, setTopNotesEn] = useState(initialData.topNotesEn);
  const [heartNotesEn, setHeartNotesEn] = useState(initialData.heartNotesEn);
  const [baseNotesEn, setBaseNotesEn] = useState(initialData.baseNotesEn);

  const [descriptionRu, setDescriptionRu] = useState(initialData.descriptionRu);
  const [descriptionEn, setDescriptionEn] = useState(initialData.descriptionEn);

  const [image, setImage] = useState(initialData.image);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notesOrigin, setNotesOrigin] = useState(
    item?.info?.notesSource === "deepseek" ? "deepseek" : "manual",
  );
  const [notesFetchState, setNotesFetchState] = useState("idle");
  const [notesFetchMessage, setNotesFetchMessage] = useState("");

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !saving) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saving, onClose]);

  const handleCategoryChange = (slug) => {
    setCategorySlug(slug);
  };

  const markNotesManual = () => {
    setNotesOrigin("manual");
  };

  const bindNotesField = (setter) => (event) => {
    markNotesManual();
    setter(event.target.value);
  };

  // Fetch notes/description from the pipeline (DeepSeek + Gemini) for the
  // current name/brand and pre-fill the form with the generated data.
  const handleFetchNotes = async () => {
    if (!name.trim()) {
      setError(
        isRussian
          ? "Сначала укажите название парфюма"
          : "Enter the perfume name first",
      );
      return;
    }
    setError("");
    setNotesFetchState("loading");
    setNotesFetchMessage("");
    try {
      const params = new URLSearchParams({
        name: name.trim(),
        brand: brand.trim(),
      });
      if (!isNew && item?.id && /^\d+$/.test(String(item.id))) {
        params.set("id", String(item.id));
      }
      const response = await fetch(
        `/api/fragrance-notes?${params.toString()}`,
        {
          credentials: "same-origin",
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      if (payload.status !== "found" || !payload.notes) {
        setNotesFetchState(
          payload.status === "not_found" ? "not_found" : "error",
        );
        setNotesFetchMessage(
          payload.status === "not_found"
            ? isRussian
              ? "DeepSeek не смог определить ноты. Заполните их вручную."
              : "DeepSeek could not determine the notes. Enter them manually."
            : payload.error ||
                (isRussian
                  ? "Не удалось сгенерировать ноты"
                  : "Could not generate notes"),
        );
        return;
      }

      const en = payload.notes.en || payload.notes.ru || {};
      const ru = payload.notes.ru || en;
      const topEn = Array.isArray(en.top) ? en.top : [];
      const heartEn = Array.isArray(en.heart) ? en.heart : [];
      const baseEn = Array.isArray(en.base) ? en.base : [];
      const topRu = Array.isArray(ru.top) && ru.top.length ? ru.top : topEn;
      const heartRu =
        Array.isArray(ru.heart) && ru.heart.length ? ru.heart : heartEn;
      const baseRu =
        Array.isArray(ru.base) && ru.base.length ? ru.base : baseEn;

      setTopNotesRu(topRu.join(", "));
      setHeartNotesRu(heartRu.join(", "));
      setBaseNotesRu(baseRu.join(", "));
      setTopNotesEn(topEn.join(", "));
      setHeartNotesEn(heartEn.join(", "));
      setBaseNotesEn(baseEn.join(", "));

      const sumRu = [
        ...topRu.slice(0, 2),
        ...heartRu.slice(0, 1),
        ...baseRu.slice(0, 1),
      ].join(" · ");
      const sumEn = [
        ...topEn.slice(0, 2),
        ...heartEn.slice(0, 1),
        ...baseEn.slice(0, 1),
      ].join(" · ");
      setNotesSummaryRu(sumRu);
      setNotesSummaryEn(sumEn);
      setNotesOrigin("deepseek");

      setNotesFetchState("found");

      // Pipeline step 4 — the description is written from the aroma palette.
      // Gemini descriptions come from the server; otherwise fall back to the template.
      const serverDescriptions = payload.descriptions;
      if (
        serverDescriptions &&
        (serverDescriptions.ru || serverDescriptions.en)
      ) {
        setDescriptionRu(serverDescriptions.ru || serverDescriptions.en);
        setDescriptionEn(serverDescriptions.en || serverDescriptions.ru);
        setNotesFetchMessage(
          isRussian
            ? "Ноты (DeepSeek) и описание (Gemini) сгенерированы по палитре аромата."
            : "Notes (DeepSeek) and description (Gemini) generated from the aroma palette.",
        );
      } else {
        const generatedDescs = generateRichPerfumeDescriptions({
          name,
          brand,
          category: categorySlug,
          categoryRu: (
            CATEGORY_OPTIONS.find((c) => c.slug === categorySlug) ||
            CATEGORY_OPTIONS[0]
          ).ru,
          categoryEn: (
            CATEGORY_OPTIONS.find((c) => c.slug === categorySlug) ||
            CATEGORY_OPTIONS[0]
          ).en,
          genderRu: gender,
          genderEn:
            gender === "Женский"
              ? "Women"
              : gender === "Мужской"
                ? "Men"
                : "Unisex",
          longevityRu: longevity,
          longevityEn: "8–12 hours",
          topRu,
          heartRu,
          baseRu,
          topEn,
          heartEn,
          baseEn,
        });
        setDescriptionRu(generatedDescs.descriptionRu);
        setDescriptionEn(generatedDescs.descriptionEn);
        setNotesFetchMessage(
          isRussian
            ? "Ноты сгенерированы DeepSeek и сохранены в товаре."
            : "Notes generated by DeepSeek and saved to the product.",
        );
      }
    } catch (err) {
      setNotesFetchState("error");
      setNotesFetchMessage(
        err.message ||
          (isRussian
            ? "Не удалось сгенерировать ноты"
            : "Could not generate notes"),
      );
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(
        isRussian ? "Укажите название парфюма" : "Perfume name is required",
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      const currentCategory =
        CATEGORY_OPTIONS.find((c) => c.slug === categorySlug) ||
        CATEGORY_OPTIONS[0];
      const payload = {
        id: isNew ? "new" : item.id,
        name: name.trim(),
        brand: brand.trim(),
        category: currentCategory.ru,
        categorySlug,
        categoryEn: currentCategory.en,
        volume: volume.trim(),
        concentration: concentration.trim(),
        gender,
        genderEn:
          gender === "Женский"
            ? "Women"
            : gender === "Мужской"
              ? "Men"
              : "Unisex",
        price: Number(price) || 29.99,
        currency: "EUR",
        longevity: longevity.trim(),
        sillage: sillage.trim(),
        notesSummary: notesSummaryRu.trim(),
        notesSummaryEn: notesSummaryEn.trim(),
        topNotes: topNotesRu,
        heartNotes: heartNotesRu,
        baseNotes: baseNotesRu,
        topNotesEn: topNotesEn,
        heartNotesEn: heartNotesEn,
        baseNotesEn: baseNotesEn,
        notesSource: notesOrigin,
        notesVerified: [
          topNotesRu,
          heartNotesRu,
          baseNotesRu,
          topNotesEn,
          heartNotesEn,
          baseNotesEn,
        ].some((value) => String(value || "").trim().length > 0),
        descriptionRu: descriptionRu.trim(),
        descriptionEn: descriptionEn.trim(),
        inStock: true,
        minOrderQuantity: 1,
      };

      const response = await fetch("/api/admin/product-images/manual-save", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      if (onSaved) {
        onSaved(result);
      }
    } catch (err) {
      setError(
        err.message ||
          (isRussian
            ? "Не удалось сохранить товар в базу данных"
            : "Failed to save product"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="product-manual-modal__backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="product-manual-modal" role="dialog" aria-modal="true">
        <header className="product-manual-modal__header">
          <div className="product-manual-modal__title-wrap">
            <h2 className="product-manual-modal__title">
              <i
                className={isNew ? "ri-add-circle-line" : "ri-settings-3-line"}
              />
              {isNew
                ? isRussian
                  ? "Создание нового товара"
                  : "Create New Product"
                : isRussian
                  ? "Панель настройки товара"
                  : "Manual Product Setup"}
              <span className="product-manual-modal__badge">
                {isNew
                  ? isRussian
                    ? "Новый товар"
                    : "New Item"
                  : `ID #${item?.id}`}
              </span>
            </h2>
            <p className="product-manual-modal__subtitle">
              {isNew
                ? isRussian
                  ? "Заполните название, бренд и характеристики аромата, добавьте фото флакона и сохраните товар в базу данных магазина."
                  : "Fill in perfume title, brand and properties, add flacon photo and save the product directly to store database."
                : isRussian
                  ? "Все поля уже заполнены на основе характеристик аромата. Вы можете отредактировать ноты, описание, цену и загрузить фото флакона."
                  : "All fields are pre-filled based on fragrance notes. Edit properties, descriptions, price, and upload a flacon photo."}
            </p>
          </div>
          <button
            type="button"
            className="product-manual-modal__close"
            onClick={onClose}
            disabled={saving}
            aria-label={isRussian ? "Закрыть" : "Close"}
          >
            <i className="ri-close-line" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="product-manual-modal__body">
          {/* SECTION 1: Product Image (read-only preview) */}
          <div className="product-manual-modal__section">
            <div className="product-manual-modal__section-header">
              <h3 className="product-manual-modal__section-title">
                <i className="ri-image-2-line" />
                {isRussian ? "1. Фотография флакона" : "1. Flacon Visual"}
              </h3>
            </div>

            <div className="product-manual-modal__image-layout">
              <div className="product-manual-modal__image-preview-wrap">
                <div
                  className={`product-manual-modal__image-preview ${image ? "product-manual-modal__image-preview--has-image" : ""}`}
                >
                  {image ? (
                    <img src={image} alt={name || "Превью фото флакона"} />
                  ) : (
                    <div className="product-manual-modal__image-placeholder">
                      <i className="ri-image-add-line" />
                      <span>
                        {isRussian ? "Нет изображения" : "No image selected"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Core Information */}
          <div className="product-manual-modal__section">
            <h3 className="product-manual-modal__section-title">
              <i className="ri-information-line" />
              {isRussian
                ? "2. Основная информация о товаре"
                : "2. Core Information"}
            </h3>

            <div className="product-manual-modal__grid-2">
              <div className="product-manual-modal__field">
                <label>
                  {isRussian ? "Название парфюма *" : "Perfume Name *"}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    isRussian
                      ? "Например: Khamrah Lattafa"
                      : "e.g. Khamrah Lattafa"
                  }
                />
              </div>

              <div className="product-manual-modal__field">
                <label>{isRussian ? "Бренд *" : "Brand *"}</label>
                <input
                  type="text"
                  required
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Lattafa, Afnan, Armaf..."
                />
              </div>
            </div>

            <div className="product-manual-modal__grid-4">
              <div className="product-manual-modal__field">
                <label>{isRussian ? "Категория" : "Category"}</label>
                <select
                  value={categorySlug}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.slug} value={cat.slug}>
                      {isRussian ? cat.ru : cat.en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="product-manual-modal__field">
                <label>{isRussian ? "Пол" : "Gender"}</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g.ru} value={g.ru}>
                      {isRussian ? g.ru : g.en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="product-manual-modal__field">
                <label>{isRussian ? "Объём флакона" : "Volume"}</label>
                <input
                  type="text"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  placeholder="100 мл / 3.4 FL.OZ."
                />
              </div>

              <div className="product-manual-modal__field">
                <label>{isRussian ? "Концентрация" : "Concentration"}</label>
                <input
                  type="text"
                  value={concentration}
                  onChange={(e) => setConcentration(e.target.value)}
                  placeholder="Eau De Parfum"
                />
              </div>
            </div>

            <div className="product-manual-modal__grid-2">
              <div className="product-manual-modal__field">
                <label>
                  {isRussian ? "Цена в каталоге (€) *" : "Price in EUR *"}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>

              <div className="product-manual-modal__field">
                <label>
                  {isRussian ? "Минимальный заказ (шт)" : "Minimum Order (MOQ)"}
                </label>
                <input
                  type="number"
                  disabled
                  value="1"
                  title={
                    isRussian
                      ? "Минимальное количество заказа всегда 1 штука"
                      : "Minimum order is 1 piece"
                  }
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: Fragrance Notes Pyramid */}
          <div className="product-manual-modal__section">
            <div className="product-manual-modal__section-header">
              <h3 className="product-manual-modal__section-title">
                <i className="ri-sparkling-2-line" />
                {isRussian
                  ? "3. Пирамида аромата и ноты"
                  : "3. Fragrance Notes Pyramid"}
              </h3>
              <button
                type="button"
                className="product-manual-modal__magic-btn"
                onClick={handleGenerateNotes}
                disabled={notesFetchState === "loading"}
                title={
                  isRussian
                    ? "Сгенерировать ноты через DeepSeek"
                    : "Generate notes with DeepSeek"
                }
              >
                <i
                  className={
                    notesFetchState === "loading"
                      ? "ri-loader-4-line ri-spin"
                      : "ri-sparkling-2-line"
                  }
                />
                {notesFetchState === "loading"
                  ? isRussian
                    ? "DeepSeek генерирует ноты…"
                    : "DeepSeek is generating notes…"
                  : isRussian
                    ? "Сгенерировать ноты (DeepSeek)"
                    : "Generate notes (DeepSeek)"}
              </button>
            </div>

            {notesFetchMessage && (
              <p
                className={`product-manual-modal__notes-status ${
                  notesFetchState === "found"
                    ? "product-manual-modal__notes-status--ok"
                    : "product-manual-modal__notes-status--warn"
                }`}
                role="status"
              >
                <i
                  className={
                    notesFetchState === "found"
                      ? "ri-checkbox-circle-line"
                      : "ri-information-line"
                  }
                />
                <span>{notesFetchMessage}</span>
              </p>
            )}

            <div className="product-manual-modal__grid-2">
              <div className="product-manual-modal__field">
                <label>
                  {isRussian ? "Краткий аккорд нот (RU)" : "Notes Summary (RU)"}
                </label>
                <input
                  type="text"
                  value={notesSummaryRu}
                  onChange={bindNotesField(setNotesSummaryRu)}
                  placeholder="Бергамот · Дамасская роза · Белый мускус"
                />
              </div>
              <div className="product-manual-modal__field">
                <label>
                  {isRussian ? "Краткий аккорд нот (EN)" : "Notes Summary (EN)"}
                </label>
                <input
                  type="text"
                  value={notesSummaryEn}
                  onChange={bindNotesField(setNotesSummaryEn)}
                  placeholder="Bergamot · Damask Rose · White Musk"
                />
              </div>
            </div>

            <div className="product-manual-modal__grid-2">
              <div className="product-manual-modal__field">
                <label>
                  {isRussian
                    ? "Верхние ноты (RU, через запятую)"
                    : "Top Notes (RU, comma-separated)"}
                </label>
                <input
                  type="text"
                  value={topNotesRu}
                  onChange={bindNotesField(setTopNotesRu)}
                  placeholder="Шафран, Бергамот, Розовый перец"
                />
              </div>
              <div className="product-manual-modal__field">
                <label>
                  {isRussian ? "Верхние ноты (EN)" : "Top Notes (EN)"}
                </label>
                <input
                  type="text"
                  value={topNotesEn}
                  onChange={bindNotesField(setTopNotesEn)}
                  placeholder="Saffron, Bergamot, Pink Pepper"
                />
              </div>
            </div>

            <div className="product-manual-modal__grid-2">
              <div className="product-manual-modal__field">
                <label>
                  {isRussian ? "Ноты сердца (RU)" : "Heart Notes (RU)"}
                </label>
                <input
                  type="text"
                  value={heartNotesRu}
                  onChange={bindNotesField(setHeartNotesRu)}
                  placeholder="Дамасская роза, Уд, Золотая амбра"
                />
              </div>
              <div className="product-manual-modal__field">
                <label>
                  {isRussian ? "Ноты сердца (EN)" : "Heart Notes (EN)"}
                </label>
                <input
                  type="text"
                  value={heartNotesEn}
                  onChange={bindNotesField(setHeartNotesEn)}
                  placeholder="Damask Rose, Precious Oud, Golden Amber"
                />
              </div>
            </div>

            <div className="product-manual-modal__grid-2">
              <div className="product-manual-modal__field">
                <label>
                  {isRussian ? "Базовые ноты (RU)" : "Base Notes (RU)"}
                </label>
                <input
                  type="text"
                  value={baseNotesRu}
                  onChange={bindNotesField(setBaseNotesRu)}
                  placeholder="Белый мускус, Сандал, Мадагаскарская ваниль"
                />
              </div>
              <div className="product-manual-modal__field">
                <label>
                  {isRussian ? "Базовые ноты (EN)" : "Base Notes (EN)"}
                </label>
                <input
                  type="text"
                  value={baseNotesEn}
                  onChange={bindNotesField(setBaseNotesEn)}
                  placeholder="White Musk, Sandalwood, Madagascar Vanilla"
                />
              </div>
            </div>

            <div className="product-manual-modal__grid-2">
              <div className="product-manual-modal__field">
                <label>{isRussian ? "Стойкость" : "Longevity"}</label>
                <input
                  type="text"
                  value={longevity}
                  onChange={(e) => setLongevity(e.target.value)}
                  placeholder="8–12 часов"
                />
              </div>
              <div className="product-manual-modal__field">
                <label>{isRussian ? "Шлейф" : "Sillage"}</label>
                <input
                  type="text"
                  value={sillage}
                  onChange={(e) => setSillage(e.target.value)}
                  placeholder="Выразительный, шлейфовый"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: Luxury Descriptions */}
          <div className="product-manual-modal__section">
            <h3 className="product-manual-modal__section-title">
              <i className="ri-file-text-line" />
              {isRussian ? "4. Описание парфюма" : "4. Perfume Descriptions"}
            </h3>

            <div className="product-manual-modal__field">
              <label>
                {isRussian
                  ? "Описание на русском (RU)"
                  : "Description in Russian (RU)"}
              </label>
              <textarea
                rows={4}
                value={descriptionRu}
                onChange={(e) => setDescriptionRu(e.target.value)}
                placeholder={
                  isRussian
                    ? "Подробное роскошное описание аромата Al-Warda..."
                    : "Detailed luxury Russian description..."
                }
              />
            </div>

            <div className="product-manual-modal__field">
              <label>
                {isRussian
                  ? "Описание на английском (EN)"
                  : "Description in English (EN)"}
              </label>
              <textarea
                rows={4}
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                placeholder="Detailed luxury English description..."
              />
            </div>
          </div>

          <div style={{ display: "none" }}>
            <button type="submit" tabIndex={-1} />
          </div>
        </form>

        <footer className="product-manual-modal__footer">
          {error && (
            <div className="product-manual-modal__error" role="alert">
              <i className="ri-error-warning-line" />
              <span>{error}</span>
            </div>
          )}

          <div className="product-manual-modal__footer-actions">
            <button
              type="button"
              className="product-manual-modal__cancel-btn"
              onClick={onClose}
              disabled={saving}
            >
              {isRussian ? "Отмена" : "Cancel"}
            </button>
            <button
              type="button"
              className="product-manual-modal__submit-btn"
              disabled={saving}
              onClick={handleSubmit}
            >
              {saving ? (
                <>
                  <i className="ri-loader-4-line ri-spin" />
                  {isRussian ? "Отправка в БД..." : "Saving to DB..."}
                </>
              ) : (
                <>
                  <i className="ri-database-2-line" />
                  {isRussian ? "Отправить в базу данных" : "Save to Database"}
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
