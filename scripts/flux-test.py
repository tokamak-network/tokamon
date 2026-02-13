#!/usr/bin/env python3
"""flux-2-dev API 테스트 - 공식 예제 그대로 실행"""
import os
import sys
import json
import base64
import time
import ssl
import urllib.request

# Load .env
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
    print("FLUX_API_KEY가 .env에 없습니다.")
    sys.exit(1)

# 공식 예제 그대로
PROMPT = "A cute fluffy white toy poodle puppy, photorealistic, 8k quality"
SIZE = "1024x768"
STEPS = 30
GUIDANCE = 4.0

payload = json.dumps({
    "model": "flux-2-dev",
    "prompt": PROMPT,
    "size": SIZE,
    "num_inference_steps": STEPS,
    "guidance_scale": GUIDANCE,
}).encode("utf-8")

req = urllib.request.Request(
    "https://api.ai.tokamak.network/v1/images/generations",
    data=payload,
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    method="POST",
)

ctx = ssl._create_unverified_context()
opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))

print("⏳ 이미지 생성 중... (STEPS=30, 예상 ~1m30s)")
start = time.time()

with opener.open(req, timeout=300) as resp:
    body = resp.read().decode()
    status = resp.status

elapsed = time.time() - start
print(f"⏱️  소요 시간: {elapsed:.1f}초 ({elapsed/60:.1f}분)")

data = json.loads(body)
if status != 200:
    raise Exception(f"API Error: {status} - {body}")

# 공식 예제: data[0]["b64_json"]
img_b64 = None
if "data" in data and data["data"]:
    img_b64 = data["data"][0].get("b64_json")
if not img_b64 and "images" in data and data["images"]:
    img_b64 = data["images"][0]  # fallback

if not img_b64:
    print("응답 구조:", json.dumps({k: type(v).__name__ for k, v in data.items()}, indent=2))
    if "data" in data:
        print("data[0] keys:", list(data["data"][0].keys()) if data["data"] else "empty")
    raise Exception("No image in response")

img_data = base64.b64decode(img_b64)
out = os.path.join(os.path.dirname(__file__), "..", "output.png")
with open(out, "wb") as f:
    f.write(img_data)
print(f"✅ Saved {os.path.abspath(out)}")
