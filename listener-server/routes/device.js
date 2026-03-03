const express = require('express');
const crypto = require('crypto');
const blockchain = require('../blockchain');
const { isValidEthAddress, haversineDistance } = require('../utils');
const { sendPushNotification, saveDeviceClaimEvent, saveDeviceAttestKey, updateDeviceAttestKeySignCount } = require('../firebase-admin');
const { verifyPlayIntegrity, verifyIosAttestation, verifyIosAssertion, generateChallenge } = require('../attestation');

const COLLECT_RADIUS = 15;
const CODE_EXPIRY_SECONDS = 180; // 3분
const MAX_VERIFY_ATTEMPTS = 5; // 코드당 최대 시도 횟수
const IS_DEV = process.env.NODE_ENV !== 'production';

// device_id 기반 Rate Limiting
// 모바일 환경: 통신사 CGNAT로 수천 명이 같은 IP 공유 → IP 제한 부적합
const rateLimits = new Map();
const RATE_WINDOW_MS = 60 * 1000; // 1분
const MAX_MAP_SIZE = 100000; // 메모리 보호

// 만료된 항목 주기적 정리
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now - entry.start > RATE_WINDOW_MS) rateLimits.delete(key);
  }
}, RATE_WINDOW_MS);

function checkRate(key, max) {
  // Map 크기 제한 (M-7 메모리 DoS 방지)
  if (rateLimits.size > MAX_MAP_SIZE) return false;

  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    rateLimits.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

function endpointRateLimit(maxPerMinute) {
  return (req, res, next) => {
    const deviceId = req.body?.device_id;

    if (deviceId && !checkRate(`dev:${deviceId}:${req.path}`, maxPerMinute)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later' });
    }

    return next();
  };
}

function generateVerifyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 문자 제외 (0/O, 1/I)
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return code;
}

function hashDeviceId(deviceId) {
  const salt = process.env.DEVICE_HASH_SALT;
  if (!salt) {
    throw new Error('DEVICE_HASH_SALT env variable is required.');
  }
  return crypto.createHash('sha256').update(salt + deviceId).digest('hex');
}

// 디바이스 검증 미들웨어 (Play Integrity / App Attest)
// REQUIRE_ATTESTATION: 'false' (passthrough) / 'log' (log only) / 'true' (enforce)
const REQUIRE_ATTESTATION = process.env.REQUIRE_ATTESTATION || 'false';

// iOS attestation challenge 저장 (in-memory, 60s TTL)
const attestChallenges = new Map();
const CHALLENGE_TTL_MS = 60 * 1000;

// 만료 challenge 정리 (60초마다)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attestChallenges) {
    if (now - entry.created > CHALLENGE_TTL_MS) attestChallenges.delete(key);
  }
}, CHALLENGE_TTL_MS);

function makeAttestationMiddleware(db) {
  return async function verifyAttestation(req, res, next) {
    if (REQUIRE_ATTESTATION === 'false') return next();

    const token = req.headers['x-attestation-token'];
    const platform = req.headers['x-attestation-platform']; // 'android' | 'ios'

    if (!token || !platform) {
      if (REQUIRE_ATTESTATION === 'log') {
        console.warn('[Attestation] Missing headers, allowing (log mode)');
        return next();
      }
      return res.status(403).json({ error: 'Device attestation required', code: 'ATTEST_REQUIRED' });
    }

    try {
      if (platform === 'android') {
        const nonce = req.headers['x-attestation-nonce'];
        if (!nonce) throw new Error('Missing nonce header');

        const result = await verifyPlayIntegrity(token, nonce);
        if (!result.valid) throw new Error(result.error || 'Play Integrity check failed');

      } else if (platform === 'ios') {
        const keyId = req.headers['x-attestation-key-id'];
        const clientDataHash = req.headers['x-attestation-client-data'];
        if (!keyId || !clientDataHash) throw new Error('Missing iOS attestation headers');

        // DB에서 등록된 publicKey 조회
        const row = await new Promise((resolve, reject) => {
          db.get('SELECT public_key_pem, sign_count FROM device_attest_keys WHERE key_id = ?', [keyId], (err, r) => {
            if (err) reject(err); else resolve(r);
          });
        });

        if (!row) {
          if (REQUIRE_ATTESTATION === 'log') {
            console.warn(`[Attestation] iOS key ${keyId} not registered, allowing (log mode)`);
            return next();
          }
          return res.status(403).json({ error: 'Device not attested', code: 'ATTEST_REQUIRED' });
        }

        const result = await verifyIosAssertion(token, clientDataHash, row.public_key_pem, row.sign_count);
        if (!result.valid) throw new Error('iOS assertion verification failed');

        // signCount 업데이트
        const now = Math.floor(Date.now() / 1000);
        await new Promise((resolve) => {
          db.run('UPDATE device_attest_keys SET sign_count = ?, updated_at = ? WHERE key_id = ?',
            [result.newSignCount, now, keyId], () => resolve());
        });

        // Firestore signCount 동기화 (비동기, device_hash로 조회)
        const deviceHashForKey = await new Promise((resolve) => {
          db.get('SELECT device_hash FROM device_attest_keys WHERE key_id = ?', [keyId], (_, r) => resolve(r?.device_hash));
        });
        if (deviceHashForKey) {
          updateDeviceAttestKeySignCount(deviceHashForKey, result.newSignCount)
            .catch(e => console.error('[Attestation] Firestore signCount 동기화 실패:', e.message));
        }

      } else {
        return res.status(400).json({ error: 'Unknown platform' });
      }

      return next();
    } catch (err) {
      console.error('[Attestation] 검증 실패:', err.message);
      if (REQUIRE_ATTESTATION === 'log') {
        console.warn('[Attestation] Allowing request despite failure (log mode)');
        return next();
      }
      return res.status(403).json({ error: 'Device attestation failed', code: 'ATTEST_REQUIRED' });
    }
  };
}

