# 알림 발생 시 긴급 대응 가이드

> listener-server: Compute Engine VM (listener.tokamon.io)

## 알림 유형별 대응

### 1. 서버 응답 없음 (504 타임아웃)

**증상:** 앱에서 "Network request error", 서버 504 에러

```bash
# 상태 확인 (10초 내 응답 없으면 서버 멈춘 것)
curl -m 10 https://listener.tokamon.io/health

# VM SSH 접속
gcloud compute ssh listener-server --zone=asia-northeast3-a --project=tokamon-go

# 컨테이너 로그 확인
docker logs --tail 50 listener-server

# 컨테이너 재시작
docker restart listener-server

# 재시작 후 정상 확인
curl -m 10 https://listener.tokamon.io/health
```

---

### 2. ECONNRESET / 텔레그램 봇 충돌

**증상:** 로그에 `[polling_error] EFATAL: Error: read ECONNRESET` 또는 `409 Conflict`

```bash
# SSH 접속 후 컨테이너 재시작
gcloud compute ssh listener-server --zone=asia-northeast3-a --project=tokamon-go
docker restart listener-server
```

> 409 Conflict는 같은 봇 토큰으로 다른 인스턴스가 polling 중일 때 발생. Cloud Run이 아직 실행 중인지 확인.

---

### 3. 5xx 에러 다수 발생

```bash
# SSH 접속 후 로그 확인
gcloud compute ssh listener-server --zone=asia-northeast3-a --project=tokamon-go
docker logs --tail 100 listener-server | grep -i error

# 재시작
docker restart listener-server
```

---

### 4. VM 인스턴스 다운

**증상:** Cloud Monitoring 업타임 체크 실패 알림

```bash
# VM 상태 확인
gcloud compute instances describe listener-server \
  --zone=asia-northeast3-a --project=tokamon-go \
  --format="value(status)"

# VM이 TERMINATED면 시작
gcloud compute instances start listener-server \
  --zone=asia-northeast3-a --project=tokamon-go

# SSH 접속 후 컨테이너 확인
gcloud compute ssh listener-server --zone=asia-northeast3-a --project=tokamon-go
docker ps -a

# 컨테이너가 꺼져있으면 시작
docker start listener-server
docker start nginx
```

---

### 5. 메모리 사용량 80% 초과

```bash
# SSH 접속 후 메모리 확인
gcloud compute ssh listener-server --zone=asia-northeast3-a --project=tokamon-go
free -h
docker stats --no-stream

# Docker 정리
docker system prune -f

# 필요 시 컨테이너 재시작
docker restart listener-server
```

---

### 6. FCM 푸시 전송 실패

#### 6-1. `messaging/third-party-auth-error` (APNs 인증 실패)

FCM → APNs 전달 시 인증 실패. APNs 키와 팀 ID 불일치가 원인.

**조치:**
1. Apple Developer (https://developer.apple.com/account) → Keys에서 현재 팀의 APNs 키 확인
2. 키가 없으면 새로 생성 (+ 버튼 → APNs 체크 → .p8 다운로드)
3. Firebase Console에서 기존 키 삭제 → 새 키 업로드 (키 ID + 팀 ID 입력)

#### 6-2. `Request is missing required authentication credential` (서버 인증 실패)

```bash
# SSH 접속 후 Firebase 초기화 로그 확인
gcloud compute ssh listener-server --zone=asia-northeast3-a --project=tokamon-go
docker logs listener-server 2>&1 | grep Firebase

# 정상: [Firebase] Admin SDK 초기화 완료 (Secret Manager 환경변수)
# 비정상: Firebase 초기화 로그 없음 → FIREBASE_SERVICE_ACCOUNT_JSON 확인
```

---

### 7. WebSocket 재연결 실패 (반복)

**증상:** `/health`에서 `"status": "degraded"`, WS `"reconnecting"` 반환

```bash
# 1. 헬스체크 확인
curl -s https://listener.tokamon.io/health | python3 -m json.tool

# 2. RPC 서버 상태 확인
curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  https://rpc.thanos-sepolia.tokamak.network

# 3. RPC 정상인데 WS만 끊기면 컨테이너 재시작
gcloud compute ssh listener-server --zone=asia-northeast3-a --project=tokamon-go
docker restart listener-server
```

> 서버는 WS가 끊겨도 HTTP API는 정상 동작합니다. 재연결은 자동이므로 RPC가 복구되면 이벤트 수신이 재개됩니다.

---

### 8. nginx / TLS 인증서 문제

**증상:** HTTPS 접근 시 인증서 오류

```bash
# SSH 접속
gcloud compute ssh listener-server --zone=asia-northeast3-a --project=tokamon-go

# 인증서 만료일 확인
docker run --rm -v ~/letsencrypt:/etc/letsencrypt certbot/certbot certificates

# 수동 갱신
docker run --rm -v ~/letsencrypt:/etc/letsencrypt -v ~/certbot-www:/var/www/certbot certbot/certbot renew
docker restart nginx
```

---

## 복구 후 확인 사항

서버 재시작 후 아래 항목을 순서대로 확인:

1. **헬스체크 확인** (종합 상태)
```bash
curl -s https://listener.tokamon.io/health | python3 -m json.tool
```
→ `"status": "healthy"`, WS `"connected"`, HTTP `"ok"` 확인

2. **API 응답 확인**
```bash
curl -s https://listener.tokamon.io/api/spots?network=thanos-sepolia | head -c 200
```

3. **로그에서 정상 기동 메시지 확인**
```bash
docker logs --tail 20 listener-server
```
→ `[Listener HTTP] 포트 8080에서 실행 중` 메시지가 보이면 정상

4. **앱에서 동작 확인**
→ 앱 재실행 후 잔액 조회, 지갑 등록 등 테스트

---

## FCM 푸시 전체 흐름 및 필요한 인증

```
앱 → FCM 토큰 발급 (GoogleService-Info.plist 기반)
앱 → 서버: FCM 토큰 + 요청
서버 → FCM API: 푸시 전송 (serviceAccountKey - Secret Manager)
FCM → APNs: 푸시 전달 (APNs 인증 키 .p8 - Firebase Console)
APNs → iPhone: 푸시 수신
```

| 단계 | 필요한 인증 | 설정 위치 |
|------|-----------|----------|
| 앱 → FCM 토큰 발급 | `GoogleService-Info.plist` (번들 ID 일치) | 앱 프로젝트 `app/` |
| 서버 → FCM API | `serviceAccountKey.json` | Secret Manager (`FIREBASE_SERVICE_ACCOUNT_KEY`) |
| FCM → APNs | APNs 인증 키 (`.p8`) + 팀 ID | Firebase Console → Cloud Messaging |

> **주의:** APNs 키는 Apple Developer 계정(팀)에 종속됨. 팀이 바뀌면 새 키를 발급하고 Firebase Console에 다시 등록해야 함.
