import { createContext, useContext } from "react";

export const CurrencyContext = createContext({
  currency: "EUR",
  setCurrency: () => {},
  toggleCurrency: () => {},
  rates: { EUR: 1, RON: 5.343, HUF: 362.99 },
  convertPrice: (price) => Number(price) || 0,
  formatPrice: (price) => `€${Number(price || 0).toFixed(2)}`,
  currencySymbol: "€",
  currencyLabel: "EUR",
});

export function useCurrency() {
  return useContext(CurrencyContext);
}
