import { useEffect, useState, useMemo } from "react";
import { LanguageContext } from "./languageContext";
import { translations } from "./translations";
import { getCookie, setCookie } from "../../utils/cookies";

const COOKIE_KEY = "litera_language";
const STORAGE_KEY = "litera_language";

function getInitialLanguage() {
  if (typeof document === "undefined") return "ru";
  try {
    const fromCookie = getCookie(COOKIE_KEY) || getCookie("language");
    if (fromCookie === "ru" || fromCookie === "en") return fromCookie;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch {
    // Ignore storage/cookie errors
  }
  return "ru";
}

export default function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);

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
    setLanguage((current) => (current === "ru" ? "en" : "ru"));
  };

  const t = useMemo(() => {
    return (key, fallback) => {
      const dict = translations[language] || translations.ru;
      return dict[key] ?? fallback ?? key;
    };
  }, [language]);

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
