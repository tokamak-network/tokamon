// 텔레그램 연결 확인 스크립트
const blockchain = require('./blockchain');
const { hashTelegramId } = require('./utils');

async function checkLink(telegramUsername) {
  try {
    await blockchain.init();
    
    const telegramHash = hashTelegramId(telegramUsername);
    console.log(`\n📱 텔레그램: @${telegramUsername}`);
    console.log(`🔐 해시: ${telegramHash}\n`);
    
    const linkedWallet = await blockchain.getTelegramLinkedWallet(telegramHash);
    const balance = await blockchain.getTelegramBalance(telegramHash);
    
    console.log(`💼 연결된 지갑: ${linkedWallet}`);
    console.log(`💰 텔레그램 잔액: ${balance.toFixed(4)} TON\n`);
    
    if (linkedWallet && linkedWallet !== '0x0000000000000000000000000000000000000000') {
      console.log('✅ 지갑이 연결되어 있습니다!');
    } else {
      console.log('❌ 연결된 지갑이 없습니다.');
    }
    
  } catch (err) {
    console.error('❌ 에러:', err.message);
  }
  
  process.exit(0);
}

// 사용법: node check-telegram-link.js username
const username = process.argv[2];

if (!username) {
  console.log('사용법: node check-telegram-link.js <telegram_username>');
  console.log('예시: node check-telegram-link.js myusername');
  process.exit(1);
}

checkLink(username);
