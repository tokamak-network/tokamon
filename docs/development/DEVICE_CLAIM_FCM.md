# FCM 푸시 인증 기반 디바이스 클레임

지갑(MetaMask 등) 없이도 모바일 앱에서 스팟 클레임이 가능하도록 FCM 푸시 인증 방식을 구현했습니다.
타노스 L2의 가스비가 사실상 무료이므로, 서버가 대신 `claimByDevice(spotId, deviceHash)` 를 호출합니다.

---

## 클레임 흐름

```
1. 앱 시작 → FCM 토큰 발급 + initAttestation() (Android: Play Integrity provider 준비)
2. 맵에서 스팟 근처(10m) → 하단 시트에서 클레임 버튼 탭
3. 앱 → 서버: POST /api/device/request-code { device_id, fcm_token, spot_id, lat, lng }
   + attestation 헤더 자동 주입 (Android: Play Integrity / iOS: App Attest assertion)
4. 서버: attestation 검증 → 거리/잔액/쿨다운 검증 → 8자리 인증번호 생성 → FCM 푸시 전송
5. 앱: 푸시 수신 → 인증번호 입력 UI 표시 (자동 채우기 지원)
6. 앱 → 서버: POST /api/device/verify-and-claim { device_id, spot_id, code }
   + attestation 헤더 자동 주입
7. 서버: attestation 검증 → 코드 검증 → claimByDevice(spotId, sha256(SALT+device_id)) 호출
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
| `listener-server/attestation.js` | **신규** | `verifyPlayIntegrity()`, `verifyIosAttestation()`, `verifyIosAssertion()`, `generateChallenge()` — Google/Apple 디바이스 무결성 검증 모듈. |
| `listener-server/routes/device.js` | 수정 | 디바이스 클레임 라우트 8개 엔드포인트 (기존 6개 + `attest-challenge`, `attest-register`). `verifyAttestation` 미들웨어 구현 (3단계: false/log/true). |
| `listener-server/index.js` | 수정 | `device_verify_codes` + `device_attest_keys` SQLite 테이블 생성, `app.use('/api/device', deviceRoutes(db))` 마운트, CORS 모바일 앱 지원. |

### 모바일 앱

| 파일 | 변경 | 설명 |
|------|------|------|
| `app/src/services/notifications.js` | **신규** | `registerForPushNotifications()` 권한 요청 + FCM 토큰 발급, `getSavedPushToken()`, `setupNotificationListener()` 알림 수신 리스너. |
| `app/src/services/attestation.js` | **신규** | `initAttestation()`, `getAttestationHeaders()`, `resetAttestation()` — 클라이언트 디바이스 무결성 증명 서비스. |
| `app/src/services/api.js` | 수정 | `deviceFetch()` 헬퍼 (attestation 헤더 자동 주입 + ATTEST_REQUIRED 재시도). 모든 device API 함수가 `deviceFetch` 사용. |
| `app/src/services/contract.js` | 수정 | `getDeviceBalanceContract()`, `getWalletLinkedDevice()`, `claimDeviceToWalletContract()` 컨트랙트 호출 함수 추가. |
| `app/src/utils/constants.js` | 수정 | `LISTENER_API_BASE` (Android: `10.0.2.2:3001`, iOS: `localhost:3001`), ABI에 `getDeviceBalance`, `getWalletLinkedDevice`, `claimDeviceToWallet` 추가. |
| `app/src/utils/translations.js` | 수정 | ko/en에 `deviceBalance`, `enterVerificationCode`, `requestingCode`, `verify`, `linkDevice`, `deviceLinked`, `connectWalletToWithdraw`, `claimWithoutWallet` 등 추가. |
| `app/src/components/ClaimButton.js` | 수정 | `pushToken` prop, `claimPhase` 상태 머신 (`idle` → `requesting` → `code_input` → `verifying`), 인증번호 입력 UI, 지갑 없이도 클레임 버튼 표시. |
| `app/src/components/SpotDetailSheet.js` | 수정 | `pushToken` prop 전달. |
| `app/src/screens/HistoryScreen.js` | 수정 | 디바이스 적립금 섹션 추가 (잔액 표시, 기기 연결 버튼, 지갑으로 출금 버튼), `pushToken` prop. |
| `app/src/screens/MapScreen.js` | 수정 | `pushToken` prop 전달. |
| `app/src/navigation/TabNavigator.js` | 수정 | `pushToken` prop을 `MapScreen`, `HistoryScreen`에 전달. |
| `app/App.js` | 수정 | `registerForPushNotifications()` + `initAttestation()` 호출, `pushToken` state 관리, `TabNavigator`에 전달. |
| `app/app.config.js` | 수정 | `@expo/app-integrity` 플러그인 + iOS App Attest entitlement 추가. |
| `app/package.json` | 수정 | `expo-notifications`, `@expo/app-integrity` 의존성 추가. |

---

## Device Attestation (디바이스 무결성 검증)

정품 앱 + 정품 기기에서만 API를 사용할 수 있도록 Google Play Integrity (Android) / Apple App Attest (iOS)를 통해 디바이스 무결성을 검증합니다.

### Attestation 헤더

`REQUIRE_ATTESTATION`이 `log` 또는 `true`일 때, 모든 device API 요청에 아래 헤더가 자동 주입됩니다.

**Android:**
| 헤더 | 값 |
|------|-----|
| `x-attestation-platform` | `android` |
| `x-attestation-token` | Play Integrity 토큰 |
| `x-attestation-nonce` | 요청 body의 SHA-256 (base64) |

**iOS:**
| 헤더 | 값 |
|------|-----|
| `x-attestation-platform` | `ios` |
| `x-attestation-token` | App Attest assertion (base64) |
| `x-attestation-key-id` | Secure Enclave key ID |
| `x-attestation-client-data` | 요청 body의 SHA-256 (base64) |

### REQUIRE_ATTESTATION 3단계 롤아웃

| 값 | 동작 |
|----|------|
| `false` (기본) | 검증 건너뜀 — 클라이언트 배포 전 또는 개발 환경 |
| `log` | 검증 실패해도 요청 통과, 서버 로그에 경고만 기록 |
| `true` | 검증 실패 시 403 차단 |

### iOS Attestation Flow (최초 1회)

```
1. 클라이언트 → POST /api/device/attest-challenge → { challenge_id, challenge }
2. 클라이언트: generateKeyAsync() → keyId, attestKeyAsync(keyId, challenge) → attestation
3. 클라이언트 → POST /api/device/attest-register { device_id, key_id, attestation, challenge_id }
4. 서버: Apple에 attestation 검증 → publicKey를 device_attest_keys 테이블에 저장
5. 이후 매 요청: generateAssertionAsync(keyId, clientDataHash) → assertion 헤더 주입
```

---

## API 엔드포인트

### POST /api/device/attest-challenge
iOS App Attest challenge 생성 (attestation 미들웨어 적용 전)

**Request:** `{}`

**Response:**
```json
{ "challenge_id": "a1b2c3...", "challenge": "base64-encoded-32-bytes" }
```
challenge는 60초 후 만료됩니다.

### POST /api/device/attest-register
iOS App Attest 검증 + publicKey 등록 (attestation 미들웨어 적용 전)

**Request:**
```json
{ "device_id": "device_ios_xxx...", "key_id": "key-id-from-secure-enclave", "attestation": "base64-encoded-attestation", "challenge_id": "a1b2c3..." }
```

**Response:**
```json
{ "attested": true }
```

### POST /api/device/request-code
인증 코드 요청 + FCM 푸시 전송

**Request:**
```json
{ "device_id": "device_ios_xxx...", "fcm_token": "ExponentPushToken[...]", "spot_id": 1, "lat": 37.495, "lng": 127.063 }
```

**Response:**
```json
{ "success": true }
```
인증번호는 FCM 푸시로만 전달됩니다. (보안상 API 응답에는 코드 미포함)

### POST /api/device/verify-and-claim
코드 검증 + claimByDevice 호출

**Request:**
```json
{ "device_id": "device_ios_xxx...", "spot_id": 1, "code": "123456" }
```

**Response:**
```json
{ "success": true, "reward": 0.01, "bonus": 0, "stamp": 1, "balance": 0.01, "has_linked_wallet": false }
```

### POST /api/device/balance
디바이스 잔액 조회

**Request:**
```json
{ "device_id": "device_ios_xxx..." }
```

**Response:**
```json
{ "balance": 0.05, "device_hash": "abc123..." }
```

### POST /api/device/request-link-code
지갑 연결용 인증 코드 요청 + FCM 푸시 전송

**Request:**
```json
{ "device_id": "device_ios_xxx...", "fcm_token": "ExponentPushToken[...]", "wallet_address": "0x..." }
```

**Response:**
```json
{ "success": true }
```

### POST /api/device/verify-and-link
코드 검증 + linkDeviceToWallet 호출

**Request:**
```json
{ "device_id": "device_ios_xxx...", "wallet_address": "0x...", "code": "123456" }
```

**Response:**
```json
{ "success": true, "wallet": "0x..." }
```

---

## 환경 변수

### Server (listener-server/.env)

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `DEVICE_HASH_SALT` | 디바이스 해시용 salt | 필수 |
| `TELEGRAM_HASH_SALT` | 텔레그램 해시용 salt | 필수 |
| `REQUIRE_ATTESTATION` | 디바이스 무결성 검증 모드 (`false`/`log`/`true`) | `false` |
| `GOOGLE_CLOUD_PROJECT_NUMBER` | Google Cloud 프로젝트 번호 (Play Integrity) | Android attestation 필요 시 필수 |
| `IOS_APP_ATTEST_APP_ID` | `FZJ48UG7PY.io.tokamak.tokamon` | iOS attestation 필요 시 필수 |

### Client (app/.env)

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER` | Play Integrity provider 초기화용 | Android attestation 필요 시 필수 |

