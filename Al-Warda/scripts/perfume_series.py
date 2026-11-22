#!/usr/bin/env python3
"""
Perfume Series / Collection Classifier & Qogita Series Completeness Sync.

1. Identifies the official collection/series for each perfume using curated
   collection rules + DeepSeek AI lookup (with local JSON cache).
2. Stores `info.series` on every product in `public.stocks`.
3. Ensures that if ANY perfume from a series is present on the site, ALL other
   perfumes in that same series (both hidden in `stocks` and missing on Qogita)
   are restored/added to `stocks` and queued for image generation.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
CACHE_PATH = APP_DIR / "server" / "data" / "series_cache.json"

# Curated (brand_regex_or_none, name_regex, canonical_series_name)
SERIES_RULES = [
    (r"french\s*avenue|fragrance\s*world", r"\bliquid\s*brun\b|\bsweet\s*pleasure\b", "Sweet Pleasure Collection"),
    (r"french\s*avenue", r"\broyal\s*blend\b", "Royal Blend"),
    (r"french\s*avenue", r"\bspectre\b", "Spectre"),
    (r"french\s*avenue", r"\bazzure\b", "Azzure"),
    (r"lattafa", r"\bkhamrah\b", "Khamrah"),
    (r"lattafa", r"\bbade['’]?e\s*al\s*oud\b|\bbadee\s*al\s*oud\b|\boud\s*for\s*glory\b|\bhonor\s*&\s*glory\b|\bnoble\s*blush\b", "Bade'e Al Oud"),
    (r"lattafa|ard\s*al\s*zaafaran", r"\byara\b", "Yara"),
    (r"lattafa", r"\basad\b", "Asad"),
    (r"lattafa", r"\beclaire\b", "Eclaire"),
    (r"lattafa", r"\bfakhar\b", "Fakhar"),
    (r"lattafa", r"\braghba\b", "Raghba"),
    (r"lattafa", r"\bqimmah\b", "Qimmah"),
    (r"lattafa", r"\bopulent\b", "Opulent"),
    (r"lattafa", r"\bana\s*abiyedh\b", "Ana Abiyedh"),
    (r"lattafa", r"\bhaya\b", "Haya"),
    (r"lattafa", r"\bmaahir\b", "Maahir"),
    (r"lattafa", r"\bmayar\b", "Mayar"),
    (r"lattafa", r"\bteriaq\b", "Teriaq"),
    (r"lattafa", r"\bnebras\b", "Nebras"),
    (r"lattafa", r"\bramz\b", "Ramz"),
    (r"lattafa", r"\bajwad\b", "Ajwad"),
    (r"lattafa", r"\bpride\b", "Lattafa Pride"),
    (r"armaf", r"\bclub\s*de\s*nuit\b|\bcdn\b", "Club De Nuit"),
    (r"armaf", r"\bodyssey\b", "Odyssey"),
    (r"armaf", r"\btres\s*nuit\b", "Tres Nuit"),
    (r"armaf", r"\btag[\s-]*(?:him|her)\b", "Tag"),
    (r"al\s*haramain", r"\bamber\s*oud\b", "Amber Oud"),
    (r"al\s*haramain", r"\bl['’]?\s*aventure\b", "L'Aventure"),
    (r"al\s*haramain", r"\bdetour\b", "Detour"),
    (r"al\s*haramain", r"\bfrench\s*collection\b", "French Collection"),
    (r"afnan", r"\b(?:9\s*pm|9pm|9\s*am|9am)\b", "9PM / 9AM"),
    (r"afnan", r"\bsupremacy\b", "Supremacy"),
    (r"afnan", r"\bturathi\b", "Turathi"),
    (r"afnan", r"\brare\b", "Rare"),
    (r"afnan", r"\bmodest\b", "Modest"),
    (r"rasasi", r"\bhawas\b", "Hawas"),
    (r"rasasi", r"\bshuhrah\b", "Shuhrah"),
    (r"rasasi", r"\bla\s*yuqawam\b", "La Yuqawam"),
    (r"swiss\s*arabian", r"\bshaghaf\b", "Shaghaf"),
    (r"swiss\s*arabian", r"\bcasablanca\b", "Casablanca"),
    (r"paris\s*corner", r"\bkhair\b", "Khair"),
    (r"paris\s*corner", r"\btaskeen\b", "Taskeen"),
    (r"paris\s*corner", r"\brifaaqat\b", "Rifaaqat"),
    (r"maison\s*alhambra", r"\bjean\s*lowe\b", "Jean Lowe"),
    (r"maison\s*alhambra", r"\bkismet\b", "Kismet"),
    (r"maison\s*alhambra", r"\bdelilah\b", "Delilah"),
    (r"amouage", r"\bguidance\b", "Guidance"),
    (r"amouage", r"\binterlude\b", "Interlude"),
    (r"amouage", r"\breflection\b", "Reflection"),
    (r"amouage", r"\bhonour\b", "Honour"),
    (r"ard\s*al\s*zaafaran", r"\bdirham\b", "Dirham"),
    (r"asdaaf|lattafa", r"\bameerat\s*al\s*arab\b", "Ameerat Al Arab"),
]


def load_dotenv_into_os():
    env_path = APP_DIR / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def load_series_cache():
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_series_cache(cache):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def match_curated_series(name, brand=""):
    n = str(name or "").strip()
    b = str(brand or "").strip()
    combined = f"{b} {n}".strip()
    for b_pat, n_pat, series_name in SERIES_RULES:
        if b_pat and not re.search(b_pat, combined, flags=re.I):
            continue
        if re.search(n_pat, combined, flags=re.I):
            return series_name
    return None


def _cache_key(brand, name):
    return f"{str(brand or '').strip().lower()}::{str(name or '').strip().lower()}"


def classify_series_batch_deepseek(items, api_key, cache):
    """Classify a list of (brand, name) tuples using DeepSeek API."""
    if not api_key or not items:
        return {}

    results = {}
    to_query = []
    for brand, name in items:
        curated = match_curated_series(name, brand)
        if curated:
            results[_cache_key(brand, name)] = curated
            continue
        ck = _cache_key(brand, name)
        if ck in cache:
            results[ck] = cache[ck]
        else:
            to_query.append((brand, name))

    BATCH = 25
    for i in range(0, len(to_query), BATCH):
        batch = to_query[i : i + BATCH]
        lines = [f"{idx + 1}. Brand: {b} | Name: {n}" for idx, (b, n) in enumerate(batch)]
        prompt = (
            "You are a perfume catalog expert. For each perfume below, return its official "
            "perfume collection / series / line name if it belongs to one (for example: "
            "'French Avenue Liquid Brun Limited Edition' -> 'Sweet Pleasure Collection', "
            "'Lattafa Khamrah Qahwa' -> 'Khamrah', 'Armaf Club De Nuit Intense Man' -> 'Club De Nuit', "
            "'Al Haramain Amber Oud Gold Edition' -> 'Amber Oud'). "
            "If the fragrance is standalone and does NOT belong to a multi-fragrance series/collection, return \"\".\n"
            "Return ONLY valid JSON: an array of objects [{\"index\": 1, \"series\": \"...\"}, ...].\n\n"
            + "\n".join(lines)
        )
        body = json.dumps(
            {
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0,
                "max_tokens": 1200,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            "https://api.deepseek.com/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            content = payload["choices"][0]["message"]["content"].strip()
            m = re.search(r"\[[\s\S]*\]", content)
            if m:
                arr = json.loads(m.group(0))
                for entry in arr:
                    idx = int(entry.get("index", 0)) - 1
                    if 0 <= idx < len(batch):
                        b, n = batch[idx]
                        ser = str(entry.get("series") or "").strip()
                        # Reject generic non-series strings
                        if ser.lower() in ("none", "n/a", "null", "standalone", "eau de parfum", "eau de toilette"):
                            ser = ""
                        ck = _cache_key(b, n)
                        cache[ck] = ser
                        results[ck] = ser
        except Exception as e:
            print(f"[perfume_series] DeepSeek batch warning: {e}", file=sys.stderr)

    save_series_cache(cache)
    return results


def detect_series(name, brand="", cache=None, api_key=""):
    curated = match_curated_series(name, brand)
    if curated:
        return curated
    ck = _cache_key(brand, name)
    if cache and ck in cache:
        return cache[ck] or ""
    if api_key:
        c = cache if cache is not None else load_series_cache()
        res = classify_series_batch_deepseek([(brand, name)], api_key, c)
        return res.get(ck, "")
    return ""


def _hasura_graphql(query, variables=None):
    url = os.environ.get("NHOST_GRAPHQL_URL", "https://jopiirogydgupiwqiwac.graphql.eu-central-1.nhost.run/v1")
    secret = os.environ.get("NHOST_ADMIN_SECRET") or os.environ.get("HASURA_GRAPHQL_ADMIN_SECRET", "")
    if not secret:
        raise RuntimeError("NHOST_ADMIN_SECRET is missing")
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-hasura-admin-secret": secret,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if data.get("errors"):
        raise RuntimeError(f"Hasura error: {data['errors']}")
    return data.get("data", {})


def sync_all_series_and_qogita_completeness():
    load_dotenv_into_os()
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    cache = load_series_cache()

    print("[perfume_series] Loading stocks from DB...")
    all_rows = []
    offset = 0
    while True:
        data = _hasura_graphql(
            """query LoadStocks($limit: Int!, $offset: Int!) {
              stocks(where: { slug: { _neq: "site-settings" } }, order_by: { id: asc }, limit: $limit, offset: $offset) {
                id slug name brand price in_stock info
              }
            }""",
            {"limit": 1000, "offset": offset},
        )
        batch = data.get("stocks") or []
        all_rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000

    print(f"[perfume_series] Loaded {len(all_rows)} rows from stocks.")

    # Step 1: Classify series for all rows (curated + DeepSeek for completed/in-stock first)
    to_classify = [
        (r.get("brand") or "", r.get("name") or "")
        for r in all_rows
        if r.get("in_stock") is True
    ]
    series_map = classify_series_batch_deepseek(to_classify, api_key, cache)

    active_series = set()
    active_brands = set()
    existing_gtins = set()
    existing_names = set()

    for r in all_rows:
        info = r.get("info") if isinstance(r.get("info"), dict) else {}
        gtin = str(info.get("gtin") or "").strip()
        if gtin:
            existing_gtins.add(gtin)
        existing_names.add(re.sub(r"[^\w]+", " ", (r.get("name") or "").lower()).strip())

        ck = _cache_key(r.get("brand") or "", r.get("name") or "")
        detected = series_map.get(ck) or match_curated_series(r.get("name") or "", r.get("brand") or "") or str(info.get("series") or "").strip()
        if detected and r.get("in_stock") is True and (info.get("imageGeneration") or {}).get("status") == "completed":
            active_series.add(detected)
            if r.get("brand"):
                active_brands.add(str(r["brand"]).strip())

    print(f"[perfume_series] Active series on site ({len(active_series)}): {sorted(active_series)[:15]}...")

    # Step 2: Update info.series on stocks AND restore hidden/out-of-stock DB rows in active_series
    updated_count = 0
    restored_count = 0
    for r in all_rows:
        info = dict(r.get("info") or {}) if isinstance(r.get("info"), dict) else {}
        ck = _cache_key(r.get("brand") or "", r.get("name") or "")
        detected = series_map.get(ck) or match_curated_series(r.get("name") or "", r.get("brand") or "") or str(info.get("series") or "").strip()
        if not detected:
            continue

        needs_update = info.get("series") != detected
        should_restore = detected in active_series and r.get("in_stock") is False

        if needs_update or should_restore:
            info["series"] = detected
            next_in_stock = r.get("in_stock")
            if should_restore:
                next_in_stock = True
                gt = dict(info.get("googleTrends") or {})
                gt["hiddenFromSite"] = False
                gt["passed"] = True
                gt["filterStatus"] = "series_complete_admit"
                gt["filterReason"] = f"Active series '{detected}' on site"
                info["googleTrends"] = gt
                restored_count += 1

            _hasura_graphql(
                """mutation UpdateSeries($id: bigint!, $in_stock: Boolean!, $info: jsonb!) {
                  update_stocks_by_pk(pk_columns: { id: $id }, _set: { in_stock: $in_stock, info: $info }) { id }
                }""",
                {"id": int(r["id"]), "in_stock": bool(next_in_stock), "info": info},
            )
            updated_count += 1

    print(f"[perfume_series] Updated info.series on {updated_count} DB rows (restored {restored_count} hidden/out-of-stock series items).")

    # Step 3: Check live Qogita API for any missing products in active_series!
    sys.path.insert(0, str(SCRIPT_DIR))
    from qogita_weekly_sync_upscayl import QogitaSyncClient, is_excluded_non_perfume

    def is_wholesale_bundle(name_str):
        return bool(re.search(
            r"\b(pack\s*of\s*\d+|\d+\s*pack\b|bundle\s*of\s*\d+|\bcase\s*of\s*\d+|\bcarton\s*of\s*\d+|\bwholesale\s*bundle\b|\bmultipack\b)\b",
            str(name_str or ""),
            re.IGNORECASE,
        ))

    def make_slug(name_str):
        s = re.sub(r"[^a-z0-9]+", "-", str(name_str or "").lower()).strip("-")
        return s[:80] or "perfume"

    q_email = os.environ.get("QOGITA_EMAIL", "").strip()
    q_pass = os.environ.get("QOGITA_PASSWORD", "").strip()
    added_from_qogita = 0
    next_stock_id = max((int(r["id"]) for r in all_rows if r.get("id") is not None), default=10000)

    if q_email and q_pass and active_brands:
        client = QogitaSyncClient(q_email, q_pass)
        client.login()
        print(f"[perfume_series] Scanning Qogita API across {len(active_brands)} brands for missing series items...")

        q_items = []
        for brand in sorted(active_brands):
            try:
                results = client.fetch_brand_perfumes(brand, limit=300)
                q_items.extend(results or [])
            except Exception as e:
                print(f"  ! Brand fetch failed for {brand}: {e}", file=sys.stderr)

        # Classify Qogita items that aren't already in DB
        missing_candidates = []
        for item in q_items:
            name = str(item.get("name") or "").strip()
            brand = str(item.get("brand") or "").strip()
            gtin = str(item.get("gtin") or "").strip()
            norm_n = re.sub(r"[^\w]+", " ", name.lower()).strip()
            if not name or is_wholesale_bundle(name) or is_excluded_non_perfume(name):
                continue
            if (gtin and gtin in existing_gtins) or (norm_n in existing_names):
                continue
            missing_candidates.append(item)

        if missing_candidates:
            q_series_map = classify_series_batch_deepseek(
                [(str(i.get("brand") or ""), str(i.get("name") or "")) for i in missing_candidates],
                api_key,
                cache,
            )
            for item in missing_candidates:
                name = str(item.get("name") or "").strip()
                brand = str(item.get("brand") or "").strip()
                ck = _cache_key(brand, name)
                ser = q_series_map.get(ck) or match_curated_series(name, brand)
                if ser and ser in active_series:
                    gtin = str(item.get("gtin") or "").strip()
                    price_amt = float((item.get("price") or {}).get("amount") or 25.0)
                    slug = make_slug(name)
                    if gtin:
                        slug = f"{slug}-{gtin[-6:]}"
                    vol_m = re.search(r"\b(\d+(?:[.,]\d+)?\s*ml)\b", name, flags=re.I)
                    info_obj = {
                        "gtin": gtin,
                        "series": ser,
                        "volume": vol_m.group(1).lower().replace(" ", "") if vol_m else "",
                        "price": round(price_amt, 2),
                        "movPrice": round(price_amt, 2),
                        "rawImage": str(item.get("imageUrl") or "").strip(),
                        "unit": int(item.get("unit") or 1),
                        "minOrderQuantity": 1,
                        "imageGeneration": {"status": "pending"},
                        "googleTrends": {
                            "passed": True,
                            "hiddenFromSite": False,
                            "seriesKey": ser.lower(),
                            "filterStatus": "series_complete_admit",
                            "filterReason": f"Added from Qogita to complete active series '{ser}'",
                        },
                    }
                    try:
                        next_stock_id += 1
                        _hasura_graphql(
                            """mutation InsertMissingSeriesItem($obj: stocks_insert_input!) {
                              insert_stocks_one(object: $obj) { id }
                            }""",
                            {
                                "obj": {
                                    "id": next_stock_id,
                                    "slug": slug,
                                    "name": name,
                                    "title": name,
                                    "brand": brand,
                                    "category": str(item.get("category") or "Eau De Parfum"),
                                    "price": round(price_amt, 2),
                                    "currency": "EUR",
                                    "image": "",
                                    "in_stock": True,
                                    "description": "",
                                    "info": info_obj,
                                }
                            },
                        )
                        added_from_qogita += 1
                        if gtin:
                            existing_gtins.add(gtin)
                        existing_names.add(re.sub(r"[^\w]+", " ", name.lower()).strip())
                        print(f"  + Added missing series item: [{ser}] {brand} - {name} (GTIN: {gtin})")
                    except Exception as e:
                        print(f"  ! Could not insert {name}: {e}", file=sys.stderr)

    print(f"[perfume_series] Done! Added {added_from_qogita} missing series items from Qogita.")
    return {
        "activeSeriesCount": len(active_series),
        "updatedRows": updated_count,
        "restoredRows": restored_count,
        "addedFromQogita": added_from_qogita,
    }


if __name__ == "__main__":
    res = sync_all_series_and_qogita_completeness()
    print(json.dumps(res, ensure_ascii=False))
