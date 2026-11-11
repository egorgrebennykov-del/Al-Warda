path = "Al-Warda/utils/perfumes.js"
t = open(path, "rb").read().decode("utf-8").replace("\r\n", "\n")
old = '''    const nameWords = normName.split("-").filter((w) => w && !stopWords.has(w));
'''
new = '''    // Brand words ("al", "haramain") must not count towards a match, otherwise any
    // product of the same brand (e.g. a different gift set) can be picked by mistake.
    const brandWords = new Set(slugifyPerfumeName(brand).split("-").filter(Boolean));
    const nameWords = normName
      .split("-")
      .filter((w) => w && !stopWords.has(w) && !brandWords.has(w) && !/^\\d/.test(w));
'''
assert t.count(old) == 1
t = t.replace(old, new)
old2 = '''      if (bestScore >= 2 && bestSlug && bestId) {'''
new2 = '''      // Require nearly every distinctive word to match; otherwise fall back to the exact GTIN search.
      const requiredScore = Math.max(2, Math.ceil(nameWords.length * 0.8));
      if (bestScore >= requiredScore && bestSlug && bestId) {'''
assert t.count(old2) == 1
t = t.replace(old2, new2)
open(path, "wb").write(t.replace("\n", "\r\n").encode("utf-8"))
print("ok")
