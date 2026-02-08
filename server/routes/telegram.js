const express = require('express');
const blockchain = require('../blockchain');
const { hashTelegramId, isValidTelegramUsername, isValidEthAddress, haversineDistance, isWithinTimeRange } = require('../utils');
const { sendClaimNotification, sendVerificationCode } = require('../telegram-bot');

const COLLECT_RADIUS = 50;

// 인증 코드 생성 함수
function generateVerifyCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6자리 숫자
}

module.exports = function(db) {
  const router = express.Router();

// POST /api/telegram/balance - 텔레그램 잔액 조회
router.post('/balance', async (req, res) => {
  try {
    const { telegram_username } = req.body;
    
    if (!telegram_username || !isValidTelegramUsername(telegram_username)) {
      return res.status(400).json({ error: '올바른 텔레그램 username을 입력해주세요' });
    }
    
    const telegramHash = hashTelegramId(telegram_username);
    const balance = await blockchain.getTelegramBalance(telegramHash);
    
    res.json({ balance });
  } catch (err) {
    console.error('텔레그램 잔액 조회 에러:', err.message);
    res.status(500).json({ error: err.message || '잔액 조회 실패' });
  }
});

// POST /api/telegram/stamp-info - 스탬프 정보 조회
router.post('/stamp-info', async (req, res) => {
  try {
    const { telegram_username, spot_id } = req.body;
    
    if (!telegram_username || spot_id == null) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요' });
    }
    
    if (!isValidTelegramUsername(telegram_username)) {
      return res.status(400).json({ error: '올바른 텔레그램 username 형식이 아닙니다' });
    }
    
    const telegramHash = hashTelegramId(telegram_username);
    const stampInfo = await blockchain.getTelegramStampInfo(spot_id, telegramHash);
    
    res.json(stampInfo);
  } catch (err) {
    console.error('스탬프 정보 조회 에러:', err.message);
    res.status(500).json({ error: err.message || '스탬프 정보 조회 실패' });
  }
});

// POST /api/telegram/validate-claim - 클레임 검증만 수행 (트랜잭션은 클라이언트에서)
router.post('/validate-claim', async (req, res) => {
  try {
    const { telegram_username, spot_id, lat, lng } = req.body;
    
    if (!telegram_username || spot_id == null || lat == null || lng == null) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요' });
    }
    
    if (!isValidTelegramUsername(telegram_username)) {
      return res.status(400).json({ error: '올바른 텔레그램 username 형식이 아닙니다' });
    }
    
    const telegramHash = hashTelegramId(telegram_username);
    
    // 스팟 조회
    const spot = await blockchain.getSpot(spot_id);
    if (!spot || spot.reward === 0) {
      return res.status(404).json({ error: '스팟을 찾을 수 없습니다' });
    }
    
    // 거리 확인
    const distance = haversineDistance(lat, lng, spot.lat, spot.lng);
    if (distance > COLLECT_RADIUS) {
      return res.status(400).json({
        error: `너무 멀어요 (${Math.round(distance)}m). 더 가까이 가주세요`,
        distance: Math.round(distance),
      });
    }
    
    // 시간 확인
    if (!isWithinTimeRange(spot.start_time, spot.end_time)) {
      return res.status(400).json({
        error: `활성 시간이 아닙니다 (${spot.start_time}~${spot.end_time})`,
      });
    }
    
    // 쿨다운 확인 (중복 발행이 허용되지 않은 경우에만)
    if (!spot.allow_duplicate_claims) {
      const stampInfo = await blockchain.getTelegramStampInfo(spot_id, telegramHash);
      if (stampInfo.cooldown_remaining > 0) {
        const hours = Math.floor(stampInfo.cooldown_remaining / 3600);
        const minutes = Math.floor((stampInfo.cooldown_remaining % 3600) / 60);
        return res.status(400).json({
          error: `쿨다운 중입니다 (${hours}시간 ${minutes}분 남음)`,
          cooldown_remaining: stampInfo.cooldown_remaining,
        });
      }
    }
    
    // 잔액 확인
    if (spot.remaining < spot.reward) {
      return res.status(400).json({ error: '이 스팟의 TON이 소진되었습니다' });
    }
    
    res.json({ valid: true });
  } catch (err) {
    console.error('검증 에러:', err.message);
    res.status(500).json({ error: err.message || '검증 실패' });
  }
});

