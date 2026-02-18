import { Platform } from 'react-native';

export const COORD_SCALE = 1_000_000;
export const COLLECT_RADIUS = 15; // meters
export const MIN_DEPOSIT = 10;

// 로컬 기본값 (에뮬레이터용)
const LOCAL_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

// 환경변수(EXPO_PUBLIC_*)로 오버라이드 가능, 미설정 시 로컬 기본값 사용
// .env 예시: app/.env.example 참고
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE
  || `http://${LOCAL_HOST}:5002/api`;

export const WALLETCONNECT_PROJECT_ID = process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID
  || '';

export const WEB_CLIENT_URL = process.env.EXPO_PUBLIC_WEB_CLIENT_URL
  || `http://${LOCAL_HOST}:5173`;

export const WEB_CUSTOMER_PAGE_URL = process.env.EXPO_PUBLIC_WEB_CUSTOMER_PAGE_URL
  || 'https://go.tokamon.io';

// Contract ABI for client-side calls
export const TOKAMON_ABI = [
  'function createSpotSelf(uint256 reward, uint128 stampGoal, uint128 stampBonus, uint48 cooldown, bool allowDuplicateClaims, tuple(string name, string description, int96 lat, int96 lng, uint64 startDate, uint64 endDate, uint16 dailyStartTime, uint16 dailyEndTime, int8 utcOffset) meta) payable returns (uint256)',
  'function redepositSelf(uint256 spotId) payable',
  'function updateCooldown(uint256 spotId, uint48 newCooldown) external',
  'function updateAllowDuplicateClaims(uint256 spotId, bool allow) external',
  'function getTelegramBalance(bytes32 telegramHash) external view returns (uint256)',
  'function getWalletLinkedTelegram(address wallet) external view returns (bytes32)',
  'function claimTelegramToWallet(bytes32 telegramHash) external',
  'function nextSpotId() external view returns (uint256)',
  'function getSpot(uint256) view returns (tuple(address creator, bool allowDuplicateClaims, uint48 cooldown, uint128 stampGoal, uint128 stampBonus, uint256 reward, uint256 remaining, int96 lat, int96 lng, uint64 startDate, uint64 endDate, uint16 dailyStartTime, uint16 dailyEndTime, int8 utcOffset, string name, string description))',
  'function getStampInfo(uint256 spotId, address user) view returns (uint256 stamps, uint256 goal, uint256 lastClaim, uint256 cooldownRemaining)',
  'function getDeviceBalance(bytes32 deviceHash) external view returns (uint256)',
  'function getWalletLinkedDevice(address wallet) external view returns (bytes32)',
  'function claimDeviceToWallet(bytes32 deviceHash) external',
  'event SpotCreated(uint256 indexed spotId, address indexed creator, uint256 reward, uint256 deposit, string name, string description, int96 lat, int96 lng)',
];
