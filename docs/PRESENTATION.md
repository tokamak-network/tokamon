# Tokamon - 발표자료

---

## 1. Tokamon 소개

### 매장 방문만으로 TON을 받는 블록체인 리워드 플랫폼

> "Visit, Tap, and Earn TON!"

Tokamon은 기존 종이 쿠폰과 포인트 시스템을 대체하는 **위치 기반 블록체인 리워드 플랫폼**입니다.

### 기존 로열티 시스템의 문제점

| 문제 | 설명 |
|------|------|
| 쿠폰 분실 | 종이 쿠폰은 쉽게 잃어버리거나 훼손됨 |
| 폐업 시 소멸 | 매장이 문을 닫으면 적립 포인트가 사라짐 |
| 실질적 가치 없음 | 매장 포인트는 현금화할 수 없고, 외부에서 사용 불가 |

### Tokamon의 해결책

- **실제 암호화폐(TON)** 를 리워드로 지급 - 임의의 포인트가 아닌 실제 가치가 있는 토큰
- **블록체인 기반 투명성** - 모든 리워드 지급이 온체인에 기록
- **텔레그램만 있으면 시작 가능** - 암호화폐 지갑이 없어도 텔레그램 아이디로 즉시 참여
- **스탬프 보너스** - 방문 횟수에 따른 추가 보너스 TON 지급

---

## 2. 사용자 플로우

### Customer (고객) 플로우

```
1. 매장 방문
       ↓
2. 키오스크에서 텔레그램 아이디 입력 (@username)
       ↓
3. 서버가 자동 검증
   - 매장 영업시간 확인
   - 쿨다운 확인 (중복 방문 방지)
   - 잔여 TON 확인
       ↓
4. TON 리워드 즉시 지급 (온체인)
       ↓
5. 텔레그램 봇으로 알림 수신
       ↓
6. 텔레그램 봇에서 지갑 연결 후 출금 가능
```

### Owner (매장주) 플로우

```
1. MetaMask 지갑 연결
       ↓
2. 지도에서 매장 위치 선택
       ↓
3. Spot 생성 (매장명, 영업시간, 리워드 금액 설정)
       ↓
4. TON 예치 (리워드 풀) - 최소 10 TON
       ↓
5. 스탬프/쿨다운/중복 클레임 설정
       ↓
6. 대시보드에서 매장 관리 및 모니터링
```

### 스탬프 시스템 예시

- 스탬프 목표: 10회, 보너스: 5 TON
- 매 방문마다 0.5 TON + 스탬프 1개
- 10회 방문 시: 0.5 TON + **보너스 5 TON** 지급, 스탬프 리셋

---

## 3. 시스템 아키텍처

### 전체 구조

```
┌─────────────────────────────────────────────┐
│          React Web Client (Port 5173)        │
│  - Leaflet 지도 (매장 위치 표시)                │
│  - 역할 선택 (Customer / Owner)               │
│  - Spot 생성 & 클레임 UI                      │
│  - 매장 키오스크 인터페이스                      │
│  - 오너 대시보드                               │
│  - 다국어 지원 (한국어/영어)                     │
└──────────────────┬──────────────────────────┘
                   │ REST API
                   ↓
┌─────────────────────────────────────────────┐
│        Express Backend (Port 3001)           │
│  - API 엔드포인트 (/api/spots, /api/claim)    │
│  - 위치/시간/거리 검증 (Haversine)              │
│  - SQLite DB (메타데이터, 사용자)               │
│  - Telegram Bot 연동                         │
│  - Oracle 역할 (클레임 검증 및 실행)             │
└──────────────────┬──────────────────────────┘
                   │ ethers.js v6
                   ↓
┌─────────────────────────────────────────────┐
│         EVM Blockchain (Port 8999)           │
│  - Tokamon.sol (핵심 스마트 컨트랙트)           │
│  - TONToken.sol (ERC20 토큰)                 │
│  - Faucet.sol (테스트넷 유틸리티)               │
└─────────────────────────────────────────────┘

        +  Telegram Bot API (알림/잔액/출금)
        +  MetaMask (지갑 연결, 트랜잭션 서명)
```

### 기술 스택

| 레이어 | 기술 |
|--------|------|
| **스마트 컨트랙트** | Solidity 0.8.19, Foundry, Forge |
| **프론트엔드** | React 18, Vite, Leaflet (지도) |
| **백엔드** | Node.js, Express, SQLite |
| **블록체인** | Anvil (로컬 테스트넷), ethers.js v6 |
| **봇** | Telegram Bot API |
| **인증** | MetaMask, Telegram OAuth |
| **배포** | Forge Script, 자동화 쉘 스크립트 |

---

## 4. 스마트 컨트랙트 & 블록체인 설계

### 컨트랙트 구조

#### Tokamon.sol (핵심 컨트랙트)

**주요 함수:**

| 함수 | 설명 |
|------|------|
| `createSpotSelf()` | 매장주가 MetaMask 서명으로 Spot 생성 |
| `claimToTelegram()` | 키오스크에서 텔레그램 사용자에게 리워드 지급 |
| `linkTelegramToWallet()` | 텔레그램 ID와 이더리움 지갑 연결 |
| `claimTelegramToWallet()` | 텔레그램 잔액을 지갑으로 출금 |
| `redepositSelf()` | Spot에 TON 추가 예치 |
| `updateCooldown()` | 쿨다운 시간 변경 |

**온체인 이벤트:**

```solidity
event SpotCreated(uint256 spotId, address creator, uint256 reward, uint256 deposit, string name, string description, int256 lat, int256 lng);
event TelegramClaimed(uint256 spotId, bytes32 telegramHash, uint256 amount);
event TelegramLinked(bytes32 telegramHash, address wallet);
event CooldownUpdated(uint256 spotId, uint256 newCooldown);
```


#### 텔레그램 해시 시스템

```solidity
// 텔레그램 아이디를 온체인에서 안전하게 관리
keccak256(abi.encodePacked("tg:", username))
```

- 텔레그램 아이디를 직접 노출하지 않고 해시로 저장
- 클레임 추적 및 잔액 관리에 활용

#### 위치 검증

- GPS 좌표를 10^6 배율로 정수 변환하여 온체인 저장
- 예: 위도 37.5665 → 37566500
- 백엔드에서 Haversine 공식으로 50m 반경 내 위치 검증


---

## 5. 보안 & 향후 계획

### 보안 & 스팸 방지

| 기능 | 설명 |
|------|------|
| **위치 검증** | 50m 반경 내 위치 확인 필수 |
| **영업시간 검증** | 설정된 영업시간 내에서만 클레임 가능 |
| **쿨다운** | 1시간~24시간 간격 설정 가능 |
| **비수탁형** | 사용자가 직접 개인키를 관리, Tokamon은 자금 통제 없음 |

### 실행 방법

```bash
git clone https://github.com/tokamak-network/tokamon.git
cd tokamon
./scripts/install.sh    # 의존성 확인 및 설치
./scripts/start.sh      # 블록체인 → 배포 → 서버 → 클라이언트 순차 실행
./scripts/stop.sh       # 전체 서비스 종료
./scripts/status.sh     # 상태 확인
```

### 향후 계획

- **GPS Auto-Claim** - 고객 앱이 매장 위치를 자동 감지하여 키오스크 없이 자동 클레임

---

*Tokamon - Powered by Tokamak Network*
