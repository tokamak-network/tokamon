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
npm run install:all
```

Create a `.env` file in the project root:

```env
RPC_URL=http://127.0.0.1:8999
ADMIN_PRIVATE_KEY=<anvil_default_account_0_private_key>
TELEGRAM_BOT_TOKEN=<your_telegram_bot_token>
TELEGRAM_HASH_SALT=tokamon-telegram-2024
```

> `ADMIN_PRIVATE_KEY` — Use Anvil's default account #0 private key (printed when you run `npm run anvil`). This is a local testnet key with no real value. `TELEGRAM_BOT_TOKEN` — Create a bot via [@BotFather](https://t.me/BotFather).

```bash
npm run dev
```

Open http://localhost:5173 and connect MetaMask (Chain ID: 1337, RPC: http://127.0.0.1:8999).

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
client/       React app — Customer / Store Kiosk / Store Manager views
```

## Testing

```bash
cd contracts && forge test -vv
```

## Documentation

See [docs/](docs/) for detailed specs and guides.

## License

MIT
