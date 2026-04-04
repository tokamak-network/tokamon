# listener-server 마이그레이션 보고서

> 작성일: 2026-04-04
> 작업: Cloud Run → Compute Engine VM 전환

---

## 1. 마이그레이션 목표

| 목표 | 상세 |
|------|------|
| **비용 절감** | Cloud Run 상시 가동 비용 (~$63/월) 제거 |
| **안정성 유지** | WebSocket 블록체인 리스너 + Telegram 봇 + HTTP API 정상 동작 |
| **기존 구성 최소 변경** | Firebase Hosting, Cloud Functions, Firestore, 클라이언트 웹 코드 변경 없음 |
| **향후 유연성** | listenerUrl 동적 조회로 인프라 변경 시 앱 재빌드 불필요 |

---

## 2. 비용 변경

### Before (Cloud Run)

| 항목 | 월간 비용 |
|------|----------|
| Cloud Run (1 vCPU, 512Mi, minScale=1, no-cpu-throttling) | ~$62.86 |
| Firestore 읽기 초과 | ~$0.37 |
| **합계** | **~$63/월** |

### After (Compute Engine VM)

| 항목 | 월간 비용 |
|------|----------|
| e2-micro 인스턴스 (0.25 vCPU, 1GB RAM) | ~$7.11 |
| 고정 외부 IP ($0.005/hr) | ~$3.60 |
| 부트 디스크 (10GB pd-standard) | ~$0.40 |
| Firestore 읽기 초과 | ~$0.37 |
| **합계** | **~$11.50/월** |

### 절감 효과

| | 월간 | 연간 |
|---|------|------|
| 이전 | $63 | $756 |
| 이후 | $11.50 | $138 |
| **절감** | **$51.50 (82%)** | **$618** |

---

## 3. 구성 변경 내역

### 인프라

| 항목 | Before | After |
|------|--------|-------|
| 서버 | Cloud Run (`asia-northeast3`) | Compute Engine VM (`asia-northeast3-a`) |
| 머신 타입 | 1 vCPU, 512Mi | e2-micro (0.25 vCPU, 1GB) |
| OS | 관리형 (Cloud Run) | Container-Optimized OS |
| 도메인 | `listener-server-370459866598.asia-northeast3.run.app` | `listener.tokamon.io` |
| 고정 IP | Cloud Run 자동 | `34.64.144.9` |
| TLS | Cloud Run 자동 | nginx + Let's Encrypt (만료: 2026-07-03) |
| 데이터 | 임시 (매 시작마다 Firestore에서 복원) | 영구 (`/data/` 볼륨) |
| 자동 복구 | Cloud Run 관리형 | Docker `--restart=unless-stopped` + GCP VM 자동 재시작 |

### Firebase Hosting 라우팅

| 경로 | Before | After |
|------|--------|-------|
| `/api/faucet/**` | `"run": { "serviceId": "listener-server" }` | `"function": "listenerProxy"` → VM |
| `/api/spots/**` | `"run": { "serviceId": "listener-server" }` | `"function": "listenerProxy"` → VM |
| `/api/spots` | `"run": { "serviceId": "listener-server" }` | `"function": "listenerProxy"` → VM |
| `/api/**` | Cloud Functions (`api`) | 변경 없음 |

### 모바일 앱

| 항목 | Before | After |
|------|--------|-------|
| `EXPO_PUBLIC_LISTENER_URL_THANOS_SEPOLIA` | Cloud Run URL | `https://listener.tokamon.io` |
| listenerUrl 결정 방식 | 빌드 시 하드코딩 | `/api/contract`에서 동적 조회 (Firestore 변경으로 업데이트 가능) |

---

## 4. 변경된 파일

### 코드 변경

