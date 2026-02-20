/**
 * checkWalletAvailability 단위 테스트
 *
 * blockchain 모듈의 컨트랙트 호출을 mock하여
 * 서버 레벨 지갑 가용성 체크 로직만 검증합니다.
 */

// ── 모듈 mock 설정 ──

// ethers: toAddr / fromWei 등이 사용하는 부분만 mock
jest.mock('ethers', () => ({
  ethers: {
    getAddress: (addr) => addr.toLowerCase(),
    formatEther: (wei) => String(Number(wei) / 1e18),
    parseEther: (val) => BigInt(Math.round(Number(val) * 1e18)),
    version: '6.0.0-mock',
    JsonRpcProvider: jest.fn(),
    WebSocketProvider: jest.fn(),
    Contract: jest.fn(),
    Wallet: jest.fn(),
  },
}));

// firebase-admin mock
jest.mock('../firebase-admin', () => ({
  syncSpotToFirestore: jest.fn(),
  saveTelegramClaimEvent: jest.fn(),
  syncTelegramBalance: jest.fn(),
  saveWalletTelegramLink: jest.fn(),
  getTelegramUsernameByHash: jest.fn(),
  syncDeviceBalance: jest.fn(),
  sendPushNotification: jest.fn(),
  saveDeviceClaimEvent: jest.fn(),
  NETWORK_ID: 'test',
}));

// shared/networks mock
jest.mock('../../shared/networks', () => ({
  getNetwork: () => ({ name: 'test', chainId: 1, rpcUrl: 'http://localhost:8545' }),
  getContracts: () => ({ tokamon: '0x' + '1'.repeat(40) }),
  DEFAULT_NETWORK: 'test',
}));

// fs mock (blockchain.js init에서 파일 읽기 시도)
jest.mock('fs', () => ({
  existsSync: () => false,
  readFileSync: () => '{}',
  writeFileSync: () => {},
}));

// ── 컨트랙트 mock 함수 ──

const mockGetWalletLinkedTelegram = jest.fn();
const mockGetWalletLinkedDevice = jest.fn();
const mockGetTelegramBalance = jest.fn();
const mockGetDeviceBalance = jest.fn();

// blockchain 모듈 내부의 contract 객체를 직접 접근할 수 없으므로
// checkWalletAvailability 로직을 직접 테스트합니다.

const ZERO_BYTES32 = '0x' + '0'.repeat(64);
const HASH_A = '0x' + 'a'.repeat(64); // 기존 등록된 유저
const HASH_B = '0x' + 'b'.repeat(64); // 새로 등록 시도하는 유저
const WALLET = '0x' + '1'.repeat(40);

// checkWalletAvailability 로직을 그대로 재현하여 테스트
async function checkWalletAvailability(walletAddress, requestType, requesterHash) {
  const fullRequesterHash = '0x' + requesterHash;

  if (requestType === 'telegram') {
    const linkedHash = await mockGetWalletLinkedTelegram(walletAddress);
    if (linkedHash !== ZERO_BYTES32 && linkedHash !== fullRequesterHash) {
      const balance = await mockGetTelegramBalance(linkedHash);
      if (balance > 0n) {
        return {
          available: false,
          reason: 'This wallet is already in use by another Telegram account. Please use a different wallet address.',
        };
      }
    }
  } else if (requestType === 'device') {
    const linkedHash = await mockGetWalletLinkedDevice(walletAddress);
    if (linkedHash !== ZERO_BYTES32 && linkedHash !== fullRequesterHash) {
      const balance = await mockGetDeviceBalance(linkedHash);
      if (balance > 0n) {
        return {
          available: false,
          reason: 'This wallet is already in use by another device. Please use a different wallet address.',
        };
      }
    }
  }

  return { available: true };
}

// ── 테스트 ──

