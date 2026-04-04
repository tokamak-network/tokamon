# Tokamon 버전 관리 정책

> Last Updated: 2026-03-04

## 1. 개요

Tokamon 프로젝트의 모든 컴포넌트에 대해 일관된 버전 관리를 적용한다.
각 컴포넌트는 독립적인 버전을 가지며, 배포 시점에 버전을 올리고 CHANGELOG를 기록한다.

## 2. 버전 체계 (Semantic Versioning)

모든 컴포넌트는 **SemVer 2.0** (`MAJOR.MINOR.PATCH`) 형식을 따른다.

```
MAJOR.MINOR.PATCH
  │     │     └── 버그 수정, 보안 패치 (하위 호환)
  │     └──────── 새 기능 추가 (하위 호환)
  └────────────── 호환성 깨지는 변경 (Breaking Change)
```

### 버전 올리는 기준

| 변경 유형 | 예시 | 버전 |
|-----------|------|------|
| 버그 수정 | WS 재연결 수정, 캐시 버그 | PATCH +1 |
| 보안 패치 | npm 취약점 수정, XSS 방지 | PATCH +1 |
| 새 기능 | Device Attestation, GeoHash 인덱싱 | MINOR +1 |
| UI 개선 | 새 화면 추가, UX 변경 | MINOR +1 |
| Breaking Change | API 엔드포인트 변경, DB 스키마 변경 | MAJOR +1 |
| 성능 개선 | 쿼리 최적화, 캐시 전략 변경 | PATCH +1 |

### Pre-release 태그 (선택)

```
0.2.0-beta.1    # 베타 테스트
0.2.0-rc.1      # Release Candidate
```

## 3. 컴포넌트별 버전 관리

### 3.1 Listener Server (`listener-server/`)

| 항목 | 내용 |
|------|------|
| 버전 파일 | `listener-server/package.json` → `version` 필드 |
| 배포 대상 | Compute Engine VM (asia-northeast3-a) |
| 배포 방법 | Docker build → push → VM에서 pull & restart |
| 버전 확인 | `GET /health` 응답에 버전 포함 (권장) |

**배포 시 체크리스트:**
1. `package.json`의 `version` 업데이트
2. `CHANGELOG-listener-server.md` 작성
3. Git 태그: `listener-server/v{VERSION}` (예: `listener-server/v0.2.0`)
4. Docker 이미지 빌드 & 푸시 → VM에서 업데이트 (COMPUTE-ENGINE.md 참조)

### 3.2 Web Client (`client/`)

| 항목 | 내용 |
|------|------|
| 버전 파일 | `client/package.json` → `version` 필드 |
| 배포 대상 | Firebase Hosting |
| 배포 방법 | `firebase deploy --only hosting` |
| 버전 확인 | `<meta>` 태그 또는 콘솔 로그에 버전 출력 (권장) |

**배포 시 체크리스트:**
1. `package.json`의 `version` 업데이트
2. `CHANGELOG-client.md` 작성
3. Git 태그: `client/v{VERSION}` (예: `client/v0.2.0`)
4. Firebase Hosting 배포

### 3.3 Android App (`app/`)

| 항목 | 내용 |
|------|------|
| 버전 파일 | `app/package.json` → `version`, `app.config.js` → expo version |
| 네이티브 버전 | `android/app/build.gradle` → `versionName`, `versionCode` |
| 배포 대상 | Google Play Store (또는 APK 직접 배포) |
| 배포 방법 | EAS Build (`eas build --platform android`) |

**버전 규칙:**
- `versionName`: SemVer (예: `0.2.0`) — 사용자에게 보이는 버전
- `versionCode`: 정수, 매 빌드마다 +1 (예: `2`, `3`, `4`) — 스토어 업로드용

**배포 시 체크리스트:**
1. `app/package.json`의 `version` 업데이트
2. `android/app/build.gradle`의 `versionName` + `versionCode` 업데이트
3. `CHANGELOG-app.md` 작성
4. Git 태그: `app/v{VERSION}` (예: `app/v0.2.0`)
5. EAS Build & Submit

### 3.4 iOS App (`app/`)

| 항목 | 내용 |
|------|------|
| 버전 파일 | `app/package.json` → `version` (Android와 공유) |
| 네이티브 버전 | `app/ios/Tokamon/Info.plist` → `CFBundleShortVersionString`, `CFBundleVersion` |
| 배포 대상 | Apple App Store (또는 TestFlight) |
| 배포 방법 | EAS Build (`eas build --platform ios`) |

**버전 규칙:**
- `CFBundleShortVersionString`: SemVer (예: `0.2.0`) — 스토어에 표시
- `CFBundleVersion`: 빌드 번호, 매 빌드마다 +1 (예: `2`)
- Android와 iOS는 **동일한 SemVer**를 사용하되, 빌드 번호는 독립적