| 파일 | 변경 내용 |
|------|----------|
| `firebase.json` | Cloud Run rewrite → listenerProxy 함수 (3줄) |
| `functions/index.js` | listenerProxy 프록시 함수 추가, `/api/contract`에 listenerUrl 반환 |
| `app/src/utils/networkStore.js` | 폴백 URL → `listener.tokamon.io`, 동적 listenerUrl 지원 |
| `app/src/services/api.js` | `getContractInfo()`에서 listenerUrl 동적 설정 |
| `app/.env` | listener URL 변경 |

### 신규 파일

| 파일 | 내용 |
|------|------|
| `vm/docker-compose.yml` | listener-server + nginx + certbot 구성 |
| `vm/nginx.conf` | TLS 리버스 프록시 설정 |
| `vm/startup.sh` | Secret Manager 연동 + 컨테이너 시작 스크립트 |
| `vm/init-ssl.sh` | Let's Encrypt 인증서 초기 발급 |
| `vm/.env.example` | 환경변수 템플릿 |
| `docs/operations/COMPUTE-ENGINE.md` | VM 운영 가이드 |

### 문서 변경

| 파일 | 변경 |
|------|------|
| `docs/architecture/ARCHITECTURE_START_GUIDE.md` | 시스템 구조도 VM 전면 이전 반영 |
| `docs/operations/DEPLOY_GUIDE.md` | 리스너 서버 섹션 VM 기준으로 변경 |
| `docs/operations/CLOUD-RUN.md` | 상단 deprecated 안내 추가 |
| `docs/operations/ALERT-RESPONSE.md` | 모든 명령어 VM 기준으로 변경 |
| `docs/versioning/VERSIONS.md` | 인프라 정보 변경 |
| `docs/versioning/VERSION_POLICY.md` | 배포 대상/방법 변경 |

### 변경 없음

| 항목 |
|------|
| listener-server 소스 코드 (index.js, blockchain.js 등) |
| Cloud Functions 기존 엔드포인트 (`api`) |
| Firestore 스키마 |
| 웹 클라이언트 코드 |
| 스마트 컨트랙트 |

---

## 5. VM 서버 상태 (마이그레이션 완료 시점)

```json
{
  "status": "healthy",
  "providers": {
    "ws": "connected",
    "http": "ok",
    "isReconnecting": false,
    "reconnectAttempts": 0
  },
  "bot": "running",
  "contract": "0xA7cDf6657cE30A2316126d8F9952b9A6f17db9b7"
}
```

---

## 6. 완료된 작업

| 항목 | 상태 |
|------|------|
| Android 앱 재빌드 (EAS Build) | 완료 |
| iOS 앱 재빌드 + TestFlight 배포 | 완료 |
| Firebase Functions 배포 (listenerProxy) | 완료 |
| Cloud Run 서비스 삭제 | 완료 (2026-04-04) |
| Cloud Monitoring 업타임 체크 설정 | 완료 |
| COS iptables 영구 설정 | 완료 |
| certbot 자동 갱신 설정 | 완료 |

---

## 7. 롤백 계획

문제 발생 시 즉시 롤백 가능:

1. VM 컨테이너 중지 (Telegram 봇 충돌 방지)
2. `firebase.json` 원래 Cloud Run rewrite로 복원
3. `firebase deploy --only hosting`
4. Cloud Run `minScale=1` 복원

---

## 8. 리스크 및 완화

| 리스크 | 영향 | 완화 |
|--------|------|------|
| VM 장애 시 자동 복구 ~1-5분 | 서비스 중단 | Docker restart + GCP VM 자동 재시작 + 모니터링 알림 |
| TLS 인증서 만료 (90일) | HTTPS 접근 불가 | certbot 자동 갱신 (12시간마다) |
| e2-micro 리소스 부족 | 이벤트 처리 지연 | 현재 트래픽(월 ~1,098건) 대비 충분한 여유 |
| COS 재부팅 시 iptables 초기화 | 외부 접근 불가 | startup-script에 iptables 규칙 추가 예정 |
