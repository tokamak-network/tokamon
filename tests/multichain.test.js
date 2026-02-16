/**
 * 멀티체인 전환 검증 테스트
 *
 * Node.js 내장 assert 모듈 사용 (의존성 없음)
 * 실행: node tests/multichain.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

// ═══════════════════════════════════════════
// 1. shared/networks.js 유닛 테스트
// ═══════════════════════════════════════════
console.log('\n[1] shared/networks.js 유닛 테스트');

const networks = require('../shared/networks');

test('모듈 export 확인: 필수 함수 존재', () => {
  assert.ok(networks.networks, 'networks 객체 누락');
  assert.ok(networks.contracts, 'contracts 객체 누락');
  assert.ok(networks.DEFAULT_NETWORK, 'DEFAULT_NETWORK 누락');
  assert.ok(typeof networks.getNetwork === 'function', 'getNetwork 함수 누락');
  assert.ok(typeof networks.getContracts === 'function', 'getContracts 함수 누락');
  assert.ok(typeof networks.getNetworkByChainId === 'function', 'getNetworkByChainId 함수 누락');
  assert.ok(typeof networks.collectionPath === 'function', 'collectionPath 함수 누락');
  assert.ok(typeof networks.listNetworks === 'function', 'listNetworks 함수 누락');
});

test('DEFAULT_NETWORK = "local"', () => {
  assert.strictEqual(networks.DEFAULT_NETWORK, 'local');
});

test('2개 네트워크 정의 (local, thanos-sepolia)', () => {
  const ids = Object.keys(networks.networks);
  assert.deepStrictEqual(ids.sort(), ['local', 'thanos-sepolia']);
});

test('각 네트워크에 필수 필드 존재 (chainId, name, rpcUrl, nativeCurrency)', () => {
  for (const [id, net] of Object.entries(networks.networks)) {
    assert.ok(typeof net.chainId === 'number', `${id}: chainId 누락`);
    assert.ok(typeof net.name === 'string', `${id}: name 누락`);
    assert.ok(typeof net.rpcUrl === 'string', `${id}: rpcUrl 누락`);
    assert.ok(net.nativeCurrency, `${id}: nativeCurrency 누락`);
    assert.strictEqual(net.nativeCurrency.symbol, 'TON', `${id}: nativeCurrency.symbol !== 'TON'`);
  }
});

test('chainId 값 검증 (local=1337, thanos-sepolia=111551119090)', () => {
  assert.strictEqual(networks.networks.local.chainId, 1337);
  assert.strictEqual(networks.networks['thanos-sepolia'].chainId, 111551119090);
});

test('getNetwork() 정상 동작', () => {
  const local = networks.getNetwork('local');
  assert.strictEqual(local.chainId, 1337);
  assert.strictEqual(local.name, 'Local (Anvil)');
});

test('getNetwork() 잘못된 네트워크 → Error', () => {
  assert.throws(() => networks.getNetwork('invalid'), /Unknown network/);
});

test('getContracts() 정상 동작', () => {
  const c = networks.getContracts('local');
  assert.ok('tokamon' in c, 'tokamon 키 누락');
  assert.ok('faucet' in c, 'faucet 키 누락');
});

test('getContracts() 잘못된 네트워크 → Error', () => {
  assert.throws(() => networks.getContracts('invalid'), /No contracts config/);
});

test('getNetworkByChainId(1337) → local', () => {
  const result = networks.getNetworkByChainId(1337);
  assert.ok(result, '결과 없음');
  assert.strictEqual(result.id, 'local');
});

test('getNetworkByChainId(111551119090) → thanos-sepolia', () => {
  const result = networks.getNetworkByChainId(111551119090);
  assert.ok(result, '결과 없음');
  assert.strictEqual(result.id, 'thanos-sepolia');
});

test('getNetworkByChainId(99999) → null', () => {
  const result = networks.getNetworkByChainId(99999);
  assert.strictEqual(result, null);
});

test('collectionPath() 정상 동작', () => {
  assert.strictEqual(
    networks.collectionPath('local', 'spot_metadata'),
    'networks/local/spot_metadata'
  );
  assert.strictEqual(
    networks.collectionPath('thanos-sepolia', 'claim_events'),
    'networks/thanos-sepolia/claim_events'
  );
});

test('collectionPath() 잘못된 네트워크 → Error', () => {
  assert.throws(() => networks.collectionPath('invalid', 'test'), /Unknown network/);
});

test('listNetworks() 2개 반환, 각각 id/contracts 포함', () => {
  const list = networks.listNetworks();
  assert.strictEqual(list.length, 2);
  for (const net of list) {
    assert.ok(net.id, 'id 누락');
    assert.ok(net.chainId, 'chainId 누락');
    assert.ok(net.contracts, 'contracts 누락');
  }
});

test('contracts에 2개 네트워크 모두 정의됨', () => {
  const contractIds = Object.keys(networks.contracts);
  assert.deepStrictEqual(contractIds.sort(), ['local', 'thanos-sepolia']);
});

// ═══════════════════════════════════════════
// 2. functions/shared/networks.js 동기화 검증
// ═══════════════════════════════════════════
console.log('\n[2] functions/shared/networks.js 동기화 검증');

test('functions/shared/networks.js 파일 존재', () => {
  const filePath = path.join(__dirname, '..', 'functions', 'shared', 'networks.js');
  assert.ok(fs.existsSync(filePath), '파일 없음: functions/shared/networks.js');
});

test('shared/networks.js ↔ functions/shared/networks.js 내용 동일', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'networks.js'), 'utf8');
  const dst = fs.readFileSync(path.join(__dirname, '..', 'functions', 'shared', 'networks.js'), 'utf8');
  assert.strictEqual(src, dst, '두 파일의 내용이 다릅니다. npm run deploy 전 cp를 실행하세요.');
});

// ═══════════════════════════════════════════
// 3. CJS-only export 검증 (ESM export 없어야 함)
// ═══════════════════════════════════════════
console.log('\n[3] CJS-only export 검증');

test('shared/networks.js에 ESM export 문 없음', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'networks.js'), 'utf8');
  const hasEsmExport = /^export\s+/m.test(src);
  assert.ok(!hasEsmExport, 'ESM export 문이 발견됨 → Node.js에서 SyntaxError 발생합니다');
});

test('shared/networks.js에 module.exports 있음', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'networks.js'), 'utf8');
  assert.ok(src.includes('module.exports'), 'module.exports가 없습니다');
});

// ═══════════════════════════════════════════
// 4. 정적 분석: 클라이언트 fetch 호출에 ?network= 포함 확인
// ═══════════════════════════════════════════
console.log('\n[4] 클라이언트 fetch 호출 네트워크 파라미터 검증');

function readFile(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

// 파일 내 모든 fetch() 호출에서 /api/ 패턴을 찾고,
// withNetwork 또는 ?network= 또는 /api/networks(목록 조회)가 있는지 확인
function checkFetchHasNetwork(filePath, content) {
  const lines = content.split('\n');
  const issues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // fetch 호출에서 /api/ URL 찾기
    if (line.includes('fetch(') && line.includes('/api/')) {
      // withNetwork 또는 network= 또는 /api/networks 는 OK
      if (line.includes('withNetwork') || line.includes('network=') || line.includes('/api/networks')) {
        continue;
      }
      issues.push(`Line ${i + 1}: ${line.trim()}`);
    }
  }

  return issues;
}

const clientFiles = [
  'client/src/api.js',
  'client/src/faucet.js',
  'client/src/components/Settings.jsx',
  'client/src/components/History.jsx',
  'client/src/components/StoreKiosk.jsx',
  'client/src/components/TelegramLinkPage.jsx',
];

for (const file of clientFiles) {
  test(`${file}: 모든 /api/ fetch에 network 파라미터 포함`, () => {
    const content = readFile(file);
    const issues = checkFetchHasNetwork(file, content);
    if (issues.length > 0) {
      assert.fail(`네트워크 파라미터 누락:\n${issues.join('\n')}`);
    }
  });
}

// ═══════════════════════════════════════════
// 5. 정적 분석: 하드코딩된 chainId (0x539) 없음 확인
// ═══════════════════════════════════════════
console.log('\n[5] 하드코딩된 chainId 검증');

const srcFiles = [
  'client/src/App.jsx',
  'client/src/components/StoreKiosk.jsx',
  'client/src/api.js',
  'client/src/faucet.js',
  'client/src/components/Settings.jsx',
  'client/src/components/History.jsx',
  'client/src/components/TelegramLinkPage.jsx',
];

for (const file of srcFiles) {
  test(`${file}: 0x539 하드코딩 없음`, () => {
    const content = readFile(file);
    assert.ok(!content.includes('0x539'), '0x539 (chainId 1337 hex) 하드코딩 발견');
  });
}

// ═══════════════════════════════════════════
// 6. 정적 분석: networkStore.js import 확인
// ═══════════════════════════════════════════
console.log('\n[6] networkStore 의존성 검증');

test('client/src/App.jsx: networkStore에서 import', () => {
  const content = readFile('client/src/App.jsx');
  assert.ok(content.includes("from './networkStore'"), 'networkStore import 누락');
  assert.ok(content.includes('getNetworkConfig'), 'getNetworkConfig import 누락');
  assert.ok(content.includes('getSelectedNetwork'), 'getSelectedNetwork import 누락');
  assert.ok(content.includes('setSelectedNetwork'), 'setSelectedNetwork import 누락');
  assert.ok(content.includes('onNetworkChange'), 'onNetworkChange import 누락');
});

test('client/src/api.js: networkStore에서 getSelectedNetwork import', () => {
  const content = readFile('client/src/api.js');
  assert.ok(content.includes("from './networkStore'"), 'networkStore import 누락');
  assert.ok(content.includes('getSelectedNetwork'), 'getSelectedNetwork import 누락');
});

test('client/src/components/StoreKiosk.jsx: networkStore에서 import', () => {
  const content = readFile('client/src/components/StoreKiosk.jsx');
  assert.ok(content.includes('networkStore'), 'networkStore import 누락');
  assert.ok(content.includes('getSelectedNetwork'), 'getSelectedNetwork import 누락');
  assert.ok(content.includes('getNetworkConfig'), 'getNetworkConfig import 누락');
});

// ═══════════════════════════════════════════
// 7. listener-server 네트워크 설정 검증
// ═══════════════════════════════════════════
console.log('\n[7] listener-server 네트워크 설정 검증');

test('listener-server/blockchain.js: shared/networks 사용', () => {
  const content = readFile('listener-server/blockchain.js');
  assert.ok(content.includes("require('../shared/networks')"), 'shared/networks require 누락');
  assert.ok(content.includes('process.env.NETWORK'), 'NETWORK 환경변수 참조 누락');
  assert.ok(content.includes('networkConfig.rpcUrl'), 'networkConfig.rpcUrl 미사용');
});

test('listener-server/blockchain.js: 네트워크별 메타데이터/블록 파일', () => {
  const content = readFile('listener-server/blockchain.js');
  assert.ok(content.includes('spot-metadata-${networkId}'), '네트워크별 메타데이터 파일 패턴 누락');
  assert.ok(content.includes('last-block-${networkId}'), '네트워크별 블록 파일 패턴 누락');
});

test('listener-server/firebase-admin.js: collectionPath 사용', () => {
  const content = readFile('listener-server/firebase-admin.js');
  assert.ok(content.includes("require('../shared/networks')"), 'shared/networks require 누락');
  assert.ok(content.includes('collectionPath'), 'collectionPath 함수 미사용');
  assert.ok(content.includes('NETWORK_ID'), 'NETWORK_ID 미사용');
});

test('listener-server/firebase-admin.js: 모든 collection에 col() 사용', () => {
  const content = readFile('listener-server/firebase-admin.js');
  const collections = ['spot_metadata', 'claim_events', 'telegram_hash_map', 'telegram_wallet_links', 'device_claim_events'];
  for (const colName of collections) {
    assert.ok(
      content.includes(`col('${colName}')`),
      `col('${colName}') 호출 누락 — 직접 문자열 사용 중일 수 있음`
    );
  }
});

// ═══════════════════════════════════════════
// 8. functions/index.js 네트워크 미들웨어 검증
// ═══════════════════════════════════════════
console.log('\n[8] functions/index.js 네트워크 미들웨어 검증');

test('functions/index.js: resolveNetwork 미들웨어 존재', () => {
  const content = readFile('functions/index.js');
  assert.ok(content.includes('function resolveNetwork'), 'resolveNetwork 함수 누락');
  assert.ok(content.includes('app.use(resolveNetwork)'), 'app.use(resolveNetwork) 누락');
});

test('functions/index.js: col(req, collection) 헬퍼 존재', () => {
  const content = readFile('functions/index.js');
  assert.ok(content.includes('function col(req, collection)'), 'col(req, collection) 함수 누락');
});

test('functions/index.js: /api/networks 엔드포인트 존재', () => {
  const content = readFile('functions/index.js');
  assert.ok(content.includes("'/api/networks'"), '/api/networks 엔드포인트 누락');
});

test('functions/index.js: Firestore 쿼리에서 col(req, ...) 사용', () => {
  const content = readFile('functions/index.js');
  // db.collection() 호출에서 col(req, ...) 패턴 사용 확인
  const dbCollectionCalls = content.match(/db\.collection\([^)]+\)/g) || [];
  const nonColCalls = dbCollectionCalls.filter(call => !call.includes('col(req,'));
  assert.strictEqual(
    nonColCalls.length, 0,
    `직접 컬렉션 이름을 사용하는 db.collection() 발견: ${nonColCalls.join(', ')}`
  );
});

// ═══════════════════════════════════════════
// 9. firestore.rules 네트워크 와일드카드 검증
// ═══════════════════════════════════════════
console.log('\n[9] firestore.rules 검증');

test('firestore.rules: networks/{networkId} 와일드카드 존재', () => {
  const content = readFile('firestore.rules');
  assert.ok(content.includes('networks/{networkId}'), 'networks/{networkId} 와일드카드 규칙 누락');
});

test('firestore.rules: 주요 컬렉션 규칙 존재', () => {
  const content = readFile('firestore.rules');
  const collections = ['spot_metadata', 'claim_events', 'config'];
  for (const col of collections) {
    assert.ok(content.includes(col), `${col} 컬렉션 규칙 누락`);
  }
});

// ═══════════════════════════════════════════
// 10. package.json 스크립트 검증
// ═══════════════════════════════════════════
console.log('\n[10] package.json 스크립트 검증');

test('package.json: listener에 NETWORK=local 설정', () => {
  const pkg = JSON.parse(readFile('package.json'));
  assert.ok(pkg.scripts.listener.includes('NETWORK=local'), 'listener 스크립트에 NETWORK=local 누락');
});

test('package.json: listener:thanos-sepolia 스크립트 존재', () => {
  const pkg = JSON.parse(readFile('package.json'));
  assert.ok(pkg.scripts['listener:thanos-sepolia'], 'listener:thanos-sepolia 스크립트 누락');
  assert.ok(
    pkg.scripts['listener:thanos-sepolia'].includes('NETWORK=thanos-sepolia'),
    'NETWORK=thanos-sepolia 설정 누락'
  );
});

test('package.json: deploy에 shared/networks.js 복사 포함', () => {
  const pkg = JSON.parse(readFile('package.json'));
  assert.ok(
    pkg.scripts.deploy.includes('cp shared/networks.js functions/shared/networks.js'),
    'deploy 스크립트에 shared module 복사 누락'
  );
});

// ═══════════════════════════════════════════
// 11. .gitignore 검증
// ═══════════════════════════════════════════
console.log('\n[11] .gitignore 검증');

test('.gitignore: functions/shared/ 포함', () => {
  const content = readFile('.gitignore');
  assert.ok(content.includes('functions/shared/'), 'functions/shared/ gitignore 누락');
});

// ═══════════════════════════════════════════
// 12. 동적 chainId 검증 (App.jsx)
// ═══════════════════════════════════════════
console.log('\n[12] 동적 chainId 검증');

test('App.jsx: chainIdHex를 동적으로 계산', () => {
  const content = readFile('client/src/App.jsx');
  assert.ok(
    content.includes("config.chainId.toString(16)"),
    'chainId 동적 hex 변환 누락'
  );
});

test('StoreKiosk.jsx: chainId를 동적으로 계산', () => {
  const content = readFile('client/src/components/StoreKiosk.jsx');
  assert.ok(
    content.includes("config.chainId.toString(16)"),
    'chainId 동적 hex 변환 누락'
  );
});

// ═══════════════════════════════════════════
// 결과 요약
// ═══════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
console.log(`결과: ${passed} passed, ${failed} failed (총 ${passed + failed} tests)`);
console.log('═'.repeat(50));

process.exit(failed > 0 ? 1 : 0);
