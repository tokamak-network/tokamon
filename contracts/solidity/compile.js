const solc = require('solc');
const fs = require('fs');
const path = require('path');

const tokamonSource = fs.readFileSync(path.join(__dirname, 'Tokamon.sol'), 'utf8');
const faucetSource = fs.readFileSync(path.join(__dirname, 'Faucet.sol'), 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'Tokamon.sol': { content: tokamonSource },
    'Faucet.sol': { content: faucetSource },
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const errors = output.errors.filter((e) => e.severity === 'error');
  if (errors.length > 0) {
    console.error('컴파일 에러:');
    errors.forEach((e) => console.error(e.formattedMessage));
    process.exit(1);
  }
}

// Tokamon 컴파일 결과
const tokamonContract = output.contracts['Tokamon.sol']['Tokamon'];
const tokamonArtifact = {
  abi: tokamonContract.abi,
  bytecode: '0x' + tokamonContract.evm.bytecode.object,
};
const tokamonPath = path.join(__dirname, 'Tokamon.json');
fs.writeFileSync(tokamonPath, JSON.stringify(tokamonArtifact, null, 2));
console.log('✓ Tokamon 컴파일 완료:', tokamonPath);

// Faucet 컴파일 결과
const faucetContract = output.contracts['Faucet.sol']['Faucet'];
const faucetArtifact = {
  abi: faucetContract.abi,
  bytecode: '0x' + faucetContract.evm.bytecode.object,
};
const faucetPath = path.join(__dirname, 'Faucet.json');
fs.writeFileSync(faucetPath, JSON.stringify(faucetArtifact, null, 2));
console.log('✓ Faucet 컴파일 완료:', faucetPath);
