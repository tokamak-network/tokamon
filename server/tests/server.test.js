const { haversineDistance, isWithinTimeRange, isSpeedValid, generateClaimId } = require('../utils');
const { signClaim, getPublicKey } = require('../signer');
const nacl = require('tweetnacl');
const { beginCell, Address } = require('@ton/core');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ===== 거리 계산 테스트 =====
console.log('\n[거리 계산]');

test('같은 위치 = 0m', () => {
  const d = haversineDistance(37.5665, 126.978, 37.5665, 126.978);
  assert(d < 1, `expected < 1m, got ${d}`);
});

test('서울역 ↔ 강남역 ≈ 8km', () => {
  const d = haversineDistance(37.5547, 126.9707, 37.4979, 127.0276);
  assert(d > 6000 && d < 10000, `expected 6-10km, got ${Math.round(d)}m`);
});

test('50m 이내 판정', () => {
  // 약 30m 차이
  const d = haversineDistance(37.5665, 126.978, 37.5668, 126.978);
  assert(d < 50, `expected < 50m, got ${Math.round(d)}m`);
});

test('50m 초과 판정', () => {
  // 약 200m 차이
  const d = haversineDistance(37.5665, 126.978, 37.5685, 126.978);
  assert(d > 50, `expected > 50m, got ${Math.round(d)}m`);
});

// ===== 시간 범위 테스트 =====
console.log('\n[시간 범위]');

test('시간 범위 체크 함수 존재', () => {
  assert(typeof isWithinTimeRange === 'function');
});

test('00:00~23:59는 항상 true', () => {
  assert(isWithinTimeRange('00:00', '23:59') === true);
});

// ===== 속도 체크 테스트 =====
console.log('\n[속도 체크]');

test('정상 속도 (걸어가기)', () => {
  // 500m를 10분에 = 3km/h
  const valid = isSpeedValid(
    37.5665, 126.978, '2024-01-01T12:00:00Z',
    37.5710, 126.978, '2024-01-01T12:10:00Z'
  );
  assert(valid === true, '걸어가기는 허용되어야 함');
});

test('비정상 속도 (순간이동)', () => {
  // 서울→부산(325km)을 1분에
  const valid = isSpeedValid(
    37.5665, 126.978, '2024-01-01T12:00:00Z',
    35.1796, 129.0756, '2024-01-01T12:01:00Z'
  );
  assert(valid === false, '순간이동은 차단되어야 함');
});

test('KTX 속도는 허용', () => {
  // 100km를 30분에 = 200km/h
  const valid = isSpeedValid(
    37.5665, 126.978, '2024-01-01T12:00:00Z',
    36.7000, 127.000, '2024-01-01T12:30:00Z'
  );
  assert(valid === true, 'KTX 속도는 허용되어야 함');
});

// ===== 서명 테스트 =====
console.log('\n[서명]');

test('키 생성/로드 성공', () => {
  const pubkey = getPublicKey();
  assert(pubkey.length === 32, `pubkey 길이: ${pubkey.length}, expected 32`);
});

test('claim_id 생성', () => {
  const id = generateClaimId();
  assert(id.length === 32, `claim_id 길이: ${id.length}, expected 32`);
});

test('서명 생성 및 검증', () => {
  const claimId = generateClaimId();
  const validUntil = Math.floor(Date.now() / 1000) + 300;
  const testAddress = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

  const { signature } = signClaim(0, testAddress, claimId, validUntil);
  assert(signature.length === 64, `서명 길이: ${signature.length}, expected 64`);

  // 컨트랙트와 동일한 방식으로 해시 생성해서 검증
  const addr = Address.parse(testAddress);
  const dataCell = beginCell()
    .storeUint(0, 32)
    .storeAddress(addr)
    .storeBuffer(claimId, 32)
    .storeUint(validUntil, 32)
    .endCell();

  const hash = dataCell.hash();
  const pubkey = getPublicKey();
  const valid = nacl.sign.detached.verify(hash, signature, pubkey);
  assert(valid === true, '서명 검증 실패');
});

test('잘못된 데이터로 검증 실패', () => {
  const claimId = generateClaimId();
  const validUntil = Math.floor(Date.now() / 1000) + 300;
  const testAddress = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

  const { signature } = signClaim(0, testAddress, claimId, validUntil);

  // 다른 spot_id로 검증 시도 → 실패해야 함
  const addr = Address.parse(testAddress);
  const wrongCell = beginCell()
    .storeUint(999, 32) // 틀린 spot_id
    .storeAddress(addr)
    .storeBuffer(claimId, 32)
    .storeUint(validUntil, 32)
    .endCell();

  const hash = wrongCell.hash();
  const pubkey = getPublicKey();
  const valid = nacl.sign.detached.verify(hash, signature, pubkey);
  assert(valid === false, '잘못된 데이터도 통과하면 안됨');
});

// ===== 결과 =====
console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
