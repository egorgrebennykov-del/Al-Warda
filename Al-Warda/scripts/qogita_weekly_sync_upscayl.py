#!/usr/bin/env python3
"""
Al-Warda weekly Qogita catalog sync and branded perfume image renderer.

Pipeline Steps:
1. Authenticates with Qogita API and downloads latest in-stock Arabian perfume products.
2. Identifies new/updated perfumes and their product images.
3. Removes the photo background, isolates the bottle, and composites it into the studio scene.
4. Saves the rendered image to public/assets/img/products/<gtin>.jpg.
5. Synchronizes Supabase database ('stocks' table) and server/data/enrichedStocks.json.
6. Runs locally on Windows or weekly in GitHub Actions.
"""

import os
import sys
import json
import hashlib
import time
import argparse
import requests
import urllib3
from PIL import Image

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
DROPSHIP_DIR = os.path.join(APP_DIR, "public", "assets", "img", "dropship")
DIST_DROPSHIP_DIR = os.path.join(APP_DIR, "dist", "assets", "img", "dropship")
PRODUCTS_DIR = os.path.join(APP_DIR, "public", "assets", "img", "products")
DIST_PRODUCTS_DIR = os.path.join(APP_DIR, "dist", "assets", "img", "products")
ENRICHED_STOCKS_PATH = os.path.join(APP_DIR, "server", "data", "enrichedStocks.json")
CACHED_PERFUMES_PATH = os.path.join(APP_DIR, "server", "data", "cachedArabianPerfumes.json")

os.makedirs(DROPSHIP_DIR, exist_ok=True)
os.makedirs(DIST_DROPSHIP_DIR, exist_ok=True)
os.makedirs(PRODUCTS_DIR, exist_ok=True)
os.makedirs(DIST_PRODUCTS_DIR, exist_ok=True)

ROOT_SCRIPTS_DIR = os.path.join(os.path.dirname(APP_DIR), "scripts")
if ROOT_SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, ROOT_SCRIPTS_DIR)
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from process_qogita_luxury import process_product_image_from_url_or_file
from process_qogita_luxury import STUDIO_IMAGE_COMMENT

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
QOGITA_EMAIL = os.environ.get("QOGITA_EMAIL", "litera.eu@gmail.com")
QOGITA_PASSWORD = os.environ.get("QOGITA_PASSWORD", "Egorka2330$")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://mfvenfrmlkxqgvdtedet.supabase.co").rstrip("/")
SUPABASE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_SECRET_KEY")
    or os.environ.get("VITE_SUPABASE_ANON_KEY")
    or "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB"
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

def is_current_studio_image(image_path):
    try:
        with Image.open(image_path) as image:
            return image.format == "JPEG" and image.info.get("comment") == STUDIO_IMAGE_COMMENT
    except (OSError, ValueError):
        return False


def process_perfume_image(raw_image_url, force=False, gtin=None):
    import shutil
    if gtin:
        safe_gtin = "".join(ch for ch in str(gtin) if ch.isalnum() or ch in ("-", "_"))
        filename = f"{safe_gtin}.jpg"
        output_dir = PRODUCTS_DIR
        dist_dir = DIST_PRODUCTS_DIR
        image_path = f"/assets/img/products/{filename}"
    else:
        image_hash = hashlib.md5(raw_image_url.encode("utf-8")).hexdigest()
        filename = f"{image_hash}.jpg"
        output_dir = DROPSHIP_DIR
        dist_dir = DIST_DROPSHIP_DIR
        image_path = f"/assets/img/dropship/{filename}"

    final_path = os.path.join(output_dir, filename)
    if (
        not force
        and os.path.exists(final_path)
        and os.path.getsize(final_path) > 10000
        and is_current_studio_image(final_path)
    ):
        return image_path

    try:
        process_product_image_from_url_or_file(raw_image_url, final_path)

        if os.path.exists(dist_dir):
            shutil.copyfile(final_path, os.path.join(dist_dir, filename))

        return image_path
    except Exception as e:
        print(f"Qogita studio image processing error for {gtin or raw_image_url}: {e}")
        return None

