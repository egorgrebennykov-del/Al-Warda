import QOGITA_PRODUCTS_MAP from "../Al-Warda/src/data/qogitaProductsMap.js";
import { getQogitaProductUrl } from "../Al-Warda/utils/perfumes.js";

const p5449 = {
  id: "5449",
  name: "Al Haramain L'Aventure Blanche Travel Set For Men Eau De",
  brand: "Al Haramain",
  gtin: "6291100130719",
  info: { gtin: "6291100130719" }
};

const url = getQogitaProductUrl(p5449);
console.log("Calculated Qogita URL for 5449:", url);
