#!/usr/bin/env python3
"""Google Trends regional filter for Al-Warda (BG, RO, GR, HU, last 3 months)."""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
CACHE_PATH = APP_DIR / "server" / "data" / "googleTrendsCache.json"
REGIONS = ("BG", "RO", "GR", "HU")
CACHE_TTL_DAYS = 14

_NOISE_PHRASES = (
    r"eau\s+de\s+parfum",
    r"eau\s+de\s+toilette",
    r"eau\s+de\s+cologne",
    r"extrait\s+de\s+parfum",
    r"concentrated\s+perfume\s+oil",
    r"perfumed?\s+oil",
    r"natural\s+spray",
    r"hair\s*mist",
    r"body\s*mist",
    r"body\s*spray",
    r"body\s*lotion",
    r"shower\s*gel",
    r"after\s*shave(?:\s*balm)?",
    r"gift\s*set",
    r"fragrance\s*set",
    r"perfume\s*set",
    r"discovery\s*set",
    r"travel\s*set",
    r"alcohol\s*-?\s*free",
    r"roll\s*-?\s*on",
    r"rollon",
    r"pour\s+homme",
    r"pour\s+femme",
    r"for\s+men",
    r"for\s+women",
    r"for\s+him",
    r"for\s+her",
    r"original\s+fragrance\s+from\s+dubai",
    r"\bedp\b",
    r"\bedt\b",
    r"\bedc\b",
    r"\bextrait\b",
    r"\bparfum\b",
    r"\bperfume\b",
    r"\bfragrance\b",
    r"\bcologne\b",
    r"\bspray\b",
    r"\bvaporisateur\b",
    r"\bunisex\b",
    r"\bmen\b",
    r"\bwomen\b",
    r"\bconcentrated\b",
    r"\battar\b",
    r"\bittar\b",
    r"\bpuro\b",
    r"\bcoffret\b",
    r"\btester\b",
    r"\bdeo\b",
    r"\bdeodorant\b",
    r"\bset\b",
    r"\bwith\b",
    r"\band\b",
)


def clean_perfume_name_for_trends(name, brand=""):
    """Strip ml/fl.oz, gender, perfume type/concentration, and filler words."""
    text = str(name or "").strip()
    if not text:
        return ""
    # Remove volume expressions like 100ml, 100 ml, 3.4 fl.oz, 100+20ml
    text = re.sub(r"\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|g|oz|fl\.?\s*oz)\b", " ", text, flags=re.I)
    text = re.sub(r"\b\d+\s*[x×+]\s*\d+(?:[.,]\d+)?\s*(?:ml|g)?\b", " ", text, flags=re.I)
    for pat in _NOISE_PHRASES:
        text = re.sub(rf"(?<!\w){pat}(?!\w)", " ", text, flags=re.I)
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"[^\w\s'&-]", " ", text)
    text = re.sub(r"\b(\d+)\s+(pm|am)\b", r"\1\2", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip(" -,&")

    brand_clean = str(brand or "").strip()
    if brand_clean and brand_clean.lower() not in ("al-warda", "unknown") and brand_clean.lower() not in text.lower():
        text = f"{brand_clean} {text}".strip()
    return text


_FLANKER_WORDS = {
    "noir", "black", "white", "blanche", "gold", "silver", "blue", "bleu",
    "red", "pink", "rouge", "rose", "green", "purple", "yellow", "orange",
    "intense", "elixir", "qahwa", "rebel", "dive", "knight", "femme", "homme",
    "him", "her", "man", "woman", "edition", "collection", "collector",
    "collectors", "incense", "carbon", "exclusif", "exclusive", "absolu",
    "absolute", "ultra", "pure", "fresh", "ice", "gala", "private", "prive",
    "reserve", "royal", "platinum", "diamond", "velvet", "sillage", "milestone",
    "untold", "tobacco", "ruby", "emerald", "aqua", "sport", "extreme",
    "limited", "summer", "winter", "night", "day", "in", "on", "of", "not",
    "only", "by", "balm", "body", "milk", "veil", "iv", "iii", "ii", "vi",
}
_TWO_WORD_SERIES_HEADS = {
    "amber", "club", "oud", "musk", "rare", "his", "her", "highness",
    "souvenir", "edict", "his", "la", "le", "el", "al", "the", "my",
    "royal", "desert", "modest", "ornament", "mirsaal", "portrait",
}


def extract_perfume_series_key(name, brand=""):
    """Extract normalized perfume series/family key so flankers stay together (e.g. 9pm & 9pm Rebel)."""
    cleaned = clean_perfume_name_for_trends(name, brand=brand)
    if not cleaned:
        return ""
    tokens = cleaned.split()
    brand_tokens = str(brand or "").strip().split()
    min_len = len(brand_tokens) + 1 if brand_tokens else 2
    if len(tokens) > len(brand_tokens) + 1:
        head_after_brand = tokens[len(brand_tokens)].lower() if brand_tokens else tokens[0].lower()
        if head_after_brand in _TWO_WORD_SERIES_HEADS:
            min_len = len(brand_tokens) + 2
    while len(tokens) > min_len and tokens[-1].lower() in _FLANKER_WORDS:
        tokens.pop()
    return " ".join(tokens).lower()


def passes_trends_threshold(scores):
    """Return (passed, avg_score, max_score) using avg >= 35 or max >= 50."""
    vals = [float(scores.get(c, 0) or 0) for c in REGIONS]
    avg_val = sum(vals) / len(REGIONS)
    max_val = max(vals)
    return (avg_val >= 35.0 or max_val >= 50.0), round(avg_val, 2), int(max_val)


def load_trends_cache():
    try:
        if CACHE_PATH.exists():
            data = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}


