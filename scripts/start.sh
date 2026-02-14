#!/bin/bash
#
# Firebase-Test Service Starter
# Usage: ./scripts/start.sh [local|testnet|production] [all|anvil|deploy|client|listener]
#
#   local      - 로컬 개발 (Anvil + 로컬 배포 + client) [기본값]
#   testnet    - 테스트넷 (배포 + client, Anvil 없음)
#   production - 프로덕션 (배포 + client)
#
#   all     - 해당 모드의 전체 구성요소 시작
#   anvil   - [local 전용] Anvil만 시작
#   deploy  - 컨트랙트 배포만 실행
#   client  - Vite 클라이언트만 시작
#   listener - 블록체인 리스너만 시작
#

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
MODE="${1:-local}"
TARGET="${2:-all}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

mkdir -p "$LOG_DIR"

# .env 로드 (존재 시)
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
fi

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
    nohup anvil --host 0.0.0.0 --port 8999 --chain-id 1337 --balance 10000 \
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
    case "$MODE" in
        local)
            info "Deploying contracts (local)..."
            "$PROJECT_ROOT/scripts/deploy.sh" local
            cd "$PROJECT_ROOT" && npm run copy-contracts
            ;;
        testnet|production)
            "$PROJECT_ROOT/scripts/deploy.sh" "$MODE"
            cd "$PROJECT_ROOT" && npm run copy-contracts
            ;;
        *)
            err "Unknown mode: $MODE"
            return 1
            ;;
    esac
    ok "Contracts deployed"
}

start_client() {
    if is_port_open 5173; then
        warn "Client already running on port 5173"
        return 0
    fi
    info "Starting Client (port 5173)..."
    cd "$PROJECT_ROOT"
    nohup npm run dev > "$LOG_DIR/client.log" 2>&1 &
    echo $! > "$LOG_DIR/client.pid"
    if wait_for_port 5173 15; then
        ok "Client started (PID: $(cat "$LOG_DIR/client.pid"))"
    else
        err "Client failed to start — check $LOG_DIR/client.log"
        return 1
    fi
}

start_listener() {
    if [ -f "$LOG_DIR/listener.pid" ] && kill -0 "$(cat "$LOG_DIR/listener.pid")" 2>/dev/null; then
        warn "Listener already running"
        return 0
    fi
    info "Starting Listener..."
    cd "$PROJECT_ROOT"
    nohup npm run listener > "$LOG_DIR/listener.log" 2>&1 &
    echo $! > "$LOG_DIR/listener.pid"
    sleep 2
    ok "Listener started (PID: $(cat "$LOG_DIR/listener.pid"))"
}

echo ""
echo "========================================="
echo "  Firebase-Test Service Manager — START"
echo "  Mode: $MODE | Target: $TARGET"
echo "========================================="
echo ""

if [ "$MODE" != "local" ] && [ "$TARGET" = "anvil" ]; then
    warn "anvil은 local 모드에서만 사용 가능합니다. 무시합니다."
    TARGET="all"
fi

case "$TARGET" in
    all)
        if [ "$MODE" = "local" ]; then
            start_anvil
        fi
        deploy_contracts
        start_client
        ;;
    anvil)
        start_anvil
        ;;
    deploy)
        if [ "$MODE" = "local" ] && ! is_port_open 8999; then
            err "Anvil이 실행 중이어야 합니다. ./scripts/start.sh local anvil 먼저 실행"
            exit 1
        fi
        deploy_contracts
        ;;
    client)
        start_client
        ;;
    listener)
        start_listener
        ;;
    *)
        err "Unknown target: $TARGET"
        echo "Usage: $0 [local|testnet|production] [all|anvil|deploy|client|listener]"
        exit 1
        ;;
esac

echo ""
echo "========================================="
echo "  서비스 URL"
echo "========================================="
if [ "$TARGET" = "all" ] || [ "$TARGET" = "client" ]; then
    is_port_open 5173 && echo -e "  ${GREEN}웹앱:${NC}     http://localhost:5173"
fi
if ( [ "$TARGET" = "all" ] && [ "$MODE" = "local" ] ) || [ "$TARGET" = "anvil" ]; then
    is_port_open 8999 && echo -e "  ${GREEN}Anvil RPC:${NC} http://localhost:8999 (Chain ID: 1337)"
fi
echo "========================================="
echo ""
ok "Done."
echo ""
