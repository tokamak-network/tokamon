// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {TONToken} from "../src/TONToken.sol";
import {Tokamon} from "../src/Tokamon.sol";
import {Faucet} from "../src/Faucet.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployTestnet
 * @notice 테스트넷 배포 (Sepolia, Titan Testnet 등). Faucet 포함. PRIVATE_KEY·RPC_URL 필수.
 */
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        uint256 chainId = vm.envOr("CHAIN_ID", uint256(1337));

        vm.startBroadcast(deployerPrivateKey);

        console.log("\n=== [Testnet] Deploying TON Token ===");
        TONToken tonToken = new TONToken();
        console.log("TON Token deployed at:", address(tonToken));

        console.log("\n=== [Testnet] Deploying Tokamon (UUPS Proxy) ===");
        Tokamon implementation = new Tokamon();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeCall(Tokamon.initialize, (address(tonToken)))
        );
        Tokamon tokamon = Tokamon(address(proxy));
        console.log("Tokamon proxy deployed at:", address(tokamon));
        console.log("Tokamon implementation at:", address(implementation));

        uint256 faucetEth = vm.envOr("FAUCET_ETH", uint256(1 ether));
        console.log("\n=== [Testnet] Deploying Faucet (ETH:", faucetEth / 1 ether, ") ===");
        Faucet faucet = new Faucet{value: faucetEth}(address(tokamon), address(tonToken));
        uint256 faucetTon = vm.envOr("FAUCET_TON", uint256(10_000 * 1e18));
        require(tonToken.transfer(address(faucet), faucetTon), "TON transfer failed");
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
        /// forge-lint: disable-next-line(unsafe-cheatcode)
        vm.writeFile("../listener-server/contract-address.json", addresses);
        console.log("Addresses saved to listener-server/contract-address.json (chainId:", chainId, ")");
    }
}
