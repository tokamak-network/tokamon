/**
 * Firebase Cloud Functions = API 서버 역할 (tokamon Express 라우터 대체)
 * - /api/contract: 컨트랙트 주소 (Firestore → functions/contract-address.json → env)
 * - /api/spots: 스팟 목록 (Firestore spot_metadata, listener-server가 동기화)
 * - /api/claim/history: 클레임 히스토리 (Firestore claim_events)
 */
const functions = require('firebase-functions');
const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

admin.initializeApp();

// 필수 환경변수 검증
if (!process.env.TELEGRAM_HASH_SALT) {
  console.error('❌ TELEGRAM_HASH_SALT 환경변수가 설정되지 않았습니다.');
}

const app = express();

// 보안 헤더
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// [#8] JSON body size 명시적 제한 (10kb)
app.use(express.json({ limit: '10kb' }));

const db = admin.firestore();

// ─── [#3] 간단한 인메모리 Rate Limiter ───
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1분
const RATE_LIMIT_MAX = 60; // 분당 최대 60회

function rateLimit(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  }
  return next();
}

// 주기적으로 만료된 항목 정리
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.start > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

app.use(rateLimit);

// ─── [#7] 이더리움 주소 검증 ───
function isValidEthAddress(address) {
  return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

// contract-address.json: listener-server 배포 결과를 copy-contracts 시 functions/ 로 복사해 둠
function readContractAddressFromFile() {
  const filePath = path.join(__dirname, 'contract-address.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// GET /api/contract — Firestore config → functions/contract-address.json → env
app.get('/api/contract', async (req, res) => {
  try {
    const snap = await db.collection('config').doc('contract').get();
    if (snap.exists) {
      return res.json(snap.data());
    }
    const fromFile = readContractAddressFromFile();
    if (fromFile && (fromFile.address || fromFile.tokamon)) {
      return res.json({
        address: fromFile.address || fromFile.tokamon,
        tokamon: fromFile.tokamon || fromFile.address,
        tonToken: fromFile.tonToken || null,
        faucet: fromFile.faucet || null,
        tonContract: fromFile.tonContract || null,
        chainId: fromFile.chainId != null ? Number(fromFile.chainId) : 1337,
      });
    }
    const env = {
      address: process.env.CONTRACT_ADDRESS || process.env.TOKAMON_ADDRESS,
      tokamon: process.env.TOKAMON_ADDRESS || process.env.CONTRACT_ADDRESS,
      tonToken: process.env.TON_TOKEN_ADDRESS || null,
      faucet: process.env.FAUCET_ADDRESS || null,
      chainId: process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 1337,
    };
    if (env.address || env.tokamon) {
      return res.json(env);
    }
    res.status(404).json({ error: '컨트랙트 정보가 없습니다. npm run copy-contracts 후 배포하거나, Firestore config/contract 또는 환경변수를 설정하세요.' });
  } catch (e) {
    // [#6] 내부 에러 메시지 숨김
    console.error(e);
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
  }
});

// 시간 범위 체크 (start_time, end_time: Unix timestamp, 0 = 제한 없음)
function isWithinTimeRange(startTime, endTime) {
  const start = Number(startTime || 0);
  const end = Number(endTime || 0);
  if (start === 0 && end === 0) return true;
  const now = Math.floor(Date.now() / 1000);
  if (start > 0 && now < start) return false;
  if (end > 0 && now > end) return false;
  return true;
}

// GET /api/spots — 스팟 목록 + active (listener-server 호환)
app.get('/api/spots', async (req, res) => {
  try {
    const snap = await db.collection('spot_metadata').get();
    const spots = snap.docs
      .map((d) => ({ ...d.data(), id: Number(d.id) || d.data().id }))
      .filter((s) => s.id != null)
      .sort((a, b) => a.id - b.id)
      .map((s) => ({
        ...s,
        active: (s.remaining || 0) > 0 && isWithinTimeRange(s.start_time, s.end_time),
      }));
    res.json(spots);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '스팟 목록 조회에 실패했습니다.' });
  }
});

// POST /api/spots/:id/allow-duplicate-claims — 컨트랙트 호출 필요, 클라이언트에서 처리
app.post('/api/spots/:id/allow-duplicate-claims', (req, res) => {
  res.status(501).json({
    error: '이 API는 Firebase에서 지원하지 않습니다. 클라이언트에서 컨트랙트 updateAllowDuplicateClaims를 직접 호출하세요.',
  });
});

// GET /api/claim/history?user_address=0x...
app.get('/api/claim/history', async (req, res) => {
  try {
    const userAddress = req.query.user_address;
    if (!userAddress) {
      return res.status(400).json({ error: 'user_address가 필요합니다' });
    }
    // [#7] 주소 형식 검증
    if (!isValidEthAddress(userAddress)) {
      return res.status(400).json({ error: '올바른 이더리움 주소 형식이 아닙니다 (0x + 40자 hex)' });
    }
    const snap = await db.collection('claim_events')
      .where('user_address', '==', userAddress)
      .limit(100)
      .get();
    const history = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    res.json(history);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '클레임 히스토리 조회에 실패했습니다.' });
  }
});

