const express = require('express');
const crypto = require('crypto');
const blockchain = require('../blockchain');
const { isValidEthAddress, haversineDistance, isWithinTimeRange } = require('../utils');
const { sendPushNotification, saveDeviceClaimEvent } = require('../firebase-admin');

const COLLECT_RADIUS = 15;
const CODE_EXPIRY_SECONDS = 180; // 3분

function generateVerifyCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

  // POST /api/device/request-code - 인증 코드 요청 + FCM 푸시 전송
  router.post('/request-code', async (req, res) => {
    try {
      const { fcm_token, spot_id, lat, lng } = req.body;

      if (!fcm_token || spot_id == null || lat == null || lng == null) {
        return res.status(400).json({ error: '필수 항목을 입력해주세요' });
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

      // 시간 확인
      if (!isWithinTimeRange(spot.start_time, spot.end_time)) {
        return res.status(400).json({ error: '활성 시간이 아닙니다' });
      }

      // 쿨다운 확인
      if (!spot.allow_duplicate_claims) {
        try {
          const stampInfo = await blockchain.getDeviceStampInfo(spot_id, deviceHash);
          if (stampInfo.cooldown_remaining > 0) {
            const hours = Math.floor(stampInfo.cooldown_remaining / 3600);
            const minutes = Math.floor((stampInfo.cooldown_remaining % 3600) / 60);
            return res.status(400).json({
              error: `쿨다운 중입니다 (${hours}시간 ${minutes}분 남음)`,
              cooldown_remaining: stampInfo.cooldown_remaining,
            });
          }
        } catch (_) {
          // getDeviceStampInfo가 없을 수 있음 - 무시
        }
      }

      // 잔액 확인
      if (spot.remaining < spot.reward) {
        return res.status(400).json({ error: '이 스팟의 TON이 소진되었습니다' });
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

      // FCM 푸시 전송
      const sent = await sendPushNotification(
        fcm_token,
        'Tokamon 인증',
        `인증번호: ${code}`,
        { type: 'verify_code', code, spot_id: String(spot_id) }
      );

      // FCM 전송 실패 시에만 debug_code 반환 (개발 환경 전용)
      const response = { success: true, message: '인증 코드가 전송되었습니다' };
      if (!sent) {
        response.debug_code = code;
        response.message = '푸시 전송 실패 - 디버그 코드 포함';
      }

      res.json(response);
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

      // DB에서 코드 검증
      const row = await new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM device_verify_codes WHERE code = ? AND device_hash = ? AND spot_id = ? AND expires_at > ? AND verified = 0',
          [code, deviceHash, spot_id, now],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      if (!row) {
        return res.status(400).json({ error: '인증 코드가 올바르지 않거나 만료되었습니다' });
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
      res.status(500).json({ error: '클레임 실패: ' + (err.reason || err.message) });
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

      res.json({ balance, device_hash: deviceHash });
    } catch (err) {
      console.error('device balance 에러:', err.message);
      res.status(500).json({ error: '잔액 조회 실패' });
    }
  });

  // POST /api/device/link-wallet - 디바이스를 지갑에 연결
  router.post('/link-wallet', async (req, res) => {
    try {
      const { fcm_token, wallet_address } = req.body;

      if (!fcm_token || !wallet_address) {
        return res.status(400).json({ error: '필수 항목을 입력해주세요' });
      }

      if (!isValidEthAddress(wallet_address)) {
        return res.status(400).json({ error: '올바른 이더리움 주소가 아닙니다' });
      }

      const deviceHash = hashDeviceToken(fcm_token);
      const result = await blockchain.linkDeviceToWallet(deviceHash, wallet_address);

      res.json({
        success: true,
        device_hash: deviceHash,
        wallet: wallet_address,
      });
    } catch (err) {
      console.error('device link-wallet 에러:', err.message);
      res.status(500).json({ error: '지갑 연결 실패: ' + (err.reason || err.message) });
    }
  });

  return router;
};
