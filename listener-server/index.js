const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { init, onTelegramClaimed, onDeviceClaimed } = require('./blockchain');
const blockchain = require('./blockchain');
const { initBot, sendClaimNotification } = require('./telegram-bot');
const deviceRoutes = require('./routes/device');
const telegramRoutes = require('./routes/telegram');
const { hashTelegramId, isValidTelegramUsername } = require('./utils');
const { saveWalletTelegramLink, saveTelegramHashMap } = require('./firebase-admin');

const DB_PATH = process.env.DATABASE_PATH
  ? path.isAbsolute(process.env.DATABASE_PATH)
    ? process.env.DATABASE_PATH
    : path.join(__dirname, '..', process.env.DATABASE_PATH)
  : path.join(__dirname, 'telegram.db');

function initTelegramDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
      db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS telegram_link_tokens (
            token TEXT PRIMARY KEY,
            telegram_username TEXT NOT NULL,
            chat_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            used BOOLEAN DEFAULT 0
          )
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_telegram_tokens_expires ON telegram_link_tokens(expires_at)`);
        db.run(`
          CREATE TABLE IF NOT EXISTS telegram_verify_codes (
            code TEXT PRIMARY KEY,
            telegram_username TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            verified BOOLEAN DEFAULT 0
          )
        `);
        db.run(`
          CREATE TABLE IF NOT EXISTS telegram_users (
            username TEXT PRIMARY KEY,
            chat_id INTEGER NOT NULL,
            first_seen INTEGER NOT NULL,
            last_seen INTEGER NOT NULL
          )
        `);
        db.run(`
          CREATE TABLE IF NOT EXISTS telegram_wallet_links (
            wallet_address TEXT PRIMARY KEY,
            telegram_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
        `);
        db.run(`
          CREATE TABLE IF NOT EXISTS telegram_hash_username (
            telegram_hash TEXT PRIMARY KEY,
            telegram_username TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);
        db.run(`
          CREATE TABLE IF NOT EXISTS device_verify_codes (
            code TEXT PRIMARY KEY,
            device_hash TEXT NOT NULL,
            spot_id INTEGER NOT NULL,
            wallet_address TEXT,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            verified BOOLEAN DEFAULT 0,
            attempts INTEGER DEFAULT 0
          )
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_device_codes_expires ON device_verify_codes(expires_at)`);
        // 기존 테이블에 새 컬럼 추가 (이미 존재하면 무시)
        db.run(`ALTER TABLE device_verify_codes ADD COLUMN wallet_address TEXT`, () => {});
        db.run(`ALTER TABLE device_verify_codes ADD COLUMN attempts INTEGER DEFAULT 0`, () => {});
        console.log('✅ DB 초기화 완료:', DB_PATH);
        resolve(db);
      });
    });
  });
}

