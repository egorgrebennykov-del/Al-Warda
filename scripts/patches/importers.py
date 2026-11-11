import re

PY_BODY = '''def extract_volume(name):
    # Strict parser: returns "" if the Qogita title has no size (never a fake 100 ml).
    from volume_parser import parse_volume
    return parse_volume(name)


'''

for path in ["Al-Warda/scripts/import_all_qogita_perfumes.py", "Al-Warda/scripts/qogita_weekly_sync_upscayl.py"]:
    raw = open(path, "rb").read().decode("utf-8")
    crlf = "\r\n" in raw
    t = raw.replace("\r\n", "\n")
    new_t, n = re.subn(r"def extract_volume\(name\):\n.*?\n(?=\S)", PY_BODY, t, count=1, flags=re.S)
    assert n == 1, path
    if crlf:
        new_t = new_t.replace("\n", "\r\n")
    open(path, "wb").write(new_t.encode("utf-8"))
    print("patched", path)

JS_BODY = '''function extractVolume(name) {
  // Strict shared parser: returns "" when the title states no size (never a fake 100 ml).
  return parseVolumeFromText(name) || "";
}

'''
path = "Al-Warda/scripts/sync-stocks-supabase.js"
raw = open(path, "rb").read().decode("utf-8")
crlf = "\r\n" in raw
t = raw.replace("\r\n", "\n")
t, n = re.subn(r"function extractVolume\(name\) \{\n.*?\n\}\n\n", JS_BODY, t, count=1, flags=re.S)
assert n == 1
t = t.replace('import { fileURLToPath } from "node:url";\n',
              'import { fileURLToPath } from "node:url";\nimport { parseVolumeFromText } from "../utils/perfumes.js";\n', 1)
if crlf:
    t = t.replace("\n", "\r\n")
open(path, "wb").write(t.encode("utf-8"))
print("patched", path)

