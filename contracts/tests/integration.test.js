const { Cell, beginCell, Address, toNano } = require('@ton/core');
const { Blockchain, SandboxContract, TreasuryContract } = require('@ton/sandbox');
const { compileFunc } = require('@ton-community/func-js');
const nacl = require('tweetnacl');
const fs = require('fs');
const path = require('path');
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
    if (e.stack) {
      console.log(`    ${e.stack.split('\n').slice(1, 3).join('\n    ')}`);
    }
    failed++;
  });
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ===== 컨트랙트 컴파일 =====
async function compileContract() {
  const contractPath = path.join(__dirname, '../src/tokamon.fc');
  const source = fs.readFileSync(contractPath, 'utf-8');

  const result = await compileFunc({
    targets: ['stdlib.fc', 'tokamon.fc'],
    sources: (file) => {
      if (file === 'tokamon.fc') return source;
      if (file === 'stdlib.fc') return `
() send_raw_message(cell msg, int mode) impure asm "SENDRAWMSG";
int now() asm "NOW";
slice my_address() asm "MYADDR";
cell get_data() asm "c4 PUSH";
() set_data(cell c) impure asm "c4 POP";
int cell_hash(cell c) asm "HASHCU";
int check_signature(int hash, slice signature, int public_key) asm "CHKSIGNU";
int equal_slices(slice a, slice b) asm "SDEQ";

builder begin_cell() asm "NEWC";
cell end_cell(builder b) asm "ENDC";
slice begin_parse(cell c) asm "CTOS";

builder store_ref(builder b, cell c) asm(c b) "STREF";
builder store_uint(builder b, int x, int len) asm(x b len) "STUX";
builder store_int(builder b, int x, int len) asm(x b len) "STIX";
builder store_slice(builder b, slice s) asm "STSLICER";
builder store_grams(builder b, int x) asm "STGRAMS";
builder store_coins(builder b, int x) asm "STGRAMS";
builder store_dict(builder b, cell c) asm(c b) "STDICT";

int slice_refs(slice s) asm "SREFS";
int slice_bits(slice s) asm "SBITS";
int slice_empty?(slice s) asm "SEMPTY";

slice begin_parse(cell c) asm "CTOS";
(slice, cell) load_ref(slice s) asm( -> 1 0) "LDREF";
(slice, int) load_uint(slice s, int len) asm(s len -> 1 0) "LDUX";
(slice, int) load_int(slice s, int len) asm(s len -> 1 0) "LDIX";
(slice, slice) load_bits(slice s, int len) asm(s len -> 1 0) "LDSLICEX";
(slice, int) load_grams(slice s) asm( -> 1 0) "LDGRAMS";
(slice, int) load_coins(slice s) asm( -> 1 0) "LDGRAMS";
slice load_msg_addr(slice s) asm( -> 1 0) "LDMSGADDR";
(slice, cell) load_dict(slice s) asm( -> 1 0) "LDDICT";

() throw(int excno) impure asm "THROW";
() throw_if(int excno, int cond) impure asm "THROWIF";
() throw_unless(int excno, int cond) impure asm "THROWIFNOT";

cell udict_set_ref(cell dict, int key_len, int index, cell value) asm(value index dict key_len) "DICTUSETREF";
(cell, int) udict_get_ref?(cell dict, int key_len, int index) asm(index dict key_len) "DICTUGETREF" "NULLSWAPIFNOT";
(cell, int) udict_delete?(cell dict, int key_len, int index) asm(index dict key_len) "DICTUDEL";
cell udict_set_builder(cell dict, int key_len, int index, builder value) asm(value index dict key_len) "DICTUSETB";
(slice, int) udict_get?(cell dict, int key_len, int index) asm(index dict key_len) "DICTUGET" "NULLSWAPIFNOT";
`;
      return '';
    },
  });

  if (result.status === 'error') {
    throw new Error(`Compilation failed: ${result.message}`);
  }

  return Cell.fromBoc(Buffer.from(result.codeBoc, 'base64'))[0];
}

// ===== 통합 테스트 (Sandbox) =====

