# listener-server Cloud Run 배포 & 모니터링 가이드

## 서비스 정보

| 항목 | 값 |
|------|-----|
| 프로젝트 | `tokamon-go` |
| 리전 | `asia-northeast3` (서울) |
| 서비스 URL | Cloud Run 콘솔에서 확인 |
| 이미지 | `gcr.io/tokamon-go/listener-server` |
| 인스턴스 | 항상 1개 (`--min-instances 1 --max-instances 1`) |
| CPU | 1 vCPU, 항상 활성 (`--no-cpu-throttling`) |
| 메모리 | 512Mi |

## 환경변수

| 변수 | 소스 | 설명 |
|------|------|------|
| `NODE_ENV` | 환경변수 | `production` |
| `NETWORK` | 환경변수 | `thanos-sepolia` |
| `FIREBASE_PROJECT_ID` | 환경변수 | `tokamon-go` |
| `TELEGRAM_BOT_TOKEN` | Secret Manager | 텔레그램 봇 토큰 |
| `TELEGRAM_HASH_SALT` | Secret Manager | 텔레그램 ID 해싱 솔트 |
| `DEVICE_HASH_SALT` | Secret Manager | 디바이스 ID 해싱 솔트 |
| `SIGNER_PRIVATE_KEY` | Secret Manager | claimManager 개인키 |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret Manager (`FIREBASE_SERVICE_ACCOUNT_KEY`) | Firebase Admin SDK 서비스 계정 키 (FCM 푸시 전송용) |

---

## 모니터링

### 1. 로그 확인

```bash
# 최근 로그 (50줄)
gcloud run services logs read listener-server \
  --project tokamon-go --region asia-northeast3 --limit 50

# 실시간 로그 스트리밍 (Ctrl+C로 종료)
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=listener-server" \
  --project tokamon-go

# 에러 로그만 필터
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=listener-server AND severity>=ERROR" \
  --project tokamon-go --limit 20
```

### 2. 서비스 상태 확인

```bash
# 서비스 상태
gcloud run services describe listener-server \
  --project tokamon-go --region asia-northeast3

# 리비전 목록 (배포 이력)
gcloud run revisions list \
  --service listener-server --project tokamon-go --region asia-northeast3
```

### 3. 웹 콘솔

- **Cloud Run 대시보드** (요청 수, 지연시간, 에러율, CPU/메모리): GCP 콘솔 → Cloud Run → listener-server → Metrics

- **Cloud Logging** (로그 뷰어): GCP 콘솔 → Logging → Logs Explorer

### 4. 헬스체크 엔드포인트

```bash
SERVICE_URL=$(gcloud run services describe listener-server --project tokamon-go --region asia-northeast3 --format='value(status.url)')

# 종합 헬스체크 (WS/HTTP 프로바이더, 봇 상태 — 200=정상, 503=이상)
curl -s $SERVICE_URL/health | python3 -m json.tool

# Liveness probe (프로세스 살아있는지 — 항상 200)
curl -s $SERVICE_URL/health/live

# 스팟 목록 조회로 서비스 동작 확인
curl -s $SERVICE_URL/api/spots
```

**Cloud Run 헬스체크 설정** (권장):
```bash
gcloud run services update listener-server \
  --startup-probe-path=/health/live \
  --startup-probe-period=10 \
  --liveness-probe-path=/health/live \
  --liveness-probe-period=30 \
  --project tokamon-go --region asia-northeast3
```

---

## 재배포

### 방법 1: 소스 빌드 (간편, 권장)

```bash
# 프로젝트 루트에서 실행
cp listener-server/Dockerfile Dockerfile
gcloud run deploy listener-server --source . --region asia-northeast3 --project tokamon-go
rm Dockerfile
```

> Cloud Build가 Dockerfile을 감지하여 자동으로 이미지 빌드 + 배포합니다.

### 방법 2: Docker 수동 빌드

```bash
# 1. 이미지 빌드 (레포 루트에서 실행, amd64 필수)
docker build --platform linux/amd64 \
  -f listener-server/Dockerfile \
  -t gcr.io/tokamon-go/listener-server .

# 2. 이미지 푸시
docker push gcr.io/tokamon-go/listener-server

# 3. Cloud Run 재배포
gcloud run deploy listener-server \
  --image gcr.io/tokamon-go/listener-server \
  --project tokamon-go \
  --region asia-northeast3
```

## 시크릿 업데이트

시크릿 값을 변경할 때:

