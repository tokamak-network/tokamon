#!/bin/bash

# Anvil account[0] private key
PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
RPC_URL="http://127.0.0.1:8999"

echo "🔄 Sending ETH to test accounts..."

# 받을 주소 (MetaMask 주소로 변경하세요)
TO_ADDRESS="$1"

if [ -z "$TO_ADDRESS" ]; then
    echo "❌ Usage: ./send-eth.sh <address>"
    echo "Example: ./send-eth.sh 0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
    exit 1
fi

# 전송 전 잔액 확인
BALANCE_BEFORE=$(cast balance "$TO_ADDRESS" --rpc-url "$RPC_URL")
echo "💰 Balance before: $(cast --to-unit $BALANCE_BEFORE ether) ETH"
echo ""

# 1 ETH 전송
echo "Sending 1 ETH to $TO_ADDRESS..."
cast send "$TO_ADDRESS" \
    --value 1ether \
    --private-key "$PRIVATE_KEY" \
    --rpc-url "$RPC_URL"

if [ $? -eq 0 ]; then
    echo "✅ Successfully sent 1 ETH!"
    echo ""

    # 전송 후 잔액 확인
    BALANCE_AFTER=$(cast balance "$TO_ADDRESS" --rpc-url "$RPC_URL")
    echo "💰 Balance after: $(cast --to-unit $BALANCE_AFTER ether) ETH"
else
    echo "❌ Failed to send ETH"
fi
