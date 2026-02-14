// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Tokamon} from "../src/Tokamon.sol";
import {Faucet} from "../src/Faucet.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        vm.startBroadcast(deployerPrivateKey);

        console.log("\n=== Deploying Tokamon (UUPS Proxy) ===");
        Tokamon implementation = new Tokamon();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeCall(Tokamon.initialize, ())
        );
        Tokamon tokamon = Tokamon(payable(address(proxy)));
        console.log("Tokamon proxy deployed at:", address(tokamon));
        console.log("Tokamon implementation at:", address(implementation));

        console.log("\n=== Deploying Faucet ===");
        Faucet faucet = new Faucet{value: 1000 ether}();
        console.log("Faucet deployed at:", address(faucet));
        console.log("Faucet ETH balance:", faucet.getBalance() / 1 ether, "ETH");

        console.log("\n=== Sending initial ETH to test accounts ===");
        address testAccount1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        address testAccount2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;

        payable(testAccount1).transfer(100 ether);
        payable(testAccount2).transfer(100 ether);

        console.log("Test account 1:", testAccount1, "- 100 ETH");
        console.log("Test account 2:", testAccount2, "- 100 ETH");

        vm.stopBroadcast();

        string memory addresses = string(abi.encodePacked(
            '{\n',
            '  "tokamon": "', vm.toString(address(tokamon)), '",\n',
            '  "faucet": "', vm.toString(address(faucet)), '",\n',
            '  "address": "', vm.toString(address(tokamon)), '",\n',
            '  "chainId": 1337\n',
            '}'
        ));

        /// forge-lint: disable-next-line(unsafe-cheatcode)
        vm.writeFile("../listener-server/contract-address.json", addresses);
        console.log("Addresses saved to listener-server/contract-address.json");
    }
}
