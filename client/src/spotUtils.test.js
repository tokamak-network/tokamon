import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSpotClosed, isWithinActiveTime } from './spotUtils';

// 헬퍼: 특정 로컬 시각의 UTC 타임스탬프 계산
function localTimeToUtc(utcMidnight, localMinuteOfDay, utcOffset) {
  return utcMidnight + localMinuteOfDay * 60 - utcOffset * 3600;
}

// UTC 정규화 값 (CreateSpot에서 'T00:00:00Z'로 생성)
const FEB18_UTC = 1771372800;     // Feb 18 00:00:00 UTC
const MAR20_END_UTC = 1774051199; // Mar 20 23:59:59 UTC

function mockTime(unixSeconds) {
  vi.spyOn(Date, 'now').mockReturnValue(unixSeconds * 1000);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── isWithinActiveTime ───

describe('isWithinActiveTime', () => {
  it('제한 없으면 항상 활성', () => {
    const spot = { start_time: 0, end_time: 0, daily_start_time: 0, daily_end_time: 0, utc_offset: 0 };
    expect(isWithinActiveTime(spot)).toBe(true);
  });

  // ─── KST (UTC+9) 날짜 경계 ───

  it('KST: 정확히 시작일 (Feb 18 00:00 KST) → active', () => {
    mockTime(1771340400); // Feb 17 15:00 UTC = Feb 18 00:00 KST
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 0, daily_end_time: 0, utc_offset: 9 };
    expect(isWithinActiveTime(spot)).toBe(true);
  });

  it('KST: 시작일 1초 전 (Feb 17 23:59:59 KST) → inactive', () => {
    mockTime(1771340399);
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 0, daily_end_time: 0, utc_offset: 9 };
    expect(isWithinActiveTime(spot)).toBe(false);
  });

  it('KST: 종료일 마지막 (Mar 20 23:59:59 KST) → active', () => {
    mockTime(1774018799);
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 0, daily_end_time: 0, utc_offset: 9 };
    expect(isWithinActiveTime(spot)).toBe(true);
  });

  it('KST: 종료일 1초 후 (Mar 21 00:00:00 KST) → inactive', () => {
    mockTime(1774018800);
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 0, daily_end_time: 0, utc_offset: 9 };
    expect(isWithinActiveTime(spot)).toBe(false);
  });

  // ─── EST (UTC-5) 날짜 경계 ───

  it('EST: 시작일 1초 전 (Feb 17 23:59:59 EST) → inactive', () => {
    mockTime(1771390799);
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 0, daily_end_time: 0, utc_offset: -5 };
    expect(isWithinActiveTime(spot)).toBe(false);
  });

  it('EST: 정확히 시작일 (Feb 18 00:00 EST) → active', () => {
    mockTime(1771390800);
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 0, daily_end_time: 0, utc_offset: -5 };
    expect(isWithinActiveTime(spot)).toBe(true);
  });

  // ─── UTC+0 날짜 경계 ───

  it('UTC+0: timestamp == startDate → active', () => {
    mockTime(FEB18_UTC);
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 0, daily_end_time: 0, utc_offset: 0 };
    expect(isWithinActiveTime(spot)).toBe(true);
  });

  it('UTC+0: timestamp == startDate - 1 → inactive', () => {
    mockTime(FEB18_UTC - 1);
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 0, daily_end_time: 0, utc_offset: 0 };
    expect(isWithinActiveTime(spot)).toBe(false);
  });

  // ─── 일별 영업시간 + 타임존 ───

  it('KST: 09:05 영업시간 내 → active', () => {
    mockTime(localTimeToUtc(FEB18_UTC, 545, 9));
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 540, daily_end_time: 1080, utc_offset: 9 };
    expect(isWithinActiveTime(spot)).toBe(true);
  });

  it('KST: 08:59 영업시간 전 → inactive', () => {
    mockTime(localTimeToUtc(FEB18_UTC, 539, 9));
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 540, daily_end_time: 1080, utc_offset: 9 };
    expect(isWithinActiveTime(spot)).toBe(false);
  });

  it('KST: 18:00 영업시간 종료 → inactive', () => {
    mockTime(localTimeToUtc(FEB18_UTC, 1080, 9));
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 540, daily_end_time: 1080, utc_offset: 9 };
    expect(isWithinActiveTime(spot)).toBe(false);
  });

  it('EST: 09:00 영업시간 시작 → active', () => {
    mockTime(localTimeToUtc(FEB18_UTC, 540, -5));
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 540, daily_end_time: 1080, utc_offset: -5 };
    expect(isWithinActiveTime(spot)).toBe(true);
  });

  it('EST: 18:00 영업시간 종료 → inactive', () => {
    mockTime(localTimeToUtc(FEB18_UTC, 1080, -5));
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 540, daily_end_time: 1080, utc_offset: -5 };
    expect(isWithinActiveTime(spot)).toBe(false);
  });

  // ─── 야간 영업 ───

  it('KST: 야간 23:00 → active', () => {
    mockTime(localTimeToUtc(FEB18_UTC, 1380, 9));
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 1320, daily_end_time: 360, utc_offset: 9 };
    expect(isWithinActiveTime(spot)).toBe(true);
  });

  it('KST: 야간 03:00 → active', () => {
    mockTime(localTimeToUtc(FEB18_UTC, 180, 9));
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 1320, daily_end_time: 360, utc_offset: 9 };
    expect(isWithinActiveTime(spot)).toBe(true);
  });

  it('KST: 야간 10:00 → inactive', () => {
    mockTime(localTimeToUtc(FEB18_UTC, 600, 9));
    const spot = { start_time: FEB18_UTC, end_time: MAR20_END_UTC, daily_start_time: 1320, daily_end_time: 360, utc_offset: 9 };
    expect(isWithinActiveTime(spot)).toBe(false);
  });

  // ─── 자정 경계 (23:50~00:10) ───

  it('KST: 자정 경계 23:55 → active', () => {
    mockTime(localTimeToUtc(1700006400, 1435, 9));
    const spot = { start_time: 1700000000, end_time: 1800000000, daily_start_time: 1430, daily_end_time: 10, utc_offset: 9 };
    expect(isWithinActiveTime(spot)).toBe(true);
  });

  it('KST: 자정 경계 00:05 → active', () => {
    mockTime(localTimeToUtc(1700006400, 5, 9));
    const spot = { start_time: 1700000000, end_time: 1800000000, daily_start_time: 1430, daily_end_time: 10, utc_offset: 9 };
    expect(isWithinActiveTime(spot)).toBe(true);
  });

  it('KST: 자정 경계 00:10 → inactive', () => {
    mockTime(localTimeToUtc(1700006400, 10, 9));
    const spot = { start_time: 1700000000, end_time: 1800000000, daily_start_time: 1430, daily_end_time: 10, utc_offset: 9 };
    expect(isWithinActiveTime(spot)).toBe(false);
  });

  // ─── 같은 UTC 시각, 다른 타임존 ───

  it('같은 UTC 시각에 KST 활성, EST 비활성', () => {
    mockTime(FEB18_UTC); // UTC 00:00 = KST 09:00 = EST 19:00
    const kstSpot = { start_time: 1700000000, end_time: 1800000000, daily_start_time: 540, daily_end_time: 1080, utc_offset: 9 };
    const estSpot = { start_time: 1700000000, end_time: 1800000000, daily_start_time: 540, daily_end_time: 1080, utc_offset: -5 };
    expect(isWithinActiveTime(kstSpot)).toBe(true);
    expect(isWithinActiveTime(estSpot)).toBe(false);
  });

  // ─── 극단 타임존 ───

  it('UTC+14: 09:00 local → active', () => {
    mockTime(localTimeToUtc(1700006400, 540, 14));
    const spot = { start_time: 1700000000, end_time: 1800000000, daily_start_time: 540, daily_end_time: 1080, utc_offset: 14 };
    expect(isWithinActiveTime(spot)).toBe(true);
  });

  it('UTC-12: 09:00 local → active', () => {
    mockTime(localTimeToUtc(1700006400, 540, -12));
    const spot = { start_time: 1700000000, end_time: 1800000000, daily_start_time: 540, daily_end_time: 1080, utc_offset: -12 };
    expect(isWithinActiveTime(spot)).toBe(true);
  });
});

