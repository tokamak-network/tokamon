const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');
const blockchain = require('./blockchain');
const { hashTelegramId, isValidEthAddress } = require('./utils');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEB_URL = process.env.WEB_URL || 'http://localhost:5173';

let bot = null;
let db = null;

// chat_id 캐시 (username → chat_id)
const chatIdCache = new Map();

// 사용자 상태 추적 (username → { state, data })
const userStates = new Map();

// 봇 초기화
function initBot(database) {
  if (!BOT_TOKEN) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN이 설정되지 않았습니다. 텔레그램 봇 기능이 비활성화됩니다.');
    return;
  }

  db = database;
  bot = new TelegramBot(BOT_TOKEN, { polling: true });

  console.log('✅ 텔레그램 봇 초기화 완료');

  // 봇이 메시지를 받을 때마다 캐시 및 DB 업데이트
  bot.on('message', (msg) => {
    if (msg.from.username) {
      const username = msg.from.username;
      const chatId = msg.chat.id;
      const now = Math.floor(Date.now() / 1000);
      
      // 캐시 업데이트
      chatIdCache.set(username, chatId);
      
      // DB에 영구 저장
      db.run(`
        INSERT INTO telegram_users (username, chat_id, first_seen, last_seen)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username) 
        DO UPDATE SET chat_id = ?, last_seen = ?
      `, [username, chatId, now, now, chatId, now], (err) => {
        if (err) {
          console.error('chat_id DB 저장 실패:', err);
        } else {
          console.log(`✅ @${username}의 chat_id 저장: ${chatId}`);
        }
      });
    }
  });

  // /start 명령어
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    let message = `안녕하세요! Tokamon 봇입니다.\n\n`;
    
    if (username) {
      message += `📍 매장에서 @${username} 입력하여 TON을 받으세요\n`;
      message += `💰 잔액 확인: /balance\n`;
      message += `🔗 지갑 연결: /link\n`;
      message += `❓ 도움말: /help`;
    } else {
      message += `❌ 텔레그램 username을 먼저 설정해주세요.\n\n`;
      message += `설정 방법:\n`;
      message += `1. 설정(Settings) → 프로필 편집\n`;
      message += `2. Username 입력\n`;
      message += `3. 다시 /start 입력`;
    }
    
    bot.sendMessage(chatId, message);
  });

  // /help 명령어
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    const message = `
📖 Tokamon 봇 사용법

/start - 시작하기
/balance - 현재 잔액 조회
/link - 지갑 연결하기
/change - 연결된 지갑 주소 변경
/cancel - 현재 작업 취소
/help - 도움말

💡 매장에서 TON 받는 방법:
1. 매장 키오스크에서 @username 입력
2. "TON 받기" 버튼 클릭하여 적립!
3. 텔레그램으로 알림 수신

🔗 지갑으로 이전하는 방법:
1. /link 명령어 입력
2. 이더리움 주소 입력 (0x...)
3. 완료!
    `;
    
    bot.sendMessage(chatId, message);
  });

  // /balance 명령어
  bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!username) {
      return bot.sendMessage(chatId, '❌ 텔레그램 username을 설정해주세요');
    }
    
    try {
      const telegramHash = hashTelegramId(username);
      const balance = await blockchain.getTelegramBalance(telegramHash);
      const linkedWallet = await blockchain.getTelegramLinkedWallet(telegramHash);
      
      let message = `💰 현재 잔액: ${balance.toFixed(2)} TON\n\n`;
      
      if (linkedWallet && linkedWallet !== '0x0000000000000000000000000000000000000000') {
        message += `🔗 연결된 지갑: ${linkedWallet.slice(0, 6)}...${linkedWallet.slice(-4)}`;
      } else {
        message += `지갑에 연결하려면 /link 입력`;
      }
      
      bot.sendMessage(chatId, message);
    } catch (err) {
      console.error('잔액 조회 에러:', err);
      bot.sendMessage(chatId, '❌ 잔액 조회 실패: ' + err.message);
    }
  });

  // /cancel 명령어
  bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!username) {
      return bot.sendMessage(chatId, '❌ 텔레그램 username을 설정해주세요');
    }
    
    if (userStates.has(username)) {
      userStates.delete(username);
      bot.sendMessage(chatId, '✅ 작업이 취소되었습니다.');
    } else {
      bot.sendMessage(chatId, '현재 진행 중인 작업이 없습니다.');
    }
  });

  // 일반 메시지 핸들러 (이더리움 주소 입력)
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    const text = msg.text;
    
    // 명령어는 이미 처리되었으므로 스킵
    if (!text || text.startsWith('/')) {
      return;
    }
    
    if (!username) {
      return;
    }
    
    const userState = userStates.get(username);
    
    // 지갑 주소 입력 대기 중인 경우
    if (userState && userState.state === 'WAITING_FOR_ADDRESS') {
      const address = text.trim();
      
      // 이더리움 주소 검증
      if (!isValidEthAddress(address)) {
        return bot.sendMessage(chatId, `
❌ 올바르지 않은 이더리움 주소입니다.

주소는 0x로 시작하고 40자리 16진수여야 합니다.
예시: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

다시 입력하거나 /cancel로 취소하세요.
        `);
      }
      
      try {
        // 텔레그램 해시 생성
        const telegramHash = hashTelegramId(username);
        
        // 현재 잔액 확인
        const currentBalance = await blockchain.getTelegramBalance(telegramHash);
        
        // 블록체인에 연결
        bot.sendMessage(chatId, '⏳ 지갑을 연결하는 중입니다...');
        
        const result = await blockchain.linkTelegramToWallet(telegramHash, address);
        
        // DB에 매핑 저장
        const now = Math.floor(Date.now() / 1000);
        
        // 1. 지갑 <-> 텔레그램 해시 매핑
        db.run(`
          INSERT OR REPLACE INTO telegram_wallet_links (wallet_address, telegram_hash, created_at)
          VALUES (?, ?, ?)
        `, [address.toLowerCase(), telegramHash, now], (err) => {
          if (err) {
            console.error('지갑-해시 매핑 저장 실패:', err);
          } else {
            console.log(`✅ 지갑-해시 매핑 저장: ${address} <-> ${telegramHash}`);
          }
        });
        
        // 2. 텔레그램 해시 <-> username 매핑
        db.run(`
          INSERT OR REPLACE INTO telegram_hash_username (telegram_hash, telegram_username, created_at, updated_at)
          VALUES (?, ?, ?, ?)
        `, [telegramHash, username, now, now], (err) => {
          if (err) {
            console.error('해시-username 매핑 저장 실패:', err);
          } else {
            console.log(`✅ 해시-username 매핑 저장: ${telegramHash} <-> @${username}`);
          }
        });
        
        // 상태 초기화
        userStates.delete(username);
        
        // 성공 메시지
        let message = `✅ 지갑 연결 완료!\n\n`;
        message += `💼 연결된 지갑: ${address.slice(0, 6)}...${address.slice(-4)}\n`;
        
        if (result.transferredAmount > 0) {
          message += `💰 이전된 잔액: ${result.transferredAmount.toFixed(2)} TON\n\n`;
          message += `이제 해당 지갑으로 로그인하여 사용하실 수 있습니다!`;
        } else {
          message += `\n현재 이전할 잔액이 없습니다.`;
        }
        
        bot.sendMessage(chatId, message);
        
      } catch (err) {
        console.error('지갑 연결 에러:', err);
        userStates.delete(username);
        bot.sendMessage(chatId, `❌ 지갑 연결 실패: ${err.message}\n\n다시 시도하려면 /link를 입력하세요.`);
      }
    }
  });

  // /link 명령어
  bot.onText(/\/link/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!username) {
      return bot.sendMessage(chatId, '❌ 텔레그램 username을 먼저 설정해주세요');
    }
    
    try {
      // 이미 연결되었는지 확인
      const telegramHash = hashTelegramId(username);
      const linkedWallet = await blockchain.getTelegramLinkedWallet(telegramHash);
      
      if (linkedWallet && linkedWallet !== '0x0000000000000000000000000000000000000000') {
        const balance = await blockchain.getTelegramBalance(telegramHash);
        
        return bot.sendMessage(chatId, `
✅ 이미 지갑이 연결되어 있습니다!

💼 연결된 지갑: ${linkedWallet.slice(0, 6)}...${linkedWallet.slice(-4)}
💰 현재 잔액: ${balance.toFixed(2)} TON

지갑 주소를 변경하려면 /change 명령어를 사용하세요.
        `);
      }
      
      // 사용자 상태를 "지갑 주소 입력 대기"로 설정
      userStates.set(username, { state: 'WAITING_FOR_ADDRESS' });
      
      bot.sendMessage(chatId, `
🔗 지갑 연결을 시작합니다!

이더리움 주소를 입력해주세요.
(형식: 0x로 시작하는 40자리 주소)

예시: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

취소하려면 /cancel 입력
      `);
    } catch (err) {
      console.error('링크 생성 에러:', err);
      bot.sendMessage(chatId, '❌ 링크 생성 실패: ' + err.message);
    }
  });

  // /change 명령어 (지갑 주소 변경)
  bot.onText(/\/change/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!username) {
      return bot.sendMessage(chatId, '❌ 텔레그램 username을 먼저 설정해주세요');
    }
    
    try {
      const telegramHash = hashTelegramId(username);
      const linkedWallet = await blockchain.getTelegramLinkedWallet(telegramHash);
      
      if (!linkedWallet || linkedWallet === '0x0000000000000000000000000000000000000000') {
        return bot.sendMessage(chatId, `
❌ 연결된 지갑이 없습니다.

먼저 /link 명령어로 지갑을 연결해주세요.
        `);
      }
      
      const balance = await blockchain.getTelegramBalance(telegramHash);
      
      // 사용자 상태를 "지갑 주소 변경 대기"로 설정
      userStates.set(username, { state: 'WAITING_FOR_ADDRESS', isChange: true });
      
      bot.sendMessage(chatId, `
🔄 지갑 주소 변경

현재 연결된 지갑: ${linkedWallet.slice(0, 6)}...${linkedWallet.slice(-4)}
현재 잔액: ${balance.toFixed(2)} TON

새로운 이더리움 주소를 입력해주세요.
(형식: 0x로 시작하는 40자리 주소)

⚠️ 주의: 잔액이 새 지갑으로 자동 이전됩니다.

취소하려면 /cancel 입력
      `);
    } catch (err) {
      console.error('지갑 변경 에러:', err);
      bot.sendMessage(chatId, '❌ 지갑 변경 실패: ' + err.message);
    }
  });
}

