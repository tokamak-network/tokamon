# Changelog — Web Client

All notable changes to the Web Client component.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-03-04

> 초기 버전 관리 시작. 기존 개발된 모든 기능을 v0.1.0으로 통합.

### Added
- React 18 + Vite 기반 SPA 구축 (`03286c6`)
- Leaflet 지도 — Spot 마커, 위치 기반 로딩 (`cf0295f`)
- Owner Dashboard — Spot 생성/편집 (`8c93967`, `80a46d5`)
- Customer 모드 — Spot 탐색, 클레임 (`9b085c6`)
- Kiosk 모드 — 매장용 화면, 스탬프 (`c1af089`, `8bb6319`)
- WalletConnect (Reown AppKit) 연동 (`dafc7e6`)
- Toast/Spinner UI, 다국어 지원 (i18n) (`8bb6319`)
- 디바이스 언링크 버튼 (`939d434`)
- tokamon.io 랜딩 페이지 푸터 (`4bf967d`)
- 멀티 네트워크 지원 — MetaMask 체인 자동 동기화 (`036b194`, `aeee133`)
- Spot form 검증 및 편집 UI (`80a46d5`)
- 교환소 주소 경고 (`ce4e78c`)
- 반응형 헤더 및 UI 정리 (`9baf677`)

### Fixed
- Spot 편집 후 stale 위치 데이터 — optimistic update 적용 (`d7b6adf`)
- 먼 거리 Spot km 단위 표시 (`c5774c6`)
- StrictMode 이중 서명 프롬프트 방지 (`bc6a02c`)
- 줌 기반 Spot 로딩 최적화 (`3d222b9`)

### Changed
- store/customer 용어를 spot/collector로 통일 (`8cf2204`)
- 비 localhost 도메인에서 dev 네트워크 숨김 (`d90f05a`)
- 설정 화면 모바일 앱 스타일로 리디자인 (`280f0bf`)

---

## [Unreleased]

_다음 릴리스에 포함될 변경사항을 여기에 기록하세요._
