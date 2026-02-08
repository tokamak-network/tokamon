const express = require('express');
const blockchain = require('../blockchain');
const { haversineDistance, isWithinTimeRange, hashPhoneNumber, isValidPhoneNumber } = require('../utils');

const router = express.Router();

const COLLECT_RADIUS = 50;

// POST /api/kiosk/balance - 핸드폰 번호 잔액 조회
router.post('/balance', async (req, res) => {
  try {
    const { phone_number } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: '핸드폰 번호를 입력해주세요' });
    }

    // 핸드폰 번호 형식 검증
    if (!isValidPhoneNumber(phone_number)) {
      return res.status(400).json({ error: '올바른 핸드폰 번호 형식이 아닙니다 (예: 01012345678)' });
    }

    // 핸드폰 번호 해싱
    const phoneHash = hashPhoneNumber(phone_number);

    // 잔액 조회
    const balance = await blockchain.getPhoneBalance(phoneHash);

    res.json({ balance });
  } catch (err) {
    console.error('잔액 조회 에러:', err.message);
    res.status(500).json({ error: err.message || '잔액 조회 실패' });
  }
});

// POST /api/kiosk/stamp-info - 핸드폰 번호 스탬프 정보 조회
router.post('/stamp-info', async (req, res) => {
  try {
    const { phone_number, spot_id } = req.body;

    if (!phone_number || spot_id == null) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요' });
    }

    // 핸드폰 번호 형식 검증
    if (!isValidPhoneNumber(phone_number)) {
      return res.status(400).json({ error: '올바른 핸드폰 번호 형식이 아닙니다' });
    }

    // 핸드폰 번호 해싱
    const phoneHash = hashPhoneNumber(phone_number);

    // 스탬프 정보 조회
    const stampInfo = await blockchain.getPhoneStampInfo(spot_id, phoneHash);

    res.json(stampInfo);
  } catch (err) {
    console.error('스탬프 정보 조회 에러:', err.message);
    res.status(500).json({ error: err.message || '스탬프 정보 조회 실패' });
  }
});

// POST /api/kiosk/claim - 핸드폰 번호로 클레임
router.post('/claim', async (req, res) => {
  try {
    const { phone_number, spot_id, lat, lng } = req.body;

    if (!phone_number || spot_id == null || lat == null || lng == null) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요' });
    }

    // 핸드폰 번호 형식 검증
    if (!isValidPhoneNumber(phone_number)) {
      return res.status(400).json({ error: '올바른 핸드폰 번호 형식이 아닙니다 (예: 01012345678)' });
    }

    // 핸드폰 번호 해싱
    const phoneHash = hashPhoneNumber(phone_number);

    // 블록체인에서 스팟 조회
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
      return res.status(400).json({
        error: `활성 시간이 아닙니다 (${spot.start_time}~${spot.end_time})`,
      });
    }

    // 쿨다운 확인
    const stampInfo = await blockchain.getPhoneStampInfo(spot_id, phoneHash);
    if (stampInfo.cooldown_remaining > 0) {
      const hours = Math.floor(stampInfo.cooldown_remaining / 3600);
      const minutes = Math.floor((stampInfo.cooldown_remaining % 3600) / 60);
      return res.status(400).json({
        error: `쿨다운 중입니다 (${hours}시간 ${minutes}분 남음)`,
        cooldown_remaining: stampInfo.cooldown_remaining,
      });
    }

    // 잔액 확인
    if (spot.remaining < spot.reward) {
      return res.status(400).json({ error: '이 스팟의 TON이 소진되었습니다' });
    }

    // 컨트랙트 클레임 실행
    const result = await blockchain.claimToPhone(spot_id, phoneHash);

    // 응답 구성
    const totalPayout = result.reward + result.bonus;
    let message;
    if (result.bonus > 0) {
      message = `스탬프 달성! ${totalPayout} TON 적립 완료!`;
    } else {
      message = `${result.reward} TON 적립 완료!`;
    }

    res.json({
      message,
      reward: result.reward,
      bonus: result.bonus,
      stamp: result.stamp,
      stamp_goal: spot.stamp_goal,
      balance: result.balance,
      spot_name: spot.name,
    });
  } catch (err) {
    console.error('클레임 에러:', err.message);
    res.status(500).json({ error: err.message || '클레임 실패' });
  }
});

module.exports = router;
