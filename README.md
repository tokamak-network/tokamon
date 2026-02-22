# Tokamon

A location-based reward service where you earn TON tokens by visiting stores.

- **Web (Spot Registration):** https://go.tokamon.io
- **iOS App:** Download via TestFlight invite link
- **Network:** Thanos Sepolia (Tokamak Network Testnet)

> See the [User Guide](docs/USER_GUIDE.md) for usage instructions.

## Project Structure

```
tokamon/
├── client/             # Web client (Vite + React)
├── app/                # Mobile app (Expo + React Native)
├── contracts/          # Smart contracts (Foundry)
├── listener-server/    # Blockchain listener + API server (Cloud Run)
├── functions/          # Firebase Cloud Functions
├── shared/             # Shared modules (networks.js)
└── docs/               # Documentation
```

## Documentation

- **[User Guide](docs/USER_GUIDE.md)** — App download, earning TON, spot registration
- **Development:** [Setup Guide](docs/development/SETUP_GUIDE.md) · [Device Claim](docs/development/DEVICE_CLAIM_FCM.md) · [Device ID](docs/development/device-id-architecture.md)
- **Operations:** [Cloud Run Deploy/Monitoring](docs/operations/CLOUD-RUN.md) · [Alert Response](docs/operations/ALERT-RESPONSE.md) · [Deploy Guide](docs/operations/DEPLOY_GUIDE.md) · [Security](docs/operations/security-checklist.md)
- **Architecture:** [Overview](docs/architecture/ARCHITECTURE_START_GUIDE.md) · [DB Schema](docs/architecture/database-schema.md)
