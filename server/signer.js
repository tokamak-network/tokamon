const nacl = require('tweetnacl');
const { beginCell, Address } = require('@ton/core');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const KEY_FILE = path.join(__dirname, 'admin_keys.json');

// 키 로드 또는 생성
function loadOrCreateKeys() {
  if (fs.existsSync(KEY_FILE)) {
    const data = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    return {
      publicKey: Buffer.from(data.publicKey, 'hex'),
      secretKey: Buffer.from(data.secretKey, 'hex'),
    };
  }
  const keyPair = nacl.sign.keyPair();
  const data = {
    publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
    secretKey: Buffer.from(keyPair.secretKey).toString('hex'),
  };
  fs.writeFileSync(KEY_FILE, JSON.stringify(data, null, 2));
  console.log('관리자 키 생성 완료:', KEY_FILE);
  return {
    publicKey: Buffer.from(keyPair.publicKey),
    secretKey: Buffer.from(keyPair.secretKey),
  };
}

const keys = loadOrCreateKeys();

// 컨트랙트와 동일한 구조로 데이터 셀 생성 후 해시 → 서명
function signClaim(spotId, collectorAddress, claimId, validUntil) {
  const addr = Address.parse(collectorAddress);
  const dataCell = beginCell()
    .storeUint(spotId, 32)
    .storeAddress(addr)
    .storeBuffer(claimId, 32) // 256-bit claim_id
    .storeUint(validUntil, 32)
    .endCell();

  const hash = dataCell.hash();
  const signature = nacl.sign.detached(hash, keys.secretKey);

  return {
    signature: Buffer.from(signature),
    claimId,
    validUntil,
  };
}

function getPublicKey() {
  return keys.publicKey;
}

module.exports = { signClaim, getPublicKey };
