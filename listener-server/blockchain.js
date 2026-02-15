const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
console.log('[Blockchain] ethers 버전:', ethers.version, '| 경로:', require.resolve('ethers'));
const { syncSpotToFirestore, saveClaimEvent, getTelegramUsernameByHash } = require('./firebase-admin');

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8999';
const WS_URL = process.env.WS_URL || RPC_URL.replace(/^http/, 'ws');
const ARTIFACT_PATH = path.join(__dirname, '..', 'contracts', 'out', 'Tokamon.sol', 'Tokamon.json');
const ADDRESS_PATH = path.join(__dirname, 'contract-address.json');
const METADATA_PATH = process.env.METADATA_PATH ||
  path.join(__dirname, 'spot-metadata.json');
const LAST_BLOCK_PATH = process.env.LAST_BLOCK_PATH ||
  path.join(__dirname, 'last-block.json');

const COORD_SCALE = 1_000_000;

let provider;
let signer;
let contract;        // WS provider (이벤트 구독 + 읽기)
let writeContract;   // HTTP signer (트랜잭션 전송)

// TelegramClaimed 이벤트 알림 콜백
let telegramClaimedCallback = null;

function onTelegramClaimed(callback) {
  telegramClaimedCallback = callback;
}

// 스팟 메타데이터 캐시
let spotMetadata = {};

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

function saveMetadata() {
  try {
    fs.writeFileSync(METADATA_PATH, JSON.stringify(spotMetadata, null, 2));
  } catch (e) {
    console.error('메타데이터 저장 실패:', e.message);
  }
}

function loadLastBlock() {
  try {
    if (fs.existsSync(LAST_BLOCK_PATH)) {
      const data = JSON.parse(fs.readFileSync(LAST_BLOCK_PATH, 'utf8'));
      return data.lastBlock || 0;
    }
  } catch (e) {
    console.error('마지막 블록 로드 실패:', e.message);
  }
  return 0;
}

function saveLastBlock(blockNumber) {
  try {
    fs.writeFileSync(LAST_BLOCK_PATH, JSON.stringify({ lastBlock: blockNumber, updatedAt: new Date().toISOString() }));
  } catch (e) {
    console.error('마지막 블록 저장 실패:', e.message);
  }
}

const toWei = (ton) => ethers.parseEther(String(ton));
const fromWei = (wei) => Number(ethers.formatEther(wei || 0n));
const toAddr = (addr) => ethers.getAddress(String(addr).trim());

function normalizeAddress(value) {
  if (value == null) return null;
  let s = String(value).replace(/\s/g, '').replace(/^\uFEFF/, '');
  if (!s.startsWith('0x')) s = '0x' + s;
  return /^0x[0-9a-fA-F]{40}$/.test(s) ? s : null;
}

