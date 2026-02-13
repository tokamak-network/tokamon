const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8999';
const ARTIFACT_PATH = path.join(__dirname, '..', 'contracts', 'out', 'Tokamon.sol', 'Tokamon.json');
const TON_ARTIFACT_PATH = path.join(__dirname, '..', 'contracts', 'out', 'TONToken.sol', 'TONToken.json');
const ADDRESS_PATH = path.join(__dirname, 'contract-address.json');
const METADATA_PATH = process.env.METADATA_PATH ||
  path.join(__dirname, 'spot-metadata.json');

const COORD_SCALE = 1_000_000; // 좌표 스케일 (1e6)

let provider;
let signer; // admin (Ganache account[0])
let contract;
let tonToken; // TON 토큰 컨트랙트

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

  const addressData = JSON.parse(fs.readFileSync(ADDRESS_PATH, 'utf8'));
  const address = addressData.address || addressData.tokamon;
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

  contract = new ethers.Contract(address, artifact.abi, signer);
  console.log(`블록체인 연결 완료 (컨트랙트: ${address})`);

  // TON 토큰 컨트랙트 로드
  if (addressData.tonToken && fs.existsSync(TON_ARTIFACT_PATH)) {
    const tonArtifact = JSON.parse(fs.readFileSync(TON_ARTIFACT_PATH, 'utf8'));
    tonToken = new ethers.Contract(addressData.tonToken, tonArtifact.abi, signer);
    console.log(`TON 토큰 연결 완료 (${addressData.tonToken})`);
  }

  // 메타데이터 로드
  loadMetadata();

  // SpotCreated 이벤트 구독 (클라이언트 생성 → 서버가 컨트랙트 이벤트로 수신)
  subscribeSpotCreated();

  // Redeposited 이벤트 구독 (클라이언트 redepositSelf → 서버가 이벤트 수신)
  subscribeRedeposited();

  // AllowDuplicateClaimsUpdated 이벤트 구독 (클라이언트 updateAllowDuplicateClaims → 서버가 이벤트 수신)
  subscribeAllowDuplicateClaimsUpdated();

  // Claimed 이벤트 구독 (클라이언트 claimSelf → 서버가 이벤트 수신)
  subscribeClaimed();

  console.log('[이벤트 구독] 모든 컨트랙트 이벤트 구독 완료: SpotCreated, Redeposited, AllowDuplicateClaimsUpdated, Claimed');
}

// SpotCreated 이벤트 발생 시 이벤트 데이터 + 컨트랙트 조회로 메타데이터 저장
function subscribeSpotCreated() {
  try {
    contract.on('SpotCreated', async (spotId, creator, reward, deposit, name, description, lat, lng) => {
      const id = Number(spotId);
      console.log('[이벤트 수신] SpotCreated', JSON.stringify({
        spotId: id,
        creator: creator?.slice?.(0, 10) + '...',
        reward: reward?.toString?.(),
        deposit: deposit?.toString?.(),
        name: name || '(없음)',
        description: (description || '').slice(0, 50),
        lat: lat?.toString?.(),
        lng: lng?.toString?.(),
      }, null, 2));
      let meta = null;
      meta = await fetchMetadataWithRetry(id);
      if (meta) {
        spotMetadata[id] = meta;
        saveMetadata();
        console.log('[이벤트 수신] SpotCreated 컨트랙트 조회 결과', JSON.stringify(meta, null, 2));
      } else {
        console.error('[이벤트 수신] SpotCreated 메타데이터 조회 실패 spotId=', id);
      }
    });
    console.log('[이벤트 구독] SpotCreated 구독 시작');
  } catch (e) {
    console.error('[이벤트 구독] SpotCreated 구독 실패:', e.message);
  }
}

// 컨트랙트 상태 전파 대기 후 메타데이터 조회 (재시도 포함)
async function fetchMetadataWithRetry(spotId, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 500 * i));
    }
    const meta = await fetchSpotMetadataFromContract(spotId);
    if (meta) return meta;
  }
  return null;
}

