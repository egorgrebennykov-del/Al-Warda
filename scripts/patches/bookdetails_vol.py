path = "Al-Warda/src/components/bookdetails/BookDetails.jsx"
t = open(path, "rb").read().decode("utf-8")
old = '.split("/")[0].trim() || "100 ml");'
assert t.count(old) == 1
t = t.replace(old, '.split("/")[0].trim() || "—");')
open(path, "wb").write(t.encode("utf-8"))
print("ok")
