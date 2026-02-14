#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../listener-server/contract-address.json');
const destClient = path.join(__dirname, '../client/public/contract-address.json');
const destFunctions = path.join(__dirname, '../functions/contract-address.json');

if (!fs.existsSync(src)) {
  console.error('오류: listener-server/contract-address.json 이 없습니다.');
  console.error('컨트랙트를 먼저 배포하세요:');
  console.error('  1. anvil --port 8999 --chain-id 1337  (터미널 1)');
  console.error('  2. cd contracts && forge script script/DeployLocal.s.sol:DeployLocal --rpc-url http://127.0.0.1:8999 --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  process.exit(1);
}

fs.copyFileSync(src, destClient);
console.log('복사 완료: contract-address.json → client/public/');
if (fs.existsSync(path.join(__dirname, '../functions'))) {
  fs.copyFileSync(src, destFunctions);
  console.log('복사 완료: contract-address.json → functions/');
}
