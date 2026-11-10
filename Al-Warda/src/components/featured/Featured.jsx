import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  getPerfumes,
  getCachedPerfumes,
  getCategories,
  getPerfumeUrl,
  isPerfumeSet,
  getDefaultPerfumeVolumeOption,
  getDefaultCatalogPrice,
  parseVolumeMl,
  hasCompletedGeneratedImage,
} from "../../../utils/perfumes";
import { addToCart } from "../../../utils/cart";
import { useCartState } from "../../hooks/useCartState";
import { useLanguage } from "../../context/languageContext";
import { useCurrency } from "../../context/currencyContext";
import {
  getLocalizedCategory,
  getLocalizedGender,
  getLocalizedLongevity,
  getLocalizedNote,
  getLocalizedFormat,
  getLocalizedVolumeOption,
  formatVolume,
} from "../../utils/localization";
import { OrnateCard } from "../common/OrnateCard";
import "./Featured.css";
import "../common/ProductCardImages.css";

const POPULAR_ARABIAN_BRANDS = [
  "Lattafa",
  "Armaf",
  "Afnan",
  "Ajmal",
  "Al Fares",
  "Al Haramain",
  "Al Majed for Oud",
  "Al Rehab",
  "Al Wataniah",
  "Amouage",
  "Anfas",
  "Arabian Oud",
  "Ard Al Zaafaran",
  "Asdaaf",
  "Atyab Al Marshoud",
  "Ayat Perfumes",
  "Azha",
  "Azhaara",
  "Clive Dorris",
  "Emper",
  "Flavia",
  "Fragrance World",
  "French Avenue",
  "Grandeur",
  "Gulf Orchid",
  "Hamidi",
  "Hayaati",
  "Hekayat Attar",
  "Jenny Glow",
  "Just Jack",
  "Khadlaj",
  "Khalis",
  "La Fede",
  "Le Falcone",
  "Maison Alhambra",
  "Mamlakt Al Oud",
  "Ministry of Oud",
  "Myperfumes",
  "Nabeel",
  "Ojar",
  "Orientica",
  "Paris Corner",
  "Prime Collection",
  "Privezarah",
  "Rasasi",
  "Rayhaan",
  "Riiffs",
  "Risala",
  "Shaikh Mohd Saeed",
  "Sterling Parfums",
  "Swiss Arabian",
  "Tayyib",
  "Vurv",
  "Zimaya",
];

const GENDER_OPTIONS = [
  { id: "Women", nameRu: "Женский", nameEn: "Women" },
  { id: "Men", nameRu: "Мужской", nameEn: "Men" },
  { id: "Unisex", nameRu: "Унисекс", nameEn: "Unisex" },
];

const POPULAR_NOTES = [
  { id: "oud", nameRu: "Уд", nameEn: "Oud", keywords: ["уд", "агар", "oud", "agarwood"] },
  { id: "rose", nameRu: "Дамасская и таифская роза", nameEn: "Damask & Taif Rose", keywords: ["роза", "розы", "розе", "розу", "розой", "rose", "ward", "taif"] },
  { id: "vanilla", nameRu: "Мадагаскарская ваниль", nameEn: "Vanilla", keywords: ["ванил", "vanil"] },
  { id: "amber", nameRu: "Золотая и серая амбра", nameEn: "Golden & Grey Amber", keywords: ["амбр", "amber", "ambrox"] },
  { id: "musk", nameRu: "Белый мускус", nameEn: "White Musk", keywords: ["мускус", "musk"] },
  { id: "saffron", nameRu: "Королевский шафран", nameEn: "Saffron", keywords: ["шафран", "saffron"] },
  { id: "bergamot", nameRu: "Сицилийский бергамот", nameEn: "Sicilian Bergamot", keywords: ["бергамот", "bergamot"] },
  { id: "sandalwood", nameRu: "Сандал", nameEn: "Sandalwood", keywords: ["сандал", "sandal"] },
  { id: "patchouli", nameRu: "Пачули", nameEn: "Patchouli", keywords: ["пачул", "patchouli"] },
  { id: "leather", nameRu: "Кожаный аккорд", nameEn: "Leather", keywords: ["кожа", "кожан", "leather"] },
  { id: "incense", nameRu: "Дымный ладан", nameEn: "Frankincense & Incense", keywords: ["ладан", "дым", "incense", "frankincense", "opoponax", "опопонакс"] },
  { id: "tonka", nameRu: "Бобы тонка", nameEn: "Tonka Bean", keywords: ["тонка", "tonka", "кумарин"] },
  { id: "caramel", nameRu: "Карамель", nameEn: "Caramel", keywords: ["карамел", "caramel"] },
  { id: "cardamom", nameRu: "Кардамон", nameEn: "Cardamom", keywords: ["кардамон", "cardamom"] },
  { id: "cinnamon", nameRu: "Корица", nameEn: "Cinnamon", keywords: ["кориц", "cinnamon"] },
  { id: "lavender", nameRu: "Французская лаванда", nameEn: "French Lavender", keywords: ["лаванд", "lavender", "khuzama"] },
  { id: "cedar", nameRu: "Благородный кедр", nameEn: "Cedarwood", keywords: ["кедр", "кипарис", "сосн", "елов", "cedar", "cypress", "pine"] },
  { id: "vetiver", nameRu: "Ветивер", nameEn: "Vetiver", keywords: ["ветивер", "vetiver"] },
  { id: "jasmine", nameRu: "Жасмин самбак", nameEn: "Jasmine Sambac", keywords: ["жасмин", "jasmine"] },
  { id: "iris", nameRu: "Ирис и пудра", nameEn: "Iris & Powder", keywords: ["ирис", "пудр", "iris", "powder"] },
  { id: "violet", nameRu: "Фиалка и пион", nameEn: "Violet & Peony", keywords: ["фиалк", "пион", "violet", "peony"] },
  { id: "orange-blossom", nameRu: "Флердоранж и нероли", nameEn: "Orange Blossom & Neroli", keywords: ["флердоранж", "нероли", "orange blossom", "neroli"] },
  { id: "ylang", nameRu: "Иланг-иланг", nameEn: "Ylang-Ylang", keywords: ["иланг", "ylang"] },
  { id: "peach", nameRu: "Сладкий персик", nameEn: "Sweet Peach", keywords: ["персик", "peach"] },
  { id: "cherry", nameRu: "Спелая вишня", nameEn: "Ripe Cherry", keywords: ["вишн", "cherry"] },
  { id: "pear", nameRu: "Сочная груша", nameEn: "Juicy Pear", keywords: ["груш", "pear"] },
  { id: "apple", nameRu: "Зеленое яблоко", nameEn: "Green Apple", keywords: ["яблок", "apple"] },
  { id: "berries", nameRu: "Черная смородина и малина", nameEn: "Blackcurrant & Raspberry", keywords: ["смородин", "малин", "ягод", "blackcurrant", "raspberry"] },
  { id: "mandarin", nameRu: "Мандарин и апельсин", nameEn: "Mandarin & Orange", keywords: ["мандарин", "апельсин", "mandarin", "orange"] },
  { id: "grapefruit", nameRu: "Грейпфрут и лимон", nameEn: "Grapefruit & Lemon", keywords: ["грейпфрут", "лимон", "лайм", "grapefruit", "lemon", "lime"] },
  { id: "pepper", nameRu: "Розовый и черный перец", nameEn: "Pink & Black Pepper", keywords: ["перец", "pepper"] },
  { id: "ginger", nameRu: "Имбирь и мускатный орех", nameEn: "Ginger & Nutmeg", keywords: ["имбир", "мускат", "гвоздик", "ginger", "nutmeg", "clove"] },
  { id: "tobacco", nameRu: "Табачный лист", nameEn: "Tobacco Leaf", keywords: ["табак", "табач", "tobacco"] },
  { id: "coffee", nameRu: "Кофе", nameEn: "Coffee", keywords: ["кофе", "coffee"] },
  { id: "almond", nameRu: "Миндаль и пралине", nameEn: "Almond & Praline", keywords: ["миндал", "пралине", "кокос", "almond", "praline", "coconut"] },
  { id: "sea-breeze", nameRu: "Морской бриз", nameEn: "Sea Breeze", keywords: ["морск", "бриз", "акват", "sea breeze", "marine"] },
  { id: "mint", nameRu: "Свежая мята и шалфей", nameEn: "Fresh Mint & Sage", keywords: ["мят", "шалфей", "геран", "mint", "sage", "geranium"] },
  { id: "oakmoss", nameRu: "Дубовый мох", nameEn: "Oakmoss", keywords: ["мох", "oakmoss", "берез", "birch"] },
];

