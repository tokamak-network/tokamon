// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Tokamon} from "../src/Tokamon.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeProduction
 * @notice 프로덕션에서 Tokamon UUPS 프록시를 새 구현으로 업그레이드.
 *         PRIVATE_KEY, RPC_URL, PROXY_ADDRESS 환경변수 필수.
 *
 * Usage:
 *   export PRIVATE_KEY=0x...
 *   export RPC_URL=https://...
 *   export PROXY_ADDRESS=0x...
 *   forge script script/UpgradeProduction.s.sol:UpgradeProduction --rpc-url $RPC_URL --broadcast
 */
contract UpgradeProduction is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address proxyAddress = vm.envAddress("PROXY_ADDRESS");

        console.log("\n=== [Production] Upgrading Tokamon ===");
        console.log("Proxy address:", proxyAddress);

        vm.startBroadcast(deployerPrivateKey);

        Tokamon newImplementation = new Tokamon();
        console.log("New implementation deployed at:", address(newImplementation));

        UUPSUpgradeable(proxyAddress).upgradeToAndCall(
            address(newImplementation),
            bytes("")
        );
        console.log("Proxy upgraded successfully!");

        vm.stopBroadcast();

        // 업그레이드 후 상태 확인
        Tokamon proxy = Tokamon(payable(proxyAddress));
        console.log("Admin:", proxy.admin());
        console.log("Next Spot ID:", proxy.nextSpotId());
    }
}
