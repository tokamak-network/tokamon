// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/Tokamon.sol";
import "../src/Faucet.sol";

contract DeployScript is Script {
    function run() external {
        // 배포자 계정 (Anvil account[0])
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        vm.startBroadcast(deployerPrivateKey);

        // 1. Tokamon 컨트랙트 배포
        console.log("\n=== Deploying Tokamon ===");
        Tokamon tokamon = new Tokamon();
        console.log("Tokamon deployed at:", address(tokamon));

        // 2. Faucet 컨트랙트 배포 (1000 ETH 초기 예치)
        console.log("\n=== Deploying Faucet ===");
        Faucet faucet = new Faucet{value: 1000 ether}(address(tokamon));
        console.log("Faucet deployed at:", address(faucet));
        console.log("Faucet balance:", faucet.getBalance() / 1 ether, "ETH");

        // 3. 테스트 계정에 초기 ETH 지급
        console.log("\n=== Sending initial ETH to test accounts ===");
        address testAccount1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // Anvil account[1]
        address testAccount2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; // Anvil account[2]

        payable(testAccount1).transfer(100 ether);
        payable(testAccount2).transfer(100 ether);

        console.log("Test account 1:", testAccount1, "- 100 ETH");
        console.log("Test account 2:", testAccount2, "- 100 ETH");

        vm.stopBroadcast();

        // 3. 주소를 JSON 파일로 저장
        string memory addresses = string(abi.encodePacked(
            '{\n',
            '  "tokamon": "', vm.toString(address(tokamon)), '",\n',
            '  "faucet": "', vm.toString(address(faucet)), '",\n',
            '  "address": "', vm.toString(address(tokamon)), '"\n',
            '}'
        ));

        vm.writeFile("../server/contract-address.json", addresses);
        console.log("Addresses saved to server/contract-address.json");
    }
}
