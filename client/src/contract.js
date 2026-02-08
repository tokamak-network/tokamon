import { ethers } from 'ethers';
import { getContractInfo } from './api';

const COORD_SCALE = 1_000_000;

// 최소 ABI — 클라이언트에서 호출할 함수만 포함
const ABI = [
  'function depositSelf(uint256 amount) external',
  'function createSpotSelf(uint256 depositAmt, uint256 reward, uint256 stampGoal, uint256 stampBonus, uint256 cooldown, bool allowDuplicateClaims, tuple(string name, string description, int256 lat, int256 lng, string startTime, string endTime) meta) external returns (uint256)',
  'function redepositSelf(uint256 spotId, uint256 amount) external',
  'function updateCooldown(uint256 spotId, uint256 newCooldown) external',
  'function updateAllowDuplicateClaims(uint256 spotId, bool allow) external',
  'function getBalance(address user) external view returns (uint256)',
  'function getTelegramBalance(bytes32 telegramHash) external view returns (uint256)',
  'function getWalletLinkedTelegram(address wallet) external view returns (bytes32)',
  'function claimTelegramToWallet(bytes32 telegramHash) external',
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

// 충전: 사용자가 직접 TON 토큰 전송
export async function depositSelf(amountTon) {
  const contractInfo = await getContractInfo();
  const tonTokenAddress = contractInfo.tonToken;
  const { signer, contract } = await getSignerAndContract();
  
  const amount = ethers.parseEther(String(amountTon));
  
  // 1. TON 토큰 approve
  const tonTokenAbi = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)'
  ];
  const tonToken = new ethers.Contract(tonTokenAddress, tonTokenAbi, signer);
  
  const approveTx = await tonToken.approve(contractInfo.address, amount);
  await approveTx.wait();
  
  // 2. depositSelf 호출
  const depositTx = await contract.depositSelf(amount);
  await depositTx.wait();
}

// 스팟 생성: 점주가 직접 트랜잭션 서명
export async function createSpotSelf(depositTon, rewardTon, stampGoal, stampBonus, cooldown, allowDuplicateClaims, metadata) {
  const contractInfo = await getContractInfo();
  const tonTokenAddress = contractInfo.tonToken;
  const { signer, contract } = await getSignerAndContract();
  const { name, description, lat, lng, startTime, endTime } = metadata;

  const depositAmount = ethers.parseEther(String(depositTon));

  // 1. TON 토큰 approve
  const tonTokenAbi = ['function approve(address spender, uint256 amount) returns (bool)'];
  const tonToken = new ethers.Contract(tonTokenAddress, tonTokenAbi, signer);
  
  const approveTx = await tonToken.approve(contractInfo.address, depositAmount);
  await approveTx.wait();

  // 2. createSpotSelf 호출
  const meta = {
    name,
    description: description || '',
    lat: Math.round(lat * COORD_SCALE),
    lng: Math.round(lng * COORD_SCALE),
    startTime,
    endTime,
  };

  const tx = await contract.createSpotSelf(
    depositAmount,
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
  const contractInfo = await getContractInfo();
  const tonTokenAddress = contractInfo.tonToken;
  const { signer, contract } = await getSignerAndContract();
  
  const amount = ethers.parseEther(String(amountTon));
  
  // 1. TON 토큰 approve
  const tonTokenAbi = ['function approve(address spender, uint256 amount) returns (bool)'];
  const tonToken = new ethers.Contract(tonTokenAddress, tonTokenAbi, signer);
  
  const approveTx = await tonToken.approve(contractInfo.address, amount);
  await approveTx.wait();
  
  // 2. redepositSelf 호출
  const tx = await contract.redepositSelf(spotId, amount);
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

// TON 토큰 잔액 조회 (실제 ERC20 토큰 잔액)
export async function getBalance(address) {
  try {
    const contractInfo = await getContractInfo();
    const tonTokenAddress = contractInfo.tonToken;
    
    if (!tonTokenAddress) {
      console.warn('TON Token address not found');
      return 0;
    }
    
    const provider = new ethers.BrowserProvider(window.ethereum);
    const tonTokenAbi = ['function balanceOf(address) view returns (uint256)'];
    const tonToken = new ethers.Contract(tonTokenAddress, tonTokenAbi, provider);
    
    const bal = await tonToken.balanceOf(address);
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

// 텔레그램 잔액을 지갑으로 클레임
export async function claimTelegramToWallet(telegramHash) {
  const { contract } = await getSignerAndContract();
  const tx = await contract.claimTelegramToWallet(telegramHash);
  await tx.wait();
}
