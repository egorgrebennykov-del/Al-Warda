export const BLAZO_STORE_ID = "01a2226b-a993-7380-b564-3e7457b581a6";
export const BLAZO_API_URL = "https://api.blazo.bg/v1";
export const BLAZO_CHECKOUT_URL = "https://yey2ss.blazo.bg/checkout";
export const BLAZO_TRACK_URL = "https://yey2ss.blazo.bg/track";

const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

const COUNTRY_NAME_MAP = [
  [/(?:^|[^\p{L}])(bulgaria|bg|българия|болгария|bulgarien)(?:$|[^\p{L}])/iu, "BG"],
  [/(?:^|[^\p{L}])(romania|ro|românia|румыния|румъния)(?:$|[^\p{L}])/iu, "RO"],
  [/(?:^|[^\p{L}])(greece|gr|hellas|ελλάδα|греция|гърция)(?:$|[^\p{L}])/iu, "GR"],
  [/(?:^|[^\p{L}])(hungary|hu|magyarország|венгрия|унгария)(?:$|[^\p{L}])/iu, "HU"],
  [/(?:^|[^\p{L}])(germany|deutschland|de|германия)(?:$|[^\p{L}])/iu, "DE"],
  [/(?:^|[^\p{L}])(italy|italia|it|италия)(?:$|[^\p{L}])/iu, "IT"],
  [/(?:^|[^\p{L}])(france|fr|франция)(?:$|[^\p{L}])/iu, "FR"],
  [/(?:^|[^\p{L}])(spain|espana|españa|es|испания)(?:$|[^\p{L}])/iu, "ES"],
  [/(?:^|[^\p{L}])(poland|polska|pl|польша)(?:$|[^\p{L}])/iu, "PL"],
  [/(?:^|[^\p{L}])(austria|österreich|at|австрия)(?:$|[^\p{L}])/iu, "AT"],
  [/(?:^|[^\p{L}])(netherlands|holland|nl|нидерланды|голландия)(?:$|[^\p{L}])/iu, "NL"],
];

export function normalizeDeliveryCountryCode(countryInput = "", fallbackIso = "") {
  const raw = String(countryInput || "").trim();
  if (raw) {
    const upper = raw.toUpperCase();
    if (upper === "BG" || upper === "RO" || upper === "GR" || upper === "HU") {
      return upper;
    }
    if (EU_COUNTRY_CODES.has(upper)) {
      return upper;
    }
    for (const [pattern, code] of COUNTRY_NAME_MAP) {
      if (pattern.test(raw)) return code;
    }
  }

  const fb = String(fallbackIso || "").trim().toUpperCase();
  if (fb === "BG" || fb === "RO" || fb === "GR" || fb === "HU") return fb;
  if (EU_COUNTRY_CODES.has(fb)) return fb;
  return "EU";
}

export function getAvailableDeliveryMethods(countryCode = "EU") {
  const code = String(countryCode || "EU").toUpperCase();
  if (code === "BG") {
    return [
      {
        id: "econt_office",
        carrier: "Econt",
        labelRu: "Econt — Офис / Еконтомат",
        labelEn: "Econt — Office / Locker",
        etaRu: "1–2 рабочих дня",
        etaEn: "1–2 business days",
        priceEur: 3.9,
      },
      {
        id: "speedy_office",
        carrier: "Speedy",
        labelRu: "Speedy — Офис / Автомат",
        labelEn: "Speedy — Office / Locker",
        etaRu: "1–2 рабочих дня",
        etaEn: "1–2 business days",
        priceEur: 3.9,
      },
      {
        id: "bg_door",
        carrier: "Econt / Speedy",
        labelRu: "Курьер до двери (Econt / Speedy)",
        labelEn: "Courier to Door (Econt / Speedy)",
        etaRu: "1–2 рабочих дня",
        etaEn: "1–2 business days",
        priceEur: 4.9,
      },
    ];
  }

  if (code === "RO") {
    return [
      {
        id: "ro_locker",
        carrier: "Sameday easybox / FAN",
        labelRu: "Почтомат easybox / FAN Courier",
        labelEn: "easybox Locker / FAN Courier",
        etaRu: "2–3 рабочих дня",
        etaEn: "2–3 business days",
        priceEur: 4.9,
      },
      {
        id: "ro_door",
        carrier: "FAN Courier / Sameday",
        labelRu: "Курьер до двери (Румыния)",
        labelEn: "Courier to Door (Romania)",
        etaRu: "2–3 рабочих дня",
        etaEn: "2–3 business days",
        priceEur: 5.9,
      },
    ];
  }

  if (code === "GR") {
    return [
      {
        id: "gr_locker",
        carrier: "Box Now / ACS",
        labelRu: "Почтомат Box Now / ACS",
        labelEn: "Box Now / ACS Locker",
        etaRu: "2–3 рабочих дня",
        etaEn: "2–3 business days",
        priceEur: 4.9,
      },
      {
        id: "gr_door",
        carrier: "ACS Courier / Speedy",
        labelRu: "Курьер до двери (Греция)",
        labelEn: "Courier to Door (Greece)",
        etaRu: "2–3 рабочих дня",
        etaEn: "2–3 business days",
        priceEur: 5.9,
      },
    ];
  }

  if (EU_COUNTRY_CODES.has(code)) {
    return [
      {
        id: "eu_courier",
        carrier: "DPD / GLS / DHL",
        labelRu: "Международный курьер по ЕС (DPD / GLS)",
        labelEn: "EU Tracked Courier (DPD / GLS)",
        etaRu: "3–5 рабочих дней",
        etaEn: "3–5 business days",
        priceEur: 5.0,
      },
    ];
  }

  return [
    {
      id: "intl_courier",
      carrier: "DHL Express",
      labelRu: "Международная доставка (DHL Express)",
      labelEn: "International Express (DHL)",
      etaRu: "5–8 рабочих дней",
      etaEn: "5–8 business days",
      priceEur: 9.9,
    },
  ];
}

