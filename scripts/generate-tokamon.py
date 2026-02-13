import os
import json
import base64
import shutil
import ssl
import urllib.request

# Load .env if present
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

API_KEY = os.getenv("FLUX_API_KEY")
if not API_KEY:
    raise EnvironmentError("FLUX_API_KEY is not set in .env")

PROMPT = "A cute, cartoon-style digital creature named 'Tokamon', round body, short limbs, big shiny blue eyes with white highlights, small red smiling mouth, golden yellow body like a polished gold coin, small curved ears with red inner color, sitting pose, clean vector lines, no background (transparent PNG), high detail, 1024x1024, vibrant but not cartoonish, crypto reward theme, friendly and trustworthy vibe, no text, no borders, no effects, studio lighting, subtle ambient occlusion — style of Pokemon meets Web3, ultra-clean edges, digital art, ideal for mobile app icon"
URL = "https://api.ai.tokamak.network/v1/images/generations"
OUTPUT_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "client", "public", "tokamon-char-v2.png"))

payload = json.dumps({
    "model": "flux-2-dev",
    "prompt": PROMPT,
    "size": "1024x1024",
    "steps": 30,
    "guidance": 4.0
}).encode("utf-8")

req = urllib.request.Request(
    URL,
    data=payload,
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    },
    method="POST",
)

# macOS Python often lacks SSL certs; use unverified context for this dev script
ctx = ssl._create_unverified_context()
opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))

with opener.open(req, timeout=300) as response:
    if response.status != 200:
        raise Exception(f"API Error: {response.status} - {response.read().decode()}")

    result = json.loads(response.read().decode())

if "images" not in result or not result["images"]:
    raise Exception("No image returned from API")

image_data = base64.b64decode(result["images"][0])
with open(OUTPUT_FILE, "wb") as f:
    f.write(image_data)

print(f"✅ Image generated and saved to: {OUTPUT_FILE}")

old_file = os.path.join(os.path.dirname(OUTPUT_FILE), "tokamon-char.png")
if os.path.exists(old_file):
    shutil.move(OUTPUT_FILE, old_file)
    print(f"🔁 Replaced old image: {old_file}")
else:
    print(f"⚠️  Old image not found. New image saved as: {OUTPUT_FILE}")