module.exports = [
  'event SpotCreated(uint256 indexed spotId, address indexed creator, uint256 reward, uint256 deposit, string name, string description, int96 lat, int96 lng)',
  'event Claimed(uint256 indexed spotId, address indexed user, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp)',
  'event Redeposited(uint256 indexed spotId, address indexed creator, uint256 amount)',
  'event CooldownUpdated(uint256 indexed spotId, uint48 newCooldown)',
  'event AllowDuplicateClaimsUpdated(uint256 indexed spotId, bool allow)',
  'function spots(uint256) view returns (address creator, bool allowDuplicateClaims, uint48 cooldown, uint128 stampGoal, uint128 stampBonus, uint256 reward, uint256 remaining, int96 lat, int96 lng, uint64 startTime, uint64 endTime, string name, string description)',
  'function getSpot(uint256) view returns (tuple(address creator, bool allowDuplicateClaims, uint48 cooldown, uint128 stampGoal, uint128 stampBonus, uint256 reward, uint256 remaining, int96 lat, int96 lng, uint64 startTime, uint64 endTime, string name, string description))',
  'function getSpotCore(uint256) view returns (address creator, uint256 reward, uint256 remaining, uint128 stampGoal, uint128 stampBonus, uint48 cooldown, bool allowDuplicateClaims)',
  'function nextSpotId() view returns (uint256)',
];
