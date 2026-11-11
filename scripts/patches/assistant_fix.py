p = "Al-Warda/src/components/warda/WardaAssistant.jsx"
t = open(p, "rb").read().decode("utf-8")
crlf = "\r\n" in t
t = t.replace("\r\n", "\n")

# 1. remove the obsolete "translating" banner
start = t.index("            {isTranslating && (\n")
end_marker = "            )}\n"
end = t.index(end_marker, start) + len(end_marker)
banner = t[start:end]
assert "warda-translating-banner" in banner and banner.count("{isTranslating") == 1
t = t[:start] + t[end:].lstrip("\n")
t = t[:start] + "\n" + t[start:] if not t[start:].startswith("\n") else t

# 2. remove isTranslating from disabled conditions
for old, new in [("disabled={loading || isTranslating}", "disabled={loading}"),
                 ("disabled={!input.trim() || loading || isTranslating}", "disabled={!input.trim() || loading}")]:
    assert t.count(old) == 1, old
    t = t.replace(old, new)

# 3. handleOpen must ignore click events; only a string is an auto-send query
old = "    const textToSubmit = autoSendText || pendingQueryRef.current;"
assert t.count(old) == 1
t = t.replace(old, '    const explicitText = typeof autoSendText === "string" ? autoSendText : null;\n    const textToSubmit = explicitText || pendingQueryRef.current;')

# 4. handleSendMessage must be robust to non-string input
old = "    const queryText = (textToSend || input).trim();"
assert t.count(old) == 1
t = t.replace(old, '    const queryText = (typeof textToSend === "string" ? textToSend : input).trim();')

assert "isTranslating" not in t
if crlf:
    t = t.replace("\n", "\r\n")
open(p, "wb").write(t.encode("utf-8"))
print("ok")
