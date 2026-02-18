const express = require('express');

const router = express.Router();

// GET /api/claim/history — deprecated (Claimed 이벤트 제거됨, Firestore에서 조회)
router.get('/history', async (req, res) => {
  res.json([]);
});

module.exports = router;
