# Changelog — Mobile App (Android / iOS)

All notable changes to the Mobile App component.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> Android와 iOS는 동일한 React Native/Expo 코드베이스를 공유하므로 CHANGELOG를 통합 관리합니다.
> 플랫폼별 차이가 있는 경우 `[Android]` / `[iOS]` 태그로 표시합니다.

## [0.1.0] - 2026-03-04

> 초기 버전 관리 시작. 기존 개발된 모든 기능을 v0.1.0으로 통합.
>
> **Android:** versionCode 1, versionName "0.1.0"
> **iOS:** CFBundleVersion 1, CFBundleShortVersionString "0.1.0"

### Added
- React Native + Expo 기반 앱 구축 (`0f7b695`)
- 역할 기반 네비게이션 — Customer/Owner 모드 (`0c023f7`)
- MapScreen — react-native-maps, 마커, 바텀시트, 클레임 (`1dfcca1`)
- SpotListScreen + HistoryScreen (`71247c7`)
- SettingsScreen + IntroScreen + TabNavigator (`14faa28`)
- API, Location, Device, Wallet 서비스 (`8ddd500`, `8530a79`)
- FCM Push 기반 디바이스 클레임 (`344e19d`, `4c87b78`)
- Device Attestation (`b637e23`)
  - [Android] Google Play Integrity API
  - [iOS] Apple App Attest
- GPS 위치 추적 + 상태 피드백 (`3659f04`)
- 지갑 연동 — 주소 입력 방식 (`638b4be`, `9292d20`)
- [iOS] iOS 네이티브 지원 (`8fe8cda`)
- 골드 코인 마커, 라이트 맵 스타일 (`b7b7310`)
- 네트워크 선택 기능 (`36e2903`, `11a977b`)
- Intro 스플래시 화면 그라디언트 리디자인 (`3c1fbbb`)
- 활성 Spot만 지도에 표시 (`3d56305`)
- EAS Build + Submit 설정 (`7476c83`)
- EAS Secret Manager 환경변수 마이그레이션 (`1a1c2e6`, `9e4ebf2`)
- 교환소 주소 경고 모달 (`665cabe`)
- 다국어 지원 (i18n) (`569940d`, `a8ec1e0`)

### Fixed
- MapErrorBoundary + Android API 호스트 수정 (`c7eb42f`, `e3a6cce`)
- FCM 토큰 항상 새로 갱신 (`4cf5fdd`)
- SpotListScreen 스크롤 최적화 + 빈 화면 깜빡임 수정 (`2ee2864`)
- [Android] 지도 성능 최적화 + 마커/시트 버그 수정 (`c401064`)
- 지갑 링크 useEffect 의존성 수정 (`534ae06`)
- Kiosk remaining 업데이트, 스탬프 정확도, 클레임 반경 (`8bb860c`, `877219b`)

### Changed
- store 용어를 spot으로 리네이밍 (`08414d6`)
- WalletConnect 제거, API 키 통합 (`8858289`)
- 패키지명 tokamon으로 변경 (`838f5cf`)
- 설정 화면 간소화 (`d2bfcd6`)

### Security
- debug_code 제거, push-only 인증 (`e499a9f`)
- 포괄적 보안 강화 + device-id 마이그레이션 (`9b1bf1c`)

---

## [Unreleased]

_다음 릴리스에 포함될 변경사항을 여기에 기록하세요._
