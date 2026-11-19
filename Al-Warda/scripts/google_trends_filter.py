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

WHITELIST_PRIORITY_1 = {
    "lattafa": ("lattafa", "lattafa perfumes", "lattafa pride"),
    "armaf": ("armaf", "armaf perfumes"),
    "afnan": ("afnan", "afnan perfumes"),
    "rasasi": ("rasasi", "rasasi perfumes"),
    "al haramain": ("al haramain", "al-haramain", "alharamain", "al haramain perfumes", "haramain"),
}

WHITELIST_PRIORITY_2 = {
    "ajmal": ("ajmal", "ajmal perfumes"),
    "swiss arabian": ("swiss arabian", "swiss-arabian", "swiss arabian perfumes"),
    "amouage": ("amouage",),
    "arabian oud": ("arabian oud", "arabian-oud"),
    "maison alhambra": ("maison alhambra", "alhambra"),
    "ahmed al maghribi": ("ahmed al maghribi", "ahmed al-maghribi", "al maghribi"),
    "ard al zaafaran": ("ard al zaafaran", "ard al-zaafaran"),
}

BRAND_ALIAS_MAP = {}
for _canon, _aliases in WHITELIST_PRIORITY_1.items():
    for _a in _aliases:
        BRAND_ALIAS_MAP[_a] = (_canon, 1)
for _canon, _aliases in WHITELIST_PRIORITY_2.items():
    for _a in _aliases:
        BRAND_ALIAS_MAP[_a] = (_canon, 2)

BRAND_OFFICIAL_DOMAINS = {
    "afnan": ["afnan.com"],
    "lattafa": ["lattafa-usa.com"],
    "maison alhambra": ["lattafa-usa.com"],
    "armaf": ["armaf.com"],
    "swiss arabian": ["swissarabian.com"],
    "al haramain": ["alharamainperfumes.co.uk"],
    "ajmal": ["in.ajmal.com"],
    "rasasi": ["rasasistore.com"],
}


