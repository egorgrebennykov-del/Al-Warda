"""DeepSeek-generated fragrance note pyramids.

Every product must show an olfactory pyramid. This module asks the DeepSeek chat
API for the notes of a fragrance and returns them in the shape the storefront
expects (`{"en": {...}, "ru": {...}}`). The caller persists the result in
Supabase (`stocks.info`) so each perfume is generated only once.

The API key is read from `DEEPSEEK_API_KEY` and must never be committed: this
repository is public. Use a local `.env` or the worker secret instead.
"""
import json
import os
import re
import unicodedata
from datetime import datetime, timezone

DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"
MAX_NOTES_PER_LAYER = 8

_SMALL_WORDS = {"of", "and", "the", "de"}


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _resolve_api_key(explicit=None):
    return str(explicit or os.environ.get("DEEPSEEK_API_KEY") or "").strip()


def _format_note_name(note):
    text = str(note or "").strip()
    if not text:
        return ""
    words = []
    for index, word in enumerate(re.split(r"\s+", text)):
        lower = word.lower()
        if index > 0 and lower in _SMALL_WORDS:
            words.append(lower)
        else:
            words.append(lower[:1].upper() + lower[1:])
    return " ".join(words)


def _clean_list(values, limit=MAX_NOTES_PER_LAYER):
    if not isinstance(values, list):
        return []
    cleaned = []
    seen = set()
    for value in values:
        note = _format_note_name(value)
        key = note.lower()
        if not note or key in seen:
            continue
        seen.add(key)
        cleaned.append(note)
        if len(cleaned) >= limit:
            break
    return cleaned


def _extract_json_object(content):
    """Parse the model reply, tolerating markdown fences and stray prose."""
    text = str(content or "").strip()
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    candidate = fenced.group(1).strip() if fenced else text
    try:
        return json.loads(candidate)
    except (ValueError, json.JSONDecodeError):
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        try:
            return json.loads(candidate[start:end + 1])
        except (ValueError, json.JSONDecodeError):
            return None


def _normalize_pyramid(payload):
    """Accept flat `{top,heart,base,topRu,...}` or nested `{en,ru}` payloads."""
    if not isinstance(payload, dict):
        return None

    en_source = payload.get("en") if isinstance(payload.get("en"), dict) else payload
    ru_source = payload.get("ru") if isinstance(payload.get("ru"), dict) else payload

    top = _clean_list(en_source.get("top") or en_source.get("topNotes"))
    heart = _clean_list(en_source.get("heart") or en_source.get("heartNotes"))
    base = _clean_list(en_source.get("base") or en_source.get("baseNotes"))

    top_ru = _clean_list(
        ru_source.get("topRu") or ru_source.get("top") or en_source.get("top") or en_source.get("topNotes")
    )
    heart_ru = _clean_list(
        ru_source.get("heartRu") or ru_source.get("heart") or en_source.get("heart") or en_source.get("heartNotes")
    )
    base_ru = _clean_list(
        ru_source.get("baseRu") or ru_source.get("base") or en_source.get("base") or en_source.get("baseNotes")
    )

    if not (top or heart or base):
        return None

    return {
        "en": {"top": top, "heart": heart, "base": base},
        "ru": {
            "top": top_ru or list(top),
            "heart": heart_ru or list(heart),
            "base": base_ru or list(base),
        },
    }


def _build_messages(name, brand):
    return [
        {
            "role": "system",
            "content": (
                "You are a professional perfumer and fragrance database. "
                "You return official olfactory pyramids as strict JSON. "
                "Never include explanations or markdown outside the JSON object."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Perfume name: {name}\n"
                f"Brand/house: {brand or 'unknown'}\n\n"
                "Return the olfactory pyramid for this exact fragrance. "
                "Respond with JSON only in this shape:\n"
                '{"top":["..."],"heart":["..."],"base":["..."],'
                '"topRu":["..."],"heartRu":["..."],"baseRu":["..."]}\n'
                "Rules:\n"
                "- 3 to 8 notes per layer.\n"
                "- top/heart/base must contain English note names.\n"
                "- topRu/heartRu/baseRu must contain the same notes translated to Russian.\n"
                "- Use the real notes of this fragrance when known; otherwise give the most plausible notes for its fragrance family.\n"
                "- Return every key even if a layer is short."
            ),
        },
    ]


