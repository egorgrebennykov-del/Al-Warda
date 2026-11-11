import json

with open('Al-Warda/public/data/cachedArabianPerfumes.json', encoding='utf-8') as f:
    data = json.load(f)

for p in data:
    info = p.get('info') or {}
    gtin = str(p.get('gtin') or info.get('gtin') or '')
    if '6291100138719' in gtin:
        print("Found product by GTIN 6291100138719:")
        print(json.dumps(p, indent=2, ensure_ascii=False))
        break
else:
    print("GTIN 6291100138719 not found in cachedArabianPerfumes.json")
