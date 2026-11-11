p = "Al-Warda/scripts/generate_product_images.py"
t = open(p, "rb").read().decode("utf-8").replace("\r\n", "\n")

def rep(old, new):
    global t
    assert t.count(old) == 1, (t.count(old), old[:90])
    t = t.replace(old, new)

# --- 1. fallback description: never invent notes
start = t.index("def generate_luxury_fallback_description(")
end = t.index("def generate_ai_perfume_description(")
new_fallback = '''def generate_luxury_fallback_description(
    name,
    brand,
    notes_summary="",
    category="Восточные",
    top_notes=None,
    heart_notes=None,
    base_notes=None,
    top_notes_en=None,
    heart_notes_en=None,
    base_notes_en=None,
):
    """Luxury description. Fragrance notes are mentioned ONLY when they are verified (passed in);
    otherwise the text is note-free - notes are never guessed."""

    def join(values):
        return ", ".join(values) if isinstance(values, list) else str(values or "")

    has_notes = bool((top_notes or heart_notes or base_notes))
    desc_ru = (
        f"{name} от парфюмерного дома {brand} — роскошный селективный аромат Ближнего Востока, "
        f"созданный в лучших традициях восточного парфюмерного искусства."
    )
    desc_en = (
        f"{name} by {brand} is an opulent niche fragrance of the Middle East, crafted in the finest "
        f"traditions of oriental perfumery."
    )
    if has_notes:
        parts_ru, parts_en = [], []
        if top_notes:
            parts_ru.append(f"верхние ноты — {join(top_notes)}")
        if heart_notes:
            parts_ru.append(f"сердце — {join(heart_notes)}")
        if base_notes:
            parts_ru.append(f"база — {join(base_notes)}")
        if top_notes_en or top_notes:
            parts_en.append(f"top notes of {join(top_notes_en or top_notes)}")
        if heart_notes_en or heart_notes:
            parts_en.append(f"a heart of {join(heart_notes_en or heart_notes)}")
        if base_notes_en or base_notes:
            parts_en.append(f"a base of {join(base_notes_en or base_notes)}")
        desc_ru += " Нотный состав: " + "; ".join(parts_ru) + "."
        desc_en += " The composition features " + ", ".join(parts_en) + "."
    desc_ru += " Оригинальная продукция, поставляется в заводской упаковке."
    desc_en += " Authentic product supplied in factory-sealed packaging."
    return {
        "descriptionRu": desc_ru,
        "descriptionEn": desc_en,
        "description": desc_ru,
        "notesSummary": notes_summary or f"{brand} — {category}",
        "aiModel": "al-warda/luxury-fallback-v2",
    }


'''
t = t[:start] + new_fallback + t[end:]

# --- 2. read ONLY verified notes in the AI description generator
rep('''    top_notes = info.get("topNotes") or info.get("topNotesRu") or []
    heart_notes = info.get("heartNotes") or info.get("heartNotesRu") or []
    base_notes = info.get("baseNotes") or info.get("baseNotesRu") or []
''', '''    verified = bool(info.get("notesVerified"))
    notes_ru = ((info.get("notes") or {}).get("ru") or {}) if verified else {}
    notes_en = ((info.get("notes") or {}).get("en") or {}) if verified else {}
    top_notes = notes_ru.get("top") or []
    heart_notes = notes_ru.get("heart") or []
    base_notes = notes_ru.get("base") or []
    if not verified:
        notes_summary = ""
''')
rep('''        top_notes=top_notes,
        heart_notes=heart_notes,
        base_notes=base_notes,
    )


def generate_product_edit''', '''        top_notes=top_notes,
        heart_notes=heart_notes,
        base_notes=base_notes,
        top_notes_en=notes_en.get("top") or [],
        heart_notes_en=notes_en.get("heart") or [],
        base_notes_en=notes_en.get("base") or [],
    )


def generate_product_edit''')

# --- 3. LLM prompts must not invent notes; dead model names replaced
rep('for model in ("gemini-2.0-flash", "gemini-1.5-flash"):', 'for model in ("gemini-3.8-flash",):')
rep('''f"Known Notes: {notes_summary or 'precious oud, Damascus rose, amber, white musk, rare spices'}\\n\\n"''',
    '''f"Verified Notes: {notes_summary or 'NONE - do not mention any specific fragrance notes, ingredients or accords'}\\n\\n"''')
rep('''"4. Output valid JSON only with keys: descriptionRu, descriptionEn, notesSummary."''',
    '''"4. NEVER invent or guess fragrance notes. Mention only the Verified Notes above; if there are none, describe style and character without naming any ingredients.\\n"
                    "5. Output valid JSON only with keys: descriptionRu, descriptionEn, notesSummary (empty string if no verified notes)."''')
rep('''f"Known notes: {notes_summary or 'oriental precious oud, amber, floral notes, musk'}."''',
    '''f"Verified notes: {notes_summary or 'NONE (do not name any ingredients or notes)'}."''')
rep('''"Always refer to origin as 'Ближний Восток' in Russian''', '''"Never invent fragrance notes: mention only verified notes if provided, otherwise name no ingredients. "
                            "Always refer to origin as 'Ближний Восток' in Russian''')

# --- 4. fetch verified notes inside process_product, before description generation
rep('''        # Generate an evocative luxury description with another AI right after image generation
        try:''', '''        # Fragrance notes: only from a verified public source, never guessed (cleared when not found)
        try:
            apply_verified_notes(
                info,
                fetch_verified_notes(requests, row.get("name") or "", row.get("brand") or ""),
            )
        except Exception as notes_err:
            apply_verified_notes(info, None)
            print(f"Warning: verified notes lookup failed for {row['id']}: {notes_err}", flush=True)

        # Generate an evocative luxury description with another AI right after image generation
        try:''')
rep('''                if desc_result.get("notesSummary") and not info.get("notesSummary"):
                    info["notesSummary"] = desc_result["notesSummary"]''', '''                if info.get("notesVerified") and desc_result.get("notesSummary") and not info.get("notesSummary"):
                    info["notesSummary"] = desc_result["notesSummary"]''')

# import
anchor = "import hashlib\n"
assert t.count(anchor) >= 1
t = t.replace(anchor, anchor + "from fragrance_notes import apply_verified_notes, fetch_verified_notes\n", 1)

open(p, "wb").write(t.replace("\n", "\r\n").encode("utf-8"))

# fragrance_notes: current model name
q = "Al-Warda/scripts/fragrance_notes.py"
s = open(q, encoding="utf-8").read()
s = s.replace('GEMINI_MODELS = ("gemini-2.5-flash", "gemini-2.0-flash")', 'GEMINI_MODELS = ("gemini-3.8-flash",)')
open(q, "w", encoding="utf-8").write(s)
print("ok")
