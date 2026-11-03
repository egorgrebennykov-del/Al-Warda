"""
Al-Warda luxury product scene compositor.

Takes the original Qogita product photo, isolates the flacon (pixels are NOT
redrawn by any generative model) and places it into a dark brown-black studio
scene with a golden glow, reflective floor, and warm rim light. Only lighting
and image quality are changed.

CLI:  python process_qogita_luxury.py --source <url|file> --output out.jpg
"""
import argparse
import io
import os

import cv2
import numpy as np
import requests
from PIL import Image, ImageFilter
from rembg import new_session, remove

CANVAS = 1024
FLOOR_Y = 885          # baseline where the flacon stands (matches template)
TARGET_H = 0.72        # flacon height relative to canvas
MAX_W = 0.48           # flacon max width relative to canvas
STUDIO_IMAGE_COMMENT = b"Al-Warda Qogita studio gold v1"

_session = None


def get_session():
    global _session
    if _session is None:
        _session = new_session("u2net")
    return _session


def load_source(source):
    if source.startswith(("http://", "https://")):
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        res = requests.get(source, headers=headers, timeout=25)
        if res.status_code != 200 or len(res.content) < 1000:
            raise ValueError(f"Failed to fetch {source}: {res.status_code}")
        return Image.open(io.BytesIO(res.content)).convert("RGB")
    return Image.open(source).convert("RGB")


def _box_score(mask, total_h, total_area):
    """
    Score how likely `mask` is the cardboard retail box rather than the flacon.
    Higher score = more box-like (taller, larger area, rectangular silhouette).
    Lower score  = more flacon-like (shorter than the box, smaller area, neck/cap pinch).
    """
    ys, xs = np.where(mask > 0)
    if len(xs) < 50:
        return 999.0
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    w = x1 - x0 + 1
    h = y1 - y0 + 1
    sub = (mask[y0:y1 + 1, x0:x1 + 1] > 0).astype(np.float32)
    area_ratio = float(sub.sum()) / float(max(1, total_area))
    height_ratio = float(h) / float(max(1, total_h))
    solidity = float(sub.sum() / (w * h))

    row_w = sub.sum(axis=1) / float(w)
    top_w = float(np.mean(row_w[:max(1, int(h * 0.30))]))
    mid_w = float(np.mean(row_w[int(h * 0.35):max(int(h * 0.35) + 1, int(h * 0.85))]))
    neck_ratio = min(top_w / (mid_w + 1e-5), 1.15)

    upper_w = row_w[int(h * 0.08):max(int(h * 0.08) + 1, int(h * 0.45))]
    min_upper = float(np.min(upper_w)) if len(upper_w) else top_w
    pinch_ratio = min(min_upper / (mid_w + 1e-5), 1.15)

    col_h = sub.sum(axis=0) / float(h)
    col_std = float(np.std(col_h))

    # Retail box is physically taller and larger than the bottle that fits inside it,
    # and has a rectangular profile without a neck pinch.
    return (
        height_ratio * 1.35
        + area_ratio * 1.25
        + solidity * 0.85
        + neck_ratio * 0.65
        + pinch_ratio * 0.55
        - col_std * 0.50
    )


