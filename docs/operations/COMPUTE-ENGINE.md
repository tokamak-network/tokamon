# listener-server Compute Engine 배포 & 운영 가이드

> Cloud Run에서 Compute Engine e2-micro로 마이그레이션 (2026-04-04)
> 비용 절감: ~$63/월 → ~$11.50/월 (VM $7.11 + 고정IP $3.60 + 디스크 $0.40)

## 서비스 정보

| 항목 | 값 |
|------|-----|
| 프로젝트 | `tokamon-go` |
| 존 | `asia-northeast3-a` (서울) |
| 인스턴스 | `listener-server` |
| 머신 타입 | `e2-micro` (0.25 vCPU, 1GB RAM) |
| OS | Container-Optimized OS (cos-stable) |
| 고정 IP | `listener-server-ip` |
| 도메인 | `listener.tokamon.io` |
| 이미지 | `gcr.io/tokamon-go/listener-server` |

## 환경변수

| 변수 | 소스 | 설명 |
|------|------|------|
| `NODE_ENV` | 환경변수 | `production` |
| `NETWORK` | 환경변수 | `thanos-sepolia` |
| `FIREBASE_PROJECT_ID` | 환경변수 | `tokamon-go` |
| `PORT` | 환경변수 | `8080` |
| `REQUIRE_ATTESTATION` | 환경변수 | `false` |
| `DATABASE_PATH` | 환경변수 | `/data/telegram.db` |
| `LAST_BLOCK_PATH` | 환경변수 | `/data/last-block-thanos-sepolia.json` |
| `METADATA_PATH` | 환경변수 | `/data/spot-metadata-thanos-sepolia.json` |
| `TELEGRAM_BOT_TOKEN` | Secret Manager | 텔레그램 봇 토큰 |
| `TELEGRAM_HASH_SALT` | Secret Manager | 텔레그램 ID 해싱 솔트 |
| `DEVICE_HASH_SALT` | Secret Manager | 디바이스 ID 해싱 솔트 |
| `SIGNER_PRIVATE_KEY` | Secret Manager | claimManager 개인키 |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret Manager (`FIREBASE_SERVICE_ACCOUNT_KEY`) | Firebase Admin SDK 키 |

---

## 인프라 프로비저닝

### 1. 고정 IP 예약

```bash
gcloud compute addresses create listener-server-ip \
  --region=asia-northeast3 \
  --project=tokamon-go
```

### 2. VM 인스턴스 생성

```bash
gcloud compute instances create listener-server \
  --project=tokamon-go \
  --zone=asia-northeast3-a \
  --machine-type=e2-micro \
  --image-family=cos-stable \
  --image-project=cos-cloud \
  --boot-disk-size=10GB \
  --boot-disk-type=pd-standard \
  --address=listener-server-ip \
  --tags=listener-server \
  --scopes=cloud-platform \
  --metadata=google-logging-enabled=true
```

### 3. 방화벽 규칙

```bash
# HTTPS (443)
gcloud compute firewall-rules create allow-listener-https \
  --project=tokamon-go \
  --direction=INGRESS --action=ALLOW \
  --rules=tcp:443 --target-tags=listener-server \
  --source-ranges=0.0.0.0/0

# HTTP (80) - Let's Encrypt ACME 챌린지용
gcloud compute firewall-rules create allow-listener-http \
  --project=tokamon-go \
  --direction=INGRESS --action=ALLOW \
  --rules=tcp:80 --target-tags=listener-server \
  --source-ranges=0.0.0.0/0

# SSH (22)
gcloud compute firewall-rules create allow-listener-ssh \
  --project=tokamon-go \
  --direction=INGRESS --action=ALLOW \
  --rules=tcp:22 --target-tags=listener-server \
  --source-ranges=0.0.0.0/0
```

### 4. IAM 설정

```bash
PROJECT_NUMBER=$(gcloud projects describe tokamon-go --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Secret Manager 접근
gcloud projects add-iam-policy-binding tokamon-go \
  --member="serviceAccount:${SA}" \
  --role="roles/secretmanager.secretAccessor"

# Firestore 접근
gcloud projects add-iam-policy-binding tokamon-go \
  --member="serviceAccount:${SA}" \
  --role="roles/datastore.user"
```

---

## 배포

### 초기 배포

```bash
# 1. SSH 접속
gcloud compute ssh listener-server --zone=asia-northeast3-a --project=tokamon-go

# 2. 파일 전송 (로컬에서)
gcloud compute scp vm/docker-compose.yml vm/nginx.conf vm/startup.sh vm/init-ssl.sh \
  listener-server:~ --zone=asia-northeast3-a --project=tokamon-go

# 3. VM 내에서 시작 스크립트 실행
chmod +x startup.sh init-ssl.sh
./startup.sh

# 4. SSL 인증서 발급
./init-ssl.sh

# 5. docker-compose로 전체 서비스 시작
docker-compose up -d
```

