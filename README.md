# Tokamon

점주가 매장에 TON을 걸고, 방문한 고객에게 보상하는 위치 기반 리워드 플랫폼

## 구조

```
tokamon/
├── contracts/          # Solidity 스마트 컨트랙트
│   └── solidity/       # Tokamon.sol, compile.js, deploy.js
├── server/             # Express API 서버
│   ├── routes/         # faucet, spots, claim, stamps
│   ├── blockchain.js   # ethers.js 컨트랙트 연동
│   └── db.js           # SQLite 메타데이터
├── client/             # React 웹 클라이언트
│   └── src/
│       ├── App.jsx
│       └── components/ # Map, SpotInfo, SpotList, History, CreateSpot,
│                       # RoleSelect, OwnerDashboard
└── docs/               # 프로젝트 문서
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 18 + Vite + Leaflet |
| 백엔드 | Node.js + Express + SQLite |
| 블록체인 | Solidity 0.8.19 (EVM) |
| 개발환경 | Ganache (로컬 EVM, 포트 8999) |

## 화면 흐름

```
[앱 시작] → 역할 선택
    ├─ 고객 (지도 / 스팟 목록 / 내 기록)
    └─ 점주 (내 스팟 관리 / 스팟 만들기)
```

- 지갑 없이도 지도/스팟 탐색 가능
- 지갑 연결은 클레임, 스팟 생성, 내 기록, 스팟 관리 시에만 요청
- 헤더에서 역할 전환 가능

## 빠른 시작

```bash
# 의존성 설치
npm run install:all

# 전체 실행 (Ganache + 배포 + 서버 + 클라이언트)
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

## 수동 실행

```bash
# 터미널 1: Ganache
npm run ganache

# 터미널 2: 컨트랙트 배포 → 서버
npm run deploy
npm run server

# 터미널 3: 클라이언트
npm run client
```

## API

| 엔드포인트 | 메소드 | 설명 |
|-----------|--------|------|
| `/api/spots` | GET | 스팟 목록 |
| `/api/spots` | POST | 스팟 생성 |
| `/api/spots/:id/redeposit` | POST | 스팟 재예치 |
| `/api/claim/request` | POST | 클레임 요청 |
| `/api/claim/history` | GET | 클레임 기록 |
| `/api/stamps/:spotId` | GET | 스탬프 현황 |
| `/api/faucet` | POST | 테스트 TON 충전 |
| `/api/faucet/balance` | GET | 잔액 조회 |

## 문서

- [서비스 기획서](docs/SERVICE_OVERVIEW.md)
- [MVP 계획](docs/MVP_PLAN.md)
- [데모 가이드](docs/DEMO_GUIDE.md)
- [유즈케이스](docs/USE_CASES.md)
- [점주 기능 명세](docs/SPEC_OWNER.md)
- [사용자 기능 명세](docs/SPEC_USER.md)
- [서버 API 명세](docs/SPEC_SERVER.md)
- [컨트랙트 명세](docs/SPEC_CONTRACT.md)
