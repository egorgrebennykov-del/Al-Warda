/**
 * Currency utilities for Al-Warda boutique.
 * Supported currencies:
 * - EUR (€) Euro (base)
 * - RON (lei) Romanian Leu
 * - HUF (Fr) Hungarian Forint
 */

export const CURRENCIES = {
  EUR: {
    code: "EUR",
    symbol: "€",
    label: "EUR (€)",
    short: "EUR",
    symbolPosition: "before",
    decimals: 2,
  },
  RON: {
    code: "RON",
    symbol: "lei",
    label: "RON (lei)",
    short: "lei",
    symbolPosition: "after",
    decimals: 2,
  },
  HUF: {
    code: "HUF",
    symbol: "Fr",
    label: "HUF (Fr)",
    short: "Fr",
    symbolPosition: "after",
    decimals: 0,
  },
};

export const DEFAULT_RATES = {
  EUR: 1,
  RON: 5.343,
  HUF: 362.99,
};

export function convertPriceValue(priceInEur, targetCurrency = "EUR", rates = {}) {
  const p = Number(priceInEur) || 0;
  const cur = ["EUR", "RON", "HUF"].includes(targetCurrency) ? targetCurrency : "EUR";
  const rate = Number(rates[cur]) || DEFAULT_RATES[cur] || 1;
  return p * rate;
}

export function formatPriceWithCurrency(priceInEur, currency = "EUR", rates = {}) {
  const targetCur = ["EUR", "RON", "HUF"].includes(currency) ? currency : "EUR";
  const converted = convertPriceValue(priceInEur, targetCur, rates);

  if (targetCur === "RON") {
    const rounded = (Math.round((converted + 1e-9) * 100) / 100).toFixed(2);
    return `${rounded} lei`;
  }
  if (targetCur === "HUF") {
    const rounded = Math.round(converted);
    const formatted = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${formatted} Fr`;
  }
  const rounded = (Math.round((converted + 1e-9) * 100) / 100).toFixed(2);
  return `€${rounded}`;
}
