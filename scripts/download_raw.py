import urllib3
import requests
from PIL import Image
import os

urllib3.disable_warnings()

# Let's inspect ID 5449 and ID 5333
os.makedirs("scripts/temp_images", exist_ok=True)

# 5449 raw
r1 = requests.get("https://static.prod.qogita.com/files/images/variants/GZhYeA9QeBeR9Ax7sUzMDK.jpg", verify=False)
with open("scripts/temp_images/5449_raw.jpg", "wb") as f:
    f.write(r1.content)

# 5333 raw
r2 = requests.get("https://static.prod.qogita.com/files/images/variants/HQhBge3gSkendtSKkj4cj4.jpg", verify=False)
with open("scripts/temp_images/5333_raw.jpg", "wb") as f:
    f.write(r2.content)

print(f"5449 raw size: {len(r1.content)} bytes, 5333 raw size: {len(r2.content)} bytes")
