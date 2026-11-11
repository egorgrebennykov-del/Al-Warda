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
    f"{SUPABASE_URL}/rest/v1/stocks?select=id,name,info&limit=1000",
    headers=headers,
    verify=False
)

rows = r.json()
count = 0
for row in rows:
    info = row.get("info") or {}
    for k in ("imageGeneration", "imageGenerationReplacement"):
        job = info.get(k) or {}
        err = str(job.get("error") or "").lower()
        if "provider limit" in err or "quota" in err or "rate limit" in err:
            count += 1
            print(f"Stock {row['id']} has provider limit error: status={job.get('status')}, err={err}")

print(f"Total stocks with provider limit error: {count}")
