# Listener Server

블록체인 이벤트를 WebSocket으로 구독하고, Firestore에 동기화하며, 텔레그램 봇과 디바이스 클레임 API를 제공하는 서버입니다.

## 주요 기능

- 블록체인 이벤트 리스닝 (SpotCreated, Claimed, Redeposited 등 13개)
- Firestore 실시간 동기화 (스팟 메타데이터, 클레임 이벤트, 잔액)
- 텔레그램 봇 (클레임 알림, 지갑 연결)
- 디바이스 클레임 API (FCM 푸시 인증)

## 로컬 실행

```bash
# .env 파일 생성
cp .env.example .env

# 의존성 설치 (루트에서)
npm install

# Anvil + 컨트랙트 배포 후 리스너 실행
npm run listener        # Firestore 에뮬레이터 연결
npm run listener:prod   # 실제 Firestore 연결
```

## 프로덕션 (Cloud Run)

Cloud Run에 배포되어 항상 1개 인스턴스가 실행됩니다.

배포, 모니터링, 트러블슈팅 → **[docs/operations/CLOUD-RUN.md](../docs/operations/CLOUD-RUN.md)**

```bash
# 빠른 재배포 (레포 루트에서)
docker build --platform linux/amd64 -f listener-server/Dockerfile -t gcr.io/tokamon-go/listener-server .
docker push gcr.io/tokamon-go/listener-server
gcloud run deploy listener-server --image gcr.io/tokamon-go/listener-server --project tokamon-go --region asia-northeast3
```

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `NETWORK` | ✓ | 네트워크 ID (`local`, `thanos-sepolia`) |
| `TELEGRAM_BOT_TOKEN` | ✓ | 텔레그램 봇 토큰 |
| `TELEGRAM_HASH_SALT` | ✓ | 텔레그램 ID 해싱 솔트 |
| `DEVICE_HASH_SALT` | ✓ | 디바이스 ID 해싱 솔트 |
| `SIGNER_PRIVATE_KEY` | 프로덕션 | claimManager 계정 개인키 |
| `RPC_URL` | 선택 | RPC URL 오버라이드 (기본: networks.js) |
| `CONTRACT_ADDRESS` | 선택 | 컨트랙트 주소 오버라이드 (기본: networks.js) |
| `SERVICE_ACCOUNT_PATH` | 로컬 | Firebase Service Account JSON 경로 |
