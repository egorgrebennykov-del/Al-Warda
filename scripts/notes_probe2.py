import os, json, requests, urllib3
urllib3.disable_warnings()
for line in open("Al-Warda/.env", encoding="utf-8"):
    if line.startswith("GEMINI_API_KEY="):
        key = line.split("=", 1)[1].strip().strip('"')
print("key len", len(key))
for model in ("gemini-3.8-flash", "gemini-3.8-flash-lite"):
    r = requests.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
        json={"contents": [{"parts": [{"text": "Top, heart, base notes of Lattafa Khamrah EDP. Short."}]}], "tools": [{"google_search": {}}]},
        timeout=60, verify=False)
    print(model, r.status_code, r.text[:300].replace("\n", " "))

