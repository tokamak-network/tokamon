#!/bin/bash
# Tokamon listener-server VM 시작 스크립트
# Container-Optimized OS (COS) 에서 실행
# 용도: Secret Manager에서 비밀값을 가져와 컨테이너를 시작

set -euo pipefail

PROJECT_ID="tokamon-go"
IMAGE="gcr.io/tokamon-go/listener-server"
CONTAINER_NAME="listener-server"
DATA_DIR="$HOME/data"
ENV_FILE="/tmp/listener-server.env"

echo "[$(date)] === Tokamon listener-server 시작 스크립트 ==="

# 데이터 디렉토리 생성 (SQLite, last-block, spot-metadata 영구 저장)
mkdir -p "$DATA_DIR"

# Secret Manager에서 비밀값 가져오기
echo "[$(date)] Secret Manager에서 비밀값 로드 중..."
TELEGRAM_BOT_TOKEN=$(curl -s -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/attributes/TELEGRAM_BOT_TOKEN" 2>/dev/null || \
  docker run --rm gcr.io/google.com/cloudsdktool/google-cloud-cli:slim \
  gcloud secrets versions access latest --secret=TELEGRAM_BOT_TOKEN --project="$PROJECT_ID" 2>/dev/null)

TELEGRAM_HASH_SALT=$(docker run --rm gcr.io/google.com/cloudsdktool/google-cloud-cli:slim \
  gcloud secrets versions access latest --secret=TELEGRAM_HASH_SALT --project="$PROJECT_ID")

DEVICE_HASH_SALT=$(docker run --rm gcr.io/google.com/cloudsdktool/google-cloud-cli:slim \
  gcloud secrets versions access latest --secret=DEVICE_HASH_SALT --project="$PROJECT_ID")

SIGNER_PRIVATE_KEY=$(docker run --rm gcr.io/google.com/cloudsdktool/google-cloud-cli:slim \
  gcloud secrets versions access latest --secret=SIGNER_PRIVATE_KEY --project="$PROJECT_ID")

FIREBASE_SERVICE_ACCOUNT_JSON=$(docker run --rm gcr.io/google.com/cloudsdktool/google-cloud-cli:slim \
  gcloud secrets versions access latest --secret=FIREBASE_SERVICE_ACCOUNT_KEY --project="$PROJECT_ID")

echo "[$(date)] 비밀값 로드 완료"

# 환경변수 파일 생성 (tmpfs에 저장하여 디스크에 남지 않음)
cat > "$ENV_FILE" << ENVEOF
NODE_ENV=production
NETWORK=thanos-sepolia
FIREBASE_PROJECT_ID=tokamon-go
PORT=8080
REQUIRE_ATTESTATION=false
DATABASE_PATH=/data/telegram.db
LAST_BLOCK_PATH=/data/last-block-thanos-sepolia.json
METADATA_PATH=/data/spot-metadata-thanos-sepolia.json
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_HASH_SALT=${TELEGRAM_HASH_SALT}
DEVICE_HASH_SALT=${DEVICE_HASH_SALT}
SIGNER_PRIVATE_KEY=${SIGNER_PRIVATE_KEY}
FIREBASE_SERVICE_ACCOUNT_JSON=${FIREBASE_SERVICE_ACCOUNT_JSON}
ENVEOF

chmod 600 "$ENV_FILE"

# 기존 컨테이너 정리
echo "[$(date)] 기존 컨테이너 정리 중..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

# GCR 인증 설정 (COS에서 필요)
echo "[$(date)] Docker GCR 인증 설정 중..."
docker-credential-gcr configure-docker 2>/dev/null || true

# 최신 이미지 풀
echo "[$(date)] Docker 이미지 풀 중..."
docker pull "$IMAGE"

# 컨테이너 시작
echo "[$(date)] 컨테이너 시작 중..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart=unless-stopped \
  --network=host \
  --env-file "$ENV_FILE" \
  -v "$DATA_DIR":/data \
  "$IMAGE"

# 환경변수 파일 삭제 (보안)
rm -f "$ENV_FILE"

echo "[$(date)] === 컨테이너 시작 완료 ==="

# 헬스체크 대기
echo "[$(date)] 헬스체크 대기 중 (30초)..."
sleep 30

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health/live 2>/dev/null || echo "000")
if [ "$HEALTH" = "200" ]; then
  echo "[$(date)] 헬스체크 성공"
else
  echo "[$(date)] 경고: 헬스체크 실패 (HTTP $HEALTH). 로그를 확인하세요: docker logs $CONTAINER_NAME"
fi
