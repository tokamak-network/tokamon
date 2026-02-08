const crypto = require('crypto');

// 지구 반지름 (미터)
const EARTH_RADIUS = 6371000;

function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isWithinTimeRange(startTime, endTime) {
  const now = new Date();
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= sh * 60 + sm && cur <= eh * 60 + em;
}

// 속도 체크: 이전 위치와 비교하여 비현실적 이동 감지
// 최대 허용 속도: 300 km/h (KTX 수준)
const MAX_SPEED_KMH = 300;

function isSpeedValid(prevLat, prevLng, prevTime, curLat, curLng, curTime) {
  const distMeters = haversineDistance(prevLat, prevLng, curLat, curLng);
  const timeDiffHours = (new Date(curTime) - new Date(prevTime)) / 3600000;
  if (timeDiffHours <= 0) return false;
  const speedKmh = (distMeters / 1000) / timeDiffHours;
  return speedKmh <= MAX_SPEED_KMH;
}

// claim_id 생성 (256-bit 랜덤)
function generateClaimId() {
  return crypto.randomBytes(32);
}

// 핸드폰 번호를 SHA256 해싱 (프라이버시 보호)
function hashPhoneNumber(phoneNumber) {
  const cleaned = phoneNumber.replace(/[\s-]/g, '');
  return crypto.createHash('sha256').update(cleaned).digest('hex');
}

// 핸드폰 번호 형식 검증 (한국 번호 기준: 01X-XXXX-XXXX)
function isValidPhoneNumber(phoneNumber) {
  const cleaned = phoneNumber.replace(/[\s-]/g, '');
  return /^01[0-9]{8,9}$/.test(cleaned);
}

// 텔레그램 username 해싱 (@ 제거 후 해싱)
function hashTelegramId(username) {
  const cleaned = username.replace('@', '').toLowerCase().trim();
  const salt = process.env.TELEGRAM_HASH_SALT || 'tokamon-telegram-2024';
  return crypto.createHash('sha256').update(salt + cleaned).digest('hex');
}

// 이더리움 주소 검증
function isValidEthAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// 텔레그램 username 검증 (@username 형식, 5-32자)
function isValidTelegramUsername(username) {
  const cleaned = username.replace('@', '');
  return /^[a-zA-Z0-9_]{5,32}$/.test(cleaned);
}

module.exports = {
  haversineDistance,
  isWithinTimeRange,
  isSpeedValid,
  generateClaimId,
  hashPhoneNumber,
  isValidPhoneNumber,
  hashTelegramId,
  isValidEthAddress,
  isValidTelegramUsername,
};