```bash
# 새 버전 추가
echo -n "새로운값" | gcloud secrets versions add SECRET_NAME \
  --data-file=- --project tokamon-go

# 변경 후 Cloud Run 재배포 필요 (latest 버전 자동 반영)
gcloud run deploy listener-server \
  --image gcr.io/tokamon-go/listener-server \
  --project tokamon-go \
  --region asia-northeast3
```

## 트러블슈팅

### 긴급 조치: 서버 응답 없음 (504 타임아웃)

앱에서 "Network request error" 또는 서버 504 에러가 발생하면:

```bash
# 1. 서버 상태 확인 (응답이 안 오면 서버가 멈춘 것)
curl -m 10 -X POST https://listener-server-370459866598.asia-northeast3.run.app/api/device/balance \
  -H "Content-Type: application/json" -d '{"device_id":"healthcheck"}'

# 2. 최근 에러 로그 확인
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="listener-server" AND severity>=ERROR' \
  --project tokamon-go --limit 10 --format=json --freshness=1h

# 3. 서버 재시작 (기존 이미지로 재배포)
gcloud run deploy listener-server \
  --image gcr.io/tokamon-go/listener-server \
  --project tokamon-go --region asia-northeast3

# 4. 재시작 후 정상 동작 확인
curl -m 10 -X POST https://listener-server-370459866598.asia-northeast3.run.app/api/device/balance \
  -H "Content-Type: application/json" -d '{"device_id":"healthcheck"}'
```

### 긴급 조치: ECONNRESET / 텔레그램 봇 충돌

`[polling_error] EFATAL: Error: read ECONNRESET` 에러 발생 시 서버가 멈출 수 있음.

```bash
# 서버 재시작으로 복구
gcloud run deploy listener-server \
  --image gcr.io/tokamon-go/listener-server \
  --project tokamon-go --region asia-northeast3
```

### 컨테이너 크래시 반복

```bash
# 최근 에러 로그 확인
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=listener-server AND severity>=ERROR" \
  --project tokamon-go --limit 10 --format="table(timestamp,textPayload)"
```

### WebSocket 연결 끊김

Cloud Run은 `--no-cpu-throttling`으로 설정되어 있어 HTTP 요청이 없어도 CPU가 유지됩니다.

**자동 재연결 동작** (v2 이후):
- WebSocket 연결이 끊기면 지수 백오프로 자동 재연결 (1초 → 2초 → 4초 → ... 최대 60초)
- 재연결 성공 시 12개 이벤트 리스너 자동 재등록
- 재연결 중 놓친 이벤트는 `lastBlock` 기반으로 자동 복구
- `/health` 엔드포인트에서 `isReconnecting: true`로 재연결 상태 확인 가능

**관련 로그 패턴:**
```
[WS] WebSocket 연결 끊김 (code: 1006, reason: none)
[WS 재연결] 1번째 시도, 1000ms 후...
[WS 재연결] 성공 (1번째 시도)
[복구] 블록 12345 ~ 12350 사이의 놓친 이벤트 스캔 중...
```

단, Cloud Run 파일시스템은 임시이므로 `last-block.json`은 재시작 시 초기화됩니다.
최초 기동 시 모든 과거 이벤트를 다시 스캔할 수 있습니다.

### SQLite 데이터 초기화

컨테이너 재시작 시 SQLite 데이터가 초기화됩니다:
- 인증 코드 (3분 만료) → 영향 없음
- 지갑-텔레그램 연결 → Firestore에 이중 저장됨
- 해시-유저네임 매핑 → Firestore에 이중 저장됨
- telegram_users (chat_id) → 유저가 봇에 메시지 보내면 자동 복구

---

## 모니터링 알림 정책

Cloud Monitoring에 3개 알림이 설정되어 있으며, 이메일로 발송됩니다.

| 알림 | 조건 | 알림 채널 |
|------|------|-----------|
| 인스턴스 다운 | 인스턴스 수 < 1 (2분 지속) | 이메일 |
| 메모리 사용량 80% 초과 | 메모리 사용률 > 80% (5분 지속) | 이메일 |
| 에러 로그 다량 발생 | 5분 내 에러 5건 이상 | 이메일 |
| 5xx 에러 발생 | 1분 내 5xx 응답 1건 이상 | 이메일 |

알림 관리: GCP 콘솔 → Monitoring → Alerting

### 알림 채널 추가/변경

```bash
# 이메일 채널 추가
gcloud beta monitoring channels create \
  --display-name="새알림" --type=email \
  --channel-labels=email_address=새이메일@example.com \
  --project tokamon-go

# 기존 알림 정책 목록
gcloud beta monitoring policies list --project tokamon-go
```

---

## 서비스 삭제

```bash
gcloud run services delete listener-server \
  --project tokamon-go --region asia-northeast3
```
