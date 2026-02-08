import { ethers } from 'ethers';
import { getContractInfo } from './api';

const COORD_SCALE = 1_000_000;

// 최소 ABI — 클라이언트에서 호출할 함수만 포함
const ABI = [
  'function depositSelf() external payable',
  'function createSpotSelf(uint256 depositAmt, uint256 reward, uint256 stampGoal, uint256 stampBonus, uint256 cooldown, bool allowDuplicateClaims, tuple(string name, string description, int256 lat, int256 lng, string startTime, string endTime) meta) external returns (uint256)',
  'function redepositSelf(uint256 spotId, uint256 amount) external',
  'function updateCooldown(uint256 spotId, uint256 newCooldown) external',
  'function updateAllowDuplicateClaims(uint256 spotId, bool allow) external',
  'function getBalance(address user) external view returns (uint256)',
  'function nextSpotId() external view returns (uint256)',
  'event SpotCreated(uint256 indexed spotId, address indexed creator, uint256 reward, uint256 deposit)',
];

let cachedContract = null;
let cachedSigner = null;

async function getSignerAndContract() {
  if (cachedContract && cachedSigner) return { signer: cachedSigner, contract: cachedContract };

  if (!window.ethereum) throw new Error('MetaMask가 설치되어 있지 않습니다');

  const provider = new ethers.BrowserProvider(window.ethereum);
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

// 충전: 사용자가 직접 ETH 전송
export async function depositSelf(amountTon) {
  const { contract } = await getSignerAndContract();
  const tx = await contract.depositSelf({ value: ethers.parseEther(String(amountTon)) });
  await tx.wait();
}

// 스팟 생성: 점주가 직접 트랜잭션 서명
export async function createSpotSelf(depositTon, rewardTon, stampGoal, stampBonus, cooldown, allowDuplicateClaims, metadata) {
  const { contract } = await getSignerAndContract();
  const { name, description, lat, lng, startTime, endTime } = metadata;

  const meta = {
    name,
    description: description || '',
    lat: Math.round(lat * COORD_SCALE),
    lng: Math.round(lng * COORD_SCALE),
    startTime,
    endTime,
  };

  const tx = await contract.createSpotSelf(
    ethers.parseEther(String(depositTon)),
    ethers.parseEther(String(rewardTon)),
    stampGoal,
    ethers.parseEther(String(stampBonus)),
    cooldown,
    allowDuplicateClaims,
    meta,
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
  const tx = await contract.redepositSelf(spotId, ethers.parseEther(String(amountTon)));
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

// 잔액 조회: 컨트랙트에서 직접 읽기
export async function getBalance(address) {
  const { contract } = await getSignerAndContract();
  const bal = await contract.getBalance(address);
  return Number(ethers.formatEther(bal));
}
