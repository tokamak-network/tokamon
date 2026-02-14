# Firebase 웹 서비스 (모노레포)

Firebase + 블록체인 리스너 기반 웹 서비스 모노레포입니다.

## 프로젝트 구조

```
firebase-test/
├── client/           # 웹 클라이언트 (Vite + Firebase + MetaMask)
├── app/              # 모바일 앱 (Flutter)
├── contracts/        # 스마트 컨트랙트 (Tokamon, TONToken, Faucet) + 배포 스크립트
├── listener-server/  # 블록체인 이벤트 리스너 → Firestore 동기화
└── docs/             # 마이그레이션 및 아키텍처 문서
```

## 시작하기

### 1. 로컬 블록체인 노드 실행 (Anvil)

[Foundry](https://book.getfoundry.sh/getting-started/installation)가 설치되어 있어야 합니다.

```bash
# Foundry 설치 (미설치 시)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Anvil 실행 (터미널 1)
anvil --port 8999 --chain-id 1337

# 기본 포트 8545를 쓸 경우
# anvil
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--port 8999` | RPC 포트 | 8545 |
| `--chain-id 1337` | 체인 ID (로컬 테스트용) | 31337 |

**기본 계정** (각 10000 ETH):
- `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (개인키: `0xac97...`)
- `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`

**MetaMask에 로컬 네트워크 추가:**
- 네트워크 추가 → RPC URL: `http://127.0.0.1:8999` (또는 `http://localhost:8999`)
- 체인 ID: `1337`
- 통화 기호: `ETH`

### 2. 컨트랙트 배포

```bash
cd contracts
forge build   # lib/forge-std 이미 포함됨 (forge install 불필요)

# Anvil 실행 중인 터미널과 별도로 터미널 2에서 배포
forge script script/DeployLocal.s.sol:DeployLocal \
  --rpc-url http://127.0.0.1:8999 \
  --broadcast \
  --unlocked \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

배포 후 `listener-server/contract-address.json`에 주소가 저장됩니다. 클라이언트용 복사:

```bash
npm run copy-contracts
```

**초기 배포에서 Faucet 설정**

| 배포 스크립트 | Faucet | 설명 |
|---------------|--------|------|
| `DeployLocal.s.sol` / `Deploy.s.sol` | ✅ 포함 | Faucet 배포 (1000 ETH + 100,000 TON), 테스트 계정에 100 ETH 지급 |
| `DeployTestnet.s.sol` | ✅ 포함 | `FAUCET_ETH`(기본 1 ether), `FAUCET_TON`(기본 10,000) 환경변수로 조절 |
| `DeployProduction.s.sol` | ❌ 없음 | Tokamon + TONToken만 배포, `faucet: null` |

로컬/테스트넷 배포 시 Faucet 주소는 `contract-address.json`의 `faucet` 필드에 기록됩니다. 클라이언트는 이 파일(`/contract-address.json`)을 읽어 Faucet을 자동 초기화합니다.

### 3. 전체 로컬 개발 흐름

| 순서 | 터미널 | 명령 |
|------|--------|------|
| 1 | 터미널 1 | `anvil --port 8999 --chain-id 1337` |
| 2 | 터미널 2 | `cd contracts && forge script script/DeployLocal.s.sol:DeployLocal --rpc-url http://127.0.0.1:8999 --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| 3 | 루트 | `npm run copy-contracts` |
| 4 | 루트 | `npm run dev` (웹 클라이언트) |
| 5 | (선택) | `cd listener-server && npm start` (이벤트 → Firestore) |

### 웹 클라이언트

```bash
# 의존성 설치 (루트에서)
npm install

# 개발 서버 실행
npm run dev
```

### 리스너 서버

```bash
cd listener-server
cp .env.example .env
# .env: RPC_URL, CONTRACT_ADDRESS (로컬 배포 후 contract-address.json에서 자동 로드 가능)
# Firestore 쓰기 필요 시: serviceAccountKey.json을 이 폴더에 두거나 SERVICE_ACCOUNT_PATH 설정 (위 Firebase 설정 참고)

npm install
npm start
```

### 모바일 앱

```bash
cd app
flutter create . --org com.firebasetest  # 최초 1회 (플랫폼 파일 생성)
flutter pub get
flutter run
```

## Firebase 설정

1. [Firebase Console](https://console.firebase.google.com)에서 프로젝트 생성
2. `client/src/firebase.js`에 `firebaseConfig` 입력
3. **리스너 서버 (Firestore 사용 시)** — Service Account 키:
   - Firebase Console → **프로젝트 설정**(⚙️) → **서비스 계정** 탭
   - **새 비공개 키 생성** → JSON 다운로드
   - 다운로드한 파일을 `listener-server/serviceAccountKey.json`으로 저장  
   - 또는 다른 경로에 두고 `listener-server/.env`에 `SERVICE_ACCOUNT_PATH=/경로/파일명.json` 설정
   - 없으면 리스너는 동작하지만 Firestore 동기화는 건너뜀 (로컬 테스트만 할 때는 생략 가능)

### Firebase Hosting (웹 클라이언트 배포)

```bash
# Firebase CLI 설치 (최초 1회)
npm install -g firebase-tools
firebase login

# .firebaserc에서 프로젝트 ID 설정
# "your-firebase-project-id" → 실제 Firebase 프로젝트 ID로 변경

# 빌드 후 배포
npm run deploy
```

배포 후 `https://<프로젝트-id>.web.app` 또는 커스텀 도메인으로 웹 서비스 접속 가능합니다.

### 로컬에서 배포 환경 테스트

빌드된 클라이언트를 Firebase Hosting과 동일한 방식으로 로컬에서 서빙합니다.

```bash
npm run serve
```

실행 후 `http://localhost:5000`에서 접속합니다. (`npm run dev`는 개발 모드, `npm run serve`는 프로덕션 빌드 기반 테스트)

## 외부 블록체인 사용 시 환경 설정

테스트넷 또는 메인넷 등 외부 RPC URL을 사용할 때 설정하는 파일입니다.

| 설정 위치 | 파일 | 변수 | 용도 |
|-----------|------|------|------|
| **리스너 서버** | `listener-server/.env` | `RPC_URL`, `CONTRACT_ADDRESS` | 블록체인 이벤트 구독 |
| **컨트랙트 배포** | 셸 환경변수 또는 `.env` | `RPC_URL`, `PRIVATE_KEY`, `CHAIN_ID` | 테스트넷/메인넷 배포 |
| **클라이언트** | MetaMask | 네트워크 수동 추가 | 지갑 연동 (RPC URL + 체인 ID) |

### 1. listener-server (`listener-server/.env`)

```bash
cp listener-server/.env.example listener-server/.env
# .env 편집:
RPC_URL=https://your-rpc-url.com/v1/YOUR_KEY
CONTRACT_ADDRESS=0x...   # Tokamon 컨트랙트 주소
SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
```

- `RPC_URL`: HTTPS 또는 WebSocket (`wss://`) URL
- `CONTRACT_ADDRESS`: 배포된 Tokamon 주소 (배포 후 `listener-server/contract-address.json`의 `address` 값)

### 2. 컨트랙트 배포 (테스트넷/메인넷)

```bash
export PRIVATE_KEY=0x...
export RPC_URL=https://...
export CHAIN_ID=11124   # 예: Titan Testnet

cd contracts
forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url $RPC_URL \
  --broadcast
```

배포 후 `listener-server/contract-address.json`이 갱신되므로 `npm run copy-contracts`로 클라이언트에 복사합니다.

### 3. 클라이언트 (웹)

클라이언트는 MetaMask의 네트워크 설정을 사용합니다.

1. MetaMask → 네트워크 추가
2. RPC URL: 배포한 체인의 RPC (예: `https://...`)
3. 체인 ID: 배포 시 사용한 `CHAIN_ID`

`contract-address.json`의 주소·체인 ID는 배포 스크립트가 자동으로 채웁니다.

## 참고 문서

- [TOKAMON_FIREBASE_MIGRATION.md](docs/TOKAMON_FIREBASE_MIGRATION.md) - 마이그레이션 가이드
- [ARCHITECTURE_START_GUIDE.md](docs/ARCHITECTURE_START_GUIDE.md) - 아키텍처 및 GCE 배포
