# 알림 발생 시 긴급 대응 가이드

## 알림 유형별 대응

### 1. 서버 응답 없음 (504 타임아웃)

**증상:** 앱에서 "Network request error", 서버 504 에러

```bash
# 상태 확인 (10초 내 응답 없으면 서버 멈춘 것)
curl -m 10 -X POST https://listener-server-370459866598.asia-northeast3.run.app/api/device/balance \
  -H "Content-Type: application/json" -d '{"device_id":"healthcheck"}'

# 에러 로그 확인
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="listener-server" AND severity>=ERROR' \
  --project tokamon-go --limit 10 --format=json --freshness=1h

# 서버 재시작 (기존 이미지로 재배포)
gcloud run deploy listener-server --image gcr.io/tokamon-go/listener-server --project tokamon-go --region asia-northeast3

# 재시작 후 정상 확인
curl -m 10 -X POST https://listener-server-370459866598.asia-northeast3.run.app/api/device/balance \
  -H "Content-Type: application/json" -d '{"device_id":"healthcheck"}'
```

---

### 2. ECONNRESET / 텔레그램 봇 충돌

**증상:** 로그에 `[polling_error] EFATAL: Error: read ECONNRESET` 발생 후 서버 멈춤

```bash
# 서버 재시작으로 복구
gcloud run deploy listener-server --image gcr.io/tokamon-go/listener-server --project tokamon-go --region asia-northeast3
```

---

### 3. 5xx 에러 다수 발생

**증상:** Cloud Monitoring에서 "Listener Server 5xx Error Alert" 이메일 수신

```bash
# 에러 상세 확인
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="listener-server" AND severity>=ERROR' \
  --project tokamon-go --limit 20 --format=json --freshness=1h

# 서버 재시작
gcloud run deploy listener-server --image gcr.io/tokamon-go/listener-server --project tokamon-go --region asia-northeast3
```

---

### 4. 인스턴스 다운

**증상:** Cloud Monitoring에서 인스턴스 수 0 알림 수신

```bash
# 서비스 상태 확인
gcloud run services describe listener-server \
  --project tokamon-go --region asia-northeast3

# 최근 리비전 확인
gcloud run revisions list \
  --service listener-server --project tokamon-go --region asia-northeast3

# 재배포
gcloud run deploy listener-server \
  --image gcr.io/tokamon-go/listener-server \
  --project tokamon-go --region asia-northeast3
```

---

### 5. 메모리 사용량 80% 초과

**증상:** Cloud Monitoring에서 메모리 초과 알림 수신

```bash
# 메모리 관련 로그 확인
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="listener-server" AND textPayload=~"memory|OOM|heap"' \
  --project tokamon-go --limit 10 --freshness=1h

# 메모리 증설 (512Mi → 1Gi)
gcloud run services update listener-server \
  --memory 1Gi \
  --project tokamon-go --region asia-northeast3
```

---

### 6. FCM 푸시 전송 실패

**증상:** 앱에서 "Failed to send push notification", 로그에 `[FCM] 푸시 전송 실패`

#### 6-1. `messaging/third-party-auth-error` (APNs 인증 실패)

FCM → APNs 전달 시 인증 실패. APNs 키와 팀 ID 불일치가 원인.

**확인:**
- Firebase Console → 프로젝트 설정 → Cloud Messaging → iOS 앱 선택
- APNs 인증 키의 **키 ID**와 **팀 ID**가 올바른지 확인
- APNs 키(.p8)는 **해당 팀 ID의 Apple Developer 계정에서 생성된 것**이어야 함
- 다른 팀(조직)에서 만든 키는 사용 불가

**조치:**
1. Apple Developer (https://developer.apple.com/account) → Keys에서 현재 팀의 APNs 키 확인
2. 키가 없으면 새로 생성 (+ 버튼 → APNs 체크 → .p8 다운로드)
3. Firebase Console에서 기존 키 삭제 → 새 키 업로드 (키 ID + 팀 ID 입력)

#### 6-2. `Request is missing required authentication credential` (서버 인증 실패)

서버 → FCM API 호출 시 서비스 계정 인증 실패.

**확인:**
- Cloud Run 로그에서 Firebase 초기화 로그 확인:
```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="listener-server" AND textPayload=~"Firebase"' \
  --project tokamon-go --limit 5 --freshness=10m --format="table(timestamp,textPayload)"
```
- `[Firebase] Admin SDK 초기화 완료 (Secret Manager 환경변수)` → 정상
- `[Firebase] Admin SDK 초기화 완료 (Application Default Credentials)` → Secret Manager 연결 안 됨

**조치:**
```bash
# Secret Manager에 서비스 계정 키 확인
gcloud secrets versions access latest --secret=FIREBASE_SERVICE_ACCOUNT_KEY --project=tokamon-go | python3 -c "import sys,json; d=json.load(sys.stdin); print('project_id:', d['project_id']); print('client_email:', d['client_email'])"

# Cloud Run에 시크릿 연결 확인
gcloud run services describe listener-server --project tokamon-go --region asia-northeast3 --format='yaml(spec.template.spec.containers[0].env)'
```

---

### 7. WebSocket 재연결 실패 (반복)

**증상:** 로그에 `[WS 재연결]` 패턴이 반복적으로 나타나고 `/health`에서 `"status": "degraded"` 반환

**관련 로그 패턴:**
```
[WS] WebSocket 연결 끊김 (code: 1006, reason: none)
[WS 재연결] 5번째 시도, 32000ms 후...
[WS 재연결] 실패: WebSocket connection failed
```

```bash
# 1. 헬스체크 확인
curl -s https://listener-server-370459866598.asia-northeast3.run.app/health | python3 -m json.tool

# 2. WS 재연결 로그 확인
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="listener-server" AND textPayload=~"WS 재연결"' \
  --project tokamon-go --limit 20 --format=json --freshness=1h

# 3. RPC 프로바이더 상태 확인 (WS_URL 엔드포인트가 살아있는지)
# 재연결이 계속 실패하면 RPC 프로바이더 장애일 수 있음

# 4. 서버 재시작 (마지막 수단)
gcloud run deploy listener-server --image gcr.io/tokamon-go/listener-server --project tokamon-go --region asia-northeast3
```

> 서버는 WS가 끊겨도 HTTP API는 정상 동작합니다. 재연결은 자동이므로 RPC 프로바이더가 복구되면 자동으로 이벤트 수신이 재개됩니다.

---

## 복구 후 확인 사항

서버 재시작 후 아래 항목을 순서대로 확인:

1. **헬스체크 확인** (종합 상태)
```bash
curl -s https://listener-server-370459866598.asia-northeast3.run.app/health | python3 -m json.tool
```
→ `"status": "healthy"`, WS `"connected"`, HTTP `"ok"` 확인

2. **API 응답 확인**
```bash
curl -m 10 -X POST https://listener-server-370459866598.asia-northeast3.run.app/api/device/balance \
  -H "Content-Type: application/json" -d '{"device_id":"healthcheck"}'
```

3. **로그에서 정상 기동 메시지 확인**
```bash
gcloud run services logs read listener-server \
  --project tokamon-go --region asia-northeast3 --limit 10
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
