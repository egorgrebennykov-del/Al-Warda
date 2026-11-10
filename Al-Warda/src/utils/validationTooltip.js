/**
 * Custom Al-Warda Validation Tooltip
 * Replaces native browser validation balloons with styled site tooltips.
 */

let activeBubble = null;
let activeTarget = null;
let dismissTimer = null;

function getSiteLanguage() {
  try {
    return (
      localStorage.getItem("warda_lang") ||
      localStorage.getItem("language") ||
      "ru"
    ).toLowerCase();
  } catch {
    return "ru";
  }
}

export function hideValidationTooltip() {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  if (activeTarget) {
    try {
      activeTarget.removeEventListener("input", onTargetInput);
      activeTarget.removeEventListener("change", onTargetInput);
    } catch {
      // ignore
    }
    activeTarget = null;
  }
  if (activeBubble) {
    activeBubble.classList.remove("warda-validation-bubble--visible");
    activeBubble.style.opacity = "0";
    activeBubble.style.pointerEvents = "none";
    setTimeout(() => {
      if (activeBubble && !activeBubble.classList.contains("warda-validation-bubble--visible")) {
        activeBubble.style.display = "none";
      }
    }, 200);
  }
}

function onTargetInput() {
  hideValidationTooltip();
}

function onScrollOrResize() {
  if (!activeTarget || !activeBubble || !activeBubble.classList.contains("warda-validation-bubble--visible")) {
    return;
  }
  // Check if target is still in viewport
  const rect = activeTarget.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > window.innerHeight) {
    hideValidationTooltip();
    return;
  }
  // Reposition
  repositionBubble(activeTarget, activeBubble);
}

function repositionBubble(element, bubble) {
  const rect = element.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const bubbleWidth = bubbleRect.width || 280;
  const bubbleHeight = bubbleRect.height || 42;

  let left = rect.left;
  if (left + bubbleWidth > window.innerWidth - 12) {
    left = Math.max(12, window.innerWidth - 12 - bubbleWidth);
  }
  if (left < 12) left = 12;

  const targetFocusX = Math.min(rect.left + 24, rect.left + rect.width / 2);
  const arrowLeft = Math.max(14, Math.min(targetFocusX - left - 6, bubbleWidth - 26));
  bubble.style.setProperty("--arrow-left", `${Math.round(arrowLeft)}px`);

  const spaceAbove = rect.top;
  const placeAbove = spaceAbove >= bubbleHeight + 14;

  let top;
  if (placeAbove) {
    top = rect.top - bubbleHeight - 8;
    bubble.classList.add("warda-validation-bubble--above");
    bubble.classList.remove("warda-validation-bubble--below");
  } else {
    top = rect.bottom + 8;
    bubble.classList.add("warda-validation-bubble--below");
    bubble.classList.remove("warda-validation-bubble--above");
  }

  bubble.style.left = `${Math.round(left)}px`;
  bubble.style.top = `${Math.round(top)}px`;
}

function getOrCreateBubble() {
  if (activeBubble && document.body.contains(activeBubble)) {
    return activeBubble;
  }

  const bubble = document.createElement("div");
  bubble.className = "warda-validation-bubble";
  bubble.setAttribute("role", "alert");
  bubble.setAttribute("aria-live", "polite");

  bubble.innerHTML = `
    <div class="warda-validation-bubble__icon" aria-hidden="true">!</div>
    <div class="warda-validation-bubble__content">
      <span class="warda-validation-bubble__text"></span>
    </div>
    <button type="button" class="warda-validation-bubble__close" aria-label="Закрыть">×</button>
  `;

  const closeBtn = bubble.querySelector(".warda-validation-bubble__close");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hideValidationTooltip();
    });
  }

  document.body.appendChild(bubble);
  activeBubble = bubble;
  return bubble;
}

export function showValidationTooltip(element, customMessage) {
  if (!element || typeof element.getBoundingClientRect !== "function") return;

  const bubble = getOrCreateBubble();
  const textEl = bubble.querySelector(".warda-validation-bubble__text");
  if (textEl) {
    textEl.textContent = customMessage || "Пожалуйста, проверьте это поле.";
  }

  bubble.style.visibility = "hidden";
  bubble.style.display = "flex";
  bubble.style.opacity = "0";
  bubble.style.pointerEvents = "auto";

  repositionBubble(element, bubble);

  bubble.style.visibility = "visible";
  bubble.style.opacity = "1";
  bubble.classList.add("warda-validation-bubble--visible");

  // Re-trigger CSS pop animation
  bubble.classList.remove("warda-validation-bubble--animate");
  void bubble.offsetWidth;
  bubble.classList.add("warda-validation-bubble--animate");

  activeTarget = element;

  element.addEventListener("input", onTargetInput, { once: true });
  element.addEventListener("change", onTargetInput, { once: true });

  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => {
    hideValidationTooltip();
  }, 6000);
}