// POST /api/telegram/claim - 텔레그램으로 클레임 (서버가 admin으로 실행 - 레거시)
router.post('/claim', async (req, res) => {
  try {
    const { telegram_username, spot_id, lat, lng } = req.body;
    
    if (!telegram_username || spot_id == null || lat == null || lng == null) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요' });
    }
    
    if (!isValidTelegramUsername(telegram_username)) {
      return res.status(400).json({ error: '올바른 텔레그램 username 형식이 아닙니다 (예: username 또는 @username)' });
    }
    
    const telegramHash = hashTelegramId(telegram_username);
    
    // 스팟 조회
    const spot = await blockchain.getSpot(spot_id);
    if (!spot || spot.reward === 0) {
      return res.status(404).json({ error: '스팟을 찾을 수 없습니다' });
    }
    
    // 거리 확인
    const distance = haversineDistance(lat, lng, spot.lat, spot.lng);
    if (distance > COLLECT_RADIUS) {
      return res.status(400).json({
        error: `너무 멀어요 (${Math.round(distance)}m). 더 가까이 가주세요`,
        distance: Math.round(distance),
      });
    }
    
    // 시간 확인
    if (!isWithinTimeRange(spot.start_time, spot.end_time)) {
      return res.status(400).json({
        error: `활성 시간이 아닙니다 (${spot.start_time}~${spot.end_time})`,
      });
    }
    
    // 쿨다운 확인 (중복 발행이 허용되지 않은 경우에만)
    if (!spot.allow_duplicate_claims) {
      const stampInfo = await blockchain.getTelegramStampInfo(spot_id, telegramHash);
      if (stampInfo.cooldown_remaining > 0) {
        const hours = Math.floor(stampInfo.cooldown_remaining / 3600);
        const minutes = Math.floor((stampInfo.cooldown_remaining % 3600) / 60);
        return res.status(400).json({
          error: `쿨다운 중입니다 (${hours}시간 ${minutes}분 남음)`,
          cooldown_remaining: stampInfo.cooldown_remaining,
        });
      }
    }
    
    // 잔액 확인
    if (spot.remaining < spot.reward) {
      return res.status(400).json({ error: '이 스팟의 TON이 소진되었습니다' });
    }
    
    // 컨트랙트 클레임 실행
    const result = await blockchain.claimToTelegram(spot_id, telegramHash);
    
    // 응답 구성
    const totalPayout = result.reward + result.bonus;
    let message;
    if (result.bonus > 0) {
      message = `스탬프 달성! ${totalPayout} TON 적립 완료!`;
    } else {
      message = `${result.reward} TON 적립 완료!`;
    }
    
    // 텔레그램 알림 전송
    const { sendClaimNotification } = require('../telegram-bot');
    await sendClaimNotification(
      telegram_username.replace('@', ''),
      spot.name,
      result.reward,
      result.bonus,
      result.balance
    );
    
    res.json({
      message,
      reward: result.reward,
      bonus: result.bonus,
      stamp: result.stamp,
      stamp_goal: spot.stamp_goal,
      balance: result.balance,
      spot_name: spot.name,
    });
  } catch (err) {
    console.error('클레임 에러:', err.message);
    res.status(500).json({ error: err.message || '클레임 실패' });
  }
});

// POST /api/telegram/verify-token - 토큰 검증
router.post('/verify-token', (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: '토큰이 필요합니다' });
  }
  
  const now = Math.floor(Date.now() / 1000);
  const db = req.app.locals.db;
  
  db.get(
    'SELECT * FROM telegram_link_tokens WHERE token = ? AND expires_at > ? AND used = 0',
    [token, now],
    (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: '유효하지 않거나 만료된 토큰입니다' });
      }
      
      res.json({
        valid: true,
        telegram_username: row.telegram_username,
      });
    }
  );
});

// POST /api/telegram/link-wallet - 지갑 연결 실행
router.post('/link-wallet', async (req, res) => {
  const { token, wallet_address } = req.body;
  
  if (!token || !wallet_address) {
    return res.status(400).json({ error: '필수 항목을 입력해주세요' });
  }
  
  if (!isValidEthAddress(wallet_address)) {
    return res.status(400).json({ error: '올바른 이더리움 주소가 아닙니다' });
  }
  
  const now = Math.floor(Date.now() / 1000);
  const db = req.app.locals.db;
  
  // 토큰 조회
  db.get(
    'SELECT * FROM telegram_link_tokens WHERE token = ? AND expires_at > ? AND used = 0',
    [token, now],
    async (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: '유효하지 않거나 만료된 토큰입니다' });
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
          message: '지갑 연결 완료',
          wallet: wallet_address,
          transferred_amount: result.transferredAmount,
        });
      } catch (err) {
        console.error('지갑 연결 에러:', err);
        res.status(500).json({ error: err.message || '지갑 연결 실패' });
      }
    }
  );
});

