import requests, json, urllib3, re
urllib3.disable_warnings()
SUPABASE_URL = "https://mfvenfrmlkxqgvdtedet.supabase.co"
KEY = "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB"
h = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
rows = []
for off in range(0, 20000, 1000):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/stocks?select=id,name,description,info&order=id&limit=1000&offset={off}", headers=h, verify=False)
    batch = r.json()
    rows += batch
    if len(batch) < 1000:
        break
print("rows", len(rows))
out = []
for row in rows:
    info = row.get("info") or {}
    if "bahr" in (row.get("name") or "").lower():
        out.append(json.dumps({k: row.get(k) for k in ("id", "name", "description")} | {"volume": info.get("volume"), "keys": list(info.keys())}, ensure_ascii=False))
# Count rows whose volume is the generic default while name/description contains a different size
generic = 0
mismatch = []
for row in rows:
    info = row.get("info") or {}
    vol = str(info.get("volume") or "")
    text = f"{row.get('name') or ''} || {row.get('description') or ''} || {info.get('descriptionEn') or ''}"
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(ml|мл|fl\.?\s*oz|oz|ounce)", text, re.I)
    if vol.startswith("100") :
        generic += 1
        if m and not m.group(1).startswith("100") and m.group(1) not in ("3.4", "3,4", "34"):
            mismatch.append(f"{row['id']} | vol={vol} | found={m.group(0)} | {row.get('name')}")
out.append(f"volume starting with 100: {generic}; mismatches: {len(mismatch)}")
out += mismatch[:80]
open("scripts/volume_audit.txt", "w", encoding="utf-8").write("\n".join(out))