async function runIntegrationTests() {
  console.log('\n[통합 테스트 - Sandbox]');

  const keyPair = nacl.sign.keyPair();
  let blockchain;
  let contract;
  let deployer;
  let user1;
  let user2;

  await test('컨트랙트 컴파일 및 배포', async () => {
    const code = await compileContract();
    blockchain = await Blockchain.create();
    
    deployer = await blockchain.treasury('deployer');
    user1 = await blockchain.treasury('user1');
    user2 = await blockchain.treasury('user2');

    const initData = createInitData(Buffer.from(keyPair.publicKey));

    contract = blockchain.openContract({
      code,
      data: initData,
      address: Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'),
    });

    // 초기 상태 확인
    const totalSpots = await contract.get('get_total_spots');
    assert(totalSpots === 0n, `Expected 0 spots, got ${totalSpots}`);
  });

  let spotId;

  await test('스팟 생성 (create_spot)', async () => {
    const reward = toNano('1');
    const deposit = toNano('5');

    const result = await contract.send(deployer.getSender(), {
      value: deposit,
      body: createSpotMessage(reward),
    });

    assert(result.transactions.length > 0, 'No transactions');
    
    const totalSpots = await contract.get('get_total_spots');
    assert(totalSpots === 1n, `Expected 1 spot, got ${totalSpots}`);
    
    spotId = 0;
  });

  await test('스팟 정보 조회 (get_spot_info)', async () => {
    const spotInfo = await contract.get('get_spot_info', [BigInt(spotId)]);
    const [reward, remaining, creator] = spotInfo;
    
    assert(reward >= toNano('1'), `Reward: ${reward}`);
    assert(remaining >= toNano('4'), `Remaining: ${remaining}`);
  });

  await test('클레임 (유효한 서명)', async () => {
    const claimId = Buffer.alloc(32);
    claimId.writeUInt32BE(12345, 0);
    const validUntil = Math.floor(Date.now() / 1000) + 300;

    // 서명 생성
    const dataCell = buildClaimDataCell(spotId, user1.address, claimId, validUntil);
    const hash = dataCell.hash();
    const signature = nacl.sign.detached(hash, keyPair.secretKey);

    const balanceBefore = await user1.getBalance();

    const result = await contract.send(user1.getSender(), {
      value: toNano('0.1'),
      body: claimMessage(signature, spotId, claimId, validUntil),
    });

    assert(result.transactions.length > 0, 'No transactions');

    // 클레임 사용 확인
    const used = await contract.get('is_claim_used', [BigInt('0x' + claimId.toString('hex'))]);
    assert(used === -1n, 'Claim should be marked as used');

    const balanceAfter = await user1.getBalance();
    assert(balanceAfter > balanceBefore, 'Balance should increase after claim');
  });

  await test('중복 클레임 시도 (실패해야 함)', async () => {
    const claimId = Buffer.alloc(32);
    claimId.writeUInt32BE(12345, 0);
    const validUntil = Math.floor(Date.now() / 1000) + 300;

    const dataCell = buildClaimDataCell(spotId, user1.address, claimId, validUntil);
    const hash = dataCell.hash();
    const signature = nacl.sign.detached(hash, keyPair.secretKey);

    try {
      await contract.send(user1.getSender(), {
        value: toNano('0.1'),
        body: claimMessage(signature, spotId, claimId, validUntil),
      });
      throw new Error('Should have failed with ERR_CLAIM_ALREADY_USED');
    } catch (e) {
      assert(e.message.includes('101') || e.message.includes('CLAIM_ALREADY_USED'), 
        'Should fail with claim already used error');
    }
  });

  await test('잘못된 서명으로 클레임 (실패해야 함)', async () => {
    const claimId = Buffer.alloc(32);
    claimId.writeUInt32BE(99999, 0);
    const validUntil = Math.floor(Date.now() / 1000) + 300;

    // 잘못된 키로 서명
    const wrongKeyPair = nacl.sign.keyPair();
    const dataCell = buildClaimDataCell(spotId, user2.address, claimId, validUntil);
    const hash = dataCell.hash();
    const signature = nacl.sign.detached(hash, wrongKeyPair.secretKey);

    try {
      await contract.send(user2.getSender(), {
        value: toNano('0.1'),
        body: claimMessage(signature, spotId, claimId, validUntil),
      });
      throw new Error('Should have failed with ERR_INVALID_SIGNATURE');
    } catch (e) {
      assert(e.message.includes('100') || e.message.includes('INVALID_SIGNATURE'),
        'Should fail with invalid signature error');
    }
  });

  await test('환불 (refund) - 생성자만 가능', async () => {
    // 먼저 새 스팟 생성
    const result = await contract.send(deployer.getSender(), {
      value: toNano('2'),
      body: createSpotMessage(toNano('0.5')),
    });

    const newSpotId = 1;
    const balanceBefore = await deployer.getBalance();

    // 환불
    const refundResult = await contract.send(deployer.getSender(), {
      value: toNano('0.1'),
      body: refundMessage(newSpotId),
    });

    assert(refundResult.transactions.length > 0, 'No refund transactions');

    // 환불 후 스팟 조회 시 실패해야 함
    try {
      await contract.get('get_spot_info', [BigInt(newSpotId)]);
      throw new Error('Spot should be deleted after refund');
    } catch (e) {
      assert(e.message.includes('102') || e.message.includes('SPOT_NOT_FOUND'),
        'Spot should not exist after refund');
    }
  });

  await test('환불 시도 (생성자 아닌 경우 실패)', async () => {
    // 새 스팟 생성
    await contract.send(deployer.getSender(), {
      value: toNano('2'),
      body: createSpotMessage(toNano('0.5')),
    });

    const newSpotId = 2;

    // user1이 환불 시도
    try {
      await contract.send(user1.getSender(), {
        value: toNano('0.1'),
        body: refundMessage(newSpotId),
      });
      throw new Error('Should have failed with ERR_NOT_CREATOR');
    } catch (e) {
      assert(e.message.includes('105') || e.message.includes('NOT_CREATOR'),
        'Should fail with not creator error');
    }
  });
}

