// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IERC20.sol";

interface ITokamon {
    function deposit(address user, uint256 amount) external;
}

/**
 * @title Faucet
 * @notice 테스트용 ETH와 TON을 사용자에게 지급하는 컨트랙트
 */
contract Faucet {
    uint256 public constant ETH_AMOUNT = 1 ether;
    uint256 public constant TON_AMOUNT = 100 ether;

    ITokamon public tokamonContract;
    IERC20 public tonToken;

    // 각 사용자의 마지막 요청 시간 (스팸 방지)
    mapping(address => uint256) public lastETHRequest;
    mapping(address => uint256) public lastTONRequest;

    // 쿨다운 시간 (1분)
    uint256 public constant COOLDOWN = 1 minutes;

    event ETHDispensed(address indexed user, uint256 amount);
    event TONDispensed(address indexed user, uint256 amount);

    constructor(address _tokamonAddress, address _tonToken) payable {
        tokamonContract = ITokamon(_tokamonAddress);
        tonToken = IERC20(_tonToken);
    }

    /**
     * @notice 사용자에게 ETH 지급
     */
    function getETH() external {
        // 첫 요청이 아닌 경우에만 쿨다운 체크
        if (lastETHRequest[msg.sender] != 0) {
            require(
                block.timestamp >= lastETHRequest[msg.sender] + COOLDOWN,
                "ETH Faucet: Cooldown in progress"
            );
        }
        require(address(this).balance >= ETH_AMOUNT, "ETH Faucet: Insufficient balance");

        lastETHRequest[msg.sender] = block.timestamp;

        payable(msg.sender).transfer(ETH_AMOUNT);

        emit ETHDispensed(msg.sender, ETH_AMOUNT);
    }

    /**
     * @notice 사용자에게 TON 지급 (사용자 지갑으로 직접 전송)
     */
    function getTON() external {
        // 첫 요청이 아닌 경우에만 쿨다운 체크
        if (lastTONRequest[msg.sender] != 0) {
            require(
                block.timestamp >= lastTONRequest[msg.sender] + COOLDOWN,
                "TON Faucet: Cooldown in progress"
            );
        }
        require(tonToken.balanceOf(address(this)) >= TON_AMOUNT, "TON Faucet: Insufficient balance");

        lastTONRequest[msg.sender] = block.timestamp;

        // 사용자 지갑으로 직접 TON 전송
        require(tonToken.transfer(msg.sender, TON_AMOUNT), "TON transfer failed");

        emit TONDispensed(msg.sender, TON_AMOUNT);
    }

    /**
     * @notice 관리자가 Faucet에 ETH 충전
     */
    function refill() external payable {
        require(msg.value > 0, "Faucet: Cannot refill with 0 ETH");
    }

    /**
     * @notice Faucet 잔액 조회
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice 사용자의 다음 ETH 요청 가능 시간 조회
     */
    function getNextETHRequestTime(address user) external view returns (uint256) {
        uint256 lastRequest = lastETHRequest[user];
        if (lastRequest == 0) return 0;
        return lastRequest + COOLDOWN;
    }

    /**
     * @notice 사용자의 다음 TON 요청 가능 시간 조회
     */
    function getNextTONRequestTime(address user) external view returns (uint256) {
        uint256 lastRequest = lastTONRequest[user];
        if (lastRequest == 0) return 0;
        return lastRequest + COOLDOWN;
    }
}
