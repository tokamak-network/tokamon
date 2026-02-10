// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/TONToken.sol";
import "../src/Tokamon.sol";

contract TokamonTest is Test {
    TONToken public tonToken;
    Tokamon public tokamon;
    
    address owner;
    address spotCreator;
    address customer;
    
    function setUp() public {
        owner = address(this);
        spotCreator = makeAddr("spotCreator");
        customer = makeAddr("customer");
        
        // 1. TON 토큰 배포
        tonToken = new TONToken();
        
        // 2. Tokamon 컨트랙트 배포
        tokamon = new Tokamon(address(tonToken));
        
        // 3. 사용자들에게 TON 전송
        tonToken.transfer(spotCreator, 1000 * 1e18);
        tonToken.transfer(customer, 1000 * 1e18);
    }
    
    // === 기본 기능 테스트 ===
    
    function testDepositSelf() public {
        uint256 depositAmount = 100 * 1e18;
        
        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), depositAmount);
        tokamon.depositSelf(depositAmount);
        vm.stopPrank();
        
        assertEq(tokamon.balances(spotCreator), depositAmount);
    }
    
    function testCreateSpotAndClaimToTelegram() public {
        uint256 depositAmount = 100 * 1e18;

        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), depositAmount);

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
        
        bytes32 telegramHash = keccak256(abi.encodePacked("zena_tokamak"));
        tokamon.claimToTelegram(spotId, telegramHash);
        vm.stopPrank();
        
        assertEq(tokamon.telegramBalances(telegramHash), 10 * 1e18);
    }
    
    // === 전체 플로우 테스트 ===
    
    function testFullFlow() public {
        // 1. 스팟 생성
        uint256 depositAmount = 100 * 1e18;

        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), depositAmount);

        uint256 spotId = tokamon.createSpotSelf(
            depositAmount, 10 * 1e18, 5, 50 * 1e18, 3600, false,
            Tokamon.SpotMetadata("Test Spot", "Test", 37500000, 127000000, "00:00", "23:59")
        );
        vm.stopPrank();
        
        // 2. 텔레그램으로 TON 발급
        bytes32 telegramHash = keccak256(abi.encodePacked("zena_tokamak"));
        
        vm.prank(spotCreator);
        tokamon.claimToTelegram(spotId, telegramHash);
        
        assertEq(tokamon.telegramBalances(telegramHash), 10 * 1e18);
        
        // 3. 텔레그램-지갑 연결
        vm.prank(owner);
        tokamon.linkTelegramToWallet(telegramHash, customer);
        
        assertEq(tokamon.walletToTelegram(customer), telegramHash);
        
        // 4. 지갑으로 TON 클레임
        uint256 balanceBefore = tonToken.balanceOf(customer);
        
        vm.prank(customer);
        tokamon.claimTelegramToWallet(telegramHash);
        
        uint256 balanceAfter = tonToken.balanceOf(customer);
        
        assertEq(balanceAfter - balanceBefore, 10 * 1e18);
        assertEq(tokamon.telegramBalances(telegramHash), 0);
    }
    
    // === 중복 클레임 방지 테스트 (핵심!) ===
    
    function testNoDuplicateClaimTelegramThenWallet() public {
        // 시나리오: 텔레그램으로 먼저 클레임 → 지갑 연결 → 지갑으로 또 클레임 시도

        uint256 depositAmount = 100 * 1e18;

        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), depositAmount);

        uint256 spotId = tokamon.createSpotSelf(
            depositAmount, 10 * 1e18, 5, 50 * 1e18, 3600, false,
            Tokamon.SpotMetadata("Test Spot", "Test", 37500000, 127000000, "00:00", "23:59")
        );
        vm.stopPrank();
        
        bytes32 telegramHash = keccak256(abi.encodePacked("user1"));
        
        // 1. 텔레그램으로 클레임
        vm.prank(spotCreator);
        tokamon.claimToTelegram(spotId, telegramHash);
        
        // 2. 텔레그램-지갑 연결
        vm.prank(owner);
        tokamon.linkTelegramToWallet(telegramHash, customer);
        
        // 3. 지갑으로 클레임 시도 → 쿨다운으로 실패해야 함!
        vm.prank(owner);
        vm.expectRevert("cooldown not elapsed (telegram)");
        tokamon.claim(spotId, customer);
    }
    
    function testNoDuplicateClaimWalletThenTelegram() public {
        // 시나리오: 지갑으로 먼저 클레임 → 나중에 텔레그램 연결 → 텔레그램으로 또 클레임 시도

        uint256 depositAmount = 100 * 1e18;

        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), depositAmount);

        uint256 spotId = tokamon.createSpotSelf(
            depositAmount, 10 * 1e18, 5, 50 * 1e18, 3600, false,
            Tokamon.SpotMetadata("Test Spot", "Test", 37500000, 127000000, "00:00", "23:59")
        );
        vm.stopPrank();
        
        bytes32 telegramHash = keccak256(abi.encodePacked("user1"));
        
        // 1. 지갑으로 클레임 (아직 텔레그램 연결 안됨)
        vm.prank(owner);
        tokamon.claim(spotId, customer);
        
        // 2. 텔레그램-지갑 연결
        vm.prank(owner);
        tokamon.linkTelegramToWallet(telegramHash, customer);
        
        // 3. 텔레그램으로 클레임 시도 → 쿨다운으로 실패해야 함!
        vm.prank(spotCreator);
        vm.expectRevert("cooldown not elapsed (wallet)");
        tokamon.claimToTelegram(spotId, telegramHash);
    }
    
    function testDuplicateClaimAfterCooldown() public {
        // 시나리오: 쿨다운 후에는 정상적으로 클레임 가능

        uint256 depositAmount = 100 * 1e18;

        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), depositAmount);

        uint256 spotId = tokamon.createSpotSelf(
            depositAmount, 10 * 1e18, 5, 50 * 1e18, 3600, false,
            Tokamon.SpotMetadata("Test Spot", "Test", 37500000, 127000000, "00:00", "23:59")
        );
        vm.stopPrank();
        
        bytes32 telegramHash = keccak256(abi.encodePacked("user1"));
        
        // 1. 텔레그램으로 클레임
        vm.prank(spotCreator);
        tokamon.claimToTelegram(spotId, telegramHash);
        
        // 2. 텔레그램-지갑 연결
        vm.prank(owner);
        tokamon.linkTelegramToWallet(telegramHash, customer);
        
        // 3. 쿨다운 경과
        vm.warp(block.timestamp + 3601);
        
        // 4. 지갑으로 클레임 → 성공해야 함!
        uint256 tonBalanceBefore = tonToken.balanceOf(customer);
        
        vm.prank(owner);
        tokamon.claim(spotId, customer);
        
        // 검증: customer TON 토큰 잔액 증가 (balances 대신 실제 TON 토큰 잔액 확인)
        uint256 tonBalanceAfter = tonToken.balanceOf(customer);
        assertEq(tonBalanceAfter - tonBalanceBefore, 10 * 1e18);
    }
    
    function testAllowDuplicateClaims() public {
        // 시나리오: allowDuplicateClaims = true인 경우 중복 허용

        uint256 depositAmount = 100 * 1e18;

        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), depositAmount);

        uint256 spotId = tokamon.createSpotSelf(
            depositAmount, 10 * 1e18, 5, 50 * 1e18, 3600,
            true,  // allowDuplicateClaims!
            Tokamon.SpotMetadata("Test Spot", "Test", 37500000, 127000000, "00:00", "23:59")
        );
        vm.stopPrank();
        
        bytes32 telegramHash = keccak256(abi.encodePacked("user1"));
        
        // 연속 클레임 가능해야 함
        vm.startPrank(spotCreator);
        tokamon.claimToTelegram(spotId, telegramHash);
        tokamon.claimToTelegram(spotId, telegramHash);
        tokamon.claimToTelegram(spotId, telegramHash);
        vm.stopPrank();
        
        // 3번 클레임 = 30 TON
        assertEq(tokamon.telegramBalances(telegramHash), 30 * 1e18);
    }
    
    // === 핵심 수정사항 테스트 (claim이 즉시 TON 전송하는지) ===
    
    function testClaimDirectlyTransfersTON() public {
        // 시나리오: claim() 호출 시 balances가 아닌 즉시 TON 토큰이 지갑으로 전송되어야 함

        uint256 depositAmount = 100 * 1e18;

        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), depositAmount);

        uint256 spotId = tokamon.createSpotSelf(
            depositAmount, 10 * 1e18, 5, 50 * 1e18, 3600, false,
            Tokamon.SpotMetadata("Test Spot", "Test", 37500000, 127000000, "00:00", "23:59")
        );
        vm.stopPrank();
        
        // customer의 TON 토큰 잔액 확인
        uint256 tonBalanceBefore = tonToken.balanceOf(customer);
        
        // admin이 customer에게 클레임 실행
        vm.prank(owner);
        tokamon.claim(spotId, customer);
        
        // 검증 1: customer의 TON 토큰 잔액이 증가해야 함 (즉시 전송)
        uint256 tonBalanceAfter = tonToken.balanceOf(customer);
        assertEq(tonBalanceAfter - tonBalanceBefore, 10 * 1e18, "TON should be transferred directly to wallet");
        
        // 검증 2: balances[customer]는 0이어야 함 (더 이상 내부 잔액에 적립하지 않음)
        assertEq(tokamon.balances(customer), 0, "balances should remain 0");
    }
    
    // === 에러 케이스 테스트 ===
    
    function testRevertClaimTelegramToWalletNotLinked() public {
        bytes32 telegramHash = keccak256(abi.encodePacked("test"));
        
        vm.prank(customer);
        vm.expectRevert("no telegram linked");
        tokamon.claimTelegramToWallet(telegramHash);
    }
    
    function testRevertClaimTelegramToWalletHashMismatch() public {
        bytes32 telegramHash1 = keccak256(abi.encodePacked("user1"));
        bytes32 telegramHash2 = keccak256(abi.encodePacked("user2"));
        
        vm.prank(owner);
        tokamon.linkTelegramToWallet(telegramHash1, customer);
        
        vm.prank(customer);
        vm.expectRevert("hash mismatch");
        tokamon.claimTelegramToWallet(telegramHash2);
    }
    
    function testRevertSpotExhausted() public {
        uint256 depositAmount = 15 * 1e18;  // 10 reward + 5 여유

        vm.startPrank(spotCreator);
        tonToken.approve(address(tokamon), depositAmount);

        uint256 spotId = tokamon.createSpotSelf(
            depositAmount, 10 * 1e18, 5, 50 * 1e18, 0, // cooldown = 0
            true,  // allowDuplicateClaims
            Tokamon.SpotMetadata("Test Spot", "Test", 37500000, 127000000, "00:00", "23:59")
        );
        
        bytes32 telegramHash = keccak256(abi.encodePacked("user1"));
        
        // 첫 번째 클레임 성공
        tokamon.claimToTelegram(spotId, telegramHash);
        
        // 두 번째 클레임 실패 (잔액 부족)
        vm.expectRevert("spot exhausted");
        tokamon.claimToTelegram(spotId, telegramHash);
        vm.stopPrank();
    }
}
