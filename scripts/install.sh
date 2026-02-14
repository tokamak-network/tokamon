#!/bin/bash
#
# Firebase-Test Dependency Installer
# Usage: ./scripts/install.sh
#

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

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

echo ""
echo "========================================="
echo "  Firebase-Test Dependency Check & Install"
echo "========================================="
echo ""

# Node.js check
if ! command -v node &> /dev/null; then
    err "Node.js not found. Install Node.js 18+ first."
    exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
    err "Node.js 18+ required (current: $(node -v))"
    exit 1
fi
ok "Node.js $(node -v)"

# Foundry (anvil, forge) check
if ! command -v anvil &> /dev/null || ! command -v forge &> /dev/null; then
    warn "Foundry not found. Installing..."
    curl -L https://foundry.paradigm.xyz | bash
    source ~/.bashrc 2>/dev/null || source ~/.profile 2>/dev/null
    foundryup
    if command -v anvil &> /dev/null; then
        ok "Foundry installed"
    else
        err "Foundry install failed — see https://book.getfoundry.sh/getting-started/installation"
        exit 1
    fi
else
    ok "Foundry (anvil $(anvil --version 2>/dev/null | head -1))"
fi

# Root dependencies (workspaces)
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    info "Installing root dependencies..."
    cd "$PROJECT_ROOT" && npm install
else
    ok "Root dependencies"
fi

# Forge dependencies (lib/forge-std가 이미 포함되어 있으면 skip)
if [ -d "$PROJECT_ROOT/contracts/lib/forge-std" ]; then
    ok "Contract dependencies (forge-std 포함됨)"
elif [ -f "$PROJECT_ROOT/contracts/foundry.toml" ]; then
    warn "forge-std 없음. git init 후 forge install 필요."
    if ! git -C "$PROJECT_ROOT" rev-parse 2>/dev/null; then
        info "git 저장소 초기화: git init"
        git -C "$PROJECT_ROOT" init
    fi
    info "Installing forge dependencies..."
    cd "$PROJECT_ROOT/contracts" && forge install foundry-rs/forge-std
else
    ok "Contract dependencies"
fi

echo ""
ok "All dependencies ready. Run ./scripts/start.sh to start services."
echo ""
