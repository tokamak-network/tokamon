const express = require('express');
const blockchain = require('../blockchain');

const router = express.Router();

// GET /api/stamps/:spotId — 스탬프 현황 조회
router.get('/:spotId', async (req, res) => {
  try {
    const spotId = Number(req.params.spotId);
    const { user_address } = req.query;

    if (!user_address) {
      return res.status(400).json({ error: 'user_address is required' });
    }

    const spot = await blockchain.getSpot(spotId);
    if (!spot || spot.reward === 0) {
      return res.status(404).json({ error: 'Spot not found' });
    }

    const info = await blockchain.getStampInfo(spotId, user_address);

    res.json({
      spot_id: spotId,
      spot_name: spot.name,
      stamps: info.stamps,
      goal: info.goal,
      last_claim: info.last_claim > 0
        ? new Date(info.last_claim * 1000).toISOString()
        : null,
      cooldown_remaining: info.cooldown_remaining,
    });
  } catch (err) {
    console.error('스탬프 조회 에러:', err.message);
    res.status(500).json({ error: 'Failed to fetch stamp info' });
  }
});

module.exports = router;