// 필수 환경변수 시작 시 검증
if (!process.env.TELEGRAM_HASH_SALT) {
  console.error('❌ TELEGRAM_HASH_SALT 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
  process.exit(1);
}
if (!process.env.DEVICE_HASH_SALT) {
  console.error('❌ DEVICE_HASH_SALT 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
  process.exit(1);
}
if (process.env.DEVICE_HASH_SALT === process.env.TELEGRAM_HASH_SALT) {
  console.warn('⚠️  DEVICE_HASH_SALT와 TELEGRAM_HASH_SALT가 동일합니다. 보안을 위해 서로 다른 값을 사용하세요.');
}

const LISTENER_PORT = process.env.PORT || process.env.LISTENER_PORT || 3001;

function startHttpServer(db) {
  const app = express();

  const IS_PROD = process.env.NODE_ENV === 'production';

  // 프록시 뒤에서 실행 시 X-Forwarded-For 신뢰
  if (IS_PROD) {
    app.set('trust proxy', 1);
  }

  // 프로덕션 HTTPS 강제 (API는 리다이렉트 대신 차단 — HTTP 요청 시 평문 노출 방지)
  if (IS_PROD) {
    app.use((req, res, next) => {
      if (req.headers['x-forwarded-proto'] !== 'https') {
        if (req.path.startsWith('/api/')) {
          return res.status(403).json({ error: 'HTTPS required' });
        }
        return res.redirect(301, 'https://' + req.headers.host + req.url);
      }
      next();
    });
  }

  // [#5] CORS 설정 (모바일 앱 + 허용된 오리진)
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').filter(Boolean);
  app.use(cors({
    origin: allowedOrigins.length > 0
      ? (origin, cb) => {
          // 모바일 앱은 origin이 없으므로 허용
          if (!origin || allowedOrigins.includes(origin)) {
            cb(null, true);
          } else {
            cb(new Error('CORS 차단'));
          }
        }
      : IS_PROD
        ? (origin, cb) => {
            // 프로덕션에서 origin 미설정 시 모바일 앱(origin 없음)만 허용
            if (!origin) {
              cb(null, true);
            } else {
              cb(new Error('CORS 차단: 허용된 오리진을 설정해주세요'));
            }
          }
        : true, // 개발 환경에서만 모든 요청 허용
  }));

  // 보안 헤더
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (IS_PROD) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // [#8] JSON body size 명시적 제한
  app.use(express.json({ limit: '10kb' }));

  // Rate Limiting: device_id 기준으로 각 엔드포인트에서 개별 적용 (routes/device.js)

  // 디바이스 클레임 라우트
  app.use('/api/device', deviceRoutes(db));

  // 텔레그램 라우트 (verify-token, link-wallet, username 등)
  app.use('/api/telegram', telegramRoutes(db));

  app.listen(LISTENER_PORT, () => {
    console.log(`[Listener HTTP] 포트 ${LISTENER_PORT}에서 실행 중`);
  });
}

async function syncTelegramDataToFirestore(db) {
  return new Promise((resolve) => {
    let count = 0;
    // 1. wallet → hash 매핑
    db.all('SELECT wallet_address, telegram_hash FROM telegram_wallet_links', async (err, rows) => {
      if (!err && rows && rows.length > 0) {
        for (const row of rows) {
          await saveWalletTelegramLink(row.wallet_address, row.telegram_hash);
          count++;
        }
      }
      // 2. hash → username 매핑
      db.all('SELECT telegram_hash, telegram_username FROM telegram_hash_username', async (err2, rows2) => {
        if (!err2 && rows2 && rows2.length > 0) {
          for (const row of rows2) {
            await saveTelegramHashMap(row.telegram_hash, row.telegram_username);
            count++;
          }
        }
        if (count > 0) console.log(`[동기화] SQLite → Firestore: ${count}건 동기화 완료`);
        resolve();
      });
    });
  });
}

async function main() {
  console.log('[Listener] 블록체인 이벤트 리스너 시작');
  try {
    const db = await initTelegramDb();
    await init();

    // SQLite → Firestore 동기화 (에뮬레이터 재시작 시 데이터 복구)
    await syncTelegramDataToFirestore(db);

    initBot(db);

    // TelegramClaimed 이벤트 → 텔레그램 알림 자동 전송
    onTelegramClaimed(async ({ username, spotName, reward, bonus, telegramHash }) => {
      const balance = await blockchain.getTelegramBalance(telegramHash);
      const linkedWallet = await blockchain.getTelegramLinkedWallet(telegramHash);
      const zeroAddress = '0x0000000000000000000000000000000000000000';
      const hasLinkedWallet = linkedWallet && linkedWallet !== zeroAddress;
      await sendClaimNotification(username, spotName, reward, bonus, balance, hasLinkedWallet ? linkedWallet : null);
      console.log(`[알림] @${username}에게 텔레그램 알림 전송 완료`);
    });

    startHttpServer(db);
    console.log('[Listener] 실행 중... (체인 리스너 + 텔레그램 봇 + HTTP, Ctrl+C 종료)');
  } catch (err) {
    console.error('[Listener] 시작 실패:', err.message);
    process.exit(1);
  }
}

main();
