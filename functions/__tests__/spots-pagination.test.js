/**
 * functions/index.js — /api/spots 페이지네이션 단위 테스트
 *
 * firebase-admin, firebase-functions를 모킹하여
 * Express app을 직접 테스트합니다.
 */
const http = require('http');

// ─── Mock 데이터 ───
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

// Firestore 스냅샷 생성 헬퍼
function makeSnap(spots) {
  return {
    docs: spots.map((s) => ({
      id: String(s.id),
      data: () => ({ ...s }),
    })),
  };
}

// ─── Firebase 모킹 ───
const mockGet = jest.fn().mockResolvedValue(makeSnap(MOCK_SPOTS));
const mockCollection = jest.fn().mockReturnValue({ get: mockGet });

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({ collection: mockCollection })),
}));

// firebase-functions 모킹: onRequest로 전달된 Express app을 캡처
let capturedApp;
jest.mock('firebase-functions', () => ({
  https: {
    onRequest: (app) => {
      capturedApp = app;
      return app;
    },
  },
}));

// ethers 모킹 (spots 테스트에는 불필요하지만 index.js require 시 필요)
jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn(),
    Contract: jest.fn(),
    Wallet: jest.fn(),
  },
}));

// index.js require → capturedApp에 Express app 캡처
require('../index');

// ─── 테스트 유틸 ───
function request(path) {
  return new Promise((resolve, reject) => {
    const server = capturedApp.listen(0, () => {
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

beforeEach(() => {
  mockGet.mockResolvedValue(makeSnap(MOCK_SPOTS));
});

// ─── 하위 호환 ───

describe('하위 호환 (파라미터 없음)', () => {
  test('전체 배열 반환', async () => {
    const { status, body } = await request('/api/spots?network=thanos-sepolia');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(MOCK_SPOTS.length);
  });

  test('active 플래그 포함', async () => {
    const { body } = await request('/api/spots?network=thanos-sepolia');
    body.forEach((s) => {
      expect(s).toHaveProperty('active');
    });
  });

  test('remaining=0인 스팟은 inactive', async () => {
    const { body } = await request('/api/spots?network=thanos-sepolia');
    const itaewon = body.find((s) => s.id === 5);
    expect(itaewon.active).toBe(false);
  });
});

// ─── 페이지네이션 ───

describe('페이지네이션', () => {
  test('limit=3 → 3개 반환 + pagination 메타', async () => {
    const { status, body } = await request('/api/spots?network=thanos-sepolia&limit=3');
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
    const { body } = await request('/api/spots?network=thanos-sepolia&limit=5&offset=8');
    expect(body.spots).toHaveLength(2);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.total).toBe(10);
  });

  test('limit=0 → 최소 1로 보정', async () => {
    const { body } = await request('/api/spots?network=thanos-sepolia&limit=0');
    expect(body.spots.length).toBeGreaterThanOrEqual(1);
    expect(body.pagination.limit).toBe(1);
  });

  test('limit=999 → 최대 200으로 보정', async () => {
    const { body } = await request('/api/spots?network=thanos-sepolia&limit=999');
    expect(body.pagination.limit).toBe(200);
  });

  test('offset이 total보다 크면 빈 배열', async () => {
    const { body } = await request('/api/spots?network=thanos-sepolia&limit=5&offset=100');
    expect(body.spots).toHaveLength(0);
    expect(body.pagination.hasMore).toBe(false);
  });
});

// ─── 위치 기반 정렬 ───

describe('위치 기반 정렬', () => {
  test('강남역 근처 → 강남역이 첫 번째', async () => {
    const { body } = await request('/api/spots?network=thanos-sepolia&lat=37.497&lng=127.027&limit=3');
    expect(body.spots[0].name).toBe('강남역');
    expect(body.spots[0]).toHaveProperty('distance');
    expect(body.spots[0].distance).toBeLessThan(500);
  });

  test('부산역 근처 → 부산역이 첫 번째', async () => {
    const { body } = await request('/api/spots?network=thanos-sepolia&lat=35.115&lng=129.042&limit=3');
    expect(body.spots[0].name).toBe('부산역');
  });

  test('거리순 정렬 확인', async () => {
    const { body } = await request('/api/spots?network=thanos-sepolia&lat=37.5&lng=127.0&limit=10');
    for (let i = 1; i < body.spots.length; i++) {
      expect(body.spots[i].distance).toBeGreaterThanOrEqual(body.spots[i - 1].distance);
    }
  });
});

// ─── 필터 ───

describe('필터', () => {
  test('filter=active → remaining>0인 스팟만', async () => {
    const { body } = await request('/api/spots?network=thanos-sepolia&filter=active&limit=50');
    body.spots.forEach((s) => {
      expect(s.active).toBe(true);
    });
    expect(body.spots.find((s) => s.id === 5)).toBeUndefined();
  });

  test('filter=inactive → inactive 스팟만', async () => {
    const { body } = await request('/api/spots?network=thanos-sepolia&filter=inactive&limit=50');
    body.spots.forEach((s) => {
      expect(s.active).toBe(false);
    });
  });

  test('filter + 위치 + 페이지네이션 복합', async () => {
    const { body } = await request('/api/spots?network=thanos-sepolia&lat=37.5&lng=127.0&limit=3&filter=active');
    expect(body.spots.length).toBeLessThanOrEqual(3);
    body.spots.forEach((s) => {
      expect(s.active).toBe(true);
      expect(s).toHaveProperty('distance');
    });
    expect(body.pagination.total).toBeLessThan(MOCK_SPOTS.length);
  });
});