async function init() {
  // contract-address.json 우선, 없으면 환경변수
  let address = null;
  let addressData = {};
  if (fs.existsSync(ADDRESS_PATH)) {
    try {
      addressData = JSON.parse(fs.readFileSync(ADDRESS_PATH, 'utf8'));
      address = normalizeAddress(addressData.address || addressData.tokamon);
    } catch (_) {}
  }
  if (!address) address = normalizeAddress(process.env.CONTRACT_ADDRESS);
  if (!address) {
    throw new Error('contract-address.json이 없거나 address/tokamon이 없습니다. 컨트랙트 배포 후 npm run copy-contracts를 실행하세요.');
  }

  // WebSocket 구독 방식 (실시간 이벤트 수신)
  // 트랜잭션 전송용 HTTP provider (signer 획득)
  const httpProvider = new ethers.JsonRpcProvider(RPC_URL);
  const accounts = await httpProvider.listAccounts();
  signer = accounts[0];

  // 이벤트 구독용 WebSocket provider
  provider = new ethers.WebSocketProvider(WS_URL);
  console.log('[Blockchain] WebSocket 연결:', WS_URL);

  // ABI: 아티팩트 우선, 없으면 최소 ABI
  let abi;
  if (fs.existsSync(ARTIFACT_PATH)) {
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
    abi = artifact.abi;
    console.log('[Blockchain] 아티팩트 ABI 로드');
  } else {
    abi = require('./abi');
    console.log('[Blockchain] 최소 ABI 사용 (아티팩트 없음)');
  }

  // 이벤트 구독용 (WebSocket) + 읽기
  contract = new ethers.Contract(address, abi, provider);
  // 트랜잭션 전송용 (HTTP signer)
  writeContract = new ethers.Contract(address, abi, signer);
  console.log('[Blockchain] 연결 완료:', address, '(WS 구독 + HTTP 트랜잭션)');

  // 메타데이터 로드
  loadMetadata();

  // 놓친 이벤트 복구: 마지막 처리 블록 이후의 이벤트를 스캔
  const lastBlock = loadLastBlock();
  const currentBlock = await provider.getBlockNumber();
  if (lastBlock > 0 && lastBlock < currentBlock) {
    console.log(`[복구] 블록 ${lastBlock + 1} ~ ${currentBlock} 사이의 놓친 이벤트 스캔 중...`);
    try {
      const missedEvents = await contract.queryFilter('*', lastBlock + 1, currentBlock);
      let recoveredCount = 0;
      for (const ev of missedEvents) {
        try {
          const parsed = contract.interface.parseLog({ topics: ev.topics, data: ev.data });
          if (!parsed) continue;
          if (parsed.name === 'SpotCreated' || parsed.name === 'Redeposited' ||
              parsed.name === 'CooldownUpdated' || parsed.name === 'AllowDuplicateClaimsUpdated') {
            const id = Number(parsed.args[0]);
            const meta = await fetchFullSpotFromContract(id);
            if (meta) {
              spotMetadata[id] = meta;
              await syncSpotToFirestore(id, meta);
            }
            recoveredCount++;
          } else if (parsed.name === 'Claimed') {
            const [spotId, user, reward, bonus, stamp, timestamp] = parsed.args;
            await saveClaimEvent({
              spotId: Number(spotId), user,
              reward: fromWei(reward), bonus: fromWei(bonus),
              stamp: Number(stamp), timestamp,
            });
            const id = Number(spotId);
            const meta = await fetchFullSpotFromContract(id);
            if (meta) {
              spotMetadata[id] = meta;
              await syncSpotToFirestore(id, meta);
            }
            recoveredCount++;
          } else if (parsed.name === 'TelegramClaimed') {
            recoveredCount++;
          }
        } catch (_) { /* 개별 이벤트 파싱 실패 무시 */ }
      }
      if (recoveredCount > 0) {
        saveMetadata();
        console.log(`[복구] ${recoveredCount}개 이벤트 복구 완료`);
      } else {
        console.log('[복구] 놓친 이벤트 없음');
      }
    } catch (e) {
      console.error('[복구] 이벤트 스캔 실패:', e.message);
    }
  }
  saveLastBlock(currentBlock);

  // 이벤트 구독 (실시간) — 블록 번호도 함께 저장
  console.log('[이벤트 등록] SpotCreated 리스너 등록');
  contract.on('SpotCreated', async (spotId, creator, reward, deposit, name, description, lat, lng, ev) => {
    const id = Number(spotId);
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] SpotCreated | spotId=${id} creator=${String(creator).slice(0,10)}... reward=${fromWei(reward)} deposit=${fromWei(deposit)} name="${name}" block=${blockNum}`);
    const meta = await fetchFullSpotFromContract(id);
    if (meta) {
      spotMetadata[id] = meta;
      saveMetadata();
      await syncSpotToFirestore(id, meta);
    }
    if (ev && ev.log && ev.log.blockNumber) saveLastBlock(ev.log.blockNumber);
  });

  console.log('[이벤트 등록] Redeposited 리스너 등록');
  contract.on('Redeposited', async (spotId, creator, amount, ev) => {
    const id = Number(spotId);
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] Redeposited | spotId=${id} creator=${String(creator).slice(0,10)}... amount=${fromWei(amount)} block=${blockNum}`);
    const meta = await fetchFullSpotFromContract(id);
    if (meta) {
      spotMetadata[id] = meta;
      saveMetadata();
      await syncSpotToFirestore(id, meta);
    }
    if (ev && ev.log && ev.log.blockNumber) saveLastBlock(ev.log.blockNumber);
  });

  console.log('[이벤트 등록] CooldownUpdated 리스너 등록');
  contract.on('CooldownUpdated', async (spotId, newCooldown, ev) => {
    const id = Number(spotId);
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] CooldownUpdated | spotId=${id} cooldown=${Number(newCooldown)} block=${blockNum}`);
    const meta = await fetchFullSpotFromContract(id);
    if (meta) {
      spotMetadata[id] = meta;
      saveMetadata();
      await syncSpotToFirestore(id, meta);
    }
    if (ev && ev.log && ev.log.blockNumber) saveLastBlock(ev.log.blockNumber);
  });

  console.log('[이벤트 등록] AllowDuplicateClaimsUpdated 리스너 등록');
  contract.on('AllowDuplicateClaimsUpdated', async (spotId, allow, ev) => {
    const id = Number(spotId);
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] AllowDuplicateClaimsUpdated | spotId=${id} allow=${allow} block=${blockNum}`);
    const meta = await fetchFullSpotFromContract(id);
    if (meta) {
      spotMetadata[id] = meta;
      saveMetadata();
      await syncSpotToFirestore(id, meta);
    }
    if (ev && ev.log && ev.log.blockNumber) saveLastBlock(ev.log.blockNumber);
  });

  console.log('[이벤트 등록] Claimed 리스너 등록');
  contract.on('Claimed', async (spotId, user, reward, bonus, stamp, timestamp, ev) => {
    const id = Number(spotId);
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] Claimed | spotId=${id} user=${String(user).slice(0,10)}... reward=${fromWei(reward)} bonus=${fromWei(bonus)} stamp=${Number(stamp)} block=${blockNum}`);
    await saveClaimEvent({
      spotId: id,
      user,
      reward: fromWei(reward),
      bonus: fromWei(bonus),
      stamp: Number(stamp),
      timestamp,
    });
    const meta = await fetchFullSpotFromContract(id);
    if (meta) {
      spotMetadata[id] = meta;
      saveMetadata();
      await syncSpotToFirestore(id, meta);
    }
    if (ev && ev.log && ev.log.blockNumber) saveLastBlock(ev.log.blockNumber);
  });

  console.log('[이벤트 등록] TelegramClaimed 리스너 등록');
  contract.on('TelegramClaimed', async (spotId, telegramHash, reward, bonus, stamp, timestamp, ev) => {
    const id = Number(spotId);
    const hashHex = telegramHash.slice(2); // 0x 제거
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] TelegramClaimed | spotId=${id} hash=${hashHex.slice(0,10)}... reward=${fromWei(reward)} bonus=${fromWei(bonus)} stamp=${Number(stamp)} block=${blockNum}`);

    // 스팟 메타데이터 갱신 (remaining 등 최신 상태 반영)
    const meta = await fetchFullSpotFromContract(id);
    if (meta) {
      spotMetadata[id] = meta;
      saveMetadata();
      await syncSpotToFirestore(id, meta);
    }

    if (telegramClaimedCallback) {
      try {
        // Firestore에서 hash → username 조회
        const username = await getTelegramUsernameByHash(hashHex);
        if (username) {
          const spot = spotMetadata[id] || {};
          await telegramClaimedCallback({
            spotId: id,
            spotName: spot.name || `Spot ${id}`,
            username,
            reward: fromWei(reward),
            bonus: fromWei(bonus),
            stamp: Number(stamp),
            telegramHash: hashHex,
          });
        } else {
          console.log('[TelegramClaimed] username 매핑 없음:', hashHex.slice(0, 10) + '...');
        }
      } catch (e) {
        console.error('[TelegramClaimed] 알림 실패:', e.message);
      }
    }
    if (ev && ev.log && ev.log.blockNumber) saveLastBlock(ev.log.blockNumber);
  });

  console.log('[이벤트 등록 완료] 6개 이벤트 리스너 등록됨');
}

