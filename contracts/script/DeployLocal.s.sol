// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Tokamon} from "../src/Tokamon.sol";
import {Faucet} from "../src/Faucet.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

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

        console.log("\n=== [Local] Deploying Tokamon (UUPS Proxy) ===");
        Tokamon implementation = new Tokamon();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeCall(Tokamon.initialize, ())
        );
        Tokamon tokamon = Tokamon(payable(address(proxy)));
        console.log("Tokamon proxy deployed at:", address(tokamon));
        console.log("Tokamon implementation at:", address(implementation));

        console.log("\n=== [Local] Deploying Faucet ===");
        Faucet faucet = new Faucet{value: 1000 ether}();
        console.log("Faucet deployed at:", address(faucet));

        address testAccount1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        address testAccount2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
        payable(testAccount1).transfer(100 ether);
        payable(testAccount2).transfer(100 ether);
        console.log("Test accounts funded");

        vm.stopBroadcast();

        _writeAddresses(address(tokamon), address(faucet), CHAIN_ID);
    }

    function _writeAddresses(
        address tokamon,
        address faucet,
        uint256 chainId
    ) internal {
        string memory addresses = string(
            abi.encodePacked(
                '{\n',
                '  "tokamon": "', vm.toString(tokamon), '",\n',
                '  "faucet": "', vm.toString(faucet), '",\n',
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
