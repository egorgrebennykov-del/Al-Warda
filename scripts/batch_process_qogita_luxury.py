import os
import sys
import json
import time
from process_qogita_luxury import process_product_image_from_url_or_file

def run_batch(limit=25):
    json_path = os.path.abspath("Al-Warda/server/data/enrichedStocks.json")
    out_dir = os.path.abspath("Al-Warda/public/assets/img/products")
    os.makedirs(out_dir, exist_ok=True)

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    items = list(data.values()) if isinstance(data, dict) else data
    real_items = []
    for it in items:
        info = it.get("info") or {}
        raw = info.get("rawImage") or it.get("rawImage")
        gtin = info.get("gtin") or it.get("gtin")
        if raw and "c1b79cffa1a5fa8aab226414b9e4a063" not in raw and gtin:
            real_items.append((gtin, raw, it.get("name", "Perfume")))

    print(f"Found {len(real_items)} genuine Qogita product photos. Processing top {limit}...")

    count = 0
    for gtin, raw_url, name in real_items:
        if count >= limit:
            break
        dest_path = os.path.join(out_dir, f"{gtin}.jpg")
        try:
            print(f"[{count+1}/{limit}] Processing '{name}' (GTIN: {gtin})...")
            process_product_image_from_url_or_file(raw_url, dest_path)
            count += 1
            time.sleep(0.1)
        except Exception as e:
            print(f"  Error on {gtin}: {e}")

    print(f"Batch completed! Processed {count} luxury perfume images.")

if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else 15
    run_batch(lim)
