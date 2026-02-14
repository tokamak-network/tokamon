// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Tokamon} from "../src/Tokamon.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployProduction
 * @notice 프로덕션 배포. Tokamon만 배포, Faucet 없음.
 */
contract DeployProduction is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        uint256 chainId = vm.envUint("CHAIN_ID");

        vm.startBroadcast(deployerPrivateKey);

        console.log("\n=== [Production] Deploying Tokamon (UUPS Proxy) ===");
        Tokamon implementation = new Tokamon();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeCall(Tokamon.initialize, ())
        );
        Tokamon tokamon = Tokamon(payable(address(proxy)));
        console.log("Tokamon proxy deployed at:", address(tokamon));
        console.log("Tokamon implementation at:", address(implementation));

        vm.stopBroadcast();

        _writeAddresses(address(tokamon), chainId);
    }

    function _writeAddresses(address tokamon, uint256 chainId) internal {
        string memory addresses = string(
            abi.encodePacked(
                '{\n',
                '  "tokamon": "', vm.toString(tokamon), '",\n',
                '  "faucet": null,\n',
                '  "address": "', vm.toString(tokamon), '",\n',
                '  "chainId": ', vm.toString(chainId), '\n',
                '}'
            )
        );
        /// forge-lint: disable-next-line(unsafe-cheatcode)
        vm.writeFile("../listener-server/contract-address.json", addresses);
        console.log("Addresses saved to listener-server/contract-address.json (chainId:", chainId, ")");
    }
}
