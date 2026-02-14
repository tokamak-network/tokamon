# Tokamon Database Schema

## 1. Firestore Collections

### 1.1 spot_metadata

스팟(보상 장소) 메타데이터. listener-server가 블록체인 이벤트로 동기화.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | number | 스팟 ID (Document ID = 스팟 ID 문자열) |
| creator_address | string | 스팟 생성자 지갑 주소 (0x...) |
| reward | number | 클레임당 TON 보상 |
| remaining | number | 남은 TON 잔액 |
| stamp_goal | number | 스탬프 목표 횟수 |
| stamp_bonus | number | 스탬프 달성 시 보너스 TON |
| cooldown | number | 클레임 간 쿨다운 (초) |
| allow_duplicate_claims | boolean | 중복 클레임 허용 여부 |
| name | string | 스팟 이름 |
| description | string | 스팟 설명 |
| lat | number | 위도 |
| lng | number | 경도 |
| start_time | string | 활성 시작 시간 ("HH:mm") |
| end_time | string | 활성 종료 시간 ("HH:mm") |

- **Document ID**: 스팟 ID (문자열, 예: "3")
- **Write**: listener-server (SpotCreated, Redeposited, CooldownUpdated, AllowDuplicateClaimsUpdated, Claimed 이벤트)
- **Read**: Firebase Functions (GET /api/spots, POST /api/telegram/validate-claim)

---

### 1.2 claim_events

클레임 이벤트 기록. listener-server가 Claimed 이벤트 발생 시 저장.

| 필드 | 타입 | 설명 |
|------|------|------|
| spot_id | number | 스팟 ID |
| user_address | string | 클레임 사용자 지갑 주소 (0x...) |
| telegram_hash | string | 텔레그램 해시 (텔레그램 클레임 시) |
| reward | number | 지급된 TON 보상 |
| bonus | number | 스탬프 보너스 TON |
| stamp | number | 현재 스탬프 번호 |
| created_at | string | ISO 타임스탬프 |

- **Document ID**: 자동 생성
- **Write**: listener-server (Claimed 이벤트)
- **Read**: Firebase Functions (GET /api/claim/history, GET /api/stamps/:spotId, POST /api/telegram/balance, POST /api/telegram/stamp-info)
- **주요 쿼리**:
  - `where('user_address', '==', addr).limit(100)` — 클레임 히스토리
  - `where('spot_id', '==', id).where('user_address', '==', addr)` — 스탬프 정보
  - `where('telegram_hash', '==', hash)` — 텔레그램 잔액 합산

---

### 1.3 config

앱 설정 정보.

**Document ID: "contract"**

| 필드 | 타입 | 설명 |
|------|------|------|
| address | string | Tokamon 컨트랙트 주소 |
| tokamon | string | Tokamon 컨트랙트 주소 (별칭) |
| tonToken | string | TON 토큰 컨트랙트 주소 |
| faucet | string | Faucet 컨트랙트 주소 |
| chainId | number | 체인 ID (기본 1337) |

- **Write**: 수동 설정 / 배포 시
- **Read**: Firebase Functions (GET /api/contract)

---

### 1.4 telegram_hash_map

텔레그램 해시 → username 매핑. TelegramClaimed 이벤트 시 알림 발송용.

| 필드 | 타입 | 설명 |
|------|------|------|
| username | string | 텔레그램 username (@ 없이) |
| updated_at | string | ISO 타임스탬프 |

- **Document ID**: SHA256 해시 (hex 문자열)
- **Write**: Firebase Functions (POST /api/telegram/hash)
- **Read**: listener-server (TelegramClaimed 이벤트 시 username 조회)

---

## 2. SQLite (telegram.db)

listener-server 전용. 텔레그램 봇 관련 데이터.

### 2.1 telegram_users

봇과 상호작용한 텔레그램 사용자.

```sql
CREATE TABLE telegram_users (
  username TEXT PRIMARY KEY,      -- 텔레그램 username
  chat_id INTEGER NOT NULL,       -- 텔레그램 chat ID (메시지 발송용)
  first_seen INTEGER NOT NULL,    -- 최초 상호작용 (Unix timestamp)
  last_seen INTEGER NOT NULL      -- 마지막 상호작용 (Unix timestamp)
);
```

- **Write**: telegram-bot.js (봇 메시지 수신 시 자동 저장)
- **Read**: telegram-bot.js (getChatIdByUsername — 알림 발송 시)

---

### 2.2 telegram_link_tokens

