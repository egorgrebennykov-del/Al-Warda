import os
import re

out_lines = []
for root, dirs, files in os.walk('Al-Warda/src'):
    if any(x in root for x in ['node_modules', 'dist', '.git']):
        continue
    for f in files:
        if not f.endswith(('.jsx', '.js')):
            continue
        fp = os.path.join(root, f)
        with open(fp, 'r', encoding='utf-8') as fl:
            content = fl.read()
        for idx, line in enumerate(content.splitlines()):
            if re.search(r'(?:language|lang)\s*===?\s*[\'\"]ru[\'\"]', line):
                out_lines.append(f'{fp}:{idx+1} {line.strip()[:140]}')

with open('scripts/untranslated_results.txt', 'w', encoding='utf-8') as out:
    out.write('\n'.join(out_lines))

print(f'Done! Found {len(out_lines)} occurrences.')
