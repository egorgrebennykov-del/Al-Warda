import json

with open('scripts/translations_dump.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

ru_keys = set(data['ru'].keys())

for lang in ['en', 'hu', 'bg', 'el', 'ro']:
    cur_keys = set(data[lang].keys())
    missing = ru_keys - cur_keys
    extra = cur_keys - ru_keys
    print(f'Lang {lang}: missing {len(missing)}, extra {len(extra)}')
    if missing:
        print(f'  Missing keys in {lang}:', list(missing)[:10])
