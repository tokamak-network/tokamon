# Security Checklist

## Overview

Tokamon 보안 점검 결과 및 조치 현황.

## Phase 1 — Completed

| # | 항목 | 심각도 | 상태 | 조치 내용 |
|---|------|--------|------|-----------|
| 1 | Rate Limiting | Critical | Done | `device_id` 기준 제한 (request-code: 8/분, verify: 10/분), `MAX_MAP_SIZE` 메모리 보호. 모바일 CGNAT 특성상 IP 제한 미적용 |
| 2 | 인증 시도 횟수 제한 | Critical | Done | `MAX_VERIFY_ATTEMPTS = 5`, atomic UPDATE로 레이스 컨디션 방지, 시도 횟수 우회 차단 |
| 3 | 해시 솔트 분리 | Critical | Done | `DEVICE_HASH_SALT` ≠ `TELEGRAM_HASH_SALT`, 시작 시 검증 |
| 4 | 로그 민감정보 제거 | Medium | Done | FCM 결과, 디바이스 ID, 인증번호 콘솔 출력 제거 |

## Phase 2 — Completed

| # | 항목 | 심각도 | 상태 | 조치 내용 |
|---|------|--------|------|-----------|
| 5 | 인증번호 강화 | High | Done | 6자리 숫자(1M) → 8자리 영숫자(~2.8T), `crypto.randomInt` 사용 |
| 6 | HTTPS 강제 | High | Done | 프로덕션 API 요청은 HTTP 시 403 차단 (리다이렉트 아님) |
| 7 | 세션 바인딩 | High | Done | 인증 코드가 `device_hash` + `spot_id`에 바인딩됨 확인 |
| 8 | 디바이스 검증 인프라 | High | Partial | 서버 미들웨어 준비 (`REQUIRE_ATTESTATION=true`), 클라이언트 네이티브 모듈 미구현 |
| 9 | device_hash 노출 축소 | Medium | Done | `verify-and-link` 응답에서 제거. `balance`는 컨트랙트 호출에 필요하여 유지 |
| 10 | 예측 가능한 fallback ID | Medium | Done | `Date.now()` → `crypto.getRandomValues()` 16바이트 랜덤 |
| 11 | 미사용 코드 제거 | Low | Done | telegram `request-code`, `verify-code`, `notify-claim` 라우트 삭제 |

## Phase 3 — Completed

| # | 항목 | 심각도 | 상태 | 조치 내용 |
|---|------|--------|------|-----------|
| 12 | 암호화 저장소 | Low | Done | `AsyncStorage` → `expo-secure-store` (iOS Keychain / Android Keystore) |
| 13 | 침투 테스트 체크리스트 | - | Done | 이 문서 |

## Phase 4 — Completed (재감사 조치)

| # | 항목 | 심각도 | 상태 | 조치 내용 |
|---|------|--------|------|-----------|
| 14 | 텔레그램 라우트 Rate Limiting | High | Done | `telegram_username`/`token`/`hash` 기준 엔드포인트별 제한 (8~10/분), `MAX_MAP_SIZE` 보호 |
| 15 | username 조회 인증 | High | Done | `GET /linked/:wallet` 삭제 → `POST /username` 지갑 서명 검증 필수. 서명자 ≠ 매핑된 지갑이면 403 |
| 16 | 레이스 컨디션 방지 | Medium | Done | verify-and-claim, verify-and-link 모두 atomic UPDATE + `this.changes` 패턴 |
| 17 | 시도 횟수 우회 차단 | Medium | Done | `attempts < MAX_VERIFY_ATTEMPTS`를 UPDATE WHERE 절에 포함 |
| 18 | device_hash 노출 정리 | Medium | Done | WalletScreen 미사용 참조 제거. HistoryScreen은 컨트랙트 호출에 필요하여 유지 (온체인 공개 데이터) |
| 19 | FCM 실패 시 무한 대기 방지 | Medium | Done | `sendPushNotification` 반환값 확인, `false`면 502 응답. 클라이언트는 에러 Alert 표시 후 idle 복귀 |
| 20 | Functions username 인증 | High | Done | `functions/index.js`도 `POST /username` 서명 검증으로 변경. `GET /linked/:wallet` 삭제. Firestore에서 `telegram_wallet_links` 조회 |
| 21 | 텔레그램 라우트 마운트 | High | Done | `listener-server/routes/telegram.js`가 미마운트 상태(dead code) → `index.js`에 `app.use('/api/telegram', telegramRoutes(db))` 추가 |

## Penetration Testing Checklist