// ===== E2E 테스트 =====

async function runE2ETests() {
  console.log('\n[E2E 테스트 - 전체 플로우]');

  const keyPair = nacl.sign.keyPair();
  let blockchain;
  let contract;
  let advertiser;
  let users = [];

  await test('E2E: 시스템 초기화', async () => {
    const code = await compileContract();
    blockchain = await Blockchain.create();
    
    advertiser = await blockchain.treasury('advertiser');
    users[0] = await blockchain.treasury('user0');
    users[1] = await blockchain.treasury('user1');
    users[2] = await blockchain.treasury('user2');

    const initData = createInitData(Buffer.from(keyPair.publicKey));

    contract = blockchain.openContract({
      code,
      data: initData,
      address: Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'),
    });
  });

  await test('E2E: 광고주가 여러 스팟 생성', async () => {
    // 3개의 스팟 생성
    for (let i = 0; i < 3; i++) {
      await contract.send(advertiser.getSender(), {
        value: toNano('10'),
        body: createSpotMessage(toNano('1')),
      });
    }

    const totalSpots = await contract.get('get_total_spots');
    assert(totalSpots === 3n, `Expected 3 spots, got ${totalSpots}`);
  });

  await test('E2E: 여러 사용자가 순차적으로 클레임', async () => {
    for (let i = 0; i < 3; i++) {
      const claimId = Buffer.alloc(32);
      claimId.writeUInt32BE(10000 + i, 0);
      const validUntil = Math.floor(Date.now() / 1000) + 300;

      const dataCell = buildClaimDataCell(i, users[i].address, claimId, validUntil);
      const hash = dataCell.hash();
      const signature = nacl.sign.detached(hash, keyPair.secretKey);

      await contract.send(users[i].getSender(), {
        value: toNano('0.1'),
        body: claimMessage(signature, i, claimId, validUntil),
      });
    }

    // 모든 클레임이 사용되었는지 확인
    for (let i = 0; i < 3; i++) {
      const claimId = Buffer.alloc(32);
      claimId.writeUInt32BE(10000 + i, 0);
      const used = await contract.get('is_claim_used', [BigInt('0x' + claimId.toString('hex'))]);
      assert(used === -1n, `Claim ${i} should be used`);
    }
  });

  await test('E2E: 동일 스팟에서 여러 번 클레임', async () => {
    // 큰 예치금으로 새 스팟 생성
    await contract.send(advertiser.getSender(), {
      value: toNano('50'),
      body: createSpotMessage(toNano('1')),
    });

    const spotId = 3;

    // 같은 스팟에서 3명이 클레임
    for (let i = 0; i < 3; i++) {
      const claimId = Buffer.alloc(32);
      claimId.writeUInt32BE(20000 + i, 0);
      const validUntil = Math.floor(Date.now() / 1000) + 300;

      const dataCell = buildClaimDataCell(spotId, users[i].address, claimId, validUntil);
      const hash = dataCell.hash();
      const signature = nacl.sign.detached(hash, keyPair.secretKey);

      await contract.send(users[i].getSender(), {
        value: toNano('0.1'),
        body: claimMessage(signature, spotId, claimId, validUntil),
      });
    }

    // 스팟 잔액 확인
    const [reward, remaining] = await contract.get('get_spot_info', [BigInt(spotId)]);
    assert(remaining >= toNano('44'), `Remaining should be ~44 TON, got ${remaining}`);
  });

  await test('E2E: 만료된 클레임 시도', async () => {
    const claimId = Buffer.alloc(32);
    claimId.writeUInt32BE(30000, 0);
    const validUntil = Math.floor(Date.now() / 1000) - 10; // 10초 전 만료

    const dataCell = buildClaimDataCell(0, users[0].address, claimId, validUntil);
    const hash = dataCell.hash();
    const signature = nacl.sign.detached(hash, keyPair.secretKey);

    try {
      await contract.send(users[0].getSender(), {
        value: toNano('0.1'),
        body: claimMessage(signature, 0, claimId, validUntil),
      });
      throw new Error('Should have failed with ERR_CLAIM_EXPIRED');
    } catch (e) {
      assert(e.message.includes('106') || e.message.includes('CLAIM_EXPIRED'),
        'Should fail with claim expired error');
    }
  });
}

// ===== 실행 =====

async function main() {
  try {
    await runIntegrationTests();
    await runE2ETests();
  } catch (e) {
    console.error('\n테스트 실행 중 오류:', e);
    failed++;
  }

  console.log(`\n총 결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
