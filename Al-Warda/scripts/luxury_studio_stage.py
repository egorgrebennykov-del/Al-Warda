#!/usr/bin/env python3
"""
Luxury Studio Stage Compositor for Al-Warda Fragrances.
Renders product flacons and sets onto a 3D luxury golden metallic podium tray,
with real optical mirror reflection, contact shadows, atmospheric volumetric spotlight beam,
warm ambient backlighting, and seamless edge feathering into the site's dark background (#090604).
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

BG_COLOR = (9, 6, 4)

def multiply_masks(m1, m2):
    a1 = np.array(m1, dtype=np.float32) / 255.0
    a2 = np.array(m2, dtype=np.float32) / 255.0
    return Image.fromarray((a1 * a2 * 255.0).astype(np.uint8))

def compose_luxury_studio_stage(product_rgba, width=1024, height=1024):
    """
    Given an RGBA product cutout image, places it directly on a luxury golden podium tray,
    calculates optical reflections, contact shadows, volumetric top-left lighting,
    and returns a 1024x1024 RGB image that seamlessly merges with Al-Warda's dark theme (#090604).
    """
    canvas = Image.new("RGB", (width, height), BG_COLOR)
    
    # 1. Warm Volumetric Spotlight Beam from top-left corner
    spotlight = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    sp_draw = ImageDraw.Draw(spotlight)
    beam_points = [
        (-60, -60),
        (int(width * 0.48), -60),
        (int(width * 0.98), height),
        (-60, height)
    ]
    sp_draw.polygon(beam_points, fill=(245, 210, 130, 52))
    spotlight = spotlight.filter(ImageFilter.GaussianBlur(68))
    canvas.paste(Image.new("RGB", (width, height), (225, 185, 85)), (0, 0), mask=spotlight.split()[3])

    # 2. Backlight Aura behind product
    aura = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    aura_draw = ImageDraw.Draw(aura)
    cx, cy = width // 2, int(height * 0.48)
    aura_rx, aura_ry = int(width * 0.34), int(height * 0.34)
    for r in range(aura_rx, 0, -6):
        alpha = int(32 * (1.0 - (r / aura_rx)))
        aura_draw.ellipse([cx - r, cy - int(r * 0.9), cx + r, cy + int(r * 0.9)], fill=(225, 175, 55, alpha))
    aura = aura.filter(ImageFilter.GaussianBlur(45))
    canvas.paste(Image.new("RGB", (width, height), (225, 175, 55)), (0, 0), mask=aura.split()[3])

    # 3. Product sizing & positioning
    bbox = product_rgba.getbbox()
    if not bbox:
        return canvas
    
    prod_crop = product_rgba.crop(bbox)
    pw, ph = prod_crop.size

    # Target height for product is ~56-62% of canvas
    target_ph = int(height * 0.58)
    scale = target_ph / ph
    target_pw = int(pw * scale)
    if target_pw > int(width * 0.74):
        scale = int(width * 0.74) / pw
        target_pw = int(pw * scale)
        target_ph = int(ph * scale)

    prod_scaled = prod_crop.resize((target_pw, target_ph), Image.Resampling.LANCZOS)

    # Product placement: base at ~78% height
    prod_x = (width - target_pw) // 2
    prod_bottom = int(height * 0.78)
    prod_y = prod_bottom - target_ph

    # 4. Golden Metallic Podium Tray
    tray_cx = width // 2
    tray_cy = prod_bottom + 12
    tray_rx = int(max(target_pw * 0.75, width * 0.36))
    tray_ry = int(tray_rx * 0.22)
    rim_h = int(tray_ry * 0.45)

    # Under-podium floor shadow
    shadow_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(shadow_img)
    sh_draw.ellipse(
        [tray_cx - tray_rx - 50, tray_cy + rim_h - 10, tray_cx + tray_rx + 50, tray_cy + rim_h + tray_ry + 25],
        fill=(0, 0, 0, 235)
    )
    shadow_img = shadow_img.filter(ImageFilter.GaussianBlur(25))
    canvas.paste(Image.new("RGB", (width, height), (0, 0, 0)), (0, 0), mask=shadow_img.split()[3])

    # Golden podium rim (cylinder)
    rim_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    rim_draw = ImageDraw.Draw(rim_img)

    for x in range(tray_cx - tray_rx, tray_cx + tray_rx):
        norm_x = (x - (tray_cx - tray_rx)) / (2.0 * tray_rx)
        dx = (x - tray_cx) / tray_rx
        if abs(dx) <= 1.0:
            dy = np.sqrt(max(0.0, 1.0 - dx * dx)) * tray_ry
            top_y = int(tray_cy + dy * 0.1)
            bot_y = int(tray_cy + dy + rim_h)

            if norm_x < 0.2:
                r, g, b = int(90 + norm_x * 300), int(65 + norm_x * 220), int(20 + norm_x * 70)
            elif norm_x < 0.45:
                t = (norm_x - 0.2) / 0.25
                r = int(150 + t * 95)
                g = int(115 + t * 95)
                b = int(45 + t * 85)
            elif norm_x < 0.75:
                t = (norm_x - 0.45) / 0.3
                r = int(245 - t * 75)
                g = int(210 - t * 75)
                b = int(130 - t * 75)
            else:
                t = (norm_x - 0.75) / 0.25
                r = int(170 - t * 90)
                g = int(135 - t * 75)
                b = int(55 - t * 35)

            rim_draw.line([(x, top_y), (x, bot_y)], fill=(r, g, b, 255), width=1)

    rim_draw.arc(
        [tray_cx - tray_rx, tray_cy + rim_h - tray_ry, tray_cx + tray_rx, tray_cy + rim_h + tray_ry],
        0, 180, fill=(130, 95, 28, 255), width=2
    )
    canvas.paste(rim_img, (0, 0), mask=rim_img.split()[3])

    # 5. Golden podium top surface (metallic ellipse)
    top_surf = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    top_draw = ImageDraw.Draw(top_surf)
    top_box = [tray_cx - tray_rx, tray_cy - tray_ry, tray_cx + tray_rx, tray_cy + tray_ry]
    top_draw.ellipse(top_box, fill=(185, 145, 55, 255))

    for step in range(32):
        factor = step / 32.0
        erx = int(tray_rx * (1.0 - factor * 0.4))
        ery = int(tray_ry * (1.0 - factor * 0.4))
        ecx = int(tray_cx - tray_rx * 0.15 * factor)
        ecy = int(tray_cy - tray_ry * 0.15 * factor)
        alpha = int(12 + factor * 24)
        top_draw.ellipse([ecx - erx, ecy - ery, ecx + erx, ecy + ery], fill=(245, 220, 130, alpha))

    # Top rim bevel highlight
    top_draw.arc(top_box, 0, 180, fill=(255, 242, 185, 245), width=2)
    top_draw.arc(top_box, 180, 360, fill=(110, 80, 22, 180), width=1)
    canvas.paste(top_surf, (0, 0), mask=top_surf.split()[3])

    # 6. Mirror Reflection of Product on Golden Tray
    refl_height = int(target_ph * 0.42)
    refl_crop = prod_scaled.crop((0, target_ph - refl_height, target_pw, target_ph))
    refl_flipped = ImageOps.flip(refl_crop)
    refl_h_comp = int(refl_height * 0.32)
    refl_scaled = refl_flipped.resize((target_pw, refl_h_comp), Image.Resampling.LANCZOS)

    r_arr = np.array(refl_scaled)
    fade = np.linspace(0.55, 0.0, refl_h_comp, dtype=np.float32)[:, np.newaxis]
    r_arr[:, :, 3] = (r_arr[:, :, 3].astype(np.float32) * fade).astype(np.uint8)

    gold_tint = np.array([215, 175, 75], dtype=np.float32) / 255.0
    r_arr[:, :, :3] = np.clip(
        r_arr[:, :, :3].astype(np.float32) * 0.65 + r_arr[:, :, :3].astype(np.float32) * gold_tint * 0.35,
        0, 255
    ).astype(np.uint8)

    refl_img = Image.fromarray(r_arr)
    refl_canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    refl_canvas.paste(refl_img, (prod_x, prod_bottom + 1), mask=refl_img.split()[3])

    tray_mask = Image.new("L", (width, height), 0)
    tm_draw = ImageDraw.Draw(tray_mask)
    tm_draw.ellipse(top_box, fill=255)
    canvas.paste(refl_canvas, (0, 0), mask=multiply_masks(refl_canvas.split()[3], tray_mask))

    # 7. Contact Shadow under product base
    contact_sh = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    csh_draw = ImageDraw.Draw(contact_sh)
    csh_draw.ellipse([prod_x + 10, prod_bottom - 5, prod_x + target_pw - 10, prod_bottom + 10], fill=(15, 10, 5, 235))
    contact_sh = contact_sh.filter(ImageFilter.GaussianBlur(5))
    canvas.paste(Image.new("RGB", (width, height), (10, 6, 2)), (0, 0), mask=contact_sh.split()[3])

    # 8. Product Itself
    canvas.paste(prod_scaled, (prod_x, prod_y), mask=prod_scaled.split()[3])

    # 9. Top-left spotlight sheen overlay on product
    sheen = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(sheen)
    sh_draw.polygon(
        [(-50, -50), (int(width * 0.42), -50), (prod_x + int(target_pw * 0.45), prod_y + target_ph), (-50, height)],
        fill=(255, 240, 190, 32)
    )
    sheen = sheen.filter(ImageFilter.GaussianBlur(40))

    prod_mask = Image.new("L", (width, height), 0)
    prod_mask.paste(prod_scaled.split()[3], (prod_x, prod_y))
    combined_sheen = multiply_masks(sheen.split()[3], prod_mask)
    canvas.paste(Image.new("RGB", (width, height), (255, 235, 170)), (0, 0), mask=combined_sheen)

    # 10. Seamless edge feathering into #090604
    vignette = Image.new("L", (width, height), 0)
    v_draw = ImageDraw.Draw(vignette)
    v_draw.ellipse([20, 20, width - 20, height - 20], fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(65))

    bg_full = Image.new("RGB", (width, height), BG_COLOR)
    final_canvas = Image.composite(canvas, bg_full, vignette)
    return final_canvas
