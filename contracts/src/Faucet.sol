// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IERC20} from "./interfaces/IERC20.sol";

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

    error InsufficientBalance();
    error TransferFailed();
    error InvalidInput();

    event ETHDispensed(address indexed user, uint256 amount);
    event TONDispensed(address indexed user, uint256 amount);

    constructor(address _tokamonAddress, address _tonToken) payable {
        tokamonContract = ITokamon(_tokamonAddress);
        tonToken = IERC20(_tonToken);
    }

    function getEth() external {
        if (address(this).balance < ETH_AMOUNT) revert InsufficientBalance();
        (bool ok, ) = payable(msg.sender).call{value: ETH_AMOUNT}("");
        if (!ok) revert TransferFailed();
        emit ETHDispensed(msg.sender, ETH_AMOUNT);
    }

    function getTon() external {
        if (tonToken.balanceOf(address(this)) < TON_AMOUNT) revert InsufficientBalance();
        if (!tonToken.transfer(msg.sender, TON_AMOUNT)) revert TransferFailed();
        emit TONDispensed(msg.sender, TON_AMOUNT);
    }

    function refill() external payable {
        if (msg.value == 0) revert InvalidInput();
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
