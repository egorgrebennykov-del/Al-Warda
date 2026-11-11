path = "Al-Warda/utils/perfumes.js"
t = open(path, "rb").read().decode("utf-8").replace("\r\n", "\n")
old = '''      let bestScore = 0;

      for (const [slug, id] of Object.entries(QOGITA_PRODUCTS_MAP)) {
        const slugWords = slug.split("-");
        let score = 0;
        for (const w of nameWords) {
          if (slugWords.includes(w)) score++;
        }
        if (score > bestScore) {
          bestScore = score;
          bestSlug = slug;
          bestId = id;
        }
      }

      // Require nearly every distinctive word to match; otherwise fall back to the exact GTIN search.
      const requiredScore = Math.max(2, Math.ceil(nameWords.length * 0.8));'''
new = '''      let bestScore = 0;
      let bestExtra = Infinity;

      for (const [slug, id] of Object.entries(QOGITA_PRODUCTS_MAP)) {
        const slugWords = slug.split("-");
        let score = 0;
        for (const w of nameWords) {
          if (slugWords.includes(w)) score++;
        }
        if (!score) continue;
        // Prefer the slug with the fewest unrelated words ("khamrah" over "khamrah-qahwa").
        const extra = slugWords.filter(
          (w) => w && !stopWords.has(w) && !brandWords.has(w) && !/^\\d/.test(w) && !nameWords.includes(w)
        ).length;
        if (score > bestScore || (score === bestScore && extra < bestExtra)) {
          bestScore = score;
          bestExtra = extra;
          bestSlug = slug;
          bestId = id;
        }
      }

      // Require (nearly) every distinctive word to match; otherwise fall back to the exact GTIN search.
      const requiredScore = nameWords.length <= 2 ? nameWords.length : Math.ceil(nameWords.length * 0.8);'''
assert t.count(old) == 1
t = t.replace(old, new)
open(path, "wb").write(t.replace("\n", "\r\n").encode("utf-8"))
print("ok")
