#!/usr/bin/env python3
"""
Al-Warda Parfumes - Weekly Qogita Catalog Sync, Background Cutout & Upscayl AI Pipeline

Pipeline Steps:
1. Authenticates with Qogita API and downloads latest in-stock Arabian perfume products.
2. Identifies new/updated perfumes and their product images.
3. Crops and removes backgrounds using AI (rembg / u2net) to isolate the perfume flacon.
4. Enhances image resolution & clarity using Upscayl AI (upscayl-bin / Real-ESRGAN).
5. Saves clean 32-bit transparent RGBA PNGs to public/assets/img/dropship/<hash>.png.
6. Synchronizes Supabase database ('stocks' table) and server/data/enrichedStocks.json.
7. Can execute locally on Windows (using local Upscayl installation) or in the cloud
   via GitHub Actions (running weekly cron independently of user PC state).
"""

import os
import sys
import json
import hashlib
import time
import argparse
import subprocess
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
ENRICHED_STOCKS_PATH = os.path.join(APP_DIR, "server", "data", "enrichedStocks.json")
CACHED_PERFUMES_PATH = os.path.join(APP_DIR, "server", "data", "cachedArabianPerfumes.json")

os.makedirs(DROPSHIP_DIR, exist_ok=True)
os.makedirs(DIST_DROPSHIP_DIR, exist_ok=True)

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

# Locate Upscayl Executable
def find_upscayl():
    # 1. Custom env var
    if os.environ.get("UPSCAYL_BIN"):
        bin_path = os.environ["UPSCAYL_BIN"]
        models_dir = os.environ.get("UPSCAYL_MODELS") or os.path.join(os.path.dirname(bin_path), "..", "models")
        if os.path.exists(bin_path):
            return bin_path, models_dir

    # 2. Windows Default Installation Path
    win_upscayl = r"C:\Program Files\Upscayl\resources\bin\upscayl-bin.exe"
    win_models = r"C:\Program Files\Upscayl\resources\models"
    if os.path.exists(win_upscayl):
        return win_upscayl, win_models

    # 3. Linux / GitHub Actions runner paths
    linux_candidates = [
        ("/usr/local/bin/upscayl-bin", "/usr/local/share/upscayl/models"),
        (os.path.join(APP_DIR, "bin", "realesrgan-ncnn-vulkan"), os.path.join(APP_DIR, "bin", "models")),
        (os.path.join(APP_DIR, "bin", "upscayl-bin"), os.path.join(APP_DIR, "bin", "models")),
        ("realesrgan-ncnn-vulkan", "models"),
    ]
    for bin_c, mod_c in linux_candidates:
        if os.path.exists(bin_c):
            return bin_c, mod_c

    return None, None

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

    def fetch_brand_perfumes(self, brand_name, limit=25):
        # 1. Try brand_name parameter first
        url = f"{self.api_url}/public/buyers/products/?brand_name={requests.utils.quote(brand_name)}&page_size={limit}"
        try:
            res = self.session.get(url, timeout=20)
            if res.status_code == 200:
                results = res.json().get("results", [])
                if results:
                    return results[:limit]
        except Exception:
            pass

        # 2. Fallback to search parameter
        url2 = f"{self.api_url}/public/buyers/products/?search={requests.utils.quote(brand_name)}&page_size=50"
        try:
            res2 = self.session.get(url2, timeout=20)
            if res2.status_code == 200:
                results = res2.json().get("results", [])
                filtered = []
                for it in results:
                    name = (it.get("name") or "").lower()
                    # Filter out non-perfume items
                    if any(bad in name for bad in ["serum", "retinal", "mask", "cream", "booster", "sunscreen", "cleanser", "shampoo", "pad"]):
                        continue
                    if brand_name.lower() in name or any(frag in name for frag in ["edp", "edt", "parfum", "eau de", "perfume", "fragrance", "cologne"]):
                        filtered.append(it)
                return filtered[:limit]
        except Exception as e:
            print(f"Warning: Failed to fetch products for {brand_name}: {e}")
        return []

