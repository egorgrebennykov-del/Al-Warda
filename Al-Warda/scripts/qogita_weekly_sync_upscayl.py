#!/usr/bin/env python3
"""
Al-Warda weekly Qogita catalog sync and durable background-generation queue.

Pipeline Steps:
1. Authenticates with Qogita API and downloads latest in-stock Arabian perfume products.
2. Identifies new/updated perfumes and their product images.
3. Enqueues original source photos for Cloudflare background generation.
4. Leaves each original product photo unchanged until its generated image is ready.
5. Synchronizes Supabase database ('stocks' table) and server/data/enrichedStocks.json.
6. Runs locally on Windows or weekly in GitHub Actions.
"""

import os
import sys
import json
import hashlib
import re
import time
import argparse
import requests
import urllib3

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(SCRIPT_DIR)
ENRICHED_STOCKS_PATH = os.path.join(APP_DIR, "server", "data", "enrichedStocks.json")
CACHED_PERFUMES_PATH = os.path.join(APP_DIR, "server", "data", "cachedArabianPerfumes.json")

ROOT_SCRIPTS_DIR = os.path.join(os.path.dirname(APP_DIR), "scripts")
if ROOT_SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, ROOT_SCRIPTS_DIR)
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

# Load environment variables
def load_env():
    env_paths = [
        os.path.join(APP_DIR, ".env"),
        os.path.join(os.path.dirname(APP_DIR), ".env"),
    ]
    for ep in env_paths:
        if os.path.exists(ep):
            with open(ep, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip()
                        if k and not os.environ.get(k):
                            os.environ[k] = v

load_env()

# Config
QOGITA_API_URL = os.environ.get("QOGITA_API_URL", "https://api.qogita.com").rstrip("/")
QOGITA_EMAIL = os.environ.get("QOGITA_EMAIL", "")
QOGITA_PASSWORD = os.environ.get("QOGITA_PASSWORD", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://mfvenfrmlkxqgvdtedet.supabase.co").rstrip("/")
SUPABASE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_SECRET_KEY")
)

ARABIAN_BRANDS = [
    # All 44 requested Arabian perfume brands
    "Afnan", "Ajmal", "Al Fares", "Al Haramain", "Al Majed for Oud",
    "Al Wataniah", "Anfas", "Ard Al Zaafaran", "Armaf", "Asdaaf",
    "Atyab Al Marshoud", "Azha", "Azhaara", "Clive Dorris", "Emper",
    "Flavia", "Fragrance World", "Grandeur", "Hamidi", "Hayaati",
    "Hekayat Attar", "Jenny Glow", "Just Jack", "Khadlaj", "Khalis",
    "La Fede", "Lattafa", "Le Falcone", "Mamlakt Al Oud", "Ministry of Oud",
    "Myperfumes", "Ojar", "Orientica", "Paris Corner", "Prime Collection",
    "Privezarah", "Rasasi", "RiiFs", "Risala", "Shaikh Mohd Saeed",
    "Sterling Parfums", "Tayyib", "Vurv", "Zimaya",
    # Signature houses
    "Maison Alhambra", "Swiss Arabian", "Arabian Oud", "Al Rehab", "French Avenue", "Rayhaan"
]

# Qogita Client
class QogitaSyncClient:
    def __init__(self, email=QOGITA_EMAIL, password=QOGITA_PASSWORD, api_url=QOGITA_API_URL):
        self.api_url = api_url
        self.email = email
        self.password = password
        self.token = None
        self.session = requests.Session()
        self.session.verify = False

    def login(self):
        if not self.email or not self.password:
            raise RuntimeError("Set QOGITA_EMAIL and QOGITA_PASSWORD before starting the Qogita sync.")
        login_url = f"{self.api_url}/auth/login/"
        res = self.session.post(login_url, json={"email": self.email, "password": self.password}, timeout=15)
        if res.status_code == 200:
            data = res.json()
            self.token = data.get("accessToken")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return True
        raise RuntimeError(f"Qogita login failed: {res.status_code} - {res.text}")

    def get_with_retry(self, url, max_retries=3):
        for attempt in range(max_retries):
            try:
                res = self.session.get(url, timeout=25)
                if res.status_code == 200:
                    return res
                elif res.status_code == 401:
                    print("Token expired (401), re-authenticating with Qogita...")
                    self.login()
                    time.sleep(1.0)
                    continue
                elif res.status_code == 429:
                    wait_time = (attempt + 1) * 3.0
                    print(f"Rate limited (429) by Qogita. Pausing {wait_time}s before retry (attempt {attempt+1}/{max_retries})...")
                    time.sleep(wait_time)
                    continue
                elif res.status_code >= 500:
                    time.sleep(2.0)
                    continue
                else:
                    return res
            except Exception as e:
                if attempt == max_retries - 1:
                    print(f"HTTP request error: {e}")
                    return None
                time.sleep(1.5)
        return None

    def fetch_brand_perfumes(self, brand_name, limit=None):
        items = []
        page = 1
        page_size = 100 if (limit is None or limit > 50 or limit <= 0) else limit
        max_pages = 25 if (limit is None or limit <= 0) else ((limit // 100) + 1)

        # 1. Fetch exact brand products with pagination
        while page <= max_pages:
            url = f"{self.api_url}/public/buyers/products/?brand_name={requests.utils.quote(brand_name)}&page={page}&page_size={page_size}"
            try:
                res = self.get_with_retry(url)
                if res is None or res.status_code != 200:
                    break
                batch = res.json().get("results", [])
                if not batch:
                    break
                items.extend(batch)
                if limit and limit > 0 and len(items) >= limit:
                    items = items[:limit]
                    break
                if len(batch) < page_size:
                    break
                page += 1
                time.sleep(0.3)  # Gentle spacing to avoid 429 rate limit
            except Exception as e:
                print(f"Warning: page fetch failed for {brand_name} (page {page}): {e}")
                break

        # 2. Fallback to search parameter if brand_name returned nothing
        if not items:
            page = 1
            while page <= 5:
                url2 = f"{self.api_url}/public/buyers/products/?search={requests.utils.quote(brand_name)}&page={page}&page_size=100"
                try:
                    res2 = self.get_with_retry(url2)
                    if res2 is None or res2.status_code != 200:
                        break
                    batch2 = res2.json().get("results", [])
                    if not batch2:
                        break
                    for it in batch2:
                        name = (it.get("name") or "").lower()
                        # Filter out non-perfume items
                        if any(bad in name for bad in ["serum", "retinal", "mask", "cream", "booster", "sunscreen", "cleanser", "shampoo", "pad", "toner", "lotion", "peeling"]):
                            continue
                        if brand_name.lower() in name or any(frag in name for frag in ["edp", "edt", "parfum", "eau de", "perfume", "fragrance", "cologne"]):
                            items.append(it)
                            if limit and limit > 0 and len(items) >= limit:
                                break
                    if limit and limit > 0 and len(items) >= limit:
                        items = items[:limit]
                        break
                    if len(batch2) < 100:
                        break
                    page += 1
                    time.sleep(0.3)
                except Exception as e:
                    print(f"Warning: search fallback error for {brand_name}: {e}")
                    break

        time.sleep(0.2)
        return items if (not limit or limit <= 0) else items[:limit]

def build_rich_bilingual_enrichment(name, brand="Al-Warda"):
    nm_lower = f"{name} {brand}".lower()
    if any(w in nm_lower for w in ["fresh", "aqua", "marine", "ice", "cool", "blue", "bleu", "ocean", "sea", "hawas"]):
        cat_ru, cat_en, cat_slug = "Свежие акватические", "Fresh Aquatic", "fresh"
        top_ru, heart_ru, base_ru = ["Морской бриз", "Калабрийский бергамот", "Грейпфрут"], ["Мята", "Лаванда", "Морская соль"], ["Амброксан", "Белый кедр", "Белый мускус"]
        top_en, heart_en, base_en = ["Sea Breeze", "Calabrian Bergamot", "Grapefruit"], ["Peppermint", "Lavender", "Sea Salt"], ["Ambroxan", "White Cedar", "White Musk"]
    elif any(w in nm_lower for w in ["vanilla", "sweet", "caramel", "candy", "sugar", "tonka", "khamrah", "yara", "eclaire", "nebras", "choco", "praline"]):
        cat_ru, cat_en, cat_slug = "Восточные гурманские", "Oriental Gourmand", "gourmand"
        top_ru, heart_ru, base_ru = ["Корица", "Бергамот", "Гелиотроп"], ["Карамель", "Пралине", "Финики"], ["Бурбонская ваниль", "Бобы тонка", "Сандал"]
        top_en, heart_en, base_en = ["Cinnamon", "Bergamot", "Heliotrope"], ["Caramel", "Praline", "Dates"], ["Bourbon Vanilla", "Tonka Bean", "Sandalwood"]
    elif any(w in nm_lower for w in ["floral", "rose", "jasmine", "blossom", "flower", "peony", "orchid", "tuberose"]):
        cat_ru, cat_en, cat_slug = "Цветочные восточные", "Oriental Floral", "floral"
        top_ru, heart_ru, base_ru = ["Дамасская роза", "Красные ягоды", "Бергамот"], ["Таифская роза", "Жасмин самбак", "Пион"], ["Кашемировое дерево", "Серая амбра", "Шелковистый мускус"]
        top_en, heart_en, base_en = ["Damask Rose", "Red Berries", "Bergamot"], ["Taif Rose", "Jasmine Sambac", "Peony"], ["Cashmere Wood", "Ambergris", "Silk Musk"]
    elif any(w in nm_lower for w in ["fougere", "lavender", "sage", "sauvage", "club de nuit", "aventus", "fakhar", "hunter"]):
        cat_ru, cat_en, cat_slug = "Фужерные ароматические", "Aromatic Fougère", "fougere"
        top_ru, heart_ru, base_ru = ["Французская лаванда", "Зеленое яблоко", "Имбирь"], ["Мускатный шалфей", "Бурбонская герань", "Можжевельник"], ["Дубовый мох", "Гаитянский ветивер", "Бобы тонка"]
        top_en, heart_en, base_en = ["French Lavender", "Green Apple", "Fresh Ginger"], ["Clary Sage", "Bourbon Geranium", "Juniper"], ["Oakmoss", "Haitian Vetiver", "Tonka Bean"]
    elif any(w in nm_lower for w in ["spice", "pepper", "saffron", "asad", "cinnamon", "cardamom", "tobacco"]):
        cat_ru, cat_en, cat_slug = "Восточные пряные", "Oriental Spicy", "spicy"
        top_ru, heart_ru, base_ru = ["Королевский шафран", "Черный перец", "Кардамон"], ["Корица", "Кофейное зерно", "Благородный табак"], ["Золотая амбра", "Бобы тонка", "Сандал"]
        top_en, heart_en, base_en = ["Royal Saffron", "Black Pepper", "Cardamom"], ["Cinnamon Bark", "Roasted Coffee Bean", "Rich Tobacco"], ["Golden Amber", "Tonka Bean", "Sandalwood"]
    else:
        cat_ru, cat_en, cat_slug = "Восточные древесные", "Oriental Woody", "oud"
        top_ru, heart_ru, base_ru = ["Камбоджийский уд", "Шафран", "Розовый перец"], ["Дамасская роза", "Пачули", "Амбра"], ["Агаровое дерево", "Сандал", "Мадагаскарская ваниль"]
        top_en, heart_en, base_en = ["Cambodian Oud", "Saffron", "Pink Pepper"], ["Damask Rose", "Patchouli", "Amber"], ["Agarwood", "Sandalwood", "Madagascar Vanilla"]

    if any(w in nm_lower for w in ["femme", "woman", "women", "pour femme", "mademoiselle", "lady", "girl", "queen", "princess", "yara"]):
        gender_ru, gender_en = "Женский", "Women"
    elif any(w in nm_lower for w in ["pour homme", "men", "man", "asad", "hunter"]) and "women" not in nm_lower and "femme" not in nm_lower:
        gender_ru, gender_en = "Мужской", "Men"
    else:
        gender_ru, gender_en = "Унисекс", "Unisex"

    desc_ru = (
        f"{brand} {name} — роскошный селективный аромат с Ближнего Востока ({cat_ru.lower()}), созданный в лучших традициях восточного парфюмерного искусства. "
        f"С первых мгновений композиция завораживает ярким вступлением верхних нот ({', '.join(top_ru)}), плавно раскрываясь глубоким и многогранным сердцем из акцентов: {', '.join(heart_ru)}. "
        f"В финале аромат окутывает благородной, бархатистой базой ({', '.join(base_ru)}), формируя дорогой и узнаваемый шлейф. "
        f"Высокая концентрация натуральных эфирных масел обеспечивает исключительную стойкость (10–14 часов). "
        f"Оригинальная продукция от сертифицированных парфюмерных домов Ближнего Востока."
    )
    desc_en = (
        f"{brand} {name} is an opulent niche fragrance from the Middle East ({cat_en.lower()}), crafted in the finest traditions of oriental perfumery. "
        f"From the very first spritz, the composition captivates with luminous top notes of {', '.join(top_en)}, seamlessly unfolding into a rich, multifaceted heart of {', '.join(heart_en)}. "
        f"As it settles on the skin, a velvety, resonant base of {', '.join(base_en)} emerges, leaving an unforgettable and sophisticated trail. "
        f"Formulated with a high concentration of precious aromatic oils, it delivers remarkable longevity (10–14 hours). "
        f"100% authentic creation sourced directly from certified perfume houses in the Middle East."
    )
    return {
        "category": cat_ru,
        "categoryEn": cat_en,
        "categorySlug": cat_slug,
        "gender": gender_ru,
        "genderEn": gender_en,
        "origin": "Ближний Восток",
        "originEn": "Middle East",
        "notesSummary": " · ".join(top_ru[:2] + heart_ru[:1] + base_ru[:1]),
        "notesSummaryEn": " · ".join(top_en[:2] + heart_en[:1] + base_en[:1]),
        "notes": {
            "ru": {"top": top_ru, "heart": heart_ru, "base": base_ru},
            "en": {"top": top_en, "heart": heart_en, "base": base_en},
        },
        "description": desc_ru,
        "descriptionRu": desc_ru,
        "descriptionEn": desc_en,
    }

# Sync Supabase
def sync_to_supabase(perfumes_list):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Supabase credentials are required to persist the product image queue.")

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    url = f"{SUPABASE_URL}/rest/v1/stocks"

    existing_by_gtin = {}
    existing_by_name = {}
    offset = 0
    page_size = 1000
    while True:
        response = requests.get(
            url,
            params={"select": "id,name,image,info", "order": "id.asc", "offset": offset, "limit": page_size},
            headers=headers,
            timeout=30,
            verify=False,
        )
        if not response.ok:
            raise RuntimeError(
                f"Could not preserve existing product image status "
                f"({response.status_code}): {response.text[:400]}"
            )
        rows = response.json()
        if not isinstance(rows, list):
            raise RuntimeError("Supabase stocks response was not a list")
        for row in rows:
            info = row.get("info") or {}
            gtin = info.get("gtin")
            name = (row.get("name") or "").strip().lower()
            if gtin:
                existing_by_gtin[str(gtin)] = row
            if name:
                existing_by_name[name] = row
        if len(rows) < page_size:
            break
        offset += page_size

    synced = 0
    batch = []
    for p in perfumes_list:
        slug = f"dropship-{p.get('gtin') or hashlib.md5(p['name'].encode('utf-8')).hexdigest()[:12]}"
        raw_image = p.get("rawImage") or ""
        previous = existing_by_gtin.get(str(p.get("gtin") or "")) or existing_by_name.get(
            p["name"].strip().lower()
        )
        previous_info = (previous or {}).get("info") or {}
        previous_generation = previous_info.get("imageGeneration") or {}
        same_source = previous_info.get("rawImage") == raw_image and bool(raw_image)
        generation = (
            previous_generation
            if same_source and previous_generation.get("status")
            else {"status": "pending"}
        )
        image = raw_image or p.get("image") or "/assets/img/perfumes/hero-perfume.png"
        if (
            same_source
            and generation.get("status") == "completed"
            and isinstance((previous or {}).get("image"), str)
            and (
                (previous or {}).get("image", "").startswith(
                    f"{SUPABASE_URL}/storage/v1/object/public/product-images/"
                )
                or re.fullmatch(
                    r"/assets/img/generated-products/[a-f0-9]{64}\.png",
                    (previous or {}).get("image", ""),
                )
            )
        ):
            image = previous["image"]
        rich = build_rich_bilingual_enrichment(p["name"], p.get("brand") or "Al-Warda")
        record = {
            "slug": slug,
            "name": p["name"],
            "title": p["name"],
            "brand": p.get("brand") or "Al-Warda",
            "category": p.get("category") or rich["category"],
            "price": float(p.get("price") or 25.0),
            "currency": p.get("currency") or "EUR",
            "image": image,
            "in_stock": True,
            "description": p.get("descriptionRu") or rich["descriptionRu"],
            "info": {
                "category": p.get("category") or rich["category"],
                "categoryEn": p.get("categoryEn") or rich["categoryEn"],
                "categorySlug": p.get("categorySlug") or rich["categorySlug"],
                "gender": p.get("gender") or rich["gender"],
                "genderEn": p.get("genderEn") or rich["genderEn"],
                "origin": "Ближний Восток",
                "originEn": "Middle East",
                "notes": rich["notes"],
                "notesSummary": p.get("notesSummary") or rich["notesSummary"],
                "notesSummaryEn": p.get("notesSummaryEn") or rich["notesSummaryEn"],
                "longevity": "10–14 часов",
                "longevityEn": "10–14 hours",
                "sillage": "Заметный, притягательный",
                "sillageEn": "Noticeable, alluring sillage",
                "volume": "100 мл EDP",
                "concentration": "Eau de Parfum",
                "gtin": p.get("gtin") or "",
                "minOrderQuantity": int(p.get("minOrderQuantity") or 1),
                "unit": int(p.get("minOrderQuantity") or 1),
                "rawImage": raw_image,
                "imageGeneration": generation,
                "description": p.get("descriptionRu") or rich["descriptionRu"],
                "descriptionRu": p.get("descriptionRu") or rich["descriptionRu"],
                "descriptionEn": p.get("descriptionEn") or rich["descriptionEn"],
            }
        }
        batch.append(record)
        if len(batch) >= 20:
            res = requests.post(url, json=batch, headers=headers, timeout=20, verify=False)
            if not res.ok:
                raise RuntimeError(
                    f"Supabase stock upsert failed ({res.status_code}): {res.text[:400]}"
                )
            synced += len(batch)
            batch = []

    if batch:
        res = requests.post(url, json=batch, headers=headers, timeout=20, verify=False)
        if not res.ok:
            raise RuntimeError(
                f"Supabase stock upsert failed ({res.status_code}): {res.text[:400]}"
            )
        synced += len(batch)

    return synced

def save_enriched_stocks(enriched_data):
    try:
        tmp_file = ENRICHED_STOCKS_PATH + ".tmp"
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(enriched_data, f, ensure_ascii=False, indent=2)
        if os.path.exists(ENRICHED_STOCKS_PATH):
            try:
                os.remove(ENRICHED_STOCKS_PATH)
            except:
                pass
        os.rename(tmp_file, ENRICHED_STOCKS_PATH)
        return True
    except Exception as e:
        print(f"Warning writing enrichedStocks.json: {e}")
        try:
            with open(ENRICHED_STOCKS_PATH, "w", encoding="utf-8") as f:
                json.dump(enriched_data, f, ensure_ascii=False, indent=2)
            return True
        except:
            return False

# Main Runner
def run_weekly_sync(limit_per_brand=None, cloud_mode=False, force=False, brands_arg="", incremental=False, all_products=False):
    if all_products or limit_per_brand == 0:
        limit_per_brand = None

    print("=" * 65)
    print("AL-WARDA - QOGITA CATALOG SYNC & ORIGINAL PHOTO ENHANCEMENT")
    print(f"Execution mode: {'Cloud (GitHub Actions)' if cloud_mode else 'Local PC'}")
    print("Image mode: originals stay untouched; Cloudflare queue generates backgrounds later")
    print(f"Items per brand: {'Maximum available (ALL)' if limit_per_brand is None else limit_per_brand}")
    if incremental:
        print("Sync mode: Smart Incremental (Delta changes & new additions only)")
    elif brands_arg:
        print(f"Sync mode: Targeted Brands ({brands_arg})")
    else:
        print("Sync mode: Full Database Refresh (All Brands & Maximum Catalog)")
    print("=" * 65)

    # Determine target brands
    if brands_arg and brands_arg.strip():
        target_brands = [b.strip() for b in brands_arg.split(",") if b.strip()]
    else:
        target_brands = ARABIAN_BRANDS

    print(f"Target brands to scan: {len(target_brands)}")

    # Authenticate with Qogita
    client = QogitaSyncClient()
    try:
        client.login()
        print(f"✓ Successfully authenticated with Qogita API ({client.email})")
    except Exception as e:
        print(f"❌ Qogita authentication failed: {e}")
        raise RuntimeError("Qogita authentication failed; check the QOGITA_EMAIL and QOGITA_PASSWORD GitHub secrets.") from e

    # Load existing catalog for delta comparison
    existing_enriched = {}
    if os.path.exists(ENRICHED_STOCKS_PATH):
        try:
            with open(ENRICHED_STOCKS_PATH, "r", encoding="utf-8") as f:
                existing_enriched = json.load(f)
        except:
            existing_enriched = {}

    existing_by_name = {
        (v.get("name") or "").strip().lower(): v
        for v in existing_enriched.values()
    }
    existing_by_gtin = {
        v.get("info", {}).get("gtin"): v
        for v in existing_enriched.values()
        if v.get("info", {}).get("gtin")
    }

    # 4. Fetch and Process Perfumes
    all_perfumes = []
    new_additions_count = 0
    updated_items_count = 0
    skipped_count = 0

    for brand in target_brands:
        items = client.fetch_brand_perfumes(brand, limit=limit_per_brand)
        print(f"[{brand}] Fetched {len(items)} in-stock items from Qogita")

        for item in items:
            name = item.get("name")
            raw_img = item.get("imageUrl")
            if not name or not raw_img:
                continue

            price = item.get("price") or 25.0
            if isinstance(price, dict):
                amount = float(price.get("amount") or 25.0)
                currency = price.get("currency") or "EUR"
            else:
                amount = float(price or 25.0)
                currency = "EUR"

            gtin = item.get("gtin")
            min_order = int(item.get("unit") or 1)
            name_clean = name.strip().lower()

            # Delta / incremental check
            existing_item = existing_by_gtin.get(gtin) or existing_by_name.get(name_clean)

            if existing_item:
                existing_info = existing_item.setdefault("info", {})
                old_raw_img = existing_info.get("rawImage") or existing_item.get("rawImage")
                generation = existing_info.get("imageGeneration") or {}
                if old_raw_img != raw_img or not generation.get("status"):
                    generation = {"status": "pending"}
                existing_info["imageGeneration"] = generation
                existing_item["gtin"] = gtin or existing_item.get("gtin")
                existing_item["rawImage"] = raw_img
                existing_info["gtin"] = gtin or existing_info.get("gtin", "")
                existing_info["minOrderQuantity"] = min_order
                existing_info["rawImage"] = raw_img
                existing_item["image"] = (
                    generation.get("imageUrl")
                    if generation.get("status") == "completed"
                    and generation.get("imageUrl")
                    else raw_img
                )

            if incremental and existing_item and not force:
                old_price = float(existing_item.get("price") or 0.0)
                price_changed = abs(old_price - amount) > 0.05
                if not price_changed:
                    skipped_count += 1
                    if existing_item.get("image"):
                        all_perfumes.append({
                            "name": existing_item["name"],
                            "brand": existing_item.get("brand") or brand,
                            "price": existing_item["price"],
                            "currency": currency,
                            "image": existing_item["image"],
                            "rawImage": raw_img,
                            "gtin": gtin,
                            "category": existing_info.get("category") or "Восточные",
                            "gender": existing_info.get("gender") or "Унисекс",
                            "notesSummary": existing_info.get("notesSummary") or f"{brand} · Элитная арабская парфюмерия",
                        })
                    continue

                if price_changed:
                    print(f"  → Price update: {name} ({old_price} -> {amount} EUR)")
                    existing_item["price"] = round(amount, 2)
                    updated_items_count += 1

                all_perfumes.append({
                    "name": existing_item["name"],
                    "brand": existing_item.get("brand") or brand,
                    "price": existing_item["price"],
                    "currency": currency,
                    "image": existing_item.get("image") or "/assets/img/perfumes/hero-perfume.png",
                    "rawImage": raw_img,
                    "gtin": gtin,
                    "category": existing_item.get("info", {}).get("category") or "Восточные",
                    "gender": existing_item.get("info", {}).get("gender") or "Унисекс",
                    "notesSummary": existing_item.get("info", {}).get("notesSummary") or f"{brand} · Элитная арабская парфюмерия",
                })
                continue

            rich = build_rich_bilingual_enrichment(name, brand)
            perfume_entry = {
                "name": name,
                "brand": brand,
                "price": round(amount, 2),
                "currency": currency,
                "image": raw_img,
                "rawImage": raw_img,
                "imageGeneration": {"status": "pending"},
                "gtin": gtin,
                "minOrderQuantity": min_order,
                "category": rich["category"],
                "categoryEn": rich["categoryEn"],
                "categorySlug": rich["categorySlug"],
                "gender": rich["gender"],
                "genderEn": rich["genderEn"],
                "notesSummary": rich["notesSummary"],
                "notesSummaryEn": rich["notesSummaryEn"],
                "descriptionRu": rich["descriptionRu"],
                "descriptionEn": rich["descriptionEn"],
            }
            all_perfumes.append(perfume_entry)

            key = f"dropship-{gtin or hashlib.md5(name.encode('utf-8')).hexdigest()[:12]}"
            if key not in existing_enriched:
                new_additions_count += 1
                existing_enriched[key] = {
                    "name": perfume_entry["name"],
                    "brand": perfume_entry["brand"],
                    "price": perfume_entry["price"],
                    "image": perfume_entry["image"],
                    "gtin": gtin,
                    "rawImage": raw_img,
                    "description": rich["descriptionRu"],
                    "info": {
                        "category": rich["category"],
                        "categoryEn": rich["categoryEn"],
                        "categorySlug": rich["categorySlug"],
                        "gender": rich["gender"],
                        "genderEn": rich["genderEn"],
                        "origin": "Ближний Восток",
                        "originEn": "Middle East",
                        "notes": rich["notes"],
                        "notesSummary": rich["notesSummary"],
                        "notesSummaryEn": rich["notesSummaryEn"],
                        "longevity": "10–14 часов",
                        "longevityEn": "10–14 hours",
                        "sillage": "Заметный, притягательный",
                        "sillageEn": "Noticeable, alluring sillage",
                        "volume": "100 мл EDP",
                        "gtin": gtin or "",
                        "minOrderQuantity": min_order,
                        "unit": min_order,
                        "rawImage": raw_img,
                        "imageGeneration": {"status": "pending"},
                        "description": rich["descriptionRu"],
                        "descriptionRu": rich["descriptionRu"],
                        "descriptionEn": rich["descriptionEn"],
                    }
                }
            else:
                existing_enriched[key]["image"] = perfume_entry["image"]
                existing_enriched[key]["price"] = perfume_entry["price"]
                existing_enriched[key]["gtin"] = gtin or existing_enriched[key].get("gtin")
                existing_enriched[key]["rawImage"] = raw_img
                existing_info = existing_enriched[key].setdefault("info", {})
                if existing_info.get("rawImage") != raw_img or not existing_info.get("imageGeneration"):
                    existing_info["imageGeneration"] = {"status": "pending"}
                existing_info["gtin"] = gtin or existing_info.get("gtin", "")
                existing_info["minOrderQuantity"] = min_order
                existing_info["unit"] = min_order
                existing_info["rawImage"] = raw_img
                existing_enriched[key]["image"] = (
                    existing_info["imageGeneration"].get("imageUrl")
                    if existing_info["imageGeneration"].get("status") == "completed"
                    and existing_info["imageGeneration"].get("imageUrl")
                    else raw_img
                )
                updated_items_count += 1

    print(f"\n--- Sync Summary ---")
    print(f"✓ New additions: {new_additions_count}")
    print(f"✓ Updated items: {updated_items_count}")
    print(f"✓ Skipped (unchanged): {skipped_count}")
    print("✓ Original product photos were not changed; generation is queued in Supabase.")

    # 5. Save local catalog
    if not save_enriched_stocks(existing_enriched):
        raise RuntimeError(f"Could not save Qogita catalog data to {ENRICHED_STOCKS_PATH}")
    print(f"✓ Updated {ENRICHED_STOCKS_PATH} ({len(existing_enriched)} total perfumes).")

    # 6. Sync to Supabase
    if all_perfumes:
        print(f"Synchronizing {len(all_perfumes)} perfumes to Supabase database...")
        synced_count = sync_to_supabase(all_perfumes)
        print(f"✓ Synced {synced_count} records to Supabase 'stocks' table.")

    print("\n🎉 Qogita Sync & Product Image Queue Update Complete!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Al-Warda Qogita catalog sync and background-generation queue")
    parser.add_argument("--limit", type=int, default=None, help="Max items per brand to fetch (omit for all)")
    parser.add_argument("--all", dest="all_products", action="store_true", help="Fetch maximum possible items across all brands")
    parser.add_argument("--cloud", action="store_true", help="Run in cloud CI mode")
    parser.add_argument("--force", action="store_true", help="Force a catalog update; product images are queued separately")
    parser.add_argument("--brands", type=str, default="", help="Specific comma-separated brands to sync (e.g. 'Lattafa,Armaf,Emper')")
    parser.add_argument("--incremental", action="store_true", help="Smart incremental sync (only fetch new or changed items)")
    args = parser.parse_args()

    # In full refresh mode without explicit limit or with --all, default to maximum items
    limit_val = None if (args.all_products or args.limit is None) else args.limit

    run_weekly_sync(
        limit_per_brand=limit_val,
        cloud_mode=args.cloud,
        force=args.force,
        brands_arg=args.brands,
        incremental=args.incremental,
        all_products=args.all_products
    )
