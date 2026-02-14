require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { init, onTelegramClaimed } = require('./blockchain');
const blockchain = require('./blockchain');
const { initBot, sendClaimNotification } = require('./telegram-bot');
const { hashTelegramId, isValidTelegramUsername } = require('./utils');

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
        console.log('✅ 텔레그램 DB 초기화 완료:', DB_PATH);
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

const LISTENER_PORT = process.env.LISTENER_PORT || 3001;

function startHttpServer() {
  const app = express();

  // [#5] CORS를 허용된 오리진으로 제한
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').filter(Boolean);
  app.use(cors({
    origin: allowedOrigins.length > 0
      ? (origin, cb) => {
          if (origin && allowedOrigins.includes(origin)) {
            cb(null, true);
          } else {
            cb(new Error('CORS 차단'));
          }
        }
      : false, // 오리진 미설정 시 CORS 차단 (서버간 통신만 허용)
  }));

  // 보안 헤더
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // [#8] JSON body size 명시적 제한
  app.use(express.json({ limit: '10kb' }));

  // [#3] Rate Limiting
  const rateLimitMap = new Map();
  const RATE_LIMIT_WINDOW_MS = 60 * 1000;
  const RATE_LIMIT_MAX = 30; // 분당 최대 30회

  // 주기적으로 만료된 rate limit 항목 정리
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now - entry.start > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.delete(ip);
      }
    }
  }, RATE_LIMIT_WINDOW_MS);

  app.use((req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.set(ip, { start: now, count: 1 });
      return next();
    }

    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) {
      return res.status(429).json({ error: '요청이 너무 많습니다.' });
    }
    return next();
  });

  // (notify-claim은 블록체인 이벤트 기반으로 이동 — API 삭제됨)

  app.listen(LISTENER_PORT, () => {
    console.log(`[Listener HTTP] 포트 ${LISTENER_PORT}에서 실행 중`);
  });
}

async function main() {
  console.log('[Listener] 블록체인 이벤트 리스너 시작');
  try {
    const db = await initTelegramDb();
    await init();
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

    startHttpServer();
    console.log('[Listener] 실행 중... (체인 리스너 + 텔레그램 봇 + HTTP, Ctrl+C 종료)');
  } catch (err) {
    console.error('[Listener] 시작 실패:', err.message);
    process.exit(1);
  }
}

main();
