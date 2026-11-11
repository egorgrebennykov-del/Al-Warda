import json

with open('Al-Warda/public/data/cachedArabianPerfumes.json', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total items: {len(data)}")

matches = []
for p in data:
    name = str(p.get('name', ''))
    info = p.get('info') or {}
    title = str(info.get('title', ''))
    full_text = f"{name} {title}".lower()
    if 'aventure' in full_text or 'amber oud' in full_text or 'travel set' in full_text or 'gift set' in full_text:
        matches.append(p)

print(f"Matched items: {len(matches)}")
for m in matches[:15]:
    info = m.get('info') or {}
    gtin = m.get('gtin') or info.get('gtin')
    img = m.get('image')
    orig_img = m.get('originalImage') or info.get('originalImage') or info.get('image')
    job = info.get('imageGeneration') or {}
    print(f"ID: {m.get('id')} | GTIN: {gtin} | Name: {m.get('name')}")
    print(f"  Current image: {img}")
    print(f"  Orig image: {orig_img}")
    print(f"  Job status: {job.get('status')} | Job img: {job.get('imageUrl')}")
    print(f"  Available sizes: {m.get('availableSizes')}")
    print("---")
