#!/bin/bash
#
# Tokamon Service Stopper
# Usage: ./scripts/stop.sh [all|anvil|server|client]
#

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
TARGET="${1:-all}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }

stop_service() {
    local name=$1 pid_file="$LOG_DIR/$2.pid" port=$3
    local pid=""
    local stopped=false

    # Try PID file first
    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            info "Stopping $name (PID: $pid)..."
            kill "$pid" 2>/dev/null
            # Wait up to 5 seconds for graceful shutdown
            for i in $(seq 1 5); do
                if ! kill -0 "$pid" 2>/dev/null; then
                    stopped=true
                    break
                fi
                sleep 1
            done
            if [ "$stopped" = false ]; then
                warn "$name did not stop gracefully, force killing..."
                kill -9 "$pid" 2>/dev/null
                sleep 1
            fi
            ok "$name stopped"
            rm -f "$pid_file"
            return 0
        else
            rm -f "$pid_file"
        fi
    fi

    # Fallback: kill by port
    if lsof -ti:"$port" > /dev/null 2>&1; then
        info "Stopping $name via port $port (no PID file)..."
        kill $(lsof -ti:"$port") 2>/dev/null
        sleep 2
        # Force kill if still alive
        if lsof -ti:"$port" > /dev/null 2>&1; then
            kill -9 $(lsof -ti:"$port") 2>/dev/null
            sleep 1
        fi
        ok "$name stopped (port fallback)"
        return 0
    fi

    ok "$name is not running"
}

stop_anvil() {
    stop_service "Anvil" "anvil" 8999
    # Extra safety: kill any lingering anvil process
    if pgrep -x "anvil" > /dev/null 2>&1; then
        warn "Killing lingering Anvil process..."
        pkill -9 anvil 2>/dev/null
        sleep 1
    fi
}

stop_server() {
    stop_service "Server" "server" 3001
}

stop_client() {
    stop_service "Client" "client" 5173
}

echo ""
echo "========================================="
echo "  Tokamon Service Manager — STOP"
echo "========================================="
echo ""

case "$TARGET" in
    all)
        stop_client
        stop_server
        stop_anvil
        ;;
    anvil)
        stop_anvil
        ;;
    server)
        stop_server
        ;;
    client)
        stop_client
        ;;
    *)
        echo -e "${RED}[ERROR]${NC} Unknown target: $TARGET"
        echo "Usage: $0 [all|anvil|server|client]"
        exit 1
        ;;
esac

echo ""
ok "Done. Use ./scripts/status.sh to check services."
echo ""
