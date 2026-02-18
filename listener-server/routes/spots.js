const express = require('express');
const blockchain = require('../blockchain');
const { isWithinActiveTime } = require('../utils');

const router = express.Router();

// GET /api/spots — 스팟 목록
router.get('/', async (req, res) => {
  try {
    const spots = await blockchain.getAllSpots();

    const result = spots.map((s) => ({
      ...s,
      active: s.remaining > 0 && isWithinActiveTime(s.start_time, s.end_time, s.daily_start_time, s.daily_end_time, s.utc_offset),
    }));

    console.log('[API] GET /api/spots 반환', result.map((s) => ({
      id: s.id,
      name: s.name,
      allow_duplicate_claims: s.allow_duplicate_claims,
    })));
    res.json(result);
  } catch (err) {
    console.error('스팟 목록 에러:', err.message);
    res.status(500).json({ error: '스팟 목록 조회 실패' });
  }
});

// POST /api/spots/:id/allow-duplicate-claims — 중복 발행 허용 여부 수정
router.post('/:id/allow-duplicate-claims', async (req, res) => {
  try {
    const spotId = Number(req.params.id);
    const { allow } = req.body;

    if (allow === undefined || allow === null) {
      return res.status(400).json({ error: 'allow 값을 입력해주세요' });
    }

    // 스팟 존재 확인
    const spot = await blockchain.getSpot(spotId);
    if (!spot || spot.reward === 0) {
      return res.status(404).json({ error: '스팟을 찾을 수 없습니다' });
    }

    await blockchain.updateAllowDuplicateClaims(spotId, allow);

    res.json({
      message: `중복 발행 허용 여부가 ${allow ? '활성화' : '비활성화'}되었습니다`,
      spot_id: spotId,
      allow_duplicate_claims: allow,
    });
  } catch (err) {
    console.error('중복 발행 설정 에러:', err.message);
    res.status(500).json({ error: err.message || '중복 발행 설정 실패' });
  }
});

module.exports = router;
