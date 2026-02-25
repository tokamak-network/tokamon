const {
  hashTelegramId,
  hashPhoneNumber,
  isValidEthAddress,
  isValidTelegramUsername,
  isValidPhoneNumber,
  isWithinTimeRange,
  isWithinActiveTime,
  haversineDistance,
  encodeGeoHash,
  geoHashNeighbors,
  expandGeoHashPrefixes,
} = require('../utils');

// ─── 해싱 ───

describe('hashTelegramId', () => {
  beforeAll(() => {
    process.env.TELEGRAM_HASH_SALT = 'test_salt';
  });

  test('@ 제거 후 소문자 해싱', () => {
    const h1 = hashTelegramId('@TestUser');
    const h2 = hashTelegramId('testuser');
    expect(h1).toBe(h2);
  });

  test('공백 트림', () => {
    const h1 = hashTelegramId('  testuser  ');
    const h2 = hashTelegramId('testuser');
    expect(h1).toBe(h2);
  });

  test('결과가 hex 문자열', () => {
    const h = hashTelegramId('testuser');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  test('SALT 없으면 에러', () => {
    const saved = process.env.TELEGRAM_HASH_SALT;
    delete process.env.TELEGRAM_HASH_SALT;
    expect(() => hashTelegramId('user')).toThrow();
    process.env.TELEGRAM_HASH_SALT = saved;
  });
});

describe('hashPhoneNumber', () => {
  beforeAll(() => {
    process.env.TELEGRAM_HASH_SALT = 'test_salt';
  });

  test('숫자 외 문자 제거', () => {
    const h1 = hashPhoneNumber('010-1234-5678');
    const h2 = hashPhoneNumber('01012345678');
    expect(h1).toBe(h2);
  });

  test('결과가 hex 문자열', () => {
    const h = hashPhoneNumber('01012345678');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ─── 검증 ───

describe('isValidEthAddress', () => {
  test('유효한 주소', () => {
    expect(isValidEthAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBe(true);
  });

  test('0x 없음', () => {
    expect(isValidEthAddress('70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBe(false);
  });

  test('길이 부족', () => {
    expect(isValidEthAddress('0x1234')).toBe(false);
  });

  test('null/undefined', () => {
    expect(isValidEthAddress(null)).toBe(false);
    expect(isValidEthAddress(undefined)).toBe(false);
  });

  test('숫자 타입', () => {
    expect(isValidEthAddress(12345)).toBe(false);
  });
});

describe('isValidTelegramUsername', () => {
  test('유효한 username (5자 이상)', () => {
    expect(isValidTelegramUsername('hello')).toBe(true);
    expect(isValidTelegramUsername('user_name_123')).toBe(true);
  });

  test('@ 접두사 허용', () => {
    expect(isValidTelegramUsername('@hello')).toBe(true);
  });

  test('4자 이하 거부', () => {
    expect(isValidTelegramUsername('abcd')).toBe(false);
  });

  test('33자 이상 거부', () => {
    expect(isValidTelegramUsername('a'.repeat(33))).toBe(false);
  });

  test('특수문자 거부', () => {
    expect(isValidTelegramUsername('hello!')).toBe(false);
    expect(isValidTelegramUsername('user name')).toBe(false);
  });

  test('빈 문자열', () => {
    expect(isValidTelegramUsername('')).toBe(false);
    expect(isValidTelegramUsername(null)).toBe(false);
  });
});

describe('isValidPhoneNumber', () => {
  test('유효한 번호 (010-xxxx-xxxx)', () => {
    expect(isValidPhoneNumber('01012345678')).toBe(true);
    expect(isValidPhoneNumber('010-1234-5678')).toBe(true);
  });

  test('0으로 시작하지 않으면 거부', () => {
    expect(isValidPhoneNumber('11012345678')).toBe(false);
  });

  test('자릿수 부족', () => {
    expect(isValidPhoneNumber('010123456')).toBe(false);
  });

  test('빈 문자열', () => {
    expect(isValidPhoneNumber('')).toBe(false);
  });
});

// ─── 시간 체크 ───

describe('isWithinActiveTime', () => {
  const RealDateNow = Date.now;

  afterEach(() => {
    Date.now = RealDateNow;
  });

  function mockTime(unixSeconds) {
    Date.now = () => unixSeconds * 1000;
  }

  test('모두 0이면 항상 활성', () => {
    expect(isWithinActiveTime(0, 0, 0, 0, 0)).toBe(true);
  });

  test('날짜 범위 내', () => {
    mockTime(1750000000);
    expect(isWithinActiveTime(1700000000, 1800000000, 0, 0, 0)).toBe(true);
  });

  test('시작일 이전이면 비활성', () => {
    mockTime(1600000000);
    expect(isWithinActiveTime(1700000000, 1800000000, 0, 0, 0)).toBe(false);
  });

  test('종료일 이후이면 비활성', () => {
    mockTime(1900000000);
    expect(isWithinActiveTime(1700000000, 1800000000, 0, 0, 0)).toBe(false);
  });

  test('startDate만 설정 (endDate=0)', () => {
    mockTime(1750000000);
    expect(isWithinActiveTime(1700000000, 0, 0, 0, 0)).toBe(true);
    mockTime(1600000000);
    expect(isWithinActiveTime(1700000000, 0, 0, 0, 0)).toBe(false);
  });

  test('일반 영업시간 (09:00~18:00, UTC+9)', () => {
    // 2025-06-15 12:00 KST = 03:00 UTC
    // UTC 03:00 → offset +9 → local 12:00 = 720분
    const utcUnix = new Date('2025-06-15T03:00:00Z').getTime() / 1000;
    mockTime(utcUnix);
    // 540(09:00) ~ 1080(18:00) 범위 안에 720분 → true
    expect(isWithinActiveTime(0, 0, 540, 1080, 9)).toBe(true);
  });

  test('영업시간 이전 (07:00 KST)', () => {
    // 07:00 KST = 22:00 UTC (전날)
    const utcUnix = new Date('2025-06-14T22:00:00Z').getTime() / 1000;
    mockTime(utcUnix);
    // offset +9 → local 07:00 = 420분. 540(09:00)~1080(18:00) 범위 밖
    expect(isWithinActiveTime(0, 0, 540, 1080, 9)).toBe(false);
  });

  test('영업시간 이후 (19:00 KST)', () => {
    // 19:00 KST = 10:00 UTC
    const utcUnix = new Date('2025-06-15T10:00:00Z').getTime() / 1000;
    mockTime(utcUnix);
    // offset +9 → local 19:00 = 1140분. 540~1080 범위 밖
    expect(isWithinActiveTime(0, 0, 540, 1080, 9)).toBe(false);
  });

  test('야간 영업 (22:00~06:00)', () => {
    // 23:00 KST = 14:00 UTC
    const utcUnix = new Date('2025-06-15T14:00:00Z').getTime() / 1000;
    mockTime(utcUnix);
    // offset +9 → local 23:00 = 1380분. dailyStart=1320(22:00), dailyEnd=360(06:00)
    // 1380 >= 1320 → true
    expect(isWithinActiveTime(0, 0, 1320, 360, 9)).toBe(true);
  });

  test('야간 영업 - 새벽 (03:00 KST)', () => {
    // 03:00 KST = 18:00 UTC (전날)
    const utcUnix = new Date('2025-06-14T18:00:00Z').getTime() / 1000;
    mockTime(utcUnix);
    // offset +9 → local 03:00 = 180분. 180 < 360 → true
    expect(isWithinActiveTime(0, 0, 1320, 360, 9)).toBe(true);
  });

  test('야간 영업 - 범위 밖 (10:00 KST)', () => {
    // 10:00 KST = 01:00 UTC
    const utcUnix = new Date('2025-06-15T01:00:00Z').getTime() / 1000;
    mockTime(utcUnix);
    // offset +9 → local 10:00 = 600분. 600 < 1320 AND 600 >= 360 → false
    expect(isWithinActiveTime(0, 0, 1320, 360, 9)).toBe(false);
  });

  test('음수 UTC 오프셋 (UTC-5, 뉴욕)', () => {
    // 14:00 UTC → 뉴욕 09:00
    const utcUnix = new Date('2025-06-15T14:00:00Z').getTime() / 1000;
    mockTime(utcUnix);
    // offset -5 → local 09:00 = 540분. 540~1080 범위 안
    expect(isWithinActiveTime(0, 0, 540, 1080, -5)).toBe(true);
  });

  test('날짜 범위 + 일별 시간 복합', () => {
    // 날짜 범위 내 + 영업시간 내
    const utcUnix = new Date('2025-06-15T03:00:00Z').getTime() / 1000;
    mockTime(utcUnix);
    expect(isWithinActiveTime(1700000000, 1800000000, 540, 1080, 9)).toBe(true);
  });

  test('날짜 범위 내지만 영업시간 밖', () => {
    // 날짜 범위 내 + 영업시간 밖 (22:00 KST)
    const utcUnix = new Date('2025-06-15T13:00:00Z').getTime() / 1000;
    mockTime(utcUnix);
    // offset +9 → 22:00 = 1320분. 540~1080 범위 밖
    expect(isWithinActiveTime(1700000000, 1800000000, 540, 1080, 9)).toBe(false);
  });
});

describe('isWithinTimeRange (하위 호환)', () => {
  afterEach(() => {
    Date.now = Date.now;
  });

  test('isWithinActiveTime 래퍼', () => {
    Date.now = () => 1750000000 * 1000;
    expect(isWithinTimeRange(1700000000, 1800000000)).toBe(true);
    expect(isWithinTimeRange(1800000001, 1900000000)).toBe(false);
  });
});

// ─── 타임존별 날짜 경계 + 영업시간 + 쿨타임 복합 테스트 ───

describe('isWithinActiveTime — 타임존별 날짜 경계', () => {
  const RealDateNow = Date.now;

  afterEach(() => {
    Date.now = RealDateNow;
  });

  function mockTime(unixSeconds) {
    Date.now = () => unixSeconds * 1000;
  }

  // 헬퍼: 특정 로컬 시각의 UTC 타임스탬프 계산
  // utcMidnight + localMinuteOfDay*60 - utcOffset*3600
  function localTimeToUtc(utcMidnight, localMinuteOfDay, utcOffset) {
    return utcMidnight + localMinuteOfDay * 60 - utcOffset * 3600;
  }

  // UTC 정규화 값 (CreateSpot에서 'T00:00:00Z'로 생성)
  const FEB18_UTC = 1771372800;     // Feb 18 00:00:00 UTC
  const MAR20_END_UTC = 1774051199; // Mar 20 23:59:59 UTC

  // ─── KST (UTC+9) 날짜 경계 ───

  test('KST: 정확히 시작일 시작 시점 (Feb 18 00:00 KST)', () => {
    // Feb 18 00:00 KST = Feb 17 15:00 UTC
    // localNow = 1771340400 + 9*3600 = 1771372800 >= 1771372800 → true
    mockTime(1771340400);
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 0, 0, 9)).toBe(true);
  });

  test('KST: 시작일 1초 전 (Feb 17 23:59:59 KST)', () => {
    // Feb 17 23:59:59 KST = Feb 17 14:59:59 UTC
    // localNow = 1771340399 + 32400 = 1771372799 < 1771372800 → false
    mockTime(1771340399);
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 0, 0, 9)).toBe(false);
  });

  test('KST: 종료일 마지막 시점 (Mar 20 23:59:59 KST)', () => {
    // Mar 20 23:59:59 KST = Mar 20 14:59:59 UTC
    // localNow = 1774018799 + 32400 = 1774051199 <= 1774051199 → true
    mockTime(1774018799);
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 0, 0, 9)).toBe(true);
  });

  test('KST: 종료일 1초 후 (Mar 21 00:00:00 KST)', () => {
    // Mar 21 00:00:00 KST = Mar 20 15:00:00 UTC
    // localNow = 1774018800 + 32400 = 1774051200 > 1774051199 → false
    mockTime(1774018800);
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 0, 0, 9)).toBe(false);
  });

  // ─── EST (UTC-5) 날짜 경계 ───

  test('EST: 시작일 1초 전 (Feb 17 23:59:59 EST)', () => {
    // Feb 17 23:59:59 EST = Feb 18 04:59:59 UTC
    // localNow = 1771390799 + (-5)*3600 = 1771372799 < 1771372800 → false
    mockTime(1771390799);
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 0, 0, -5)).toBe(false);
  });

  test('EST: 정확히 시작일 (Feb 18 00:00 EST)', () => {
    // Feb 18 00:00 EST = Feb 18 05:00 UTC
    // localNow = 1771390800 + (-5)*3600 = 1771372800 >= 1771372800 → true
    mockTime(1771390800);
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 0, 0, -5)).toBe(true);
  });

  // ─── UTC+0 날짜 경계 ───

  test('UTC+0: block.timestamp == startDate → active', () => {
    mockTime(FEB18_UTC);
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 0, 0, 0)).toBe(true);
  });

  test('UTC+0: block.timestamp == startDate - 1 → inactive', () => {
    mockTime(FEB18_UTC - 1);
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 0, 0, 0)).toBe(false);
  });

  // ─── 일별 영업시간 + 날짜 경계 복합 ───

  test('KST: 시작일 영업시간 내 (Feb 18 12:00 KST)', () => {
    // 12:00 KST = 03:00 UTC on Feb 18
    const utcTimestamp = localTimeToUtc(FEB18_UTC, 720, 9);
    mockTime(utcTimestamp);
    // 날짜 범위: localNow >= FEB18_UTC ✓, 영업시간: minuteOfDay=720, in [540,1080) ✓
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 540, 1080, 9)).toBe(true);
  });

  test('KST: 시작일 영업시간 전 (Feb 18 08:59 KST)', () => {
    // 08:59 KST = 23:59 UTC on Feb 17
    const utcTimestamp = localTimeToUtc(FEB18_UTC, 539, 9);
    mockTime(utcTimestamp);
    // 날짜 범위: localNow = utcTimestamp + 32400, 확인 필요
    // utcTimestamp = FEB18_UTC + 539*60 - 32400 = 1771372800 + 32340 - 32400 = 1771372740
    // localNow = 1771372740 + 32400 = 1771405140
    // 날짜: 1771405140 >= FEB18_UTC ✓ (범위 내)
    // 영업시간: minuteOfDay = 539, not in [540, 1080) → false
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 540, 1080, 9)).toBe(false);
  });

  test('EST: 영업시간 정확히 시작 (09:00 EST)', () => {
    // 09:00 EST = 14:00 UTC
    const utcTimestamp = localTimeToUtc(FEB18_UTC, 540, -5);
    mockTime(utcTimestamp);
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 540, 1080, -5)).toBe(true);
  });

  test('EST: 영업시간 정확히 종료 (18:00 EST)', () => {
    // 18:00 EST = 23:00 UTC → minuteOfDay=1080, not < 1080 → false
    const utcTimestamp = localTimeToUtc(FEB18_UTC, 1080, -5);
    mockTime(utcTimestamp);
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 540, 1080, -5)).toBe(false);
  });

  // ─── 야간 영업 + 타임존 ───

  test('KST: 야간 영업 23:00 → active', () => {
    // 23:00 KST = 14:00 UTC
    const utcTimestamp = localTimeToUtc(FEB18_UTC, 1380, 9);
    mockTime(utcTimestamp);
    // dailyStart=1320(22:00), dailyEnd=360(06:00)
    // 1380 >= 1320 → true
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 1320, 360, 9)).toBe(true);
  });

  test('KST: 야간 영업 03:00 → active', () => {
    // 03:00 KST = 18:00 UTC (전날)
    const utcTimestamp = localTimeToUtc(FEB18_UTC, 180, 9);
    mockTime(utcTimestamp);
    // 180 < 360 → true
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 1320, 360, 9)).toBe(true);
  });

  test('KST: 야간 영업 10:00 → inactive', () => {
    // 10:00 KST = 01:00 UTC
    const utcTimestamp = localTimeToUtc(FEB18_UTC, 600, 9);
    mockTime(utcTimestamp);
    // 600 < 1320 AND 600 >= 360 → false
    expect(isWithinActiveTime(FEB18_UTC, MAR20_END_UTC, 1320, 360, 9)).toBe(false);
  });

  // ─── 자정 경계 (KST 23:50~00:10) ───

  test('KST: 자정 경계 23:55 → active', () => {
    const utcTimestamp = localTimeToUtc(1700006400, 1435, 9);
    mockTime(utcTimestamp);
    // minuteOfDay=1435, dailyStart=1430, dailyEnd=10
    // 1435 >= 1430 → true
    expect(isWithinActiveTime(1700000000, 1800000000, 1430, 10, 9)).toBe(true);
  });

  test('KST: 자정 경계 00:05 → active', () => {
    const utcTimestamp = localTimeToUtc(1700006400, 5, 9);
    mockTime(utcTimestamp);
    // minuteOfDay=5, 5 < 10 → true
    expect(isWithinActiveTime(1700000000, 1800000000, 1430, 10, 9)).toBe(true);
  });

  test('KST: 자정 경계 00:10 → inactive', () => {
    const utcTimestamp = localTimeToUtc(1700006400, 10, 9);
    mockTime(utcTimestamp);
    // minuteOfDay=10, 10 < 10 → false, 10 >= 1430 → false
    expect(isWithinActiveTime(1700000000, 1800000000, 1430, 10, 9)).toBe(false);
  });

  // ─── 같은 UTC 시각, 다른 타임존 ───

  test('같은 UTC 시각에 KST는 활성, EST는 비활성', () => {
    // Feb 18 00:00 UTC → KST 09:00, EST 19:00
    mockTime(FEB18_UTC);

    // KST: localNow = FEB18_UTC + 32400, minuteOfDay = 540 → [540, 1080) → true
    expect(isWithinActiveTime(1700000000, 1800000000, 540, 1080, 9)).toBe(true);

    // EST: localNow = FEB18_UTC - 18000, minuteOfDay 계산
    // FEB18_UTC - 18000 = 1771354800, 현재 자정에서의 위치 확인
    // UTC 기준 00:00이므로 로컬은 19:00 EST = 1140분, not in [540, 1080)
    expect(isWithinActiveTime(1700000000, 1800000000, 540, 1080, -5)).toBe(false);
  });

  // ─── 극단 타임존 ───

  test('UTC+14: 09:00 local → active', () => {
    const utcTimestamp = localTimeToUtc(1700006400, 540, 14);
    mockTime(utcTimestamp);
    expect(isWithinActiveTime(1700000000, 1800000000, 540, 1080, 14)).toBe(true);
  });

  test('UTC-12: 09:00 local → active', () => {
    const utcTimestamp = localTimeToUtc(1700006400, 540, -12);
    mockTime(utcTimestamp);
    expect(isWithinActiveTime(1700000000, 1800000000, 540, 1080, -12)).toBe(true);
  });
});

