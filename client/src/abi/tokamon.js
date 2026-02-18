/**
 * Tokamon 컨트랙트 ABI - 클라이언트 직호출용
 */
export const TOKAMON_ABI = [
  'function getSpot(uint256) view returns (tuple(address creator, bool allowDuplicateClaims, uint48 cooldown, uint128 stampGoal, uint128 stampBonus, uint256 reward, uint256 remaining, int96 lat, int96 lng, uint64 startDate, uint64 endDate, uint16 dailyStartTime, uint16 dailyEndTime, int8 utcOffset, string name, string description))',
  'function getStampInfo(uint256 spotId, address user) view returns (uint256 stamps, uint256 goal, uint256 lastClaim, uint256 cooldownRemaining)',
  'function nextSpotId() view returns (uint256)',
  'function redepositSelf(uint256 spotId) payable',
  'function createSpotSelf(uint256 reward, uint128 stampGoal, uint128 stampBonus, uint48 cooldown, bool allowDuplicateClaims, tuple(string name, string description, int96 lat, int96 lng, uint64 startDate, uint64 endDate, uint16 dailyStartTime, uint16 dailyEndTime, int8 utcOffset) meta) payable returns (uint256)',
  'function updateSpot(uint256 spotId, uint256 reward, uint128 stampGoal, uint128 stampBonus, uint48 cooldown, bool allowDuplicateClaims, tuple(string name, string description, int96 lat, int96 lng, uint64 startDate, uint64 endDate, uint16 dailyStartTime, uint16 dailyEndTime, int8 utcOffset) meta)',
];
