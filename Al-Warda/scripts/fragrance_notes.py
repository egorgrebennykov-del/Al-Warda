"""Verified fragrance-note lookup against the free 10ML Fragrance Index.

Fragrance notes must never be guessed from the product name or category. This module
queries the 10ML REST API (https://mcp.10ml.com/api/v1), matches the store product to an
index record and returns the official note pyramid. If no confident match is found it
returns None and the caller must show NO notes instead of invented ones.
"""
import json
import re
import unicodedata
from datetime import datetime, timezone
from urllib.parse import quote, urlencode

INDEX_BASE_URL = "https://mcp.10ml.com/api/v1"
MIN_MATCH_SCORE = 65
MAX_SEARCH_RESULTS = 10
MAX_DETAIL_CANDIDATES = 3

NOISE_TOKENS = {
    "edp", "edt", "edc", "pdt", "cologne", "parfum", "extrait", "pure", "spray",
    "fragrance", "perfume", "vaporisateur", "vaporizer", "limited", "edition",
}

CONCENTRATION_PATTERNS = (
    ("extrait", re.compile(r"\bextrait\b")),
    ("parfum", re.compile(r"\bparfum\b")),
    ("edp", re.compile(r"\beau de parfum\b|\bedp\b")),
    ("edt", re.compile(r"\beau de toilette\b|\bedt\b")),
    ("edc", re.compile(r"\beau de cologne\b|\bedc\b|\bcologne\b")),
    ("elixir", re.compile(r"\belixir\b")),
)

