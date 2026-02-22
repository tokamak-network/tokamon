# Tokamon Documentation

## User Guide

- **[USER_GUIDE.md](./USER_GUIDE.md)** — App download, earning TON, spot registration

## Folder Structure

```
docs/
├── USER_GUIDE.md                # User guide (app download, spot registration)
│
├── development/                 # Development & Setup
│   ├── SETUP_GUIDE.md           # Local development environment setup
│   ├── DEVICE_CLAIM_FCM.md      # FCM push-based device claim flow
│   └── device-id-architecture.md # Device ID architecture (ANDROID_ID, IDFV)
│
├── operations/                  # Operations & Deployment
│   ├── CLOUD-RUN.md             # Cloud Run deploy, monitoring, alerts, troubleshooting
│   ├── ALERT-RESPONSE.md        # Alert response guide
│   ├── DEPLOY_GUIDE.md          # Deployment procedure guide
│   ├── SERVER_OPERATION_COST.md # Operation cost estimation (gas, Firebase, Cloud Run)
│   └── security-checklist.md    # Security checklist & penetration test results
│
└── architecture/                # Design & Architecture
    ├── ARCHITECTURE_START_GUIDE.md    # Architecture overview
    ├── database-schema.md             # Firestore, SQLite, file schema
    └── TOKAMON_FIREBASE_MIGRATION.md  # Firebase migration history (reference)
```

## Getting Started

1. **[development/SETUP_GUIDE.md](./development/SETUP_GUIDE.md)** — Local environment setup & running
2. **[architecture/ARCHITECTURE_START_GUIDE.md](./architecture/ARCHITECTURE_START_GUIDE.md)** — Understanding the architecture

## Operations

1. **[operations/CLOUD-RUN.md](./operations/CLOUD-RUN.md)** — Cloud Run deploy, monitoring, troubleshooting
2. **[operations/ALERT-RESPONSE.md](./operations/ALERT-RESPONSE.md)** — Alert response procedures
3. **[operations/SERVER_OPERATION_COST.md](./operations/SERVER_OPERATION_COST.md)** — Cost estimation
4. **[operations/security-checklist.md](./operations/security-checklist.md)** — Security checklist

## Sub-projects

| Project | README | Description |
|---------|--------|-------------|
| `listener-server/` | [README.md](../listener-server/README.md) | Blockchain event listener + API server |
| `contracts/` | [README.md](../contracts/README.md) | Solidity smart contracts (Foundry) |
| `client/` | - | Web client (React + Vite) |
| `app/` | - | Mobile app (Expo + React Native) |
| `functions/` | - | Firebase Cloud Functions |
| `shared/` | - | Shared modules (networks.js) |
