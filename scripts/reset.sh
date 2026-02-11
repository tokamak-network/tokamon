#!/bin/bash
#
# Tokamon Full Reset
# Usage: ./scripts/reset.sh
#
# 모든 서비스를 종료하고 데이터를 초기화한다.
# 블록체인 상태, DB, 로그가 모두 삭제되므로 start.sh all로 재시작해야 한다.
#

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }

echo ""
echo "========================================="
echo "  Tokamon Service Manager — RESET"
echo "========================================="
echo ""
warn "블록체인 상태, DB, 로그가 모두 삭제됩니다."
read -p "계속하시겠습니까? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "취소됨."
    exit 0
fi

# 1. 서비스 종료
info "서비스 종료 중..."
"$PROJECT_ROOT/scripts/stop.sh" all

# 2. 블록체인 상태 삭제
if [ -f "$PROJECT_ROOT/anvil-state.json" ]; then
    rm "$PROJECT_ROOT/anvil-state.json"
    ok "anvil-state.json 삭제"
fi

# 3. DB 삭제
if [ -f "$PROJECT_ROOT/server/tokamon.db" ]; then
    rm "$PROJECT_ROOT/server/tokamon.db"
    ok "tokamon.db 삭제"
fi

# 4. 메타데이터 초기화
if [ -f "$PROJECT_ROOT/server/spot-metadata.json" ]; then
    rm "$PROJECT_ROOT/server/spot-metadata.json"
    ok "spot-metadata.json 삭제"
fi

# 5. 컨트랙트 주소 삭제
if [ -f "$PROJECT_ROOT/server/contract-address.json" ]; then
    rm "$PROJECT_ROOT/server/contract-address.json"
    ok "contract-address.json 삭제"
fi

# 6. 로그 삭제
if [ -d "$LOG_DIR" ]; then
    rm -rf "$LOG_DIR"
    ok "logs/ 삭제"
fi

echo ""
ok "초기화 완료. ./scripts/start.sh 로 처음부터 다시 시작하세요."
echo ""
