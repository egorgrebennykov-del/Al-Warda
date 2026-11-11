import requests
import json

SUPABASE_URL = "https://mfvenfrmlkxqgvdtedet.supabase.co"
SUPABASE_KEY = "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

# Search for products
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

r = requests.get(
    f"{SUPABASE_URL}/rest/v1/stocks?select=*&limit=1",
    headers=headers,
    verify=False
)
if r.ok:
    print("Columns:", list(r.json()[0].keys()))

r = requests.get(
    f"{SUPABASE_URL}/rest/v1/stocks?select=*&limit=1000",
    headers=headers,
    verify=False
)

if not r.ok:
    print(f"Error {r.status_code}: {r.text}")
    exit(1)

rows = r.json()
print(f"Total rows in Supabase stocks: {len(rows)}")

matches = []
for row in rows:
    name = str(row.get("name") or "")
    brand = str(row.get("brand") or "")
    gtin = str(row.get("gtin") or "")
    info = row.get("info") or {}
    text = f"{name} {brand} {gtin} {json.dumps(info)}".lower()
    if "bleu edition" in text or "6291106814316" in text or "l'aventure" in text or "travel set" in text:
        matches.append(row)

print(f"Found {len(matches)} matching rows:")
for m in matches:
    info = m.get("info") or {}
    job = info.get("imageGeneration") or {}
    print(f"ID: {m['id']} | GTIN: {m.get('gtin')} | Name: {m.get('name')}")
    print(f"  image: {m.get('image')}")
    print(f"  raw_image: {m.get('raw_image')}")
    print(f"  info.rawImage: {info.get('rawImage')}")
    print(f"  info.originalImage: {info.get('originalImage')}")
    print(f"  job status: {job.get('status')} | job imageUrl: {job.get('imageUrl')}")
    print("---")
