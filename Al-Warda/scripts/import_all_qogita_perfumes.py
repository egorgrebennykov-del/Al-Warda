import os
import sys
import json
import hashlib
import time
import requests
import urllib3

urllib3.disable_warnings()

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENRICHED_STOCKS_PATH = os.path.join(APP_DIR, "server", "data", "enrichedStocks.json")
sys.path.insert(0, APP_DIR)
from scripts.qogita_weekly_sync_upscayl import (
    QogitaSyncClient,
    ARABIAN_BRANDS,
    sync_to_supabase,
    save_enriched_stocks,
    build_rich_bilingual_enrichment,
    extract_qogita_price_for_mov,
)

def extract_volume(name):
    # Strict parser: returns "" if the Qogita title has no size (never a fake 100 ml).
    from volume_parser import parse_volume
    return parse_volume(name)


print("=" * 65)
print("AL-WARDA - FULL CATALOG IMPORT FROM QOGITA FOR ALL BRANDS")
print("=" * 65)

client = QogitaSyncClient()
client.login()
print(f"✓ Authenticated with Qogita ({client.email})")

# Load existing catalog
if os.path.exists(ENRICHED_STOCKS_PATH):
    with open(ENRICHED_STOCKS_PATH, "r", encoding="utf-8") as f:
        enriched = json.load(f)
else:
    enriched = {}

print(f"Current catalog size: {len(enriched)} perfumes")

all_synced_perfumes = []
new_count = 0
updated_count = 0

for brand in ARABIAN_BRANDS:
    page = 1
    brand_items = []
    
    while page <= 5: # Up to 500 items per brand
        url = f"{client.api_url}/public/buyers/products/?brand_name={requests.utils.quote(brand)}&page={page}&page_size=100"
        try:
            res = client.session.get(url, timeout=20)
            if res.status_code != 200:
                break
            results = res.json().get("results", [])
            if not results:
                break
            brand_items.extend(results)
            if len(results) < 100:
                break
            page += 1
        except Exception as e:
            print(f"Error fetching page {page} for {brand}: {e}")
            break

    # If brand_name returned nothing, try search fallback
    if not brand_items:
        url2 = f"{client.api_url}/public/buyers/products/?search={requests.utils.quote(brand)}&page_size=100"
        try:
            res2 = client.session.get(url2, timeout=20)
            if res2.status_code == 200:
                for it in res2.json().get("results", []):
                    nm = (it.get("name") or "").lower()
                    if brand.lower() in nm and not any(bad in nm for bad in ["serum", "mask", "cream", "pad", "sunscreen", "cleanser", "shampoo"]):
                        brand_items.append(it)
        except Exception as e:
            pass

    print(f"[{brand}] Retrieved {len(brand_items)} in-stock items")

    for item in brand_items:
        name = item.get("name")
        raw_img = item.get("imageUrl")
        if not name:
            continue

        amount, currency = extract_qogita_price_for_mov(item, target_mov=500.0, client=client)

        gtin = item.get("gtin")
        h = hashlib.md5((raw_img or name).encode("utf-8")).hexdigest()
        img_url = raw_img or "/assets/img/perfumes/hero-perfume.png"

        key = f"dropship-{gtin or h[:12]}"

        # Category and notes detection
        nm_lower = name.lower()
        if any(w in nm_lower for w in ["fresh", "aqua", "marine", "ice", "cool", "blue", "bleu"]):
            cat = "Свежие"
        elif any(w in nm_lower for w in ["floral", "rose", "jasmine", "blossom", "flower"]):
            cat = "Цветочные"
        elif any(w in nm_lower for w in ["vanilla", "sweet", "caramel", "candy", "sugar", "tonka"]):
            cat = "Гурманские"
        elif any(w in nm_lower for w in ["oud", "wood", "cedar", "sandal", "leather"]):
            cat = "Древесные"
        elif any(w in nm_lower for w in ["spice", "pepper", "saffron", "amber", "ambery"]):
            cat = "Пряные"
        else:
            cat = "Восточные"

        gender = "Женский" if any(w in nm_lower for w in ["femme", "woman", "women", "her", "mademoiselle"]) else (
            "Мужской" if any(w in nm_lower for w in ["homme", "man", "men", "him"]) else "Унисекс"
        )

        rich = build_rich_bilingual_enrichment(name, brand)
        perfume_entry = {
            "name": name,
            "brand": brand,
            "price": round(amount, 2),
            "currency": currency,
            "image": img_url,
            "rawImage": raw_img,
            "gtin": gtin,
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
        all_synced_perfumes.append(perfume_entry)

        if key not in enriched:
            new_count += 1
            enriched[key] = {
                "name": name,
                "brand": brand,
                "price": round(amount, 2),
                "image": img_url,
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
                    "sillage": "Заметный, шлейфовый",
                    "sillageEn": "Noticeable, alluring sillage",
                    "volume": extract_volume(p.get("name") or p.get("title") or ""),
                    "description": rich["descriptionRu"],
                    "descriptionRu": rich["descriptionRu"],
                    "descriptionEn": rich["descriptionEn"],
                    "rawImage": raw_img,
                    "gtin": gtin,
                    "imageGeneration": {"status": "pending"},
                }
            }
        else:
            info = enriched[key].setdefault("info", {})
            if info.get("rawImage") != raw_img or not info.get("imageGeneration"):
                info["imageGeneration"] = {"status": "pending"}
            info["rawImage"] = raw_img
            info["gtin"] = gtin or info.get("gtin")
            enriched[key]["image"] = (
                info["imageGeneration"].get("imageUrl")
                if info["imageGeneration"].get("status") == "completed"
                else img_url
            )
            enriched[key]["price"] = round(amount, 2)
            updated_count += 1

print(f"\nTotal products fetched from Qogita: {len(all_synced_perfumes)}")
print(f"New catalog additions: {new_count}")
print(f"Updated existing items: {updated_count}")

# Save full catalog to enrichedStocks.json
save_enriched_stocks(enriched)
print(f"✓ Saved {len(enriched)} items to {ENRICHED_STOCKS_PATH}")

# Sync all to Supabase in batches
print(f"\nSynchronizing all {len(all_synced_perfumes)} perfumes to Supabase...")
synced_total = sync_to_supabase(all_synced_perfumes)

print(f"✓ Synced {synced_total} items to Supabase 'stocks' table!")
print("\n🎉 Full catalog import completed successfully!")
