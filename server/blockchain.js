const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8999';
const ARTIFACT_PATH = path.join(__dirname, '..', 'contracts', 'out', 'Tokamon.sol', 'Tokamon.json');
const ADDRESS_PATH = path.join(__dirname, 'contract-address.json');
const METADATA_PATH = path.join(__dirname, 'spot-metadata.json');

const COORD_SCALE = 1_000_000; // 좌표 스케일 (1e6)

let provider;
let signer; // admin (Ganache account[0])
let contract;

// 스팟 메타데이터 캐시 (컨트랙트 string 반환 문제 우회)
let spotMetadata = {};

// 메타데이터 로드
function loadMetadata() {
  try {
    if (fs.existsSync(METADATA_PATH)) {
      spotMetadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
      console.log(`메타데이터 로드: ${Object.keys(spotMetadata).length}개 스팟`);
    }
  } catch (e) {
    console.error('메타데이터 로드 실패:', e.message);
  }
}

// 메타데이터 저장
function saveMetadata() {
  try {
    fs.writeFileSync(METADATA_PATH, JSON.stringify(spotMetadata, null, 2));
  } catch (e) {
    console.error('메타데이터 저장 실패:', e.message);
  }
}

// 메타데이터 업데이트 (외부에서 호출 가능)
function updateMetadata(spotId, metadata) {
  spotMetadata[spotId] = metadata;
  console.log(`메타데이터 업데이트: Spot ${spotId} - ${metadata.name}`);
}

// wei <-> TON (표시용) 변환: 1 TON = 1 ether (10^18 wei)
const toWei = (ton) => ethers.parseEther(String(ton));
const fromWei = (wei) => Number(ethers.formatEther(wei));

// 주소 체크섬 정규화 (ethers v6는 체크섬 필수)
const toAddr = (addr) => ethers.getAddress(addr);

async function init() {
  provider = new ethers.JsonRpcProvider(RPC_URL);
  const accounts = await provider.listAccounts();
  signer = accounts[0];

  if (!fs.existsSync(ADDRESS_PATH)) {
    throw new Error('contract-address.json이 없습니다. 먼저 npm run deploy를 실행하세요.');
  }

  const { address } = JSON.parse(fs.readFileSync(ADDRESS_PATH, 'utf8'));
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

  contract = new ethers.Contract(address, artifact.abi, signer);
  console.log(`블록체인 연결 완료 (컨트랙트: ${address})`);

  // 메타데이터 로드
  loadMetadata();
}

// Faucet: admin이 ETH를 컨트랙트에 보내고 user 잔액 증가
async function deposit(userAddress, amountTon) {
  const tx = await contract.deposit(toAddr(userAddress), { value: toWei(amountTon) });
  await tx.wait();
  const bal = await contract.getBalance(toAddr(userAddress));
  return fromWei(bal);
}

// ETH Faucet: admin이 user에게 직접 ETH 전송
async function sendETH(toAddress, amountETH) {
  const tx = await signer.sendTransaction({
    to: toAddr(toAddress),
    value: toWei(amountETH)
  });
  await tx.wait();
  return amountETH;
}

// 스팟 생성 (스탬프 시스템 포함)
async function createSpot(creatorAddress, depositTon, rewardTon, stampGoal, stampBonus, cooldown, allowDuplicateClaims, metadata) {
  const { name, description, lat, lng, startTime, endTime } = metadata;

  const scaledLat = Math.round(lat * COORD_SCALE);
  const scaledLng = Math.round(lng * COORD_SCALE);

  const meta = {
    name,
    description: description || '',
    lat: scaledLat,
    lng: scaledLng,
    startTime,
    endTime,
  };

  const tx = await contract.createSpot(
    toAddr(creatorAddress),
    toWei(depositTon),
    toWei(rewardTon),
    stampGoal,
    toWei(stampBonus),
    cooldown,
    allowDuplicateClaims,
    meta
  );
  await tx.wait();

  const nextId = await contract.nextSpotId();
  const spotId = Number(nextId) - 1;

  // 메타데이터 캐시 및 저장
  spotMetadata[spotId] = {
    name,
    description: description || '',
    lat,
    lng,
    start_time: startTime,
    end_time: endTime,
  };
  saveMetadata();

  return spotId;
}

