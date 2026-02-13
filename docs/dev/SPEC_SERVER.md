# 서버 API 명세

## 개요

Express 백엔드가 클라이언트와 스마트 컨트랙트 사이에서 오라클 역할을 수행한다.
서버는 위치/시간/속도를 검증한 뒤, admin 권한으로 컨트랙트 함수를 호출한다.

---

## API 엔드포인트

### 1. TON 충전

```
POST /api/faucet
```

| 항목 | 내용 |
|------|------|
| 기능 | 사용자/점주의 내부 잔액에 TON 충전 |
| 컨트랙트 | deposit(user) |

**요청**:
```json
{
  "user_address": "0x...",
  "amount": 100
}
```

**응답 (성공)**:
```json
{
  "message": "100 TON 충전 완료",
  "balance": 150
}
```

**응답 (실패)**:
```json
{
  "error": "user_address가 필요합니다"
}
```

---

### 2. 잔액 조회

```
GET /api/faucet/balance?user_address=0x...
```

| 항목 | 내용 |
|------|------|
| 기능 | 사용자의 내부 TON 잔액 조회 |
| 컨트랙트 | getBalance(user) |

**응답**:
```json
{
  "balance": 150
}
```

---

### 3. 스팟 목록 조회

```
GET /api/spots
```

| 항목 | 내용 |
|------|------|
| 기능 | 전체 스팟 목록 조회 |
| 컨트랙트 | getSpotCore() × N + 메타데이터 캐시 |

**응답**:
```json
[
  {
    "id": 0,
    "name": "이영희 카페",
    "description": "아메리카노 50% 할인!",
    "lat": 37.4979,
    "lng": 127.0276,
    "start_time": "09:00",
    "end_time": "22:00",
    "reward": 0.1,
    "remaining": 25.5,
    "stamp_goal": 10,
    "stamp_bonus": 2,
    "cooldown": 86400,
    "creator_address": "0x..."
  }
]
```

---

### 4. 스팟 생성

```
POST /api/spots
```

| 항목 | 내용 |
|------|------|
| 기능 | 새 스팟 등록 + TON 예치 |
| 검증 | 잔액 확인, 필수 필드 확인 |
| 컨트랙트 | createSpot() |

**요청**:
```json
{
  "creator_address": "0x...",
  "name": "이영희 카페",
  "description": "아메리카노 50% 할인!",
  "lat": 37.4979,
  "lng": 127.0276,
  "start_time": "09:00",
  "end_time": "22:00",
  "reward": 0.1,
  "deposit": 30,
  "stamp_goal": 10,
  "stamp_bonus": 2,
  "cooldown": 86400
}
```

**응답 (성공)**:
```json
{
  "message": "스팟 생성 완료",
  "spot_id": 0,
  "remaining_balance": 120
}
```

**응답 (실패)**:
```json
{
  "error": "잔액이 부족합니다 (현재: 20 TON, 필요: 30 TON)"
}
```

---

### 5. 스팟 재예치

```
POST /api/spots/:id/redeposit
```

| 항목 | 내용 |
|------|------|
| 기능 | 기존 스팟에 TON 추가 예치 |
| 검증 | 스팟 존재, 본인 스팟, 잔액 확인 |
| 컨트랙트 | redeposit() |

**요청**:
```json
{
  "creator_address": "0x...",
  "amount": 20
}
```

**응답 (성공)**:
```json
{
  "message": "20 TON 재예치 완료",
  "spot_remaining": 20,
  "remaining_balance": 100
}
```

**응답 (실패)**:
```json
{
  "error": "본인이 생성한 스팟만 재예치할 수 있습니다"
}
```

---

### 6. 클레임 요청

```
POST /api/claim/request
```

| 항목 | 내용 |
|------|------|
| 기능 | 스팟 방문 시 TON 클레임 |
| 컨트랙트 | claim() |

