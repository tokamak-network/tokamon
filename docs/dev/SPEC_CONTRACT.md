# 스마트 컨트랙트 명세

## 개요

Tokamon.sol은 Solidity 0.8.19로 작성된 EVM 스마트 컨트랙트이다.
서버(admin)가 오라클 역할을 하며, 위치/시간 검증 후 컨트랙트 함수를 호출한다.

---

## 데이터 구조

### Spot (스팟)

```solidity
struct Spot {
    address creator;       // 점주 주소
    uint256 reward;        // 1회 방문 보상 (wei)
    uint256 remaining;     // 남은 잔액 (wei)
    uint256 stampGoal;     // 스탬프 목표 횟수
    uint256 stampBonus;    // 스탬프 달성 보너스 (wei)
    uint256 cooldown;      // 재방문 쿨다운 (초)
    string name;           // 매장 이름
    string description;    // 매장 설명
    int256 lat;            // 위도 × 1e6
    int256 lng;            // 경도 × 1e6
    string startTime;      // 활성 시작 시간 ("09:00")
    string endTime;        // 활성 종료 시간 ("22:00")
}
```

### SpotMetadata (생성 시 입력용)

```solidity
struct SpotMetadata {
    string name;
    string description;
    int256 lat;
    int256 lng;
    string startTime;
    string endTime;
}
```

---

## 상태 변수

| 변수 | 타입 | 설명 |
|------|------|------|
| `admin` | address | 서버(오라클) 주소. 컨트랙트 배포자 |
| `nextSpotId` | uint256 | 다음 스팟 ID (자동 증가) |
| `spots` | mapping(uint256 => Spot) | 스팟 ID → 스팟 데이터 |
| `balances` | mapping(address => uint256) | 주소 → 내부 TON 잔액 (wei) |
| `stampCount` | mapping(uint256 => mapping(address => uint256)) | 스팟 ID → 사용자 → 현재 스탬프 수 |
| `lastClaimTime` | mapping(uint256 => mapping(address => uint256)) | 스팟 ID → 사용자 → 마지막 클레임 timestamp |

---

## 이벤트

### SpotCreated
```solidity
event SpotCreated(
    uint256 indexed spotId,     // 생성된 스팟 ID
    address indexed creator,    // 점주 주소
    uint256 reward,             // 1회 보상
    uint256 deposit,            // 예치 금액
    string name,                // 상점 이름
    string description,         // 상점 설명
    int256 lat,                 // 위도 (×1e6)
    int256 lng                  // 경도 (×1e6)
);
```
발생 시점: createSpot() / createSpotSelf() 성공 시

### Claimed
```solidity
event Claimed(
    uint256 indexed spotId,     // 스팟 ID
    address indexed user,       // 클레임한 사용자
    uint256 reward,             // 1회 보상
    uint256 bonus,              // 스탬프 보너스 (0이면 일반 클레임)
    uint256 stamp,              // 클레임 후 스탬프 수 (0이면 리셋됨)
    uint256 timestamp           // 클레임 시각
);
```
발생 시점: claim() 성공 시

### Redeposited
```solidity
event Redeposited(
    uint256 indexed spotId,     // 스팟 ID
    address indexed creator,    // 점주 주소
    uint256 amount              // 추가 예치 금액
);
```
발생 시점: redeposit() 성공 시

---

## 함수

### deposit (TON 충전)

```solidity
function deposit(address user) external payable onlyAdmin
```

| 항목 | 내용 |
|------|------|
| 호출자 | admin (서버) |
| 목적 | 사용자/점주의 내부 잔액 충전 |
| 동작 | msg.value만큼 balances[user] 증가 |
| 조건 | msg.value > 0 |

**상태 변경**:
```
balances[user] += msg.value
```

---

### createSpot (스팟 생성)

```solidity
function createSpot(
    address creator,
    uint256 depositAmt,
    uint256 reward,
    uint256 stampGoal,
    uint256 stampBonus,
    uint256 cooldown,
    SpotMetadata calldata meta
) external onlyAdmin returns (uint256)
```

| 항목 | 내용 |
|------|------|
| 호출자 | admin (서버) |
| 목적 | 새 스팟 등록 + 예치금 차감 |
| 반환 | 생성된 spotId |

**조건**:
| 조건 | 실패 메시지 |
|------|------------|
| reward > 0 | "reward must be > 0" |
| depositAmt >= reward | "deposit must be >= reward" |
| balances[creator] >= depositAmt | "insufficient balance" |
| stampGoal > 0 | "stampGoal must be > 0" |

**상태 변경**:
```
balances[creator] -= depositAmt
spots[nextSpotId] = 새 Spot 데이터
nextSpotId++
```

**이벤트**: SpotCreated

---

### redeposit (재예치)

```solidity
function redeposit(uint256 spotId, address creator, uint256 amount) external onlyAdmin
```

