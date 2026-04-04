# Tokamon 현재 배포 버전

> Last Updated: 2026-04-04
>
> 이 문서는 각 컴포넌트의 **배포 환경별 현재 버전**을 추적합니다.
> 배포할 때마다 이 문서를 업데이트하세요.

## 배포 환경

| 환경 | 네트워크 | Chain ID | 용도 | 상태 |
|------|----------|----------|------|------|
| **Testnet** | Thanos Sepolia | 111551119090 | 개발/테스트 | Active |
| **Mainnet** | Thanos (TBD) | TBD | 상용 서비스 | Not Yet |

---

## 환경별 배포 현황

### Testnet (Thanos Sepolia)

| 컴포넌트 | 버전 | 배포일 | 인프라 | 상태 |
|-----------|------|--------|--------|------|
| **Listener Server** | `0.1.0` | 2026-04-04 | Compute Engine VM (asia-northeast3-a) | Running |
| **Web Client** | `0.1.0` | 2026-03-04 | Firebase Hosting | Running |
| **Android App** | `0.1.0` (versionCode: 1) | 2026-03-04 | APK 직접 배포 | Beta |
| **iOS App** | `0.1.0` (build: 1) | 2026-03-04 | TestFlight | Beta |
| **Cloud Functions** | `0.1.0` | 2026-03-04 | Firebase Functions | Running |
| **Smart Contracts** | `0.1.0` | 2026-02 | Thanos Sepolia | Deployed |

**컨트랙트 주소** (`shared/networks.js` 참조):
- Tokamon: `0xA7cDf6657cE30A2316126d8F9952b9A6f17db9b7`
- Faucet: `0x049CD8ACdEFD7E72971112048FBF22A0aeFf0547`

### Mainnet (TBD)

| 컴포넌트 | 버전 | 배포일 | 인프라 | 상태 |
|-----------|------|--------|--------|------|
| **Listener Server** | — | — | — | 미배포 |
| **Web Client** | — | — | — | 미배포 |
| **Android App** | — | — | — | 미배포 |
| **iOS App** | — | — | — | 미배포 |
| **Cloud Functions** | — | — | — | 미배포 |
| **Smart Contracts** | — | — | — | 미배포 |

> Mainnet 배포 시 이 섹션을 업데이트하세요.
> 컨트랙트는 네트워크마다 별도 주소로 배포되므로 반드시 주소를 기록할 것.

---

## 컴포넌트별 상세 (최신 배포 기준)

### Listener Server v0.1.0

**인프라:** Compute Engine VM (e2-micro) — `asia-northeast3-a` / Docker (Node.js 20)

포함된 주요 기능:
- Express API 서버 (spots, device, faucet 엔드포인트)
- 블록체인 이벤트 리스닝 (WebSocket)
- WebSocket 재연결 + 지수 백오프
- GeoHash 공간 인덱싱
- Firestore 실시간 동기화
- Device Attestation 검증 (Play Integrity + App Attest)
- Telegram Bot 알림
- Faucet (15 TON, 24h 쿨다운)
- Spot 캐시 + Cold Start 복구
- Graceful Shutdown + Health Check

### Web Client v0.1.0

**인프라:** Firebase Hosting

포함된 주요 기능:
- Leaflet 지도 (위치 기반 Spot 로딩, 줌 적응형)
- Owner Dashboard (Spot 생성/편집)
- Customer 모드 (Spot 탐색, 클레임)
- Kiosk 모드 (매장용)
- 디바이스 언링크
- MetaMask 네트워크 자동 동기화
- 다국어 지원 (i18n)
- 반응형 UI

### Android App v0.1.0

**인프라:** APK 직접 배포 (EAS Build) / versionCode: 1

포함된 주요 기능:
- React Native + Expo
- 지도 (react-native-maps) + 마커
- Spot 리스트 + 히스토리
- FCM Push 기반 디바이스 클레임
- Device Attestation (Google Play Integrity)
- GPS 위치 추적
- 지갑 연동 (주소 입력)
- EAS Secret Manager 환경변수

### iOS App v0.1.0

**인프라:** TestFlight (EAS Build) / CFBundleVersion: 1

포함된 주요 기능:
- Android와 동일한 기능 세트
- Device Attestation (Apple App Attest)
- iOS 네이티브 지원

### Smart Contracts v0.1.0

포함된 컨트랙트:
- Tokamon.sol (ERC-721 NFT) — Device 기반 클레임, ClaimManager 역할, UUPS Proxy, Claimable Time Windows
- Faucet.sol — 테스트 TON 배포 (15 TON, 24h 쿨다운)

---

## 버전 히스토리

| 날짜 | 환경 | 컴포넌트 | 버전 | Git 태그 | 비고 |
|------|------|----------|------|----------|------|
| 2026-03-04 | Testnet | All | 0.1.0 | — | 초기 버전 관리 시작 |

---

## 다음 배포 예정

| 환경 | 컴포넌트 | 예정 버전 | 주요 내용 | 상태 |
|------|-----------|-----------|-----------|------|
| — | — | — | — | — |

> 새로운 배포가 예정되면 이 섹션을 업데이트하세요.
