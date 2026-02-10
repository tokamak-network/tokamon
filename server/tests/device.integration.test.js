/**
 * 기기 기반 클레임 통합 테스트
 * - 기기 API 엔드포인트 테스트
 * - blockchain 함수 단위 테스트
 *
 * 실행 조건: Ganache + 컨트랙트 배포 완료
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const blockchain = require('../blockchain');
const deviceRoutes = require('../routes/device');
const spotRoutes = require('../routes/spots');
const { hashDeviceId, isValidDeviceId } = require('../utils');

const PORT = 3098;
let server;

// 테스트용 Express 앱
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/device', deviceRoutes);
app.use('/api/spots', spotRoutes);

// HTTP 요청 헬퍼
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
  await blockchain.init();

  server = app.listen(PORT, () => {
    console.log(`기기 테스트 서버 시작: http://127.0.0.1:${PORT}`);
  });

  const { ethers } = require('ethers');
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8999');
  const accounts = await provider.listAccounts();
  const adminAddress = accounts[0].address;

  try {
    // ============================================
    console.log('\n🔧 1. 유틸 단위테스트');
    // ============================================

    assert(isValidDeviceId('abcdef0123456789') === true, 'isValidDeviceId: 정상 16자리 hex');
    assert(isValidDeviceId('ABCDEF0123456789') === true, 'isValidDeviceId: 대문자 hex');
    assert(isValidDeviceId('invalid') === false, 'isValidDeviceId: 잘못된 형식');
    assert(isValidDeviceId(null) === false, 'isValidDeviceId: null');
    assert(isValidDeviceId('') === false, 'isValidDeviceId: 빈 문자열');

    const h1 = hashDeviceId('abcdef0123456789');
    const h2 = hashDeviceId('ABCDEF0123456789');
    assert(h1 === h2, 'hashDeviceId: 대소문자 무시');
    assert(h1.length === 64, 'hashDeviceId: 64자리 hex');

    const h3 = hashDeviceId('1111222233334444');
    assert(h1 !== h3, 'hashDeviceId: 다른 입력 → 다른 해시');

    // ============================================
    console.log('\n📦 2. blockchain 단위테스트');
    // ============================================

    // 스팟 생성을 위해 admin에게 TON 입금
    // 먼저 TON 토큰 잔액 확인 (Faucet에서 받거나 admin이 민팅했으므로)
    const fs = require('fs');
    const path = require('path');
    const addrFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contract-address.json'), 'utf8'));
    const tonTokenAddr = addrFile.tonToken;

    // admin이 TON 토큰을 가지고 있으므로 직접 approve + depositSelf로 입금
    // blockchain.deposit은 admin → user에 입금하는 함수
    // 여기서는 admin이 자신에게 deposit
    const bal0 = await blockchain.getBalance(adminAddress);
    console.log(`  Admin 현재 잔액: ${bal0} TON`);

    // admin에게 TON 입금 (deposit 함수가 admin이 transferFrom하는 방식)
    // TON 토큰 approve 먼저 해야 함 - blockchain.deposit을 사용하면 admin이 approve 해야 함
    // 대신, Faucet을 통해 입금하거나 직접 컨트랙트 호출

    // 스팟 생성을 위해 deposit
    try {
      // 먼저 TON 토큰의 approve 호출
      const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'contracts', 'out', 'TONToken.sol', 'TONToken.json'), 'utf8'));
      const tonContract = new ethers.Contract(tonTokenAddr, artifact.abi, accounts[0]);

      const tokamonAddr = addrFile.address || addrFile.tokamon;
      const approveTx = await tonContract.approve(tokamonAddr, ethers.parseEther('10000'));
      await approveTx.wait();
      console.log('  TON approve 완료');

      // depositSelf 호출
      const tokamonArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'contracts', 'out', 'Tokamon.sol', 'Tokamon.json'), 'utf8'));
      const tokamonContract = new ethers.Contract(tokamonAddr, tokamonArtifact.abi, accounts[0]);
      const depositTx = await tokamonContract.depositSelf(ethers.parseEther('5000'));
      await depositTx.wait();
      console.log('  depositSelf 완료');
    } catch (e) {
      console.log('  deposit 설정 에러 (계속 진행):', e.message);
    }

    // 스팟 생성 테스트
    const spotId = await blockchain.createSpot(
      adminAddress, 500, 10, 5, 20, 60, false,
      { name: '기기 테스트 스팟', description: '테스트', lat: 37.5665, lng: 126.978, startTime: '00:00', endTime: '23:59' }
    );
    assert(spotId >= 0, `createSpot 성공: spotId=${spotId}`);

    // 2-1. claimByDevice
    const deviceHash = hashDeviceId('aa11bb22cc33dd44');
    const claimResult = await blockchain.claimByDevice(spotId, deviceHash);
    assert(claimResult.reward === 10, `claimByDevice reward: ${claimResult.reward}`);
    assert(claimResult.balance > 0, `claimByDevice balance: ${claimResult.balance}`);

    // 2-2. getDeviceBalance
    const devBal = await blockchain.getDeviceBalance(deviceHash);
    assert(devBal === 10, `getDeviceBalance: ${devBal}`);

    // 2-3. getDeviceStampInfo
    const stampInfo = await blockchain.getDeviceStampInfo(spotId, deviceHash);
    assert(stampInfo.stamps === 1, `getDeviceStampInfo stamps: ${stampInfo.stamps}`);
    assert(stampInfo.goal === 5, `getDeviceStampInfo goal: ${stampInfo.goal}`);

    // 2-4. 다른 기기로 클레임 (독립적)
    const deviceHash2 = hashDeviceId('ee55ff66aa77bb88');
    const claimResult2 = await blockchain.claimByDevice(spotId, deviceHash2);
    assert(claimResult2.reward === 10, `다른 기기 claimByDevice reward: ${claimResult2.reward}`);

    // 2-5. 잔액 독립 확인
    const devBal1 = await blockchain.getDeviceBalance(deviceHash);
    const devBal2 = await blockchain.getDeviceBalance(deviceHash2);
    assert(devBal1 === 10, `기기1 잔액 독립: ${devBal1}`);
    assert(devBal2 === 10, `기기2 잔액 독립: ${devBal2}`);

    // ============================================
    console.log('\n🌐 3. API 통합테스트');
    // ============================================

    // 3-0. 새 스팟 생성 (API 테스트용)
    const apiSpotId = await blockchain.createSpot(
      adminAddress, 300, 10, 5, 20, 0, false,
      { name: 'API 기기 스팟', description: 'API 테스트', lat: 37.5665, lng: 126.978, startTime: '00:00', endTime: '23:59' }
    );

    // 3-1. POST /api/device/claim — 정상 클레임
    const claimRes = await request('POST', '/api/device/claim', {
      device_id: 'aabb112233445566',
      spot_id: apiSpotId,
      lat: 37.5665,
      lng: 126.978,
    });
    assert(claimRes.status === 200, `POST /api/device/claim 성공: status ${claimRes.status}`);
    assert(claimRes.body.reward === 10, `클레임 reward: ${claimRes.body.reward}`);
    assert(claimRes.body.balance > 0, `클레임 후 잔액: ${claimRes.body.balance}`);
    assert(claimRes.body.spot_name === 'API 기기 스팟', `spot_name: ${claimRes.body.spot_name}`);

    // 3-2. POST /api/device/balance — 잔액 조회
    const balRes = await request('POST', '/api/device/balance', {
      device_id: 'aabb112233445566',
    });
    assert(balRes.status === 200, `POST /api/device/balance 성공: status ${balRes.status}`);
    assert(balRes.body.balance === 10, `잔액 조회: ${balRes.body.balance}`);

    // 3-3. POST /api/device/stamp-info — 스탬프 정보
    const stampRes = await request('POST', '/api/device/stamp-info', {
      device_id: 'aabb112233445566',
      spot_id: apiSpotId,
    });
    assert(stampRes.status === 200, `POST /api/device/stamp-info 성공: status ${stampRes.status}`);
    assert(stampRes.body.stamps === 1, `스탬프: ${stampRes.body.stamps}`);
    assert(stampRes.body.goal === 5, `스탬프 목표: ${stampRes.body.goal}`);

    // 3-4. 잘못된 device_id 형식
    const badIdRes = await request('POST', '/api/device/claim', {
      device_id: 'invalid',
      spot_id: apiSpotId,
      lat: 37.5665,
      lng: 126.978,
    });
    assert(badIdRes.status === 400, `잘못된 기기 ID 거부: status ${badIdRes.status}`);

    // 3-5. device_id 누락
    const noIdRes = await request('POST', '/api/device/claim', {
      spot_id: apiSpotId,
      lat: 37.5665,
      lng: 126.978,
    });
    assert(noIdRes.status === 400, `기기 ID 누락 거부: status ${noIdRes.status}`);

    // 3-6. 거리 초과
    const farRes = await request('POST', '/api/device/claim', {
      device_id: 'ccdd556677889900',
      spot_id: apiSpotId,
      lat: 38.0,
      lng: 128.0,
    });
    assert(farRes.status === 400, `거리 초과 거부: status ${farRes.status}`);
    assert(farRes.body.error.includes('멀어요'), `거리 에러 메시지: ${farRes.body.error}`);

    // 3-7. 다른 기기 같은 스팟 — 독립 클레임 가능
    const device2Res = await request('POST', '/api/device/claim', {
      device_id: 'ddee778899001122',
      spot_id: apiSpotId,
      lat: 37.5665,
      lng: 126.978,
    });
    assert(device2Res.status === 200, `다른 기기 클레임 성공: status ${device2Res.status}`);

    // 3-8. 잔액 조회 — device_id 형식 에러
    const badBalRes = await request('POST', '/api/device/balance', {
      device_id: 'xyz',
    });
    assert(badBalRes.status === 400, `잘못된 형식 잔액 조회 거부: status ${badBalRes.status}`);

    // 3-9. 잔액 조회 — device_id 누락
    const noBalRes = await request('POST', '/api/device/balance', {});
    assert(noBalRes.status === 400, `기기 ID 누락 잔액 조회 거부: status ${noBalRes.status}`);

    // 3-10. stamp-info — 필수 항목 누락
    const noStampRes = await request('POST', '/api/device/stamp-info', {
      device_id: 'aabb112233445566',
    });
    assert(noStampRes.status === 400, `stamp-info 필수 항목 누락 거부: status ${noStampRes.status}`);

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
