/**
 * 데모용 초기 데이터 생성 스크립트
 *
 * 서울의 주요 매장에 토카몬 스팟을 생성합니다.
 * 스탬프 시스템 포함.
 */

const blockchain = require('./blockchain');

const demoSpots = [
  {
    name: '경복궁 카페',
    description: '조선의 대표 궁궐 앞 카페! 방문하고 토큰 받아가세요',
    lat: 37.5796,
    lng: 126.9770,
    deposit: 30,
    reward: 0.5,
    stamp_goal: 10,
    stamp_bonus: 5,
    cooldown: 86400, // 24시간
  },
  {
    name: '남산타워 레스토랑',
    description: '서울 야경 맛집! 단골 되면 보너스 TON',
    lat: 37.5512,
    lng: 126.9882,
    deposit: 50,
    reward: 1,
    stamp_goal: 5,
    stamp_bonus: 10,
    cooldown: 43200, // 12시간
  },
  {
    name: '강남역 치킨집',
    description: '바삭한 치킨과 함께 TON도 받아가세요',
    lat: 37.4979,
    lng: 127.0276,
    deposit: 20,
    reward: 0.3,
    stamp_goal: 7,
    stamp_bonus: 3,
    cooldown: 86400, // 24시간
  },
  {
    name: '홍대 수제버거',
    description: '젊음의 거리 수제버거! 스탬프 모아 보너스 받기',
    lat: 37.5563,
    lng: 126.9235,
    deposit: 25,
    reward: 0.4,
    stamp_goal: 8,
    stamp_bonus: 4,
    cooldown: 86400, // 24시간
  },
  {
    name: '광화문 서점',
    description: '책과 커피가 있는 공간, 방문 보상까지!',
    lat: 37.5720,
    lng: 126.9769,
    deposit: 35,
    reward: 0.6,
    stamp_goal: 10,
    stamp_bonus: 6,
    cooldown: 86400, // 24시간
  },
];

async function createDemoData() {
  console.log('\n데모 데이터 생성 시작\n');

  try {
    await blockchain.init();
    console.log('블록체인 연결 완료\n');

    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8999');
    const accounts = await provider.listAccounts();
    const creatorAddress = accounts[1].address;

    console.log(`점주 주소: ${creatorAddress}\n`);

    // 점주에게 잔액 제공
    const totalDeposit = demoSpots.reduce((sum, spot) => sum + spot.deposit, 0);
    console.log(`Faucet: ${totalDeposit + 100} TON 지급...`);
    await blockchain.deposit(creatorAddress, totalDeposit + 100);
    const balance = await blockchain.getBalance(creatorAddress);
    console.log(`현재 잔액: ${balance} TON\n`);

    console.log('스팟은 클라이언트에서 createSpotSelf로 생성해주세요.\n');

    const finalBalance = await blockchain.getBalance(creatorAddress);
    console.log(`점주 최종 잔액: ${finalBalance} TON\n`);

    // 테스트용 사용자에게 토큰 지급
    console.log('테스트 사용자들에게 토큰 지급 중...');
    for (let i = 2; i <= 5; i++) {
      const userAddress = accounts[i].address;
      await blockchain.deposit(userAddress, 10);
      console.log(`  User ${i}: ${userAddress.slice(0, 10)}... → 10 TON`);
    }
    console.log('\n테스트 사용자 설정 완료\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('데모 데이터 생성 완료!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n오류 발생:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  createDemoData().then(() => {
    console.log('완료!\n');
    process.exit(0);
  });
}

module.exports = { createDemoData, demoSpots };
