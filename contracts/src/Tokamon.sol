// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IERC20.sol";

contract Tokamon {
    // Custom errors (gas-efficient)
    error OnlyAdmin();
    error SpotNotFound();
    error NotSpotCreator();
    error InsufficientBalance();
    error SpotExhausted();
    error CooldownNotElapsed();
    error CooldownNotElapsedTelegram();
    error CooldownNotElapsedWallet();
    error InvalidInput();

    address public admin;
    uint256 public nextSpotId;
    IERC20 public immutable tonToken;

    struct Spot {
        address creator;
        uint256 reward;       // 1회 방문 보상 (wei)
        uint256 remaining;    // 남은 잔액 (wei)
        uint256 stampGoal;    // 스탬프 목표 횟수
        uint256 stampBonus;   // 스탬프 달성 보너스 (wei)
        uint256 cooldown;     // 재방문 쿨다운 (초)
        bool allowDuplicateClaims; // 중복 톤 발행 허용 여부
        string name;
        string description;
        int256 lat;           // 실제값 × 1e6
        int256 lng;           // 실제값 × 1e6
        string startTime;
        string endTime;
    }

    struct SpotMetadata {
        string name;
        string description;
        int256 lat;
        int256 lng;
        string startTime;
        string endTime;
    }

    mapping(uint256 => Spot) public spots;
    mapping(address => uint256) public balances;

    // === 통합 클레임 관리 (텔레그램 해시 기반) ===
    // 모든 클레임은 텔레그램 해시로 관리됨
    // 지갑 주소로 클레임 시 연결된 텔레그램 해시 사용, 없으면 지갑 주소를 해시로 변환하여 사용
    
    // 텔레그램 ID 해시 => TON 잔액 (클레임 대기 중인 잔액)
    mapping(bytes32 => uint256) public telegramBalances;

    // 기기 해시 => TON 잔액 (기기 기반 클레임 대기 중인 잔액)
    mapping(bytes32 => uint256) public deviceBalances;

    // 통합 식별자(해시) => 스팟 ID => 스탬프 카운트
    mapping(bytes32 => mapping(uint256 => uint256)) public claimStampCount;

    // 통합 식별자(해시) => 스팟 ID => 마지막 클레임 시간
    mapping(bytes32 => mapping(uint256 => uint256)) public claimLastTime;

    // 텔레그램 ID 해시 => 연결된 지갑 주소
    mapping(bytes32 => address) public telegramToWallet;

    // 지갑 주소 => 연결된 텔레그램 ID 해시 (역방향 매핑)
    mapping(address => bytes32) public walletToTelegram;

    event SpotCreated(uint256 indexed spotId, address indexed creator, uint256 reward, uint256 deposit, string name, string description, int256 lat, int256 lng);
    event Claimed(uint256 indexed spotId, address indexed user, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);
    event Redeposited(uint256 indexed spotId, address indexed creator, uint256 amount);
    event TelegramClaimed(uint256 indexed spotId, bytes32 indexed telegramHash, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);
    event TelegramLinked(bytes32 indexed telegramHash, address indexed oldWallet, address indexed newWallet, uint256 transferredAmount);
    event DeviceClaimed(uint256 indexed spotId, bytes32 indexed deviceHash, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    constructor(address _tonToken) {
        admin = msg.sender;
        tonToken = IERC20(_tonToken);
    }

    // Faucet: admin이 TON 토큰을 전송하면 user의 내부 잔액 증가
    function deposit(address user, uint256 amount) external onlyAdmin {
        if (amount == 0) revert InvalidInput();
        if (!tonToken.transferFrom(msg.sender, address(this), amount)) revert InvalidInput();
        balances[user] += amount;
    }

    // 스팟 생성
    function createSpot(
        address creator,
        uint256 depositAmt,
        uint256 reward,
        uint256 stampGoal,
        uint256 stampBonus,
        uint256 cooldown,
        bool allowDuplicateClaims,
        SpotMetadata calldata meta
    ) external onlyAdmin returns (uint256) {
        if (reward == 0 || depositAmt < reward || stampGoal == 0) revert InvalidInput();
        if (balances[creator] < depositAmt) revert InsufficientBalance();

        balances[creator] -= depositAmt;

        uint256 spotId = nextSpotId;
        Spot storage s = spots[spotId];
        s.creator = creator;
        s.reward = reward;
        s.remaining = depositAmt;
        s.stampGoal = stampGoal;
        s.stampBonus = stampBonus;
        s.cooldown = cooldown;
        s.allowDuplicateClaims = allowDuplicateClaims;
        s.name = meta.name;
        s.description = meta.description;
        s.lat = meta.lat;
        s.lng = meta.lng;
        s.startTime = meta.startTime;
        s.endTime = meta.endTime;

        unchecked { nextSpotId++; }

        emit SpotCreated(spotId, creator, reward, depositAmt, meta.name, meta.description, meta.lat, meta.lng);

        return spotId;
    }

    // 재예치: 기존 스팟에 TON 추가
    function redeposit(uint256 spotId, address creator, uint256 amount) external onlyAdmin {
        Spot storage spot = spots[spotId];
        if (spot.reward == 0) revert SpotNotFound();
        if (spot.creator != creator) revert NotSpotCreator();
        if (balances[creator] < amount) revert InsufficientBalance();

        balances[creator] -= amount;
        spot.remaining += amount;

        emit Redeposited(spotId, creator, amount);
    }

    // === 통합 클레임 함수 ===
    
    // 지갑 주소 기반 해시 생성
    function _walletToHash(address user) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("wallet:", user));
    }

    // 쿨다운 체크 (텔레그램 해시와 연결된 지갑 해시 모두 확인)
    function _checkCooldown(uint256 spotId, bytes32 telegramHash, uint256 cooldown) internal view {
        // 텔레그램 해시 쿨다운 체크 (첫 클레임이면 통과)
        uint256 lastTelegram = claimLastTime[telegramHash][spotId];
        if (lastTelegram > 0 && block.timestamp < lastTelegram + cooldown) revert CooldownNotElapsed();
        
        // 연결된 지갑이 있으면 지갑 해시도 체크 (연결 전 지갑으로 클레임한 경우 대비)
        address linkedWallet = telegramToWallet[telegramHash];
        if (linkedWallet != address(0)) {
            bytes32 walletHash = _walletToHash(linkedWallet);
            uint256 lastWallet = claimLastTime[walletHash][spotId];
            if (lastWallet > 0) {
                require(
                    block.timestamp >= lastWallet + cooldown,
                    "cooldown not elapsed (wallet)"
                );
            }
        }
    }
    
    // 쿨다운 체크 (지갑 주소와 연결된 텔레그램 해시 모두 확인)
    function _checkCooldownForWallet(uint256 spotId, address user, uint256 cooldown) internal view {
        bytes32 walletHash = _walletToHash(user);
        
        // 지갑 해시 쿨다운 체크 (첫 클레임이면 통과)
        uint256 lastWallet = claimLastTime[walletHash][spotId];
        if (lastWallet > 0) {
            require(
                block.timestamp >= lastWallet + cooldown,
                "cooldown not elapsed"
            );
        }
        
        // 연결된 텔레그램이 있으면 텔레그램 해시도 체크
        bytes32 linkedTelegram = walletToTelegram[user];
        if (linkedTelegram != bytes32(0)) {
            uint256 lastTelegram = claimLastTime[linkedTelegram][spotId];
            if (lastTelegram > 0) {
                require(
                    block.timestamp >= lastTelegram + cooldown,
                    "cooldown not elapsed (telegram)"
                );
            }
        }
    }

    // 스탬프 통합 조회 (텔레그램 해시와 연결된 지갑 해시 중 큰 값)
    function _getStampCount(uint256 spotId, bytes32 telegramHash) internal view returns (uint256) {
        uint256 telegramStamps = claimStampCount[telegramHash][spotId];
        
        address linkedWallet = telegramToWallet[telegramHash];
        if (linkedWallet != address(0)) {
            bytes32 walletHash = _walletToHash(linkedWallet);
            uint256 walletStamps = claimStampCount[walletHash][spotId];
            // 더 큰 값 반환 (더 진행된 스탬프)
            return telegramStamps > walletStamps ? telegramStamps : walletStamps;
        }
        return telegramStamps;
    }
    
    // 스탬프 통합 조회 (지갑 기준)
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

    // 지갑 주소로 클레임: 서버(admin)가 위치/시간 검증 후 자동 호출
    function claim(uint256 spotId, address user) external onlyAdmin {
        _doClaim(spotId, user);
    }

    // 지갑 주소로 클레임: 사용자가 직접 호출 (msg.sender)
    function claimSelf(uint256 spotId) external {
        _doClaim(spotId, msg.sender);
    }

    function _doClaim(uint256 spotId, address user) internal {
        Spot storage spot = spots[spotId];
        require(spot.reward > 0, "spot does not exist");

        // 중복 발행이 허용되지 않는 경우 쿨다운 확인 (지갑+텔레그램 통합)
        if (!spot.allowDuplicateClaims) {
            _checkCooldownForWallet(spotId, user, spot.cooldown);
        }

        // 보상 계산 (스탬프 통합)
        uint256 payout = spot.reward;
        uint256 newStamp = _getStampCountForWallet(spotId, user) + 1;
        uint256 bonus = 0;

        if (newStamp >= spot.stampGoal) {
            bonus = spot.stampBonus;
            payout += bonus;
            newStamp = 0;
        }

        require(spot.remaining >= payout, "spot exhausted");

        // 상태 업데이트 (연결된 텔레그램이 있으면 텔레그램 해시에 기록, 없으면 지갑 해시)
        bytes32 linkedTelegram = walletToTelegram[user];
        bytes32 recordHash = linkedTelegram != bytes32(0) ? linkedTelegram : _walletToHash(user);
        
        spot.remaining -= payout;
        claimStampCount[recordHash][spotId] = newStamp;
        claimLastTime[recordHash][spotId] = block.timestamp;
        
        // TON을 사용자 지갑으로 직접 전송
        require(tonToken.transfer(user, payout), "TON transfer failed");

        emit Claimed(spotId, user, payout - bonus, bonus, newStamp, block.timestamp);
    }

    // === 텔레그램 기능 ===

    // 텔레그램으로 클레임 (스팟 소유자만 가능)
    function claimToTelegram(uint256 spotId, bytes32 telegramHash) external {
        Spot storage spot = spots[spotId];
        require(spot.reward > 0, "spot does not exist");
        require(spot.creator == msg.sender, "only spot owner can claim");

        // 중복 발행이 허용되지 않는 경우 쿨다운 확인 (텔레그램+지갑 통합)
        if (!spot.allowDuplicateClaims) {
            _checkCooldown(spotId, telegramHash, spot.cooldown);
        }

        // 보상 계산 (스탬프 통합)
        uint256 payout = spot.reward;
        uint256 newStamp = _getStampCount(spotId, telegramHash) + 1;
        uint256 bonus = 0;

        if (newStamp >= spot.stampGoal) {
            bonus = spot.stampBonus;
            payout += bonus;
            newStamp = 0;
        }

        require(spot.remaining >= payout, "spot exhausted");

        // 상태 업데이트 (항상 텔레그램 해시에 기록)
        spot.remaining -= payout;
        claimStampCount[telegramHash][spotId] = newStamp;
        claimLastTime[telegramHash][spotId] = block.timestamp;
        
        // TON을 텔레그램 잔액에 추가
        telegramBalances[telegramHash] += payout;

        emit TelegramClaimed(spotId, telegramHash, payout - bonus, bonus, newStamp, block.timestamp);
    }

    // 텔레그램 잔액 조회
    function getTelegramBalance(bytes32 telegramHash) external view returns (uint256) {
        return telegramBalances[telegramHash];
    }

    // 통합 스탬프 정보 조회 (텔레그램 해시 또는 지갑 주소)
    function getClaimInfo(uint256 spotId, bytes32 identifier) external view returns (
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

        return (
            claimStampCount[identifier][spotId],
            s.stampGoal,
            last,
            remaining
        );
    }
    
    // 텔레그램 스탬프 정보 조회 (하위 호환)
    function getTelegramStampInfo(uint256 spotId, bytes32 telegramHash) external view returns (
        uint256 stamps,
        uint256 goal,
        uint256 lastClaim,
        uint256 cooldownRemaining
    ) {
        return this.getClaimInfo(spotId, telegramHash);
    }

    // 텔레그램에 연결된 지갑 조회
    function getTelegramLinkedWallet(bytes32 telegramHash) external view returns (address) {
        return telegramToWallet[telegramHash];
    }

    // 지갑에 연결된 텔레그램 조회 (역방향)
    function getWalletLinkedTelegram(address wallet) external view returns (bytes32) {
        return walletToTelegram[wallet];
    }

    // 텔레그램 잔액을 지갑으로 클레임
    function claimTelegramToWallet(bytes32 telegramHash) external {
        // 파라미터로 받은 해시와 지갑에 연결된 해시가 일치하는지 확인
        bytes32 linkedHash = walletToTelegram[msg.sender];
        require(linkedHash != bytes32(0), "no telegram linked");
        require(linkedHash == telegramHash, "hash mismatch");
        
        uint256 amount = telegramBalances[telegramHash];
        require(amount > 0, "no balance");
        
        telegramBalances[telegramHash] = 0;
        // TON 토큰을 지갑으로 전송
        require(tonToken.transfer(msg.sender, amount), "TON transfer failed");
    }

    // 텔레그램을 지갑에 연결 (1:1 매핑 보장)
    // 기존 지갑 기반 클레임 기록을 텔레그램 해시로 병합
    function linkTelegramToWallet(bytes32 telegramHash, address wallet) external onlyAdmin {
        require(wallet != address(0), "invalid wallet");
        require(telegramHash != bytes32(0), "invalid telegram hash");

        // 이미 다른 텔레그램에 연결되어 있는지 확인
        bytes32 existingTelegram = walletToTelegram[wallet];
        require(existingTelegram == bytes32(0) || existingTelegram == telegramHash, "wallet already linked to another telegram");

        // 이전 매핑 제거
        address oldWallet = telegramToWallet[telegramHash];
        if (oldWallet != address(0) && oldWallet != wallet) {
            delete walletToTelegram[oldWallet];
        }

        // 새 매핑 설정 (양방향)
        telegramToWallet[telegramHash] = wallet;
        walletToTelegram[wallet] = telegramHash;

        // 참고: 기존 지갑 해시 기반 클레임 기록은 병합하지 않음
        // 클레임 시점에 양쪽(텔레그램 해시 + 지갑 해시)을 모두 체크하여 중복 방지

        emit TelegramLinked(telegramHash, oldWallet, wallet, 0);
    }

    // === 기기 기반 클레임 ===

    function claimByDevice(uint256 spotId, bytes32 deviceHash) external onlyAdmin {
        Spot storage spot = spots[spotId];
        require(spot.reward > 0, "spot does not exist");

        if (!spot.allowDuplicateClaims) {
            uint256 last = claimLastTime[deviceHash][spotId];
            if (last > 0) {
                require(block.timestamp >= last + spot.cooldown, "cooldown not elapsed");
            }
        }

        uint256 payout = spot.reward;
        uint256 newStamp = claimStampCount[deviceHash][spotId] + 1;
        uint256 bonus = 0;

        if (newStamp >= spot.stampGoal) {
            bonus = spot.stampBonus;
            payout += bonus;
            newStamp = 0;
        }

        require(spot.remaining >= payout, "spot exhausted");

        spot.remaining -= payout;
        claimStampCount[deviceHash][spotId] = newStamp;
        claimLastTime[deviceHash][spotId] = block.timestamp;
        deviceBalances[deviceHash] += payout;

        emit DeviceClaimed(spotId, deviceHash, payout - bonus, bonus, newStamp, block.timestamp);
    }

    function getDeviceBalance(bytes32 deviceHash) external view returns (uint256) {
        return deviceBalances[deviceHash];
    }

    // === 사용자 직접 호출 함수 (MetaMask 연동) ===

    // 충전: 사용자가 직접 TON 토큰을 전송하여 내부 잔액 증가
    function depositSelf(uint256 amount) external {
        require(amount > 0, "must deposit TON");
        require(tonToken.transferFrom(msg.sender, address(this), amount), "TON transfer failed");
        balances[msg.sender] += amount;
    }

    // 스팟 생성: 점주가 직접 트랜잭션 서명 (TON 토큰 transferFrom 사용)
    function createSpotSelf(
        uint256 depositAmt,
        uint256 reward,
        uint256 stampGoal,
        uint256 stampBonus,
        uint256 cooldown,
        bool allowDuplicateClaims,
        SpotMetadata calldata meta
    ) external returns (uint256) {
        require(reward > 0, "reward must be > 0");
        require(depositAmt >= reward, "deposit must be >= reward");
        require(stampGoal > 0, "stampGoal must be > 0");

        require(tonToken.transferFrom(msg.sender, address(this), depositAmt), "TON transfer failed");

        uint256 spotId = nextSpotId;
        Spot storage s = spots[spotId];
        s.creator = msg.sender;
        s.reward = reward;
        s.remaining = depositAmt;
        s.stampGoal = stampGoal;
        s.stampBonus = stampBonus;
        s.cooldown = cooldown;
        s.allowDuplicateClaims = allowDuplicateClaims;
        s.name = meta.name;
        s.description = meta.description;
        s.lat = meta.lat;
        s.lng = meta.lng;
        s.startTime = meta.startTime;
        s.endTime = meta.endTime;

        unchecked { nextSpotId++; }

        emit SpotCreated(spotId, msg.sender, reward, depositAmt, meta.name, meta.description, meta.lat, meta.lng);

        return spotId;
    }

    // 재예치: 점주가 직접 트랜잭션 서명 (TON 토큰 transferFrom 사용)
    function redepositSelf(uint256 spotId, uint256 amount) external {
        Spot storage spot = spots[spotId];
        require(spot.reward > 0, "spot does not exist");
        require(spot.creator == msg.sender, "not spot creator");

        require(tonToken.transferFrom(msg.sender, address(this), amount), "TON transfer failed");
        spot.remaining += amount;

        emit Redeposited(spotId, msg.sender, amount);
    }

    // 쿨다운 시간 수정 (점주만 가능)
    function updateCooldown(uint256 spotId, uint256 newCooldown) external {
        Spot storage spot = spots[spotId];
        require(spot.reward > 0, "spot does not exist");
        require(spot.creator == msg.sender, "only spot owner can update");
        
        spot.cooldown = newCooldown;
        
        emit CooldownUpdated(spotId, newCooldown);
    }

    // 중복 발행 허용 여부 수정 (점주만 가능)
    function updateAllowDuplicateClaims(uint256 spotId, bool allow) external {
        Spot storage spot = spots[spotId];
        require(spot.reward > 0, "spot does not exist");
        require(spot.creator == msg.sender, "only spot owner can update");
        
        spot.allowDuplicateClaims = allow;
        
        emit AllowDuplicateClaimsUpdated(spotId, allow);
    }

    // 이벤트 추가
    event CooldownUpdated(uint256 indexed spotId, uint256 newCooldown);
    event AllowDuplicateClaimsUpdated(uint256 indexed spotId, bool allow);

    // 잔액 조회
    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    // 스팟 기본 정보 조회
    function getSpotCore(uint256 spotId) external view returns (
        address creator,
        uint256 reward,
        uint256 remaining,
        uint256 stampGoal,
        uint256 stampBonus,
        uint256 cooldown,
        bool allowDuplicateClaims
    ) {
        Spot storage s = spots[spotId];
        return (s.creator, s.reward, s.remaining, s.stampGoal, s.stampBonus, s.cooldown, s.allowDuplicateClaims);
    }

    // 스팟 전체 조회 (Spot 구조체 반환)
    function getSpot(uint256 spotId) external view returns (Spot memory) {
        return spots[spotId];
    }

    // 스탬프 현황 조회 (지갑 주소 기준 - 텔레그램 연결 고려)
    function getStampInfo(uint256 spotId, address user) external view returns (
        uint256 stamps,
        uint256 goal,
        uint256 lastClaim,
        uint256 cooldownRemaining
    ) {
        Spot storage s = spots[spotId];
        
        // 연결된 텔레그램 해시가 있으면 텔레그램 해시 기록 사용
        bytes32 linkedTelegram = walletToTelegram[user];
        bytes32 checkHash = linkedTelegram != bytes32(0) ? linkedTelegram : _walletToHash(user);
        
        uint256 last = claimLastTime[checkHash][spotId];
        uint256 remaining = 0;

        if (last + s.cooldown > block.timestamp) {
            remaining = (last + s.cooldown) - block.timestamp;
        }

        return (
            _getStampCountForWallet(spotId, user),
            s.stampGoal,
            last,
            remaining
        );
    }
}
