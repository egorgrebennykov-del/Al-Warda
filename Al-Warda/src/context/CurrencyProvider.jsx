import { useEffect, useState, useMemo, useRef } from "react";
import { CurrencyContext } from "./currencyContext";
import { useLanguage } from "./languageContext";
import { getCookie, setCookie } from "../../utils/cookies";
import initialRatesData from "../data/currencyRates.json";
import {
  CURRENCIES,
  DEFAULT_RATES,
  convertPriceValue,
  formatPriceWithCurrency,
} from "./currencyUtils";

export { CURRENCIES, DEFAULT_RATES, convertPriceValue, formatPriceWithCurrency };

const COOKIE_KEY = "warda_currency";
const STORAGE_KEY = "warda_currency";

function getInitialCurrency() {
  if (typeof document === "undefined") return "EUR";
  try {
    const fromCookie = getCookie(COOKIE_KEY);
    if (["EUR", "RON", "HUF"].includes(fromCookie)) return fromCookie;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (["EUR", "RON", "HUF"].includes(saved)) return saved;
  } catch {
    // Ignore storage/cookie errors
  }
  return "EUR";
}

export default function CurrencyProvider({ children }) {
  const { language } = useLanguage();
  const [currency, setCurrencyState] = useState(getInitialCurrency);
  const [rates, setRates] = useState(() => initialRatesData.rates || { EUR: 1, RON: 5.343, HUF: 362.99 });
  const prevLangRef = useRef(language);

  const setCurrency = (newCur) => {
    if (!["EUR", "RON", "HUF"].includes(newCur)) return;
    setCurrencyState(newCur);
    setCookie(COOKIE_KEY, newCur);
    try {
      localStorage.setItem(STORAGE_KEY, newCur);
    } catch {
      // Ignore storage errors
    }
  };

  const toggleCurrency = () => {
    setCurrencyState((curr) => {
      let next = "EUR";
      if (curr === "EUR") next = "RON";
      else if (curr === "RON") next = "HUF";
      else next = "EUR";

      setCookie(COOKIE_KEY, next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      return next;
    });
  };

  // Rule: when switching to Hungarian (hu), currency must automatically become leu (RON)
  // Rule: when switching to English (en), Bulgarian (bg) or Greek (el), default currency is Euro (EUR)
  useEffect(() => {
    if (language === "hu" && prevLangRef.current !== "hu") {
      setCurrency("RON");
    } else if (
      (language === "en" || language === "bg" || language === "el") &&
      prevLangRef.current !== language
    ) {
      setCurrency("EUR");
    }
    prevLangRef.current = language;
  }, [language]);

  // Non-blocking background fetch of latest rates file
  useEffect(() => {
    let cancelled = false;
    fetch(`/data/currencyRates.json?t=${Date.now()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data?.rates) {
          setRates((prev) => ({
            ...prev,
            ...data.rates,
          }));
        }
      })
      .catch(() => {
        // Fallback to bundled rates
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const convertPrice = useMemo(() => {
    return (priceInEur, targetCurrency) => {
      const p = Number(priceInEur) || 0;
      const cur = targetCurrency || currency;
      const rate = Number(rates[cur]) || 1;
      return p * rate;
    };
  }, [currency, rates]);

  const formatPrice = useMemo(() => {
    return (priceInEur, overrideCurrency) => {
      const cur = overrideCurrency || currency;
      return formatPriceWithCurrency(priceInEur, cur, rates);
    };
  }, [currency, rates]);

  const curConfig = CURRENCIES[currency] || CURRENCIES.EUR;

  const value = useMemo(
    () => ({
      currency,
      setCurrency,
      toggleCurrency,
      rates,
      convertPrice,
      formatPrice,
      currencySymbol: curConfig.symbol,
      currencyLabel: curConfig.short,
      currencies: CURRENCIES,
    }),
    [currency, rates, convertPrice, formatPrice, curConfig],
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}