/**
 * High-precision note matchers with word-boundary awareness and negative exclusions.
 * Prevents false positives like "розовый перец" (pink pepper) matching "роза" (rose),
 * or "пудра" matching "уд", or "pineapple" matching "apple".
 */
const NOTE_MATCHERS = {
  rose: (text) => {
    const clean = text
      .replace(/\b(?:pink\s+pepper(?:corn)?|baies?\s+roses?)\b/gi, " ")
      .replace(/розов\w*\s+перец\w*/gi, " ")
      .replace(/розмарин\w*|rosemary/gi, " ")
      .replace(/розов\w*\s+дерев\w*|rosewood/gi, " ")
      .replace(/тубероз\w*|tuberose/gi, " ");
    return /(?:^|[^\p{L}\p{N}])(?:дамасск\w*\s+роз\w*|таифск\w*\s+роз\w*|болгарск\w*\s+роз\w*|столепестков\w*\s+роз\w*|роз[аеуой]|розы|роз(?:\s|$|[,\.!\?;:])|розов\w*\s+(?:масл|вод|абсолют|лепестк)|rose|roses|damask\s+rose|taif\s+rose|ward|taif)(?:$|[^\p{L}\p{N}])/iu.test(clean);
  },
  oud: (text) => {
    return /(?:^|[^\p{L}\p{N}])(?:уд|уда|удом|уде|удов\w*|агар\w*|oud|agarwood|aoud|oudh)(?:$|[^\p{L}\p{N}])/iu.test(text);
  },
  mint: (text) => {
    return /(?:^|[^\p{L}\p{N}])(?:мят\w*|шалфей\w*|геран\w*|mint|spearmint|peppermint|sage|clary\s+sage|geranium)(?:$|[^\p{L}\p{N}])/iu.test(text);
  },
  pepper: (text) => {
    return /(?:^|[^\p{L}\p{N}])(?:перец|перц\w*|розов\w*\s+перец\w*|черн\w*\s+перец\w*|сычуаньск\w*\s+перец\w*|pepper|peppercorn|pink\s+pepper|black\s+pepper)(?:$|[^\p{L}\p{N}])/iu.test(text);
  },
  leather: (text) => {
    return /(?:^|[^\p{L}\p{N}])(?:кож[аеуой]|кожи|кожан\w*|замш\w*|leather|suede)(?:$|[^\p{L}\p{N}])/iu.test(text);
  },
  pear: (text) => {
    return /(?:^|[^\p{L}\p{N}])(?:груш\w*|\bpear\b|\bpears\b)(?:$|[^\p{L}\p{N}])/iu.test(text);
  },
  apple: (text) => {
    return /(?:^|[^\p{L}\p{N}])(?:яблок\w*|\bapple\b|\bapples\b)(?:$|[^\p{L}\p{N}])/iu.test(text);
  },
  oakmoss: (text) => {
    return /(?:^|[^\p{L}\p{N}])(?:мох|мха|мхом|дубов\w*\s+мох\w*|берез\w*|oakmoss|moss|birch)(?:$|[^\p{L}\p{N}])/iu.test(text);
  },
};

const EXTRA_FILTER_CATEGORIES = [
  { id: "oriental", slug: "oriental", nameRu: "ВОСТОЧНЫЕ И АМБРОВЫЕ", nameEn: "ORIENTAL & AMBER" },
  { id: "woody", slug: "woody", nameRu: "ДРЕВЕСНЫЕ", nameEn: "WOODY" },
  { id: "fruity", slug: "fruity", nameRu: "ФРУКТОВЫЕ И ЯГОДНЫЕ", nameEn: "FRUITY & BERRY" },
  { id: "leather", slug: "leather", nameRu: "КОЖАНЫЕ", nameEn: "LEATHER" },
  { id: "musky", slug: "musky", nameRu: "МУСКУСНЫЕ И ПУДРОВЫЕ", nameEn: "MUSKY & POWDERY" },
];

const FORMAT_OPTIONS = [
  { id: "all", nameRu: "Все ароматы", nameEn: "All Items" },
  { id: "sets", nameRu: "Только сеты и наборы", nameEn: "Sets & Gifts Only" },
  { id: "bottles", nameRu: "Только флаконы", nameEn: "Bottles Only" },
];

