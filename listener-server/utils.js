const crypto = require('crypto');

// 텔레그램 username 해싱 (컨트랙트와 동일한 방식 유지)
function hashTelegramId(username) {
  const cleaned = (username || '').replace('@', '').toLowerCase().trim();
  const salt = process.env.TELEGRAM_HASH_SALT;
  if (!salt) {
    throw new Error('TELEGRAM_HASH_SALT 환경변수가 설정되지 않았습니다.');
  }
  return crypto.createHash('sha256').update(salt + cleaned).digest('hex');
}

function hashPhoneNumber(phone) {
  const cleaned = (phone || '').replace(/[^0-9]/g, '');
  const salt = process.env.TELEGRAM_HASH_SALT;
  if (!salt) {
    throw new Error('TELEGRAM_HASH_SALT 환경변수가 설정되지 않았습니다.');
  }
  return crypto.createHash('sha256').update(salt + cleaned).digest('hex');
}

function isValidEthAddress(address) {
  return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

function isValidTelegramUsername(username) {
  const cleaned = (username || '').replace('@', '').trim();
  return /^[a-zA-Z0-9_]{5,32}$/.test(cleaned);
}

function isValidPhoneNumber(phone) {
  const cleaned = (phone || '').replace(/[^0-9]/g, '');
  return /^0[0-9]{9,10}$/.test(cleaned);
}

// 시간 범위 체크 (start_time, end_time: Unix timestamp (uint64), 0 = 제한 없음)
function isWithinTimeRange(startTime, endTime) {
  const start = Number(startTime || 0);
  const end = Number(endTime || 0);
  if (start === 0 && end === 0) return true;
  const now = Math.floor(Date.now() / 1000);
  if (start > 0 && now < start) return false;
  if (end > 0 && now > end) return false;
  return true;
}

// Haversine 거리 계산 (미터 단위)
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = {
  hashTelegramId,
  hashPhoneNumber,
  isValidEthAddress,
  isValidTelegramUsername,
  isValidPhoneNumber,
  isWithinTimeRange,
  haversineDistance,
};
