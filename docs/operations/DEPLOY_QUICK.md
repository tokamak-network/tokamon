# 빠른 재배포 가이드

변경사항 배포 시 참고하는 빠른 명령어 모음. 상세 설명은 [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) 참조.

---

## 1. 클라이언트 웹 + Firebase Functions

```bash
# 프로젝트 루트에서 (client 빌드 → networks.js 복사 → hosting + functions 배포)
npm run deploy
```

개별 배포:
```bash
# 클라이언트만
cd client && npm run build && cd ..
firebase deploy --only hosting --project tokamon-go

# Functions만
firebase deploy --only functions --project tokamon-go
```

---

## 2. 리스너 서버 (Cloud Run)

```bash
# 1. Docker 이미지 빌드 (프로젝트 루트에서, amd64 필수)
docker build --platform linux/amd64 \
  -f listener-server/Dockerfile \
  -t gcr.io/tokamon-go/listener-server .

# 2. 이미지 푸시
docker push gcr.io/tokamon-go/listener-server

# 3. Cloud Run 배포
gcloud run deploy listener-server \
  --image gcr.io/tokamon-go/listener-server \
  --project tokamon-go \
  --region asia-northeast3

# 4. 이전 리비전 삭제 (텔레그램 봇 polling 충돌 방지)
gcloud run revisions list --service listener-server \
  --project tokamon-go --region asia-northeast3
gcloud run revisions delete <이전-리비전-이름> \
  --project tokamon-go --region asia-northeast3 --quiet
```

---

## 3. 앱 (EAS Build)

```bash
cd app

# Android APK (테스트용)
eas build --platform android --profile preview

# Android AAB (스토어)
eas build --platform android --profile production

# iOS (TestFlight/App Store)
eas build --platform ios --profile production

# iOS 제출
eas submit --platform ios
```

---

## 배포 후 확인

```bash
# Functions 로그
firebase functions:log --only api

# Cloud Run 로그 (최근 30건)
gcloud run services logs read listener-server \
  --project tokamon-go --region asia-northeast3 --limit 30

# Cloud Run 실시간 모니터링 (로컬 터미널에서 로그 스트리밍, Ctrl+C 종료)
gcloud beta run services logs tail listener-server \
  --project tokamon-go --region asia-northeast3

# Cloud Run 정상 시작 확인 키워드:
# ✅ [Firebase] Admin SDK 초기화 완료
# ✅ [Blockchain] 연결 완료
# ✅ 텔레그램 봇 초기화 완료
# ✅ [이벤트 등록 완료] 12개 이벤트 리스너 등록됨
```
