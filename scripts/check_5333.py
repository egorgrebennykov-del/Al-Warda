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
    f"{SUPABASE_URL}/rest/v1/stocks?id=eq.5333",
    headers=headers,
    verify=False
)

print(json.dumps(r.json(), indent=2, ensure_ascii=False))
