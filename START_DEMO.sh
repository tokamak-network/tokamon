#!/bin/bash

echo "🎮 Tokamon 데모 시작 스크립트"
echo "================================"

# 색상 정의
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 포트 체크 함수
check_port() {
    local port=$1
    if lsof -ti:$port > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# 1. Ganache 체크 및 시작
echo -e "\n${BLUE}1. Ganache 체크...${NC}"
if check_port 8999; then
    echo -e "${GREEN}✓ Ganache가 이미 실행 중입니다 (포트 8999)${NC}"
else
    echo -e "${YELLOW}Ganache를 시작합니다...${NC}"
    echo -e "${RED}주의: Ganache는 별도 터미널에서 실행해야 합니다.${NC}"
    echo -e "${YELLOW}다음 명령어를 새 터미널에서 실행하세요:${NC}"
    echo -e "  ${BLUE}npm run ganache${NC}"
    echo ""
    read -p "Ganache를 시작했으면 Enter를 누르세요..."
fi

# 2. 메타데이터 초기화
echo -e "\n${BLUE}2. 서버 메타데이터 초기화...${NC}"
METADATA_FILE="server/spot-metadata.json"
if [ -f "$METADATA_FILE" ]; then
    echo '{}' > "$METADATA_FILE"
    echo -e "${GREEN}✓ 메타데이터 파일 초기화 완료${NC}"
else
    echo '{}' > "$METADATA_FILE"
    echo -e "${GREEN}✓ 메타데이터 파일 생성 완료${NC}"
fi

# 3. 컨트랙트 배포
echo -e "\n${BLUE}3. 스마트 컨트랙트 배포...${NC}"
npm run deploy
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ 컨트랙트 배포 완료${NC}"
else
    echo -e "${RED}✗ 컨트랙트 배포 실패${NC}"
    exit 1
fi

# 4. 서버 시작 확인
echo -e "\n${BLUE}4. 서버 시작...${NC}"
if check_port 3001; then
    echo -e "${YELLOW}⚠ 서버가 이미 실행 중입니다 (포트 3001)${NC}"
    read -p "서버를 재시작하시겠습니까? (y/N): " restart
    if [ "$restart" = "y" ] || [ "$restart" = "Y" ]; then
        kill $(lsof -ti:3001) 2>/dev/null
        sleep 2
    fi
fi

if ! check_port 3001; then
    echo -e "${YELLOW}서버를 새 터미널에서 실행하세요:${NC}"
    echo -e "  ${BLUE}npm run server${NC}"
    echo ""
fi

# 5. 클라이언트 시작 확인
echo -e "\n${BLUE}5. 클라이언트 시작...${NC}"
if check_port 5173; then
    echo -e "${YELLOW}⚠ 클라이언트가 이미 실행 중입니다 (포트 5173)${NC}"
else
    echo -e "${YELLOW}클라이언트를 새 터미널에서 실행하세요:${NC}"
    echo -e "  ${BLUE}npm run client${NC}"
    echo ""
fi

# 6. 상태 확인
echo -e "\n${BLUE}6. 서비스 상태 확인${NC}"
echo "================================"

if check_port 8999; then
    echo -e "${GREEN}✓ Ganache (8999)${NC}"
else
    echo -e "${RED}✗ Ganache (8999)${NC}"
fi

if check_port 3001; then
    echo -e "${GREEN}✓ Server (3001)${NC}"
else
    echo -e "${YELLOW}○ Server (3001) - 시작 필요${NC}"
fi

if check_port 5173; then
    echo -e "${GREEN}✓ Client (5173)${NC}"
else
    echo -e "${YELLOW}○ Client (5173) - 시작 필요${NC}"
fi

# 7. 데모 가이드
echo -e "\n${BLUE}📱 데모 접속 정보${NC}"
echo "================================"
echo -e "클라이언트: ${GREEN}http://localhost:5173${NC}"
echo -e "서버 API: ${GREEN}http://localhost:3001${NC}"
echo -e "스팟 목록: ${GREEN}http://localhost:3001/api/spots${NC}"

echo -e "\n${BLUE}🎯 빠른 테스트${NC}"
echo "================================"
echo "1. 스팟 목록 확인:"
echo -e "   ${BLUE}curl http://localhost:3001/api/spots${NC}"
echo ""
echo "2. Faucet 테스트:"
echo -e "   ${BLUE}curl -X POST http://localhost:3001/api/faucet \\
     -H 'Content-Type: application/json' \\
     -d '{\"user_address\": \"0x44F265a7981f03793A6aBa1330F023CFbB66BC06\", \"amount\": 1000}'${NC}"

echo -e "\n${GREEN}데모 준비 완료! 🎉${NC}"
echo -e "${YELLOW}자세한 사용법은 DEMO.md를 참고하세요.${NC}"
