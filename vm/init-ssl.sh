#!/bin/bash
# Let's Encrypt 인증서 초기 발급 스크립트
# nginx 시작 전에 한 번만 실행

set -euo pipefail

DOMAIN="listener.tokamon.io"
EMAIL="biztigerwonderful@gmail.com"

echo "=== Let's Encrypt 인증서 발급 ==="

# 1. certbot-www 볼륨 디렉토리 생성
docker compose up -d certbot
docker compose stop certbot

# 2. 임시 nginx (HTTP만, 인증서 없이) 시작 - ACME 챌린지용
cat > /tmp/nginx-temp.conf << 'EOF'
server {
    listen 80;
    server_name listener.tokamon.io;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 200 'waiting for certificate';
    }
}
EOF

docker run -d --name nginx-temp \
  -p 80:80 \
  -v /tmp/nginx-temp.conf:/etc/nginx/conf.d/default.conf:ro \
  -v "$(docker volume inspect vm_certbot-www --format '{{ .Mountpoint }}')":/var/www/certbot:ro \
  nginx:alpine

# 3. certbot으로 인증서 발급
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

# 4. 임시 nginx 정리
docker stop nginx-temp && docker rm nginx-temp
rm -f /tmp/nginx-temp.conf

echo "=== 인증서 발급 완료 ==="
echo "이제 docker compose up -d 로 전체 서비스를 시작하세요."
