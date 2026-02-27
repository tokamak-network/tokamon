const express = require('express');
const blockchain = require('../blockchain');

const FAUCET_ETH_AMOUNT = 15;  // 15 TON 지급
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24시간

function faucetRoutes(db) {
  const router = express.Router();

  // faucet_claims 테이블 초기화는 index.js에서 수행

  // POST /api/faucet/eth — 테스트 ETH 받기 (사용자 지갑에 직접 전송, 1일 1회)
  router.post('/eth', async (req, res) => {
    try {
      const { address } = req.body;
      if (!address) {
        return res.status(400).json({ error: 'Wallet address is required' });
      }

      const addrLower = address.toLowerCase();

      // 쿨다운 체크
      const row = await new Promise((resolve, reject) => {
        db.get('SELECT last_claim FROM faucet_claims WHERE address = ?', [addrLower], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (row) {
        const elapsed = Date.now() - row.last_claim;
        if (elapsed < COOLDOWN_MS) {
          const retryAfter = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
          return res.status(429).json({
            error: 'Faucet cooldown active',
            retryAfter,
          });
        }
      }

      await blockchain.sendETH(address, FAUCET_ETH_AMOUNT);

      // UPSERT last_claim
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO faucet_claims (address, last_claim) VALUES (?, ?)
           ON CONFLICT(address) DO UPDATE SET last_claim = ?`,
          [addrLower, Date.now(), Date.now()],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });

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

  return router;
}

module.exports = faucetRoutes;