| 항목 | 내용 |
|------|------|
| 호출자 | admin (서버) |
| 목적 | 기존 스팟에 TON 추가 (재활성화) |

**조건**:
| 조건 | 실패 메시지 |
|------|------------|
| spot.reward > 0 | "spot does not exist" |
| spot.creator == creator | "not spot creator" |
| balances[creator] >= amount | "insufficient balance" |

**상태 변경**:
```
balances[creator] -= amount
spots[spotId].remaining += amount
```

**이벤트**: Redeposited

---

### claim (클레임)

```solidity
function claim(uint256 spotId, address user) external onlyAdmin
```

| 항목 | 내용 |
|------|------|
| 호출자 | admin (서버, 위치/시간 검증 후) |
| 목적 | 사용자에게 방문 보상 + 스탬프 처리 |

**조건**:
| 조건 | 실패 메시지 |
|------|------------|
| spot.reward > 0 | "spot does not exist" |
| block.timestamp >= lastClaimTime + cooldown | "cooldown not elapsed" |
| spot.remaining >= payout | "spot exhausted" |

**동작 흐름**:
```
1. 쿨다운 확인
2. payout = spot.reward
3. newStamp = stampCount[spotId][user] + 1
4. if newStamp >= stampGoal:
     bonus = stampBonus
     payout += bonus
     newStamp = 0  (리셋)
5. remaining >= payout 확인
6. spot.remaining -= payout
7. balances[user] += payout
8. stampCount[spotId][user] = newStamp
9. lastClaimTime[spotId][user] = block.timestamp
```

**상태 변경**:
```
spot.remaining -= payout (reward + bonus)
balances[user] += payout
stampCount[spotId][user] = newStamp (또는 0 리셋)
lastClaimTime[spotId][user] = block.timestamp
```

**이벤트**: Claimed (reward, bonus, stamp 포함)

---

### getBalance (잔액 조회)

```solidity
function getBalance(address user) external view returns (uint256)
```

| 항목 | 내용 |
|------|------|
| 목적 | 사용자의 내부 잔액 조회 |
| 반환 | 잔액 (wei) |

---

### getSpotCore (스팟 기본 정보)

```solidity
function getSpotCore(uint256 spotId) external view returns (
    address creator,
    uint256 reward,
    uint256 remaining,
    uint256 stampGoal,
    uint256 stampBonus,
    uint256 cooldown
)
```

| 항목 | 내용 |
|------|------|
| 목적 | 스팟의 핵심 수치 데이터 조회 |
| 반환 | 점주 주소, 보상, 잔액, 스탬프 목표, 보너스, 쿨다운 |

---

### getStampInfo (스탬프 현황)

```solidity
function getStampInfo(uint256 spotId, address user) external view returns (
    uint256 stamps,
    uint256 goal,
    uint256 lastClaim,
    uint256 cooldownRemaining
)
```

| 항목 | 내용 |
|------|------|
| 목적 | 특정 스팟에서 사용자의 스탬프 현황 조회 |
| 반환 | 현재 스탬프 수, 목표, 마지막 클레임 시각, 쿨다운 남은 초 |

**cooldownRemaining 계산**:
```
if (lastClaimTime + cooldown > block.timestamp):
    remaining = lastClaimTime + cooldown - block.timestamp
else:
    remaining = 0
```

---

## 권한 모델

```
[admin (서버)]
  ├── deposit()      — TON 충전
  ├── createSpot()   — 스팟 생성
  ├── redeposit()    — 재예치
  └── claim()        — 클레임 실행

[누구나 (view)]
  ├── getBalance()    — 잔액 조회
  ├── getSpotCore()   — 스팟 정보 조회
  ├── getStampInfo()  — 스탬프 현황 조회
  ├── stampCount()    — 스탬프 수 조회
  └── lastClaimTime() — 마지막 클레임 시간 조회
```

모든 상태 변경 함수는 `onlyAdmin` 제한.
서버가 오라클로서 위치/시간을 검증한 뒤 컨트랙트를 호출하는 구조.

---

## 토큰 흐름 다이어그램

```
[외부 ETH]
    │
    │ deposit() (msg.value)
    ↓
[balances: 점주] ──── createSpot() ────→ [spots[id].remaining]
                                              │
                 ←── redeposit() ──────────── │ (추가)
                                              │
                                         claim()
                                              │
                                              ├── reward ──→ [balances: 사용자]
                                              └── bonus ───→ [balances: 사용자]
```

---

## 단위

| 항목 | 단위 | 변환 |
|------|------|------|
| 금액 (reward, remaining, bonus) | wei | 1 TON = 1 ether = 10^18 wei |
| 좌표 (lat, lng) | int256 | 실제값 × 1,000,000 |
| 쿨다운 (cooldown) | 초 | 24시간 = 86400 |
| 시간 (startTime, endTime) | 문자열 | "09:00", "22:00" |
| 스탬프 (stampGoal, stampCount) | uint256 | 정수 |
