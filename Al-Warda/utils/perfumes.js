import { PERFUMES, PERFUME_CATEGORIES, getPerfumeById as getLocalPerfumeById } from "../src/data/perfumesData.js";
import { isGeneratedProductImage } from "./generatedProductImage.js";

const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  "https://mfvenfrmlkxqgvdtedet.supabase.co";

const SUPABASE_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB";

const TABLE_PERFUMES = `${SUPABASE_URL}/rest/v1/stocks`;
let memoryPerfumesCache = null;
let catalogRefresh = null;
const PRODUCT_IMAGE_VERSION = "qogita-gemini-image-v3";

function resolveCardImage(img, gtin, rawImage) {
  if (img && /^https:\/\//i.test(img)) return img;
  if (gtin) return `/assets/img/products/${gtin}.jpg?v=${PRODUCT_IMAGE_VERSION}`;
  if (img && img.startsWith("/assets/img/")) {
    return `${img.split("?")[0]}?v=${PRODUCT_IMAGE_VERSION}`;
  }
  if (rawImage && /^https?:\/\//i.test(rawImage)) {
    return `/api/transparent-image?url=${encodeURIComponent(rawImage)}&v=${PRODUCT_IMAGE_VERSION}`;
  }
  return img || "";
}

function hasCompletedGeneratedImage(product) {
  const generation = product?.info?.imageGeneration;
  const image = generation?.imageUrl || product?.image;
  return (
    generation?.status === "completed" &&
    isGeneratedProductImage(image) &&
    (image.startsWith("/") || image.startsWith(`${SUPABASE_URL}/storage/v1/object/public/product-images/`))
  );
}

export function slugifyPerfumeName(name) {
  if (!name) return "perfume";
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getPerfumeUrl(perfume) {
  if (!perfume) return "/featured";
  const slug = slugifyPerfumeName(perfume.name || perfume.title);
  const id = perfume.id || "1";
  return `/perfume/${slug}-${id}`;
}


const SPECIFIC_PERFUME_PROFILES = [
  {
    match: ["supremacy noir"],
    category: "oud",
    categoryRu: "Уд и кожа",
    categoryEn: "Oud & Leather",
    ru: {
      top: ["Сицилийский бергамот", "Фиалка", "Еловая хвоя"],
      heart: ["Кожаный аккорд", "Французская лаванда", "Сосна"],
      base: ["Пачули", "Лабданум", "Благородный уд"],
    },
    en: {
      top: ["Sicilian Bergamot", "Violet", "Spruce"],
      heart: ["Leather Accord", "French Lavender", "Pine"],
      base: ["Patchouli", "Labdanum", "Precious Oud"],
    },
  },
  {
    match: ["9 pm pour femme", "9pm pour femme"],
    category: "floral",
    categoryRu: "Цветочные и фруктовые",
    categoryEn: "Floral & Fruity",
    ru: {
      top: ["Малина", "Зеленое яблоко", "Фиалка", "Мандарин"],
      heart: ["Дамасская роза", "Ирис", "Жасмин", "Пион"],
      base: ["Кедр", "Пачули", "Золотая амбра", "Ваниль"],
    },
    en: {
      top: ["Raspberry", "Green Apple", "Violet", "Mandarin"],
      heart: ["Damask Rose", "Iris", "Jasmine", "Peony"],
      base: ["Cedarwood", "Patchouli", "Golden Amber", "Vanilla"],
    },
  },
  {
    match: ["9 pm", "9pm"],
    category: "gourmand",
    categoryRu: "Гурманские и пряные",
    categoryEn: "Gourmand & Spicy",
    ru: {
      top: ["Бергамот", "Корица", "Французская лаванда", "Зеленое яблоко"],
      heart: ["Флердоранж", "Ландыш", "Кардамон"],
      base: ["Мадагаскарская ваниль", "Бобы тонка", "Золотая амбра", "Пачули"],
    },
    en: {
      top: ["Bergamot", "Cinnamon", "French Lavender", "Green Apple"],
      heart: ["Orange Blossom", "Lily of the Valley", "Cardamom"],
      base: ["Madagascar Vanilla", "Tonka Bean", "Golden Amber", "Patchouli"],
    },
  },
  {
    match: ["9 am dive", "9am dive"],
    category: "fresh",
    categoryRu: "Свежие и акватические",
    categoryEn: "Fresh & Aquatic",
    ru: {
      top: ["Лимон", "Грейпфрут", "Свежая мята", "Розовый перец", "Черная смородина"],
      heart: ["Зеленое яблоко", "Дымный ладан", "Кедр", "Морской бриз"],
      base: ["Пачули", "Имбирь", "Сандал", "Белый мускус"],
    },
    en: {
      top: ["Lemon", "Grapefruit", "Fresh Mint", "Pink Pepper", "Blackcurrant"],
      heart: ["Green Apple", "Frankincense", "Cedarwood", "Sea Breeze"],
      base: ["Patchouli", "Ginger", "Sandalwood", "White Musk"],
    },
  },
  {
    match: ["abadi saga"],
    category: "fougere",
    categoryRu: "Фужерные и цитрусовые",
    categoryEn: "Fougère & Citrus",
    ru: {
      top: ["Сицилийский бергамот", "Грейпфрут", "Имбирь", "Кардамон"],
      heart: ["Французская лаванда", "Дубовый мох", "Шалфей"],
      base: ["Ветивер", "Благородный кедр", "Серая амбра", "Пачули"],
    },
    en: {
      top: ["Sicilian Bergamot", "Grapefruit", "Ginger", "Cardamom"],
      heart: ["French Lavender", "Oakmoss", "Clary Sage"],
      base: ["Vetiver", "Noble Cedar", "Grey Amber", "Patchouli"],
    },
  },
  {
    match: ["amber is great"],
    category: "gourmand",
    categoryRu: "Гурманские и амбровые",
    categoryEn: "Gourmand & Amber",
    ru: {
      top: ["Шафран", "Бергамот", "Персик", "Мандарин"],
      heart: ["Золотая амбра", "Карамель", "Груша", "Древесные ноты"],
      base: ["Мадагаскарская ваниль", "Белый мускус", "Сандал", "Благородный уд"],
    },
    en: {
      top: ["Saffron", "Bergamot", "Peach", "Mandarin"],
      heart: ["Golden Amber", "Caramel", "Pear", "Woody Notes"],
      base: ["Madagascar Vanilla", "White Musk", "Sandalwood", "Precious Oud"],
    },
  },
  {
    match: ["supremacy gold"],
    category: "gourmand",
    categoryRu: "Восточные и гурманские",
    categoryEn: "Oriental & Gourmand",
    ru: {
      top: ["Фиалка", "Мускатный орех", "Персик", "Кумин"],
      heart: ["Ирис", "Пачули", "Дамасская роза"],
      base: ["Мадагаскарская ваниль", "Золотая амбра", "Благородный уд", "Бобы тонка"],
    },
    en: {
      top: ["Violet", "Nutmeg", "Peach", "Cumin"],
      heart: ["Iris", "Patchouli", "Damask Rose"],
      base: ["Madagascar Vanilla", "Golden Amber", "Precious Oud", "Tonka Bean"],
    },
  },
  {
    match: ["ornament purple"],
    category: "floral",
    categoryRu: "Цветочные и гурманские",
    categoryEn: "Floral & Gourmand",
    ru: {
      top: ["Малина", "Персик", "Мандарин", "Грейпфрут"],
      heart: ["Флердоранж", "Жасмин", "Кардамон", "Иланг-иланг"],
      base: ["Ваниль", "Белый мускус", "Пачули", "Миндаль", "Золотая амбра"],
    },
    en: {
      top: ["Raspberry", "Peach", "Mandarin", "Grapefruit"],
      heart: ["Orange Blossom", "Jasmine", "Cardamom", "Ylang-Ylang"],
      base: ["Vanilla", "White Musk", "Patchouli", "Almond", "Golden Amber"],
    },
  },
  {
    match: ["ornament pour homme"],
    category: "fougere",
    categoryRu: "Фужерные и пряные",
    categoryEn: "Fougère & Spicy",
    ru: {
      top: ["Зеленое яблоко", "Кардамон", "Черный перец", "Мускатный орех"],
      heart: ["Французская лаванда", "Герань", "Пачули", "Гвоздика"],
      base: ["Кедр", "Кожаный аккорд", "Сандал", "Золотая амбра", "Ветивер"],
    },
    en: {
      top: ["Green Apple", "Cardamom", "Black Pepper", "Nutmeg"],
      heart: ["French Lavender", "Geranium", "Patchouli", "Clove"],
      base: ["Cedarwood", "Leather Accord", "Sandalwood", "Golden Amber", "Vetiver"],
    },
  },
  {
    match: ["mirsaal of trust"],
    category: "spicy",
    categoryRu: "Кожаные и пряные",
    categoryEn: "Leather & Spicy",
    ru: {
      top: ["Ветивер", "Амброксан", "Шафран"],
      heart: ["Малина", "Кожаный аккорд", "Кашмеран"],
      base: ["Золотая амбра", "Гвоздика", "Белый мускус", "Кедр"],
    },
    en: {
      top: ["Vetiver", "Ambroxan", "Saffron"],
      heart: ["Raspberry", "Leather Accord", "Cashmeran"],
      base: ["Golden Amber", "Clove", "White Musk", "Cedarwood"],
    },
  },
  {
    match: ["highness iv red"],
    category: "spicy",
    categoryRu: "Пряные и удовые",
    categoryEn: "Spicy & Oud",
    ru: {
      top: ["Сицилийский бергамот", "Лимон", "Кардамон", "Корица"],
      heart: ["Дамасская роза", "Благородный уд", "Кожаный аккорд"],
      base: ["Серая амбра", "Белый мускус", "Сандал", "Пачули"],
    },
    en: {
      top: ["Sicilian Bergamot", "Lemon", "Cardamom", "Cinnamon"],
      heart: ["Damask Rose", "Precious Oud", "Leather Accord"],
      base: ["Grey Amber", "White Musk", "Sandalwood", "Patchouli"],
    },
  },
  {
    match: ["highness iii green"],
    category: "fougere",
    categoryRu: "Фужерные и древесные",
    categoryEn: "Fougère & Woody",
    ru: {
      top: ["Бергамот", "Кипарис", "Розовый перец", "Мускатный орех"],
      heart: ["Французская лаванда", "Дубовый мох", "Кедр", "Шалфей"],
      base: ["Благородный уд", "Кожаный аккорд", "Ветивер", "Серая амбра"],
    },
    en: {
      top: ["Bergamot", "Cypress", "Pink Pepper", "Nutmeg"],
      heart: ["French Lavender", "Oakmoss", "Cedarwood", "Clary Sage"],
      base: ["Precious Oud", "Leather Accord", "Vetiver", "Grey Amber"],
    },
  },
  {
    match: ["highness vi blue"],
    category: "fresh",
    categoryRu: "Свежие и морские",
    categoryEn: "Fresh & Marine",
    ru: {
      top: ["Сицилийский бергамот", "Грейпфрут", "Морской бриз", "Мандарин"],
      heart: ["Французская лаванда", "Мускатный орех", "Свежая мята", "Фиалка"],
      base: ["Пачули", "Серая амбра", "Дубовый мох", "Белый мускус"],
    },
    en: {
      top: ["Sicilian Bergamot", "Grapefruit", "Sea Breeze", "Mandarin"],
      heart: ["French Lavender", "Nutmeg", "Fresh Mint", "Violet"],
      base: ["Patchouli", "Grey Amber", "Oakmoss", "White Musk"],
    },
  },
  {
    match: ["his highness white"],
    category: "citrus-fresh",
    categoryRu: "Цитрусовые и свежие",
    categoryEn: "Citrus & Fresh",
    ru: {
      top: ["Сицилийский бергамот", "Грейпфрут", "Мандарин", "Черная смородина"],
      heart: ["Французская лаванда", "Фиалка", "Флердоранж", "Сандал"],
      base: ["Белый мускус", "Дубовый мох", "Золотая амбра", "Ветивер"],
    },
    en: {
      top: ["Sicilian Bergamot", "Grapefruit", "Mandarin", "Blackcurrant"],
      heart: ["French Lavender", "Violet", "Orange Blossom", "Sandalwood"],
      base: ["White Musk", "Oakmoss", "Golden Amber", "Vetiver"],
    },
  },
  {
    match: ["desert rose"],
    category: "floral",
    categoryRu: "Цветочные и фруктовые",
    categoryEn: "Floral & Fruity",
    ru: {
      top: ["Персик", "Малина", "Черная смородина", "Карамель"],
      heart: ["Дамасская роза", "Белый мускус", "Жасмин"],
      base: ["Сандал", "Мандарин", "Золотая амбра", "Ваниль"],
    },
    en: {
      top: ["Peach", "Raspberry", "Blackcurrant", "Caramel"],
      heart: ["Damask Rose", "White Musk", "Jasmine"],
      base: ["Sandalwood", "Mandarin", "Golden Amber", "Vanilla"],
    },
  },
  {
    match: ["blooming bliss"],
    category: "gourmand",
    categoryRu: "Гурманские и цветочные",
    categoryEn: "Gourmand & Floral",
    ru: {
      top: ["Мадагаскарская ваниль", "Бергамот", "Груша"],
      heart: ["Карамель", "Пачули", "Миндаль", "Жасмин"],
      base: ["Сандал", "Белый мускус", "Бобы тонка", "Кокос"],
    },
    en: {
      top: ["Madagascar Vanilla", "Bergamot", "Pear"],
      heart: ["Caramel", "Patchouli", "Almond", "Jasmine"],
      base: ["Sandalwood", "White Musk", "Tonka Bean", "Coconut"],
    },
  },
  {
    match: ["amberythme"],
    category: "gourmand",
    categoryRu: "Гурманские и пряные",
    categoryEn: "Gourmand & Spicy",
    ru: {
      top: ["Корица", "Бобы тонка", "Шафран", "Бергамот"],
      heart: ["Ваниль", "Жасмин", "Золотая амбра", "Карамель"],
      base: ["Серая амбра", "Сандал", "Кедр", "Миндаль"],
    },
    en: {
      top: ["Cinnamon", "Tonka Bean", "Saffron", "Bergamot"],
      heart: ["Vanilla", "Jasmine", "Golden Amber", "Caramel"],
      base: ["Grey Amber", "Sandalwood", "Cedarwood", "Almond"],
    },
  },
  {
    match: ["patchouli on fire"],
    category: "spicy",
    categoryRu: "Древесные и пряные",
    categoryEn: "Woody & Spicy",
    ru: {
      top: ["Дымный ладан", "Розовый перец", "Корица", "Бергамот"],
      heart: ["Пачули", "Ирис", "Французская лаванда"],
      base: ["Пачули", "Кожаный аккорд", "Ветивер", "Сандал", "Золотая амбра"],
    },
    en: {
      top: ["Smoky Frankincense", "Pink Pepper", "Cinnamon", "Bergamot"],
      heart: ["Patchouli", "Iris", "French Lavender"],
      base: ["Patchouli", "Leather Accord", "Vetiver", "Sandalwood", "Golden Amber"],
    },
  },
  {
    match: ["rare tiffany"],
    category: "floral",
    categoryRu: "Цветочные и гурманские",
    categoryEn: "Floral & Gourmand",
    ru: {
      top: ["Дамасская роза", "Иланг-иланг", "Жасмин", "Мандарин"],
      heart: ["Карамель", "Мадагаскарская ваниль", "Белый мускус", "Персик"],
      base: ["Сандал", "Розовый перец", "Имбирь", "Золотая амбра"],
    },
    en: {
      top: ["Damask Rose", "Ylang-Ylang", "Jasmine", "Mandarin"],
      heart: ["Caramel", "Madagascar Vanilla", "White Musk", "Peach"],
      base: ["Sandalwood", "Pink Pepper", "Ginger", "Golden Amber"],
    },
  },
  {
    match: ["rare passion"],
    category: "floral",
    categoryRu: "Цветочные и восточные",
    categoryEn: "Floral & Oriental",
    ru: {
      top: ["Дамасская роза", "Мандарин", "Белый мускус", "Бергамот"],
      heart: ["Золотая амбра", "Ваниль", "Фиалка", "Ирис"],
      base: ["Белый мускус", "Кожаный аккорд", "Сандал", "Кедр"],
    },
    en: {
      top: ["Damask Rose", "Mandarin", "White Musk", "Bergamot"],
      heart: ["Golden Amber", "Vanilla", "Violet", "Iris"],
      base: ["White Musk", "Leather Accord", "Sandalwood", "Cedarwood"],
    },
  },
  {
    match: ["supremacy incense"],
    category: "oud",
    categoryRu: "Уд и дым",
    categoryEn: "Oud & Smoke",
    ru: {
      top: ["Бергамот", "Кардамон", "Розовый перец", "Шалфей"],
      heart: ["Дымный ладан", "Золотая амбра", "Опопонакс", "Лабданум"],
      base: ["Благородный уд", "Кожаный аккорд", "Пачули", "Сандал"],
    },
    en: {
      top: ["Bergamot", "Cardamom", "Pink Pepper", "Clary Sage"],
      heart: ["Smoky Frankincense", "Golden Amber", "Opoponax", "Labdanum"],
      base: ["Precious Oud", "Leather Accord", "Patchouli", "Sandalwood"],
    },
  },
  {
    match: ["not only intense"],
    category: "citrus-fresh",
    categoryRu: "Цитрусовые и фужерные",
    categoryEn: "Citrus & Fougère",
    ru: {
      top: ["Черная смородина", "Сицилийский бергамот", "Зеленое яблоко", "Грейпфрут"],
      heart: ["Дубовый мох", "Пачули", "Французская лаванда", "Кардамон"],
      base: ["Серая амбра", "Шафран", "Белый мускус", "Ветивер"],
    },
    en: {
      top: ["Blackcurrant", "Sicilian Bergamot", "Green Apple", "Grapefruit"],
      heart: ["Oakmoss", "Patchouli", "French Lavender", "Cardamom"],
      base: ["Grey Amber", "Saffron", "White Musk", "Vetiver"],
    },
  },
  {
    match: ["supremacy silver", "supermacy silver"],
    category: "citrus-fresh",
    categoryRu: "Цитрусовые и свежие",
    categoryEn: "Citrus & Fresh",
    ru: {
      top: ["Зеленое яблоко", "Сицилийский бергамот", "Черная смородина", "Грейпфрут"],
      heart: ["Дамасская роза", "Береза", "Жасмин", "Пачули"],
      base: ["Дубовый мох", "Белый мускус", "Серая амбра", "Ваниль"],
    },
    en: {
      top: ["Green Apple", "Sicilian Bergamot", "Blackcurrant", "Grapefruit"],
      heart: ["Damask Rose", "Birch", "Jasmine", "Patchouli"],
      base: ["Oakmoss", "White Musk", "Grey Amber", "Vanilla"],
    },
  },
  {
    match: ["supremacy pink"],
    category: "floral",
    categoryRu: "Цветочные и пудровые",
    categoryEn: "Floral & Powdery",
    ru: {
      top: ["Розовый перец", "Фиалка", "Персик"],
      heart: ["Дамасская роза", "Пион", "Жасмин", "Ирис"],
      base: ["Белый мускус", "Золотая амбра", "Сандал"],
    },
    en: {
      top: ["Pink Pepper", "Violet", "Peach"],
      heart: ["Damask Rose", "Peony", "Jasmine", "Iris"],
      base: ["White Musk", "Golden Amber", "Sandalwood"],
    },
  },
  {
    match: ["supremacy gala"],
    category: "gourmand",
    categoryRu: "Гурманские и цветочные",
    categoryEn: "Gourmand & Floral",
    ru: {
      top: ["Груша", "Мандарин", "Черная смородина"],
      heart: ["Флердоранж", "Жасмин", "Карамель", "Персик"],
      base: ["Мадагаскарская ваниль", "Миндаль", "Пачули", "Сандал", "Бобы тонка"],
    },
    en: {
      top: ["Pear", "Mandarin", "Blackcurrant"],
      heart: ["Orange Blossom", "Jasmine", "Caramel", "Peach"],
      base: ["Madagascar Vanilla", "Almond", "Patchouli", "Sandalwood", "Tonka Bean"],
    },
  },
  {
    match: ["supremacy in oud"],
    category: "oud",
    categoryRu: "Уд и специи",
    categoryEn: "Oud & Spices",
    ru: {
      top: ["Шафран", "Мускатный орех", "Французская лаванда"],
      heart: ["Благородный уд", "Карамель", "Дымный ладан"],
      base: ["Пачули", "Белый мускус", "Золотая амбра"],
    },
    en: {
      top: ["Saffron", "Nutmeg", "French Lavender"],
      heart: ["Precious Oud", "Caramel", "Smoky Frankincense"],
      base: ["Patchouli", "White Musk", "Golden Amber"],
    },
  },
  {
    match: ["kiaana crush", "kiana crush"],
    category: "gourmand",
    categoryRu: "Гурманские и фруктовые",
    categoryEn: "Gourmand & Fruity",
    ru: {
      top: ["Шафран", "Персик", "Груша"],
      heart: ["Благородный уд", "Пачули", "Ирис", "Карамель"],
      base: ["Мадагаскарская ваниль", "Золотая амбра", "Белый мускус", "Сандал"],
    },
    en: {
      top: ["Saffron", "Peach", "Pear"],
      heart: ["Precious Oud", "Patchouli", "Iris", "Caramel"],
      base: ["Madagascar Vanilla", "Golden Amber", "White Musk", "Sandalwood"],
    },
  },
  {
    match: ["cherry bouquet"],
    category: "gourmand",
    categoryRu: "Гурманские и вишневые",
    categoryEn: "Gourmand & Cherry",
    ru: {
      top: ["Спелая вишня", "Миндаль", "Черная смородина"],
      heart: ["Дамасская роза", "Жасмин самбак", "Корица"],
      base: ["Мадагаскарская ваниль", "Бобы тонка", "Пачули", "Сандал"],
    },
    en: {
      top: ["Ripe Cherry", "Almond", "Blackcurrant"],
      heart: ["Damask Rose", "Jasmine Sambac", "Cinnamon"],
      base: ["Madagascar Vanilla", "Tonka Bean", "Patchouli", "Sandalwood"],
    },
  },
  {
    match: ["modest une"],
    category: "fougere",
    categoryRu: "Фужерные и свежие",
    categoryEn: "Fougère & Fresh",
    ru: {
      top: ["Розовый перец", "Французская лаванда", "Свежая мята", "Мускатный орех"],
      heart: ["Сицилийский бергамот", "Грейпфрут", "Кедр"],
      base: ["Серая амбра", "Ветивер", "Белый мускус", "Пачули"],
    },
    en: {
      top: ["Pink Pepper", "French Lavender", "Fresh Mint", "Nutmeg"],
      heart: ["Sicilian Bergamot", "Grapefruit", "Cedarwood"],
      base: ["Grey Amber", "Vetiver", "White Musk", "Patchouli"],
    },
  },
  {
    match: ["oud rising"],
    category: "oud",
    categoryRu: "Уд и древесные",
    categoryEn: "Oud & Woody",
    ru: {
      top: ["Кипарис", "Флердоранж", "Кардамон", "Бергамот"],
      heart: ["Благородный уд", "Дымный ладан", "Кожаный аккорд", "Пачули"],
      base: ["Бобы тонка", "Серая амбра", "Ветивер", "Белый мускус"],
    },
    en: {
      top: ["Cypress", "Orange Blossom", "Cardamom", "Bergamot"],
      heart: ["Precious Oud", "Smoky Frankincense", "Leather Accord", "Patchouli"],
      base: ["Tonka Bean", "Grey Amber", "Vetiver", "White Musk"],
    },
  },
  {
    match: ["stardust"],
    category: "gourmand",
    categoryRu: "Гурманские и цветочные",
    categoryEn: "Gourmand & Floral",
    ru: {
      top: ["Мандарин", "Бергамот", "Груша"],
      heart: ["Дамасская роза", "Жасмин", "Флердоранж", "Карамель"],
      base: ["Мадагаскарская ваниль", "Белый мускус", "Сандал", "Пачули"],
    },
    en: {
      top: ["Mandarin", "Bergamot", "Pear"],
      heart: ["Damask Rose", "Jasmine", "Orange Blossom", "Caramel"],
      base: ["Madagascar Vanilla", "White Musk", "Sandalwood", "Patchouli"],
    },
  },
  {
    match: ["night shadow"],
    category: "oud",
    categoryRu: "Уд и табак",
    categoryEn: "Oud & Tobacco",
    ru: {
      top: ["Дымный ладан", "Шафран", "Малина", "Кардамон"],
      heart: ["Благородный уд", "Дамасская роза", "Кожаный аккорд", "Пачули"],
      base: ["Табачный лист", "Серая амбра", "Кедр", "Бобы тонка"],
    },
    en: {
      top: ["Smoky Frankincense", "Saffron", "Raspberry", "Cardamom"],
      heart: ["Precious Oud", "Damask Rose", "Leather Accord", "Patchouli"],
      base: ["Tobacco Leaf", "Grey Amber", "Cedarwood", "Tonka Bean"],
    },
  },
  {
    match: ["zimaya cult", "cult eau"],
    category: "fougere",
    categoryRu: "Фужерные и свежие",
    categoryEn: "Fougère & Fresh",
    ru: {
      top: ["Сицилийский бергамот", "Зеленое яблоко", "Имбирь", "Французская лаванда"],
      heart: ["Шалфей", "Свежая мята", "Герань", "Дубовый мох"],
      base: ["Ветивер", "Кедр", "Бобы тонка", "Золотая амбра"],
    },
    en: {
      top: ["Sicilian Bergamot", "Green Apple", "Ginger", "French Lavender"],
      heart: ["Clary Sage", "Fresh Mint", "Geranium", "Oakmoss"],
      base: ["Vetiver", "Cedarwood", "Tonka Bean", "Golden Amber"],
    },
  },
  {
    match: ["enroute"],
    category: "spicy",
    categoryRu: "Пряные и кофейные",
    categoryEn: "Spicy & Coffee",
    ru: {
      top: ["Кофе", "Кардамон", "Бергамот", "Корица"],
      heart: ["Табачный лист", "Французская лаванда", "Кожаный аккорд", "Ирис"],
      base: ["Бобы тонка", "Мадагаскарская ваниль", "Сандал", "Пачули"],
    },
    en: {
      top: ["Coffee", "Cardamom", "Bergamot", "Cinnamon"],
      heart: ["Tobacco Leaf", "French Lavender", "Leather Accord", "Iris"],
      base: ["Tonka Bean", "Madagascar Vanilla", "Sandalwood", "Patchouli"],
    },
  },
  {
    match: ["naseej al khuzama"],
    category: "fougere",
    categoryRu: "Фужерные и лавандовые",
    categoryEn: "Fougère & Lavender",
    ru: {
      top: ["Французская лаванда", "Сицилийский бергамот", "Мандарин"],
      heart: ["Флердоранж", "Жасмин", "Фиалка", "Ирис"],
      base: ["Мадагаскарская ваниль", "Белый мускус", "Бобы тонка", "Серая амбра"],
    },
    en: {
      top: ["French Lavender", "Sicilian Bergamot", "Mandarin"],
      heart: ["Orange Blossom", "Jasmine", "Violet", "Iris"],
      base: ["Madagascar Vanilla", "White Musk", "Tonka Bean", "Grey Amber"],
    },
  },
  {
    match: ["paris oud"],
    category: "oud",
    categoryRu: "Уд и роза",
    categoryEn: "Oud & Rose",
    ru: {
      top: ["Черная смородина", "Мандарин", "Бергамот", "Персик"],
      heart: ["Дамасская роза", "Благородный уд", "Жасмин"],
      base: ["Белый мускус", "Ваниль", "Золотая амбра", "Сандал"],
    },
    en: {
      top: ["Blackcurrant", "Mandarin", "Bergamot", "Peach"],
      heart: ["Damask Rose", "Precious Oud", "Jasmine"],
      base: ["White Musk", "Vanilla", "Golden Amber", "Sandalwood"],
    },
  },
  {
    match: ["naseej al ward"],
    category: "floral",
    categoryRu: "Цветочные и удовые",
    categoryEn: "Floral & Oud",
    ru: {
      top: ["Дамасская роза", "Малина", "Шафран"],
      heart: ["Таифская роза", "Пачули", "Фиалка", "Жасмин"],
      base: ["Благородный уд", "Белый мускус", "Золотая амбра", "Ваниль"],
    },
    en: {
      top: ["Damask Rose", "Raspberry", "Saffron"],
      heart: ["Taif Rose", "Patchouli", "Violet", "Jasmine"],
      base: ["Precious Oud", "White Musk", "Golden Amber", "Vanilla"],
    },
  },
  {
    match: ["musk abiyad", "silver musk"],
    category: "floral",
    categoryRu: "Мускусные и пудровые",
    categoryEn: "Musky & Powdery",
    ru: {
      top: ["Белый мускус", "Флердоранж", "Бергамот"],
      heart: ["Ирис", "Дамасская роза", "Фиалка", "Жасмин"],
      base: ["Сандал", "Белый мускус", "Бобы тонка", "Золотая амбра"],
    },
    en: {
      top: ["White Musk", "Orange Blossom", "Bergamot"],
      heart: ["Iris", "Damask Rose", "Violet", "Jasmine"],
      base: ["Sandalwood", "White Musk", "Tonka Bean", "Golden Amber"],
    },
  },
  {
    match: ["adwaa al sharq"],
    category: "spicy",
    categoryRu: "Пряные и восточные",
    categoryEn: "Spicy & Oriental",
    ru: {
      top: ["Шафран", "Кардамон", "Сицилийский бергамот"],
      heart: ["Дамасская роза", "Золотая амбра", "Корица"],
      base: ["Благородный уд", "Сандал", "Белый мускус", "Дымный ладан"],
    },
    en: {
      top: ["Saffron", "Cardamom", "Sicilian Bergamot"],
      heart: ["Damask Rose", "Golden Amber", "Cinnamon"],
      base: ["Precious Oud", "Sandalwood", "White Musk", "Smoky Frankincense"],
    },
  },
  {
    match: ["sandal abiyad"],
    category: "oud",
    categoryRu: "Древесные и сандаловые",
    categoryEn: "Woody & Sandalwood",
    ru: {
      top: ["Кардамон", "Бергамот", "Фиалка"],
      heart: ["Сандал", "Ирис", "Кедр", "Дамасская роза"],
      base: ["Белый мускус", "Сандаловое дерево", "Золотая амбра", "Кожаный аккорд"],
    },
    en: {
      top: ["Cardamom", "Bergamot", "Violet"],
      heart: ["Sandalwood", "Iris", "Cedarwood", "Damask Rose"],
      base: ["White Musk", "Sandalwood", "Golden Amber", "Leather Accord"],
    },
  },
  {
    match: ["fakhr"],
    category: "oud",
    categoryRu: "Уд и специи",
    categoryEn: "Oud & Spices",
    ru: {
      top: ["Шафран", "Корица", "Дымный ладан"],
      heart: ["Благородный уд", "Дамасская роза", "Пачули"],
      base: ["Золотая амбра", "Кожаный аккорд", "Сандал", "Табачный лист"],
    },
    en: {
      top: ["Saffron", "Cinnamon", "Smoky Frankincense"],
      heart: ["Precious Oud", "Damask Rose", "Patchouli"],
      base: ["Golden Amber", "Leather Accord", "Sandalwood", "Tobacco Leaf"],
    },
  },
  {
    match: ["pink rose", "rose d' arabia", "soft & floral"],
    category: "floral",
    categoryRu: "Цветочные и розовые",
    categoryEn: "Floral & Rose",
    ru: {
      top: ["Дамасская роза", "Пион", "Мандарин"],
      heart: ["Таифская роза", "Жасмин", "Фиалка", "Иланг-иланг"],
      base: ["Белый мускус", "Ваниль", "Сандал"],
    },
    en: {
      top: ["Damask Rose", "Peony", "Mandarin"],
      heart: ["Taif Rose", "Jasmine", "Violet", "Ylang-Ylang"],
      base: ["White Musk", "Vanilla", "Sandalwood"],
    },
  },
  {
    match: ["tribute white"],
    category: "floral",
    categoryRu: "Цветочные и свежие",
    categoryEn: "Floral & Fresh",
    ru: {
      top: ["Груша", "Сицилийский бергамот", "Флердоранж"],
      heart: ["Жасмин", "Ирис", "Дамасская роза"],
      base: ["Белый мускус", "Мадагаскарская ваниль", "Кедр", "Сандал"],
    },
    en: {
      top: ["Pear", "Sicilian Bergamot", "Orange Blossom"],
      heart: ["Jasmine", "Iris", "Damask Rose"],
      base: ["White Musk", "Madagascar Vanilla", "Cedarwood", "Sandalwood"],
    },
  },
  {
    match: ["naseej al kiswah"],
    category: "oud",
    categoryRu: "Уд и ладан",
    categoryEn: "Oud & Incense",
    ru: {
      top: ["Шафран", "Дымный ладан", "Розовый перец"],
      heart: ["Благородный уд", "Дамасская роза", "Пачули"],
      base: ["Серая амбра", "Сандал", "Белый мускус", "Кожаный аккорд"],
    },
    en: {
      top: ["Saffron", "Smoky Frankincense", "Pink Pepper"],
      heart: ["Precious Oud", "Damask Rose", "Patchouli"],
      base: ["Grey Amber", "Sandalwood", "White Musk", "Leather Accord"],
    },
  },
  {
    match: ["palace of dreams"],
    category: "gourmand",
    categoryRu: "Гурманские и кофейные",
    categoryEn: "Gourmand & Coffee",
    ru: {
      top: ["Карамель", "Миндаль", "Груша", "Персик"],
      heart: ["Мадагаскарская ваниль", "Кофе", "Жасмин", "Дамасская роза"],
      base: ["Бобы тонка", "Белый мускус", "Сандал", "Золотая амбра"],
    },
    en: {
      top: ["Caramel", "Almond", "Pear", "Peach"],
      heart: ["Madagascar Vanilla", "Coffee", "Jasmine", "Damask Rose"],
      base: ["Tonka Bean", "White Musk", "Sandalwood", "Golden Amber"],
    },
  },
  {
    match: ["evoke gold"],
    category: "floral",
    categoryRu: "Цветочные и фруктовые",
    categoryEn: "Floral & Fruity",
    ru: {
      top: ["Розовый перец", "Черная смородина", "Зеленое яблоко"],
      heart: ["Пион", "Дамасская роза", "Жасмин"],
      base: ["Мадагаскарская ваниль", "Белый мускус", "Бобы тонка", "Сандал"],
    },
    en: {
      top: ["Pink Pepper", "Blackcurrant", "Green Apple"],
      heart: ["Peony", "Damask Rose", "Jasmine"],
      base: ["Madagascar Vanilla", "White Musk", "Tonka Bean", "Sandalwood"],
    },
  },
  {
    match: ["amaze her"],
    category: "citrus-fresh",
    categoryRu: "Цитрусовые и цветочные",
    categoryEn: "Citrus & Floral",
    ru: {
      top: ["Флердоранж", "Мандарин", "Сицилийский бергамот", "Груша"],
      heart: ["Дамасская роза", "Персик", "Жасмин"],
      base: ["Белый мускус", "Бобы тонка", "Мадагаскарская ваниль"],
    },
    en: {
      top: ["Orange Blossom", "Mandarin", "Sicilian Bergamot", "Pear"],
      heart: ["Damask Rose", "Peach", "Jasmine"],
      base: ["White Musk", "Tonka Bean", "Madagascar Vanilla"],
    },
  },
  {
    match: ["incense wood"],
    category: "oud",
    categoryRu: "Уд и дым",
    categoryEn: "Oud & Smoke",
    ru: {
      top: ["Кардамон", "Розовый перец", "Бергамот", "Шафран"],
      heart: ["Дымный ладан", "Кедр", "Пачули"],
      base: ["Благородный уд", "Сандал", "Ваниль", "Белый мускус"],
    },
    en: {
      top: ["Cardamom", "Pink Pepper", "Bergamot", "Saffron"],
      heart: ["Smoky Frankincense", "Cedarwood", "Patchouli"],
      base: ["Precious Oud", "Sandalwood", "Vanilla", "White Musk"],
    },
  },
  {
    match: ["kuro"],
    category: "fresh",
    categoryRu: "Свежие и пряные",
    categoryEn: "Fresh & Spicy",
    ru: {
      top: ["Сицилийский бергамот", "Морской бриз", "Розовый перец", "Имбирь"],
      heart: ["Французская лаванда", "Герань", "Свежая мята", "Дубовый мох"],
      base: ["Ветивер", "Пачули", "Серая амбра", "Кедр"],
    },
    en: {
      top: ["Sicilian Bergamot", "Sea Breeze", "Pink Pepper", "Ginger"],
      heart: ["French Lavender", "Geranium", "Fresh Mint", "Oakmoss"],
      base: ["Vetiver", "Patchouli", "Grey Amber", "Cedarwood"],
    },
  },
  {
    match: ["amber leather"],
    category: "oud",
    categoryRu: "Кожаные и амбровые",
    categoryEn: "Leather & Amber",
    ru: {
      top: ["Кардамон", "Шафран", "Розовый перец"],
      heart: ["Кожаный аккорд", "Жасмин самбак", "Дымный ладан"],
      base: ["Золотая амбра", "Пачули", "Дубовый мох", "Благородный уд"],
    },
    en: {
      top: ["Cardamom", "Saffron", "Pink Pepper"],
      heart: ["Leather Accord", "Jasmine Sambac", "Smoky Frankincense"],
      base: ["Golden Amber", "Patchouli", "Oakmoss", "Precious Oud"],
    },
  },
  {
    match: ["evoke midnight"],
    category: "spicy",
    categoryRu: "Пряные и ягодные",
    categoryEn: "Spicy & Berry",
    ru: {
      top: ["Малина", "Черная смородина", "Розовый перец", "Спелая вишня"],
      heart: ["Фиалка", "Дамасская роза", "Шафран", "Кофе"],
      base: ["Пачули", "Белый мускус", "Бобы тонка", "Ваниль"],
    },
    en: {
      top: ["Raspberry", "Blackcurrant", "Pink Pepper", "Ripe Cherry"],
      heart: ["Violet", "Damask Rose", "Saffron", "Coffee"],
      base: ["Patchouli", "White Musk", "Tonka Bean", "Vanilla"],
    },
  },
  {
    match: ["evoke her"],
    category: "citrus-fresh",
    categoryRu: "Цитрусовые и шипровые",
    categoryEn: "Citrus & Chypre",
    ru: {
      top: ["Сицилийский бергамот", "Розовый перец", "Грейпфрут"],
      heart: ["Дамасская роза", "Ирис", "Жасмин"],
      base: ["Пачули", "Мадагаскарская ваниль", "Дубовый мох", "Белый мускус"],
    },
    en: {
      top: ["Sicilian Bergamot", "Pink Pepper", "Grapefruit"],
      heart: ["Damask Rose", "Iris", "Jasmine"],
      base: ["Patchouli", "Madagascar Vanilla", "Oakmoss", "White Musk"],
    },
  },
  {
    match: ["aristocrat"],
    category: "citrus-fresh",
    categoryRu: "Цитрусовые и амбровые",
    categoryEn: "Citrus & Amber",
    ru: {
      top: ["Мандарин", "Сицилийский бергамот", "Грейпфрут"],
      heart: ["Шафран", "Карамель", "Жасмин"],
      base: ["Золотая амбра", "Дубовый мох", "Белый мускус", "Благородный уд"],
    },
    en: {
      top: ["Mandarin", "Sicilian Bergamot", "Grapefruit"],
      heart: ["Saffron", "Caramel", "Jasmine"],
      base: ["Golden Amber", "Oakmoss", "White Musk", "Precious Oud"],
    },
  },
  {
    match: ["shadow for her"],
    category: "floral",
    categoryRu: "Цветочные и древесные",
    categoryEn: "Floral & Woody",
    ru: {
      top: ["Французская лаванда", "Персик", "Мандарин"],
      heart: ["Флердоранж", "Пачули", "Иланг-иланг", "Дамасская роза"],
      base: ["Белый мускус", "Серая амбра", "Кедр", "Сандал"],
    },
    en: {
      top: ["French Lavender", "Peach", "Mandarin"],
      heart: ["Orange Blossom", "Patchouli", "Ylang-Ylang", "Damask Rose"],
      base: ["White Musk", "Grey Amber", "Cedarwood", "Sandalwood"],
    },
  },
];

export function inferPerfumeProfile(perfume) {
  const name = ((perfume && (perfume.name || perfume.title)) || "").toLowerCase();
  const cat = ((perfume && (perfume.category || perfume.categoryRu || perfume.info?.category)) || "").toLowerCase();

  for (const profile of SPECIFIC_PERFUME_PROFILES) {
    if (profile.match.some((kw) => name.includes(kw))) {
      return profile;
    }
  }

  if (name.includes("cherry") || name.includes("вишн")) {
    return {
      category: "gourmand",
      categoryRu: "Гурманские",
      categoryEn: "Gourmand",
      ru: {
        top: ["Спелая вишня", "Миндаль", "Черная смородина"],
        heart: ["Дамасская роза", "Жасмин", "Корица"],
        base: ["Мадагаскарская ваниль", "Бобы тонка", "Сандал"],
      },
      en: {
        top: ["Ripe Cherry", "Almond", "Blackcurrant"],
        heart: ["Damask Rose", "Jasmine", "Cinnamon"],
        base: ["Madagascar Vanilla", "Tonka Bean", "Sandalwood"],
      },
    };
  }

  if (name.includes("vanilla") || name.includes("khamrah") || name.includes("yara") || name.includes("caramel") || cat === "gourmand" || cat.includes("гурман")) {
    return {
      category: "gourmand",
      categoryRu: "Гурманские",
      categoryEn: "Gourmand",
      ru: {
        top: ["Мадагаскарская ваниль", "Миндаль", "Корица", "Бергамот"],
        heart: ["Карамель", "Дамасская роза", "Кофе", "Персик"],
        base: ["Бобы тонка", "Белый мускус", "Золотая амбра", "Сандал"],
      },
      en: {
        top: ["Madagascar Vanilla", "Almond", "Cinnamon", "Bergamot"],
        heart: ["Caramel", "Damask Rose", "Coffee", "Peach"],
        base: ["Tonka Bean", "White Musk", "Golden Amber", "Sandalwood"],
      },
    };
  }

  if (name.includes("oud") || name.includes("incense") || name.includes("wood") || name.includes("sandal") || name.includes("leather") || cat === "oud" || cat.includes("древес")) {
    return {
      category: "oud",
      categoryRu: "Уд и дым",
      categoryEn: "Oud & Smoke",
      ru: {
        top: ["Шафран", "Кардамон", "Французская лаванда"],
        heart: ["Благородный уд", "Кожаный аккорд", "Пачули"],
        base: ["Серая амбра", "Дымный ладан", "Сандал", "Белый мускус"],
      },
      en: {
        top: ["Saffron", "Cardamom", "French Lavender"],
        heart: ["Precious Oud", "Leather Accord", "Patchouli"],
        base: ["Grey Amber", "Smoky Frankincense", "Sandalwood", "White Musk"],
      },
    };
  }

  if (name.includes("rose") || name.includes("ward") || name.includes("floral") || name.includes("bloom") || name.includes("pink") || cat === "floral" || cat.includes("цвет")) {
    return {
      category: "floral",
      categoryRu: "Цветочные",
      categoryEn: "Floral",
      ru: {
        top: ["Флердоранж", "Розовый перец", "Мандарин", "Груша"],
        heart: ["Дамасская роза", "Жасмин самбак", "Иланг-иланг", "Ирис"],
        base: ["Белый мускус", "Сандал", "Золотая амбра", "Ваниль"],
      },
      en: {
        top: ["Orange Blossom", "Pink Pepper", "Mandarin", "Pear"],
        heart: ["Damask Rose", "Jasmine Sambac", "Ylang-Ylang", "Iris"],
        base: ["White Musk", "Sandalwood", "Golden Amber", "Vanilla"],
      },
    };
  }

  if (name.includes("blue") || name.includes("aqua") || name.includes("dive") || name.includes("ocean") || cat === "fresh" || cat === "aquatic" || cat.includes("морск") || cat.includes("свеж")) {
    return {
      category: "fresh",
      categoryRu: "Свежие",
      categoryEn: "Fresh",
      ru: {
        top: ["Морской бриз", "Сицилийский бергамот", "Зеленое яблоко", "Грейпфрут"],
        heart: ["Свежая мята", "Французская лаванда", "Шалфей"],
        base: ["Кедр", "Серая амбра", "Белый мускус", "Ветивер"],
      },
      en: {
        top: ["Sea Breeze", "Sicilian Bergamot", "Green Apple", "Grapefruit"],
        heart: ["Fresh Mint", "French Lavender", "Clary Sage"],
        base: ["Cedarwood", "Grey Amber", "White Musk", "Vetiver"],
      },
    };
  }

  if (name.includes("green") || name.includes("khuzama") || name.includes("lavender") || name.includes("homme") || cat === "fougere" || cat.includes("фужер")) {
    return {
      category: "fougere",
      categoryRu: "Фужерные",
      categoryEn: "Fougère",
      ru: {
        top: ["Французская лаванда", "Сицилийский бергамот", "Шалфей"],
        heart: ["Герань", "Розовый перец", "Дубовый мох", "Свежая мята"],
        base: ["Ветивер", "Бобы тонка", "Кедр", "Пачули"],
      },
      en: {
        top: ["French Lavender", "Sicilian Bergamot", "Clary Sage"],
        heart: ["Geranium", "Pink Pepper", "Oakmoss", "Fresh Mint"],
        base: ["Vetiver", "Tonka Bean", "Cedarwood", "Patchouli"],
      },
    };
  }

  if (name.includes("citrus") || name.includes("silver") || name.includes("white") || cat === "citrus-fresh" || cat.includes("цитрус")) {
    return {
      category: "citrus-fresh",
      categoryRu: "Цитрусовые",
      categoryEn: "Citrus",
      ru: {
        top: ["Сицилийский бергамот", "Грейпфрут", "Мандарин", "Зеленое яблоко"],
        heart: ["Флердоранж", "Имбирь", "Кардамон"],
        base: ["Ветивер", "Кедр", "Белый мускус", "Серая амбра"],
      },
      en: {
        top: ["Sicilian Bergamot", "Grapefruit", "Mandarin", "Green Apple"],
        heart: ["Orange Blossom", "Ginger", "Cardamom"],
        base: ["Vetiver", "Cedarwood", "White Musk", "Grey Amber"],
      },
    };
  }

  return {
    category: "spicy",
    categoryRu: "Пряные и восточные",
    categoryEn: "Spices & Oriental",
    ru: {
      top: ["Кардамон", "Розовый перец", "Корица", "Шафран"],
      heart: ["Дамасская роза", "Табачный лист", "Пачули", "Кофе"],
      base: ["Золотая амбра", "Бобы тонка", "Сандал", "Ваниль"],
    },
    en: {
      top: ["Cardamom", "Pink Pepper", "Cinnamon", "Saffron"],
      heart: ["Damask Rose", "Tobacco Leaf", "Patchouli", "Coffee"],
      base: ["Golden Amber", "Tonka Bean", "Sandalwood", "Vanilla"],
    },
  };
}

export function getHarmoniousNotes(perfume) {
  const profile = inferPerfumeProfile(perfume);
  return {
    ru: profile.ru,
    en: profile.en,
  };
}

function hashPerfumeSeed(str = "") {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function generateRichPerfumeDescriptions({
  name = "",
  brand = "Al-Warda",
  category = "oud",
  categoryRu = "Восточные",
  categoryEn = "Oriental",
  genderRu = "Унисекс",
  genderEn = "Unisex",
  longevityRu = "8–12 часов",
  longevityEn = "8–12 hours",
  topRu = [],
  heartRu = [],
  baseRu = [],
  topEn = [],
  heartEn = [],
  baseEn = [],
}) {
  const cleanName = String(name || "").trim();
  const cleanBrand = String(brand || "Al-Warda").trim();
  const seed = hashPerfumeSeed(`${cleanName}-${cleanBrand}`);

  const topStrRu = topRu.join(", ").toLowerCase();
  const heartStrRu = heartRu.join(", ").toLowerCase();
  const baseStrRu = baseRu.join(", ").toLowerCase();

  const topStrEn = topEn.join(", ");
  const heartStrEn = heartEn.join(", ");
  const baseStrEn = baseEn.join(", ");

  const catMoodRu = {
    oud: [
      "величественная и гипнотическая композиция, вдохновлённая древними парфюмерными традициями Ближнего Востока",
      "глубокий и статусный аромат, сочетающий благородную древесную теплоту и мистическое восточное очарование",
      "роскошное ольфакторное полотно с бархатистым дымным характером, созданное мастерами парфюмерии Ближнего Востока",
    ],
    gourmand: [
      "чувственный и обволакивающий эликсир с утончённым гурманским характером, рождённый на Ближнем Востоке",
      "соблазнительная и тёплая симфония сладости и благородных восточных акцентов, притягивающая внимание с первого вдоха",
      "изысканный десертно-пряный аромат, в котором восточная роскошь гармонично переплетается с мягкой бархатной нежностью",
    ],
    floral: [
      "утончённый и сияющий букет, воспевающий королевскую красоту цветущих садов Ближнего Востока",
      "элегантная и пленительная композиция, наполненная нежностью лепестков и тёплым восточным магнетизмом",
      "воздушная и грациозная парфюмерная история, сочетающая цветочную утончённость с чувственной глубиной",
    ],
    fresh: [
      "кристально чистый и бодрящий аромат, дарящий ощущение прохладного бриза и безупречной элегантности",
      "динамичная и освежающая композиция, в которой прохлада акватических аккордов встречается с благородной восточной базой",
      "современный и энергичный парфюм с ярким характером, наполняющий каждый момент свежестью и внутренней свободой",
    ],
    fougere: [
      "аристократичный и харизматичный фужерный аромат с безупречным балансом свежести, пряных трав и благородной древесины",
      "стильная и выразительная композиция, подчёркивающая уверенность, утончённый вкус и природный магнетизм",
      "многогранный ароматический парфюм с породистым звучанием, сочетающий классическую элегантность и восточную стойкость",
    ],
    "citrus-fresh": [
      "искрящийся и солнечный аромат, заряжающий яркой энергией спелых цитрусов и утончённой восточной прохладой",
      "жизнерадостная и сияющая композиция, где сочная цитрусовая свежесть обрамлена дорогим шлейфовым аккордом",
      "динамичный и свежий эликсир с благородным звучанием, созданный для ярких акцентов в любое время года",
    ],
    spicy: [
      "страстный и согревающий восточно-пряный аромат, сотканный из редких специй и драгоценных смол Ближнего Востока",
      "богатая и темпераментная композиция с гипнотическим характером, раскрывающаяся множеством тёплых граней",
      "выразительный и глубокий парфюм, в котором экзотические пряности создают неповторимую ауру роскоши и тайны",
    ],
  };

  const catMoodEn = {
    oud: [
      "a majestic and hypnotic creation inspired by the timeless perfumery traditions of the Middle East",
      "a deep, commanding fragrance that unites noble woody warmth with mystical Middle Eastern allure",
      "an opulent olfactory masterpiece with a velvety, resinous character crafted by master perfumers of the Middle East",
    ],
    gourmand: [
      "a sensual and enveloping elixir with a refined gourmand character born in the Middle East",
      "a seductive symphony of warm sweetness and noble oriental accords that captivates from the very first breath",
      "an exquisite gourmand-oriental fragrance where Middle Eastern luxury meets velvety softness",
    ],
    floral: [
      "a radiant and sophisticated bouquet celebrating the royal blooming gardens of the Middle East",
      "a harmonious blend of delicate petals and warm oriental magnetism woven into a captivating composition",
      "a graceful and luminous fragrance story blending floral refinement with sensual Middle Eastern depth",
    ],
    fresh: [
      "a crystalline and invigorating fragrance that evokes a cool coastal breeze and effortless elegance",
      "a dynamic, refreshing composition where crisp aquatic accords meet a noble Middle Eastern base",
      "a modern, energetic scent with a luminous profile that brings freshness and poise to every moment",
    ],
    fougere: [
      "an aristocratic and charismatic fougère fragrance balancing crisp aromatic herbs with noble woods",
      "a refined, expressive composition that highlights confidence, impeccable taste, and natural magnetism",
      "a multifaceted aromatic creation uniting classic elegance with enduring Middle Eastern craftsmanship",
    ],
    "citrus-fresh": [
      "a sparkling, sun-drenched fragrance brimming with vibrant citrus energy and refined Middle Eastern elegance",
      "a luminous and uplifting composition where zesty citrus freshness is framed by a luxurious sillage",
      "a dynamic, radiant elixir with a noble profile designed to leave a memorable impression in any season",
    ],
    spicy: [
      "a passionate, warming spicy-oriental fragrance woven from rare spices and precious resins of the Middle East",
      "a rich, temperamental composition with a hypnotic aura that unfolds in warm, sensual layers",
      "an expressive and opulent scent where exotic spices create an unforgettable atmosphere of mystery and luxury",
    ],
  };

  const moodsRu = catMoodRu[category] || catMoodRu.spicy;
  const moodsEn = catMoodEn[category] || catMoodEn.spicy;
  const moodRu = moodsRu[seed % moodsRu.length];
  const moodEn = moodsEn[seed % moodsEn.length];

  const audienceRu =
    genderRu === "Женский"
      ? "Идеально подчёркивает женственность, утончённость и притягательность как в дневном образе, так и для особого вечера."
      : genderRu === "Мужской"
      ? "Безупречно дополняет мужской образ, подчёркивая статус, харизму и уверенность в любой обстановке."
      : "Универсальная формула унисекс великолепно раскрывается как на мужской, так и на женской коже, адаптируясь к индивидуальной химии тела.";

  const audienceEn =
    genderEn === "Women"
      ? "Effortlessly highlights femininity, grace, and allure for both daytime elegance and special evening occasions."
      : genderEn === "Men"
      ? "Impeccably complements a masculine presence, accentuating charisma, poise, and confidence in any setting."
      : "Its versatile unisex character adapts beautifully to both men and women, evolving uniquely on the skin.";

  const brandIntroRu = cleanName.toLowerCase().includes(cleanBrand.toLowerCase())
    ? `${cleanName} от парфюмерного дома ${cleanBrand}`
    : `${cleanBrand} ${cleanName}`;

  const brandIntroEn = cleanName.toLowerCase().includes(cleanBrand.toLowerCase())
    ? `${cleanName} by the house of ${cleanBrand}`
    : `${cleanBrand} ${cleanName}`;

  const descriptionRu =
    `${brandIntroRu} — ${moodRu} (${categoryRu.toLowerCase()}). ` +
    `С первых мгновений композиция завораживает ярким вступлением, в котором гармонично переплетаются ${topStrRu}. ` +
    `Постепенно согреваясь на коже, аромат раскрывает своё богатое сердце из нот: ${heartStrRu}, придающих звучанию глубину и объём. ` +
    `В финале остаётся благородный, долгоиграющий шлейф (стойкость ${longevityRu}), сотканный из оттенков: ${baseStrRu}. ` +
    `${audienceRu}`;

  const descriptionEn =
    `${brandIntroEn} is ${moodEn} (${categoryEn.toLowerCase()}). ` +
    `From the very first spritz, the composition captivates with a vibrant opening of ${topStrEn}. ` +
    `As it warms on the skin, the fragrance reveals an alluring heart of ${heartStrEn}, lending remarkable depth and dimension. ` +
    `It settles into a velvety, long-lasting sillage (longevity ${longevityEn}) crafted from ${baseStrEn}. ` +
    `${audienceEn}`;

  return { descriptionRu, descriptionEn };
}

function isGenericOrShortDescription(text = "") {
  const clean = String(text || "").trim();
  if (clean.length < 160) return true;
  return (
    clean.includes("Сертифицированная оригинальная") ||
    clean.includes("оригинальный премиальный парфюм") ||
    clean.includes("премиальный оригинальный арабский") ||
    clean.includes("Роскошный восточный аромат Al-Warda") ||
    clean.includes("Поставляется напрямую со складов") ||
    clean.includes("Delivered directly from certified distribution hubs") ||
    clean.includes("exquisite authentic luxury Arabian fragrance") ||
    clean.includes("ОАЭ") ||
    clean.includes("UAE")
  );
}

export function ensurePerfumeEnrichment(p) {
  if (!p) return p;
  const name = p.name || p.title || "";
  const brand = p.brand || "Al-Warda";
  const profile = inferPerfumeProfile(p);

  const topRu = (Array.isArray(p.topNotesRu) && p.topNotesRu.length > 0)
    ? p.topNotesRu
    : (Array.isArray(p.topNotes) && p.topNotes.length > 0 ? p.topNotes : profile.ru.top);

  const heartRu = (Array.isArray(p.heartNotesRu) && p.heartNotesRu.length > 0)
    ? p.heartNotesRu
    : (Array.isArray(p.heartNotes) && p.heartNotes.length > 0 ? p.heartNotes : profile.ru.heart);

  const baseRu = (Array.isArray(p.baseNotesRu) && p.baseNotesRu.length > 0)
    ? p.baseNotesRu
    : (Array.isArray(p.baseNotes) && p.baseNotes.length > 0 ? p.baseNotes : profile.ru.base);

  const topEn = (Array.isArray(p.topNotesEn) && p.topNotesEn.length > 0) ? p.topNotesEn : profile.en.top;
  const heartEn = (Array.isArray(p.heartNotesEn) && p.heartNotesEn.length > 0) ? p.heartNotesEn : profile.en.heart;
  const baseEn = (Array.isArray(p.baseNotesEn) && p.baseNotesEn.length > 0) ? p.baseNotesEn : profile.en.base;

  const category = (!p.category || p.category === "spicy") ? profile.category : p.category;
  const categoryRu = (!p.categoryRu || p.categoryRu === "Восточные" || p.categoryRu === "Пряные")
    ? profile.categoryRu
    : p.categoryRu;
  const categoryEn = (!p.categoryEn || p.categoryEn === "Oriental")
    ? profile.categoryEn
    : p.categoryEn;

  let notesSummaryRu = p.notesSummaryRu || p.notesSummary || "";
  if (!notesSummaryRu || notesSummaryRu.includes("Премиальный арабский парфюм") || notesSummaryRu.includes("Элитный восточный парфюм") || notesSummaryRu === brand) {
    notesSummaryRu = [...topRu.slice(0, 2), ...heartRu.slice(0, 1), ...baseRu.slice(0, 2)].join(" · ");
  }

  let notesSummaryEn = p.notesSummaryEn || "";
  if (!notesSummaryEn || notesSummaryEn.includes("Премиальный арабский парфюм") || notesSummaryEn.includes("Элитный восточный парфюм") || notesSummaryEn === brand) {
    notesSummaryEn = [...topEn.slice(0, 2), ...heartEn.slice(0, 1), ...baseEn.slice(0, 2)].join(" · ");
  }

  const genderRu = p.genderRu || p.gender || "Унисекс";
  const genderEn = p.genderEn || (genderRu === "Женский" ? "Women" : genderRu === "Мужской" ? "Men" : "Unisex");
  const longevityRu = p.longevityRu || p.longevity || "8–12 часов";
  const longevityEn = p.longevityEn || "8–12 hours";

  const generatedDescs = generateRichPerfumeDescriptions({
    name,
    brand,
    category,
    categoryRu,
    categoryEn,
    genderRu,
    genderEn,
    longevityRu,
    longevityEn,
    topRu,
    heartRu,
    baseRu,
    topEn,
    heartEn,
    baseEn,
  });

  let descRu = p.descriptionRu || p.description;
  if (isGenericOrShortDescription(descRu)) {
    descRu = generatedDescs.descriptionRu;
  }

  let descEn = p.descriptionEn;
  if (isGenericOrShortDescription(descEn)) {
    descEn = generatedDescs.descriptionEn;
  }

  const rawImage = p.rawImage || p.info?.rawImage || null;
  const gtin = p.gtin || p.info?.gtin;
  const resolvedImg = hasCompletedGeneratedImage(p)
    ? p.info.imageGeneration.imageUrl || p.image
    : resolveCardImage(p.image, gtin, rawImage);

  return {
    ...p,
    category,
    categoryRu,
    categoryEn,
    categoryName: categoryRu,
    notesSummary: notesSummaryRu,
    notesSummaryRu,
    notesSummaryEn,
    image: resolvedImg,
    fullCardImage: resolvedImg,
    rawImage: rawImage || p.rawImage || null,
    topNotes: topRu,
    heartNotes: heartRu,
    baseNotes: baseRu,
    topNotesRu: topRu,
    heartNotesRu: heartRu,
    baseNotesRu: baseRu,
    topNotesEn: topEn,
    heartNotesEn: heartEn,
    baseNotesEn: baseEn,
    description: descRu,
    descriptionRu: descRu,
    descriptionEn: descEn,
  };
}

export async function fetchPerfumesFromSupabase() {
  try {
    let allRows = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const res = await fetch(`${TABLE_PERFUMES}?select=*&order=id.asc&info->imageGeneration->>status=eq.completed`, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Range: `${from}-${to}`,
        },
      });

      if (!res.ok) throw new Error(`Could not load catalog (HTTP ${res.status})`);
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error("Catalog response is not a list");
      if (rows.length === 0) break;
      allRows.push(...rows);
      if (rows.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }

    if (allRows.length > 0) {
      // Filter out items with no actual product visual (dummy Qogita "No image available" placeholders)
      const validRows = allRows.filter((r) => {
        const img = ((r.image || "") + (r.raw_image || "") + (r.info?.rawImage || "")).toLowerCase();
        if (
          img.includes("46e86f1d826c199f04588f35f1fd8afe") ||
          img.includes("c1b79cffa1a5fa8aab226414b9e4a063") ||
          img.includes("no-image") ||
          img.includes("no_image")
        ) {
          return false;
        }
        return hasCompletedGeneratedImage(r);
      });

      // Map database fields to standard schema
      const mapped = validRows.map((r) => {
          const info = r.info || {};
          let catSlug = info.categorySlug || "spicy";
          const catLower = (info.category || "").toLowerCase();
          if (catLower.includes("гурманские")) catSlug = "gourmand";
          else if (catLower.includes("акватические") || catLower.includes("морск") || catLower.includes("свеж") || catLower.includes("fresh")) catSlug = "fresh";
          else if (catLower.includes("фужерные") || catLower.includes("fougere") || catLower.includes("fougère")) catSlug = "fougere";
          else if (catLower.includes("древесные") || catLower.includes("уд") || catLower.includes("благородные")) catSlug = "oud";
          else if (catLower.includes("цветочные")) catSlug = "floral";
          else if (catLower.includes("цитрусовые")) catSlug = "citrus-fresh";
          else if (catLower.includes("пряные") || catLower.includes("специи")) catSlug = "spicy";

          const notesObj = info.notes || {};
          const topNotesRu = notesObj.ru?.top || notesObj.top || (Array.isArray(r.top_notes) ? r.top_notes : (r.top_notes ? r.top_notes.split(",") : []));
          const heartNotesRu = notesObj.ru?.heart || notesObj.heart || (Array.isArray(r.heart_notes) ? r.heart_notes : (r.heart_notes ? r.heart_notes.split(",") : []));
          const baseNotesRu = notesObj.ru?.base || notesObj.base || (Array.isArray(r.base_notes) ? r.base_notes : (r.base_notes ? r.base_notes.split(",") : []));

          const topNotesEn = notesObj.en?.top || topNotesRu;
          const heartNotesEn = notesObj.en?.heart || heartNotesRu;
          const baseNotesEn = notesObj.en?.base || baseNotesRu;

          const descRu = info.descriptionRu || r.description || "Роскошный восточный аромат Al-Warda.";
          const descEn = info.descriptionEn || "An exquisite authentic luxury Arabian fragrance by Al-Warda.";
          const generatedImage = info.imageGeneration.imageUrl || r.image;

          const perfumeObj = {
            id: String(r.id),
            slug: `stock-${r.id}`,
            name: r.name || r.title,
            title: r.name || r.title,
            brand: r.brand || "Al-Warda",
            category: catSlug,
            categoryRu: info.category || "Восточные",
            categoryEn: info.categoryEn || "Oriental",
            categoryName: info.category || "Восточные",
            notesSummary: info.notesSummary || r.notes_summary || r.brand || "Шлейфовый восточный аромат",
            notesSummaryRu: info.notesSummary || r.notes_summary || r.brand || "Шлейфовый восточный аромат",
            notesSummaryEn: info.notesSummaryEn || info.notesSummary || r.brand || "Distinctive Oriental Sillage",
            price: Number(r.price) || 29.99,
            currency: r.currency || "EUR",
            priceMdl: Math.round((Number(r.price) || 29.99) * 19.5),
            volume: info.volume || r.volume || "100ml / 3.4 FL.OZ.",
            concentration: info.concentration || r.concentration || "Eau De Parfum",
            gender: info.gender || r.gender || "Унисекс",
            genderRu: info.gender || r.gender || "Унисекс",
            genderEn: info.genderEn || (info.gender === "Женский" ? "Women" : (info.gender === "Мужской" ? "Men" : "Unisex")),
            longevity: info.longevity || "8–12 часов",
            longevityRu: info.longevity || "8–12 часов",
            longevityEn: info.longevityEn || "8–12 hours",
            sillage: info.sillage || "Выразительный, шлейфовый",
            sillageRu: info.sillage || "Выразительный, шлейфовый",
            sillageEn: info.sillageEn || "Noticeable, alluring sillage",
            rating: 4.9,
            reviewsCount: 35 + ((r.id * 7) % 50),
            isBestSeller: (r.id % 7 === 0),
            isFeatured: (r.id % 5 === 0),
            inStock: info.inStock !== false,
            deliveryTime: info.deliveryTime || "4–7 дней (прямая поставка)",
            deliveryTimeEn: info.deliveryTimeEn || "4–7 days (direct dispatch)",
            image: generatedImage,
            fullCardImage: generatedImage,
            rawImage: info.rawImage || r.raw_image || r.info?.rawImage || null,
            topNotes: topNotesRu,
            heartNotes: heartNotesRu,
            baseNotes: baseNotesRu,
            topNotesRu,
            heartNotesRu,
            baseNotesRu,
            topNotesEn,
            heartNotesEn,
            baseNotesEn,
            description: descRu,
            descriptionRu: descRu,
            descriptionEn: descEn,
            info,
            minOrderQuantity: Number(info.minOrderQuantity || info.unit || 1) || 1,
            gtin: info.gtin || r.gtin,
            dropshipId: info.gtin ? `dropship-${info.gtin}` : null,
          };
          perfumeObj.url = getPerfumeUrl(perfumeObj);
          return ensurePerfumeEnrichment(perfumeObj);
        });
        memoryPerfumesCache = mapped;
        return mapped;
      }
  } catch (err) {
    console.warn("fetchPerfumesFromSupabase error:", err);
    throw err;
  }
  memoryPerfumesCache = [];
  return [];
}

let memoryDropshipCache = null;

export async function fetchDropshipArabianPerfumes(query = "") {
  try {
    let res = await fetch(`/api/qogita/arabian-perfumes${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    if (!res.ok) {
      res = await fetch("/data/cachedArabianPerfumes.json");
    }
    if (res.ok) {
      const data = await res.json();
      const rawList = Array.isArray(data) ? data : (data.results || []);
      const items = rawList
        .filter(
          (p) =>
            hasCompletedGeneratedImage(p) &&
            p.image &&
            !p.image.includes("c1b79cffa1a5fa8aab226414b9e4a063") &&
            (!p.rawImage || !p.rawImage.includes("c1b79cffa1a5fa8aab226414b9e4a063"))
        )
        .map(ensurePerfumeEnrichment);

      if (!query) {
        memoryDropshipCache = items;
      }
      return items;
    }
  } catch (err) {
    try {
      const fallbackRes = await fetch("/data/cachedArabianPerfumes.json");
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        const rawList = Array.isArray(fallbackData) ? fallbackData : (fallbackData.results || []);
        const items = rawList
          .filter((p) => hasCompletedGeneratedImage(p) && p.image && !p.image.includes("c1b79cffa1a5fa8aab226414b9e4a063"))
          .map(ensurePerfumeEnrichment);
        if (!query) memoryDropshipCache = items;
        return items;
      }
    } catch {}
    console.warn("Could not fetch dropship perfumes:", err);
  }
  return memoryDropshipCache || [];
}

async function getPerfumesUnfiltered(options = {}) {
  const { includeDropship = true, refresh = false } = options;
  let base = memoryPerfumesCache || [];
  let dropship = memoryDropshipCache || [];

  if (refresh || !memoryPerfumesCache || !memoryDropshipCache) {
    if (!catalogRefresh) {
      catalogRefresh = Promise.allSettled([fetchPerfumesFromSupabase(), fetchDropshipArabianPerfumes()])
        .finally(() => { catalogRefresh = null; });
    }
    const results = await catalogRefresh;
    for (const result of results) {
      if (result.status === "rejected") {
        if (refresh) throw result.reason;
        console.warn("Could not refresh perfume catalog:", result.reason);
      }
    }
    base = results[0].status === "fulfilled" ? results[0].value : (memoryPerfumesCache || []);
    dropship = results[1].status === "fulfilled" ? results[1].value : (memoryDropshipCache || []);
  }

  if (base.length > 0) {
    const existingGtins = new Set(base.map((b) => b.gtin || b.info?.gtin).filter(Boolean));
    const existingNames = new Set(base.map((b) => (b.name || "").toLowerCase().trim()).filter(Boolean));
    const uniqueDropship = dropship.filter(
      (d) => !(d.gtin && existingGtins.has(d.gtin)) && !existingNames.has((d.name || "").toLowerCase().trim())
    );
    return includeDropship ? [...base, ...uniqueDropship] : base;
  }

  return includeDropship ? [...base, ...dropship] : base;
}

let memoryMinOrderSettings = { minOrderFrom: 0, minOrderTo: 0 };
let minOrderSettingsLoadedAt = 0;

export function getPerfumeMinOrder(p) {
  const value = Number(p?.minOrderQuantity ?? p?.info?.minOrderQuantity ?? p?.info?.unit ?? p?.unit ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export async function fetchMinOrderSettings(force = false) {
  if (!force && Date.now() - minOrderSettingsLoadedAt < 60000) return memoryMinOrderSettings;
  try {
    const res = await fetch(`${TABLE_PERFUMES}?select=info&slug=eq.site-settings&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (res.ok) {
      const rows = await res.json();
      const info = rows?.[0]?.info || {};
      memoryMinOrderSettings = {
        minOrderFrom: Number(info.minOrderFrom) || 0,
        minOrderTo: Number(info.minOrderTo ?? info.maxAllowedMinOrder) || 0,
      };
      minOrderSettingsLoadedAt = Date.now();
    }
  } catch (err) {
    console.warn("Could not load min order settings:", err);
  }
  return memoryMinOrderSettings;
}

export function applyMinOrderFilter(list, settings = memoryMinOrderSettings) {
  const from = Number(settings?.minOrderFrom) || 0;
  const to = Number(settings?.minOrderTo) || 0;
  if (!from && !to) return list;
  return list.filter((p) => {
    const q = getPerfumeMinOrder(p);
    return q >= from && (!to || q <= to);
  });
}

export async function getPerfumes(options = {}) {
  const [list, settings] = await Promise.all([
    getPerfumesUnfiltered(options),
    fetchMinOrderSettings(Boolean(options.refresh)),
  ]);
  return applyMinOrderFilter(list, settings);
}

export function getCachedPerfumes() {
  return applyMinOrderFilter([...(memoryPerfumesCache || []), ...(memoryDropshipCache || [])]);
}

export async function getPerfumeById(id, options = {}) {
  if (!id) return null;
  const clean = String(id).toLowerCase().trim();
  const all = await getPerfumes(options);

  // 1. Direct ID, slug, dropshipId, or GTIN match
  let found = all.find(
    (p) =>
      p.id?.toLowerCase() === clean ||
      p.slug?.toLowerCase() === clean ||
      p.dropshipId?.toLowerCase() === clean ||
      (p.gtin && `dropship-${p.gtin}`.toLowerCase() === clean) ||
      (p.gtin && String(p.gtin).toLowerCase() === clean)
  );
  if (found) return ensurePerfumeEnrichment(found);

  // 2. Extract trailing dropship GTIN (e.g. "dropship-6285952002379" -> "6285952002379")
  const trailingDropship = clean.match(/dropship-(\d+)$/i);
  if (trailingDropship) {
    found = all.find(
      (p) =>
        p.id?.toLowerCase() === `dropship-${trailingDropship[1]}` ||
        p.dropshipId?.toLowerCase() === `dropship-${trailingDropship[1]}` ||
        String(p.gtin) === trailingDropship[1] ||
        String(p.id) === trailingDropship[1]
    );
    if (found) return ensurePerfumeEnrichment(found);
  }

  // 3. Extract trailing stock ID (e.g. "lattafa-yara-4217" -> "4217")
  const trailingNum = clean.match(/-(\d+)$/);
  if (trailingNum) {
    found = all.find(
      (p) =>
        p.id === trailingNum[1] ||
        String(p.gtin) === trailingNum[1] ||
        p.dropshipId?.toLowerCase() === `dropship-${trailingNum[1]}`
    );
    if (found) return ensurePerfumeEnrichment(found);
  }

  // 4. Match by name or slug match
  const cleanLetters = clean.replace(/[^a-z0-9]/g, "");
  found = all.find((p) => {
    const pSlug = slugifyPerfumeName(p.name || p.title);
    if (clean === pSlug || clean.startsWith(pSlug) || pSlug.startsWith(clean)) return true;
    const pLetters = (p.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return pLetters && (cleanLetters === pLetters || cleanLetters.includes(pLetters) || pLetters.includes(cleanLetters));
  });
  if (found) return ensurePerfumeEnrichment(found);

  // 5. Direct fallback search in dropship catalog
  if (clean.startsWith("dropship-") || clean.includes("dropship")) {
    const dropshipItems = await fetchDropshipArabianPerfumes();
    found = dropshipItems.find(
      (p) =>
        p.id?.toLowerCase() === clean ||
        p.slug?.toLowerCase() === clean ||
        (p.gtin && `dropship-${p.gtin}`.toLowerCase() === clean) ||
        (p.gtin && clean.includes(String(p.gtin)))
    );
    if (found) return ensurePerfumeEnrichment(found);
  }

  return null;
}

export function isPerfumeSet(p) {
  if (!p) return false;
  if (p.isSet || p.category === "sets" || p.categorySlug === "sets") return true;
  const text = `${p.name || ""} ${p.title || ""} ${p.volume || ""}`.toLowerCase();
  return (
    /\b(set|gift\s*set|fragrance\s*set|perfume\s*set|discovery\s*set|travel\s*set|coffret|pack\s+of\s+\d+|\d+\s*pcs?|\d+\s*pieces?|\d+\s*in\s*1|набор|сет)\b/i.test(text) ||
    /\+\s*\d+(\.\d+)?\s*ml\b/i.test(text) ||
    /\b\d+\s*[x×]\s*\d+(\.\d+)?\s*ml\b/i.test(text) ||
    /\b\d+\s*ml\s+(shower\s*gel|body\s*lotion|body\s*milk|after\s*shave|deo|deodorant)\b/i.test(text)
  );
}

export async function getPerfumeSets(options = {}) {
  const all = await getPerfumes(options);
  return all.filter((p) => isPerfumeSet(p));
}

export async function getBestSellerPerfumes(options = {}) {
  const all = await getPerfumes(options);
  const nonSets = all.filter((p) => !isPerfumeSet(p));
  const pool = nonSets.length >= 3 ? nonSets : all;
  const best = pool.filter((p) => p.isBestSeller);
  return best.length > 0 ? best.slice(0, 3) : pool.slice(0, 3);
}

export function getCategories() {
  return PERFUME_CATEGORIES;
}
