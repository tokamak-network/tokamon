# Tokamon 아키텍처

## 시스템 구조

```
┌──────────────────────────────────────────────────────────────────┐
│  Blockchain (Thanos Sepolia L2)                                    │
│  RPC: https://rpc.thanos-sepolia.tokamak.network (서울, AWS)       │
│  컨트랙트: Tokamon.sol (0xA7cDf6657cE30A2316126d8F9952b9A6f17db9b7) │
└──────────────┬───────────────────────────────────────────────────┘
               │ WebSocket 구독 (13개 이벤트)
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Compute Engine VM (e2-micro) — listener.tokamon.io               │
│  asia-northeast3-a (서울), 고정 IP: 34.64.144.9                    │
│                                                                     │
│  [listener-server — 상시 가동]                                     │
│  - WebSocket 블록체인 이벤트 리스닝 (12개 이벤트)                  │
│  - Telegram 봇 (polling: 알림, /balance, /link, /change)           │
│  - HTTP API (/api/device/*, /api/telegram/*, /api/faucet/*, etc.)  │
│  - claimManager 키로 트랜잭션 서명                                  │
│  - Firestore 동기화 (이벤트 → spot_metadata, claim_events 등)      │
│  - SQLite 영구 저장 (telegram.db, last-block.json)                 │
│  - nginx + Let's Encrypt TLS                                       │
└──────────┬──────────────────────────┬───────────────────────────┘
           │                          │
           ▼                          │
┌──────────────────────┐              │
│  Firebase Firestore   │              │
│  - spot_metadata      │              │
│  - claim_events       │              │
│  - device_claim_events│              │
│  - telegram_hash_map  │              │
│  - telegram_wallet_links│            │
│  - device_balances    │              │
│  - telegram_users     │              │
│  - config (listenerUrl)│             │
└──────────┬───────────┘              │
           │                          │
           ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Firebase Cloud Functions                                         │
│  - /api/spots (읽기 — Firestore 조회)                             │
│  - /api/contract (컨트랙트 주소 + listenerUrl 반환)               │
│  - /api/networks (네트워크 목록)                                   │
│  - /api/claim/history (클레임 히스토리)                            │
│  - /api/telegram/username, /api/telegram/hash 등                  │
│  - listenerProxy → VM (/api/faucet/**, /api/spots/**)             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────────────┐
│  Firebase Hosting (go.tokamon.io)                                 │
│  라우팅:                                                          │
│  - /api/faucet/**, /api/spots/** → listenerProxy (→ VM)          │
│  - /api/**                       → Cloud Functions (api)          │
│  - /**                           → index.html (SPA)              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────┐  ┌──────────────────────────────┐
│ 모바일 앱             │  │ 웹 클라이언트                  │
│ (Expo/RN)            │  │ (React + Vite)               │
│                       │  │                              │
│ - /api/contract에서   │  │ - Firebase Hosting 경유       │
│   listenerUrl 조회    │  │ - MetaMask 연동              │
│ - VM 직접 호출:       │  │ - Faucet 컨트랙트 직접 호출   │
│   /api/device/*       │  │ - 스팟 생성 (createSpotSelf)  │
│ - FCM 푸시 인증       │  │                              │
└─────────────────────┘  └──────────────────────────────┘
```

## 컴포넌트 역할

### Compute Engine VM (listener-server)

> 상시 가동. listener-server 전체 실행.

| 역할 | 설명 |
|------|------|
| 이벤트 리스닝 | 12개 블록체인 이벤트 WebSocket 구독 → Firestore 동기화 |
| Telegram 봇 | 클레임 알림, /balance, /link, /change 명령 처리 (polling) |
| 트랜잭션 서명 | claimManager 키로 claimByDevice, linkWallet 등 실행 |
| 디바이스 API | `/api/device/*` — FCM 인증, 클레임, 잔액, 지갑 연결 (8개) |
| 텔레그램 API | `/api/telegram/*` — 잔액, 검증, 토큰, 지갑 연결 (7개) |
| Faucet API | `/api/faucet/*` — 테스트넷 TON/ETH 지급 (2개) |
| 기타 API | `/api/spots`, `/api/kiosk/*`, `/api/stamps/*` |
| 데이터 영구 저장 | SQLite (telegram.db), last-block.json, spot-metadata.json |

