module.exports = [
  // Events
  'event SpotCreated(uint256 indexed spotId, address indexed creator, uint256 reward, uint256 deposit, string name, string description, int96 lat, int96 lng)',
  'event SpotUpdated(uint256 indexed spotId)',
  'event Redeposited(uint256 indexed spotId, address indexed creator, uint256 amount)',
  'event CooldownUpdated(uint256 indexed spotId, uint48 newCooldown)',
  'event AllowDuplicateClaimsUpdated(uint256 indexed spotId, bool allow)',
  'event TelegramClaimed(uint256 indexed spotId, bytes32 indexed telegramHash, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp)',
  'event TelegramLinked(bytes32 indexed telegramHash, address indexed oldWallet, address indexed newWallet, uint256 transferredAmount)',
  'event TelegramUnlinked(bytes32 indexed telegramHash, address indexed wallet)',
  'event TelegramWithdrawn(bytes32 indexed telegramHash, address indexed wallet, uint256 amount)',
  'event DeviceClaimed(uint256 indexed spotId, bytes32 indexed deviceHash, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp)',
  'event DeviceLinked(bytes32 indexed deviceHash, address indexed oldWallet, address indexed newWallet)',
  'event DeviceUnlinked(bytes32 indexed deviceHash, address indexed wallet)',
  'event DeviceWithdrawn(bytes32 indexed deviceHash, address indexed wallet, uint256 amount)',

  // Spot functions
  'function spots(uint256) view returns (address creator, bool allowDuplicateClaims, uint48 cooldown, uint128 stampGoal, uint128 stampBonus, uint256 reward, uint256 remaining, int96 lat, int96 lng, uint64 startDate, uint64 endDate, uint16 dailyStartTime, uint16 dailyEndTime, int8 utcOffset, string name, string description)',
  'function getSpot(uint256) view returns (tuple(address creator, bool allowDuplicateClaims, uint48 cooldown, uint128 stampGoal, uint128 stampBonus, uint256 reward, uint256 remaining, int96 lat, int96 lng, uint64 startDate, uint64 endDate, uint16 dailyStartTime, uint16 dailyEndTime, int8 utcOffset, string name, string description))',
  'function getSpotCore(uint256) view returns (address creator, uint256 reward, uint256 remaining, uint128 stampGoal, uint128 stampBonus, uint48 cooldown, bool allowDuplicateClaims)',
  'function nextSpotId() view returns (uint256)',
  'function getStampInfo(uint256 spotId, address user) view returns (uint256 stamps, uint256 goal, uint256 lastClaim, uint256 cooldownRemaining)',
  'function getClaimInfo(uint256 spotId, bytes32 identifier) view returns (uint256 stamps, uint256 goal, uint256 lastClaim, uint256 cooldownRemaining)',

  // Telegram functions
  'function getTelegramBalance(bytes32 telegramHash) view returns (uint256)',
  'function getTelegramStampInfo(uint256 spotId, bytes32 telegramHash) view returns (uint256 stamps, uint256 goal, uint256 lastClaim, uint256 cooldownRemaining)',
  'function getTelegramLinkedWallet(bytes32 telegramHash) view returns (address)',
  'function getWalletLinkedTelegram(address wallet) view returns (bytes32)',
  'function linkTelegramToWallet(bytes32 telegramHash, address wallet)',
  'function claimToTelegram(uint256 spotId, bytes32 telegramHash)',
  'function claimTelegramToWallet(bytes32 telegramHash)',

  // Claim eligibility
  'function canClaimTelegram(uint256 spotId, bytes32 telegramHash) view returns (bool claimable, uint256 cooldownRemaining)',
  'function canClaimDevice(uint256 spotId, bytes32 deviceHash) view returns (bool claimable, uint256 cooldownRemaining)',

  // Device functions
  'function getDeviceBalance(bytes32 deviceHash) view returns (uint256)',
  'function getDeviceLinkedWallet(bytes32 deviceHash) view returns (address)',
  'function getWalletLinkedDevice(address wallet) view returns (bytes32)',
  'function linkDeviceToWallet(bytes32 deviceHash, address wallet)',
  'function claimByDevice(uint256 spotId, bytes32 deviceHash)',
  'function claimDeviceToWallet(bytes32 deviceHash)',
];
