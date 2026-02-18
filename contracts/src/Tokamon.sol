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
    error OutsideActiveTime();
    error AlreadyClaimed();

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
        uint64 startDate;           // ─┘
        uint64 endDate;             // ─┐
        uint16 dailyStartTime;     //  │ slot (8+2+2+1 = 13 bytes)
        uint16 dailyEndTime;       //  │
        int8 utcOffset;            // ─┘
        string name;                //   slot
        string description;         //   slot
    }

    struct SpotMetadata {
        string name;
        string description;
        int96 lat;
        int96 lng;
        uint64 startDate;
        uint64 endDate;
        uint16 dailyStartTime;
        uint16 dailyEndTime;
        int8 utcOffset;
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
    event TelegramWithdrawn(bytes32 indexed telegramHash, address indexed wallet, uint256 amount);
    event DeviceWithdrawn(bytes32 indexed deviceHash, address indexed wallet, uint256 amount);
    event AdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);
    event ClaimManagerUpdated(address indexed oldManager, address indexed newManager);

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
        emit AdminTransferStarted(msg.sender, newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotPendingAdmin();
        address oldAdmin = admin;
        admin = msg.sender;
        pendingAdmin = address(0);
        emit AdminTransferred(oldAdmin, msg.sender);
    }

    // ── Claim manager ──
    function setClaimManager(address _claimManager) external onlyAdmin {
        if (_claimManager == address(0)) revert ZeroAddress();
        address oldManager = claimManager;
        claimManager = _claimManager;
        emit ClaimManagerUpdated(oldManager, _claimManager);
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
        if (reward == 0 || depositAmt < reward) revert InvalidInput();
        if (stampGoal > 0 && stampBonus == 0) revert InvalidInput();
        if (meta.dailyStartTime >= 1440 || meta.dailyEndTime >= 1440) revert InvalidInput();
        if (meta.startDate > meta.endDate && meta.endDate != 0) revert InvalidInput();
        if (meta.utcOffset < -12 || meta.utcOffset > 14) revert InvalidInput();

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
        s.startDate = meta.startDate;
        s.endDate = meta.endDate;
        s.dailyStartTime = meta.dailyStartTime;
        s.dailyEndTime = meta.dailyEndTime;
        s.utcOffset = meta.utcOffset;
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
    function _checkCooldown(uint256 spotId, bytes32 claimHash, uint48 cooldown) internal view {
        uint256 last = claimLastTime[claimHash][spotId];
        if (last > 0 && block.timestamp < last + cooldown) revert CooldownNotElapsed();
    }

    function _cooldownRemaining(uint256 spotId, bytes32 hash, uint48 cooldown) internal view returns (uint256) {
        uint256 last = claimLastTime[hash][spotId];
        if (last > 0 && last + cooldown > block.timestamp) {
            return (last + cooldown) - block.timestamp;
        }
        return 0;
    }

    function _isWithinActiveTime(Spot storage spot) internal view returns (bool) {
        // UTC 오프셋 적용한 로컬 시각
        int256 localTime = int256(block.timestamp) + int256(spot.utcOffset) * 3600;

        // 날짜 범위 체크 (로컬 시각 기준)
        uint64 sDate = spot.startDate;
        uint64 eDate = spot.endDate;
        if (sDate > 0 && localTime < int256(uint256(sDate))) return false;
        if (eDate > 0 && localTime > int256(uint256(eDate))) return false;

        // 일별 시간대 체크
        uint16 dStart = spot.dailyStartTime;
        uint16 dEnd = spot.dailyEndTime;
        if (dStart == 0 && dEnd == 0) return true;  // 제한 없음

        // 자정 기준 분으로 변환
        uint256 minuteOfDay = uint256(localTime % 86400) / 60;

        if (dStart < dEnd) {
            // 일반 (09:00~18:00)
            return minuteOfDay >= dStart && minuteOfDay < dEnd;
        } else {
            // 야간 (22:00~06:00)
            return minuteOfDay >= dStart || minuteOfDay < dEnd;
        }
    }

    function _calcAndDeductPayout(
        uint256 spotId,
        bytes32 claimKey,
        uint256 currentStamps
    ) internal returns (uint256 payout, uint256 bonus, uint256 newStamp) {
        Spot storage spot = spots[spotId];

        // Cache storage reads into locals to avoid repeated SLOADs
        uint256 reward = spot.reward;
        uint256 remaining = spot.remaining;
        uint128 stampGoal = spot.stampGoal;
        uint128 stampBonus = spot.stampBonus;

        payout = reward;
        unchecked { newStamp = currentStamps + 1; }

        if (newStamp >= stampGoal) {
            bonus = stampBonus;
            payout += bonus;
            newStamp = 0;
        }

        if (remaining < payout) {
            if (bonus > 0 && remaining >= reward) {
                payout = reward;
                bonus = 0;
                newStamp = currentStamps + 1;
            } else {
                revert SpotExhausted();
            }
        }
        unchecked { spot.remaining = remaining - payout; }

        claimStampCount[claimKey][spotId] = newStamp;
        claimLastTime[claimKey][spotId] = block.timestamp;
    }

    // ── Claims ──
    function claimToTelegram(uint256 spotId, bytes32 telegramHash) external {
        Spot storage spot = spots[spotId];
        if (spot.reward == 0) revert SpotNotFound();
        if (spot.creator != msg.sender) revert NotSpotCreator();
        if (!_isWithinActiveTime(spot)) revert OutsideActiveTime();

        // 중복발행 불가면 1인 1회만
        if (!spot.allowDuplicateClaims && claimLastTime[telegramHash][spotId] > 0) {
            revert AlreadyClaimed();
        }

        // 쿨다운은 항상 적용
        uint48 cd = spot.cooldown;
        _checkCooldown(spotId, telegramHash, cd);

        // 교차 쿨다운: 같은 지갑에 디바이스도 연결되어 있으면 같은 사람
        address wallet = telegramToWallet[telegramHash];
        if (wallet != address(0)) {
            bytes32 linkedDevice = walletToDevice[wallet];
            if (linkedDevice != bytes32(0)) {
                _checkCooldown(spotId, linkedDevice, cd);
            }
        }

        uint256 currentStamps = claimStampCount[telegramHash][spotId];
        (uint256 payout, uint256 bonus, uint256 newStamp) = _calcAndDeductPayout(spotId, telegramHash, currentStamps);

        telegramBalances[telegramHash] += payout;
        emit TelegramClaimed(spotId, telegramHash, payout - bonus, bonus, newStamp, block.timestamp);
    }

    function claimByDevice(uint256 spotId, bytes32 deviceHash) external onlyClaimManager {
        Spot storage spot = spots[spotId];
        if (spot.reward == 0) revert SpotNotFound();
        if (!_isWithinActiveTime(spot)) revert OutsideActiveTime();

        // 중복발행 불가면 1인 1회만
        if (!spot.allowDuplicateClaims && claimLastTime[deviceHash][spotId] > 0) {
            revert AlreadyClaimed();
        }

        // 쿨다운은 항상 적용
        uint48 cd = spot.cooldown;
        _checkCooldown(spotId, deviceHash, cd);

        // 교차 쿨다운: 같은 지갑에 텔레그램도 연결되어 있으면 같은 사람
        address wallet = deviceToWallet[deviceHash];
        if (wallet != address(0)) {
            bytes32 linkedTelegram = walletToTelegram[wallet];
            if (linkedTelegram != bytes32(0)) {
                _checkCooldown(spotId, linkedTelegram, cd);
            }
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
        if (last > 0 && last + s.cooldown > block.timestamp) {
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
        emit TelegramWithdrawn(telegramHash, msg.sender, amount);
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
        emit DeviceWithdrawn(deviceHash, msg.sender, amount);
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
        if (reward == 0) revert InvalidInput();
        if (stampGoal > 0 && stampBonus == 0) revert InvalidInput();
        if (meta.dailyStartTime >= 1440 || meta.dailyEndTime >= 1440) revert InvalidInput();
        if (meta.startDate > meta.endDate && meta.endDate != 0) revert InvalidInput();
        if (meta.utcOffset < -12 || meta.utcOffset > 14) revert InvalidInput();

        spot.reward = reward;
        spot.stampGoal = stampGoal;
        spot.stampBonus = stampBonus;
        spot.cooldown = cooldown;
        spot.allowDuplicateClaims = allowDuplicateClaims;
        spot.name = meta.name;
        spot.description = meta.description;
        spot.lat = meta.lat;
        spot.lng = meta.lng;
        spot.startDate = meta.startDate;
        spot.endDate = meta.endDate;
        spot.dailyStartTime = meta.dailyStartTime;
        spot.dailyEndTime = meta.dailyEndTime;
        spot.utcOffset = meta.utcOffset;

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
        bytes32 linkedDevice = walletToDevice[user];

        // Check telegram link first, then device link
        bytes32 checkHash;
        if (linkedTelegram != bytes32(0)) {
            checkHash = linkedTelegram;
        } else if (linkedDevice != bytes32(0)) {
            checkHash = linkedDevice;
        } else {
            return (0, s.stampGoal, 0, 0);
        }

        uint256 last = claimLastTime[checkHash][spotId];
        uint256 remaining = 0;
        if (last > 0 && last + s.cooldown > block.timestamp) {
            remaining = (last + s.cooldown) - block.timestamp;
        }
        return (claimStampCount[checkHash][spotId], s.stampGoal, last, remaining);
    }

    // ── 교차 쿨다운 포함 발행 가능 여부 조회 ──
    function canClaimTelegram(uint256 spotId, bytes32 telegramHash) external view returns (
        bool claimable,
        uint256 cooldownRemaining
    ) {
        Spot storage s = spots[spotId];
        if (s.reward == 0 || s.remaining < s.reward) return (false, 0);
        if (!_isWithinActiveTime(s)) return (false, 0);

        // 중복발행 불가면 이미 클레임한 경우 불가
        if (!s.allowDuplicateClaims && claimLastTime[telegramHash][spotId] > 0) return (false, 0);

        // 쿨다운은 항상 체크
        uint48 cd = s.cooldown;
        uint256 rem = _cooldownRemaining(spotId, telegramHash, cd);

        // 교차 쿨다운
        address wallet = telegramToWallet[telegramHash];
        if (wallet != address(0)) {
            bytes32 linkedDevice = walletToDevice[wallet];
            if (linkedDevice != bytes32(0)) {
                uint256 crossRem = _cooldownRemaining(spotId, linkedDevice, cd);
                if (crossRem > rem) rem = crossRem;
            }
        }

        return (rem == 0, rem);
    }

    function canClaimDevice(uint256 spotId, bytes32 deviceHash) external view returns (
        bool claimable,
        uint256 cooldownRemaining
    ) {
        Spot storage s = spots[spotId];
        if (s.reward == 0 || s.remaining < s.reward) return (false, 0);
        if (!_isWithinActiveTime(s)) return (false, 0);

        // 중복발행 불가면 이미 클레임한 경우 불가
        if (!s.allowDuplicateClaims && claimLastTime[deviceHash][spotId] > 0) return (false, 0);

        // 쿨다운은 항상 체크
        uint48 cd = s.cooldown;
        uint256 rem = _cooldownRemaining(spotId, deviceHash, cd);

        // 교차 쿨다운
        address wallet = deviceToWallet[deviceHash];
        if (wallet != address(0)) {
            bytes32 linkedTelegram = walletToTelegram[wallet];
            if (linkedTelegram != bytes32(0)) {
                uint256 crossRem = _cooldownRemaining(spotId, linkedTelegram, cd);
                if (crossRem > rem) rem = crossRem;
            }
        }

        return (rem == 0, rem);
    }

    uint256[48] private _gap;
}