### Firebase Cloud Functions

| 역할 | 설명 |
|------|------|
| 읽기 API | `/api/spots`, `/api/contract` — Firestore에서 읽어서 응답 |
| listenerUrl 제공 | `/api/contract` 응답에 VM URL 포함 (앱이 동적 조회) |
| listenerProxy | `/api/faucet/**`, `/api/spots/**` 요청을 VM으로 전달 |
| 텔레그램 API | `/api/telegram/username`, `/api/telegram/hash` 등 |
| 히스토리 | `/api/claim/history`, `/api/stamps/:spotId` |

### Firebase Hosting

| 역할 | 설명 |
|------|------|
| SPA 호스팅 | React 웹 클라이언트 (`client/dist`) |
| API 라우팅 | `/api/faucet/**`, `/api/spots/**` → listenerProxy → VM |
| API 라우팅 | `/api/**` → Cloud Functions |

### 스마트 컨트랙트 (Tokamon.sol)

| 호출자 | 함수 | 설명 |
|--------|------|------|
| 서버 (claimManager) | `claimByDevice()` | 디바이스 클레임 |
| 서버 (claimManager) | `claimToTelegram()` | 텔레그램 클레임 |
| 서버 (claimManager) | `linkDeviceToWallet()` | 디바이스-지갑 연결 |
| 서버 (claimManager) | `linkTelegramToWallet()` | 텔레그램-지갑 연결 |
| 사용자 (MetaMask) | `createSpotSelf()` | 스팟 생성 |
| 사용자 (MetaMask) | `claimDeviceToWallet()` | 디바이스 잔액 출금 |
| 사용자 (MetaMask) | `claimTelegramToWallet()` | 텔레그램 잔액 출금 |

## API 엔드포인트 전체 맵

### VM (listener-server) — 22개

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/device/attest-challenge` | POST | iOS 인증 챌린지 |
| `/api/device/attest-register` | POST | iOS 인증 등록 |
| `/api/device/request-code` | POST | FCM 푸시로 인증번호 전송 |
| `/api/device/verify-and-claim` | POST | 인증 후 클레임 실행 |
| `/api/device/balance` | POST | 디바이스 잔액 조회 |
| `/api/device/stamp-info` | POST | 스탬프 진행 조회 |
| `/api/device/request-link-code` | POST | 지갑 연결 인증번호 |
| `/api/device/verify-and-link` | POST | 인증 후 지갑 연결 |
| `/api/telegram/status` | GET | 봇 상태 |
| `/api/telegram/balance` | POST | 텔레그램 잔액 |
| `/api/telegram/stamp-info` | POST | 스탬프 진행 |
| `/api/telegram/validate-claim` | POST | 클레임 검증 |
| `/api/telegram/verify-token` | POST | 지갑연결 토큰 검증 |
| `/api/telegram/link-wallet` | POST | 지갑 연결 |
| `/api/telegram/username` | POST | username 조회 |
| `/api/faucet/eth` | POST | 테스트 ETH 지급 |
| `/api/faucet/balance` | GET | Faucet 잔액 |
| `/api/spots` | GET | 스팟 목록 (블록체인 캐시) |
| `/api/stamps/:spotId` | GET | 스탬프 정보 |
| `/api/kiosk/balance` | POST | 키오스크 잔액 |
| `/api/kiosk/stamp-info` | POST | 키오스크 스탬프 |
| `/health`, `/health/live` | GET | 헬스체크 |

### Cloud Functions — 10개

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/networks` | GET | 네트워크 목록 |
| `/api/contract` | GET | 컨트랙트 주소 + listenerUrl |
| `/api/spots` | GET | 스팟 목록 (Firestore) |
| `/api/claim/history` | GET | 클레임 히스토리 |
| `/api/stamps/:spotId` | GET | 스탬프 정보 (Firestore) |
| `/api/telegram/validate-claim` | POST | 클레임 사전 검증 |
| `/api/telegram/balance` | POST | 텔레그램 잔액 (Firestore) |
| `/api/telegram/stamp-info` | POST | 스탬프 진행 |
| `/api/telegram/hash` | POST | 텔레그램 해시 생성 |
| `/api/telegram/username` | POST | username 조회 (서명 검증) |

