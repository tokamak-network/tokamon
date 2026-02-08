/**
 * 통합 테스트 + 시뮬레이션
 * - 단위테스트: blockchain.js 각 함수 개별 검증
 * - 통합테스트: API 엔드포인트 (spots, claim) 전체 흐름
 * - 시뮬레이션: 스팟 생성 → 클레임 → 히스토리 전체 시나리오
 */

const http = require('http');
const app = require('./test-app');
const blockchain = require('../blockchain');

const PORT = 3099;
let server;

// 간단한 HTTP 요청 헬퍼
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.error(`  ❌ ${name}`);
    failed++;
  }
}

async function run() {
  // 블록체인 초기화
  await blockchain.init();

  server = app.listen(PORT, () => {
    console.log(`테스트 서버 시작: http://127.0.0.1:${PORT}`);
  });

  // Ganache account[1]을 테스트 유저로 사용
  const { ethers } = require('ethers');
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8999');
  const accounts = await provider.listAccounts();
  const userAddress = accounts[1].address;
  const userAddress2 = accounts[2].address;

  try {
    // ============================================
    console.log('\n📦 1. 단위테스트: blockchain.js 함수');
    // ============================================

    // 1-1. deposit (faucet)
    const balAfterDeposit = await blockchain.deposit(userAddress, 500);
    assert(balAfterDeposit === 500, `deposit: 잔액 500 TON (실제: ${balAfterDeposit})`);

    // 1-2. getBalance
    const bal = await blockchain.getBalance(userAddress);
    assert(bal === 500, `getBalance: 500 TON (실제: ${bal})`);

    // 1-3. createSpot (메타데이터 포함)
    const spotId = await blockchain.createSpot(userAddress, 100, 10, {
      name: '테스트 스팟',
      description: '단위테스트용',
      lat: 37.5665,
      lng: 126.978,
      startTime: '00:00',
      endTime: '23:59',
    });
    assert(spotId === 0, `createSpot: spotId = ${spotId}`);

    // 1-4. getSpot (메타데이터 확인)
    const spot = await blockchain.getSpot(0);
    assert(spot.name === '테스트 스팟', `getSpot: name = "${spot.name}"`);
    assert(spot.reward === 10, `getSpot: reward = ${spot.reward}`);
    assert(spot.remaining === 100, `getSpot: remaining = ${spot.remaining}`);
    assert(Math.abs(spot.lat - 37.5665) < 0.001, `getSpot: lat = ${spot.lat}`);
    assert(Math.abs(spot.lng - 126.978) < 0.001, `getSpot: lng = ${spot.lng}`);
    assert(spot.start_time === '00:00', `getSpot: start_time = "${spot.start_time}"`);
    assert(spot.end_time === '23:59', `getSpot: end_time = "${spot.end_time}"`);
    assert(spot.creator_address === userAddress, `getSpot: creator_address 일치`);

    // 1-5. getAllSpots
    const allSpots = await blockchain.getAllSpots();
    assert(allSpots.length === 1, `getAllSpots: ${allSpots.length}개`);
    assert(allSpots[0].name === '테스트 스팟', `getAllSpots: 이름 일치`);

    // 1-6. checkHasClaimed (클레임 전)
    const notClaimed = await blockchain.checkHasClaimed(0, userAddress2);
    assert(notClaimed === false, `checkHasClaimed: 클레임 전 = false`);

    // 1-7. deposit for user2 and claim
    await blockchain.deposit(userAddress2, 100);
    const claimBal = await blockchain.claim(0, userAddress2);
    assert(claimBal === 110, `claim: user2 잔액 110 TON (실제: ${claimBal})`);

    // 1-8. checkHasClaimed (클레임 후)
    const claimed = await blockchain.checkHasClaimed(0, userAddress2);
    assert(claimed === true, `checkHasClaimed: 클레임 후 = true`);

    // 1-9. getSpot remaining 감소 확인
    const spotAfter = await blockchain.getSpot(0);
    assert(spotAfter.remaining === 90, `remaining 감소: ${spotAfter.remaining}`);

    // 1-10. getClaimHistory
    const history = await blockchain.getClaimHistory(userAddress2);
    assert(history.length === 1, `getClaimHistory: ${history.length}건`);
    assert(history[0].reward === 10, `getClaimHistory: reward = ${history[0].reward}`);
    assert(history[0].spot_name === '테스트 스팟', `getClaimHistory: spot_name = "${history[0].spot_name}"`);

    // ============================================
    console.log('\n🌐 2. 통합테스트: API 엔드포인트');
    // ============================================

    // 2-1. GET /api/spots
    const spotsRes = await request('GET', '/api/spots');
    assert(spotsRes.status === 200, `GET /api/spots: status ${spotsRes.status}`);
    assert(Array.isArray(spotsRes.body), `GET /api/spots: 배열 반환`);
    assert(spotsRes.body.length >= 1, `GET /api/spots: ${spotsRes.body.length}개 스팟`);
    assert(spotsRes.body[0].name === '테스트 스팟', `GET /api/spots: name 필드 존재`);
    assert(spotsRes.body[0].lat != null, `GET /api/spots: lat 필드 존재`);
    assert(typeof spotsRes.body[0].active === 'boolean', `GET /api/spots: active 필드 존재`);

    // 2-2. POST /api/spots — 새 스팟 생성
    // 먼저 user에게 추가 입금
    await blockchain.deposit(userAddress, 500);
    const createRes = await request('POST', '/api/spots', {
      name: 'API 테스트 스팟',
      description: '통합테스트',
      lat: 37.5,
      lng: 127.0,
      start_time: '00:00',
      end_time: '23:59',
      deposit: 200,
      reward: 5,
      creator_address: userAddress,
    });
    assert(createRes.status === 201, `POST /api/spots: status ${createRes.status}`);
    assert(createRes.body.name === 'API 테스트 스팟', `POST /api/spots: name = "${createRes.body.name}"`);
    assert(createRes.body.id != null, `POST /api/spots: id 존재 (${createRes.body.id})`);
    assert(createRes.body.balance != null, `POST /api/spots: balance 반환`);

    // 2-3. POST /api/spots — 필수 필드 누락
    const badRes = await request('POST', '/api/spots', { name: 'test' });
    assert(badRes.status === 400, `POST /api/spots 필드 누락: status ${badRes.status}`);

    // 2-4. POST /api/claim/request — 클레임 (user2가 새 스팟)
    // user2는 이미 spotId=0을 클레임했으므로, spotId=1 (API 테스트 스팟)을 클레임
    const claimRes = await request('POST', '/api/claim/request', {
      user_address: userAddress2,
      spot_id: 1,
      lat: 37.5,
      lng: 127.0,
    });
    assert(claimRes.status === 200, `POST /api/claim/request: status ${claimRes.status}`);
    assert(claimRes.body.reward === 5, `POST /api/claim/request: reward = ${claimRes.body.reward}`);
    assert(claimRes.body.spot_name === 'API 테스트 스팟', `POST /api/claim/request: spot_name`);

    // 2-5. POST /api/claim/request — 중복 클레임
    const dupRes = await request('POST', '/api/claim/request', {
      user_address: userAddress2,
      spot_id: 1,
      lat: 37.5,
      lng: 127.0,
    });
    assert(dupRes.status === 400, `중복 클레임 거부: status ${dupRes.status}`);

    // 2-6. POST /api/claim/request — 거리 초과
    const farRes = await request('POST', '/api/claim/request', {
      user_address: accounts[3].address,
      spot_id: 1,
      lat: 38.0,
      lng: 128.0,
    });
    assert(farRes.status === 400, `거리 초과 거부: status ${farRes.status}`);

    // 2-7. GET /api/claim/history
    const histRes = await request('GET', `/api/claim/history?user_address=${userAddress2}`);
    assert(histRes.status === 200, `GET /api/claim/history: status ${histRes.status}`);
    assert(Array.isArray(histRes.body), `GET /api/claim/history: 배열 반환`);
    assert(histRes.body.length >= 1, `GET /api/claim/history: ${histRes.body.length}건`);

    // ============================================
    console.log('\n🎮 3. 시뮬레이션: 전체 시나리오');
    // ============================================

    // 시나리오: 크리에이터가 스팟 생성, 3명이 차례로 클레임
    const creator = accounts[4].address;
    const players = [accounts[5].address, accounts[6].address, accounts[7].address];

    // 크리에이터 입금 + 스팟 생성
    await blockchain.deposit(creator, 1000);
    const simCreateRes = await request('POST', '/api/spots', {
      name: '강남역 토카몬',
      description: '시뮬레이션 스팟',
      lat: 37.4979,
      lng: 127.0276,
      start_time: '00:00',
      end_time: '23:59',
      deposit: 300,
      reward: 100,
      creator_address: creator,
    });
    assert(simCreateRes.status === 201, `시뮬레이션 스팟 생성: status ${simCreateRes.status}`);
    const simSpotId = simCreateRes.body.id;
    console.log(`  📍 스팟 생성됨: id=${simSpotId}, name="${simCreateRes.body.name}"`);

    // 각 플레이어가 순서대로 클레임
    for (let i = 0; i < players.length; i++) {
      await blockchain.deposit(players[i], 10); // 최소 잔액

      const res = await request('POST', '/api/claim/request', {
        user_address: players[i],
        spot_id: simSpotId,
        lat: 37.4979,
        lng: 127.0276,
      });

      if (i < 3) {
        // deposit=300, reward=100 → 3명 클레임 가능
        assert(res.status === 200, `플레이어 ${i + 1} 클레임: status ${res.status}`);
        console.log(`  🎉 플레이어 ${i + 1}: ${res.body.reward} TON 획득, 잔액 ${res.body.balance} TON`);
      }
    }

    // 스팟 소진 확인
    const exhaustedSpot = await blockchain.getSpot(simSpotId);
    assert(exhaustedSpot.remaining === 0, `스팟 소진: remaining = ${exhaustedSpot.remaining}`);

    // 소진된 스팟에 추가 클레임 시도
    await blockchain.deposit(accounts[8].address, 10);
    const exhaustRes = await request('POST', '/api/claim/request', {
      user_address: accounts[8].address,
      spot_id: simSpotId,
      lat: 37.4979,
      lng: 127.0276,
    });
    assert(exhaustRes.status === 400, `소진된 스팟 클레임 거부: status ${exhaustRes.status}`);

    // 전체 스팟 목록 확인
    const finalSpotsRes = await request('GET', '/api/spots');
    assert(finalSpotsRes.status === 200, `최종 스팟 목록: ${finalSpotsRes.body.length}개`);
    const simSpotInList = finalSpotsRes.body.find((s) => s.id === simSpotId);
    assert(simSpotInList && simSpotInList.remaining === 0, `목록에서 소진 스팟 확인`);
    assert(simSpotInList && simSpotInList.active === false, `소진 스팟 active=false`);

  } catch (err) {
    console.error('\n💥 테스트 실패:', err);
    failed++;
  } finally {
    server.close();
    console.log(`\n${'='.repeat(50)}`);
    console.log(`결과: ✅ ${passed} passed, ❌ ${failed} failed`);
    console.log('='.repeat(50));
    process.exit(failed > 0 ? 1 : 0);
  }
}

run();