# Sync Supabase
def sync_to_supabase(perfumes_list):
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Skipping Supabase sync (no credentials)")
        return 0

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    url = f"{SUPABASE_URL}/rest/v1/stocks"

    synced = 0
    batch = []
    for p in perfumes_list:
        slug = f"dropship-{p.get('gtin') or hashlib.md5(p['name'].encode('utf-8')).hexdigest()[:12]}"
        record = {
            "slug": slug,
            "name": p["name"],
            "title": p["name"],
            "brand": p.get("brand") or "Al-Warda",
            "category": p.get("category") or "Восточные",
            "price": float(p.get("price") or 25.0),
            "currency": p.get("currency") or "EUR",
            "image": p.get("image") or "/assets/img/perfumes/hero-perfume.png",
            "in_stock": True,
            "info": {
                "category": p.get("category") or "Восточные",
                "gender": p.get("gender") or "Унисекс",
                "notesSummary": p.get("notesSummary") or "Уд · Амбра · Ваниль",
                "longevity": "10–14 часов",
                "sillage": "Заметный, притягательный",
                "volume": "100 мл EDP",
                "concentration": "Eau de Parfum",
                "descriptionRu": f"{p['name']} — премиальный оригинальный арабский парфюм со стойким шлейфом.",
            }
        }
        batch.append(record)
        if len(batch) >= 20:
            try:
                res = requests.post(url, json=batch, headers=headers, timeout=20, verify=False)
                if res.status_code in (200, 201, 204):
                    synced += len(batch)
            except Exception as e:
                print(f"Supabase batch error: {e}")
            batch = []

    if batch:
        try:
            res = requests.post(url, json=batch, headers=headers, timeout=20, verify=False)
            if res.status_code in (200, 201, 204):
                synced += len(batch)
        except Exception as e:
            print(f"Supabase final batch error: {e}")

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
    print("AL-WARDA - QOGITA CATALOG SYNC & STUDIO IMAGE PIPELINE")
    print(f"Execution mode: {'Cloud (GitHub Actions)' if cloud_mode else 'Local PC'}")
    print("Image mode: isolated Qogita bottle with golden studio lighting and reflection")
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
        return

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
    processed_images = 0
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
            name_clean = name.strip().lower()

            # Delta / incremental check
            existing_item = existing_by_gtin.get(gtin) or existing_by_name.get(name_clean)

            if incremental and existing_item and not force:
                old_price = float(existing_item.get("price") or 0.0)
                old_img = existing_item.get("image") or ""
                img_dir = None
                if old_img.startswith("/assets/img/products/"):
                    img_dir = PRODUCTS_DIR
                elif old_img.startswith("/assets/img/dropship/"):
                    img_dir = DROPSHIP_DIR
                img_exists = (
                    img_dir is not None
                    and old_img.lower().endswith(".jpg")
                    and os.path.isfile(os.path.join(img_dir, os.path.basename(old_img)))
                    and is_current_studio_image(os.path.join(img_dir, os.path.basename(old_img)))
                )

                # Check if price changed
                price_changed = abs(old_price - amount) > 0.05
                if not price_changed and img_exists:
                    skipped_count += 1
                    continue

                if price_changed:
                    print(f"  → Price update: {name} ({old_price} -> {amount} EUR)")
                    existing_item["price"] = round(amount, 2)
                    updated_items_count += 1

                if not img_exists:
                    print(f"  → Rendering Qogita bottle in studio scene: {name}")
                    local_img = process_perfume_image(raw_img, force=True, gtin=gtin)
                    if local_img:
                        existing_item["image"] = local_img
                        processed_images += 1
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

            # Isolate the Qogita bottle and compose the branded studio scene.
            local_img = process_perfume_image(raw_img, force=force, gtin=gtin)
            if local_img:
                processed_images += 1

            perfume_entry = {
                "name": name,
                "brand": brand,
                "price": round(amount, 2),
                "currency": currency,
                "image": local_img or "/assets/img/perfumes/hero-perfume.png",
                "rawImage": raw_img,
                "gtin": gtin,
                "category": "Восточные",
                "gender": "Унисекс",
                "notesSummary": f"{brand} · Премиальный арабский парфюм",
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
                    "info": {
                        "category": perfume_entry["category"],
                        "gender": perfume_entry["gender"],
                        "notesSummary": perfume_entry["notesSummary"],
                        "longevity": "10–14 часов",
                        "sillage": "Заметный, притягательный",
                        "volume": "100 мл EDP",
                        "descriptionRu": f"{name} — премиальный оригинальный арабский парфюм со стойким шлейфом.",
                    }
                }
            else:
                existing_enriched[key]["image"] = perfume_entry["image"]
                existing_enriched[key]["price"] = perfume_entry["price"]
                updated_items_count += 1

    print(f"\n--- Sync Summary ---")
    print(f"✓ New additions: {new_additions_count}")
    print(f"✓ Updated items: {updated_items_count}")
    print(f"✓ Skipped (unchanged): {skipped_count}")
    print(f"✓ Rendered Qogita studio images: {processed_images}")

    # 5. Save local catalog
    save_enriched_stocks(existing_enriched)
    print(f"✓ Updated {ENRICHED_STOCKS_PATH} ({len(existing_enriched)} total perfumes).")

    # 6. Sync to Supabase
    if all_perfumes:
        print(f"Synchronizing {len(all_perfumes)} perfumes to Supabase database...")
        synced_count = sync_to_supabase(all_perfumes)
        print(f"✓ Synced {synced_count} records to Supabase 'stocks' table.")

    print("\n🎉 Qogita Sync & Studio Image Rendering Complete!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Al-Warda Qogita Sync & Studio Image Pipeline")
    parser.add_argument("--limit", type=int, default=None, help="Max items per brand to fetch (omit for all)")
    parser.add_argument("--all", dest="all_products", action="store_true", help="Fetch maximum possible items across all brands")
    parser.add_argument("--cloud", action="store_true", help="Run in cloud CI mode")
    parser.add_argument("--force", action="store_true", help="Force rerendering Qogita product images")
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
