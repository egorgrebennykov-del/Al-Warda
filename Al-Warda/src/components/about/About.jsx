import { Link } from "react-router";
import { useLanguage } from "../../context/languageContext";
import { OrnateCard, SectionDivider, SensesMotif } from "../common/OrnateCard";
import "./About.css";

const PILLARS = [
  {
    icon: "ri-shield-star-line",
    titleRu: "100% Подлинность",
    titleEn: "100% Authenticity",
    descRu:
      "Прямые поставки от сертифицированных парфюмерных домов Ближнего Востока. Каждый флакон поставляется в заводской упаковке с голограммами и батч-кодом.",
    descEn:
      "Direct supply from certified perfume houses of the Middle East. Every flacon arrives factory-sealed with original holograms and batch codes.",
  },
  {
    icon: "ri-drop-line",
    titleRu: "Драгоценные Масла и Стойкость",
    titleEn: "Precious Oils & Longevity",
    descRu:
      "Высокая концентрация натуральных эфирных масел (Eau de Parfum и Extrait de Parfum) обеспечивает стойкость от 10 до 16 часов и глубокий, благородный шлейф.",
    descEn:
      "High concentrations of natural essential oils (Eau de Parfum and Extrait de Parfum) deliver 10 to 16 hours of longevity and a majestic sillage.",
  },
  {
    icon: "ri-gift-2-line",
    titleRu: "Эксклюзивные Сеты",
    titleEn: "Luxury Gift Sets",
    descRu:
      "Роскошные подарочные наборы и дискавери-коллекции в дизайнерских шкатулках — безупречный выбор для знакомства с нишевой парфюмерией или статусного подарка.",
    descEn:
      "Opulent gift coffrets and discovery collections in signature presentation boxes — an impeccable choice for exploring niche scents or gifting.",
  },
  {
    icon: "ri-sparkling-2-line",
    titleRu: "Парфюмерный Консьерж Ясмин",
    titleEn: "Yasmin AI Fragrance Concierge",
    descRu:
      "Персональный ИИ-консультант Ясмин мгновенно подберёт идеальный парфюм по вашим любимым нотам, времени года, поводу и предпочтениям.",
    descEn:
      "Our personal AI consultant Yasmin curates your ideal fragrance based on your favorite olfactory notes, season, occasion, and style.",
  },
];

const INGREDIENTS = [
  {
    icon: "🪵",
    nameRu: "Королевский Уд",
    nameEn: "Royal Agarwood (Oud)",
    roleRu: "Сердце восточной традиции",
    roleEn: "Heart of Middle Eastern Heritage",
    descRu:
      "Драгоценная смолистая древесина агарового дерева придаёт композициям гипнотическую глубину, бархатный дымный оттенок и неповторимый статус.",
    descEn:
      "Precious resinous heartwood that lends fragrances a hypnotic depth, velvety smoky warmth, and unmistakable sophistication.",
  },
  {
    icon: "🌹",
    nameRu: "Дамасская и Таифская Роза",
    nameEn: "Damask & Taif Rose",
    roleRu: "Символ дома Al-Warda",
    roleEn: "Emblem of the House of Al-Warda",
    descRu:
      "«Аль-Варда» в переводе с арабского означает «Роза». Собранные на рассвете лепестки дарят ароматам чувственную медово-цветочную грань.",
    descEn:
      "'Al-Warda' translates from Arabic as 'The Rose'. Hand-picked at dawn, its petals infuse creations with a sensual, honeyed floral radiance.",
  },
  {
    icon: "✨",
    nameRu: "Золотая Амбра и Мускус",
    nameEn: "Golden Amber & White Musk",
    roleRu: "Магнетизм и тёплый шлейф",
    roleEn: "Magnetism & Warm Sillage",
    descRu:
      "Солнечные амбровые аккорды в сочетании с шелковистым белым мускусом создают на коже тёплое, притягательное и обволакивающее послевкусие.",
    descEn:
      "Solar amber accords intertwined with silky white musk create an enveloping, skin-warming trail that lingersfrom morning till night.",
  },
  {
    icon: "🌿",
    nameRu: "Шафран, Кардамон и Ваниль",
    nameEn: "Saffron, Cardamom & Vanilla",
    roleRu: "Пряная гурманика Востока",
    roleEn: "Opulent Oriental Spices",
    descRu:
      "Благородные специи в дуэте с мадагаскарской ванилью, пралине и бобами тонка рождают комплиментарные, многогранные композиции.",
    descEn:
      "Noble spices paired with Madagascar vanilla, praline, and tonka bean craft multifaceted, compliment-inducing signatures.",
  },
];

