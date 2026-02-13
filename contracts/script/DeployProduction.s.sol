// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/TONToken.sol";
import "../src/Tokamon.sol";

/**
 * @title DeployProduction
 * @notice 서비스(프로덕션) 배포. Tokamon + TONToken만 배포, Faucet 없음.
 */
contract DeployProduction is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        uint256 chainId = vm.envUint("CHAIN_ID");

        vm.startBroadcast(deployerPrivateKey);

        // 1. TON 토큰 배포
        console.log("\n=== [Production] Deploying TON Token ===");
        TONToken tonToken = new TONToken();
        console.log("TON Token deployed at:", address(tonToken));

        // 2. Tokamon 컨트랙트 배포
        console.log("\n=== [Production] Deploying Tokamon ===");
        Tokamon tokamon = new Tokamon(address(tonToken));
        console.log("Tokamon deployed at:", address(tokamon));

        vm.stopBroadcast();

        _writeAddresses(address(tonToken), address(tokamon), chainId);
    }

    function _writeAddresses(address tonToken, address tokamon, uint256 chainId) internal {
        string memory addresses = string(
            abi.encodePacked(
                '{\n',
                '  "tonToken": "', vm.toString(tonToken), '",\n',
                '  "tokamon": "', vm.toString(tokamon), '",\n',
                '  "faucet": null,\n',
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
