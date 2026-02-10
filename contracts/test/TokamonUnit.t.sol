// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/TONToken.sol";
import "../src/Tokamon.sol";

/**
 * @title TokamonUnitTest
 * @notice Tokamon 컨트랙트의 모든 기능에 대한 단위 테스트
 */
contract TokamonUnitTest is Test {
    TONToken public tonToken;
    Tokamon public tokamon;
    
    address admin;
    address spotCreator;
    address customer1;
    address customer2;
    
    event SpotCreated(uint256 indexed spotId, address indexed creator, uint256 reward, uint256 deposit);
    event Claimed(uint256 indexed spotId, address indexed user, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);
    event Redeposited(uint256 indexed spotId, address indexed creator, uint256 amount);
    event TelegramClaimed(uint256 indexed spotId, bytes32 indexed telegramHash, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);
    event TelegramLinked(bytes32 indexed telegramHash, address indexed oldWallet, address indexed newWallet, uint256 transferredAmount);
    
    function setUp() public {
        admin = address(this);
        spotCreator = makeAddr("spotCreator");
        customer1 = makeAddr("customer1");
        customer2 = makeAddr("customer2");
        
        // TON 토큰 배포
        tonToken = new TONToken();
        
        // Tokamon 컨트랙트 배포
        tokamon = new Tokamon(address(tonToken));
        
        // 테스트 계정들에게 TON 전송
        tonToken.transfer(spotCreator, 10000 * 1e18);
        tonToken.transfer(customer1, 1000 * 1e18);
        tonToken.transfer(customer2, 1000 * 1e18);
    }
    
    // ==================== 기본 기능 테스트 ====================
    
    function testDepositSelf() public {
        uint256 depositAmount = 100 * 1e18;
        
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), depositAmount);
        tokamon.depositSelf(depositAmount);
        vm.stopPrank();
        
        assertEq(tokamon.getBalance(spotCreator), depositAmount);
    }
    
    function testDepositSelfMultiple() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 300 * 1e18);
        
        tokamon.depositSelf(100 * 1e18);
        tokamon.depositSelf(50 * 1e18);
        tokamon.depositSelf(150 * 1e18);
        vm.stopPrank();
        
        assertEq(tokamon.getBalance(spotCreator), 300 * 1e18);
    }
    
    function testDepositByAdmin() public {
        uint256 depositAmount = 100 * 1e18;
        
        vm.prank(admin);
        tonToken.approve(address(tokamon), depositAmount);
        
        vm.prank(admin);
        tokamon.deposit(customer1, depositAmount);
        
        assertEq(tokamon.getBalance(customer1), depositAmount);
    }
    
    function testCreateSpotSelf() public {
        uint256 depositAmount = 100 * 1e18;

        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), depositAmount);

        vm.expectEmit(true, true, false, true);
        emit SpotCreated(0, spotCreator, 10 * 1e18, depositAmount);

        uint256 spotId = tokamon.createSpotSelf(
            depositAmount,
            10 * 1e18,  // reward
            5,          // stampGoal
            50 * 1e18,  // stampBonus
            3600,       // cooldown
            false,      // allowDuplicateClaims
            Tokamon.SpotMetadata({
                name: "Test Cafe",
                description: "Coffee shop",
                lat: 37500000,
                lng: 127000000,
                startTime: "09:00",
                endTime: "21:00"
            })
        );
        vm.stopPrank();
        
        assertEq(spotId, 0);
        
        (address creator, uint256 reward, uint256 remaining, uint256 stampGoal, uint256 stampBonus, uint256 cooldown, bool allowDuplicateClaims) = tokamon.getSpotCore(spotId);
        
        assertEq(creator, spotCreator);
        assertEq(reward, 10 * 1e18);
        assertEq(remaining, depositAmount);
        assertEq(stampGoal, 5);
        assertEq(stampBonus, 50 * 1e18);
        assertEq(cooldown, 3600);
        assertEq(allowDuplicateClaims, false);
    }
    
    function testRedepositSelf() public {
        // 스팟 생성
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);
        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 3600, false,
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );

        // 재예치
        tonToken.approve(address(tokamon), 100 * 1e18);

        vm.expectEmit(true, true, false, true);
        emit Redeposited(spotId, spotCreator, 100 * 1e18);

        tokamon.redepositSelf(spotId, 100 * 1e18);
        vm.stopPrank();
        
        (, , uint256 remaining, , , , ) = tokamon.getSpotCore(spotId);
        assertEq(remaining, 200 * 1e18);
    }
    
    // ==================== claim() 테스트 (핵심 수정사항) ====================
    
    function testClaimDirectTransferTON() public {
        // 스팟 생성
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false,
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        
        uint256 tonBalanceBefore = tonToken.balanceOf(customer1);
        uint256 internalBalanceBefore = tokamon.getBalance(customer1);
        
        // admin이 claim 실행
        vm.expectEmit(true, true, false, false);
        emit Claimed(spotId, customer1, 10 * 1e18, 0, 1, block.timestamp);
        
        vm.prank(admin);
        tokamon.claim(spotId, customer1);
        
        // 검증 1: TON 토큰이 즉시 customer1에게 전송됨
        assertEq(tonToken.balanceOf(customer1) - tonBalanceBefore, 10 * 1e18, "TON should be transferred directly");
        
        // 검증 2: 내부 잔액(balances)에는 적립되지 않음
        assertEq(tokamon.getBalance(customer1), internalBalanceBefore, "Internal balance should not increase");
    }
    
    function testClaimMultipleTimes() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, true, // allowDuplicateClaims = true
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        
        // 3번 클레임
        vm.startPrank(admin);
        tokamon.claim(spotId, customer1);
        tokamon.claim(spotId, customer1);
        tokamon.claim(spotId, customer1);
        vm.stopPrank();
        
        // 총 30 TON 받아야 함
        assertEq(tonToken.balanceOf(customer1), 1030 * 1e18);
    }
    
    function testClaimOnlyAdmin() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false,
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        
        // admin이 아닌 사용자가 claim 시도
        vm.prank(customer1);
        vm.expectRevert("only admin");
        tokamon.claim(spotId, customer1);
    }
    
    // ==================== claimToTelegram() 테스트 ====================
    
    function testClaimToTelegram() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false,
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        
        bytes32 telegramHash = keccak256(abi.encodePacked("user_telegram"));
        
        vm.expectEmit(true, true, false, false);
        emit TelegramClaimed(spotId, telegramHash, 10 * 1e18, 0, 1, block.timestamp);
        
        tokamon.claimToTelegram(spotId, telegramHash);
        vm.stopPrank();
        
        // 텔레그램 잔액 확인
        assertEq(tokamon.getTelegramBalance(telegramHash), 10 * 1e18);
    }
    
    function testClaimToTelegramOnlySpotOwner() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false,
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        
        bytes32 telegramHash = keccak256(abi.encodePacked("user_telegram"));
        
        // 다른 사용자가 claimToTelegram 시도
        vm.prank(customer1);
        vm.expectRevert("only spot owner can claim");
        tokamon.claimToTelegram(spotId, telegramHash);
    }
    
    // ==================== 텔레그램-지갑 연동 테스트 ====================
    
    function testLinkTelegramToWallet() public {
        bytes32 telegramHash = keccak256(abi.encodePacked("user1_telegram"));
        
        vm.expectEmit(true, true, true, true);
        emit TelegramLinked(telegramHash, address(0), customer1, 0);
        
        vm.prank(admin);
        tokamon.linkTelegramToWallet(telegramHash, customer1);
        
        assertEq(tokamon.getTelegramLinkedWallet(telegramHash), customer1);
        assertEq(tokamon.getWalletLinkedTelegram(customer1), telegramHash);
    }
    
    function testClaimTelegramToWallet() public {
        // 1. 스팟 생성 및 텔레그램으로 클레임
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false,
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        
        bytes32 telegramHash = keccak256(abi.encodePacked("user1_telegram"));
        tokamon.claimToTelegram(spotId, telegramHash);
        vm.stopPrank();
        
        // 2. 텔레그램-지갑 연결
        vm.prank(admin);
        tokamon.linkTelegramToWallet(telegramHash, customer1);
        
        // 3. 지갑으로 TON 클레임
        uint256 tonBalanceBefore = tonToken.balanceOf(customer1);
        
        vm.prank(customer1);
        tokamon.claimTelegramToWallet(telegramHash);
        
        uint256 tonBalanceAfter = tonToken.balanceOf(customer1);
        
        assertEq(tonBalanceAfter - tonBalanceBefore, 10 * 1e18);
        assertEq(tokamon.getTelegramBalance(telegramHash), 0);
    }
    
    // ==================== 쿨다운 및 중복 방지 테스트 ====================
    
    function testCooldownPreventsDoubleClaim() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 3600, false, // cooldown = 3600
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        
        // 첫 번째 클레임
        vm.prank(admin);
        tokamon.claim(spotId, customer1);
        
        // 쿨다운 중 두 번째 클레임 시도
        vm.prank(admin);
        vm.expectRevert("cooldown not elapsed");
        tokamon.claim(spotId, customer1);
    }
    
    function testClaimAfterCooldown() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 3600, false,
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        
        // 첫 번째 클레임
        vm.prank(admin);
        tokamon.claim(spotId, customer1);
        
        // 쿨다운 경과
        vm.warp(block.timestamp + 3601);
        
        // 두 번째 클레임 성공
        vm.prank(admin);
        tokamon.claim(spotId, customer1);
        
        assertEq(tonToken.balanceOf(customer1), 1020 * 1e18);
    }
    
    function testNoDuplicateClaimTelegramThenWallet() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 3600, false,
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        
        bytes32 telegramHash = keccak256(abi.encodePacked("user1"));
        tokamon.claimToTelegram(spotId, telegramHash);
        vm.stopPrank();
        
        // 텔레그램-지갑 연결
        vm.prank(admin);
        tokamon.linkTelegramToWallet(telegramHash, customer1);
        
        // 지갑으로 클레임 시도 (쿨다운으로 실패해야 함)
        vm.prank(admin);
        vm.expectRevert("cooldown not elapsed (telegram)");
        tokamon.claim(spotId, customer1);
    }
    
    function testNoDuplicateClaimWalletThenTelegram() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 3600, false,
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        
        bytes32 telegramHash = keccak256(abi.encodePacked("user1"));
        
        // 지갑으로 먼저 클레임
        vm.prank(admin);
        tokamon.claim(spotId, customer1);
        
        // 텔레그램-지갑 연결
        vm.prank(admin);
        tokamon.linkTelegramToWallet(telegramHash, customer1);
        
        // 텔레그램으로 클레임 시도 (쿨다운으로 실패해야 함)
        vm.prank(spotCreator);
        vm.expectRevert("cooldown not elapsed (wallet)");
        tokamon.claimToTelegram(spotId, telegramHash);
    }
    
    function testAllowDuplicateClaims() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 3600,
            true,  // allowDuplicateClaims = true
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        
        bytes32 telegramHash = keccak256(abi.encodePacked("user1"));
        
        // 연속 클레임 가능
        tokamon.claimToTelegram(spotId, telegramHash);
        tokamon.claimToTelegram(spotId, telegramHash);
        tokamon.claimToTelegram(spotId, telegramHash);
        vm.stopPrank();
        
        assertEq(tokamon.getTelegramBalance(telegramHash), 30 * 1e18);
    }
    
    // ==================== 스탬프 시스템 테스트 ====================
    
    function testStampAccumulation() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 500 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            500 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, true, // stampGoal = 5
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        
        // 4번 클레임 (스탬프 4개)
        vm.startPrank(admin);
        for (uint i = 0; i < 4; i++) {
            tokamon.claim(spotId, customer1);
        }
        vm.stopPrank();
        
        (uint256 stamps, uint256 goal, , ) = tokamon.getStampInfo(spotId, customer1);
        assertEq(stamps, 4);
        assertEq(goal, 5);
    }
    
    function testStampBonusOnCompletion() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 500 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            500 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, true, // stampBonus = 50 TON
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        
        uint256 balanceBefore = tonToken.balanceOf(customer1);
        
        // 5번째 클레임 (스탬프 완성 + 보너스)
        vm.startPrank(admin);
        for (uint i = 0; i < 5; i++) {
            tokamon.claim(spotId, customer1);
        }
        vm.stopPrank();
        
        uint256 balanceAfter = tonToken.balanceOf(customer1);
        
        // 10 * 4 + (10 + 50) = 100 TON
        assertEq(balanceAfter - balanceBefore, 100 * 1e18);
        
        // 스탬프 리셋 확인
        (uint256 stamps, , , ) = tokamon.getStampInfo(spotId, customer1);
        assertEq(stamps, 0);
    }
    
    // ==================== 에러 케이스 테스트 ====================
    
    function testRevertSpotExhausted() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 15 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            15 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, true,
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        
        // 첫 번째 클레임 성공
        vm.prank(admin);
        tokamon.claim(spotId, customer1);
        
        // 두 번째 클레임 실패 (잔액 부족)
        vm.prank(admin);
        vm.expectRevert("spot exhausted");
        tokamon.claim(spotId, customer1);
    }
    
    function testRevertInsufficientBalance() public {
        address poorUser = makeAddr("poorUser");
        // poorUser has 0 TON tokens
        vm.startPrank(poorUser);
        tonToken.approve(address(tokamon), 100 * 1e18);
        vm.expectRevert(); // will revert on transferFrom due to insufficient token balance
        tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false,
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
    }
    
    function testRevertNotSpotCreator() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false,
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        
        // 다른 사용자가 redeposit 시도
        vm.prank(customer1);
        tonToken.approve(address(tokamon), 50 * 1e18);
        
        vm.prank(customer1);
        vm.expectRevert("not spot creator");
        tokamon.redepositSelf(spotId, 50 * 1e18);
    }
    
    function testRevertClaimTelegramToWalletNotLinked() public {
        bytes32 telegramHash = keccak256(abi.encodePacked("test"));
        
        vm.prank(customer1);
        vm.expectRevert("no telegram linked");
        tokamon.claimTelegramToWallet(telegramHash);
    }
    
    function testRevertClaimTelegramToWalletHashMismatch() public {
        bytes32 telegramHash1 = keccak256(abi.encodePacked("user1"));
        bytes32 telegramHash2 = keccak256(abi.encodePacked("user2"));
        
        vm.prank(admin);
        tokamon.linkTelegramToWallet(telegramHash1, customer1);
        
        vm.prank(customer1);
        vm.expectRevert("hash mismatch");
        tokamon.claimTelegramToWallet(telegramHash2);
    }
    
    // ==================== claimByDevice() 테스트 ====================

    event DeviceClaimed(uint256 indexed spotId, bytes32 indexed deviceHash, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp);

    function _createSpotForDevice(uint256 deposit, uint256 reward, uint256 stampGoal, uint256 stampBonus, uint256 cooldown, bool allowDup) internal returns (uint256) {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), deposit);
        uint256 spotId = tokamon.createSpotSelf(
            deposit, reward, stampGoal, stampBonus, cooldown, allowDup,
            Tokamon.SpotMetadata("Device Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        return spotId;
    }

    function testClaimByDeviceBasic() public {
        uint256 spotId = _createSpotForDevice(100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false);
        bytes32 deviceHash = keccak256(abi.encodePacked("device_abc123"));

        vm.expectEmit(true, true, false, false);
        emit DeviceClaimed(spotId, deviceHash, 10 * 1e18, 0, 1, block.timestamp);

        vm.prank(admin);
        tokamon.claimByDevice(spotId, deviceHash);

        // deviceBalances에 누적 확인
        assertEq(tokamon.deviceBalances(deviceHash), 10 * 1e18);
        assertEq(tokamon.getDeviceBalance(deviceHash), 10 * 1e18);
    }

    function testClaimByDeviceOnlyAdmin() public {
        uint256 spotId = _createSpotForDevice(100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false);
        bytes32 deviceHash = keccak256(abi.encodePacked("device_abc123"));

        vm.prank(customer1);
        vm.expectRevert("only admin");
        tokamon.claimByDevice(spotId, deviceHash);
    }

    function testClaimByDeviceCooldown() public {
        uint256 spotId = _createSpotForDevice(100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 3600, false);
        bytes32 deviceHash = keccak256(abi.encodePacked("device_abc123"));

        // 첫 번째 클레임 성공
        vm.prank(admin);
        tokamon.claimByDevice(spotId, deviceHash);

        // 쿨다운 중 두 번째 클레임 실패
        vm.prank(admin);
        vm.expectRevert("cooldown not elapsed");
        tokamon.claimByDevice(spotId, deviceHash);
    }

    function testClaimByDeviceAfterCooldown() public {
        uint256 spotId = _createSpotForDevice(100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 3600, false);
        bytes32 deviceHash = keccak256(abi.encodePacked("device_abc123"));

        vm.prank(admin);
        tokamon.claimByDevice(spotId, deviceHash);

        // 쿨다운 경과
        vm.warp(block.timestamp + 3601);

        // 두 번째 클레임 성공
        vm.prank(admin);
        tokamon.claimByDevice(spotId, deviceHash);

        assertEq(tokamon.deviceBalances(deviceHash), 20 * 1e18);
    }

    function testClaimByDeviceAllowDuplicate() public {
        uint256 spotId = _createSpotForDevice(100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 3600, true);
        bytes32 deviceHash = keccak256(abi.encodePacked("device_abc123"));

        // 연속 클레임 가능 (allowDuplicateClaims = true)
        vm.startPrank(admin);
        tokamon.claimByDevice(spotId, deviceHash);
        tokamon.claimByDevice(spotId, deviceHash);
        tokamon.claimByDevice(spotId, deviceHash);
        vm.stopPrank();

        assertEq(tokamon.deviceBalances(deviceHash), 30 * 1e18);
    }

    function testClaimByDeviceStampBonus() public {
        // stampGoal=3, stampBonus=20 TON
        uint256 spotId = _createSpotForDevice(200 * 1e18, 10 * 1e18, 3, 20 * 1e18, 0, true);
        bytes32 deviceHash = keccak256(abi.encodePacked("device_abc123"));

        vm.startPrank(admin);
        tokamon.claimByDevice(spotId, deviceHash); // stamp=1
        tokamon.claimByDevice(spotId, deviceHash); // stamp=2
        tokamon.claimByDevice(spotId, deviceHash); // stamp=3 → 보너스! stamp=0
        vm.stopPrank();

        // 10 + 10 + (10 + 20) = 50 TON
        assertEq(tokamon.deviceBalances(deviceHash), 50 * 1e18);

        // 스탬프 리셋 확인
        (uint256 stamps, , , ) = tokamon.getClaimInfo(spotId, deviceHash);
        assertEq(stamps, 0);
    }

    function testClaimByDeviceSpotExhausted() public {
        uint256 spotId = _createSpotForDevice(15 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, true);
        bytes32 deviceHash = keccak256(abi.encodePacked("device_abc123"));

        // 첫 번째 클레임 성공 (10 TON)
        vm.prank(admin);
        tokamon.claimByDevice(spotId, deviceHash);

        // 두 번째 클레임 실패 (남은 5 TON < 10 TON reward)
        vm.prank(admin);
        vm.expectRevert("spot exhausted");
        tokamon.claimByDevice(spotId, deviceHash);
    }

    function testClaimByDeviceSpotNotExist() public {
        bytes32 deviceHash = keccak256(abi.encodePacked("device_abc123"));

        vm.prank(admin);
        vm.expectRevert("spot does not exist");
        tokamon.claimByDevice(999, deviceHash);
    }

    function testClaimByDeviceMultipleDevices() public {
        uint256 spotId = _createSpotForDevice(100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 3600, false);
        bytes32 device1 = keccak256(abi.encodePacked("device_111"));
        bytes32 device2 = keccak256(abi.encodePacked("device_222"));

        // 서로 다른 기기는 독립적으로 클레임 가능
        vm.startPrank(admin);
        tokamon.claimByDevice(spotId, device1);
        tokamon.claimByDevice(spotId, device2);
        vm.stopPrank();

        assertEq(tokamon.deviceBalances(device1), 10 * 1e18);
        assertEq(tokamon.deviceBalances(device2), 10 * 1e18);
    }

    function testClaimByDeviceBalanceAccumulates() public {
        // 두 개의 스팟에서 같은 기기로 클레임 → 잔액 합산
        uint256 spot1 = _createSpotForDevice(100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false);
        uint256 spot2 = _createSpotForDevice(100 * 1e18, 20 * 1e18, 5, 50 * 1e18, 0, false);
        bytes32 deviceHash = keccak256(abi.encodePacked("device_abc123"));

        vm.startPrank(admin);
        tokamon.claimByDevice(spot1, deviceHash);
        tokamon.claimByDevice(spot2, deviceHash);
        vm.stopPrank();

        // 10 + 20 = 30 TON
        assertEq(tokamon.deviceBalances(deviceHash), 30 * 1e18);
    }

    function testDeviceClaimIndependentFromTelegram() public {
        // 기기 클레임과 텔레그램 클레임은 독립적
        uint256 spotId = _createSpotForDevice(100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 3600, false);
        bytes32 deviceHash = keccak256(abi.encodePacked("device_abc123"));
        bytes32 telegramHash = keccak256(abi.encodePacked("telegram_user"));

        // 기기로 클레임
        vm.prank(admin);
        tokamon.claimByDevice(spotId, deviceHash);

        // 텔레그램으로도 클레임 가능 (독립적)
        vm.prank(spotCreator);
        tokamon.claimToTelegram(spotId, telegramHash);

        assertEq(tokamon.deviceBalances(deviceHash), 10 * 1e18);
        assertEq(tokamon.telegramBalances(telegramHash), 10 * 1e18);
    }

    function testRevertDepositZeroAmount() public {
        vm.prank(customer1);
        vm.expectRevert("must deposit TON");
        tokamon.depositSelf(0);
    }
    
    function testRevertCreateSpotZeroReward() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        vm.expectRevert("reward must be > 0");
        tokamon.createSpotSelf(
            100 * 1e18, 0, 5, 50 * 1e18, 0, false, // reward = 0
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
    }
    
    function testRevertCreateSpotZeroStampGoal() public {
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), 100 * 1e18);

        vm.expectRevert("stampGoal must be > 0");
        tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 0, 50 * 1e18, 0, false, // stampGoal = 0
            Tokamon.SpotMetadata("Test", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
    }
}