// 연결 토큰 생성
function generateLinkToken(telegramUsername, chatId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 600; // 10분 유효
  
  db.run(
    'INSERT INTO telegram_link_tokens (token, telegram_username, chat_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    [token, telegramUsername, chatId, now, expiresAt]
  );
  
  return token;
}

// chat_id 조회 (DB에서)
async function getChatIdByUsername(username) {
  // 캐시 확인
  if (chatIdCache.has(username)) {
    return chatIdCache.get(username);
  }
  
  // DB에서 조회 (telegram_users 테이블 우선)
  return new Promise((resolve) => {
    db.get(
      'SELECT chat_id FROM telegram_users WHERE username = ?',
      [username],
      (err, row) => {
        if (!err && row) {
          chatIdCache.set(username, row.chat_id);
          console.log(`✅ DB에서 @${username}의 chat_id 찾음: ${row.chat_id}`);
          resolve(row.chat_id);
        } else {
          // telegram_users에 없으면 telegram_link_tokens에서 조회
          db.get(
            'SELECT chat_id FROM telegram_link_tokens WHERE telegram_username = ? ORDER BY created_at DESC LIMIT 1',
            [username],
            (err2, row2) => {
              if (!err2 && row2) {
                chatIdCache.set(username, row2.chat_id);
                resolve(row2.chat_id);
              } else {
                console.log(`❌ @${username}의 chat_id를 찾을 수 없음`);
                resolve(null);
              }
            }
          );
        }
      }
    );
  });
}