const LONGEVITY_OPTIONS = [
  {
    id: "eternal",
    nameRu: "Максимальная (12–16+ ч)",
    nameEn: "Maximum (12–16+ hrs)",
    matcher: (p) => {
      const long = `${p.longevityRu || ""} ${p.longevity || ""} ${p.longevityEn || ""}`.toLowerCase();
      const conc = `${p.concentration || ""} ${p.categoryRu || ""}`.toLowerCase();
      return (
        long.includes("12–16") ||
        long.includes("12-16") ||
        long.includes("максимальная") ||
        conc.includes("extrait") ||
        conc.includes("cpo") ||
        conc.includes("масло") ||
        conc.includes("маслян")
      );
    },
  },
  {
    id: "very-long",
    nameRu: "Очень высокая (10–14 ч)",
    nameEn: "Very Long-Lasting (10–14 hrs)",
    matcher: (p) => {
      const long = `${p.longevityRu || ""} ${p.longevity || ""} ${p.longevityEn || ""}`.toLowerCase();
      return (
        long.includes("10–14") ||
        long.includes("10-14") ||
        long.includes("очень высокая") ||
        long.includes("very long")
      );
    },
  },
  {
    id: "long",
    nameRu: "Высокая (8–12 ч)",
    nameEn: "Long-Lasting (8–12 hrs)",
    matcher: (p) => {
      const long = `${p.longevityRu || ""} ${p.longevity || ""} ${p.longevityEn || ""}`.toLowerCase();
      return (
        long.includes("8–12") ||
        long.includes("8-12") ||
        long.includes("8–11") ||
        long.includes("8-11") ||
        long.includes("высокая") ||
        long.includes("стойкая свежесть")
      );
    },
  },
  {
    id: "moderate",
    nameRu: "Умеренная (до 8-10 ч)",
    nameEn: "Moderate (up to 8-10 hrs)",
    matcher: (p) => {
      const long = `${p.longevityRu || ""} ${p.longevity || ""} ${p.longevityEn || ""}`.toLowerCase();
      return (
        long.includes("умерен") ||
        long.includes("до 8") ||
        long.includes("4–6") ||
        long.includes("6–8") ||
        long.includes("7–10")
      );
    },
  },
];

const VOLUME_OPTIONS = [
  {
    id: "mini",
    nameRu: "До 30 мл (аттары, мини)",
    nameEn: "Up to 30 ml (attars, mini)",
    matcher: (ml) => ml <= 30,
  },
  {
    id: "50ml",
    nameRu: "50 мл (50–65 мл)",
    nameEn: "50 ml (50–65 ml)",
    matcher: (ml) => ml > 30 && ml <= 65,
  },
  {
    id: "75-90ml",
    nameRu: "75–90 мл",
    nameEn: "75–90 ml",
    matcher: (ml) => ml >= 70 && ml <= 90,
  },
  {
    id: "100ml",
    nameRu: "100 мл (Классический)",
    nameEn: "100 ml (Classic Flacon)",
    matcher: (ml) => ml === 100,
  },
  {
    id: "large",
    nameRu: "Более 100 мл (120–250 мл)",
    nameEn: "100+ ml (120–250 ml)",
    matcher: (ml) => ml > 100,
  },
];

function getPerfumeMl(p) {
  if (!p) return 100;
  return parseVolumeMl(p.name) || parseVolumeMl(p.volume) || parseVolumeMl(p.info?.volume) || 100;
}

// Always 4 items per row -> page size multiple of 4 (e.g. 24 = 6 full rows)
const PAGE_SIZE = 24;

