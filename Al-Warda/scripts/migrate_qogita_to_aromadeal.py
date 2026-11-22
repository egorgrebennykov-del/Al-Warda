#!/usr/bin/env python3
"""
Migrate existing Qogita-backed products in Hasura `stocks` to https://aromadeal.de/
without deleting any existing product data (images, AI descriptions, notes, slugs, IDs).

Usage:
  python migrate_qogita_to_aromadeal.py --dry-run
  python migrate_qogita_to_aromadeal.py --apply
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.request
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT_DIR / ".env"
AROMADEAL_BASE = "https://aromadeal.de"

STOP_WORDS = {
    "eau", "de", "parfum", "toilette", "cologne", "fraiche", "extrait",
    "edp", "edt", "edc", "spray", "vaporisateur", "natural", "intense",
    "for", "men", "man", "women", "woman", "unisex", "femme", "homme",
    "pour", "tester", "box", "new", "original", "perfume", "perfumes", "fragrance",
    "ml", "fl", "oz", "the", "and", "by", "of", "in", "la", "le", "les",
    "el", "al", "gift", "set", "discovery", "coffret",
}

BRAND_ALIASES = {
    "maison alhambra": "alhambra",
    "al haramain": "al haramain",
    "alharamain": "al haramain",
    "afnan": "afnan",
    "armaf": "armaf",
    "lattafa": "lattafa",
    "lattafa perfumes": "lattafa",
    "lattafa pride": "lattafa",
    "rasasi": "rasasi",
    "swiss arabian": "swiss arabian",
    "ard al zaafaran": "ard al zaafaran",
    "paris corner": "paris corner",
    "fragrance world": "fragrance world",
    "french avenue": "french avenue",
    "zimaya": "zimaya",
    "khadlaj": "khadlaj",
    "ahmed al maghribi": "ahmed al maghribi",
    "ajmal": "ajmal",
    "amouage": "amouage",
    "arabian oud": "arabian oud",
    "initio": "initio",
    "parfums de marly": "parfums de marly",
    "nishane": "nishane",
    "xerjoff": "xerjoff",
    "montale": "montale",
    "mancera": "mancera",
    "creed": "creed",
    "tom ford": "tom ford",
    "al wataniah": "al wataniah",
    "orientica": "orientica",
    "emper": "emper",
    "rue broca": "rue broca",
    "dumont": "dumont",
    "gissah": "gissah",
    "ibrahim al qurashi": "ibrahim al qurashi",
    "abdul samad al qurashi": "abdul samad al qurashi",
}


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip()
        if len(v) >= 2 and v[0] in ('"', "'") and v[-1] == v[0]:
            v = v[1:-1]
        env[k.strip()] = v
    return env


def hasura_graphql(env: dict[str, str], query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
    url = env.get("HASURA_GRAPHQL_URL") or env.get("NHOST_GRAPHQL_URL")
    secret = env.get("HASURA_ADMIN_SECRET") or env.get("NHOST_ADMIN_SECRET")
    if not url or not secret:
        raise RuntimeError("Missing HASURA_GRAPHQL_URL or HASURA_ADMIN_SECRET in .env")
    payload = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-hasura-admin-secret": secret,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if data.get("errors"):
        raise RuntimeError(f"Hasura GraphQL error: {data['errors']}")
    return data.get("data") or {}


def fetch_all_aromadeal_products() -> list[dict[str, Any]]:
    all_products: list[dict[str, Any]] = []
    page = 1
    while True:
        url = f"{AROMADEAL_BASE}/products.json?limit=250&page={page}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 Al-Warda-Migration/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        batch = payload.get("products") or []
        if not batch:
            break
        all_products.extend(batch)
        if len(batch) < 250:
            break
        page += 1
    return all_products


def fetch_all_stocks(env: dict[str, str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    limit = 500
    query = """
    query FetchStocks($limit: Int!, $offset: Int!) {
      stocks(limit: $limit, offset: $offset, order_by: { id: asc }) {
        id
        slug
        name
        title
        brand
        price
        currency
        in_stock
        image
        info
      }
    }
    """
    while True:
        data = hasura_graphql(env, query, {"limit": limit, "offset": offset})
        batch = data.get("stocks") or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return rows


def normalize_text(text: str) -> str:
    s = str(text or "").lower()
    s = re.sub(r"['’`´]", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def normalize_brand(brand: str) -> str:
    b = normalize_text(brand)
    return BRAND_ALIASES.get(b, b)


def extract_volume_ml(text: str) -> str | None:
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*ml\b", str(text or "").lower())
    if not m:
        return None
    val = m.group(1).replace(",", ".")
    if val.endswith(".0"):
        val = val[:-2]
    return val


def extract_concentration(text: str) -> str | None:
    low = str(text or "").lower()
    if "extrait de parfum" in low or re.search(r"\bextrait\b", low):
        return "extrait"
    if "eau de parfum" in low or re.search(r"\bedp\b", low):
        return "edp"
    if "eau de toilette" in low or re.search(r"\bedt\b", low):
        return "edt"
    if "eau de cologne" in low or re.search(r"\bedc\b", low):
        return "edc"
    if "parfum" in low:
        return "parfum"
    return None


def is_set_text(text: str, tags: list[str] | None = None) -> bool:
    low = str(text or "").lower()
    tag_str = " ".join(tags or []).lower()
    return any(k in low or k in tag_str for k in ("gift set", "discovery set", "coffret", "set ", " set", "набор"))


def tokenize_name(name: str, brand: str = "") -> set[str]:
    norm = normalize_text(name)
    brand_tokens = set(normalize_text(brand).split()) if brand else set()
    tokens = set()
    for tok in norm.split():
        if tok in STOP_WORDS or tok in brand_tokens:
            continue
        if re.fullmatch(r"\d+(ml)?", tok):
            continue
        tokens.add(tok)
    return tokens


def index_aromadeal_catalog(products: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    by_brand: dict[str, list[dict[str, Any]]] = {}
    all_entries: list[dict[str, Any]] = []
    for p in products:
        title = p.get("title") or ""
        vendor = p.get("vendor") or ""
        tags = p.get("tags") or []
        brand_norm = normalize_brand(vendor)
        variant = (p.get("variants") or [{}])[0] or {}
        images = p.get("images") or []
        entry = {
            "id": p.get("id"),
            "title": title,
            "handle": p.get("handle"),
            "vendor": vendor,
            "brand_norm": brand_norm,
            "product_type": p.get("product_type") or "",
            "tags": tags,
            "tokens": tokenize_name(title, vendor),
            "volume": extract_volume_ml(title),
            "conc": extract_concentration(f"{title} {p.get('product_type', '')}"),
            "is_set": is_set_text(title, tags),
            "variant_id": variant.get("id"),
            "sku": variant.get("sku"),
            "price": float(variant.get("price") or 0),
            "compare_at_price": float(variant["compare_at_price"]) if variant.get("compare_at_price") else None,
            "available": bool(variant.get("available")),
            "image_src": images[0].get("src") if images else None,
        }
        by_brand.setdefault(brand_norm, []).append(entry)
        all_entries.append(entry)
    return {"by_brand": by_brand, "all": all_entries}


def match_stock_to_aromadeal(stock: dict[str, Any], index: dict[str, Any]) -> tuple[dict[str, Any] | None, float]:
    info = stock.get("info") if isinstance(stock.get("info"), dict) else {}
    raw_name = stock.get("name") or stock.get("title") or ""
    raw_brand = stock.get("brand") or info.get("brand") or ""
    brand_norm = normalize_brand(raw_brand)
    stock_tokens = tokenize_name(raw_name, raw_brand)
    if not stock_tokens:
        return None, 0.0

    stock_vol = extract_volume_ml(f"{raw_name} {info.get('volume', '')}")
    stock_conc = extract_concentration(f"{raw_name} {info.get('concentration', '')}")
    stock_is_set = is_set_text(raw_name) or info.get("categorySlug") == "sets"

    candidates = index["by_brand"].get(brand_norm)
    if not candidates:
        # Try partial brand match across known brand keys
        candidates = []
        for b_key, b_list in index["by_brand"].items():
            if b_key and (b_key in brand_norm or brand_norm in b_key):
                candidates.extend(b_list)
    if not candidates:
        return None, 0.0

    best_entry = None
    best_score = 0.0

    for entry in candidates:
        if entry["is_set"] != stock_is_set:
            continue
        c_tokens = entry["tokens"]
        if not c_tokens:
            continue
        inter = stock_tokens & c_tokens
        if not inter:
            continue
        # Avoid matching a base 1-word perfume (e.g. "Eclaire") to a flanker (e.g. "Eclaire Banoffi")
        if len(stock_tokens) == 1 and len(c_tokens) > 1:
            continue
        # Symmetric Jaccard + coverage of stock tokens
        coverage = len(inter) / len(stock_tokens)
        precision = len(inter) / len(c_tokens)
        if precision < 0.65:
            continue
        score = 0.6 * coverage + 0.4 * precision

        if stock_vol and entry["volume"]:
            if stock_vol == entry["volume"]:
                score += 0.12
            else:
                score -= 0.25
        if stock_conc and entry["conc"]:
            if stock_conc == entry["conc"]:
                score += 0.08
            else:
                score -= 0.12

        if score > best_score:
            best_score = score
            best_entry = entry

    if best_entry and best_score >= 0.72:
        return best_entry, best_score
    return None, best_score


def batch_update_stocks(env: dict[str, str], batch: list[tuple[int, dict[str, Any]]]) -> None:
    if not batch:
        return
    var_defs = []
    muts = []
    variables: dict[str, Any] = {}
    for idx, (stock_id, updates) in enumerate(batch):
        var_defs.append(f"$id{idx}: bigint!, $set{idx}: stocks_set_input!")
        muts.append(
            f"u{idx}: update_stocks_by_pk(pk_columns: {{ id: $id{idx} }}, _set: $set{idx}) {{ id }}"
        )
        variables[f"id{idx}"] = stock_id
        variables[f"set{idx}"] = updates
    mutation = f"mutation BatchUpdateStocks({', '.join(var_defs)}) {{\n  " + "\n  ".join(muts) + "\n}"
    hasura_graphql(env, mutation, variables)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Only report match statistics without writing to DB")
    parser.add_argument("--apply", action="store_true", help="Write adapted supplier metadata to Hasura stocks")
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        args.dry_run = True

    env = load_env(ENV_PATH)
    print("Fetching aromadeal.de catalog...")
    aroma_products = fetch_all_aromadeal_products()
    print(f"Fetched {len(aroma_products)} products from aromadeal.de")

    index = index_aromadeal_catalog(aroma_products)
    print("Fetching existing stocks from Hasura...")
    stocks = fetch_all_stocks(env)
    print(f"Fetched {len(stocks)} rows from stocks")

    matched_all = 0
    matched_visible = 0
    visible_total = 0
    sample_matches: list[str] = []
    sample_unmatched: list[str] = []
    now_iso = dt.datetime.now(dt.timezone.utc).isoformat()

    updated_count = 0
    pending_batch: list[tuple[int, dict[str, Any]]] = []
    for s in stocks:
        info = dict(s.get("info") or {})
        img_status = (info.get("imageGeneration") or {}).get("status")
        is_visible = bool(s.get("in_stock")) and img_status == "completed" and not (info.get("googleTrends") or {}).get("hiddenFromSite")
        if is_visible:
            visible_total += 1

        entry, score = match_stock_to_aromadeal(s, index)
        if entry:
            matched_all += 1
            if is_visible:
                matched_visible += 1
            if len(sample_matches) < 10:
                sample_matches.append(
                    f"  [score={score:.2f}] DB: {s.get('brand')} | {s.get('name')} (€{s.get('price')}) -> AD: {entry['title']} (€{entry['price']}, avail={entry['available']})"
                )
        else:
            if is_visible and len(sample_unmatched) < 15:
                sample_unmatched.append(
                    f"  [best={score:.2f}] DB: {s.get('brand')} | {s.get('name')} (€{s.get('price')})"
                )

        if args.apply:
            # Preserve all existing info keys (notes, descriptions, imageGeneration, googleTrends, series)
            for old_q_key in ("qogitaUrl", "qogita_url", "qogitaFid", "variantFid", "variant_fid", "movPrice", "qogitaPrice"):
                info.pop(old_q_key, None)

            if entry:
                ad_url = f"{AROMADEAL_BASE}/products/{entry['handle']}"
                info["supplier"] = "aromadeal"
                info["aromadealMatched"] = True
                info["aromadealUrl"] = ad_url
                info["productUrl"] = ad_url
                info["aromadealHandle"] = entry["handle"]
                info["aromadealProductId"] = entry["id"]
                info["aromadealVariantId"] = entry["variant_id"]
                info["aromadealSku"] = entry["sku"]
                info["aromadealPrice"] = entry["price"]
                if entry["compare_at_price"]:
                    info["aromadealCompareAtPrice"] = entry["compare_at_price"]
                info["aromadealAvailable"] = entry["available"]
                info["aromadealUpdatedAt"] = now_iso
                info["minOrderQuantity"] = 1

                raw_img = str(info.get("rawImage") or "")
                if (not raw_img or "qogita.com" in raw_img) and entry.get("image_src"):
                    info["rawImage"] = entry["image_src"]

                new_price = entry["price"] if entry["price"] > 0 else float(s.get("price") or 0)
                hidden_by_trends = bool((info.get("googleTrends") or {}).get("hiddenFromSite"))
                new_in_stock = False if hidden_by_trends else bool(entry["available"])

                pending_batch.append(
                    (
                        int(s["id"]),
                        {
                            "price": new_price,
                            "in_stock": new_in_stock,
                            "info": info,
                        },
                    )
                )
            else:
                info["supplier"] = "aromadeal"
                info["aromadealMatched"] = False
                info["aromadealUpdatedAt"] = now_iso
                info["minOrderQuantity"] = 1
                pending_batch.append(
                    (
                        int(s["id"]),
                        {
                            "info": info,
                        },
                    )
                )
            updated_count += 1
            if len(pending_batch) >= 25:
                batch_update_stocks(env, pending_batch)
                pending_batch.clear()
                if updated_count % 500 == 0:
                    print(f"Updated {updated_count}/{len(stocks)} rows...")

    if args.apply and pending_batch:
        batch_update_stocks(env, pending_batch)
        pending_batch.clear()
        print(f"Updated {updated_count}/{len(stocks)} rows...")

    print(f"\n=== SUMMARY ({'DRY RUN' if args.dry_run else 'APPLIED'}) ===")
    print(f"Total DB rows: {len(stocks)} | Matched on aromadeal.de: {matched_all} ({matched_all/max(1,len(stocks))*100:.1f}%)")
    print(f"Visible live rows: {visible_total} | Matched on aromadeal.de: {matched_visible} ({matched_visible/max(1,visible_total)*100:.1f}%)")
    print("\nSample matches:")
    print("\n".join(sample_matches))
    print("\nSample unmatched (visible):")
    print("\n".join(sample_unmatched))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