// Redeposited 이벤트 발생 시 로깅 (클라이언트 redepositSelf 호출 시)
function subscribeRedeposited() {
  try {
    contract.on('Redeposited', async (spotId, creator, amount) => {
      const id = Number(spotId);
      const amountTon = amount != null ? fromWei(amount) : 0;
      console.log('[이벤트 수신] Redeposited', JSON.stringify({
        spotId: id,
        creator: creator?.slice?.(0, 10) + '...',
        amountWei: amount?.toString?.(),
        amountTon,
      }, null, 2));
      const spot = await fetchFullSpotFromContract(id);
      if (spot) {
        console.log('[이벤트 수신] Redeposited 컨트랙트 조회 결과 remaining:', spot.remaining, 'TON');
      }
    });
    console.log('[이벤트 구독] Redeposited 구독 시작');
  } catch (e) {
    console.error('[이벤트 구독] Redeposited 구독 실패:', e.message);
  }
}

// AllowDuplicateClaimsUpdated 이벤트 발생 시 로깅 및 캐시 업데이트 (클라이언트 updateAllowDuplicateClaims 호출 시)
function subscribeAllowDuplicateClaimsUpdated() {
  try {
    const ev = contract.getEvent('AllowDuplicateClaimsUpdated');
    if (!ev) {
      console.warn('AllowDuplicateClaimsUpdated 이벤트가 ABI에 없습니다. 컨트랙트를 재배포했는지 확인하세요.');
      return;
    }
    // ethers v6: 이벤트명으로 구독 (filter 사용 시 payload 객체가 전달되므로 spotId가 null 됨)
    contract.on('AllowDuplicateClaimsUpdated', async (spotId, allow) => {
      const id = Number(spotId);
      console.log('[이벤트 수신] AllowDuplicateClaimsUpdated', JSON.stringify({
        spotId: id,
        allow_duplicate_claims: allow,
      }, null, 2));
      const spot = await fetchFullSpotFromContract(id);
      if (spot) {
        spotMetadata[id] = spot;
        saveMetadata();
        console.log('[이벤트 수신] AllowDuplicateClaimsUpdated 컨트랙트 조회 결과 allow_duplicate_claims:', spot.allow_duplicate_claims);
      }
    });
    console.log('[이벤트 구독] AllowDuplicateClaimsUpdated 구독 시작');
  } catch (e) {
    console.error('[이벤트 구독] AllowDuplicateClaimsUpdated 구독 실패:', e.message);
  }
}

// Claimed 이벤트 발생 시 로깅 (클라이언트 claimSelf 호출 시)
function subscribeClaimed() {
  try {
    contract.on('Claimed', (spotId, user, reward, bonus, stamp, timestamp) => {
      const id = Number(spotId);
      const rewardTon = reward != null ? fromWei(reward) : 0;
      const bonusTon = bonus != null ? fromWei(bonus) : 0;
      console.log('[이벤트 수신] Claimed', JSON.stringify({
        spotId: id,
        user: user?.slice?.(0, 10) + '...',
        rewardWei: reward?.toString?.(),
        rewardTon,
        bonusWei: bonus?.toString?.(),
        bonusTon,
        stamp: stamp?.toString?.() ?? stamp,
        timestamp: timestamp?.toString?.(),
      }, null, 2));
    });
    console.log('[이벤트 구독] Claimed 구독 시작');
  } catch (e) {
    console.error('[이벤트 구독] Claimed 구독 실패:', e.message);
  }
}

// 컨트랙트에서 스팟 전체 조회 (getSpot 또는 spots 매핑)
// Spot: creator(0), reward(1), remaining(2), stampGoal(3), stampBonus(4), cooldown(5), allowDuplicateClaims(6), name(7), description(8), lat(9), lng(10), startTime(11), endTime(12)
async function fetchFullSpotFromContract(spotId) {
  try {
    const s = typeof contract.getSpot === 'function'
      ? await contract.getSpot(spotId)
      : await contract.spots(spotId);
    const reward = s.reward ?? s[1];
    if (!s || reward === 0n) return null;
    const creator = s.creator ?? s[0];
    const remaining = s.remaining ?? s[2];
    const stampGoal = s.stampGoal ?? s[3];
    const stampBonus = s.stampBonus ?? s[4];
    const cooldown = s.cooldown ?? s[5];
    const allowDuplicateClaims = s.allowDuplicateClaims ?? s[6];
    const name = s.name ?? s[7];
    const description = s.description ?? s[8];
    const latRaw = s.lat ?? s[9];
    const lngRaw = s.lng ?? s[10];
    const startTime = s.startTime ?? s[11];
    const endTime = s.endTime ?? s[12];
    const lat = Number(latRaw) / COORD_SCALE;
    const lng = Number(lngRaw) / COORD_SCALE;
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return {
      id: spotId,
      creator_address: creator ? toAddr(creator) : creator,
      reward: fromWei(reward),
      remaining: fromWei(remaining),
      stamp_goal: Number(stampGoal),
      stamp_bonus: fromWei(stampBonus),
      cooldown: Number(cooldown),
      allow_duplicate_claims: allowDuplicateClaims,
      name: (name && String(name).trim()) || `Spot ${spotId}`,
      description: description ? String(description) : '',
      lat,
      lng,
      start_time: startTime ? String(startTime) : '00:00',
      end_time: endTime ? String(endTime) : '23:59',
    };
  } catch (e) {
    return null;
  }
}

