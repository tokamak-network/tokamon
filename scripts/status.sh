#!/bin/bash
#
# Tokamon Service Status
# Usage: ./scripts/status.sh
#

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

TAIL_LINES=5

check_service() {
    local name=$1 pid_file="$LOG_DIR/$2.pid" port=$3 log_file="$LOG_DIR/$2.log" health_url=$4
    local pid="" status="" uptime_str=""

    echo -e "${BOLD}--- $name (port $port) ---${NC}"

    # PID check
    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            # Get uptime via ps elapsed time
            uptime_str=$(ps -o etime= -p "$pid" 2>/dev/null | xargs)
            status="running"
        else
            status="dead"
            pid="stale"
        fi
    elif lsof -ti:"$port" > /dev/null 2>&1; then
        pid=$(lsof -ti:"$port" | head -1)
        uptime_str=$(ps -o etime= -p "$pid" 2>/dev/null | xargs)
        status="running (no pidfile)"
    else
        status="stopped"
    fi

    # Status display
    case "$status" in
        running*)
            echo -e "  Status:  ${GREEN}RUNNING${NC}"
            echo -e "  PID:     $pid"
            echo -e "  Uptime:  ${uptime_str:-unknown}"
            ;;
        dead)
            echo -e "  Status:  ${RED}DEAD${NC} (PID file exists but process gone)"
            ;;
        stopped)
            echo -e "  Status:  ${YELLOW}STOPPED${NC}"
            ;;
    esac

    # Health check
    if [ -n "$health_url" ]; then
        if curl -s --max-time 2 "$health_url" > /dev/null 2>&1; then
            echo -e "  Health:  ${GREEN}OK${NC} ($health_url)"
        else
            echo -e "  Health:  ${RED}FAIL${NC} ($health_url)"
        fi
    fi

    # Recent logs
    if [ -f "$log_file" ]; then
        echo -e "  Log:     $log_file"
        echo -e "  ${CYAN}--- last $TAIL_LINES lines ---${NC}"
        tail -n "$TAIL_LINES" "$log_file" | sed 's/^/    /'
    else
        echo -e "  Log:     ${YELLOW}no log file${NC}"
    fi

    echo ""
}

echo ""
echo "========================================="
echo "  Tokamon Service Manager — STATUS"
echo "========================================="
echo ""

check_service "Anvil (Blockchain)"  "anvil"  8999 "http://127.0.0.1:8999"
check_service "Server (Express)"    "server" 3001 "http://127.0.0.1:3001/api/contract"
# 텔레그램 봇 상태 (서버 동작 시에만)
if curl -s --max-time 2 "http://127.0.0.1:3001/api/telegram/status" 2>/dev/null | grep -q '"enabled":true'; then
    echo -e "${BOLD}--- Telegram Bot ---${NC}"
    echo -e "  Status:  ${GREEN}ENABLED${NC}"
    echo ""
elif lsof -ti:3001 > /dev/null 2>&1; then
    echo -e "${BOLD}--- Telegram Bot ---${NC}"
    echo -e "  Status:  ${YELLOW}DISABLED${NC} (TELEGRAM_BOT_TOKEN 미설정)"
    echo ""
fi
check_service "Client (Vite)"       "client" 5173 "http://localhost:5173"

echo "========================================="
echo -e "  Start:  ${BLUE}./scripts/start.sh [local|testnet|production] [all|anvil|deploy|server|client]${NC}"
echo -e "  Deploy: ${BLUE}./scripts/deploy.sh [local|testnet|production]${NC}"
echo -e "  Stop:   ${BLUE}./scripts/stop.sh  [all|anvil|server|client]${NC}"
echo "========================================="
echo ""