// GET /api/stamps/:spotId?user_address=0x... — 스탬프 정보 (Firestore)
app.get('/api/stamps/:spotId', async (req, res) => {
  try {
    const spotId = req.params.spotId;
    const userAddress = req.query.user_address;
    if (!userAddress) {
      return res.status(400).json({ error: 'user_address가 필요합니다' });
    }
    // [#7] 주소 형식 검증
    if (!isValidEthAddress(userAddress)) {
      return res.status(400).json({ error: '올바른 이더리움 주소 형식이 아닙니다 (0x + 40자 hex)' });
    }
    // claim_events에서 해당 유저의 스팟별 클레임 수 계산
    const snap = await db.collection('claim_events')
      .where('spot_id', '==', Number(spotId))
      .where('user_address', '==', userAddress)
      .get();

    // 스팟 정보에서 stamp_goal 조회
    const spotSnap = await db.collection('spot_metadata').doc(String(spotId)).get();
    const spotData = spotSnap.exists ? spotSnap.data() : {};
    const goal = spotData.stamp_goal || 10;

    const claims = snap.docs.map((d) => d.data()).sort((a, b) =>
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    const lastClaim = claims[0];

    res.json({
      spot_id: Number(spotId),
      stamps: claims.length % goal,
      goal,
      last_claim: lastClaim ? lastClaim.created_at : null,
      cooldown_remaining: 0,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '스탬프 정보 조회에 실패했습니다.' });
  }
});

// ─── 텔레그램 관련 ───

const crypto = require('crypto');

const COLLECT_RADIUS = 50; // 클레임 허용 거리 (미터)

// [#4] salt를 환경변수에서 읽기 (하드코딩 제거)
function hashTelegramId(username) {
  const cleaned = (username || '').replace('@', '').toLowerCase().trim();
  const salt = process.env.TELEGRAM_HASH_SALT;
  if (!salt) {
    throw new Error('TELEGRAM_HASH_SALT 환경변수가 설정되지 않았습니다.');
  }
  return crypto.createHash('sha256').update(salt + cleaned).digest('hex');
}

function isValidTelegramUsername(username) {
  const cleaned = (username || '').replace('@', '').trim();
  return /^[a-zA-Z0-9_]{5,32}$/.test(cleaned);
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// [#2] 위도/경도 유효성 검증
function isValidLatLng(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' &&
    isFinite(lat) && isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180;
}

// POST /api/telegram/validate-claim — 클레임 전 검증 (거리, 시간, 잔액)
app.post('/api/telegram/validate-claim', async (req, res) => {
  try {
    const { telegram_username, spot_id, lat, lng } = req.body;

    if (!telegram_username || spot_id == null || lat == null || lng == null) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요' });
    }

    if (!isValidTelegramUsername(telegram_username)) {
      return res.status(400).json({ error: '올바른 텔레그램 username 형식이 아닙니다' });
    }

    // [#2] lat/lng 범위 검증
    if (!isValidLatLng(Number(lat), Number(lng))) {
      return res.status(400).json({ error: '올바른 위도/경도 값이 아닙니다' });
    }

    // Firestore에서 스팟 조회
    const spotSnap = await db.collection('spot_metadata').doc(String(spot_id)).get();
    if (!spotSnap.exists) {
      return res.status(404).json({ error: '스팟을 찾을 수 없습니다' });
    }
    const spot = spotSnap.data();

    // 거리 확인
    const distance = haversineDistance(Number(lat), Number(lng), spot.lat, spot.lng);
    if (distance > COLLECT_RADIUS) {
      return res.status(400).json({
        error: `너무 멀어요 (${Math.round(distance)}m). 더 가까이 가주세요`,
        distance: Math.round(distance),
      });
    }

    // 시간 확인
    if (!isWithinTimeRange(spot.start_time, spot.end_time)) {
      const fmt = (ts) => ts ? new Date(ts * 1000).toLocaleString() : '-';
      return res.status(400).json({
        error: `활성 시간이 아닙니다 (${fmt(spot.start_time)}~${fmt(spot.end_time)})`,
      });
    }

    // 잔액 확인
    if ((spot.remaining || 0) < (spot.reward || 0)) {
      return res.status(400).json({ error: '이 스팟의 TON이 소진되었습니다' });
    }

    res.json({ valid: true });
  } catch (err) {
    console.error('검증 에러:', err.message);
    res.status(500).json({ error: '검증에 실패했습니다.' });
  }
});

// POST /api/telegram/balance — 텔레그램 잔액 조회 (Firestore claim_events 기반)
app.post('/api/telegram/balance', async (req, res) => {
  try {
    const { telegram_username } = req.body;

    if (!telegram_username || !isValidTelegramUsername(telegram_username)) {
      return res.status(400).json({ error: '올바른 텔레그램 username을 입력해주세요' });
    }

    const telegramHash = hashTelegramId(telegram_username);

    // Firestore에서 해당 텔레그램 해시의 클레임 합산
    const snap = await db.collection('claim_events')
      .where('telegram_hash', '==', telegramHash)
      .get();

    let balance = 0;
    snap.docs.forEach((d) => {
      const data = d.data();
      balance += (data.reward || 0) + (data.bonus || 0);
    });

    res.json({ balance });
  } catch (err) {
    console.error('텔레그램 잔액 조회 에러:', err.message);
    res.status(500).json({ error: '잔액 조회에 실패했습니다.' });
  }
});

// POST /api/telegram/stamp-info — 스탬프 정보 조회
app.post('/api/telegram/stamp-info', async (req, res) => {
  try {
    const { telegram_username, spot_id } = req.body;

    if (!telegram_username || spot_id == null) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요' });
    }

    const telegramHash = hashTelegramId(telegram_username);

    const snap = await db.collection('claim_events')
      .where('telegram_hash', '==', telegramHash)
      .where('spot_id', '==', Number(spot_id))
      .get();

    const spotSnap = await db.collection('spot_metadata').doc(String(spot_id)).get();
    const spotData = spotSnap.exists ? spotSnap.data() : {};
    const goal = spotData.stamp_goal || 10;

    const claims = snap.docs.map((d) => d.data()).sort((a, b) =>
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    const lastClaim = claims[0];

    res.json({
      stamps: claims.length % goal,
      goal,
      last_claim: lastClaim ? lastClaim.created_at : null,
      cooldown_remaining: 0,
    });
  } catch (err) {
    console.error('스탬프 정보 조회 에러:', err.message);
    res.status(500).json({ error: '스탬프 정보 조회에 실패했습니다.' });
  }
});


// [#4] POST /api/telegram/hash — 서버에서 텔레그램 해시 생성 (클라이언트 salt 노출 방지)
app.post('/api/telegram/hash', async (req, res) => {
  try {
    const { telegram_username } = req.body;
    if (!telegram_username || !isValidTelegramUsername(telegram_username)) {
      return res.status(400).json({ error: '올바른 텔레그램 username을 입력해주세요' });
    }
    const hash = hashTelegramId(telegram_username);

    // hash→username 매핑이 없으면 등록
    const doc = await db.collection('telegram_hash_map').doc(hash).get();
    if (!doc.exists) {
      const cleaned = (telegram_username || '').replace('@', '').toLowerCase().trim();
      await db.collection('telegram_hash_map').doc(hash).set({
        username: cleaned,
        updated_at: new Date().toISOString(),
      });
    }

    res.json({ telegram_hash: '0x' + hash });
  } catch (err) {
    console.error('해시 생성 에러:', err.message);
    res.status(500).json({ error: '해시 생성에 실패했습니다.' });
  }
});

// 나머지 /api/* 는 404
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Cloud Function: 모든 요청을 Express가 처리 (Hosting rewrite에서 /api -> api 로 연결)
exports.api = functions.https.onRequest(app);
