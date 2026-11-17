#!/usr/bin/env python3
"""
Composite Studio Template for Al-Warda Fragrances.
Renders product flacons onto a majestic vertical luxury studio stage:
- Vertical aspect ratio (540x580) perfectly matching the product page media card
- Spotlight beam positioned on the upper-left, angling down to the tray
- Enlarged gold podium tray and enlarged flacon for maximum visual presence
- Seamless physical integration: 3D ambient occlusion, contact shadow,
  upward warm gold bounce light on flacon base, directional spotlight sheen,
  and realistic metallic mirror reflection on the tray surface
- Top of the flacon aligned with the top line of the product title
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
            os.path.dirname(__file__), "..", "public", "assets", "img", "stage", "studio_template.jpg"
        )
        if not os.path.exists(template_path):
            template_path = "studio_template.jpg"

    # Canvas dimensions: 540 x 580 (vertical luxury presentation, perfectly filling media card)
    cw, ch = 540, 580

    # 1. Base dark atmospheric canvas
    canvas = Image.new("RGB", (cw, ch), site_bg)

    # 2. Master template source
    tpl_raw = Image.open(template_path).convert("RGB")
    tw, th = tpl_raw.size # 1024 x 439

    # Extract real gold tray from master template
    # Tray in template is x: 300 to 900, y: 330 to 439 (width 600, height 109)
    tray_orig = tpl_raw.crop((300, 330, 900, 439))
    tray_w = 480
    tray_h = int(tray_orig.size[1] * (tray_w / float(tray_orig.size[0]))) # ~87px
    tray_resized = tray_orig.resize((tray_w, tray_h), Image.Resampling.LANCZOS)

    tray_x = (cw - tray_w) // 2
    tray_y = ch - tray_h - 40 # 580 - 87 - 40 = 453
    flacon_base_y = tray_y + 24 # 477 (sits on the top surface of the tray)

    # 3. Directional Volumetric Spotlight Beam from upper-left
    spotlight = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    sp_draw = ImageDraw.Draw(spotlight)
    beam_pts = [
        (-70, -60),
        (150, -60),
        (460, flacon_base_y + 30),
        (-70, flacon_base_y + 30)
    ]
    sp_draw.polygon(beam_pts, fill=(245, 205, 120, 75))
    spotlight = spotlight.filter(ImageFilter.GaussianBlur(45))
    canvas.paste(Image.new("RGB", (cw, ch), (225, 175, 75)), (0, 0), mask=spotlight.split()[3])

    # 4. Ambient Warm Glow behind the product
    aura = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    au_draw = ImageDraw.Draw(aura)
    center_y = (flacon_base_y + 30) // 2 # ~250
    for r in range(210, 0, -8):
        alpha = int(35 * (1.0 - (r / 210.0)))
        au_draw.ellipse([cw // 2 - r, center_y - int(r * 0.85), cw // 2 + r, center_y + int(r * 0.85)], fill=(225, 165, 45, alpha))
    aura = aura.filter(ImageFilter.GaussianBlur(38))
    canvas.paste(Image.new("RGB", (cw, ch), (225, 165, 45)), (0, 0), mask=aura.split()[3])

    # 5. Paste the Real Gold Tray with edge feathering
    tray_rgba = tray_resized.convert("RGBA")
    t_arr = np.array(tray_rgba, dtype=np.float32)
    t_w, t_h = tray_resized.size
    for x in range(28):
        t_arr[:, x, 3] = t_arr[:, x, 3] * (x / 28.0)
        t_arr[:, t_w - 1 - x, 3] = t_arr[:, t_w - 1 - x, 3] * (x / 28.0)
    for y in range(16):
        t_arr[t_h - 1 - y, :, 3] = t_arr[t_h - 1 - y, :, 3] * (y / 16.0)
    tray_smooth = Image.fromarray(np.clip(t_arr, 0, 255).astype(np.uint8), mode="RGBA")
    canvas.paste(tray_smooth, (tray_x, tray_y), mask=tray_smooth.split()[3])

    # 6. Load Product Cutout
    prod = Image.open(cutout_path).convert("RGBA")
    bbox = prod.getbbox()
    if bbox:
        prod = prod.crop(bbox)
    pw, ph = prod.size

    # Target height: 430px (fills vertical canvas, top aligned with title)
    target_ph = 430
    scale = target_ph / ph
    target_pw = int(pw * scale)
    if target_pw > 425:
        scale = 425 / pw
        target_pw = int(pw * scale)
        target_ph = int(ph * scale)

    prod_scaled = prod.resize((target_pw, target_ph), Image.Resampling.LANCZOS)
    prod_x = (cw - target_pw) // 2
    prod_y = flacon_base_y - target_ph

    # 7. Contact Shadow & 3D Ambient Occlusion
    contact_sh = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    csh_draw = ImageDraw.Draw(contact_sh)
    # Tight dark occlusion line where flacon touches gold plate
    csh_draw.ellipse([prod_x + 6, flacon_base_y - 4, prod_x + target_pw - 6, flacon_base_y + 4], fill=(5, 3, 1, 250))
    # Soft directional shadow cast slightly rightwards
    csh_draw.ellipse([prod_x + 12, flacon_base_y - 2, prod_x + target_pw + 10, flacon_base_y + 8], fill=(8, 4, 1, 160))
    contact_sh = contact_sh.filter(ImageFilter.GaussianBlur(2.5))
    canvas.paste(contact_sh, (0, 0), mask=contact_sh.split()[3])

    # 8. Realistic Metallic Mirror Reflection on Gold Tray Surface
    refl_crop_h = int(target_ph * 0.40)
    refl_crop = prod_scaled.crop((0, target_ph - refl_crop_h, target_pw, target_ph))
    refl_flipped = ImageOps.flip(refl_crop)
    refl_h = int(refl_crop_h * 0.38)
    refl_scaled = refl_flipped.resize((target_pw, refl_h), Image.Resampling.LANCZOS)

    r_arr = np.array(refl_scaled, dtype=np.float32)
    fade = np.linspace(0.85, 0.05, refl_h, dtype=np.float32)[:, np.newaxis, np.newaxis]
    r_arr[:, :, 3] = r_arr[:, :, 3] * fade[:, :, 0]
    gold_tint = np.array([235.0, 195.0, 85.0], dtype=np.float32)
    r_arr[:, :, :3] = r_arr[:, :, :3] * 0.65 + gold_tint[np.newaxis, np.newaxis, :] * 0.35
    refl_final = Image.fromarray(np.clip(r_arr, 0, 255).astype(np.uint8), mode="RGBA")
    refl_final = refl_final.filter(ImageFilter.GaussianBlur(1.2))

    tray_mask = Image.new("L", (cw, ch), 0)
    tm_draw = ImageDraw.Draw(tray_mask)
    tm_draw.ellipse([cw // 2 - 230, tray_y, cw // 2 + 230, tray_y + tray_h], fill=255)
    tray_mask = tray_mask.filter(ImageFilter.GaussianBlur(3))

    refl_canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    refl_canvas.paste(refl_final, (prod_x, flacon_base_y - 2), mask=refl_final.split()[3])

    m1 = np.array(refl_canvas.split()[3], dtype=np.float32) / 255.0
    m2 = np.array(tray_mask, dtype=np.float32) / 255.0
    refl_clipped = Image.fromarray((m1 * m2 * 255.0).astype(np.uint8))
    canvas.paste(refl_canvas, (0, 0), mask=refl_clipped)

    # 9. Environmental Harmonization on Flacon
    rgb_p = prod_scaled.convert("RGB")
    a_p = prod_scaled.split()[3]
    enh_color = ImageEnhance.Color(rgb_p).enhance(1.15)
    enh_contrast = ImageEnhance.Contrast(enh_color).enhance(1.08)
    flacon_harmonized = Image.merge("RGBA", (*enh_contrast.split(), a_p))

    # Upward warm gold bounce light on lower 25% of bottle (reflecting off gold tray)
    bounce = Image.new("RGBA", (target_pw, target_ph), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(bounce)
    bounce_h = int(target_ph * 0.25)
    for y_b in range(bounce_h):
        alpha_b = int(48 * ((bounce_h - y_b) / float(bounce_h)))
        b_draw.line([(0, target_ph - y_b), (target_pw, target_ph - y_b)], fill=(235, 185, 75, alpha_b))
    bounce = bounce.filter(ImageFilter.GaussianBlur(8))
    m_flacon = np.array(a_p, dtype=np.float32) / 255.0
    m_b = np.array(bounce.split()[3], dtype=np.float32) / 255.0
    bounce_mask = Image.fromarray((m_flacon * m_b * 255.0).astype(np.uint8))
    flacon_harmonized.paste(Image.new("RGB", (target_pw, target_ph), (240, 190, 85)), (0, 0), mask=bounce_mask)

    canvas.paste(flacon_harmonized, (prod_x, prod_y), mask=flacon_harmonized.split()[3])

    # 10. Directional spotlight sheen on left flank of flacon
    sheen = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(sheen)
    sh_draw.polygon(
        [(-50, -50), (prod_x + int(target_pw * 0.45), -50), (prod_x + int(target_pw * 0.65), flacon_base_y), (-50, flacon_base_y)],
        fill=(255, 235, 170, 30)
    )
    sheen = sheen.filter(ImageFilter.GaussianBlur(25))
    prod_mask_full = Image.new("L", (cw, ch), 0)
    prod_mask_full.paste(a_p, (prod_x, prod_y))
    m_sh = np.array(sheen.split()[3], dtype=np.float32) / 255.0
    m_pf = np.array(prod_mask_full, dtype=np.float32) / 255.0
    prod_sheen_mask = Image.fromarray((m_sh * m_pf * 255.0).astype(np.uint8))
    canvas.paste(Image.new("RGB", (cw, ch), (255, 230, 160)), (0, 0), mask=prod_sheen_mask)

    # 11. Seamless border feathering into site background #080605
    arr = np.array(canvas, dtype=np.float32)
    bg = np.array(site_bg, dtype=np.float32)
    y_idx, x_idx = np.indices((ch, cw))
    alpha_l = np.clip(x_idx / 45.0, 0.0, 1.0)
    alpha_r = np.clip((cw - 1 - x_idx) / 45.0, 0.0, 1.0)
    alpha_t = np.clip(y_idx / 35.0, 0.0, 1.0)
    alpha_b = np.clip((ch - 1 - y_idx) / 25.0, 0.0, 1.0)
    b_mask = smoothstep(alpha_l) * smoothstep(alpha_r) * smoothstep(alpha_t) * smoothstep(alpha_b)
    final_arr = arr * b_mask[:, :, np.newaxis] + bg[np.newaxis, np.newaxis, :] * (1.0 - b_mask[:, :, np.newaxis])
    final_rgb = Image.fromarray(np.clip(final_arr, 0, 255).astype(np.uint8), mode="RGB")
    final_alpha = (b_mask * 255.0).astype(np.uint8)
    final_rgba = Image.merge("RGBA", (*final_rgb.split(), Image.fromarray(final_alpha, mode="L")))

    os.makedirs(os.path.dirname(os.path.abspath(output_png)), exist_ok=True)
    final_rgba.save(output_png, "PNG", optimize=True)

    if output_webp:
        os.makedirs(os.path.dirname(os.path.abspath(output_webp)), exist_ok=True)
        final_rgba.save(output_webp, "WEBP", quality=95)

    print(f"Generated vertical studio stage image: {output_png} ({cw}x{ch}, flacon_h={target_ph}px, prod_y={prod_y}px)")
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