지갑 연결용 일회성 토큰.

```sql
CREATE TABLE telegram_link_tokens (
  token TEXT PRIMARY KEY,              -- 64자 hex 랜덤 토큰
  telegram_username TEXT NOT NULL,     -- 텔레그램 username
  chat_id INTEGER NOT NULL,            -- 텔레그램 chat ID
  created_at INTEGER NOT NULL,         -- 생성 시간 (Unix timestamp)
  expires_at INTEGER NOT NULL,         -- 만료 시간 (10분)
  used BOOLEAN DEFAULT 0               -- 사용 여부
);
CREATE INDEX idx_telegram_tokens_expires ON telegram_link_tokens(expires_at);
```

- **Write**: telegram-bot.js (generateLinkToken)
- **Read**: routes/telegram.js (/verify-token, /link-wallet)

---

### 2.3 telegram_verify_codes

키오스크 인증용 6자리 코드.

```sql
CREATE TABLE telegram_verify_codes (
  code TEXT PRIMARY KEY,               -- 6자리 숫자 코드
  telegram_username TEXT NOT NULL,     -- 텔레그램 username
  created_at INTEGER NOT NULL,         -- 생성 시간
  expires_at INTEGER NOT NULL,         -- 만료 시간 (3분)
  verified BOOLEAN DEFAULT 0           -- 검증 완료 여부
);
```

- **Write**: routes/telegram.js (/request-code)
- **Read**: routes/telegram.js (/verify-code)

---

### 2.4 telegram_wallet_links

지갑 주소 → 텔레그램 해시 매핑.

```sql
CREATE TABLE telegram_wallet_links (
  wallet_address TEXT PRIMARY KEY,     -- 이더리움 주소 (소문자)
  telegram_hash TEXT NOT NULL,         -- SHA256 해시
  created_at INTEGER NOT NULL          -- 생성 시간
);
```

- **Write**: telegram-bot.js (지갑 연결 시)
- **Read**: routes/telegram.js (GET /linked/:wallet)

---

### 2.5 telegram_hash_username

텔레그램 해시 → username 매핑 (SQLite 버전).

```sql
CREATE TABLE telegram_hash_username (
  telegram_hash TEXT PRIMARY KEY,      -- SHA256 해시
  telegram_username TEXT NOT NULL,     -- username (@ 없이)
  created_at INTEGER NOT NULL,         -- 생성 시간
  updated_at INTEGER NOT NULL          -- 수정 시간
);
```

- **Write**: telegram-bot.js (지갑 연결 시)
- **Read**: 해시 → username 역조회

---

## 3. 파일 기반 저장소

### 3.1 spot-metadata.json

스팟 메타데이터 로컬 캐시. 블록체인 조회를 줄이기 위한 용도.

- **경로**: `listener-server/spot-metadata.json`
- **구조**: `{ "스팟ID": { ...spot_metadata와 동일 } }`
- **Write**: listener-server/blockchain.js (이벤트 발생 시)
- **Read**: listener-server/blockchain.js (getSpot — 캐시 우선 조회)

### 3.2 contract-address.json

배포된 컨트랙트 주소.

- **경로**: `listener-server/contract-address.json`, `functions/contract-address.json`
- **구조**: `{ tokamon, tonToken, faucet, address, chainId }`
- **생성**: `npm run copy-contracts` (scripts/copy-contracts.js)
- **Read**: blockchain.js (init), functions/index.js (GET /api/contract 폴백)

---

## 데이터 흐름도

```
블록체인 이벤트
     │
     ├─ SpotCreated/Redeposited/CooldownUpdated
     │     → spot-metadata.json (캐시)
     │     → Firestore spot_metadata (동기화)
     │
     ├─ Claimed
     │     → Firestore claim_events (기록)
     │     → spot-metadata.json (remaining 업데이트)
     │     → Firestore spot_metadata (동기화)
     │
     └─ TelegramClaimed
           → Firestore telegram_hash_map (username 조회)
           → 텔레그램 봇 알림 전송

키오스크 클레임 흐름
     │
     ├─ POST /api/telegram/hash
     │     → Firestore telegram_hash_map (hash→username 저장)
     │
     ├─ POST /api/telegram/validate-claim
     │     → Firestore spot_metadata (스팟 조회 + 검증)
     │
     └─ MetaMask claimToTelegram()
           → 블록체인 트랜잭션
           → TelegramClaimed 이벤트 (위 흐름으로 연결)
```
