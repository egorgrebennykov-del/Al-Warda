import { useEffect, useMemo, useRef, useState } from "react";
import { LanguageContext } from "./languageContext";
import { DEFAULT_LANGUAGE, getBundledTranslation, loadTranslation } from "./translations";
import { getCookie, setCookie } from "../../utils/cookies";

const COOKIE_KEY = "warda_language";
const STORAGE_KEY = "warda_language";
const LANGUAGE_CODES = ["ru", "en", "hu", "bg", "el", "ro"];

export const COUNTRY_TO_LANGUAGE = {
  HU: "hu",
  RO: "ro",
  BG: "bg",
  GR: "el",
};

export function resolveLanguageFromCountry(countryCode) {
  const code = String(countryCode || "").trim().toUpperCase();
  return COUNTRY_TO_LANGUAGE[code] || DEFAULT_LANGUAGE;
}

function getSavedLanguagePreference() {
  if (typeof document === "undefined") return null;
  try {
    const fromCookie = getCookie(COOKIE_KEY) || getCookie("language");
    if (LANGUAGE_CODES.includes(fromCookie)) return fromCookie;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGE_CODES.includes(saved)) return saved;
  } catch {
    // Ignore storage/cookie errors
  }
  return null;
}

export function getInitialLanguage() {
  return getSavedLanguagePreference() || DEFAULT_LANGUAGE;
}

let geoCountryPromise = null;
function fetchVisitorCountry() {
  if (typeof window === "undefined") return Promise.resolve("");
  if (!geoCountryPromise) {
    geoCountryPromise = fetch("/api/geo", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => String(data?.country || "").trim().toUpperCase())
      .catch(() => "");
  }
  return geoCountryPromise;
}

export default function LanguageProvider({ children, initialLanguage, initialDict }) {
  const hasExplicitPrefRef = useRef(Boolean(initialLanguage || getSavedLanguagePreference()));
  const [language, setLanguageState] = useState(() => initialLanguage || getInitialLanguage());
  const [detectedCountry, setDetectedCountry] = useState("");
  const [dictionaries, setDictionaries] = useState(() => {
    const dicts = { [DEFAULT_LANGUAGE]: getBundledTranslation(DEFAULT_LANGUAGE) };
    if (initialDict) dicts[initialLanguage || DEFAULT_LANGUAGE] = initialDict;
    return dicts;
  });

  const setLanguage = (nextLang) => {
    hasExplicitPrefRef.current = true;
    setLanguageState(nextLang);
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    fetchVisitorCountry().then((country) => {
      if (cancelled) return;
      if (country) setDetectedCountry(country);
      if (!hasExplicitPrefRef.current) {
        const detected = resolveLanguageFromCountry(country);
        hasExplicitPrefRef.current = true;
        setLanguageState(detected);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dictionaries[language]) return undefined;
    let cancelled = false;
    loadTranslation(language).then((dict) => {
      if (!cancelled) setDictionaries((current) => ({ ...current, [language]: dict }));
    });
    return () => {
      cancelled = true;
    };
  }, [language, dictionaries]);

  useEffect(() => {
    document.documentElement.lang = language;
    if (!hasExplicitPrefRef.current) return;
    setCookie(COOKIE_KEY, language);
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Ignore storage errors
    }
  }, [language]);

  const toggleLanguage = () => {
    hasExplicitPrefRef.current = true;
    setLanguageState((current) => {
      const index = LANGUAGE_CODES.indexOf(current);
      return LANGUAGE_CODES[(index + 1) % LANGUAGE_CODES.length];
    });
  };

  const t = useMemo(() => {
    const dict = dictionaries[language] || dictionaries[DEFAULT_LANGUAGE];
    return (key, fallback) => dict?.[key] ?? fallback ?? key;
  }, [language, dictionaries]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t,
      detectedCountry,
    }),
    [language, t, detectedCountry],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