// ─── 거리 계산 ───

describe('haversineDistance', () => {
  test('같은 좌표는 0', () => {
    expect(haversineDistance(37.5665, 126.9780, 37.5665, 126.9780)).toBeCloseTo(0, 0);
  });

  test('서울 시청 ↔ 강남역 (~9km)', () => {
    const dist = haversineDistance(37.5665, 126.9780, 37.4979, 127.0276);
    expect(dist).toBeGreaterThan(7000);
    expect(dist).toBeLessThan(11000);
  });

  test('서울 ↔ 부산 (~325km)', () => {
    const dist = haversineDistance(37.5665, 126.9780, 35.1796, 129.0756);
    expect(dist).toBeGreaterThan(300000);
    expect(dist).toBeLessThan(350000);
  });

  test('50m 이내 근접 거리', () => {
    // 약 30m 차이
    const dist = haversineDistance(37.566535, 126.977969, 37.566800, 126.977969);
    expect(dist).toBeLessThan(50);
    expect(dist).toBeGreaterThan(20);
  });
});

// ─── GeoHash ───

describe('encodeGeoHash', () => {
  test('서울 좌표 precision 5', () => {
    // 서울 시청 (37.5665, 126.978)
    const hash = encodeGeoHash(37.5665, 126.978, 5);
    expect(hash).toHaveLength(5);
    // 서울은 wydm 접두사 영역
    expect(hash.startsWith('wy')).toBe(true);
  });

  test('알려진 좌표 검증 (0, 0)', () => {
    const hash = encodeGeoHash(0, 0, 5);
    expect(hash).toBe('s0000');
  });

  test('다른 precision', () => {
    const h3 = encodeGeoHash(37.5665, 126.978, 3);
    const h4 = encodeGeoHash(37.5665, 126.978, 4);
    const h5 = encodeGeoHash(37.5665, 126.978, 5);
    expect(h3).toHaveLength(3);
    expect(h4).toHaveLength(4);
    expect(h5).toHaveLength(5);
    // 더 긴 해시는 짧은 해시의 접두사를 포함해야 함
    expect(h4.startsWith(h3)).toBe(true);
    expect(h5.startsWith(h4)).toBe(true);
  });

  test('가까운 좌표는 같은 해시 prefix 공유', () => {
    // 서울 시청과 명동 (약 2km)
    const h1 = encodeGeoHash(37.5665, 126.978, 4);
    const h2 = encodeGeoHash(37.5636, 126.9869, 4);
    // precision 4 (~39km 셀) 에서는 같은 셀
    expect(h1).toBe(h2);
  });

  test('먼 좌표는 다른 해시', () => {
    const seoul = encodeGeoHash(37.5665, 126.978, 3);
    const newyork = encodeGeoHash(40.7128, -74.006, 3);
    expect(seoul).not.toBe(newyork);
  });

  test('적도 근처 좌표', () => {
    const hash = encodeGeoHash(0.1, 0.1, 5);
    expect(hash).toHaveLength(5);
    expect(hash.startsWith('s0')).toBe(true);
  });

  test('날짜변경선 근처 (lng=179.9)', () => {
    const hash = encodeGeoHash(0, 179.9, 5);
    expect(hash).toHaveLength(5);
  });

  test('날짜변경선 근처 (lng=-179.9)', () => {
    const hash = encodeGeoHash(0, -179.9, 5);
    expect(hash).toHaveLength(5);
  });
});

