import json
import re

with open('scripts/translations_dump.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

cyrillic_pattern = re.compile(r'[а-яА-ЯёЁ]{2,}')

report = []
for lang in ['en', 'hu', 'el', 'ro']:
    untranslated = []
    for k, v in data[lang].items():
        if isinstance(v, str) and cyrillic_pattern.search(v):
            untranslated.append((k, v, data['ru'].get(k, '')))
    report.append(f'Language {lang} has {len(untranslated)} untranslated Russian values:')
    for k, v, ru_val in untranslated:
        report.append(f'  Key: {k}')
        report.append(f'    {lang}: {v}')
        report.append(f'    ru: {ru_val}')

with open('scripts/untranslated_in_dict.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(report))

print("Wrote report to scripts/untranslated_in_dict.txt")
