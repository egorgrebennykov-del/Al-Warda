"""
Al-Warda luxury product scene compositor.

Takes the original Qogita product photo, isolates the flacon (pixels are NOT
redrawn by any generative model) and places it into the dark amber studio
scene of the Al-Warda template: warm backlight, glossy floor with reflection,
soft rim light. Only lighting and image quality are changed.

CLI:  python process_qogita_luxury.py --source <url|file> --output out.jpg
"""
import argparse
import io
import os

import cv2
import numpy as np
import requests
import urllib3
from PIL import Image, ImageFilter
from rembg import new_session, remove

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

CANVAS = 1024
FLOOR_Y = 880          # baseline where the flacon stands (matches template)
TARGET_H = 0.64        # flacon height relative to canvas
MAX_W = 0.46           # flacon max width relative to canvas

_session = None


def get_session():
    global _session
    if _session is None:
        _session = new_session("u2net")
    return _session


def load_source(source):
    if source.startswith(("http://", "https://")):
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        res = requests.get(source, headers=headers, timeout=25, verify=False)
        if res.status_code != 200 or len(res.content) < 1000:
            raise ValueError(f"Failed to fetch {source}: {res.status_code}")
        return Image.open(io.BytesIO(res.content)).convert("RGB")
    return Image.open(source).convert("RGB")


def isolate_flacon(cutout):
    """Keep only the bottle when the photo also shows the retail box."""
    arr = np.array(cutout)
    alpha = arr[:, :, 3]
    mask = (alpha > 100).astype(np.uint8)
    # close tiny gaps so a detached cap stays with its bottle
    k = max(3, int(max(mask.shape) * 0.012))
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(closed, connectivity=8)
    comps = []
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        h = int(stats[i, cv2.CC_STAT_HEIGHT])
        comp = labels == i
        # row-width variation: boxes keep a constant width, bottles have a neck/cap
        widths = comp.sum(axis=1)
        widths = widths[widths > 0].astype(np.float32)
        cv = float(widths.std() / (widths.mean() + 1e-6))
        comps.append(dict(i=i, area=area, w=w, h=h, solidity=area / float(w * h), cv=cv))
    if not comps:
        raise ValueError("Nothing detected in the photo")
    biggest = max(c["area"] for c in comps)
    comps = [c for c in comps if c["area"] >= 0.03 * biggest]

    if len(comps) == 1:
        keep = comps[0]
    else:
        # Box + bottle: the retail box is the most "rectangular" object
        # (high solidity, constant row width). Keep the least box-like one.
        for c in comps:
            c["boxness"] = c["solidity"] + (0.35 - min(c["cv"], 0.35)) * 0.6
        comps.sort(key=lambda c: c["boxness"])
        keep = comps[0]
        if abs(comps[0]["boxness"] - comps[-1]["boxness"]) < 0.04:
            keep = min(comps, key=lambda c: c["area"])
    keep_mask = labels == keep["i"]
    keep_mask = keep_mask & (alpha > 0)

    out = arr.copy()
    out[~keep_mask, 3] = 0
    ys, xs = np.where(out[:, :, 3] > 0)
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return Image.fromarray(out, "RGBA")


def clean_edges(rgba):
    """Remove white fringe left from the light photo background."""
    arr = np.array(rgba).astype(np.float32)
    a = arr[:, :, 3]
    a_bin = (a > 110).astype(np.uint8) * 255
    a_er = cv2.erode(a_bin, np.ones((3, 3), np.uint8), iterations=1)
    a_er = cv2.GaussianBlur(a_er, (0, 0), 0.9)
    arr[:, :, 3] = a_er
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def enhance_quality(rgba, target_h):
    """Upscale + mild denoise + local contrast + sharpening (no redrawing)."""
    scale = max(1.0, (target_h * 1.15) / rgba.height)
    if scale > 1.0:
        rgba = rgba.resize((int(rgba.width * scale), int(rgba.height * scale)), Image.Resampling.LANCZOS)
    arr = np.array(rgba)
    rgb = cv2.cvtColor(arr[:, :, :3], cv2.COLOR_RGB2BGR)
    rgb = cv2.fastNlMeansDenoisingColored(rgb, None, 3, 3, 5, 15)
    lab = cv2.cvtColor(rgb, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(4, 4)).apply(l)
    rgb = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2RGB)
    out = Image.fromarray(np.dstack([rgb, arr[:, :, 3]]), "RGBA")
    rgb_img = out.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.4, percent=70, threshold=2))
    out = Image.merge("RGBA", (*rgb_img.split(), out.split()[3]))
    return out


