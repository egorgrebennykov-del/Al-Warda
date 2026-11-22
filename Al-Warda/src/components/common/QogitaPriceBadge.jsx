import { useAuth } from "../../context/AuthContext";
import { useCurrency } from "../../context/currencyContext";
import {
  getCookieUser,
  isPrivileged as checkIsPrivileged,
} from "../../../utils/auth";

export function resolveQogitaPrice(perfume) {
  if (!perfume) return null;
  const candidates = [
    perfume.info?.aromadealPrice,
    perfume.info?.unitPrice,
    perfume.info?.movPrice,
    perfume.qogitaPrice,
    perfume.price,
  ];
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== "") {
      const num = Number(c);
      if (Number.isFinite(num) && num > 0) {
        return Math.round(num * 100) / 100;
      }
    }
  }
  return null;
}

/**
 * Displays the supplier price badge (Aromadeal) next to the customer price
 * strictly for privileged users (admin / developer / privileged).
 */
export default function QogitaPriceBadge({ perfume, variant = "card" }) {
  const { user, isPrivileged: isPrivContext } = useAuth();
  const { formatPrice } = useCurrency();

  const isPrivilegedUser = Boolean(
    isPrivContext ||
      (user && checkIsPrivileged(user)) ||
      checkIsPrivileged(getCookieUser()),
  );

  if (!isPrivilegedUser) return null;

  const supplierPrice = resolveQogitaPrice(perfume);
  if (!supplierPrice) return null;

  return (
    <span
      className={`warda-qogita-price-badge warda-qogita-price-badge--${variant}`}
      title={`Aromadeal: €${supplierPrice.toFixed(2)}`}
    >
      Aromadeal: {formatPrice(supplierPrice)}
    </span>
  );
}
