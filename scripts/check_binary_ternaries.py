import os
import re

cyrillic = re.compile(r'[а-яА-ЯёЁ]{3,}')

# Check all components
issues = []
for root, dirs, files in os.walk('Al-Warda/src/components'):
    for f in files:
        if not f.endswith('.jsx'):
            continue
        fp = os.path.join(root, f)
        with open(fp, 'r', encoding='utf-8') as fl:
            content = fl.read()
        
        # Look for ternary operators like: isRussian ? "Russian" : "English"
        for match in re.finditer(r'isRussian\s*\?\s*["\'`]([^"\'`]+)["\'`]\s*:\s*["\'`]([^"\'`]+)["\'`]', content):
            issues.append(f"{f}: isRussian ternary: '{match.group(1)}' vs '{match.group(2)}'")

        # Look for: language === "ru" ? "..." : "..." (without handling hu, bg, el, ro)
        for match in re.finditer(r'language\s*===\s*["\']ru["\']\s*\?\s*["\'`]([^"\'`]+)["\'`]\s*:\s*["\'`]([^"\'`]+)["\'`]', content):
            issues.append(f"{f}: binary language ternary: '{match.group(1)}' vs '{match.group(2)}'")

with open('scripts/binary_ternaries.txt', 'w', encoding='utf-8') as out:
    out.write(f"Total binary ternaries found: {len(issues)}\n")
    for i in issues:
        out.write(f"  {i}\n")

print(f"Total binary ternaries found: {len(issues)}")