// 스팟 전체 정보 조회 (fetchFullSpotFromContract와 동일)
async function fetchSpotMetadataFromContract(spotId) {
  return fetchFullSpotFromContract(spotId);
}

// admin이 TON 토큰을 user 내부 잔액으로 입금
async function deposit(userAddress, amountTon) {
  const amount = toWei(amountTon);
  // admin이 TON 토큰을 Tokamon 컨트랙트에 approve
  if (tonToken) {
    const approveTx = await tonToken.approve(await contract.getAddress(), amount);
    await approveTx.wait();
  }
  const tx = await contract.deposit(toAddr(userAddress), amount);
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

// 잔액 조회
async function getBalance(userAddress) {
  const bal = await contract.getBalance(toAddr(userAddress));
  return fromWei(bal);
}

// 스팟 조회 (캐시 → 컨트랙트 전체 조회)
async function getSpot(spotId) {
  let cached = spotMetadata[spotId];
  if (!cached) {
    const full = await fetchFullSpotFromContract(spotId);
    if (full) {
      spotMetadata[spotId] = full;
      saveMetadata();
      return full;
    }
    cached = { name: `Spot ${spotId}`, description: '', lat: 0, lng: 0, start_time: '00:00', end_time: '23:59' };
  }
  // remaining, cooldown, allow_duplicate_claims는 항상 컨트랙트에서 최신 조회
  const core = await contract.getSpotCore(spotId);
  return {
    ...cached,
    id: spotId,
    creator_address: cached.creator_address ?? (core.creator ? toAddr(core.creator) : core.creator),
    reward: cached.reward ?? fromWei(core.reward),
    remaining: fromWei(core.remaining),
    stamp_goal: cached.stamp_goal ?? Number(core.stampGoal),
    stamp_bonus: cached.stamp_bonus ?? fromWei(core.stampBonus),
    cooldown: Number(core.cooldown),
    allow_duplicate_claims: core.allowDuplicateClaims,
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
  const bal = await contract.getTelegramBalance(fullHash);
  return fromWei(bal);
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

// 지갑에 연결된 텔레그램 조회 (역방향)
async function getWalletLinkedTelegram(walletAddress) {
  const telegramHash = await contract.getWalletLinkedTelegram(toAddr(walletAddress));
  // bytes32를 hex string으로 변환 (0x 제거)
  return telegramHash.slice(2);
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

// 기기 해시로 클레임
async function claimByDevice(spotId, deviceHash) {
  const tx = await contract.claimByDevice(spotId, '0x' + deviceHash);
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((log) => {
      try { return contract.interface.parseLog(log); } catch (_) { return null; }
    })
    .find((e) => e && e.name === 'DeviceClaimed');
  const bal = await contract.getDeviceBalance('0x' + deviceHash);
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

// 기기 해시 잔액 조회
async function getDeviceBalance(deviceHash) {
  const bal = await contract.getDeviceBalance('0x' + deviceHash);
  return fromWei(bal);
}

// 기기 해시 스탬프 정보 조회
async function getDeviceStampInfo(spotId, deviceHash) {
  const info = await contract.getClaimInfo(spotId, '0x' + deviceHash);
  return {
    stamps: Number(info.stamps),
    goal: Number(info.goal),
    last_claim: Number(info.lastClaim),
    cooldown_remaining: Number(info.cooldownRemaining),
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
  getWalletLinkedTelegram,
  linkTelegramToWallet,
  claimByDevice,
  getDeviceBalance,
  getDeviceStampInfo,
  updateMetadata,
  updateAllowDuplicateClaims,
};
