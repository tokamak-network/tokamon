# Tokamon

**Turn every store visit into crypto rewards.**

Tokamon is a location-based loyalty reward platform on EVM. Store owners deposit TON and create reward spots. Customers earn TON just by visiting — no wallet needed, just Telegram.

## How It Works

1. **Store owner** deposits TON and creates a reward spot
2. **Customer visits** the store, staff enters their Telegram username on the kiosk
3. **TON is issued** on-chain, customer gets a Telegram notification
4. **Customer links wallet** via Telegram bot and claims TON anytime

## Features

- **Zero friction** — Start earning with just a Telegram username, no wallet required
- **On-chain transparency** — Every reward is a real blockchain transaction
- **Telegram-first** — Notifications, balance check, wallet linking via bot
- **Stamp bonuses** — Repeat visits earn extra TON
- **Self-custody** — Claim to your own wallet whenever you want

## Upcoming

- **GPS Auto-Claim** — Customer app will detect store location via GPS and allow customers to claim rewards automatically when nearby, without needing the store kiosk

## Quick Start

**Prerequisites:** Node.js 18+, [Foundry](https://book.getfoundry.sh/getting-started/installation), MetaMask

```bash
git clone https://github.com/tokamak-network/tokamon.git
cd tokamon
./scripts/install.sh   # Node.js, Foundry, 의존성 점검 및 설치
```

Create a `.env` file in the project root:

```env
RPC_URL=http://127.0.0.1:8999
ADMIN_PRIVATE_KEY=<anvil_default_account_0_private_key>
TELEGRAM_BOT_TOKEN=<your_telegram_bot_token>
TELEGRAM_HASH_SALT=tokamon-telegram-2024
```

> `ADMIN_PRIVATE_KEY` — Use Anvil's default account #0 private key (printed when you run `npm run anvil`). This is a local testnet key with no real value. `TELEGRAM_BOT_TOKEN` — Create a bot via [@BotFather](https://t.me/BotFather).

Start all services:

```bash
./scripts/start.sh          # anvil → deploy → server → client
```

Open http://localhost:5173 and connect MetaMask (Chain ID: 1337, RPC: http://127.0.0.1:8999).

## Service Management

| Command | Description |
|---------|-------------|
| `./scripts/install.sh` | Node.js, Foundry, 의존성 점검 및 설치 |
| `./scripts/start.sh [all\|anvil\|server\|client]` | 서비스 시작 (all은 anvil → deploy → server → client) |
| `./scripts/stop.sh [all\|anvil\|server\|client]` | 서비스 종료 (graceful → force kill) |
| `./scripts/status.sh` | PID, 포트, 업타임, 헬스체크, 최근 로그 |
| `./scripts/reset.sh` | 서비스 종료 + 블록체인·DB·로그 전체 삭제 |
| `./scripts/urls.sh` | 서비스 URL 접근 상태 확인 (Local/Internal/Public + Chain ID) |

터미널을 닫아도 서비스가 유지된다. 로그와 PID 파일은 `logs/`에, Anvil 상태는 `anvil-state.json`에 저장된다.

`stop.sh`는 프로세스만 종료하며 데이터는 초기화하지 않는다. 재시작 시 이전 상태 그대로 이어지므로 개별 서비스만 올릴 수 있다. 모든 데이터를 초기화하려면 `reset.sh` 후 `start.sh`를 실행한다.

## Docker

```bash
# 1. .env 설정 후 로컬 배포로 contract-address.json 생성
./scripts/deploy.sh local

# 2. Docker 실행
docker compose up -d                    # 서비스만
docker compose --profile local up -d   # Anvil + 서비스 (로컬 테스트)

# 접속: http://localhost:3001
```

| 명령 | 설명 |
|------|------|
| `docker compose build` | 이미지 빌드 |
| `docker compose up -d` | 서비스 실행 (백그라운드) |
| `docker compose --profile local up -d` | Anvil 포함 로컬 전체 실행 |
| `docker compose down` | 서비스 종료 |

로컬 프로필 사용 시 `.env`에 `RPC_URL=http://anvil:8999` 설정.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Contracts | Solidity 0.8.19, Foundry |
| Frontend | React 18, Vite, Leaflet |
| Backend | Node.js, Express, SQLite |
| Bot | Telegram Bot API |

## Architecture

```
contracts/    Tokamon.sol (core), TONToken.sol (ERC20), Faucet.sol (testnet)
server/       Express API + Telegram bot + SQLite
client/       React app — Customer / Store Kiosk / Store Owner views
```

## Testing

```bash
cd contracts && forge test -vv
```

## Documentation

| 문서 | 설명 |
|------|------|
| [docs/DEPLOY_GUIDE.md](docs/DEPLOY_GUIDE.md) | 로컬·테스트넷·프로덕션·Docker 배포 가이드 |
| [docs/RESTART_GUIDE.md](docs/RESTART_GUIDE.md) | 서비스 시작/종료/초기화 |
| [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md) | 데모 실행 흐름 |
| [docs/dev/](docs/dev/) | 상세 스펙 (Contract, Server, User 등) |

## License

MIT
