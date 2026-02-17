#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../listener-server/contract-address.json');
const destClient = path.join(__dirname, '../client/public/contract-address.json');
const destFunctions = path.join(__dirname, '../functions/contract-address.json');
const networksPath = path.join(__dirname, '../shared/networks.js');

if (!fs.existsSync(src)) {
  console.error('오류: listener-server/contract-address.json 이 없습니다.');
  console.error('컨트랙트를 먼저 배포하세요:');
  console.error('  1. anvil --port 8999 --chain-id 1337  (터미널 1)');
  console.error('  2. cd contracts && forge script script/DeployLocal.s.sol:DeployLocal --rpc-url http://127.0.0.1:8999 --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(src, 'utf8'));

// 기존 복사 (하위호환)
fs.copyFileSync(src, destClient);
console.log('복사 완료: contract-address.json → client/public/');
if (fs.existsSync(path.join(__dirname, '../functions'))) {
  fs.copyFileSync(src, destFunctions);
  console.log('복사 완료: contract-address.json → functions/');
}

// shared/networks.js의 contracts 자동 업데이트
// NETWORK 환경변수로 대상 네트워크 지정 (기본: local)
const networkId = process.env.NETWORK || 'local';
const tokamon = data.tokamon || data.address;
const faucet = data.faucet || null;

if (fs.existsSync(networksPath)) {
  let content = fs.readFileSync(networksPath, 'utf8');

  // 해당 네트워크의 contracts 블록에서 tokamon/faucet 주소 업데이트
  // 패턴: '네트워크ID': { tokamon: ..., faucet: ... }
  const escapedId = networkId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blockRegex = new RegExp(
    `([ \\t]*(?:'${escapedId}'|${escapedId}):\\s*\\{[^}]*tokamon:\\s*)(?:null|'[^']*')(,[^}]*faucet:\\s*)(?:null|'[^']*')`,
  );
  const match = content.match(blockRegex);
  if (match) {
    content = content.replace(
      blockRegex,
      `$1'${tokamon}'$2${faucet ? `'${faucet}'` : 'null'}`,
    );
    fs.writeFileSync(networksPath, content);
    console.log(`shared/networks.js 업데이트: ${networkId} → tokamon=${tokamon}, faucet=${faucet}`);
  } else {
    console.warn(`shared/networks.js에서 '${networkId}' contracts 블록을 찾을 수 없습니다.`);
  }
}
