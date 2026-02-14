// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IERC20} from "./interfaces/IERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

contract Tokamon is Initializable, UUPSUpgradeable {
    // ── Errors ──
    error OnlyAdmin();
    error SpotNotFound();
    error NotSpotCreator();
    error InsufficientBalance();
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

    // ── State ──
    address public admin;
    address public pendingAdmin;
    uint256 public nextSpotId;
    IERC20 public TON_TOKEN;

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
    mapping(address => uint256) public balances;
    mapping(bytes32 => uint256) public telegramBalances;
    mapping(bytes32 => uint256) public deviceBalances;
    mapping(bytes32 => mapping(uint256 => uint256)) public claimStampCount;
    mapping(bytes32 => mapping(uint256 => uint256)) public claimLastTime;
    mapping(bytes32 => address) public telegramToWallet;
    mapping(address => bytes32) public walletToTelegram;

    // ── Events ──
    event SpotCreated(uint256 indexed spotId, address indexed creator, uint256 reward, uint256 deposit, string name, string description, int96 lat, int96 lng);
    event Claimed(uint256 indexed spotId, address indexed user, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);
    event Redeposited(uint256 indexed spotId, address indexed creator, uint256 amount);
    event TelegramClaimed(uint256 indexed spotId, bytes32 indexed telegramHash, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);
    event TelegramLinked(bytes32 indexed telegramHash, address indexed oldWallet, address indexed newWallet, uint256 transferredAmount);
    event DeviceClaimed(uint256 indexed spotId, bytes32 indexed deviceHash, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);
    event CooldownUpdated(uint256 indexed spotId, uint48 newCooldown);
    event AllowDuplicateClaimsUpdated(uint256 indexed spotId, bool allow);

    // ── Modifiers ──
    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    function _onlyAdmin() internal view {
        if (msg.sender != admin) revert OnlyAdmin();
    }

    // ── Initialization ──
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _tonToken) external initializer {
        admin = msg.sender;
        TON_TOKEN = IERC20(_tonToken);
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

    // ── Deposit ──
    function deposit(address user, uint256 amount) external onlyAdmin {
        if (amount == 0) revert InvalidInput();
        if (!TON_TOKEN.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        balances[user] += amount;
    }

    function depositSelf(uint256 amount) external {
        if (amount == 0) revert InvalidInput();
        if (!TON_TOKEN.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        balances[msg.sender] += amount;
    }

    // ── Spot creation ──
    function createSpot(
        address creator,
        uint256 depositAmt,
        uint256 reward,
        uint128 stampGoal,
        uint128 stampBonus,
        uint48 cooldown,
        bool allowDuplicateClaims,
        SpotMetadata calldata meta
    ) external onlyAdmin returns (uint256) {
        if (balances[creator] < depositAmt) revert InsufficientBalance();
        unchecked { balances[creator] -= depositAmt; }
        return _createSpot(creator, depositAmt, reward, stampGoal, stampBonus, cooldown, allowDuplicateClaims, meta);
    }

    function createSpotSelf(
        uint256 depositAmt,
        uint256 reward,
        uint128 stampGoal,
        uint128 stampBonus,
        uint48 cooldown,
        bool allowDuplicateClaims,
        SpotMetadata calldata meta
    ) external returns (uint256) {
        if (!TON_TOKEN.transferFrom(msg.sender, address(this), depositAmt)) revert TransferFailed();
        return _createSpot(msg.sender, depositAmt, reward, stampGoal, stampBonus, cooldown, allowDuplicateClaims, meta);
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
    function redeposit(uint256 spotId, address creator, uint256 amount) external onlyAdmin {
        if (balances[creator] < amount) revert InsufficientBalance();
        unchecked { balances[creator] -= amount; }
        _redeposit(spotId, creator, amount);
    }

    function redepositSelf(uint256 spotId, uint256 amount) external {
        if (!TON_TOKEN.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        _redeposit(spotId, msg.sender, amount);
    }

    function _redeposit(uint256 spotId, address creator, uint256 amount) internal {
        Spot storage spot = spots[spotId];
        if (spot.reward == 0) revert SpotNotFound();
        if (spot.creator != creator) revert NotSpotCreator();
        spot.remaining += amount;
        emit Redeposited(spotId, creator, amount);
    }

    // ── Internal helpers ──
    function _walletToHash(address user) internal pure returns (bytes32 hash) {
        /// @solidity memory-safe-assembly
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, or(shl(0xc8, 0x77616c6c65743a), user))
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

        if (spot.remaining < payout) revert SpotExhausted();
        unchecked { spot.remaining -= payout; }

        claimStampCount[claimKey][spotId] = newStamp;
        claimLastTime[claimKey][spotId] = block.timestamp;
    }

    // ── Claims ──
    function claim(uint256 spotId, address user) external onlyAdmin {
        _doClaim(spotId, user);
    }

    function claimSelf(uint256 spotId) external {
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

        if (!TON_TOKEN.transfer(user, payout)) revert TransferFailed();
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

    function claimByDevice(uint256 spotId, bytes32 deviceHash) external onlyAdmin {
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

    function claimTelegramToWallet(bytes32 telegramHash) external {
        bytes32 linkedHash = walletToTelegram[msg.sender];
        if (linkedHash == bytes32(0)) revert NoTelegramLinked();
        if (linkedHash != telegramHash) revert HashMismatch();

        uint256 amount = telegramBalances[telegramHash];
        if (amount == 0) revert NoBalance();

        telegramBalances[telegramHash] = 0;
        if (!TON_TOKEN.transfer(msg.sender, amount)) revert TransferFailed();
    }

    function linkTelegramToWallet(bytes32 telegramHash, address wallet) external onlyAdmin {
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

    // ── Spot management ──
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
    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

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

    uint256[48] private __gap;
}
