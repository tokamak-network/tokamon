// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/TONToken.sol";
import "../src/Tokamon.sol";
import "../src/Faucet.sol";

/**
 * @title DeployTestnet
 * @notice 테스트넷 배포 (Sepolia, Titan Testnet 등). Faucet 포함, PRIVATE_KEY·RPC_URL 필수.
 */
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        uint256 chainId = vm.envOr("CHAIN_ID", uint256(1337));

        vm.startBroadcast(deployerPrivateKey);

        // 1. TON 토큰 배포
        console.log("\n=== [Testnet] Deploying TON Token ===");
        TONToken tonToken = new TONToken();
        console.log("TON Token deployed at:", address(tonToken));

        // 2. Tokamon 컨트랙트 배포
        console.log("\n=== [Testnet] Deploying Tokamon ===");
        Tokamon tokamon = new Tokamon(address(tonToken));
        console.log("Tokamon deployed at:", address(tokamon));

        // 3. Faucet 배포 (테스트넷에서 테스트용 TON/ETH 지급)
        uint256 faucetEth = vm.envOr("FAUCET_ETH", uint256(1 ether));
        console.log("\n=== [Testnet] Deploying Faucet (ETH:", faucetEth / 1 ether, ") ===");
        Faucet faucet = new Faucet{value: faucetEth}(address(tokamon), address(tonToken));
        uint256 faucetTon = vm.envOr("FAUCET_TON", uint256(10_000 * 1e18));
        tonToken.transfer(address(faucet), faucetTon);
        console.log("Faucet deployed at:", address(faucet), "TON:", faucetTon / 1e18);

        vm.stopBroadcast();

        _writeAddresses(address(tonToken), address(tokamon), address(faucet), chainId);
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
