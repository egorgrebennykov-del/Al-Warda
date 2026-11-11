import { getQogitaProductUrl, getPerfumeUrl } from "../Al-Warda/utils/perfumes.js";

const p5333 = {
  id: "5333",
  name: "Al Haramain Amber Oud Bleu Edition 3 Pc Gift Set for Unisex - Luxury Cologne",
  brand: "Al Haramain",
  gtin: "6291106814316",
  info: { gtin: "6291106814316" }
};

console.log("Perfume URL:", getPerfumeUrl(p5333));
console.log("Qogita URL for 5333:", getQogitaProductUrl(p5333));
