import os, sys, json
sys.path.insert(0, "Al-Warda/scripts")
import requests, urllib3
urllib3.disable_warnings()
from fragrance_notes import fetch_verified_notes

for line in open("Al-Warda/.env", encoding="utf-8"):
    if line.startswith("GEMINI_API_KEY="):
        os.environ["GEMINI_API_KEY"] = line.split("=", 1)[1].strip().strip('"')

class S:  # tolerate local corporate SSL interception like the other scripts
    def post(self, *a, **k):
        k["verify"] = False
        return requests.post(*a, **k)

out = []
for brand, name in [("Lattafa", "Khamrah Eau de Parfum"), ("Al Haramain", "Amber Oud Bleu Edition Eau de Parfum"),
                    ("Al Haramain", "Bahr For Men Concentrated Perfume Oil Mini"), ("Afnan", "Zzzqqq Nonexistent Fragrance 77")]:
    r = fetch_verified_notes(S(), name, brand)
    out.append(f"{brand} {name} -> {json.dumps(r, ensure_ascii=False)}")
open("scripts/notes_probe.txt", "w", encoding="utf-8").write("\n\n".join(out))