## 네트워크 설정

모든 네트워크 설정은 `shared/networks.js`에 정의됩니다 (Single Source of Truth).

| 네트워크 | Chain ID | RPC | 용도 |
|----------|----------|-----|------|
| `local` | 1337 | `http://127.0.0.1:8999` | 로컬 개발 (Anvil) |
| `thanos-sepolia` | 111551119090 | `https://rpc.thanos-sepolia.tokamak.network` | 테스트넷 |

## 데이터 흐름

### 클레임 흐름 (디바이스)

```
1. 앱 → /api/contract에서 listenerUrl 조회
2. 앱 → POST listenerUrl/api/device/request-code (FCM 토큰 + 스팟 ID + 위치)
3. VM → 거리/쿨다운 검증 → FCM 푸시로 인증번호 전송
4. 앱 → POST listenerUrl/api/device/verify-and-claim (인증번호)
5. VM → claimByDevice(spotId, deviceHash) 트랜잭션
6. 블록체인 → DeviceClaimed 이벤트
7. VM (WebSocket) → Firestore 동기화 (잔액, 스팟 remaining 갱신)
```

### 클레임 흐름 (텔레그램)

```
1. 점주 키오스크 → claimToTelegram(spotId, telegramHash) (점주 지갑으로 서명)
2. 블록체인 → TelegramClaimed 이벤트
3. VM (WebSocket) → Firestore 동기화 + Telegram 봇 알림 전송
```

### listenerUrl 동적 조회 흐름

```
1. 앱 시작 → GET /api/contract?network=thanos-sepolia (Cloud Functions)
2. Cloud Functions → Firestore config에서 listenerUrl 읽기
3. 응답: { tokamon: "0x...", faucet: "0x...", listenerUrl: "https://listener.tokamon.io" }
4. 앱 → listenerUrl을 사용하여 VM에 직접 API 호출
```

> listenerUrl이 변경되면 Firestore config 값만 수정. 앱 재빌드 불필요.

## 비용 구조

| 컴포넌트 | 호스팅 | 월간 비용 |
|----------|--------|----------|
| VM (listener-server 전체) | Compute Engine e2-micro | ~$7.11 |
| 고정 IP | 인스턴스 연결 | ~$3.60 |
| 부트 디스크 (10GB) | pd-standard | ~$0.40 |
| 읽기 API + listenerProxy | Cloud Functions | $0 (무료 티어) |
| DB | Firestore | ~$0.37 |
| 호스팅 | Firebase Hosting | $0 (무료 티어) |
| **합계** | | **~$11.50/월** |

> 이전: Cloud Run 상시 가동 ~$63/월 → VM 이전 후 ~$11.50/월 (82% 절감)

## 관련 문서

- VM 운영: [operations/COMPUTE-ENGINE.md](../operations/COMPUTE-ENGINE.md)
- DB 스키마: [database-schema.md](./database-schema.md)
- 디바이스 클레임 상세: [development/DEVICE_CLAIM_FCM.md](../development/DEVICE_CLAIM_FCM.md)
- 보안: [operations/security-checklist.md](../operations/security-checklist.md)
- 비용 산정: [operations/SERVER_OPERATION_COST.md](../operations/SERVER_OPERATION_COST.md)
