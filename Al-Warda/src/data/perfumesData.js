export const PERFUME_CATEGORIES = [
  {
    id: "oud",
    name: "OUD & SMOKE",
    nameRu: "УД И ДЫМ",
    nameEn: "OUD & SMOKE",
    slug: "oud",
    title: "Oud & Smoke Collection",
    image: "/assets/img/categories/oud-smoke.webp",
    description: "Deep, resinous agarwood from ancient Arabian traditions. Rich, smoky, and majestic.",
  },
  {
    id: "citrus-fresh",
    name: "CITRUS",
    nameRu: "ЦИТРУСОВЫЕ",
    nameEn: "CITRUS",
    slug: "citrus",
    title: "Citrus Collection",
    image: "/assets/img/categories/citrus.webp",
    description: "Sun-drenched Calabrian bergamot, blood orange, crisp lemons, and crystal drops.",
  },
  {
    id: "gourmand",
    name: "GOURMAND",
    nameRu: "ГУРМАНСКИЕ",
    nameEn: "GOURMAND",
    slug: "gourmand",
    title: "Gourmand Collection",
    image: "/assets/img/categories/gourmand.webp",
    description: "Roasted hazelnuts, melted caramel, bourbon vanilla, and dark cocoa praline.",
  },
  {
    id: "floral",
    name: "FLORAL",
    nameRu: "ЦВЕТОЧНЫЕ",
    nameEn: "FLORAL",
    slug: "floral",
    title: "Floral Collection",
    image: "/assets/img/categories/floral.webp",
    description: "Imperial Taif roses, night-blooming jasmine, and velvet petals bathed in golden sun.",
  },
  {
    id: "fresh",
    name: "FRESH",
    nameRu: "СВЕЖИЕ",
    nameEn: "FRESH",
    slug: "fresh",
    title: "Fresh Collection",
    image: "/assets/img/categories/fresh.webp",
    description: "Crisp mint leaves, icy crystalline droplets, ozonic breezes, and vibrant green accord.",
  },
  {
    id: "spicy",
    name: "SPICES",
    nameRu: "СПЕЦИИ",
    nameEn: "SPICES",
    slug: "spices",
    title: "Spices Collection",
    image: "/assets/img/categories/spices.webp",
    description: "Royal saffron, black pepper, cardamom pods, and warm cinnamon bark.",
  },
  {
    id: "fougere",
    name: "FOUGÈRE",
    nameRu: "ФУЖЕРНЫЕ",
    nameEn: "FOUGÈRE",
    slug: "fougere",
    title: "Fougère Collection",
    image: "/assets/img/categories/fougere.webp",
    description: "Highland cedar, wild rosemary, bergamot rind, oakmoss, and herbal aromatic notes.",
  },
];

export const PERFUMES = [];

export function getPerfumeById(id) {
  if (!id) return null;
  const cleanId = String(id).toLowerCase().trim();
  const trailingNum = cleanId.match(/-(\d+)$/);
  return (
    PERFUMES.find(
      (p) =>
        p.id.toLowerCase() === cleanId ||
        p.slug?.toLowerCase() === cleanId ||
        (trailingNum && p.id === trailingNum[1]) ||
        p.name.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanId.replace(/[^a-z0-9]/g, ""),
    ) || null
  );
}

export function getPerfumesByCategory(category) {
  if (!category || category === "all") return PERFUMES;
  const cleanCat = category.toLowerCase().trim();
  return PERFUMES.filter(
    (p) =>
      p.category.toLowerCase() === cleanCat ||
      p.category.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanCat.replace(/[^a-z0-9]/g, ""),
  );
}

export function getBestSellers() {
  return PERFUMES.filter((p) => p.isBestSeller).slice(0, 3);
}
