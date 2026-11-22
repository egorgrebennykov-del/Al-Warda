#!/usr/bin/env python3
"""
Fetch live competitor EUR prices from Notino (notino.bg) for all active storefront
products, store them in Hasura `competitor_prices`, set `target_discount_pct = 0`
in `pricing_settings` (matching competitors 1:1), and recalculate & publish
`product_pricing.published_prices` using `purchase_cost_eur` from aromadeal.de.

Usage:
  python sync_competitor_prices.py
"""

from __future__ import annotations

import concurrent.futures
import datetime as dt
import json
import math
import re
import unicodedata
import urllib.parse
import urllib.request
from typing import Any

from migrate_qogita_to_aromadeal import (
    ENV_PATH,
    fetch_all_stocks,
    hasura_graphql,
    load_env,
)


COUNTRIES = ("BG", "GR", "HU", "RO")
SET_MARKERS = ("komplekt", "podarchen", "gift set", "discovery set", "coffret", "set")


def norm_tokens(text: str) -> set[str]:
    s = unicodedata.normalize("NFKD", str(text or ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    s = re.sub(r"['’`´]", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    stop = {
        "eau", "de", "parfum", "toilette", "cologne", "extrait", "edp", "edt",
        "spray", "for", "men", "women", "unisex", "fragrance", "perfume", "perfumes",
        "ml", "fl", "oz", "the", "and", "by", "of",
    }
    return {t for t in s.split() if t and t not in stop and not re.fullmatch(r"\d+(ml)?", t)}


def is_set_name(text: str) -> bool:
    low = str(text or "").lower()
    return any(m in low for m in SET_MARKERS)


def fetch_notino_match(product: dict[str, Any]) -> tuple[int, float | None, str | None, str | None]:
    sid = int(product["id"])
    name = (product.get("name") or product.get("title") or "").strip()
    brand = (product.get("brand") or "").strip()
    info = product.get("info") or {}
    want_set = is_set_name(name) or info.get("categorySlug") == "sets"

    # Clean query: strip volume/type noise for better Notino search recall
    clean_q = re.sub(r"\b\d+(?:[.,]\d+)?\s*ml\b", "", name, flags=re.I)
    clean_q = re.sub(r"\b(eau de parfum|eau de toilette|extrait de parfum|unisex|for men|for women|fragrance|spray|edp|edt)\b", "", clean_q, flags=re.I)
    clean_q = re.sub(r"\s+", " ", clean_q).strip()
    if brand and brand.lower() not in clean_q.lower():
        clean_q = f"{brand} {clean_q}".strip()

    url = f"https://www.notino.bg/search.asp?exps={urllib.parse.quote_plus(clean_q)}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "bg-BG,bg;q=0.9,en;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", "ignore")
    except Exception:
        return sid, None, None, None

    m = re.search(
        r'<script type="application/ld\+json">(\{"@context":"https://schema\.org","@type":"CollectionPage".*?)</script>',
        html,
        re.S,
    )
    if not m:
        return sid, None, None, None

    try:
        data = json.loads(m.group(1))
    except Exception:
        return sid, None, None, None

    target_tokens = norm_tokens(f"{brand} {clean_q}")
    if not target_tokens:
        return sid, None, None, None

    best_score = 0.0
    best_price = None
    best_url = None
    best_title = None

    for item in data.get("mainEntity") or []:
        cand_name = item.get("name") or ""
        offers = item.get("offers") or {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        cand_url = offers.get("url") or item.get("url") or ""
        if offers.get("priceCurrency") not in (None, "EUR"):
            continue
        try:
            price = float(offers.get("price") or 0)
        except (TypeError, ValueError):
            continue
        if price <= 0:
            continue

        cand_is_set = is_set_name(f"{cand_name} {cand_url}")
        if cand_is_set != want_set:
            continue

        cand_tokens = norm_tokens(cand_name)
        if not cand_tokens:
            continue
        inter = target_tokens & cand_tokens
        if not inter:
            continue
        coverage = len(inter) / len(target_tokens)
        precision = len(inter) / len(cand_tokens)
        if len(target_tokens) == 1 and len(cand_tokens) > 1:
            continue
        if precision < 0.6:
            continue
        score = 0.65 * coverage + 0.35 * precision
        if score > best_score:
            best_score = score
            best_price = round(price, 2)
            best_url = cand_url
            best_title = cand_name

    if best_score >= 0.72 and best_price is not None:
        return sid, best_price, best_url, best_title
    return sid, None, None, None


def calculate_min_price(cost: float, desired_net_profit: float = 5.0, tax_pct: float = 10.0, fee_pct: float = 2.9) -> float:
    t = tax_pct / 100.0
    f = fee_pct / 100.0
    return round((cost + desired_net_profit / (1.0 - t)) / (1.0 - f), 2)


def psych_round_99(price: float, min_price: float) -> float:
    p = max(price, min_price)
    cand = round(p - 0.99) + 0.99
    if cand < 0.99:
        cand = 0.99
    if cand + 1e-9 < min_price:
        cand = math.ceil(min_price - 0.99 - 1e-9) + 0.99
        if cand < 0.99:
            cand = 0.99
    return round(cand, 2)


def main() -> int:
    env = load_env(ENV_PATH)

    # 1. Ensure pricing_settings matches competitors 1:1 (target_discount_pct = 0)
    settings_mut = """
    mutation SetZeroDiscount {
      update_pricing_settings(where: { id: { _eq: 1 } }, _set: { target_discount_pct: 0 }) {
        affected_rows
      }
    }
    """
    hasura_graphql(env, settings_mut)
    print("Updated pricing_settings: target_discount_pct = 0 (match competitors).")

    # 2. Fetch active storefront products
    stocks = fetch_all_stocks(env)
    active = [
        s
        for s in stocks
        if s.get("in_stock")
        and ((s.get("info") or {}).get("imageGeneration") or {}).get("status") == "completed"
        and not ((s.get("info") or {}).get("googleTrends") or {}).get("hiddenFromSite")
    ]
    print(f"Fetching Notino competitor prices for {len(active)} active storefront products...")

    results: list[tuple[int, float | None, str | None, str | None]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for res in pool.map(fetch_notino_match, active):
            results.append(res)

    matched_comp = [r for r in results if r[1] is not None]
    print(f"Matched Notino competitor prices: {len(matched_comp)}/{len(active)}")

    now_iso = dt.datetime.now(dt.timezone.utc).isoformat()
    by_id = {int(s["id"]): s for s in active}

    # 3. Replace Notino competitor_prices for active products
    active_ids = [int(s["id"]) for s in active]
    del_mut = """
    mutation ClearOldNotino($ids: [Int!]!) {
      delete_competitor_prices(where: { stock_id: { _in: $ids }, competitor_name: { _eq: "Notino" } }) {
        affected_rows
      }
    }
    """
    hasura_graphql(env, del_mut, {"ids": active_ids})

    comp_objects = [
        {
            "stock_id": sid,
            "country": "BG",
            "competitor_name": "Notino",
            "price_eur": price,
            "updated_at": now_iso,
        }
        for sid, price, _, _ in matched_comp
    ]
    if comp_objects:
        ins_comp = """
        mutation InsertComp($objects: [competitor_prices_insert_input!]!) {
          insert_competitor_prices(objects: $objects) {
            affected_rows
          }
        }
        """
        for i in range(0, len(comp_objects), 100):
            hasura_graphql(env, ins_comp, {"objects": comp_objects[i : i + 100]})

    # 4. Recalculate and publish product_pricing for all active products
    comp_map = {sid: price for sid, price, _, _ in matched_comp}
    pricing_objects = []
    for s in active:
        sid = int(s["id"])
        cost = float(s.get("price") or 0)
        min_p = calculate_min_price(cost, desired_net_profit=5.0, tax_pct=10.0, fee_pct=2.9)
        comp_price = comp_map.get(sid)
        if comp_price is not None:
            final_p = psych_round_99(comp_price, min_p)
        else:
            # Fallback when Notino doesn't list this SKU: match typical EU retail (~1.42x wholesale/discount cost)
            final_p = psych_round_99(cost * 1.42, min_p)

        published = {c: final_p for c in COUNTRIES}
        pricing_objects.append(
            {
                "stock_id": sid,
                "purchase_cost_eur": round(cost, 2),
                "published_prices": published,
                "calculation_meta": {
                    "_meta": {
                        "source": "notino_competitor_match" if comp_price is not None else "retail_fallback_1.42x",
                        "notinoPriceEur": comp_price,
                        "updatedAt": now_iso,
                    }
                },
                "updated_at": now_iso,
            }
        )

    upsert_pricing = """
    mutation UpsertPricing($objects: [product_pricing_insert_input!]!) {
      insert_product_pricing(
        objects: $objects,
        on_conflict: {
          constraint: product_pricing_pkey,
          update_columns: [purchase_cost_eur, published_prices, calculation_meta, updated_at]
        }
      ) {
        affected_rows
      }
    }
    """
    for i in range(0, len(pricing_objects), 100):
        hasura_graphql(env, upsert_pricing, {"objects": pricing_objects[i : i + 100]})

    print("Sample updated retail prices:")
    for sid, comp_p, _, title in matched_comp[:10]:
        s = by_id[sid]
        pub = next(p["published_prices"]["BG"] for p in pricing_objects if p["stock_id"] == sid)
        print(f"  {s['name']} | cost=€{s['price']} | Notino=€{comp_p} ({title}) -> our site=€{pub}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