def save_trends_cache(cache):
    try:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = CACHE_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(CACHE_PATH)
    except Exception:
        pass


class GoogleTrendsClient:
    def __init__(self, delay_sec=2.2):
        self.delay_sec = delay_sec
        self.session = None
        self._last_req_ts = 0.0
        self._init_session()

    def _init_session(self):
        s = requests.Session()
        s.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        })
        try:
            s.get("https://trends.google.com/trends/?geo=US", timeout=12)
        except requests.exceptions.SSLError:
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            s.verify = False
            try:
                s.get("https://trends.google.com/trends/?geo=US", timeout=12)
            except Exception:
                pass
        except Exception:
            pass
        self.session = s

    def _pace(self):
        elapsed = time.monotonic() - self._last_req_ts
        if elapsed < self.delay_sec:
            time.sleep(self.delay_sec - elapsed)
        self._last_req_ts = time.monotonic()

    def fetch_region_scores(self, query, max_retries=1):
        """Fetch last-3-months Google Trends interest by region for BG, RO, GR, HU."""
        req_payload = {
            "comparisonItem": [{"keyword": query, "geo": "", "time": "today 3-m"}],
            "category": 0,
            "property": "",
        }
        for attempt in range(max_retries + 1):
            try:
                self._pace()
                r1 = self.session.get(
                    "https://trends.google.com/trends/api/explore",
                    params={"hl": "en-US", "tz": "-120", "req": json.dumps(req_payload)},
                    timeout=12,
                )
                if r1.status_code == 429 or r1.status_code >= 500:
                    raise RuntimeError(f"explore HTTP {r1.status_code}")
                r1.raise_for_status()
                data = json.loads(r1.text.lstrip(")]}',\n"))
                geo_widget = next(
                    (w for w in data.get("widgets", []) if w.get("id") == "GEO_MAP"),
                    None,
                )
                if not geo_widget:
                    return {c: 0 for c in REGIONS}, None

                time.sleep(0.5)
                r2 = self.session.get(
                    "https://trends.google.com/trends/api/widgetdata/comparedgeo",
                    params={
                        "hl": "en-US",
                        "tz": "-120",
                        "req": json.dumps(geo_widget["request"]),
                        "token": geo_widget["token"],
                    },
                    timeout=12,
                )
                if r2.status_code == 429 or r2.status_code >= 500:
                    raise RuntimeError(f"comparedgeo HTTP {r2.status_code}")
                r2.raise_for_status()
                gdata = json.loads(r2.text.lstrip(")]}',\n"))
                items = gdata.get("default", {}).get("geoMapData", [])
                by_code = {}
                for it in items:
                    code = it.get("geoCode")
                    vals = it.get("value") or [0]
                    if code:
                        by_code[code] = int(vals[0] or 0)
                return {c: by_code.get(c, 0) for c in REGIONS}, None
            except Exception as exc:
                if attempt < max_retries:
                    print(f"  [GoogleTrends] {query!r} retry in 3s ({exc})", flush=True)
                    time.sleep(3)
                    self._init_session()
                else:
                    return None, str(exc)


