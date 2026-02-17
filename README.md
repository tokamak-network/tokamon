# Tokamon (모노레포)

Firebase Hosting/Functions/Firestore + 블록체인 리스너 기반 웹 서비스 모노레포입니다.
멀티체인을 지원하며, `shared/networks.js`에서 네트워크 설정을 관리합니다.

## 프로젝트 구조

```
tokamon/
├── shared/             # 멀티체인 네트워크 레지스트리 (Single Source of Truth)
│   └── networks.js     # 네트워크/컨트랙트 설정 (local, thanos-sepolia)
├── client/             # 웹 클라이언트 (Vite + React + MetaMask)
├── app/                # 모바일 앱 (React Native + Expo)
├── contracts/          # 스마트 컨트랙트 (Tokamon, TONToken, Faucet) + 배포 스크립트
├── functions/          # Firebase Cloud Functions (API 서버)
├── listener-server/    # 블록체인 이벤트 리스너 → Firestore 동기화
├── tests/              # 멀티체인 검증 테스트
├── firebase.json       # Firebase 프로젝트 설정
├── firestore.rules     # Firestore 보안 규칙
└── docs/               # 아키텍처 문서
```

## 지원 네트워크

| 네트워크 | Chain ID | RPC URL | 용도 |
|----------|----------|---------|------|
| Local (Anvil) | 1337 | `http://127.0.0.1:8999` | 로컬 개발 |
| Thanos Sepolia | 111551119090 | `https://rpc.thanos-sepolia.tokamak.network` | 테스트넷 |

네트워크 추가/변경은 `shared/networks.js` 한 곳만 수정하면 됩니다.

## 사전 요구사항

