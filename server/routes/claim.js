const express = require('express');
const blockchain = require('../blockchain');

const router = express.Router();

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