def check_perfume_trends(name, brand="", client=None, cache=None):
    """Return dict: {query, scores, avg, max, passed, error}."""
    query = clean_perfume_name_for_trends(name, brand=brand)
    if not query:
        return {"query": "", "scores": {c: 0 for c in REGIONS}, "avg": 0.0, "max": 0, "passed": False, "error": "empty_query"}

    own_cache = cache is None
    if own_cache:
        cache = load_trends_cache()

    key = query.lower()
    cached = cache.get(key)
    if isinstance(cached, dict) and cached.get("scores") and not cached.get("error"):
        try:
            checked_at = datetime.fromisoformat(cached.get("checkedAt", "").replace("Z", "+00:00"))
            age_days = (datetime.now(timezone.utc) - checked_at).total_seconds() / 86400.0
            if age_days <= CACHE_TTL_DAYS:
                return cached
        except Exception:
            pass

    if client is None:
        client = GoogleTrendsClient()

    scores, err = client.fetch_region_scores(query)
    if scores is None:
        return {"query": query, "scores": None, "avg": 0.0, "max": 0, "passed": None, "error": err}

    passed, avg_val, max_val = passes_trends_threshold(scores)
    entry = {
        "query": query,
        "scores": scores,
        "avg": avg_val,
        "max": max_val,
        "passed": passed,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }
    cache[key] = entry
    if own_cache:
        save_trends_cache(cache)
    return entry


def patch_stock_trends(session, supabase_url, row, trends_meta, visible):
    """Update stocks row with Google Trends result and in_stock visibility (never deletes)."""
    base = (supabase_url or "").rstrip("/")
    if "workers.dev" in base and "/api" not in base:
        url = f"{base}/api/rest/v1/stocks"
    elif base.endswith("/api"):
        url = f"{base}/rest/v1/stocks"
    else:
        url = f"{base}/rest/v1/stocks"
    info = dict(row.get("info") or {})
    info["googleTrends"] = {
        **(trends_meta or {}),
        "hiddenFromSite": not visible,
    }
    row["info"] = info
    row["in_stock"] = bool(visible)
    payload = {
        "in_stock": bool(visible),
        "info": info,
    }
    resp = session.patch(
        url,
        params={"id": f"eq.{row['id']}"},
        json=payload,
        headers={"Content-Type": "application/json", "Prefer": "return=minimal"},
        timeout=30,
    )
    if not resp.ok:
        raise RuntimeError(f"Could not update stock {row['id']} ({resp.status_code}): {resp.text[:200]}")


