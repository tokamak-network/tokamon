const { Cell, beginCell, Address, toNano } = require('@ton/core');
const { Blockchain, SandboxContract, TreasuryContract } = require('@ton/sandbox');
const nacl = require('tweetnacl');
const {
  createInitData, createSpotMessage, claimMessage,
  refundMessage, buildClaimDataCell,
} = require('../wrappers/Tokamon');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    console.log(`  ✓ ${name}`);
    passed++;
  }).catch((e) => {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  });
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ===== Wrapper 로직 테스트 (컨트랙트 배포 없이) =====

async function runTests() {
  console.log('\n[래퍼 함수 테스트]');

  const keyPair = nacl.sign.keyPair();

  await test('초기 데이터 셀 생성', async () => {
    const data = createInitData(Buffer.from(keyPair.publicKey));
    assert(data instanceof Cell, 'Cell이 아닙니다');
  });

  await test('스팟 생성 메시지 빌드', async () => {
    const msg = createSpotMessage(toNano('0.1'));
    assert(msg instanceof Cell);
    const slice = msg.beginParse();
    const op = slice.loadUint(32);
    assert(op === 1, `op: ${op}, expected 1`);
  });

  await test('클레임 메시지 빌드', async () => {
    const claimId = Buffer.alloc(32);
    const sig = Buffer.alloc(64);
    const msg = claimMessage(sig, 0, claimId, Math.floor(Date.now() / 1000) + 300);
    assert(msg instanceof Cell);
    const slice = msg.beginParse();
    const op = slice.loadUint(32);
    assert(op === 2, `op: ${op}, expected 2`);
  });

  await test('환불 메시지 빌드', async () => {
    const msg = refundMessage(0);
    assert(msg instanceof Cell);
    const slice = msg.beginParse();
    const op = slice.loadUint(32);
    assert(op === 3, `op: ${op}, expected 3`);
  });

  await test('클레임 데이터 셀 + 서명 검증', async () => {
    const spotId = 0;
    const collector = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    const claimId = Buffer.alloc(32);
    claimId.writeUInt32BE(12345, 0);
    const validUntil = Math.floor(Date.now() / 1000) + 300;

    // 데이터 셀 생성 (컨트랙트와 동일 구조)
    const dataCell = buildClaimDataCell(spotId, collector, claimId, validUntil);
    const hash = dataCell.hash();

    // 서명
    const signature = nacl.sign.detached(hash, keyPair.secretKey);
    assert(signature.length === 64, `서명 길이: ${signature.length}`);

    // 검증
    const valid = nacl.sign.detached.verify(hash, signature, keyPair.publicKey);
    assert(valid === true, '서명 검증 실패');
  });

  await test('잘못된 키로 서명 검증 실패', async () => {
    const spotId = 0;
    const collector = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    const claimId = Buffer.alloc(32);
    const validUntil = Math.floor(Date.now() / 1000) + 300;

    const dataCell = buildClaimDataCell(spotId, collector, claimId, validUntil);
    const hash = dataCell.hash();

    const signature = nacl.sign.detached(hash, keyPair.secretKey);

    // 다른 키로 검증
    const otherKeyPair = nacl.sign.keyPair();
    const valid = nacl.sign.detached.verify(hash, signature, otherKeyPair.publicKey);
    assert(valid === false, '다른 키로도 검증 통과하면 안됨');
  });

  await test('변조된 데이터로 서명 검증 실패', async () => {
    const collector = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    const claimId = Buffer.alloc(32);
    const validUntil = Math.floor(Date.now() / 1000) + 300;

    // spotId=0으로 서명
    const dataCell = buildClaimDataCell(0, collector, claimId, validUntil);
    const hash = dataCell.hash();
    const signature = nacl.sign.detached(hash, keyPair.secretKey);

    // spotId=1로 검증 시도
    const tamperedCell = buildClaimDataCell(1, collector, claimId, validUntil);
    const tamperedHash = tamperedCell.hash();
    const valid = nacl.sign.detached.verify(tamperedHash, signature, keyPair.publicKey);
    assert(valid === false, '변조된 데이터도 통과하면 안됨');
  });

  // ===== 결과 =====
  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
