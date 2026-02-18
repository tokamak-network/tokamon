const express = require('express');
const crypto = require('crypto');
const blockchain = require('../blockchain');
const { isValidEthAddress, haversineDistance } = require('../utils');
const { sendPushNotification, saveDeviceClaimEvent } = require('../firebase-admin');

const COLLECT_RADIUS = 15;
const CODE_EXPIRY_SECONDS = 180; // 3분
const MAX_VERIFY_ATTEMPTS = 5; // 코드당 최대 시도 횟수
const IS_DEV = process.env.NODE_ENV !== 'production';

function generateVerifyCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashDeviceToken(fcmToken) {
  const salt = process.env.DEVICE_HASH_SALT || process.env.TELEGRAM_HASH_SALT;
  if (!salt) {
    throw new Error('DEVICE_HASH_SALT 또는 TELEGRAM_HASH_SALT 환경변수가 필요합니다.');
  }
  return crypto.createHash('sha256').update(salt + fcmToken).digest('hex');
}

module.exports = function(db) {
  const router = express.Router();

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
  router.post('/request-code', async (req, res) => {
    try {
      const { fcm_token, spot_id, lat, lng } = req.body;

      if (!fcm_token || spot_id == null || lat == null || lng == null) {
        return res.status(400).json({ error: '필수 항목을 입력해주세요' });
      }

      if (typeof fcm_token !== 'string' || fcm_token.length < 1 || fcm_token.length > 4096) {
        return res.status(400).json({ error: 'fcm_token이 올바르지 않습니다' });
      }

      if (!Number.isInteger(spot_id)) {
        return res.status(400).json({ error: 'spot_id는 정수여야 합니다' });
      }

      if (typeof lat !== 'number' || lat < -90 || lat > 90) {
        return res.status(400).json({ error: 'lat는 -90~90 범위의 숫자여야 합니다' });
      }

      if (typeof lng !== 'number' || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'lng는 -180~180 범위의 숫자여야 합니다' });
      }

      const deviceHash = hashDeviceToken(fcm_token);

      // 스팟 조회
      const spot = await blockchain.getSpot(spot_id);
      if (!spot || spot.reward === 0) {
        return res.status(404).json({ error: '스팟을 찾을 수 없습니다' });
      }

      // 거리 확인
      const distance = haversineDistance(lat, lng, spot.lat, spot.lng);
      if (distance > COLLECT_RADIUS) {
        return res.status(400).json({
          error: `너무 멀어요 (${Math.round(distance)}m). 더 가까이 가주세요`,
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
              error: `쿨다운 중입니다 (${hours}시간 ${minutes}분 남음)`,
              cooldown_remaining: canClaim.cooldown_remaining,
            });
          }
          return res.status(400).json({ error: '현재 발행할 수 없습니다 (시간 또는 잔액)' });
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
      await sendPushNotification(
        fcm_token,
        'Tokamon Verification',
        `Verification code: ${code}`,
        { type: 'verify_code', code, spot_id: String(spot_id) }
      );

      res.json({ success: true });
    } catch (err) {
      console.error('device request-code 에러:', err.message);
      res.status(500).json({ error: '인증 코드 요청 실패' });
    }
  });

  // POST /api/device/verify-and-claim - 코드 검증 + claimByDevice 호출
  router.post('/verify-and-claim', async (req, res) => {
    try {
      const { fcm_token, spot_id, code } = req.body;

      if (!fcm_token || spot_id == null || !code) {
        return res.status(400).json({ error: '필수 항목을 입력해주세요' });
      }

      const deviceHash = hashDeviceToken(fcm_token);
      const now = Math.floor(Date.now() / 1000);

      // DB에서 코드 검증 (시도 횟수 제한 포함)
      const row = await new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM device_verify_codes WHERE code = ? AND device_hash = ? AND spot_id = ? AND expires_at > ? AND verified = 0',
          [code, deviceHash, spot_id, now],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      if (!row) {
        // 시도 횟수 증가 (해당 device_hash의 미인증 코드들)
        await new Promise((resolve) => {
          db.run('UPDATE device_verify_codes SET attempts = attempts + 1 WHERE device_hash = ? AND spot_id = ? AND verified = 0 AND expires_at > ?',
            [deviceHash, spot_id, now], () => resolve());
        });
        return res.status(400).json({ error: '인증 코드가 올바르지 않거나 만료되었습니다' });
      }

      if ((row.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
        await new Promise((resolve) => {
          db.run('UPDATE device_verify_codes SET verified = 1 WHERE code = ?', [code], () => resolve());
        });
        return res.status(400).json({ error: '시도 횟수를 초과했습니다. 새 코드를 요청해주세요' });
      }

      // 코드 사용 처리
      await new Promise((resolve, reject) => {
        db.run('UPDATE device_verify_codes SET verified = 1 WHERE code = ?', [code],
          (err) => err ? reject(err) : resolve()
        );
      });

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

      res.json({
        success: true,
        reward: result.reward,
        bonus: result.bonus,
        stamp: result.stamp,
        balance: result.balance,
      });
    } catch (err) {
      console.error('device verify-and-claim 에러:', err.message);
      res.status(500).json({ error: IS_DEV ? '클레임 실패: ' + (err.reason || err.message) : '클레임 실패' });
    }
  });

  // POST /api/device/balance - 디바이스 잔액 조회
  router.post('/balance', async (req, res) => {
    try {
      const { fcm_token } = req.body;

      if (!fcm_token) {
        return res.status(400).json({ error: 'fcm_token이 필요합니다' });
      }

      const deviceHash = hashDeviceToken(fcm_token);
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
      res.status(500).json({ error: '잔액 조회 실패' });
    }
  });

  // POST /api/device/request-link-code - 지갑 연결용 인증 코드 요청 + FCM 푸시 전송
  router.post('/request-link-code', async (req, res) => {
    try {
      const { fcm_token, wallet_address } = req.body;

      if (!fcm_token || !wallet_address) {
        return res.status(400).json({ error: '필수 항목을 입력해주세요' });
      }

      if (!isValidEthAddress(wallet_address)) {
        return res.status(400).json({ error: '올바른 이더리움 주소가 아닙니다' });
      }

      const deviceHash = hashDeviceToken(fcm_token);
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
      await sendPushNotification(
        fcm_token,
        'Tokamon Wallet Verification',
        `Verification code: ${code}`,
        { type: 'wallet_link_code', code, wallet_address }
      );

      res.json({ success: true });
    } catch (err) {
      console.error('device request-link-code 에러:', err.message);
      res.status(500).json({ error: '인증 코드 요청 실패' });
    }
  });

  // POST /api/device/verify-and-link - 코드 검증 + linkDeviceToWallet 호출
  router.post('/verify-and-link', async (req, res) => {
    try {
      const { fcm_token, wallet_address, code } = req.body;

      if (!fcm_token || !wallet_address || !code) {
        return res.status(400).json({ error: '필수 항목을 입력해주세요' });
      }

      if (!isValidEthAddress(wallet_address)) {
        return res.status(400).json({ error: '올바른 이더리움 주소가 아닙니다' });
      }

      const deviceHash = hashDeviceToken(fcm_token);
      const now = Math.floor(Date.now() / 1000);

      // DB에서 코드 검증 (spot_id = -1: 지갑 연결 요청 + wallet_address 일치 확인)
      const row = await new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM device_verify_codes WHERE code = ? AND device_hash = ? AND spot_id = -1 AND wallet_address = ? AND expires_at > ? AND verified = 0',
          [code, deviceHash, wallet_address, now],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      if (!row) {
        // 시도 횟수 증가 (해당 device_hash의 미인증 지갑 링크 코드들)
        await new Promise((resolve) => {
          db.run('UPDATE device_verify_codes SET attempts = attempts + 1 WHERE device_hash = ? AND spot_id = -1 AND verified = 0 AND expires_at > ?',
            [deviceHash, now], () => resolve());
        });
        return res.status(400).json({ error: '인증 코드가 올바르지 않거나 만료되었습니다' });
      }

      if ((row.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
        await new Promise((resolve) => {
          db.run('UPDATE device_verify_codes SET verified = 1 WHERE code = ?', [code], () => resolve());
        });
        return res.status(400).json({ error: '시도 횟수를 초과했습니다. 새 코드를 요청해주세요' });
      }

      // 코드 사용 처리
      await new Promise((resolve, reject) => {
        db.run('UPDATE device_verify_codes SET verified = 1 WHERE code = ?', [code],
          (err) => err ? reject(err) : resolve()
        );
      });

      // linkDeviceToWallet 호출
      const result = await blockchain.linkDeviceToWallet(deviceHash, wallet_address);

      res.json({
        success: true,
        device_hash: deviceHash,
        wallet: wallet_address,
      });
    } catch (err) {
      console.error('device verify-and-link 에러:', err.message);
      res.status(500).json({ error: IS_DEV ? '지갑 연결 실패: ' + (err.reason || err.message) : '지갑 연결 실패' });
    }
  });

  return router;
};
