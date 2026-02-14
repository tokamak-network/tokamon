import { ethers } from 'ethers';
import { getContractInfo } from './api';
import { getWalletProvider } from './walletProvider';

const COORD_SCALE = 1_000_000;

// 최소 ABI — 클라이언트에서 호출할 함수만 포함
const ABI = [
  'function createSpotSelf(uint256 reward, uint128 stampGoal, uint128 stampBonus, uint48 cooldown, bool allowDuplicateClaims, tuple(string name, string description, int96 lat, int96 lng, uint64 startTime, uint64 endTime) meta) payable returns (uint256)',
  'function redepositSelf(uint256 spotId) payable',
  'function updateCooldown(uint256 spotId, uint48 newCooldown) external',
  'function updateAllowDuplicateClaims(uint256 spotId, bool allow) external',
  'function getTelegramBalance(bytes32 telegramHash) external view returns (uint256)',
  'function getWalletLinkedTelegram(address wallet) external view returns (bytes32)',
  'function claimSelf(uint256 spotId) external',
  'function claimTelegramToWallet(bytes32 telegramHash) external',
  'function nextSpotId() external view returns (uint256)',
  'function getSpot(uint256) view returns (tuple(address creator, bool allowDuplicateClaims, uint48 cooldown, uint128 stampGoal, uint128 stampBonus, uint256 reward, uint256 remaining, int96 lat, int96 lng, uint64 startTime, uint64 endTime, string name, string description))',
  'event SpotCreated(uint256 indexed spotId, address indexed creator, uint256 reward, uint256 deposit, string name, string description, int96 lat, int96 lng)',
  'event Claimed(uint256 indexed spotId, address indexed user, uint256 reward, uint256 bonus, uint256 stamp, uint256 timestamp)',
];

let cachedContract = null;
let cachedSigner = null;

async function getSignerAndContract() {
  if (cachedContract && cachedSigner) return { signer: cachedSigner, contract: cachedContract };

  const walletProv = getWalletProvider();
  if (!walletProv) throw new Error('지갑이 연결되어 있지 않습니다');

  const provider = new ethers.BrowserProvider(walletProv);
  const signer = await provider.getSigner();
  const { address } = await getContractInfo();
  const contract = new ethers.Contract(address, ABI, signer);

  cachedSigner = signer;
  cachedContract = contract;
  return { signer, contract };
}

// 캐시 무효화 (계정 변경 시)
export function resetContractCache() {
  cachedContract = null;
  cachedSigner = null;
}

// 스팟 생성: 점주가 직접 트랜잭션 서명
export async function createSpotSelf(depositTon, rewardTon, stampGoal, stampBonus, cooldown, allowDuplicateClaims, metadata) {
  const { name, description, lat, lng, startTime, endTime } = metadata;
  const { contract } = await getSignerAndContract();

  const depositAmount = ethers.parseEther(String(depositTon));

  const meta = {
    name,
    description: description || '',
    lat: Math.round(lat * COORD_SCALE),
    lng: Math.round(lng * COORD_SCALE),
    startTime,
    endTime,
  };

  const tx = await contract.createSpotSelf(
    ethers.parseEther(String(rewardTon)),
    stampGoal,
    ethers.parseEther(String(stampBonus)),
    cooldown,
    allowDuplicateClaims,
    meta,
    { value: depositAmount },
  );
  const receipt = await tx.wait();

  // SpotCreated 이벤트에서 spotId 추출
  const iface = contract.interface;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === 'SpotCreated') {
        return Number(parsed.args.spotId);
      }
    } catch (_) {}
  }

  // 이벤트 파싱 실패 시 nextSpotId - 1
  const nextId = await contract.nextSpotId();
  return Number(nextId) - 1;
}

// 재예치: 점주가 직접 트랜잭션 서명
export async function redepositSelf(spotId, amountTon) {
  const { contract } = await getSignerAndContract();
  const amount = ethers.parseEther(String(amountTon));
  const tx = await contract.redepositSelf(spotId, { value: amount });
  await tx.wait();
}

// 쿨다운 수정: 점주가 직접 트랜잭션 서명
export async function updateCooldown(spotId, cooldownSeconds) {
  const { contract } = await getSignerAndContract();
  const tx = await contract.updateCooldown(spotId, cooldownSeconds);
  await tx.wait();
}

// 중복 발행 허용 여부 수정: 점주가 직접 트랜잭션 서명
export async function updateAllowDuplicateClaims(spotId, allow) {
  const { contract } = await getSignerAndContract();
  const tx = await contract.updateAllowDuplicateClaims(spotId, allow);
  await tx.wait();
}

