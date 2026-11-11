p = "Al-Warda/src/context/CurrencyProvider.jsx"
raw = open(p, "rb").read().decode("utf-8")
crlf = "\r\n" in raw
t = raw.replace("\r\n", "\n")
old = '''  // Rule: when switching to Hungarian (hu) or Romanian (ro), currency must automatically become leu (RON)
  // Rule: when switching to Russian (ru), English (en), Bulgarian (bg) or Greek (el), default currency is Euro (EUR)
  useEffect(() => {
    if ((language === "hu" || language === "ro") && prevLangRef.current !== language) {
      setCurrency("RON");
    } else if ('''
new = '''  // Rule: when switching to Hungarian (hu), currency must automatically become forint (HUF)
  // Rule: when switching to Romanian (ro), currency must automatically become leu (RON)
  // Rule: when switching to Russian (ru), English (en), Bulgarian (bg) or Greek (el), default currency is Euro (EUR)
  useEffect(() => {
    if (language === "hu" && prevLangRef.current !== language) {
      setCurrency("HUF");
    } else if (language === "ro" && prevLangRef.current !== language) {
      setCurrency("RON");
    } else if ('''
assert t.count(old) == 1
t = t.replace(old, new)
open(p, "wb").write((t.replace("\n", "\r\n") if crlf else t).encode("utf-8"))
print("ok")
