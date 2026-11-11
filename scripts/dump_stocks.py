import requests, json, urllib3
urllib3.disable_warnings()
URL = "https://mfvenfrmlkxqgvdtedet.supabase.co"
KEY = "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB"
h = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
rows = []
for off in range(0, 20000, 1000):
    b = requests.get(f"{URL}/rest/v1/stocks?select=id,name,description,info&order=id&limit=1000&offset={off}", headers=h, verify=False).json()
    rows += b
    if len(b) < 1000:
        break
json.dump(rows, open("scripts/temp_images/stocks_dump.json", "w", encoding="utf-8"), ensure_ascii=False)
print(len(rows))
