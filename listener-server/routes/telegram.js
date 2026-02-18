const express = require('express');
const { ethers } = require('ethers');
const blockchain = require('../blockchain');
const { hashTelegramId, isValidTelegramUsername, isValidEthAddress, haversineDistance } = require('../utils');
const { isBotEnabled } = require('../telegram-bot');

const COLLECT_RADIUS = 15;

// telegram_username 기반 Rate Limiting
const rateLimits = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const MAX_MAP_SIZE = 100000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now - entry.start > RATE_WINDOW_MS) rateLimits.delete(key);
  }
}, RATE_WINDOW_MS);

function checkRate(key, max) {
  if (rateLimits.size > MAX_MAP_SIZE) return false;
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    rateLimits.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

function telegramRateLimit(maxPerMinute, keyExtractor) {
  return (req, res, next) => {
    const key = keyExtractor(req);
    if (key && !checkRate(`tg:${key}:${req.path}`, maxPerMinute)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later' });
    }
    return next();
  };
}

module.exports = function(db) {
  const router = express.Router();

  // GET /api/telegram/status - 봇 활성화 여부
  router.get('/status', (req, res) => {
    res.json({ enabled: isBotEnabled() });
  });

// POST /api/telegram/balance - 텔레그램 잔액 조회
router.post('/balance', telegramRateLimit(10, req => req.body?.telegram_username), async (req, res) => {
  try {
    const { telegram_username } = req.body;

    if (!telegram_username || !isValidTelegramUsername(telegram_username)) {
      return res.status(400).json({ error: 'Please enter a valid Telegram username' });
    }

    const telegramHash = hashTelegramId(telegram_username);
    const balance = await blockchain.getTelegramBalance(telegramHash);

    res.json({ balance });
  } catch (err) {
    console.error('텔레그램 잔액 조회 에러:', err.message);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// POST /api/telegram/stamp-info - 스탬프 정보 조회
router.post('/stamp-info', telegramRateLimit(10, req => req.body?.telegram_username), async (req, res) => {
  try {
    const { telegram_username, spot_id } = req.body;

    if (!telegram_username || spot_id == null) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    if (!isValidTelegramUsername(telegram_username)) {
      return res.status(400).json({ error: 'Invalid Telegram username format' });
    }

    const telegramHash = hashTelegramId(telegram_username);
    const stampInfo = await blockchain.getTelegramStampInfo(spot_id, telegramHash);

    res.json(stampInfo);
  } catch (err) {
    console.error('스탬프 정보 조회 에러:', err.message);
    res.status(500).json({ error: 'Failed to fetch stamp info' });
  }
});

// POST /api/telegram/validate-claim - 클레임 검증만 수행 (트랜잭션은 클라이언트에서)
router.post('/validate-claim', telegramRateLimit(8, req => req.body?.telegram_username), async (req, res) => {
  try {
    const { telegram_username, spot_id, lat, lng } = req.body;

    if (!telegram_username || spot_id == null || lat == null || lng == null) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    if (!isValidTelegramUsername(telegram_username)) {
      return res.status(400).json({ error: 'Invalid Telegram username format' });
    }

    const telegramHash = hashTelegramId(telegram_username);

    // 스팟 조회
    const spot = await blockchain.getSpot(spot_id);
    if (!spot || spot.reward === 0) {
      return res.status(404).json({ error: 'Spot not found' });
    }

    // 거리 확인
    const distance = haversineDistance(lat, lng, spot.lat, spot.lng);
    if (distance > COLLECT_RADIUS) {
      return res.status(400).json({
        error: `Too far (${Math.round(distance)}m). Please get closer`,
        distance: Math.round(distance),
      });
    }

    // 발행 가능 여부 확인 (시간 + 쿨다운 + 교차 쿨다운 + 잔액 — 컨트랙트에서 일괄 체크)
    const canClaim = await blockchain.canClaimTelegram(spot_id, telegramHash);
    if (!canClaim.claimable) {
      if (canClaim.cooldown_remaining > 0) {
        const hours = Math.floor(canClaim.cooldown_remaining / 3600);
        const minutes = Math.floor((canClaim.cooldown_remaining % 3600) / 60);
        return res.status(400).json({
          error: `Cooldown active (${hours}h ${minutes}m remaining)`,
          cooldown_remaining: canClaim.cooldown_remaining,
        });
      }
      return res.status(400).json({ error: 'Cannot claim right now (time or balance)' });
    }

    res.json({ valid: true });
  } catch (err) {
    console.error('검증 에러:', err.message);
    res.status(500).json({ error: 'Validation failed' });
  }
});

// POST /api/telegram/verify-token - 토큰 검증
router.post('/verify-token', telegramRateLimit(10, req => req.body?.token), (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  const now = Math.floor(Date.now() / 1000);

  db.get(
    'SELECT * FROM telegram_link_tokens WHERE token = ? AND expires_at > ? AND used = 0',
    [token, now],
    (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Invalid or expired token' });
      }

      res.json({
        valid: true,
        telegram_username: row.telegram_username,
      });
    }
  );
});

// POST /api/telegram/link-wallet - 지갑 연결 실행
router.post('/link-wallet', telegramRateLimit(5, req => req.body?.token), async (req, res) => {
  const { token, wallet_address } = req.body;

  if (!token || !wallet_address) {
    return res.status(400).json({ error: 'Required fields are missing' });
  }

  if (!isValidEthAddress(wallet_address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' });
  }

  const now = Math.floor(Date.now() / 1000);

  // 토큰 조회
  db.get(
    'SELECT * FROM telegram_link_tokens WHERE token = ? AND expires_at > ? AND used = 0',
    [token, now],
    async (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Invalid or expired token' });
      }

      try {
        // 컨트랙트에 연결
        const telegramHash = hashTelegramId(row.telegram_username);
        const result = await blockchain.linkTelegramToWallet(telegramHash, wallet_address);

        // 토큰 사용 처리
        db.run('UPDATE telegram_link_tokens SET used = 1 WHERE token = ?', [token]);

        // 텔레그램 알림
        const { notifyLinkComplete } = require('../telegram-bot');
        await notifyLinkComplete(row.chat_id, wallet_address, result.transferredAmount);

        res.json({
          success: true,
          message: 'Wallet linked successfully',
          wallet: wallet_address,
          transferred_amount: result.transferredAmount,
        });
      } catch (err) {
        console.error('지갑 연결 에러:', err);
        res.status(500).json({ error: 'Wallet link failed' });
      }
    }
  );
});

// POST /api/telegram/username - 텔레그램 해시로 username 조회 (지갑 서명 필수)
router.post('/username', telegramRateLimit(10, req => req.body?.hash), async (req, res) => {
  try {
    const { hash, signature } = req.body;

    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
      return res.status(400).json({ error: 'Invalid hash format' });
    }

    if (!signature) {
      return res.status(400).json({ error: 'Signature is required' });
    }

    // 서명에서 지갑 주소 복원
    const message = `Verify telegram username for hash: ${hash}`;
    let recoveredAddress;
    try {
      recoveredAddress = ethers.verifyMessage(message, signature);
    } catch {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // 컨트랙트에서 이 해시에 매핑된 지갑 조회
    const linkedWallet = await blockchain.getTelegramLinkedWallet(hash);
    const zeroAddress = '0x0000000000000000000000000000000000000000';

    if (!linkedWallet || linkedWallet === zeroAddress) {
      return res.status(404).json({ error: 'No wallet linked to this hash' });
    }

    // 서명자와 매핑된 지갑이 일치하는지 확인
    if (recoveredAddress.toLowerCase() !== linkedWallet.toLowerCase()) {
      return res.status(403).json({ error: 'Signature does not match linked wallet' });
    }

    // 검증 통과 — username 조회
    db.get(
      'SELECT telegram_username FROM telegram_hash_username WHERE telegram_hash = ?',
      [hash],
      (err, row) => {
        if (err) {
          console.error('DB 조회 에러:', err);
          return res.status(500).json({ error: 'Database query failed' });
        }

        if (!row) {
          return res.json({ telegram_username: null });
        }

        res.json({ telegram_username: '@' + row.telegram_username });
      }
    );
  } catch (err) {
    console.error('username 조회 에러:', err.message);
    res.status(500).json({ error: 'Failed to fetch username' });
  }
});

return router;
};
