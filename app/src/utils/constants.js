import { Platform } from 'react-native';

export const COORD_SCALE = 1_000_000;
export const COLLECT_RADIUS = 15; // meters
export const MIN_DEPOSIT = 10;

// API base URL - Firebase Hosting emulator (rewrites /api/** to Functions)
// Android emulator uses 10.0.2.2, iOS simulator uses localhost
export const API_BASE = Platform.OS === 'android'
  ? 'http://10.0.2.2:5002/api'
  : 'http://localhost:5002/api';

// Listener server API base URL (direct blockchain access)
// Android emulator uses 10.0.2.2, iOS simulator uses localhost
export const LISTENER_API_BASE = Platform.OS === 'android'
  ? 'http://10.0.2.2:3001'
  : 'http://localhost:3001';

// WalletConnect project ID - get one at https://cloud.walletconnect.com
export const WALLETCONNECT_PROJECT_ID = 'YOUR_WALLETCONNECT_PROJECT_ID';

// Contract ABI for client-side calls
export const TOKAMON_ABI = [
  'function createSpotSelf(uint256 reward, uint128 stampGoal, uint128 stampBonus, uint48 cooldown, bool allowDuplicateClaims, tuple(string name, string description, int96 lat, int96 lng, uint64 startTime, uint64 endTime) meta) payable returns (uint256)',
  'function redepositSelf(uint256 spotId) payable',
  'function updateCooldown(uint256 spotId, uint48 newCooldown) external',
  'function updateAllowDuplicateClaims(uint256 spotId, bool allow) external',
  'function getTelegramBalance(bytes32 telegramHash) external view returns (uint256)',
  'function getWalletLinkedTelegram(address wallet) external view returns (bytes32)',
  'function claimSelf(uint256 spotId) external',
  'function claimTelegramToWallet(bytes32 telegramHash) external',
  'function nextSpotId() external view returns (uint256)',
  'function getSpot(uint256) view returns (tuple(address creator, bool allowDuplicateClaims, uint48 cooldown, uint128 stampGoal, uint128 stampBonus, uint256 reward, uint256 remaining, int96 lat, int96 lng, uint64 startTime, uint64 endTime, string name, string description))',
  'function getStampInfo(uint256 spotId, address user) view returns (uint256 stamps, uint256 goal, uint256 lastClaim, uint256 cooldownRemaining)',
  'function getDeviceBalance(bytes32 deviceHash) external view returns (uint256)',
  'function getWalletLinkedDevice(address wallet) external view returns (bytes32)',
  'function claimDeviceToWallet(bytes32 deviceHash) external',
  'event SpotCreated(uint256 indexed spotId, address indexed creator, uint256 reward, uint256 deposit, string name, string description, int96 lat, int96 lng)',
  'event Claimed(uint256 indexed spotId, address indexed user, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp)',
];