---

## 데이터베이스 테이블

### device_verify_codes (SQLite)
```sql
CREATE TABLE IF NOT EXISTS device_verify_codes (
  code TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  spot_id INTEGER NOT NULL,
  wallet_address TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verified BOOLEAN DEFAULT 0,
  attempts INTEGER DEFAULT 0
);
```

- `spot_id = -1`: 지갑 연결 요청 (센티넬값)
- `wallet_address`: 지갑 연결 요청 시에만 사용
- `attempts`: 인증 코드 검증 시도 횟수 (최대 5회)

### device_attest_keys (SQLite)
```sql
CREATE TABLE IF NOT EXISTS device_attest_keys (
  device_hash TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  public_key_pem TEXT NOT NULL,
  receipt TEXT,
  sign_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- iOS App Attest 키 등록 시 생성
- `public_key_pem`: Apple Secure Enclave에서 생성된 공개키 (assertion 검증에 사용)
- `sign_count`: 리플레이 공격 방지용 카운터 (assertion 검증 시마다 증가)

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

## EAS Build APK에서 FCM 푸시 사용하기

EAS Build로 만든 APK를 스토어 등록 없이 설치해도 **인증번호 푸시는 사용 가능합니다.** (Expo Go와 달리 standalone 빌드이므로 FCM 지원)

### 필수 조건

1. **`app/google-services.json`** – Firebase Console에서 Android 앱 등록 후 다운로드한 파일을 `app/` 폴더에 둠  
2. **Firebase에 EAS 서명 키 SHA-1 등록**  
   - EAS Build는 Play Store와 다른 keystore로 서명함  
   - Firebase Console → 프로젝트 설정 → Android 앱 → 지문(SHA-1) 추가  
   - EAS의 SHA-1 확인:
     ```bash
     cd app && npx eas credentials
     # Android → Production/Preview → Keystore에서 SHA-1 복사
     ```
   - 해당 SHA-1을 Firebase Android 앱에 추가

위 두 가지가 맞으면 EAS Build APK에서도 인증번호 푸시가 정상 동작합니다.

### 인증번호는 푸시로만 전달

**모바일에서는 인증번호를 푸시로만 전달합니다.** API 응답에 코드를 포함하지 않으므로, FCM 푸시가 정상 동작해야 클레임/지갑 연결이 가능합니다. Firebase SHA-1 등록이 필수입니다.

---

## 참고

- FCM은 완전 무료 (메시지 수 무제한)
- 타노스 L2 가스비 사실상 무료 (`claimByDevice` ~55,000 gas, 비용 ≈ 0 TON)
- FCM 토큰이 변경되면 `deviceHash`가 달라짐 → `AsyncStorage`에 토큰 고정 저장하여 해결
- Expo Go에서는 FCM 토큰 대신 fallback 디바이스 ID(`device_ios_timestamp`)를 사용 → **실제 푸시는 오지 않으므로**, 테스트 시 EAS Build APK 사용 권장
