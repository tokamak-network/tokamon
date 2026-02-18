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

// 활성 시간 체크 (날짜 범위 + 일별 영업시간)
// startDate, endDate: Unix timestamp (uint64), 0 = 제한 없음
// dailyStartTime, dailyEndTime: 자정 기준 분 단위 (0~1439), 둘 다 0 = 일별 제한 없음
// utcOffset: UTC 오프셋 (시간 단위, 예: 9 = UTC+9)
function isWithinActiveTime(startDate, endDate, dailyStartTime, dailyEndTime, utcOffset) {
  const start = Number(startDate || 0);
  const end = Number(endDate || 0);
  const dailyStart = Number(dailyStartTime || 0);
  const dailyEnd = Number(dailyEndTime || 0);
  const offset = Number(utcOffset || 0);

  const now = Math.floor(Date.now() / 1000);

  // UTC 오프셋 적용한 로컬 시각 (초 단위)
  const localNow = now + offset * 3600;

  // 1단계: 날짜 범위 체크 (로컬 시각 기준)
  if (start > 0 && localNow < start) return false;
  if (end > 0 && localNow > end) return false;

  // 2단계: 일별 영업시간 체크 (둘 다 0이면 제한 없음)
  if (dailyStart === 0 && dailyEnd === 0) return true;

  // 자정 기준 분으로 변환
  const nowMs = Date.now();
  const localMs = nowMs + offset * 3600 * 1000;
  const localDate = new Date(localMs);
  const currentMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();

  if (dailyStart < dailyEnd) {
    // 일반 (예: 09:00~18:00)
    return currentMinutes >= dailyStart && currentMinutes < dailyEnd;
  } else {
    // 야간 영업 (예: 22:00~06:00) — dailyStart > dailyEnd
    return currentMinutes >= dailyStart || currentMinutes < dailyEnd;
  }
}

// 하위 호환용 래퍼
function isWithinTimeRange(startTime, endTime) {
  return isWithinActiveTime(startTime, endTime, 0, 0, 0);
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
  isWithinActiveTime,
  haversineDistance,
};
