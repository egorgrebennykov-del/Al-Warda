path = "Al-Warda/utils/perfumes.js"
t = open(path, "rb").read().decode("utf-8")
old = '''  const cut = desc.split(/\\s+[-–—]\\s+|\\s+by\\s+|\\s+от\\s+/i)[0];
  return cut.length <= 220 ? cut : desc.slice(0, 220);'''
new = '''  // RU template: "<title> - <русский текст>", EN template: "<title> by <brand> is an opulent ..."
  let cut = desc.split(/[А-Яа-яЁё]/)[0];
  cut = cut.split(/\\s+is\\s+an?\\s+/i)[0];
  return cut.slice(0, 220);'''
old_n = old.replace("\n", "\r\n")
assert t.count(old_n) == 1, t.count(old_n)
t = t.replace(old_n, new.replace("\n", "\r\n"))
open(path, "wb").write(t.encode("utf-8"))
print("ok")