def normalize_brand_name(brand):
    """Normalize brand name (case-insensitive, punctuation/alias safe, no unrelated parent confusion)."""
    raw = re.sub(r"['’`]", "", str(brand or "").strip().lower())
    raw = re.sub(r"[-_]+", " ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    if raw in BRAND_ALIAS_MAP:
        return BRAND_ALIAS_MAP[raw][0]
    return raw


def get_whitelist_priority(brand):
    """Return (canonical_brand, priority_int) or (normalized_brand, 0) if not whitelisted."""
    raw = re.sub(r"['’`]", "", str(brand or "").strip().lower())
    raw = re.sub(r"[-_]+", " ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    if raw in BRAND_ALIAS_MAP:
        return BRAND_ALIAS_MAP[raw]
    return raw, 0

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
    r"discovery\s*collection",
    r"travel\s*set",
    r"mini\s*gift",
    r"pack\s*of\s*\d+",
    r"\b\d+\s*(?:pc|pcs|piece|pieces|unit|units)\b",
    r"\bx\s*\d+\b",
    r"alcohol\s*-?\s*free",
    r"roll\s*-?\s*on",
    r"rollon",
    r"pour\s+homme",
    r"pour\s+femme",
    r"for\s+men",
    r"for\s+women",
    r"for\s+him",
    r"for\s+her",
    r"for\s+adult",
    r"original\s+fragrance\s+from\s+dubai",
    r"\bedp\b",
    r"\bedt\b",
    r"\bedc\b",
    r"\bextrait\b",
    r"\bparfum\b",
    r"\bperfume\b",
    r"\bperfumery\b",
    r"\bfragrances\b",
    r"\bfragrance\b",
    r"\bcologne\b",
    r"\bspray\b",
    r"\bvaporisateur\b",
    r"\bunisex\b",
    r"\bmen\b",
    r"\bwomen\b",
    r"\badult\b",
    r"\bfor\b",
    r"\bconcentrated\b",
    r"\battar\b",
    r"\bittar\b",
    r"\bpuro\b",
    r"\bcoffret\b",
    r"\btester\b",
    r"\bdeo\b",
    r"\bdeodorant\b",
    r"\bhydrating\b",
    r"\bluxury\b",
    r"\bminiature\b",
    r"\bmini\b",
    r"\bseries\b",
    r"\bmist\b",
    r"\boil\b",
    r"\bset\b",
    r"\bwith\b",
    r"\band\b",
)


def clean_perfume_name_for_trends(name, brand=""):
    """Strip ml/fl.oz, gender, perfume type/concentration, set/piece tags, and filler words."""
    text = str(name or "").strip()
    if not text:
        return ""
    # Drop long marketing subtitles after ' - ' when total string is long
    if len(text) > 65 and " - " in text:
        head = text.split(" - ", 1)[0].strip()
        if len(head) >= 6:
            text = head
    # Remove volume expressions like 100ml, 100 ml, 3.4 fl.oz, 100+20ml
    text = re.sub(r"\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|g|oz|fl\.?\s*oz)\b", " ", text, flags=re.I)
    text = re.sub(r"\b\d+\s*[x×+]\s*\d+(?:[.,]\d+)?\s*(?:ml|g)?\b", " ", text, flags=re.I)
    for pat in _NOISE_PHRASES:
        text = re.sub(rf"(?<!\w){pat}(?!\w)", " ", text, flags=re.I)
    text = re.sub(r"\b(includes|each)\b", " ", text, flags=re.I)
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"[^\w\s'-]", " ", text)
    text = re.sub(r"\b(\d+)\s+(pm|am)\b", r"\1\2", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip(" -,&")

    brand_clean = str(brand or "").strip()
    if brand_clean and brand_clean.lower() not in ("al-warda", "unknown") and brand_clean.lower() not in text.lower():
        text = f"{brand_clean} {text}".strip()
    # Collapse duplicate consecutive words (e.g. 'Al Haramain Haramain Amber Oud')
    words = text.split()
    deduped = []
    for w in words:
        if deduped and deduped[-1].lower() == w.lower():
            continue
        deduped.append(w)
    # Google Trends rejects overly long queries (>100 chars) with HTTP 400; cap to 6 words / 80 chars
    deduped = deduped[:6]
    result = " ".join(deduped)
    while len(result) > 80 and len(deduped) > 2:
        deduped.pop()
        result = " ".join(deduped)
    return result


_FLANKER_WORDS = {
    "noir", "black", "white", "blanche", "gold", "silver", "blue", "bleu",
    "red", "pink", "rouge", "rose", "green", "purple", "yellow", "orange",
    "intense", "elixir", "qahwa", "rebel", "dive", "knight", "femme", "homme",
    "him", "her", "man", "woman", "edition", "collection", "collector",
    "collectors", "incense", "carbon", "exclusif", "exclusive", "absolu",
    "absolute", "ultra", "pure", "fresh", "ice", "gala", "private", "prive",
    "reserve", "royal", "platinum", "diamond", "velvet", "sillage", "milestone",
    "untold", "tobacco", "ruby", "emerald", "aqua", "sport", "extreme",
    "limited", "summer", "winter", "night", "day", "out", "dubai", "candy",
    "tous", "moi", "in", "on", "of", "not", "only", "by", "balm", "body",
    "milk", "veil", "iv", "iii", "ii", "vi",
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
    cleaned = re.sub(r"['’]s\b", "s", cleaned, flags=re.I)
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


def build_series_groups(rows):
    """Group rows by series key and collapse longer flanker keys into shorter prefix series keys."""
    from collections import defaultdict

    raw_groups = defaultdict(list)
    key_brand_min_words = {}
    for row in rows:
        brand = str(row.get("brand") or "").strip()
        s_key = extract_perfume_series_key(row.get("name") or "", brand)
        if not s_key:
            s_key = f"id:{row.get('id')}"
        raw_groups[s_key].append(row)
        b_words = len(brand.split()) if brand and brand.lower() not in ("al-warda", "unknown") else 1
        key_brand_min_words[s_key] = max(key_brand_min_words.get(s_key, 2), b_words + 1)

    # Prefix-collapse: if 'afnan 9pm' exists, merge 'afnan 9pm night out' into 'afnan 9pm'
    sorted_keys = sorted(
        (k for k in raw_groups if not k.startswith("id:")),
        key=lambda k: (len(k.split()), len(k)),
    )
    canonical = {}
    for k in sorted_keys:
        merged_to = k
        for short_k in sorted_keys:
            if short_k == k:
                break
            if len(short_k.split()) < key_brand_min_words.get(short_k, 2):
                continue
            if k.startswith(short_k + " "):
                merged_to = short_k
                break
        canonical[k] = merged_to

    groups = defaultdict(list)
    for k, grp in raw_groups.items():
        target = canonical.get(k, k)
        groups[target].extend(grp)
    return groups


def passes_trends_threshold(scores):
    """Return (passed, avg_score, max_score) using avg >= 30 or max >= 50."""
    vals = [float(scores.get(c, 0) or 0) for c in REGIONS]
    avg_val = sum(vals) / len(REGIONS)
    max_val = max(vals)
    return (avg_val >= 30.0 or max_val >= 50.0), round(avg_val, 2), int(max_val)


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


def patch_with_retry(session, url, row_id, payload, max_retries=4):
    """PATCH stocks row with retries on transient RemoteDisconnected / 5xx errors."""
    last_err = None
    for attempt in range(max_retries + 1):
        try:
            resp = session.patch(
                url,
                params={"id": f"eq.{row_id}"},
                json=payload,
                headers={"Content-Type": "application/json", "Prefer": "return=minimal", "Connection": "close"},
                timeout=30,
            )
            if resp.status_code >= 500 and attempt < max_retries:
                time.sleep(2 ** attempt)
                continue
            if not resp.ok:
                raise RuntimeError(f"Could not update stock {row_id} ({resp.status_code}): {resp.text[:200]}")
            return
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            last_err = exc
            if attempt < max_retries:
                time.sleep(2 ** attempt)
                continue
            raise
    if last_err:
        raise last_err


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
    patch_with_retry(session, url, row["id"], payload)


def filter_all_db_products(dry_run=False, force=False, completed_first=True, max_series=0):
    """Analyze ALL products in DB via Google Trends (series-aware) and hide failing ones without deleting."""
    sys.path.insert(0, str(SCRIPT_DIR))
    import generate_product_images as gpi

    gpi._load_dotenv_if_needed()
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")

    db_session = gpi.make_session()
    rows = None
    for f_attempt in range(3):
        try:
            rows = gpi.fetch_stock_rows(db_session, supabase_url)
            break
        except Exception as exc:
            if f_attempt == 2:
                raise
            print(f"fetch_stock_rows retry {f_attempt + 1}/3: {exc}", flush=True)
            time.sleep(3 * (f_attempt + 1))
    all_rows = [
        r for r in rows
        if r.get("slug") != "site-settings"
        and str(r.get("id")) != "999999"
    ]
    print(f"Found {len(all_rows)} total products in DB to analyze against Google Trends...", flush=True)

    client = GoogleTrendsClient(delay_sec=1.2)
    cache = load_trends_cache()
    bestseller_catalog = fetch_brand_bestsellers()
    kept = 0
    whitelist_admitted = 0
    awaiting_verification = 0
    hidden = 0
    skipped_checked = 0
    errors = 0
    consecutive_429 = 0
    processed_series = 0

    series_groups = build_series_groups(all_rows)

    # Reconcile any series whose grouping changed (e.g. merged 'afnan 9pm' + 'afnan 9pm night out')
    reconciled_passed = 0
    reconciled_reset = 0
    for s_key, group_rows in series_groups.items():
        checked_rows = [r for r in group_rows if ((r.get("info") or {}).get("googleTrends") or {}).get("checkedAt")]
        if not checked_rows:
            continue
        old_keys = {((r.get("info") or {}).get("googleTrends") or {}).get("seriesKey") for r in checked_rows}
        has_unchecked = len(checked_rows) < len(group_rows)
        if old_keys != {s_key} or has_unchecked:
            passing_row = next(
                (r for r in checked_rows if ((r.get("info") or {}).get("googleTrends") or {}).get("passed") is True),
                None,
            )
            if passing_row:
                win_meta = dict((passing_row.get("info") or {}).get("googleTrends") or {})
                win_meta["seriesKey"] = s_key
                for r in group_rows:
                    r_gt = (r.get("info") or {}).get("googleTrends") or {}
                    if r_gt.get("seriesKey") != s_key or r_gt.get("passed") is not True or r.get("in_stock") is not True:
                        if not dry_run:
                            patch_stock_trends(db_session, supabase_url, r, win_meta, visible=True)
                        reconciled_passed += 1
            else:
                for r in checked_rows:
                    r_info = dict(r.get("info") or {})
                    r_gt = dict(r_info.get("googleTrends") or {})
                    r_gt.pop("checkedAt", None)
                    r_gt.pop("passed", None)
                    r_gt.pop("hiddenFromSite", None)
                    r_gt["seriesKey"] = s_key
                    r_info["googleTrends"] = r_gt
                    r["info"] = r_info
                    if not dry_run:
                        base_u = (supabase_url or "").rstrip("/")
                        u = f"{base_u}/api/rest/v1/stocks" if ("workers.dev" in base_u and "/api" not in base_u) else f"{base_u}/rest/v1/stocks"
                        patch_with_retry(db_session, u, r["id"], {"info": r_info})
                    reconciled_reset += 1
    if reconciled_passed or reconciled_reset:
        print(f"Reconciled changed groups: auto-kept={reconciled_passed}, queued-for-recheck={reconciled_reset}", flush=True)

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
                if len(queries_to_try) >= 4:
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
            trends_meta["filterStatus"] = "trends_passed"
            trends_meta["filterReason"] = f"google_trends_passed: avg={trends_meta['avg']} max={trends_meta['max']}"
            print(
                f"[Series {s_idx}/{len(series_groups)}] KEEP {len(group_rows)} item(s) in '{s_key}' "
                f"(matched '{trends_meta['query']}': {trends_meta['scores']} avg={trends_meta['avg']} max={trends_meta['max']})",
                flush=True,
            )
            if not dry_run:
                for r in group_rows:
                    try:
                        patch_stock_trends(db_session, supabase_url, r, trends_meta, visible=True)
                    except Exception as exc:
                        print(f"Warning patching {r.get('id')}: {exc}", flush=True)
        elif had_error:
            errors += len(group_rows)
            print(
                f"[Series {s_idx}/{len(series_groups)}] ERROR '{s_key}' ({last_res.get('error') if last_res else 'unknown'}) — keeping {len(group_rows)} item(s)",
                flush=True,
            )
        else:
            for r in group_rows:
                w_status, w_reason, w_ev = verify_whitelist_popularity(r, s_key, bestseller_catalog)
                r_meta = {
                    **trends_meta,
                    "passed": (w_status == "whitelist_admitted"),
                    "filterStatus": w_status,
                    "filterReason": w_reason,
                    "whitelistEvidence": w_ev,
                }
                if w_status == "whitelist_admitted":
                    whitelist_admitted += 1
                    print(f"[Series {s_idx}/{len(series_groups)}] WHITELIST ADMIT {r.get('id')} ({r.get('name')}): {w_reason}", flush=True)
                elif w_status == "awaiting_popularity_verification":
                    awaiting_verification += 1
                    print(f"[Series {s_idx}/{len(series_groups)}] AWAIT VERIFY {r.get('id')} ({r.get('name')}): {w_reason}", flush=True)
                else:
                    hidden += 1
                    print(f"[Series {s_idx}/{len(series_groups)}] REJECT {r.get('id')} ({r.get('name')}): {w_reason}", flush=True)
                if not dry_run:
                    try:
                        patch_stock_trends(db_session, supabase_url, r, r_meta, visible=(w_status == "whitelist_admitted"))
                    except Exception as exc:
                        print(f"Warning patching {r.get('id')}: {exc}", flush=True)

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


def fetch_brand_bestsellers():
    """Fetch real bestseller titles & review counts from official brand storefronts (no fabrication)."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
    }
    session = requests.Session()
    try:
        session.get("https://afnan.com", headers=headers, timeout=8)
    except requests.exceptions.SSLError:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        session.verify = False
    except Exception:
        pass

    bestsellers_by_brand = {}
    for canon_brand, domains in BRAND_OFFICIAL_DOMAINS.items():
        series_set = set()
        titles_list = []
        for dom in domains:
            for col in ("best-sellers", "bestsellers"):
                try:
                    r = session.get(f"https://{dom}/collections/{col}/products.json?limit=50", headers=headers, timeout=8)
                    if r.ok and "json" in (r.headers.get("content-type") or "").lower():
                        for p in r.json().get("products", []):
                            t = (p.get("title") or "").strip()
                            if t:
                                titles_list.append(t)
                                sk = extract_perfume_series_key(t, canon_brand)
                                if sk:
                                    series_set.add(sk)
                        if titles_list:
                            break
                except Exception:
                    pass
            try:
                r2 = session.get(f"https://{dom}/collections/all?sort_by=best-selling", headers=headers, timeout=8)
                if r2.ok:
                    found_titles = re.findall(
                        r'class="[^"]*(?:card__heading|product-item__title|grid-product__title|product-card__title)[^"]*"[^>]*>.*?<a[^>]*>([^<]+)<',
                        r2.text,
                        re.S,
                    )
                    for t in found_titles[:30]:
                        t_clean = re.sub(r"\s+", " ", t).strip()
                        if t_clean:
                            titles_list.append(t_clean)
                            sk = extract_perfume_series_key(t_clean, canon_brand)
                            if sk:
                                series_set.add(sk)
            except Exception:
                pass
        bestsellers_by_brand[canon_brand] = {
            "series": series_set,
            "titles": titles_list,
        }
    return bestsellers_by_brand


def verify_whitelist_popularity(row, series_key, bestseller_catalog, passing_series_keys=None):
    """Evaluate real popularity signals for a whitelisted brand below Trends threshold.
    Returns (status, reason, evidence) where status is 'whitelist_admitted' or 'awaiting_popularity_verification'."""
    brand = row.get("brand") or ""
    canon_brand, priority = get_whitelist_priority(brand)
    if priority == 0:
        return "rejected", "non_whitelisted_below_trends_threshold", {}

    info = row.get("info") or {}
    evidence = {"canonicalBrand": canon_brand, "whitelistPriority": priority}

    # 1. Product line / series popularity (another item in the same series passed Trends)
    if passing_series_keys and series_key in passing_series_keys:
        evidence["productLinePopular"] = True
        return "whitelist_admitted", f"whitelist_p{priority}: popular product line '{series_key}'", evidence

    # 2. Verified sales data in DB
    sales_count = int(info.get("salesCount") or info.get("ordersCount") or 0)
    if sales_count >= 10:
        evidence["salesCount"] = sales_count
        return "whitelist_admitted", f"whitelist_p{priority}: verified salesCount={sales_count}", evidence

    # 3. Genuine customer reviews in DB
    reviews_count = int(info.get("reviewsCount") or info.get("reviewCount") or 0)
    if reviews_count >= 15:
        evidence["reviewsCount"] = reviews_count
        return "whitelist_admitted", f"whitelist_p{priority}: genuine reviewsCount={reviews_count}", evidence

    # 4. Official brand store bestseller recognition
    if info.get("bestseller") is True or info.get("isBestseller") is True:
        evidence["bestseller"] = True
        return "whitelist_admitted", f"whitelist_p{priority}: marked bestseller in DB", evidence

    brand_bs = (bestseller_catalog or {}).get(canon_brand) or {}
    if series_key and series_key in (brand_bs.get("series") or set()):
        evidence["officialBestsellerSeries"] = series_key
        return "whitelist_admitted", f"whitelist_p{priority}: official {canon_brand} bestseller line '{series_key}'", evidence

    return (
        "awaiting_popularity_verification",
        f"whitelist_p{priority}: awaiting popularity verification (no verified sales/reviews/bestseller evidence)",
        evidence,
    )


def verify_whitelisted_products(dry_run=False):
    """Re-evaluate all whitelisted products in DB using real popularity verification, restore admitted ones, and print full report."""
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

    print("Fetching official brand bestseller catalogs...", flush=True)
    bestseller_catalog = fetch_brand_bestsellers()
    for cb, info_bs in bestseller_catalog.items():
        if info_bs["series"]:
            print(f"  [{cb}] {len(info_bs['series'])} official bestseller series loaded", flush=True)

    series_groups = build_series_groups(all_rows)
    passing_series_keys = {
        s_key for s_key, grp in series_groups.items()
        if any(
            float(((r.get("info") or {}).get("googleTrends") or {}).get("avg") or 0) >= 30.0
            or int(((r.get("info") or {}).get("googleTrends") or {}).get("max") or 0) >= 50
            or ((r.get("info") or {}).get("googleTrends") or {}).get("passed") is True
            for r in grp
        )
    }

    stats = {
        "trends_passed": 0,
        "whitelist_admitted": 0,
        "rejected": 0,
        "awaiting_popularity_verification": 0,
        "unchecked": 0,
        "restored_count": 0,
        "by_brand": {},
    }

    for s_key, group_rows in series_groups.items():
        for r in group_rows:
            brand_raw = r.get("brand") or "Unknown"
            canon_brand, priority = get_whitelist_priority(brand_raw)
            b_key = canon_brand or brand_raw.lower()
            b_stat = stats["by_brand"].setdefault(b_key, {
                "priority": priority,
                "trends_passed": 0,
                "whitelist_admitted": 0,
                "rejected": 0,
                "awaiting_popularity_verification": 0,
                "unchecked": 0,
            })

            info = r.get("info") or {}
            gt = info.get("googleTrends") or {}
            if not gt.get("checkedAt"):
                stats["unchecked"] += 1
                b_stat["unchecked"] += 1
                continue

            avg_s = float(gt.get("avg") or 0)
            max_s = int(gt.get("max") or 0)
            passed_trends = (avg_s >= 30.0 or max_s >= 50) or (s_key in passing_series_keys and gt.get("filterStatus") != "whitelist_admitted")
            was_hidden = (r.get("in_stock") is False) or (gt.get("hiddenFromSite") is True)

            if passed_trends and gt.get("filterStatus") != "whitelist_admitted":
                stats["trends_passed"] += 1
                b_stat["trends_passed"] += 1
                if was_hidden or gt.get("passed") is not True or gt.get("filterStatus") != "trends_passed":
                    new_meta = {
                        **gt,
                        "seriesKey": s_key,
                        "passed": True,
                        "filterStatus": "trends_passed",
                        "filterReason": f"google_trends_passed: avg={avg_s} max={max_s} (series '{s_key}')",
                        "verifiedAt": datetime.now(timezone.utc).isoformat(),
                    }
                    if was_hidden:
                        stats["restored_count"] += 1
                        print(f"  RESTORE TRENDS {r['id']} ({r.get('name')}) -> avg={avg_s} max={max_s} series='{s_key}'", flush=True)
                    if not dry_run:
                        try:
                            patch_stock_trends(db_session, supabase_url, r, new_meta, visible=True)
                        except Exception as exc:
                            print(f"Warning patching {r.get('id')}: {exc}", flush=True)
                continue

            if priority == 0:
                stats["rejected"] += 1
                b_stat["rejected"] += 1
                continue

            decision, reason, evidence = verify_whitelist_popularity(
                r, s_key, bestseller_catalog, passing_series_keys=passing_series_keys
            )
            stats[decision] += 1
            b_stat[decision] += 1

            was_hidden = (r.get("in_stock") is False) or (gt.get("hiddenFromSite") is True)
            should_be_visible = (decision == "whitelist_admitted")
            needs_patch = (
                gt.get("filterStatus") != decision
                or gt.get("filterReason") != reason
                or (should_be_visible and was_hidden)
            )
            if needs_patch:
                new_meta = {
                    **gt,
                    "seriesKey": s_key,
                    "passed": should_be_visible,
                    "filterStatus": decision,
                    "filterReason": reason,
                    "whitelistEvidence": evidence,
                    "verifiedAt": datetime.now(timezone.utc).isoformat(),
                }
                if should_be_visible and was_hidden:
                    stats["restored_count"] += 1
                    print(f"  RESTORE {r['id']} ({r.get('name')}) -> {reason}", flush=True)
                elif decision == "awaiting_popularity_verification":
                    print(f"  AWAIT {r['id']} ({r.get('name')}) -> {reason}", flush=True)
                if not dry_run:
                    try:
                        patch_stock_trends(db_session, supabase_url, r, new_meta, visible=should_be_visible)
                    except Exception as exc:
                        print(f"Warning patching {r.get('id')}: {exc}", flush=True)

    print("\n=== PERFUME FILTERING REPORT ===")
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check perfume names in Google Trends (BG, RO, GR, HU).")
    parser.add_argument("name", nargs="?", help="Perfume name")
    parser.add_argument("--brand", default="", help="Brand name")
    parser.add_argument("--filter-all-db", action="store_true", help="Analyze ALL products in DB and hide failing ones (no deletion)")
    parser.add_argument("--verify-whitelisted", action="store_true", help="Run whitelist popularity verification across DB and restore admitted products")
    parser.add_argument("--completed-first", action="store_true", default=True, help="Prioritize completed site products first")
    parser.add_argument("--max-series", type=int, default=0, help="Max unchecked series to process per run (0 = unlimited)")
    parser.add_argument("--force", action="store_true", help="Re-check even already checked rows")
    parser.add_argument("--dry-run", action="store_true", help="Do not update DB")
    args = parser.parse_args()
    if args.verify_whitelisted:
        verify_whitelisted_products(dry_run=args.dry_run)
    elif args.filter_all_db:
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
        parser.error("Provide a perfume name, --filter-all-db, or --verify-whitelisted")
