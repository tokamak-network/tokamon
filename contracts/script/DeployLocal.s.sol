// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/TONToken.sol";
import "../src/Tokamon.sol";
import "../src/Faucet.sol";

/**
 * @title DeployLocal
 * @notice 로컬 개발용 배포 (Anvil). Faucet + 테스트 계정 ETH 지급 포함.
 */
contract DeployLocal is Script {
    uint256 constant CHAIN_ID = 1337;

    function run() external {
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        vm.startBroadcast(deployerPrivateKey);

        // 1. TON 토큰 배포
        console.log("\n=== [Local] Deploying TON Token ===");
        TONToken tonToken = new TONToken();
        console.log("TON Token deployed at:", address(tonToken));

        // 2. Tokamon 컨트랙트 배포
        console.log("\n=== [Local] Deploying Tokamon ===");
        Tokamon tokamon = new Tokamon(address(tonToken));
        console.log("Tokamon deployed at:", address(tokamon));

        // 3. Faucet 배포 (로컬 테스트용)
        console.log("\n=== [Local] Deploying Faucet ===");
        Faucet faucet = new Faucet{value: 1000 ether}(address(tokamon), address(tonToken));
        tonToken.transfer(address(faucet), 100_000 * 1e18);
        console.log("Faucet deployed at:", address(faucet));

        // 4. 테스트 계정에 초기 ETH 지급
        address testAccount1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        address testAccount2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
        payable(testAccount1).transfer(100 ether);
        payable(testAccount2).transfer(100 ether);
        console.log("Test accounts funded");

        vm.stopBroadcast();

        _writeAddresses(address(tonToken), address(tokamon), address(faucet), CHAIN_ID);
    }

    function _writeAddresses(
        address tonToken,
        address tokamon,
        address faucet,
        uint256 chainId
    ) internal {
        string memory addresses = string(
            abi.encodePacked(
                '{\n',
                '  "tonToken": "', vm.toString(tonToken), '",\n',
                '  "tokamon": "', vm.toString(tokamon), '",\n',
                '  "faucet": "', vm.toString(faucet), '",\n',
                '  "address": "', vm.toString(tokamon), '",\n',
                '  "tonContract": null,\n',
                '  "chainId": ', vm.toString(chainId), '\n',
                '}'
            )
        );
        vm.writeFile("../server/contract-address.json", addresses);
        console.log("Addresses saved to server/contract-address.json (chainId:", chainId, ")");
    }
}
