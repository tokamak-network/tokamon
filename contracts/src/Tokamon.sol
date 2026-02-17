// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

contract Tokamon is Initializable, UUPSUpgradeable {
    // ── Errors ──
    error OnlyAdmin();
    error OnlyClaimManager();
    error SpotNotFound();
    error NotSpotCreator();
    error SpotExhausted();
    error CooldownNotElapsed();
    error InvalidInput();
    error TransferFailed();
    error NotPendingAdmin();
    error ZeroAddress();
    error WalletAlreadyLinked();
    error NoTelegramLinked();
    error HashMismatch();
    error NoBalance();
    error Locked();
    error DeviceAlreadyLinked();
    error NoDeviceLinked();

    // ── State ──
    address public admin;
    address public pendingAdmin;
    address public claimManager;
    uint256 public nextSpotId;
    uint256 private _locked;

    struct Spot {
        address creator;            // ─┐
        bool allowDuplicateClaims;  //  │ slot (20+1+6 = 27 bytes)
        uint48 cooldown;            // ─┘
        uint128 stampGoal;          // ─┐ slot (16+16 = 32 bytes)
        uint128 stampBonus;         // ─┘
        uint256 reward;             //   slot
        uint256 remaining;          //   slot
        int96 lat;                  // ─┐
        int96 lng;                  //  │ slot (12+12+8 = 32 bytes)
        uint64 startTime;           // ─┘
        uint64 endTime;             //   slot (partial)
        string name;                //   slot
        string description;         //   slot
    }

    struct SpotMetadata {
        string name;
        string description;
        int96 lat;
        int96 lng;
        uint64 startTime;
        uint64 endTime;
    }

    mapping(uint256 => Spot) public spots;
    mapping(bytes32 => uint256) public telegramBalances;
    mapping(bytes32 => uint256) public deviceBalances;
    mapping(bytes32 => mapping(uint256 => uint256)) public claimStampCount;
    mapping(bytes32 => mapping(uint256 => uint256)) public claimLastTime;
    mapping(bytes32 => address) public telegramToWallet;
    mapping(address => bytes32) public walletToTelegram;
    mapping(bytes32 => address) public deviceToWallet;
    mapping(address => bytes32) public walletToDevice;

    // ── Events ──
    event SpotCreated(uint256 indexed spotId, address indexed creator, uint256 reward, uint256 deposit, string name, string description, int96 lat, int96 lng);
    event Claimed(uint256 indexed spotId, address indexed user, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);
    event Redeposited(uint256 indexed spotId, address indexed creator, uint256 amount);
    event TelegramClaimed(uint256 indexed spotId, bytes32 indexed telegramHash, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);
    event TelegramLinked(bytes32 indexed telegramHash, address indexed oldWallet, address indexed newWallet, uint256 transferredAmount);
    event DeviceClaimed(uint256 indexed spotId, bytes32 indexed deviceHash, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);
    event DeviceLinked(bytes32 indexed deviceHash, address indexed oldWallet, address indexed newWallet);
    event CooldownUpdated(uint256 indexed spotId, uint48 newCooldown);
    event AllowDuplicateClaimsUpdated(uint256 indexed spotId, bool allow);
    event SpotUpdated(uint256 indexed spotId);
    event TelegramUnlinked(bytes32 indexed telegramHash, address indexed wallet);
    event DeviceUnlinked(bytes32 indexed deviceHash, address indexed wallet);

    // ── Modifiers ──
    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    function _onlyAdmin() internal view {
        if (msg.sender != admin) revert OnlyAdmin();
    }

    modifier onlyClaimManager() {
        _onlyClaimManager();
        _;
    }

    function _onlyClaimManager() internal view {
        if (msg.sender != claimManager) revert OnlyClaimManager();
    }

    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() internal {
        if (_locked == 1) revert Locked();
        _locked = 1;
    }

    function _nonReentrantAfter() internal {
        _locked = 0;
    }

    // ── Initialization ──
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {
        admin = msg.sender;
        claimManager = msg.sender;
    }

    function _authorizeUpgrade(address) internal override onlyAdmin {}

    // ── Admin transfer ──
    function setAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        pendingAdmin = newAdmin;
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotPendingAdmin();
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    // ── Claim manager ──
    function setClaimManager(address _claimManager) external onlyAdmin {
        if (_claimManager == address(0)) revert ZeroAddress();
        claimManager = _claimManager;
    }

    // ── Spot creation ──
    function createSpotSelf(
        uint256 reward,
        uint128 stampGoal,
        uint128 stampBonus,
        uint48 cooldown,
        bool allowDuplicateClaims,
        SpotMetadata calldata meta
    ) external payable returns (uint256) {
        if (msg.value == 0) revert InvalidInput();
        return _createSpot(msg.sender, msg.value, reward, stampGoal, stampBonus, cooldown, allowDuplicateClaims, meta);
    }

    function _createSpot(
        address creator,
        uint256 depositAmt,
        uint256 reward,
        uint128 stampGoal,
        uint128 stampBonus,
        uint48 cooldown,
        bool allowDuplicateClaims,
        SpotMetadata calldata meta
    ) internal returns (uint256) {
        if (reward == 0 || depositAmt < reward || stampGoal == 0) revert InvalidInput();

        uint256 spotId = nextSpotId;
        Spot storage s = spots[spotId];
        s.creator = creator;
        s.allowDuplicateClaims = allowDuplicateClaims;
        s.cooldown = cooldown;
        s.stampGoal = stampGoal;
        s.stampBonus = stampBonus;
        s.reward = reward;
        s.remaining = depositAmt;
        s.lat = meta.lat;
        s.lng = meta.lng;
        s.startTime = meta.startTime;
        s.endTime = meta.endTime;
        s.name = meta.name;
        s.description = meta.description;

        unchecked { nextSpotId++; }

        emit SpotCreated(spotId, creator, reward, depositAmt, meta.name, meta.description, meta.lat, meta.lng);
        return spotId;
    }

    // ── Redeposit ──
    function redepositSelf(uint256 spotId) external payable {
        if (msg.value == 0) revert InvalidInput();
        Spot storage spot = spots[spotId];
        if (spot.reward == 0) revert SpotNotFound();
        spot.remaining += msg.value;
        emit Redeposited(spotId, msg.sender, msg.value);
    }

    // ── Internal helpers ──
    function _walletToHash(address user) internal pure returns (bytes32 hash) {
        /// @solidity memory-safe-assembly
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, shl(0xc8, 0x77616c6c65743a))
            mstore(add(ptr, 7), shl(96, user))
            hash := keccak256(ptr, 27)
        }
    }

    function _checkCooldown(uint256 spotId, bytes32 telegramHash, uint48 cooldown) internal view {
        uint256 lastTelegram = claimLastTime[telegramHash][spotId];
        if (lastTelegram > 0 && block.timestamp < lastTelegram + cooldown) revert CooldownNotElapsed();
        address linkedWallet = telegramToWallet[telegramHash];
        if (linkedWallet != address(0)) {
            bytes32 walletHash = _walletToHash(linkedWallet);
            uint256 lastWallet = claimLastTime[walletHash][spotId];
            if (lastWallet > 0 && block.timestamp < lastWallet + cooldown) revert CooldownNotElapsed();
        }
    }

    function _checkCooldownForWallet(uint256 spotId, address user, uint48 cooldown) internal view {
        bytes32 walletHash = _walletToHash(user);
        uint256 lastWallet = claimLastTime[walletHash][spotId];
        if (lastWallet > 0 && block.timestamp < lastWallet + cooldown) revert CooldownNotElapsed();
        bytes32 linkedTelegram = walletToTelegram[user];
        if (linkedTelegram != bytes32(0)) {
            uint256 lastTelegram = claimLastTime[linkedTelegram][spotId];
            if (lastTelegram > 0 && block.timestamp < lastTelegram + cooldown) revert CooldownNotElapsed();
        }
    }

    function _getStampCount(uint256 spotId, bytes32 telegramHash) internal view returns (uint256) {
        uint256 telegramStamps = claimStampCount[telegramHash][spotId];
        address linkedWallet = telegramToWallet[telegramHash];
        if (linkedWallet != address(0)) {
            bytes32 walletHash = _walletToHash(linkedWallet);
            uint256 walletStamps = claimStampCount[walletHash][spotId];
            return telegramStamps > walletStamps ? telegramStamps : walletStamps;
        }
        return telegramStamps;
    }

    function _getStampCountForWallet(uint256 spotId, address user) internal view returns (uint256) {
        bytes32 walletHash = _walletToHash(user);
        uint256 walletStamps = claimStampCount[walletHash][spotId];
        bytes32 linkedTelegram = walletToTelegram[user];
        if (linkedTelegram != bytes32(0)) {
            uint256 telegramStamps = claimStampCount[linkedTelegram][spotId];
            return walletStamps > telegramStamps ? walletStamps : telegramStamps;
        }
        return walletStamps;
    }

    function _calcAndDeductPayout(
        uint256 spotId,
        bytes32 claimKey,
        uint256 currentStamps
    ) internal returns (uint256 payout, uint256 bonus, uint256 newStamp) {
        Spot storage spot = spots[spotId];
        payout = spot.reward;
        unchecked { newStamp = currentStamps + 1; }

        if (newStamp >= spot.stampGoal) {
            bonus = spot.stampBonus;
            payout += bonus;
            newStamp = 0;
        }

        if (spot.remaining < payout) {
            if (bonus > 0 && spot.remaining >= spot.reward) {
                payout = spot.reward;
                bonus = 0;
                newStamp = currentStamps + 1;
            } else {
                revert SpotExhausted();
            }
        }
        unchecked { spot.remaining -= payout; }

        claimStampCount[claimKey][spotId] = newStamp;
        claimLastTime[claimKey][spotId] = block.timestamp;
    }

    // ── Claims ──
    function claim(uint256 spotId, address user) external onlyClaimManager nonReentrant {
        _doClaim(spotId, user);
    }

    function claimSelf(uint256 spotId) external nonReentrant {
        _doClaim(spotId, msg.sender);
    }

    function _doClaim(uint256 spotId, address user) internal {
        Spot storage spot = spots[spotId];
        if (spot.reward == 0) revert SpotNotFound();

        if (!spot.allowDuplicateClaims) {
            _checkCooldownForWallet(spotId, user, spot.cooldown);
        }

        bytes32 linkedTelegram = walletToTelegram[user];
        bytes32 recordHash = linkedTelegram != bytes32(0) ? linkedTelegram : _walletToHash(user);
        uint256 currentStamps = _getStampCountForWallet(spotId, user);

        (uint256 payout, uint256 bonus, uint256 newStamp) = _calcAndDeductPayout(spotId, recordHash, currentStamps);

        (bool ok, ) = payable(user).call{value: payout}("");
        if (!ok) revert TransferFailed();
        emit Claimed(spotId, user, payout - bonus, bonus, newStamp, block.timestamp);
    }

    function claimToTelegram(uint256 spotId, bytes32 telegramHash) external {
        Spot storage spot = spots[spotId];
        if (spot.reward == 0) revert SpotNotFound();
        if (spot.creator != msg.sender) revert NotSpotCreator();

        if (!spot.allowDuplicateClaims) {
            _checkCooldown(spotId, telegramHash, spot.cooldown);
        }

        uint256 currentStamps = _getStampCount(spotId, telegramHash);
        (uint256 payout, uint256 bonus, uint256 newStamp) = _calcAndDeductPayout(spotId, telegramHash, currentStamps);

        telegramBalances[telegramHash] += payout;
        emit TelegramClaimed(spotId, telegramHash, payout - bonus, bonus, newStamp, block.timestamp);
    }

    function claimByDevice(uint256 spotId, bytes32 deviceHash) external onlyClaimManager {
        Spot storage spot = spots[spotId];
        if (spot.reward == 0) revert SpotNotFound();

        if (!spot.allowDuplicateClaims) {
            uint256 last = claimLastTime[deviceHash][spotId];
            if (last > 0 && block.timestamp < last + spot.cooldown) revert CooldownNotElapsed();
        }

        uint256 currentStamps = claimStampCount[deviceHash][spotId];
        (uint256 payout, uint256 bonus, uint256 newStamp) = _calcAndDeductPayout(spotId, deviceHash, currentStamps);

        deviceBalances[deviceHash] += payout;
        emit DeviceClaimed(spotId, deviceHash, payout - bonus, bonus, newStamp, block.timestamp);
    }

    // ── Telegram ──
    function getTelegramBalance(bytes32 telegramHash) external view returns (uint256) {
        return telegramBalances[telegramHash];
    }

    function _getClaimInfo(uint256 spotId, bytes32 identifier) internal view returns (
        uint256 stamps,
        uint256 goal,
        uint256 lastClaim,
        uint256 cooldownRemaining
    ) {
        Spot storage s = spots[spotId];
        uint256 last = claimLastTime[identifier][spotId];
        uint256 remaining = 0;
        if (last + s.cooldown > block.timestamp) {
            remaining = (last + s.cooldown) - block.timestamp;
        }
        return (claimStampCount[identifier][spotId], s.stampGoal, last, remaining);
    }

    function getClaimInfo(uint256 spotId, bytes32 identifier) external view returns (
        uint256 stamps,
        uint256 goal,
        uint256 lastClaim,
        uint256 cooldownRemaining
    ) {
        return _getClaimInfo(spotId, identifier);
    }

    function getTelegramStampInfo(uint256 spotId, bytes32 telegramHash) external view returns (
        uint256 stamps,
        uint256 goal,
        uint256 lastClaim,
        uint256 cooldownRemaining
    ) {
        return _getClaimInfo(spotId, telegramHash);
    }

    function getTelegramLinkedWallet(bytes32 telegramHash) external view returns (address) {
        return telegramToWallet[telegramHash];
    }

    function getWalletLinkedTelegram(address wallet) external view returns (bytes32) {
        return walletToTelegram[wallet];
    }

    function claimTelegramToWallet(bytes32 telegramHash) external nonReentrant {
        bytes32 linkedHash = walletToTelegram[msg.sender];
        if (linkedHash == bytes32(0)) revert NoTelegramLinked();
        if (linkedHash != telegramHash) revert HashMismatch();
        if (telegramToWallet[telegramHash] != msg.sender) revert HashMismatch();

        uint256 amount = telegramBalances[telegramHash];
        if (amount == 0) revert NoBalance();

        telegramBalances[telegramHash] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function unlinkTelegram() external {
        bytes32 linkedHash = walletToTelegram[msg.sender];
        if (linkedHash == bytes32(0)) revert NoTelegramLinked();
        delete telegramToWallet[linkedHash];
        delete walletToTelegram[msg.sender];
        emit TelegramUnlinked(linkedHash, msg.sender);
    }

    function linkTelegramToWallet(bytes32 telegramHash, address wallet) external onlyClaimManager {
        if (wallet == address(0)) revert ZeroAddress();
        if (telegramHash == bytes32(0)) revert InvalidInput();

        bytes32 existingTelegram = walletToTelegram[wallet];
        if (existingTelegram != bytes32(0) && existingTelegram != telegramHash) revert WalletAlreadyLinked();

        address oldWallet = telegramToWallet[telegramHash];
        if (oldWallet != address(0) && oldWallet != wallet) {
            delete walletToTelegram[oldWallet];
        }

        telegramToWallet[telegramHash] = wallet;
        walletToTelegram[wallet] = telegramHash;

        emit TelegramLinked(telegramHash, oldWallet, wallet, 0);
    }

    // ── Device ──
    function getDeviceBalance(bytes32 deviceHash) external view returns (uint256) {
        return deviceBalances[deviceHash];
    }

    function getDeviceLinkedWallet(bytes32 deviceHash) external view returns (address) {
        return deviceToWallet[deviceHash];
    }

    function getWalletLinkedDevice(address wallet) external view returns (bytes32) {
        return walletToDevice[wallet];
    }

    function linkDeviceToWallet(bytes32 deviceHash, address wallet) external onlyClaimManager {
        if (wallet == address(0)) revert ZeroAddress();
        if (deviceHash == bytes32(0)) revert InvalidInput();

        bytes32 existingDevice = walletToDevice[wallet];
        if (existingDevice != bytes32(0) && existingDevice != deviceHash) revert DeviceAlreadyLinked();

        address oldWallet = deviceToWallet[deviceHash];
        if (oldWallet != address(0) && oldWallet != wallet) {
            delete walletToDevice[oldWallet];
        }

        deviceToWallet[deviceHash] = wallet;
        walletToDevice[wallet] = deviceHash;

        emit DeviceLinked(deviceHash, oldWallet, wallet);
    }

    function unlinkDevice() external {
        bytes32 linkedHash = walletToDevice[msg.sender];
        if (linkedHash == bytes32(0)) revert NoDeviceLinked();
        delete deviceToWallet[linkedHash];
        delete walletToDevice[msg.sender];
        emit DeviceUnlinked(linkedHash, msg.sender);
    }

    function claimDeviceToWallet(bytes32 deviceHash) external nonReentrant {
        bytes32 linkedHash = walletToDevice[msg.sender];
        if (linkedHash == bytes32(0)) revert NoDeviceLinked();
        if (linkedHash != deviceHash) revert HashMismatch();
        if (deviceToWallet[deviceHash] != msg.sender) revert HashMismatch();

        uint256 amount = deviceBalances[deviceHash];
        if (amount == 0) revert NoBalance();

        deviceBalances[deviceHash] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ── Spot management ──
    function updateSpot(
        uint256 spotId,
        uint256 reward,
        uint128 stampGoal,
        uint128 stampBonus,
        uint48 cooldown,
        bool allowDuplicateClaims,
        SpotMetadata calldata meta
    ) external {
        Spot storage spot = spots[spotId];
        if (spot.reward == 0) revert SpotNotFound();
        if (spot.creator != msg.sender) revert NotSpotCreator();
        if (reward == 0 || stampGoal == 0) revert InvalidInput();

        spot.reward = reward;
        spot.stampGoal = stampGoal;
        spot.stampBonus = stampBonus;
        spot.cooldown = cooldown;
        spot.allowDuplicateClaims = allowDuplicateClaims;
        spot.name = meta.name;
        spot.description = meta.description;
        spot.lat = meta.lat;
        spot.lng = meta.lng;
        spot.startTime = meta.startTime;
        spot.endTime = meta.endTime;

        emit SpotUpdated(spotId);
    }

    function updateCooldown(uint256 spotId, uint48 newCooldown) external {
        Spot storage spot = spots[spotId];
        if (spot.reward == 0) revert SpotNotFound();
        if (spot.creator != msg.sender) revert NotSpotCreator();
        spot.cooldown = newCooldown;
        emit CooldownUpdated(spotId, newCooldown);
    }

    function updateAllowDuplicateClaims(uint256 spotId, bool allow) external {
        Spot storage spot = spots[spotId];
        if (spot.reward == 0) revert SpotNotFound();
        if (spot.creator != msg.sender) revert NotSpotCreator();
        spot.allowDuplicateClaims = allow;
        emit AllowDuplicateClaimsUpdated(spotId, allow);
    }

    // ── View ──
    function getSpotCore(uint256 spotId) external view returns (
        address creator,
        uint256 reward,
        uint256 remaining,
        uint128 stampGoal,
        uint128 stampBonus,
        uint48 cooldown,
        bool allowDuplicateClaims
    ) {
        Spot storage s = spots[spotId];
        return (s.creator, s.reward, s.remaining, s.stampGoal, s.stampBonus, s.cooldown, s.allowDuplicateClaims);
    }

    function getSpot(uint256 spotId) external view returns (Spot memory) {
        return spots[spotId];
    }

    function getStampInfo(uint256 spotId, address user) external view returns (
        uint256 stamps,
        uint256 goal,
        uint256 lastClaim,
        uint256 cooldownRemaining
    ) {
        Spot storage s = spots[spotId];
        bytes32 linkedTelegram = walletToTelegram[user];
        bytes32 checkHash = linkedTelegram != bytes32(0) ? linkedTelegram : _walletToHash(user);
        uint256 last = claimLastTime[checkHash][spotId];
        uint256 remaining = 0;
        if (last + s.cooldown > block.timestamp) {
            remaining = (last + s.cooldown) - block.timestamp;
        }
        return (_getStampCountForWallet(spotId, user), s.stampGoal, last, remaining);
    }

    uint256[48] private _gap;
}
