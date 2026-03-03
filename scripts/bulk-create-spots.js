#!/usr/bin/env node
/**
 * 스타벅스 스팟 일괄 등록 스크립트
 *
 * starbucks-data.json을 읽어 Tokamon 컨트랙트에 createSpotSelf 호출
 *
 * 환경변수:
 *   PRIVATE_KEY  - 스팟 생성자 지갑 개인키 (필수)
 *   NETWORK      - 네트워크 ID (기본: thanos-sepolia)
 *   START_INDEX  - 시작 인덱스 (기본: 0, 이어하기용)
 *   BATCH_SIZE   - 한 번에 처리할 개수 (기본: 전체)
 *   DRY_RUN      - true면 실제 트랜잭션 없이 시뮬레이션
 *
 * 사용법:
 *   PRIVATE_KEY=0x... node scripts/bulk-create-spots.js
 *   PRIVATE_KEY=0x... START_INDEX=100 BATCH_SIZE=50 node scripts/bulk-create-spots.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { ethers } = require('ethers');
const { getNetwork, getContracts, DEFAULT_NETWORK } = require('../shared/networks');

// ── 설정 ──
const DATA_PATH = path.join(__dirname, 'starbucks-data.json');
const PROGRESS_PATH = path.join(__dirname, 'bulk-create-progress.json');
const ABI_PATH = path.join(__dirname, '..', 'contracts', 'out', 'Tokamon.sol', 'Tokamon.json');

const COORD_SCALE = 1_000_000;

// 스팟 기본 설정
const SPOT_CONFIG = {
  reward: ethers.parseEther('0.5'),       // 0.5 TON per claim
  deposit: ethers.parseEther('50'),       // 50 TON per spot
  cooldown: 72000,                        // 20시간
  stampGoal: 5,                           // 5번 방문 시 보너스
  stampBonus: ethers.parseEther('2'),     // 2 TON 보너스
  allowDuplicateClaims: true,
  dailyStartTime: 0,                     // 24시간 운영
  dailyEndTime: 0,
  startDate: 0,                          // 기간 제한 없음
  endDate: 0,
};

// ── 유틸 ──

function toCoord(decimal) {
  return BigInt(Math.round(decimal * COORD_SCALE));
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_PATH)) {
      return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
    }
  } catch (_) {}
  return { completed: [], failed: [], lastIndex: -1 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

function loadAbi() {
  if (fs.existsSync(ABI_PATH)) {
    const artifact = JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));
    return artifact.abi;
  }
  // 최소 ABI fallback
  return [
    'function createSpotSelf(uint256 reward, uint128 stampGoal, uint128 stampBonus, uint48 cooldown, bool allowDuplicateClaims, tuple(string name, string description, int96 lat, int96 lng, uint64 startDate, uint64 endDate, uint16 dailyStartTime, uint16 dailyEndTime, int8 utcOffset) meta) external payable returns (uint256)',
    'function nextSpotId() external view returns (uint256)',
  ];
}

// ── 메인 ──

async function main() {
  // 데이터 로드
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`데이터 파일이 없습니다: ${DATA_PATH}`);
    console.error('먼저 node scripts/fetch-starbucks.js 를 실행하세요.');
    process.exit(1);
  }

  const allSpots = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  console.log(`데이터 로드: ${allSpots.length}개 스타벅스\n`);

  // 환경변수
  const privateKey = process.env.SPOT_CREATOR_PRIVATE_KEY;
  if (!privateKey && !process.env.DRY_RUN) {
    console.error('SPOT_CREATOR_PRIVATE_KEY 환경변수가 필요합니다.');
    console.error('.env 파일에 SPOT_CREATOR_PRIVATE_KEY=0x... 를 추가하세요.');
    process.exit(1);
  }

  const networkId = process.env.NETWORK || DEFAULT_NETWORK;
  const networkConfig = getNetwork(networkId);
  const networkContracts = getContracts(networkId);
  const contractAddress = networkContracts.tokamon;

  if (!contractAddress) {
    console.error(`${networkId} 네트워크에 Tokamon 컨트랙트가 없습니다.`);
    process.exit(1);
  }

  const startIndex = parseInt(process.env.START_INDEX || '0', 10);
  const batchSize = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE, 10) : allSpots.length;
  const dryRun = process.env.DRY_RUN === 'true';
  const endIndex = Math.min(startIndex + batchSize, allSpots.length);
  const spots = allSpots.slice(startIndex, endIndex);

  console.log(`네트워크: ${networkConfig.name} (${networkId})`);
  console.log(`컨트랙트: ${contractAddress}`);
  console.log(`처리 범위: ${startIndex} ~ ${endIndex - 1} (${spots.length}개)`);
  console.log(`스팟 설정: reward=${ethers.formatEther(SPOT_CONFIG.reward)} TON, deposit=${ethers.formatEther(SPOT_CONFIG.deposit)} TON`);
  console.log(`  cooldown=${SPOT_CONFIG.cooldown}s (${(SPOT_CONFIG.cooldown / 3600).toFixed(1)}h), stampGoal=${SPOT_CONFIG.stampGoal}, stampBonus=${ethers.formatEther(SPOT_CONFIG.stampBonus)} TON`);
  console.log(`필요 TON: ${spots.length} x ${ethers.formatEther(SPOT_CONFIG.deposit)} = ${spots.length * Number(ethers.formatEther(SPOT_CONFIG.deposit))} TON`);
  if (dryRun) console.log('** DRY RUN 모드 — 실제 트랜잭션 없음 **');
  console.log('');

  // Provider & Wallet
  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  let wallet;
  if (privateKey) {
    wallet = new ethers.Wallet(privateKey, provider);
  }

  if (wallet) {
    const balance = await provider.getBalance(wallet.address);
    console.log(`지갑: ${wallet.address}`);
    console.log(`잔액: ${ethers.formatEther(balance)} TON\n`);

    const needed = SPOT_CONFIG.deposit * BigInt(spots.length);
    if (balance < needed) {
      console.warn(`경고: 잔액 부족! 필요: ${ethers.formatEther(needed)} TON, 보유: ${ethers.formatEther(balance)} TON`);
      console.warn('일부만 등록될 수 있습니다.\n');
    }
  }

  // Contract
  const abi = loadAbi();
  const contract = wallet ? new ethers.Contract(contractAddress, abi, wallet) : null;

  // 진행 상태 로드
  const progress = loadProgress();
  const completedSet = new Set(progress.completed);

  // 실행
  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();
  let nonce = wallet ? await provider.getTransactionCount(wallet.address) : 0;

  for (let i = 0; i < spots.length; i++) {
    const globalIdx = startIndex + i;
    if (completedSet.has(globalIdx)) {
      console.log(`[${i + 1}/${spots.length}] #${globalIdx} 스킵 (이미 완료)`);
      successCount++;
      continue;
    }

    const spot = spots[i];
    const lat = toCoord(spot.lat);
    const lng = toCoord(spot.lng);
    const name = spot.name || 'Starbucks';
    const description = spot.branch || `${spot.city}, ${spot.country}`;

    const meta = {
      name,
      description,
      lat,
      lng,
      startDate: SPOT_CONFIG.startDate,
      endDate: SPOT_CONFIG.endDate,
      dailyStartTime: SPOT_CONFIG.dailyStartTime,
      dailyEndTime: SPOT_CONFIG.dailyEndTime,
      utcOffset: spot.utcOffset,
    };

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(
      `[${i + 1}/${spots.length}] #${globalIdx} "${name}" (${spot.city}) ${spot.lat.toFixed(5)},${spot.lng.toFixed(5)} ... `
    );

    if (dryRun) {
      console.log(`DRY (${elapsed}s)`);
      successCount++;
      continue;
    }

    // 최대 3회 재시도
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const tx = await contract.createSpotSelf(
          SPOT_CONFIG.reward,
          SPOT_CONFIG.stampGoal,
          SPOT_CONFIG.stampBonus,
          SPOT_CONFIG.cooldown,
          SPOT_CONFIG.allowDuplicateClaims,
          meta,
          { value: SPOT_CONFIG.deposit, nonce }
        );

        const receipt = await tx.wait();
        nonce++;
        const spotId = receipt.logs
          .map((log) => {
            try { return contract.interface.parseLog(log); } catch (_) { return null; }
          })
          .find((e) => e && e.name === 'SpotCreated')
          ?.args?.spotId;

        console.log(`OK spotId=${spotId != null ? Number(spotId) : '?'} tx=${tx.hash.slice(0, 14)}... (${elapsed}s)`);

        progress.completed.push(globalIdx);
        progress.lastIndex = globalIdx;
        saveProgress(progress);
        successCount++;
        success = true;
        break;
      } catch (e) {
        const errMsg = e.shortMessage || e.message || String(e);
        if (attempt < 3) {
          process.stdout.write(`재시도 ${attempt}/3 (${errMsg.slice(0, 60)})... `);
          await new Promise((r) => setTimeout(r, 3000 * attempt));
        } else {
          console.log(`실패: ${errMsg.slice(0, 80)}`);
          progress.failed.push({ index: globalIdx, error: errMsg.slice(0, 200) });
          saveProgress(progress);
          failCount++;
        }
      }
    }
  }

  // 결과 요약
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n═══════════════════════════════════════');
  console.log(`완료! 성공: ${successCount}, 실패: ${failCount}, 소요: ${totalTime}s`);
  if (failCount > 0) {
    console.log(`실패 목록은 ${PROGRESS_PATH} 에서 확인하세요.`);
    console.log('이어하기: START_INDEX=<다음인덱스> 로 재실행');
  }
  console.log('═══════════════════════════════════════');
}

main().catch((e) => {
  console.error('치명적 오류:', e.message);
  process.exit(1);
});