// POST /api/telegram/notify-claim - 클레임 후 텔레그램 알림 전송
router.post('/notify-claim', async (req, res) => {
  try {
    const { telegram_username, spot_name, reward, bonus = 0 } = req.body;
    
    if (!telegram_username || !spot_name || reward == null) {
      return res.status(400).json({ error: '필수 항목이 누락되었습니다' });
    }
    
    console.log('notify-claim 요청:', { telegram_username, spot_name, reward, bonus });
    
    const username = telegram_username.replace('@', '');
    
    // 현재 잔액 조회
    const telegramHash = hashTelegramId(telegram_username);
    console.log('해시 계산:', { telegram_username, username, telegramHash });
    const balance = await blockchain.getTelegramBalance(telegramHash);
    console.log('조회된 잔액:', balance);
    
    // 텔레그램 알림 전송
    await sendClaimNotification(username, spot_name, reward, bonus, balance);
    
    res.json({ success: true });
  } catch (err) {
    console.error('텔레그램 알림 전송 에러:', err);
    res.status(500).json({ error: err.message || '알림 전송 실패' });
  }
});

// POST /api/telegram/request-code - 인증 코드 요청
router.post('/request-code', async (req, res) => {
  try {
    const { telegram_username } = req.body;
    
    if (!telegram_username || !isValidTelegramUsername(telegram_username)) {
      return res.status(400).json({ error: '올바른 텔레그램 username을 입력해주세요' });
    }
    
    const username = telegram_username.replace('@', '');
    const code = generateVerifyCode();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 180; // 3분 유효
    
    // DB에 저장
    db.run(
      'INSERT INTO telegram_verify_codes (code, telegram_username, created_at, expires_at) VALUES (?, ?, ?, ?)',
      [code, username, now, expiresAt],
      async (err) => {
        if (err) {
          console.error('인증 코드 저장 실패:', err);
          return res.status(500).json({ error: '인증 코드 생성 실패' });
        }
        
        // 텔레그램으로 코드 전송
        const sent = await sendVerificationCode(username, code);
        
        if (!sent) {
          return res.status(404).json({ 
            error: '텔레그램 사용자를 찾을 수 없습니다. 먼저 Tokamon 봇에게 /start를 보내주세요.' 
          });
        }
        
        res.json({ success: true, message: '인증 코드가 텔레그램으로 전송되었습니다' });
      }
    );
  } catch (err) {
    console.error('인증 코드 요청 에러:', err);
    res.status(500).json({ error: err.message || '인증 코드 요청 실패' });
  }
});

// POST /api/telegram/verify-code - 인증 코드 검증
router.post('/verify-code', (req, res) => {
  try {
    const { telegram_username, code } = req.body;
    
    if (!telegram_username || !code) {
      return res.status(400).json({ error: '필수 항목이 누락되었습니다' });
    }
    
    const username = telegram_username.replace('@', '');
    const now = Math.floor(Date.now() / 1000);
    
    // DB에서 코드 검증
    db.get(
      'SELECT * FROM telegram_verify_codes WHERE code = ? AND telegram_username = ? AND expires_at > ? AND verified = 0',
      [code, username, now],
      (err, row) => {
        if (err) {
          console.error('인증 코드 검증 에러:', err);
          return res.status(500).json({ error: '인증 코드 검증 실패' });
        }
        
        if (!row) {
          return res.status(400).json({ error: '인증 코드가 올바르지 않거나 만료되었습니다' });
        }
        
        // 코드를 검증됨으로 표시
        db.run('UPDATE telegram_verify_codes SET verified = 1 WHERE code = ?', [code]);
        
        res.json({ success: true, message: '인증 완료' });
      }
    );
  } catch (err) {
    console.error('인증 코드 검증 에러:', err);
    res.status(500).json({ error: err.message || '인증 코드 검증 실패' });
  }
});

return router;
};
