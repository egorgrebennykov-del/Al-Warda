import glob, re
files = ["Al-Warda/scripts/generate_product_images.py", "Al-Warda/scripts/qogita_weekly_sync_upscayl.py",
         "Al-Warda/scripts/sync-stocks-supabase.js", "Al-Warda/server/qogitaService.js", "Al-Warda/server/worker.js",
         "Al-Warda/scripts/import_all_qogita_perfumes.py"]
for f in files:
    t = open(f, encoding="utf-8").read()
    for m in re.finditer(r"[^\n]{0,60}Ближнего Востока[^\n]{0,60}", t):
        print(f, "|", m.group(0))
for f in glob.glob("Al-Warda/src/**/*.js*", recursive=True) + glob.glob("Al-Warda/utils/*.js"):
    t = open(f, encoding="utf-8", errors="ignore").read()
    for m in re.finditer(r"[^\n]{0,60}с Ближнего Востока[^\n]{0,40}", t):
        print(f, "|", m.group(0)[:160])