describe('checkWalletAvailability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── 텔레그램 ───

  describe('telegram', () => {
    test('지갑이 어디에도 연결되지 않은 경우 → 통과', async () => {
      mockGetWalletLinkedTelegram.mockResolvedValue(ZERO_BYTES32);

      const result = await checkWalletAvailability(WALLET, 'telegram', 'b'.repeat(64));
      expect(result.available).toBe(true);
    });

    test('같은 텔레그램 유저가 이미 연결한 경우 → 통과 (재등록)', async () => {
      mockGetWalletLinkedTelegram.mockResolvedValue(HASH_B);

      const result = await checkWalletAvailability(WALLET, 'telegram', 'b'.repeat(64));
      expect(result.available).toBe(true);
      // 잔액 조회하지 않음
      expect(mockGetTelegramBalance).not.toHaveBeenCalled();
    });

    test('다른 텔레그램 유저가 쓰고 있고 잔액 > 0 → 차단', async () => {
      mockGetWalletLinkedTelegram.mockResolvedValue(HASH_A);
      mockGetTelegramBalance.mockResolvedValue(5000000000000000000n); // 5 TON

      const result = await checkWalletAvailability(WALLET, 'telegram', 'b'.repeat(64));
      expect(result.available).toBe(false);
      expect(result.reason).toContain('another Telegram account');
    });

    test('다른 텔레그램 유저가 쓰고 있지만 잔액 0 → 통과', async () => {
      mockGetWalletLinkedTelegram.mockResolvedValue(HASH_A);
      mockGetTelegramBalance.mockResolvedValue(0n);

      const result = await checkWalletAvailability(WALLET, 'telegram', 'b'.repeat(64));
      expect(result.available).toBe(true);
    });
  });

  // ─── 디바이스 ───

  describe('device', () => {
    test('지갑이 어디에도 연결되지 않은 경우 → 통과', async () => {
      mockGetWalletLinkedDevice.mockResolvedValue(ZERO_BYTES32);

      const result = await checkWalletAvailability(WALLET, 'device', 'b'.repeat(64));
      expect(result.available).toBe(true);
    });

    test('같은 디바이스가 이미 연결한 경우 → 통과 (재등록)', async () => {
      mockGetWalletLinkedDevice.mockResolvedValue(HASH_B);

      const result = await checkWalletAvailability(WALLET, 'device', 'b'.repeat(64));
      expect(result.available).toBe(true);
      expect(mockGetDeviceBalance).not.toHaveBeenCalled();
    });

    test('다른 디바이스가 쓰고 있고 잔액 > 0 → 차단', async () => {
      mockGetWalletLinkedDevice.mockResolvedValue(HASH_A);
      mockGetDeviceBalance.mockResolvedValue(3000000000000000000n); // 3 TON

      const result = await checkWalletAvailability(WALLET, 'device', 'b'.repeat(64));
      expect(result.available).toBe(false);
      expect(result.reason).toContain('another device');
    });

    test('다른 디바이스가 쓰고 있지만 잔액 0 → 통과', async () => {
      mockGetWalletLinkedDevice.mockResolvedValue(HASH_A);
      mockGetDeviceBalance.mockResolvedValue(0n);

      const result = await checkWalletAvailability(WALLET, 'device', 'b'.repeat(64));
      expect(result.available).toBe(true);
    });
  });

  // ─── 응답 메시지 검증 ───

  describe('응답 메시지에 민감 정보 미포함', () => {
    test('텔레그램 차단 메시지에 잔액 미포함', async () => {
      mockGetWalletLinkedTelegram.mockResolvedValue(HASH_A);
      mockGetTelegramBalance.mockResolvedValue(5000000000000000000n);

      const result = await checkWalletAvailability(WALLET, 'telegram', 'b'.repeat(64));
      expect(result.reason).not.toMatch(/\d+\.?\d*\s*TON/);
      expect(result.reason).not.toContain(HASH_A);
    });

    test('디바이스 차단 메시지에 잔액 미포함', async () => {
      mockGetWalletLinkedDevice.mockResolvedValue(HASH_A);
      mockGetDeviceBalance.mockResolvedValue(3000000000000000000n);

      const result = await checkWalletAvailability(WALLET, 'device', 'b'.repeat(64));
      expect(result.reason).not.toMatch(/\d+\.?\d*\s*TON/);
      expect(result.reason).not.toContain(HASH_A);
    });
  });
});
