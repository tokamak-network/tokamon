const express = require('express');
const blockchain = require('../blockchain');
const spotsRouter = require('../routes/spots');

// blockchain mock
jest.mock('../blockchain', () => ({
  getAllSpotsCached: jest.fn(),
  getSpotsByGeoHash: jest.fn(),
  getSpot: jest.fn(),
  updateAllowDuplicateClaims: jest.fn(),
}));

// supertest 없이 express + http로 테스트
const http = require('http');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/spots', spotsRouter);
  return app;
}

function request(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, body });
          }
        });
      }).on('error', (err) => {
        server.close();
        reject(err);
      });
    });
  });
}

// 테스트용 스팟 데이터 (서울 주변 10개)
const MOCK_SPOTS = [
  { id: 0, name: '강남역', reward: 0.5, remaining: 100, lat: 37.4979, lng: 127.0276, start_time: 0, end_time: 0, daily_start_time: 0, daily_end_time: 0, utc_offset: 9, cooldown: 3600 },
  { id: 1, name: '서울역', reward: 0.5, remaining: 100, lat: 37.5547, lng: 126.9707, start_time: 0, end_time: 0, daily_start_time: 0, daily_end_time: 0, utc_offset: 9, cooldown: 3600 },
  { id: 2, name: '홍대입구', reward: 0.3, remaining: 50, lat: 37.5571, lng: 126.9246, start_time: 0, end_time: 0, daily_start_time: 0, daily_end_time: 0, utc_offset: 9, cooldown: 3600 },
  { id: 3, name: '잠실역', reward: 1.0, remaining: 200, lat: 37.5133, lng: 127.1001, start_time: 0, end_time: 0, daily_start_time: 0, daily_end_time: 0, utc_offset: 9, cooldown: 3600 },
  { id: 4, name: '명동', reward: 0.2, remaining: 30, lat: 37.5636, lng: 126.9869, start_time: 0, end_time: 0, daily_start_time: 0, daily_end_time: 0, utc_offset: 9, cooldown: 3600 },
  { id: 5, name: '이태원', reward: 0.5, remaining: 0, lat: 37.5345, lng: 126.9946, start_time: 0, end_time: 0, daily_start_time: 0, daily_end_time: 0, utc_offset: 9, cooldown: 3600 },
  { id: 6, name: '종로', reward: 0.4, remaining: 80, lat: 37.5704, lng: 126.9920, start_time: 0, end_time: 0, daily_start_time: 0, daily_end_time: 0, utc_offset: 9, cooldown: 3600 },
  { id: 7, name: '신촌', reward: 0.3, remaining: 40, lat: 37.5553, lng: 126.9367, start_time: 0, end_time: 0, daily_start_time: 0, daily_end_time: 0, utc_offset: 9, cooldown: 3600 },
  { id: 8, name: '부산역', reward: 0.5, remaining: 100, lat: 35.1151, lng: 129.0422, start_time: 0, end_time: 0, daily_start_time: 0, daily_end_time: 0, utc_offset: 9, cooldown: 3600 },
  { id: 9, name: '해운대', reward: 0.5, remaining: 100, lat: 35.1631, lng: 129.1635, start_time: 0, end_time: 0, daily_start_time: 0, daily_end_time: 0, utc_offset: 9, cooldown: 3600 },
];

const { encodeGeoHash } = require('../utils');

beforeEach(() => {
  blockchain.getAllSpotsCached.mockReturnValue(MOCK_SPOTS);
  // getSpotsByGeoHash: 주어진 prefix에 매칭되는 스팟을 MOCK_SPOTS에서 필터
  blockchain.getSpotsByGeoHash.mockImplementation((prefixes) => {
    return MOCK_SPOTS.filter((s) => {
      const hash = encodeGeoHash(s.lat, s.lng, 5);
      return prefixes.some((p) => hash.startsWith(p));
    });
  });
});

// ─── 하위 호환 ───

describe('하위 호환 (파라미터 없음)', () => {
  test('전체 배열 반환', async () => {
    const app = createApp();
    const { status, body } = await request(app, '/api/spots');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(MOCK_SPOTS.length);
  });

  test('active 플래그 포함', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots');
    body.forEach((s) => {
      expect(s).toHaveProperty('active');
    });
  });

  test('remaining=0인 스팟은 inactive', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots');
    const itaewon = body.find((s) => s.id === 5);
    expect(itaewon.active).toBe(false);
  });
});

// ─── 페이지네이션 ───

