# Tokamon 데모 가이드

## 사전 요구사항

- Node.js 18+
- npm

## 1. 설치

```bash
# 루트에서 전체 설치
npm run install:all

# Ganache 설치 (글로벌)
npm install -g ganache

# 서버 의존성 (ethers, solc 포함)
cd server && npm install && cd ..
```

## 2. Ganache 노드 실행

Ganache는 로컬 EVM 블록체인입니다. 컨트랙트 배포/서버 실행 전에 반드시 먼저 띄워야 합니다.

```bash
# 터미널 1에서 실행 (이 터미널은 계속 켜두세요)
npm run ganache
```

실행되면 아래와 같이 10개의 테스트 계정이 표시됩니다:

```
Available Accounts
==================
(0) 0x05e6... (10000 ETH)   ← admin (컨트랙트 배포자)
(1) 0x029f... (10000 ETH)
...

RPC Listening on 127.0.0.1:8999
```

- 포트: **8999**
- Chain ID: **1337**
- account[0]이 admin으로 모든 컨트랙트 TX를 실행합니다
- `--quiet` 옵션이 포함되어 있어 TX 로그가 생략됩니다. 로그를 보고 싶으면 직접 실행:
  ```bash
  npx ganache --port 8999 --defaultBalanceEther 10000
  ```

## 3. 컨트랙트 배포

Ganache가 실행 중인 상태에서 **새 터미널**을 열고:

```bash
npm run deploy
```

이 명령은 내부적으로 두 가지를 수행합니다:
1. `contracts/solidity/Tokamon.sol`을 solc로 **컴파일** → `contracts/solidity/Tokamon.json` (ABI + bytecode) 생성
2. Ganache에 컨트랙트 **배포** → `server/contract-address.json`에 주소 저장

성공하면 아래와 같이 출력됩니다:

```
컴파일 완료: .../contracts/solidity/Tokamon.json
배포자: 0x05e63980...
컨트랙트 배포 완료: 0x34aE33e0...
주소 저장: .../server/contract-address.json
```

## 4. 서버 + 클라이언트 실행

```bash
# 터미널 2: 서버 (Ganache 연결 + API)
npm run server

# 터미널 3: 클라이언트 (Vite 개발 서버)
npm run client
```

서버가 시작되면 `블록체인 연결 완료 (컨트랙트: 0x...)` 메시지가 출력됩니다.

### 한 번에 실행 (권장)

위 과정을 한 명령으로 실행할 수도 있습니다:

```bash
npm run dev
```

순서: Ganache 시작 → 2초 대기 → 컨트랙트 배포 → 서버 + 클라이언트 동시 실행

## 5. 데모 흐름

### 5-1. 지갑 연결

1. 브라우저에서 `http://localhost:5173` 접속
2. "TON 지갑 연결 (데모)" 버튼 클릭

### 5-2. 충전 (Faucet)

1. 우측 상단 "+ 충전" 버튼 클릭
2. 10 TON이 컨트랙트 내부 잔액으로 지급됨
3. 잔액이 업데이트되는 것을 확인
4. 스팟 생성을 위해 여러 번 충전 (최소 100 TON 필요)

### 5-3. 스팟 만들기

1. "스팟 만들기" 탭 클릭
2. 지도에서 원하는 위치를 클릭하여 핀 배치
3. 스팟 정보 입력:
   - 이름: "강남역 카페"
   - 설명: "맛있는 커피"
   - 시작/종료 시간: 원하는 시간대
   - 총 예치 (TON): 100
   - 방문 보상 (TON): 1
4. "100 TON 예치 + 스팟 생성" 버튼 클릭
5. 잔액이 100 TON 차감되고, 스팟이 지도에 표시됨
6. "약 100명에게 지급 가능" 메시지 확인

### 5-4. TON 클레임

1. "TON 클레임" 탭 클릭
2. 지도에서 생성된 스팟 마커 클릭
3. 스팟 정보 패널에서 확인:
   - 보상 금액 (예: 1 TON)
   - 남은 횟수 (예: 100회)
4. 스팟 50m 이내에 있을 때 "TON 클레임" 버튼 클릭
5. 클레임 성공 메시지 확인
6. 잔액이 보상만큼 증가

### 5-5. 중복 클레임 테스트

1. 같은 스팟에서 다시 클레임 시도
2. "이미 클레임한 스팟입니다" 에러 확인 (영구 제한)

## 6. 확인 포인트

### Ganache 로그

Ganache가 실행 중이면 터미널에서 트랜잭션 로그를 확인할 수 있습니다:

```bash
# Ganache를 --quiet 없이 실행하면 모든 TX가 출력됨
npx ganache --port 8999 --defaultBalanceEther 10000
```

### 컨트랙트 상태 확인

서버 로그에서 확인 가능한 항목:
- 컨트랙트 배포 주소
- deposit/createSpot/claim 트랜잭션 성공 여부
- 잔액 변동

### 배포된 컨트랙트 주소

배포 후 `server/contract-address.json`에서 확인:

```bash
cat server/contract-address.json
```

## 7. 아키텍처

```
┌─────────────────────┐
│  React 웹 클라이언트  │
│  - Leaflet 지도      │
│  - GPS 위치 추적     │
│  - 스팟 생성/클레임   │
└────────┬────────────┘
         │ REST API
         ↓
┌─────────────────────┐
│  Express 서버        │
│  - 위치/시간/속도 검증│
│  - 오라클 역할       │
│  - SQLite 메타데이터 │
└────────┬────────────┘
         │ ethers.js
         ↓
┌─────────────────────┐
│  Ganache (EVM)       │
│  - Tokamon 컨트랙트  │
│  - 잔액 관리         │
│  - 클레임 중복 방지   │
│  - 포트 8999         │
└─────────────────────┘
```

## 8. 트러블슈팅

| 문제 | 해결 |
|------|------|
| "contract-address.json이 없습니다" | `npm run deploy` 먼저 실행 |
| Ganache 연결 실패 | `npm run ganache`로 Ganache가 실행 중인지 확인 |
| 잔액 부족 | "+ 충전" 버튼으로 Faucet 사용 |
| 컨트랙트 에러 | Ganache를 재시작하고 `npm run deploy`로 재배포 |
| DB 충돌 | `server/tokamon.db` 삭제 후 서버 재시작 |
