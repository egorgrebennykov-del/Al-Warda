#!/usr/bin/env python3
"""
Recurring price & stock sync from https://aromadeal.de/products.json to Hasura `stocks`.
Never deletes existing product data; only updates prices, availability, and supplier metadata.

Usage:
  python aromadeal_sync.py --prices
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
from pathlib import Path
from typing import Any

from migrate_qogita_to_aromadeal import (
    AROMADEAL_BASE,
    ENV_PATH,
    batch_update_stocks,
    fetch_all_aromadeal_products,
    fetch_all_stocks,
    index_aromadeal_catalog,
    load_env,
    match_stock_to_aromadeal,
)


def resolve_env() -> dict[str, str]:
    env = load_env(ENV_PATH)
    for k in ("HASURA_GRAPHQL_URL", "NHOST_GRAPHQL_URL", "HASURA_ADMIN_SECRET", "NHOST_ADMIN_SECRET"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def sync_prices(env: dict[str, str]) -> None:
    print("Fetching aromadeal.de catalog...")
    aroma_products = fetch_all_aromadeal_products()
    print(f"Fetched {len(aroma_products)} products from aromadeal.de")

    by_product_id: dict[int, dict[str, Any]] = {}
    for p in aroma_products:
        variant = (p.get("variants") or [{}])[0] or {}
        by_product_id[int(p["id"])] = {
            "id": p["id"],
            "handle": p.get("handle"),
            "variant_id": variant.get("id"),
            "sku": variant.get("sku"),
            "price": float(variant.get("price") or 0),
            "compare_at_price": float(variant["compare_at_price"]) if variant.get("compare_at_price") else None,
            "available": bool(variant.get("available")),
        }

    index = index_aromadeal_catalog(aroma_products)
    stocks = fetch_all_stocks(env)
    now_iso = dt.datetime.now(dt.timezone.utc).isoformat()

    pending_batch: list[tuple[int, dict[str, Any]]] = []
    updated = 0

    for s in stocks:
        info = dict(s.get("info") or {})
        pid = info.get("aromadealProductId")
        matched = by_product_id.get(int(pid)) if pid else None
        if not matched:
            entry, _ = match_stock_to_aromadeal(s, index)
            matched = entry

        if not matched:
            continue

        new_price = matched["price"] if matched["price"] > 0 else float(s.get("price") or 0)
        hidden_by_trends = bool((info.get("googleTrends") or {}).get("hiddenFromSite"))
        new_in_stock = False if hidden_by_trends else bool(matched["available"])

        price_changed = abs(float(s.get("price") or 0) - new_price) >= 0.01
        stock_changed = bool(s.get("in_stock")) != new_in_stock
        if not price_changed and not stock_changed and info.get("supplier") == "aromadeal":
            continue

        ad_url = f"{AROMADEAL_BASE}/products/{matched['handle']}"
        info["supplier"] = "aromadeal"
        info["aromadealMatched"] = True
        info["aromadealUrl"] = ad_url
        info["productUrl"] = ad_url
        info["aromadealHandle"] = matched["handle"]
        info["aromadealProductId"] = matched["id"]
        info["aromadealVariantId"] = matched["variant_id"]
        info["aromadealSku"] = matched["sku"]
        info["aromadealPrice"] = matched["price"]
        info["aromadealAvailable"] = matched["available"]
        info["aromadealUpdatedAt"] = now_iso
        info["minOrderQuantity"] = 1

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
        updated += 1
        if len(pending_batch) >= 25:
            batch_update_stocks(env, pending_batch)
            pending_batch.clear()

    if pending_batch:
        batch_update_stocks(env, pending_batch)
        pending_batch.clear()

    print(f"Aromadeal price & stock sync complete. Updated {updated} changed rows.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prices", action="store_true", help="Sync prices and availability from aromadeal.de")
    args = parser.parse_args()
    env = resolve_env()
    sync_prices(env)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
