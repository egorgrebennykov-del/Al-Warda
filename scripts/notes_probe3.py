import requests, urllib3
urllib3.disable_warnings()
for line in open("Al-Warda/.env", encoding="utf-8"):
    if line.startswith("GEMINI_API_KEY="):
        key = line.split("=", 1)[1].strip().strip('"')
base = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={key}"
for label, body in [("no-tool", {"contents": [{"parts": [{"text": "Say OK"}]}]}),
                    ("search", {"contents": [{"parts": [{"text": "Say OK"}]}], "tools": [{"google_search": {}}]})]:
    r = requests.post(base, json=body, timeout=60, verify=False)
    print(label, r.status_code, r.text[:700].replace("\n", " "))
