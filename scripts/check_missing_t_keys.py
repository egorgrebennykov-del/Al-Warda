import os
import re
import json

with open('scripts/translations_dump.json', 'r', encoding='utf-8') as f:
    translations = json.load(f)

ru_dict = translations['ru']

# Find all t("...") or t('...') in all .jsx files
t_calls = []
t_pattern = re.compile(r't\(["\']([a-zA-Z0-9_.-]+)["\']')

for root, dirs, files in os.walk('Al-Warda/src'):
    if any(x in root for x in ['node_modules', 'dist', '.git']):
        continue
    for f in files:
        if not f.endswith(('.jsx', '.js')):
            continue
        fp = os.path.join(root, f)
        with open(fp, 'r', encoding='utf-8') as fl:
            content = fl.read()
        for m in t_pattern.finditer(content):
            t_calls.append((fp, m.group(1)))

print(f"Total t(...) calls found in code: {len(t_calls)}")

missing_keys = set()
for fp, key in t_calls:
    if key not in ru_dict:
        missing_keys.add((fp, key))

print(f"Total missing keys: {len(missing_keys)}")
for fp, key in missing_keys:
    print(f"  Missing: {key} (in {os.path.basename(fp)})")
