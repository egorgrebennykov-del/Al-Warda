import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../context/AuthContext";
import { useCurrency } from "../../context/currencyContext";
import { useLanguage } from "../../context/languageContext";
import {
  getCookieUser,
  isPrivileged as checkIsPrivileged,
} from "../../../utils/auth";
import { getAromadealProductUrl } from "../../../utils/aromadealProductUrls";

const competitorOffersCache = new Map();
const inflightRequests = new Map();

function buildCompetitorFallbackUrl(competitorName, productName) {
  const q = encodeURIComponent((productName || "").trim());
  const lower = String(competitorName || "").toLowerCase();
  if (lower.includes("notino")) {
    return `https://www.notino.bg/search.asp?exps=${q}`;
  }
  if (lower.includes("douglas")) {
    return `https://www.douglas.bg/catalogsearch/result/?q=${q}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(`${competitorName || ""} ${productName || ""}`.trim())}`;
}

async function fetchCompetitorOffers(stockId) {
  const key = String(stockId || "").trim();
  if (!key || !/^\d+$/.test(key)) return { competitors: [] };
  if (competitorOffersCache.has(key)) return competitorOffersCache.get(key);
  if (inflightRequests.has(key)) return inflightRequests.get(key);

  const req = fetch(`/api/admin/pricing/products/${encodeURIComponent(key)}`, {
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) return { competitors: [] };
      const data = await res.json();
      const item = data?.item || {};
      const result = {
        competitors: Array.isArray(item.competitors) ? item.competitors : [],
        purchaseCostEur: item.purchaseCostEur ?? null,
      };
      competitorOffersCache.set(key, result);
      return result;
    })
    .catch(() => ({ competitors: [] }))
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, req);
  return req;
}

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
 * strictly for privileged users, and shows a hoverable competitor prices
 * popover with direct links to each competitor's product page.
 */
export default function QogitaPriceBadge({ perfume, variant = "card" }) {
  const { user, isPrivileged: isPrivContext } = useAuth();
  const { formatPrice } = useCurrency();
  const { language } = useLanguage();
  const badgeRef = useRef(null);
  const closeTimerRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, placeBelow: false });
  const [loading, setLoading] = useState(false);
  const [offersData, setOffersData] = useState(null);

  const isPrivilegedUser = Boolean(
    isPrivContext ||
      (user && checkIsPrivileged(user)) ||
      checkIsPrivileged(getCookieUser()),
  );

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, 150);
  }, [cancelClose]);

  const openPopover = useCallback(() => {
    cancelClose();
    const anchor = badgeRef.current?.parentElement || badgeRef.current;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const placeBelow = rect.top < 190;
      const left = Math.max(
        12,
        Math.min(window.innerWidth - 280, rect.left + rect.width / 2 - 134),
      );
      setCoords({
        top: placeBelow ? rect.bottom + 8 : rect.top - 8,
        left,
        placeBelow,
      });
    }
    setOpen(true);
    const sid = perfume?.id;
    if (sid && /^\d+$/.test(String(sid))) {
      if (competitorOffersCache.has(String(sid))) {
        setOffersData(competitorOffersCache.get(String(sid)));
      } else {
        setLoading(true);
        fetchCompetitorOffers(sid)
          .then((res) => setOffersData(res))
          .finally(() => setLoading(false));
      }
    }
  }, [cancelClose, perfume?.id]);

  useEffect(() => {
    if (!isPrivilegedUser) return undefined;
    const parentEl = badgeRef.current?.parentElement;
    if (!parentEl) return undefined;

    parentEl.addEventListener("mouseenter", openPopover);
    parentEl.addEventListener("mouseleave", scheduleClose);
    return () => {
      parentEl.removeEventListener("mouseenter", openPopover);
      parentEl.removeEventListener("mouseleave", scheduleClose);
      cancelClose();
    };
  }, [isPrivilegedUser, openPopover, scheduleClose, cancelClose]);

  if (!isPrivilegedUser) return null;

  const supplierPrice = resolveQogitaPrice(perfume);
  if (!supplierPrice) return null;

  const gtAvgRaw =
    perfume?.googleTrendsAverage ??
    perfume?.info?.googleTrends?.average ??
    perfume?.info?.googleTrends?.avg;
  const gtMaxRaw =
    perfume?.googleTrendsMax ?? perfume?.info?.googleTrends?.max;
  const gtAvg =
    gtAvgRaw !== undefined && gtAvgRaw !== null && gtAvgRaw !== "" && Number.isFinite(Number(gtAvgRaw))
      ? Math.round(Number(gtAvgRaw) * 10) / 10
      : null;
  const gtMax =
    gtMaxRaw !== undefined && gtMaxRaw !== null && gtMaxRaw !== "" && Number.isFinite(Number(gtMaxRaw))
      ? Math.round(Number(gtMaxRaw) * 10) / 10
      : null;
  const hasTrends = gtAvg !== null || gtMax !== null;

  const competitors = offersData?.competitors || [];
  const aromadealUrl = getAromadealProductUrl(perfume);
  const titleText =
    language === "ru" ? "Цены конкурентов" : "Competitor Prices";
  const emptyText =
    language === "ru"
      ? "Нет сохранённых цен конкурентов"
      : "No saved competitor prices";
  const searchNotinoText =
    language === "ru" ? "Найти на Notino ↗" : "Search on Notino ↗";

  return (
    <>
      <span
        ref={badgeRef}
        className={`warda-qogita-price-badge warda-qogita-price-badge--${variant}`}
        title={`Aromadeal: €${supplierPrice.toFixed(2)}`}
      >
        Aromadeal: {formatPrice(supplierPrice)}
      </span>
      {hasTrends && (
        <span
          className={`warda-qogita-price-badge warda-trends-badge warda-qogita-price-badge--${variant}`}
          title={
            language === "ru"
              ? `Google Trends — средний: ${gtAvg ?? "—"}, макс: ${gtMax ?? "—"}`
              : `Google Trends — avg: ${gtAvg ?? "—"}, max: ${gtMax ?? "—"}`
          }
        >
          GT: {gtAvg ?? "—"} / {gtMax ?? "—"}
        </span>
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`warda-competitors-popover ${coords.placeBelow ? "is-below" : "is-above"}`}
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="warda-competitors-popover__header">
              <span>{titleText}</span>
              <a
                href={aromadealUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="warda-competitors-popover__supplier"
              >
                Aromadeal: {formatPrice(supplierPrice)} ↗
              </a>
            </div>

            {loading ? (
              <div className="warda-competitors-popover__empty">
                {language === "ru" ? "Загрузка..." : "Loading..."}
              </div>
            ) : competitors.length > 0 ? (
              <ul className="warda-competitors-popover__list">
                {competitors.map((comp, idx) => {
                  const href =
                    comp.productUrl ||
                    buildCompetitorFallbackUrl(
                      comp.competitorName,
                      perfume?.name,
                    );
                  return (
                    <li
                      key={comp.id || `${comp.competitorName}-${idx}`}
                      className="warda-competitors-popover__item"
                    >
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="warda-competitors-popover__link"
                      >
                        <span className="warda-competitors-popover__name">
                          {comp.competitorName}
                          {comp.country ? ` (${comp.country})` : ""}
                        </span>
                        <span className="warda-competitors-popover__price">
                          {formatPrice(comp.priceEur)} ↗
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="warda-competitors-popover__empty">
                <div>{emptyText}</div>
                <a
                  href={buildCompetitorFallbackUrl("Notino", perfume?.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="warda-competitors-popover__fallback-link"
                >
                  {searchNotinoText}
                </a>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
