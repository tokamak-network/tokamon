const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { init, onTelegramClaimed, onDeviceClaimed } = require('./blockchain');
const blockchain = require('./blockchain');
const { initBot, sendClaimNotification, isBotEnabled, stopBot } = require('./telegram-bot');
const deviceRoutes = require('./routes/device');
const telegramRoutes = require('./routes/telegram');
const faucetRoutes = require('./routes/faucet');
const spotsRoutes = require('./routes/spots');
const { hashTelegramId, isValidTelegramUsername } = require('./utils');
const { saveWalletTelegramLink, saveTelegramHashMap, saveTelegramUser, getAllTelegramUsers, saveDeviceAttestKey, getAllDeviceAttestKeys } = require('./firebase-admin');

// ─── 글로벌 에러 핸들러 (Phase 2) ───

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  // uncaughtException 후에는 프로세스 상태를 신뢰할 수 없으므로 종료
  // Cloud Run이 자동 재시작함
  process.exit(1);
});

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
        db.run(`
          CREATE TABLE IF NOT EXISTS faucet_claims (
            address TEXT PRIMARY KEY,
            last_claim INTEGER NOT NULL
          )
        `);
        db.run(`
          CREATE TABLE IF NOT EXISTS device_attest_keys (
            device_hash TEXT PRIMARY KEY,
            key_id TEXT NOT NULL,
            public_key_pem TEXT NOT NULL,
            receipt TEXT,
            sign_count INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_attest_keys_key_id ON device_attest_keys(key_id)`);
        // 기존 테이블에 새 컬럼 추가 (이미 존재하면 무시)
        db.run(`ALTER TABLE device_verify_codes ADD COLUMN wallet_address TEXT`, () => {});
        db.run(`ALTER TABLE device_verify_codes ADD COLUMN attempts INTEGER DEFAULT 0`, () => {});
        console.log('DB 초기화 완료:', DB_PATH);
        resolve(db);
      });
    });
  });
}

// 필수 환경변수 시작 시 검증
if (!process.env.TELEGRAM_HASH_SALT) {
  console.error('TELEGRAM_HASH_SALT 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
  process.exit(1);
}
if (!process.env.DEVICE_HASH_SALT) {
  console.error('DEVICE_HASH_SALT 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
  process.exit(1);
}
if (process.env.DEVICE_HASH_SALT === process.env.TELEGRAM_HASH_SALT) {
  console.warn('DEVICE_HASH_SALT와 TELEGRAM_HASH_SALT가 동일합니다. 보안을 위해 서로 다른 값을 사용하세요.');
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

  // ─── 헬스체크 엔드포인트 (Phase 3) ───

  // Liveness probe — 프로세스가 살아있으면 200
  app.get('/health/live', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Readiness/종합 헬스체크 — WS/HTTP 프로바이더 + 봇 상태
  app.get('/health', async (req, res) => {
    const providerStatus = blockchain.getProviderStatus();
    let blockNumber = null;
    let httpOk = false;

    try {
      blockNumber = await blockchain.getBlockNumber();
      httpOk = true;
    } catch (e) {
      httpOk = false;
    }

    const wsOk = providerStatus.ws === 'connected';
    const botOk = isBotEnabled();
    const healthy = wsOk && httpOk;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      revision: process.env.K_REVISION || 'local',
      providers: {
        ws: providerStatus.ws,
        http: httpOk ? 'ok' : 'error',
        isReconnecting: providerStatus.isReconnecting,
        reconnectAttempts: providerStatus.reconnectAttempts,
      },
      blockNumber,
      bot: botOk ? 'running' : 'disabled',
      contract: providerStatus.contractAddress,
    });
  });

  // Rate Limiting: device_id 기준으로 각 엔드포인트에서 개별 적용 (routes/device.js)

  // 디바이스 클레임 라우트
  app.use('/api/device', deviceRoutes(db));

  // 텔레그램 라우트 (verify-token, link-wallet, username 등)
  app.use('/api/telegram', telegramRoutes(db));

  // Spots 라우트
  app.use('/api/spots', spotsRoutes);

  // Faucet 라우트
  app.use('/api/faucet', faucetRoutes(db));

  const server = app.listen(LISTENER_PORT, () => {
    console.log(`[Listener HTTP] 포트 ${LISTENER_PORT}에서 실행 중`);
  });

  return server;
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
        // 3. telegram_users (chat_id) 동기화
        db.all('SELECT username, chat_id, first_seen, last_seen FROM telegram_users', async (err3, rows3) => {
          if (!err3 && rows3 && rows3.length > 0) {
            for (const row of rows3) {
              await saveTelegramUser(row.username, row.chat_id, row.first_seen, row.last_seen);
              count++;
            }
          }
          if (count > 0) console.log(`[동기화] SQLite → Firestore: ${count}건 동기화 완료`);
          resolve();
        });
      });
    });
  });
}

// Firestore → SQLite 복원 (컨테이너 재시작 시 telegram_users 복구)
async function restoreTelegramUsersFromFirestore(db) {
  const users = await getAllTelegramUsers();
  if (users.length === 0) return;
  let count = 0;
  for (const user of users) {
    await new Promise((resolve) => {
      db.run(`
        INSERT INTO telegram_users (username, chat_id, first_seen, last_seen)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username)
        DO UPDATE SET chat_id = ?, last_seen = MAX(last_seen, ?)
      `, [user.username, user.chat_id, user.first_seen, user.last_seen, user.chat_id, user.last_seen], (err) => {
        if (!err) count++;
        resolve();
      });
    });
  }
  if (count > 0) console.log(`[복원] Firestore → SQLite: telegram_users ${count}건 복원 완료`);
}