| 항목 | 버전/설명 |
|------|-----------|
| Node.js | 18+ |
| JDK | 17+ (Android 빌드 + Firebase 에뮬레이터에 필요) |
| Foundry (forge, anvil) | [설치 가이드](https://book.getfoundry.sh/getting-started/installation) |
| Firebase CLI | `npm install -g firebase-tools` |
| MetaMask | 브라우저 지갑 (웹 클라이언트 연동) |
| Android Studio | Android 앱 빌드/에뮬레이터 실행 시 필요 |
| Xcode | iOS 앱 빌드/시뮬레이터 실행 시 필요 (macOS 전용) |

```bash
# JDK 17 설치 (미설치 시)
brew install openjdk@17
# macOS에서 java_home이 인식하도록 심볼릭 링크 생성
sudo ln -sfn $(brew --prefix openjdk@17)/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk
# JAVA_HOME 설정 (~/.zshrc에 추가 권장)
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

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
| Hosting | ocalhost:5002` | 웹 클라이언트 (빌드된 정적 파일) |
| Functions | `http://localhost:5001` | Cloud Functions API (`/api/*`) |
| Firestore | `localhost:8080` | Firestore 에뮬레이터 |
| Vite Dev Server | `https://localhost:5174` | 클라이언트 개발 서버 (HMR, HTTPS) |
| Anvil RPC | `http://localhost:8999` | 로컬 블록체인 (Chain ID: 1337) |
| Expo Dev Server | `http://localhost:8081` | 모바일 앱 개발 서버 |

### 전체 로컬 개발 흐름

#### 1. 의존성 설치

```bash
# 루트 + client + listener-server
npm install

# 앱 (별도)
cd app && npm install && cd ..
```

#### 2. 로컬 블록체인 + 컨트랙트 배포

```bash
# 터미널 1: Anvil 실행
anvil --port 8999 --chain-id 1337

# 터미널 2: 컨트랙트 배포
cd contracts
forge script script/DeployLocal.s.sol:DeployLocal \
  --rpc-url http://127.0.0.1:8999 \
  --broadcast --unlocked \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# 주소 파일 복사 (client, functions, shared/networks.js 업데이트)
cd ..
npm run copy-contracts
```

#### 3. Firebase Emulators 시작

```bash
# 터미널 2: Hosting(5002) + Functions(5001) + Firestore(8080) + UI(4000)
npm run emulators
```

#### 4. 클라이언트 개발 서버

```bash
# 터미널 3: Vite HMR (https://localhost:5174)
npm run dev
```

#### 5. 리스너 서버 (선택)

```bash
# 터미널 4: 블록체인 이벤트 → Firestore 에뮬레이터 동기화
npm run listener
```

> - `npm run emulators`: `--project demo-tokamon`으로 실행되므로 실제 Firebase 프로젝트에 영향 없음
> - `npm run listener`: `NETWORK=local FIRESTORE_EMULATOR_HOST=localhost:8080` 자동 설정

### Anvil 기본 계정 (각 10,000 ETH)

| 주소 | 용도 |
|------|------|
| `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | 배포자 / 테스트 계정 |
| `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | 테스트 계정 |
| `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | 테스트 계정 |

**MetaMask에 로컬 네트워크 추가:**
- RPC URL: `http://127.0.0.1:8999`
- 체인 ID: `1337`
- 통화 기호: `TON`

> 웹 클라이언트 헤더에서 네트워크를 선택하면 MetaMask에 자동으로 네트워크가 추가됩니다.

---

## 모바일 앱 실행 (Android / iOS)

`app/` 디렉토리는 **Expo + React Native** 기반 모바일 앱입니다.

### 사전 요구사항

| 항목 | Android | iOS |
|------|---------|-----|
| JDK | 17+ (`brew install openjdk@17`) | 불필요 |
| IDE | [Android Studio](https://developer.android.com/studio) + Android Emulator | [Xcode](https://developer.apple.com/xcode/) (macOS 전용) |
| Google Maps API 키 | `app/.env`에 설정 | `app/.env`에 설정 |

### 환경 설정

```bash
cd app
cp .env.example .env
```

`app/.env`에서 필요한 값을 설정합니다. 로컬 개발 시에는 `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`만 필수이고, Firebase 관련 값은 배포 시에만 필요합니다.

| 환경변수 | 설명 | 필수 (로컬) |
|----------|------|:-----------:|
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API 키 | O |
| `EXPO_PUBLIC_API_BASE` | Firebase Functions API URL | X (에뮬레이터 자동) |
| `EXPO_PUBLIC_FIREBASE_*` | Firebase 설정값 (6개) | X (배포 시 필요) |

#### Google Maps API 키 발급

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → API 키 생성
2. **Maps SDK for Android** + **Maps SDK for iOS** 활성화
3. `app/.env`에 설정:
   ```
   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=발급받은_키
   ```

### 앱 실행 (Android)

**반드시 `app/` 디렉토리 안에서 실행해야 합니다.** 루트에서 실행하면 잘못된 위치에 빌드 파일이 생성됩니다.

```bash
# 1. 의존성 설치 (최초 1회)
cd app
npm install

# 2. Android 에뮬레이터 실행 (에뮬레이터 목록: $HOME/Library/Android/sdk/emulator/emulator -list-avds)
$HOME/Library/Android/sdk/emulator/emulator -avd Tokamon_Pixel

# 3. 앱 빌드 + 실행 (최초 빌드 시 수 분 소요)
npx expo run:android
```

### 앱 실행 (iOS)

```bash
cd app
npx expo run:ios
```

> - 최초 빌드 후 JS 코드만 수정했다면 `npx expo start`로 Metro만 재실행하여 빠르게 테스트 가능
> - Android 빌드 시 JDK 17+과 `JAVA_HOME` 설정이 필요합니다
> - Android 에뮬레이터는 `localhost` 대신 `10.0.2.2`가 자동으로 사용됩니다
> - 실물 디바이스에서 테스트 시 PC의 실제 IP를 사용하세요 (예: `http://192.168.0.10:5002/api`)

---

## 멀티체인 아키텍처

### 네트워크 레지스트리 (`shared/networks.js`)

모든 네트워크/컨트랙트 설정의 단일 진실 소스입니다.

```
shared/networks.js
  ├── listener-server/blockchain.js   (require)
  ├── listener-server/firebase-admin.js (require)
  ├── functions/shared/networks.js    (빌드 시 복사)
  └── client/src/networkStore.js      (import, Vite 플러그인으로 CJS→ESM 변환)
```

### Firestore 데이터 격리

각 네트워크의 데이터는 Firestore에서 `networks/{networkId}/` 하위에 저장됩니다.

```
networks/
  ├── local/
  │   ├── spot_metadata/{spotId}
  │   ├── claim_events/{eventId}
  │   └── ...
  └── thanos-sepolia/
      └── ...
```

### API 네트워크 파라미터

모든 API 호출에 `?network=` 쿼리 파라미터가 자동 추가됩니다.

```
GET /api/spots?network=local
GET /api/contract?network=thanos-sepolia
GET /api/networks              (네트워크 목록 조회)
```

### 리스너 서버 실행 (네트워크별)

```bash
npm run listener                  # local (Firestore 에뮬레이터)
npm run listener:thanos-sepolia   # Thanos Sepolia (실제 Firestore)
npm run listener:prod             # NETWORK 환경변수 직접 설정
```

---

## 컨트랙트 배포

### 로컬 배포

```bash
cd contracts
forge build

forge script script/DeployLocal.s.sol:DeployLocal \
  --rpc-url http://127.0.0.1:8999 \
  --broadcast --unlocked \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

배포 후 `listener-server/contract-address.json`에 주소가 저장됩니다:

```bash
# 주소를 client, functions, shared/networks.js에 복사
npm run copy-contracts

# NETWORK 지정 시 해당 네트워크의 contracts에 자동 업데이트
NETWORK=thanos-sepolia npm run copy-contracts
```

### 테스트넷/메인넷 배포

```bash
export PRIVATE_KEY=0x...
export RPC_URL=https://rpc.thanos-sepolia.tokamak.network

cd contracts
forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url $RPC_URL --broadcast

cd ..
NETWORK=thanos-sepolia npm run copy-contracts
```

### 배포 스크립트별 Faucet 설정

| 배포 스크립트 | Faucet | 설명 |
|---------------|--------|------|
| `DeployLocal.s.sol` | O | Faucet 배포 (1000 ETH + 100,000 TON), 테스트 계정에 100 ETH 지급 |
| `DeployTestnet.s.sol` | O | `FAUCET_ETH`, `FAUCET_TON` 환경변수로 조절 |
| `DeployProduction.s.sol` | X | Tokamon + TONToken만 배포 |

---

## Firebase 배포 (프로덕션)

### 1. Firebase 프로젝트 설정

1. [Firebase Console](https://console.firebase.google.com)에서 프로젝트 생성
2. `.firebaserc`에서 프로젝트 ID를 실제 값으로 변경
3. `client/src/firebase.js`에 `firebaseConfig` 입력
4. Firebase 로그인: `firebase login`

### 2. Functions 환경변수 설정

```bash
# functions/.env 파일에 설정
echo 'TELEGRAM_HASH_SALT=your-salt-value' > functions/.env
```

### 3. 빌드 및 배포

```bash
# 빌드 + shared/networks.js 복사 + 전체 배포
npm run deploy
```

> `npm run deploy`는 자동으로 `shared/networks.js`를 `functions/shared/`에 복사합니다.

### 개별 배포

```bash
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

---

## 리스너 서버

블록체인 이벤트를 감시하고 Firestore에 동기화하는 서버입니다. `NETWORK` 환경변수로 대상 네트워크를 지정합니다.

```bash
cd listener-server
cp .env.example .env
# .env 편집: RPC_URL, CONTRACT_ADDRESS (로컬 배포 시 contract-address.json에서 자동 로드)
```

프로덕션 Firestore에 쓰기하려면 Service Account 키가 필요합니다:
- Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성
- `listener-server/serviceAccountKey.json`으로 저장

---

## npm 스크립트 요약

| 명령 | 설명 |
|------|------|
| `npm run dev` | Vite 개발 서버 (HMR, `https://localhost:5174`) |
| `npm run build` | 클라이언트 프로덕션 빌드 (`client/dist`) |
| `npm run emulators` | Firebase Emulators 시작 (Hosting + Functions + Firestore + UI) |
| `npm run listener` | 리스너: **local** 네트워크, Firestore 에뮬레이터 연결 |
| `npm run listener:thanos-sepolia` | 리스너: **Thanos Sepolia** 네트워크 |
| `npm run listener:prod` | 리스너: NETWORK 환경변수로 직접 지정 |
| `npm run copy-contracts` | `contract-address.json` → client, functions, shared/networks.js 복사 |
| `npm run deploy` | 빌드 + shared 모듈 복사 + Firebase 전체 배포 |

## 테스트

```bash
# 멀티체인 검증 테스트 (53개)
node tests/multichain.test.js
```

## 참고 문서

- [SETUP_GUIDE.md](docs/SETUP_GUIDE.md) - 환경 설정 및 설치 가이드
- [TOKAMON_FIREBASE_MIGRATION.md](docs/TOKAMON_FIREBASE_MIGRATION.md) - 마이그레이션 가이드
- [ARCHITECTURE_START_GUIDE.md](docs/ARCHITECTURE_START_GUIDE.md) - 아키텍처 및 GCE 배포
- [database-schema.md](docs/database-schema.md) - Firestore 데이터베이스 스키마
