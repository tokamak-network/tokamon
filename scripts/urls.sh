#!/bin/bash
#
# Tokamon Service URL Checker
# Usage: ./scripts/urls.sh
#

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Detect public IP
PUBLIC_IP=$(curl -s --connect-timeout 3 https://checkip.amazonaws.com 2>/dev/null \
    || curl -s --connect-timeout 3 https://ifconfig.me 2>/dev/null)
PRIVATE_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "========================================="
echo "  Tokamon Service URL Checker"
echo "========================================="
echo ""
echo -e "  Private IP:  ${CYAN}${PRIVATE_IP:-unknown}${NC}"
echo -e "  Public IP:   ${CYAN}${PUBLIC_IP:-unknown}${NC}"
echo ""

check_url() {
    local name=$1 port=$2
    local bind_addr

    echo -e "${BOLD}--- $name (port $port) ---${NC}"

    # Check if port is listening
    bind_addr=$(ss -tlnp 2>/dev/null | grep ":${port} " | awk '{print $4}' | head -1)

    if [ -z "$bind_addr" ]; then
        echo -e "  Status:    ${RED}NOT LISTENING${NC}"
        echo ""
        return
    fi

    echo -e "  Bind:      ${GREEN}${bind_addr}${NC}"

    # Check localhost access
    if curl -s --connect-timeout 2 -o /dev/null "http://127.0.0.1:${port}"; then
        echo -e "  Local:     ${GREEN}OK${NC}  http://127.0.0.1:${port}"
    else
        echo -e "  Local:     ${RED}FAIL${NC}  http://127.0.0.1:${port}"
    fi

    # Check if bound to 0.0.0.0 (external accessible)
    if echo "$bind_addr" | grep -qE "0\.0\.0\.0|\*"; then
        # Internal network
        if [ -n "$PRIVATE_IP" ]; then
            if curl -s --connect-timeout 2 -o /dev/null "http://${PRIVATE_IP}:${port}"; then
                echo -e "  Internal:  ${GREEN}OK${NC}  http://${PRIVATE_IP}:${port}"
            else
                echo -e "  Internal:  ${RED}FAIL${NC}  http://${PRIVATE_IP}:${port}"
            fi
        fi

        # Public access
        if [ -n "$PUBLIC_IP" ]; then
            if curl -s --connect-timeout 3 -o /dev/null "http://${PUBLIC_IP}:${port}"; then
                echo -e "  Public:    ${GREEN}OK${NC}  http://${PUBLIC_IP}:${port}"
            else
                echo -e "  Public:    ${YELLOW}BLOCKED${NC}  http://${PUBLIC_IP}:${port}  (check security group)"
            fi
        fi
    else
        echo -e "  External:  ${YELLOW}UNAVAILABLE${NC}  (bound to ${bind_addr}, not 0.0.0.0)"
    fi

    echo ""
}

check_url "Anvil (Blockchain RPC)" 8999
check_url "Server (Express API)"   3001
check_url "Client (Vite Web)"      5173

# Chain info
CHAIN_ID=$(curl -s --connect-timeout 2 -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    http://127.0.0.1:8999 2>/dev/null | grep -oP '"result"\s*:\s*"\K[^"]+')

if [ -n "$CHAIN_ID" ]; then
    CHAIN_ID_DEC=$((CHAIN_ID))
    echo -e "${BOLD}--- Chain Info ---${NC}"
    echo -e "  Chain ID:  ${CYAN}${CHAIN_ID_DEC}${NC} (${CHAIN_ID})"
    echo ""
fi

echo "========================================="
echo ""
