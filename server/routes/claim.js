const express = require('express');
const blockchain = require('../blockchain');
const { haversineDistance, isWithinTimeRange, isSpeedValid } = require('../utils');

const router = express.Router();

const COLLECT_RADIUS = 50;

// 인메모리 위치 로그 (서버 재시작 시 초기화, 데모용)
const locationLogs = new Map();

// POST /api/claim/request — 클레임 (쿨다운 + 스탬프 시스템)
router.post('/request', async (req, res) => {
  try {
    const { user_address, spot_id, lat, lng } = req.body;

    if (!user_address || spot_id == null || lat == null || lng == null) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요' });
    }

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

    // 속도 체크 (인메모리)
    const now = new Date().toISOString();
    const prevLog = locationLogs.get(user_address);

    if (prevLog) {
      if (!isSpeedValid(prevLog.lat, prevLog.lng, prevLog.timestamp, lat, lng, now)) {
        return res.status(400).json({ error: '비정상적 이동 속도가 감지되었습니다' });
      }
    }

    // 위치 로그 갱신
    locationLogs.set(user_address, { lat, lng, timestamp: now });

    // 쿨다운 확인
    const stampInfo = await blockchain.getStampInfo(spot_id, user_address);
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
    const result = await blockchain.claim(spot_id, user_address);

    // 응답 구성
    const totalPayout = result.reward + result.bonus;
    let message;
    if (result.bonus > 0) {
      message = `스탬프 달성! ${totalPayout} TON 클레임 성공!`;
    } else {
      message = `${result.reward} TON 클레임 성공!`;
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

// GET /api/claim/history
router.get('/history', async (req, res) => {
  try {
    const { user_address } = req.query;
    if (!user_address) {
      return res.status(400).json({ error: 'user_address가 필요합니다' });
    }

    const history = await blockchain.getClaimHistory(user_address);
    res.json(history);
  } catch (err) {
    console.error('히스토리 에러:', err.message);
    res.status(500).json({ error: '히스토리 조회 실패' });
  }
});

module.exports = router;