def filter_all_db_products(dry_run=False, force=False, completed_first=True, max_series=0):
    """Analyze ALL products in DB via Google Trends (series-aware) and hide failing ones without deleting."""
    sys.path.insert(0, str(SCRIPT_DIR))
    import generate_product_images as gpi

    gpi._load_dotenv_if_needed()
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")

    db_session = gpi.make_session()
    rows = gpi.fetch_stock_rows(db_session, supabase_url)
    all_rows = [
        r for r in rows
        if r.get("slug") != "site-settings"
        and str(r.get("id")) != "999999"
    ]
    print(f"Found {len(all_rows)} total products in DB to analyze against Google Trends...", flush=True)

    client = GoogleTrendsClient(delay_sec=1.2)
    cache = load_trends_cache()
    kept = 0
    hidden = 0
    skipped_checked = 0
    errors = 0
    consecutive_429 = 0
    processed_series = 0

    from collections import defaultdict
    series_groups = defaultdict(list)
    for row in all_rows:
        s_key = extract_perfume_series_key(row.get("name") or "", row.get("brand") or "")
        series_groups[s_key or f"id:{row.get('id')}"].append(row)

    ordered_groups = list(series_groups.items())
    if completed_first:
        ordered_groups.sort(
            key=lambda kv: 0 if any((((r.get("info") or {}).get("imageGeneration") or {}).get("status") == "completed") for r in kv[1]) else 1
        )

    print(f"Grouped into {len(ordered_groups)} perfume series/families.", flush=True)

    for s_idx, (s_key, group_rows) in enumerate(ordered_groups, 1):
        if not force and all(((r.get("info") or {}).get("googleTrends") or {}).get("checkedAt") for r in group_rows):
            skipped_checked += len(group_rows)
            continue
        if max_series and processed_series >= max_series:
            print(f"Reached --max-series={max_series}. Stopping cleanly; re-run to continue.", flush=True)
            break
        processed_series += 1

        queries_to_try = []
        seen_q = set()
        if s_key and not s_key.startswith("id:"):
            queries_to_try.append(s_key)
            seen_q.add(s_key)
        for r in sorted(group_rows, key=lambda x: len(x.get("name") or "")):
            cq = clean_perfume_name_for_trends(r.get("name") or "", r.get("brand") or "").lower()
            if cq and cq not in seen_q:
                seen_q.add(cq)
                queries_to_try.append(cq)
                if len(queries_to_try) >= 2:
                    break

        series_passed = None
        last_res = None
        had_error = False
        for q_text in queries_to_try:
            res = check_perfume_trends(q_text, brand="", client=client, cache=cache)
            last_res = res
            if res.get("passed") is True:
                series_passed = True
                consecutive_429 = 0
                break
            elif res.get("passed") is None:
                had_error = True
                if "429" in str(res.get("error") or ""):
                    consecutive_429 += 1
                break
            else:
                consecutive_429 = 0

        if s_idx % 5 == 0:
            save_trends_cache(cache)

        if consecutive_429 >= 3:
            print(
                f"\n[GoogleTrends] Rate limit (429) hit 3 times in a row at series {s_idx}/{len(series_groups)}. "
                f"Progress saved; re-run later to resume cleanly.",
                flush=True,
            )
            break

        trends_meta = {
            "query": last_res.get("query") if last_res else s_key,
            "seriesKey": s_key,
            "scores": last_res.get("scores") if last_res else {},
            "avg": last_res.get("avg") if last_res else 0.0,
            "max": last_res.get("max") if last_res else 0,
            "passed": bool(series_passed is True),
            "checkedAt": datetime.now(timezone.utc).isoformat(),
        }

        if series_passed is True:
            kept += len(group_rows)
            print(
                f"[Series {s_idx}/{len(series_groups)}] KEEP {len(group_rows)} item(s) in '{s_key}' "
                f"(matched '{trends_meta['query']}': {trends_meta['scores']} avg={trends_meta['avg']} max={trends_meta['max']})",
                flush=True,
            )
            if not dry_run:
                for r in group_rows:
                    patch_stock_trends(db_session, supabase_url, r, trends_meta, visible=True)
        elif had_error:
            errors += len(group_rows)
            print(
                f"[Series {s_idx}/{len(series_groups)}] ERROR '{s_key}' ({last_res.get('error') if last_res else 'unknown'}) — keeping {len(group_rows)} item(s)",
                flush=True,
            )
        else:
            hidden += len(group_rows)
            print(
                f"[Series {s_idx}/{len(series_groups)}] HIDE {len(group_rows)} item(s) in '{s_key}': "
                f"{trends_meta['scores']} avg={trends_meta['avg']} max={trends_meta['max']}",
                flush=True,
            )
            if not dry_run:
                for r in group_rows:
                    patch_stock_trends(db_session, supabase_url, r, trends_meta, visible=False)

    save_trends_cache(cache)
    remaining_series = sum(
        1 for _, group_rows in ordered_groups
        if not all(((r.get("info") or {}).get("googleTrends") or {}).get("checkedAt") for r in group_rows)
    )
    print(
        f"\n=== Google Trends DB Filter Done: kept={kept}, hidden={hidden}, skipped_already_checked={skipped_checked}, errors={errors}, remaining_series={remaining_series} ===",
        flush=True,
    )
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        try:
            with open(gh_out, "a", encoding="utf-8") as fh:
                fh.write(f"remaining={remaining_series}\n")
        except Exception:
            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check perfume names in Google Trends (BG, RO, GR, HU).")
    parser.add_argument("name", nargs="?", help="Perfume name")
    parser.add_argument("--brand", default="", help="Brand name")
    parser.add_argument("--filter-all-db", action="store_true", help="Analyze ALL products in DB and hide failing ones (no deletion)")
    parser.add_argument("--completed-first", action="store_true", default=True, help="Prioritize completed site products first")
    parser.add_argument("--max-series", type=int, default=0, help="Max unchecked series to process per run (0 = unlimited)")
    parser.add_argument("--force", action="store_true", help="Re-check even already checked rows")
    parser.add_argument("--dry-run", action="store_true", help="Do not update DB when running --filter-all-db")
    args = parser.parse_args()
    if args.filter_all_db:
        filter_all_db_products(
            dry_run=args.dry_run,
            force=args.force,
            completed_first=args.completed_first,
            max_series=args.max_series,
        )
    elif args.name:
        res = check_perfume_trends(args.name, brand=args.brand)
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        parser.error("Provide a perfume name or --filter-all-db")
