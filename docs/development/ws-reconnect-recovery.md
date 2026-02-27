# WebSocket 재연결 및 프로덕션 안정성 강화

## 개요

listener-server는 블록체인 이벤트를 실시간으로 수신하여 Firestore/SQLite에 동기화하는 핵심 서비스다.
현재 WebSocket 연결이 끊어지면 12개 이벤트 리스너가 조용히 죽어버려, 서비스는 running 상태이지만 실제로는 아무 이벤트도 처리하지 않는 문제가 있다.

**브랜치:** `fix/ws-reconnect-recovery`

## Phase별 작업

### Phase 1 — WebSocket 재연결 + 지수 백오프 (CRITICAL) ✅

**파일:** `listener-server/blockchain.js`

| 항목 | 내용 |
|------|------|
| `registerEventListeners()` | 12개 이벤트 리스너 등록을 별도 함수로 분리 |
| `attachWsHandlers()` | WS provider의 `ws.onclose`/`ws.onerror` 핸들러 연결 |
| `reconnectWsProvider()` | 지수 백오프 재연결 (기본 1초, 최대 60초, 20% 지터) |
| `getProviderStatus()` | 헬스체크용 프로바이더 상태 반환 |
| `destroy()` | Graceful shutdown용 정리 함수 |

**테스트:** `__tests__/ws-reconnect.test.js`

### Phase 2 — 글로벌 에러 핸들러 + safeEventHandler (HIGH) ✅

**파일:** `listener-server/blockchain.js`, `listener-server/index.js`

- `index.js`: `process.on('unhandledRejection')` + `process.on('uncaughtException')`
- `blockchain.js`: `safeEventHandler()` 래퍼로 12개 이벤트 핸들러 감싸기

**테스트:** `__tests__/error-handling.test.js`

### Phase 3 — 헬스체크 엔드포인트 (MEDIUM) ✅

**파일:** `listener-server/index.js`, `listener-server/blockchain.js`

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /health` | WS/HTTP 프로바이더, 봇 상태 종합 (200/503) |
| `GET /health/live` | 단순 liveness (항상 200) |

**테스트:** `__tests__/health-check.test.js`

### Phase 4 — Graceful Shutdown (MEDIUM) ✅

**파일:** `listener-server/index.js`, `listener-server/telegram-bot.js`

- SIGTERM/SIGINT 핸들러 → HTTP 서버 close → 봇 중지 → 프로바이더 destroy → DB close
- `startHttpServer()`가 server 참조 반환
- `telegram-bot.js`에 `stopBot()` 함수 추가

### Phase 5 — 텔레그램 봇 내결함성 (MEDIUM) ✅

**파일:** `listener-server/telegram-bot.js`

- `bot.on('polling_error')` 핸들러
- `bot.on('error')` 핸들러

### Phase 6 — Firestore 재시도 로직 (MEDIUM) ✅

**파일:** `listener-server/firebase-admin.js`

- `withRetry(operation, label, maxRetries=3)` 래퍼
- 6개 Firestore 쓰기 함수에 적용

**테스트:** `__tests__/firestore-retry.test.js`

## 수정 대상 파일 목록

| 파일 | Phase |
|------|-------|
| `listener-server/blockchain.js` | 1, 2, 3 |
| `listener-server/index.js` | 2, 3, 4 |
| `listener-server/telegram-bot.js` | 4, 5 |
| `listener-server/firebase-admin.js` | 6 |

## 검증 방법

- 각 Phase별 Jest 테스트: `cd listener-server && npm test`
- Phase 1 수동 검증: `WS_URL`을 잘못된 URL로 설정 후 재연결 동작 확인
- Phase 3 수동 검증: `curl localhost:3001/health` 응답 확인
- Phase 4 수동 검증: `kill -SIGTERM <pid>` 후 로그에서 정리 작업 확인
