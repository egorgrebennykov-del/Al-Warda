import requests
import json
import urllib3
urllib3.disable_warnings()

SUPABASE_URL = "https://mfvenfrmlkxqgvdtedet.supabase.co"
SUPABASE_KEY = "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

r = requests.get(
    f"{SUPABASE_URL}/rest/v1/stocks?select=*&limit=2000",
    headers=headers,
    verify=False
)

rows = r.json()
print(f"Total rows fetched: {len(rows)}")

found = []
for row in rows:
    text = json.dumps(row, ensure_ascii=False)
    if "6291106814316" in text:
        found.append(row)

print(f"Rows containing 6291106814316: {len(found)}")
for row in found:
    print("ID:", row.get("id"))
    print("Name:", row.get("name"))
    print("Image:", row.get("image"))
    info = row.get("info") or {}
    print("Info GTIN:", info.get("gtin"))
    print("Info rawImage:", info.get("rawImage"))
    print("Info title:", info.get("title"))
    print("Info imageGeneration:", info.get("imageGeneration"))