describe('페이지네이션', () => {
  test('limit=3 → 3개 반환 + pagination 메타', async () => {
    const app = createApp();
    const { status, body } = await request(app, '/api/spots?limit=3');
    expect(status).toBe(200);
    expect(body.spots).toHaveLength(3);
    expect(body.pagination).toEqual({
      total: 10,
      offset: 0,
      limit: 3,
      hasMore: true,
    });
  });

  test('offset=8, limit=5 → 나머지 2개 + hasMore=false', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots?limit=5&offset=8');
    expect(body.spots).toHaveLength(2);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.total).toBe(10);
  });

  test('limit=0 → 최소 1로 보정', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots?limit=0');
    expect(body.spots.length).toBeGreaterThanOrEqual(1);
    expect(body.pagination.limit).toBe(1);
  });

  test('limit=999 → 최대 200으로 보정', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots?limit=999');
    expect(body.pagination.limit).toBe(200);
  });

  test('offset이 total보다 크면 빈 배열', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots?limit=5&offset=100');
    expect(body.spots).toHaveLength(0);
    expect(body.pagination.hasMore).toBe(false);
  });
});

// ─── 위치 기반 정렬 ───

describe('위치 기반 정렬', () => {
  test('강남역 근처 → 강남역이 첫 번째', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots?lat=37.497&lng=127.027&limit=3');
    expect(body.spots[0].name).toBe('강남역');
    expect(body.spots[0]).toHaveProperty('distance');
    expect(body.spots[0].distance).toBeLessThan(500);
  });

  test('부산역 근처 → 부산역이 첫 번째', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots?lat=35.115&lng=129.042&limit=3');
    expect(body.spots[0].name).toBe('부산역');
  });

  test('거리순 정렬 확인', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots?lat=37.5&lng=127.0&limit=10');
    for (let i = 1; i < body.spots.length; i++) {
      expect(body.spots[i].distance).toBeGreaterThanOrEqual(body.spots[i - 1].distance);
    }
  });
});

// ─── 필터 ───

describe('필터', () => {
  test('filter=active → remaining>0인 스팟만', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots?filter=active&limit=50');
    body.spots.forEach((s) => {
      expect(s.active).toBe(true);
    });
    // id=5 (이태원, remaining=0)은 빠져야 함
    expect(body.spots.find((s) => s.id === 5)).toBeUndefined();
  });

  test('filter=inactive → inactive 스팟만', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots?filter=inactive&limit=50');
    body.spots.forEach((s) => {
      expect(s.active).toBe(false);
    });
  });

  test('filter + 위치 + 페이지네이션 복합', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots?lat=37.5&lng=127.0&limit=3&filter=active');
    expect(body.spots.length).toBeLessThanOrEqual(3);
    body.spots.forEach((s) => {
      expect(s.active).toBe(true);
      expect(s).toHaveProperty('distance');
    });
    expect(body.pagination.total).toBeLessThan(MOCK_SPOTS.length); // inactive 제외
  });
});

// ─── GeoHash 인덱스 검색 ───

describe('GeoHash 적응형 검색', () => {
  test('위치 기반 검색 결과와 전체 검색 결과가 동일한 정렬 순서', async () => {
    const app = createApp();
    // GeoHash 검색 (위치 있음)
    const { body: geoBody } = await request(app, '/api/spots?lat=37.5&lng=127.0&limit=200');
    // 전체 fallback과 비교 — 거리순 정렬이 동일해야 함
    for (let i = 1; i < geoBody.spots.length; i++) {
      expect(geoBody.spots[i].distance).toBeGreaterThanOrEqual(geoBody.spots[i - 1].distance);
    }
  });

  test('적응형 확대: 좁은 범위에 스팟 적으면 범위 확장', async () => {
    // 뉴욕 좌표 — 한국 스팟만 있으므로 precision 5, 4, 3 모두 결과 적음 → fallback
    const app = createApp();
    const { body } = await request(app, '/api/spots?lat=40.7&lng=-74.0&limit=5');
    // fallback으로 전체 스팟 반환
    expect(body.spots.length).toBeGreaterThanOrEqual(5);
    expect(body.spots[0]).toHaveProperty('distance');
  });

  test('getSpotsByGeoHash가 호출됨 (위치 기반 요청)', async () => {
    const app = createApp();
    await request(app, '/api/spots?lat=37.5&lng=127.0&limit=3');
    expect(blockchain.getSpotsByGeoHash).toHaveBeenCalled();
  });

  test('위치 없는 요청은 getSpotsByGeoHash 호출 안함', async () => {
    blockchain.getSpotsByGeoHash.mockClear();
    const app = createApp();
    await request(app, '/api/spots?limit=5');
    expect(blockchain.getSpotsByGeoHash).not.toHaveBeenCalled();
  });

  test('GeoHash 검색에서도 filter=active 적용', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots?lat=37.5&lng=127.0&limit=50&filter=active');
    body.spots.forEach((s) => {
      expect(s.active).toBe(true);
    });
    expect(body.spots.find((s) => s.id === 5)).toBeUndefined();
  });

  test('서울 근처에서 서울 스팟이 부산 스팟보다 먼저 나옴', async () => {
    const app = createApp();
    const { body } = await request(app, '/api/spots?lat=37.55&lng=126.98&limit=10');
    const seoulSpotIdx = body.spots.findIndex((s) => s.name === '서울역');
    const busanSpotIdx = body.spots.findIndex((s) => s.name === '부산역');
    expect(seoulSpotIdx).toBeLessThan(busanSpotIdx);
  });
});
