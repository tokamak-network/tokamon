# Tokamon 배포 가이드

## 구성 요소

| 구성 요소 | 호스팅 | 설명 |
|-----------|--------|------|
| 클라이언트 웹 | Firebase Hosting | React + Vite SPA |
| API (계약 주소, 스팟 등) | Firebase Cloud Functions | `/api/**` 처리 (Firestore에서 읽기) + listenerProxy |
| 리스너 서버 | Compute Engine VM (`asia-northeast3-a`) | 블록체인 이벤트 → Firestore 동기화 + 텔레그램 봇 + HTTP API 전체 |
| 앱 (React Native) | EAS Build | Expo + React Native |

### 데이터 흐름

```
블록체인 컨트랙트
  ↓ (WebSocket 이벤트)
리스너 서버 (Compute Engine VM)
  ↓ (syncSpotToFirestore)
Firestore (spot_metadata)
  ↓ (읽기)
Firebase Functions (/api/spots)
  ↓ (HTTP)
클라이언트 웹 / 앱
```

> 리스너 서버가 Firestore에 연결되지 않으면 스팟 데이터가 클라이언트에 반영되지 않는다.

---

## 1. 클라이언트 웹 (Firebase Hosting)

```bash
# 빌드
cd client && npm run build

# 배포 (프로젝트 루트에서)
firebase deploy --only hosting --project tokamon-go
```

- 기본 URL: https://tokamon-go.web.app
- 커스텀 도메인: https://go.tokamon.io (Firebase Console에서 등록 필요)
- `firebase.json`의 rewrites 설정:
  - `/api/faucet/**`, `/api/spots/**` → listenerProxy (→ VM)
  - `/api/**` → Cloud Functions (api)
  - `**` → `/index.html` (SPA)

### 커스텀 도메인 추가 시

1. 도메인 등록업체(가비아 등)에서 CNAME 레코드 설정
2. Firebase Console → Hosting → 커스텀 도메인 추가 (SSL 인증서 자동 발급)
3. **리스너 서버의 `CORS_ALLOWED_ORIGINS`에 새 도메인 추가 필수**

### 로그 확인

Firebase Hosting은 정적 파일이라 서버 로그 없음. 브라우저 개발자 도구(F12) 콘솔에서 확인.

---

## 2. Firebase Cloud Functions

```bash
# Functions만 배포
firebase deploy --only functions

# 전체 배포 (Hosting + Functions)
npm run deploy
```

> `/api/spots`는 Firestore의 `spot_metadata`에서 읽는다. 리스너 서버가 Firestore에 동기화해야 데이터가 갱신됨.

### 로그 확인

```bash
# 최근 로그
firebase functions:log --only api

# 또는 gcloud
gcloud functions logs read api --project tokamon-go --limit 30
```

---

## 3. 리스너 서버 (Compute Engine VM)

상세 내용: [COMPUTE-ENGINE.md](./COMPUTE-ENGINE.md)

### 서비스 정보

| 항목 | 값 |
|------|-----|
| 인스턴스 | `listener-server` |
| 존 | `asia-northeast3-a` (서울) |
| 머신 타입 | `e2-micro` (0.25 vCPU, 1GB RAM) |
| 도메인 | `listener.tokamon.io` |
| 고정 IP | `34.64.144.9` |

### 필수 환경변수

| 변수 | 값 | 설명 |
|------|-----|------|
| `NODE_ENV` | `production` | 프로덕션 CORS 활성화 |
| `NETWORK` | `thanos-sepolia` | 블록체인 네트워크 |
| `FIREBASE_PROJECT_ID` | `tokamon-go` | Firestore 연결 |
| `CORS_ALLOWED_ORIGINS` | `https://tokamon-go.web.app,...` | 허용할 웹 origin |
| `DATABASE_PATH` | `/data/telegram.db` | SQLite 영구 경로 |
| `LAST_BLOCK_PATH` | `/data/last-block-thanos-sepolia.json` | 블록 추적 파일 |
| `TELEGRAM_BOT_TOKEN` | Secret Manager | 텔레그램 봇 토큰 |
| `TELEGRAM_HASH_SALT` | Secret Manager | 텔레그램 해싱 솔트 |
| `DEVICE_HASH_SALT` | Secret Manager | 디바이스 해싱 솔트 |
| `SIGNER_PRIVATE_KEY` | Secret Manager | claimManager 개인키 |
| `FAUCET_PRIVATE_KEY` | Secret Manager | Faucet 지급 개인키 |

### 재배포

```bash
# 1. 이미지 빌드 (프로젝트 루트에서, amd64 필수)
docker build --platform linux/amd64 \
  -f listener-server/Dockerfile \
  -t gcr.io/tokamon-go/listener-server .

# 2. 이미지 푸시
docker push gcr.io/tokamon-go/listener-server

# 3. VM에서 업데이트
gcloud compute ssh listener-server --zone=asia-northeast3-a --project=tokamon-go
docker pull gcr.io/tokamon-go/listener-server
docker-compose up -d --force-recreate listener-server
```

