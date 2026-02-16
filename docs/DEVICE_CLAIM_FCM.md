# FCM 푸시 인증 기반 디바이스 클레임

지갑(MetaMask 등) 없이도 모바일 앱에서 스팟 클레임이 가능하도록 FCM 푸시 인증 방식을 구현했습니다.
타노스 L2의 가스비가 사실상 무료이므로, 서버가 대신 `claimByDevice(spotId, deviceHash)` 를 호출합니다.

---

## 클레임 흐름

```
1. 앱 시작 → expo-notifications로 FCM 토큰 발급 + 푸시 권한 요청
2. 맵에서 스팟 근처(10m) → 하단 시트에서 클레임 버튼 탭
3. 앱 → 서버: POST /api/device/request-code { fcm_token, spot_id, lat, lng }
4. 서버: 거리/잔액/쿨다운 검증 → 6자리 인증번호 생성 → FCM 푸시 전송
5. 앱: 푸시 수신 → 인증번호 입력 UI 표시 (자동 채우기 지원)
6. 앱 → 서버: POST /api/device/verify-and-claim { fcm_token, spot_id, code }
7. 서버: 코드 검증 → claimByDevice(spotId, sha256(SALT+fcm_token)) 호출
8. 보상이 deviceBalances[hash]에 적립
9. "나의 토카몬" 탭에서 지갑 연결 → 출금 가능
```

---

## 변경된 파일 목록

### Listener Server

| 파일 | 변경 | 설명 |
|------|------|------|
| `listener-server/blockchain.js` | 수정 | `claimByDevice`, `getDeviceBalance`, `getDeviceStampInfo`, `linkDeviceToWallet` 함수 추가. `DeviceClaimed`, `DeviceLinked` 이벤트 리스너 등록. |
| `listener-server/firebase-admin.js` | 수정 | `sendPushNotification(fcmToken, title, body, data)` FCM 푸시 전송 함수, `saveDeviceClaimEvent()` Firestore 저장 함수 추가. |
| `listener-server/routes/device.js` | **신규** | 디바이스 클레임 라우트 4개 엔드포인트 (`request-code`, `verify-and-claim`, `balance`, `link-wallet`). |
| `listener-server/index.js` | 수정 | `device_verify_codes` SQLite 테이블 생성, `app.use('/api/device', deviceRoutes(db))` 마운트, CORS 모바일 앱 지원. |

### 모바일 앱

| 파일 | 변경 | 설명 |
|------|------|------|
| `app/src/services/notifications.js` | **신규** | `registerForPushNotifications()` 권한 요청 + FCM 토큰 발급, `getSavedPushToken()`, `setupNotificationListener()` 알림 수신 리스너. |
| `app/src/services/api.js` | 수정 | `requestDeviceCode()`, `verifyAndClaimDevice()`, `getDeviceBalance()`, `linkDeviceToWallet()` API 함수 추가. |
| `app/src/services/contract.js` | 수정 | `getDeviceBalanceContract()`, `getWalletLinkedDevice()`, `claimDeviceToWalletContract()` 컨트랙트 호출 함수 추가. |
| `app/src/utils/constants.js` | 수정 | `LISTENER_API_BASE` (Android: `10.0.2.2:3001`, iOS: `localhost:3001`), ABI에 `getDeviceBalance`, `getWalletLinkedDevice`, `claimDeviceToWallet` 추가. |
| `app/src/utils/translations.js` | 수정 | ko/en에 `deviceBalance`, `enterVerificationCode`, `requestingCode`, `verify`, `linkDevice`, `deviceLinked`, `connectWalletToWithdraw`, `claimWithoutWallet` 등 추가. |
| `app/src/components/ClaimButton.js` | 수정 | `pushToken` prop, `claimPhase` 상태 머신 (`idle` → `requesting` → `code_input` → `verifying`), 인증번호 입력 UI, 지갑 없이도 클레임 버튼 표시. |
| `app/src/components/SpotDetailSheet.js` | 수정 | `pushToken` prop 전달. |
| `app/src/screens/HistoryScreen.js` | 수정 | 디바이스 적립금 섹션 추가 (잔액 표시, 기기 연결 버튼, 지갑으로 출금 버튼), `pushToken` prop. |
| `app/src/screens/MapScreen.js` | 수정 | `pushToken` prop 전달. |
| `app/src/navigation/TabNavigator.js` | 수정 | `pushToken` prop을 `MapScreen`, `HistoryScreen`에 전달. |
| `app/App.js` | 수정 | `registerForPushNotifications()` 호출, `pushToken` state 관리, `TabNavigator`에 전달. |
| `app/package.json` | 수정 | `expo-notifications` 의존성 추가. |