**서버 검증 순서**:
1. 필수 파라미터 확인
2. 스팟 존재 확인
3. 거리 확인 (haversine, 50m 이내)
4. 시간 확인 (start_time ~ end_time)
5. 속도 확인 (이전 위치 대비 max 300km/h)
6. 쿨다운 확인 (컨트랙트 lastClaimTime + cooldown)
7. 잔액 확인 (스팟에 TON 남아있는지)
8. 컨트랙트 claim() 호출

**요청**:
```json
{
  "user_address": "0x...",
  "spot_id": 0,
  "lat": 37.4979,
  "lng": 127.0276
}
```

**응답 (성공 - 일반)**:
```json
{
  "message": "0.1 TON 클레임 성공!",
  "reward": 0.1,
  "bonus": 0,
  "stamp": 4,
  "stamp_goal": 10,
  "balance": 1.5,
  "spot_name": "이영희 카페"
}
```

**응답 (성공 - 스탬프 달성)**:
```json
{
  "message": "스탬프 달성! 2.1 TON 클레임 성공!",
  "reward": 0.1,
  "bonus": 2.0,
  "stamp": 0,
  "stamp_goal": 10,
  "balance": 5.6,
  "spot_name": "이영희 카페"
}
```

**응답 (실패)**:
| 상황 | status | error |
|------|--------|-------|
| 파라미터 누락 | 400 | "필수 항목을 입력해주세요" |
| 스팟 없음 | 404 | "스팟을 찾을 수 없습니다" |
| 거리 초과 | 400 | "너무 멀어요 (320m)" |
| 시간 외 | 400 | "활성 시간이 아닙니다 (09:00~22:00)" |
| 비정상 속도 | 400 | "비정상적 이동 속도가 감지되었습니다" |
| 쿨다운 | 400 | "쿨다운 중입니다 (12시간 30분 남음)" |
| TON 소진 | 400 | "이 스팟의 TON이 소진되었습니다" |

---

### 7. 클레임 히스토리

```
GET /api/claim/history?user_address=0x...
```

| 항목 | 내용 |
|------|------|
| 기능 | 사용자의 클레임 내역 조회 |
| 컨트랙트 | Claimed 이벤트 조회 |

**응답**:
```json
[
  {
    "spot_id": 0,
    "spot_name": "이영희 카페",
    "user_address": "0x...",
    "reward": 0.1,
    "bonus": 2.0,
    "stamp": 0,
    "created_at": "2026-02-07T12:30:00.000Z"
  },
  {
    "spot_id": 1,
    "spot_name": "홍길동 피자",
    "user_address": "0x...",
    "reward": 0.15,
    "bonus": 0,
    "stamp": 1,
    "created_at": "2026-02-07T12:15:00.000Z"
  }
]
```

---

### 8. 스탬프 현황 조회

```
GET /api/stamps/:spotId?user_address=0x...
```

| 항목 | 내용 |
|------|------|
| 기능 | 특정 스팟에서 사용자의 스탬프 현황 조회 |
| 컨트랙트 | getStampInfo() |

**응답**:
```json
{
  "spot_id": 0,
  "stamps": 3,
  "goal": 10,
  "last_claim": "2026-02-06T12:00:00.000Z",
  "cooldown_remaining": 45000
}
```

---

## 서버 내부 검증 로직

### 거리 검증 (haversine)
```
입력: 사용자 좌표 (lat, lng), 스팟 좌표 (lat, lng)
기준: 50m 이내
방법: haversine 공식으로 두 좌표 간 거리 계산
```

### 시간 검증
```
입력: 현재 시각, 스팟의 start_time ~ end_time
기준: 현재 시각이 범위 내
```

### 속도 검증
```
입력: 이전 위치/시각, 현재 위치/시각
기준: 300km/h 이하
방법: 거리/시간 = 속도, 상한 초과 시 거부
저장: 인메모리 Map (user_address → {lat, lng, timestamp})
```

### 쿨다운 검증
```
입력: 컨트랙트의 lastClaimTime, 스팟의 cooldown
기준: block.timestamp >= lastClaimTime + cooldown
```
