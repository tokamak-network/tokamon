const express = require('express');
const blockchain = require('../blockchain');
const { isWithinTimeRange } = require('../utils');

const router = express.Router();

// GET /api/spots — 스팟 목록
router.get('/', async (req, res) => {
  try {
    const spots = await blockchain.getAllSpots();

    const result = spots.map((s) => ({
      ...s,
      active: s.remaining > 0 && isWithinTimeRange(s.start_time, s.end_time),
    }));

    res.json(result);
  } catch (err) {
    console.error('스팟 목록 에러:', err.message);
    res.status(500).json({ error: '스팟 목록 조회 실패' });
  }
});

// POST /api/spots/metadata — 클라이언트가 온체인 스팟 생성 후 메타데이터 등록
router.post('/metadata', async (req, res) => {
  try {
    const { spot_id, name, description, lat, lng, start_time, end_time } = req.body;

    console.log('=== 메타데이터 등록 요청 ===');
    console.log('spot_id:', spot_id);
    console.log('name:', name);
    console.log('description:', description);
    console.log('lat:', lat);
    console.log('lng:', lng);
    console.log('start_time:', start_time);
    console.log('end_time:', end_time);

    if (spot_id === undefined || spot_id === null) {
      return res.status(400).json({ error: 'spot_id가 필요합니다' });
    }

    const fs = require('fs');
    const path = require('path');
    const METADATA_PATH = process.env.METADATA_PATH ||
      path.join(__dirname, '..', 'spot-metadata.json');

    let metadata = {};
    try {
      if (fs.existsSync(METADATA_PATH)) {
        metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
      }
    } catch (e) {}

    const newMetadata = {
      name: name || `Spot ${spot_id}`,
      description: description || '',
      lat: Number(lat) || 0,
      lng: Number(lng) || 0,
      start_time: start_time || '00:00',
      end_time: end_time || '23:59',
    };

    metadata[spot_id] = newMetadata;

    console.log('저장할 메타데이터:', metadata[spot_id]);

    fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));

    // ✅ 중요: blockchain 모듈의 메타데이터도 업데이트
    blockchain.updateMetadata(spot_id, newMetadata);

    console.log('메타데이터 등록 완료');

    res.json({ message: '메타데이터 등록 완료', spot_id });
  } catch (err) {
    console.error('메타데이터 등록 에러:', err.message);
    res.status(500).json({ error: '메타데이터 등록 실패' });
  }
});

// POST /api/spots — 스팟 생성 (스탬프 시스템 포함)
router.post('/', async (req, res) => {
  try {
    const {
      name, description, lat, lng,
      start_time, end_time,
      deposit, reward,
      stamp_goal, stamp_bonus, cooldown,
      allow_duplicate_claims,
      creator_address,
    } = req.body;

    if (!name || !lat || !lng || !start_time || !end_time || !creator_address) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요' });
    }

    const depositAmount = Number(deposit);
    const rewardAmount = Number(reward);
    const stampGoal = Number(stamp_goal);
    const stampBonus = Number(stamp_bonus) || 0;
    const cooldownSec = Number(cooldown) || 86400; // 기본 24시간
    const allowDuplicateClaims = allow_duplicate_claims === true || allow_duplicate_claims === 'true';

    if (!depositAmount || depositAmount <= 0) {
      return res.status(400).json({ error: '예치금을 입력해주세요' });
    }

    if (!rewardAmount || rewardAmount <= 0) {
      return res.status(400).json({ error: '보상 금액을 입력해주세요' });
    }

    if (depositAmount < rewardAmount) {
      return res.status(400).json({ error: '예치금은 1회 보상 이상이어야 합니다' });
    }

    if (!stampGoal || stampGoal <= 0) {
      return res.status(400).json({ error: '스탬프 목표를 입력해주세요' });
    }

    // 잔액 확인
    const currentBalance = await blockchain.getBalance(creator_address);
    if (currentBalance < depositAmount) {
      return res.status(400).json({
        error: `잔액이 부족합니다 (현재: ${currentBalance} TON, 필요: ${depositAmount} TON)`,
      });
    }

    // 컨트랙트에 스팟 생성
    const spotId = await blockchain.createSpot(
      creator_address,
      depositAmount,
      rewardAmount,
      stampGoal,
      stampBonus,
      cooldownSec,
      allowDuplicateClaims,
      {
        name,
        description: description || '',
        lat: Number(lat),
        lng: Number(lng),
        startTime: start_time,
        endTime: end_time,
      }
    );

    const spot = await blockchain.getSpot(spotId);
    const newBalance = await blockchain.getBalance(creator_address);

    res.status(201).json({
      message: '스팟 생성 완료',
      spot_id: spotId,
      remaining_balance: newBalance,
      ...spot,
    });
  } catch (err) {
    console.error('스팟 생성 에러:', err.message);
    res.status(500).json({ error: err.message || '스팟 생성 실패' });
  }
});

// POST /api/spots/:id/redeposit — 재예치
router.post('/:id/redeposit', async (req, res) => {
  try {
    const spotId = Number(req.params.id);
    const { creator_address, amount } = req.body;

    if (!creator_address || !amount) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요' });
    }

    const amountTon = Number(amount);
    if (amountTon <= 0) {
      return res.status(400).json({ error: '금액은 0보다 커야 합니다' });
    }

    // 스팟 존재 확인
    const spot = await blockchain.getSpot(spotId);
    if (!spot || spot.reward === 0) {
      return res.status(404).json({ error: '스팟을 찾을 수 없습니다' });
    }

    // 본인 스팟 확인
    if (spot.creator_address.toLowerCase() !== creator_address.toLowerCase()) {
      return res.status(403).json({ error: '본인이 생성한 스팟만 재예치할 수 있습니다' });
    }

    // 잔액 확인
    const currentBalance = await blockchain.getBalance(creator_address);
    if (currentBalance < amountTon) {
      return res.status(400).json({ error: `잔액이 부족합니다 (현재: ${currentBalance} TON)` });
    }

    const result = await blockchain.redeposit(spotId, creator_address, amountTon);

    res.json({
      message: `${amountTon} TON 재예치 완료`,
      spot_remaining: result.spotRemaining,
      remaining_balance: result.balance,
    });
  } catch (err) {
    console.error('재예치 에러:', err.message);
    res.status(500).json({ error: err.message || '재예치 실패' });
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
