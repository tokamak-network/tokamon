const express = require('express');
const blockchain = require('../blockchain');
const { hashPhoneNumber, isValidPhoneNumber } = require('../utils');

const router = express.Router();

// POST /api/kiosk/balance - 핸드폰 번호 잔액 조회
router.post('/balance', async (req, res) => {
  try {
    const { phone_number } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // 핸드폰 번호 형식 검증
    if (!isValidPhoneNumber(phone_number)) {
      return res.status(400).json({ error: 'Invalid phone number format (e.g. 01012345678)' });
    }

    // 핸드폰 번호 해싱
    const phoneHash = hashPhoneNumber(phone_number);

    // 잔액 조회
    const balance = await blockchain.getPhoneBalance(phoneHash);

    res.json({ balance });
  } catch (err) {
    console.error('잔액 조회 에러:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch balance' });
  }
});

// POST /api/kiosk/stamp-info - 핸드폰 번호 스탬프 정보 조회
router.post('/stamp-info', async (req, res) => {
  try {
    const { phone_number, spot_id } = req.body;

    if (!phone_number || spot_id == null) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    // 핸드폰 번호 형식 검증
    if (!isValidPhoneNumber(phone_number)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // 핸드폰 번호 해싱
    const phoneHash = hashPhoneNumber(phone_number);

    // 스탬프 정보 조회
    const stampInfo = await blockchain.getPhoneStampInfo(spot_id, phoneHash);

    res.json(stampInfo);
  } catch (err) {
    console.error('스탬프 정보 조회 에러:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch stamp info' });
  }
});

module.exports = router;