def _split_touching_box_and_bottle(rgb, mask):
    """
    When the retail box and flacon touch horizontally in the photo, find the
    vertical seam between them and keep only the flacon.
    """
    ys, xs = np.where(mask > 0)
    if len(xs) < 100:
        return mask
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    w = x1 - x0 + 1
    h = y1 - y0 + 1

    sub_mask = (mask[y0:y1 + 1, x0:x1 + 1] > 0).astype(np.uint8)
    sub_rgb = rgb[y0:y1 + 1, x0:x1 + 1]

    row_w = sub_mask.sum(axis=1) / float(w)
    top_w = float(np.mean(row_w[:max(1, int(h * 0.28))]))
    mid_w = float(np.mean(row_w[int(h * 0.35):max(int(h * 0.35) + 1, int(h * 0.85))]))

    # A single narrow standing bottle with a clear centered neck/cap needs no split
    if w / float(h) < 0.60 and top_w < 0.66 * mid_w:
        return mask

    c0, c1 = int(w * 0.16), int(w * 0.86)
    if c1 <= c0 + 6:
        return mask

    top_y = np.argmax(sub_mask > 0, axis=0).astype(np.float32)
    empty_col = ~sub_mask.any(axis=0)
    top_y[empty_col] = float(h)
    col_fill = sub_mask.sum(axis=0).astype(np.float32) / float(h)

    gray = cv2.cvtColor(sub_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    gx = np.abs(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3))
    gy = np.abs(cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3))

    top_smooth = cv2.GaussianBlur(top_y.reshape(1, -1), (1, 9), 0).ravel()
    top_jump = np.abs(np.gradient(top_smooth))

    edge_norm = gx / (np.percentile(gx, 95) + 1e-5)
    cost = (1.2 - np.clip(edge_norm, 0, 1.0)) + 0.3 * (gy / (np.percentile(gy, 95) + 1e-5))
    cost[sub_mask == 0] = 0.02

    acc = cost.copy()
    back = np.zeros_like(acc, dtype=np.int32)
    for r in range(1, h):
        prev = acc[r - 1]
        for c in range(c0, c1):
            lo = max(c0, c - 1)
            hi = min(c1 - 1, c + 1)
            best_c = lo + int(np.argmin(prev[lo:hi + 1]))
            acc[r, c] = cost[r, c] + prev[best_c] + (0.42 if best_c != c else 0.0)
            back[r, c] = best_c

    seam_score = np.full(w, 1e9, dtype=np.float32)
    for c in range(c0, c1):
        mean_cost = acc[h - 1, c] / float(h)
        w_lo, w_hi = max(c0, c - 2), min(c1, c + 3)
        notch_bonus = (top_y[w_lo:w_hi].max() / float(h)) * 0.65 + (top_jump[w_lo:w_hi].max() / float(h)) * 2.8
        dip_bonus = (1.0 - col_fill[w_lo:w_hi].min()) * 0.85
        seam_score[c] = mean_cost - notch_bonus - dip_bonus

    best_end_c = int(np.argmin(seam_score))
    seam_x = np.zeros(h, dtype=np.int32)
    seam_x[h - 1] = best_end_c
    for r in range(h - 1, 0, -1):
        seam_x[r - 1] = back[r, seam_x[r]]

    med_c = int(np.median(seam_x))
    seam_x = np.clip(seam_x, med_c - 3, med_c + 3)

    max_top_notch = float(top_y[c0:c1].max()) / float(h)
    min_col_fill = float(col_fill[c0:c1].min())
    if w / float(h) < 0.62 and max_top_notch < 0.12 and min_col_fill > 0.85:
        return mask

    left_sub = np.zeros_like(sub_mask)
    right_sub = np.zeros_like(sub_mask)
    for r in range(h):
        sx = seam_x[r]
        left_sub[r, :sx] = sub_mask[r, :sx]
        right_sub[r, sx:] = sub_mask[r, sx:]

    total_area = int(sub_mask.sum())
    if left_sub.sum() < 0.06 * total_area or right_sub.sum() < 0.06 * total_area:
        return mask

    b_left = _box_score(left_sub, h, total_area)
    b_right = _box_score(right_sub, h, total_area)
    bottle_is_left = b_left < b_right
    chosen_sub = left_sub if bottle_is_left else right_sub

    # If the bottle overlaps in front of the taller box so part of the box peeks
    # out above the bottle's cap/shoulder on the seam side, enforce bottle symmetry
    # around the cap center to trim the background box behind the shoulder.
    col_top = np.argmax(chosen_sub > 0, axis=0)
    has_pix = chosen_sub.any(axis=0)
    if has_pix.any():
        xs_c = np.where(has_pix)[0]
        cw = len(xs_c)
        if cw > 24:
            outer_part = xs_c[int(cw * 0.10):max(int(cw * 0.10) + 1, int(cw * 0.44))] if bottle_is_left else xs_c[int(cw * 0.56):max(int(cw * 0.56) + 1, int(cw * 0.90))]
            cap_top = int(np.min(col_top[outer_part]))
            margin = max(4, int(0.03 * h))
            if cap_top > margin and int(np.min(col_top[xs_c])) < cap_top - margin:
                # Find the contiguous cap plateau starting from outer_part
                seed = int(outer_part[int(np.argmin(col_top[outer_part]))])
                c_lo = seed
                while c_lo > int(xs_c.min()) and abs(int(col_top[c_lo - 1]) - cap_top) <= margin:
                    c_lo -= 1
                c_hi = seed
                while c_hi < int(xs_c.max()) and abs(int(col_top[c_hi + 1]) - cap_top) <= margin:
                    c_hi += 1
                if c_hi - c_lo >= 4:
                    cap_center = 0.5 * float(c_lo + c_hi)
                    seam_cols = [c for c in xs_c if (c > cap_center if bottle_is_left else c < cap_center)]
                    for cx in seam_cols:
                        mx = int(round(2.0 * cap_center - cx))
                        if mx < 0 or mx >= w or not has_pix[mx]:
                            chosen_sub[:, cx] = 0
                        else:
                            sym_top = int(col_top[mx])
                            if col_top[cx] < sym_top - margin:
                                chosen_sub[:sym_top, cx] = 0

    # Keep largest connected piece of the chosen side so stray slivers are dropped
    n_c, lab_c, stats_c, _ = cv2.connectedComponentsWithStats(chosen_sub, connectivity=8)
    if n_c > 2:
        main_i = 1 + int(np.argmax(stats_c[1:, cv2.CC_STAT_AREA]))
        chosen_sub = (lab_c == main_i).astype(np.uint8)

    out = np.zeros_like(mask)
    out[y0:y1 + 1, x0:x1 + 1] = chosen_sub
    return out


