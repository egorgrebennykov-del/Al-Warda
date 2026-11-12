import { useEffect, useMemo, useState } from "react";
import { LanguageContext } from "./languageContext";
import { DEFAULT_LANGUAGE, getBundledTranslation, loadTranslation } from "./translations";
import { getCookie, setCookie } from "../../utils/cookies";

const COOKIE_KEY = "warda_language";
const STORAGE_KEY = "warda_language";
const LANGUAGE_CODES = ["ru", "en", "hu", "bg", "el", "ro"];

export function getInitialLanguage() {
  if (typeof document === "undefined") return DEFAULT_LANGUAGE;
  try {
    const fromCookie = getCookie(COOKIE_KEY) || getCookie("language");
    if (LANGUAGE_CODES.includes(fromCookie)) return fromCookie;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGE_CODES.includes(saved)) return saved;
  } catch {
    // Ignore storage/cookie errors
  }
  return DEFAULT_LANGUAGE;
}

export default function LanguageProvider({ children, initialLanguage, initialDict }) {
  const [language, setLanguage] = useState(() => initialLanguage || getInitialLanguage());
  const [dictionaries, setDictionaries] = useState(() => {
    const dicts = { [DEFAULT_LANGUAGE]: getBundledTranslation(DEFAULT_LANGUAGE) };
    if (initialDict) dicts[initialLanguage || DEFAULT_LANGUAGE] = initialDict;
    return dicts;
  });

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
    setCookie(COOKIE_KEY, language);
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Ignore storage errors
    }
    document.documentElement.lang = language;
  }, [language]);

  const toggleLanguage = () => {
    setLanguage((current) => {
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
    }),
    [language, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