def build_scene(rng):
    H = W = CANVAS
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    # vertical base gradient (near-black warm)
    base = np.zeros((H, W, 3), np.float32)
    t = y / H
    base[..., 0] = 16 - 8 * t
    base[..., 1] = 11 - 6 * t
    base[..., 2] = 6 - 3 * t
    # warm amber backlight behind the flacon
    d = np.sqrt(((x - W / 2) / 430) ** 2 + ((y - H * 0.50) / 470) ** 2)
    glow = np.clip(1 - d, 0, 1) ** 2.0
    base[..., 0] += glow * 88
    base[..., 1] += glow * 52
    base[..., 2] += glow * 9
    # glossy floor: slightly lighter, amber streak on the horizon line
    floor = (y > FLOOR_Y).astype(np.float32)
    base *= (1 - 0.35 * floor)[..., None]
    streak = np.exp(-(((y - (FLOOR_Y + 6)) / 16) ** 2)) * np.exp(-(((x - W / 2) / 330) ** 2))
    base[..., 0] += streak * 190
    base[..., 1] += streak * 120
    base[..., 2] += streak * 28
    pool = np.clip(1 - np.sqrt(((x - W / 2) / 420) ** 2 + ((y - (FLOOR_Y + 40)) / 70) ** 2), 0, 1) ** 2 * floor
    base[..., 0] += pool * 55
    base[..., 1] += pool * 32
    base[..., 2] += pool * 6
    # vignette
    v = np.clip(1 - 0.55 * (np.sqrt(((x - W / 2) / (W * 0.75)) ** 2 + ((y - H / 2) / (H * 0.75)) ** 2)) ** 2, 0.25, 1)
    base *= v[..., None]
    base += rng.normal(0, 1.2, base.shape)  # grain: kills banding
    return np.clip(base, 0, 255)


def compose(flacon):
    rng = np.random.default_rng(7)
    scene = build_scene(rng)
    H = W = CANVAS

    th = int(H * TARGET_H)
    tw = int(flacon.width * th / flacon.height)
    if tw > int(W * MAX_W):
        tw = int(W * MAX_W)
        th = int(flacon.height * tw / flacon.width)
    fl = flacon.resize((tw, th), Image.Resampling.LANCZOS)
    fa = np.array(fl).astype(np.float32)
    px = (W - tw) // 2
    py = FLOOR_Y - th

    alpha = fa[:, :, 3] / 255.0

    # rim light: warm light hugging the silhouette (only adds light)
    a_u8 = (alpha * 255).astype(np.uint8)
    inner = cv2.erode(a_u8, np.ones((3, 3), np.uint8), iterations=5)
    rim = cv2.GaussianBlur((a_u8.astype(np.float32) - inner.astype(np.float32)) / 255.0, (0, 0), 2.2)
    side = np.linspace(1.0, 0.45, tw, dtype=np.float32)[None, :]
    rim *= side
    fa[:, :, 0] = np.clip(fa[:, :, 0] + rim * 70, 0, 255)
    fa[:, :, 1] = np.clip(fa[:, :, 1] + rim * 42, 0, 255)
    fa[:, :, 2] = np.clip(fa[:, :, 2] + rim * 10, 0, 255)

    # soft halo behind the flacon edges
    halo_full = np.zeros((H, W), np.float32)
    halo_full[py:py + th, px:px + tw] = alpha
    halo = cv2.GaussianBlur(halo_full, (0, 0), 38) * 0.55
    scene[..., 0] += halo * 55
    scene[..., 1] += halo * 33
    scene[..., 2] += halo * 6

    # contact shadow
    sh = np.zeros((H, W), np.float32)
    cv2.ellipse(sh, (W // 2, FLOOR_Y + 3), (int(tw * 0.52), 11), 0, 0, 360, 1.0, -1)
    sh = cv2.GaussianBlur(sh, (0, 0), 9)
    scene *= (1 - 0.7 * sh)[..., None]

    # mirror reflection on glossy floor
    refl = fa[::-1, :, :].copy()
    rh = int(th * 0.34)
    refl = refl[:rh]
    fade = (np.linspace(0.42, 0.0, rh, dtype=np.float32) ** 1.4)[:, None]
    refl_a = refl[:, :, 3] / 255.0 * fade
    refl_rgb = cv2.GaussianBlur(refl[:, :, :3], (0, 0), 1.6)
    refl_a = cv2.GaussianBlur(refl_a, (0, 0), 1.4)
    y0 = FLOOR_Y + 2
    y1 = min(H, y0 + rh)
    seg = y1 - y0
    region = scene[y0:y1, px:px + tw]
    ra = refl_a[:seg, :, None]
    scene[y0:y1, px:px + tw] = region * (1 - ra) + refl_rgb[:seg] * ra

    # the flacon itself
    region = scene[py:py + th, px:px + tw]
    a3 = alpha[..., None]
    scene[py:py + th, px:px + tw] = region * (1 - a3) + fa[:, :, :3] * a3

    return Image.fromarray(np.clip(scene, 0, 255).astype(np.uint8), "RGB")


def process_product_image_from_url_or_file(source, output_jpg_path):
    os.makedirs(os.path.dirname(os.path.abspath(output_jpg_path)), exist_ok=True)
    photo = load_source(source)
    cutout = remove(photo, session=get_session())
    flacon = isolate_flacon(cutout)
    flacon = clean_edges(flacon)
    flacon = enhance_quality(flacon, int(CANVAS * TARGET_H))
    final = compose(flacon)
    final.save(output_jpg_path, "JPEG", quality=95, optimize=True)
    print(f"SUCCESS: Saved {output_jpg_path}")
    return output_jpg_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="URL or local path to the Qogita photo")
    parser.add_argument("--output", required=True, help="Path to output JPG")
    args = parser.parse_args()
    process_product_image_from_url_or_file(args.source, args.output)