def isolate_flacon(cutout, rgb=None):
    """Keep only the bottle when the photo also shows the retail box."""
    arr = np.array(cutout)
    if rgb is None:
        rgb = arr[:, :, :3]
    alpha = arr[:, :, 3]
    mask = (alpha > 115).astype(np.uint8)

    # Close ONLY vertically so a cap stays attached to its neck without
    # bridging a horizontal gap between a box and a bottle.
    kv = max(5, int(mask.shape[0] * 0.02))
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((kv, 1), np.uint8))

    n, labels, stats, _ = cv2.connectedComponentsWithStats(closed, connectivity=8)
    comps = []
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        comp = (labels == i).astype(np.uint8)
        comps.append(dict(i=i, area=area, mask=comp))
    if not comps:
        raise ValueError("Nothing detected in the photo")

    biggest = max(c["area"] for c in comps)
    comps = [c for c in comps if c["area"] >= 0.06 * biggest]

    ys_all, _ = np.where(closed > 0)
    total_h = int(ys_all.max() - ys_all.min() + 1) if len(ys_all) else mask.shape[0]
    total_area = sum(c["area"] for c in comps)

    if len(comps) >= 2:
        for c in comps:
            c["bscore"] = _box_score(c["mask"], total_h, total_area)
        comps.sort(key=lambda c: c["bscore"])
        keep_mask = comps[0]["mask"] > 0
    else:
        split_mask = _split_touching_box_and_bottle(rgb, comps[0]["mask"])
        keep_mask = split_mask > 0

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
    # Near-black brown backdrop with a broad golden glow behind the bottle.
    base = np.zeros((H, W, 3), np.float32)
    t = y / H
    base[..., 0] = 5 + 2 * t
    base[..., 1] = 3 + 1.5 * t
    base[..., 2] = 1 + 0.5 * t
    glow = np.exp(
        -(((x - W * 0.50) / (W * 0.34)) ** 2 + ((y - H * 0.53) / (H * 0.39)) ** 2)
    )
    base[..., 0] += glow * 78
    base[..., 1] += glow * 43
    base[..., 2] += glow * 10

    # Golden pools of light meet a dark, glossy floor at the horizon.
    floor = (y > FLOOR_Y).astype(np.float32)
    base *= (1 - 0.32 * floor)[..., None]
    streak = np.exp(-(((y - (FLOOR_Y + 2)) / 12) ** 2)) * np.exp(
        -(((x - W / 2) / (W * 0.38)) ** 2)
    )
    base[..., 0] += streak * 230
    base[..., 1] += streak * 145
    base[..., 2] += streak * 36
    pool = np.exp(
        -(((x - W / 2) / (W * 0.42)) ** 2 + ((y - (FLOOR_Y + 38)) / 58) ** 2)
    ) * floor
    base[..., 0] += pool * 50
    base[..., 1] += pool * 27
    base[..., 2] += pool * 6
    # Vignette keeps the corners almost black like the reference.
    v = np.clip(1 - 0.55 * (np.sqrt(((x - W / 2) / (W * 0.75)) ** 2 + ((y - H / 2) / (H * 0.75)) ** 2)) ** 2, 0.25, 1)
    base *= v[..., None]
    base += rng.normal(0, 0.7, base.shape)
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

    # Warm gold rim light, confined to the silhouette edge.
    a_u8 = (alpha * 255).astype(np.uint8)
    inner = cv2.erode(a_u8, np.ones((3, 3), np.uint8), iterations=5)
    rim = cv2.GaussianBlur((a_u8.astype(np.float32) - inner.astype(np.float32)) / 255.0, (0, 0), 2.2)
    side = np.linspace(1.0, 0.48, tw, dtype=np.float32)[None, :]
    rim *= side
    fa[:, :, 0] = np.clip(fa[:, :, 0] + rim * 70, 0, 255)
    fa[:, :, 1] = np.clip(fa[:, :, 1] + rim * 42, 0, 255)
    fa[:, :, 2] = np.clip(fa[:, :, 2] + rim * 10, 0, 255)

    # soft halo behind the flacon edges
    halo_full = np.zeros((H, W), np.float32)
    halo_full[py:py + th, px:px + tw] = alpha
    halo = cv2.GaussianBlur(halo_full, (0, 0), 38) * 0.55
    scene[..., 0] += halo * 55
    scene[..., 1] += halo * 32
    scene[..., 2] += halo * 7

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
    flacon = isolate_flacon(cutout, np.array(photo))
    flacon = clean_edges(flacon)
    flacon = enhance_quality(flacon, int(CANVAS * TARGET_H))
    final = compose(flacon)
    final.save(
        output_jpg_path,
        "JPEG",
        quality=95,
        optimize=True,
        comment=STUDIO_IMAGE_COMMENT,
    )
    print(f"SUCCESS: Saved {output_jpg_path}")
    return output_jpg_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="URL or local path to the Qogita photo")
    parser.add_argument("--output", required=True, help="Path to output JPG")
    args = parser.parse_args()
    process_product_image_from_url_or_file(args.source, args.output)
