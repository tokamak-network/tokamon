const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
console.log('[Blockchain] ethers 버전:', ethers.version, '| 경로:', require.resolve('ethers'));
const { syncSpotToFirestore, saveTelegramClaimEvent, syncTelegramBalance, saveWalletTelegramLink, getTelegramUsernameByHash, syncDeviceBalance, NETWORK_ID } = require('./firebase-admin');
const { getNetwork, getContracts, DEFAULT_NETWORK } = require('../shared/networks');

// 네트워크 설정: NETWORK 환경변수 → shared/networks.js에서 로드
const networkId = process.env.NETWORK || DEFAULT_NETWORK;
const networkConfig = getNetwork(networkId);
const networkContracts = getContracts(networkId);

const RPC_URL = process.env.RPC_URL || networkConfig.rpcUrl;
const WS_URL = process.env.WS_URL || RPC_URL.replace(/^http/, 'ws');
const ARTIFACT_PATH = path.join(__dirname, '..', 'contracts', 'out', 'Tokamon.sol', 'Tokamon.json');
const ADDRESS_PATH = path.join(__dirname, 'contract-address.json');
const METADATA_PATH = process.env.METADATA_PATH ||
  path.join(__dirname, `spot-metadata-${networkId}.json`);
const LAST_BLOCK_PATH = process.env.LAST_BLOCK_PATH ||
  path.join(__dirname, `last-block-${networkId}.json`);

console.log(`[Blockchain] 네트워크: ${networkConfig.name} (${networkId}, chainId=${networkConfig.chainId})`);

const COORD_SCALE = 1_000_000;

let provider;
let signer;
let contract;        // WS provider (이벤트 구독 + 읽기)
let writeContract;   // HTTP signer (트랜잭션 전송)

// TelegramClaimed 이벤트 알림 콜백
let telegramClaimedCallback = null;
// DeviceClaimed 이벤트 알림 콜백
let deviceClaimedCallback = null;

function onTelegramClaimed(callback) {
  telegramClaimedCallback = callback;
}

