// .env 로드: 프로젝트 루트 → server/ (server/ 우선)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const blockchain = require('./blockchain');
const { initBot } = require('./telegram-bot');
const spotRoutes = require('./routes/spots');
const claimRoutes = require('./routes/claim');
// const faucetRoutes = require('./routes/faucet'); // 제거됨
const stampRoutes = require('./routes/stamps');
const kioskRoutes = require('./routes/kiosk');
const deviceRoutes = require('./routes/device');
const telegramRoutesFactory = require('./routes/telegram');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// SQLite DB 초기화 (경로: DATABASE_PATH 환경변수 또는 기본값 server/tokamon.db)
const DB_PATH = process.env.DATABASE_PATH
  ? path.isAbsolute(process.env.DATABASE_PATH)
    ? process.env.DATABASE_PATH
    : path.join(__dirname, '..', process.env.DATABASE_PATH)
  : path.join(__dirname, 'tokamon.db');
const db = new sqlite3.Database(DB_PATH);

// 텔레그램 링크 토큰 테이블 생성
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
  
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_telegram_tokens_expires 
    ON telegram_link_tokens(expires_at)
  `);
  
  // 텔레그램 인증 코드 테이블
  db.run(`
    CREATE TABLE IF NOT EXISTS telegram_verify_codes (
      code TEXT PRIMARY KEY,
      telegram_username TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      verified BOOLEAN DEFAULT 0
    )
  `);
  
  // 텔레그램 사용자 chat_id 저장 테이블 (영구 저장)
  db.run(`
    CREATE TABLE IF NOT EXISTS telegram_users (
      username TEXT PRIMARY KEY,
      chat_id INTEGER NOT NULL,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    )
  `);
  
  // 지갑 <-> 텔레그램 해시 매핑 테이블
  db.run(`
    CREATE TABLE IF NOT EXISTS telegram_wallet_links (
      wallet_address TEXT PRIMARY KEY,
      telegram_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  
  // 텔레그램 해시 <-> username 매핑 테이블
  db.run(`
    CREATE TABLE IF NOT EXISTS telegram_hash_username (
      telegram_hash TEXT PRIMARY KEY,
      telegram_username TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  
  console.log('✅ DB 초기화 완료:', DB_PATH);
});

// 만료된 토큰 자동 삭제 (10분마다)
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  db.run('DELETE FROM telegram_link_tokens WHERE expires_at < ?', [now], (err) => {
    if (!err) {
      console.log('만료된 토큰 정리 완료');
    }
  });
}, 600000);

// DB를 app.locals에 저장하여 라우트에서 접근 가능하도록
app.locals.db = db;

// 컨트랙트 정보 엔드포인트
app.get('/api/contract', (req, res) => {
  try {
    const addrPath = path.join(__dirname, 'contract-address.json');
    const data = JSON.parse(fs.readFileSync(addrPath, 'utf8'));
    // 하위 호환성 유지 + Faucet 주소 제공
    res.json({
      address: data.address || data.tokamon, // 하위 호환성
      tokamon: data.tokamon || data.address,
      tonToken: data.tonToken, // ERC20 TON 토큰 컨트랙트 주소 (EVM)
      tonContract: data.tonContract || null, // TON 블록체인 컨트랙트 주소 (EQ...)
      faucet: data.faucet || null,
      chainId: data.chainId ?? 1337
    });
  } catch (err) {
    res.status(500).json({ error: '컨트랙트 주소를 찾을 수 없습니다' });
  }
});

app.use('/api/spots', spotRoutes);
app.use('/api/claim', claimRoutes);
// Faucet API 제거 - 클라이언트에서 Faucet 컨트랙트 직접 호출
// app.use('/api/faucet', faucetRoutes);
app.use('/api/stamps', stampRoutes);
app.use('/api/kiosk', kioskRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/telegram', telegramRoutesFactory(db));

// 프로덕션: 빌드된 클라이언트 정적 파일 서빙 (API 라우트 이후)
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

async function start() {
  await blockchain.init();
  
  // 텔레그램 봇 초기화
  initBot(db);
  
  app.listen(PORT, () => {
    console.log(`Tokamon 서버 실행 중: http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('서버 시작 실패:', err.message);
  process.exit(1);
});
