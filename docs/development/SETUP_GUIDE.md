# Tokamon 환경 설정 및 설치 가이드

---

## 1. 사전 요구사항

| 항목 | 버전/설명 |
|------|-----------|
| Node.js | 18+ |
| Java | 21+ (Firebase 에뮬레이터에 필요) |
| Foundry (forge, anvil) | [설치 가이드](https://book.getfoundry.sh/getting-started/installation) |
| Firebase CLI | `npm install -g firebase-tools` |
| MetaMask | 브라우저 지갑 (클라이언트 연동) |

### 설치 스크립트

```bash
./scripts/install.sh   # Node.js, Foundry, 의존성 점검 및 설치
```

---

## 2. 환경 설정

### 2.1 프로젝트 루트 (`.env`)

컨트랙트 배포(테스트넷/프로덕션) 및 스크립트에서 사용합니다.

```bash
cp .env.example .env
```

| 변수 | 필수 | 설명 |
|------|------|------|
| **RPC_URL** | testnet/production | EVM RPC URL (로컬: `http://127.0.0.1:8999`) |
| **PRIVATE_KEY** | testnet/production | 배포용 지갑 개인키 |
| **CHAIN_ID** | production | 대상 체인 ID (로컬: 1337) |

### 2.2 listener-server (`listener-server/.env`)

블록체인 이벤트 리스너 및 Firestore 동기화에 사용합니다.

```bash
cp listener-server/.env.example listener-server/.env
```

| 변수 | 필수 | 설명 |
|------|------|------|
| **RPC_URL** | ✓ | 블록체인 RPC URL (로컬: `http://127.0.0.1:8999`) |
| **CONTRACT_ADDRESS** | ✓* | Tokamon 컨트랙트 주소 (*로컬 배포 후 `contract-address.json`에서 자동 로드) |
| **SERVICE_ACCOUNT_PATH** | 프로덕션만 | Firebase Service Account JSON 경로 (에뮬레이터 사용 시 불필요) |
| **REQUIRE_ATTESTATION** | - | 디바이스 무결성 검증 (`false`/`log`/`true`, 기본: `false`) |
| **GOOGLE_CLOUD_PROJECT_NUMBER** | attestation 시 | Google Cloud 프로젝트 번호 (Play Integrity) |
| **IOS_APP_ATTEST_APP_ID** | attestation 시 | `<TEAM_ID>.<bundle_id>` (App Attest) |

### 2.3 functions (`functions/.env`)

Cloud Functions 환경변수입니다.

| 변수 | 필수 | 설명 |
|------|------|------|
| **TELEGRAM_HASH_SALT** | ✓ | 텔레그램 해싱용 salt |

### 2.4 Firebase 설정

**로컬 개발 시**: Firebase 에뮬레이터를 사용하므로 Firebase 프로젝트 생성이 필요 없습니다.

**프로덕션 배포 시**:

1. [Firebase Console](https://console.firebase.google.com)에서 프로젝트 생성
2. `.firebaserc`에서 프로젝트 ID를 실제 값으로 변경
3. `client/src/firebase.js`에 `firebaseConfig` 입력
4. `firebase login`으로 로그인
5. **리스너 서버** (Firestore에 스팟/클레임 저장 시):
   - Firebase Console → **프로젝트 설정** → **서비스 계정** → **새 비공개 키 생성** → JSON 다운로드
   - `listener-server/serviceAccountKey.json`으로 저장
   - 또는 `listener-server/.env`에 `SERVICE_ACCOUNT_PATH=/절대경로/파일명.json` 설정

---

## 3. 설치

### 3.1 자동 설치 (권장)

```bash
./scripts/install.sh
```

### 3.2 수동 설치

```bash
# 루트 의존성 (client, listener-server 포함)
npm install

# Foundry (미설치 시)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Firebase CLI (미설치 시)
npm install -g firebase-tools

# contracts 의존성
cd contracts && forge install foundry-rs/forge-std && cd ..

# functions 의존성
cd functions && npm install && cd ..
```

---

## 4. 로컬 개발 (Firebase Emulators)

로컬 환경에서는 Firebase Emulators를 사용합니다. Hosting, Functions, Firestore가 모두 로컬에서 에뮬레이션됩니다.

### 4.1 전체 흐름

```bash
# 터미널 1: Anvil 실행
anvil --port 8999 --chain-id 1337

# 터미널 2: 컨트랙트 배포 → 주소 복사 → 에뮬레이터 시작
cd contracts && forge script script/DeployLocal.s.sol:DeployLocal \
  --rpc-url http://127.0.0.1:8999 --broadcast --unlocked \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cd ..
npm run copy-contracts
npm run emulators

# 터미널 3: Vite 개발 서버 (HMR)
npm run dev

# (선택) 터미널 4: 리스너 서버 (Firestore 에뮬레이터 연결)
npm run listener
```

### 4.2 에뮬레이터 포트

| 서비스 | URL | 설명 |
|--------|-----|------|
| Emulator UI | `http://localhost:4000` | 에뮬레이터 대시보드 |
| Hosting | `http://localhost:5002` | 빌드된 클라이언트 서빙 |
| Functions | `http://localhost:5001` | Cloud Functions API |
| Firestore | `localhost:8080` | Firestore 에뮬레이터 |

### 4.3 접속

| 서비스 | URL |
|--------|-----|
| 웹 클라이언트 (개발, HMR) | `http://localhost:5173` |
| 웹 클라이언트 (에뮬레이터, 빌드) | `http://localhost:5002` |
| Anvil RPC | `http://localhost:8999` (Chain ID: 1337) |

---

## 5. Firebase 배포 (프로덕션)

### 5.1 사전 준비

```bash
firebase login
# .firebaserc에서 프로젝트 ID 설정
```

### 5.2 전체 배포

```bash
npm run deploy   # 빌드 → Hosting + Functions + Firestore Rules 배포
```

### 5.3 개별 배포

```bash
firebase deploy --only hosting           # Hosting만
firebase deploy --only functions          # Functions만
firebase deploy --only firestore:rules    # Firestore 규칙만
```

### 5.4 배포 후 접속

- 웹: `https://<프로젝트-id>.web.app`
- API: `https://<프로젝트-id>.web.app/api/*`

---

## 6. 컨트랙트 배포 모드

### 6.1 로컬 (local)

Anvil 기반. Faucet 포함, 테스트용 TON/ETH 자동 지급.

```bash
anvil --port 8999 --chain-id 1337
cd contracts && forge script script/DeployLocal.s.sol:DeployLocal \
  --rpc-url http://127.0.0.1:8999 --broadcast --unlocked \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
npm run copy-contracts
```

### 6.2 테스트넷 (testnet)

Thanos Sepolia 등. Faucet 포함.

```bash
# .env에 RPC_URL, PRIVATE_KEY, CHAIN_ID 설정
cd contracts && forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url $RPC_URL --broadcast
npm run copy-contracts
```

### 6.3 프로덕션 (production)

Faucet 없음.

```bash
# .env에 RPC_URL, PRIVATE_KEY, CHAIN_ID 설정
cd contracts && forge script script/DeployProduction.s.sol:DeployProduction \
  --rpc-url $RPC_URL --broadcast
npm run copy-contracts
```

---

## 7. npm 스크립트 요약

| 명령 | 설명 |
|------|------|
| `npm run dev` | Vite 개발 서버 (HMR, `http://localhost:5173`) |
| `npm run build` | 클라이언트 프로덕션 빌드 (`client/dist`) |
| `npm run emulators` | Firebase Emulators 시작 (Hosting + Functions + Firestore + UI) |
| `npm run listener` | 리스너 서버 (Firestore **에뮬레이터** 연결) |
| `npm run listener:prod` | 리스너 서버 (실제 Firestore 연결) |
| `npm run copy-contracts` | `contract-address.json` → `client/public/` + `functions/` 복사 |
| `npm run deploy` | 빌드 후 Firebase 전체 배포 |

---

## 8. 트러블슈팅

| 문제 | 해결 |
|------|------|
| `contract-address.json` 없음 | 컨트랙트 배포 후 `npm run copy-contracts` 실행 |
| Anvil 연결 실패 | `lsof -i:8999`로 Anvil 실행 여부 확인 |
| 에뮬레이터 시작 안 됨 | Java 21+ 설치 여부 확인: `java -version` |
| Firebase Functions 에뮬레이터 오류 | `cd functions && npm install` 확인 |
| Firestore 에뮬레이터 연결 안 됨 | `FIRESTORE_EMULATOR_HOST=localhost:8080` 환경변수 확인 |
| MetaMask 연결 안 됨 | 네트워크 RPC URL, Chain ID 일치 확인 |
| 프로덕션 배포 실패 | `firebase login` 및 `.firebaserc` 프로젝트 ID 확인 |
