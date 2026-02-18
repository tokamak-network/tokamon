export function isSpotClosed(spot) {
  const end = spot.end_time || 0;
  if (end === 0) return false;
  const now = Math.floor(Date.now() / 1000);
  const offset = spot.utc_offset || 0;

  const localNowSec = now + offset * 3600;

  if (localNowSec > end) return true;

  const dailyEnd = spot.daily_end_time || 0;
  const dailyStart = spot.daily_start_time || 0;
  if (dailyEnd === 0 && dailyStart === 0) return false;

  const localNowDate = new Date(localNowSec * 1000);
  const endDate = new Date(end * 1000);

  const sameDay = localNowDate.getUTCFullYear() === endDate.getUTCFullYear() &&
    localNowDate.getUTCMonth() === endDate.getUTCMonth() &&
    localNowDate.getUTCDate() === endDate.getUTCDate();

  if (!sameDay) return false;

  const currentMinutes = localNowDate.getUTCHours() * 60 + localNowDate.getUTCMinutes();
  if (dailyStart < dailyEnd) {
    return currentMinutes >= dailyEnd;
  } else {
    return currentMinutes >= dailyEnd && currentMinutes < dailyStart;
  }
}

export function isWithinActiveTime(spot) {
  const now = Math.floor(Date.now() / 1000);
  const start = spot.start_time || 0;
  const end = spot.end_time || 0;
  const offset = spot.utc_offset || 0;

  const localNow = now + offset * 3600;

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