const VALIDATION_STRINGS = {
  valueMissing: {
    ru: "Заполните это поле.",
    en: "Please fill out this field.",
    hu: "Kérjük, töltse ki ezt a mezőt.",
    bg: "Моля, попълнете това поле.",
    el: "Παρακαλώ συμπληρώστε αυτό το πεδίο.",
    ro: "Vă rugăm să completați acest câmp.",
  },
  emailMissingAt: {
    ru: (v) => `Адрес электронной почты должен содержать символ "@". В адресе "${v}" отсутствует символ "@".`,
    en: (v) => `Please include an '@' in the email address. '${v}' is missing an '@'.`,
    hu: (v) => `Kérjük, adjon meg '@' jelet az e-mail címben. A(z) '${v}' címből hiányzik a '@'.`,
    bg: (v) => `Имейл адресът трябва да съдържа символа „@“. В „${v}“ липсва „@“.`,
    el: (v) => `Η διεύθυνση email πρέπει να περιέχει '@'. Το '${v}' δεν περιέχει '@'.`,
    ro: (v) => `Adresa de email trebuie să conțină simbolul „@”. În „${v}” lipsește simbolul „@”.`,
  },
  emailInvalid: {
    ru: "Введите корректный адрес электронной почты.",
    en: "Please enter a valid email address.",
    hu: "Kérjük, adjon meg érvényes e-mail címet.",
    bg: "Моля, въведете валиден имейл адрес.",
    el: "Παρακαλώ εισάγετε έγκυρη διεύθυνση email.",
    ro: "Vă rugăm să introduceți o adresă de email validă.",
  },
  urlInvalid: {
    ru: "Введите правильный URL-адрес.",
    en: "Please enter a valid URL.",
    hu: "Kérjük, adjon meg érvényes webcímet.",
    bg: "Моля, въведете валиден уеб адрес.",
    el: "Παρακαλώ εισάγετε έγκυρη διεύθυνση URL.",
    ro: "Vă rugăm să introduceți o adresă URL validă.",
  },
  tooShort: {
    ru: (min, len) => `Минимальная длина: ${min} симв. (введено: ${len}).`,
    en: (min, len) => `Please lengthen this text to ${min} characters or more (you currently have ${len} characters).`,
    hu: (min, len) => `Kérjük, hosszabbítsa meg a szöveget legalább ${min} karakterre (jelenleg: ${len}).`,
    bg: (min, len) => `Минимална дължина: ${min} знака (въведени: ${len}).`,
    el: (min, len) => `Ελάχιστο μήκος: ${min} χαρακτήρες (έχετε εισάγει: ${len}).`,
    ro: (min, len) => `Lungime minimă: ${min} caractere (ați introdus: ${len}).`,
  },
  tooLong: {
    ru: (max) => `Максимальная длина: ${max} симв.`,
    en: (max) => `Please shorten this text to ${max} characters or less.`,
    hu: (max) => `Kérjük, rövidítse a szöveget legfeljebb ${max} karakterre.`,
    bg: (max) => `Максимална дължина: ${max} знака.`,
    el: (max) => `Μέγιστο μήκος: ${max} χαρακτήρες.`,
    ro: (max) => `Lungime maximă: ${max} caractere.`,
  },
  patternMismatch: {
    ru: "Пожалуйста, соблюдайте указанный формат.",
    en: "Please match the requested format.",
    hu: "Kérjük, kövesse a kért formátumot.",
    bg: "Моля, спазвайте посочения формат.",
    el: "Παρακαλώ ακολουθήστε την απαιτούμενη μορφή.",
    ro: "Vă rugăm să respectați formatul solicitat.",
  },
  defaultCheck: {
    ru: "Пожалуйста, проверьте это поле.",
    en: "Please check this field.",
    hu: "Kérjük, ellenőrizze ezt a mezőt.",
    bg: "Моля, проверете това поле.",
    el: "Παρακαλώ ελέγξτε αυτό το πεδίο.",
    ro: "Vă rugăm să verificați acest câmp.",
  },
};

function getMsg(category, lang, ...args) {
  const l = VALIDATION_STRINGS[category]?.[lang] ? lang : "en";
  const item = VALIDATION_STRINGS[category][l];
  return typeof item === "function" ? item(...args) : item;
}

export function getFriendlyValidationMessage(target) {
  const lang = (getSiteLanguage() || "ru").slice(0, 2);

  if (target.validity?.valueMissing) {
    return getMsg("valueMissing", lang);
  }

  if (target.validity?.typeMismatch) {
    if (target.type === "email") {
      const val = target.value || "";
      if (val && !val.includes("@")) {
        return getMsg("emailMissingAt", lang, val);
      }
      return getMsg("emailInvalid", lang);
    }
    if (target.type === "url") {
      return getMsg("urlInvalid", lang);
    }
  }

  if (target.validity?.tooShort) {
    const min = target.minLength || target.getAttribute("minlength");
    const len = target.value ? target.value.length : 0;
    return getMsg("tooShort", lang, min, len);
  }

  if (target.validity?.tooLong) {
    const max = target.maxLength || target.getAttribute("maxlength");
    return getMsg("tooLong", lang, max);
  }

  if (target.validity?.patternMismatch) {
    return getMsg("patternMismatch", lang);
  }

  return target.validationMessage || getMsg("defaultCheck", lang);
}

// Global initialization
if (typeof window !== "undefined" && typeof document !== "undefined") {
  // Capture native HTML5 constraint invalid events
  document.addEventListener(
    "invalid",
    (event) => {
      const target = event.target;
      if (!target || !(target instanceof HTMLElement)) return;

      // Suppress native OS / browser tooltip
      event.preventDefault();

      const form = target.form;
      if (form) {
        if (form.__wardaValidationActive) return;
        form.__wardaValidationActive = true;
        setTimeout(() => {
          delete form.__wardaValidationActive;
        }, 350);
      }

      const message = getFriendlyValidationMessage(target);
      showValidationTooltip(target, message);

      try {
        target.focus({ preventScroll: false });
      } catch {
        // ignore
      }
    },
    true, // capturing phase
  );

  window.addEventListener("scroll", onScrollOrResize, { passive: true });
  window.addEventListener("resize", onScrollOrResize, { passive: true });

  document.addEventListener("mousedown", (e) => {
    if (
      activeBubble &&
      !activeBubble.contains(e.target) &&
      e.target !== activeTarget
    ) {
      hideValidationTooltip();
    }
  });
}
