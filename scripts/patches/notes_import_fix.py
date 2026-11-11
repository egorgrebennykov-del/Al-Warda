p = "Al-Warda/scripts/generate_product_images.py"
t = open(p, "rb").read().decode("utf-8").replace("\r\n", "\n")
line = "from fragrance_notes import apply_verified_notes, fetch_verified_notes\n"
assert t.count(line) == 1
t = t.replace(line, "")
anchor = "from urllib.parse import quote, urlencode, urlparse\n"
assert t.count(anchor) == 1
t = t.replace(anchor, anchor + "\nsys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))\n" + line, 1)
open(p, "wb").write(t.replace("\n", "\r\n").encode("utf-8"))
print("ok")
