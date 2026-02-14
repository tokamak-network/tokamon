# 아키텍처 시작 가이드

GCE 리스너 + Firestore + 앱/웹 구조로 진행하기 위한 단계별 가이드입니다.

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│  Blockchain (EVM)                                                 │
│  Alchemy/Infura 등 WebSocket 노드                                 │
└──────────────────────────┬──────────────────────────────────────┘
                            │ WebSocket 구독
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  GCE 리스너 서버 (Ubuntu, PM2)                                    │
│  - ethers.js로 SpotCreated, Claimed 등 이벤트 감시                 │
│  - 복잡한 로직 (검증, 가스비, 컨트랙트 분석)                       │
│  - Firebase Admin SDK → Firestore 쓰기                             │
└──────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Firebase Firestore                                              │
│  - spot_metadata, claim_history 등                                │
│  - 실시간 동기화                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                            │ onSnapshot / 실시간 구독
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  앱/웹 (Flutter / React)                                         │
│  - Firebase SDK로 Firestore 실시간 Listen                         │
│  - Firebase Auth로 로그인                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: 로컬에서 리스너 개발

### 1-1. 프로젝트 구조

```
listener-server/
├── package.json
├── .env
├── serviceAccountKey.json   # Firebase Admin 키 (git 제외!)
├── index.js                 # 메인 엔트리
├── blockchain.js            # ethers.js 이벤트 구독
└── firebase-admin.js        # Firestore 연동
```

### 1-2. 기본 의존성

```bash
mkdir listener-server && cd listener-server
npm init -y
npm install ethers firebase-admin dotenv
```

### 1-3. 핵심 코드 골격

```javascript
// blockchain.js - 이벤트 구독
const { ethers } = require('ethers');
const { syncSpotToFirestore } = require('./firebase-admin');

const RPC_URL = process.env.RPC_URL;  // Alchemy WebSocket 권장
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

const provider = new ethers.WebSocketProvider(RPC_URL);
const contract = new ethers.Contract(address, abi, provider);

contract.on('SpotCreated', async (spotId, creator, reward, ...) => {
  const meta = await fetchSpotMetadata(spotId);  // 컨트랙트 조회
  await syncSpotToFirestore(spotId, meta);       // Firestore 쓰기
});
```

```javascript
// firebase-admin.js - Firestore 쓰기
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

async function syncSpotToFirestore(spotId, meta) {
  await db.collection('spot_metadata').doc(String(spotId)).set(meta, { merge: true });
}
```

### 1-4. 로컬 실행

```bash
# .env 파일에 RPC_URL, CONTRACT_ADDRESS 등 설정
node index.js
```

---

## Phase 2: GCE VM 생성 및 배포

### 2-1. Compute Engine 인스턴스 생성

1. [Google Cloud Console](https://console.cloud.google.com) → Compute Engine → VM 인스턴스
2. **Ubuntu 22.04 LTS** 선택
3. **e2-micro** (무료 티어) 또는 **e2-small** (안정적)
4. 방화벽: HTTP/HTTPS 허용 (필요 시)

### 2-2. Node.js 설치 (VM SSH 접속 후)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

### 2-3. 코드 업로드

```bash
# 로컬에서
gcloud compute scp --recurse ./listener-server VM_NAME:~/ --zone=ZONE

# 또는 git clone (private repo면 SSH 키 설정)
```

### 2-4. PM2로 24시간 실행

```bash
cd ~/listener-server
npm install --production
pm2 start index.js --name "blockchain-listener"
pm2 save
pm2 startup   # 부팅 시 자동 시작
```

---

## Phase 3: Firebase 연동

### 3-1. Service Account 키 발급

1. [Firebase Console](https://console.firebase.google.com) → 프로젝트 설정 → 서비스 계정
2. **새 비공개 키 생성** → JSON 다운로드
3. `serviceAccountKey.json`으로 저장 후 서버에 업로드

### 3-2. Firestore 컬렉션 설계 (예시)

| 컬렉션 | 문서 ID | 용도 |
|--------|---------|------|
| `spot_metadata` | spotId (문자열) | 스팟 메타데이터 |
| `claim_events` | 자동 ID | 클레임 이벤트 로그 |
| `sync_state` | `last_block` | 마지막 동기화 블록 (폴링 시) |

### 3-3. 보안 규칙

- **쓰기**: Admin SDK만 (서버). 클라이언트는 읽기 전용.
- **읽기**: 인증된 사용자 또는 공개(스팟 목록 등)

---

## Phase 4: 클라이언트 (앱/웹) 연동

### 4-1. Firestore 실시간 Listen

```javascript
// React 예시
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

useEffect(() => {
  const unsub = onSnapshot(
    collection(db, 'spot_metadata'),
    (snapshot) => {
      const spots = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSpots(spots);
    }
  );
  return () => unsub();
}, []);
```

### 4-2. API 대체

- 기존 `GET /api/spots` → **Firestore `spot_metadata` 컬렉션 실시간 구독**
- 서버 API 호출 없이 클라이언트가 직접 Firestore Listen

---

## 체크리스트

- [ ] Phase 1: 로컬 리스너 코드 작성 및 테스트
- [ ] Phase 2: GCE VM 생성, Node.js + PM2 설정
- [ ] Phase 3: Firebase 프로젝트, Firestore, Service Account 키
- [ ] Phase 4: 클라이언트 Firestore Listen으로 전환
- [ ] (선택) GitHub Actions로 자동 배포

---

## 비용 대략

| 항목 | 예상 |
|------|------|
| GCE e2-micro | 무료 티어 (월 744시간) |
| GCE e2-small | ~$12/월 |
| Firestore | 읽기/쓰기 무료 티어 넉넉 |
| Alchemy RPC | 무료 티어 (월 수백만 요청) |

Cloud Run min-instances 대비 **e2-micro 무료 티어**를 쓰면 상시 실행도 $0에 가능합니다.
