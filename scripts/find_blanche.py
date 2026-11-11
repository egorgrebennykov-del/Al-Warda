import json

with open('Al-Warda/public/data/cachedArabianPerfumes.json', encoding='utf-8') as f:
    data = json.load(f)

for p in data:
    name = str(p.get('name', ''))
    info = p.get('info') or {}
    title = str(info.get('title', ''))
    full_text = f"{name} {title}".lower()
    if 'blanche' in full_text:
        print("Found:", p.get('id'), "|", p.get('gtin') or info.get('gtin'), "|", p.get('name'))
        print("Image:", p.get('image'))
        print("Info keys:", list(info.keys()))
        print("Original image:", info.get('originalImage') or info.get('image'))
        print("Job:", info.get('imageGeneration'))
