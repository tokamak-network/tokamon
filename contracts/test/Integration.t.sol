// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/TONToken.sol";
import "../src/Tokamon.sol";
import "../src/Faucet.sol";

/**
 * @title IntegrationTest
 * @notice Tokamon과 Faucet의 통합 테스트
 */
contract IntegrationTest is Test {
    TONToken public tonToken;
    Tokamon public tokamon;
    Faucet public faucet;
    
    address admin;
    address spotCreator1;
    address spotCreator2;
    address customer1;
    address customer2;
    address customer3;
    
    function setUp() public {
        admin = address(this);
        spotCreator1 = makeAddr("spotCreator1");
        spotCreator2 = makeAddr("spotCreator2");
        customer1 = makeAddr("customer1");
        customer2 = makeAddr("customer2");
        customer3 = makeAddr("customer3");
        
        // 컨트랙트 배포
        tonToken = new TONToken();
        tokamon = new Tokamon(address(tonToken));
        faucet = new Faucet{value: 100 ether}(address(tokamon), address(tonToken));
        
        // Faucet에 TON 충전
        tonToken.transfer(address(faucet), 100000 * 1e18);
        
        // 테스트 계정들에게 ETH 지급
        vm.deal(spotCreator1, 1 ether);
        vm.deal(spotCreator2, 1 ether);
        vm.deal(customer1, 0.1 ether);
        vm.deal(customer2, 0.1 ether);
        vm.deal(customer3, 0.1 ether);
    }
    
    // ==================== Faucet → Tokamon 통합 ====================
    
    function testFaucetToTokamonFlow() public {
        // 1. Faucet에서 TON 받기
        vm.prank(spotCreator1);
        faucet.getTON();
        
        assertEq(tonToken.balanceOf(spotCreator1), 100 * 1e18);
        
        // 2. 받은 TON으로 스팟 생성
        vm.startPrank(spotCreator1);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false,
            Tokamon.SpotMetadata("Cafe", "Test", 0, 0, "00:00", "23:59")
        );
        
        assertEq(spotId, 0);
    }
    
    function testMultipleFaucetUsers() public {
        // 여러 사용자가 Faucet에서 TON 받기
        address[3] memory users = [customer1, customer2, customer3];
        
        for (uint i = 0; i < users.length; i++) {
            vm.prank(users[i]);
            faucet.getTON();
            
            assertEq(tonToken.balanceOf(users[i]), 100 * 1e18);
        }
    }
    
    // ==================== 스팟 생성 → 클레임 통합 ====================
    
    function testSpotCreationAndClaim() public {
        // 1. 점주가 Faucet에서 TON 받고 스팟 생성
        vm.prank(spotCreator1);
        faucet.getTON();
        
        vm.startPrank(spotCreator1);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false,
            Tokamon.SpotMetadata("Cafe", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();

        // 2. 고객이 클레임
        uint256 customerBalanceBefore = tonToken.balanceOf(customer1);
        
        vm.prank(admin);
        tokamon.claim(spotId, customer1);
        
        uint256 customerBalanceAfter = tonToken.balanceOf(customer1);
        
        // 3. 검증: 고객이 TON 받음
        assertEq(customerBalanceAfter - customerBalanceBefore, 10 * 1e18);
    }
    
    function testMultipleSpotsClaims() public {
        // 여러 점주가 스팟 생성
        address[2] memory creators = [spotCreator1, spotCreator2];
        
        for (uint i = 0; i < creators.length; i++) {
            vm.prank(creators[i]);
            faucet.getTON();
            
            vm.startPrank(creators[i]);
            tonToken.approve(address(tokamon), 100 * 1e18);

            tokamon.createSpotSelf(
                100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false,
                Tokamon.SpotMetadata("Spot", "Test", 0, 0, "00:00", "23:59")
            );
            vm.stopPrank();
        }
        
        // 고객이 두 스팟 모두에서 클레임
        vm.startPrank(admin);
        tokamon.claim(0, customer1); // spotId 0
        tokamon.claim(1, customer1); // spotId 1
        vm.stopPrank();
        
        assertEq(tonToken.balanceOf(customer1), 20 * 1e18);
    }
    
    // ==================== 텔레그램 통합 ====================
    
    function testTelegramIntegration() public {
        // 1. 스팟 생성
        vm.prank(spotCreator1);
        faucet.getTON();
        
        vm.startPrank(spotCreator1);
        tonToken.approve(address(tokamon), 100 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false,
            Tokamon.SpotMetadata("Cafe", "Test", 0, 0, "00:00", "23:59")
        );

        // 2. 텔레그램으로 클레임
        bytes32 telegramHash = keccak256(abi.encodePacked("customer1_telegram"));
        tokamon.claimToTelegram(spotId, telegramHash);
        vm.stopPrank();
        
        // 3. 텔레그램-지갑 연결
        vm.prank(admin);
        tokamon.linkTelegramToWallet(telegramHash, customer1);
        
        // 4. 지갑으로 TON 클레임
        uint256 balanceBefore = tonToken.balanceOf(customer1);
        
        vm.prank(customer1);
        tokamon.claimTelegramToWallet(telegramHash);
        
        uint256 balanceAfter = tonToken.balanceOf(customer1);
        
        assertEq(balanceAfter - balanceBefore, 10 * 1e18);
    }
    
    function testTelegramAndWalletClaimSeparate() public {
        // 1. 두 개의 스팟 생성
        vm.prank(spotCreator1);
        faucet.getTON();
        
        vm.warp(block.timestamp + 61);
        
        vm.prank(spotCreator1);
        faucet.getTON();
        
        vm.startPrank(spotCreator1);
        tonToken.approve(address(tokamon), 200 * 1e18);

        uint256 spotId1 = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false,
            Tokamon.SpotMetadata("Cafe 1", "Test", 0, 0, "00:00", "23:59")
        );
        
        uint256 spotId2 = tokamon.createSpotSelf(
            100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, false,
            Tokamon.SpotMetadata("Cafe 2", "Test", 0, 0, "00:00", "23:59")
        );
        
        // 2. spotId1은 지갑으로 클레임
        vm.stopPrank();
        vm.prank(admin);
        tokamon.claim(spotId1, customer1);
        
        // 3. spotId2는 텔레그램으로 클레임
        bytes32 telegramHash = keccak256(abi.encodePacked("customer1"));
        vm.prank(spotCreator1);
        tokamon.claimToTelegram(spotId2, telegramHash);
        
        // 4. 검증
        assertEq(tonToken.balanceOf(customer1), 10 * 1e18); // 지갑 클레임
        assertEq(tokamon.getTelegramBalance(telegramHash), 10 * 1e18); // 텔레그램 클레임
    }
    
    // ==================== 스탬프 시스템 통합 ====================
    
    function testStampSystemIntegration() public {
        // 큰 예치금으로 스팟 생성
        vm.prank(spotCreator1);
        faucet.getTON();
        
        for (uint i = 0; i < 5; i++) {
            vm.warp(block.timestamp + 61);
            vm.prank(spotCreator1);
            faucet.getTON();
        }
        
        vm.startPrank(spotCreator1);
        tonToken.approve(address(tokamon), 600 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            600 * 1e18, 10 * 1e18, 5, 100 * 1e18, 0, true, // stampBonus = 100 TON
            Tokamon.SpotMetadata("Cafe", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        
        uint256 balanceBefore = tonToken.balanceOf(customer1);
        
        // 5번 클레임하여 스탬프 완성
        vm.startPrank(admin);
        for (uint i = 0; i < 5; i++) {
            tokamon.claim(spotId, customer1);
        }
        vm.stopPrank();
        
        uint256 balanceAfter = tonToken.balanceOf(customer1);
        
        // 10 * 4 + (10 + 100) = 150 TON
        assertEq(balanceAfter - balanceBefore, 150 * 1e18);
        
        // 스탬프 리셋 확인
        (uint256 stamps, , , ) = tokamon.getStampInfo(spotId, customer1);
        assertEq(stamps, 0);
    }
    
    // ==================== 재예치 통합 ====================
    
    function testRedepositAndContinueClaims() public {
        // 작은 예치금으로 스팟 생성
        vm.prank(spotCreator1);
        faucet.getTON();
        
        vm.startPrank(spotCreator1);
        tonToken.approve(address(tokamon), 20 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            20 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, true,
            Tokamon.SpotMetadata("Cafe", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();

        // 2번 클레임 (잔액 소진 직전)
        vm.startPrank(admin);
        tokamon.claim(spotId, customer1);
        tokamon.claim(spotId, customer2);
        vm.stopPrank();

        // 재예치
        vm.startPrank(spotCreator1);
        tonToken.approve(address(tokamon), 80 * 1e18);
        tokamon.redepositSelf(spotId, 80 * 1e18);
        vm.stopPrank();
        
        // 계속 클레임 가능
        vm.prank(admin);
        tokamon.claim(spotId, customer3);
        
        assertEq(tonToken.balanceOf(customer3), 10 * 1e18);
    }
    
    // ==================== 복잡한 시나리오 ====================
    
    function testComplexScenario() public {
        // 시나리오: 여러 사용자가 Faucet 사용 → 스팟 생성 → 다양한 클레임
        
        // 1. 두 점주가 Faucet에서 TON 받고 스팟 생성
        address[2] memory creators = [spotCreator1, spotCreator2];
        
        for (uint i = 0; i < creators.length; i++) {
            vm.prank(creators[i]);
            faucet.getTON();
            
            vm.warp(block.timestamp + 61);
            
            vm.prank(creators[i]);
            faucet.getTON();
            
            vm.startPrank(creators[i]);
            tonToken.approve(address(tokamon), 200 * 1e18);

            tokamon.createSpotSelf(
                200 * 1e18, 10 * 1e18, 3, 30 * 1e18, 60, false,
                Tokamon.SpotMetadata(
                    i == 0 ? "Cafe A" : "Cafe B",
                    "Test",
                    int256(i) * 1000000,
                    int256(i) * 1000000,
                    "09:00",
                    "21:00"
                )
            );
            vm.stopPrank();
        }
        
        // 2. customer1이 두 스팟에서 클레임
        vm.startPrank(admin);
        tokamon.claim(0, customer1);
        tokamon.claim(1, customer1);
        vm.stopPrank();
        
        assertEq(tonToken.balanceOf(customer1), 20 * 1e18);
        
        // 3. 쿨다운 경과 후 다시 클레임
        vm.warp(block.timestamp + 61);
        
        vm.startPrank(admin);
        tokamon.claim(0, customer1);
        tokamon.claim(1, customer1);
        vm.stopPrank();
        
        assertEq(tonToken.balanceOf(customer1), 40 * 1e18);
        
        // 4. customer2가 텔레그램으로 클레임
        bytes32 telegramHash = keccak256(abi.encodePacked("customer2"));
        
        vm.prank(spotCreator1);
        tokamon.claimToTelegram(0, telegramHash);
        
        assertEq(tokamon.getTelegramBalance(telegramHash), 10 * 1e18);
        
        // 5. 텔레그램-지갑 연결 및 인출
        vm.prank(admin);
        tokamon.linkTelegramToWallet(telegramHash, customer2);
        
        vm.prank(customer2);
        tokamon.claimTelegramToWallet(telegramHash);
        
        assertEq(tonToken.balanceOf(customer2), 10 * 1e18);
    }
    
    // ==================== 에러 상황 통합 테스트 ====================
    
    function testSpotExhaustedThenRedeposit() public {
        // 작은 예치금으로 스팟 생성
        vm.prank(spotCreator1);
        faucet.getTON();
        
        vm.startPrank(spotCreator1);
        tonToken.approve(address(tokamon), 15 * 1e18);

        uint256 spotId = tokamon.createSpotSelf(
            15 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, true,
            Tokamon.SpotMetadata("Cafe", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();

        // 첫 번째 클레임 성공
        vm.prank(admin);
        tokamon.claim(spotId, customer1);

        // 두 번째 클레임 실패 (잔액 부족)
        vm.prank(admin);
        vm.expectRevert("spot exhausted");
        tokamon.claim(spotId, customer2);

        // 재예치
        vm.startPrank(spotCreator1);
        tonToken.approve(address(tokamon), 85 * 1e18);
        tokamon.redepositSelf(spotId, 85 * 1e18);
        vm.stopPrank();
        
        // 다시 클레임 가능
        vm.prank(admin);
        tokamon.claim(spotId, customer2);
        
        assertEq(tonToken.balanceOf(customer2), 10 * 1e18);
    }
}
