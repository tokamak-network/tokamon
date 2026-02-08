#!/bin/bash

echo "🔄 Tokamon 초기화 스크립트"
echo "================================"

# 색상 정의
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. 실행 중인 프로세스 종료
echo -e "\n${BLUE}1. 실행 중인 프로세스 종료...${NC}"

if lsof -ti:3001 > /dev/null 2>&1; then
    echo -e "${YELLOW}서버 종료 중...${NC}"
    kill $(lsof -ti:3001) 2>/dev/null
    sleep 1
    echo -e "${GREEN}✓ 서버 종료 완료${NC}"
fi

if lsof -ti:5173 > /dev/null 2>&1; then
    echo -e "${YELLOW}클라이언트 종료 중...${NC}"
    kill $(lsof -ti:5173) 2>/dev/null
    sleep 1
    echo -e "${GREEN}✓ 클라이언트 종료 완료${NC}"
fi

# 2. Anvil 종료 (선택)
if lsof -ti:8999 > /dev/null 2>&1; then
    read -p "Anvil(블록체인)도 종료하시겠습니까? (y/N): " kill_anvil
    if [ "$kill_anvil" = "y" ] || [ "$kill_anvil" = "Y" ]; then
        echo -e "${YELLOW}Anvil 종료 중...${NC}"
        pkill -9 anvil 2>/dev/null
        sleep 1
        echo -e "${GREEN}✓ Anvil 종료 완료${NC}"
    fi
fi

# 3. 메타데이터 초기화
echo -e "\n${BLUE}2. 서버 메타데이터 초기화...${NC}"
METADATA_FILE="server/spot-metadata.json"
if [ -f "$METADATA_FILE" ]; then
    # 백업 생성
    cp "$METADATA_FILE" "${METADATA_FILE}.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null
    echo '{}' > "$METADATA_FILE"
    echo -e "${GREEN}✓ 메타데이터 파일 초기화 완료${NC}"
    echo -e "${YELLOW}  (백업 파일 생성됨)${NC}"
else
    echo '{}' > "$METADATA_FILE"
    echo -e "${GREEN}✓ 메타데이터 파일 생성 완료${NC}"
fi

# 4. 데이터베이스 초기화 (선택)
DB_FILE="server/tokamon.db"
if [ -f "$DB_FILE" ]; then
    read -p "데이터베이스(텔레그램 연동 정보)도 초기화하시겠습니까? (y/N): " reset_db
    if [ "$reset_db" = "y" ] || [ "$reset_db" = "Y" ]; then
        cp "$DB_FILE" "${DB_FILE}.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null
        rm "$DB_FILE"
        echo -e "${GREEN}✓ 데이터베이스 초기화 완료${NC}"
        echo -e "${YELLOW}  (백업 파일 생성됨)${NC}"
    fi
fi

# 5. 컨트랙트 재배포 (선택)
echo -e "\n${BLUE}3. 컨트랙트 재배포${NC}"
read -p "컨트랙트를 재배포하시겠습니까? (y/N): " redeploy
if [ "$redeploy" = "y" ] || [ "$redeploy" = "Y" ]; then
    if lsof -ti:8999 > /dev/null 2>&1; then
        npm run deploy
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ 컨트랙트 배포 완료${NC}"
        else
            echo -e "${RED}✗ 컨트랙트 배포 실패${NC}"
        fi
    else
        echo -e "${RED}✗ Anvil이 실행되고 있지 않습니다${NC}"
        echo -e "${YELLOW}먼저 'npm run anvil'로 블록체인을 시작하세요${NC}"
    fi
fi

echo -e "\n${GREEN}초기화 완료! 🎉${NC}"
echo -e "${YELLOW}서버와 클라이언트를 다시 시작하세요:${NC}"
echo -e "  ${BLUE}npm run server${NC}"
echo -e "  ${BLUE}npm run client${NC}"