// API 없을 때: 컨트랙트에서 스팟 목록 직접 조회 (리스너 미사용 로컬용)
export async function getSpotsFromChain() {
  const contractInfo = await getContractInfo();
  const address = contractInfo.address || contractInfo.tokamon;
  if (!address) return [];
  const prov = getWalletProvider();
  if (!prov) return [];
  const provider = new ethers.BrowserProvider(prov);
  const contract = new ethers.Contract(address, ABI, provider);
  const nextId = await contract.nextSpotId();
  const list = [];
  for (let id = 1; id < Number(nextId); id++) {
    try {
      const s = await contract.getSpot(id);
      const reward = s.reward ?? s[5];
      if (!s || reward === 0n) continue;
      const lat = Number(s.lat ?? s[7]) / COORD_SCALE;
      const lng = Number(s.lng ?? s[8]) / COORD_SCALE;
      list.push({
        id,
        creator_address: (s.creator ?? s[0]) ? ethers.getAddress(String(s.creator ?? s[0])) : null,
        reward: Number(ethers.formatEther(reward)),
        remaining: Number(ethers.formatEther(s.remaining ?? s[6])),
        stamp_goal: Number(s.stampGoal ?? s[3]),
        stamp_bonus: Number(ethers.formatEther(s.stampBonus ?? s[4])),
        cooldown: Number(s.cooldown ?? s[2]),
        allow_duplicate_claims: s.allowDuplicateClaims ?? s[1],
        name: (s.name ?? s[11])?.trim() || `Spot ${id}`,
        description: (s.description ?? s[12]) ? String(s.description ?? s[12]) : '',
        lat: Number.isNaN(lat) ? 0 : lat,
        lng: Number.isNaN(lng) ? 0 : lng,
        start_time: Number(s.startTime ?? s[9]),
        end_time: Number(s.endTime ?? s[10]),
      });
    } catch (_) {
      // 스팟 없거나 리버트 시 스킵
    }
  }
  return list;
}

// 네이티브 TON 잔액 조회
export async function getBalance(address) {
  try {
    const provider = new ethers.BrowserProvider(getWalletProvider());
    const bal = await provider.getBalance(address);
    return Number(ethers.formatEther(bal));
  } catch (error) {
    console.error('Error getting TON balance:', error);
    return 0;
  }
}

// 텔레그램 잔액 조회
export async function getTelegramBalance(telegramHash) {
  const { contract } = await getSignerAndContract();
  const bal = await contract.getTelegramBalance(telegramHash);
  return Number(ethers.formatEther(bal));
}

// 지갑에 연결된 텔레그램 해시 조회
export async function getWalletLinkedTelegram(address) {
  const { contract } = await getSignerAndContract();
  const telegramHash = await contract.getWalletLinkedTelegram(address);
  return telegramHash;
}

// 스팟 클레임: 고객이 직접 호출 (지갑 기반)
export async function claimSelf(spotId) {
  const { contract } = await getSignerAndContract();
  const tx = await contract.claimSelf(spotId);
  const receipt = await tx.wait();
  const claimedEvent = receipt.logs
    .map((log) => {
      try { return contract.interface.parseLog(log); } catch (_) { return null; }
    })
    .find((e) => e && e.name === 'Claimed');
  if (claimedEvent) {
    return {
      reward: Number(ethers.formatEther(claimedEvent.args.reward)),
      bonus: Number(ethers.formatEther(claimedEvent.args.bonus)),
      stamp: Number(claimedEvent.args.stamp),
    };
  }
  return { reward: 0, bonus: 0, stamp: 0 };
}

// 텔레그램 잔액을 지갑으로 클레임
export async function claimTelegramToWallet(telegramHash) {
  const { contract } = await getSignerAndContract();
  const tx = await contract.claimTelegramToWallet(telegramHash);
  await tx.wait();
}

// 스팟별 클래임 히스토리 조회 (컨트랙트 이벤트 직접 조회)
export async function getSpotClaimHistory(spotId) {
  const { contract } = await getSignerAndContract();
  const filter = contract.filters.Claimed(spotId, null);
  const events = await contract.queryFilter(filter);
  const history = events.map((ev) => {
    const { user, reward, bonus, stamp, timestamp } = ev.args;
    return {
      user_address: user,
      reward: Number(ethers.formatEther(reward)),
      bonus: Number(ethers.formatEther(bonus)),
      stamp: Number(stamp),
      created_at: new Date(Number(timestamp) * 1000).toISOString(),
    };
  });
  return history.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
