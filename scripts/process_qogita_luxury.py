import os
import sys
import argparse
import requests
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from rembg import remove, new_session

_session = None

def get_session():
    global _session
    if _session is None:
        _session = new_session('u2net')
    return _session

def process_product_image_from_url_or_file(source, output_jpg_path):
    os.makedirs(os.path.dirname(os.path.abspath(output_jpg_path)), exist_ok=True)
    
    # 1. Load image (from URL or local file)
    if source.startswith("http://") or source.startswith("https://"):
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        res = requests.get(source, headers=headers, timeout=20, verify=False)
        if res.status_code != 200 or len(res.content) < 1000:
            raise ValueError(f"Failed to fetch image from {source}, status: {res.status_code}")
        import io
        orig = Image.open(io.BytesIO(res.content)).convert("RGBA")
    else:
        orig = Image.open(source).convert("RGBA")

    # 2. Cutout background using rembg u2net neural network
    cutout = remove(orig, session=get_session())

    # 3. Enhance clarity and contrast slightly
    r, g, b, a = cutout.split()
    rgb = Image.merge("RGB", (r, g, b))
    
    sharp_enhancer = ImageEnhance.Sharpness(rgb)
    enhanced_rgb = sharp_enhancer.enhance(1.25)
    
    contrast_enhancer = ImageEnhance.Contrast(enhanced_rgb)
    enhanced_rgb = contrast_enhancer.enhance(1.08)
    
    er, eg, eb = enhanced_rgb.split()
    enhanced_cutout = Image.merge("RGBA", (er, eg, eb, a))

    # 4. Composite onto Dark Luxury Studio Background (#080605 with warm amber glow)
    canvas_w, canvas_h = 1000, 1000
    studio_bg = Image.new("RGBA", (canvas_w, canvas_h), (8, 6, 5, 255))

    # Center-back golden amber radial glow
    glow_arr = np.zeros((canvas_h, canvas_w, 4), dtype=np.uint8)
    center_x, center_y = canvas_w // 2, int(canvas_h * 0.48)
    y, x = np.ogrid[:canvas_h, :canvas_w]
    dist_sq = ((x - center_x) / 1.0) ** 2 + ((y - center_y) / 1.3) ** 2
    max_radius = 420.0
    intensity = np.clip(1.0 - np.sqrt(dist_sq) / max_radius, 0.0, 1.0) ** 1.8

    glow_arr[:, :, 0] = (intensity * 185).astype(np.uint8)  # R
    glow_arr[:, :, 1] = (intensity * 125).astype(np.uint8)  # G
    glow_arr[:, :, 2] = (intensity * 38).astype(np.uint8)   # B
    glow_arr[:, :, 3] = (intensity * 185).astype(np.uint8)  # Alpha
    glow_img = Image.fromarray(glow_arr, "RGBA").filter(ImageFilter.GaussianBlur(radius=30))
    studio_bg.paste(glow_img, (0, 0), glow_img)

    # Floor ambient glow
    floor_arr = np.zeros((canvas_h, canvas_w, 4), dtype=np.uint8)
    floor_dist = ((x - center_x) / 1.6) ** 2 + ((y - int(canvas_h * 0.85)) / 0.4) ** 2
    floor_int = np.clip(1.0 - np.sqrt(floor_dist) / 300.0, 0.0, 1.0) ** 2.0
    floor_arr[:, :, 0] = (floor_int * 190).astype(np.uint8)
    floor_arr[:, :, 1] = (floor_int * 130).astype(np.uint8)
    floor_arr[:, :, 2] = (floor_int * 40).astype(np.uint8)
    floor_arr[:, :, 3] = (floor_int * 160).astype(np.uint8)
    floor_img = Image.fromarray(floor_arr, "RGBA").filter(ImageFilter.GaussianBlur(radius=25))
    studio_bg.paste(floor_img, (0, 0), floor_img)

    # Fit product cleanly inside the 1000x1000 canvas
    target_h = int(canvas_h * 0.74)
    aspect = enhanced_cutout.width / enhanced_cutout.height
    new_w = int(target_h * aspect)
    if new_w > int(canvas_w * 0.85):
        new_w = int(canvas_w * 0.85)
        target_h = int(new_w / aspect)

    resized_prod = enhanced_cutout.resize((new_w, target_h), Image.Resampling.LANCZOS)
    px = (canvas_w - new_w) // 2
    py = int(canvas_h * 0.15)

    # Soft ambient contact shadow
    s_arr = np.zeros((50, new_w, 4), dtype=np.uint8)
    sy, sx = np.ogrid[:50, :new_w]
    s_dist = ((sx - new_w // 2) / (new_w * 0.45)) ** 2 + ((sy - 25) / 15.0) ** 2
    s_int = np.clip(1.0 - np.sqrt(s_dist), 0.0, 1.0) ** 2
    s_arr[:, :, 3] = (s_int * 200).astype(np.uint8)
    shadow = Image.fromarray(s_arr, "RGBA").filter(ImageFilter.GaussianBlur(radius=8))
    studio_bg.paste(shadow, (px, py + target_h - 25), shadow)

    # Composite product
    studio_bg.paste(resized_prod, (px, py), resized_prod)

    # Save
    final_rgb = studio_bg.convert("RGB")
    final_rgb.save(output_jpg_path, "JPEG", quality=95, optimize=True)
    print(f"SUCCESS: Saved {output_jpg_path}")
    return output_jpg_path

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="URL or local path to raw image")
    parser.add_argument("--output", required=True, help="Path to output JPG")
    args = parser.parse_args()

    process_product_image_from_url_or_file(args.source, args.output)
