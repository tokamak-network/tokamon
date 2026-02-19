# Tokamon 배포 가이드

## 구성 요소

| 구성 요소 | 호스팅 | 설명 |
|-----------|--------|------|
| 클라이언트 웹 | Firebase Hosting | React + Vite SPA |
| API (계약 주소, 스팟 등) | Firebase Cloud Functions | `/api/**` 처리 |
| 리스너 서버 | Cloud Run (`asia-northeast3`) | 블록체인 이벤트 리스너 + 텔레그램 봇 + Faucet |
| 앱 (React Native) | EAS Build | Expo + React Native |

---

## 1. 클라이언트 웹 (Firebase Hosting)

```bash
# 빌드
npm run build -w client

# 배포
firebase deploy --only hosting
```

- URL: Firebase Hosting 콘솔에서 확인
- `firebase.json`의 rewrites 설정:
  - `/api/faucet/**` → Cloud Run (listener-server)
  - `/api/**` → Cloud Functions (api)
  - `**` → `/index.html` (SPA)

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

### 로그 확인

```bash
# 최근 로그
firebase functions:log --only api

# 또는 gcloud
gcloud functions logs read api --project tokamon-go --limit 30
```

---

## 3. 리스너 서버 (Cloud Run)

상세 내용: [CLOUD-RUN.md](./CLOUD-RUN.md)

### 재배포

```bash
# 프로젝트 루트에서
cp listener-server/Dockerfile Dockerfile
gcloud run deploy listener-server --source . --region asia-northeast3 --project tokamon-go
rm Dockerfile
```

### 로그 확인

```bash
# 최근 로그
gcloud run services logs read listener-server \
  --project tokamon-go --region asia-northeast3 --limit 50

# 실시간 스트리밍
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=listener-server" \
  --project tokamon-go

# 에러만
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=listener-server AND severity>=ERROR" \
  --project tokamon-go --limit 20
```

### 환경변수 업데이트

```bash
# 값에 콤마가 포함된 경우 ^||^ 구분자 사용
gcloud run services update listener-server \
  --region asia-northeast3 --project tokamon-go \
  --set-env-vars="^||^KEY1=value1||KEY2=value2,with,commas"
```

> 주의: `--set-env-vars`는 기존 env vars를 덮어씁니다. Secret 참조는 유지됩니다.

### 서비스 상태 확인

```bash
gcloud run services describe listener-server \
  --project tokamon-go --region asia-northeast3

# 환경변수 확인
gcloud run services describe listener-server \
  --region asia-northeast3 --project tokamon-go \
  --format="value(spec.template.spec.containers[0].env)"
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

# iOS 빌드
eas build --platform ios

# Android 빌드
eas build --platform android

# 프로파일 지정
eas build --platform ios --profile preview
```

설정: `app/eas.json`

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

## 웹 콘솔 링크

- **Firebase Console**: GCP 콘솔 → Firebase → tokamon-go
- **Cloud Run 대시보드**: GCP 콘솔 → Cloud Run → listener-server → Metrics
- **Cloud Logging**: GCP 콘솔 → Logging → Logs Explorer
- **모니터링 알림**: GCP 콘솔 → Monitoring → Alerting