// ─── 컨트랙트 조회 함수들 ───

async function fetchFullSpotFromContract(spotId) {
  try {
    const s = typeof contract.getSpot === 'function'
      ? await contract.getSpot(spotId)
      : await contract.spots(spotId);
    // Spot struct field order:
    // 0:creator 1:allowDuplicateClaims 2:cooldown 3:stampGoal 4:stampBonus
    // 5:reward 6:remaining 7:lat 8:lng 9:startTime 10:endTime 11:name 12:description
    const reward = s.reward ?? s[5];
    if (!s || reward === 0n) return null;
    const creator = s.creator ?? s[0];
    const allowDuplicateClaims = s.allowDuplicateClaims ?? s[1];
    const cooldown = s.cooldown ?? s[2];
    const stampGoal = s.stampGoal ?? s[3];
    const stampBonus = s.stampBonus ?? s[4];
    const remaining = s.remaining ?? s[6];
    const latRaw = s.lat ?? s[7];
    const lngRaw = s.lng ?? s[8];
    const startTime = s.startTime ?? s[9];
    const endTime = s.endTime ?? s[10];
    const name = s.name ?? s[11];
    const description = s.description ?? s[12];
    const lat = Number(latRaw) / COORD_SCALE;
    const lng = Number(lngRaw) / COORD_SCALE;
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return {
      id: spotId,
      creator_address: creator ? toAddr(creator) : null,
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
      start_time: Number(startTime),
      end_time: Number(endTime),
    };
  } catch (e) {
    console.error('[fetchFullSpotFromContract]', spotId, e.message);
    return null;
  }
}

