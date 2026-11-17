#!/usr/bin/env python3
"""
Composite Studio Template for Al-Warda Fragrances.
Places product flacons firmly ON the master gold studio tray template,
with realistic mirror reflection on the gold surface, contact shadow,
directional spotlight illumination, and seamless feathering into the site background (#080605).
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

    # 1. Load Template (1024 x 439)
    tpl_raw = Image.open(template_path).convert("RGB")
    tw, th = tpl_raw.size
    tpl = tpl_raw.copy()

    # 2. Load & prep product cutout
    prod = Image.open(cutout_path).convert("RGBA")
    bbox = prod.getbbox()
    if bbox:
        prod = prod.crop(bbox)
    pw, ph = prod.size

    # Color grading: enhance vibrance, contrast & warmth slightly for appetizing presentation
    rgb_part = prod.convert("RGB")
    alpha_part = prod.split()[3]
    enh_color = ImageEnhance.Color(rgb_part).enhance(1.12)
    enh_contrast = ImageEnhance.Contrast(enh_color).enhance(1.06)
    prod = Image.merge("RGBA", (*enh_contrast.split(), alpha_part))

    # 3. Position and scaling ON the Gold Tray
    # Tray center X=618
    # Tray top surface extends from Y=344 to Y=368.
    # Setting prod_bottom = 365 places the product firmly ON the tray surface,
    # leaving gold tray visible behind it and the front rim and reflection in front!
    podium_cx = 618
    prod_bottom = 365

    # Target height: ~310px (top point around Y=55, perfectly aligned with title)
    target_ph = int(th * 0.70) # ~307px
    scale = target_ph / ph
    target_pw = int(pw * scale)

    # Restrain max width if flacon + box is wide
    if target_pw > 380:
        scale = 380 / pw
        target_pw = int(pw * scale)
        target_ph = int(ph * scale)

    prod_scaled = prod.resize((target_pw, target_ph), Image.Resampling.LANCZOS)
    prod_x = podium_cx - (target_pw // 2)
    prod_y = prod_bottom - target_ph

    # 4. Realistic Mirror Reflection on the Gold Tray Surface
    # Take bottom 45% of product
    refl_crop_h = int(target_ph * 0.45)
    refl_crop = prod_scaled.crop((0, target_ph - refl_crop_h, target_pw, target_ph))
    refl_flipped = ImageOps.flip(refl_crop)

    # Perspective vertical foreshortening for angled tray view
    refl_h = int(refl_crop_h * 0.38) # ~52px tall reflection
    refl_scaled = refl_flipped.resize((target_pw, refl_h), Image.Resampling.LANCZOS)

    r_arr = np.array(refl_scaled, dtype=np.float32)
    # Vertical gradient fade (bright near contact line 0.88, softly fading out to 0.05)
    fade = np.linspace(0.88, 0.05, refl_h, dtype=np.float32)[:, np.newaxis, np.newaxis]
    r_arr[:, :, 3] = r_arr[:, :, 3] * fade[:, :, 0]

    # Metallic 24K gold tint matching the tray surface
    gold_tint = np.array([230.0, 190.0, 85.0], dtype=np.float32)
    r_arr[:, :, :3] = r_arr[:, :, :3] * 0.65 + gold_tint[np.newaxis, np.newaxis, :] * 0.35
    refl_final = Image.fromarray(np.clip(r_arr, 0, 255).astype(np.uint8), mode="RGBA")

    # Tray surface reflection mask
    tray_mask = Image.new("L", (tw, th), 0)
    tm_draw = ImageDraw.Draw(tray_mask)
    tm_draw.ellipse([podium_cx - 290, 335, podium_cx + 290, 422], fill=255)
    tray_mask = tray_mask.filter(ImageFilter.GaussianBlur(3))

    refl_canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    refl_canvas.paste(refl_final, (prod_x, prod_bottom), mask=refl_final.split()[3])

    m1 = np.array(refl_canvas.split()[3], dtype=np.float32) / 255.0
    m2 = np.array(tray_mask, dtype=np.float32) / 255.0
    refl_clipped = Image.fromarray((m1 * m2 * 255.0).astype(np.uint8))

    # Paste reflection onto template
    tpl.paste(refl_canvas, (0, 0), mask=refl_clipped)

    # 5. Soft Contact Shadow under bottle base where it presses against the tray
    contact_sh = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    csh_draw = ImageDraw.Draw(contact_sh)
    csh_draw.ellipse([prod_x + 6, prod_bottom - 4, prod_x + target_pw - 6, prod_bottom + 5], fill=(6, 3, 1, 240))
    contact_sh = contact_sh.filter(ImageFilter.GaussianBlur(2.5))
    tpl.paste(contact_sh, (0, 0), mask=contact_sh.split()[3])

    # 6. Paste Product Flacon firmly on top of the tray
    tpl.paste(prod_scaled, (prod_x, prod_y), mask=prod_scaled.split()[3])

    # 7. Directional warm sheen matching the spotlight angle from top-left
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
