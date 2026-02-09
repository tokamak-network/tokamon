# Server -> App 응답

## Status: RESPONSE_READY

## Response to Request #1 — API Endpoint 목록

서버 포트: `3001` (기본값, `PORT` 환경변수로 변경 가능)
Base URL: `http://localhost:3001`

---

### 1. 스팟 조회 (GPS 위치 기반 주변 spot)

#### `GET /api/spots`
전체 스팟 목록 반환. 앱에서 받아서 GPS 좌표로 필터링하면 됩니다.

**요청:** 파라미터 없음

**응답:**
```json
[
  {
    "id": 0,
    "creator_address": "0x...",
    "reward": 10,
    "remaining": 490,
    "stamp_goal": 5,
    "stamp_bonus": 20,
    "cooldown": 86400,
    "allow_duplicate_claims": false,
    "name": "강남역 스팟",
    "description": "테스트 스팟",
    "lat": 37.5665,
    "lng": 126.978,
    "start_time": "09:00",
    "end_time": "18:00",
    "active": true
  }
]
```

`active`는 서버에서 계산 (remaining > 0 && 현재 시간이 start~end 범위 내).

---

### 2. 기기 기반 클레임 (앱에서 사용할 메인 API)

#### `POST /api/device/claim`
기기 ID + GPS 좌표로 클레임. **지갑 불필요**.

**요청:**
```json
{
  "device_id": "abcdef0123456789",
  "spot_id": 0,
  "lat": 37.5665,
  "lng": 126.978
}
```
- `device_id`: Android ID (SSAID), 16자리 hex 문자열
- `spot_id`: 스팟 번호
- `lat`, `lng`: 현재 GPS 좌표

**성공 응답 (200):**
```json
{
  "message": "10 TON 적립 완료!",
  "reward": 10,
  "bonus": 0,
  "stamp": 1,
  "stamp_goal": 5,
  "balance": 10,
  "spot_name": "강남역 스팟"
}
```

**에러 응답:**
- `400`: 필수 항목 누락, 잘못된 기기 ID 형식, 거리 초과 (50m), 시간 범위 밖, 쿨다운 중, TON 소진
- `404`: 스팟 없음
- `500`: 서버/블록체인 에러

**에러 예시:**
```json
{ "error": "너무 멀어요 (120m). 더 가까이 가주세요", "distance": 120 }
{ "error": "쿨다운 중입니다 (23시간 45분 남음)", "cooldown_remaining": 85500 }
{ "error": "올바른 기기 ID 형식이 아닙니다" }
```

---

#### `POST /api/device/balance`
기기 잔액 조회.

**요청:**
```json
{
  "device_id": "abcdef0123456789"
}
```

**응답 (200):**
```json
{
  "balance": 30
}
```

---

#### `POST /api/device/stamp-info`
기기의 특정 스팟 스탬프 정보 조회.

**요청:**
```json
{
  "device_id": "abcdef0123456789",
  "spot_id": 0
}
```

**응답 (200):**
```json
{
  "stamps": 3,
  "goal": 5,
  "last_claim": 1707500000,
  "cooldown_remaining": 0
}
```

---

### 3. 사용자 인증/등록

**현재 사용자 인증/등록 API는 없습니다.** 기기 기반 시스템이므로:

- Android ID(SSAID)가 사용자 식별자 역할
- 별도 회원가입/로그인 없이 기기 ID만으로 클레임 가능
- 서버에서 기기 ID를 해시하여 블록체인에 기록

---

### 4. 기타 API (참고)

| Endpoint | Method | 설명 |
|----------|--------|------|
| `GET /api/contract` | GET | 컨트랙트 주소 정보 |
| `POST /api/spots` | POST | 스팟 생성 (owner용) |
| `POST /api/spots/metadata` | POST | 스팟 메타데이터 등록 |
| `POST /api/spots/:id/redeposit` | POST | 스팟 재예치 |
| `POST /api/claim/request` | POST | 지갑 기반 클레임 (지갑 연결 시) |
| `GET /api/claim/history?user_address=0x...` | GET | 클레임 히스토리 |
| `GET /api/stamps/:spotId?user_address=0x...` | GET | 스탬프 조회 (지갑 기반) |

---

### 앱 개발 시 권장 흐름

1. 앱 시작 → `DeviceInfo.getAndroidId()` 로 기기 ID 획득
2. `GET /api/spots` → 스팟 목록 받아서 지도에 표시
3. 사용자가 스팟 근처에서 클레임 버튼 → `POST /api/device/claim`
4. 결과 표시 (reward, stamp 진행, balance)
5. 잔액 확인 → `POST /api/device/balance`

추가 API가 필요하면 APP_TO_SERVER.md에 요청해 주세요.
