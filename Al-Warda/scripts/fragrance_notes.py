"""Verified fragrance-note lookup.

Fragrance notes must never be guessed from the product name or category. This module asks
Gemini with Google Search grounding to find the official note pyramid on public fragrance
databases (Fragrantica, Parfumo, brand site, retailers). If the notes are not found with
confidence, it returns None and the caller must show NO notes instead of invented ones.
"""
import json
import os
import re

GEMINI_MODELS = ("gemini-3.8-flash",)
RU_TRANSLATE_HINT = (
    "Also give the same notes translated to Russian in the same order (topRu, heartRu, baseRu)."
)


def _extract_json(text):
    if not text:
        return None
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except ValueError:
        return None


def _clean_list(values, limit=8):
    if not isinstance(values, list):
        return []
    cleaned = []
    for value in values:
        text = str(value or "").strip()
        if text and text.lower() not in {n.lower() for n in cleaned}:
            cleaned.append(text)
    return cleaned[:limit]


def fetch_verified_notes(requests_module, name, brand, gemini_key=None, timeout=60):
    """Return {"top","heart","base","topRu","heartRu","baseRu","source"} or None."""
    gemini_key = gemini_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("VITE_GEMINI_API_KEY")
    if not gemini_key or not requests_module:
        return None

    prompt = (
        f"Perfume: {brand} {name}\n\n"
        "Use Google Search to find the OFFICIAL fragrance note pyramid (top, heart, base notes) of this exact "
        "perfume on Fragrantica, Parfumo, the brand's website or a major retailer. "
        "Rules:\n"
        "- Only report notes you actually found on a page for this exact perfume (same name and concentration).\n"
        "- NEVER guess, infer from the name, or use typical notes for the perfume family.\n"
        "- If the page lists a single flat list of notes (no pyramid), put them all in `heart` and leave top/base empty.\n"
        "- If you cannot find the notes with confidence, return found=false.\n"
        f"- {RU_TRANSLATE_HINT}\n"
        'Reply with ONLY JSON: {"found": true|false, "top": [], "heart": [], "base": [], '
        '"topRu": [], "heartRu": [], "baseRu": [], "sourceUrl": ""}'
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0},
    }
    for model in GEMINI_MODELS:
        try:
            response = requests_module.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={gemini_key}",
                json=payload,
                timeout=timeout,
            )
            if not response.ok:
                continue
            candidate = (response.json().get("candidates") or [None])[0] or {}
            parts = (candidate.get("content") or {}).get("parts") or []
            parsed = _extract_json("".join(part.get("text", "") for part in parts))
            if not parsed or not parsed.get("found"):
                continue
            result = {
                "top": _clean_list(parsed.get("top")),
                "heart": _clean_list(parsed.get("heart")),
                "base": _clean_list(parsed.get("base")),
                "topRu": _clean_list(parsed.get("topRu")),
                "heartRu": _clean_list(parsed.get("heartRu")),
                "baseRu": _clean_list(parsed.get("baseRu")),
                "source": str(parsed.get("sourceUrl") or "").strip()[:300],
            }
            # Must be sourced: a result without a source URL is treated as unverified.
            if not result["source"] or not (result["top"] or result["heart"] or result["base"]):
                continue
            # Russian lists fall back to English only if translation is missing entirely.
            for key in ("top", "heart", "base"):
                if not result[key + "Ru"]:
                    result[key + "Ru"] = list(result[key])
            return result
        except Exception:
            continue
    return None


def apply_verified_notes(info, notes):
    """Write verified notes into info, or clear any invented ones."""
    for key in ("topNotes", "heartNotes", "baseNotes", "topNotesRu", "heartNotesRu", "baseNotesRu",
                "topNotesEn", "heartNotesEn", "baseNotesEn"):
        info.pop(key, None)
    if not notes:
        info["notesVerified"] = False
        info.pop("notes", None)
        info.pop("notesSummary", None)
        info.pop("notesSummaryEn", None)
        info.pop("notesSource", None)
        return info
    info["notesVerified"] = True
    info["notesSource"] = notes["source"]
    info["notes"] = {
        "ru": {"top": notes["topRu"], "heart": notes["heartRu"], "base": notes["baseRu"]},
        "en": {"top": notes["top"], "heart": notes["heart"], "base": notes["base"]},
    }
    info["notesSummary"] = " · ".join((notes["topRu"][:2] + notes["heartRu"][:1] + notes["baseRu"][:1]))
    info["notesSummaryEn"] = " · ".join((notes["top"][:2] + notes["heart"][:1] + notes["base"][:1]))
    return info
