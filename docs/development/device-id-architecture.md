# Device ID Architecture

## Overview

Tokamon uses platform-native device IDs for device identification, separate from FCM push tokens.

| Purpose | Identifier | Source |
|---------|-----------|--------|
| **Device identification** (cooldown, balance, stamps) | `device_id` | ANDROID_ID / IDFV |
| **Push notifications** (verification codes) | `fcm_token` | FCM via expo-notifications |

## Device ID Sources

### Android: `ANDROID_ID`
- Unique per **app signing key + user + device**
- Persists across app reinstalls
- Changes only on factory reset
- Retrieved via `Application.androidId` (expo-application)

### iOS: IDFV (identifierForVendor)
- Unique per **Apple Developer account + device**
- Persists across app reinstalls (as long as at least one app from the same vendor remains installed)
- Changes if ALL apps from the same developer are uninstalled then reinstalled
- Retrieved via `Application.getIosIdForVendorsAsync()` (expo-application)

## Architecture

```
App startup
  ├── getDeviceId()     → deviceId  (identification)
  ├── registerForPush() → pushToken (push notifications only)
  └── initAttestation() → Android: Play Integrity provider 준비
          │
          ▼
    TabNavigator
      ├── MapScreen → SpotDetailSheet → ClaimButton
      │     deviceId: stamp info, cooldown check, claim
      │     pushToken: request-code (push delivery only)
      │     attestation: 매 요청마다 자동 주입 (deviceFetch)
      │
      └── WalletScreen
            deviceId: balance query, wallet link verify
            pushToken: request-link-code (push delivery only)
            attestation: 매 요청마다 자동 주입 (deviceFetch)
```

## Server API Parameters

| Endpoint | `device_id` | `fcm_token` | Attestation | Description |
|----------|:-----------:|:-----------:|:-----------:|-------------|
| `/api/device/attest-challenge` | - | - | - | iOS: challenge 생성 |
| `/api/device/attest-register` | required | - | - | iOS: key attestation 등록 |
| `/api/device/request-code` | required | required | auto | Needs push to send verification code |
| `/api/device/verify-and-claim` | required | - | auto | Identification only |
| `/api/device/balance` | required | - | auto | Identification only |
| `/api/device/stamp-info` | required | - | auto | Identification only |
| `/api/device/request-link-code` | required | required | auto | Needs push to send verification code |
| `/api/device/verify-and-link` | required | - | auto | Identification only |

- **Attestation `auto`**: `deviceFetch()` 헬퍼가 플랫폼별 attestation 헤더를 자동 주입. `REQUIRE_ATTESTATION` 설정에 따라 서버가 검증.
- `attest-challenge`/`attest-register`는 attestation 미들웨어 적용 전에 등록되므로 검증 없이 접근 가능.

Server hashes `device_id` with `DEVICE_HASH_SALT` to produce `deviceHash` (bytes32) for smart contract interactions.

## Multi-App Considerations

### Problem
iOS IDFV is shared across all apps from the same Apple Developer account on the same device. If multiple apps share the same backend server and hash salt, they will produce identical `deviceHash` values — meaning a device's cooldown, balance, and stamps would be shared across apps unintentionally.

### Solution
When deploying multiple apps under the same developer account that share a backend:

1. **Include app bundle ID in the hash salt** — either:
   - Use a different `DEVICE_HASH_SALT` per app deployment
   - Or concatenate the app's bundle ID into the hash input:
     ```js
     // Server-side
     function hashDeviceId(deviceId, appBundleId) {
       return crypto.createHash('sha256')
         .update(salt + appBundleId + deviceId)
         .digest('hex');
     }
     ```
   - Client sends `app_bundle_id` alongside `device_id`

2. **Use separate smart contract instances** per app to fully isolate on-chain data.

### When to implement
- Not needed now (single app: Tokamon)
- Required when: a second app is created under the same Apple Developer account AND shares the same Tokamon backend/contract

## Files

### Client (app)
- `app/src/services/notifications.js` — `getDeviceId()` function
- `app/src/services/attestation.js` — `initAttestation()`, `getAttestationHeaders()`, `resetAttestation()`
- `app/src/services/api.js` — `deviceFetch()` 헬퍼가 attestation 헤더 자동 주입, all device API functions use `device_id`
- `app/App.js` — initializes `deviceId`, `pushToken`, and `initAttestation()` at startup

### Server (listener-server)
- `listener-server/attestation.js` — `verifyPlayIntegrity()`, `verifyIosAttestation()`, `verifyIosAssertion()`, `generateChallenge()`
- `listener-server/routes/device.js` — `hashDeviceId()`, `makeAttestationMiddleware()`, `attest-challenge`/`attest-register` endpoints, all routes accept `device_id`
