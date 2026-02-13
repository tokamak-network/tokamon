# Tokamon 배포 가이드

로컬, 테스트넷, 프로덕션 및 Docker 배포 방법을 정리한 문서입니다.

---

## 1. 사전 요구사항

| 항목 | 버전 |
|------|------|
| Node.js | 18+ |
| Foundry (forge, anvil) | [설치 가이드](https://book.getfoundry.sh/getting-started/installation) |
| MetaMask | (클라이언트 연결용) |
| Docker | (Docker 배포 시) |

설치 스크립트:

```bash
./scripts/install.sh   # Node.js, Foundry, 의존성 점검 및 설치
```

---

## 2. 환경 설정

`.env.example`을 복사한 뒤 `.env`를 생성합니다.

```bash
cp .env.example .env
```

### 환경 변수 요약

| 변수 | 필수 | 설명 |
|------|------|------|
| **RPC_URL** | testnet/production | EVM RPC URL (로컬: `http://127.0.0.1:8999`) |
| **PRIVATE_KEY** | testnet/production | 배포/Admin용 지갑 개인키 |
| **CHAIN_ID** | production | 대상 체인 ID (로컬: 1337) |
| **TELEGRAM_BOT_TOKEN** | 선택 | 텔레그램 봇 토큰 (@BotFather) |
| **TELEGRAM_HASH_SALT** | 선택 | 텔레그램 해시 솔트 |
| **PORT** | 선택 | 서버 포트 (기본: 3001) |
| **DATABASE_PATH** | 선택 | SQLite DB 경로 (기본: `server/tokamon.db`) |
| **METADATA_PATH** | 선택 | 스팟 메타데이터 경로 (Docker: `/data/spot-metadata.json`) |
| **ADMIN_PRIVATE_KEY** | 선택 | Admin 권한 (로컬: Anvil account[0] 사용) |
| **FAUCET_ETH** | testnet 선택 | Faucet 초기 ETH (기본: 1 ETH) |
| **FAUCET_TON** | testnet 선택 | Faucet 초기 TON (기본: 10,000) |

---

## 3. 배포 모드

### 3.1 로컬 (local)

Anvil 기반 로컬 개발 환경입니다. Faucet이 포함되어 테스트용 TON/ETH를 지급합니다.

```bash

# Anvil 실행
./scripts/start.sh local anvil

# Anvil 실행 후
./scripts/deploy.sh local
```

**필수 사항**

- Anvil 포트 8999에서 실행 중
- `.env`의 RPC_URL (기본 `http://127.0.0.1:8999`)

**결과:** `server/contract-address.json` 생성

---

### 3.2 테스트넷 (testnet)

Sepolia, Titan Testnet 등 테스트넷 배포입니다. Faucet 포함.

```bash
./scripts/deploy.sh testnet
```

**필수 환경 변수**

- `RPC_URL` — 테스트넷 RPC URL
- `PRIVATE_KEY` — 배포용 지갑 개인키
- `CHAIN_ID` — (선택, 기본 1337)

**선택 환경 변수**

- `FAUCET_ETH` — Faucet ETH (기본: 1 ETH)
- `FAUCET_TON` — Faucet TON (기본: 10,000)

---

### 3.3 프로덕션 (production)

실제 서비스 환경 배포입니다. Faucet 없음, 사용자가 직접 TON을 확보합니다.

```bash
./scripts/deploy.sh production
```

**필수 환경 변수**

- `RPC_URL` — 메인넷/서비스용 RPC URL
- `PRIVATE_KEY` — 배포용 지갑 개인키
- `CHAIN_ID` — 대상 체인 ID

실행 시 확인 프롬프트가 표시됩니다.

---

## 4. 서비스 구동

### 4.1 start.sh

```bash
./scripts/start.sh [모드] [타겟]
```

| 모드 | 설명 |
|------|------|
| **local** | 로컬 개발 (Anvil + 배포 + server + client) [기본] |
| **testnet** | 테스트넷 (배포 + server + client) |
| **production** | 프로덕션 (배포 + server + client) |

| 타겟 | 설명 |
|------|------|
| **all** | 해당 모드 전체 구성요소 [기본] |
| **anvil** | [local 전용] Anvil만 시작 |
| **deploy** | [testnet/production] 컨트랙트 배포만 |
| **server** | Express 서버만 |
| **client** | Vite 클라이언트만 |

### 4.2 예시

```bash
# 로컬 전체 시작 (Anvil → 배포 → server → client)
./scripts/start.sh
./scripts/start.sh local all

# 로컬: Anvil만
./scripts/start.sh local anvil

# 테스트넷 전체 (배포 후 server + client)
./scripts/start.sh testnet all

# 서버만 재시작
./scripts/start.sh local server
```

### 4.3 접속

- **클라이언트:** http://localhost:5173
- **서버 API:** http://localhost:3001
- **Anvil RPC:** http://localhost:8999 (Chain ID: 1337)

---

## 5. Docker 배포

### 5.1 사전 준비

1. `.env` 생성 및 설정
2. `contract-address.json` 생성 (로컬 배포 사용 시)

```bash
./scripts/start.sh local anvil   # Anvil 실행
./scripts/deploy.sh local        # 배포
```

### 5.2 실행

```bash
# 서비스만 (테스트넷/프로덕션 RPC 사용)
docker compose up -d

# Anvil + 서비스 (로컬 테스트)
docker compose --profile local up -d
```

**로컬 프로필 사용 시** `.env`에 다음 설정:

```
RPC_URL=http://anvil:8999
```

### 5.3 명령어

| 명령 | 설명 |
|------|------|
| `docker compose build` | 이미지 빌드 |
| `docker compose up -d` | 백그라운드 실행 |
| `docker compose --profile local up -d` | Anvil 포함 실행 |
| `docker compose down` | 종료 |

### 5.4 접속

- **웹앱:** http://localhost:3001 (클라이언트 + API 단일 포트)

### 5.5 볼륨

- `tokamon-data` — DB (`/data/tokamon.db`), 스팟 메타데이터 (`/data/spot-metadata.json`)
- `contract-address.json` — 호스트에서 읽기 전용 마운트

---

## 6. 서비스 관리

### 6.1 서비스 종료 (stop.sh)

```bash
./scripts/stop.sh [타겟]
```

| 타겟 | 설명 |
|------|------|
| **all** | 전체 종료 (client → server → anvil 순) [기본] |
| **anvil** | Anvil만 종료 |
| **server** | Express 서버만 종료 |
| **client** | Vite 클라이언트만 종료 |

**예시**

```bash
./scripts/stop.sh          # 전체 종료
./scripts/stop.sh server    # 서버만 종료
./scripts/stop.sh anvil     # Anvil만 종료
```

> 데이터는 유지됩니다. DB, 블록체인 상태, 로그는 삭제되지 않습니다.

### 6.2 기타 명령

| 명령 | 설명 |
|------|------|
| `./scripts/status.sh` | PID, 포트, 업타임, 헬스체크, 로그 미리보기 |
| `./scripts/reset.sh` | 종료 후 블록체인·DB·로그 전체 삭제 |
| `./scripts/urls.sh` | 서비스 URL 접근 상태 점검 |

### 6.3 전체 초기화

```bash
./scripts/reset.sh    # 종료 + 데이터 삭제
./scripts/start.sh    # 처음부터 재시작
```

---

## 7. 배포 플로우 요약

### 로컬 개발

```
1. ./scripts/install.sh
2. .env 생성 (RPC_URL=http://127.0.0.1:8999)
3. ./scripts/start.sh local all
4. http://localhost:5173 접속
```

### 테스트넷

```
1. .env에 RPC_URL, PRIVATE_KEY, CHAIN_ID 설정
2. ./scripts/deploy.sh testnet
3. ./scripts/start.sh testnet server client
4. MetaMask에서 해당 테스트넷 연결
```

### 프로덕션

```
1. .env에 RPC_URL, PRIVATE_KEY, CHAIN_ID 설정
2. ./scripts/deploy.sh production
3. ./scripts/start.sh production server client
   또는 Docker: docker compose up -d
```

### Docker

```
1. .env 설정
2. ./scripts/deploy.sh local (또는 이미 배포된 contract-address.json 사용)
3. docker compose up -d
   (로컬: docker compose --profile local up -d, RPC_URL=http://anvil:8999)
```

---

## 8. 트러블슈팅

| 문제 | 해결 |
|------|------|
| "contract-address.json이 없습니다" | `./scripts/deploy.sh local` 또는 `./scripts/start.sh local all` |
| Anvil 연결 실패 | `./scripts/status.sh`로 Anvil 실행 여부 확인 |
| RPC_URL 연결 실패 | `.env`의 RPC_URL, Docker 로컬 시 `RPC_URL=http://anvil:8999` 확인 |
| 테스트넷/프로덕션 배포 실패 | PRIVATE_KEY, RPC_URL, CHAIN_ID 설정 확인 |
| DB/메타데이터 손실 | Docker: `tokamon-data` 볼륨 유지, reset.sh는 데이터 삭제 |
