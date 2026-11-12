import ru from "./translations/ru.js";

// The default language ships inside the main bundle; the other five dictionaries
// (~270 KB of source) are split into their own chunks and loaded on demand, so the
// first paint never downloads translations the visitor will not see.
const LANGUAGE_LOADERS = {
  en: () => import("./translations/en.js"),
  hu: () => import("./translations/hu.js"),
  bg: () => import("./translations/bg.js"),
  el: () => import("./translations/el.js"),
  ro: () => import("./translations/ro.js"),
};

export const DEFAULT_LANGUAGE = "ru";

export function getBundledTranslation(language) {
  return language === DEFAULT_LANGUAGE ? ru : null;
}

export async function loadTranslation(language) {
  if (language === DEFAULT_LANGUAGE) return ru;
  const loader = LANGUAGE_LOADERS[language];
  if (!loader) return ru;
  try {
    return (await loader()).default || ru;
  } catch {
    return ru;
  }
}
