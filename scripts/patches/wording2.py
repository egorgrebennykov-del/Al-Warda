p = "Al-Warda/utils/perfumes.js"
t = open(p, "rb").read().decode("utf-8").replace("\r\n", "\n")
old = "    description: descRu,\n    descriptionRu: descRu,\n"
assert t.count(old) == 1, t.count(old)
t = t.replace(old, "    description: fixDescriptionWording(descRu),\n    descriptionRu: fixDescriptionWording(descRu),\n")
old2 = "            description: descRu,\n            descriptionRu: descRu,\n"
assert t.count(old2) == 1, t.count(old2)
t = t.replace(old2, "            description: fixDescriptionWording(descRu),\n            descriptionRu: fixDescriptionWording(descRu),\n")
open(p, "wb").write(t.replace("\n", "\r\n").encode("utf-8"))
print("ok")
