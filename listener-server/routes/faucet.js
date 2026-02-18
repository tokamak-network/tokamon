const express = require('express');
const blockchain = require('../blockchain');

const router = express.Router();

const FAUCET_ETH_AMOUNT = 10;  // 10 ETH씩 지급

// POST /api/faucet/eth — 테스트 ETH 받기 (사용자 지갑에 직접 전송)
router.post('/eth', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    await blockchain.sendETH(address, FAUCET_ETH_AMOUNT);

    res.json({
      message: `${FAUCET_ETH_AMOUNT} ETH sent!`,
      amount: FAUCET_ETH_AMOUNT,
    });
  } catch (err) {
    console.error('ETH Faucet 에러:', err.message);
    res.status(500).json({ error: 'ETH faucet failed' });
  }
});

// GET /api/faucet/balance — 잔액 조회 (네이티브 잔액)
router.get('/balance', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const balance = await blockchain.getBalance(address);
    res.json({ balance });
  } catch (err) {
    console.error('잔액 조회 에러:', err.message);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

module.exports = router;
