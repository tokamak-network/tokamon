#!/bin/bash
#
# Firebase-Test Contract Deployer
# Usage: ./scripts/deploy.sh [local|testnet|production]
#
#   local     - Anvil 로컬 배포 (Faucet 포함, 테스트 계정 ETH 지급)
#   testnet   - 테스트넷 배포 (RPC_URL, PRIVATE_KEY, CHAIN_ID 필요, Faucet 포함)
#   production - 서비스 배포 (Faucet 없음, RPC_URL, PRIVATE_KEY, CHAIN_ID 필수)
#

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-local}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }

# .env 로드 (존재 시)
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
fi

run_deploy_local() {
    info "로컬 배포 (Anvil) — Faucet 포함"
    cd "$PROJECT_ROOT/contracts"
    forge build 2>/dev/null || true
    forge script script/DeployLocal.s.sol:DeployLocal \
        --rpc-url "http://127.0.0.1:8999" \
        --broadcast --unlocked \
        --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    cd "$PROJECT_ROOT"
}

run_deploy_testnet() {
    if [ -z "$RPC_URL" ]; then
        err "RPC_URL이 필요합니다. .env에 설정하세요."
        exit 1
    fi
    if [ -z "$PRIVATE_KEY" ]; then
        err "PRIVATE_KEY가 필요합니다. .env에 설정하세요."
        exit 1
    fi
    CHAIN_ID="${CHAIN_ID:-1337}"
    info "테스트넷 배포 — RPC: $RPC_URL, Chain ID: $CHAIN_ID"
    cd "$PROJECT_ROOT/contracts"
    forge build 2>/dev/null || true
    RPC_URL="$RPC_URL" PRIVATE_KEY="$PRIVATE_KEY" CHAIN_ID="$CHAIN_ID" \
    forge script script/DeployTestnet.s.sol:DeployTestnet \
        --rpc-url "$RPC_URL" \
        --broadcast \
        --private-key "$PRIVATE_KEY"
    cd "$PROJECT_ROOT"
}

run_deploy_production() {
    if [ -z "$RPC_URL" ]; then
        err "RPC_URL이 필요합니다. .env에 설정하세요."
        exit 1
    fi
    if [ -z "$PRIVATE_KEY" ]; then
        err "PRIVATE_KEY가 필요합니다. .env에 설정하세요."
        exit 1
    fi
    if [ -z "$CHAIN_ID" ]; then
        err "CHAIN_ID가 필요합니다. .env에 설정하세요."
        exit 1
    fi
    warn "프로덕션 배포 — 실제 메인넷/서비스 환경입니다."
    read -p "계속하시겠습니까? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "취소됨."
        exit 0
    fi
    info "서비스 배포 — RPC: $RPC_URL, Chain ID: $CHAIN_ID (Faucet 없음)"
    cd "$PROJECT_ROOT/contracts"
    forge build 2>/dev/null || true
    RPC_URL="$RPC_URL" PRIVATE_KEY="$PRIVATE_KEY" CHAIN_ID="$CHAIN_ID" \
    forge script script/DeployProduction.s.sol:DeployProduction \
        --rpc-url "$RPC_URL" \
        --broadcast \
        --private-key "$PRIVATE_KEY"
    cd "$PROJECT_ROOT"
}

echo ""
echo "========================================="
echo "  Firebase-Test Deploy — $MODE"
echo "========================================="
echo ""

case "$MODE" in
    local)
        run_deploy_local
        ;;
    testnet)
        run_deploy_testnet
        ;;
    production)
        run_deploy_production
        ;;
    *)
        err "Unknown mode: $MODE"
        echo "Usage: $0 [local|testnet|production]"
        exit 1
        ;;
esac

echo ""
ok "배포 완료. contract-address.json: listener-server/contract-address.json"
echo "  → npm run copy-contracts 로 클라이언트에 복사"
echo ""
