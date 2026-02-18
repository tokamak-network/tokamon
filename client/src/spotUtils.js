export function isSpotClosed(spot) {
  const end = spot.end_time || 0;
  if (end === 0) return false;
  const now = Math.floor(Date.now() / 1000);
  const offset = spot.utc_offset || 0;

  // 로컬 시각으로 변환하여 날짜 비교 (end_time은 UTC 정규화 값)
  const localNowSec = now + offset * 3600;

  // 날짜가 완전히 지남
  if (localNowSec > end) return true;

  // 마지막 날인데 일별 종료시간이 지남
  const dailyEnd = spot.daily_end_time || 0;
  const dailyStart = spot.daily_start_time || 0;
  if (dailyEnd === 0 && dailyStart === 0) return false;

  // 로컬 시각으로 같은 날인지 확인 (end는 UTC 정규화이므로 그대로 Date로 변환)
  const localNowDate = new Date(localNowSec * 1000);
  const endDate = new Date(end * 1000);

  const sameDay = localNowDate.getUTCFullYear() === endDate.getUTCFullYear() &&
    localNowDate.getUTCMonth() === endDate.getUTCMonth() &&
    localNowDate.getUTCDate() === endDate.getUTCDate();

  if (!sameDay) return false;

  // 마지막 날 — 일별 종료시간 이후면 closed
  const currentMinutes = localNowDate.getUTCHours() * 60 + localNowDate.getUTCMinutes();
  if (dailyStart < dailyEnd) {
    return currentMinutes >= dailyEnd;
  } else {
    // 야간 영업 (22:00~06:00): 아침 종료 후 ~ 저녁 시작 전 = closed
    return currentMinutes >= dailyEnd && currentMinutes < dailyStart;
  }
}

export function isWithinActiveTime(spot) {
  const now = Math.floor(Date.now() / 1000);
  const start = spot.start_time || 0;
  const end = spot.end_time || 0;
  const offset = spot.utc_offset || 0;

  // UTC 오프셋 적용한 로컬 시각 (초 단위)
  const localNow = now + offset * 3600;

  // 날짜 범위 체크 (로컬 시각 기준)
  if (start > 0 && localNow < start) return false;
  if (end > 0 && localNow > end) return false;

  const dailyStart = spot.daily_start_time || 0;
  const dailyEnd = spot.daily_end_time || 0;
  if (dailyStart === 0 && dailyEnd === 0) return true;

  const localMs = Date.now() + offset * 3600 * 1000;
  const localDate = new Date(localMs);
  const currentMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();

  if (dailyStart < dailyEnd) {
    return currentMinutes >= dailyStart && currentMinutes < dailyEnd;
  } else {
    return currentMinutes >= dailyStart || currentMinutes < dailyEnd;
  }
}
