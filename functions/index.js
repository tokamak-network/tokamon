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

// listener-server URL (Compute Engine VM)
const LISTENER_BASE_URL = process.env.LISTENER_URL || 'https://listener.tokamon.io';

// GET /api/contract — Firestore config → shared/networks.js → contract-address.json → env
app.get('/api/contract', async (req, res) => {
  try {
    // 1. Firestore config (네트워크별)
    const snap = await db.collection(col(req, 'config')).doc('contract').get();
    if (snap.exists) {
      const data = snap.data();
      return res.json({ ...data, listenerUrl: data.listenerUrl || LISTENER_BASE_URL, network: req.networkId });
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
          listenerUrl: LISTENER_BASE_URL,
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

// ─── GeoHash 유틸 (listener-server/utils.js와 동일) ───

const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function encodeGeoHash(lat, lng, precision) {
  precision = precision || 6;
  let latMin = -90, latMax = 90;
  let lngMin = -180, lngMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let isLng = true;
  while (hash.length < precision) {
    if (isLng) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { ch |= (1 << (4 - bit)); lngMin = mid; } else { lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { ch |= (1 << (4 - bit)); latMin = mid; } else { latMax = mid; }
    }
    isLng = !isLng;
    bit++;
    if (bit === 5) { hash += GEOHASH_BASE32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

function decodeGeoHashBounds(hash) {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let isLng = true;
  for (let i = 0; i < hash.length; i++) {
    const idx = GEOHASH_BASE32.indexOf(hash[i]);
    for (let b = 4; b >= 0; b--) {
      if (isLng) {
        const mid = (lngMin + lngMax) / 2;
        if (idx & (1 << b)) lngMin = mid; else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (idx & (1 << b)) latMin = mid; else latMax = mid;
      }
      isLng = !isLng;
    }
  }
  return { latMin, latMax, lngMin, lngMax };
}

function expandGeoHashPrefixes(lat, lng, precision) {
  const center = encodeGeoHash(lat, lng, precision);
  const bounds = decodeGeoHashBounds(center);
  const latC = (bounds.latMin + bounds.latMax) / 2;
  const lngC = (bounds.lngMin + bounds.lngMax) / 2;
  const latStep = bounds.latMax - bounds.latMin;
  const lngStep = bounds.lngMax - bounds.lngMin;
  const neighbors = [center];
  for (let dlat = -1; dlat <= 1; dlat++) {
    for (let dlng = -1; dlng <= 1; dlng++) {
      if (dlat === 0 && dlng === 0) continue;
      let nLat = latC + dlat * latStep;
      let nLng = lngC + dlng * lngStep;
      if (nLng > 180) nLng -= 360;
      if (nLng < -180) nLng += 360;
      if (nLat > 90) nLat = 90;
      if (nLat < -90) nLat = -90;
      neighbors.push(encodeGeoHash(nLat, nLng, precision));
    }
  }
  return neighbors;
}

// ─── 인메모리 스팟 캐시 (30초 TTL) ───

const spotsCacheByNetwork = {};  // { networkId: { spots: [...], geoIndex: {...}, fetchedAt: timestamp } }
const SPOTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5분 (스팟 데이터는 자주 변경되지 않음)

async function getCachedSpots(req) {
  const networkId = req.networkId;
  const cached = spotsCacheByNetwork[networkId];
  if (cached && Date.now() - cached.fetchedAt < SPOTS_CACHE_TTL_MS) {
    return cached;
  }

  const snap = await db.collection(col(req, 'spot_metadata')).get();
  const spots = snap.docs
    .map((d) => ({ ...d.data(), id: Number(d.id) || d.data().id }))
    .filter((s) => s.id != null && (s.reward || 0) > 0)
    .sort((a, b) => a.id - b.id);

  // GeoHash 인덱스 구축
  const geoIdx = {};
  for (const s of spots) {
    if (s.lat != null && s.lng != null) {
      const hash = encodeGeoHash(s.lat, s.lng, 4);
      if (!geoIdx[hash]) geoIdx[hash] = [];
      geoIdx[hash].push(s);
    }
  }

  const entry = { spots, geoIndex: geoIdx, fetchedAt: Date.now() };
  spotsCacheByNetwork[networkId] = entry;
  return entry;
}

function getSpotsByGeoHashFromCache(geoIdx, prefixes) {
  const result = [];
  const seen = new Set();
  for (const prefix of prefixes) {
    for (const key of Object.keys(geoIdx)) {
      if (key.startsWith(prefix)) {
        for (const s of geoIdx[key]) {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            result.push(s);
          }
        }
      }
    }
  }
  return result;
}

function processSpotsForApi(spots, filter, userLat, userLng) {
  const result = [];
  for (const s of spots) {
    const active = (s.remaining || 0) > 0 && isWithinActiveTime(s.start_time, s.end_time, s.daily_start_time, s.daily_end_time, s.utc_offset);
    if (filter === 'active' && !active) continue;
    if (filter === 'inactive' && active) continue;
    const entry = { ...s, active };
    if (userLat != null) {
      entry.distance = Math.round(haversineDistance(userLat, userLng, s.lat, s.lng));
    }
    result.push(entry);
  }
  return result;
}

const ADAPTIVE_PRECISIONS = [5, 4, 3];

// GET /api/spots — 스팟 목록 + active (페이지네이션 지원, listener-server 호환)
// 쿼리: lat, lng (거리 정렬), limit/offset (페이지네이션), filter (active/inactive)
// 하위 호환: limit 없이 호출하면 전체 배열 반환
app.get('/api/spots', async (req, res) => {
  try {
    const { lat, lng, limit, offset, filter } = req.query;
    const hasLocation = lat != null && lng != null;
    const hasPagination = limit != null;

    const rawLimit = parseInt(limit, 10);
    const parsedLimit = Math.min(Math.max(Number.isNaN(rawLimit) ? 50 : rawLimit, 1), 200);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const cached = await getCachedSpots(req);
    let filtered;

    if (hasLocation) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const needed = parsedOffset + parsedLimit;

      // 적응형 GeoHash 검색
      let found = null;
      for (const precision of ADAPTIVE_PRECISIONS) {
        const prefixes = expandGeoHashPrefixes(userLat, userLng, precision);
        const candidates = getSpotsByGeoHashFromCache(cached.geoIndex, prefixes);
        const processed = processSpotsForApi(candidates, filter, userLat, userLng);
        if (processed.length >= needed) {
          processed.sort((a, b) => a.distance - b.distance);
          found = processed;
          break;
        }
      }
      if (!found) {
        // fallback: 전체 조회
        found = processSpotsForApi(cached.spots, filter, userLat, userLng);
        found.sort((a, b) => a.distance - b.distance);
      }
      filtered = found;
    } else {
      filtered = processSpotsForApi(cached.spots, filter, null, null);
    }

    // 페이지네이션 없으면 전체 반환 (하위 호환)
    if (!hasPagination) {
      return res.json(filtered);
    }

    // 페이지네이션 적용
    const total = filtered.length;
    const paged = filtered.slice(parsedOffset, parsedOffset + parsedLimit);

    res.json({
      spots: paged,
      pagination: {
        total,
        offset: parsedOffset,
        limit: parsedLimit,
        hasMore: parsedOffset + parsedLimit < total,
      },
    });
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

// Proxy: /api/faucet/**, /api/spots/** 요청을 Compute Engine VM (listener-server)으로 전달
const LISTENER_URL = process.env.LISTENER_URL || 'https://listener.tokamon.io';
const ALLOWED_PROXY_PREFIXES = ['/api/faucet', '/api/spots'];

exports.listenerProxy = functions.https.onRequest(async (req, res) => {
  try {
    // 경로 검증: 허용된 prefix만 통과 (SSRF 방지)
    const path = decodeURIComponent(req.path).replace(/\.\./g, '').replace(/\/+/g, '/');
    if (!ALLOWED_PROXY_PREFIXES.some((p) => path.startsWith(p))) {
      return res.status(403).json({ error: 'Forbidden path' });
    }

    const targetUrl = `${LISTENER_URL}${path}`;
    const qs = new URLSearchParams(req.query).toString();
    const url = qs ? `${targetUrl}?${qs}` : targetUrl;

    const options = {
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'] || 'application/json',
        'x-forwarded-for': req.ip,
      },
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || 'application/json';
    const body = contentType.includes('json') ? await response.json() : await response.text();

    res.set('Content-Type', contentType);
    res.status(response.status).send(body);
  } catch (error) {
    console.error('listenerProxy error:', error.message);
    res.status(503).json({ error: 'Listener server unavailable' });
  }
});
