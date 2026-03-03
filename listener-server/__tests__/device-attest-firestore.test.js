/**
 * Device Attest Keys — Firestore 백업/복원 함수 단위 테스트
 *
 * saveDeviceAttestKey, getAllDeviceAttestKeys, updateDeviceAttestKeySignCount
 */

// ─── Firestore 모킹 ───

const mockSet = jest.fn().mockResolvedValue();
const mockUpdate = jest.fn().mockResolvedValue();
const mockGet = jest.fn();
const mockDoc = jest.fn(() => ({ set: mockSet, update: mockUpdate }));
const mockCollection = jest.fn(() => ({ doc: mockDoc, get: mockGet }));
const mockDb = { collection: mockCollection };

// 환경변수를 모듈 로드 전에 설정
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.NETWORK = 'thanos-sepolia';

// firebase-admin 모킹 (모듈 로드 전에 설정)
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn(), applicationDefault: jest.fn() },
  firestore: jest.fn(() => mockDb),
  apps: [],
  messaging: jest.fn(),
}));

// fs 모킹 — existsSync는 serviceAccountKey.json에 대해 false 반환
jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
}));

// firebase-admin.js 로드 (모킹 + 환경변수 설정 후)
const {
  saveDeviceAttestKey,
  getAllDeviceAttestKeys,
  updateDeviceAttestKeySignCount,
} = require('../firebase-admin');

// ─── 테스트 ───

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('saveDeviceAttestKey', () => {
  const deviceHash = 'abc123def456';
  const keyData = {
    key_id: 'test-key-id',
    public_key_pem: '-----BEGIN PUBLIC KEY-----\nMOCK\n-----END PUBLIC KEY-----',
    receipt: 'base64receipt==',
    sign_count: 0,
    created_at: 1700000000,
    updated_at: 1700000000,
  };

  it('Firestore에 키 데이터를 merge로 저장', async () => {
    await saveDeviceAttestKey(deviceHash, keyData);

    expect(mockCollection).toHaveBeenCalledWith('networks/thanos-sepolia/device_attest_keys');
    expect(mockDoc).toHaveBeenCalledWith(deviceHash);
    expect(mockSet).toHaveBeenCalledWith({
      key_id: keyData.key_id,
      public_key_pem: keyData.public_key_pem,
      receipt: keyData.receipt,
      sign_count: 0,
      created_at: keyData.created_at,
      updated_at: keyData.updated_at,
    }, { merge: true });
  });

  it('receipt가 없으면 null로 저장', async () => {
    const noReceiptData = { ...keyData, receipt: undefined };
    await saveDeviceAttestKey(deviceHash, noReceiptData);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ receipt: null }),
      { merge: true }
    );
  });

  it('Firestore 에러 시 throw하지 않고 로그만 출력', async () => {
    mockSet.mockRejectedValueOnce(new Error('Firestore 연결 실패'))
           .mockRejectedValueOnce(new Error('Firestore 연결 실패'))
           .mockRejectedValueOnce(new Error('Firestore 연결 실패'));

    await saveDeviceAttestKey(deviceHash, keyData);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('device_attest_keys 저장 실패'),
      'Firestore 연결 실패'
    );
  });
});

describe('getAllDeviceAttestKeys', () => {
  it('모든 키를 배열로 반환', async () => {
    const mockDocs = [
      {
        id: 'hash1',
        data: () => ({
          key_id: 'key1',
          public_key_pem: 'pem1',
          receipt: 'r1',
          sign_count: 3,
          created_at: 1700000000,
          updated_at: 1700000001,
        }),
      },
      {
        id: 'hash2',
        data: () => ({
          key_id: 'key2',
          public_key_pem: 'pem2',
          receipt: null,
          sign_count: 0,
          created_at: 1700000002,
          updated_at: 1700000002,
        }),
      },
    ];
    mockGet.mockResolvedValue({ docs: mockDocs });

    const result = await getAllDeviceAttestKeys();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      device_hash: 'hash1',
      key_id: 'key1',
      public_key_pem: 'pem1',
      receipt: 'r1',
      sign_count: 3,
      created_at: 1700000000,
      updated_at: 1700000001,
    });
    expect(result[1].device_hash).toBe('hash2');
    expect(result[1].receipt).toBeNull();
  });

  it('컬렉션이 비어있으면 빈 배열 반환', async () => {
    mockGet.mockResolvedValue({ docs: [] });

    const result = await getAllDeviceAttestKeys();

    expect(result).toEqual([]);
  });

  it('Firestore 에러 시 빈 배열 반환', async () => {
    mockGet.mockRejectedValue(new Error('permission denied'));

    const result = await getAllDeviceAttestKeys();

    expect(result).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('device_attest_keys 조회 실패'),
      'permission denied'
    );
  });

  it('receipt 필드가 없는 문서도 null로 처리', async () => {
    mockGet.mockResolvedValue({
      docs: [{
        id: 'hash3',
        data: () => ({
          key_id: 'key3',
          public_key_pem: 'pem3',
          // receipt 필드 없음
          sign_count: 1,
          created_at: 1700000000,
          updated_at: 1700000000,
        }),
      }],
    });

    const result = await getAllDeviceAttestKeys();

    expect(result[0].receipt).toBeNull();
  });
});

describe('updateDeviceAttestKeySignCount', () => {
  const deviceHash = 'abc123def456';

  it('signCount와 updated_at을 업데이트', async () => {
    const before = Math.floor(Date.now() / 1000);
    await updateDeviceAttestKeySignCount(deviceHash, 5);

    expect(mockCollection).toHaveBeenCalledWith('networks/thanos-sepolia/device_attest_keys');
    expect(mockDoc).toHaveBeenCalledWith(deviceHash);
    expect(mockUpdate).toHaveBeenCalledWith({
      sign_count: 5,
      updated_at: expect.any(Number),
    });

    const updatedAt = mockUpdate.mock.calls[0][0].updated_at;
    expect(updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('Firestore 에러 시 throw하지 않고 로그만 출력', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('update 실패'))
              .mockRejectedValueOnce(new Error('update 실패'))
              .mockRejectedValueOnce(new Error('update 실패'));

    await updateDeviceAttestKeySignCount(deviceHash, 10);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('signCount 업데이트 실패'),
      'update 실패'
    );
  });
});