---

## API 엔드포인트

### POST /api/device/request-code
인증 코드 요청 + FCM 푸시 전송

**Request:**
```json
{ "fcm_token": "ExponentPushToken[...]", "spot_id": 1, "lat": 37.495, "lng": 127.063 }
```

**Response:**
```json
{ "success": true, "message": "인증 코드가 전송되었습니다" }
```
FCM 미지원 환경에서는 `debug_code` 필드가 포함됨.

### POST /api/device/verify-and-claim
코드 검증 + claimByDevice 호출

**Request:**
```json
{ "fcm_token": "ExponentPushToken[...]", "spot_id": 1, "code": "123456" }
```

**Response:**
```json
{ "success": true, "reward": 0.01, "bonus": 0, "stamp": 1, "balance": 0.01 }
```

### POST /api/device/balance
디바이스 잔액 조회

**Request:**
```json
{ "fcm_token": "ExponentPushToken[...]" }
```

**Response:**
```json
{ "balance": 0.05, "device_hash": "abc123..." }
```

### POST /api/device/link-wallet
디바이스를 지갑에 연결

**Request:**
```json
{ "fcm_token": "ExponentPushToken[...]", "wallet_address": "0x..." }
```

**Response:**
```json
{ "success": true, "device_hash": "abc123...", "wallet": "0x...", "transferred_amount": 0.05 }
```

---

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `DEVICE_HASH_SALT` | 디바이스 해시용 salt | `TELEGRAM_HASH_SALT` 값 사용 |
| `TELEGRAM_HASH_SALT` | fallback salt | 필수 |

---

## 데이터베이스 테이블

### device_verify_codes (SQLite)
```sql
CREATE TABLE IF NOT EXISTS device_verify_codes (
  code TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  spot_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verified BOOLEAN DEFAULT 0
);
```

### device_claim_events (Firestore)
```
{
  spot_id: number,
  device_hash: string,
  reward: number,
  bonus: number,
  stamp: number,
  created_at: string (ISO)
}
```

---

## 컨트랙트 함수 (이미 구현됨)

- `claimByDevice(uint256 spotId, bytes32 deviceHash)` - 서버가 호출
- `getDeviceBalance(bytes32 deviceHash)` - 적립금 조회
- `getDeviceStampInfo(uint256 spotId, bytes32 deviceHash)` - 스탬프/쿨다운 조회
- `linkDeviceToWallet(bytes32 deviceHash, address wallet)` - 디바이스↔지갑 연결
- `getWalletLinkedDevice(address wallet)` - 지갑에 연결된 디바이스 조회
- `claimDeviceToWallet(bytes32 deviceHash)` - 적립금을 지갑으로 출금

---

## 참고

- FCM은 완전 무료 (메시지 수 무제한)
- 타노스 L2 가스비 사실상 무료 (`claimByDevice` ~55,000 gas, 비용 ≈ 0 TON)
- FCM 토큰이 변경되면 `deviceHash`가 달라짐 → `AsyncStorage`에 토큰 고정 저장하여 해결
- 개발 환경에서 FCM이 안 될 경우 `debug_code` 반환으로 테스트 가능
- Expo Go에서는 FCM 토큰 대신 fallback 디바이스 ID(`device_ios_timestamp`)를 사용