describe('geoHashNeighbors', () => {
  test('8개 이웃 반환', () => {
    const center = encodeGeoHash(37.5665, 126.978, 4);
    const neighbors = geoHashNeighbors(center);
    expect(neighbors).toHaveLength(8);
  });

  test('이웃은 중심과 다른 해시', () => {
    const center = encodeGeoHash(37.5665, 126.978, 4);
    const neighbors = geoHashNeighbors(center);
    neighbors.forEach((n) => {
      expect(n).toHaveLength(4);
    });
    // 중심은 이웃에 포함되지 않음
    expect(neighbors).not.toContain(center);
  });

  test('이웃에 중복 없음', () => {
    const center = encodeGeoHash(37.5665, 126.978, 4);
    const neighbors = geoHashNeighbors(center);
    const unique = new Set(neighbors);
    expect(unique.size).toBe(8);
  });

  test('적도 근처에서도 8개 이웃', () => {
    const center = encodeGeoHash(0.01, 0.01, 4);
    const neighbors = geoHashNeighbors(center);
    expect(neighbors).toHaveLength(8);
  });

  test('날짜변경선 근처에서도 8개 이웃', () => {
    const center = encodeGeoHash(10, 179.99, 4);
    const neighbors = geoHashNeighbors(center);
    expect(neighbors).toHaveLength(8);
  });
});

describe('expandGeoHashPrefixes', () => {
  test('9개 prefix 반환 (중심 + 8 이웃)', () => {
    const prefixes = expandGeoHashPrefixes(37.5665, 126.978, 4);
    expect(prefixes).toHaveLength(9);
  });

  test('첫 번째는 중심 해시', () => {
    const prefixes = expandGeoHashPrefixes(37.5665, 126.978, 4);
    const center = encodeGeoHash(37.5665, 126.978, 4);
    expect(prefixes[0]).toBe(center);
  });
});