export function calculateBlazoShippingQuote({
  country = "",
  countryIso = "",
  city = "",
  street = "",
  methodId = "",
  subtotalEur = 0,
  blazoConfig = null,
} = {}) {
  const countryCode = normalizeDeliveryCountryCode(country, countryIso);
  const methods = getAvailableDeliveryMethods(countryCode);
  const selectedMethod = methods.find((m) => m.id === methodId) || methods[0];

  const hasAddress = Boolean(
    String(city || "").trim().length > 0 || String(street || "").trim().length > 0,
  );

  let shippingCostEur = hasAddress ? Number(selectedMethod.priceEur || 0) : 0;
  let source = blazoConfig?.fromApi ? "blazo_api" : "blazo_tariffs";

  // Apply Blazo store-level override or free shipping threshold when returned by Blazo API
  const freeAbove = Number(blazoConfig?.freeShippingAboveEur);
  if (
    hasAddress &&
    Number.isFinite(freeAbove) &&
    freeAbove > 0 &&
    Number(subtotalEur) >= freeAbove
  ) {
    shippingCostEur = 0;
  } else if (hasAddress && blazoConfig?.flatRateByCountry?.[countryCode] !== undefined) {
    const apiRate = Number(blazoConfig.flatRateByCountry[countryCode]);
    if (Number.isFinite(apiRate) && apiRate >= 0) {
      shippingCostEur = apiRate;
    }
  }

  return {
    shippingCostEur: Math.round(shippingCostEur * 100) / 100,
    countryCode,
    methodId: selectedMethod.id,
    carrier: selectedMethod.carrier,
    etaRu: selectedMethod.etaRu,
    etaEn: selectedMethod.etaEn,
    methods,
    hasAddress,
    source,
    storeId: BLAZO_STORE_ID,
    trackUrl: BLAZO_TRACK_URL,
    checkoutUrl: BLAZO_CHECKOUT_URL,
  };
}

let cachedBlazoConfig = null;
let cachedBlazoConfigAt = 0;
const BLAZO_CONFIG_TTL_MS = 5 * 60 * 1000;

export async function fetchBlazoStoreShippingConfig({
  apiUrl = BLAZO_API_URL,
  storeId = BLAZO_STORE_ID,
  appSecret = "",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!appSecret || typeof fetchImpl !== "function") {
    return null;
  }
  if (cachedBlazoConfig && Date.now() - cachedBlazoConfigAt < BLAZO_CONFIG_TTL_MS) {
    return cachedBlazoConfig;
  }
  try {
    const base = String(apiUrl || BLAZO_API_URL).replace(/\/+$/, "");
    const res = await fetchImpl(`${base}/stores/${encodeURIComponent(storeId)}/config`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${appSecret}`,
        "X-Blazo-Store-Id": storeId,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = {
      fromApi: true,
      freeShippingAboveEur: data?.free_shipping_above ?? data?.freeShippingAbove ?? null,
      flatRateByCountry: data?.shipping_rates ?? data?.shippingRates ?? null,
      raw: data,
    };
    cachedBlazoConfig = parsed;
    cachedBlazoConfigAt = Date.now();
    return parsed;
  } catch {
    return null;
  }
}
