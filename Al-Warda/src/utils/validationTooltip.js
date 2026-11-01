/**
 * Custom Litera Validation Tooltip
 * Replaces native browser validation balloons with styled site tooltips.
 */

let activeBubble = null;
let activeTarget = null;
let dismissTimer = null;

function getSiteLanguage() {
  try {
    return (
      localStorage.getItem("litera_lang") ||
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
    activeBubble.classList.remove("litera-validation-bubble--visible");
    activeBubble.style.opacity = "0";
    activeBubble.style.pointerEvents = "none";
    setTimeout(() => {
      if (activeBubble && !activeBubble.classList.contains("litera-validation-bubble--visible")) {
        activeBubble.style.display = "none";
      }
    }, 200);
  }
}

function onTargetInput() {
  hideValidationTooltip();
}

function onScrollOrResize() {
  if (!activeTarget || !activeBubble || !activeBubble.classList.contains("litera-validation-bubble--visible")) {
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
    bubble.classList.add("litera-validation-bubble--above");
    bubble.classList.remove("litera-validation-bubble--below");
  } else {
    top = rect.bottom + 8;
    bubble.classList.add("litera-validation-bubble--below");
    bubble.classList.remove("litera-validation-bubble--above");
  }

  bubble.style.left = `${Math.round(left)}px`;
  bubble.style.top = `${Math.round(top)}px`;
}

function getOrCreateBubble() {
  if (activeBubble && document.body.contains(activeBubble)) {
    return activeBubble;
  }

  const bubble = document.createElement("div");
  bubble.className = "litera-validation-bubble";
  bubble.setAttribute("role", "alert");
  bubble.setAttribute("aria-live", "polite");

  bubble.innerHTML = `
    <div class="litera-validation-bubble__icon" aria-hidden="true">!</div>
    <div class="litera-validation-bubble__content">
      <span class="litera-validation-bubble__text"></span>
    </div>
    <button type="button" class="litera-validation-bubble__close" aria-label="Закрыть">×</button>
  `;

  const closeBtn = bubble.querySelector(".litera-validation-bubble__close");
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
  const textEl = bubble.querySelector(".litera-validation-bubble__text");
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
  bubble.classList.add("litera-validation-bubble--visible");

  // Re-trigger CSS pop animation
  bubble.classList.remove("litera-validation-bubble--animate");
  void bubble.offsetWidth;
  bubble.classList.add("litera-validation-bubble--animate");

  activeTarget = element;

  element.addEventListener("input", onTargetInput, { once: true });
  element.addEventListener("change", onTargetInput, { once: true });

  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => {
    hideValidationTooltip();
  }, 6000);
}

export function getFriendlyValidationMessage(target) {
  const isRu = getSiteLanguage().startsWith("ru");

  if (target.validity?.valueMissing) {
    return isRu ? "Заполните это поле." : "Please fill out this field.";
  }

  if (target.validity?.typeMismatch) {
    if (target.type === "email") {
      const val = target.value || "";
      if (val && !val.includes("@")) {
        return isRu
          ? `Адрес электронной почты должен содержать символ "@". В адресе "${val}" отсутствует символ "@".`
          : `Please include an '@' in the email address. '${val}' is missing an '@'.`;
      }
      return isRu
        ? "Введите корректный адрес электронной почты."
        : "Please enter a valid email address.";
    }
    if (target.type === "url") {
      return isRu
        ? "Введите правильный URL-адрес."
        : "Please enter a valid URL.";
    }
  }

  if (target.validity?.tooShort) {
    const min = target.minLength || target.getAttribute("minlength");
    const len = target.value ? target.value.length : 0;
    return isRu
      ? `Минимальная длина: ${min} симв. (введено: ${len}).`
      : `Please lengthen this text to ${min} characters or more (you currently have ${len} characters).`;
  }

  if (target.validity?.tooLong) {
    const max = target.maxLength || target.getAttribute("maxlength");
    return isRu
      ? `Максимальная длина: ${max} симв.`
      : `Please shorten this text to ${max} characters or less.`;
  }

  if (target.validity?.patternMismatch) {
    return isRu
      ? "Пожалуйста, соблюдайте указанный формат."
      : "Please match the requested format.";
  }

  return (
    target.validationMessage ||
    (isRu ? "Пожалуйста, проверьте это поле." : "Please check this field.")
  );
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
        if (form.__literaValidationActive) return;
        form.__literaValidationActive = true;
        setTimeout(() => {
          delete form.__literaValidationActive;
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