module.exports = function(db) {
  const router = express.Router();

  // ─── iOS App Attest: challenge/register (attestation 미들웨어 적용 전) ───

  // POST /api/device/attest-challenge — challenge 생성
  router.post('/attest-challenge', endpointRateLimit(10), (req, res) => {
    const challenge = generateChallenge();
    const id = crypto.randomBytes(16).toString('hex');
    attestChallenges.set(id, { challenge, created: Date.now() });
    res.json({ challenge_id: id, challenge });
  });

  // POST /api/device/attest-register — iOS attestation 검증 + publicKey 저장
  router.post('/attest-register', endpointRateLimit(5), async (req, res) => {
    try {
      const { device_id, key_id, attestation, challenge_id } = req.body;

      if (!device_id || !key_id || !attestation || !challenge_id) {
        return res.status(400).json({ error: 'Required fields are missing' });
      }

      // challenge 조회 & 소비
      const entry = attestChallenges.get(challenge_id);
      if (!entry) {
        return res.status(400).json({ error: 'Invalid or expired challenge' });
      }
      attestChallenges.delete(challenge_id);

      // TTL 검증
      if (Date.now() - entry.created > CHALLENGE_TTL_MS) {
        return res.status(400).json({ error: 'Challenge expired' });
      }

      // Apple App Attest 검증
      const result = await verifyIosAttestation(key_id, entry.challenge, attestation);

      // DB에 publicKey 저장
      const deviceHash = hashDeviceId(device_id);
      const now = Math.floor(Date.now() / 1000);
      const receiptStr = result.receipt ? Buffer.from(result.receipt).toString('base64') : null;

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO device_attest_keys (device_hash, key_id, public_key_pem, receipt, sign_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)
           ON CONFLICT(device_hash) DO UPDATE SET key_id = ?, public_key_pem = ?, receipt = ?, sign_count = 0, updated_at = ?`,
          [deviceHash, key_id, result.publicKeyPem, receiptStr, now, now,
           key_id, result.publicKeyPem, receiptStr, now],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Firestore 백업 (비동기, 실패해도 등록은 성공)
      saveDeviceAttestKey(deviceHash, {
        key_id, public_key_pem: result.publicKeyPem, receipt: receiptStr,
        sign_count: 0, created_at: now, updated_at: now,
      }).catch(e => console.error('[Attestation] Firestore 백업 실패:', e.message));

      console.log(`[Attestation] iOS device registered: ${deviceHash.slice(0, 12)}...`);
      res.json({ attested: true });
    } catch (err) {
      console.error('[Attestation] iOS registration failed:', err.message);
      res.status(403).json({ error: 'Attestation verification failed' });
    }
  });

  // ─── 디바이스 검증 미들웨어 (challenge/register 이후 라우트에 적용) ───
  router.use(makeAttestationMiddleware(db));

  // 만료된 인증 코드 주기적 정리 (10분마다)
  setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    db.run('DELETE FROM device_verify_codes WHERE expires_at < ?', [now], (err) => {
      if (!err) {
        db.get('SELECT changes() AS deleted', (_, row) => {
          if (row && row.deleted > 0) {
            console.log(`[Cleanup] 만료된 인증 코드 ${row.deleted}건 삭제`);
          }
        });
      }
    });
  }, 10 * 60 * 1000);

  // POST /api/device/request-code - 인증 코드 요청 + FCM 푸시 전송
  router.post('/request-code', endpointRateLimit(8), async (req, res) => {
    try {
      const { device_id, fcm_token, spot_id, lat, lng } = req.body;

      if (!device_id || !fcm_token || spot_id == null || lat == null || lng == null) {
        return res.status(400).json({ error: 'Required fields are missing' });
      }

      if (!Number.isInteger(spot_id)) {
        return res.status(400).json({ error: 'spot_id must be an integer' });
      }

      if (typeof lat !== 'number' || lat < -90 || lat > 90) {
        return res.status(400).json({ error: 'lat must be a number between -90 and 90' });
      }

      if (typeof lng !== 'number' || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'lng must be a number between -180 and 180' });
      }

      const deviceHash = hashDeviceId(device_id);

      // 스팟 조회
      const spot = await blockchain.getSpot(spot_id);
      if (!spot || spot.reward === 0) {
        return res.status(404).json({ error: 'Spot not found' });
      }

      // 거리 확인
      const distance = haversineDistance(lat, lng, spot.lat, spot.lng);
      if (distance > COLLECT_RADIUS) {
        return res.status(400).json({
          error: `Too far (${Math.round(distance)}m). Please get closer`,
          distance: Math.round(distance),
        });
      }

      // 발행 가능 여부 확인 (시간 + 쿨다운 + 교차 쿨다운 + 잔액 — 컨트랙트에서 일괄 체크)
      try {
        const canClaim = await blockchain.canClaimDevice(spot_id, deviceHash);
        if (!canClaim.claimable) {
          if (canClaim.cooldown_remaining > 0) {
            const hours = Math.floor(canClaim.cooldown_remaining / 3600);
            const minutes = Math.floor((canClaim.cooldown_remaining % 3600) / 60);
            return res.status(400).json({
              error: `Cooldown active (${hours}h ${minutes}m remaining)`,
              cooldown_remaining: canClaim.cooldown_remaining,
            });
          }
          return res.status(400).json({ error: 'Cannot claim right now (time or balance)' });
        }
      } catch (e) {
        console.warn('canClaimDevice 실패:', e.message);
      }

      // 인증 코드 생성
      const code = generateVerifyCode();
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + CODE_EXPIRY_SECONDS;

      // DB에 저장
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO device_verify_codes (code, device_hash, spot_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
          [code, deviceHash, spot_id, now, expiresAt],
          (err) => err ? reject(err) : resolve()
        );
      });

      // FCM 푸시 전송 (모바일: 인증번호는 푸시로만 전달)
      const pushSent = await sendPushNotification(
        fcm_token,
        'Tokamon Verification',
        `Verification code: ${code}`,
        { type: 'verify_code', code, spot_id: String(spot_id) }
      );

      if (!pushSent) {
        return res.status(502).json({ error: 'Failed to send push notification' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('device request-code 에러:', err.message);
      res.status(500).json({ error: 'Failed to request verification code' });
    }
  });

  // POST /api/device/verify-and-claim - 코드 검증 + claimByDevice 호출
  router.post('/verify-and-claim', endpointRateLimit(10), async (req, res) => {
    try {
      const { device_id, spot_id, code } = req.body;

      if (!device_id || spot_id == null || !code) {
        return res.status(400).json({ error: 'Required fields are missing' });
      }

      const deviceHash = hashDeviceId(device_id);
      const now = Math.floor(Date.now() / 1000);

      // 원자적 코드 검증: UPDATE 먼저 실행하여 레이스 컨디션 방지
      // attempts < MAX_VERIFY_ATTEMPTS 조건으로 시도 횟수 초과도 동시 차단
      const claimed = await new Promise((resolve, reject) => {
        db.run(
          'UPDATE device_verify_codes SET verified = 1 WHERE code = ? AND device_hash = ? AND spot_id = ? AND expires_at > ? AND verified = 0 AND attempts < ?',
          [code, deviceHash, spot_id, now, MAX_VERIFY_ATTEMPTS],
          function(err) { err ? reject(err) : resolve(this.changes); }
        );
      });

      if (claimed === 0) {
        // 실패 시 시도 횟수 증가
        await new Promise((resolve) => {
          db.run('UPDATE device_verify_codes SET attempts = attempts + 1 WHERE device_hash = ? AND spot_id = ? AND verified = 0 AND expires_at > ?',
            [deviceHash, spot_id, now], () => resolve());
        });
        // 시도 초과 여부 확인하여 적절한 에러 메시지 반환
        const existing = await new Promise((resolve) => {
          db.get('SELECT attempts FROM device_verify_codes WHERE device_hash = ? AND spot_id = ? AND expires_at > ?',
            [deviceHash, spot_id, now], (_, row) => resolve(row));
        });
        if (existing && existing.attempts >= MAX_VERIFY_ATTEMPTS) {
          return res.status(400).json({ error: 'Too many attempts. Please request a new code' });
        }
        return res.status(400).json({ error: 'Invalid or expired verification code' });
      }

      // claimByDevice 호출
      const result = await blockchain.claimByDevice(spot_id, deviceHash);

      // Firestore에 이벤트 저장
      await saveDeviceClaimEvent({
        spotId: spot_id,
        deviceHash,
        reward: result.reward,
        bonus: result.bonus,
        stamp: result.stamp,
      });

      // 지갑 연결 여부 확인 (클라이언트 경고용)
      let hasLinkedWallet = false;
      try {
        const wallet = await blockchain.getDeviceLinkedWallet(deviceHash);
        const zeroAddr = '0x0000000000000000000000000000000000000000';
        hasLinkedWallet = !!wallet && wallet !== zeroAddr;
      } catch (_) {}

      res.json({
        success: true,
        reward: result.reward,
        bonus: result.bonus,
        stamp: result.stamp,
        balance: result.balance,
        has_linked_wallet: hasLinkedWallet,
      });
    } catch (err) {
      console.error('device verify-and-claim 에러:', err.message);
      res.status(500).json({ error: IS_DEV ? 'Claim failed: ' + (err.reason || err.message) : 'Claim failed' });
    }
  });

  // POST /api/device/balance - 디바이스 잔액 조회
  router.post('/balance', async (req, res) => {
    try {
      const { device_id } = req.body;

      if (!device_id) {
        return res.status(400).json({ error: 'device_id is required' });
      }

      const deviceHash = hashDeviceId(device_id);
      const balance = await blockchain.getDeviceBalance(deviceHash);

      // linked wallet 조회
      let linked_wallet = null;
      try {
        const wallet = await blockchain.getDeviceLinkedWallet(deviceHash);
        const zeroAddr = '0x0000000000000000000000000000000000000000';
        if (wallet && wallet !== zeroAddr) {
          linked_wallet = wallet;
        }
      } catch (e) {
        console.warn('getDeviceLinkedWallet 실패:', e.message);
      }

      res.json({ balance, device_hash: deviceHash, linked_wallet });
    } catch (err) {
      console.error('device balance 에러:', err.message);
      res.status(500).json({ error: 'Failed to fetch balance' });
    }
  });

  // POST /api/device/stamp-info - 디바이스 스탬프/쿨다운 조회
  router.post('/stamp-info', async (req, res) => {
    try {
      const { device_id, spot_id } = req.body;

      if (!device_id || spot_id == null) {
        return res.status(400).json({ error: 'Required fields are missing' });
      }

      const deviceHash = hashDeviceId(device_id);
      const info = await blockchain.getDeviceStampInfo(spot_id, deviceHash);

      res.json(info);
    } catch (err) {
      console.error('device stamp-info error:', err.message);
      res.status(500).json({ error: 'Failed to fetch stamp info' });
    }
  });

  // POST /api/device/request-link-code - 지갑 연결용 인증 코드 요청 + FCM 푸시 전송
  router.post('/request-link-code', endpointRateLimit(8), async (req, res) => {
    try {
      const { device_id, fcm_token, wallet_address } = req.body;

      if (!device_id || !fcm_token || !wallet_address) {
        return res.status(400).json({ error: 'Required fields are missing' });
      }

      if (!isValidEthAddress(wallet_address)) {
        return res.status(400).json({ error: 'Invalid Ethereum address' });
      }

      const deviceHash = hashDeviceId(device_id);

      // 다른 디바이스가 이 지갑을 쓰고 있고 잔액이 있으면 차단
      const walletCheck = await blockchain.checkWalletAvailability(wallet_address, 'device', deviceHash);
      if (!walletCheck.available) {
        return res.status(409).json({ error: walletCheck.reason });
      }

      const now = Math.floor(Date.now() / 1000);

      // 기존 미사용 코드가 있으면 무효화 (중복 요청 방지)
      await new Promise((resolve) => {
        db.run('UPDATE device_verify_codes SET verified = 1 WHERE device_hash = ? AND spot_id = -1 AND verified = 0 AND expires_at > ?',
          [deviceHash, now], () => resolve());
      });

      // 인증 코드 생성
      const code = generateVerifyCode();
      const expiresAt = now + CODE_EXPIRY_SECONDS;

      // DB에 저장 (spot_id = -1: 지갑 연결 요청 구분용 센티넬값, wallet_address 포함)
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO device_verify_codes (code, device_hash, spot_id, wallet_address, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
          [code, deviceHash, -1, wallet_address, now, expiresAt],
          (err) => err ? reject(err) : resolve()
        );
      });

      // FCM 푸시 전송 (모바일: 인증번호는 푸시로만 전달)
      const pushSent = await sendPushNotification(
        fcm_token,
        'Tokamon Wallet Verification',
        `Verification code: ${code}`,
        { type: 'wallet_link_code', code, wallet_address }
      );

      if (!pushSent) {
        return res.status(502).json({ error: 'Failed to send push notification' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('device request-link-code 에러:', err.message);
      res.status(500).json({ error: 'Failed to request verification code' });
    }
  });

  // POST /api/device/verify-and-link - 코드 검증 + linkDeviceToWallet 호출
  router.post('/verify-and-link', endpointRateLimit(10), async (req, res) => {
    try {
      const { device_id, wallet_address, code } = req.body;

      if (!device_id || !wallet_address || !code) {
        return res.status(400).json({ error: 'Required fields are missing' });
      }

      if (!isValidEthAddress(wallet_address)) {
        return res.status(400).json({ error: 'Invalid Ethereum address' });
      }

      const deviceHash = hashDeviceId(device_id);
      const now = Math.floor(Date.now() / 1000);

      // 원자적 코드 검증: UPDATE 먼저 실행하여 레이스 컨디션 방지
      const claimed = await new Promise((resolve, reject) => {
        db.run(
          'UPDATE device_verify_codes SET verified = 1 WHERE code = ? AND device_hash = ? AND spot_id = -1 AND wallet_address = ? AND expires_at > ? AND verified = 0 AND attempts < ?',
          [code, deviceHash, wallet_address, now, MAX_VERIFY_ATTEMPTS],
          function(err) { err ? reject(err) : resolve(this.changes); }
        );
      });

      if (claimed === 0) {
        // 실패 시 시도 횟수 증가
        await new Promise((resolve) => {
          db.run('UPDATE device_verify_codes SET attempts = attempts + 1 WHERE device_hash = ? AND spot_id = -1 AND verified = 0 AND expires_at > ?',
            [deviceHash, now], () => resolve());
        });
        const existing = await new Promise((resolve) => {
          db.get('SELECT attempts FROM device_verify_codes WHERE device_hash = ? AND spot_id = -1 AND expires_at > ?',
            [deviceHash, now], (_, row) => resolve(row));
        });
        if (existing && existing.attempts >= MAX_VERIFY_ATTEMPTS) {
          return res.status(400).json({ error: 'Too many attempts. Please request a new code' });
        }
        return res.status(400).json({ error: 'Invalid or expired verification code' });
      }

      // 다른 디바이스가 이 지갑을 쓰고 있고 잔액이 있으면 차단 (코드 발급 후 상태 변경 가능하므로 재검증)
      const walletCheck = await blockchain.checkWalletAvailability(wallet_address, 'device', deviceHash);
      if (!walletCheck.available) {
        return res.status(409).json({ error: walletCheck.reason });
      }

      // linkDeviceToWallet 호출
      const result = await blockchain.linkDeviceToWallet(deviceHash, wallet_address);

      res.json({
        success: true,
        wallet: wallet_address,
      });
    } catch (err) {
      console.error('device verify-and-link 에러:', err.message);
      res.status(500).json({ error: IS_DEV ? 'Wallet link failed: ' + (err.reason || err.message) : 'Wallet link failed' });
    }
  });

  return router;
};
