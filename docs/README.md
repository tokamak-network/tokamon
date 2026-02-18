# Tokamon 문서

## 폴더 구조

```
docs/
├── development/         # 개발 & 설치
│   ├── SETUP_GUIDE.md           # 로컬 개발 환경 설정, 설치, 실행 방법
│   ├── DEVICE_CLAIM_FCM.md      # FCM 푸시 인증 기반 디바이스 클레임 흐름
│   └── device-id-architecture.md # 디바이스 ID 아키텍처 (ANDROID_ID, IDFV)
│
├── operations/          # 운영 & 배포
│   ├── CLOUD-RUN.md             # Cloud Run 배포, 재배포, 모니터링, 알림, 트러블슈팅
│   ├── SERVER_OPERATION_COST.md # 운영 비용 산정 (가스비, Firebase, Cloud Run)
│   └── security-checklist.md    # 보안 점검 결과, 침투 테스트 체크리스트
│
└── architecture/        # 설계 & 아키텍처
    ├── ARCHITECTURE_START_GUIDE.md    # 전체 아키텍처 개요
    ├── database-schema.md             # Firestore, SQLite, 파일 스키마
    └── TOKAMON_FIREBASE_MIGRATION.md  # Firebase 마이그레이션 이력 (참고용)
```

## 처음 시작할 때

1. **[development/SETUP_GUIDE.md](./development/SETUP_GUIDE.md)** — 로컬 환경 설정 및 실행
2. **[architecture/ARCHITECTURE_START_GUIDE.md](./architecture/ARCHITECTURE_START_GUIDE.md)** — 전체 아키텍처 이해

## 운영할 때

1. **[operations/CLOUD-RUN.md](./operations/CLOUD-RUN.md)** — Cloud Run 배포, 모니터링, 트러블슈팅
2. **[operations/SERVER_OPERATION_COST.md](./operations/SERVER_OPERATION_COST.md)** — 비용 산정
3. **[operations/security-checklist.md](./operations/security-checklist.md)** — 보안 체크리스트

## 서브 프로젝트

| 프로젝트 | README | 설명 |
|----------|--------|------|
| `listener-server/` | [README.md](../listener-server/README.md) | 블록체인 이벤트 리스너 + API 서버 |
| `contracts/` | [README.md](../contracts/README.md) | Solidity 스마트 컨트랙트 (Foundry) |
| `client/` | - | 웹 클라이언트 (React + Vite) |
| `app/` | - | 모바일 앱 (Expo + React Native) |
| `functions/` | - | Firebase Cloud Functions |
| `shared/` | - | 공유 모듈 (networks.js) |
