# Tokamon (모노레포)

Firebase Hosting/Functions/Firestore + 블록체인 리스너 기반 웹 서비스 모노레포입니다.

## 프로젝트 구조

```
tokamon/
├── client/           # 웹 클라이언트 (Vite + React + Firebase SDK + MetaMask)
├── app/              # 모바일 앱 (React Native + Expo)
├── contracts/        # 스마트 컨트랙트 (Tokamon, TONToken, Faucet) + 배포 스크립트
├── functions/        # Firebase Cloud Functions (API 서버)
├── listener-server/  # 블록체인 이벤트 리스너 → Firestore 동기화
├── firebase.json     # Firebase 프로젝트 설정 (Hosting, Functions, Firestore, Emulators)
├── firestore.rules   # Firestore 보안 규칙
└── docs/             # 아키텍처 문서
```

## 사전 요구사항

| 항목 | 버전/설명 |
|------|-----------|
| Node.js | 18+ |
| Java | 21+ (Firebase 에뮬레이터 실행에 필요) |
| Foundry (forge, anvil) | [설치 가이드](https://book.getfoundry.sh/getting-started/installation) |
| Firebase CLI | `npm install -g firebase-tools` |
| MetaMask | 브라우저 지갑 (클라이언트 연동) |

```bash
# Foundry 설치 (미설치 시)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Firebase CLI 설치 (미설치 시)
npm install -g firebase-tools
```

---

## 로컬 개발 (Firebase Emulators)

로컬 환경에서는 **Firebase Emulators**를 사용합니다. Hosting, Functions, Firestore가 모두 로컬에서 에뮬레이션됩니다.

### 에뮬레이터 포트

| 서비스 | 포트 | 설명 |
|--------|------|------|
| Emulator UI | `http://localhost:4000` | 에뮬레이터 대시보드 |
| Hosting | `http://localhost:5002` | 웹 클라이언트 (빌드된 정적 파일) |
| Functions | `http://localhost:5001` | Cloud Functions API (`/api/*`) |
| Firestore | `localhost:8080` | Firestore 에뮬레이터 |
| Vite Dev Server | `http://localhost:5173` | 클라이언트 개발 서버 (HMR) |
| Anvil RPC | `http://localhost:8999` | 로컬 블록체인 (Chain ID: 1337) |

### 전체 로컬 개발 흐름

| 순서 | 터미널 | 명령 | 설명 |
|------|--------|------|------|
| 1 | 터미널 1 | `anvil --port 8999 --chain-id 1337` | 로컬 블록체인 노드 |
| 2 | 터미널 2 | `cd contracts && forge script script/DeployLocal.s.sol:DeployLocal --rpc-url http://127.0.0.1:8999 --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | 컨트랙트 배포 |
| 3 | 터미널 2 | `npm run copy-contracts` | 주소 파일 복사 (client, functions) |
| 4 | 터미널 2 | `npm run emulators` | Firebase Emulators 시작 (Hosting + Functions + Firestore) |
| 5 | 터미널 3 | `npm run dev` | Vite 개발 서버 (HMR, 코드 수정 시 사용) |
| 6 | (선택) 터미널 4 | `npm run listener` | 리스너 서버 (Firestore 에뮬레이터에 연결) |

- **`npm run emulators`**: Hosting(5002) + Functions(5001) + Firestore(8080) + Emulator UI(4000) 를 한꺼번에 시작합니다. `--project demo-tokamon`으로 실행되므로 실제 Firebase 프로젝트에 영향을 주지 않습니다.
- **`npm run dev`**: Vite HMR 개발 서버(5173). 코드 수정 시 빠른 반영을 위해 사용합니다.
- **`npm run listener`**: 리스너 서버가 `FIRESTORE_EMULATOR_HOST=localhost:8080`으로 Firestore 에뮬레이터에 자동 연결됩니다.

### Anvil 기본 계정 (각 10,000 ETH)

| 주소 | 용도 |
|------|------|
| `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | 배포자 / 테스트 계정 (개인키: `0xac0974...`) |
| `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | 테스트 계정 |
| `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | 테스트 계정 |

**MetaMask에 로컬 네트워크 추가:**
- RPC URL: `http://127.0.0.1:8999`
- 체인 ID: `1337`
- 통화 기호: `ETH`

---

## 컨트랙트 배포

### 로컬 배포

```bash
cd contracts
forge build   # lib/forge-std 이미 포함됨

forge script script/DeployLocal.s.sol:DeployLocal \
  --rpc-url http://127.0.0.1:8999 \
  --broadcast \
  --unlocked \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

배포 후 `listener-server/contract-address.json`에 주소가 저장됩니다. 클라이언트와 Functions에 복사:

```bash
npm run copy-contracts
```

### 배포 스크립트별 Faucet 설정

| 배포 스크립트 | Faucet | 설명 |
|---------------|--------|------|
| `DeployLocal.s.sol` | ✅ 포함 | Faucet 배포 (1000 ETH + 100,000 TON), 테스트 계정에 100 ETH 지급 |
| `DeployTestnet.s.sol` | ✅ 포함 | `FAUCET_ETH`(기본 1 ether), `FAUCET_TON`(기본 10,000) 환경변수로 조절 |
| `DeployProduction.s.sol` | ❌ 없음 | Tokamon + TONToken만 배포, `faucet: null` |

---

## Firebase 배포 (프로덕션)

### 1. Firebase 프로젝트 설정

1. [Firebase Console](https://console.firebase.google.com)에서 프로젝트 생성
2. `.firebaserc`에서 프로젝트 ID를 실제 값으로 변경:
   ```json
   { "projects": { "default": "your-firebase-project-id" } }
   ```
3. `client/src/firebase.js`에 `firebaseConfig` 입력
4. Firebase 로그인:
   ```bash
   firebase login
   ```

### 2. Functions 환경변수 설정

```bash
# 텔레그램 해시 salt (필수)
firebase functions:config:set telegram.hash_salt="your-salt-value"

# 또는 functions/.env 파일에 직접 설정
echo 'TELEGRAM_HASH_SALT=your-salt-value' > functions/.env
```

### 3. 빌드 및 배포

```bash
# 클라이언트 프로덕션 빌드
npm run build

# 빌드 + Hosting/Functions/Firestore Rules 전체 배포
npm run deploy
```

배포 완료 후:
- 웹: `https://<프로젝트-id>.web.app`
- API: `https://<프로젝트-id>.web.app/api/*` (Hosting rewrite → Functions)

### 개별 배포

```bash
# Hosting만 배포
firebase deploy --only hosting

# Functions만 배포
firebase deploy --only functions

# Firestore 보안 규칙만 배포
firebase deploy --only firestore:rules
```

---

## 리스너 서버

블록체인 이벤트를 감시하고 Firestore에 동기화하는 서버입니다.

```bash
cd listener-server
cp .env.example .env
# .env 편집: RPC_URL, CONTRACT_ADDRESS (로컬 배포 시 contract-address.json에서 자동 로드)

npm install
```

| 명령 | 설명 |
|------|------|
| `npm run listener` (루트) | Firestore **에뮬레이터**에 연결 (로컬 개발) |
| `npm run listener:prod` (루트) | 실제 Firebase Firestore에 연결 (프로덕션) |

프로덕션에서 Firestore에 쓰기하려면 Service Account 키가 필요합니다:
- Firebase Console → **프로젝트 설정**(⚙️) → **서비스 계정** → **새 비공개 키 생성**
- `listener-server/serviceAccountKey.json`으로 저장
- 또는 `.env`에 `SERVICE_ACCOUNT_PATH=/경로/파일명.json` 설정

---

## 외부 블록체인 사용 시 환경 설정

테스트넷 또는 메인넷 등 외부 RPC URL을 사용할 때 설정하는 파일입니다.

| 설정 위치 | 파일 | 변수 | 용도 |
|-----------|------|------|------|
| **리스너 서버** | `listener-server/.env` | `RPC_URL`, `CONTRACT_ADDRESS` | 블록체인 이벤트 구독 |
| **컨트랙트 배포** | 셸 환경변수 또는 `.env` | `RPC_URL`, `PRIVATE_KEY`, `CHAIN_ID` | 테스트넷/메인넷 배포 |
| **클라이언트** | MetaMask | 네트워크 수동 추가 | 지갑 연동 (RPC URL + 체인 ID) |

### 테스트넷/메인넷 컨트랙트 배포

```bash
export PRIVATE_KEY=0x...
export RPC_URL=https://...
export CHAIN_ID=11124   # 예: Titan Testnet

cd contracts
forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url $RPC_URL \
  --broadcast
```

배포 후 `npm run copy-contracts`로 클라이언트와 Functions에 주소 파일을 복사합니다.

---

## npm 스크립트 요약

| 명령 | 설명 |
|------|------|
| `npm run dev` | Vite 개발 서버 (HMR, `http://localhost:5173`) |
| `npm run build` | 클라이언트 프로덕션 빌드 (`client/dist`) |
| `npm run emulators` | Firebase Emulators 시작 (Hosting + Functions + Firestore + UI) |
| `npm run listener` | 리스너 서버 (Firestore 에뮬레이터 연결) |
| `npm run listener:prod` | 리스너 서버 (실제 Firestore 연결) |
| `npm run copy-contracts` | `contract-address.json` → `client/public/` + `functions/` 복사 |
| `npm run deploy` | 빌드 후 Firebase 전체 배포 (Hosting + Functions + Rules) |

## 참고 문서

- [SETUP_GUIDE.md](docs/SETUP_GUIDE.md) - 환경 설정 및 설치 가이드
- [TOKAMON_FIREBASE_MIGRATION.md](docs/TOKAMON_FIREBASE_MIGRATION.md) - 마이그레이션 가이드
- [ARCHITECTURE_START_GUIDE.md](docs/ARCHITECTURE_START_GUIDE.md) - 아키텍처 및 GCE 배포
- [database-schema.md](docs/database-schema.md) - Firestore 데이터베이스 스키마
