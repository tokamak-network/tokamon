// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Tokamon {
    address public admin;
    uint256 public nextSpotId;

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

    // 스탬프: spotId => user => 현재 스탬프 횟수
    mapping(uint256 => mapping(address => uint256)) public stampCount;

    // 쿨다운: spotId => user => 마지막 클레임 시간
    mapping(uint256 => mapping(address => uint256)) public lastClaimTime;

    // 핸드폰 번호 해시 => TON 잔액
    mapping(bytes32 => uint256) public phoneBalances;

    // 핸드폰 번호 해시 => 스팟 ID => 스탬프 카운트
    mapping(bytes32 => mapping(uint256 => uint256)) public phoneStampCount;

    // 핸드폰 번호 해시 => 스팟 ID => 마지막 클레임 시간
    mapping(bytes32 => mapping(uint256 => uint256)) public phoneLastClaimTime;

    // 텔레그램 ID 해시 => TON 잔액
    mapping(bytes32 => uint256) public telegramBalances;

    // 텔레그램 ID 해시 => 스팟 ID => 스탬프 카운트
    mapping(bytes32 => mapping(uint256 => uint256)) public telegramStampCount;

    // 텔레그램 ID 해시 => 스팟 ID => 마지막 클레임 시간
    mapping(bytes32 => mapping(uint256 => uint256)) public telegramLastClaimTime;

    // 텔레그램 ID 해시 => 연결된 지갑 주소
    mapping(bytes32 => address) public telegramToWallet;

    event SpotCreated(uint256 indexed spotId, address indexed creator, uint256 reward, uint256 deposit);
    event Claimed(uint256 indexed spotId, address indexed user, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);
    event Redeposited(uint256 indexed spotId, address indexed creator, uint256 amount);
    event ClaimedToPhone(uint256 indexed spotId, bytes32 indexed phoneHash, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);
    event TelegramClaimed(uint256 indexed spotId, bytes32 indexed telegramHash, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);
    event TelegramLinked(bytes32 indexed telegramHash, address indexed oldWallet, address indexed newWallet, uint256 transferredAmount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // Faucet: admin이 ETH를 보내면 user의 내부 잔액 증가
    function deposit(address user) external payable {
        require(msg.value > 0, "must send ETH");
        balances[user] += msg.value;
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
        require(reward > 0, "reward must be > 0");
        require(depositAmt >= reward, "deposit must be >= reward");
        require(balances[creator] >= depositAmt, "insufficient balance");
        require(stampGoal > 0, "stampGoal must be > 0");

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

        nextSpotId++;

        emit SpotCreated(spotId, creator, reward, depositAmt);

        return spotId;
    }

    // 재예치: 기존 스팟에 TON 추가
    function redeposit(uint256 spotId, address creator, uint256 amount) external onlyAdmin {
        Spot storage spot = spots[spotId];
        require(spot.reward > 0, "spot does not exist");
        require(spot.creator == creator, "not spot creator");
        require(balances[creator] >= amount, "insufficient balance");

        balances[creator] -= amount;
        spot.remaining += amount;

        emit Redeposited(spotId, creator, amount);
    }

    // 클레임: 서버(admin)가 위치/시간 검증 후 호출
    function claim(uint256 spotId, address user) external onlyAdmin {
        Spot storage spot = spots[spotId];
        require(spot.reward > 0, "spot does not exist");

        // 쿨다운 확인
        require(
            block.timestamp >= lastClaimTime[spotId][user] + spot.cooldown,
            "cooldown not elapsed"
        );

        // 보상 계산
        uint256 payout = spot.reward;
        uint256 newStamp = stampCount[spotId][user] + 1;
        uint256 bonus = 0;

        // 스탬프 목표 달성 시 보너스
        if (newStamp >= spot.stampGoal) {
            bonus = spot.stampBonus;
            payout += bonus;
            newStamp = 0; // 스탬프 리셋
        }

        require(spot.remaining >= payout, "spot exhausted");

        // 상태 업데이트
        spot.remaining -= payout;
        balances[user] += payout;
        stampCount[spotId][user] = newStamp;
        lastClaimTime[spotId][user] = block.timestamp;

        emit Claimed(spotId, user, spot.reward, bonus, newStamp, block.timestamp);
    }

    // 핸드폰 번호로 클레임: 서버(admin)가 위치/시간 검증 후 호출
    function claimToPhone(uint256 spotId, bytes32 phoneHash) external onlyAdmin {
        Spot storage spot = spots[spotId];
        require(spot.reward > 0, "spot does not exist");

        // 쿨다운 확인
        require(
            block.timestamp >= phoneLastClaimTime[phoneHash][spotId] + spot.cooldown,
            "cooldown not elapsed"
        );

        // 보상 계산
        uint256 payout = spot.reward;
        uint256 newStamp = phoneStampCount[phoneHash][spotId] + 1;
        uint256 bonus = 0;

        // 스탬프 목표 달성 시 보너스
        if (newStamp >= spot.stampGoal) {
            bonus = spot.stampBonus;
            payout += bonus;
            newStamp = 0; // 스탬프 리셋
        }

        require(spot.remaining >= payout, "spot exhausted");

        // 상태 업데이트
        spot.remaining -= payout;
        phoneBalances[phoneHash] += payout;
        phoneStampCount[phoneHash][spotId] = newStamp;
        phoneLastClaimTime[phoneHash][spotId] = block.timestamp;

        emit ClaimedToPhone(spotId, phoneHash, spot.reward, bonus, newStamp, block.timestamp);
    }

    // 핸드폰 번호 잔액 조회
    function getPhoneBalance(bytes32 phoneHash) external view returns (uint256) {
        return phoneBalances[phoneHash];
    }

    // 핸드폰 번호 스탬프 정보 조회
    function getPhoneStampInfo(uint256 spotId, bytes32 phoneHash) external view returns (
        uint256 stamps,
        uint256 goal,
        uint256 lastClaim,
        uint256 cooldownRemaining
    ) {
        Spot storage s = spots[spotId];
        uint256 last = phoneLastClaimTime[phoneHash][spotId];
        uint256 remaining = 0;

        if (last + s.cooldown > block.timestamp) {
            remaining = (last + s.cooldown) - block.timestamp;
        }

        return (
            phoneStampCount[phoneHash][spotId],
            s.stampGoal,
            last,
            remaining
        );
    }

    // === 텔레그램 기능 ===

    // 텔레그램으로 클레임 (스팟 소유자만 가능)
    function claimToTelegram(uint256 spotId, bytes32 telegramHash) external {
        Spot storage spot = spots[spotId];
        require(spot.reward > 0, "spot does not exist");
        require(spot.creator == msg.sender, "only spot owner can claim");

        // 중복 발행이 허용되지 않는 경우에만 쿨다운 확인
        if (!spot.allowDuplicateClaims) {
            require(
                block.timestamp >= telegramLastClaimTime[telegramHash][spotId] + spot.cooldown,
                "cooldown not elapsed"
            );
        }

        // 보상 계산
        uint256 payout = spot.reward;
        uint256 newStamp = telegramStampCount[telegramHash][spotId] + 1;
        uint256 bonus = 0;

        // 스탬프 목표 달성 시 보너스
        if (newStamp >= spot.stampGoal) {
            bonus = spot.stampBonus;
            payout += bonus;
            newStamp = 0; // 스탬프 리셋
        }

        require(spot.remaining >= payout, "spot exhausted");

        // 상태 업데이트
        spot.remaining -= payout;
        telegramBalances[telegramHash] += payout;
        telegramStampCount[telegramHash][spotId] = newStamp;
        telegramLastClaimTime[telegramHash][spotId] = block.timestamp;

        emit TelegramClaimed(spotId, telegramHash, spot.reward, bonus, newStamp, block.timestamp);
    }

    // 텔레그램 잔액 조회
    function getTelegramBalance(bytes32 telegramHash) external view returns (uint256) {
        return telegramBalances[telegramHash];
    }

    // 텔레그램 스탬프 정보 조회
    function getTelegramStampInfo(uint256 spotId, bytes32 telegramHash) external view returns (
        uint256 stamps,
        uint256 goal,
        uint256 lastClaim,
        uint256 cooldownRemaining
    ) {
        Spot storage s = spots[spotId];
        uint256 last = telegramLastClaimTime[telegramHash][spotId];
        uint256 remaining = 0;

        if (last + s.cooldown > block.timestamp) {
            remaining = (last + s.cooldown) - block.timestamp;
        }

        return (
            telegramStampCount[telegramHash][spotId],
            s.stampGoal,
            last,
            remaining
        );
    }

    // 텔레그램에 연결된 지갑 조회
    function getTelegramLinkedWallet(bytes32 telegramHash) external view returns (address) {
        return telegramToWallet[telegramHash];
    }

    // 텔레그램을 지갑에 연결 (지갑 변경 가능)
    function linkTelegramToWallet(bytes32 telegramHash, address wallet) external onlyAdmin {
        require(wallet != address(0), "invalid wallet");

        address oldWallet = telegramToWallet[telegramHash];
        telegramToWallet[telegramHash] = wallet;

        // 텔레그램 잔액을 새 지갑으로 이전
        uint256 amount = telegramBalances[telegramHash];
        if (amount > 0) {
            telegramBalances[telegramHash] = 0;
            balances[wallet] += amount;
        }

        emit TelegramLinked(telegramHash, oldWallet, wallet, amount);
    }

    // === 사용자 직접 호출 함수 (MetaMask 연동) ===

    // 충전: 사용자가 직접 ETH를 보내서 내부 잔액 증가
    function depositSelf() external payable {
        require(msg.value > 0, "must send ETH");
        balances[msg.sender] += msg.value;
    }

    // 스팟 생성: 점주가 직접 트랜잭션 서명
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
        require(balances[msg.sender] >= depositAmt, "insufficient balance");
        require(stampGoal > 0, "stampGoal must be > 0");

        balances[msg.sender] -= depositAmt;

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

        nextSpotId++;

        emit SpotCreated(spotId, msg.sender, reward, depositAmt);

        return spotId;
    }

    // 재예치: 점주가 직접 트랜잭션 서명
    function redepositSelf(uint256 spotId, uint256 amount) external {
        Spot storage spot = spots[spotId];
        require(spot.reward > 0, "spot does not exist");
        require(spot.creator == msg.sender, "not spot creator");
        require(balances[msg.sender] >= amount, "insufficient balance");

        balances[msg.sender] -= amount;
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

    // 스탬프 현황 조회
    function getStampInfo(uint256 spotId, address user) external view returns (
        uint256 stamps,
        uint256 goal,
        uint256 lastClaim,
        uint256 cooldownRemaining
    ) {
        Spot storage s = spots[spotId];
        uint256 last = lastClaimTime[spotId][user];
        uint256 remaining = 0;

        if (last + s.cooldown > block.timestamp) {
            remaining = (last + s.cooldown) - block.timestamp;
        }

        return (
            stampCount[spotId][user],
            s.stampGoal,
            last,
            remaining
        );
    }
}