_SMALL_WORDS = {"of", "and", "the", "de"}


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _normalize_text(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[’'`]", "", text).lower()
    text = text.replace("&", " and ")
    return re.sub(r"\s+", " ", text).strip()


def _strip_marketing_noise(value):
    text = _normalize_text(value)
    text = re.sub(r"\b\d+\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:ml|мл)\b", " ", text)
    text = re.sub(r"\b\d+(?:[.,]\d+)?\s*(?:ml|мл|oz|fl\.?\s*oz\.?|ounces?)\b", " ", text)
    text = re.sub(
        r"\beau de parfum\b|\beau de toilette\b|\beau de cologne\b|\bextrait de parfum\b|"
        r"\bpure parfum\b|\bparfum\b|\bedp\b|\bedt\b|\bedc\b|\bpdt\b|\bcologne\b",
        " ",
        text,
    )
    text = re.sub(r"\bfor\s+(?:men|women|him|her|unisex)\b", " ", text)
    text = re.sub(r"\b(?:men|women|unisex)\s+fragrance\b", " ", text)
    text = re.sub(r"\blimited\s+edition\b", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _tokenize_name(value):
    return [token for token in _strip_marketing_noise(value).split(" ") if token and token not in NOISE_TOKENS]


def _detect_concentration(value):
    text = _normalize_text(value)
    best = None
    for key, pattern in CONCENTRATION_PATTERNS:
        match = pattern.search(text)
        if match and (best is None or match.start() < best[1]):
            best = (key, match.start())
    return best[0] if best else ""


def _concentration_family(key):
    if not key:
        return ""
    return "parfum" if key == "extrait" else key


def _name_tokens_for_scoring(name, brand):
    tokens = _tokenize_name(name)
    brand_tokens = _tokenize_name(brand)
    if brand_tokens and all(token in tokens for token in brand_tokens):
        brand_set = set(brand_tokens)
        tokens = [token for token in tokens if token not in brand_set]
    return tokens


def _token_match_score(input_tokens, candidate_tokens):
    if not input_tokens or not candidate_tokens:
        return 0
    input_set = set(input_tokens)
    candidate_set = set(candidate_tokens)
    input_unique = list(input_set)
    candidate_unique = list(candidate_set)

    if len(input_unique) == len(candidate_unique) and all(token in candidate_set for token in input_unique):
        return 100
    if all(token in candidate_set for token in input_unique):
        return 85
    if all(token in input_set for token in candidate_unique):
        return 80

    shared = sum(1 for token in input_unique if token in candidate_set)
    ratio = shared / max(len(input_unique), len(candidate_unique))
    return 65 if ratio >= 0.8 else 0


def _score_candidate(candidate, name, brand, concentration=""):
    if not candidate:
        return 0
    input_tokens = _name_tokens_for_scoring(name, brand)
    candidate_tokens = _tokenize_name(candidate.get("name"))
    score = _token_match_score(input_tokens, candidate_tokens)
    if not score:
        return 0

    brand_tokens = _tokenize_name(brand)
    if brand_tokens:
        house_tokens = _tokenize_name(candidate.get("house"))
        if not house_tokens or not any(token in house_tokens for token in brand_tokens):
            return 0

    requested = concentration or _detect_concentration(name) or _detect_concentration(brand)
    candidate_concentration = _detect_concentration(candidate.get("concentration")) or _detect_concentration(candidate.get("name"))
    if requested and candidate_concentration:
        if _concentration_family(requested) == _concentration_family(candidate_concentration):
            score += 20
        else:
            score -= 20
    return score


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


def _clean_list(values, limit=8):
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


def _normalize_pyramid(pyramid):
    if not isinstance(pyramid, dict):
        return None
    top = _clean_list(pyramid.get("top"))
    heart = _clean_list(pyramid.get("heart"))
    base = _clean_list(pyramid.get("base"))
    if not (top or heart or base):
        return None
    # 10ML stores notes in English. The storefront translates them through
    # getLocalizedNote(), so both language buckets intentionally keep English values.
    return {
        "en": {"top": top, "heart": heart, "base": base},
        "ru": {"top": list(top), "heart": list(heart), "base": list(base)},
    }


def _fetch_json(requests_module, url, timeout):
    try:
        response = requests_module.get(
            url,
            headers={"Accept": "application/json", "User-Agent": "Al-Warda-Fragrance-Index/1.0"},
            timeout=timeout,
        )
    except Exception as exc:  # noqa: BLE001 - network failures must not crash the pipeline
        return None, False, str(exc)
    if response.status_code == 404:
        return None, True, None
    if not response.ok:
        return None, False, f"10ML responded with HTTP {response.status_code}"
    try:
        return response.json(), False, None
    except (ValueError, json.JSONDecodeError):
        return None, False, "10ML returned invalid JSON"


def _detail_url(query_or_id):
    return f"{INDEX_BASE_URL}/perfumes/{quote(str(query_or_id), safe='')}?format=detailed"


def _has_notes(pyramid):
    if not isinstance(pyramid, dict):
        return False
    return any(isinstance(pyramid.get(layer), list) and pyramid.get(layer) for layer in ("top", "heart", "base"))


def lookup_fragrance_index(requests_module, name, brand, timeout=20):
    """Look up a note pyramid in 10ML. Returns a lookup dict with status/notes/matched."""
    clean_name = str(name or "").strip()
    clean_brand = str(brand or "").strip()
    checked_at = _now_iso()
    if not clean_name:
        return {
            "status": "error",
            "notes": None,
            "matched": None,
            "source": "10ml",
            "error": "Perfume name is required",
            "checkedAt": checked_at,
        }
    if not requests_module:
        return {
            "status": "error",
            "notes": None,
            "matched": None,
            "source": "10ml",
            "error": "requests module is required",
            "checkedAt": checked_at,
        }

    query = " ".join(part for part in (clean_brand, clean_name) if part)
    concentration = _detect_concentration(f"{clean_name} {clean_brand}")

    record = None
    score = 0
    method = ""

    # Fast path: the detail endpoint resolves simple names in a single request.
    exact, _not_found, error = _fetch_json(requests_module, _detail_url(query), timeout)
    if error:
        return {
            "status": "error", "notes": None, "matched": None, "source": "10ml",
            "error": error, "query": query, "checkedAt": checked_at,
        }
    if isinstance(exact, dict) and exact.get("found") and exact.get("exact") is True and exact.get("perfume"):
        candidate = exact["perfume"]
        candidate_score = _score_candidate(candidate, clean_name, clean_brand, concentration)
        requested_family = _concentration_family(concentration)
        found_family = _concentration_family(_detect_concentration(candidate.get("concentration")))
        concentration_compatible = not requested_family or not found_family or requested_family == found_family
        if candidate_score >= MIN_MATCH_SCORE and concentration_compatible:
            record = candidate
            score = candidate_score
            method = "exact"

    if record is None:
        search_url = f"{INDEX_BASE_URL}/perfumes?{urlencode({'q': query, 'limit': MAX_SEARCH_RESULTS})}"
        search, _not_found, error = _fetch_json(requests_module, search_url, timeout)
        if error:
            return {
                "status": "error", "notes": None, "matched": None, "source": "10ml",
                "error": error, "query": query, "checkedAt": checked_at,
            }

        ranked = []
        for candidate in (search or {}).get("results") or []:
            candidate_score = _score_candidate(candidate, clean_name, clean_brand, concentration)
            if candidate_score >= MIN_MATCH_SCORE:
                ranked.append((candidate, candidate_score))
        ranked.sort(key=lambda entry: entry[1], reverse=True)

        for candidate, candidate_score in ranked[:MAX_DETAIL_CANDIDATES]:
            detail, _not_found, error = _fetch_json(
                requests_module,
                _detail_url(candidate.get("id") or candidate.get("name")),
                timeout,
            )
            if error:
                return {
                    "status": "error", "notes": None, "matched": None, "source": "10ml",
                    "error": error, "query": query, "checkedAt": checked_at,
                }
            perfume = (detail or {}).get("perfume") if isinstance(detail, dict) and detail.get("found") else None
            if perfume and _has_notes(perfume.get("pyramid")):
                record = perfume
                score = candidate_score
                method = "search"
                break

    if not record:
        return {
            "status": "not_found",
            "notes": None,
            "matched": None,
            "source": "10ml",
            "reason": "not_found",
            "query": query,
            "checkedAt": checked_at,
        }

    notes = _normalize_pyramid(record.get("pyramid"))
    if not notes:
        return {
            "status": "not_found",
            "notes": None,
            "matched": None,
            "source": "10ml",
            "reason": "empty_pyramid",
            "query": query,
            "checkedAt": checked_at,
        }

    return {
        "status": "found",
        "notes": notes,
        "matched": {
            "id": record.get("id"),
            "name": record.get("name"),
            "house": record.get("house"),
            "concentration": record.get("concentration"),
            "score": score,
            "method": method,
        },
        "source": "10ml",
        "query": query,
        "checkedAt": checked_at,
    }


def fetch_verified_notes(requests_module, name, brand, gemini_key=None, timeout=20):
    """Return {"top","heart","base","topRu","heartRu","baseRu","source"} or None.

    `gemini_key` is accepted for backwards compatibility and ignored: notes now come
    exclusively from the 10ML Fragrance Index.
    """
    lookup = lookup_fragrance_index(requests_module, name, brand, timeout=timeout)
    if lookup.get("status") != "found":
        return None

    notes = (lookup.get("notes") or {}).get("en") or {}
    if not (notes.get("top") or notes.get("heart") or notes.get("base")):
        return None

    return {
        "top": list(notes.get("top") or []),
        "heart": list(notes.get("heart") or []),
        "base": list(notes.get("base") or []),
        "topRu": list(notes.get("top") or []),
        "heartRu": list(notes.get("heart") or []),
        "baseRu": list(notes.get("base") or []),
        "source": "10ml",
        "query": lookup.get("query"),
        "matched": lookup.get("matched"),
        "score": (lookup.get("matched") or {}).get("score"),
    }


def apply_verified_notes(info, notes):
    """Write verified notes into info, or clear invented ones without touching manual notes."""
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
            "source": "10ml",
            "checkedAt": _now_iso(),
            "reason": "not_found",
            "matched": None,
        }
        if not manual_verified:
            info["notesVerified"] = False
            info.pop("notes", None)
            info.pop("notesSummary", None)
            info.pop("notesSummaryEn", None)
            info.setdefault("notesSource", "10ml")
        return info

    info["notesVerified"] = True
    info["notesSource"] = notes.get("source") or "10ml"
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
        "matched": notes.get("matched"),
        "score": notes.get("score"),
    }
    return info
