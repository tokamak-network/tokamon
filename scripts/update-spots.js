#!/usr/bin/env node
/**
 * 등록된 스팟의 메타데이터 수정 스크립트
 *
 * 사용법:
 *   node scripts/update-spots.js spots-kr.json --start-spot-id 19 --start-index 0 --count 9
 *
 * 옵션:
 *   <data-file>       데이터 파일 (spots-kr.json 등)
 *   --start-spot-id   수정 시작할 온체인 spotId
 *   --start-index     데이터 파일에서 시작할 인덱스
 *   --count           수정할 개수
 *   --dry-run         실제 트랜잭션 없이 확인만
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { ethers } = require('ethers');
const { getNetwork, getContracts, DEFAULT_NETWORK } = require('../shared/networks');

const COORD_SCALE = 1_000_000;

const SPOT_CONFIG = {
  reward: ethers.parseEther('0.5'),
  cooldown: 72000,
  stampGoal: 5,
  stampBonus: ethers.parseEther('2'),
  allowDuplicateClaims: true,
  dailyStartTime: 0,
  dailyEndTime: 0,
  startDate: 0,
  endDate: 0,
};

function toCoord(decimal) {
  return BigInt(Math.round(decimal * COORD_SCALE));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dataFile: null, startSpotId: null, startIndex: 0, count: null, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start-spot-id') opts.startSpotId = parseInt(args[++i], 10);
    else if (args[i] === '--start-index') opts.startIndex = parseInt(args[++i], 10);
    else if (args[i] === '--count') opts.count = parseInt(args[++i], 10);
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (!args[i].startsWith('--')) opts.dataFile = args[i];
  }

  if (!opts.dataFile || opts.startSpotId == null || opts.count == null) {
    console.error('사용법: node scripts/update-spots.js <data-file> --start-spot-id <id> --start-index <idx> --count <n>');
    process.exit(1);
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const dataPath = path.join(__dirname, opts.dataFile);
  const allSpots = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  const spots = allSpots.slice(opts.startIndex, opts.startIndex + opts.count);
  console.log(`데이터: ${opts.dataFile} (${allSpots.length}개 중 #${opts.startIndex}~#${opts.startIndex + opts.count - 1})`);
  console.log(`수정 대상: spotId ${opts.startSpotId} ~ ${opts.startSpotId + opts.count - 1} (${opts.count}개)`);
  if (opts.dryRun) console.log('** DRY RUN **');
  console.log('');

  const privateKey = process.env.SPOT_CREATOR_PRIVATE_KEY || process.env.SPOT_CREATER_PRIVATE_KEY;
  if (!privateKey && !opts.dryRun) {
    console.error('SPOT_CREATOR_PRIVATE_KEY 환경변수가 필요합니다.');
    process.exit(1);
  }

  const networkId = process.env.NETWORK || DEFAULT_NETWORK;
  const networkConfig = getNetwork(networkId);
  const contractAddress = getContracts(networkId).tokamon;

  console.log(`네트워크: ${networkConfig.name} (${networkId})`);
  console.log(`컨트랙트: ${contractAddress}\n`);

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const abi = [
    'function updateSpot(uint256 spotId, uint256 reward, uint128 stampGoal, uint128 stampBonus, uint48 cooldown, bool allowDuplicateClaims, tuple(string name, string description, int96 lat, int96 lng, uint64 startDate, uint64 endDate, uint16 dailyStartTime, uint16 dailyEndTime, int8 utcOffset) meta) external',
  ];
  const contract = new ethers.Contract(contractAddress, abi, wallet);

  let nonce = await provider.getTransactionCount(wallet.address);
  let success = 0;
  let fail = 0;

  for (let i = 0; i < spots.length; i++) {
    const spotId = opts.startSpotId + i;
    const spot = spots[i];
    const description = spot.branch || `${spot.city}, ${spot.country}`;

    process.stdout.write(`[${i + 1}/${spots.count || spots.length}] spotId=${spotId} "${spot.name}" desc="${description}" ... `);

    if (opts.dryRun) {
      console.log('DRY');
      success++;
      continue;
    }

    try {
      const meta = {
        name: spot.name || 'Starbucks',
        description,
        lat: toCoord(spot.lat),
        lng: toCoord(spot.lng),
        startDate: SPOT_CONFIG.startDate,
        endDate: SPOT_CONFIG.endDate,
        dailyStartTime: SPOT_CONFIG.dailyStartTime,
        dailyEndTime: SPOT_CONFIG.dailyEndTime,
        utcOffset: spot.utcOffset,
      };

      const tx = await contract.updateSpot(
        spotId,
        SPOT_CONFIG.reward,
        SPOT_CONFIG.stampGoal,
        SPOT_CONFIG.stampBonus,
        SPOT_CONFIG.cooldown,
        SPOT_CONFIG.allowDuplicateClaims,
        meta,
        { nonce }
      );
      await tx.wait();
      nonce++;
      console.log(`OK tx=${tx.hash.slice(0, 14)}...`);
      success++;
    } catch (e) {
      console.log(`실패: ${(e.shortMessage || e.message).slice(0, 80)}`);
      fail++;
    }
  }

  console.log(`\n완료! 성공: ${success}, 실패: ${fail}`);
}

main().catch((e) => {
  console.error('오류:', e.message);
  process.exit(1);
});
