# 스마트 컨트랙트 (Foundry)

Tokamon, TONToken, Faucet 컨트랙트 및 배포 스크립트입니다.

## 사전 요구사항

- [Foundry](https://book.getfoundry.sh/getting-started/installation) 설치
- forge-std: `forge install foundry-rs/forge-std`

## 설치

`lib/forge-std`가 이미 포함되어 있습니다. **`forge install` 실행 불필요.**

> `forge install`은 git submodule을 사용합니다. 프로젝트에 `.git`이 없으면 에러가 납니다. lib가 이미 있으면 `forge build`만 실행하면 됩니다.

## 빌드

```bash
forge build
```

## 배포

### 로컬 (Anvil)

```bash
# 터미널 1: Anvil 실행 (블록체인 노드)
anvil --port 8999 --chain-id 1337

# 터미널 2: 배포
forge script script/DeployLocal.s.sol:DeployLocal \
  --rpc-url http://127.0.0.1:8999 \
  --broadcast \
  --unlocked \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

배포 후 `listener-server/contract-address.json`에 주소가 저장됩니다. 클라이언트에서 Faucet UI를 사용하려면 루트에서 `npm run copy-contracts`로 복사하세요.

> 로컬 블록체인 실행 상세 가이드는 프로젝트 루트 [README.md](../README.md)를 참고하세요.

### 테스트넷

```bash
export PRIVATE_KEY=0x...
export RPC_URL=https://...
export CHAIN_ID=111551119090  # Thanos Sepolia

forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url $RPC_URL \
  --broadcast
```

### 프로덕션

```bash
export PRIVATE_KEY=0x...
export RPC_URL=https://...
export CHAIN_ID=111551119090

forge script script/DeployProduction.s.sol:DeployProduction \
  --rpc-url $RPC_URL \
  --broadcast
```

## 배포된 컨트랙트 주소

### Thanos Sepolia

| 항목 | 값 |
|------|-----|
| 네트워크 | Thanos Sepolia |
| Chain ID | `111551119090` |
| RPC URL | `https://rpc.thanos-sepolia.tokamak.network` |
| 탐색기 | https://explorer.thanos-sepolia.tokamak.network |
| Tokamon | `0xA7cDf6657cE30A2316126d8F9952b9A6f17db9b7` |
| Faucet | `0x049CD8ACdEFD7E72971112048FBF22A0aeFf0547` |
| Owner | `0x796C1f28c777b8a5851D356EBbc9DeC2ee51137F` |
| ClaimManager | `0xA42C3599f9a36e7CDdFeBA712EE31A6aaa9b7777` |

> 컨트랙트 주소는 `shared/networks.js`에서 관리됩니다 (Single Source of Truth).
