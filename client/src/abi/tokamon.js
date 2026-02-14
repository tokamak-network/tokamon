/**
 * Tokamon 컨트랙트 ABI - 클라이언트 직호출용
 */
export const TOKAMON_ABI = [
  'function getBalance(address) view returns (uint256)',
  'function getSpot(uint256) view returns (tuple(address creator, bool allowDuplicateClaims, uint48 cooldown, uint128 stampGoal, uint128 stampBonus, uint256 reward, uint256 remaining, int96 lat, int96 lng, uint64 startTime, uint64 endTime, string name, string description))',
  'function getStampInfo(uint256 spotId, address user) view returns (uint256 stamps, uint256 goal, uint256 lastClaim, uint256 cooldownRemaining)',
  'function nextSpotId() view returns (uint256)',
  'function claimSelf(uint256 spotId)',
  'function depositSelf() payable',
  'function createSpotSelf(uint256 reward, uint128 stampGoal, uint128 stampBonus, uint48 cooldown, bool allowDuplicateClaims, tuple(string name, string description, int96 lat, int96 lng, uint64 startTime, uint64 endTime) meta) payable returns (uint256)',
];
