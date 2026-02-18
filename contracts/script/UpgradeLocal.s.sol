// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Tokamon} from "../src/Tokamon.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeLocal
 * @notice 로컬 Anvil 환경에서 Tokamon UUPS 프록시를 새 구현으로 업그레이드.
 *         PROXY_ADDRESS 환경변수 또는 contract-address.json에서 프록시 주소를 읽음.
 */
contract UpgradeLocal is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        address proxyAddress = vm.envOr(
            "PROXY_ADDRESS",
            address(0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512)
        );

        console.log("\n=== [Local] Upgrading Tokamon ===");
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