// 재예치: 기존 스팟에 TON 추가
async function redeposit(spotId, creatorAddress, amountTon) {
  const tx = await contract.redeposit(spotId, toAddr(creatorAddress), toWei(amountTon));
  await tx.wait();

  const spot = await getSpot(spotId);
  const bal = await contract.getBalance(toAddr(creatorAddress));
  return { spotRemaining: spot.remaining, balance: fromWei(bal) };
}

// 클레임 (스탬프 + 쿨다운 포함)
async function claim(spotId, userAddress) {
  const addr = toAddr(userAddress);
  const tx = await contract.claim(spotId, addr);
  const receipt = await tx.wait();

  // Claimed 이벤트에서 결과 추출
  const claimedEvent = receipt.logs
    .map((log) => {
      try { return contract.interface.parseLog(log); } catch (_) { return null; }
    })
    .find((e) => e && e.name === 'Claimed');

  const bal = await contract.getBalance(addr);

  if (claimedEvent) {
    return {
      reward: fromWei(claimedEvent.args.reward),
      bonus: fromWei(claimedEvent.args.bonus),
      stamp: Number(claimedEvent.args.stamp),
      balance: fromWei(bal),
    };
  }

  return { reward: 0, bonus: 0, stamp: 0, balance: fromWei(bal) };
}

// 잔액 조회
async function getBalance(userAddress) {
  const bal = await contract.getBalance(toAddr(userAddress));
  return fromWei(bal);
}

// 스팟 조회 (core + 메타데이터 캐시)
async function getSpot(spotId) {
  const core = await contract.getSpotCore(spotId);
  const meta = spotMetadata[spotId] || {
    name: `Spot ${spotId}`,
    description: '',
    lat: 0,
    lng: 0,
    start_time: '00:00',
    end_time: '23:59',
  };

  return {
    id: spotId,
    creator_address: core.creator,
    reward: fromWei(core.reward),
    remaining: fromWei(core.remaining),
    stamp_goal: Number(core.stampGoal),
    stamp_bonus: fromWei(core.stampBonus),
    cooldown: Number(core.cooldown),
    allow_duplicate_claims: core.allowDuplicateClaims,
    ...meta,
  };
}

// 전체 스팟 조회
async function getAllSpots() {
  const nextId = Number(await contract.nextSpotId());
  const spots = [];
  for (let i = 0; i < nextId; i++) {
    const spot = await getSpot(i);
    spots.push(spot);
  }
  return spots;
}

// 스탬프 현황 조회
async function getStampInfo(spotId, userAddress) {
  const info = await contract.getStampInfo(spotId, toAddr(userAddress));
  return {
    stamps: Number(info.stamps),
    goal: Number(info.goal),
    last_claim: Number(info.lastClaim),
    cooldown_remaining: Number(info.cooldownRemaining),
  };
}

// 클레임 히스토리 (이벤트 기반, 스탬프/보너스 포함)
async function getClaimHistory(userAddress) {
  const filter = contract.filters.Claimed(null, toAddr(userAddress));
  const events = await contract.queryFilter(filter);

  const history = await Promise.all(
    events.map(async (ev) => {
      const { spotId, user, reward, bonus, stamp, timestamp } = ev.args;
      let spotName = '';
      try {
        const spot = await getSpot(Number(spotId));
        spotName = spot.name;
      } catch (_) {}
      return {
        spot_id: Number(spotId),
        user_address: user,
        reward: fromWei(reward),
        bonus: fromWei(bonus),
        stamp: Number(stamp),
        spot_name: spotName,
        created_at: new Date(Number(timestamp) * 1000).toISOString(),
      };
    })
  );

  return history.reverse(); // 최신순
}

// 핸드폰 번호로 클레임
async function claimToPhone(spotId, phoneHash) {
  const tx = await contract.claimToPhone(spotId, '0x' + phoneHash);
  const receipt = await tx.wait();

  // ClaimedToPhone 이벤트 파싱하여 reward, bonus, stamp 추출
  const event = receipt.logs
    .map((log) => {
      try { return contract.interface.parseLog(log); } catch (_) { return null; }
    })
    .find((e) => e && e.name === 'ClaimedToPhone');

  const bal = await contract.getPhoneBalance('0x' + phoneHash);

  if (event) {
    return {
      reward: fromWei(event.args.reward),
      bonus: fromWei(event.args.bonus),
      stamp: Number(event.args.stamp),
      balance: fromWei(bal),
    };
  }

  return { reward: 0, bonus: 0, stamp: 0, balance: fromWei(bal) };
}

