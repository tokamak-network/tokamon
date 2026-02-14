# Tokamon MVP

## 한 줄 요약

**정해진 시간에 정해진 장소에 가면 TON을 클레임하는 웹앱**

## 아키텍처

```
┌─────────────────────┐
│  React Web Client   │
│  - Leaflet 지도      │
│  - GPS 위치 추적     │
│  - 스팟 생성/클레임   │
└────────┬────────────┘
         │ REST API
         ↓
┌─────────────────────┐
│  Server (Express)   │
│  - 위치 검증 (50m)   │
│  - 시간 검증         │
│  - 속도 체크         │
│  - 오라클 역할       │
│  - SQLite 메타데이터 │
└────────┬────────────┘
         │ ethers.js (admin TX)
         ↓
┌─────────────────────┐
│  Ganache (EVM)       │
│  - Tokamon.sol       │
│  - 잔액 관리         │
│  - 스팟 예치금 관리   │
│  - 클레임 중복 방지   │
│  - 포트 8999         │
└─────────────────────┘
```

## 클레임 플로우

```
1. 사용자가 스팟 근처 도착 (브라우저 GPS)
2. 클라이언트 → 서버: { user_address, spot_id, lat, lng }
3. 서버 검증 (오라클 역할):
   a. 거리 50m 이내?
   b. 시간 start_time~end_time?
   c. 이동 속도 정상?
   d. 컨트랙트에서 hasClaimed 확인 (영구 제한)
4. 서버가 직접 컨트랙트 claim() 호출 (admin TX)
5. 컨트랙트: hasClaimed 기록 + 잔액 이동
6. 서버 → 클라이언트: { reward, balance }
```

## 보안 (오라클 검증)

| 계층 | 방법 | 구현 |
|------|------|------|
| 위치 | GPS 거리 계산 (50m 이내) | 서버 haversine |
| 속도 | 이전 위치/시간 대비 속도 계산 (max 300km/h) | 서버 미들웨어 |
| 중복 | 스팟당 주소 1회 (영구 제한) | 컨트랙트 hasClaimed |
| 시간 | 활성 시간대 체크 | 서버 검증 |

## 기술 스택

| 영역 | 선택 |
|------|------|
| 클라이언트 | React + Vite + Leaflet |
| 서버 | Express + SQLite + ethers.js |
| 블록체인 | Ganache (EVM, 포트 8999) |
| 컨트랙트 | Solidity 0.8.19 |
| 컴파일 | solc |

## 모듈별 역할

### 1. 컨트랙트 (contracts/src/)
- `Tokamon.sol` — Solidity 스마트 컨트랙트 (Forge 빌드)
  - `deposit()` / `depositSelf()` — TON 예치 (내부 잔액 증가)
  - `createSpot()` / `createSpotSelf()` — 스팟 생성
  - `claim()` / `claimSelf()` — 클레임 (지갑/텔레그램/기기)
  - `getBalance()` / `getSpot()` — 조회
- `forge build` — ABI + bytecode 생성 (contracts/out/)
- `forge script` — 배포 → contract-address.json 저장

### 2. 서버 (server/)
- `blockchain.js` — ethers.js로 컨트랙트 상호작용
- `routes/faucet.js` — 테스트 TON 충전 (컨트랙트 deposit)
- `routes/spots.js` — 스팟 CRUD (컨트랙트 createSpot + SQLite 메타데이터)
- `routes/claim.js` — 위치/시간/속도 검증 → 컨트랙트 claim
- `db.js` — SQLite (spots, location_logs, claims 메타데이터)

### 3. 클라이언트 (client/)
- 지도에 스팟 표시 (Leaflet)
- GPS로 현재 위치 추적
- 스팟 생성 (deposit + reward 설정)
- 클레임 요청
- 잔액 표시

## DB 테이블 (SQLite — 메타데이터 전용)

```sql
spots (
  id, name, description,
  lat, lng,
  start_time, end_time,
  reward, remaining,
  contract_spot_id,
  creator_address,
  created_at
)

location_logs (
  id, user_address,
  lat, lng,
  timestamp
)

claims (
  id, user_address, spot_id,
  reward, claim_id,
  created_at
)
```

잔액(balances)은 컨트랙트가 관리 — SQLite에 없음.

## API

```
POST /api/faucet              테스트 TON 충전 (컨트랙트 deposit)
GET  /api/faucet/balance      잔액 조회 (컨트랙트 getBalance)
GET  /api/spots               스팟 목록 (SQLite + 컨트랙트 remaining)
POST /api/spots               스팟 생성 (컨트랙트 createSpot)
POST /api/claim/request       클레임 요청 (검증 → 컨트랙트 claim)
GET  /api/claim/history       클레임 이력
```

## 실행 방법

```bash
npm run install:all    # 의존성 설치
./scripts/start.sh     # anvil → deploy → server → client
```

상세한 데모 흐름은 [DEMO_GUIDE.md](../DEMO_GUIDE.md) 참조.
