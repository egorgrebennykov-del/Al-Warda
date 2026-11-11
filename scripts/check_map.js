import QOGITA_PRODUCTS_MAP from "../Al-Warda/src/data/qogitaProductsMap.js";

const keys = Object.keys(QOGITA_PRODUCTS_MAP);
console.log("Total entries in QOGITA_PRODUCTS_MAP:", keys.length);

const blancheMatches = keys.filter(k => k.includes("blanche") || k.includes("aventure"));
console.log("Matches with blanche or aventure:", blancheMatches);