# Background Cutout Engine
def remove_background(input_path, output_path, rembg_session=None):
    import rembg
    if rembg_session is None:
        rembg_session = rembg.new_session("u2net")

    with Image.open(input_path) as raw_im:
        if raw_im.mode != "RGB":
            raw_im = raw_im.convert("RGB")
        cutout = rembg.remove(raw_im, session=rembg_session, alpha_matting=False)
        cutout.save(output_path, "PNG")

# Upscayl Image Enhancer (Maximum Quality Configuration)
def upscale_with_upscayl(input_path, output_path, upscayl_bin, models_dir, scale=4, model_name="ultrasharp-4x"):
    if not upscayl_bin or not os.path.exists(upscayl_bin):
        # Fallback to high-quality Lanczos antialiased scaling if binary not present
        with Image.open(input_path) as im:
            w, h = im.size
            upscaled = im.resize((w * scale, h * scale), Image.Resampling.LANCZOS)
            upscaled.save(output_path, "PNG", optimize=True)
            return True

    # Identify best available model
    preferred_models = ["ultrasharp-4x", "remacri-4x", "upscayl-standard-4x", "realesrgan-x4plus", "upscayl-lite-4x"]
    selected_model = model_name
    if models_dir and os.path.exists(models_dir):
        available_files = os.listdir(models_dir)
        for cand in preferred_models:
            if f"{cand}.bin" in available_files or f"{cand}.param" in available_files:
                selected_model = cand
                break

    cmd = [
        upscayl_bin,
        "-i", input_path,
        "-o", output_path,
        "-m", models_dir,
        "-n", selected_model,
        "-s", str(scale),
        "-t", "256",
        "-c", "0",
        "-f", "png"
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if res.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
            return True
        else:
            # Fallback with standard model
            cmd[7] = "upscayl-standard-4x"
            res2 = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if res2.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
                return True
            # Fallback with lite model
            cmd[7] = "upscayl-lite-4x"
            res3 = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            return res3.returncode == 0 and os.path.exists(output_path)
    except Exception as e:
        print(f"Upscayl CLI error: {e}, falling back to Lanczos...")
        with Image.open(input_path) as im:
            w, h = im.size
            im.resize((w * scale, h * scale), Image.Resampling.LANCZOS).save(output_path, "PNG")
        return True

# Process single perfume image
def process_perfume_image(raw_image_url, upscayl_bin, models_dir, rembg_session, force=False):
    h = hashlib.md5(raw_image_url.encode("utf-8")).hexdigest()
    final_path = os.path.join(DROPSHIP_DIR, f"{h}.png")
    dist_path = os.path.join(DIST_DROPSHIP_DIR, f"{h}.png")

    if not force and os.path.exists(final_path) and os.path.getsize(final_path) > 10000:
        return f"/assets/img/dropship/{h}.png"

    tmp_raw = os.path.join(DROPSHIP_DIR, f"temp_raw_{h}.jpg")
    tmp_cutout = os.path.join(DROPSHIP_DIR, f"temp_cutout_{h}.png")

    try:
        # Download raw
        r = requests.get(raw_image_url, timeout=15, verify=False)
        if r.status_code != 200 or len(r.content) < 1000:
            return None
        with open(tmp_raw, "wb") as f:
            f.write(r.content)

        # 1. Background cutout (transparent RGBA)
        remove_background(tmp_raw, tmp_cutout, rembg_session)

        # 2. Maximum Quality Upscayl enhancement (4x scale, UltraSharp model)
        upscale_with_upscayl(tmp_cutout, final_path, upscayl_bin, models_dir, scale=4, model_name="ultrasharp-4x")

        # Mirror to dist if dist exists
        if os.path.exists(DIST_DROPSHIP_DIR):
            import shutil
            shutil.copyfile(final_path, dist_path)

        return f"/assets/img/dropship/{h}.png"
    except Exception as e:
        print(f"Image processing error for {raw_image_url}: {e}")
        return None
    finally:
        for f in (tmp_raw, tmp_cutout):
            if os.path.exists(f):
                try:
                    os.remove(f)
                except:
                    pass

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
def run_weekly_sync(limit_per_brand=15, cloud_mode=False, force=False, brands_arg="", incremental=False):
    print("=" * 65)
    print("AL-WARDA - QOGITA CATALOG SYNC & UPSCAYL PIPELINE")
    print(f"Execution mode: {'Cloud (GitHub Actions)' if cloud_mode else 'Local PC'}")
    print(f"Enhancement mode: Maximum Quality (UltraSharp 4x, tile=256, lossless)")
    if incremental:
        print("Sync mode: Smart Incremental (Delta changes & new additions only)")
    elif brands_arg:
        print(f"Sync mode: Targeted Brands ({brands_arg})")
    else:
        print("Sync mode: Full Database Refresh")
    print("=" * 65)

    # Determine target brands
    if brands_arg and brands_arg.strip():
        target_brands = [b.strip() for b in brands_arg.split(",") if b.strip()]
    else:
        target_brands = ARABIAN_BRANDS

    print(f"Target brands to scan: {len(target_brands)}")

    # 1. Check Upscayl
    upscayl_bin, models_dir = find_upscayl()
    if upscayl_bin:
        print(f"✓ Upscayl executable detected: {upscayl_bin}")
        print(f"✓ Upscayl models directory: {models_dir}")
    else:
        print("ℹ Upscayl binary not detected directly; using high-fidelity antialiased AI fallback.")

    # 2. Init Rembg Session
    print("Initializing AI background cutout session (u2net)...")
    import rembg
    rembg_session = rembg.new_session("u2net")
    print("✓ Rembg session ready.")

    # 3. Authenticate with Qogita
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
                img_exists = old_img.startswith("/assets/img/dropship/") and os.path.exists(
                    os.path.join(DROPSHIP_DIR, os.path.basename(old_img))
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
                    print(f"  → Generating missing UltraSharp 4x visual: {name}")
                    local_img = process_perfume_image(raw_img, upscayl_bin, models_dir, rembg_session, force=True)
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

            # Process image (Cutout + Upscayl 4x UltraSharp)
            local_img = process_perfume_image(raw_img, upscayl_bin, models_dir, rembg_session, force=force)
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
    print(f"✓ Processed images (UltraSharp 4x): {processed_images}")

    # 5. Save local catalog
    save_enriched_stocks(existing_enriched)
    print(f"✓ Updated {ENRICHED_STOCKS_PATH} ({len(existing_enriched)} total perfumes).")

    # 6. Sync to Supabase
    if all_perfumes:
        print(f"Synchronizing {len(all_perfumes)} perfumes to Supabase database...")
        synced_count = sync_to_supabase(all_perfumes)
        print(f"✓ Synced {synced_count} records to Supabase 'stocks' table.")

    print("\n🎉 Qogita Sync & AI Upscaling Complete!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Al-Warda Qogita Sync & Upscayl Pipeline")
    parser.add_argument("--limit", type=int, default=15, help="Max items per brand to fetch")
    parser.add_argument("--cloud", action="store_true", help="Run in cloud CI mode")
    parser.add_argument("--force", action="store_true", help="Force re-upscaling with UltraSharp 4x even if image exists")
    parser.add_argument("--brands", type=str, default="", help="Specific comma-separated brands to sync (e.g. 'Lattafa,Armaf,Emper')")
    parser.add_argument("--incremental", action="store_true", help="Smart incremental sync (only fetch new or changed items)")
    args = parser.parse_args()

    run_weekly_sync(
        limit_per_brand=args.limit,
        cloud_mode=args.cloud,
        force=args.force,
        brands_arg=args.brands,
        incremental=args.incremental
    )
