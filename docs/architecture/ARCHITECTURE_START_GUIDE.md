# Tokamon 아키텍처

## 시스템 구조

```
┌─────────────────────────────────────────────────────────────────┐
│  Blockchain (Thanos Sepolia L2)                                   │
│  RPC: https://rpc.thanos-sepolia.tokamak.network                  │
│  컨트랙트: Tokamon.sol (0xA7cDf6657cE30A2316126d8F9952b9A6f17db9b7) │
└──────────────────────────┬──────────────────────────────────────┘
                            │ WebSocket 구독 (13개 이벤트)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloud Run (listener-server)                                      │
│  - 항상 1인스턴스, CPU 항상 활성                                    │
│  - ethers.js WebSocket 이벤트 리스닝                               │
│  - 텔레그램 봇 (클레임 알림, 지갑 연결)                             │
│  - Express API (디바이스 클레임, 텔레그램 인증)                     │
│  - claimManager 키로 트랜잭션 서명 (claimByDevice, linkWallet 등)   │
│  - Firebase Admin SDK → Firestore 동기화                           │
└──────────────┬────────────────────────┬─────────────────────────┘
               │                        │
               ▼                        ▼
┌──────────────────────┐  ┌──────────────────────────────────────┐
│  Firebase Firestore   │  │  Firebase Cloud Functions              │
│  - spot_metadata      │  │  - /api/spots (읽기 API)              │
│  - claim_events       │  │  - /api/telegram/username (서명 검증)  │
│  - telegram_hash_map  │  │  - /api/contract (컨트랙트 주소)       │
│  - wallet_links       │  └──────────────┬───────────────────────┘
│  - device_balances    │                  │
└──────────┬───────────┘                  │
           │ onSnapshot                    │ HTTPS API
           ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  클라이언트                                                       │
│                                                                   │
│  ┌─────────────────┐  ┌──────────────────────────────┐          │
│  │ 모바일 앱         │  │ 웹 클라이언트                  │          │
│  │ (Expo/RN)        │  │ (React + Vite)               │          │
│  │ - FCM 푸시 인증   │  │ - MetaMask 연동              │          │
│  │ - 디바이스 클레임  │  │ - Faucet 컨트랙트 직접 호출   │          │
│  │ - 지갑 연결/출금  │  │ - 스팟 생성 (createSpotSelf)  │          │
│  └─────────────────┘  └──────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## 컴포넌트 역할

### listener-server (Cloud Run)

| 역할 | 설명 |
|------|------|
| 이벤트 리스닝 | 12개 블록체인 이벤트 WebSocket 구독 → Firestore 동기화 |
| 디바이스 클레임 | FCM 푸시 인증 → `claimByDevice()` 트랜잭션 서명 |
| 텔레그램 봇 | 클레임 알림, 지갑 연결 (`/link` 명령어) |
| 지갑 연결 | `linkTelegramToWallet()`, `linkDeviceToWallet()` 트랜잭션 서명 |
| API 서버 | `/api/device/*`, `/api/telegram/*` 엔드포인트 |

### Firebase Cloud Functions

| 역할 | 설명 |
|------|------|
| 읽기 API | `/api/spots`, `/api/contract` — Firestore에서 읽어서 응답 |
| 텔레그램 username | `/api/telegram/username` — 지갑 서명 검증 후 매핑 조회 |

### 스마트 컨트랙트 (Tokamon.sol)

| 호출자 | 함수 | 설명 |
|--------|------|------|
| 서버 (claimManager) | `claimByDevice()` | 디바이스 클레임 |
| 서버 (claimManager) | `linkDeviceToWallet()` | 디바이스-지갑 연결 |
| 서버 (claimManager) | `linkTelegramToWallet()` | 텔레그램-지갑 연결 |
| 스팟 크리에이터 | `claimToTelegram()` | 텔레그램 클레임 (점주가 호출) |
| 사용자 (MetaMask) | `createSpotSelf()` | 스팟 생성 |
| 사용자 (MetaMask) | `claimDeviceToWallet()` | 디바이스 잔액 출금 |
| 사용자 (MetaMask) | `claimTelegramToWallet()` | 텔레그램 잔액 출금 |

## 네트워크 설정

모든 네트워크 설정은 `shared/networks.js`에 정의됩니다 (Single Source of Truth).

| 네트워크 | Chain ID | RPC | 용도 |
|----------|----------|-----|------|
| `local` | 1337 | `http://127.0.0.1:8999` | 로컬 개발 (Anvil) |
| `thanos-sepolia` | 111551119090 | `https://rpc.thanos-sepolia.tokamak.network` | 테스트넷 |

## 데이터 흐름

### 클레임 흐름 (디바이스)

```
1. 앱 → POST /api/device/request-code (FCM 토큰 + 스팟 ID + 위치)
2. 서버 → 거리/쿨다운 검증 → FCM 푸시로 인증번호 전송
3. 앱 → POST /api/device/verify-and-claim (인증번호)
4. 서버 → claimByDevice(spotId, deviceHash) 트랜잭션
5. 블록체인 → DeviceClaimed 이벤트
6. listener → Firestore 동기화 (잔액, 스팟 remaining 갱신)
```

### 클레임 흐름 (텔레그램)

```
1. 점주 키오스크 → claimToTelegram(spotId, telegramHash) (점주 지갑으로 서명)
2. 블록체인 → TelegramClaimed 이벤트
3. listener → Firestore 동기화 + 텔레그램 봇 알림 전송
```

## 관련 문서

- 운영: [operations/CLOUD-RUN.md](../operations/CLOUD-RUN.md)
- DB 스키마: [database-schema.md](./database-schema.md)
- 디바이스 클레임 상세: [development/DEVICE_CLAIM_FCM.md](../development/DEVICE_CLAIM_FCM.md)
- 보안: [operations/security-checklist.md](../operations/security-checklist.md)
