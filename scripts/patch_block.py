"""Helper: replace a block in a CRLF file. Usage: python patch_block.py <file> <old.txt> <new.txt>"""
import sys

path, old_path, new_path = sys.argv[1:4]
raw = open(path, "rb").read()
crlf = b"\r\n" in raw
text = raw.decode("utf-8").replace("\r\n", "\n")
old = open(old_path, encoding="utf-8").read().replace("\r\n", "\n").strip("\n")
new = open(new_path, encoding="utf-8").read().replace("\r\n", "\n").strip("\n")
count = text.count(old)
if count != 1:
    print(f"ERROR: target found {count} times in {path}")
    sys.exit(1)
text = text.replace(old, new)
if crlf:
    text = text.replace("\n", "\r\n")
open(path, "wb").write(text.encode("utf-8"))
print(f"Patched {path}")
