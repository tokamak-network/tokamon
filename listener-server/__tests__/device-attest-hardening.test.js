/**
 * Attestation hardening 테스트
 *
 * 1. attest-challenge: device_id 필수 검증
 * 2. attestChallenges Map 크기 제한 (MAX_CHALLENGES)
 * 3. assertion 미들웨어: 단일 쿼리로 device_hash 포함 조회
 */

const express = require('express');
const http = require('http');

// ─── 모킹 ───

jest.mock('../blockchain', () => ({
  claimByDevice: jest.fn(),
  getSpot: jest.fn(),
  canClaimDevice: jest.fn(),
  getDeviceBalance: jest.fn(),
  getDeviceLinkedWallet: jest.fn(),
  getDeviceStampInfo: jest.fn(),
  checkWalletAvailability: jest.fn(),
  linkDeviceToWallet: jest.fn(),
}));

jest.mock('../firebase-admin', () => ({
  sendPushNotification: jest.fn().mockResolvedValue(true),
  saveDeviceClaimEvent: jest.fn().mockResolvedValue(),
  saveDeviceAttestKey: jest.fn().mockResolvedValue(),
  updateDeviceAttestKeySignCount: jest.fn().mockResolvedValue(),
}));

jest.mock('../attestation', () => ({
  verifyPlayIntegrity: jest.fn(),
  verifyIosAttestation: jest.fn(),
  verifyIosAssertion: jest.fn(),
  generateChallenge: jest.fn().mockReturnValue('dGVzdC1jaGFsbGVuZ2U='),
}));

// 환경변수
process.env.DEVICE_HASH_SALT = 'test-salt';
process.env.REQUIRE_ATTESTATION = 'true';

const deviceRoutes = require('../routes/device');
const { updateDeviceAttestKeySignCount } = require('../firebase-admin');
const { verifyIosAssertion } = require('../attestation');

// ─── SQLite mock ───

function createMockDb() {
  return {
    run: jest.fn((sql, params, cb) => {
      if (typeof params === 'function') { params(null); return; }
      if (cb) cb.call({ changes: 1 }, null);
    }),
    get: jest.fn((sql, params, cb) => {
      cb(null, null);
    }),
    all: jest.fn((sql, params, cb) => {
      cb(null, []);
    }),
  };
}

// ─── HTTP POST 헬퍼 ───

function postRequest(app, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const data = JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      }, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(responseBody) });
          } catch (e) {
            resolve({ status: res.statusCode, body: responseBody });
          }
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      req.write(data);
      req.end();
    });
  });
}

function postRequestWithHeaders(app, path, body, headers) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const data = JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...headers,
        },
      }, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(responseBody) });
          } catch (e) {
            resolve({ status: res.statusCode, body: responseBody });
          }
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      req.write(data);
      req.end();
    });
  });
}

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/device', deviceRoutes(db));
  return app;
}

// ─── 테스트 ───

// setInterval 정리 (device.js의 rateLimits/attestChallenges 정리 타이머)
afterAll(() => {
  jest.useRealTimers();
  const id = setTimeout(() => {}, 0);
  for (let i = 0; i <= id; i++) clearInterval(i);
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('attest-challenge: device_id 필수', () => {
  it('device_id 없으면 400 반환', async () => {
    const db = createMockDb();
    const app = createApp(db);

    const { status, body } = await postRequest(app, '/api/device/attest-challenge', {});

    expect(status).toBe(400);
    expect(body.error).toMatch(/device_id/i);
  });

  it('device_id 있으면 challenge 정상 반환', async () => {
    const db = createMockDb();
    const app = createApp(db);

    const { status, body } = await postRequest(app, '/api/device/attest-challenge', {
      device_id: 'test-device-123',
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('challenge_id');
    expect(body).toHaveProperty('challenge');
  });
});

describe('assertion 미들웨어: 단일 쿼리로 device_hash 포함 조회', () => {
  it('key_id 조회 시 device_hash도 함께 SELECT하여 Firestore 동기화', async () => {
    const db = createMockDb();
    const mockDeviceHash = 'abc123';
    const mockPublicKey = '-----BEGIN PUBLIC KEY-----\nMOCK\n-----END PUBLIC KEY-----';

    // DB mock: device_hash, public_key_pem, sign_count 반환
    db.get.mockImplementation((sql, params, cb) => {
      if (sql.includes('SELECT') && sql.includes('device_attest_keys')) {
        cb(null, { device_hash: mockDeviceHash, public_key_pem: mockPublicKey, sign_count: 5 });
      } else {
        cb(null, null);
      }
    });

    verifyIosAssertion.mockResolvedValue({ valid: true, newSignCount: 6 });

    // signCount 업데이트 성공하도록 mock
    db.run.mockImplementation((sql, params, cb) => {
      if (typeof params === 'function') { params(null); return; }
      if (cb) cb.call({ changes: 1 }, null);
    });

    const app = createApp(db);

    // attestation 미들웨어 뒤의 라우트 호출 (balance 엔드포인트 사용)
    const { status } = await postRequestWithHeaders(app, '/api/device/balance', {
      device_id: 'test-device',
    }, {
      'x-attestation-token': 'mock-assertion-token',
      'x-attestation-platform': 'ios',
      'x-attestation-key-id': 'test-key-id',
      'x-attestation-client-data': 'dGVzdA==',
    });

    // DB에서 device_hash 포함 쿼리가 실행되었는지 확인
    const selectCall = db.get.mock.calls.find(call =>
      call[0].includes('SELECT') && call[0].includes('device_attest_keys')
    );
    expect(selectCall).toBeDefined();
    expect(selectCall[0]).toContain('device_hash');

    // Firestore signCount 동기화가 device_hash로 호출되었는지 확인
    expect(updateDeviceAttestKeySignCount).toHaveBeenCalledWith(mockDeviceHash, 6);
  });

  it('DB에 키가 없으면 두 번째 쿼리 없이 403 반환', async () => {
    const db = createMockDb();
    // DB mock: 키 없음
    db.get.mockImplementation((sql, params, cb) => {
      cb(null, null);
    });

    const app = createApp(db);

    const { status, body } = await postRequestWithHeaders(app, '/api/device/balance', {
      device_id: 'test-device',
    }, {
      'x-attestation-token': 'mock-assertion-token',
      'x-attestation-platform': 'ios',
      'x-attestation-key-id': 'nonexistent-key',
      'x-attestation-client-data': 'dGVzdA==',
    });

    expect(status).toBe(403);
    expect(body.code).toBe('ATTEST_REQUIRED');

    // device_hash 별도 조회가 없어야 함 (쿼리 1회만)
    const attestKeyCalls = db.get.mock.calls.filter(call =>
      call[0].includes('device_attest_keys')
    );
    expect(attestKeyCalls).toHaveLength(1);
  });
});
