# Tokamon → Firebase 마이그레이션 가이드

tokamon 프로젝트를 **GCE 리스너 + Firestore + 앱/웹** 구조로 마이그레이션하기 위한 가이드입니다.

---

## 1. 현재 tokamon 아키텍처 (AS-IS)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│     Client      │────▶│  Express Server   │────▶│  EVM Blockchain │
│  (React + Vite) │     │  (Node.js)       │     │  (Tokamon.sol)  │
└────────┬────────┘     └────────┬─────────┘     └─────────────────┘
         │                        │
         │  API + Contract 직접호출 │  SQLite (텔레그램 관련)
         │                        ▼
         │               spot-metadata.json
         │               (컨트랙트 이벤트 동기화)
         │
         ▼
   MetaMask (지갑)
```

### Server가 하는 일

| 구분 | 데이터 소스 | 설명 |
|------|------------|------|
| **블록체인 직접** | Tokamon 컨트랙트 | 스팟, 클레임, 스탬프, 잔액 등 모든 핵심 데이터 |
| **블록체인 이벤트** | SpotCreated, Claimed 등 | spot-metadata.json 자동 갱신 |
| **SQLite** | telegram_* 테이블 | 링크 토큰, 인증 코드, 지갑↔텔레그램 매핑 |
| **device/claim** | 서버가 signer | 기기 ID로 클레임 시 서버가 트랜잭션 서명 |

---

## 2. 목표 아키텍처 (TO-BE)

```
┌──────────────────────────────────────────────────────────────────┐
│  Blockchain (EVM) – Tokamon.sol 컨트랙트                           │
│  Alchemy/Infura 등 WebSocket 노드                                 │
└──────────────────────────┬───────────────────────────────────────┘
                            │ WebSocket 구독 (contract.on)
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  GCE 리스너 서버 (Ubuntu, PM2 24시간 실행)                         │
│  • ethers.js로 SpotCreated, Claimed, Redeposited 등 이벤트 감시     │
│  • 복잡한 로직: 트랜잭션 검증, 가스비 계산, 컨트랙트 분석 등        │
│  • Firebase Admin SDK로 Firestore에 메타데이터 쓰기                │
│  • device claim, 텔레그램 링크 등 admin 트랜잭션 실행 (필요 시)    │
└──────────────────────────┬───────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Firebase Firestore                                               │
│  • spot_metadata, claim_events 등 – GCE 서버가 업데이트            │
│  • telegram_link_tokens 등 – SQLite 대체                           │
│  • 앱/웹과 실시간 동기화                                           │
└──────────────────────────┬───────────────────────────────────────┘
                            │ onSnapshot / 실시간 Listen
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  앱/웹 (React / Flutter)                                         │
│  • Firebase SDK로 Firestore 실시간 Listen                          │
│  • GCE가 데이터 업데이트 → 화면 즉시 반영 (API 호출 불필요)         │
│  • Firebase Auth 또는 MetaMask (지갑 연동)                         │
│  • 컨트랙트 직접 호출: createSpotSelf, claimSelf 등 (MetaMask 서명)  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. 컴포넌트별 마이그레이션

### 3-1. GCE 리스너 서버

| 기존 (Express) | 마이그레이션 |
|----------------|-------------|
| `server/blockchain.js` | `listener-server/` – ethers.js WebSocket 구독 |
| `spot-metadata.json` | Firestore `spot_metadata` 컬렉션에 쓰기 |
| `contract.on('SpotCreated', ...)` | 동일 로직 + `db.collection('spot_metadata').doc(id).set()` |
| device/claim API | Express API 서버 병행 또는 GCE에서 HTTP 엔드포인트 제공 |

**역할**

- 24시간 블록체인 이벤트 구독
- 이벤트 수신 시 컨트랙트에서 메타데이터 조회 후 Firestore 쓰기
- device claim, 텔레그램 링크 등 admin 권한이 필요한 트랜잭션 실행

### 3-2. Firestore

| 기존 | Firestore |
|------|-----------|
| `spot-metadata.json` | `spot_metadata` (문서 ID = spotId) |
| SQLite `telegram_link_tokens` | `telegram_link_tokens` |
| SQLite `telegram_verify_codes` | `telegram_verify_codes` |
| SQLite `telegram_users` | `telegram_users` |
| SQLite `telegram_wallet_links` | `telegram_wallet_links` |
| SQLite `telegram_hash_username` | `telegram_hash_username` |
| (신규) | `claim_events` – 클레임 로그 |
| (신규) | `sync_state` – 마지막 동기화 블록 (폴링 방식 시) |

