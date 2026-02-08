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

    let message = `Hello! Welcome to the Tokamon Bot.\n\n`;

    if (username) {
      message += `📍 Enter @${username} at the store kiosk to receive TON\n`;
      message += `💰 Check balance: /balance\n`;
      message += `🔗 Link wallet: /link\n`;
      message += `❓ Help: /help`;
    } else {
      message += `❌ Please set up your Telegram username first.\n\n`;
      message += `How to set up:\n`;
      message += `1. Go to Settings → Edit Profile\n`;
      message += `2. Enter a Username\n`;
      message += `3. Come back and type /start`;
    }

    bot.sendMessage(chatId, message);
  });

  // /help 명령어
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;

    const message = `
📖 Tokamon Bot Guide

/start - Get started
/balance - Check current balance
/link - Link your wallet
/change - Change linked wallet address
/cancel - Cancel current action
/help - Show this help

💡 How to earn TON at a store:
1. Enter your @username at the store kiosk
2. Click "Get TON" to earn rewards!
3. Receive notification via Telegram

🔗 How to withdraw to your wallet:
1. Type /link command
2. Enter your Ethereum address (0x...)
3. Done!
    `;

    bot.sendMessage(chatId, message);
  });

  // /balance 명령어
  bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    if (!username) {
      return bot.sendMessage(chatId, '❌ Please set up your Telegram username first.');
    }

    try {
      const telegramHash = hashTelegramId(username);
      const balance = await blockchain.getTelegramBalance(telegramHash);
      const linkedWallet = await blockchain.getTelegramLinkedWallet(telegramHash);

      let message = `💰 Current balance: ${balance.toFixed(2)} TON\n\n`;

      if (linkedWallet && linkedWallet !== '0x0000000000000000000000000000000000000000') {
        message += `🔗 Linked wallet: ${linkedWallet.slice(0, 6)}...${linkedWallet.slice(-4)}`;
      } else {
        message += `Type /link to connect your wallet`;
      }

      bot.sendMessage(chatId, message);
    } catch (err) {
      console.error('잔액 조회 에러:', err);
      bot.sendMessage(chatId, '❌ Failed to check balance: ' + err.message);
    }
  });

  // /cancel 명령어
  bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    if (!username) {
      return bot.sendMessage(chatId, '❌ Please set up your Telegram username first.');
    }

    if (userStates.has(username)) {
      userStates.delete(username);
      bot.sendMessage(chatId, '✅ Action cancelled.');
    } else {
      bot.sendMessage(chatId, 'No action in progress.');
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
❌ Invalid Ethereum address.

Address must start with 0x followed by 40 hex characters.
Example: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

Please try again or type /cancel to cancel.
        `);
      }

      try {
        // 텔레그램 해시 생성
        const telegramHash = hashTelegramId(username);

        // 현재 잔액 확인
        const currentBalance = await blockchain.getTelegramBalance(telegramHash);

        // 블록체인에 연결
        bot.sendMessage(chatId, '⏳ Linking your wallet...');

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
        let message = `✅ Wallet linked successfully!\n\n`;
        message += `💼 Linked wallet: ${address.slice(0, 6)}...${address.slice(-4)}\n`;

        if (result.transferredAmount > 0) {
          message += `💰 Transferred balance: ${result.transferredAmount.toFixed(2)} TON\n\n`;
        }
        message += `You can now log in with this wallet on Tokamon!`;

        bot.sendMessage(chatId, message);

      } catch (err) {
        console.error('지갑 연결 에러:', err);
        userStates.delete(username);
        bot.sendMessage(chatId, `❌ Failed to link wallet: ${err.message}\n\nType /link to try again.`);
      }
    }
  });

  // /link 명령어
  bot.onText(/\/link/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    if (!username) {
      return bot.sendMessage(chatId, '❌ Please set up your Telegram username first.');
    }

    try {
      // 이미 연결되었는지 확인
      const telegramHash = hashTelegramId(username);
      const linkedWallet = await blockchain.getTelegramLinkedWallet(telegramHash);

      if (linkedWallet && linkedWallet !== '0x0000000000000000000000000000000000000000') {
        const balance = await blockchain.getTelegramBalance(telegramHash);

        return bot.sendMessage(chatId, `
✅ Wallet is already linked!

💼 Linked wallet: ${linkedWallet.slice(0, 6)}...${linkedWallet.slice(-4)}
💰 Current balance: ${balance.toFixed(2)} TON

To change your wallet address, use /change command.
        `);
      }

      // 사용자 상태를 "지갑 주소 입력 대기"로 설정
      userStates.set(username, { state: 'WAITING_FOR_ADDRESS' });

      bot.sendMessage(chatId, `
🔗 Let's link your wallet!

Please enter your Ethereum address.
(Format: starts with 0x, 20-byte address)

Example: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

Type /cancel to cancel
      `);
    } catch (err) {
      console.error('링크 생성 에러:', err);
      bot.sendMessage(chatId, '❌ Failed to start linking: ' + err.message);
    }
  });

  // /change 명령어 (지갑 주소 변경)
  bot.onText(/\/change/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    if (!username) {
      return bot.sendMessage(chatId, '❌ Please set up your Telegram username first.');
    }

    try {
      const telegramHash = hashTelegramId(username);
      const linkedWallet = await blockchain.getTelegramLinkedWallet(telegramHash);

      if (!linkedWallet || linkedWallet === '0x0000000000000000000000000000000000000000') {
        return bot.sendMessage(chatId, `
❌ No wallet linked yet.

Please use /link to connect your wallet first.
        `);
      }

      const balance = await blockchain.getTelegramBalance(telegramHash);

      // 사용자 상태를 "지갑 주소 변경 대기"로 설정
      userStates.set(username, { state: 'WAITING_FOR_ADDRESS', isChange: true });

      bot.sendMessage(chatId, `
🔄 Change Wallet Address

Current wallet: ${linkedWallet.slice(0, 6)}...${linkedWallet.slice(-4)}
Current balance: ${balance.toFixed(2)} TON

Please enter your new Ethereum address.
(Format: starts with 0x, 20-byte address)

Type /cancel to cancel
      `);
    } catch (err) {
      console.error('지갑 변경 에러:', err);
      bot.sendMessage(chatId, '❌ Failed to change wallet: ' + err.message);
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
async function sendClaimNotification(telegramUsername, spotName, reward, bonus, balance, linkedWallet) {
  if (!bot) return;

  const chatId = await getChatIdByUsername(telegramUsername);
  if (!chatId) {
    console.log(`텔레그램 알림 실패: @${telegramUsername}의 chat_id를 찾을 수 없음`);
    return;
  }

  let message = `✅ Earned ${reward} TON at [${spotName}]!`;

  if (bonus > 0) {
    message += `\n🎁 Stamp bonus: ${bonus} TON!`;
  }

  message += `\n💰 Current balance: ${balance.toFixed(2)} TON`;

  if (linkedWallet) {
    message += `\n\n💼 Linked wallet: ${linkedWallet.slice(0, 6)}...${linkedWallet.slice(-4)}`;
    message += `\nTo change wallet, type /change`;
  } else {
    message += `\n\nLink your wallet to withdraw TON.`;
    message += `\nType /link to connect`;
  }

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
✅ Wallet linked successfully!

💼 Wallet: ${wallet}
💰 Transferred balance: ${transferredAmount.toFixed(2)} TON

You can now log in with this wallet on Tokamon!
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
🔐 Tokamon Verification Code

Your code: ${code}

Please enter this code at the kiosk.
(Valid for 3 minutes)
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
