// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/TONToken.sol";
import "../src/Tokamon.sol";
import "../src/Faucet.sol";

/**
 * @title E2ETest
 * @notice 전체 시스템의 End-to-End 테스트
 * @dev 실제 사용 시나리오를 시뮬레이션
 */
contract E2ETest is Test {
    TONToken public tonToken;
    Tokamon public tokamon;
    Faucet public faucet;
    
    address admin;
    address cafeOwner;
    address restaurantOwner;
    address alice;
    address bob;
    address charlie;
    
    function setUp() public {
        admin = address(this);
        cafeOwner = makeAddr("cafeOwner");
        restaurantOwner = makeAddr("restaurantOwner");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        charlie = makeAddr("charlie");
        
        // 시스템 배포
        tonToken = new TONToken();
        tokamon = new Tokamon(address(tonToken));
        faucet = new Faucet{value: 1000 ether}(address(tokamon), address(tonToken));
        
        // Faucet에 TON 충전 (1,000,000 TON)
        tonToken.transfer(address(faucet), 1000000 * 1e18);
        
        // 모든 계정에 ETH 지급
        vm.deal(cafeOwner, 10 ether);
        vm.deal(restaurantOwner, 10 ether);
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);
        vm.deal(charlie, 1 ether);
    }
    
    // ==================== 시나리오 1: 카페 오너의 첫 스팟 생성 ====================
    
    function testScenario1_CafeOwnerFirstSpot() public {
        console.log("\n=== Scenario 1: Cafe Owner Creates First Spot ===");
        
        // 1. 카페 오너가 Faucet에서 테스트 TON 받기
        console.log("1. Cafe owner gets TON from faucet");
        vm.prank(cafeOwner);
        faucet.getTON();
        
        uint256 tonBalance = tonToken.balanceOf(cafeOwner);
        console.log("   Received TON:", tonBalance / 1e18);
        assertEq(tonBalance, 100 * 1e18);
        
        // 2. Tokamon에 입금
        console.log("2. Cafe owner deposits TON to Tokamon");
        vm.startPrank(cafeOwner);
        tonToken.approve(address(tokamon), 100 * 1e18);
        tokamon.depositSelf(100 * 1e18);
        vm.stopPrank();
        
        uint256 internalBalance = tokamon.getBalance(cafeOwner);
        console.log("   Internal balance:", internalBalance / 1e18);
        assertEq(internalBalance, 100 * 1e18);
        
        // 3. 스팟 생성 (스탬프 5개 모으면 보너스)
        console.log("3. Cafe owner creates spot");
        vm.prank(cafeOwner);
        uint256 spotId = tokamon.createSpotSelf(
            100 * 1e18,  // 총 예치금
            10 * 1e18,   // 방문당 보상
            5,           // 스탬프 목표
            50 * 1e18,   // 스탬프 보너스
            3600,        // 쿨다운 1시간
            false,       // 중복 발행 불가
            Tokamon.SpotMetadata({
                name: "Zena's Cafe",
                description: "Best coffee in town",
                lat: 37541000,  // 강남역
                lng: 127068000,
                startTime: "08:00",
                endTime: "22:00"
            })
        );
        
        console.log("   Spot ID created:", spotId);
        assertEq(spotId, 0);
        
        (address creator, uint256 reward, uint256 remaining, , , , ) = tokamon.getSpotCore(spotId);
        console.log("   Spot creator:", creator);
        console.log("   Reward per visit:", reward / 1e18, "TON");
        console.log("   Remaining balance:", remaining / 1e18, "TON");
        
        assertEq(creator, cafeOwner);
    }
    
    // ==================== 시나리오 2: Alice의 카페 방문 여정 ====================
    
    function testScenario2_AliceVisitsMultipleTimes() public {
        console.log("\n=== Scenario 2: Alice Visits Cafe Multiple Times ===");
        
        // 스팟 생성 (준비)
        _setupCafeSpot();
        
        uint256 spotId = 0;
        
        // 1. Alice 첫 방문
        console.log("\n1. Alice's first visit");
        uint256 aliceBalanceBefore = tonToken.balanceOf(alice);
        
        vm.prank(admin);  // 서버가 위치 검증 후 클레임
        tokamon.claim(spotId, alice);
        
        uint256 aliceBalanceAfter = tonToken.balanceOf(alice);
        console.log("   Alice received:", (aliceBalanceAfter - aliceBalanceBefore) / 1e18, "TON");
        
        (uint256 stamps, uint256 goal, , ) = tokamon.getStampInfo(spotId, alice);
        console.log("   Stamps:", stamps, "/", goal);
        
        assertEq(aliceBalanceAfter - aliceBalanceBefore, 10 * 1e18);
        assertEq(stamps, 1);
        
        // 2. 쿨다운 중 재방문 시도 (실패)
        console.log("\n2. Alice tries to visit again (too soon)");
        vm.prank(admin);
        vm.expectRevert("cooldown not elapsed");
        tokamon.claim(spotId, alice);
        console.log("   Blocked by cooldown");
        
        // 3. 1시간 후 두 번째 방문
        console.log("\n3. Alice's second visit (after 1 hour)");
        vm.warp(block.timestamp + 3601);
        
        vm.prank(admin);
        tokamon.claim(spotId, alice);
        
        (stamps, , , ) = tokamon.getStampInfo(spotId, alice);
        console.log("   Stamps:", stamps, "/", goal);
        assertEq(stamps, 2);
        
        // 4. 5번 방문하여 스탬프 완성
        console.log("\n4. Alice completes stamp card");
        for (uint i = 0; i < 3; i++) {
            vm.warp(block.timestamp + 3601);
            vm.prank(admin);
            tokamon.claim(spotId, alice);
        }
        
        uint256 finalBalance = tonToken.balanceOf(alice);
        console.log("   Total received:", (finalBalance - aliceBalanceBefore) / 1e18, "TON");
        console.log("   (4 visits x 10 TON) + (1 visit x 60 TON bonus) = 100 TON");
        
        // 10 * 4 + (10 + 50) = 100 TON
        assertEq(finalBalance - aliceBalanceBefore, 100 * 1e18);
        
        (stamps, , , ) = tokamon.getStampInfo(spotId, alice);
        console.log("   Stamps reset:", stamps);
        assertEq(stamps, 0);
    }
    
    // ==================== 시나리오 3: Bob의 텔레그램 사용 ====================
    
    function testScenario3_BobUsesTelegram() public {
        console.log("\n=== Scenario 3: Bob Uses Telegram (No Wallet) ===");
        
        // 스팟 생성
        _setupCafeSpot();
        
        uint256 spotId = 0;
        bytes32 bobTelegram = keccak256(abi.encodePacked("bob_telegram_id"));
        
        // 1. Bob이 텔레그램으로 카페 방문 (지갑 없음)
        console.log("\n1. Bob visits cafe via Telegram (no wallet yet)");
        
        vm.prank(cafeOwner);  // 카페 오너가 Bob의 텔레그램 ID로 클레임
        tokamon.claimToTelegram(spotId, bobTelegram);
        
        uint256 telegramBalance = tokamon.getTelegramBalance(bobTelegram);
        console.log("   Bob's Telegram balance:", telegramBalance / 1e18, "TON");
        assertEq(telegramBalance, 10 * 1e18);
        
        // 2. Bob이 여러 번 방문
        console.log("\n2. Bob visits 4 more times");
        for (uint i = 0; i < 4; i++) {
            vm.warp(block.timestamp + 3601);
            vm.prank(cafeOwner);
            tokamon.claimToTelegram(spotId, bobTelegram);
        }
        
        telegramBalance = tokamon.getTelegramBalance(bobTelegram);
        console.log("   Bob's Telegram balance:", telegramBalance / 1e18, "TON");
        console.log("   (4 x 10 TON) + (1 x 60 TON bonus) = 100 TON");
        assertEq(telegramBalance, 100 * 1e18);
        
        // 3. Bob이 나중에 지갑 생성 및 연결
        console.log("\n3. Bob creates wallet and links Telegram");
        vm.prank(admin);
        tokamon.linkTelegramToWallet(bobTelegram, bob);
        
        address linkedWallet = tokamon.getTelegramLinkedWallet(bobTelegram);
        console.log("   Linked wallet:", linkedWallet);
        assertEq(linkedWallet, bob);
        
        // 4. Bob이 지갑으로 TON 인출
        console.log("\n4. Bob claims TON to his wallet");
        uint256 bobWalletBefore = tonToken.balanceOf(bob);
        
        vm.prank(bob);
        tokamon.claimTelegramToWallet(bobTelegram);
        
        uint256 bobWalletAfter = tonToken.balanceOf(bob);
        console.log("   Bob's wallet balance:", bobWalletAfter / 1e18, "TON");
        assertEq(bobWalletAfter - bobWalletBefore, 100 * 1e18);
        assertEq(tokamon.getTelegramBalance(bobTelegram), 0);
    }
    
    // ==================== 시나리오 4: 여러 매장 투어 ====================
    
    function testScenario4_MultipleStoresTour() public {
        console.log("\n=== Scenario 4: Charlie Visits Multiple Stores ===");
        
        // 1. 카페와 레스토랑 스팟 생성
        console.log("\n1. Setup: Cafe and Restaurant create spots");
        
        // 카페 스팟
        vm.prank(cafeOwner);
        faucet.getTON();
        
        vm.startPrank(cafeOwner);
        tonToken.approve(address(tokamon), 100 * 1e18);
        tokamon.depositSelf(100 * 1e18);
        uint256 cafeSpotId = tokamon.createSpotSelf(
            100 * 1e18, 5 * 1e18, 10, 50 * 1e18, 1800, false,
            Tokamon.SpotMetadata("Zena's Cafe", "Coffee", 37541000, 127068000, "08:00", "22:00")
        );
        vm.stopPrank();
        
        // 레스토랑 스팟
        vm.prank(restaurantOwner);
        faucet.getTON();
        
        vm.startPrank(restaurantOwner);
        tonToken.approve(address(tokamon), 100 * 1e18);
        tokamon.depositSelf(100 * 1e18);
        uint256 restaurantSpotId = tokamon.createSpotSelf(
            100 * 1e18, 15 * 1e18, 5, 100 * 1e18, 3600, false,
            Tokamon.SpotMetadata("Bob's Restaurant", "Food", 37542000, 127069000, "11:00", "23:00")
        );
        vm.stopPrank();
        
        console.log("   Cafe spot ID:", cafeSpotId);
        console.log("   Restaurant spot ID:", restaurantSpotId);
        
        // 2. Charlie가 카페 방문
        console.log("\n2. Charlie visits cafe");
        vm.prank(admin);
        tokamon.claim(cafeSpotId, charlie);
        
        uint256 charlieBalance = tonToken.balanceOf(charlie);
        console.log("   Charlie's balance:", charlieBalance / 1e18, "TON");
        assertEq(charlieBalance, 5 * 1e18);
        
        // 3. 같은 시간대에 레스토랑도 방문 (다른 스팟이므로 가능)
        console.log("\n3. Charlie visits restaurant (same time)");
        vm.prank(admin);
        tokamon.claim(restaurantSpotId, charlie);
        
        charlieBalance = tonToken.balanceOf(charlie);
        console.log("   Charlie's balance:", charlieBalance / 1e18, "TON");
        assertEq(charlieBalance, 20 * 1e18);  // 5 + 15
        
        // 4. 30분 후 카페 재방문 (쿨다운 30분)
        console.log("\n4. Charlie revisits cafe (after 30 minutes)");
        vm.warp(block.timestamp + 1801);
        
        vm.prank(admin);
        tokamon.claim(cafeSpotId, charlie);
        
        charlieBalance = tonToken.balanceOf(charlie);
        console.log("   Charlie's balance:", charlieBalance / 1e18, "TON");
        assertEq(charlieBalance, 25 * 1e18);  // 5 + 15 + 5
    }
    
    // ==================== 시나리오 5: 매장 잔액 관리 ====================
    
    function testScenario5_SpotBalanceManagement() public {
        console.log("\n=== Scenario 5: Store Owner Manages Balance ===");
        
        // 1. 작은 예치금으로 스팟 생성
        console.log("\n1. Cafe owner creates spot with small deposit");
        vm.prank(cafeOwner);
        faucet.getTON();
        
        vm.startPrank(cafeOwner);
        tonToken.approve(address(tokamon), 100 * 1e18);
        tokamon.depositSelf(100 * 1e18);
        uint256 spotId = tokamon.createSpotSelf(
            30 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, true,
            Tokamon.SpotMetadata("Cafe", "Test", 0, 0, "00:00", "23:59")
        );
        vm.stopPrank();
        
        (, , uint256 remaining, , , , ) = tokamon.getSpotCore(spotId);
        console.log("   Initial balance:", remaining / 1e18, "TON");
        
        // 2. 고객들이 방문
        console.log("\n2. Customers visit (balance depleting)");
        vm.startPrank(admin);
        tokamon.claim(spotId, alice);
        tokamon.claim(spotId, bob);
        vm.stopPrank();
        
        (, , remaining, , , , ) = tokamon.getSpotCore(spotId);
        console.log("   After 2 claims:", remaining / 1e18, "TON");
        assertEq(remaining, 10 * 1e18);
        
        // 3. 잔액 부족 발생
        console.log("\n3. Balance exhausted");
        vm.prank(admin);
        tokamon.claim(spotId, charlie);
        
        (, , remaining, , , , ) = tokamon.getSpotCore(spotId);
        console.log("   After 3 claims:", remaining / 1e18, "TON");
        assertEq(remaining, 0);
        
        // 4. 추가 클레임 시도 (실패)
        vm.prank(admin);
        vm.expectRevert("spot exhausted");
        tokamon.claim(spotId, alice);
        console.log("   Further claims blocked");
        
        // 5. 재예치
        console.log("\n4. Owner redeposits TON");
        vm.prank(cafeOwner);
        tokamon.redepositSelf(spotId, 70 * 1e18);
        
        (, , remaining, , , , ) = tokamon.getSpotCore(spotId);
        console.log("   After redeposit:", remaining / 1e18, "TON");
        assertEq(remaining, 70 * 1e18);
        
        // 6. 다시 클레임 가능
        console.log("\n5. Claims resume");
        vm.prank(admin);
        tokamon.claim(spotId, alice);
        
        (, , remaining, , , , ) = tokamon.getSpotCore(spotId);
        console.log("   After claim:", remaining / 1e18, "TON");
        assertEq(remaining, 60 * 1e18);
    }
    
    // ==================== 시나리오 6: 전체 시스템 스트레스 테스트 ====================
    
    function testScenario6_SystemStressTest() public {
        console.log("\n=== Scenario 6: System Stress Test ===");
        
        // 1. 10개의 스팟 생성
        console.log("\n1. Creating 10 spots");
        address[10] memory owners;
        
        for (uint i = 0; i < 10; i++) {
            owners[i] = makeAddr(string(abi.encodePacked("owner_", i)));
            vm.deal(owners[i], 1 ether);
            
            vm.prank(owners[i]);
            faucet.getTON();
            
            vm.startPrank(owners[i]);
            tonToken.approve(address(tokamon), 100 * 1e18);
            tokamon.depositSelf(100 * 1e18);
            tokamon.createSpotSelf(
                100 * 1e18, 10 * 1e18, 5, 50 * 1e18, 0, true,
                Tokamon.SpotMetadata(
                    string(abi.encodePacked("Spot ", i)),
                    "Test",
                    int256(i) * 1000000,
                    int256(i) * 1000000,
                    "00:00",
                    "23:59"
                )
            );
            vm.stopPrank();
            
            vm.warp(block.timestamp + 61);
        }
        
        console.log("   10 spots created successfully");
        
        // 2. Alice가 모든 스팟 방문
        console.log("\n2. Alice visits all 10 spots");
        uint256 aliceBalanceBefore = tonToken.balanceOf(alice);
        
        vm.startPrank(admin);
        for (uint i = 0; i < 10; i++) {
            tokamon.claim(i, alice);
        }
        vm.stopPrank();
        
        uint256 aliceBalanceAfter = tonToken.balanceOf(alice);
        console.log("   Alice received:", (aliceBalanceAfter - aliceBalanceBefore) / 1e18, "TON");
        assertEq(aliceBalanceAfter - aliceBalanceBefore, 100 * 1e18);
        
        // 3. 100명의 사용자가 Faucet 사용
        console.log("\n3. 100 users use faucet");
        for (uint i = 0; i < 100; i++) {
            address user = makeAddr(string(abi.encodePacked("faucet_user_", i)));
            vm.prank(user);
            faucet.getTON();
            vm.warp(block.timestamp + 1);
        }
        
        console.log("   100 faucet requests processed");
    }
    
    // ==================== Helper Functions ====================
    
    function _setupCafeSpot() internal {
        // 충분한 TON 받기 (5회 x 100 = 500 TON)
        vm.prank(cafeOwner);
        faucet.getTON();
        
        for (uint i = 0; i < 4; i++) {
            vm.warp(block.timestamp + 61);
            vm.prank(cafeOwner);
            faucet.getTON();
        }
        
        // 스팟 생성
        vm.startPrank(cafeOwner);
        tonToken.approve(address(tokamon), 500 * 1e18);
        tokamon.depositSelf(500 * 1e18);
        tokamon.createSpotSelf(
            500 * 1e18, 10 * 1e18, 5, 50 * 1e18, 3600, false,
            Tokamon.SpotMetadata("Zena's Cafe", "Coffee", 37541000, 127068000, "08:00", "22:00")
        );
        vm.stopPrank();
    }
}