### 업데이트 배포

```bash
# 1. 새 이미지 빌드 & 푸시 (로컬에서)
docker build --platform linux/amd64 \
  -f listener-server/Dockerfile \
  -t gcr.io/tokamon-go/listener-server .
docker push gcr.io/tokamon-go/listener-server

# 2. VM에서 업데이트
gcloud compute ssh listener-server --zone=asia-northeast3-a --project=tokamon-go
docker pull gcr.io/tokamon-go/listener-server
docker-compose up -d --force-recreate listener-server
```

---

## 운영

### SSH 접속

```bash
gcloud compute ssh listener-server --zone=asia-northeast3-a --project=tokamon-go
```

### 로그 확인

```bash
# 컨테이너 로그
docker logs -f listener-server

# 최근 100줄
docker logs --tail 100 listener-server

# nginx 로그
docker logs -f nginx
```

### 헬스체크

```bash
# 라이브니스 (항상 200)
curl http://localhost:8080/health/live

# 종합 헬스 (WebSocket, HTTP, 봇 상태)
curl http://localhost:8080/health

# 외부에서 확인
curl https://listener.tokamon.io/health
```

### 컨테이너 재시작

```bash
# listener-server만 재시작
docker restart listener-server

# 전체 재시작
docker-compose restart

# 완전 재생성
docker-compose down && docker-compose up -d
```

### 비밀값 업데이트

```bash
# 1. Secret Manager에서 비밀값 업데이트
echo -n "new_value" | gcloud secrets versions add SECRET_NAME \
  --data-file=- --project tokamon-go

# 2. startup.sh 재실행으로 새 비밀값 적용
./startup.sh
```

---

## 영구 데이터

Cloud Run과 달리 VM에서는 데이터가 영구 저장됩니다:

| 파일 | 경로 (컨테이너) | 설명 |
|------|----------------|------|
| `telegram.db` | `/data/telegram.db` | SQLite DB (사용자, 인증코드, 링크) |
| `last-block-*.json` | `/data/last-block-thanos-sepolia.json` | 마지막 처리 블록 (재시작 시 이어서 처리) |
| `spot-metadata-*.json` | `/data/spot-metadata-thanos-sepolia.json` | 스팟 메타데이터 캐시 |

> 호스트 경로: `/mnt/stateful_partition/data/` (COS 영구 파티션)

---

## TLS 인증서

- Let's Encrypt 인증서 사용 (90일 유효)
- certbot 컨테이너가 12시간마다 자동 갱신 시도
- 수동 갱신:

```bash
docker-compose run --rm certbot renew
docker-compose restart nginx
```

---

## 트러블슈팅

### 서버 응답 없음

```bash
# 1. 컨테이너 상태 확인
docker ps -a

# 2. 로그 확인
docker logs --tail 50 listener-server

# 3. 재시작
docker restart listener-server
```

### WebSocket 연결 끊김

```bash
# 헬스 엔드포인트에서 ws 상태 확인
curl -s http://localhost:8080/health | python3 -m json.tool

# 자동 재연결 시도 중이면 대기, 아니면 재시작
docker restart listener-server
```

### 디스크 용량 부족

```bash
# 디스크 사용량 확인
df -h

# Docker 정리
docker system prune -f
```

### Telegram 봇 충돌 (409 Conflict)

Telegram 봇은 한 번에 하나의 인스턴스만 polling 가능합니다.

```bash
# 다른 곳에서 같은 봇이 실행 중인지 확인
# Cloud Run이 아직 실행 중이면:
gcloud run services update listener-server --min-instances=0 \
  --project=tokamon-go --region=asia-northeast3

# VM에서 재시작
docker restart listener-server
```

---

## 비용

| 항목 | 월간 비용 |
|------|----------|
| e2-micro 인스턴스 | ~$7.11 |
| 고정 IP ($0.005/hr, 인스턴스 연결 시) | ~$3.60 |
| 10GB pd-standard 디스크 | ~$0.40 |
| **합계** | **~$11.50/월** |

> 이전 Cloud Run 비용: ~$63/월 → **82% 절감**

---

## 롤백 (Cloud Run으로 복원)

문제 발생 시 Cloud Run으로 즉시 롤백:

```bash
# 1. VM 컨테이너 중지 (Telegram 봇 충돌 방지)
gcloud compute ssh listener-server --zone=asia-northeast3-a --project=tokamon-go
docker-compose down

# 2. Cloud Run 복원
gcloud run services update listener-server \
  --min-instances=1 --max-instances=1 --no-cpu-throttling \
  --project=tokamon-go --region=asia-northeast3

# 3. firebase.json 원래 Cloud Run rewrite로 복원
firebase deploy --only hosting --project tokamon-go
```