// 핸드폰 번호 잔액 조회
async function getPhoneBalance(phoneHash) {
  const bal = await contract.getPhoneBalance('0x' + phoneHash);
  return fromWei(bal);
}

// 핸드폰 번호 스탬프 정보 조회
async function getPhoneStampInfo(spotId, phoneHash) {
  const info = await contract.getPhoneStampInfo(spotId, '0x' + phoneHash);
  return {
    stamps: Number(info.stamps),
    goal: Number(info.goal),
    last_claim: Number(info.lastClaim),
    cooldown_remaining: Number(info.cooldownRemaining),
  };
}

// 텔레그램으로 클레임
async function claimToTelegram(spotId, telegramHash) {
  const tx = await contract.claimToTelegram(spotId, '0x' + telegramHash);
  const receipt = await tx.wait();

  const event = receipt.logs
    .map((log) => {
      try { return contract.interface.parseLog(log); } catch (_) { return null; }
    })
    .find((e) => e && e.name === 'TelegramClaimed');

  const bal = await contract.getTelegramBalance('0x' + telegramHash);

  if (event) {
    return {
      reward: fromWei(event.args.reward),
      bonus: fromWei(event.args.bonus),
      stamp: Number(event.args.stamp),
      balance: fromWei(bal),
    };
  }

  return { reward: 0, bonus: 0, stamp: 0, balance: fromWei(bal) };
}

// 텔레그램 잔액 조회
async function getTelegramBalance(telegramHash) {
  const fullHash = '0x' + telegramHash;
  console.log('getTelegramBalance 호출:', { telegramHash, fullHash });
  const bal = await contract.getTelegramBalance(fullHash);
  console.log('컨트랙트 반환값 (wei):', bal.toString());
  const tonAmount = fromWei(bal);
  console.log('변환된 TON:', tonAmount);
  return tonAmount;
}

// 텔레그램 스탬프 정보 조회
async function getTelegramStampInfo(spotId, telegramHash) {
  const info = await contract.getTelegramStampInfo(spotId, '0x' + telegramHash);
  return {
    stamps: Number(info.stamps),
    goal: Number(info.goal),
    last_claim: Number(info.lastClaim),
    cooldown_remaining: Number(info.cooldownRemaining),
  };
}

// 텔레그램에 연결된 지갑 조회
async function getTelegramLinkedWallet(telegramHash) {
  const wallet = await contract.getTelegramLinkedWallet('0x' + telegramHash);
  return wallet;
}

// 텔레그램을 지갑에 연결 (서버가 admin 권한으로 호출)
async function linkTelegramToWallet(telegramHash, walletAddress) {
  const tx = await contract.linkTelegramToWallet('0x' + telegramHash, toAddr(walletAddress));
  const receipt = await tx.wait();

  const event = receipt.logs
    .map((log) => {
      try { return contract.interface.parseLog(log); } catch (_) { return null; }
    })
    .find((e) => e && e.name === 'TelegramLinked');

  return {
    telegramHash,
    wallet: walletAddress,
    oldWallet: event ? event.args.oldWallet : null,
    transferredAmount: event ? fromWei(event.args.transferredAmount) : 0,
  };
}

// 중복 발행 허용 여부 수정
async function updateAllowDuplicateClaims(spotId, allow) {
  const tx = await contract.updateAllowDuplicateClaims(spotId, allow);
  await tx.wait();
}

module.exports = {
  init,
  deposit,
  sendETH,
  createSpot,
  redeposit,
  claim,
  getBalance,
  getSpot,
  getAllSpots,
  getStampInfo,
  getClaimHistory,
  claimToPhone,
  getPhoneBalance,
  getPhoneStampInfo,
  claimToTelegram,
  getTelegramBalance,
  getTelegramStampInfo,
  getTelegramLinkedWallet,
  linkTelegramToWallet,
  updateMetadata,
  updateAllowDuplicateClaims,
};