**배포 시 체크리스트:**
1. `app/package.json`의 `version` 업데이트
2. `app/ios/Tokamon/Info.plist`의 버전 업데이트
3. `CHANGELOG-app.md` 작성 (Android와 공유)
4. Git 태그: `app/v{VERSION}`
5. EAS Build & Submit

### 3.5 Smart Contracts (`contracts/`)

| 항목 | 내용 |
|------|------|
| 버전 관리 | 컨트랙트 주소 기반 (immutable) |
| 배포 네트워크 | Thanos Sepolia (테스트넷), 향후 Mainnet 추가 |
| 추적 | `shared/networks.js`에 네트워크별 컨트랙트 주소 기록 |

스마트 컨트랙트는 블록체인 특성상 한번 배포되면 수정 불가.
새 버전 배포 시 새 주소가 생성되므로 `shared/networks.js`와 `CHANGELOG-contracts.md`에 기록.
**네트워크별로 별도 주소**가 생기므로 VERSIONS.md에 환경별로 컨트랙트 주소를 반드시 기록.

## 4. Git 태그 규칙

```bash
# 컴포넌트별 태그
git tag listener-server/v0.2.0
git tag client/v0.2.0
git tag app/v0.2.0
git tag contracts/v0.1.0

# 전체 릴리스 (모든 컴포넌트 동시 배포 시)
git tag release/v0.2.0
```

## 5. 배포 환경 (Multi-Environment)

버전은 **코드 기준**이며, 배포 환경(네트워크)과는 독립적이다.
같은 버전의 코드를 여러 환경에 배포할 수 있다.

```
코드 v0.2.0 → Testnet (Thanos Sepolia) 에 먼저 배포 & 검증
           → Mainnet (Thanos)          에 동일 버전 배포
```

| 환경 | 네트워크 | 용도 | 배포 브랜치 |
|------|----------|------|-------------|
| **Testnet** | Thanos Sepolia | 개발/테스트/검증 | `deploy/thanos-sepolia` |
| **Mainnet** | Thanos (TBD) | 상용 서비스 | `main` |

**환경별 차이점:**
- 컨트랙트 주소가 다름 (`shared/networks.js`에서 네트워크별 관리)
- 서버 인프라가 다를 수 있음 (Cloud Run 프로젝트/리전 등)
- 환경변수/설정이 다름 (`.env`, EAS Secret 등)
- 앱 바이너리는 동일 (네트워크 전환은 앱 설정으로 처리)

**배포 흐름:**
```
Testnet 배포 → 검증 완료 → Mainnet 배포 (동일 버전)
```

VERSIONS.md에서 환경별로 어떤 버전이 올라가 있는지 추적한다.

## 6. 브랜치 전략

```
main                         ← Mainnet 배포 브랜치
  └── deploy/thanos-sepolia  ← Testnet 배포 브랜치
  └── feat/*                 ← 기능 개발
  └── fix/*                  ← 버그 수정
  └── release/*              ← 릴리스 준비 (선택)
```

- `deploy/thanos-sepolia`에 머지 + 태그 = Testnet 배포
- `main` 브랜치에 머지 + 태그 = Mainnet 배포
- 브랜치 이름은 작업 내용 기반 (`feat/device-attestation`), 버전과 무관

## 7. CHANGELOG 작성 규칙

[Keep a Changelog](https://keepachangelog.com) 형식을 따른다.

```markdown
## [0.2.0] - 2026-03-04

### Added
- Device Attestation (Play Integrity + App Attest)

### Fixed
- WebSocket 재연결 시 이벤트 누락 수정

### Changed
- API spots 엔드포인트를 listener-server로 라우팅

### Security
- npm 취약점 8건 수정
```

카테고리: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`

## 8. 배포 프로세스 요약

```
1. 기능 개발 (feat/* 브랜치)
2. PR → deploy/thanos-sepolia 또는 main 머지
3. 버전 번호 업데이트 (package.json 등)
4. CHANGELOG 작성
5. Git 태그 생성
6. 배포 실행
7. VERSIONS.md 업데이트 (해당 환경의 버전 기록)
```

**Testnet → Mainnet 배포 시:**
```
1. Testnet에서 해당 버전 검증 완료 확인
2. main 브랜치에 머지
3. Mainnet 환경변수/설정 확인
4. 배포 실행
5. VERSIONS.md의 Mainnet 섹션 업데이트
```

## 9. 관련 문서

- [현재 배포 버전 추적](./VERSIONS.md)
- [Listener Server Changelog](./CHANGELOG-listener-server.md)
- [Web Client Changelog](./CHANGELOG-client.md)
- [Mobile App Changelog](./CHANGELOG-app.md)
- [Smart Contracts Changelog](./CHANGELOG-contracts.md)