// Firestore → SQLite 복원 (컨테이너 재시작 시 device_attest_keys 복구)
async function restoreDeviceAttestKeysFromFirestore(db) {
  const keys = await getAllDeviceAttestKeys();
  if (keys.length === 0) return;
  let count = 0;
  for (const key of keys) {
    await new Promise((resolve) => {
      db.run(`
        INSERT INTO device_attest_keys (device_hash, key_id, public_key_pem, receipt, sign_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_hash)
        DO UPDATE SET key_id = ?, public_key_pem = ?, receipt = ?, sign_count = MAX(sign_count, ?), updated_at = MAX(updated_at, ?)
      `, [key.device_hash, key.key_id, key.public_key_pem, key.receipt, key.sign_count, key.created_at, key.updated_at,
          key.key_id, key.public_key_pem, key.receipt, key.sign_count, key.updated_at], (err) => {
        if (!err) count++;
        resolve();
      });
    });
  }
  if (count > 0) console.log(`[복원] Firestore → SQLite: device_attest_keys ${count}건 복원 완료`);
}

// SQLite → Firestore 동기화 (device_attest_keys)
async function syncDeviceAttestKeysToFirestore(db) {
  return new Promise((resolve) => {
    db.all('SELECT device_hash, key_id, public_key_pem, receipt, sign_count, created_at, updated_at FROM device_attest_keys', async (err, rows) => {
      if (err || !rows || rows.length === 0) return resolve();
      let count = 0;
      for (const row of rows) {
        await saveDeviceAttestKey(row.device_hash, {
          key_id: row.key_id,
          public_key_pem: row.public_key_pem,
          receipt: row.receipt,
          sign_count: row.sign_count,
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
        count++;
      }
      if (count > 0) console.log(`[동기화] SQLite → Firestore: device_attest_keys ${count}건 동기화 완료`);
      resolve();
    });
  });
}

// ─── Graceful Shutdown (Phase 4) ───

let isShuttingDown = false;

async function gracefulShutdown(signal, { server, sqliteDb }) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Shutdown] ${signal} 수신 — graceful shutdown 시작`);

  // 1. HTTP 서버 닫기 (새 요청 거부)
  if (server) {
    await new Promise((resolve) => {
      server.close(() => {
        console.log('[Shutdown] HTTP 서버 종료');
        resolve();
      });
      // 5초 후 강제 종료
      setTimeout(resolve, 5000);
    });
  }

  // 2. 텔레그램 봇 중지
  try {
    stopBot();
    console.log('[Shutdown] 텔레그램 봇 종료');
  } catch (e) {
    console.error('[Shutdown] 봇 종료 실패:', e.message);
  }

  // 3. 블록체인 프로바이더 정리
  try {
    await blockchain.destroy();
  } catch (e) {
    console.error('[Shutdown] 프로바이더 정리 실패:', e.message);
  }

  // 4. SQLite DB 닫기
  if (sqliteDb) {
    await new Promise((resolve) => {
      sqliteDb.close((err) => {
        if (err) console.error('[Shutdown] DB 닫기 실패:', err.message);
        else console.log('[Shutdown] SQLite DB 종료');
        resolve();
      });
    });
  }

  console.log('[Shutdown] graceful shutdown 완료');
  process.exit(0);
}

async function main() {
  console.log('[Listener] 블록체인 이벤트 리스너 시작');
  try {
    const sqliteDb = await initTelegramDb();
    await init();

    // Firestore → SQLite 복원 (컨테이너 재시작 시 telegram_users 복구)
    await restoreTelegramUsersFromFirestore(sqliteDb);

    // SQLite → Firestore 동기화
    await syncTelegramDataToFirestore(sqliteDb);

    // Firestore → SQLite 복원 (컨테이너 재시작 시 device_attest_keys 복구)
    await restoreDeviceAttestKeysFromFirestore(sqliteDb);

    // SQLite → Firestore 동기화 (device_attest_keys)
    await syncDeviceAttestKeysToFirestore(sqliteDb);

    initBot(sqliteDb);

    // TelegramClaimed 이벤트 → 텔레그램 알림 자동 전송
    onTelegramClaimed(async ({ username, spotName, reward, bonus, telegramHash }) => {
      const balance = await blockchain.getTelegramBalance(telegramHash);
      const linkedWallet = await blockchain.getTelegramLinkedWallet(telegramHash);
      const zeroAddress = '0x0000000000000000000000000000000000000000';
      const hasLinkedWallet = linkedWallet && linkedWallet !== zeroAddress;
      await sendClaimNotification(username, spotName, reward, bonus, balance, hasLinkedWallet ? linkedWallet : null);
      console.log(`[알림] @${username}에게 텔레그램 알림 전송 완료`);
    });

    const server = startHttpServer(sqliteDb);

    // Graceful shutdown 핸들러 등록
    const shutdownContext = { server, sqliteDb };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM', shutdownContext));
    process.on('SIGINT', () => gracefulShutdown('SIGINT', shutdownContext));

    console.log('[Listener] 실행 중... (체인 리스너 + 텔레그램 봇 + HTTP, Ctrl+C 종료)');
  } catch (err) {
    console.error('[Listener] 시작 실패:', err.message);
    process.exit(1);
  }
}

main();
