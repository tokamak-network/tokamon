const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// 컴파일 먼저 실행
require('./compile');

const tokamonArtifact = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'Tokamon.json'), 'utf8')
);
const faucetArtifact = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'Faucet.json'), 'utf8')
);

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8999';
const FAUCET_INITIAL_ETH = '1000'; // Faucet에 초기 예치할 ETH (1000 ETH)

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const accounts = await provider.listAccounts();
  const deployer = accounts[0]; // Ganache account[0] = admin

  console.log('배포자:', deployer.address);

  // 1. Tokamon 컨트랙트 배포
  console.log('\n1. Tokamon 컨트랙트 배포 중...');
  const tokamonFactory = new ethers.ContractFactory(
    tokamonArtifact.abi,
    tokamonArtifact.bytecode,
    deployer
  );
  const tokamonContract = await tokamonFactory.deploy();
  await tokamonContract.waitForDeployment();
  const tokamonAddress = await tokamonContract.getAddress();
  console.log('✓ Tokamon 배포 완료:', tokamonAddress);

  // 2. Faucet 컨트랙트 배포 (초기 ETH 예치)
  console.log('\n2. Faucet 컨트랙트 배포 중...');
  const faucetFactory = new ethers.ContractFactory(
    faucetArtifact.abi,
    faucetArtifact.bytecode,
    deployer
  );
  const faucetContract = await faucetFactory.deploy(tokamonAddress, {
    value: ethers.parseEther(FAUCET_INITIAL_ETH),
  });
  await faucetContract.waitForDeployment();
  const faucetAddress = await faucetContract.getAddress();
  console.log('✓ Faucet 배포 완료:', faucetAddress);
  console.log(`✓ Faucet 초기 잔액: ${FAUCET_INITIAL_ETH} ETH`);

  // 3. Faucet 잔액 확인
  const faucetBalance = await provider.getBalance(faucetAddress);
  console.log(`✓ Faucet 현재 잔액: ${ethers.formatEther(faucetBalance)} ETH`);

  // 4. 컨트랙트 주소 저장
  const addrPath = path.join(__dirname, '..', '..', 'server', 'contract-address.json');
  fs.writeFileSync(
    addrPath,
    JSON.stringify(
      {
        tokamon: tokamonAddress,
        faucet: faucetAddress,
        // 하위 호환성 유지
        address: tokamonAddress,
      },
      null,
      2
    )
  );
  console.log('\n✓ 주소 저장:', addrPath);

  console.log('\n🎉 배포 완료!');
  console.log('- Tokamon:', tokamonAddress);
  console.log('- Faucet:', faucetAddress);
}

main().catch((err) => {
  console.error('배포 실패:', err);
  process.exit(1);
});
