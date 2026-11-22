#!/usr/bin/env python3
"""
Select the top 5 most popular active storefront perfumes by Google Trends average
rating (`info.googleTrends.average`), and publish them to Hasura `bestsellers`
(ranks 1..5). Runs weekly on Monday at 03:00 UTC via GitHub Actions.
"""

from __future__ import annotations

import datetime as dt
import os
from typing import Any

from migrate_qogita_to_aromadeal import (
    ENV_PATH,
    fetch_all_stocks,
    hasura_graphql,
    load_env,
)


def resolve_env() -> dict[str, str]:
    env = load_env(ENV_PATH)
    for k in ("HASURA_GRAPHQL_URL", "NHOST_GRAPHQL_URL", "HASURA_ADMIN_SECRET", "NHOST_ADMIN_SECRET"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def score_tuple(stock: dict[str, Any]) -> tuple[float, float, int]:
    info = stock.get("info") or {}
    gt = info.get("googleTrends") or {}
    avg_raw = gt.get("average") if gt.get("average") is not None else gt.get("avg")
    max_raw = gt.get("max")
    try:
        avg_val = float(avg_raw) if avg_raw is not None else -1.0
    except (TypeError, ValueError):
        avg_val = -1.0
    try:
        max_val = float(max_raw) if max_raw is not None else -1.0
    except (TypeError, ValueError):
        max_val = -1.0
    return (avg_val, max_val, -int(stock["id"]))


def main() -> int:
    env = resolve_env()
    stocks = fetch_all_stocks(env)
    active = [
        s
        for s in stocks
        if s.get("in_stock")
        and ((s.get("info") or {}).get("imageGeneration") or {}).get("status") == "completed"
        and not ((s.get("info") or {}).get("googleTrends") or {}).get("hiddenFromSite")
    ]

    ranked = sorted(active, key=score_tuple, reverse=True)
    top5 = ranked[:5]
    if not top5:
        print("No active perfumes found for bestsellers.")
        return 0

    now_iso = dt.datetime.now(dt.timezone.utc).isoformat()
    objects = []
    for idx, s in enumerate(top5, start=1):
        avg_val, max_val, _ = score_tuple(s)
        objects.append(
            {
                "rank": idx,
                "stock_id": int(s["id"]),
                "google_trends_average": max(0.0, avg_val),
                "google_trends_max": max(0.0, max_val),
                "updated_at": now_iso,
            }
        )

    mut = """
    mutation ReplaceBestsellers($objects: [bestsellers_insert_input!]!) {
      delete_bestsellers(where: {}) { affected_rows }
      insert_bestsellers(objects: $objects) { affected_rows }
    }
    """
    res = hasura_graphql(env, mut, {"objects": objects})
    print("Updated bestsellers table:", res)
    for o, s in zip(objects, top5):
        print(f"  #{o['rank']} id={o['stock_id']} | {s['name']} | avg={o['google_trends_average']} | max={o['google_trends_max']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
