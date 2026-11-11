import re
OLD = "аромат с Ближнего Востока"
NEW = "аромат Ближнего Востока"
files = ["Al-Warda/scripts/generate_product_images.py", "Al-Warda/scripts/qogita_weekly_sync_upscayl.py",
         "Al-Warda/scripts/sync-stocks-supabase.js", "Al-Warda/server/qogitaService.js", "Al-Warda/server/worker.js"]
for f in files:
    raw = open(f, "rb").read().decode("utf-8")
    n = raw.count(OLD)
    open(f, "wb").write(raw.replace(OLD, NEW).encode("utf-8"))
    print(f, n)

# Display-time normalisation for descriptions already stored in Supabase
p = "Al-Warda/utils/perfumes.js"
t = open(p, "rb").read().decode("utf-8").replace("\r\n", "\n")
anchor = "export function parseVolumeFromText(text) {"
helper = '''// Fixes the awkward legacy phrase stored in older descriptions.
export function fixDescriptionWording(text) {
  if (!text || typeof text !== "string") return text;
  return text.replace(/аромат\\s+с\\s+Ближнего\\s+Востока/gi, "аромат Ближнего Востока");
}

'''
# helper goes before the doc comment of parseVolumeFromText
doc = "/**\n * Parses the real product size"
assert t.count(doc) == 1
t = t.replace(doc, helper + doc)
open(p, "wb").write(t.replace("\n", "\r\n").encode("utf-8"))

# test expectation: a generic set name must not be fuzzy-matched to an unrelated product
tp = "Al-Warda/tests/wardaAssistantFeminineAndAvatar.test.js"
s = open(tp, "rb").read().decode("utf-8")
old = '"https://www.qogita.com/products/4d22afe5141c40eda90ef76b853c2130/al-haramain-amber-oud-bleu-edition-3-pc-gift-set-for-unisex-luxury-cologne/"'
assert s.count(old) == 1
s = s.replace(old, '"https://www.qogita.com/brands/al-haramain/"')
open(tp, "wb").write(s.encode("utf-8"))
print("done")
