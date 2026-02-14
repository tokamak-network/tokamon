const express = require('express');
const blockchain = require('../blockchain');

const router = express.Router();

const FAUCET_TON_AMOUNT = 100; // 100 TON씩 지급
const FAUCET_ETH_AMOUNT = 10;  // 10 ETH씩 지급

// POST /api/faucet/eth — 테스트 ETH 받기 (사용자 지갑에 직접 전송)
router.post('/eth', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ error: '지갑 주소가 필요합니다' });
    }

    await blockchain.sendETH(address, FAUCET_ETH_AMOUNT);

    res.json({
      message: `${FAUCET_ETH_AMOUNT} ETH가 지급되었습니다!`,
      amount: FAUCET_ETH_AMOUNT,
    });
  } catch (err) {
    console.error('ETH Faucet 에러:', err.message);
    res.status(500).json({ error: 'ETH 충전 실패' });
  }
});

// POST /api/faucet — 테스트 TON 받기 (컨트랙트에 ETH 예치)
router.post('/', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ error: '지갑 주소가 필요합니다' });
    }

    const balance = await blockchain.deposit(address, FAUCET_TON_AMOUNT);

    res.json({
      message: `${FAUCET_TON_AMOUNT} TON이 지급되었습니다!`,
      amount: FAUCET_TON_AMOUNT,
      balance,
    });
  } catch (err) {
    console.error('Faucet 에러:', err.message);
    res.status(500).json({ error: '충전 실패' });
  }
});

// GET /api/faucet/balance — 잔액 조회 (컨트랙트에서)
router.get('/balance', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ error: '지갑 주소가 필요합니다' });
    }

    const balance = await blockchain.getBalance(address);
    res.json({ balance });
  } catch (err) {
    console.error('잔액 조회 에러:', err.message);
    res.status(500).json({ error: '잔액 조회 실패' });
  }
});

module.exports = router;