async function getSpot(spotId) {
  let cached = spotMetadata[spotId];
  if (!cached) {
    const full = await fetchFullSpotFromContract(spotId);
    if (full) {
      spotMetadata[spotId] = full;
      saveMetadata();
      return full;
    }
    cached = { name: `Spot ${spotId}`, description: '', lat: 0, lng: 0, start_time: 0, end_time: 0 };
  }
  // remaining, cooldown, allow_duplicate_claims는 항상 컨트랙트에서 최신 조회
  try {
    const core = typeof contract.getSpotCore === 'function'
      ? await contract.getSpotCore(spotId)
      : await contract.getSpot(spotId);
    return {
      ...cached,
      id: spotId,
      creator_address: cached.creator_address ?? (core.creator ? toAddr(core.creator) : null),
      reward: cached.reward ?? fromWei(core.reward),
      remaining: fromWei(core.remaining),
      stamp_goal: cached.stamp_goal ?? Number(core.stampGoal),
      stamp_bonus: cached.stamp_bonus ?? fromWei(core.stampBonus),
      cooldown: Number(core.cooldown),
      allow_duplicate_claims: core.allowDuplicateClaims,
    };
  } catch (e) {
    return cached;
  }
}

async function getAllSpots() {
  const nextId = Number(await contract.nextSpotId());
  const spots = [];
  for (let i = 0; i < nextId; i++) {
    const spot = await getSpot(i);
    spots.push(spot);
  }
  return spots;
}

// ─── 잔액/스탬프 조회 ───

async function getBalance(userAddress) {
  const bal = await provider.getBalance(toAddr(userAddress));
  return fromWei(bal);
}

async function getStampInfo(spotId, userAddress) {
  const info = await contract.getStampInfo(spotId, toAddr(userAddress));
  return {
    stamps: Number(info.stamps),
    goal: Number(info.goal),
    last_claim: Number(info.lastClaim),
    cooldown_remaining: Number(info.cooldownRemaining),
  };
}

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

  return history.reverse();
}

// ─── Faucet ───

async function sendETH(toAddress, amountETH) {
  const tx = await signer.sendTransaction({
    to: toAddr(toAddress),
    value: toWei(amountETH),
  });
  await tx.wait();
  return amountETH;
}

// ─── 텔레그램 관련 ───

async function getTelegramBalance(telegramHash) {
  const fullHash = '0x' + telegramHash;
  const bal = await contract.getTelegramBalance(fullHash);
  return fromWei(bal);
}

async function getTelegramStampInfo(spotId, telegramHash) {
  const info = await contract.getTelegramStampInfo(spotId, '0x' + telegramHash);
  return {
    stamps: Number(info.stamps),
    goal: Number(info.goal),
    last_claim: Number(info.lastClaim),
    cooldown_remaining: Number(info.cooldownRemaining),
  };
}

async function getTelegramLinkedWallet(telegramHash) {
  const wallet = await contract.getTelegramLinkedWallet('0x' + telegramHash);
  return wallet;
}

async function linkTelegramToWallet(telegramHash, walletAddress) {
  const tx = await writeContract.linkTelegramToWallet('0x' + telegramHash, toAddr(walletAddress));
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

async function claimToTelegram(spotId, telegramHash) {
  const tx = await writeContract.claimToTelegram(spotId, '0x' + telegramHash);
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

// ─── 핸드폰/키오스크 관련 ───

async function getPhoneBalance(phoneHash) {
  const bal = await contract.getPhoneBalance('0x' + phoneHash);
  return fromWei(bal);
}

async function getPhoneStampInfo(spotId, phoneHash) {
  const info = await contract.getPhoneStampInfo(spotId, '0x' + phoneHash);
  return {
    stamps: Number(info.stamps),
    goal: Number(info.goal),
    last_claim: Number(info.lastClaim),
    cooldown_remaining: Number(info.cooldownRemaining),
  };
}

// ─── 스팟 설정 ───

async function updateAllowDuplicateClaims(spotId, allow) {
  const tx = await writeContract.updateAllowDuplicateClaims(spotId, allow);
  await tx.wait();
}

module.exports = {
  init,
  onTelegramClaimed,
  fetchSpotFromContract: fetchFullSpotFromContract,
  getSpot,
  getAllSpots,
  getBalance,
  getStampInfo,
  getClaimHistory,
  sendETH,
  getTelegramBalance,
  getTelegramStampInfo,
  getTelegramLinkedWallet,
  linkTelegramToWallet,
  claimToTelegram,
  getPhoneBalance,
  getPhoneStampInfo,
  updateAllowDuplicateClaims,
};