// ─── isSpotClosed ───

describe('isSpotClosed', () => {
  it('end_time=0 → 닫히지 않음', () => {
    const spot = { end_time: 0 };
    expect(isSpotClosed(spot)).toBe(false);
  });

  it('KST: 종료일 이후 → closed', () => {
    mockTime(1774018800); // Mar 21 00:00 KST = Mar 20 15:00 UTC
    const spot = { end_time: MAR20_END_UTC, utc_offset: 9, daily_start_time: 0, daily_end_time: 0 };
    expect(isSpotClosed(spot)).toBe(true);
  });

  it('KST: 종료일 내 → not closed', () => {
    mockTime(1774018799); // Mar 20 23:59:59 KST
    const spot = { end_time: MAR20_END_UTC, utc_offset: 9, daily_start_time: 0, daily_end_time: 0 };
    expect(isSpotClosed(spot)).toBe(false);
  });

  it('EST: 종료일 이후 → closed', () => {
    // Mar 21 00:00 EST = Mar 21 05:00 UTC
    mockTime(1774069200);
    const spot = { end_time: MAR20_END_UTC, utc_offset: -5, daily_start_time: 0, daily_end_time: 0 };
    expect(isSpotClosed(spot)).toBe(true);
  });

  it('EST: 종료일 내 → not closed', () => {
    mockTime(1774069199);
    const spot = { end_time: MAR20_END_UTC, utc_offset: -5, daily_start_time: 0, daily_end_time: 0 };
    expect(isSpotClosed(spot)).toBe(false);
  });

  it('KST: 마지막 날 영업시간 종료 후 → closed', () => {
    // Mar 20, 영업시간 09:00~18:00 KST
    // 18:01 KST on Mar 20 = 09:01 UTC on Mar 20
    // end_time을 Mar 20 23:59:59 UTC로 설정
    // Mar 20 00:00 UTC = 1773964800
    mockTime(localTimeToUtc(1773964800, 1081, 9)); // 18:01 KST on Mar 20
    const spot = { end_time: MAR20_END_UTC, utc_offset: 9, daily_start_time: 540, daily_end_time: 1080 };
    expect(isSpotClosed(spot)).toBe(true);
  });

  it('KST: 마지막 날 영업시간 내 → not closed', () => {
    mockTime(localTimeToUtc(1773964800, 720, 9)); // 12:00 KST on Mar 20
    const spot = { end_time: MAR20_END_UTC, utc_offset: 9, daily_start_time: 540, daily_end_time: 1080 };
    expect(isSpotClosed(spot)).toBe(false);
  });

  it('마지막 날 아닌 경우 영업시간 밖이어도 not closed', () => {
    // Feb 19 20:00 KST (영업 끝) — 마지막 날이 아님
    mockTime(localTimeToUtc(FEB18_UTC + 86400, 1200, 9)); // Feb 19 20:00 KST
    const spot = { end_time: MAR20_END_UTC, utc_offset: 9, daily_start_time: 540, daily_end_time: 1080 };
    expect(isSpotClosed(spot)).toBe(false);
  });
});