프로덕션 배포 전 수동 점검 항목.

### API 보안

- [ ] Rate limiting 동작 확인: 같은 device_id로 1분 내 9회째 `request-code` → 429 응답
- [ ] 인증 시도 제한 확인: 잘못된 코드 5회 입력 → "Too many attempts" 응답
- [ ] 만료된 코드 사용 불가 확인: 3분 후 코드 입력 → "Invalid or expired" 응답
- [ ] 다른 device_id로 코드 사용 불가 확인: device A의 코드를 device B에서 입력 → 실패
- [ ] HTTPS 미사용 시 API 차단 확인: HTTP로 `/api/device/*` 요청 → 403 응답
- [ ] 잘못된 입력 거부: 빈 값, 범위 초과 좌표, 잘못된 주소 등 → 400 응답
- [ ] 레이스 컨디션 방지 확인: 동일 코드로 동시 verify 요청 → 1건만 성공
- [ ] 삭제된 엔드포인트 확인: `POST /api/telegram/notify-claim` → 404 응답

### 디바이스 식별

- [ ] 앱 재설치 후 동일 device_id 유지 확인 (ANDROID_ID / IDFV)
- [ ] 서로 다른 기기에서 다른 device_id 생성 확인
- [ ] `DEVICE_HASH_SALT` ≠ `TELEGRAM_HASH_SALT` 검증 (서버 시작 시 경고)
- [ ] SecureStore 암호화 저장 확인: 기기 파일시스템에서 평문 미노출

### 인증번호

- [ ] 코드가 8자리 영숫자(혼동 문자 제외)로 생성되는지 확인
- [ ] 코드가 서버 콘솔 로그에 출력되지 않는지 확인
- [ ] 코드가 FCM 푸시로만 전달되는지 확인 (API 응답에 미포함)
- [ ] FCM 실패 시 502 응답 확인: 잘못된 FCM 토큰으로 `request-code` → 502 응답, 클라이언트 idle 복귀

### 텔레그램 API (listener-server)

- [ ] 텔레그램 Rate Limiting 확인: 같은 username으로 1분 내 11회째 `/balance` → 429 응답
- [ ] username 조회 서명 검증: 잘못된 서명으로 `POST /username` → 403 응답
- [ ] username 조회 타인 지갑 서명: 매핑되지 않은 지갑으로 서명 → 403 응답
- [ ] 삭제된 엔드포인트 확인: `GET /api/telegram/linked/:wallet` → 404 응답

### 텔레그램 API (Firebase Functions)

- [ ] Functions username 서명 검증: 잘못된 서명으로 `POST /api/telegram/username` → 400/403 응답
- [ ] Functions username 타인 지갑 서명: 매핑되지 않은 지갑 서명 → 403 응답
- [ ] Functions 삭제된 엔드포인트: `GET /api/telegram/linked/:wallet` → 404 응답
- [ ] Functions 삭제된 엔드포인트: `GET /api/telegram/username/:hash` → 404 응답

### 스마트 컨트랙트

- [ ] 쿨다운 우회 불가 확인: 쿨다운 중 클레임 시도 → 컨트랙트 revert
- [ ] 잔액 초과 클레임 불가 확인: remaining < reward 시 클레임 시도 → 실패
- [ ] 본인 스팟 클레임 불가 확인 (isOwner 체크)

### 네트워크

- [ ] HSTS 헤더 존재 확인 (프로덕션)
- [ ] CORS 설정 확인: 허용되지 않은 origin → 차단
- [ ] JSON body size 제한 확인: 10KB 초과 요청 → 413 응답

## TODO — 미구현 항목

### Device Attestation (클라이언트)

디바이스 검증 서버 인프라는 준비됨. 클라이언트 구현 필요:

1. **Android**: Google Play Integrity API
   - Google Cloud Console에서 Play Integrity API 활성화
   - 앱에 네이티브 모듈 추가 (커스텀 Expo module 또는 bare native code)
   - 서버에서 `verifyPlayIntegrity()` 구현

2. **iOS**: Apple App Attest
   - Apple Developer에서 App Attest 키 생성
   - `DCAppAttestService` 네이티브 모듈 추가
   - 서버에서 `verifyAppAttest()` 구현

3. **활성화**: `REQUIRE_ATTESTATION=true` 환경변수 설정

### Multi-App IDFV 분리

추가 앱 개발 시 필요 (docs/device-id-architecture.md 참조):
- 앱 bundle ID를 해시 입력에 포함
- 또는 앱별 `DEVICE_HASH_SALT` 사용