export default function Featured() {
  const { language, t } = useLanguage();
  const { formatPrice } = useCurrency();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isInCart, toggleCart } = useCartState();

  // Multi-select state synced with URL searchParams
  const [selectedCategories, setSelectedCategories] = useState(() => {
    const raw = searchParams.get("category");
    return raw && raw !== "all"
      ? raw.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean)
      : [];
  });
  const [selectedBrands, setSelectedBrands] = useState(() => {
    const raw = searchParams.get("brand");
    return raw
      ? raw.split(",").map((b) => b.trim()).filter(Boolean)
      : [];
  });
  const [selectedGenders, setSelectedGenders] = useState(() => {
    const raw = searchParams.get("gender");
    return raw
      ? raw.split(",").map((g) => g.trim()).filter(Boolean)
      : [];
  });
  const [selectedNotes, setSelectedNotes] = useState(() => {
    const raw = searchParams.get("notes") || searchParams.get("note");
    return raw
      ? raw.split(",").map((n) => n.trim().toLowerCase()).filter(Boolean)
      : [];
  });
  const [selectedVolumes, setSelectedVolumes] = useState(() => {
    const raw = searchParams.get("volume") || searchParams.get("volumes");
    return raw
      ? raw.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)
      : [];
  });
  const [selectedLongevities, setSelectedLongevities] = useState(() => {
    const raw = searchParams.get("longevity") || searchParams.get("duration");
    return raw
      ? raw.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean)
      : [];
  });
  const [selectedFormat, setSelectedFormat] = useState(() => {
    const raw = searchParams.get("format");
    if (raw === "sets" || raw === "bottles") return raw;
    if (searchParams.get("sets") === "1" || searchParams.get("sets") === "only" || searchParams.get("onlySets") === "1") return "sets";
    return "all";
  });
  const [notesCombination, setNotesCombination] = useState(() => {
    const raw = searchParams.get("combination") || searchParams.get("combo");
    return raw === "1" || raw === "true";
  });
  const [sortBy, setSortBy] = useState(() => {
    const raw = searchParams.get("sort");
    return raw && (raw === "price-asc" || raw === "price-desc" || raw === "popular") ? raw : "popular";
  });

  // Sync state back to URL query parameters without resetting scroll position
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCategories.length > 0) params.set("category", selectedCategories.join(","));
    if (selectedBrands.length > 0) params.set("brand", selectedBrands.join(","));
    if (selectedGenders.length > 0) params.set("gender", selectedGenders.join(","));
    if (selectedNotes.length > 0) params.set("notes", selectedNotes.join(","));
    if (selectedVolumes.length > 0) params.set("volume", selectedVolumes.join(","));
    if (selectedLongevities.length > 0) params.set("longevity", selectedLongevities.join(","));
    if (selectedFormat && selectedFormat !== "all") params.set("format", selectedFormat);
    if (notesCombination) params.set("combination", "1");
    if (sortBy && sortBy !== "popular") params.set("sort", sortBy);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }, [
    selectedCategories,
    selectedBrands,
    selectedGenders,
    selectedNotes,
    selectedVolumes,
    selectedLongevities,
    selectedFormat,
    notesCombination,
    sortBy,
    setSearchParams,
  ]);

  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const [perfumes, setPerfumes] = useState(() => getCachedPerfumes() || []);
  const [loading, setLoading] = useState(() => (getCachedPerfumes() || []).length === 0);
  const [categories] = useState(() => [...getCategories(), ...EXTRA_FILTER_CATEGORIES]);
  const [addedIds, setAddedIds] = useState({});

  const [visibleLimit, setVisibleLimit] = useState(() => {
    const saved = Number(sessionStorage.getItem("warda_visible_featured"));
    return Number.isFinite(saved) && saved >= PAGE_SIZE ? saved : PAGE_SIZE;
  });

  useEffect(() => {
    sessionStorage.setItem("warda_visible_featured", String(visibleLimit));
  }, [visibleLimit]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPerfumes()
      .then((items) => {
        if (!cancelled) {
          const valid = (items || []).filter(hasCompletedGeneratedImage);
          setPerfumes(valid);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.warn("Could not load catalog:", error);
        if (!cancelled) setLoading(false);
      });

    const timer = window.setInterval(() => {
      getPerfumes({ refresh: true })
        .then((items) => {
          if (!cancelled) {
            const valid = (items || []).filter(hasCompletedGeneratedImage);
            setPerfumes(valid);
          }
        })
        .catch((err) => console.warn("Could not refresh catalog:", err));
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const setsCount = useMemo(() => {
    return perfumes.filter(isPerfumeSet).length;
  }, [perfumes]);

  // Multi-toggle helpers
  const toggleCategory = (catId) => {
    setVisibleLimit(PAGE_SIZE);
    setSelectedCategories((prev) => {
      const lower = catId.toLowerCase();
      if (prev.includes(lower)) {
        return prev.filter((c) => c !== lower);
      }
      return [...prev, lower];
    });
  };

  const toggleBrand = (brand) => {
    setVisibleLimit(PAGE_SIZE);
    setSelectedBrands((prev) => {
      if (prev.includes(brand)) {
        return prev.filter((b) => b !== brand);
      }
      return [...prev, brand];
    });
  };

  const toggleGender = (genderId) => {
    setVisibleLimit(PAGE_SIZE);
    setSelectedGenders((prev) => {
      if (prev.includes(genderId)) {
        return prev.filter((g) => g !== genderId);
      }
      return [...prev, genderId];
    });
  };

  const toggleNote = (noteId) => {
    setVisibleLimit(PAGE_SIZE);
    setSelectedNotes((prev) => {
      if (prev.includes(noteId)) {
        return prev.filter((n) => n !== noteId);
      }
      return [...prev, noteId];
    });
  };

  const toggleVolume = (volId) => {
    setVisibleLimit(PAGE_SIZE);
    setSelectedVolumes((prev) => {
      if (prev.includes(volId)) {
        return prev.filter((v) => v !== volId);
      }
      return [...prev, volId];
    });
  };

  const toggleLongevity = (longId) => {
    setVisibleLimit(PAGE_SIZE);
    setSelectedLongevities((prev) => {
      if (prev.includes(longId)) {
        return prev.filter((l) => l !== longId);
      }
      return [...prev, longId];
    });
  };

  const toggleFormat = (formatId) => {
    setVisibleLimit(PAGE_SIZE);
    setSelectedFormat(formatId);
  };

  const toggleOnlySets = () => {
    setVisibleLimit(PAGE_SIZE);
    setSelectedFormat((prev) => (prev === "sets" ? "all" : "sets"));
  };

  const resetAllFilters = () => {
    setSelectedCategories([]);
    setSelectedBrands([]);
    setSelectedGenders([]);
    setSelectedNotes([]);
    setSelectedVolumes([]);
    setSelectedLongevities([]);
    setSelectedFormat("all");
    setNotesCombination(false);
    setSortBy("popular");
    setVisibleLimit(PAGE_SIZE);
    setSearchParams({}, { replace: true, preventScrollReset: true });
  };

  // Active filter count
  const totalActiveFilters =
    selectedCategories.length +
    selectedBrands.length +
    selectedGenders.length +
    selectedNotes.length +
    selectedVolumes.length +
    selectedLongevities.length +
    (selectedFormat !== "all" ? 1 : 0);

  // Deterministic shuffled collection for default assortment (вразброс)
  const shuffledPerfumes = useMemo(() => {
    if (!perfumes || perfumes.length === 0) return [];
    const arr = [...perfumes];
    let seed = 42;
    for (let i = arr.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [perfumes]);

  // Filtered perfumes calculation
  const filteredPerfumes = useMemo(() => {
    let result = [];
    if (totalActiveFilters === 0) {
      if (sortBy === "popular") {
        return shuffledPerfumes;
      }
      result = [...perfumes];
    } else {
      result = perfumes.filter((p) => {
        // Format / Sets filter
        if (selectedFormat === "sets") {
          if (!isPerfumeSet(p)) return false;
        } else if (selectedFormat === "bottles") {
          if (isPerfumeSet(p)) return false;
        }

        // Bottle volume filter
        if (selectedVolumes.length > 0) {
          const ml = getPerfumeMl(p);
          const matchesVolume = selectedVolumes.some((volId) => {
            const opt = VOLUME_OPTIONS.find((v) => v.id === volId);
            return opt ? opt.matcher(ml) : false;
          });
          if (!matchesVolume) return false;
        }

        // Longevity filter
        if (selectedLongevities.length > 0) {
          const matchesLongevity = selectedLongevities.some((longId) => {
            const opt = LONGEVITY_OPTIONS.find((l) => l.id === longId);
            return opt ? opt.matcher(p) : false;
          });
          if (!matchesLongevity) return false;
        }

        const allNotesText = [
        ...(p.topNotes || []),
        ...(p.heartNotes || []),
        ...(p.baseNotes || []),
        ...(p.topNotesEn || []),
        ...(p.heartNotesEn || []),
        ...(p.baseNotesEn || []),
        p.notesSummary || "",
        p.notesSummaryEn || "",
        p.description || "",
        p.descriptionEn || "",
        p.categoryRu || "",
        p.categoryEn || "",
        p.name || "",
      ]
        .join(" ")
        .toLowerCase();

      // 1. Categories filter (OR within categories)
      if (selectedCategories.length > 0) {
        const pCat = (p.category || "").toLowerCase();
        const pInfoCat = `${p.info?.category || ""} ${p.categoryName || ""} ${p.categoryRu || ""} ${p.categoryEn || ""}`.toLowerCase();
        const matchesAnyCat = selectedCategories.some((catKey) => {
          if (catKey === "fresh" || catKey === "aquatic") {
            return pCat === "fresh" || pCat === "aquatic" || pInfoCat.includes("свеж") || pInfoCat.includes("морск") || pInfoCat.includes("акват") || allNotesText.includes("морск") || allNotesText.includes("мят");
          }
          if (catKey === "fougere" || catKey === "woody-fougere") {
            return pCat === "fougere" || pCat === "woody-fougere" || pInfoCat.includes("фужер") || allNotesText.includes("лаванд") || allNotesText.includes("мох");
          }
          if (catKey === "citrus" || catKey === "citrus-fresh") {
            return pCat === "citrus" || pCat === "citrus-fresh" || pInfoCat.includes("цитрус") || allNotesText.includes("грейпфрут") || allNotesText.includes("лимон");
          }
          if (catKey === "spicy" || catKey === "spices") {
            return pCat === "spicy" || pCat === "spices" || pInfoCat.includes("прян") || pInfoCat.includes("специ") || allNotesText.includes("кардамон") || allNotesText.includes("шафран") || allNotesText.includes("кориц");
          }
          if (catKey === "gourmand") {
            return pCat === "gourmand" || pInfoCat.includes("гурман") || allNotesText.includes("карамел") || allNotesText.includes("ванил") || allNotesText.includes("миндал") || allNotesText.includes("вишн");
          }
          if (catKey === "floral") {
            return pCat === "floral" || pInfoCat.includes("цвет") || pInfoCat.includes("роз") || allNotesText.includes("дамасская роза") || allNotesText.includes("таифская роза") || allNotesText.includes("жасмин");
          }
          if (catKey === "oud" || catKey === "wood") {
            return pCat === "oud" || pCat === "wood" || pInfoCat.includes("уд") || pInfoCat.includes("древ") || allNotesText.includes("благородный уд") || allNotesText.includes("дымный ладан");
          }
          if (catKey === "oriental") {
            return pCat === "spicy" || pCat === "oud" || pCat === "gourmand" || pInfoCat.includes("восточ") || pInfoCat.includes("амбр") || allNotesText.includes("амбр");
          }
          if (catKey === "woody") {
            return pCat === "oud" || pCat === "fougere" || pInfoCat.includes("древ") || allNotesText.includes("сандал") || allNotesText.includes("кедр") || allNotesText.includes("ветивер") || allNotesText.includes("пачул");
          }
          if (catKey === "fruity") {
            return pInfoCat.includes("фрукт") || pInfoCat.includes("ягод") || pInfoCat.includes("вишн") || allNotesText.includes("персик") || allNotesText.includes("груш") || allNotesText.includes("вишн") || allNotesText.includes("малин") || allNotesText.includes("смородин") || allNotesText.includes("яблок");
          }
          if (catKey === "leather") {
            return pInfoCat.includes("кож") || allNotesText.includes("кожа") || allNotesText.includes("leather");
          }
          if (catKey === "musky") {
            return pInfoCat.includes("мускус") || pInfoCat.includes("пудр") || allNotesText.includes("белый мускус") || allNotesText.includes("ирис");
          }
          return pCat === catKey || pCat.replace(/[^a-z0-9]/g, "") === catKey.replace(/[^a-z0-9]/g, "");
        });
        if (!matchesAnyCat) return false;
      }

      // 2. Brands filter (OR within brands)
      if (selectedBrands.length > 0) {
        const pBrand = (p.brand || "").toLowerCase();
        const pName = (p.name || "").toLowerCase();
        const matchesBrand = selectedBrands.some((b) => {
          const bLower = b.toLowerCase();
          return pBrand.includes(bLower) || pName.includes(bLower);
        });
        if (!matchesBrand) return false;
      }

      // 3. Gender filter (OR within gender)
      if (selectedGenders.length > 0) {
        const pGender = (p.gender || p.info?.gender || "").toLowerCase();
        const matchesGender = selectedGenders.some((g) => {
          if (g === "Women") return pGender.includes("жен") || pGender.includes("women");
          if (g === "Men") return (pGender.includes("муж") || pGender.includes("men")) && !pGender.includes("women");
          return pGender.includes("уни") || pGender.includes("uni");
        });
        if (!matchesGender) return false;
      }

      // 4. Notes filter:
      //    - Unchecked ("Комбинация" off): OR logic — matches any selected note
      //    - Checked ("Комбинация" on): AND logic — must contain ALL selected notes simultaneously
      if (selectedNotes.length > 0) {
        const checkSingleNote = (noteKey) => {
          const cleanKey = noteKey.toLowerCase();
          const noteObj = POPULAR_NOTES.find(
            (n) =>
              n.id === cleanKey ||
              n.nameRu.toLowerCase() === cleanKey ||
              n.nameEn.toLowerCase() === cleanKey
          );
          if (!noteObj) {
            return allNotesText.includes(cleanKey);
          }
          if (typeof NOTE_MATCHERS[noteObj.id] === "function") {
            return NOTE_MATCHERS[noteObj.id](allNotesText);
          }
          if (Array.isArray(noteObj.keywords)) {
            return noteObj.keywords.some((kw) => {
              const kwLower = kw.toLowerCase();
              if (kwLower.length <= 4) {
                const escaped = kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "iu").test(allNotesText);
              }
              return allNotesText.includes(kwLower);
            });
          }
          return (
            allNotesText.includes(noteObj.nameRu.toLowerCase()) ||
            allNotesText.includes(noteObj.nameEn.toLowerCase())
          );
        };

        const matchesNotes = notesCombination
          ? selectedNotes.every(checkSingleNote)
          : selectedNotes.some(checkSingleNote);
        if (!matchesNotes) return false;
      }

      return true;
    });
  }

    if (sortBy === "price-asc") {
      result.sort((a, b) => (getDefaultCatalogPrice(a) || 0) - (getDefaultCatalogPrice(b) || 0));
    } else if (sortBy === "price-desc") {
      result.sort((a, b) => (getDefaultCatalogPrice(b) || 0) - (getDefaultCatalogPrice(a) || 0));
    } else if (sortBy === "popular") {
      result.sort((a, b) => {
        const scoreA = (a.isBestSeller ? 50 : 0) + (a.isFeatured ? 25 : 0) + (Number(a.rating) || 4.5) * 10 + (Number(a.reviewsCount) || 0);
        const scoreB = (b.isBestSeller ? 50 : 0) + (b.isFeatured ? 25 : 0) + (Number(b.rating) || 4.5) * 10 + (Number(b.reviewsCount) || 0);
        return scoreB - scoreA;
      });
    }

    return result;
  }, [
    perfumes,
    shuffledPerfumes,
    totalActiveFilters,
    selectedCategories,
    selectedBrands,
    selectedGenders,
    selectedNotes,
    selectedVolumes,
    selectedLongevities,
    selectedFormat,
    notesCombination,
    sortBy,
  ]);

  const visiblePerfumes = filteredPerfumes.slice(0, visibleLimit);
  const remainingCount = Math.max(0, filteredPerfumes.length - visibleLimit);
  const progressPercent = filteredPerfumes.length > 0
    ? Math.min(100, Math.round((visiblePerfumes.length / filteredPerfumes.length) * 100))
    : 0;

  const loadMoreItems = useCallback(() => {
    if (isLoadingMore || visibleLimit >= filteredPerfumes.length) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleLimit((prev) => Math.min(prev + PAGE_SIZE, filteredPerfumes.length));
      setIsLoadingMore(false);
    }, 200);
  }, [isLoadingMore, visibleLimit, filteredPerfumes.length]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && visibleLimit < filteredPerfumes.length) {
          loadMoreItems();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isLoadingMore, visibleLimit, filteredPerfumes.length, loadMoreItems]);

  const handleAddToCart = async (perfume, e) => {
    e.stopPropagation();
    const defaultOpt = getDefaultPerfumeVolumeOption(perfume);
    const isSample = defaultOpt.isSecondLargest && defaultOpt.isSample;
    const volKey = isSample ? defaultOpt.key : null;
    const currentlyInCart = isInCart(perfume, isSample ? defaultOpt.key : "full");
    try {
      await toggleCart(perfume, {
        volKey,
        isSample,
        quantity: 1,
        language,
      });
      if (!currentlyInCart) {
        setAddedIds((prev) => ({ ...prev, [perfume.id]: true }));
        setTimeout(() => {
          setAddedIds((prev) => ({ ...prev, [perfume.id]: false }));
        }, 1800);
      }
    } catch (err) {
      console.warn("Cart toggle error:", err);
    }
  };

  return (
    <div className="container warda-shop-page">
      <div className="warda-shop-header">
        <h1 className="warda-shop-title">
          {t("featured.heading")}
        </h1>
        <p className="warda-shop-subtitle">
          {t("featured.subheading")}
        </p>

        {/* MULTI-FILTER TOOLBAR */}
        <div className="warda-filter-toolbar">
          <div className="warda-filter-bar-top">
            <div className="warda-filter-bar-left">
              <button
                type="button"
                className="warda-toggle-filters-btn"
                onClick={() => setIsFilterPanelOpen((prev) => !prev)}
                aria-expanded={isFilterPanelOpen}
              >
                <span>⚙ {t("featured.filters")}</span>
                {totalActiveFilters > 0 && (
                  <span className="warda-filter-count-badge">{totalActiveFilters}</span>
                )}
                <span>{isFilterPanelOpen ? "▲" : "▼"}</span>
              </button>

              <button
                type="button"
                className={`warda-sets-quick-toggle ${selectedFormat === "sets" ? "active" : ""}`}
                onClick={toggleOnlySets}
                title={t("featured.onlySetsTitle")}
              >
                <span>🎁 {t("featured.onlySets")}</span>
                {setsCount > 0 && (
                  <span className="warda-sets-count-badge">{setsCount}</span>
                )}
              </button>

              {totalActiveFilters > 0 && (
                <button
                  type="button"
                  className="warda-reset-filters-btn"
                  onClick={resetAllFilters}
                  title={t("featured.clearFilters")}
                >
                  ✕ {t("featured.clearFilters")}
                  <span className="warda-filter-count-badge" style={{ marginLeft: "4px" }}>
                    {totalActiveFilters}
                  </span>
                </button>
              )}
            </div>

            <div className="warda-filter-bar-right">
              <div className="warda-sort-container">
                <select
                  className="warda-sort-select"
                  value={sortBy}
                  onChange={(e) => {
                    setVisibleLimit(PAGE_SIZE);
                    setSortBy(e.target.value);
                  }}
                  aria-label={t("featured.sort")}
                >
                  <option value="popular">{t("featured.sortPopular")}</option>
                  <option value="price-asc">{t("featured.sortPriceAsc")}</option>
                  <option value="price-desc">{t("featured.sortPriceDesc")}</option>
                </select>
              </div>

              <div className="warda-filter-summary-text">
                {`${t("featured.showing")}: ${filteredPerfumes.length} ${t("featured.fragrancesCount")}`}
              </div>
            </div>
          </div>

          {/* ACTIVE FILTER CHIPS ROW */}
          {totalActiveFilters > 0 && (
            <div className="warda-active-chips">
              {selectedFormat !== "all" && (
                <span className="warda-chip">
                  {selectedFormat === "sets"
                    ? `🎁 ${t("featured.activePillSets")}`
                    : `🧴 ${t("featured.activePillBottles")}`}
                  <button type="button" className="warda-chip-remove" onClick={() => setSelectedFormat("all")}>×</button>
                </span>
              )}

              {selectedLongevities.map((l) => {
                const name = getLocalizedLongevity(l, language);
                return (
                  <span key={`chip-long-${l}`} className="warda-chip">
                    ⏳ {name}
                    <button type="button" className="warda-chip-remove" onClick={() => toggleLongevity(l)}>×</button>
                  </span>
                );
              })}

              {selectedVolumes.map((v) => {
                const name = getLocalizedVolumeOption(v, language);
                return (
                  <span key={`chip-vol-${v}`} className="warda-chip">
                    🧴 {name}
                    <button type="button" className="warda-chip-remove" onClick={() => toggleVolume(v)}>×</button>
                  </span>
                );
              })}

              {selectedCategories.map((c) => {
                const name = getLocalizedCategory(c, language);
                return (
                  <span key={`chip-cat-${c}`} className="warda-chip">
                    {name}
                    <button type="button" className="warda-chip-remove" onClick={() => toggleCategory(c)}>×</button>
                  </span>
                );
              })}

              {selectedBrands.map((b) => (
                <span key={`chip-b-${b}`} className="warda-chip">
                  {b}
                  <button type="button" className="warda-chip-remove" onClick={() => toggleBrand(b)}>×</button>
                </span>
              ))}

              {selectedGenders.map((g) => {
                const gName = getLocalizedGender(g, language);
                return (
                  <span key={`chip-g-${g}`} className="warda-chip">
                    {gName}
                    <button type="button" className="warda-chip-remove" onClick={() => toggleGender(g)}>×</button>
                  </span>
                );
              })}

              {selectedNotes.map((n) => {
                const nName = getLocalizedNote(n, language);
                return (
                  <span key={`chip-n-${n}`} className="warda-chip">
                    {nName}
                    <button type="button" className="warda-chip-remove" onClick={() => toggleNote(n)}>×</button>
                  </span>
                );
              })}
            </div>
          )}

          {/* EXPANDABLE MULTI-SELECT PANEL */}
          {isFilterPanelOpen && (
            <div className="warda-filters-expanded">
              {/* Release Format (Sets / Bottles) section */}
              <div>
                <div className="warda-filter-section-header">
                  <div className="warda-filter-section-title">
                    🎁 {t("featured.format")}
                  </div>
                  {selectedFormat !== "all" && (
                    <button
                      type="button"
                      className="warda-filter-section-clear-btn"
                      onClick={() => {
                        setVisibleLimit(PAGE_SIZE);
                        setSelectedFormat("all");
                      }}
                      title={t("featured.clear")}
                    >
                      ✕ {t("featured.clear")}
                    </button>
                  )}
                </div>
                <div className="warda-pills-wrap">
                  {FORMAT_OPTIONS.map((fmt) => {
                    const isActive = selectedFormat === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        className={`warda-filter-pill ${isActive ? "active" : ""}`}
                        onClick={() => toggleFormat(fmt.id)}
                      >
                        {isActive && "✓ "}
                        {getLocalizedFormat(fmt.id, language)}
                        {fmt.id === "sets" && setsCount > 0 && ` (${setsCount})`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fragrance Longevity section */}
              <div>
                <div className="warda-filter-section-header">
                  <div className="warda-filter-section-title">
                    ⏳ {t("featured.longevity")}
                  </div>
                  {selectedLongevities.length > 0 && (
                    <button
                      type="button"
                      className="warda-filter-section-clear-btn"
                      onClick={() => {
                        setVisibleLimit(PAGE_SIZE);
                        setSelectedLongevities([]);
                      }}
                      title={t("featured.clear")}
                    >
                      ✕ {t("featured.clear")}
                    </button>
                  )}
                </div>
                <div className="warda-pills-wrap">
                  {LONGEVITY_OPTIONS.map((opt) => {
                    const isActive = selectedLongevities.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`warda-filter-pill ${isActive ? "active" : ""}`}
                        onClick={() => toggleLongevity(opt.id)}
                      >
                        {isActive && "✓ "}
                        {getLocalizedLongevity(opt.id, language)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bottle Volume section */}
              <div>
                <div className="warda-filter-section-header">
                  <div className="warda-filter-section-title">
                    🧴 {t("featured.volume")}
                  </div>
                  {selectedVolumes.length > 0 && (
                    <button
                      type="button"
                      className="warda-filter-section-clear-btn"
                      onClick={() => {
                        setVisibleLimit(PAGE_SIZE);
                        setSelectedVolumes([]);
                      }}
                      title={t("featured.clear")}
                    >
                      ✕ {t("featured.clear")}
                    </button>
                  )}
                </div>
                <div className="warda-pills-wrap">
                  {VOLUME_OPTIONS.map((opt) => {
                    const isActive = selectedVolumes.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`warda-filter-pill ${isActive ? "active" : ""}`}
                        onClick={() => toggleVolume(opt.id)}
                      >
                        {isActive && "✓ "}
                        {getLocalizedVolumeOption(opt.id, language)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category section */}
              <div>
                <div className="warda-filter-section-header">
                  <div className="warda-filter-section-title">
                    🏷️ {t("featured.category")}
                  </div>
                  {selectedCategories.length > 0 && (
                    <button
                      type="button"
                      className="warda-filter-section-clear-btn"
                      onClick={() => {
                        setVisibleLimit(PAGE_SIZE);
                        setSelectedCategories([]);
                      }}
                      title={t("featured.clear")}
                    >
                      ✕ {t("featured.clear")}
                    </button>
                  )}
                </div>
                <div className="warda-pills-wrap">
                  {categories.map((cat) => {
                    const isActive = selectedCategories.includes(cat.id.toLowerCase()) || selectedCategories.includes((cat.slug || "").toLowerCase());
                    const catName = getLocalizedCategory(cat, language);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className={`warda-filter-pill ${isActive ? "active" : ""}`}
                        onClick={() => toggleCategory(cat.slug || cat.id)}
                      >
                        {isActive && "✓ "}
                        {catName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Gender section */}
              <div>
                <div className="warda-filter-section-header">
                  <div className="warda-filter-section-title">
                    👥 {t("featured.gender")}
                  </div>
                  {selectedGenders.length > 0 && (
                    <button
                      type="button"
                      className="warda-filter-section-clear-btn"
                      onClick={() => {
                        setVisibleLimit(PAGE_SIZE);
                        setSelectedGenders([]);
                      }}
                      title={t("featured.clear")}
                    >
                      ✕ {t("featured.clear")}
                    </button>
                  )}
                </div>
                <div className="warda-pills-wrap">
                  {GENDER_OPTIONS.map((g) => {
                    const isActive = selectedGenders.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        className={`warda-filter-pill ${isActive ? "active" : ""}`}
                        onClick={() => toggleGender(g.id)}
                      >
                        {isActive && "✓ "}
                        {getLocalizedGender(g.id, language)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Brands section */}
              <div>
                <div className="warda-filter-section-header">
                  <div className="warda-filter-section-title">
                    💎 {t("featured.brand")}
                  </div>
                  {selectedBrands.length > 0 && (
                    <button
                      type="button"
                      className="warda-filter-section-clear-btn"
                      onClick={() => {
                        setVisibleLimit(PAGE_SIZE);
                        setSelectedBrands([]);
                      }}
                      title={t("featured.clear")}
                    >
                      ✕ {t("featured.clear")}
                    </button>
                  )}
                </div>
                <div className="warda-pills-wrap">
                  {POPULAR_ARABIAN_BRANDS.map((brand) => {
                    const isActive = selectedBrands.includes(brand);
                    return (
                      <button
                        key={brand}
                        type="button"
                        className={`warda-filter-pill ${isActive ? "active" : ""}`}
                        onClick={() => toggleBrand(brand)}
                      >
                        {isActive && "✓ "}
                        {brand}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes section */}
              <div className="warda-filter-notes-section">
                <div className="warda-filter-section-header">
                  <div className="warda-filter-section-title">
                    🌿 {t("featured.notes")}
                  </div>
                  {selectedNotes.length > 0 && (
                    <button
                      type="button"
                      className="warda-filter-section-clear-btn"
                      onClick={() => {
                        setVisibleLimit(PAGE_SIZE);
                        setSelectedNotes([]);
                        setNotesCombination(false);
                      }}
                      title={t("featured.clear")}
                    >
                      ✕ {t("featured.clear")}
                    </button>
                  )}
                </div>

                <div className="warda-combination-block">
                  <label className="warda-combination-checkbox-label">
                    <input
                      type="checkbox"
                      className="warda-combination-checkbox"
                      checked={notesCombination}
                      onChange={(e) => {
                        setVisibleLimit(PAGE_SIZE);
                        setNotesCombination(e.target.checked);
                      }}
                    />
                    <span className="warda-combination-custom-check" aria-hidden="true" />
                    <span className="warda-combination-label-text">
                      {t("featured.combination")}
                    </span>
                  </label>
                </div>
                <div className="warda-pills-wrap">
                  {POPULAR_NOTES.map((note) => {
                    const isActive = selectedNotes.includes(note.id);
                    return (
                      <button
                        key={note.id}
                        type="button"
                        className={`warda-filter-pill ${isActive ? "active" : ""}`}
                        onClick={() => toggleNote(note.id)}
                      >
                        {isActive && "✓ "}
                        {getLocalizedNote(note.id, language)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CLEAR ALL EXPANDED FOOTER */}
              <div className="warda-filters-expanded-footer">
                <button
                  type="button"
                  className="warda-clear-all-expanded-btn"
                  onClick={resetAllFilters}
                  disabled={totalActiveFilters === 0}
                  title={t("featured.clearFilters")}
                >
                  ✕ {t("featured.clearFilters")}
                  {totalActiveFilters > 0 && ` (${totalActiveFilters})`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="warda-shop-loader">
          <div className="app-route-loader__spinner" />
          <p>{t("featured.loading")}</p>
        </div>
      ) : filteredPerfumes.length === 0 ? (
        <div className="warda-shop-empty">
          <p>{t("featured.noMatch")}</p>
          <button type="button" className="warda-load-more-btn" onClick={resetAllFilters} style={{ marginTop: "1.5rem" }}>
            {t("featured.resetFilters")}
          </button>
        </div>
      ) : (
        <>
          {/* CATALOG COUNT (LINE & PERCENT REMOVED) */}
          <div className="warda-catalog-progress-bar">
            <div className="warda-progress-meta">
              <span className="warda-catalog-count-text">
                {`${t("featured.showing")} ${visiblePerfumes.length} / ${filteredPerfumes.length} ${t("featured.fragrancesCount")}`}
              </span>
            </div>
          </div>

          {/* PERFUME GRID - ALWAYS 4 ITEMS PER ROW ON DESKTOP */}
          <div className="warda-shop-grid">
            {visiblePerfumes.map((perfume) => {
              const isAdded = Boolean(addedIds[perfume.id]);
              const defaultOpt = getDefaultPerfumeVolumeOption(perfume);
              const isSample = defaultOpt.isSecondLargest && defaultOpt.isSample;
              const productUrl = defaultOpt.isSecondLargest
                ? (isSample ? `${getPerfumeUrl(perfume)}?sample=${defaultOpt.key}` : `${getPerfumeUrl(perfume)}?size=${defaultOpt.key}`)
                : getPerfumeUrl(perfume);
              const displayPrice = defaultOpt.price;
              const displayVolume = defaultOpt.isSecondLargest
                ? formatVolume(defaultOpt.ml || defaultOpt.labelEn, language)
                : formatVolume(perfume.volume ? perfume.volume.split("/")[0].trim() : "", language);
              return (
                <OrnateCard
                  key={perfume.id}
                  className="warda-perfume-card"
                  onClick={() => {
                    const scrollKey = `warda_scroll_${window.location.pathname}${window.location.search}`;
                    sessionStorage.setItem(scrollKey, String(window.scrollY));
                    navigate(productUrl);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const scrollKey = `warda_scroll_${window.location.pathname}${window.location.search}`;
                      sessionStorage.setItem(scrollKey, String(window.scrollY));
                      navigate(productUrl);
                    }
                  }}
                >
                  <div className="warda-perfume-card__media">
                    {isPerfumeSet(perfume) && (
                      <span className="warda-perfume-card__set-tag">
                        🎁 {t("featured.giftSet")}
                      </span>
                    )}
                    <span className="warda-perfume-card__aura" />
                    <span className="warda-perfume-card__sheen" />
                    <img
                      src={perfume.image}
                      alt={perfume.name}
                      className="warda-perfume-card__img"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        const card = e.currentTarget.closest(".warda-perfume-card");
                        if (card) card.style.display = "none";
                      }}
                    />
                  </div>

                  <div className="warda-perfume-card__info">
                    <h3 className="warda-perfume-card__title" title={perfume.name}>
                      {perfume.name}
                    </h3>
                    <p className="warda-perfume-card__notes">
                      {perfume.brand || "Al-Warda"}
                      {displayVolume && (
                        <span style={{ marginLeft: "0.4rem", opacity: 0.75, fontSize: "0.8rem" }}>
                          · {displayVolume}
                        </span>
                      )}
                    </p>
                    <div className="warda-perfume-card__price">
                      {formatPrice(displayPrice)}
                    </div>
                  </div>

                  <div className="warda-perfume-card__action">
                    {(() => {
                      const inCart = isInCart(perfume, isSample ? defaultOpt.key : "full");
                      return (
                        <button
                          type="button"
                          className={`warda-btn warda-btn--card ${inCart ? "warda-btn--in-cart" : isAdded ? "warda-btn--added" : ""}`}
                          onClick={(e) => handleAddToCart(perfume, e)}
                          aria-label={inCart ? t("featured.remove") : `Add ${perfume.name} to cart`}
                          title={inCart ? t("featured.remove") : undefined}
                        >
                          {inCart ? (
                            <>
                              <span className="warda-btn__text-normal">{t("featured.inBag")}</span>
                              <span className="warda-btn__text-hover">{t("featured.remove")}</span>
                            </>
                          ) : isAdded ? (
                            t("featured.added")
                          ) : (
                            t("featured.addToCart")
                          )}
                        </button>
                      );
                    })()}
                  </div>
                </OrnateCard>
              );
            })}
          </div>

          {/* CONTINUATION INDICATOR / LOAD MORE / SKELETON */}
          <div ref={sentinelRef} className="warda-continuation-wrap">
            {remainingCount > 0 ? (
              <>
                <button
                  type="button"
                  className="warda-load-more-btn"
                  onClick={loadMoreItems}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore
                    ? t("featured.loadingNext")
                    : `✦ ${t("featured.loadMore")} (${Math.min(PAGE_SIZE, remainingCount)} / ${remainingCount}) ✦`}
                </button>
              </>
            ) : (
              <div className="warda-catalog-ended">
                ✦ {t("featured.allViewed")} {filteredPerfumes.length} {t("featured.fragrancesCount")} ✦
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