### 배포 후 확인사항

```bash
# SSH 접속 후
docker logs --tail 30 listener-server

# 확인할 로그:
# ✅ [Firebase] Admin SDK 초기화 완료
# ✅ [Blockchain] 연결 완료
# ✅ 텔레그램 봇 초기화 완료
# ✅ [이벤트 등록 완료] 12개 이벤트 리스너 등록됨

# 헬스체크
curl https://listener.tokamon.io/health
```

### 주의사항: 텔레그램 봇 충돌

텔레그램 봇은 `polling: true` 모드. 같은 봇 토큰으로 2개 인스턴스가 동시에 뜨면 409 Conflict 발생.

### 로그 확인

```bash
# SSH 접속 후
docker logs -f listener-server        # 실시간 로그
docker logs --tail 100 listener-server # 최근 100줄
```

---

## 4. 앱 (React Native / Expo)

### 개발 빌드

```bash
# iOS
npm run ios

# Android
npm run android
```

### EAS Build (배포용)

```bash
cd app

# Android APK (테스트용)
eas build --platform android --profile preview

# Android AAB (스토어 배포용)
eas build --platform android --profile production

# iOS (TestFlight/App Store)
eas build --platform ios --profile production

# iOS 제출 (TestFlight)
eas submit --platform ios
```

설정: `app/eas.json`

### 환경변수

환경변수는 **EAS Secret Manager**로 관리합니다 (`eas.json`에 하드코딩하지 않음).

```bash
# 등록된 시크릿 확인
eas env:list --environment production --non-interactive

# 시크릿 추가/수정
eas env:create --name EXPO_PUBLIC_변수명 --value "값" \
  --scope project --type string --visibility sensitive \
  --environment production --environment preview --environment development \
  --force --non-interactive
```

| 변수 | 설명 |
|------|------|
| `EXPO_PUBLIC_API_BASE` | Firebase Functions API URL |
| `EXPO_PUBLIC_LISTENER_URL_THANOS_SEPOLIA` | 리스너 서버 URL |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase API 키 |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth 도메인 |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Firebase 프로젝트 ID |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage 버킷 |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | FCM 발신자 ID |
| `EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID` | Firebase Android 앱 ID |
| `EXPO_PUBLIC_FIREBASE_APP_ID_IOS` | Firebase iOS 앱 ID |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API 키 |

> 로컬 개발 시에는 `app/.env` 파일을 사용합니다 (git에 미포함).

### Google Cloud Console API 키 제한

| 플랫폼 | 제한 유형 | 등록 항목 |
|--------|----------|----------|
| Android | Android 앱 | 패키지: `io.tokamak.tokamon` + SHA-1 지문 |
| iOS | iOS 앱 | 번들 ID: `io.tokamak.tokamon` |

EAS 키스토어 SHA 지문 확인:
```bash
# EAS GraphQL API로 조회
# sha1CertificateFingerprint, sha256CertificateFingerprint 확인
```

Firebase Console에도 동일한 SHA 지문을 등록해야 합니다.

---

## 5. 로컬 개발 환경

### Anvil (로컬 블록체인)

```bash
anvil --port 8999
```

### 리스너 서버 (로컬)

```bash
# thanos-sepolia 연결
npm run listener:thanos-sepolia

# 로컬 Anvil 연결 (Firestore 에뮬레이터 필요)
npm run listener
```

### 클라이언트 개발 서버

```bash
npm run dev
```

### Firebase 에뮬레이터

```bash
npm run emulators
```

---

## 트러블슈팅

### 스팟 수정이 클라이언트에 반영 안 됨

1. VM 로그에서 `[Firestore] DB 미연결` 확인 → `FIREBASE_PROJECT_ID` 환경변수 추가
2. `SpotUpdated` 이벤트 수신 확인 → WebSocket 연결 상태 확인
3. Firestore Console에서 `spot_metadata` 컬렉션 데이터 직접 확인

### VM 컨테이너 시작 실패

1. RPC 서버 상태 확인: `curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' https://rpc.thanos-sepolia.tokamak.network`
2. 로그 확인: `docker logs listener-server`
3. 컨테이너 재시작: `docker restart listener-server`

### 텔레그램 봇 응답 없음

1. 로그에서 `409 Conflict` → 다른 곳에서 같은 봇 토큰으로 실행 중인지 확인
2. `TELEGRAM_BOT_TOKEN` 환경변수 확인
3. 컨테이너 재시작: `docker restart listener-server`

---

## 웹 콘솔 링크

- **Firebase Console**: https://console.firebase.google.com/project/tokamon-go
- **Compute Engine**: GCP 콘솔 → Compute Engine → VM 인스턴스
- **Cloud Logging**: GCP 콘솔 → Logging → Logs Explorer
- **모니터링 알림**: GCP 콘솔 → Monitoring → Alerting
