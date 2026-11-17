#!/usr/bin/env python3
"""
Composite Studio Template for Al-Warda Fragrances.
Renders product flacons onto the user's master spotlight stage:
- Master vertical spotlight background (682x1024)
- Powerful directional spotlight beam entering from upper-left (38, 0)
- Illuminated reflective floor horizon at y=880
- Seamless physical integration: 3D ambient occlusion, contact shadow,
  upward warm amber floor bounce light, directional spotlight sheen along left flank,
  and realistic glossy mirror reflection on the floor
- Smoothstep edge feathering into site background (#080605)
"""

import os
import sys
import argparse
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps, ImageEnhance

# Site background color (#080605)
BG_COLOR = (8, 6, 5)

def smoothstep(x):
    return x * x * (3.0 - 2.0 * x)

def composite_on_studio_template(
    cutout_path,
    output_png,
    output_webp=None,
    template_path=None,
    site_bg=BG_COLOR
):
    if template_path is None:
        template_path = os.path.join(
            os.path.dirname(__file__), "..", "public", "assets", "img", "stage", "spotlight_stage.jpg"
        )
        if not os.path.exists(template_path):
            template_path = "spotlight_stage.jpg"

    # 1. Load Master Spotlight Stage Background
    bg_raw = Image.open(template_path).convert("RGB")
    bw, bh = bg_raw.size # 682 x 1024
    canvas = bg_raw.copy()

    # 2. Load and Trim Product Cutout
    prod = Image.open(cutout_path).convert("RGBA")
    bbox = prod.getbbox()
    if bbox:
        prod = prod.crop(bbox)
    pw, ph = prod.size

    # 3. Flacon Sizing & Positioning in the Spotlight Pool
    # Floor horizon line is at y = 880, center of pool is at x = 324
    floor_y = 880
    prod_cx = 324

    aspect = pw / float(ph)
    if aspect > 0.85:
        # Wide cutout (bottle + box)
        target_ph = 490
        scale = target_ph / float(ph)
        target_pw = int(pw * scale)
        if target_pw > 530:
            scale = 530 / float(pw)
            target_pw = int(pw * scale)
            target_ph = int(ph * scale)
    else:
        # Single bottle
        target_ph = 530
        scale = target_ph / float(ph)
        target_pw = int(pw * scale)
        if target_pw > 420:
            scale = 420 / float(pw)
            target_pw = int(pw * scale)
            target_ph = int(ph * scale)

    prod_scaled = prod.resize((target_pw, target_ph), Image.Resampling.LANCZOS)
    prod_x = prod_cx - (target_pw // 2)
    prod_y = floor_y - target_ph

    # 4. Realistic Glossy Floor Mirror Reflection
    refl_crop_h = int(target_ph * 0.45)
    refl_crop = prod_scaled.crop((0, target_ph - refl_crop_h, target_pw, target_ph))
    refl_flipped = ImageOps.flip(refl_crop)
    refl_h = int(refl_crop_h * 0.42)
    refl_scaled = refl_flipped.resize((target_pw, refl_h), Image.Resampling.LANCZOS)

    r_arr = np.array(refl_scaled, dtype=np.float32)
    # Vertical gradient fade down into the floor
    fade = np.linspace(0.85, 0.02, refl_h, dtype=np.float32)[:, np.newaxis, np.newaxis]
    r_arr[:, :, 3] = r_arr[:, :, 3] * fade[:, :, 0]
    # Warm amber floor tint
    amber_tint = np.array([245.0, 180.0, 70.0], dtype=np.float32)
    r_arr[:, :, :3] = r_arr[:, :, :3] * 0.60 + amber_tint[np.newaxis, np.newaxis, :] * 0.40
    refl_img = Image.fromarray(np.clip(r_arr, 0, 255).astype(np.uint8), mode="RGBA")
    # Soft horizontal blur matching glossy wet floor texture
    refl_img = refl_img.filter(ImageFilter.GaussianBlur(1.8))

    refl_canvas = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    refl_canvas.paste(refl_img, (prod_x, floor_y - 2), mask=refl_img.split()[3])

    # Floor mask: ensure reflection stays on the reflective floor (y >= floor_y - 2)
    floor_mask = Image.new("L", (bw, bh), 0)
    fm_draw = ImageDraw.Draw(floor_mask)
    fm_draw.rectangle([0, floor_y - 2, bw, bh], fill=255)
    floor_mask = floor_mask.filter(ImageFilter.GaussianBlur(2))

    m_rf = np.array(refl_canvas.split()[3], dtype=np.float32) / 255.0
    m_fl = np.array(floor_mask, dtype=np.float32) / 255.0
    refl_final_mask = Image.fromarray((m_rf * m_fl * 255.0).astype(np.uint8))
    canvas.paste(refl_canvas, (0, 0), mask=refl_final_mask)

    # 5. Contact Shadow & 3D Ambient Occlusion
    # Dark tight contact line directly under base anchoring product to the floor
    contact_sh = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    csh_draw = ImageDraw.Draw(contact_sh)
    csh_draw.ellipse([prod_x + 8, floor_y - 4, prod_x + target_pw - 8, floor_y + 5], fill=(5, 3, 1, 250))
    # Directional shadow cast slightly rightwards matching the top-left spotlight angle
    csh_draw.ellipse([prod_x + 14, floor_y - 2, prod_x + target_pw + 14, floor_y + 9], fill=(8, 4, 1, 160))
    contact_sh = contact_sh.filter(ImageFilter.GaussianBlur(2.5))
    canvas.paste(contact_sh, (0, 0), mask=contact_sh.split()[3])

    # 6. Environmental Harmonization on Flacon
    rgb_p = prod_scaled.convert("RGB")
    a_p = prod_scaled.split()[3]
    enh_color = ImageEnhance.Color(rgb_p).enhance(1.14)
    enh_contrast = ImageEnhance.Contrast(enh_color).enhance(1.06)
    flacon_harmonized = Image.merge("RGBA", (*enh_contrast.split(), a_p))

    # Upward amber bounce light on lower 22% of bottle (reflecting off glowing floor)
    bounce = Image.new("RGBA", (target_pw, target_ph), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(bounce)
    bounce_h = int(target_ph * 0.22)
    for y_b in range(bounce_h):
        alpha_b = int(50 * ((bounce_h - y_b) / float(bounce_h)))
        b_draw.line([(0, target_ph - y_b), (target_pw, target_ph - y_b)], fill=(245, 185, 75, alpha_b))
    bounce = bounce.filter(ImageFilter.GaussianBlur(8))
    m_flacon = np.array(a_p, dtype=np.float32) / 255.0
    m_b = np.array(bounce.split()[3], dtype=np.float32) / 255.0
    bounce_mask = Image.fromarray((m_flacon * m_b * 255.0).astype(np.uint8))
    flacon_harmonized.paste(Image.new("RGB", (target_pw, target_ph), (245, 185, 75)), (0, 0), mask=bounce_mask)

    canvas.paste(flacon_harmonized, (prod_x, prod_y), mask=flacon_harmonized.split()[3])

    # 7. Directional Spotlight Sheen on Left Flank (matching spotlight ray from top-left)
    sheen = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(sheen)
    sheen_pts = [
        (0, 0),
        (prod_x + int(target_pw * 0.40), 0),
        (prod_x + int(target_pw * 0.60), floor_y),
        (0, floor_y)
    ]
    sh_draw.polygon(sheen_pts, fill=(255, 235, 175, 32))
    sheen = sheen.filter(ImageFilter.GaussianBlur(30))
    prod_mask_full = Image.new("L", (bw, bh), 0)
    prod_mask_full.paste(a_p, (prod_x, prod_y))
    m_sh = np.array(sheen.split()[3], dtype=np.float32) / 255.0
    m_pf = np.array(prod_mask_full, dtype=np.float32) / 255.0
    prod_sheen_mask = Image.fromarray((m_sh * m_pf * 255.0).astype(np.uint8))
    canvas.paste(Image.new("RGB", (bw, bh), (255, 230, 160)), (0, 0), mask=prod_sheen_mask)

    # 8. Seamless Border Feathering into site background #080605
    arr = np.array(canvas, dtype=np.float32)
    bg_col = np.array(site_bg, dtype=np.float32)
    y_idx, x_idx = np.indices((bh, bw))
    alpha_l = np.clip(x_idx / 35.0, 0.0, 1.0)
    alpha_r = np.clip((bw - 1 - x_idx) / 35.0, 0.0, 1.0)
    alpha_t = np.clip(y_idx / 30.0, 0.0, 1.0)
    alpha_b = np.clip((bh - 1 - y_idx) / 25.0, 0.0, 1.0)
    b_mask = smoothstep(alpha_l) * smoothstep(alpha_r) * smoothstep(alpha_t) * smoothstep(alpha_b)
    final_arr = arr * b_mask[:, :, np.newaxis] + bg_col[np.newaxis, np.newaxis, :] * (1.0 - b_mask[:, :, np.newaxis])
    final_rgb = Image.fromarray(np.clip(final_arr, 0, 255).astype(np.uint8), mode="RGB")
    final_alpha = (b_mask * 255.0).astype(np.uint8)
    final_rgba = Image.merge("RGBA", (*final_rgb.split(), Image.fromarray(final_alpha, mode="L")))

    os.makedirs(os.path.dirname(os.path.abspath(output_png)), exist_ok=True)
    final_rgba.save(output_png, "PNG", optimize=True)

    if output_webp:
        os.makedirs(os.path.dirname(os.path.abspath(output_webp)), exist_ok=True)
        final_rgba.save(output_webp, "WEBP", quality=95)

    print(f"Generated spotlight stage image: {output_png} ({bw}x{bh}, flacon_h={target_ph}px, prod_y={prod_y}px)")
    return final_rgba

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Composite perfume flacon on spotlight stage background")
    parser.add_argument("--cutout", required=True, help="Path to product cutout PNG")
    parser.add_argument("--output", required=True, help="Path to output PNG")
    parser.add_argument("--webp", help="Path to output WEBP")
    parser.add_argument("--template", help="Path to master template JPG")
    args = parser.parse_args()

    composite_on_studio_template(
        cutout_path=args.cutout,
        output_png=args.output,
        output_webp=args.webp,
        template_path=args.template
    )
