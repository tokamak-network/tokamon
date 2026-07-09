# Changelog — Listener Server

All notable changes to the Listener Server component.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-03-04

> 초기 버전 관리 시작. 기존 개발된 모든 기능을 v0.1.0으로 통합.

### Added
- Express 5.x API 서버 기반 구축 (`ad6f7cf`)
- Telegram Bot 연동 — 클레임 알림, 지갑 연동 (`1ec2715`, `5de0c12`)
- Device 기반 클레임 API 엔드포인트 (`51f7b6c`)
- Firebase Admin + Firestore 실시간 동기화 (`6fd9ccb`)
- Cloud Run 배포 지원 — Dockerfile, 환경변수 (`b2c7260`)
- Faucet 엔드포인트 — 15 TON, 24시간 쿨다운 (`6ff428d`, `697e290`)
- WebSocket 이벤트 리스닝 — 블록체인 이벤트 구독 (`2b9f0b9`)
- GeoHash 공간 인덱싱 — spots API 성능 최적화 (`de6a435`)
- 위치 기반 페이지네이션 (`0add0ef`)
- Spot 캐시 + Firestore Cold Start 복구 (`2d2d093`)
- 지갑 가용성 체크 API (`c274e0a`, `057a9dc`)
- SpotUpdated 이벤트 리스너 (`02b3b73`)
- Device Attestation 검증 — Play Integrity + App Attest (`b637e23`)
- Firestore Dual-write for attestation keys (`e58ee8d`)

### Fixed
- WebSocket 재연결 + 지수 백오프, 헬스체크, Graceful Shutdown (`8e38b51`)
- 이미 사용 중인 지갑으로 링크 시도 차단 (`dd2eb43`)
- npm 취약점 수정 (dependabot, fast-xml-parser, minimatch 등) (`37d25d4`, `e7e2a12`, `4cb3831`)
- Attestation challenge/assertion 미들웨어 강화 (`b1ee6be`)
- DB 작업 에러 로깅 추가 (`bbc75dd`)

### Changed
- HTTP read provider와 WS event provider 분리 (`2a323d1`)
- /api/spots 라우팅을 listener-server로 변경 + 캐시 TTL 증가 (`b290469`)
- Faucet private key를 환경변수로 이동 (`4a2aa68`)

### Security
- 시크릿 노출 제거 (`bf628ab`)
- Rate limit, HTTPS 강제, 암호화 저장소, 레이스 컨디션 방지
- 입력 검증 및 이벤트 보안 강화 (`dc65c81`)

---

## [Unreleased]

_다음 릴리스에 포함될 변경사항을 여기에 기록하세요._
