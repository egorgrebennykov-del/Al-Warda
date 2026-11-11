p = "Al-Warda/scripts/generate_product_images.py"
t = open(p, "rb").read().decode("utf-8").replace("\r\n", "\n")
old = '''notes_summary = (info.get("notesSummary") or info.get("notes") or "").strip()'''
assert t.count(old) == 1
t = t.replace(old, '''notes_summary = str(info.get("notesSummary") or "").strip()''')
open(p, "wb").write(t.replace("\n", "\r\n").encode("utf-8"))
