// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/TONToken.sol";
import "../src/Tokamon.sol";
import "../src/Faucet.sol";

/**
 * @title FaucetUnitTest
 * @notice Faucet 컨트랙트의 모든 기능에 대한 단위 테스트
 */
contract FaucetUnitTest is Test {
    TONToken public tonToken;
    Tokamon public tokamon;
    Faucet public faucet;
    
    address owner;
    address user1;
    address user2;
    address user3;
    
    event ETHDispensed(address indexed user, uint256 amount);
    event TONDispensed(address indexed user, uint256 amount);
    
    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        user3 = makeAddr("user3");
        
        // TON 토큰 배포
        tonToken = new TONToken();
        
        // Tokamon 컨트랙트 배포
        tokamon = new Tokamon(address(tonToken));
        
        // Faucet 컨트랙트 배포 (10 ETH 전송)
        faucet = new Faucet{value: 10 ether}(address(tokamon), address(tonToken));
        
        // Faucet에 TON 충전
        tonToken.transfer(address(faucet), 10000 * 1e18);
        
        // 테스트 사용자들에게 약간의 ETH 지급 (가스비용)
        vm.deal(user1, 0.1 ether);
        vm.deal(user2, 0.1 ether);
        vm.deal(user3, 0.1 ether);
    }
    
    // ==================== ETH Faucet 테스트 ====================
    
    function testGetETH() public {
        uint256 balanceBefore = user1.balance;
        
        vm.expectEmit(true, false, false, true);
        emit ETHDispensed(user1, 1 ether);
        
        vm.prank(user1);
        faucet.getETH();
        
        uint256 balanceAfter = user1.balance;
        
        assertEq(balanceAfter - balanceBefore, 1 ether);
    }
    
    function testGetETHMultipleUsers() public {
        vm.prank(user1);
        faucet.getETH();
        
        vm.prank(user2);
        faucet.getETH();
        
        vm.prank(user3);
        faucet.getETH();
        
        assertGe(user1.balance, 1 ether);
        assertGe(user2.balance, 1 ether);
        assertGe(user3.balance, 1 ether);
    }
    
    function testGetETHCooldown() public {
        vm.startPrank(user1);
        faucet.getETH();
        
        // 쿨다운 중 다시 요청 시도
        vm.expectRevert("ETH Faucet: Cooldown in progress");
        faucet.getETH();
        vm.stopPrank();
    }
    
    function testGetETHAfterCooldown() public {
        vm.startPrank(user1);
        faucet.getETH();
        
        // 1분 경과
        vm.warp(block.timestamp + 61);
        
        uint256 balanceBefore = user1.balance;
        
        // 다시 요청 가능
        faucet.getETH();
        vm.stopPrank();
        
        uint256 balanceAfter = user1.balance;
        
        assertEq(balanceAfter - balanceBefore, 1 ether);
    }
    
    function testGetNextETHRequestTime() public {
        vm.prank(user1);
        faucet.getETH();
        
        uint256 nextTime = faucet.getNextETHRequestTime(user1);
        assertGt(nextTime, block.timestamp);
        assertEq(nextTime, block.timestamp + 60);
    }
    
    function testGetNextETHRequestTimeNeverRequested() public {
        uint256 nextTime = faucet.getNextETHRequestTime(user1);
        assertEq(nextTime, 0);
    }
    
    // ==================== TON Faucet 테스트 (핵심 수정사항) ====================
    
    function testGetTONDirectTransfer() public {
        uint256 tonBalanceBefore = tonToken.balanceOf(user1);
        
        vm.expectEmit(true, false, false, true);
        emit TONDispensed(user1, 100 * 1e18);
        
        vm.prank(user1);
        faucet.getTON();
        
        uint256 tonBalanceAfter = tonToken.balanceOf(user1);
        
        // 핵심: 사용자 지갑으로 직접 TON 전송됨
        assertEq(tonBalanceAfter - tonBalanceBefore, 100 * 1e18, "TON should be transferred directly to wallet");
        
        // Tokamon 내부 잔액에는 적립되지 않음
        assertEq(tokamon.getBalance(user1), 0, "Tokamon internal balance should be 0");
    }
    
    function testGetTONMultipleUsers() public {
        vm.prank(user1);
        faucet.getTON();
        
        vm.prank(user2);
        faucet.getTON();
        
        vm.prank(user3);
        faucet.getTON();
        
        assertEq(tonToken.balanceOf(user1), 100 * 1e18);
        assertEq(tonToken.balanceOf(user2), 100 * 1e18);
        assertEq(tonToken.balanceOf(user3), 100 * 1e18);
    }
    
    function testGetTONCooldown() public {
        vm.startPrank(user1);
        faucet.getTON();
        
        // 쿨다운 중 다시 요청 시도
        vm.expectRevert("TON Faucet: Cooldown in progress");
        faucet.getTON();
        vm.stopPrank();
    }
    
    function testGetTONAfterCooldown() public {
        vm.startPrank(user1);
        faucet.getTON();
        
        // 1분 경과
        vm.warp(block.timestamp + 61);
        
        uint256 tonBalanceBefore = tonToken.balanceOf(user1);
        
        // 다시 요청 가능
        faucet.getTON();
        vm.stopPrank();
        
        uint256 tonBalanceAfter = tonToken.balanceOf(user1);
        
        assertEq(tonBalanceAfter - tonBalanceBefore, 100 * 1e18);
    }
    
    function testGetNextTONRequestTime() public {
        vm.prank(user1);
        faucet.getTON();
        
        uint256 nextTime = faucet.getNextTONRequestTime(user1);
        assertGt(nextTime, block.timestamp);
        assertEq(nextTime, block.timestamp + 60);
    }
    
    function testGetNextTONRequestTimeNeverRequested() public {
        uint256 nextTime = faucet.getNextTONRequestTime(user1);
        assertEq(nextTime, 0);
    }
    
    function testGetTONCanBeUsedImmediately() public {
        // Faucet에서 TON 받기
        vm.prank(user1);
        faucet.getTON();
        
        // 받은 TON으로 즉시 다른 작업 가능 (예: Tokamon에 입금)
        vm.startPrank(user1);
        tonToken.approve(address(tokamon), 100 * 1e18);
        tokamon.depositSelf(100 * 1e18);
        vm.stopPrank();
        
        assertEq(tokamon.getBalance(user1), 100 * 1e18);
    }
    
    // ==================== Faucet 관리 테스트 ====================
    
    function testFaucetBalance() public {
        uint256 balance = faucet.getBalance();
        assertGe(balance, 10 ether);
    }
    
    function testRefillETH() public {
        uint256 balanceBefore = faucet.getBalance();
        
        faucet.refill{value: 5 ether}();
        
        uint256 balanceAfter = faucet.getBalance();
        assertEq(balanceAfter - balanceBefore, 5 ether);
    }
    
    function testRefillZeroAmount() public {
        vm.expectRevert("Faucet: Cannot refill with 0 ETH");
        faucet.refill{value: 0}();
    }
    
    function testTONBalance() public {
        uint256 tonBalance = tonToken.balanceOf(address(faucet));
        assertGe(tonBalance, 10000 * 1e18);
    }
    
    // ==================== 쿨다운 독립성 테스트 ====================
    
    function testETHAndTONCooldownIndependent() public {
        vm.startPrank(user1);
        
        // ETH 요청
        faucet.getETH();
        
        // ETH 쿨다운 중이지만 TON은 요청 가능
        faucet.getTON();
        
        vm.stopPrank();
        
        assertGe(user1.balance, 1 ether);
        assertEq(tonToken.balanceOf(user1), 100 * 1e18);
    }
    
    function testTONCooldownDoesNotAffectETH() public {
        vm.startPrank(user1);
        
        // TON 요청
        faucet.getTON();
        
        // TON 쿨다운 중이지만 ETH는 요청 가능
        faucet.getETH();
        
        vm.stopPrank();
        
        assertEq(tonToken.balanceOf(user1), 100 * 1e18);
        assertGe(user1.balance, 1 ether);
    }
    
    // ==================== 에러 케이스 테스트 ====================
    
    function testRevertETHInsufficientBalance() public {
        // 모든 ETH 소진
        for (uint i = 0; i < 10; i++) {
            address user = makeAddr(string(abi.encodePacked("user_eth_", i)));
            vm.deal(user, 0.1 ether);
            vm.prank(user);
            faucet.getETH();
            vm.warp(block.timestamp + 61);
        }
        
        // 잔액 부족 시 실패
        address newUser = makeAddr("newUser");
        vm.deal(newUser, 0.1 ether);
        vm.prank(newUser);
        vm.expectRevert("ETH Faucet: Insufficient balance");
        faucet.getETH();
    }
    
    function testRevertTONInsufficientBalance() public {
        // 모든 TON 소진
        for (uint i = 0; i < 100; i++) {
            address user = makeAddr(string(abi.encodePacked("user_ton_", i)));
            vm.prank(user);
            faucet.getTON();
            vm.warp(block.timestamp + 61);
        }
        
        // 잔액 부족 시 실패
        address newUser = makeAddr("newUser");
        vm.prank(newUser);
        vm.expectRevert("TON Faucet: Insufficient balance");
        faucet.getTON();
    }
    
    // ==================== 스트레스 테스트 ====================
    
    function testManyUsersGetETH() public {
        for (uint i = 0; i < 5; i++) {
            address user = makeAddr(string(abi.encodePacked("stress_user_", i)));
            vm.deal(user, 0.1 ether);
            vm.prank(user);
            faucet.getETH();
            assertGe(user.balance, 1 ether);
        }
    }
    
    function testManyUsersGetTON() public {
        for (uint i = 0; i < 5; i++) {
            address user = makeAddr(string(abi.encodePacked("stress_user_ton_", i)));
            vm.prank(user);
            faucet.getTON();
            assertEq(tonToken.balanceOf(user), 100 * 1e18);
        }
    }
    
    function testRepeatedRequestsAfterCooldown() public {
        vm.startPrank(user1);
        
        // 5번 반복 요청
        for (uint i = 0; i < 5; i++) {
            faucet.getTON();
            vm.warp(block.timestamp + 61);
        }
        
        vm.stopPrank();
        
        assertEq(tonToken.balanceOf(user1), 500 * 1e18);
    }
}
