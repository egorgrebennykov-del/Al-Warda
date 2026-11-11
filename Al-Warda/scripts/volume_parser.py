"""Shared, strict product-size parser for Qogita titles.

Mirrors `parseVolumeFromText` in utils/perfumes.js. Supports ml, grams, fl oz, oz and
ounce (including Qogita typos like "34 Oz" = 3.4 oz). Returns "" when the title states
no size, so importers never store an invented "100 мл" placeholder.
"""
import re

STANDARD_ML_SIZES = [
    1, 2, 3, 5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 50, 55, 60, 65, 70, 75, 80,
    85, 90, 100, 105, 110, 120, 125, 150, 200, 250, 300,
]
_NOT_LETTER = r"(?![a-zа-я])"


def _fmt(num):
    return f"{round(num, 2):g}"


def _normalize_ounces(raw):
    raw = raw.replace(",", ".")
    try:
        oz = float(raw)
    except ValueError:
        return None
    if oz <= 0:
        return None
    if "." not in raw and oz >= 10:
        oz = oz / 100 if len(raw) >= 3 else oz / 10
    return oz if 0 < oz <= 34 else None


def _ounces_to_ml(oz):
    exact = oz * 29.5735
    best, best_diff = round(exact), float("inf")
    for std in STANDARD_ML_SIZES:
        diff = abs(exact - std)
        if diff <= max(1, exact * 0.06) and diff < best_diff:
            best, best_diff = std, diff
    return best


def parse_volume(text):
    if not text or not isinstance(text, str):
        return ""
    m = re.search(r"(\d+)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*(?:ml|мл)" + _NOT_LETTER, text, re.I)
    if m:
        return f"{m.group(1)} × {m.group(2).replace(',', '.')} мл"
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:ml|мл|milliliters?|millilitres?)" + _NOT_LETTER, text, re.I)
    if m:
        num = float(m.group(1).replace(",", "."))
        if num > 0:
            return f"{_fmt(num)} мл / {num * 0.033814:.1f} FL.OZ."
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:fl\.?\s*oz\.?|fluid\s*ounces?|oz\.?|ounces?)" + _NOT_LETTER, text, re.I)
    if m:
        oz = _normalize_ounces(m.group(1))
        if oz:
            return f"{_ounces_to_ml(oz)} мл / {_fmt(oz)} FL.OZ."
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:g|gr|gm|grams?|г)" + _NOT_LETTER, text, re.I)
    if m:
        num = float(m.group(1).replace(",", "."))
        if 0 < num <= 500:
            return f"{_fmt(num)} г"
    return ""
