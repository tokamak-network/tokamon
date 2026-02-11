#!/bin/bash
#
# Tokamon Service Starter
# Usage: ./scripts/start.sh [all|anvil|server|client]
#

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
TARGET="${1:-all}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

mkdir -p "$LOG_DIR"

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }

is_port_open() {
    lsof -ti:"$1" > /dev/null 2>&1
}

wait_for_port() {
    local port=$1 timeout=$2 elapsed=0
    while ! is_port_open "$port"; do
        sleep 1
        elapsed=$((elapsed + 1))
        if [ "$elapsed" -ge "$timeout" ]; then
            return 1
        fi
    done
    return 0
}

start_anvil() {
    if is_port_open 8999; then
        warn "Anvil already running on port 8999"
        return 0
    fi
    info "Starting Anvil (port 8999)..."
    nohup anvil --port 8999 --chain-id 1337 --balance 10000 \
        --state "$PROJECT_ROOT/anvil-state.json" \
        > "$LOG_DIR/anvil.log" 2>&1 &
    echo $! > "$LOG_DIR/anvil.pid"
    if wait_for_port 8999 10; then
        ok "Anvil started (PID: $(cat "$LOG_DIR/anvil.pid"))"
    else
        err "Anvil failed to start — check $LOG_DIR/anvil.log"
        return 1
    fi
}

deploy_contracts() {
    info "Deploying contracts..."
    cd "$PROJECT_ROOT/contracts"
    forge build 2>/dev/null || true
    forge script script/Deploy.s.sol:DeployScript \
        --rpc-url http://127.0.0.1:8999 \
        --broadcast --unlocked \
        --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
        >> "$LOG_DIR/deploy.log" 2>&1
    cd "$PROJECT_ROOT"
    ok "Contracts deployed — see $LOG_DIR/deploy.log"
}

start_server() {
    if is_port_open 3001; then
        warn "Server already running on port 3001"
        return 0
    fi
    info "Starting Server (port 3001)..."
    nohup node "$PROJECT_ROOT/server/index.js" \
        > "$LOG_DIR/server.log" 2>&1 &
    echo $! > "$LOG_DIR/server.pid"
    if wait_for_port 3001 10; then
        ok "Server started (PID: $(cat "$LOG_DIR/server.pid"))"
    else
        err "Server failed to start — check $LOG_DIR/server.log"
        return 1
    fi
}

start_client() {
    if is_port_open 5173; then
        warn "Client already running on port 5173"
        return 0
    fi
    info "Starting Client (port 5173)..."
    nohup "$PROJECT_ROOT/client/node_modules/.bin/vite" "$PROJECT_ROOT/client" \
        > "$LOG_DIR/client.log" 2>&1 &
    echo $! > "$LOG_DIR/client.pid"
    if wait_for_port 5173 15; then
        ok "Client started (PID: $(cat "$LOG_DIR/client.pid"))"
    else
        err "Client failed to start — check $LOG_DIR/client.log"
        return 1
    fi
}

echo ""
echo "========================================="
echo "  Tokamon Service Manager — START"
echo "========================================="
echo ""

case "$TARGET" in
    all)
        start_anvil
        deploy_contracts
        start_server
        start_client
        ;;
    anvil)
        start_anvil
        ;;
    server)
        start_server
        ;;
    client)
        start_client
        ;;
    *)
        err "Unknown target: $TARGET"
        echo "Usage: $0 [all|anvil|server|client]"
        exit 1
        ;;
esac

echo ""
ok "Done. Use ./scripts/status.sh to check services."
echo ""
