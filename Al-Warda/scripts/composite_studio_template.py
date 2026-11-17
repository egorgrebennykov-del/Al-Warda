#!/usr/bin/env python3
"""
Composite Studio Template for Al-Warda Fragrances.
Places product flacons onto the master gold studio tray template,
with realistic mirror reflection, contact shadow, directional spotlight illumination,
and seamless feathering into the site background (#080605).
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
            os.path.dirname(__file__), "..", "public", "assets", "img", "stage", "studio_template.jpg"
        )
        if not os.path.exists(template_path):
            template_path = "studio_template.jpg"

    # 1. Load Template
    tpl_raw = Image.open(template_path).convert("RGB")
    tw, th = tpl_raw.size # 1024 x 439
    tpl = tpl_raw.copy()

    # 2. Load & prep product cutout
    prod = Image.open(cutout_path).convert("RGBA")
    bbox = prod.getbbox()
    if bbox:
        prod = prod.crop(bbox)
    pw, ph = prod.size

    # Appetizing color grading on product
    # Enhance vibrance / saturation and contrast slightly
    rgb_part = prod.convert("RGB")
    alpha_part = prod.split()[3]
    enh_color = ImageEnhance.Color(rgb_part).enhance(1.10)
    enh_contrast = ImageEnhance.Contrast(enh_color).enhance(1.06)
    prod = Image.merge("RGBA", (*enh_contrast.split(), alpha_part))

    # 3. Position and scaling on Gold Tray
    # Tray center X=618, top surface Y=347
    podium_cx = 618
    podium_cy = 347

    # Target height: ~71% of canvas (~312px)
    target_ph = int(th * 0.71)
    scale = target_ph / ph
    target_pw = int(pw * scale)

    # Restrain max width if flacon is very wide
    if target_pw > 380:
        scale = 380 / pw
        target_pw = int(pw * scale)
        target_ph = int(ph * scale)

    prod_scaled = prod.resize((target_pw, target_ph), Image.Resampling.LANCZOS)
    prod_x = podium_cx - (target_pw // 2)
    prod_bottom = podium_cy + 2
    prod_y = prod_bottom - target_ph

    # 4. Realistic Mirror Reflection on Gold Tray
    # Invert bottom 38% of flacon
    refl_crop_h = int(target_ph * 0.38)
    refl_crop = prod_scaled.crop((0, target_ph - refl_crop_h, target_pw, target_ph))
    refl_flipped = ImageOps.flip(refl_crop)

    # Foreshorten vertically to match camera perspective on tray top
    refl_h = int(refl_crop_h * 0.32)
    refl_scaled = refl_flipped.resize((target_pw, refl_h), Image.Resampling.LANCZOS)

    r_arr = np.array(refl_scaled, dtype=np.float32)
    # Vertical gradient fade
    fade = np.linspace(0.65, 0.03, refl_h, dtype=np.float32)[:, np.newaxis, np.newaxis]
    r_arr[:, :, 3] = r_arr[:, :, 3] * fade[:, :, 0]

    # Metallic 24K gold tint matching the tray surface
    gold_tint = np.array([225.0, 185.0, 85.0], dtype=np.float32)
    r_arr[:, :, :3] = r_arr[:, :, :3] * 0.60 + gold_tint[np.newaxis, np.newaxis, :] * 0.40
    refl_final = Image.fromarray(np.clip(r_arr, 0, 255).astype(np.uint8), mode="RGBA")

    # Tray surface ellipse mask (keeps reflection inside tray)
    tray_mask = Image.new("L", (tw, th), 0)
    tm_draw = ImageDraw.Draw(tray_mask)
    tm_draw.ellipse([podium_cx - 245, podium_cy - 28, podium_cx + 245, podium_cy + 34], fill=255)
    tray_mask = tray_mask.filter(ImageFilter.GaussianBlur(2))

    refl_canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    refl_canvas.paste(refl_final, (prod_x, prod_bottom), mask=refl_final.split()[3])

    m1 = np.array(refl_canvas.split()[3], dtype=np.float32) / 255.0
    m2 = np.array(tray_mask, dtype=np.float32) / 255.0
    refl_clipped = Image.fromarray((m1 * m2 * 255.0).astype(np.uint8))

    # Paste reflection onto template
    tpl.paste(refl_canvas, (0, 0), mask=refl_clipped)

    # 5. Soft Contact Shadow under bottle base
    contact_sh = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    csh_draw = ImageDraw.Draw(contact_sh)
    csh_draw.ellipse([prod_x + 8, prod_bottom - 3, prod_x + target_pw - 8, prod_bottom + 6], fill=(10, 6, 2, 230))
    contact_sh = contact_sh.filter(ImageFilter.GaussianBlur(3))
    tpl.paste(contact_sh, (0, 0), mask=contact_sh.split()[3])

    # 6. Paste Product Flacon
    tpl.paste(prod_scaled, (prod_x, prod_y), mask=prod_scaled.split()[3])

    # 7. Directional warm sheen matching the spotlight angle
    sheen = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(sheen)
    sh_draw.polygon(
        [(-40, -40), (prod_x + int(target_pw * 0.45), -40), (prod_x + int(target_pw * 0.65), prod_bottom), (-40, prod_bottom)],
        fill=(255, 235, 170, 26)
    )
    sheen = sheen.filter(ImageFilter.GaussianBlur(28))

    prod_mask = Image.new("L", (tw, th), 0)
    prod_mask.paste(prod_scaled.split()[3], (prod_x, prod_y))
    m_sheen = np.array(sheen.split()[3], dtype=np.float32) / 255.0
    m_prod = np.array(prod_mask, dtype=np.float32) / 255.0
    prod_sheen_mask = Image.fromarray((m_sheen * m_prod * 255.0).astype(np.uint8))
    tpl.paste(Image.new("RGB", (tw, th), (255, 230, 160)), (0, 0), mask=prod_sheen_mask)

    # 8. Seamless feathering into site background #080605
    arr = np.array(tpl, dtype=np.float32)
    bg = np.array(site_bg, dtype=np.float32)

    y_idx, x_idx = np.indices((th, tw))
    feather_x_left = 65.0
    feather_x_right = 65.0
    feather_y_top = 55.0
    feather_y_bottom = 35.0

    alpha_left = np.clip(x_idx / feather_x_left, 0.0, 1.0)
    alpha_right = np.clip((tw - 1 - x_idx) / feather_x_right, 0.0, 1.0)
    alpha_top = np.clip(y_idx / feather_y_top, 0.0, 1.0)
    alpha_bottom = np.clip((th - 1 - y_idx) / feather_y_bottom, 0.0, 1.0)

    border_mask = smoothstep(alpha_left) * smoothstep(alpha_right) * smoothstep(alpha_top) * smoothstep(alpha_bottom)

    # Blend RGB to exact site background at edges
    final_arr = arr * border_mask[:, :, np.newaxis] + bg[np.newaxis, np.newaxis, :] * (1.0 - border_mask[:, :, np.newaxis])
    final_rgb = Image.fromarray(np.clip(final_arr, 0, 255).astype(np.uint8), mode="RGB")

    # Alpha mask for RGBA output (fades to transparent at outer edges)
    final_alpha = (border_mask * 255.0).astype(np.uint8)
    final_rgba = Image.merge("RGBA", (*final_rgb.split(), Image.fromarray(final_alpha, mode="L")))

    os.makedirs(os.path.dirname(os.path.abspath(output_png)), exist_ok=True)
    final_rgba.save(output_png, "PNG", optimize=True)

    if output_webp:
        os.makedirs(os.path.dirname(os.path.abspath(output_webp)), exist_ok=True)
        final_rgba.save(output_webp, "WEBP", quality=95)

    print(f"Generated seamless stage image: {output_png}")
    return final_rgba

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Composite perfume flacon on master studio template")
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