const FEATURED_HOUSES = [
  "Lattafa",
  "Armaf",
  "Afnan",
  "Al Haramain",
  "Rasasi",
  "Swiss Arabian",
  "Arabian Oud",
  "Orientica",
  "Maison Alhambra",
  "French Avenue",
  "Paris Corner",
  "Khadlaj",
  "Ajmal",
  "Zimaya",
];

export default function About() {
  const { language } = useLanguage();
  const isRu = language === "ru";

  const handleAskYasmin = () => {
    window.dispatchEvent(new CustomEvent("open-warda-assistant"));
  };

  return (
    <div className="warda-about-page container">
      {/* 1. HERO SECTION */}
      <section className="warda-about-hero">
        <div className="warda-about-hero__badge">
          <i className="ri-vip-diamond-line" />
          <span>{isRu ? "ДОМ СЕЛЕКТИВНОЙ ПАРФЮМЕРИИ" : "HOUSE OF NICHE PERFUMERY"}</span>
        </div>

        <h1 className="warda-about-hero__title">
          {isRu
            ? "Al-Warda Parfumes — Искусство Восточного Аромата"
            : "Al-Warda Parfumes — The Art of Middle Eastern Fragrance"}
        </h1>

        <p className="warda-about-hero__lead">
          {isRu
            ? "«Аль-Варда» (الوردة) в переводе с арабского означает «Благородная Роза». Мы создали бутик Al-Warda, чтобы объединить вековые традиции парфюмерных мастеров Ближнего Востока и современную европейскую эстетику."
            : "'Al-Warda' (الوردة) means 'The Noble Rose' in Arabic. We founded Al-Warda to bridge centuries-old craftsmanship of Middle Eastern master perfumers with contemporary European luxury."}
        </p>

        <div className="warda-about-stats">
          <div className="warda-about-stat">
            <span className="warda-about-stat__num">44+</span>
            <span className="warda-about-stat__label">
              {isRu ? "Парфюмерных домов Ближнего Востока" : "Middle Eastern Perfume Houses"}
            </span>
          </div>
          <div className="warda-about-stat">
            <span className="warda-about-stat__num">100%</span>
            <span className="warda-about-stat__label">
              {isRu ? "Оригинальная сертифицированная продукция" : "Certified Authentic Creations"}
            </span>
          </div>
          <div className="warda-about-stat">
            <span className="warda-about-stat__num">12–16 ч</span>
            <span className="warda-about-stat__label">
              {isRu ? "Стойкость селективных композиций" : "Signature Fragrance Longevity"}
            </span>
          </div>
          <div className="warda-about-stat">
            <span className="warda-about-stat__num">4–7 {isRu ? "дней" : "days"}</span>
            <span className="warda-about-stat__label">
              {isRu ? "Бережная доставка по Европе" : "Express Delivery Across Europe"}
            </span>
          </div>
        </div>
      </section>

      {/* 2. STORY & HERITAGE */}
      <SectionDivider
        title={isRu ? "ИСТОРИЯ И ФИЛОСОФИЯ БРЕНДА" : "HERITAGE & PHILOSOPHY"}
        showMotif={true}
      />

      <section className="warda-about-story">
        <div className="warda-about-story__card">
          <div className="warda-about-story__visual">
            <img
              src="/assets/img/al-warda-header-logo.png"
              alt="Al-Warda Emblem"
              className="warda-about-story__emblem"
            />
          </div>
          <div className="warda-about-story__content">
            <h2>
              {isRu
                ? "Наследие Ближнего Востока в каждой капле"
                : "Middle Eastern Heritage in Every Drop"}
            </h2>
            <p>
              {isRu
                ? "Восточная парфюмерия — это больше, чем просто аромат. Это ритуал гостеприимства, выражение индивидуальности и невидимая корона, которая сопровождает вас на протяжении всего дня. В отличие от массовой парфюмерии, композиции с Ближнего Востока создаются на основе высокой концентрации натуральных масел, редких смол и благородной древесины."
                : "Middle Eastern perfumery is far more than a scent — it is a ritual of hospitality, an expression of identity, and an invisible crown that accompanies you throughout the day. Unlike mass-market fragrances, creations from the Middle East are formulated with rich concentrations of natural oils, rare resins, and noble woods."}
            </p>
            <p>
              {isRu
                ? "В коллекции Al-Warda собраны знаковые бестселлеры и редкие нишевые жемчужины от ведущих парфюмерных домов Ближнего Востока. Мы тщательно отбираем каждый аромат, проверяем подлинность партий и гарантируем безупречное состояние каждого флакона."
                : "The Al-Warda collection unites iconic bestsellers and rare niche gems from the premier perfume houses of the Middle East. We curate every composition with care, verify batch authenticity, and guarantee pristine presentation in every bottle."}
            </p>
          </div>
        </div>
      </section>

      {/* 3. PILLARS */}
      <SectionDivider
        title={isRu ? "ЦЕННОСТИ ДОМА AL-WARDA" : "THE AL-WARDA PROMISE"}
        showMotif={true}
      />

      <section className="warda-about-pillars">
        {PILLARS.map((item, idx) => (
          <OrnateCard key={idx} className="warda-about-pillar-card">
            <div className="warda-about-pillar__icon">
              <i className={item.icon} />
            </div>
            <h3 className="warda-about-pillar__title">
              {isRu ? item.titleRu : item.titleEn}
            </h3>
            <p className="warda-about-pillar__desc">
              {isRu ? item.descRu : item.descEn}
            </p>
          </OrnateCard>
        ))}
      </section>

      {/* 4. PRECIOUS INGREDIENTS */}
      <SectionDivider
        title={isRu ? "ДРАГОЦЕННЫЕ НОТЫ И ИНГРЕДИЕНТЫ" : "PRECIOUS OLFACTORY INGREDIENTS"}
        showMotif={true}
      />

      <section className="warda-about-ingredients">
        {INGREDIENTS.map((ing, idx) => (
          <div key={idx} className="warda-about-ingredient-card">
            <div className="warda-about-ingredient__top">
              <span className="warda-about-ingredient__emoji" aria-hidden="true">
                {ing.icon}
              </span>
              <div>
                <h3 className="warda-about-ingredient__name">
                  {isRu ? ing.nameRu : ing.nameEn}
                </h3>
                <span className="warda-about-ingredient__role">
                  {isRu ? ing.roleRu : ing.roleEn}
                </span>
              </div>
            </div>
            <p className="warda-about-ingredient__desc">
              {isRu ? ing.descRu : ing.descEn}
            </p>
          </div>
        ))}
      </section>

      {/* 5. PARTNER HOUSES */}
      <SectionDivider
        title={isRu ? "ИЗБРАННЫЕ ПАРФЮМЕРНЫЕ ДОМА" : "FEATURED PERFUME HOUSES"}
        showMotif={true}
      />

      <section className="warda-about-houses">
        <p className="warda-about-houses__subtitle">
          {isRu
            ? "Нажмите на любой бренд, чтобы открыть его коллекцию в нашем каталоге:"
            : "Select any perfume house to explore its collection in our boutique:"}
        </p>
        <div className="warda-about-houses__list">
          {FEATURED_HOUSES.map((brand) => (
            <Link
              key={brand}
              to={`/featured?brand=${encodeURIComponent(brand)}`}
              className="warda-about-house-pill"
            >
              <span>{brand}</span>
              <i className="ri-arrow-right-up-line" />
            </Link>
          ))}
        </div>
      </section>

      {/* 6. CTA BANNER */}
      <section className="warda-about-cta">
        <h2 className="warda-about-cta__title">
          {isRu
            ? "Найдите свой знаковый восточный аромат"
            : "Discover Your Signature Oriental Scent"}
        </h2>
        <p className="warda-about-cta__desc">
          {isRu
            ? "Исследуйте основную коллекцию, выберите роскошный подарочный сет или обратитесь к нашему ИИ-консьержу Ясмин для персонального подбора."
            : "Explore our main collection, choose a luxury gift set, or consult our AI concierge Yasmin for a personalized recommendation."}
        </p>
        <div className="warda-about-cta__actions">
          <Link to="/featured" className="warda-btn">
            <i className="ri-compass-3-line" />
            <span>{isRu ? "ПЕРЕЙТИ В КАТАЛОГ" : "EXPLORE CATALOG"}</span>
          </Link>
          <Link to="/sets" className="warda-btn warda-about-cta__btn-secondary">
            <i className="ri-flask-line" />
            <span>{isRu ? "ПРОБУЙ И ОТКРЫВАЙ" : "TRY & DISCOVER"}</span>
          </Link>
          <button
            type="button"
            className="warda-btn warda-about-cta__btn-secondary"
            onClick={handleAskYasmin}
          >
            <i className="ri-sparkling-2-line" />
            <span>{isRu ? "ПОДОБРАТЬ С ЯСМИН" : "ASK YASMIN CONCIERGE"}</span>
          </button>
        </div>
      </section>

      <SensesMotif />
    </div>
  );
}