function onDeviceClaimed(callback) {
  deviceClaimedCallback = callback;
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
  // 컨트랙트 주소 우선순위:
  // 1. 환경변수 CONTRACT_ADDRESS
  // 2. contract-address.json 파일
  // 3. shared/networks.js의 contracts 설정
  let address = normalizeAddress(process.env.CONTRACT_ADDRESS);
  let addressData = {};
  if (!address && fs.existsSync(ADDRESS_PATH)) {
    try {
      addressData = JSON.parse(fs.readFileSync(ADDRESS_PATH, 'utf8'));
      address = normalizeAddress(addressData.address || addressData.tokamon);
    } catch (_) {}
  }
  if (!address && networkContracts.tokamon) {
    address = normalizeAddress(networkContracts.tokamon);
  }
  if (!address) {
    throw new Error(`[${networkId}] 컨트랙트 주소를 찾을 수 없습니다. CONTRACT_ADDRESS 환경변수, contract-address.json, 또는 shared/networks.js에 설정하세요.`);
  }

  // 트랜잭션 전송용 HTTP provider + signer 획득
  const httpProvider = new ethers.JsonRpcProvider(RPC_URL);
  if (process.env.SIGNER_PRIVATE_KEY) {
    // 실제 체인: 환경변수로 전달된 개인키로 Wallet 생성
    signer = new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY, httpProvider);
    console.log('[Blockchain] Signer (Wallet):', signer.address);
  } else {
    // 로컬 Anvil: listAccounts()로 서명자 획득
    const accounts = await httpProvider.listAccounts();
    signer = accounts[0];
    console.log('[Blockchain] Signer (listAccounts):', signer?.address);
  }

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
          if (parsed.name === 'SpotCreated' || parsed.name === 'SpotUpdated' || parsed.name === 'Redeposited' ||
              parsed.name === 'CooldownUpdated' || parsed.name === 'AllowDuplicateClaimsUpdated') {
            const id = Number(parsed.args[0]);
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

  console.log('[이벤트 등록] SpotUpdated 리스너 등록');
  contract.on('SpotUpdated', async (spotId, ev) => {
    const id = Number(spotId);
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] SpotUpdated | spotId=${id} block=${blockNum}`);
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

  console.log('[이벤트 등록] TelegramClaimed 리스너 등록');
  contract.on('TelegramClaimed', async (spotId, telegramHash, reward, bonus, stamp, timestamp, ev) => {
    const id = Number(spotId);
    const hashHex = telegramHash.slice(2); // 0x 제거
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] TelegramClaimed | spotId=${id} hash=${hashHex.slice(0,10)}... reward=${fromWei(reward)} bonus=${fromWei(bonus)} stamp=${Number(stamp)} block=${blockNum}`);

    // Firestore에 텔레그램 클레임 이벤트 저장 (히스토리용)
    await saveTelegramClaimEvent({
      spotId: id,
      telegramHash: hashHex,
      reward: fromWei(reward),
      bonus: fromWei(bonus),
      stamp: Number(stamp),
      timestamp,
    });

    // 컨트랙트에서 실제 잔액 조회 → Firestore 동기화
    try {
      const bal = await contract.getTelegramBalance(telegramHash);
      await syncTelegramBalance(hashHex, fromWei(bal));
    } catch (e) {
      console.error('[TelegramClaimed] 잔액 동기화 실패:', e.message);
    }

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

  console.log('[이벤트 등록] DeviceClaimed 리스너 등록');
  contract.on('DeviceClaimed', async (spotId, deviceHash, reward, bonus, stamp, timestamp, ev) => {
    const id = Number(spotId);
    const hashHex = deviceHash.slice(2);
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] DeviceClaimed | spotId=${id} hash=${hashHex.slice(0,10)}... reward=${fromWei(reward)} bonus=${fromWei(bonus)} stamp=${Number(stamp)} block=${blockNum}`);

    const meta = await fetchFullSpotFromContract(id);
    if (meta) {
      spotMetadata[id] = meta;
      saveMetadata();
      await syncSpotToFirestore(id, meta);
    }

    // 컨트랙트에서 실제 잔액 조회 → Firestore 동기화
    try {
      const bal = await contract.getDeviceBalance(deviceHash);
      await syncDeviceBalance(hashHex, fromWei(bal));
    } catch (e) {
      console.error('[DeviceClaimed] 잔액 동기화 실패:', e.message);
    }

    if (deviceClaimedCallback) {
      try {
        const spot = spotMetadata[id] || {};
        await deviceClaimedCallback({
          spotId: id,
          spotName: spot.name || `Spot ${id}`,
          deviceHash: hashHex,
          reward: fromWei(reward),
          bonus: fromWei(bonus),
          stamp: Number(stamp),
        });
      } catch (e) {
        console.error('[DeviceClaimed] 콜백 실패:', e.message);
      }
    }
    if (ev && ev.log && ev.log.blockNumber) saveLastBlock(ev.log.blockNumber);
  });

  console.log('[이벤트 등록] DeviceLinked 리스너 등록');
  contract.on('DeviceLinked', async (deviceHash, oldWallet, newWallet, ev) => {
    const hashHex = deviceHash.slice(2);
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] DeviceLinked | hash=${hashHex.slice(0,10)}... wallet=${String(newWallet).slice(0,10)}... oldWallet=${String(oldWallet).slice(0,10)}... block=${blockNum}`);
    if (ev && ev.log && ev.log.blockNumber) saveLastBlock(ev.log.blockNumber);
  });

  console.log('[이벤트 등록] DeviceUnlinked 리스너 등록');
  contract.on('DeviceUnlinked', async (deviceHash, wallet, ev) => {
    const hashHex = deviceHash.slice(2);
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] DeviceUnlinked | hash=${hashHex.slice(0,10)}... wallet=${String(wallet).slice(0,10)}... block=${blockNum}`);
    if (ev && ev.log && ev.log.blockNumber) saveLastBlock(ev.log.blockNumber);
  });

  console.log('[이벤트 등록] TelegramWithdrawn 리스너 등록');
  contract.on('TelegramWithdrawn', async (telegramHash, wallet, amount, ev) => {
    const hashHex = telegramHash.slice(2);
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] TelegramWithdrawn | hash=${hashHex.slice(0,10)}... wallet=${String(wallet).slice(0,10)}... amount=${fromWei(amount)} block=${blockNum}`);
    // 컨트랙트에서 실제 잔액 조회 → Firestore 동기화 (출금 후 0이 되어야 함)
    try {
      const bal = await contract.getTelegramBalance(telegramHash);
      await syncTelegramBalance(hashHex, fromWei(bal));
    } catch (e) {
      console.error('[TelegramWithdrawn] 잔액 동기화 실패:', e.message);
    }
    if (ev && ev.log && ev.log.blockNumber) saveLastBlock(ev.log.blockNumber);
  });

  console.log('[이벤트 등록] TelegramLinked 리스너 등록');
  contract.on('TelegramLinked', async (telegramHash, oldWallet, newWallet, transferredAmount, ev) => {
    const hashHex = telegramHash.slice(2);
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] TelegramLinked | hash=${hashHex.slice(0,10)}... wallet=${String(newWallet).slice(0,10)}... block=${blockNum}`);
    // Firestore에 지갑-텔레그램 연결 저장
    await saveWalletTelegramLink(String(newWallet), hashHex);
    if (ev && ev.log && ev.log.blockNumber) saveLastBlock(ev.log.blockNumber);
  });

  console.log('[이벤트 등록] DeviceWithdrawn 리스너 등록');
  contract.on('DeviceWithdrawn', async (deviceHash, wallet, amount, ev) => {
    const hashHex = deviceHash.slice(2);
    const blockNum = ev?.log?.blockNumber ?? '?';
    console.log(`[이벤트 수신] DeviceWithdrawn | hash=${hashHex.slice(0,10)}... wallet=${String(wallet).slice(0,10)}... amount=${fromWei(amount)} block=${blockNum}`);
    // 컨트랙트에서 실제 잔액 조회 → Firestore 동기화
    try {
      const bal = await contract.getDeviceBalance(deviceHash);
      await syncDeviceBalance(hashHex, fromWei(bal));
    } catch (e) {
      console.error('[DeviceWithdrawn] 잔액 동기화 실패:', e.message);
    }
    if (ev && ev.log && ev.log.blockNumber) saveLastBlock(ev.log.blockNumber);
  });

  console.log('[이벤트 등록 완료] 12개 이벤트 리스너 등록됨');
}

// ─── 컨트랙트 조회 함수들 ───

async function fetchFullSpotFromContract(spotId) {
  try {
    const s = typeof contract.getSpot === 'function'
      ? await contract.getSpot(spotId)
      : await contract.spots(spotId);
    // Spot struct field order:
    // 0:creator 1:allowDuplicateClaims 2:cooldown 3:stampGoal 4:stampBonus
    // 5:reward 6:remaining 7:lat 8:lng 9:startDate 10:endDate
    // 11:dailyStartTime 12:dailyEndTime 13:utcOffset 14:name 15:description
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
    const startDate = s.startDate ?? s[9];
    const endDate = s.endDate ?? s[10];
    const dailyStartTime = s.dailyStartTime ?? s[11];
    const dailyEndTime = s.dailyEndTime ?? s[12];
    const utcOffset = s.utcOffset ?? s[13];
    const name = s.name ?? s[14];
    const description = s.description ?? s[15];
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
      start_time: Number(startDate),
      end_time: Number(endDate),
      daily_start_time: Number(dailyStartTime || 0),
      daily_end_time: Number(dailyEndTime || 0),
      utc_offset: Number(utcOffset || 0),
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


// ─── Faucet (Anvil 전용) ───

const ANVIL_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

async function sendETH(toAddress, amountETH) {
  const httpProvider = new ethers.JsonRpcProvider(RPC_URL);
  const anvilWallet = new ethers.Wallet(ANVIL_PRIVATE_KEY, httpProvider);
  await anvilWallet.sendTransaction({
    to: toAddr(toAddress),
    value: toWei(amountETH),
  });
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
  // Phone은 Device로 대체됨 — getClaimInfo로 잔액 조회 불가, getDeviceBalance 사용
  const bal = await contract.getDeviceBalance('0x' + phoneHash);
  return fromWei(bal);
}

async function getPhoneStampInfo(spotId, phoneHash) {
  const info = await contract.getClaimInfo(spotId, '0x' + phoneHash);
  return {
    stamps: Number(info.stamps),
    goal: Number(info.goal),
    last_claim: Number(info.lastClaim),
    cooldown_remaining: Number(info.cooldownRemaining),
  };
}

// ─── 디바이스 관련 ───

async function claimByDevice(spotId, deviceHash) {
  const fullHash = '0x' + deviceHash;
  const tx = await writeContract.claimByDevice(spotId, fullHash);
  const receipt = await tx.wait();

  const event = receipt.logs
    .map((log) => {
      try { return contract.interface.parseLog(log); } catch (_) { return null; }
    })
    .find((e) => e && e.name === 'DeviceClaimed');

  const bal = await contract.getDeviceBalance(fullHash);

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

async function getDeviceBalance(deviceHash) {
  const fullHash = '0x' + deviceHash;
  const bal = await contract.getDeviceBalance(fullHash);
  return fromWei(bal);
}

async function getDeviceStampInfo(spotId, deviceHash) {
  const fullHash = '0x' + deviceHash;
  const info = await contract.getClaimInfo(spotId, fullHash);
  return {
    stamps: Number(info.stamps),
    goal: Number(info.goal),
    last_claim: Number(info.lastClaim),
    cooldown_remaining: Number(info.cooldownRemaining),
  };
}

async function getDeviceLinkedWallet(deviceHash) {
  const fullHash = '0x' + deviceHash;
  const wallet = await contract.getDeviceLinkedWallet(fullHash);
  return wallet;
}

async function linkDeviceToWallet(deviceHash, walletAddress) {
  const fullHash = '0x' + deviceHash;
  const tx = await writeContract.linkDeviceToWallet(fullHash, toAddr(walletAddress));
  const receipt = await tx.wait();

  const event = receipt.logs
    .map((log) => {
      try { return contract.interface.parseLog(log); } catch (_) { return null; }
    })
    .find((e) => e && e.name === 'DeviceLinked');

  return {
    deviceHash,
    wallet: walletAddress,
    oldWallet: event ? event.args.oldWallet : null,
  };
}

// ─── 발행 가능 여부 조회 (교차 쿨다운 포함) ───

async function canClaimTelegram(spotId, telegramHash) {
  const result = await contract.canClaimTelegram(spotId, '0x' + telegramHash);
  return {
    claimable: result.claimable,
    cooldown_remaining: Number(result.cooldownRemaining),
  };
}

async function canClaimDevice(spotId, deviceHash) {
  const result = await contract.canClaimDevice(spotId, '0x' + deviceHash);
  return {
    claimable: result.claimable,
    cooldown_remaining: Number(result.cooldownRemaining),
  };
}

// ─── 지갑 주소 가용성 체크 (다른 사람이 쓰고 있고 + 잔액 있으면 → 차단) ───

const ZERO_BYTES32 = '0x' + '0'.repeat(64);

async function checkWalletAvailability(walletAddress, requestType, requesterHash) {
  const wallet = toAddr(walletAddress);
  const fullRequesterHash = '0x' + requesterHash;

  if (requestType === 'telegram') {
    const linkedHash = await contract.getWalletLinkedTelegram(wallet);
    if (linkedHash !== ZERO_BYTES32 && linkedHash !== fullRequesterHash) {
      const balance = await contract.getTelegramBalance(linkedHash);
      if (balance > 0n) {
        return {
          available: false,
          reason: 'This wallet is already in use by another Telegram account. Please use a different wallet address.',
        };
      }
    }
  } else if (requestType === 'device') {
    const linkedHash = await contract.getWalletLinkedDevice(wallet);
    if (linkedHash !== ZERO_BYTES32 && linkedHash !== fullRequesterHash) {
      const balance = await contract.getDeviceBalance(linkedHash);
      if (balance > 0n) {
        return {
          available: false,
          reason: 'This wallet is already in use by another device. Please use a different wallet address.',
        };
      }
    }
  }

  return { available: true };
}

// ─── 스팟 설정 ───

async function updateAllowDuplicateClaims(spotId, allow) {
  const tx = await writeContract.updateAllowDuplicateClaims(spotId, allow);
  await tx.wait();
}

module.exports = {
  init,
  onTelegramClaimed,
  onDeviceClaimed,
  fetchSpotFromContract: fetchFullSpotFromContract,
  getSpot,
  getAllSpots,
  getBalance,
  getStampInfo,
  sendETH,
  getTelegramBalance,
  getTelegramStampInfo,
  getTelegramLinkedWallet,
  linkTelegramToWallet,
  claimToTelegram,
  getPhoneBalance,
  getPhoneStampInfo,
  claimByDevice,
  getDeviceBalance,
  getDeviceStampInfo,
  getDeviceLinkedWallet,
  linkDeviceToWallet,
  canClaimTelegram,
  canClaimDevice,
  checkWalletAvailability,
  updateAllowDuplicateClaims,
};
