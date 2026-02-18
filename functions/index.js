/**
 * Firebase Cloud Functions = API 서버 역할 (tokamon Express 라우터 대체)
 *
 * 멀티체인 지원: 모든 API에 ?network= 쿼리 파라미터로 네트워크 지정 (기본: local)
 *
 * - /api/networks: 사용 가능한 네트워크 목록
 * - /api/contract?network=local: 컨트랙트 주소
 * - /api/spots?network=local: 스팟 목록 (Firestore, listener-server가 동기화)
 * - /api/claim/history?network=local&user_address=0x...: 클레임 히스토리
 */
const functions = require('firebase-functions');
const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const { ethers } = require('ethers');
const { collectionPath, DEFAULT_NETWORK, listNetworks, getNetwork, getContracts } = require('./shared/networks');

admin.initializeApp();

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

// ─── 네트워크 미들웨어 ───
// 모든 API 요청에서 ?network= 파라미터를 파싱하여 req.networkId 설정
function resolveNetwork(req, res, next) {
  const networkId = req.query.network || DEFAULT_NETWORK;
  try {
    getNetwork(networkId); // 유효성 검증
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  req.networkId = networkId;
  next();
}

app.use(resolveNetwork);

// 네트워크별 Firestore 컬렉션 경로 헬퍼
function col(req, collection) {
  return collectionPath(req.networkId, collection);
}

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

// GET /api/networks — 사용 가능한 네트워크 목록
app.get('/api/networks', (req, res) => {
  res.json(listNetworks());
});

// GET /api/contract — Firestore config → shared/networks.js → contract-address.json → env
app.get('/api/contract', async (req, res) => {
  try {
    // 1. Firestore config (네트워크별)
    const snap = await db.collection(col(req, 'config')).doc('contract').get();
    if (snap.exists) {
      return res.json({ ...snap.data(), network: req.networkId });
    }

    // 2. shared/networks.js contracts
    try {
      const networkContracts = getContracts(req.networkId);
      const networkInfo = getNetwork(req.networkId);
      if (networkContracts.tokamon) {
        return res.json({
          address: networkContracts.tokamon,
          tokamon: networkContracts.tokamon,
          faucet: networkContracts.faucet || null,
          chainId: networkInfo.chainId,
          network: req.networkId,
        });
      }
    } catch (_) {}

    // 3. contract-address.json 파일 (하위호환, local 네트워크만)
    if (req.networkId === 'local') {
      const fromFile = readContractAddressFromFile();
      if (fromFile && (fromFile.address || fromFile.tokamon)) {
        return res.json({
          address: fromFile.address || fromFile.tokamon,
          tokamon: fromFile.tokamon || fromFile.address,
          tonToken: fromFile.tonToken || null,
          faucet: fromFile.faucet || null,
          tonContract: fromFile.tonContract || null,
          chainId: fromFile.chainId != null ? Number(fromFile.chainId) : 1337,
          network: req.networkId,
        });
      }
    }

    // 4. 환경변수 (하위호환)
    const env = {
      address: process.env.CONTRACT_ADDRESS || process.env.TOKAMON_ADDRESS,
      tokamon: process.env.TOKAMON_ADDRESS || process.env.CONTRACT_ADDRESS,
      tonToken: process.env.TON_TOKEN_ADDRESS || null,
      faucet: process.env.FAUCET_ADDRESS || null,
      chainId: process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 1337,
      network: req.networkId,
    };
    if (env.address || env.tokamon) {
      return res.json(env);
    }
    res.status(404).json({ error: '컨트랙트 정보가 없습니다. npm run copy-contracts 후 배포하거나, shared/networks.js에 주소를 설정하세요.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
  }
});

// 활성 시간 체크 (날짜 범위 + 일별 영업시간)
// NOTE: 정규 구현체는 listener-server/utils.js — 로직 변경 시 양쪽 모두 업데이트할 것
function isWithinActiveTime(startDate, endDate, dailyStartTime, dailyEndTime, utcOffset) {
  const start = Number(startDate || 0);
  const end = Number(endDate || 0);
  const dailyStart = Number(dailyStartTime || 0);
  const dailyEnd = Number(dailyEndTime || 0);
  const offset = Number(utcOffset || 0);

  const now = Math.floor(Date.now() / 1000);

  // 1단계: 날짜 범위 체크
  if (start > 0 && now < start) return false;
  if (end > 0 && now > end) return false;

  // 2단계: 일별 영업시간 체크 (둘 다 0이면 제한 없음)
  if (dailyStart === 0 && dailyEnd === 0) return true;

  // 현재 시각을 UTC 오프셋 적용하여 자정 기준 분으로 변환
  const nowMs = Date.now();
  const localMs = nowMs + offset * 3600 * 1000;
  const localDate = new Date(localMs);
  const currentMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();

  if (dailyStart < dailyEnd) {
    // 일반 (예: 09:00~18:00)
    return currentMinutes >= dailyStart && currentMinutes < dailyEnd;
  } else {
    // 야간 영업 (예: 22:00~06:00)
    return currentMinutes >= dailyStart || currentMinutes < dailyEnd;
  }
}

// GET /api/spots — 스팟 목록 + active (listener-server 호환)
app.get('/api/spots', async (req, res) => {
  try {
    const snap = await db.collection(col(req, 'spot_metadata')).get();
    const spots = snap.docs
      .map((d) => ({ ...d.data(), id: Number(d.id) || d.data().id }))
      .filter((s) => s.id != null)
      .sort((a, b) => a.id - b.id)
      .map((s) => ({
        ...s,
        active: (s.remaining || 0) > 0 && isWithinActiveTime(s.start_time, s.end_time, s.daily_start_time, s.daily_end_time, s.utc_offset),
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
    if (!isValidEthAddress(userAddress)) {
      return res.status(400).json({ error: '올바른 이더리움 주소 형식이 아닙니다 (0x + 40자 hex)' });
    }
    const snap = await db.collection(col(req, 'claim_events'))
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
    if (!isValidEthAddress(userAddress)) {
      return res.status(400).json({ error: '올바른 이더리움 주소 형식이 아닙니다 (0x + 40자 hex)' });
    }
    const snap = await db.collection(col(req, 'claim_events'))
      .where('spot_id', '==', Number(spotId))
      .where('user_address', '==', userAddress)
      .get();

    const spotSnap = await db.collection(col(req, 'spot_metadata')).doc(String(spotId)).get();
    const spotData = spotSnap.exists ? spotSnap.data() : {};
    const goal = spotData.stamp_goal || 10;

    const claims = snap.docs.map((d) => d.data()).sort((a, b) =>
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    const lastClaim = claims[0];

    // 쿨다운 계산
    const cooldownSeconds = spotData.cooldown || 0;
    let cooldownRemaining = 0;
    if (cooldownSeconds > 0 && lastClaim && lastClaim.created_at) {
      const lastClaimTime = Math.floor(new Date(lastClaim.created_at).getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);
      cooldownRemaining = Math.max(0, cooldownSeconds - (now - lastClaimTime));
    }

    res.json({
      spot_id: Number(spotId),
      stamps: claims.length % goal,
      goal,
      last_claim: lastClaim ? lastClaim.created_at : null,
      cooldown_remaining: cooldownRemaining,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '스탬프 정보 조회에 실패했습니다.' });
  }
});

// ─── 텔레그램 관련 ───

const crypto = require('crypto');

const COLLECT_RADIUS = 15; // 클레임 허용 거리 (미터)

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

    if (!isValidLatLng(Number(lat), Number(lng))) {
      return res.status(400).json({ error: '올바른 위도/경도 값이 아닙니다' });
    }

    const spotSnap = await db.collection(col(req, 'spot_metadata')).doc(String(spot_id)).get();
    if (!spotSnap.exists) {
      return res.status(404).json({ error: '스팟을 찾을 수 없습니다' });
    }
    const spot = spotSnap.data();

    const distance = haversineDistance(Number(lat), Number(lng), spot.lat, spot.lng);
    if (distance > COLLECT_RADIUS) {
      return res.status(400).json({
        error: `너무 멀어요 (${Math.round(distance)}m). 더 가까이 가주세요`,
        distance: Math.round(distance),
      });
    }

    if (!isWithinActiveTime(spot.start_time, spot.end_time, spot.daily_start_time, spot.daily_end_time, spot.utc_offset)) {
      const fmt = (ts) => ts ? new Date(ts * 1000).toLocaleString() : '-';
      return res.status(400).json({
        error: `활성 시간이 아닙니다 (${fmt(spot.start_time)}~${fmt(spot.end_time)})`,
      });
    }

    // 클레임 이력 확인
    const telegramHash = hashTelegramId(telegram_username);
    const claimSnap = await db.collection(col(req, 'claim_events'))
      .where('telegram_hash', '==', telegramHash)
      .where('spot_id', '==', Number(spot_id))
      .get();

    if (!claimSnap.empty) {
      // 중복발행 불가면 1인 1회만
      if (!spot.allow_duplicate_claims) {
        return res.status(400).json({ error: '이미 발행 받은 스팟입니다' });
      }

      // 쿨다운은 항상 적용
      const claims = claimSnap.docs.map((d) => d.data()).sort((a, b) =>
        new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
      const lastClaim = claims[0];
      const cooldownSeconds = spot.cooldown || 0;

      if (cooldownSeconds > 0 && lastClaim && lastClaim.created_at) {
        const lastClaimTime = Math.floor(new Date(lastClaim.created_at).getTime() / 1000);
        const now = Math.floor(Date.now() / 1000);
        const cooldownRemaining = Math.max(0, cooldownSeconds - (now - lastClaimTime));

        if (cooldownRemaining > 0) {
          const hours = Math.floor(cooldownRemaining / 3600);
          const minutes = Math.floor((cooldownRemaining % 3600) / 60);
          return res.status(400).json({
            error: `쿨다운 중입니다 (${hours}시간 ${minutes}분 남음)`,
            cooldown_remaining: cooldownRemaining,
          });
        }
      }
    }

    if ((spot.remaining || 0) < (spot.reward || 0)) {
      return res.status(400).json({ error: '이 스팟의 TON이 소진되었습니다' });
    }

    res.json({ valid: true });
  } catch (err) {
    console.error('검증 에러:', err.message);
    res.status(500).json({ error: '검증에 실패했습니다.' });
  }
});

// POST /api/telegram/balance — 텔레그램 잔액 조회 (컨트랙트 동기화 잔액)
app.post('/api/telegram/balance', async (req, res) => {
  try {
    const { telegram_username } = req.body;

    if (!telegram_username || !isValidTelegramUsername(telegram_username)) {
      return res.status(400).json({ error: '올바른 텔레그램 username을 입력해주세요' });
    }

    const telegramHash = hashTelegramId(telegram_username);

    // listener-server가 컨트랙트에서 조회하여 동기화한 잔액 읽기
    const balDoc = await db.collection(col(req, 'telegram_balances')).doc(telegramHash).get();
    const balance = balDoc.exists ? (balDoc.data().balance || 0) : 0;

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

    const snap = await db.collection(col(req, 'claim_events'))
      .where('telegram_hash', '==', telegramHash)
      .where('spot_id', '==', Number(spot_id))
      .get();

    const spotSnap = await db.collection(col(req, 'spot_metadata')).doc(String(spot_id)).get();
    const spotData = spotSnap.exists ? spotSnap.data() : {};
    const goal = spotData.stamp_goal || 10;

    const claims = snap.docs.map((d) => d.data()).sort((a, b) =>
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    const lastClaim = claims[0];

    // 쿨다운 계산
    const cooldownSeconds = spotData.cooldown || 0;
    let cooldownRemaining = 0;
    if (cooldownSeconds > 0 && lastClaim && lastClaim.created_at) {
      const lastClaimTime = Math.floor(new Date(lastClaim.created_at).getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);
      cooldownRemaining = Math.max(0, cooldownSeconds - (now - lastClaimTime));
    }

    res.json({
      stamps: claims.length % goal,
      goal,
      last_claim: lastClaim ? lastClaim.created_at : null,
      cooldown_remaining: cooldownRemaining,
    });
  } catch (err) {
    console.error('스탬프 정보 조회 에러:', err.message);
    res.status(500).json({ error: '스탬프 정보 조회에 실패했습니다.' });
  }
});


// POST /api/telegram/hash — 서버에서 텔레그램 해시 생성
app.post('/api/telegram/hash', async (req, res) => {
  try {
    const { telegram_username } = req.body;
    if (!telegram_username || !isValidTelegramUsername(telegram_username)) {
      return res.status(400).json({ error: '올바른 텔레그램 username을 입력해주세요' });
    }
    const hash = hashTelegramId(telegram_username);

    const doc = await db.collection(col(req, 'telegram_hash_map')).doc(hash).get();
    if (!doc.exists) {
      const cleaned = (telegram_username || '').replace('@', '').toLowerCase().trim();
      await db.collection(col(req, 'telegram_hash_map')).doc(hash).set({
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

// POST /api/telegram/username — 텔레그램 해시로 username 조회 (지갑 서명 필수)
app.post('/api/telegram/username', async (req, res) => {
  try {
    const { hash, signature } = req.body;

    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
      return res.status(400).json({ error: 'Invalid hash format' });
    }

    if (!signature) {
      return res.status(400).json({ error: 'Signature is required' });
    }

    // 서명에서 지갑 주소 복원
    const message = `Verify telegram username for hash: ${hash}`;
    let recoveredAddress;
    try {
      recoveredAddress = ethers.verifyMessage(message, signature);
    } catch {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Firestore에서 이 해시에 매핑된 지갑 조회
    const linkSnap = await db.collection(col(req, 'telegram_wallet_links'))
      .where('telegram_hash', '==', hash)
      .limit(1)
      .get();

    if (linkSnap.empty) {
      return res.status(404).json({ error: 'No wallet linked to this hash' });
    }

    const linkedWallet = linkSnap.docs[0].id; // doc ID = wallet address

    // 서명자와 매핑된 지갑이 일치하는지 확인
    if (recoveredAddress.toLowerCase() !== linkedWallet.toLowerCase()) {
      return res.status(403).json({ error: 'Signature does not match linked wallet' });
    }

    // 검증 통과 — username 조회
    const doc = await db.collection(col(req, 'telegram_hash_map')).doc(hash).get();
    if (!doc.exists) {
      return res.json({ telegram_username: null });
    }

    res.json({ telegram_username: '@' + doc.data().username });
  } catch (err) {
    console.error('텔레그램 username 조회 에러:', err.message);
    res.status(500).json({ error: 'Failed to fetch username' });
  }
});

// 나머지 /api/* 는 404
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Cloud Function: 모든 요청을 Express가 처리 (Hosting rewrite에서 /api -> api 로 연결)
exports.api = functions.https.onRequest(app);
