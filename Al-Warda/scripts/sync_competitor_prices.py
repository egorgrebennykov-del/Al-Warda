#!/usr/bin/env python3
"""
Fetch live competitor EUR prices across all 5 target competitors:
  1. Notino (notino.bg)
  2. Douglas (douglas.bg GraphQL)
  3. Dubai Perfumery (dubai-perfumery.com Shopify JSON)
  4. AromaRay (aromaray.bg WooCommerce Store API)
  5. Arabic Scents (arabicscents.bg search HTML)

Stores all matched offers with direct `product_url` in Hasura `competitor_prices`,
sets `target_discount_pct = 0` in `pricing_settings`, computes the arithmetic mean
of competitor prices (never below minPrice), and publishes `product_pricing.published_prices`.
"""

from __future__ import annotations

import concurrent.futures
import datetime as dt
import html as html_lib
import json
import math
import os
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
SET_MARKERS = ("komplekt", "podarchen", "gift set", "discovery set", "coffret", "set", "комбо", "комплект")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"


def resolve_env() -> dict[str, str]:
    env = load_env(ENV_PATH)
    for k in ("HASURA_GRAPHQL_URL", "NHOST_GRAPHQL_URL", "HASURA_ADMIN_SECRET", "NHOST_ADMIN_SECRET"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def norm_tokens(text: str) -> set[str]:
    s = unicodedata.normalize("NFKD", str(text or ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    s = re.sub(r"['’`´]", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    stop = {
        "eau", "de", "parfum", "parfume", "toilette", "cologne", "extrait", "edp", "edt",
        "spray", "for", "men", "mens", "women", "womens", "unisex", "fragrance", "perfume",
        "perfumes", "parfyum", "damski", "mazhki", "arabski", "ml", "fl", "oz", "the", "and",
        "by", "of", "za", "nego", "neya", "voda", "parfyumna", "ekstrakt", "мл",
    }
    return {t for t in s.split() if t and t not in stop and not re.fullmatch(r"\d+(ml)?", t)}


def is_set_name(text: str) -> bool:
    low = str(text or "").lower()
    return any(m in low for m in SET_MARKERS)


def clean_search_query(product: dict[str, Any]) -> str:
    name = (product.get("name") or product.get("title") or "").strip()
    brand = (product.get("brand") or "").strip()
    clean_q = re.sub(r"\b\d+(?:[.,]\d+)?\s*ml\b", "", name, flags=re.I)
    clean_q = re.sub(
        r"\b(eau de parfum|eau de toilette|extrait de parfum|unisex|for men|for women|fragrance|spray|edp|edt)\b",
        "",
        clean_q,
        flags=re.I,
    )
    clean_q = re.sub(r"\s+", " ", clean_q).strip()
    if brand and brand.lower() not in clean_q.lower():
        clean_q = f"{brand} {clean_q}".strip()
    return clean_q


def score_candidate(target_tokens: set[str], want_set: bool, cand_name: str, cand_url: str = "") -> float:
    if is_set_name(f"{cand_name} {cand_url}") != want_set:
        return 0.0
    cand_tokens = norm_tokens(cand_name)
    if not cand_tokens or not target_tokens:
        return 0.0
    inter = target_tokens & cand_tokens
    if not inter:
        return 0.0
    if len(target_tokens) == 1 and len(cand_tokens) > 1:
        return 0.0
    coverage = len(inter) / len(target_tokens)
    precision = len(inter) / len(cand_tokens)
    if precision < 0.58:
        return 0.0
    return 0.65 * coverage + 0.35 * precision


def fetch_dubai_perfumery_catalog() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    page = 1
    while True:
        url = f"https://dubai-perfumery.com/products.json?limit=250&page={page}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                prods = json.loads(r.read().decode("utf-8", "ignore")).get("products") or []
        except Exception:
            break
        if not prods:
            break
        for p in prods:
            title = p.get("title") or ""
            handle = p.get("handle") or ""
            v = (p.get("variants") or [{}])[0] or {}
            try:
                price = float(v.get("price") or 0)
            except (TypeError, ValueError):
                price = 0.0
            if price <= 0 or not handle or "100% off" in title.lower():
                continue
            items.append({
                "name": title,
                "tokens": norm_tokens(f"{p.get('vendor', '')} {title}"),
                "is_set": is_set_name(title),
                "price": round(price, 2),
                "url": f"https://dubai-perfumery.com/products/{handle}",
            })
        if len(prods) < 250:
            break
        page += 1
    return items


def fetch_aromaray_catalog() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    page = 1
    while True:
        url = f"https://aromaray.bg/wp-json/wc/store/v1/products?per_page=100&page={page}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                prods = json.loads(r.read().decode("utf-8", "ignore"))
        except Exception:
            break
        if not isinstance(prods, list) or not prods:
            break
        for p in prods:
            title = html_lib.unescape(p.get("name") or "")
            link = p.get("permalink") or ""
            prices = p.get("prices") or {}
            minor = int(prices.get("currency_minor_unit") or 2)
            try:
                raw_p = float(prices.get("price") or 0)
                price = round(raw_p / (10 ** minor), 2)
            except (TypeError, ValueError):
                price = 0.0
            if price <= 0 or not link:
                continue
            items.append({
                "name": title,
                "tokens": norm_tokens(title),
                "is_set": is_set_name(title),
                "price": price,
                "url": link,
            })
        if len(prods) < 100:
            break
        page += 1
    return items


def match_in_memory_catalog(target_tokens: set[str], want_set: bool, catalog: list[dict[str, Any]]) -> tuple[float, str] | None:
    best_score = 0.0
    best = None
    for item in catalog:
        if item["is_set"] != want_set:
            continue
        c_toks = item["tokens"]
        if not c_toks:
            continue
        inter = target_tokens & c_toks
        if not inter:
            continue
        if len(target_tokens) == 1 and len(c_toks) > 1:
            continue
        cov = len(inter) / len(target_tokens)
        prec = len(inter) / len(c_toks)
        if prec < 0.58:
            continue
        score = 0.65 * cov + 0.35 * prec
        if score > best_score:
            best_score = score
            best = (item["price"], item["url"])
    return best if best_score >= 0.72 else None


def query_notino(clean_q: str, target_tokens: set[str], want_set: bool) -> tuple[float, str] | None:
    url = f"https://www.notino.bg/search.asp?exps={urllib.parse.quote_plus(clean_q)}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "bg-BG,bg;q=0.9"})
        html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "ignore")
    except Exception:
        return None
    m = re.search(
        r'<script type="application/ld\+json">(\{"@context":"https://schema\.org","@type":"CollectionPage".*?)</script>',
        html,
        re.S,
    )
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except Exception:
        return None
    best_score = 0.0
    best = None
    for item in data.get("mainEntity") or []:
        cand_name = item.get("name") or ""
        offers = item.get("offers") or {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        if offers.get("priceCurrency") not in (None, "EUR"):
            continue
        try:
            price = float(offers.get("price") or 0)
        except (TypeError, ValueError):
            continue
        if price <= 0:
            continue
        cand_url = offers.get("url") or item.get("url") or ""
        sc = score_candidate(target_tokens, want_set, cand_name, cand_url)
        if sc > best_score:
            best_score = sc
            best = (round(price, 2), cand_url)
    return best if best_score >= 0.72 else None


def query_douglas(clean_q: str, target_tokens: set[str], want_set: bool) -> tuple[float, str] | None:
    gql = json.dumps({
        "query": "{ products(search: " + json.dumps(clean_q) + ", pageSize: 6) { items { name url_key price_range { minimum_price { final_price { value currency } } } } } }"
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://douglas.bg/graphql",
        data=gql,
        headers={
            "Content-Type": "application/json",
            "User-Agent": UA,
            "Origin": "https://douglas.bg",
            "Referer": "https://douglas.bg/",
        },
        method="POST",
    )
    try:
        res = json.loads(urllib.request.urlopen(req, timeout=12).read().decode("utf-8", "ignore"))
        items = ((res.get("data") or {}).get("products") or {}).get("items") or []
    except Exception:
        return None
    best_score = 0.0
    best = None
    for item in items:
        cand_name = item.get("name") or ""
        uk = item.get("url_key") or ""
        fp = ((item.get("price_range") or {}).get("minimum_price") or {}).get("final_price") or {}
        if fp.get("currency") not in (None, "EUR"):
            continue
        try:
            price = float(fp.get("value") or 0)
        except (TypeError, ValueError):
            continue
        if price <= 0 or not uk:
            continue
        cand_url = f"https://douglas.bg/{uk}"
        sc = score_candidate(target_tokens, want_set, cand_name, cand_url)
        if sc > best_score:
            best_score = sc
            best = (round(price, 2), cand_url)
    return best if best_score >= 0.72 else None


def query_arabic_scents(clean_q: str, target_tokens: set[str], want_set: bool) -> tuple[float, str] | None:
    url = f"https://arabicscents.bg/rezultati-tyrsene?search={urllib.parse.quote_plus(clean_q)}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "ignore")
    except Exception:
        return None
    best_score = 0.0
    best = None
    for m in re.finditer(r'<div class="product-thumb-in">', html):
        block = html[m.start() : m.start() + 3000]
        lm = re.search(r'<h3 class="name">\s*<a href="([^"]+)"[^>]*>([^<]+)</a>', block, re.I)
        pm = re.search(r'<div class="price-new">[^0-9]*<span>([0-9]+(?:[.,][0-9]+)?)</span>', block, re.I)
        if not lm or not pm:
            continue
        cand_url = lm.group(1).strip()
        cand_name = html_lib.unescape(lm.group(2).strip())
        try:
            price = float(pm.group(1).replace(",", "."))
        except ValueError:
            continue
        if price <= 0:
            continue
        sc = score_candidate(target_tokens, want_set, cand_name, cand_url)
        if sc > best_score:
            best_score = sc
            best = (round(price, 2), cand_url)
    return best if best_score >= 0.72 else None


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
    env = resolve_env()

    hasura_graphql(
        env,
        "mutation { update_pricing_settings(where: { id: { _eq: 1 } }, _set: { target_discount_pct: 0 }) { affected_rows } }",
    )
    print("Set pricing_settings.target_discount_pct = 0 (match arithmetic mean of 5 competitors).")

    print("Loading Dubai Perfumery & AromaRay full catalogs...")
    dubai_cat = fetch_dubai_perfumery_catalog()
    aromaray_cat = fetch_aromaray_catalog()
    print(f"  Dubai Perfumery: {len(dubai_cat)} items | AromaRay: {len(aromaray_cat)} items")

    stocks = fetch_all_stocks(env)
    active = [
        s
        for s in stocks
        if s.get("in_stock")
        and ((s.get("info") or {}).get("imageGeneration") or {}).get("status") == "completed"
        and not ((s.get("info") or {}).get("googleTrends") or {}).get("hiddenFromSite")
    ]
    print(f"Querying Notino, Douglas, and Arabic Scents for {len(active)} active storefront products...")

    def process_one(s: dict[str, Any]) -> tuple[int, list[dict[str, Any]]]:
        sid = int(s["id"])
        clean_q = clean_search_query(s)
        brand = (s.get("brand") or "").strip()
        target_tokens = norm_tokens(f"{brand} {clean_q}")
        want_set = is_set_name(s.get("name") or "") or (s.get("info") or {}).get("categorySlug") == "sets"
        offers: list[dict[str, Any]] = []

        dp = match_in_memory_catalog(target_tokens, want_set, dubai_cat)
        if dp:
            offers.append({"competitor_name": "Dubai Perfumery", "price_eur": dp[0], "product_url": dp[1]})

        ar = match_in_memory_catalog(target_tokens, want_set, aromaray_cat)
        if ar:
            offers.append({"competitor_name": "AromaRay", "price_eur": ar[0], "product_url": ar[1]})

        nt = query_notino(clean_q, target_tokens, want_set)
        if nt:
            offers.append({"competitor_name": "Notino", "price_eur": nt[0], "product_url": nt[1]})

        dg = query_douglas(clean_q, target_tokens, want_set)
        if dg:
            offers.append({"competitor_name": "Douglas", "price_eur": dg[0], "product_url": dg[1]})

        asc = query_arabic_scents(clean_q, target_tokens, want_set)
        if asc:
            offers.append({"competitor_name": "Arabic Scents", "price_eur": asc[0], "product_url": asc[1]})

        return sid, offers

    all_offers: dict[int, list[dict[str, Any]]] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for sid, offs in pool.map(process_one, active):
            all_offers[sid] = offs

    now_iso = dt.datetime.now(dt.timezone.utc).isoformat()
    active_ids = [int(s["id"]) for s in active]

    hasura_graphql(
        env,
        "mutation ClearComp($ids: [Int!]!) { delete_competitor_prices(where: { stock_id: { _in: $ids } }) { affected_rows } }",
        {"ids": active_ids},
    )

    comp_rows = []
    counts_by_seller: dict[str, int] = {}
    products_with_any = 0
    for sid, offs in all_offers.items():
        if offs:
            products_with_any += 1
        for o in offs:
            counts_by_seller[o["competitor_name"]] = counts_by_seller.get(o["competitor_name"], 0) + 1
            comp_rows.append({
                "stock_id": sid,
                "country": "BG",
                "competitor_name": o["competitor_name"],
                "price_eur": o["price_eur"],
                "product_url": o["product_url"],
                "updated_at": now_iso,
            })

    if comp_rows:
        ins_comp = """
        mutation InsertComp($objects: [competitor_prices_insert_input!]!) {
          insert_competitor_prices(objects: $objects) { affected_rows }
        }
        """
        for i in range(0, len(comp_rows), 100):
            hasura_graphql(env, ins_comp, {"objects": comp_rows[i : i + 100]})

    pricing_objects = []
    for s in active:
        sid = int(s["id"])
        cost = float(s.get("price") or 0)
        min_p = calculate_min_price(cost, desired_net_profit=5.0, tax_pct=10.0, fee_pct=2.9)
        offs = all_offers.get(sid) or []
        if offs:
            mean_p = sum(o["price_eur"] for o in offs) / len(offs)
            final_p = psych_round_99(mean_p, min_p)
            src = "competitors_5_mean"
        else:
            mean_p = None
            final_p = psych_round_99(cost * 1.42, min_p)
            src = "retail_fallback_1.42x"

        published = {c: final_p for c in COUNTRIES}
        pricing_objects.append({
            "stock_id": sid,
            "purchase_cost_eur": round(cost, 2),
            "published_prices": published,
            "calculation_meta": {
                "_meta": {
                    "source": src,
                    "competitorCount": len(offs),
                    "competitorMeanEur": round(mean_p, 2) if mean_p is not None else None,
                    "updatedAt": now_iso,
                }
            },
            "updated_at": now_iso,
        })

    upsert_pricing = """
    mutation UpsertPricing($objects: [product_pricing_insert_input!]!) {
      insert_product_pricing(
        objects: $objects,
        on_conflict: {
          constraint: product_pricing_pkey,
          update_columns: [purchase_cost_eur, published_prices, calculation_meta, updated_at]
        }
      ) { affected_rows }
    }
    """
    for i in range(0, len(pricing_objects), 100):
        hasura_graphql(env, upsert_pricing, {"objects": pricing_objects[i : i + 100]})

    print(f"\nProducts with >=1 competitor match: {products_with_any}/{len(active)}")
    print("Matches per competitor:", counts_by_seller)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
