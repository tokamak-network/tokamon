// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "../src/Tokamon.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract TokamonTest is Test {
    Tokamon public tokamon;
    address public admin;
    address public user1;
    address public user2;

    function setUp() public {
        admin = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");

        // 프록시 배포
        Tokamon impl = new Tokamon();
        bytes memory initData = abi.encodeCall(Tokamon.initialize, ());
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        tokamon = Tokamon(address(proxy));

        // 테스트용 ETH 전송
        vm.deal(admin, 1000 ether);
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
    }

    // ─── 헬퍼 ───

    function _defaultMeta() internal pure returns (Tokamon.SpotMetadata memory) {
        return Tokamon.SpotMetadata({
            name: "Test Spot",
            description: "Test Description",
            lat: 37_566535,    // 서울 (37.566535)
            lng: 126_977969,   // (126.977969)
            startDate: 0,      // 제한 없음
            endDate: 0,        // 제한 없음
            dailyStartTime: 0, // 제한 없음
            dailyEndTime: 0,   // 제한 없음
            utcOffset: 0
        });
    }

    function _timedMeta() internal pure returns (Tokamon.SpotMetadata memory) {
        return Tokamon.SpotMetadata({
            name: "Timed Spot",
            description: "Time-restricted",
            lat: 37_566535,
            lng: 126_977969,
            startDate: 1700000000,
            endDate: 1800000000,
            dailyStartTime: 540,   // 09:00
            dailyEndTime: 1080,    // 18:00
            utcOffset: 9           // UTC+9
        });
    }

    function _createDefaultSpot() internal returns (uint256) {
        return tokamon.createSpotSelf{value: 10 ether}(
            1 ether,   // reward
            5,         // stampGoal
            2 ether,   // stampBonus
            3600,      // cooldown (1시간)
            true,      // allowDuplicateClaims
            _defaultMeta()
        );
    }

    // ─── 스팟 생성 테스트 ───

    function test_CreateSpotWithDailyTime() public {
        Tokamon.SpotMetadata memory meta = _timedMeta();
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 2 ether, 3600, false, meta
        );
        assertEq(spotId, 0);

        Tokamon.Spot memory spot = tokamon.getSpot(spotId);
        assertEq(spot.name, "Timed Spot");
        assertEq(spot.description, "Time-restricted");
        assertEq(spot.lat, 37_566535);
        assertEq(spot.lng, 126_977969);
        assertEq(spot.startDate, 1700000000);
        assertEq(spot.endDate, 1800000000);
        assertEq(spot.dailyStartTime, 540);
        assertEq(spot.dailyEndTime, 1080);
        assertEq(spot.utcOffset, 9);
        assertEq(spot.reward, 1 ether);
        assertEq(spot.remaining, 10 ether);
        assertEq(spot.stampGoal, 5);
        assertEq(spot.stampBonus, 2 ether);
        assertEq(spot.cooldown, 3600);
        assertEq(spot.allowDuplicateClaims, false);
        assertEq(spot.creator, admin);
    }

    function test_CreateSpotWithZeroDailyTime() public {
        // dailyStartTime=0, dailyEndTime=0 → 일별 제한 없음 (하위 호환)
        Tokamon.SpotMetadata memory meta = Tokamon.SpotMetadata({
            name: "Always Open",
            description: "",
            lat: 0,
            lng: 0,
            startDate: 0,
            endDate: 0,
            dailyStartTime: 0,
            dailyEndTime: 0,
            utcOffset: 0
        });

        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 0, true, meta
        );

        Tokamon.Spot memory spot = tokamon.getSpot(spotId);
        assertEq(spot.dailyStartTime, 0);
        assertEq(spot.dailyEndTime, 0);
        assertEq(spot.utcOffset, 0);
        assertEq(spot.startDate, 0);
        assertEq(spot.endDate, 0);
    }

    function test_CreateSpotWithNightShift() public {
        // 야간 영업: 22:00~06:00
        Tokamon.SpotMetadata memory meta = Tokamon.SpotMetadata({
            name: "Night Spot",
            description: "",
            lat: 0,
            lng: 0,
            startDate: 1700000000,
            endDate: 1800000000,
            dailyStartTime: 1320,  // 22:00
            dailyEndTime: 360,     // 06:00
            utcOffset: 9
        });

        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 0, false, meta
        );

        Tokamon.Spot memory spot = tokamon.getSpot(spotId);
        assertEq(spot.dailyStartTime, 1320);
        assertEq(spot.dailyEndTime, 360);
    }

    function test_CreateSpotWithNegativeOffset() public {
        // UTC-5 (뉴욕)
        Tokamon.SpotMetadata memory meta = Tokamon.SpotMetadata({
            name: "NYC Spot",
            description: "",
            lat: 40_712776,
            lng: -74_005974,
            startDate: 1700000000,
            endDate: 1800000000,
            dailyStartTime: 540,
            dailyEndTime: 1080,
            utcOffset: -5
        });

        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 0, false, meta
        );

        Tokamon.Spot memory spot = tokamon.getSpot(spotId);
        assertEq(spot.utcOffset, -5);
    }

    // ─── 여러 스팟 생성 ───

    function test_MultipleSpotIds() public {
        uint256 id0 = _createDefaultSpot();
        uint256 id1 = _createDefaultSpot();
        uint256 id2 = _createDefaultSpot();

        assertEq(id0, 0);
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(tokamon.nextSpotId(), 3);
    }

    // ─── updateSpot 테스트 ───

    function test_UpdateSpotDailyTime() public {
        Tokamon.SpotMetadata memory meta = _timedMeta();
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 2 ether, 3600, false, meta
        );

        Tokamon.SpotMetadata memory newMeta = Tokamon.SpotMetadata({
            name: "Updated Spot",
            description: "Updated",
            lat: 35_689487,
            lng: 139_691711,
            startDate: 1710000000,
            endDate: 1810000000,
            dailyStartTime: 600,   // 10:00
            dailyEndTime: 1200,    // 20:00
            utcOffset: 9
        });

        tokamon.updateSpot(spotId, 2 ether, 10, 3 ether, 7200, true, newMeta);

        Tokamon.Spot memory spot = tokamon.getSpot(spotId);
        assertEq(spot.name, "Updated Spot");
        assertEq(spot.dailyStartTime, 600);
        assertEq(spot.dailyEndTime, 1200);
        assertEq(spot.startDate, 1710000000);
        assertEq(spot.endDate, 1810000000);
        assertEq(spot.reward, 2 ether);
        assertEq(spot.stampGoal, 10);
    }

    function test_UpdateSpotNotCreator() public {
        uint256 spotId = _createDefaultSpot();

        Tokamon.SpotMetadata memory meta = _defaultMeta();

        vm.prank(user1);
        vm.expectRevert(Tokamon.NotSpotCreator.selector);
        tokamon.updateSpot(spotId, 1 ether, 5, 2 ether, 3600, false, meta);
    }

    // ─── SpotCreated 이벤트 테스트 ───

    function test_SpotCreatedEvent() public {
        Tokamon.SpotMetadata memory meta = _defaultMeta();

        vm.expectEmit(true, true, false, true);
        emit Tokamon.SpotCreated(0, admin, 1 ether, 10 ether, "Test Spot", "Test Description", 37_566535, 126_977969);

        tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 2 ether, 3600, false, meta
        );
    }

    // ─── 디바이스 클레임 테스트 ───

    function test_ClaimByDevice() public {
        uint256 spotId = _createDefaultSpot();

        bytes32 deviceHash = keccak256("device1");

        // claimManager(admin)가 디바이스 클레임 실행
        tokamon.claimByDevice(spotId, deviceHash);

        assertEq(tokamon.getDeviceBalance(deviceHash), 1 ether);

        Tokamon.Spot memory spot = tokamon.getSpot(spotId);
        assertEq(spot.remaining, 9 ether);
    }

    function test_DeviceClaimCooldown() public {
        uint256 spotId = _createDefaultSpot();

        bytes32 deviceHash = keccak256("device1");

        tokamon.claimByDevice(spotId, deviceHash);

        // 쿨다운 내 재클레임 불가
        vm.expectRevert(Tokamon.CooldownNotElapsed.selector);
        tokamon.claimByDevice(spotId, deviceHash);

        // 쿨다운 지난 후 클레임 가능
        vm.warp(block.timestamp + 3601);
        tokamon.claimByDevice(spotId, deviceHash);

        assertEq(tokamon.getDeviceBalance(deviceHash), 2 ether);
    }

    // ─── 텔레그램 클레임 테스트 ───

    function test_ClaimToTelegram() public {
        uint256 spotId = _createDefaultSpot();

        bytes32 telegramHash = keccak256("telegram1");

        // 스팟 생성자(admin)가 텔레그램 클레임 실행
        tokamon.claimToTelegram(spotId, telegramHash);

        assertEq(tokamon.getTelegramBalance(telegramHash), 1 ether);

        Tokamon.Spot memory spot = tokamon.getSpot(spotId);
        assertEq(spot.remaining, 9 ether);
    }

    function test_TelegramClaimCooldown() public {
        uint256 spotId = _createDefaultSpot();

        bytes32 telegramHash = keccak256("telegram1");

        tokamon.claimToTelegram(spotId, telegramHash);

        // 쿨다운 내 재클레임 불가
        vm.expectRevert(Tokamon.CooldownNotElapsed.selector);
        tokamon.claimToTelegram(spotId, telegramHash);

        // 쿨다운 지난 후 클레임 가능
        vm.warp(block.timestamp + 3601);
        tokamon.claimToTelegram(spotId, telegramHash);

        assertEq(tokamon.getTelegramBalance(telegramHash), 2 ether);
    }

    // ─── getStampInfo 테스트 ───

    function test_GetStampInfoWithDevice() public {
        // allowDuplicateClaims = true 스팟으로 쿨다운 없이 테스트
        Tokamon.SpotMetadata memory meta = _defaultMeta();
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 2 ether, 0, true, meta
        );
        bytes32 deviceHash = keccak256("device1");

        // 링크 전에는 stamp 0 반환
        (uint256 stamps, uint256 goal,,) = tokamon.getStampInfo(spotId, user1);
        assertEq(stamps, 0);
        assertEq(goal, 5);

        // 디바이스 클레임 3회
        tokamon.claimByDevice(spotId, deviceHash);
        tokamon.claimByDevice(spotId, deviceHash);
        tokamon.claimByDevice(spotId, deviceHash);

        // 디바이스를 user1에 링크
        tokamon.linkDeviceToWallet(deviceHash, user1);

        // getStampInfo가 디바이스 스탬프를 반환
        (stamps, goal,,) = tokamon.getStampInfo(spotId, user1);
        assertEq(stamps, 3);
        assertEq(goal, 5);
    }

    // ─── getSpot 조회로 구조체 필드 순서 확인 ───

    function test_GetSpotFieldOrder() public {
        Tokamon.SpotMetadata memory meta = _timedMeta();
        tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 2 ether, 3600, false, meta);

        // getSpot이 모든 필드를 올바른 순서로 반환하는지 확인
        Tokamon.Spot memory s = tokamon.getSpot(0);

        // 기존 필드들
        assertTrue(s.creator != address(0));
        assertEq(s.reward, 1 ether);
        assertEq(s.remaining, 10 ether);
        assertEq(s.stampGoal, 5);
        assertEq(s.stampBonus, 2 ether);

        // 새 필드들이 올바르게 반환되는지
        assertEq(s.startDate, 1700000000);
        assertEq(s.endDate, 1800000000);
        assertEq(s.dailyStartTime, 540);
        assertEq(s.dailyEndTime, 1080);
        assertEq(s.utcOffset, 9);

        // string 필드가 밀리지 않았는지
        assertEq(s.name, "Timed Spot");
        assertEq(s.description, "Time-restricted");
    }

    // ─── 입력 검증 ───

    function test_RevertOnZeroDeposit() public {
        vm.expectRevert(Tokamon.InvalidInput.selector);
        tokamon.createSpotSelf{value: 0}(1 ether, 5, 1 ether, 0, false, _defaultMeta());
    }

    function test_RevertOnZeroReward() public {
        vm.expectRevert(Tokamon.InvalidInput.selector);
        tokamon.createSpotSelf{value: 10 ether}(0, 5, 0, 0, false, _defaultMeta());
    }

    function test_ZeroStampGoalAllowed() public {
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(1 ether, 0, 0, 0, false, _defaultMeta());
        Tokamon.Spot memory s = tokamon.getSpot(spotId);
        assertEq(s.stampGoal, 0);
    }

    function test_RevertOnStampGoalWithZeroBonus() public {
        vm.expectRevert(Tokamon.InvalidInput.selector);
        tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 0, 0, false, _defaultMeta());
    }

    // ─── dailyStartTime 경계값 테스트 ───

    function test_MaxDailyTime() public {
        Tokamon.SpotMetadata memory meta = Tokamon.SpotMetadata({
            name: "Max Time",
            description: "",
            lat: 0,
            lng: 0,
            startDate: 0,
            endDate: 0,
            dailyStartTime: 1439,  // 23:59
            dailyEndTime: 1439,
            utcOffset: 0
        });

        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 0, false, meta
        );

        Tokamon.Spot memory spot = tokamon.getSpot(spotId);
        assertEq(spot.dailyStartTime, 1439);
        assertEq(spot.dailyEndTime, 1439);
    }

    // ─── 입력 검증: dailyStartTime/dailyEndTime 범위 ───

    function test_RevertOnInvalidDailyStartTime() public {
        Tokamon.SpotMetadata memory meta = Tokamon.SpotMetadata({
            name: "Bad Time",
            description: "",
            lat: 0, lng: 0,
            startDate: 0, endDate: 0,
            dailyStartTime: 1440,  // 24:00 = 범위 초과
            dailyEndTime: 1080,
            utcOffset: 0
        });

        vm.expectRevert(Tokamon.InvalidInput.selector);
        tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, false, meta);
    }

    function test_RevertOnInvalidDailyEndTime() public {
        Tokamon.SpotMetadata memory meta = Tokamon.SpotMetadata({
            name: "Bad Time",
            description: "",
            lat: 0, lng: 0,
            startDate: 0, endDate: 0,
            dailyStartTime: 540,
            dailyEndTime: 2000,  // 범위 초과
            utcOffset: 0
        });

        vm.expectRevert(Tokamon.InvalidInput.selector);
        tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, false, meta);
    }

    function test_RevertOnInvalidUtcOffset() public {
        Tokamon.SpotMetadata memory meta = Tokamon.SpotMetadata({
            name: "Bad Offset",
            description: "",
            lat: 0, lng: 0,
            startDate: 0, endDate: 0,
            dailyStartTime: 540,
            dailyEndTime: 1080,
            utcOffset: 15  // 범위 초과 (max 14)
        });

        vm.expectRevert(Tokamon.InvalidInput.selector);
        tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, false, meta);
    }

    function test_RevertOnNegativeUtcOffsetTooLow() public {
        Tokamon.SpotMetadata memory meta = Tokamon.SpotMetadata({
            name: "Bad Offset",
            description: "",
            lat: 0, lng: 0,
            startDate: 0, endDate: 0,
            dailyStartTime: 540,
            dailyEndTime: 1080,
            utcOffset: -13  // 범위 초과 (min -12)
        });

        vm.expectRevert(Tokamon.InvalidInput.selector);
        tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, false, meta);
    }

    function test_ValidBoundaryUtcOffset() public {
        // UTC-12 (최소)
        Tokamon.SpotMetadata memory meta1 = Tokamon.SpotMetadata({
            name: "Min Offset", description: "",
            lat: 0, lng: 0, startDate: 0, endDate: 0,
            dailyStartTime: 0, dailyEndTime: 0, utcOffset: -12
        });
        uint256 id1 = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, false, meta1);
        assertEq(tokamon.getSpot(id1).utcOffset, -12);

        // UTC+14 (최대)
        Tokamon.SpotMetadata memory meta2 = Tokamon.SpotMetadata({
            name: "Max Offset", description: "",
            lat: 0, lng: 0, startDate: 0, endDate: 0,
            dailyStartTime: 0, dailyEndTime: 0, utcOffset: 14
        });
        uint256 id2 = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, false, meta2);
        assertEq(tokamon.getSpot(id2).utcOffset, 14);
    }

    function test_UpdateSpotRevertOnInvalidTime() public {
        uint256 spotId = _createDefaultSpot();
        Tokamon.SpotMetadata memory badMeta = Tokamon.SpotMetadata({
            name: "Bad", description: "",
            lat: 0, lng: 0, startDate: 0, endDate: 0,
            dailyStartTime: 1440, dailyEndTime: 1080, utcOffset: 0
        });

        vm.expectRevert(Tokamon.InvalidInput.selector);
        tokamon.updateSpot(spotId, 1 ether, 5, 1 ether, 0, false, badMeta);
    }

    // ─── 추가 쿨다운 테스트 ───

    // allowDuplicateClaims=true이면 쿨다운 무시
    function test_AllowDuplicateClaimsStillEnforcesCooldown() public {
        Tokamon.SpotMetadata memory meta = _defaultMeta();
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 2 ether, 3600, true, meta  // cooldown 3600초, allowDuplicateClaims=true
        );

        bytes32 deviceHash = keccak256("device1");

        // 첫 클레임 성공
        tokamon.claimByDevice(spotId, deviceHash);
        assertEq(tokamon.getDeviceBalance(deviceHash), 1 ether);

        // 쿨다운 내 재클레임 불가
        vm.expectRevert(Tokamon.CooldownNotElapsed.selector);
        tokamon.claimByDevice(spotId, deviceHash);

        // 쿨다운 경과 후 재클레임 가능 (중복발행 허용)
        vm.warp(4000);
        tokamon.claimByDevice(spotId, deviceHash);
        assertEq(tokamon.getDeviceBalance(deviceHash), 2 ether);

        // 다시 쿨다운 대기 후 클레임
        vm.warp(8000);
        tokamon.claimByDevice(spotId, deviceHash);
        assertEq(tokamon.getDeviceBalance(deviceHash), 3 ether);
    }

    function test_DisallowDuplicateClaimsOneTimeOnly() public {
        Tokamon.SpotMetadata memory meta = _defaultMeta();
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 2 ether, 3600, false, meta  // allowDuplicateClaims=false
        );

        bytes32 deviceHash = keccak256("device1");

        // 첫 클레임 성공
        tokamon.claimByDevice(spotId, deviceHash);
        assertEq(tokamon.getDeviceBalance(deviceHash), 1 ether);

        // 쿨다운 경과해도 재클레임 불가 (1인 1회)
        vm.warp(100000);
        vm.expectRevert(Tokamon.AlreadyClaimed.selector);
        tokamon.claimByDevice(spotId, deviceHash);
    }

    // 주소 연결 없으면 텔레그램/디바이스는 독립적으로 클레임 가능
    function test_TelegramAndDeviceClaimIndependentlyWhenUnlinked() public {
        uint256 spotId = _createDefaultSpot();  // cooldown=3600

        bytes32 telegramHash = keccak256("telegram1");
        bytes32 deviceHash = keccak256("device1");

        // 주소 연결 없이 — 별개 식별자이므로 독립
        tokamon.claimToTelegram(spotId, telegramHash);
        tokamon.claimByDevice(spotId, deviceHash);

        assertEq(tokamon.getTelegramBalance(telegramHash), 1 ether);
        assertEq(tokamon.getDeviceBalance(deviceHash), 1 ether);
    }

    // 같은 주소에 텔레그램+디바이스 연결 → 교차 쿨다운 적용
    function test_CrossCooldownWhenLinkedToSameWallet() public {
        uint256 spotId = _createDefaultSpot();  // cooldown=3600

        bytes32 telegramHash = keccak256("telegram1");
        bytes32 deviceHash = keccak256("device1");

        // 둘 다 user1에 연결
        tokamon.linkTelegramToWallet(telegramHash, user1);
        tokamon.linkDeviceToWallet(deviceHash, user1);

        // 텔레그램으로 클레임
        tokamon.claimToTelegram(spotId, telegramHash);

        // 같은 지갑에 연결된 디바이스로 클레임 시도 → 교차 쿨다운으로 차단
        vm.expectRevert(Tokamon.CooldownNotElapsed.selector);
        tokamon.claimByDevice(spotId, deviceHash);

        // 쿨다운 경과 후 디바이스 클레임 가능
        vm.warp(block.timestamp + 3601);
        tokamon.claimByDevice(spotId, deviceHash);

        assertEq(tokamon.getTelegramBalance(telegramHash), 1 ether);
        assertEq(tokamon.getDeviceBalance(deviceHash), 1 ether);
    }

    // 반대 방향: 디바이스 먼저 → 같은 지갑의 텔레그램 교차 쿨다운
    function test_CrossCooldownDeviceThenTelegram() public {
        uint256 spotId = _createDefaultSpot();  // cooldown=3600

        bytes32 telegramHash = keccak256("telegram1");
        bytes32 deviceHash = keccak256("device1");

        tokamon.linkTelegramToWallet(telegramHash, user1);
        tokamon.linkDeviceToWallet(deviceHash, user1);

        // 디바이스로 먼저 클레임
        tokamon.claimByDevice(spotId, deviceHash);

        // 같은 지갑의 텔레그램으로 클레임 시도 → 교차 쿨다운
        vm.expectRevert(Tokamon.CooldownNotElapsed.selector);
        tokamon.claimToTelegram(spotId, telegramHash);
    }

    // 다른 지갑에 연결된 경우 교차 쿨다운 없음
    function test_NoCrossCooldownWhenLinkedToDifferentWallets() public {
        uint256 spotId = _createDefaultSpot();  // cooldown=3600

        bytes32 telegramHash = keccak256("telegram1");
        bytes32 deviceHash = keccak256("device1");

        // 서로 다른 지갑에 연결
        tokamon.linkTelegramToWallet(telegramHash, user1);
        tokamon.linkDeviceToWallet(deviceHash, user2);

        // 텔레그램 클레임
        tokamon.claimToTelegram(spotId, telegramHash);

        // 다른 지갑의 디바이스 → 교차 쿨다운 없음, 클레임 가능
        tokamon.claimByDevice(spotId, deviceHash);

        assertEq(tokamon.getTelegramBalance(telegramHash), 1 ether);
        assertEq(tokamon.getDeviceBalance(deviceHash), 1 ether);
    }

    // ─── canClaimTelegram / canClaimDevice 테스트 ───

    function test_CanClaimTelegramBasic() public {
        uint256 spotId = _createDefaultSpot();
        bytes32 telegramHash = keccak256("telegram1");

        // 클레임 전 — 가능
        (bool claimable, uint256 rem) = tokamon.canClaimTelegram(spotId, telegramHash);
        assertTrue(claimable);
        assertEq(rem, 0);

        // 클레임 후 — 쿨다운 중
        tokamon.claimToTelegram(spotId, telegramHash);
        (claimable, rem) = tokamon.canClaimTelegram(spotId, telegramHash);
        assertFalse(claimable);
        assertGt(rem, 0);

        // 쿨다운 경과 후 — 다시 가능
        vm.warp(block.timestamp + 3601);
        (claimable, rem) = tokamon.canClaimTelegram(spotId, telegramHash);
        assertTrue(claimable);
        assertEq(rem, 0);
    }

    function test_CanClaimDeviceBasic() public {
        uint256 spotId = _createDefaultSpot();
        bytes32 deviceHash = keccak256("device1");

        (bool claimable, uint256 rem) = tokamon.canClaimDevice(spotId, deviceHash);
        assertTrue(claimable);
        assertEq(rem, 0);

        tokamon.claimByDevice(spotId, deviceHash);
        (claimable, rem) = tokamon.canClaimDevice(spotId, deviceHash);
        assertFalse(claimable);
        assertGt(rem, 0);
    }

    function test_CanClaimCrossCooldown() public {
        uint256 spotId = _createDefaultSpot();
        bytes32 telegramHash = keccak256("telegram1");
        bytes32 deviceHash = keccak256("device1");

        // 같은 지갑에 연결
        tokamon.linkTelegramToWallet(telegramHash, user1);
        tokamon.linkDeviceToWallet(deviceHash, user1);

        // 텔레그램으로 클레임
        tokamon.claimToTelegram(spotId, telegramHash);

        // canClaimDevice도 교차 쿨다운 반영 → 불가
        (bool claimable, uint256 rem) = tokamon.canClaimDevice(spotId, deviceHash);
        assertFalse(claimable);
        assertGt(rem, 0);

        // canClaimTelegram도 자체 쿨다운 → 불가
        (claimable, rem) = tokamon.canClaimTelegram(spotId, telegramHash);
        assertFalse(claimable);
    }

    function test_CanClaimWithExhaustedSpot() public {
        Tokamon.SpotMetadata memory meta = _defaultMeta();
        // 딱 1회 분량만 입금
        uint256 spotId = tokamon.createSpotSelf{value: 1 ether}(
            1 ether, 5, 2 ether, 0, true, meta
        );
        bytes32 deviceHash = keccak256("device1");

        // 1회 클레임 후 잔액 소진
        tokamon.claimByDevice(spotId, deviceHash);

        // 잔액 부족 → 불가
        (bool claimable,) = tokamon.canClaimDevice(spotId, deviceHash);
        assertFalse(claimable);
    }

    function test_CanClaimAllowDuplicates() public {
        Tokamon.SpotMetadata memory meta = _defaultMeta();
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 2 ether, 3600, true, meta  // allowDuplicateClaims=true
        );
        bytes32 telegramHash = keccak256("telegram1");

        tokamon.claimToTelegram(spotId, telegramHash);

        // 쿨다운 내에서는 불가
        (bool claimable, uint256 rem) = tokamon.canClaimTelegram(spotId, telegramHash);
        assertFalse(claimable);
        assertTrue(rem > 0);

        // 쿨다운 경과 후 다시 가능 (중복 허용)
        vm.warp(4000);
        (claimable, rem) = tokamon.canClaimTelegram(spotId, telegramHash);
        assertTrue(claimable);
        assertEq(rem, 0);
    }

    function test_CanClaimDisallowDuplicates() public {
        Tokamon.SpotMetadata memory meta = _defaultMeta();
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 2 ether, 3600, false, meta  // allowDuplicateClaims=false
        );
        bytes32 telegramHash = keccak256("telegram1");

        tokamon.claimToTelegram(spotId, telegramHash);

        // 쿨다운 경과해도 불가 (1인 1회)
        vm.warp(100000);
        (bool claimable,) = tokamon.canClaimTelegram(spotId, telegramHash);
        assertFalse(claimable);
    }

    // ─── 오픈 시간 컨트랙트 레벨 체크 테스트 ───

    function test_ClaimRevertBeforeStartDate() public {
        Tokamon.SpotMetadata memory meta = _timedMeta();  // startDate=1700000000
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 0, true, meta
        );

        // block.timestamp=1 → startDate 이전
        vm.expectRevert(Tokamon.OutsideActiveTime.selector);
        tokamon.claimToTelegram(spotId, keccak256("tg1"));
    }

    function test_ClaimRevertAfterEndDate() public {
        Tokamon.SpotMetadata memory meta = _timedMeta();  // endDate=1800000000
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 0, true, meta
        );

        vm.warp(1800000001);  // endDate 이후
        vm.expectRevert(Tokamon.OutsideActiveTime.selector);
        tokamon.claimByDevice(spotId, keccak256("d1"));
    }

    function test_ClaimRevertOutsideDailyHours() public {
        Tokamon.SpotMetadata memory meta = _timedMeta();  // 09:00~18:00 UTC+9
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 0, true, meta
        );

        // 07:00 KST (22:00 UTC 전날) → startDate 범위 내이지만 영업시간 외
        // 07:00 KST = minuteOfDay 420, 범위 [540, 1080) 밖
        // timestamp에서 로컬 07:00: localTime % 86400 = 420 * 60 = 25200
        // localTime = timestamp + 9*3600 = timestamp + 32400
        // timestamp + 32400 ≡ 25200 (mod 86400) → timestamp ≡ -7200 (mod 86400)
        // timestamp = 1700000000 + (86400 - 7200) = 1700079200
        vm.warp(1700079200);
        vm.expectRevert(Tokamon.OutsideActiveTime.selector);
        tokamon.claimToTelegram(spotId, keccak256("tg1"));
    }

    function test_ClaimSucceedsDuringDailyHours() public {
        Tokamon.SpotMetadata memory meta = _timedMeta();  // 09:00~18:00 UTC+9
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 0, true, meta
        );

        // 12:00 KST = minuteOfDay 720
        // localTime % 86400 = 720 * 60 = 43200
        // timestamp + 32400 ≡ 43200 (mod 86400) → timestamp ≡ 10800 (mod 86400)
        // timestamp = 1700000000 + 10800 = 1700010800
        vm.warp(1700010800);
        tokamon.claimToTelegram(spotId, keccak256("tg1"));

        assertEq(tokamon.getTelegramBalance(keccak256("tg1")), 1 ether);
    }

    function test_CanClaimReturnsFalseOutsideTime() public {
        Tokamon.SpotMetadata memory meta = _timedMeta();
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 0, true, meta
        );

        // startDate 이전
        (bool claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertFalse(claimable);

        // 영업시간 중
        vm.warp(1700010800);  // 12:00 KST
        (claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertTrue(claimable);
    }

    function test_ClaimNightShiftHours() public {
        // 야간 영업 22:00~06:00 UTC+9
        Tokamon.SpotMetadata memory meta = Tokamon.SpotMetadata({
            name: "Night", description: "",
            lat: 0, lng: 0,
            startDate: 1700000000, endDate: 1800000000,
            dailyStartTime: 1320, dailyEndTime: 360, utcOffset: 9
        });
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 0, true, meta
        );

        // (1700000000 + 32400) % 86400 = 1700032400 % 86400 = 26000
        // 23:00 KST = 1380분 = 82800초 → X = 82800 - 26000 = 56800
        vm.warp(1700056800);  // 23:00 KST
        tokamon.claimByDevice(spotId, keccak256("d1"));
        assertEq(tokamon.getDeviceBalance(keccak256("d1")), 1 ether);

        // 03:00 KST = 180분 = 10800초 → X = 10800 - 26000 + 86400 = 71200
        vm.warp(1700071200);  // 03:00 KST
        tokamon.claimByDevice(spotId, keccak256("d2"));
        assertEq(tokamon.getDeviceBalance(keccak256("d2")), 1 ether);

        // 10:00 KST = 600분 = 36000초 → X = 36000 - 26000 = 10000
        vm.warp(1700010000);  // 10:00 KST — 범위 밖
        vm.expectRevert(Tokamon.OutsideActiveTime.selector);
        tokamon.claimByDevice(spotId, keccak256("d3"));
    }

    // 서로 다른 텔레그램 해시는 독립적 쿨다운
    function test_DifferentTelegramHashesIndependentCooldown() public {
        uint256 spotId = _createDefaultSpot();

        bytes32 tg1 = keccak256("telegram1");
        bytes32 tg2 = keccak256("telegram2");

        tokamon.claimToTelegram(spotId, tg1);
        // tg1은 쿨다운 중이지만 tg2는 독립적
        tokamon.claimToTelegram(spotId, tg2);

        assertEq(tokamon.getTelegramBalance(tg1), 1 ether);
        assertEq(tokamon.getTelegramBalance(tg2), 1 ether);
    }

    // 서로 다른 디바이스 해시는 독립적 쿨다운
    function test_DifferentDeviceHashesIndependentCooldown() public {
        uint256 spotId = _createDefaultSpot();

        bytes32 d1 = keccak256("device1");
        bytes32 d2 = keccak256("device2");

        tokamon.claimByDevice(spotId, d1);
        // d1은 쿨다운 중이지만 d2는 독립적
        tokamon.claimByDevice(spotId, d2);

        assertEq(tokamon.getDeviceBalance(d1), 1 ether);
        assertEq(tokamon.getDeviceBalance(d2), 1 ether);
    }

    // 쿨다운 경계값: 정확히 쿨다운 시간에 클레임 가능
    function test_CooldownExactBoundary() public {
        uint256 spotId = _createDefaultSpot();  // cooldown=3600

        bytes32 deviceHash = keccak256("device1");

        tokamon.claimByDevice(spotId, deviceHash);

        // 정확히 3600초 후 — 경계값
        vm.warp(block.timestamp + 3600);
        // cooldown 체크: block.timestamp < last + cooldown → 3600 < 0 + 3600 → false → 통과
        // 단, last > 0이고 block.timestamp == last + cooldown이면 조건 불충족 → 클레임 가능
        tokamon.claimByDevice(spotId, deviceHash);

        assertEq(tokamon.getDeviceBalance(deviceHash), 2 ether);
    }

    // 쿨다운 1초 전: 아직 쿨다운 중
    function test_CooldownOneSecondBefore() public {
        uint256 spotId = _createDefaultSpot();  // cooldown=3600

        bytes32 deviceHash = keccak256("device1");

        tokamon.claimByDevice(spotId, deviceHash);

        // 3599초 후 — 아직 쿨다운 중
        vm.warp(block.timestamp + 3599);
        vm.expectRevert(Tokamon.CooldownNotElapsed.selector);
        tokamon.claimByDevice(spotId, deviceHash);
    }

    // 쿨다운=0이면 allowDuplicateClaims=false여도 연속 클레임 가능
    function test_ZeroCooldownAllowsConsecutiveClaims() public {
        Tokamon.SpotMetadata memory meta = _defaultMeta();
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 2 ether, 0, true, meta  // cooldown=0, allowDuplicateClaims=true
        );

        bytes32 deviceHash = keccak256("device1");

        // cooldown=0 + 중복허용 → 연속 클레임 가능
        tokamon.claimByDevice(spotId, deviceHash);
        tokamon.claimByDevice(spotId, deviceHash);

        assertEq(tokamon.getDeviceBalance(deviceHash), 2 ether);
    }

    // 여러 스팟에서 같은 해시의 쿨다운이 독립적
    function test_CooldownPerSpot() public {
        uint256 spotA = _createDefaultSpot();
        uint256 spotB = _createDefaultSpot();

        bytes32 deviceHash = keccak256("device1");

        // 스팟 A에서 클레임
        tokamon.claimByDevice(spotA, deviceHash);

        // 스팟 B에서 클레임 — 스팟 A의 쿨다운과 무관
        tokamon.claimByDevice(spotB, deviceHash);

        assertEq(tokamon.getDeviceBalance(deviceHash), 2 ether);

        // 스팟 A는 아직 쿨다운 중
        vm.expectRevert(Tokamon.CooldownNotElapsed.selector);
        tokamon.claimByDevice(spotA, deviceHash);
    }

    // 스팟 잔액 소진 시 SpotExhausted 에러
    function test_SpotExhaustedDuringClaim() public {
        Tokamon.SpotMetadata memory meta = _defaultMeta();
        // 정확히 2 ether만 넣어서 2번만 클레임 가능
        uint256 spotId = tokamon.createSpotSelf{value: 2 ether}(
            1 ether, 5, 2 ether, 0, true, meta
        );

        bytes32 deviceHash = keccak256("device1");

        tokamon.claimByDevice(spotId, deviceHash);
        tokamon.claimByDevice(spotId, deviceHash);

        // 3번째 클레임 — 잔액 부족
        vm.expectRevert(Tokamon.SpotExhausted.selector);
        tokamon.claimByDevice(spotId, deviceHash);
    }

    // 스탬프 보너스 지급 시 잔액 부족하면 보너스 없이 일반 리워드만 지급
    function test_StampBonusFallbackWhenInsufficientBalance() public {
        Tokamon.SpotMetadata memory meta = _defaultMeta();
        // stampGoal=2, stampBonus=5 ether, reward=1 ether
        // 잔액 3 ether: 1차(1 ether)+2차(1+5=6, 잔액 부족) → 보너스 스킵, 1 ether만 지급
        uint256 spotId = tokamon.createSpotSelf{value: 3 ether}(
            1 ether, 2, 5 ether, 0, true, meta
        );

        bytes32 deviceHash = keccak256("device1");

        // 1차 클레임: stamp=1, payout=1 ether
        tokamon.claimByDevice(spotId, deviceHash);
        assertEq(tokamon.getDeviceBalance(deviceHash), 1 ether);

        // 2차 클레임: stamp=2 (==stampGoal), 보너스 포함 6 ether 필요하지만 잔액 2 ether
        // → 보너스 스킵, reward만 1 ether 지급, stamp 리셋 안 됨
        tokamon.claimByDevice(spotId, deviceHash);
        assertEq(tokamon.getDeviceBalance(deviceHash), 2 ether);

        Tokamon.Spot memory spot = tokamon.getSpot(spotId);
        assertEq(spot.remaining, 1 ether);
    }

    // 쿨다운 변경 후 즉시 반영
    function test_CooldownChangeAffectsExistingClaims() public {
        uint256 spotId = _createDefaultSpot();  // cooldown=3600

        bytes32 deviceHash = keccak256("device1");

        tokamon.claimByDevice(spotId, deviceHash);

        // 1800초 후 (쿨다운 절반)
        vm.warp(block.timestamp + 1800);

        // 아직 쿨다운 중
        vm.expectRevert(Tokamon.CooldownNotElapsed.selector);
        tokamon.claimByDevice(spotId, deviceHash);

        // 쿨다운을 1800초로 단축
        tokamon.updateCooldown(spotId, 1800);

        // 이제 클레임 가능 (1800초 경과 >= 새 쿨다운 1800초)
        tokamon.claimByDevice(spotId, deviceHash);
        assertEq(tokamon.getDeviceBalance(deviceHash), 2 ether);
    }

    // getClaimInfo로 쿨다운 잔여시간 확인
    function test_GetClaimInfoCooldownRemaining() public {
        uint256 spotId = _createDefaultSpot();  // cooldown=3600

        bytes32 deviceHash = keccak256("device1");

        // 클레임 전 — lastClaim=0, remaining=0
        (uint256 stamps, uint256 goal, uint256 lastClaim, uint256 cooldownRemaining)
            = tokamon.getClaimInfo(spotId, deviceHash);
        assertEq(stamps, 0);
        assertEq(goal, 5);
        assertEq(lastClaim, 0);
        assertEq(cooldownRemaining, 0);

        // 고정 타임스탬프에서 클레임
        vm.warp(10000);
        tokamon.claimByDevice(spotId, deviceHash);

        // 클레임 직후 — remaining=3600
        (stamps, goal, lastClaim, cooldownRemaining) = tokamon.getClaimInfo(spotId, deviceHash);
        assertEq(stamps, 1);
        assertEq(lastClaim, 10000);
        assertEq(cooldownRemaining, 3600);

        // 1000초 경과
        vm.warp(11000);
        (stamps, goal, lastClaim, cooldownRemaining) = tokamon.getClaimInfo(spotId, deviceHash);
        assertEq(cooldownRemaining, 2600);

        // 쿨다운 완료
        vm.warp(13600);
        (stamps, goal, lastClaim, cooldownRemaining) = tokamon.getClaimInfo(spotId, deviceHash);
        assertEq(cooldownRemaining, 0);
    }

    // getStampInfo: 텔레그램 링크 우선, 디바이스 보조
    function test_GetStampInfoTelegramPriority() public {
        Tokamon.SpotMetadata memory meta = _defaultMeta();
        uint256 spotId = tokamon.createSpotSelf{value: 20 ether}(
            1 ether, 5, 2 ether, 0, true, meta
        );

        bytes32 telegramHash = keccak256("telegram1");
        bytes32 deviceHash = keccak256("device1");

        // 텔레그램으로 3회 클레임
        tokamon.claimToTelegram(spotId, telegramHash);
        tokamon.claimToTelegram(spotId, telegramHash);
        tokamon.claimToTelegram(spotId, telegramHash);

        // 디바이스로 1회 클레임
        tokamon.claimByDevice(spotId, deviceHash);

        // user1에 텔레그램+디바이스 모두 링크
        tokamon.linkTelegramToWallet(telegramHash, user1);
        tokamon.linkDeviceToWallet(deviceHash, user1);

        // getStampInfo는 텔레그램을 우선 확인 → stamp=3
        (uint256 stamps,,,) = tokamon.getStampInfo(spotId, user1);
        assertEq(stamps, 3);
    }

    // getStampInfo: 링크 없으면 stamp=0 반환
    function test_GetStampInfoNoLink() public {
        uint256 spotId = _createDefaultSpot();

        (uint256 stamps, uint256 goal, uint256 lastClaim, uint256 cooldownRemaining)
            = tokamon.getStampInfo(spotId, user1);
        assertEq(stamps, 0);
        assertEq(goal, 5);
        assertEq(lastClaim, 0);
        assertEq(cooldownRemaining, 0);
    }

    // ─── Redeposit 후 새 필드 유지 ───

    function test_RedepositPreservesNewFields() public {
        Tokamon.SpotMetadata memory meta = _timedMeta();
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 2 ether, 3600, false, meta
        );

        tokamon.redepositSelf{value: 5 ether}(spotId);

        Tokamon.Spot memory spot = tokamon.getSpot(spotId);
        assertEq(spot.remaining, 15 ether);
        // 새 필드들이 변경되지 않았는지 확인
        assertEq(spot.dailyStartTime, 540);
        assertEq(spot.dailyEndTime, 1080);
        assertEq(spot.utcOffset, 9);
        assertEq(spot.startDate, 1700000000);
        assertEq(spot.endDate, 1800000000);
    }

    // ═══════════════════════════════════════════════════════
    // 시나리오별 통합 테스트 — 누락 커버리지 보강
    // ═══════════════════════════════════════════════════════

    // ─── 출금: claimTelegramToWallet ───

    function test_ClaimTelegramToWallet() public {
        uint256 spotId = _createDefaultSpot();
        bytes32 telegramHash = keccak256("telegram1");

        tokamon.claimToTelegram(spotId, telegramHash);
        assertEq(tokamon.getTelegramBalance(telegramHash), 1 ether);

        // 텔레그램을 user1에 링크
        tokamon.linkTelegramToWallet(telegramHash, user1);

        uint256 balBefore = user1.balance;

        // user1이 출금
        vm.prank(user1);
        tokamon.claimTelegramToWallet(telegramHash);

        assertEq(user1.balance, balBefore + 1 ether);
        assertEq(tokamon.getTelegramBalance(telegramHash), 0);
    }

    function test_ClaimTelegramToWalletRevertNoLink() public {
        vm.prank(user1);
        vm.expectRevert(Tokamon.NoTelegramLinked.selector);
        tokamon.claimTelegramToWallet(keccak256("unlinked"));
    }

    function test_ClaimTelegramToWalletRevertHashMismatch() public {
        bytes32 tg1 = keccak256("telegram1");
        bytes32 tg2 = keccak256("telegram2");

        tokamon.linkTelegramToWallet(tg1, user1);

        // user1은 tg1에 연결되어 있는데 tg2로 출금 시도
        vm.prank(user1);
        vm.expectRevert(Tokamon.HashMismatch.selector);
        tokamon.claimTelegramToWallet(tg2);
    }

    function test_ClaimTelegramToWalletRevertNoBalance() public {
        bytes32 telegramHash = keccak256("telegram1");
        tokamon.linkTelegramToWallet(telegramHash, user1);

        // 잔액 0인 상태에서 출금 시도
        vm.prank(user1);
        vm.expectRevert(Tokamon.NoBalance.selector);
        tokamon.claimTelegramToWallet(telegramHash);
    }

    // ─── 출금: claimDeviceToWallet ───

    function test_ClaimDeviceToWallet() public {
        uint256 spotId = _createDefaultSpot();
        bytes32 deviceHash = keccak256("device1");

        tokamon.claimByDevice(spotId, deviceHash);
        assertEq(tokamon.getDeviceBalance(deviceHash), 1 ether);

        tokamon.linkDeviceToWallet(deviceHash, user1);

        uint256 balBefore = user1.balance;

        vm.prank(user1);
        tokamon.claimDeviceToWallet(deviceHash);

        assertEq(user1.balance, balBefore + 1 ether);
        assertEq(tokamon.getDeviceBalance(deviceHash), 0);
    }

    function test_ClaimDeviceToWalletRevertNoLink() public {
        vm.prank(user1);
        vm.expectRevert(Tokamon.NoDeviceLinked.selector);
        tokamon.claimDeviceToWallet(keccak256("unlinked"));
    }

    function test_ClaimDeviceToWalletRevertNoBalance() public {
        bytes32 deviceHash = keccak256("device1");
        tokamon.linkDeviceToWallet(deviceHash, user1);

        vm.prank(user1);
        vm.expectRevert(Tokamon.NoBalance.selector);
        tokamon.claimDeviceToWallet(deviceHash);
    }

    // ─── 링크/언링크 ───

    function test_LinkTelegramToWalletAndQuery() public {
        bytes32 telegramHash = keccak256("telegram1");

        tokamon.linkTelegramToWallet(telegramHash, user1);

        assertEq(tokamon.getTelegramLinkedWallet(telegramHash), user1);
        assertEq(tokamon.getWalletLinkedTelegram(user1), telegramHash);
    }

    function test_LinkTelegramRevertZeroAddress() public {
        vm.expectRevert(Tokamon.ZeroAddress.selector);
        tokamon.linkTelegramToWallet(keccak256("tg"), address(0));
    }

    function test_LinkTelegramRevertZeroHash() public {
        vm.expectRevert(Tokamon.InvalidInput.selector);
        tokamon.linkTelegramToWallet(bytes32(0), user1);
    }

    function test_LinkTelegramRevertWalletAlreadyLinked() public {
        bytes32 tg1 = keccak256("telegram1");
        bytes32 tg2 = keccak256("telegram2");

        tokamon.linkTelegramToWallet(tg1, user1);

        // user1에 다른 텔레그램을 또 연결 시도
        vm.expectRevert(Tokamon.WalletAlreadyLinked.selector);
        tokamon.linkTelegramToWallet(tg2, user1);
    }

    function test_LinkTelegramRelink() public {
        bytes32 telegramHash = keccak256("telegram1");

        // 처음 user1에 연결
        tokamon.linkTelegramToWallet(telegramHash, user1);
        assertEq(tokamon.getTelegramLinkedWallet(telegramHash), user1);

        // 같은 텔레그램을 user2로 재연결
        tokamon.linkTelegramToWallet(telegramHash, user2);
        assertEq(tokamon.getTelegramLinkedWallet(telegramHash), user2);

        // user1은 더 이상 연결 안 됨
        assertEq(tokamon.getWalletLinkedTelegram(user1), bytes32(0));
        assertEq(tokamon.getWalletLinkedTelegram(user2), telegramHash);
    }

    function test_UnlinkTelegram() public {
        bytes32 telegramHash = keccak256("telegram1");
        tokamon.linkTelegramToWallet(telegramHash, user1);

        vm.prank(user1);
        tokamon.unlinkTelegram();

        assertEq(tokamon.getTelegramLinkedWallet(telegramHash), address(0));
        assertEq(tokamon.getWalletLinkedTelegram(user1), bytes32(0));
    }

    function test_UnlinkTelegramRevertNoLink() public {
        vm.prank(user1);
        vm.expectRevert(Tokamon.NoTelegramLinked.selector);
        tokamon.unlinkTelegram();
    }

    function test_LinkDeviceToWalletAndQuery() public {
        bytes32 deviceHash = keccak256("device1");

        tokamon.linkDeviceToWallet(deviceHash, user1);

        assertEq(tokamon.getDeviceLinkedWallet(deviceHash), user1);
        assertEq(tokamon.getWalletLinkedDevice(user1), deviceHash);
    }

    function test_LinkDeviceRevertZeroAddress() public {
        vm.expectRevert(Tokamon.ZeroAddress.selector);
        tokamon.linkDeviceToWallet(keccak256("d"), address(0));
    }

    function test_LinkDeviceRevertZeroHash() public {
        vm.expectRevert(Tokamon.InvalidInput.selector);
        tokamon.linkDeviceToWallet(bytes32(0), user1);
    }

    function test_LinkDeviceRevertAlreadyLinked() public {
        bytes32 d1 = keccak256("device1");
        bytes32 d2 = keccak256("device2");

        tokamon.linkDeviceToWallet(d1, user1);

        vm.expectRevert(Tokamon.DeviceAlreadyLinked.selector);
        tokamon.linkDeviceToWallet(d2, user1);
    }

    function test_UnlinkDevice() public {
        bytes32 deviceHash = keccak256("device1");
        tokamon.linkDeviceToWallet(deviceHash, user1);

        vm.prank(user1);
        tokamon.unlinkDevice();

        assertEq(tokamon.getDeviceLinkedWallet(deviceHash), address(0));
        assertEq(tokamon.getWalletLinkedDevice(user1), bytes32(0));
    }

    function test_UnlinkDeviceRevertNoLink() public {
        vm.prank(user1);
        vm.expectRevert(Tokamon.NoDeviceLinked.selector);
        tokamon.unlinkDevice();
    }

    // ─── 접근 제어 ───

    function test_ClaimByDeviceRevertNotClaimManager() public {
        uint256 spotId = _createDefaultSpot();

        vm.prank(user1);
        vm.expectRevert(Tokamon.OnlyClaimManager.selector);
        tokamon.claimByDevice(spotId, keccak256("d1"));
    }

    function test_LinkTelegramRevertNotClaimManager() public {
        vm.prank(user1);
        vm.expectRevert(Tokamon.OnlyClaimManager.selector);
        tokamon.linkTelegramToWallet(keccak256("tg"), user2);
    }

    function test_LinkDeviceRevertNotClaimManager() public {
        vm.prank(user1);
        vm.expectRevert(Tokamon.OnlyClaimManager.selector);
        tokamon.linkDeviceToWallet(keccak256("d"), user2);
    }

    function test_ClaimToTelegramRevertNotCreator() public {
        uint256 spotId = _createDefaultSpot();

        vm.prank(user1);
        vm.expectRevert(Tokamon.NotSpotCreator.selector);
        tokamon.claimToTelegram(spotId, keccak256("tg1"));
    }

    function test_ClaimToTelegramRevertSpotNotFound() public {
        vm.expectRevert(Tokamon.SpotNotFound.selector);
        tokamon.claimToTelegram(999, keccak256("tg1"));
    }

    function test_ClaimByDeviceRevertSpotNotFound() public {
        vm.expectRevert(Tokamon.SpotNotFound.selector);
        tokamon.claimByDevice(999, keccak256("d1"));
    }

    // ─── 어드민 관리 ───

    function test_SetAdminAndAccept() public {
        tokamon.setAdmin(user1);
        assertEq(tokamon.pendingAdmin(), user1);

        vm.prank(user1);
        tokamon.acceptAdmin();
        assertEq(tokamon.admin(), user1);
        assertEq(tokamon.pendingAdmin(), address(0));
    }

    function test_SetAdminRevertNotAdmin() public {
        vm.prank(user1);
        vm.expectRevert(Tokamon.OnlyAdmin.selector);
        tokamon.setAdmin(user2);
    }

    function test_SetAdminRevertZeroAddress() public {
        vm.expectRevert(Tokamon.ZeroAddress.selector);
        tokamon.setAdmin(address(0));
    }

    function test_AcceptAdminRevertNotPending() public {
        tokamon.setAdmin(user1);

        vm.prank(user2);
        vm.expectRevert(Tokamon.NotPendingAdmin.selector);
        tokamon.acceptAdmin();
    }

    function test_SetClaimManager() public {
        tokamon.setClaimManager(user1);
        assertEq(tokamon.claimManager(), user1);
    }

    function test_SetClaimManagerRevertNotAdmin() public {
        vm.prank(user1);
        vm.expectRevert(Tokamon.OnlyAdmin.selector);
        tokamon.setClaimManager(user2);
    }

    function test_SetClaimManagerRevertZeroAddress() public {
        vm.expectRevert(Tokamon.ZeroAddress.selector);
        tokamon.setClaimManager(address(0));
    }

    // ─── 기타 에러 경로 ───

    function test_RedepositRevertZeroValue() public {
        uint256 spotId = _createDefaultSpot();

        vm.expectRevert(Tokamon.InvalidInput.selector);
        tokamon.redepositSelf{value: 0}(spotId);
    }

    function test_RedepositRevertSpotNotFound() public {
        vm.expectRevert(Tokamon.SpotNotFound.selector);
        tokamon.redepositSelf{value: 1 ether}(999);
    }

    function test_CreateSpotRevertDepositLessThanReward() public {
        vm.expectRevert(Tokamon.InvalidInput.selector);
        tokamon.createSpotSelf{value: 0.5 ether}(1 ether, 5, 1 ether, 0, false, _defaultMeta());
    }

    function test_UpdateAllowDuplicateClaims() public {
        uint256 spotId = _createDefaultSpot();  // allowDuplicateClaims=true

        Tokamon.Spot memory s = tokamon.getSpot(spotId);
        assertEq(s.allowDuplicateClaims, true);

        tokamon.updateAllowDuplicateClaims(spotId, false);

        s = tokamon.getSpot(spotId);
        assertEq(s.allowDuplicateClaims, false);
    }

    function test_UpdateAllowDuplicateClaimsRevertNotCreator() public {
        uint256 spotId = _createDefaultSpot();

        vm.prank(user1);
        vm.expectRevert(Tokamon.NotSpotCreator.selector);
        tokamon.updateAllowDuplicateClaims(spotId, true);
    }

    function test_UpdateCooldownRevertNotCreator() public {
        uint256 spotId = _createDefaultSpot();

        vm.prank(user1);
        vm.expectRevert(Tokamon.NotSpotCreator.selector);
        tokamon.updateCooldown(spotId, 7200);
    }

    // ─── 전체 시나리오: 텔레그램 사용자 라이프사이클 ───

    function test_FullTelegramLifecycle() public {
        // 1. 스팟 생성
        uint256 spotId = _createDefaultSpot();

        bytes32 telegramHash = keccak256("telegram_user");

        // 2. 클레임 5회 → 스탬프 보너스 도달 (stampGoal=5, stampBonus=2 ether)
        tokamon.claimToTelegram(spotId, telegramHash);    // t=1
        vm.warp(4000);
        tokamon.claimToTelegram(spotId, telegramHash);    // t=4000
        vm.warp(8000);
        tokamon.claimToTelegram(spotId, telegramHash);    // t=8000
        vm.warp(12000);
        tokamon.claimToTelegram(spotId, telegramHash);    // t=12000
        vm.warp(16000);
        tokamon.claimToTelegram(spotId, telegramHash);    // t=16000, 5회째 → 보너스

        // 잔액: 4 * 1 ether + (1 + 2) ether = 7 ether
        assertEq(tokamon.getTelegramBalance(telegramHash), 7 ether);

        // 3. 지갑 연결
        tokamon.linkTelegramToWallet(telegramHash, user1);

        // 4. 출금
        uint256 balBefore = user1.balance;
        vm.prank(user1);
        tokamon.claimTelegramToWallet(telegramHash);
        assertEq(user1.balance, balBefore + 7 ether);

        // 5. 재클레임 후 출금
        vm.warp(20000);
        tokamon.claimToTelegram(spotId, telegramHash);  // stamp 리셋 후 1회

        vm.prank(user1);
        tokamon.claimTelegramToWallet(telegramHash);
        assertEq(user1.balance, balBefore + 8 ether);
    }

    // ─── 전체 시나리오: 디바이스 사용자 라이프사이클 ───

    function test_FullDeviceLifecycle() public {
        uint256 spotId = _createDefaultSpot();
        bytes32 deviceHash = keccak256("device_user");

        // 1. 클레임
        tokamon.claimByDevice(spotId, deviceHash);
        assertEq(tokamon.getDeviceBalance(deviceHash), 1 ether);

        // 2. 지갑 연결
        tokamon.linkDeviceToWallet(deviceHash, user1);

        // 3. 출금
        uint256 balBefore = user1.balance;
        vm.prank(user1);
        tokamon.claimDeviceToWallet(deviceHash);
        assertEq(user1.balance, balBefore + 1 ether);

        // 4. 링크 해제
        vm.prank(user1);
        tokamon.unlinkDevice();
        assertEq(tokamon.getDeviceLinkedWallet(deviceHash), address(0));

        // 5. 재연결 후 출금
        vm.warp(4000);
        tokamon.claimByDevice(spotId, deviceHash);
        tokamon.linkDeviceToWallet(deviceHash, user2);

        vm.prank(user2);
        tokamon.claimDeviceToWallet(deviceHash);
        assertEq(user2.balance - 100 ether, 1 ether);
    }

    // ─── 전체 시나리오: 교차 쿨다운 + 출금 ───

    function test_CrossCooldownFullScenario() public {
        uint256 spotId = _createDefaultSpot();

        bytes32 telegramHash = keccak256("telegram1");
        bytes32 deviceHash = keccak256("device1");

        // 텔레그램+디바이스를 같은 지갑에 연결
        tokamon.linkTelegramToWallet(telegramHash, user1);
        tokamon.linkDeviceToWallet(deviceHash, user1);

        // 텔레그램으로 클레임
        tokamon.claimToTelegram(spotId, telegramHash);

        // 같은 지갑의 디바이스로 클레임 불가 (교차 쿨다운)
        vm.expectRevert(Tokamon.CooldownNotElapsed.selector);
        tokamon.claimByDevice(spotId, deviceHash);

        // canClaimDevice도 false
        (bool claimable,) = tokamon.canClaimDevice(spotId, deviceHash);
        assertFalse(claimable);

        // 쿨다운 경과
        vm.warp(block.timestamp + 3601);

        // 이제 디바이스 클레임 가능
        tokamon.claimByDevice(spotId, deviceHash);

        // 텔레그램 잔액 출금
        vm.prank(user1);
        tokamon.claimTelegramToWallet(telegramHash);

        // 디바이스 잔액 출금
        vm.prank(user1);
        tokamon.claimDeviceToWallet(deviceHash);

        // user1 잔액 = 초기 100 + 텔레그램 1 + 디바이스 1
        assertEq(user1.balance, 102 ether);
    }

    // ═══════════════════════════════════════════════════════
    // 타임존별 날짜/시간 + 중복발행 + 쿨타임 종합 테스트
    // ═══════════════════════════════════════════════════════

    // ─── 헬퍼: 타임존별 메타 생성 ───

    function _kstMeta(uint64 startDate, uint64 endDate, uint16 dailyStart, uint16 dailyEnd)
        internal pure returns (Tokamon.SpotMetadata memory)
    {
        return Tokamon.SpotMetadata({
            name: "KST Spot", description: "UTC+9",
            lat: 37_566535, lng: 126_977969,
            startDate: startDate, endDate: endDate,
            dailyStartTime: dailyStart, dailyEndTime: dailyEnd,
            utcOffset: 9
        });
    }

    function _estMeta(uint64 startDate, uint64 endDate, uint16 dailyStart, uint16 dailyEnd)
        internal pure returns (Tokamon.SpotMetadata memory)
    {
        return Tokamon.SpotMetadata({
            name: "EST Spot", description: "UTC-5",
            lat: 40_712776, lng: -74_005974,
            startDate: startDate, endDate: endDate,
            dailyStartTime: dailyStart, dailyEndTime: dailyEnd,
            utcOffset: -5
        });
    }

    function _utcMeta(uint64 startDate, uint64 endDate, uint16 dailyStart, uint16 dailyEnd)
        internal pure returns (Tokamon.SpotMetadata memory)
    {
        return Tokamon.SpotMetadata({
            name: "UTC Spot", description: "UTC+0",
            lat: 51_507351, lng: -127_755,
            startDate: startDate, endDate: endDate,
            dailyStartTime: dailyStart, dailyEndTime: dailyEnd,
            utcOffset: 0
        });
    }

    // 헬퍼: 특정 로컬 시각의 UTC 타임스탬프 계산
    // localMinuteOfDay: 해당 날의 분 (예: 540 = 09:00)
    // utcOffset: 시간 단위 (예: 9 = UTC+9)
    // baseDayUtcMidnight: 해당 날의 UTC 자정 타임스탬프
    function _localTimeToUtc(uint256 baseDayUtcMidnight, uint16 localMinuteOfDay, int8 utcOffset)
        internal pure returns (uint256)
    {
        int256 utcSeconds = int256(baseDayUtcMidnight)
            + int256(uint256(localMinuteOfDay)) * 60
            - int256(utcOffset) * 3600;
        return uint256(utcSeconds);
    }

    // ─── UTC+9 (KST) 날짜 경계 테스트 ───
    // startDate/endDate는 UTC 정규화 값 (클라이언트에서 'Z' 접미사로 생성)
    // 컨트랙트가 localTime = block.timestamp + utcOffset*3600 으로 비교

    function test_KST_DateBoundaryStartExact() public {
        // startDate = Feb 18 00:00 UTC (UTC 정규화)
        // 컨트랙트: localTime = block.timestamp + 9*3600 >= startDate?
        uint64 startDate = 1771372800; // Feb 18 00:00 UTC (UTC 정규화)
        uint64 endDate = 1774051199;   // Mar 20 23:59:59 UTC (UTC 정규화)
        Tokamon.SpotMetadata memory meta = _kstMeta(startDate, endDate, 0, 0);
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, true, meta);

        // Feb 18 00:00 KST = Feb 17 15:00 UTC
        // localTime = 1771340400 + 32400 = 1771372800 >= 1771372800 → active
        vm.warp(1771340400);
        (bool claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertTrue(claimable, "Feb 18 00:00 KST should be active");

        // Feb 17 23:59:59 KST = Feb 17 14:59:59 UTC
        // localTime = 1771340399 + 32400 = 1771372799 < 1771372800 → inactive
        vm.warp(1771340399);
        (claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertFalse(claimable, "Feb 17 23:59:59 KST should be inactive");
    }

    function test_KST_DateBoundaryEndExact() public {
        uint64 startDate = 1771372800; // Feb 18 00:00 UTC (UTC 정규화)
        uint64 endDate = 1774051199;   // Mar 20 23:59:59 UTC (UTC 정규화)
        Tokamon.SpotMetadata memory meta = _kstMeta(startDate, endDate, 0, 0);
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, true, meta);

        // Mar 20 23:59:59 KST = Mar 20 14:59:59 UTC
        // localTime = 1774018799 + 32400 = 1774051199 <= 1774051199 → active
        vm.warp(1774018799);
        (bool claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertTrue(claimable, "Mar 20 23:59:59 KST should be active");

        // Mar 21 00:00:00 KST = Mar 20 15:00:00 UTC
        // localTime = 1774018800 + 32400 = 1774051200 > 1774051199 → inactive
        vm.warp(1774018800);
        (claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertFalse(claimable, "Mar 21 00:00:00 KST should be inactive");
    }

    // ─── UTC-5 (EST) 날짜 경계 테스트 ───

    function test_EST_DateBoundaryStart() public {
        // 같은 UTC 정규화 값 — 타임존 다르면 실제 활성화 시점이 달라짐
        uint64 startDate = 1771372800; // Feb 18 00:00 UTC (UTC 정규화)
        uint64 endDate = 1774051199;   // Mar 20 23:59:59 UTC (UTC 정규화)
        Tokamon.SpotMetadata memory meta = _estMeta(startDate, endDate, 0, 0);
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, true, meta);

        // Feb 17 23:59:59 EST = Feb 18 04:59:59 UTC
        // localTime = 1771390799 - 18000 = 1771372799 < 1771372800 → inactive
        vm.warp(1771390799);
        (bool claimable,) = tokamon.canClaimDevice(spotId, keccak256("d1"));
        assertFalse(claimable, "Feb 17 23:59:59 EST should be inactive");

        // Feb 18 00:00:00 EST = Feb 18 05:00:00 UTC
        // localTime = 1771390800 - 18000 = 1771372800 >= 1771372800 → active
        vm.warp(1771390800);
        (claimable,) = tokamon.canClaimDevice(spotId, keccak256("d1"));
        assertTrue(claimable, "Feb 18 00:00 EST should be active");
    }

    // ─── 일별 영업시간 + 타임존 종합 테스트 ───

    function test_KST_DailyTimeWithDateRange() public {
        // KST 09:05~09:11, 날짜 Feb 18~Mar 20
        uint64 startDate = 1771372800; // Feb 18 00:00 UTC (UTC 정규화)
        uint64 endDate = 1774051199;   // Mar 20 23:59:59 UTC (UTC 정규화)
        uint16 dailyStart = 545;       // 09:05
        uint16 dailyEnd = 551;         // 09:11

        Tokamon.SpotMetadata memory meta = _kstMeta(startDate, endDate, dailyStart, dailyEnd);
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, true, meta);

        // 09:05 KST on Feb 18 = 00:05 UTC on Feb 18
        uint256 feb18_utcMidnight = 1771372800;

        // 09:05 KST = 00:05 UTC → within [545, 551)
        vm.warp(feb18_utcMidnight + 5 * 60); // 00:05 UTC
        (bool claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertTrue(claimable, "09:05 KST should be active");

        // 09:07 KST = 00:07 UTC
        vm.warp(feb18_utcMidnight + 7 * 60);
        (claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertTrue(claimable, "09:07 KST should be active");

        // 09:10 KST = 00:10 UTC (last active minute, < 551)
        vm.warp(feb18_utcMidnight + 10 * 60);
        (claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertTrue(claimable, "09:10 KST should be active");

        // 09:11 KST = 00:11 UTC (minuteOfDay=551 >= 551 → false for <551)
        vm.warp(feb18_utcMidnight + 11 * 60);
        (claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertFalse(claimable, "09:11 KST should be inactive (daily end)");

        // 09:04 KST = 00:04 UTC (minuteOfDay=544 < 545 → false)
        vm.warp(feb18_utcMidnight + 4 * 60);
        (claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertFalse(claimable, "09:04 KST should be inactive (before daily start)");
    }

    function test_EST_DailyTimeWithDateRange() public {
        // EST 09:00~18:00 (UTC-5)
        uint64 startDate = 1771372800; // Feb 18 00:00 UTC (UTC 정규화)
        uint64 endDate = 1774051199;   // Mar 20 23:59:59 UTC (UTC 정규화)
        uint16 dailyStart = 540;       // 09:00
        uint16 dailyEnd = 1080;        // 18:00

        Tokamon.SpotMetadata memory meta = _estMeta(startDate, endDate, dailyStart, dailyEnd);
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, true, meta);

        uint256 feb18_utcMidnight = 1771372800;

        // 09:00 EST = 14:00 UTC
        vm.warp(feb18_utcMidnight + 14 * 3600);
        (bool claimable,) = tokamon.canClaimDevice(spotId, keccak256("d1"));
        assertTrue(claimable, "09:00 EST should be active");

        // 17:59 EST = 22:59 UTC
        vm.warp(feb18_utcMidnight + 22 * 3600 + 59 * 60);
        (claimable,) = tokamon.canClaimDevice(spotId, keccak256("d1"));
        assertTrue(claimable, "17:59 EST should be active");

        // 18:00 EST = 23:00 UTC (minuteOfDay=1080, not < 1080 → false)
        vm.warp(feb18_utcMidnight + 23 * 3600);
        (claimable,) = tokamon.canClaimDevice(spotId, keccak256("d1"));
        assertFalse(claimable, "18:00 EST should be inactive");

        // 08:59 EST = 13:59 UTC (minuteOfDay=539 < 540 → false)
        vm.warp(feb18_utcMidnight + 13 * 3600 + 59 * 60);
        (claimable,) = tokamon.canClaimDevice(spotId, keccak256("d1"));
        assertFalse(claimable, "08:59 EST should be inactive");
    }

    function test_UTC0_DailyTimeBoundary() public {
        // UTC+0 09:00~18:00
        Tokamon.SpotMetadata memory meta = _utcMeta(1700000000, 1800000000, 540, 1080);
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, true, meta);

        // UTC midnight: Nov 15 00:00 UTC = 1700006400
        uint256 utcMidnight = 1700006400;

        // 09:00 UTC (= 09:00 local, minuteOfDay=540)
        vm.warp(utcMidnight + 9 * 3600);
        (bool claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertTrue(claimable, "09:00 UTC+0 should be active");

        // 17:59 UTC
        vm.warp(utcMidnight + 17 * 3600 + 59 * 60);
        (claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertTrue(claimable, "17:59 UTC+0 should be active");

        // 18:00 UTC
        vm.warp(utcMidnight + 18 * 3600);
        (claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertFalse(claimable, "18:00 UTC+0 should be inactive");
    }

    // ─── 극단 타임존 (UTC+14, UTC-12) ───

    function test_UTC14_DailyTime() public {
        // UTC+14 (라인 제도) 09:00~18:00
        Tokamon.SpotMetadata memory meta = Tokamon.SpotMetadata({
            name: "Line Islands", description: "UTC+14",
            lat: 1_925, lng: -157_475,
            startDate: 1700000000, endDate: 1800000000,
            dailyStartTime: 540, dailyEndTime: 1080,
            utcOffset: 14
        });
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, true, meta);

        // _localTimeToUtc 헬퍼: 로컬 시각 → UTC 타임스탬프 변환
        // 09:00 UTC+14 = UTC 19:00 previous day
        vm.warp(_localTimeToUtc(1700006400, 540, 14));
        (bool claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertTrue(claimable, "09:00 UTC+14 should be active");

        // 12:00 UTC+14 = UTC 22:00 previous day
        vm.warp(_localTimeToUtc(1700006400, 720, 14));
        (claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertTrue(claimable, "12:00 UTC+14 should be active");
    }

    function test_UTCMinus12_DailyTime() public {
        // UTC-12 (베이커 섬) 09:00~18:00
        Tokamon.SpotMetadata memory meta = Tokamon.SpotMetadata({
            name: "Baker Island", description: "UTC-12",
            lat: 194, lng: -176_478,
            startDate: 1700000000, endDate: 1800000000,
            dailyStartTime: 540, dailyEndTime: 1080,
            utcOffset: -12
        });
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, true, meta);

        // 09:00 UTC-12 = UTC 21:00
        vm.warp(_localTimeToUtc(1700006400, 540, -12));
        (bool claimable,) = tokamon.canClaimTelegram(spotId, keccak256("tg1"));
        assertTrue(claimable, "09:00 UTC-12 should be active");
    }

    // ─── 타임존 + 야간 영업 + 쿨다운 복합 테스트 ───

    function test_KST_NightShiftWithCooldown() public {
        // KST 22:00~06:00 야간 영업, 쿨다운 1800초 (30분)
        uint64 startDate = 1771372800; // Feb 18 00:00 UTC (UTC 정규화)
        uint64 endDate = 1774051199;   // Mar 20 23:59:59 UTC (UTC 정규화)
        Tokamon.SpotMetadata memory meta = _kstMeta(startDate, endDate, 1320, 360);
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 1800, true, meta
        );

        bytes32 deviceHash = keccak256("nightDevice");

        // 23:00 KST (Feb 18) = 14:00 UTC (Feb 18)
        uint256 feb18_utcMidnight = 1771372800;
        vm.warp(feb18_utcMidnight + 14 * 3600);
        tokamon.claimByDevice(spotId, deviceHash);
        assertEq(tokamon.getDeviceBalance(deviceHash), 1 ether);

        // 23:30 KST = 14:30 UTC — 쿨다운 내 (30분 미경과)
        vm.warp(feb18_utcMidnight + 14 * 3600 + 29 * 60);
        vm.expectRevert(Tokamon.CooldownNotElapsed.selector);
        tokamon.claimByDevice(spotId, deviceHash);

        // 23:31 KST = 14:31 UTC — 쿨다운 경과, 야간 영업 중
        vm.warp(feb18_utcMidnight + 14 * 3600 + 31 * 60);
        tokamon.claimByDevice(spotId, deviceHash);
        assertEq(tokamon.getDeviceBalance(deviceHash), 2 ether);

        // 03:00 KST (Feb 19) = 18:00 UTC (Feb 18) — 야간 영업 범위 내
        vm.warp(feb18_utcMidnight + 18 * 3600);
        tokamon.claimByDevice(spotId, deviceHash);
        assertEq(tokamon.getDeviceBalance(deviceHash), 3 ether);

        // 07:00 KST = 22:00 UTC — 야간 영업 밖 (360~1320 사이)
        vm.warp(feb18_utcMidnight + 22 * 3600);
        vm.expectRevert(Tokamon.OutsideActiveTime.selector);
        tokamon.claimByDevice(spotId, deviceHash);
    }

    // ─── 타임존 + 중복발행 불가 + 쿨다운 복합 테스트 ───

    function test_KST_NoDuplicateWithCooldown() public {
        // allowDuplicateClaims=false, 쿨다운 3600초
        uint64 startDate = 1771372800; // Feb 18 00:00 UTC (UTC 정규화)
        uint64 endDate = 1774051199;   // Mar 20 23:59:59 UTC (UTC 정규화)
        Tokamon.SpotMetadata memory meta = _kstMeta(startDate, endDate, 540, 1080);
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 3600, false, meta // allowDuplicateClaims=false
        );

        bytes32 tgHash = keccak256("noDupTg");

        // 12:00 KST = 03:00 UTC
        uint256 feb18_utcMidnight = 1771372800;
        vm.warp(feb18_utcMidnight + 3 * 3600);
        tokamon.claimToTelegram(spotId, tgHash);

        // 같은 해시로 쿨다운 경과 후 재시도 → AlreadyClaimed
        vm.warp(feb18_utcMidnight + 5 * 3600);
        vm.expectRevert(Tokamon.AlreadyClaimed.selector);
        tokamon.claimToTelegram(spotId, tgHash);

        // 다른 해시로는 가능
        vm.warp(feb18_utcMidnight + 5 * 3600);
        tokamon.claimToTelegram(spotId, keccak256("differentTg"));
    }

    // ─── 중복발행 허용 + 쿨다운 + 타임존 복합 ───

    function test_KST_DuplicateAllowedWithCooldownAndDailyTime() public {
        // 09:00~18:00 KST, 쿨다운 3600초, 중복발행 허용
        uint64 startDate = 1771372800; // Feb 18 00:00 UTC (UTC 정규화)
        uint64 endDate = 1774051199;   // Mar 20 23:59:59 UTC (UTC 정규화)
        Tokamon.SpotMetadata memory meta = _kstMeta(startDate, endDate, 540, 1080);
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 3600, true, meta
        );

        bytes32 tgHash = keccak256("dupTg");
        uint256 feb18_utcMidnight = 1771372800;

        // 09:00 KST = 00:00 UTC → 클레임 성공
        vm.warp(feb18_utcMidnight);
        tokamon.claimToTelegram(spotId, tgHash);

        // 10:00 KST = 01:00 UTC → 쿨다운 경과, 중복 허용 → 성공
        vm.warp(feb18_utcMidnight + 1 * 3600);
        tokamon.claimToTelegram(spotId, tgHash);

        // 10:30 KST = 01:30 UTC → 쿨다운 미경과
        vm.warp(feb18_utcMidnight + 1 * 3600 + 30 * 60);
        vm.expectRevert(Tokamon.CooldownNotElapsed.selector);
        tokamon.claimToTelegram(spotId, tgHash);

        // 17:59 KST = 08:59 UTC → 영업시간 내, 쿨다운 경과 → 성공
        vm.warp(feb18_utcMidnight + 8 * 3600 + 59 * 60);
        tokamon.claimToTelegram(spotId, tgHash);

        // 18:00 KST = 09:00 UTC → 영업시간 밖
        vm.warp(feb18_utcMidnight + 9 * 3600);
        vm.expectRevert(Tokamon.OutsideActiveTime.selector);
        tokamon.claimToTelegram(spotId, tgHash);
    }

    // ─── canClaimTelegram vs canClaimDevice 동일 시각 결과 비교 ───

    function test_CanClaimTelegramAndDeviceSameResult() public {
        // 동일한 스팟에서, 동일한 시각에 canClaimTelegram과 canClaimDevice가
        // 일관된 결과를 반환하는지 확인 (연결 없는 경우)
        uint64 startDate = 1771372800; // Feb 18 00:00 UTC (UTC 정규화)
        uint64 endDate = 1774051199;   // Mar 20 23:59:59 UTC (UTC 정규화)
        Tokamon.SpotMetadata memory meta = _kstMeta(startDate, endDate, 545, 551);
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 3600, true, meta
        );

        bytes32 tgHash = keccak256("sameTg");
        bytes32 devHash = keccak256("sameDev");

        uint256 feb18_utcMidnight = 1771372800;

        // 09:07 KST = 00:07 UTC → 활성 시간 내
        vm.warp(feb18_utcMidnight + 7 * 60);
        (bool tgClaimable,) = tokamon.canClaimTelegram(spotId, tgHash);
        (bool devClaimable,) = tokamon.canClaimDevice(spotId, devHash);
        assertTrue(tgClaimable, "canClaimTelegram should be true at 09:07 KST");
        assertTrue(devClaimable, "canClaimDevice should be true at 09:07 KST");

        // 09:12 KST = 00:12 UTC → 활성 시간 밖
        vm.warp(feb18_utcMidnight + 12 * 60);
        (tgClaimable,) = tokamon.canClaimTelegram(spotId, tgHash);
        (devClaimable,) = tokamon.canClaimDevice(spotId, devHash);
        assertFalse(tgClaimable, "canClaimTelegram should be false at 09:12 KST");
        assertFalse(devClaimable, "canClaimDevice should be false at 09:12 KST");

        // 시작 전
        vm.warp(1771340399);
        (tgClaimable,) = tokamon.canClaimTelegram(spotId, tgHash);
        (devClaimable,) = tokamon.canClaimDevice(spotId, devHash);
        assertFalse(tgClaimable, "canClaimTelegram should be false before startDate");
        assertFalse(devClaimable, "canClaimDevice should be false before startDate");
    }

    // ─── 교차 쿨다운 + 타임존 + 영업시간 복합 ───

    function test_CrossCooldownWithTimezoneAndDailyTime() public {
        // KST 09:00~18:00, 쿨다운 7200초 (2시간)
        uint64 startDate = 1771372800; // Feb 18 00:00 UTC (UTC 정규화)
        uint64 endDate = 1774051199;   // Mar 20 23:59:59 UTC (UTC 정규화)
        Tokamon.SpotMetadata memory meta = _kstMeta(startDate, endDate, 540, 1080);
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(
            1 ether, 5, 1 ether, 7200, true, meta
        );

        bytes32 tgHash = keccak256("crossTg");
        bytes32 devHash = keccak256("crossDev");

        // 같은 지갑에 연결
        tokamon.linkTelegramToWallet(tgHash, user1);
        tokamon.linkDeviceToWallet(devHash, user1);

        uint256 feb18_utcMidnight = 1771372800;

        // 10:00 KST = 01:00 UTC → 텔레그램 클레임
        vm.warp(feb18_utcMidnight + 1 * 3600);
        tokamon.claimToTelegram(spotId, tgHash);

        // 11:00 KST = 02:00 UTC → 교차 쿨다운 (2시간 미경과)
        vm.warp(feb18_utcMidnight + 2 * 3600);
        (bool devClaimable, uint256 devRem) = tokamon.canClaimDevice(spotId, devHash);
        assertFalse(devClaimable, "Device should have cross-cooldown");
        assertGt(devRem, 0, "Should show remaining cross-cooldown time");

        // 12:01 KST = 03:01 UTC → 쿨다운 경과 → 디바이스 클레임 가능
        vm.warp(feb18_utcMidnight + 3 * 3600 + 60);
        (devClaimable,) = tokamon.canClaimDevice(spotId, devHash);
        assertTrue(devClaimable, "Device should be claimable after cross-cooldown");

        tokamon.claimByDevice(spotId, devHash);
        assertEq(tokamon.getDeviceBalance(devHash), 1 ether);
    }

    // ─── 스탬프 보너스 + 타임존 + 쿨다운 복합 ───

    function test_StampBonusWithTimezoneAndCooldown() public {
        // KST 09:00~18:00, 쿨다운 60초, 스탬프 목표 3, 보너스 2 ETH
        uint64 startDate = 1771372800; // Feb 18 00:00 UTC (UTC 정규화)
        uint64 endDate = 1774051199;   // Mar 20 23:59:59 UTC (UTC 정규화)
        Tokamon.SpotMetadata memory meta = _kstMeta(startDate, endDate, 540, 1080);
        uint256 spotId = tokamon.createSpotSelf{value: 20 ether}(
            1 ether, 3, 2 ether, 60, true, meta
        );

        bytes32 devHash = keccak256("stampDev");
        uint256 feb18_utcMidnight = 1771372800;

        // 3회 클레임하여 스탬프 보너스 달성
        vm.warp(feb18_utcMidnight + 1 * 3600);     // 10:00 KST
        tokamon.claimByDevice(spotId, devHash);

        vm.warp(feb18_utcMidnight + 1 * 3600 + 61); // 10:01 KST
        tokamon.claimByDevice(spotId, devHash);

        vm.warp(feb18_utcMidnight + 1 * 3600 + 122); // 10:02 KST
        tokamon.claimByDevice(spotId, devHash);

        // 3회째에 보너스: 1 + 2 = 3 ETH 추가
        // 총: 1 + 1 + 3 = 5 ETH
        assertEq(tokamon.getDeviceBalance(devHash), 5 ether);
    }

    // ─── 타임존 간 비교: 같은 UTC 시각에 다른 타임존 스팟 상태 ───

    function test_SameUtcTimeDifferentTimezones() public {
        // UTC 기준 00:00에 각 타임존별 활성 상태 확인
        uint256 baseTimestamp = 1771372800; // Feb 18 00:00 UTC

        // KST (UTC+9) 09:00~18:00 → 로컬 09:00, 활성
        Tokamon.SpotMetadata memory kstMeta = _kstMeta(1700000000, 1800000000, 540, 1080);
        uint256 kstSpot = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, true, kstMeta);

        // EST (UTC-5) 09:00~18:00 → 로컬 19:00, 비활성 (1080 이후)
        Tokamon.SpotMetadata memory estMeta = _estMeta(1700000000, 1800000000, 540, 1080);
        uint256 estSpot = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, true, estMeta);

        // UTC+0 09:00~18:00 → 로컬 00:00, 비활성 (540 이전)
        Tokamon.SpotMetadata memory utcMeta = _utcMeta(1700000000, 1800000000, 540, 1080);
        uint256 utcSpot = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, true, utcMeta);

        vm.warp(baseTimestamp);

        (bool kstClaimable,) = tokamon.canClaimTelegram(kstSpot, keccak256("t1"));
        (bool estClaimable,) = tokamon.canClaimTelegram(estSpot, keccak256("t2"));
        (bool utcClaimable,) = tokamon.canClaimTelegram(utcSpot, keccak256("t3"));

        assertTrue(kstClaimable, "KST spot should be active at UTC 00:00 (= 09:00 KST)");
        assertFalse(estClaimable, "EST spot should be inactive at UTC 00:00 (= 19:00 EST)");
        assertFalse(utcClaimable, "UTC spot should be inactive at UTC 00:00 (= 00:00 local)");
    }

    // ─── 자정 경계 테스트 (localTime % 86400 계산 확인) ───

    function test_MidnightBoundaryCrossing() public {
        // KST 야간 23:50~00:10 (매일 20분 운영)
        Tokamon.SpotMetadata memory meta = _kstMeta(1700000000, 1800000000, 1430, 10);
        uint256 spotId = tokamon.createSpotSelf{value: 10 ether}(1 ether, 5, 1 ether, 0, true, meta);

        // _localTimeToUtc 헬퍼로 정확한 UTC 타임스탬프 계산
        // 23:55 KST → minuteOfDay=1435, >= 1430 → active (night shift)
        vm.warp(_localTimeToUtc(1700006400, 1435, 9));
        (bool claimable,) = tokamon.canClaimTelegram(spotId, keccak256("t1"));
        assertTrue(claimable, "23:55 KST should be active (night shift)");

        // 00:05 KST → minuteOfDay=5, < 10 → active (night shift past midnight)
        vm.warp(_localTimeToUtc(1700006400, 5, 9));
        (claimable,) = tokamon.canClaimTelegram(spotId, keccak256("t1"));
        assertTrue(claimable, "00:05 KST should be active (night shift past midnight)");

        // 00:10 KST → minuteOfDay=10, not < 10 AND not >= 1430 → inactive
        vm.warp(_localTimeToUtc(1700006400, 10, 9));
        (claimable,) = tokamon.canClaimTelegram(spotId, keccak256("t1"));
        assertFalse(claimable, "00:10 KST should be inactive");
    }
}
