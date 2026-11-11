p = "Al-Warda/tests/test_product_image_generation.py"
raw = open(p, "rb").read().decode("utf-8")
crlf = "\r\n" in raw
t = raw.replace("\r\n", "\n")
old = '''        self.assertIn("шлейф", result["descriptionRu"])
        self.assertGreater(len(result["descriptionRu"]), 150)
'''
new = '''        self.assertGreater(len(result["descriptionRu"]), 100)
        # Notes must never be invented: no pyramid wording or stock ingredients without verified notes
        for invented in ("Шафран", "Бергамот", "Розовый перец", "Saffron", "Bergamot", "верхн", "top notes"):
            self.assertNotIn(invented, result["descriptionRu"] + result["descriptionEn"])

    def test_ai_description_uses_only_verified_notes(self):
        row = {"id": 103, "name": "Test Scent", "brand": "Brand", "info": {}}
        info = {"notesVerified": True, "notes": {
            "ru": {"top": ["Кофе"], "heart": ["Роза"], "base": ["Ваниль"]},
            "en": {"top": ["Coffee"], "heart": ["Rose"], "base": ["Vanilla"]},
        }}
        with patch.dict(os.environ, {}, clear=True):
            result = queue.generate_ai_perfume_description(None, row, info)
        self.assertIn("Кофе", result["descriptionRu"])
        self.assertIn("Vanilla", result["descriptionEn"])
        self.assertNotIn("Шафран", result["descriptionRu"])

    def test_unverified_notes_are_cleared_from_info(self):
        info = {"topNotes": ["Шафран"], "notes": {"ru": {"top": ["Шафран"]}}, "notesSummary": "Шафран"}
        queue.apply_verified_notes(info, None)
        self.assertIs(info["notesVerified"], False)
        self.assertNotIn("notes", info)
        self.assertNotIn("topNotes", info)
        self.assertNotIn("notesSummary", info)
'''
assert t.count(old) == 1
t = t.replace(old, new)
open(p, "wb").write((t.replace("\n", "\r\n") if crlf else t).encode("utf-8"))
print("ok")
