import os
import sys
import json
import hashlib
import io
import requests
import urllib3
import numpy as np
from PIL import Image
from scipy.ndimage import label, binary_dilation
import rembg

urllib3.disable_warnings()

app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
public_dir = os.path.join(app_dir, "public", "assets", "img", "dropship")
dist_dir = os.path.join(app_dir, "dist", "assets", "img", "dropship")
os.makedirs(public_dir, exist_ok=True)
os.makedirs(dist_dir, exist_ok=True)

def get_hash(url):
    return hashlib.md5(url.encode("utf-8")).hexdigest()

def dynamic_clean_perfume(raw_img, session):
    """
    Dynamic perfume cleaner:
    1. u2net salient object segmentation
    2. Multi-object box removal: isolates perfume flacon from packaging cardboard boxes
    3. Interior enclosed hole punching: punches transparent holes for handles, rings, thermos loops
    4. Tabletop reflection drip trimmer: removes table reflection drops without cutting into bottle glass bases
    5. Clean padding: adds breathing margin so bottle floats naturally without frame clipping
    """
    if raw_img.mode != "RGB":
        raw_img = raw_img.convert("RGB")
    raw_arr = np.array(raw_img)

    # 1. AI Cutout with u2net
    cutout = rembg.remove(raw_img, session=session, alpha_matting=False)
    arr = np.array(cutout)
    alpha = arr[:, :, 3]

    # 2. Multi-Object Disjoint Separation (Packaging Box next to Bottle)
    fg_mask = alpha > 30
    labeled, num_features = label(fg_mask)
    if num_features > 1:
        comps = []
        for i in range(1, num_features + 1):
            m = (labeled == i)
            area = m.sum()
            if area > 5000:
                ys, xs = np.where(m)
                w = xs.max() - xs.min() + 1
                h = ys.max() - ys.min() + 1
                solidity = area / (w * h)
                top_rows = ys < ys.min() + 0.15 * h
                mid_rows = (ys >= ys.min() + 0.35 * h) & (ys <= ys.min() + 0.65 * h)
                top_w = xs[top_rows].max() - xs[top_rows].min() + 1 if np.any(top_rows) else 0
                mid_w = xs[mid_rows].max() - xs[mid_rows].min() + 1 if np.any(mid_rows) else 0
                taper = top_w / mid_w if mid_w > 0 else 1.0
                is_box = (solidity > 0.94 and taper > 0.94)
                comps.append({
                    "id": i, "mask": m, "area": area, "w": w, "h": h,
                    "solidity": solidity, "taper": taper, "is_box": is_box
                })

        has_box = any(c["is_box"] for c in comps)
        has_bottle = any(not c["is_box"] for c in comps)
        if has_box and has_bottle:
            bottle_comps = [c for c in comps if not c["is_box"]]
            main_bottle = max(bottle_comps, key=lambda c: c["area"])
            # Keep only the bottle flacon component (and slight boundary dilation)
            bottle_keep = binary_dilation(main_bottle["mask"], iterations=3)
            alpha[~bottle_keep] = 0

    # 3. Dynamic Interior Hole Punching (Handles, Rings, Thermos Loops)
    corners = np.vstack([
        raw_arr[:5, :5].reshape(-1, 3),
        raw_arr[:5, -5:].reshape(-1, 3),
        raw_arr[-5:, :5].reshape(-1, 3),
        raw_arr[-5:, -5:].reshape(-1, 3)
    ])
    bg_mean = np.mean(corners, axis=0)

    diff_from_bg = np.max(np.abs(raw_arr - bg_mean), axis=2)
    is_exact_bg = (diff_from_bg <= 6) & (alpha > 40)

    labeled_holes, num_holes = label(is_exact_bg)
    for i in range(1, num_holes + 1):
        m = (labeled_holes == i)
        area = m.sum()
        if area < 50:
            continue
        ys, xs = np.where(m)
        h = ys.max() - ys.min() + 1
        w = xs.max() - xs.min() + 1
        if h < 8 or w < 8:
            continue
        # Strictly interior holes away from image frame boundary
        if ys.min() <= 2 or ys.max() >= raw_arr.shape[0] - 3 or xs.min() <= 2 or xs.max() >= raw_arr.shape[1] - 3:
            continue
        pixels = raw_arr[m]
        p_std = np.std(pixels, axis=0).max()
        p_diff = np.abs(np.mean(pixels, axis=0) - bg_mean).max()
        # Hole is virtually identical to studio background with zero texture
        if p_std < 2.5 and p_diff < 4.0:
            alpha[m] = 0

    # 4. Tabletop Reflection Cleanup (only trim sudden drops where span collapses > 40% at bottom)
    nz_rows = np.where(np.any(alpha > 25, axis=1))[0]
    if len(nz_rows) > 0:
        bot_y = nz_rows[-1]
        top_y = nz_rows[0]
        total_h = bot_y - top_y + 1
        search_start = max(top_y, int(bot_y - total_h * 0.14))
        cut_y = bot_y
        for y in range(search_start, bot_y):
            cols_curr = np.where(alpha[y] > 25)[0]
            cols_next = np.where(alpha[y + 1] > 25)[0]
            span_curr = cols_curr[-1] - cols_curr[0] + 1 if len(cols_curr) > 0 else 0
            span_next = cols_next[-1] - cols_next[0] + 1 if len(cols_next) > 0 else 0
            # Sudden collapse: span drops by > 45% between consecutive rows
            if span_curr > 50 and span_next > 0 and span_next < span_curr * 0.55:
                cut_y = y
                break
        if cut_y < bot_y:
            alpha[cut_y + 1:, :] = 0

    arr[:, :, 3] = alpha
    cleaned = Image.fromarray(arr)
    bbox = cleaned.getbbox()
    if not bbox:
        return cleaned

    cropped = cleaned.crop(bbox)
    pad = 12
    canvas = Image.new("RGBA", (cropped.width + pad * 2, cropped.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(cropped, (pad, pad))
    return canvas

def process_single(url, session):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    r = requests.get(url, headers=headers, verify=False, timeout=25)
    r.raise_for_status()
    raw = Image.open(io.BytesIO(r.content)).convert("RGB")
    final = dynamic_clean_perfume(raw, session)
    return final

def main():
    session = rembg.new_session("u2net")

    if len(sys.argv) > 2 and sys.argv[1] == "--single":
        url = sys.argv[2]
        h = get_hash(url)
        out_path = os.path.join(public_dir, f"{h}.png")
        dist_path = os.path.join(dist_dir, f"{h}.png")
        img = process_single(url, session)
        img.save(out_path, format="PNG", optimize=True)
        img.save(dist_path, format="PNG", optimize=True)
        print(out_path)
        return

    json_path = os.path.join(app_dir, "server", "data", "cachedArabianPerfumes.json")
    if not os.path.exists(json_path):
        print("Catalog JSON not found at", json_path)
        return

    with open(json_path, "r", encoding="utf-8") as f:
        items = json.load(f)

    total = len(items)
    print(f"Starting dynamic clean rendering for {total} perfumes...")

    processed = 0
    errors = 0

    for idx, item in enumerate(items):
        url = item.get("rawImage") or item.get("image")
        if not url or not url.startswith("http"):
            continue

        h = get_hash(url)
        target_pub = os.path.join(public_dir, f"{h}.png")
        target_dist = os.path.join(dist_dir, f"{h}.png")

        try:
            img = process_single(url, session)
            img.save(target_pub, format="PNG", optimize=True)
            img.save(target_dist, format="PNG", optimize=True)
            processed += 1
            if processed % 15 == 0:
                print(f"[{processed}/{total}] Rendered: {item.get('name', 'Perfume')}")
        except Exception as e:
            errors += 1
            print(f"Error on {item.get('name')}: {e}")

    print(f"DONE! Successfully rendered {processed} perfumes. Errors: {errors}")

if __name__ == "__main__":
    main()