// 클레임 알림 전송
async function sendClaimNotification(telegramUsername, spotName, reward, bonus, balance) {
  if (!bot) return;
  
  const chatId = await getChatIdByUsername(telegramUsername);
  if (!chatId) {
    console.log(`텔레그램 알림 실패: @${telegramUsername}의 chat_id를 찾을 수 없음`);
    return;
  }
  
  let message = `✅ [${spotName}]에서 ${reward} TON 적립!`;
  
  if (bonus > 0) {
    message += `\n🎁 스탬프 보너스: ${bonus} TON!`;
  }
  
  message += `\n💰 현재 잔액: ${balance.toFixed(2)} TON`;
  message += `\n\n지갑에 연결하려면 /link 입력`;
  
  try {
    await bot.sendMessage(chatId, message);
  } catch (err) {
    console.error('텔레그램 알림 전송 실패:', err.message);
  }
}

// 연결 완료 알림 함수
async function notifyLinkComplete(chatId, wallet, transferredAmount) {
  if (!bot) return;
  
  try {
    await bot.sendMessage(chatId, `
✅ 지갑 연결 완료!

💼 지갑 주소: ${wallet}
💰 이전된 잔액: ${transferredAmount.toFixed(2)} TON

이제 Tokamon 웹에서 해당 지갑으로 로그인하여 사용하실 수 있습니다!
    `);
  } catch (err) {
    console.error('연결 완료 알림 전송 실패:', err.message);
  }
}

// 인증 코드 전송 함수
async function sendVerificationCode(telegramUsername, code) {
  if (!bot) {
    console.log('봇이 초기화되지 않음');
    return false;
  }
  
  const chatId = await getChatIdByUsername(telegramUsername);
  if (!chatId) {
    console.log(`텔레그램 알림 실패: @${telegramUsername}의 chat_id를 찾을 수 없음`);
    return false;
  }
  
  try {
    await bot.sendMessage(chatId, `
🔐 Tokamon 인증 코드

인증 코드: ${code}

키오스크에 위 코드를 입력해주세요.
(3분간 유효)
    `);
    console.log(`인증 코드 전송 완료: @${telegramUsername}`);
    return true;
  } catch (err) {
    console.error('인증 코드 전송 실패:', err.message);
    return false;
  }
}

module.exports = { 
  initBot,
  sendClaimNotification, 
  notifyLinkComplete,
  generateLinkToken,
  sendVerificationCode,
};
