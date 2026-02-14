// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title Faucet
 * @notice 테스트용 네이티브 TON을 사용자에게 지급하는 컨트랙트
 */
contract Faucet {
    uint256 public constant AMOUNT = 100 ether;

    error InsufficientBalance();
    error TransferFailed();
    error InvalidInput();

    event ETHDispensed(address indexed user, uint256 amount);

    constructor() payable {}

    function getEth() external {
        if (address(this).balance < AMOUNT) revert InsufficientBalance();
        (bool ok, ) = payable(msg.sender).call{value: AMOUNT}("");
        if (!ok) revert TransferFailed();
        emit ETHDispensed(msg.sender, AMOUNT);
    }

    function refill() external payable {
        if (msg.value == 0) revert InvalidInput();
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