def lookup_fragrance_notes(requests_module, name, brand, api_key=None, timeout=60):
    """Generate a note pyramid with DeepSeek.

    Returns a lookup dict with `status` (`found`, `not_found` or `error`),
    `notes` (nested `{en, ru}`), `source` and `checkedAt`.
    """
    clean_name = str(name or "").strip()
    clean_brand = str(brand or "").strip()
    checked_at = _now_iso()
    query = " ".join(part for part in (clean_brand, clean_name) if part)

    if not clean_name:
        return {
            "status": "error",
            "notes": None,
            "source": "deepseek",
            "error": "Perfume name is required",
            "checkedAt": checked_at,
        }
    if not requests_module:
        return {
            "status": "error",
            "notes": None,
            "source": "deepseek",
            "error": "requests module is required",
            "checkedAt": checked_at,
        }

    key = _resolve_api_key(api_key)
    if not key:
        return {
            "status": "error",
            "notes": None,
            "source": "deepseek",
            "error": "DEEPSEEK_API_KEY is not configured",
            "query": query,
            "checkedAt": checked_at,
        }

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": _build_messages(clean_name, clean_brand),
        "temperature": 0.3,
        "max_tokens": 900,
        "response_format": {"type": "json_object"},
    }

    try:
        response = requests_module.post(
            DEEPSEEK_API_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
            },
            json=payload,
            timeout=timeout,
        )
    except Exception as exc:  # noqa: BLE001 - network failures must not crash the pipeline
        return {
            "status": "error",
            "notes": None,
            "source": "deepseek",
            "error": str(exc),
            "query": query,
            "checkedAt": checked_at,
        }

    if not response.ok:
        detail = ""
        try:
            error_payload = response.json()
            detail = (error_payload.get("error") or {}).get("message") or error_payload.get("message") or ""
        except (ValueError, json.JSONDecodeError):
            detail = response.text[:200] if hasattr(response, "text") else ""
        return {
            "status": "error",
            "notes": None,
            "source": "deepseek",
            "error": f"DeepSeek responded with HTTP {response.status_code}" + (f": {detail}" if detail else ""),
            "query": query,
            "checkedAt": checked_at,
        }

    try:
        data = response.json()
    except (ValueError, json.JSONDecodeError):
        return {
            "status": "error",
            "notes": None,
            "source": "deepseek",
            "error": "DeepSeek returned invalid JSON",
            "query": query,
            "checkedAt": checked_at,
        }

    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        content = ""

    notes = _normalize_pyramid(_extract_json_object(content))
    if not notes:
        return {
            "status": "not_found",
            "notes": None,
            "source": "deepseek",
            "reason": "empty_pyramid",
            "query": query,
            "checkedAt": checked_at,
        }

    return {
        "status": "found",
        "notes": notes,
        "source": "deepseek",
        "model": DEEPSEEK_MODEL,
        "query": query,
        "checkedAt": checked_at,
    }


def fetch_verified_notes(requests_module, name, brand, api_key=None, timeout=60, **_ignored):
    """Return `{"top","heart","base","topRu","heartRu","baseRu","source"}` or None.

    Kept compatible with `generate_product_images.py`: notes are generated by
    DeepSeek from the product name and brand.
    """
    lookup = lookup_fragrance_notes(requests_module, name, brand, api_key=api_key, timeout=timeout)
    if lookup.get("status") == "error":
        # A transient DeepSeek failure must not wipe notes that are already shown.
        return {"error": lookup.get("error") or "DeepSeek request failed", "source": "deepseek"}
    if lookup.get("status") != "found":
        return None

    notes = (lookup.get("notes") or {})
    en_notes = notes.get("en") or {}
    ru_notes = notes.get("ru") or {}
    if not (en_notes.get("top") or en_notes.get("heart") or en_notes.get("base")):
        return None

    return {
        "top": list(en_notes.get("top") or []),
        "heart": list(en_notes.get("heart") or []),
        "base": list(en_notes.get("base") or []),
        "topRu": list(ru_notes.get("top") or en_notes.get("top") or []),
        "heartRu": list(ru_notes.get("heart") or en_notes.get("heart") or []),
        "baseRu": list(ru_notes.get("base") or en_notes.get("base") or []),
        "source": "deepseek",
        "query": lookup.get("query"),
    }


def apply_verified_notes(info, notes):
    """Write generated notes into info, or clear invented ones without touching manual notes."""
    if isinstance(notes, dict) and notes.get("error"):
        info["notesLookup"] = {
            "status": "error",
            "source": "deepseek",
            "checkedAt": _now_iso(),
            "error": notes["error"],
        }
        return info

    for key in ("topNotes", "heartNotes", "baseNotes", "topNotesRu", "heartNotesRu", "baseNotesRu",
                "topNotesEn", "heartNotesEn", "baseNotesEn"):
        info.pop(key, None)

    manual_verified = (
        info.get("notesVerified") is True
        and info.get("notesSource") == "manual"
        and isinstance(info.get("notes"), dict)
    )

    if not notes:
        info["notesLookup"] = {
            "status": "not_found",
            "source": "deepseek",
            "checkedAt": _now_iso(),
            "reason": "empty_pyramid",
        }
        if not manual_verified:
            info["notesVerified"] = False
            info.pop("notes", None)
            info.pop("notesSummary", None)
            info.pop("notesSummaryEn", None)
            info.setdefault("notesSource", "deepseek")
        return info

    info["notesVerified"] = True
    info["notesSource"] = notes.get("source") or "deepseek"
    info["notes"] = {
        "ru": {"top": notes["topRu"], "heart": notes["heartRu"], "base": notes["baseRu"]},
        "en": {"top": notes["top"], "heart": notes["heart"], "base": notes["base"]},
    }
    info["notesSummary"] = " · ".join((notes["topRu"][:2] + notes["heartRu"][:1] + notes["baseRu"][:1]))
    info["notesSummaryEn"] = " · ".join((notes["top"][:2] + notes["heart"][:1] + notes["base"][:1]))
    info["notesLookup"] = {
        "status": "found",
        "source": info["notesSource"],
        "checkedAt": _now_iso(),
        "query": notes.get("query"),
        "model": DEEPSEEK_MODEL,
        "generated": True,
    }
    return info