### 3-3. 클라이언트 (앱/웹)

| 기존 | 마이그레이션 |
|------|-------------|
| `GET /api/spots` | Firestore `spot_metadata` 컬렉션 `onSnapshot` |
| `GET /api/claim/history` | Firestore `claim_events` 또는 컨트랙트 이벤트 직접 조회 |
| `GET /api/contract` | 정적 config 또는 Firestore `config` 문서 |
| 컨트랙트 직접 호출 | **유지** (createSpotSelf, claimSelf, getBalance 등). Faucet: getEth, getTon, getNextEthRequestTime, getNextTonRequestTime |
| MetaMask | **유지** |

### 3-4. 인증

| 용도 | 방식 |
|------|------|
| 앱/웹 로그인 | Firebase Auth (이메일, 소셜) 또는 MetaMask 지갑 연동 |
| 텔레그램 링크 | 기존 플로우 유지, DB만 Firestore로 이전 |

---

## 4. device claim / 텔레그램 API 처리

이 기능들은 **admin signer**가 필요하므로 GCE 서버에서 처리합니다.

**옵션 A: 리스너와 API 통합**

- GCE에서 Express(또는 Fastify) 서버도 함께 실행
- `/api/device/claim`, `/api/telegram/*` 등 엔드포인트 유지
- 리스너 프로세스와 API 프로세스를 PM2로 각각 실행

**옵션 B: API 전용 서비스 분리**

- API용 Cloud Run 또는 별도 GCE 인스턴스
- 호출 빈도가 낮으면 Cloud Run이 비용 효율적

---

## 5. 단계별 마이그레이션 체크리스트

### Phase 1: Firebase & Firestore 준비

- [ ] Firebase 프로젝트 생성
- [ ] Firestore 컬렉션 설계 (`spot_metadata`, `telegram_*` 등)
- [ ] Firestore 보안 규칙 작성 (쓰기: Admin만, 읽기: 인증 사용자 또는 공개)
- [ ] Service Account 키 발급 (`serviceAccountKey.json`)

### Phase 2: GCE 리스너 개발

- [ ] `listener-server/` 프로젝트 생성 (ethers.js, firebase-admin)
- [ ] 블록체인 이벤트 구독 코드 작성 (SpotCreated, Claimed 등)
- [ ] Firestore 쓰기 로직 구현
- [ ] 로컬에서 `node index.js` 실행 및 동작 확인

### Phase 3: GCE VM 배포

- [ ] Compute Engine 인스턴스 생성 (Ubuntu, e2-micro 권장)
- [ ] Node.js, PM2 설치
- [ ] 코드 업로드, `serviceAccountKey.json` 배치
- [ ] `pm2 start`, `pm2 startup` 설정
- [ ] 환경 변수 설정 (RPC_URL, CONTRACT_ADDRESS 등)

### Phase 4: 클라이언트 전환

- [ ] `getSpots` → Firestore `onSnapshot`으로 교체
- [ ] `getClaimHistory` → Firestore 또는 컨트랙트 이벤트 조회로 교체
- [ ] API base URL 제거 또는 최소화
- [ ] Firebase Hosting으로 클라이언트 배포

### Phase 5: 텔레그램 & device

- [ ] SQLite → Firestore 마이그레이션 스크립트
- [ ] `server/routes/telegram.js` → Firestore 사용하도록 수정
- [ ] device/claim API를 GCE 또는 Cloud Run에 배포

---

## 6. 비용 대략

| 항목 | 예상 |
|------|------|
| GCE e2-micro | **무료 티어** (월 744시간) |
| GCE e2-small | 약 $12/월 |
| Firestore | 무료 티어 내에서 충분 |
| Firebase Hosting | 무료 티어 |
| Alchemy RPC | 무료 티어 (월 수백만 요청) |

Cloud Run min-instances 대비 **e2-micro 무료 티어**로 24시간 리스너 운영 가능.

---

## 7. 모노레포 구조

```
firebase-test/
├── client/           # 웹 (React/Vite) – Firestore 실시간 Listen
├── app/              # 모바일 (Flutter) – Firestore 실시간 Listen
├── listener-server/  # GCE 블록체인 이벤트 → Firestore
└── docs/
```

## 8. 참고 문서

- [ARCHITECTURE_START_GUIDE.md](./ARCHITECTURE_START_GUIDE.md) – 구현 단계별 상세 가이드
