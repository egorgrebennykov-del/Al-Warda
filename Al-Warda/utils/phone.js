import { countries } from "../src/components/checkout/countryPhoneCodes.js";

export function normalizePhone(str) {
  if (!str) return "";
  return str.replace(/[^\d+]/g, "");
}

export function stripCountryCodeAndLeadingZero(inputVal, dialCode) {
  if (!inputVal) return "";
  let val = inputVal.trimStart();

  const digits = dialCode ? dialCode.replace("+", "") : "";
  if (digits) {
    const regexWithPlus = new RegExp(`^\\+${digits}\\s*`, "i");
    const regexWithoutPlus = new RegExp(`^${digits}\\s*`, "i");
    if (regexWithPlus.test(val)) {
      val = val.replace(regexWithPlus, "");
    } else if (regexWithoutPlus.test(val) && digits.length > 1) {
      val = val.replace(regexWithoutPlus, "");
    }
  }

  // Strip leading zero(s) (e.g. "087..." -> "87...")
  val = val.replace(/^0+/, "");
  return val;
}

export function findCountryByPhone(fullPhone) {
  if (!fullPhone) return null;
  const cleaned = fullPhone.trim();
  const sorted = [...countries].sort((a, b) => b.dialCode.length - a.dialCode.length);
  return sorted.find((c) => cleaned.startsWith(c.dialCode)) || null;
}
