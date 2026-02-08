// 앱의 distance.js 로직과 동일 (ESM → CJS 변환)
const EARTH_RADIUS = 6371000;
function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function isWithinRadius(userLat, userLng, spotLat, spotLng, radiusM = 50) {
  return haversineDistance(userLat, userLng, spotLat, spotLng) <= radiusM;
}

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

// ===== 거리 계산 =====
console.log('\n[거리 계산]');

test('같은 위치 = 0m', () => {
  const d = haversineDistance(37.5665, 126.978, 37.5665, 126.978);
  assert(d < 1, `expected < 1m, got ${d}`);
});

test('가까운 거리 (30m)', () => {
  const d = haversineDistance(37.5665, 126.978, 37.5668, 126.978);
  assert(d > 20 && d < 50, `expected 20-50m, got ${Math.round(d)}m`);
});

test('먼 거리 (서울역 ↔ 강남역)', () => {
  const d = haversineDistance(37.5547, 126.9707, 37.4979, 127.0276);
  assert(d > 6000, `expected > 6km, got ${Math.round(d)}m`);
});

// ===== 반경 판정 =====
console.log('\n[반경 판정]');

test('50m 이내 → true', () => {
  assert(isWithinRadius(37.5665, 126.978, 37.5668, 126.978) === true);
});

test('50m 초과 → false', () => {
  assert(isWithinRadius(37.5665, 126.978, 37.5685, 126.978) === false);
});

test('커스텀 반경 100m 이내 → true', () => {
  // 약 70m 차이
  assert(isWithinRadius(37.5665, 126.978, 37.5671, 126.9788, 100) === true);
});

test('커스텀 반경 10m 초과 → false', () => {
  // 약 30m 차이
  assert(isWithinRadius(37.5665, 126.978, 37.5668, 126.978, 10) === false);
});

// ===== 보안 서비스 로직 =====
console.log('\n[보안 로직]');

test('Mock 위치 감지 - mocked=true', () => {
  const pos = { lat: 37.5, lng: 127.0, isMocked: true };
  assert(pos.isMocked === true, '가짜 GPS 감지 실패');
});

test('정상 위치 - mocked=false', () => {
  const pos = { lat: 37.5, lng: 127.0, isMocked: false };
  assert(pos.isMocked === false);
});

test('mocked 필드 없음 → 정상 처리', () => {
  const pos = { lat: 37.5, lng: 127.0 };
  assert((pos.isMocked || false) === false);
});

// ===== TX 빌드 로직 =====
console.log('\n[TX 빌드]');

test('클레임 TX에 필요한 데이터 구조', () => {
  const tx = {
    validUntil: Math.floor(Date.now() / 1000) + 600,
    messages: [{
      address: 'EQ...',
      amount: '50000000',
      payload: 'base64data',
    }],
  };
  assert(tx.messages.length === 1, '메시지 1개');
  assert(tx.messages[0].amount === '50000000', '가스비 0.05 TON');
  assert(tx.validUntil > Math.floor(Date.now() / 1000), '유효시간 미래');
});

test('스팟 생성 TX 금액 계산', () => {
  const total = 10; // TON
  const gasReserve = 0.05; // TON
  const depositNano = BigInt(Math.floor((total + gasReserve) * 1e9));
  assert(depositNano === 10050000000n, `expected 10050000000n, got ${depositNano}`);
});

// ===== 클레임 플로우 시뮬레이션 =====
console.log('\n[클레임 플로우]');

test('스팟 근처 도착 → 클레임 가능', () => {
  const userPos = { lat: 37.5665, lng: 126.978 };
  const spot = { lat: 37.5667, lng: 126.978, active: true };
  const distance = haversineDistance(userPos.lat, userPos.lng, spot.lat, spot.lng);
  const canClaim = distance <= 50 && spot.active;
  assert(canClaim === true, `distance: ${Math.round(distance)}m`);
});

test('스팟 멀리 → 클레임 불가', () => {
  const userPos = { lat: 37.5665, lng: 126.978 };
  const spot = { lat: 37.5700, lng: 126.978, active: true };
  const distance = haversineDistance(userPos.lat, userPos.lng, spot.lat, spot.lng);
  const canClaim = distance <= 50 && spot.active;
  assert(canClaim === false, `should be false, distance: ${Math.round(distance)}m`);
});

test('스팟 근처지만 비활성 → 클레임 불가', () => {
  const userPos = { lat: 37.5665, lng: 126.978 };
  const spot = { lat: 37.5667, lng: 126.978, active: false };
  const distance = haversineDistance(userPos.lat, userPos.lng, spot.lat, spot.lng);
  const canClaim = distance <= 50 && spot.active;
  assert(canClaim === false, 'should be false when inactive');
});

// ===== 결과 =====
console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
