const express = require('express');
const blockchain = require('../blockchain');
const { hashPhoneNumber, isValidPhoneNumber } = require('../utils');

const router = express.Router();

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

module.exports = router;
