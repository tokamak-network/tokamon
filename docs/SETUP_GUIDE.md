# Firebase-Test 환경 설정 및 설치 가이드

tokamon 프로젝트 구조를 참고한 환경 설정 및 설치 가이드입니다.

---

## 1. 사전 요구사항

| 항목 | 버전 |
|------|------|
| Node.js | 18+ |
| Foundry (forge, anvil) | [설치 가이드](https://book.getfoundry.sh/getting-started/installation) |
| MetaMask | (클라이언트 지갑 연동용) |
| Firebase CLI | (배포 시) `npm install -g firebase-tools` |
| Firebase 프로젝트 | (Firestore/리스너 사용 시) |

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
| **FAUCET_ETH** | testnet 선택 | Faucet 초기 ETH (기본: 1 ETH) |
| **FAUCET_TON** | testnet 선택 | Faucet 초기 TON (기본: 10,000) |

### 2.2 listener-server (`listener-server/.env`)

블록체인 이벤트 리스너 및 Firestore 동기화에 사용합니다.

```bash
cp listener-server/.env.example listener-server/.env
```

| 변수 | 필수 | 설명 |
|------|------|------|
| **RPC_URL** | ✓ | 블록체인 RPC URL (로컬: `http://127.0.0.1:8999`) |
| **CONTRACT_ADDRESS** | ✓* | Tokamon 컨트랙트 주소 (*로컬 배포 후 `contract-address.json`에서 자동 로드) |
| **SERVICE_ACCOUNT_PATH** | Firestore 사용 시 | Firebase Service Account JSON 경로 |

### 2.3 Firebase 설정

1. [Firebase Console](https://console.firebase.google.com)에서 프로젝트 생성
2. `client/src/firebase.js`에 `firebaseConfig` 입력
3. **리스너 서버** (Firestore에 스팟/클레임 저장할 때만 필요):
   - Firebase Console → **프로젝트 설정** → **서비스 계정** → **새 비공개 키 생성** → JSON 다운로드
   - 파일을 `listener-server/serviceAccountKey.json`으로 저장
   - 또는 `listener-server/.env`에 `SERVICE_ACCOUNT_PATH=/절대경로/파일명.json` 설정
   - **미설정 시**: 리스너는 실행되지만 Firestore 쓰기는 하지 않음 (블록체인 이벤트만 구독)

---

## 3. 설치

### 3.1 자동 설치 (권장)

```bash
./scripts/install.sh
```

- Node.js 18+ 확인
- Foundry (anvil, forge) 설치/확인
- npm workspaces 의존성 설치 (client, listener-server)
- contracts forge-std 설치

### 3.2 수동 설치

```bash
# 루트 의존성
npm install

# Foundry (미설치 시)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# contracts 의존성
cd contracts && forge install foundry-rs/forge-std && cd ..
```

---

## 4. 배포 모드

### 4.1 로컬 (local)

Anvil 기반 로컬 개발 환경. Faucet 포함, 테스트용 TON/ETH 지급.

```bash
# 터미널 1: Anvil 실행
./scripts/start.sh local anvil

# 터미널 2: 배포 후 서비스 시작
./scripts/deploy.sh local
npm run copy-contracts
./scripts/start.sh local client
```

또는 한 번에:

```bash
./scripts/start.sh local all
```

### 4.2 테스트넷 (testnet)

Sepolia, Titan Testnet 등. Faucet 포함.

```bash
# .env에 RPC_URL, PRIVATE_KEY, CHAIN_ID 설정
./scripts/deploy.sh testnet
npm run copy-contracts
```

### 4.3 프로덕션 (production)

Faucet 없음. 사용자가 직접 TON 확보.

```bash
# .env에 RPC_URL, PRIVATE_KEY, CHAIN_ID 설정
./scripts/deploy.sh production
npm run copy-contracts
```

---

## 5. 서비스 구동

### 5.1 start.sh

```bash
./scripts/start.sh [모드] [타겟]
```

| 모드 | 설명 |
|------|------|
| **local** | 로컬 개발 (Anvil + 배포 + client) [기본] |
| **testnet** | 테스트넷 (배포 + client, Anvil 없음) |
| **production** | 프로덕션 (배포 + client) |

| 타겟 | 설명 |
|------|------|
| **all** | 해당 모드 전체 [기본] |
| **anvil** | [local 전용] Anvil만 |
| **deploy** | 컨트랙트 배포만 |
| **client** | Vite 클라이언트만 |
| **listener** | 블록체인 리스너만 |

### 5.2 npm 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | 클라이언트 개발 서버 (Vite, HMR) |
| `npm run build` | 클라이언트 프로덕션 빌드 |
| `npm run listener` | 리스너 서버 시작 |
| `npm run copy-contracts` | contract-address.json → client/public 복사 |
| `npm run serve` | 빌드 후 Firebase Hosting 로컬 서빙 |
| `npm run deploy` | 빌드 후 Firebase 배포 |

### 5.3 접속 URL

| 서비스 | URL |
|--------|-----|
| 웹 클라이언트 (개발) | http://localhost:5173 |
| Firebase Hosting (로컬) | http://localhost:5000 |
| Anvil RPC | http://localhost:8999 (Chain ID: 1337) |

---

## 6. 전체 플로우 요약

### 로컬 개발

```
1. ./scripts/install.sh
2. .env 생성 (RPC_URL=http://127.0.0.1:8999)
3. listener-server/.env 생성 (RPC_URL, CONTRACT_ADDRESS는 배포 후 자동)
4. ./scripts/start.sh local all
5. http://localhost:5173 접속
6. MetaMask: 네트워크 추가 (RPC: http://127.0.0.1:8999, Chain ID: 1337)
```

### 테스트넷

```
1. .env에 RPC_URL, PRIVATE_KEY, CHAIN_ID 설정
2. ./scripts/deploy.sh testnet
3. npm run copy-contracts
4. listener-server/.env에 CONTRACT_ADDRESS 설정 (contract-address.json 참고)
5. npm run dev (또는 npm run listener 별도)
6. MetaMask에서 해당 테스트넷 연결
```

### Firebase 배포

```
1. firebase login
2. .firebaserc에서 프로젝트 ID 설정
3. npm run deploy
4. https://<프로젝트-id>.web.app 접속
```

---

## 7. 트러블슈팅

| 문제 | 해결 |
|------|------|
| contract-address.json 없음 | `./scripts/deploy.sh local` 또는 `./scripts/start.sh local all` |
| Anvil 연결 실패 | `lsof -i:8999`로 Anvil 실행 여부 확인 |
| CONTRACT_ADDRESS 오류 | 로컬: 배포 후 `contract-address.json`의 `address` 자동 로드. 외부: listener-server/.env에 수동 설정 |
| Firebase 리스너 실패 | serviceAccountKey.json, RPC_URL, CONTRACT_ADDRESS 확인 |
| MetaMask 연결 안 됨 | 네트워크 RPC URL, Chain ID 일치 확인 |
