#!/bin/bash
#
# Tokamon Dependency Installer
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
echo "  Tokamon Dependency Check & Install"
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

# Root dependencies
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    info "Installing root dependencies..."
    cd "$PROJECT_ROOT" && npm install
else
    ok "Root dependencies"
fi

# Server dependencies
if [ ! -d "$PROJECT_ROOT/server/node_modules" ]; then
    info "Installing server dependencies..."
    cd "$PROJECT_ROOT/server" && npm install
else
    ok "Server dependencies"
fi

# Client dependencies
if [ ! -d "$PROJECT_ROOT/client/node_modules" ]; then
    info "Installing client dependencies..."
    cd "$PROJECT_ROOT/client" && npm install
else
    ok "Client dependencies"
fi

# Vite check
if [ ! -f "$PROJECT_ROOT/client/node_modules/.bin/vite" ]; then
    err "Vite not found in client/node_modules — try: rm -rf client/node_modules && npm install --prefix client"
    exit 1
fi
ok "Vite ready"

# Forge dependencies
if [ -f "$PROJECT_ROOT/contracts/foundry.toml" ] && [ ! -d "$PROJECT_ROOT/contracts/lib" ]; then
    info "Installing forge dependencies..."
    cd "$PROJECT_ROOT/contracts" && forge install
else
    ok "Contract dependencies"
fi

echo ""
ok "All dependencies ready. Run ./scripts/start.sh to start services."
echo ""
