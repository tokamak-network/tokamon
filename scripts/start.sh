#!/bin/bash
#
# Tokamon Service Starter
# Usage: ./scripts/start.sh [local|testnet|production] [all|anvil|deploy|server|client]
#
#   local      - 로컬 개발 (Anvil + 로컬 배포 + server + client) [기본값]
#   testnet    - 테스트넷 (배포 + server + client, Anvil 없음)
#   production - 서비스 (배포 + server + client)
#
#   all     - 해당 모드의 전체 구성요소 시작
#   anvil   - [local 전용] Anvil만 시작
#   deploy  - [testnet/production] 컨트랙트 배포만 실행
#   server  - Express 서버만 시작
#   client  - Vite 클라이언트만 시작
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
    case "$MODE" in
        local)
            info "Deploying contracts (local)..."
            cd "$PROJECT_ROOT/contracts"
            forge build 2>/dev/null || true
            forge script script/DeployLocal.s.sol:DeployLocal \
                --rpc-url http://127.0.0.1:8999 \
                --broadcast --unlocked \
                --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
                >> "$LOG_DIR/deploy.log" 2>&1
            cd "$PROJECT_ROOT"
            ;;
        testnet|production)
            "$PROJECT_ROOT/scripts/deploy.sh" "$MODE"
            ;;
        *)
            err "Unknown mode: $MODE"
            return 1
            ;;
    esac
    ok "Contracts deployed"
    [ "$MODE" = "local" ] && echo "  (log: $LOG_DIR/deploy.log)"
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
        # 텔레그램 봇 상태 (API 응답 대기 후 조회)
        sleep 1
        if curl -s --max-time 2 "http://localhost:3001/api/telegram/status" 2>/dev/null | grep -q '"enabled":true'; then
            ok "텔레그램 봇: 활성화"
        elif [ -n "$TELEGRAM_BOT_TOKEN" ]; then
            warn "텔레그램 봇: 초기화 중 또는 확인 실패"
        else
            warn "텔레그램 봇: 비활성화 (TELEGRAM_BOT_TOKEN 설정 필요)"
        fi
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
echo "  Mode: $MODE | Target: $TARGET"
echo "========================================="
echo ""

# testnet/production에서 anvil 요청 시 무시
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
        start_server
        start_client
        ;;
    anvil)
        start_anvil
        ;;
    deploy)
        deploy_contracts
        ;;
    server)
        start_server
        ;;
    client)
        start_client
        ;;
    *)
        err "Unknown target: $TARGET"
        echo "Usage: $0 [local|testnet|production] [all|anvil|deploy|server|client]"
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
if [ "$TARGET" = "all" ] || [ "$TARGET" = "server" ]; then
    if is_port_open 3001; then
        echo -e "  ${GREEN}API:${NC}      http://localhost:3001"
        curl -s --max-time 2 "http://127.0.0.1:3001/api/telegram/status" 2>/dev/null | grep -q '"enabled":true' \
            && echo -e "  ${GREEN}Telegram:${NC} 봇 활성화" \
            || echo -e "  ${YELLOW}Telegram:${NC} 봇 비활성화"
    fi
fi
if ( [ "$TARGET" = "all" ] && [ "$MODE" = "local" ] ) || [ "$TARGET" = "anvil" ]; then
    is_port_open 8999 && echo -e "  ${GREEN}Anvil RPC:${NC} http://localhost:8999 (Chain ID: 1337)"
fi
echo "========================================="
echo ""
ok "Done. Use ./scripts/status.sh to check services."
echo ""
